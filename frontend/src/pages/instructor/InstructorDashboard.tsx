import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getClasses, createUnavailabilityRequest, createClassAdditionRequest, getMyRequests, getBatchMetadata, getInstructorOptions } from '../../api/client';
import type { ClassItem } from '../../types';
import Modal from '../../components/Modal';
import type { BatchMeta } from '../../api/client';

/* ─── Unavailability Modal for a single class ─── */
interface UnavailModalProps {
    cls: ClassItem;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}



const UnavailabilityModal: React.FC<UnavailModalProps> = ({ cls, isOpen, onClose, onSuccess }) => {
    const [reason, setReason] = useState('');
    const [topics, setTopics] = useState('');
    const [batchPulse, setBatchPulse] = useState('');
    const [teachingPace, setTeachingPace] = useState('');
    const [suggestedReplacement, setSuggestedReplacement] = useState('');
    const [otherComments, setOtherComments] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [instructorOptions, setInstructorOptions] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            getInstructorOptions().then(d => setInstructorOptions(d.instructors)).catch(() => { });
        }
    }, [isOpen]);

    const resetForm = () => {
        setReason(''); setTopics(''); setBatchPulse(''); setTeachingPace('');
        setSuggestedReplacement(''); setOtherComments(''); setError('');
    };

    const handleSubmit = async () => {
        if (!reason || !topics || !batchPulse || !teachingPace) {
            setError('Please fill all mandatory fields.');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await createUnavailabilityRequest({
                classes: [cls],
                reason,
                topics_and_promises: topics,
                batch_pulse_persona: batchPulse,
                teaching_pace_style: teachingPace,
                suggested_replacement: suggestedReplacement,
                other_comments: otherComments,
            });
            resetForm();
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to submit request.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => { resetForm(); onClose(); };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Raise Unavailability">
            <div style={{ marginBottom: 'var(--space-md)', padding: '10px 14px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{cls['class_topic']}</div>
                <div style={{ color: 'var(--text-muted)' }}>
                    {cls['sb_names']} &middot; {cls['class_date']} &middot; {cls['time_of_day']} IST
                </div>
            </div>

            {error && (
                <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '0.8125rem' }}>
                    {error}
                </div>
            )}

            <div className="form-group">
                <label className="form-label form-label-required">Reason for Unavailability</label>
                <textarea className="form-textarea" value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain the reason..." />
            </div>
            <div className="form-group">
                <label className="form-label form-label-required">Topics & Promises from Previous Class</label>
                <textarea className="form-textarea" value={topics} onChange={e => setTopics(e.target.value)} placeholder="What was covered / promised..." />
            </div>
            <div className="form-group">
                <label className="form-label form-label-required">Batch Pulse & Persona</label>
                <textarea className="form-textarea" value={batchPulse} onChange={e => setBatchPulse(e.target.value)} placeholder="Describe batch engagement..." />
            </div>
            <div className="form-group">
                <label className="form-label form-label-required">Recommended Teaching Pace & Style</label>
                <textarea className="form-textarea" value={teachingPace} onChange={e => setTeachingPace(e.target.value)} placeholder="Describe preferred pace..." />
            </div>
            <div className="form-group">
                <label className="form-label">Suggested Instructors for Replacement</label>
                <SearchableDropdown
                    options={instructorOptions}
                    value={suggestedReplacement}
                    onChange={setSuggestedReplacement}
                    placeholder="Select an instructor (optional)"
                />
            </div>
            <div className="form-group">
                <label className="form-label">Other Comments</label>
                <textarea className="form-textarea" value={otherComments} onChange={e => setOtherComments(e.target.value)} placeholder="Optional" />
            </div>


            <div className="modal-actions">
                <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
            </div>
        </Modal>
    );
};

