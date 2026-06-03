import React, { useState, useEffect, useCallback } from 'react';
import {
    getAvailabilityMe,
    getClasses,
    createStandbySlot,
    deleteStandbySlot,
    updateSlotPreferences,
} from '../../api/client';
import type { BackupAvailability, SlotPreference } from '../../types';

/* ─── Constants ─── */
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PREF_OPTIONS: { value: SlotPreference['general_preference']; label: string; emoji: string; desc: string }[] = [
    { value: 'morning', label: 'Morning', emoji: '🌅', desc: 'e.g. 7 AM – 12 PM' },
    { value: 'evening', label: 'Evening', emoji: '🌇', desc: 'e.g. 6 PM – 10 PM' },
    { value: 'both',    label: 'Both',    emoji: '🔄', desc: 'Flexible on timings' },
    { value: 'none',    label: 'None',    emoji: '🛑', desc: 'Not open to new classes' },
];

/* ─── Helpers ─── */
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
const toISO = (year: number, month: number, day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** Normalise a class_date string (MM/DD/YYYY, MM/DD/YY, YYYY-MM-DD) → YYYY-MM-DD */
const normDate = (raw: string): string => {
    const s = String(raw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
        const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
        return `${yr}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    }
    return '';
};

/** Determine morning vs evening from a time string like "7:00 AM", "06:30 PM" */
const timeToSlot = (raw: string): 'morning' | 'evening' | null => {
    const s = String(raw || '').toUpperCase().trim();
    if (!s) return null;
    if (s.includes('AM')) return 'morning';
    if (s.includes('PM')) {
        // 12:xx PM is noon → morning-ish, but we'll call it evening to be safe
        // Let backend decide; all PM → evening
        return 'evening';
    }
    // 24-h format fallback
    const hm = s.match(/^(\d{1,2}):/);
    if (hm) {
        const h = parseInt(hm[1], 10);
        return h < 14 ? 'morning' : 'evening';
    }
    return null;
};

const fmtHeader = (iso: string): string => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
};

const slotLabel = (slot: string) => {
    if (slot === 'morning') return '🌅 Morning';
    if (slot === 'evening') return '🌇 Evening';
    if (slot === 'both')    return '🔄 Both';
    return slot;
};

/* ─── Component ─── */
const BackupAvailability: React.FC = () => {
    const todayISO = new Date().toISOString().split('T')[0];
    const todayDate = new Date();

    /* Preference */
    const [preference, setPreference] = useState<SlotPreference['general_preference']>('none');
    const [prefNotes, setPrefNotes]   = useState('');
    const [prefSaving, setPrefSaving] = useState(false);
    const [prefSaved,  setPrefSaved]  = useState(false);

    /* Standby list */
    const [standbySlots, setStandbySlots] = useState<BackupAvailability[]>([]);
    const [loading,       setLoading]     = useState(true);
    const [deletingId,    setDeletingId]  = useState<string | null>(null);

    /* Class map: dateISO → ('morning' | 'evening')[] */
    const [classMap, setClassMap] = useState<Record<string, ('morning' | 'evening')[]>>({});

    /* Calendar nav */
    const [viewYear,  setViewYear]  = useState(todayDate.getFullYear());
    const [viewMonth, setViewMonth] = useState(todayDate.getMonth());

    /* Day popup */
    const [popupDay,        setPopupDay]        = useState<string | null>(null);
    const [popupSlot,       setPopupSlot]       = useState<'morning' | 'evening' | 'both'>('morning');
    const [popupNotes,      setPopupNotes]      = useState('');
    const [popupSubmitting, setPopupSubmitting] = useState(false);
    const [popupError,      setPopupError]      = useState('');
    const [popupSuccess,    setPopupSuccess]    = useState('');

    /* ─── Data fetch ─── */
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [availData, classData] = await Promise.all([
                getAvailabilityMe(),
                getClasses('upcoming', 100, 0),
            ]);

            if (availData.preferences) {
                setPreference(availData.preferences.general_preference || 'none');
                setPrefNotes(availData.preferences.notes || '');
            }
            setStandbySlots(availData.standby_slots || []);

            /* Build classMap */
            const map: Record<string, ('morning' | 'evening')[]> = {};
            for (const cls of classData.classes) {
                const dateISO = normDate(cls.class_date);
                if (!dateISO) continue;
                const slot = timeToSlot(cls.time_of_day);
                if (!slot) continue;
                if (!map[dateISO]) map[dateISO] = [];
                if (!map[dateISO].includes(slot)) map[dateISO].push(slot);
            }
            setClassMap(map);
        } catch (err) {
            console.error('Failed to fetch availability data', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    /* ─── Preference save ─── */
    const handleSavePref = async (newPref: SlotPreference['general_preference']) => {
        setPreference(newPref);
        setPrefSaving(true);
        setPrefSaved(false);
        try {
            await updateSlotPreferences({ general_preference: newPref, notes: prefNotes });
            setPrefSaved(true);
            setTimeout(() => setPrefSaved(false), 2500);
        } catch (err) {
            console.error('Failed to save preference', err);
        } finally {
            setPrefSaving(false);
        }
    };

    /* ─── Calendar helpers ─── */
    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    };

    const getDayStandby = (iso: string) =>
        standbySlots.filter(s => iso >= s.start_date && iso <= s.end_date);

    /* ─── Day click ─── */
    const handleDayClick = (iso: string) => {
        if (iso < todayISO) return;
        const blocked = classMap[iso] || [];
        // Pick first available slot
        let defaultSlot: 'morning' | 'evening' | 'both' = 'morning';
        if (blocked.includes('morning') && !blocked.includes('evening')) defaultSlot = 'evening';
        else if (!blocked.includes('morning')) defaultSlot = 'morning';
        else defaultSlot = 'both';

        setPopupDay(iso);
        setPopupSlot(defaultSlot);
        setPopupNotes('');
        setPopupError('');
        setPopupSuccess('');
    };

    /* ─── Submit standby ─── */
    const handlePopupSubmit = async () => {
        if (!popupDay) return;
        setPopupError('');
        setPopupSuccess('');
        setPopupSubmitting(true);
        try {
            await createStandbySlot({
                start_date: popupDay,
                end_date:   popupDay,
                slot:       popupSlot,
                notes:      popupNotes.trim(),
            });
            setPopupSuccess('✅ Opted-in as backup for this date!');
            fetchData();
            setTimeout(() => { setPopupDay(null); setPopupSuccess(''); }, 1800);
        } catch (err: any) {
            setPopupError(err.response?.data?.detail || 'Failed to add standby slot.');
        } finally {
            setPopupSubmitting(false);
        }
    };

    /* ─── Delete slot ─── */
    const handleDeleteSlot = async (slotId: string) => {
        if (!window.confirm('Remove this standby declaration?')) return;
        setDeletingId(slotId);
        try {
            await deleteStandbySlot(slotId);
            setStandbySlots(prev => prev.filter(s => s.id !== slotId));
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Failed to remove standby slot.');
        } finally {
            setDeletingId(null);
        }
    };

    /* ─── Loading ─── */
    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container"><div className="spinner" /></div>
            </div>
        );
    }

    /* ─── Calendar grid ─── */
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay    = getFirstDayOfMonth(viewYear, viewMonth);
    const gridCells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (gridCells.length % 7 !== 0) gridCells.push(null);

    const popupBlocked = popupDay ? (classMap[popupDay] || []) : [];
    const allBlocked   = popupBlocked.includes('morning') && popupBlocked.includes('evening');

    /* ─── Render ─── */
    return (
        <div className="page-container">
            {/* Header */}
            <div className="page-header">
                <h1 className="page-title">Backup &amp; Availability</h1>
                <p className="page-subtitle">
                    Let the team know when you're open to covering classes as a backup instructor.
                </p>
            </div>

            {/* ── Section 1: General Preference ── */}
            <section style={{ marginBottom: 'var(--space-xl)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-md)' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>General Teaching Preference</h2>
                    {prefSaving && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Saving…</span>}
                    {prefSaved  && <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>✓ Saved</span>}
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)', marginTop: 0 }}>
                    Helps us prioritise you for backup requests that match your timings.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '12px' }}>
                    {PREF_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => handleSavePref(opt.value)}
                            disabled={prefSaving}
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px',
                                padding: '14px 16px', borderRadius: 'var(--radius-md)',
                                border: `2px solid ${preference === opt.value ? 'var(--primary)' : 'var(--border-light)'}`,
                                background: preference === opt.value ? 'var(--primary-bg, rgba(99,102,241,0.08))' : 'var(--bg-card)',
                                cursor: prefSaving ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease', textAlign: 'left',
                                opacity: prefSaving ? 0.7 : 1,
                                boxShadow: preference === opt.value ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none',
                            }}
                        >
                            <span style={{ fontSize: '1.375rem', lineHeight: 1 }}>{opt.emoji}</span>
                            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: preference === opt.value ? 'var(--primary)' : 'var(--text-primary)' }}>{opt.label}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{opt.desc}</span>
                        </button>
                    ))}
                </div>
            </section>

            <div style={{ height: '1px', background: 'var(--border-subtle)', marginBottom: 'var(--space-xl)' }} />

            {/* ── Section 2: Calendar ── */}
            <section style={{ marginBottom: 'var(--space-xl)' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>Opt-in as Backup</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)', marginTop: 0 }}>
                    Click any upcoming date to declare yourself available as a backup instructor for that day.
                </p>

                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

                    {/* ── Calendar card ── */}
                    <div style={{
                        flex: '1 1 300px', minWidth: '290px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--space-lg)',
                    }}>
                        {/* Month nav */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                            <button
                                onClick={prevMonth}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', fontSize: '1.1rem', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}
                            >‹</button>
                            <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                                {MONTH_NAMES[viewMonth]} {viewYear}
                            </span>
                            <button
                                onClick={nextMonth}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', fontSize: '1.1rem', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}
                            >›</button>
                        </div>

                        {/* Day-of-week headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '6px' }}>
                            {DAY_NAMES.map(d => (
                                <div key={d} style={{ textAlign: 'center', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', padding: '2px 0' }}>{d}</div>
                            ))}
                        </div>

                        {/* Day grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
                            {gridCells.map((day, i) => {
                                if (day === null) return <div key={`e${i}`} />;
                                const iso        = toISO(viewYear, viewMonth, day);
                                const isPast     = iso < todayISO;
                                const isToday    = iso === todayISO;
                                const isSelected = iso === popupDay;
                                const dayStandby = getDayStandby(iso);
                                const blocked    = classMap[iso] || [];
                                const hasMorningClass  = blocked.includes('morning');
                                const hasEveningClass  = blocked.includes('evening');
                                const hasMorningStby   = dayStandby.some(s => s.slot === 'morning' || s.slot === 'both');
                                const hasEveningStby   = dayStandby.some(s => s.slot === 'evening' || s.slot === 'both');

                                return (
                                    <button
                                        key={iso}
                                        onClick={() => !isPast && handleDayClick(iso)}
                                        title={iso}
                                        style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                                            padding: '5px 2px',
                                            borderRadius: 'var(--radius-sm)',
                                            border: isSelected
                                                ? '2px solid var(--primary)'
                                                : isToday
                                                    ? '1.5px solid var(--primary)'
                                                    : '1.5px solid transparent',
                                            background: isSelected
                                                ? 'rgba(99,102,241,0.13)'
                                                : isToday
                                                    ? 'rgba(99,102,241,0.06)'
                                                    : 'transparent',
                                            cursor: isPast ? 'default' : 'pointer',
                                            opacity: isPast ? 0.32 : 1,
                                            transition: 'all 0.1s ease',
                                        }}
                                    >
                                        <span style={{
                                            fontSize: '0.8rem',
                                            fontWeight: isToday || isSelected ? 700 : 400,
                                            color: isSelected || isToday ? 'var(--primary)' : 'var(--text-primary)',
                                            lineHeight: 1,
                                        }}>{day}</span>

                                        {/* Dot row */}
                                        <div style={{ display: 'flex', gap: '2px', height: '5px', alignItems: 'center', flexWrap: 'nowrap' }}>
                                            {hasMorningClass  && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />}
                                            {hasEveningClass  && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />}
                                            {hasMorningStby   && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />}
                                            {hasEveningStby   && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#8b5cf6', flexShrink: 0 }} />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div style={{
                            display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px',
                            paddingTop: '10px', borderTop: '1px solid var(--border-subtle)',
                            fontSize: '0.6875rem', color: 'var(--text-muted)',
                        }}>
                            {[
                                { color: '#ef4444', label: 'AM class' },
                                { color: '#f97316', label: 'PM class' },
                                { color: '#3b82f6', label: 'AM standby' },
                                { color: '#8b5cf6', label: 'PM standby' },
                            ].map(({ color, label }) => (
                                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                                    {label}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* ── Side panel ── */}
                    <div style={{
                        flex: '0 0 248px', minWidth: '230px',
                        background: 'var(--bg-card)',
                        border: `1.5px solid ${popupDay ? 'var(--primary)' : 'var(--border-light)'}`,
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--space-lg)',
                        transition: 'border-color 0.2s ease',
                    }}>
                        {!popupDay ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '10px' }}>📅</div>
                                <p style={{ fontSize: '0.8125rem', margin: 0, lineHeight: 1.5 }}>
                                    Click a date on the calendar to opt-in as backup.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Panel header */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>
                                            Offer Backup Standby
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{fmtHeader(popupDay)}</div>
                                    </div>
                                    <button
                                        onClick={() => setPopupDay(null)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)', lineHeight: 1, padding: '0 0 0 6px', marginTop: '-2px' }}
                                    >×</button>
                                </div>

                                {/* Alerts */}
                                {popupError && (
                                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '0.8rem' }}>
                                        {popupError}
                                    </div>
                                )}
                                {popupSuccess && (
                                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'var(--success-bg)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '0.8rem' }}>
                                        {popupSuccess}
                                    </div>
                                )}

                                {/* All-blocked warning */}
                                {allBlocked && (
                                    <div style={{ padding: '10px 12px', background: 'var(--danger-bg)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '14px' }}>
                                        You already have classes scheduled at all times on this day.
                                    </div>
                                )}

                                {/* Slot options */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                                    {(['morning', 'evening', 'both'] as const).map(s => {
                                        const isBlocked =
                                            s === 'morning' ? popupBlocked.includes('morning') :
                                            s === 'evening' ? popupBlocked.includes('evening') :
                                            popupBlocked.length > 0; // 'both' blocked if any class on that day
                                        const isActive = popupSlot === s && !isBlocked;

                                        return (
                                            <label
                                                key={s}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '10px',
                                                    padding: '9px 12px',
                                                    borderRadius: 'var(--radius-sm)',
                                                    border: `1.5px solid ${isActive ? 'var(--primary)' : 'var(--border-subtle)'}`,
                                                    background: isActive ? 'rgba(99,102,241,0.08)' : 'transparent',
                                                    cursor: isBlocked ? 'not-allowed' : 'pointer',
                                                    opacity: isBlocked ? 0.42 : 1,
                                                    transition: 'all 0.1s',
                                                }}
                                            >
                                                <input
                                                    type="radio"
                                                    name="popupSlot"
                                                    value={s}
                                                    checked={popupSlot === s}
                                                    disabled={isBlocked}
                                                    onChange={() => setPopupSlot(s)}
                                                    style={{ accentColor: 'var(--primary)', margin: 0, flexShrink: 0 }}
                                                />
                                                <span style={{ fontSize: '0.875rem', fontWeight: 500, flex: 1 }}>
                                                    {s === 'morning' ? '🌅 Morning' : s === 'evening' ? '🌇 Evening' : '🔄 Both'}
                                                </span>
                                                {isBlocked && (
                                                    <span style={{ fontSize: '0.6875rem', color: 'var(--danger)', fontWeight: 600 }}>Class</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>

                                {/* Notes */}
                                <div style={{ marginBottom: '14px' }}>
                                    <textarea
                                        rows={2}
                                        className="form-input"
                                        placeholder="Notes (optional)"
                                        value={popupNotes}
                                        onChange={e => setPopupNotes(e.target.value)}
                                        maxLength={200}
                                        disabled={allBlocked}
                                        style={{ resize: 'none', fontSize: '0.8125rem', width: '100%', boxSizing: 'border-box' }}
                                    />
                                </div>

                                {/* Submit */}
                                <button
                                    className="btn btn-primary"
                                    onClick={handlePopupSubmit}
                                    disabled={popupSubmitting || allBlocked}
                                    style={{ width: '100%', fontWeight: 700 }}
                                >
                                    {popupSubmitting ? 'Saving…' : '✅ Opt-in as Backup'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </section>

            <div style={{ height: '1px', background: 'var(--border-subtle)', marginBottom: 'var(--space-xl)' }} />

            {/* ── Section 3: Standby List ── */}
            <section>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>
                    My Standby Slots
                    {standbySlots.length > 0 && (
                        <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: 'var(--primary-bg, rgba(99,102,241,0.1))', color: 'var(--primary)' }}>
                            {standbySlots.length}
                        </span>
                    )}
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)', marginTop: 0 }}>
                    Active and upcoming standby declarations. Past slots are automatically hidden.
                </p>

                {standbySlots.length === 0 ? (
                    <div className="empty-state" style={{ padding: 'var(--space-xl) 0' }}>
                        <div className="empty-state-icon" style={{ fontSize: '1.75rem', marginBottom: '8px' }}>📅</div>
                        <p className="empty-state-text">No active standby slots. Click a date on the calendar above to opt-in.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {standbySlots.map(slot => (
                            <div
                                key={slot.id}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
                                    padding: '14px 18px', background: 'var(--bg-card)',
                                    border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', flexWrap: 'wrap',
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '200px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                                            {slot.start_date === slot.end_date
                                                ? fmtHeader(slot.start_date)
                                                : `${fmtHeader(slot.start_date)} → ${fmtHeader(slot.end_date)}`}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: '99px', background: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                                            {slotLabel(slot.slot)}
                                        </span>
                                        <span style={{
                                            fontSize: '0.75rem', fontWeight: 700, padding: '2px 10px', borderRadius: '99px',
                                            background: slot.status === 'assigned' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                                            color: slot.status === 'assigned' ? 'var(--success)' : 'var(--primary)',
                                            border: `1px solid ${slot.status === 'assigned' ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.25)'}`,
                                        }}>
                                            {slot.status === 'assigned' ? '✓ Assigned' : 'Awaiting Class'}
                                        </span>
                                    </div>
                                    {slot.notes && (
                                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{slot.notes}</span>
                                    )}
                                </div>

                                {slot.status !== 'assigned' && (
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => handleDeleteSlot(slot.id)}
                                        disabled={deletingId === slot.id}
                                        style={{ color: 'var(--danger)', borderColor: 'var(--danger)', opacity: deletingId === slot.id ? 0.5 : 1, whiteSpace: 'nowrap' }}
                                    >
                                        {deletingId === slot.id ? 'Removing…' : 'Cancel Standby'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default BackupAvailability;
