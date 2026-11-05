import React, { useState, useEffect, useRef } from 'react';
import { submitNps } from '../api/client';

/**
 * Monthly instructor NPS survey — slim bottom bar, visible 5th–20th of
 * each month, once per instructor per month.
 *
 * Submits via POST /api/nps/submit — backend appends the row straight
 * into that month's NPS spreadsheet's "nps_responses" tab (service
 * account write), rather than this posting to a Google Form directly.
 * See backend/app/sheets.py append_nps_response.
 */

// PLACEHOLDER limit — swap for the real Google Form question's character cap
// once confirmed; this just stops an unbounded paste, it isn't verified
// against the live form's actual limit.
const MAX_FIELD_LEN = 500;

type Segment = 'detractor' | 'passive' | 'promoter';

const segmentOf = (rating: number): Segment =>
    rating <= 6 ? 'detractor' : rating <= 8 ? 'passive' : 'promoter';

const DETRACTOR_CHALLENGES_OPTIONS = [
    'Payment delays',
    'Payment structure concerns',
    'Scheduling issues',
    'Last-minute class changes',
    'Policy confusion',
    'Lack of support',
    'Student quality concerns',
    'Platform / tech issues',
    'Workload expectations',
    'Quality of training / support given',
    'Not getting enough classes / batches',
    'Poor curriculum / cue-cards',
    'Poor feedback mechanism post class',
];

const PASSIVE_IMPROVE_OPTIONS = [
    'Better communication with program team',
    'Improved class scheduling',
    'More policy clarity',
    'Better payout visibility',
    'More instructor recognition',
    'Reduced last-minute changes',
    'Better avenues for sharing tech issues',
    'Training',
];

const PROMOTER_VALUE_OPTIONS = [
    'Teaching experience',
    'Student quality',
    'Support from program team',
    'Flexibility in teaching',
    'Fair payouts',
    'Professional network',
];

const monthKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}`;
};

const isWindowOpen = () => {
    // DEMO: ?nps=1 forces the banner open regardless of date.
    if (new URLSearchParams(window.location.search).get('nps') === '1') return true;
    const day = new Date().getDate();
    return day >= 5 && day <= 20;
};

const Checkbox: React.FC<{ label: string; checked: boolean; onChange: () => void }> = ({ label, checked, onChange }) => (
    <label className="nps-checkbox">
        <input type="checkbox" checked={checked} onChange={onChange} />
        {label}
    </label>
);

// Grows with content instead of a fixed row count, capped by the
// .nps-field--textarea max-height (CSS) — avoids a scrollbar nested inside
// the panel's own scroll region.
const AutoTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => {
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        const capped = Math.min(el.scrollHeight, 180);
        el.style.height = `${capped}px`;
        el.style.overflowY = el.scrollHeight > 180 ? 'auto' : 'hidden';
    }, [props.value]);

    return <textarea ref={ref} {...props} />;
};

const FieldCounter: React.FC<{ value: string }> = ({ value }) => (
    <div className="nps-field__counter">{value.length}/{MAX_FIELD_LEN}</div>
);

const CheckmarkIcon: React.FC = () => (
    <svg className="nps-footer__thanks-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.5 10.25l2.2 2.2 4.8-4.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
);

const CloseIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M1.5 1.5l11 11M12.5 1.5l-11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

const NpsFooter: React.FC = () => {
    const storageKey = `nps_done_${monthKey()}`;
    const dismissKey = `nps_dismissed_${monthKey()}`;
    const [done, setDone] = useState(() => localStorage.getItem(storageKey) === '1');
    const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(dismissKey) === '1');
    const [rating, setRating] = useState<number | null>(null);
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const footerRef = useRef<HTMLDivElement>(null);
    const visible = isWindowOpen() && !done && !dismissed;

    // Detractor fields
    const [challenges, setChallenges] = useState<string[]>([]);
    const [challengesOther, setChallengesOther] = useState('');
    const [followUp, setFollowUp] = useState<'Yes' | 'No' | null>(null);
    const [details, setDetails] = useState('');

    // Passive fields
    const [improve, setImprove] = useState<string[]>([]);
    const [improveOther, setImproveOther] = useState('');
    const [oneThing, setOneThing] = useState('');

    // Promoter fields
    const [valueMost, setValueMost] = useState<string[]>([]);
    const [valueMostOther, setValueMostOther] = useState('');
    const [continueDoing, setContinueDoing] = useState('');
    const [promoterImprove, setPromoterImprove] = useState('');

    // Reserve space in the page so the footer never covers the last bit of
    // content underneath it (last table row, page-bottom actions, etc).
    // Measured rather than hardcoded since the bar's height changes at the
    // 480px breakpoint (CSS) — the popover panel is excluded on purpose,
    // it's an absolutely-positioned overlay, not part of in-flow height.
    useEffect(() => {
        const root = document.documentElement;
        if (!visible || !footerRef.current) {
            root.style.setProperty('--nps-footer-height', '0px');
            return;
        }
        const el = footerRef.current;
        const update = () => root.style.setProperty('--nps-footer-height', `${el.offsetHeight}px`);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => {
            observer.disconnect();
            root.style.setProperty('--nps-footer-height', '0px');
        };
    }, [visible, submitted]);

    if (!visible) return null;

    const toggle = (list: string[], setList: (v: string[]) => void, option: string) => {
        setList(list.includes(option) ? list.filter((o) => o !== option) : [...list, option]);
    };

    const dismiss = () => {
        sessionStorage.setItem(dismissKey, '1');
        setDismissed(true);
    };

    const submit = async () => {
        if (rating === null || submitting) return;
        setSubmitting(true);
        const segment = segmentOf(rating);

        try {
            await submitNps({
                rating,
                segment,
                challenges,
                challenges_other: challengesOther.trim(),
                follow_up: followUp ?? '',
                details: details.trim(),
                improve,
                improve_other: improveOther.trim(),
                one_thing: oneThing.trim(),
                value_most: valueMost,
                value_most_other: valueMostOther.trim(),
                continue_doing: continueDoing.trim(),
                promoter_improve: promoterImprove.trim(),
            });
            setSubmitted(true);
            localStorage.setItem(storageKey, '1');
            setTimeout(() => setDone(true), 1400);
        } catch (e) {
            console.error('[NPS] submit failed', e);
            setSubmitting(false);
        }
    };

    const segment = rating !== null ? segmentOf(rating) : null;

    return (
        <div ref={footerRef} className="nps-footer">
            {segment && !submitted && (
                <div className="nps-panel" role="dialog" aria-label="Instructor feedback">
                    {segment === 'detractor' && (
                        <>
                            <div className="nps-panel__title">We'd like to understand your concerns</div>
                            <div className="nps-panel__subtitle">What challenges are you facing?</div>
                            {DETRACTOR_CHALLENGES_OPTIONS.map((opt) => (
                                <Checkbox key={opt} label={opt} checked={challenges.includes(opt)} onChange={() => toggle(challenges, setChallenges, opt)} />
                            ))}
                            <input
                                className="nps-field"
                                value={challengesOther}
                                maxLength={MAX_FIELD_LEN}
                                onChange={(e) => setChallengesOther(e.target.value)}
                                placeholder="Other (optional)"
                                style={{ marginTop: 8 }}
                            />
                            <FieldCounter value={challengesOther} />

                            <div className="nps-panel__subtitle" style={{ marginBottom: 8 }}>
                                Would you like someone from the team to follow up?
                            </div>
                            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                                {(['Yes', 'No'] as const).map((opt) => (
                                    <label key={opt} className="nps-radio">
                                        <input type="radio" name="followup" checked={followUp === opt} onChange={() => setFollowUp(opt)} />
                                        {opt}
                                    </label>
                                ))}
                            </div>

                            <AutoTextarea
                                className="nps-field nps-field--textarea"
                                value={details}
                                maxLength={MAX_FIELD_LEN}
                                onChange={(e) => setDetails(e.target.value)}
                                placeholder="Please share more details (optional)"
                                rows={2}
                            />
                            <FieldCounter value={details} />
                        </>
                    )}

                    {segment === 'passive' && (
                        <>
                            <div className="nps-panel__title">Help us improve</div>
                            <div className="nps-panel__subtitle">What could improve your teaching experience?</div>
                            {PASSIVE_IMPROVE_OPTIONS.map((opt) => (
                                <Checkbox key={opt} label={opt} checked={improve.includes(opt)} onChange={() => toggle(improve, setImprove, opt)} />
                            ))}
                            <input
                                className="nps-field"
                                value={improveOther}
                                maxLength={MAX_FIELD_LEN}
                                onChange={(e) => setImproveOther(e.target.value)}
                                placeholder="Other (optional)"
                                style={{ marginTop: 8 }}
                            />
                            <FieldCounter value={improveOther} />

                            <AutoTextarea
                                className="nps-field nps-field--textarea"
                                value={oneThing}
                                maxLength={MAX_FIELD_LEN}
                                onChange={(e) => setOneThing(e.target.value)}
                                placeholder="What is one thing we can improve? (optional)"
                                rows={2}
                            />
                            <FieldCounter value={oneThing} />
                        </>
                    )}

                    {segment === 'promoter' && (
                        <>
                            <div className="nps-panel__title">Thank you for your feedback</div>
                            <div className="nps-panel__subtitle">What do you value the most about teaching with Scaler?</div>
                            {PROMOTER_VALUE_OPTIONS.map((opt) => (
                                <Checkbox key={opt} label={opt} checked={valueMost.includes(opt)} onChange={() => toggle(valueMost, setValueMost, opt)} />
                            ))}
                            <input
                                className="nps-field"
                                value={valueMostOther}
                                maxLength={MAX_FIELD_LEN}
                                onChange={(e) => setValueMostOther(e.target.value)}
                                placeholder="Other (optional)"
                                style={{ marginTop: 8 }}
                            />
                            <FieldCounter value={valueMostOther} />

                            <AutoTextarea
                                className="nps-field nps-field--textarea"
                                value={continueDoing}
                                maxLength={MAX_FIELD_LEN}
                                onChange={(e) => setContinueDoing(e.target.value)}
                                placeholder="What should we continue doing that works well? (optional)"
                                rows={2}
                            />
                            <FieldCounter value={continueDoing} />
                            <AutoTextarea
                                className="nps-field nps-field--textarea"
                                value={promoterImprove}
                                maxLength={MAX_FIELD_LEN}
                                onChange={(e) => setPromoterImprove(e.target.value)}
                                placeholder="What is one thing we can improve? (optional)"
                                rows={2}
                            />
                            <FieldCounter value={promoterImprove} />
                        </>
                    )}

                    <div className="nps-panel__actions">
                        <button className="nps-btn-text" onClick={() => setRating(null)}>
                            Back
                        </button>
                        <button className="nps-btn-primary" onClick={submit} disabled={submitting}>
                            {submitting ? 'Submitting…' : 'Submit'}
                        </button>
                    </div>
                </div>
            )}

            <div className="nps-footer__bar">
                {submitted ? (
                    <div className="nps-footer__thanks" role="status" aria-live="polite" style={{ width: '100%' }}>
                        <CheckmarkIcon />
                        Thanks for your feedback!
                    </div>
                ) : (
                    <>
                        <span className="nps-footer__prompt">How likely are you to recommend Scaler to a fellow instructor?</span>

                        <div className="nps-footer__scale" role="group" aria-label="Rating, 1 to 10">
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                                const tier = n <= 6 ? 'detractor' : n <= 8 ? 'passive' : 'promoter';
                                return (
                                    <button
                                        key={n}
                                        className={`nps-rating-btn nps-rating-btn--${tier}${rating === n ? ' is-selected' : ''}`}
                                        aria-pressed={rating === n}
                                        onClick={() => setRating(n)}
                                    >
                                        {n}
                                    </button>
                                );
                            })}
                        </div>

                        <button className="nps-footer__dismiss" aria-label="Dismiss" onClick={dismiss}>
                            <CloseIcon />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default NpsFooter;