/* ─── Shared SearchableDropdown ─── */
interface SearchableDropdownProps {
    options: string[];
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({ options, value, onChange, placeholder = 'Select...', disabled }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSelect = (val: string) => {
        onChange(val);
        setQuery('');
        setOpen(false);
    };

    return (
        <div ref={ref} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
            <div
                className="form-select"
                onClick={() => { if (!disabled) setOpen(o => !o); }}
                style={{
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    userSelect: 'none',
                    opacity: disabled ? 0.6 : 1,
                    overflow: 'hidden',
                }}
            >
                <span style={{
                    color: value ? 'var(--text-primary)' : 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: '1 1 auto',
                    minWidth: 0,
                    display: 'block'
                }}>
                    {value || placeholder}
                </span>
            </div>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)', zIndex: 9999,
                    boxShadow: 'var(--shadow-lg)',
                    maxHeight: '220px', display: 'flex', flexDirection: 'column',
                }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border-light)' }}>
                        <input
                            autoFocus
                            className="form-input"
                            style={{ padding: '6px 10px', fontSize: '0.8125rem', margin: 0, backgroundImage: 'none' }}
                            placeholder="Search..."
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onClick={e => e.stopPropagation()}
                        />
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {filtered.length === 0 ? (
                            <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No results</div>
                        ) : filtered.map(o => (
                            <div
                                key={o}
                                onMouseDown={() => handleSelect(o)}
                                style={{
                                    padding: '9px 12px',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    background: value === o ? 'rgba(59,130,246,0.08)' : 'transparent',
                                    color: value === o ? 'var(--primary)' : 'var(--text-primary)',
                                    transition: 'background 0.15s',
                                    whiteSpace: 'normal',
                                    wordBreak: 'break-word',
                                    lineHeight: '1.4'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                onMouseLeave={e => (e.currentTarget.style.background = value === o ? 'rgba(59,130,246,0.12)' : 'transparent')}
                            >
                                {o}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

/* Generate 30-min time slots for the day */
const generateTimeSlots = (): string[] => {
    const slots: string[] = [];
    for (let h = 0; h < 24; h++) {
        for (const m of [0, 30]) {
            const ampm = h < 12 ? 'AM' : 'PM';
            const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
            const min = m === 0 ? '00' : '30';
            slots.push(`${hour}:${min} ${ampm}`);
        }
    }
    return slots;
};
const TIME_SLOTS = generateTimeSlots();

/* ─── Approver options (used in Class Addition) ─── */
const APPROVER_OPTIONS = [
    "Shivank Agrawal",
    "Shubham Yadav",
    "Vilas Varghese",
    "Ayush Raj",
    "Yogesh K"
];

/* ─── Class Addition Modal ─── */
interface ClassAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const ClassAdditionModal: React.FC<ClassAddModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [form, setForm] = useState({
        program: '', batch_name: '', class_title: '', module_name: '',
        date_of_class: '', time_of_class: '', class_type: 'Regular',
        shift_other_classes: 'No',
        assignment_requirement: 'None', reason: '', other_comments: '',
    });
    const [step, setStep] = useState<'form' | 'confirm'>('form');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [batchMeta, setBatchMeta] = useState<Record<string, BatchMeta>>({});
    const [customBatchName, setCustomBatchName] = useState('');
    const [approver, setApprover] = useState('');

    // Fetch batch metadata (upcoming batches + modules) on open
    React.useEffect(() => {
        if (isOpen) {
            getBatchMetadata()
                .then(d => { setBatchMeta(d.batch_metadata); })
                .catch(err => console.error('batch-metadata error:', err));
        }
    }, [isOpen]);

    const update = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

    /** When batch changes, auto-fill program and reset module */
    const handleBatchChange = (batch: string) => {
        if (batch === 'Others') {
            setForm(prev => ({
                ...prev,
                batch_name: 'Others',
                program: '',
                module_name: '',
            }));
            return;
        }
        const meta = batchMeta[batch];
        setForm(prev => ({
            ...prev,
            batch_name: batch,
            program: meta?.program || '',
            module_name: '',
        }));
    };

    const isOthersBatch = form.batch_name === 'Others';

    const moduleOptions = form.batch_name && form.batch_name !== 'Others' && batchMeta[form.batch_name]
        ? [...batchMeta[form.batch_name].modules, 'Others']
        : ['Others'];

    // Only batches that have upcoming modules (from getBatchMetadata) + 'Others'
    const batchDropdownOptions = [...Object.keys(batchMeta).sort(), 'Others'];

    /* Format YYYY-MM-DD → DD/MM/YYYY for display */
    const formatDateDisplay = (val: string) => {
        if (!val) return '';
        const [y, m, d] = val.split('-');
        if (!y || !m || !d) return val;
        return `${d}/${m}/${y}`;
    };

    const requiredFields = ['batch_name', 'class_title', 'module_name', 'date_of_class', 'time_of_class', 'reason'];

    const validate = () => {
        if (isOthersBatch && !customBatchName.trim()) {
            setError('Please enter a custom batch name.');
            return false;
        }
        for (const f of requiredFields) {
            if (!(form as any)[f]) {
                const label = f.replace(/_/g, ' ');
                setError(`Please fill the "${label.charAt(0).toUpperCase() + label.slice(1)}" field.`);
                return false;
            }
        }
        if (!approver) {
            setError('Please select an approver.');
            return false;
        }
        return true;
    };

    const handleContinue = () => { setError(''); if (validate()) setStep('confirm'); };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError('');
        try {
            const submitForm = isOthersBatch
                ? { ...form, batch_name: customBatchName.trim() }
                : form;
            await createClassAdditionRequest({ ...submitForm, approver });
            resetForm();
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to submit request.');
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setForm({
            program: '', batch_name: '', class_title: '', module_name: '',
            date_of_class: '', time_of_class: '', class_type: 'Regular',
            shift_other_classes: 'No',
            assignment_requirement: 'None', reason: '', other_comments: '',
        });
        setCustomBatchName('');
        setApprover('');
        setStep('form');
        setError('');
    };

    const handleClose = () => { resetForm(); onClose(); };

    const FIELD_LABELS: Record<string, string> = {
        program: 'Program', batch_name: 'Batch Name', class_title: 'Class Title',
        module_name: 'Module Name', date_of_class: 'Date of Class',
        time_of_class: 'Time (IST)', class_type: 'Class Type',
        shift_other_classes: 'Shift Others by 1',
        assignment_requirement: 'Assignment & Homework', reason: 'Reason for Addition',
        other_comments: 'Other Comments',
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Request Class Addition">
            {error && (
                <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '0.8125rem' }}>
                    {error}
                </div>
            )}

            {step === 'form' && (
                <>
                    {/* Row 1: Batch Name + Program */}
                    <div className="form-row">
                        <div className="form-group" style={{ minWidth: 0 }}>
                            <label className="form-label form-label-required">Batch Name</label>
                            <SearchableDropdown
                                options={batchDropdownOptions}
                                value={form.batch_name}
                                onChange={handleBatchChange}
                                placeholder="Select batch..."
                            />
                        </div>
                        <div className="form-group" style={{ minWidth: 0 }}>
                            <label className="form-label form-label-required">Program</label>
                            <input
                                className="form-input"
                                value={form.program}
                                readOnly={!isOthersBatch}
                                onChange={isOthersBatch ? e => update('program', e.target.value) : undefined}
                                placeholder={isOthersBatch ? 'Enter program name' : 'Auto-filled from batch'}
                                style={{ background: isOthersBatch ? 'var(--bg-input)' : 'var(--bg-secondary)', cursor: isOthersBatch ? 'text' : 'not-allowed', color: form.program ? 'var(--text-primary)' : 'var(--text-muted)', backgroundImage: 'none' }}
                            />
                        </div>
                    </div>
                    {/* Manual batch name input when "Others" is selected */}
                    {isOthersBatch && (
                        <div className="form-group">
                            <label className="form-label form-label-required">Custom Batch Name</label>
                            <input
                                className="form-input"
                                value={customBatchName}
                                onChange={e => setCustomBatchName(e.target.value)}
                                placeholder="Enter batch name manually"
                                style={{ backgroundImage: 'none' }}
                            />
                        </div>
                    )}

                    {/* Row 2: Module Name + Class Title */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label form-label-required">Module Name</label>
                            <SearchableDropdown
                                options={moduleOptions}
                                value={form.module_name}
                                onChange={v => update('module_name', v)}
                                placeholder="Select module..."
                                disabled={!form.batch_name}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label form-label-required">Class Title</label>
                            <input
                                className="form-input"
                                value={form.class_title}
                                onChange={e => update('class_title', e.target.value)}
                                placeholder="Enter class title"
                                style={{ backgroundImage: 'none' }}
                            />
                        </div>
                    </div>

                    {/* Row 3: Date + Time */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label form-label-required">Date of Class</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    className="form-input"
                                    type="date"
                                    value={form.date_of_class}
                                    onChange={e => update('date_of_class', e.target.value)}
                                    style={{ backgroundImage: 'none', width: '100%' }}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label form-label-required">Time (IST)</label>
                            <SearchableDropdown
                                options={TIME_SLOTS}
                                value={form.time_of_class}
                                onChange={v => update('time_of_class', v)}
                                placeholder="Select time..."
                            />
                        </div>
                    </div>

                    {/* Row 4: Class Type + Shift */}
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Class Type</label>
                            <select className="form-select" style={{ appearance: 'none' }} value={form.class_type} onChange={e => update('class_type', e.target.value)}>
                                <option value="Regular">Regular</option>
                                <option value="Optional">Optional</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Shift Other Classes by 1</label>
                            <select className="form-select" style={{ appearance: 'none' }} value={form.shift_other_classes} onChange={e => update('shift_other_classes', e.target.value)}>
                                <option value="No">No</option>
                                <option value="Yes">Yes</option>
                            </select>
                        </div>
                    </div>

                    {/* Row 5: Assignment & Homework (full width) */}
                    <div className="form-group">
                        <label className="form-label">Assignment &amp; Homework Requirement</label>
                        <select className="form-select" style={{ appearance: 'none' }} value={form.assignment_requirement} onChange={e => update('assignment_requirement', e.target.value)}>
                            <option value="None">None</option>
                            <option value="Assignment">Assignment</option>
                            <option value="Homework">Homework</option>
                            <option value="Both">Both</option>
                        </select>
                    </div>

                    {/* Reason */}
                    <div className="form-group">
                        <label className="form-label form-label-required">Reason for Addition</label>
                        <textarea className="form-textarea" value={form.reason} onChange={e => update('reason', e.target.value)} placeholder="Explain why this class needs to be added" />
                    </div>

                    {/* Other Comments */}
                    <div className="form-group">
                        <label className="form-label">Other Comments</label>
                        <textarea className="form-textarea" value={form.other_comments} onChange={e => update('other_comments', e.target.value)} placeholder="Optional" />
                    </div>

                    {/* Approver */}
                    <div className="form-group">
                        <label className="form-label form-label-required">Select Approver</label>
                        <select className="form-select" style={{ appearance: 'none' }} value={approver} onChange={e => setApprover(e.target.value)}>
                            <option value="">Select approver...</option>
                            {APPROVER_OPTIONS.map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="modal-actions">
                        <button className="btn btn-secondary" onClick={handleClose}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleContinue}>Review &amp; Submit</button>
                    </div>
                </>
            )}

            {step === 'confirm' && (
                <>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 'var(--space-md)' }}>
                        Please review before submitting:
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8125rem' }}>
                        {Object.entries(form).filter(([, v]) => v).map(([k, v]) => (
                            <div key={k}>
                                <span style={{ color: 'var(--text-muted)' }}>{FIELD_LABELS[k] || k.replace(/_/g, ' ')}: </span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                    {k === 'date_of_class' ? formatDateDisplay(v) : k === 'batch_name' && v === 'Others' ? customBatchName || 'Others' : v}
                                </span>
                            </div>
                        ))}
                        {approver && (
                            <div>
                                <span style={{ color: 'var(--text-muted)' }}>Approver: </span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{approver}</span>
                            </div>
                        )}
                    </div>
                    {error && (
                        <div style={{ marginTop: '12px', padding: '8px 12px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '0.8125rem' }}>
                            {error}
                        </div>
                    )}
                    <div className="modal-actions">
                        <button className="btn btn-secondary" onClick={() => setStep('form')}>Edit</button>
                        <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                            {submitting ? 'Submitting...' : 'Confirm & Submit'}
                        </button>
                    </div>
                </>
            )}
        </Modal>
    );
};

/* ─── Class Card ─── */
interface ClassCardProps {
    cls: ClassItem;
    index: number;
    isPast?: boolean;
    hasExistingRequest?: boolean;
    onRaiseUnavailability: (cls: ClassItem) => void;
}

const getClassType = (cls: ClassItem) =>
    cls['class_type'] || 'Regular';

const ClassCard: React.FC<ClassCardProps> = ({ cls, index, isPast, hasExistingRequest, onRaiseUnavailability }) => {
    const classType = getClassType(cls);
    const hideUnavail = isPast && !cls['_recent_past'];

    return (
        <div
            className="card class-card"
            style={{ animationDelay: `${index * 50}ms` }}
        >
            <div className="card-header">
                <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>
                        {cls['class_topic']}
                    </h3>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        {cls['module_name']}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`badge badge-${classType.toLowerCase() === 'optional' ? 'optional' : 'regular'}`}>
                        {classType}
                    </span>
                    {isPast && (
                        <span className="badge" style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}>
                            Past
                        </span>
                    )}
                </div>
            </div>

            {/* Date & Time — prominent */}
            <div style={{ margin: '10px 0', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.9375rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
                <span> {cls['class_date']}</span>
                <span> {cls['time_of_day']} IST</span>
            </div>

            <div className="card-meta">
                <span className="card-meta-item">
                    <span className="card-meta-label">Module:</span> {cls['module_name']}
                </span>
                <span className="card-meta-item">
                    <span className="card-meta-label">Batch:</span> {cls['sb_names']}
                </span>
                {isPast && (
                    <span className="card-meta-item" style={{ color: (cls['class_rating'] !== '' && cls['class_rating'] != null) ? 'var(--warning)' : 'var(--text-muted)', fontWeight: 500 }}>
                        <span className="card-meta-label" style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Rating:</span> {(cls['class_rating'] !== '' && cls['class_rating'] != null) ? `⭐ ${cls['class_rating']}` : '—'}
                    </span>
                )}
            </div>

            {!hideUnavail && (
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                    {hasExistingRequest ? (
                        <span
                            className="btn btn-sm"
                            style={{ background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid rgba(59,130,246,0.2)', cursor: 'default', fontWeight: 600 }}
                        >
                            Request Raised
                        </span>
                    ) : (
                        <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => onRaiseUnavailability(cls)}
                        >
                            Raise Unavailability
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

/* ─── Calendar Picker (single date + range) ─── */
interface DateRange { start: string; end: string; }  // MM/DD/YYYY
interface CalendarPickerProps {
    range: DateRange | null;
    classDates: Set<string>;   // MM/DD/YYYY – dates that have at least one class
    onChange: (range: DateRange | null) => void;
    mode: 'single' | 'range';
    onModeChange: (mode: 'single' | 'range') => void;
    onClose?: () => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const toMMDDYYYY = (y: number, m: number, d: number) =>
    `${String(m + 1).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;

const mmddyyyyToTs = (s: string): number => {
    const [m, d, y] = s.split('/').map(Number);
    return new Date(y, m - 1, d).getTime();
};

const CalendarPicker: React.FC<CalendarPickerProps> = ({ range, classDates, onChange, mode, onModeChange, onClose }) => {
    const today = new Date();
    const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
    // pending = first click placed, waiting for second
    const [pending, setPending] = useState<string | null>(null);
    const [hovered, setHovered] = useState<string | null>(null);

    const firstDayOfWeek = new Date(view.year, view.month, 1).getDay();
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

    const prev = () => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
    const next = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 });

    const handleClick = (dateStr: string) => {
        if (mode === 'single') {
            onChange({ start: dateStr, end: dateStr });
            setPending(null);
            setHovered(null);
            onClose?.();
            return;
        }
        // Range mode
        if (!pending) {
            setPending(dateStr);
            onChange(null);
        } else if (dateStr === pending) {
            setPending(null);
        } else {
            const a = mmddyyyyToTs(pending);
            const b = mmddyyyyToTs(dateStr);
            const [s, e] = a <= b ? [pending, dateStr] : [dateStr, pending];
            onChange({ start: s, end: e });
            setPending(null);
            setHovered(null);
        }
    };

    const todayStr = toMMDDYYYY(today.getFullYear(), today.getMonth(), today.getDate());

    // effective range for highlighting (committed or preview)
    const previewEnd = pending && hovered ? hovered : null;
    const rangeStart = range?.start ?? (pending && previewEnd
        ? (mmddyyyyToTs(pending) <= mmddyyyyToTs(previewEnd) ? pending : previewEnd)
        : pending) ?? null;
    const rangeEnd = range?.end ?? (pending && previewEnd
        ? (mmddyyyyToTs(pending) <= mmddyyyyToTs(previewEnd) ? previewEnd : pending)
        : null) ?? null;

    const inRange = (dateStr: string) => {
        if (!rangeStart || !rangeEnd) return false;
        const ts = mmddyyyyToTs(dateStr);
        return ts >= mmddyyyyToTs(rangeStart) && ts <= mmddyyyyToTs(rangeEnd);
    };

    const cells: (number | null)[] = [
        ...Array(firstDayOfWeek).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];

    const rangeLabel = range
        ? `${range.start} – ${range.end}`
        : pending ? `${pending} → select end date` : null;

    return (
        <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)', padding: '12px 14px', width: 'fit-content',
        }}>
            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: '3px', marginBottom: '10px' }}>
                {(['single', 'range'] as const).map(m => (
                    <button
                        key={m}
                        onClick={() => { onModeChange(m); setPending(null); onChange(null); }}
                        style={{
                            padding: '4px 14px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                            fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit',
                            background: mode === m ? 'var(--accent-primary)' : 'transparent',
                            color: mode === m ? '#fff' : 'var(--text-secondary)',
                            transition: 'all 0.15s',
                        }}
                    >
                        {m === 'single' ? 'Single Date' : 'Date Range'}
                    </button>
                ))}
            </div>
            {/* Month navigation */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '12px' }}>
                <button onClick={prev} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem', padding: '0 4px' }}>‹</button>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                    {MONTH_NAMES[view.month]} {view.year}
                </span>
                <button onClick={next} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem', padding: '0 4px' }}>›</button>
            </div>
            {/* Hint */}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', minHeight: '16px' }}>
                {pending && !range ? 'Now click an end date' : !pending && !range ? 'Click a start date' : ''}
            </div>
            {/* Day-of-week headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 32px)', gap: '2px', marginBottom: '4px' }}>
                {DAY_LABELS.map(l => (
                    <div key={l} style={{ textAlign: 'center', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', padding: '2px 0' }}>{l}</div>
                ))}
            </div>
            {/* Day cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 32px)', gap: '2px' }}>
                {cells.map((day, idx) => {
                    if (!day) return <div key={`e-${idx}`} />;
                    const dateStr = toMMDDYYYY(view.year, view.month, day);
                    const hasClass = classDates.has(dateStr);
                    const isStart = dateStr === rangeStart;
                    const isEnd = dateStr === rangeEnd;
                    const isMid = inRange(dateStr) && !isStart && !isEnd;
                    const isEndpoint = isStart || isEnd;
                    const isToday = dateStr === todayStr;
                    const isPending = dateStr === pending && !range;
                    return (
                        <div
                            key={dateStr}
                            onClick={() => handleClick(dateStr)}
                            onMouseEnter={() => pending && setHovered(dateStr)}
                            onMouseLeave={() => setHovered(null)}
                            style={{
                                width: '32px', height: '32px', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.8125rem', fontWeight: isToday ? 700 : 400,
                                position: 'relative',
                                background: isEndpoint || isPending
                                    ? 'var(--accent-primary)'
                                    : isMid
                                        ? 'rgba(99,102,241,0.18)'
                                        : isToday
                                            ? 'rgba(99,102,241,0.08)'
                                            : 'transparent',
                                color: isEndpoint || isPending ? '#fff' : hasClass ? 'var(--text-primary)' : 'var(--text-muted)',
                                opacity: hasClass ? 1 : 0.35,
                                transition: 'background 0.1s',
                            }}
                        >
                            {day}
                            {hasClass && !isEndpoint && !isMid && !isPending && (
                                <span style={{
                                    position: 'absolute', bottom: '3px', left: '50%', transform: 'translateX(-50%)',
                                    width: '4px', height: '4px', borderRadius: '50%',
                                    background: 'var(--accent-primary)',
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>
            {/* Range label + clear */}
            {rangeLabel && (
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                        padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem',
                        background: 'rgba(99,102,241,0.12)', color: 'var(--accent-primary)', fontWeight: 500,
                    }}>{rangeLabel}</span>
                    {range && (
                        <span
                            onClick={() => { onChange(null); setPending(null); }}
                            style={{ cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }}
                        >clear</span>
                    )}
                </div>
            )}
        </div>
    );
};

/* ─── Main Dashboard ─── */
const InstructorDashboard: React.FC = () => {
    const [upcoming, setUpcoming] = useState<ClassItem[]>([]);
    const [pastRecent, setPastRecent] = useState<ClassItem[]>([]);
    const [upcomingTotal, setUpcomingTotal] = useState(0);
    const [upcomingLimit, setUpcomingLimit] = useState(10);
    const [pastTotal, setPastTotal] = useState(0);
    const [pastLimit, setPastLimit] = useState(10);
    const [upcomingExpanded, setUpcomingExpanded] = useState(false);
    const [pastExpanded, setPastExpanded] = useState(false);
    const [loading, setLoading] = useState(true);

    // Set of class keys that already have a pending unavailability request
    const [requestedClassKeys, setRequestedClassKeys] = useState<Set<string>>(new Set());

    // Upcoming filters
    const [upFilterBatch, setUpFilterBatch] = useState('');
    const [upFilterDateRange, setUpFilterDateRange] = useState<DateRange | null>(null);
    const [upFilterModule, setUpFilterModule] = useState('');
    const [upFilterTime, setUpFilterTime] = useState<'' | 'morning' | 'evening'>('');
    const [upShowCal, setUpShowCal] = useState(false);
    const [upCalMode, setUpCalMode] = useState<'single' | 'range'>('single');

    // Past filters
    const [pastFilterBatch, setPastFilterBatch] = useState('');
    const [pastFilterDateRange, setPastFilterDateRange] = useState<DateRange | null>(null);
    const [pastFilterModule, setPastFilterModule] = useState('');
    const [pastFilterTime, setPastFilterTime] = useState<'' | 'morning' | 'evening'>('');
    const [pastShowCal, setPastShowCal] = useState(false);
    const [pastCalMode, setPastCalMode] = useState<'single' | 'range'>('single');

    // Unavailability modal state
    const [unavailClass, setUnavailClass] = useState<ClassItem | null>(null);

    // Class addition modal state
    const [showAddClass, setShowAddClass] = useState(false);

    // Success banner
    const [successMsg, setSuccessMsg] = useState('');

    /** Build a unique key for matching classes to requests */
    const classKey = (batch: string, title: string, date: string) =>
        `${batch.trim()}||${title.trim()}||${date.trim()}`;

    const fetchClasses = useCallback(async () => {
        try {
            const [upData, pastData, reqData] = await Promise.all([
                getClasses('upcoming', upcomingLimit, 0),
                getClasses('past', pastLimit, 0),
                getMyRequests(),
            ]);
            setUpcoming(upData.classes);
            setUpcomingTotal(upData.total);
            setPastRecent(pastData.classes);
            setPastTotal(pastData.total);

            // Build lookup of existing unavailability requests
            const keys = new Set<string>();
            for (const r of reqData.requests) {
                if (r.request_type !== 'unavailability') continue;
                const status = String(r.status || r.Status || '').trim();
                if (status === 'Rejected') continue; // allow re-raising rejected
                const batch = String(r['Batch Name'] || '').trim();
                const title = String(r['Class Title'] || '').trim();
                const date = String(r['Original Date of Class (MM/DD/YYYY)'] || '').trim();
                if (batch && title && date) keys.add(`${batch}||${title}||${date}`);
            }
            setRequestedClassKeys(keys);
        } catch (err) {
            console.error('Failed to fetch classes:', err);
        } finally {
            setLoading(false);
        }
    }, [upcomingLimit, pastLimit]);

    useEffect(() => {
        fetchClasses();
    }, [fetchClasses]);

    const loadMore = () => setUpcomingLimit(prev => prev + 10);

    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 5000);
        fetchClasses(); // Refresh class list
    };

    /** Apply client-side filters to a class list */
    const applyFilters = (
        classes: ClassItem[],
        batch: string, module: string, time: '' | 'morning' | 'evening', dateRange: DateRange | null
    ) => {
        let result = classes;
        if (batch) result = result.filter(c => String(c['sb_names'] || '') === batch);
        if (dateRange) {
            const startTs = mmddyyyyToTs(dateRange.start);
            const endTs = mmddyyyyToTs(dateRange.end);
            result = result.filter(c => {
                const ts = mmddyyyyToTs(String(c['class_date'] || '').trim());
                return ts >= startTs && ts <= endTs;
            });
        }
        if (module) result = result.filter(c => String(c['module_name'] || '') === module);
        if (time) {
            result = result.filter(c => {
                const t = String(c['time_of_day'] || '').toUpperCase();
                return time === 'morning' ? t.includes('AM') : t.includes('PM');
            });
        }
        return result;
    };

    const filteredUpcoming = applyFilters(upcoming, upFilterBatch, upFilterModule, upFilterTime, upFilterDateRange);
    const filteredPast = applyFilters(pastRecent, pastFilterBatch, pastFilterModule, pastFilterTime, pastFilterDateRange);

    // Derive unique filter options per section
    const upBatches = [...new Set(upcoming.map(c => String(c['sb_names'] || '').trim()).filter(Boolean))].sort();
    const upModules = [...new Set(upcoming.map(c => String(c['module_name'] || '').trim()).filter(Boolean))].sort();
    const upDatesSet = new Set(upcoming.map(c => String(c['class_date'] || '').trim()).filter(Boolean));
    const pastBatches = [...new Set(pastRecent.map(c => String(c['sb_names'] || '').trim()).filter(Boolean))].sort();
    const pastModules = [...new Set(pastRecent.map(c => String(c['module_name'] || '').trim()).filter(Boolean))].sort();
    const pastDatesSet = new Set(pastRecent.map(c => String(c['class_date'] || '').trim()).filter(Boolean));

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container">
                    <div className="spinner" />
                    <span style={{ color: 'var(--text-muted)' }}>Loading classes...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            {/* Success banner */}
            {successMsg && (
                <div style={{
                    padding: 'var(--space-md)',
                    background: 'var(--success-bg)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--success)',
                    marginBottom: 'var(--space-lg)',
                    fontSize: '0.875rem',
                }}>
                    {successMsg}
                </div>
            )}

            {/* Action bar */}
            <div className="action-bar">
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <h1 className="page-title">My Classes</h1>
                    <p className="page-subtitle">{upcomingTotal} upcoming &middot; {pastRecent.length} recent past</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAddClass(true)}>
                    Request Class Addition
                </button>
            </div>

            {/* ─── Upcoming Classes ─── */}
            <h2
                onClick={() => setUpcomingExpanded(prev => !prev)}
                style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: upcomingExpanded ? 'var(--space-md)' : 0, marginTop: 'var(--space-sm)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', userSelect: 'none' }}
            >
                <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: upcomingExpanded ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: '0.75rem' }}>&#9654;</span>
                Upcoming ({upcomingTotal})
            </h2>
            {upcomingExpanded && (
                <>
                    {/* Upcoming filters */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                        <select className="filter-select" value={upFilterBatch} onChange={e => setUpFilterBatch(e.target.value)}>
                            <option value="">All Batches</option>
                            {upBatches.map((b: string) => <option key={b} value={b}>{b.length > 50 ? b.slice(0, 50) + '…' : b}</option>)}
                        </select>
                        <select className="filter-select" value={upFilterModule} onChange={e => setUpFilterModule(e.target.value)}>
                            <option value="">All Modules</option>
                            {upModules.map((m: string) => <option key={m} value={m}>{m.length > 50 ? m.slice(0, 50) + '…' : m}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-input)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '3px' }}>
                            {(['morning', 'evening'] as const).map(slot => (
                                <button key={slot} onClick={() => setUpFilterTime(prev => prev === slot ? '' : slot)}
                                    style={{ padding: '4px 12px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, fontFamily: 'inherit', background: upFilterTime === slot ? 'var(--accent-primary)' : 'transparent', color: upFilterTime === slot ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                                    {slot === 'morning' ? 'Morning' : 'Evening'}
                                </button>
                            ))}
                        </div>
                        <div style={{ position: 'relative' }}>
                            <button onClick={() => setUpShowCal(p => !p)}
                                style={{ padding: '5px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', background: upFilterDateRange ? 'rgba(99,102,241,0.12)' : 'var(--bg-input)', color: upFilterDateRange ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: upFilterDateRange ? 600 : 400, cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                                {upFilterDateRange ? (upFilterDateRange.start === upFilterDateRange.end ? upFilterDateRange.start : `${upFilterDateRange.start} – ${upFilterDateRange.end}`) : '📅 Date'}
                            </button>
                            {upShowCal && (
                                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100, boxShadow: 'var(--shadow-lg)', borderRadius: 'var(--radius-md)' }}>
                                    <CalendarPicker range={upFilterDateRange} classDates={upDatesSet} onChange={setUpFilterDateRange} mode={upCalMode} onModeChange={setUpCalMode} onClose={() => setUpShowCal(false)} />
                                </div>
                            )}
                        </div>
                        {(upFilterBatch || upFilterDateRange || upFilterModule || upFilterTime) && (
                            <button className="btn btn-sm btn-ghost" onClick={() => { setUpFilterBatch(''); setUpFilterDateRange(null); setUpFilterModule(''); setUpFilterTime(''); }}>Clear</button>
                        )}
                    </div>

                    {filteredUpcoming.length === 0 ? (
                        <div className="empty-state" style={{ marginBottom: 'var(--space-xl)' }}>
                            <div className="empty-state-icon">&mdash;</div>
                            <p className="empty-state-text">{upcoming.length === 0 ? 'No upcoming classes found.' : 'No classes match current filters.'}</p>
                        </div>
                    ) : (
                        <>
                            {filteredUpcoming.map((cls, i) => (
                                <ClassCard
                                    key={`up-${cls['sbat_group_id']}-${cls['class_date']}-${i}`}
                                    cls={cls}
                                    index={i}
                                    hasExistingRequest={requestedClassKeys.has(classKey(
                                        String(cls['sb_names'] || ''),
                                        String(cls['class_topic'] || ''),
                                        String(cls['class_date'] || ''),
                                    ))}
                                    onRaiseUnavailability={setUnavailClass}
                                />
                            ))}
                            {upcoming.length < upcomingTotal && (
                                <div style={{ textAlign: 'center', marginTop: 'var(--space-lg)' }}>
                                    <button className="btn btn-secondary" onClick={loadMore}>
                                        Load More ({upcomingTotal - upcoming.length} remaining)
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* ─── Past Classes ─── */}
            {pastRecent.length > 0 && (
                <>
                    <h2
                        onClick={() => setPastExpanded(prev => !prev)}
                        style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: pastExpanded ? 'var(--space-md)' : 0, marginTop: 'var(--space-xl)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', userSelect: 'none' }}
                    >
                        <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: pastExpanded ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: '0.75rem' }}>&#9654;</span>
                        Recent Past ({pastTotal})
                    </h2>
                    {pastExpanded && (
                        <>
                            {/* Past filters */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
                                <select className="filter-select" value={pastFilterBatch} onChange={e => setPastFilterBatch(e.target.value)}>
                                    <option value="">All Batches</option>
                                    {pastBatches.map((b: string) => <option key={b} value={b}>{b.length > 50 ? b.slice(0, 50) + '…' : b}</option>)}
                                </select>
                                <select className="filter-select" value={pastFilterModule} onChange={e => setPastFilterModule(e.target.value)}>
                                    <option value="">All Modules</option>
                                    {pastModules.map((m: string) => <option key={m} value={m}>{m.length > 50 ? m.slice(0, 50) + '…' : m}</option>)}
                                </select>
                                <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-input)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '3px' }}>
                                    {(['morning', 'evening'] as const).map(slot => (
                                        <button key={slot} onClick={() => setPastFilterTime(prev => prev === slot ? '' : slot)}
                                            style={{ padding: '4px 12px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, fontFamily: 'inherit', background: pastFilterTime === slot ? 'var(--accent-primary)' : 'transparent', color: pastFilterTime === slot ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                                            {slot === 'morning' ? 'Morning' : 'Evening'}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <button onClick={() => setPastShowCal(p => !p)}
                                        style={{ padding: '5px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', background: pastFilterDateRange ? 'rgba(99,102,241,0.12)' : 'var(--bg-input)', color: pastFilterDateRange ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: pastFilterDateRange ? 600 : 400, cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                                        {pastFilterDateRange ? (pastFilterDateRange.start === pastFilterDateRange.end ? pastFilterDateRange.start : `${pastFilterDateRange.start} – ${pastFilterDateRange.end}`) : '📅 Date'}
                                    </button>
                                    {pastShowCal && (
                                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100, boxShadow: 'var(--shadow-lg)', borderRadius: 'var(--radius-md)' }}>
                                            <CalendarPicker range={pastFilterDateRange} classDates={pastDatesSet} onChange={setPastFilterDateRange} mode={pastCalMode} onModeChange={setPastCalMode} onClose={() => setPastShowCal(false)} />
                                        </div>
                                    )}
                                </div>
                                {(pastFilterBatch || pastFilterDateRange || pastFilterModule || pastFilterTime) && (
                                    <button className="btn btn-sm btn-ghost" onClick={() => { setPastFilterBatch(''); setPastFilterDateRange(null); setPastFilterModule(''); setPastFilterTime(''); }}>Clear</button>
                                )}
                            </div>

                            {filteredPast.map((cls, i) => (
                                <ClassCard
                                    key={`past-${cls['sbat_group_id']}-${cls['class_date']}-${i}`}
                                    cls={cls}
                                    index={i}
                                    isPast
                                    hasExistingRequest={requestedClassKeys.has(classKey(
                                        String(cls['sb_names'] || ''),
                                        String(cls['class_topic'] || ''),
                                        String(cls['class_date'] || ''),
                                    ))}
                                    onRaiseUnavailability={setUnavailClass}
                                />
                            ))}
                            {pastRecent.length < pastTotal && pastLimit < 50 && (
                                <div style={{ textAlign: 'center', marginTop: 'var(--space-lg)' }}>
                                    <button className="btn btn-secondary" onClick={() => setPastLimit(prev => Math.min(prev + 10, 50))}>
                                        Load More ({Math.min(pastTotal - pastRecent.length, 50 - pastLimit)} more)
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* Unavailability Modal */}
            {unavailClass && (
                <UnavailabilityModal
                    cls={unavailClass}
                    isOpen={true}
                    onClose={() => setUnavailClass(null)}
                    onSuccess={() => showSuccess('Unavailability request submitted successfully!')}
                />
            )}

            {/* Class Addition Modal */}
            <ClassAdditionModal
                isOpen={showAddClass}
                onClose={() => setShowAddClass(false)}
                onSuccess={() => showSuccess('Class addition request submitted successfully!')}
            />
        </div>
    );
};

export default InstructorDashboard;
