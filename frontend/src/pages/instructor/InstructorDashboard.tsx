import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getClasses, createUnavailabilityRequest, createClassAdditionRequest, getMyBatches, getMyRequests, getBatchMetadata } from '../../api/client';
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

const APPROVER_OPTIONS = [
    "Shivank Agrawal",
    "Shubham Yadav",
    "Vilas Varghese",
    "Ayush Raj",
    "Yogesh K"
];

const UnavailabilityModal: React.FC<UnavailModalProps> = ({ cls, isOpen, onClose, onSuccess }) => {
    const [reason, setReason] = useState('');
    const [topics, setTopics] = useState('');
    const [batchPulse, setBatchPulse] = useState('');
    const [teachingPace, setTeachingPace] = useState('');
    const [suggestedReplacement, setSuggestedReplacement] = useState('');
    const [otherComments, setOtherComments] = useState('');
    const [approvers, setApprovers] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const resetForm = () => {
        setReason(''); setTopics(''); setBatchPulse(''); setTeachingPace('');
        setSuggestedReplacement(''); setOtherComments(''); setApprovers([]); setError('');
    };

    const handleSubmit = async () => {
        if (!reason || !topics || !batchPulse || !teachingPace || approvers.length === 0) {
            setError('Please fill all mandatory fields and select at least one approver.');
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
                approvers,
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
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>{cls['Class Title']}</div>
                <div style={{ color: 'var(--text-muted)' }}>
                    {cls['Batch Name']} &middot; {cls['Date of Class (MM/DD/YYYY)']} &middot; {cls['Time of Class (HH:MM AM/PM) IST']} IST
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
                <input className="form-input" value={suggestedReplacement} onChange={e => setSuggestedReplacement(e.target.value)} placeholder="Optional" />
            </div>
            <div className="form-group">
                <label className="form-label">Other Comments</label>
                <textarea className="form-textarea" value={otherComments} onChange={e => setOtherComments(e.target.value)} placeholder="Optional" />
            </div>

            <div className="form-group">
                <label className="form-label form-label-required">Select Approvers</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                    {APPROVER_OPTIONS.map(name => {
                        const isSelected = approvers.includes(name);
                        return (
                            <div
                                key={name}
                                onClick={() => {
                                    if (isSelected) setApprovers(prev => prev.filter(n => n !== name));
                                    else setApprovers(prev => [...prev, name]);
                                }}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '20px',
                                    fontSize: '0.8125rem',
                                    cursor: 'pointer',
                                    border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                                    background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-secondary)',
                                    color: isSelected ? 'var(--primary)' : 'var(--text-primary)',
                                    transition: 'all 0.2s',
                                    fontWeight: isSelected ? 500 : 400,
                                }}
                            >
                                {name}
                            </div>
                        );
                    })}
                </div>
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
        <div ref={ref} style={{ position: 'relative' }}>
            <div
                className="form-select"
                onClick={() => { if (!disabled) setOpen(o => !o); }}
                style={{
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    userSelect: 'none',
                    opacity: disabled ? 0.6 : 1,
                }}
            >
                <span style={{ color: value ? 'var(--text-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {value || placeholder}
                </span>
            </div>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', zIndex: 9999,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                    maxHeight: '220px', display: 'flex', flexDirection: 'column',
                }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
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
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-elevated)')}
                                onMouseLeave={e => (e.currentTarget.style.background = value === o ? 'rgba(59,130,246,0.08)' : 'transparent')}
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
    const [approvers, setApprovers] = useState<string[]>([]);
    const [step, setStep] = useState<'form' | 'confirm'>('form');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [batchOptions, setBatchOptions] = useState<string[]>([]);
    const [batchMeta, setBatchMeta] = useState<Record<string, BatchMeta>>({});

    // Fetch instructor's own batches + metadata on open
    React.useEffect(() => {
        if (isOpen) {
            getMyBatches()
                .then(d => { setBatchOptions(Object.keys(d.batches)); })
                .catch(err => console.error('my-batches error:', err));
            getBatchMetadata()
                .then(d => { setBatchMeta(d.batch_metadata); })
                .catch(err => console.error('batch-metadata error:', err));
        }
    }, [isOpen]);

    const update = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

    /** When batch changes, auto-fill program and reset module */
    const handleBatchChange = (batch: string) => {
        const meta = batchMeta[batch];
        setForm(prev => ({
            ...prev,
            batch_name: batch,
            program: meta?.program || '',
            module_name: '',
        }));
    };

    const moduleOptions = form.batch_name && batchMeta[form.batch_name]
        ? [...batchMeta[form.batch_name].modules, 'Others']
        : ['Others'];

    /* Format YYYY-MM-DD → DD/MM/YYYY for display */
    const formatDateDisplay = (val: string) => {
        if (!val) return '';
        const [y, m, d] = val.split('-');
        if (!y || !m || !d) return val;
        return `${d}/${m}/${y}`;
    };

    const requiredFields = ['batch_name', 'class_title', 'module_name', 'date_of_class', 'time_of_class', 'reason'];

    const validate = () => {
        for (const f of requiredFields) {
            if (!(form as any)[f]) {
                const label = f.replace(/_/g, ' ');
                setError(`Please fill the "${label.charAt(0).toUpperCase() + label.slice(1)}" field.`);
                return false;
            }
        }
        if (approvers.length === 0) {
            setError('Please select at least one approver.');
            return false;
        }
        return true;
    };

    const handleContinue = () => { setError(''); if (validate()) setStep('confirm'); };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError('');
        try {
            await createClassAdditionRequest({ ...form, approvers });
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
        setApprovers([]);
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
                        <div className="form-group">
                            <label className="form-label form-label-required">Batch Name</label>
                            <SearchableDropdown
                                options={batchOptions}
                                value={form.batch_name}
                                onChange={handleBatchChange}
                                placeholder="Select batch..."
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label form-label-required">Program</label>
                            <input
                                className="form-input"
                                value={form.program}
                                readOnly
                                placeholder="Auto-filled from batch"
                                style={{ background: 'var(--bg-secondary)', cursor: 'not-allowed', color: form.program ? 'var(--text-primary)' : 'var(--text-muted)', backgroundImage: 'none' }}
                            />
                        </div>
                    </div>

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
                                    style={{ backgroundImage: 'none', paddingRight: form.date_of_class ? '90px' : undefined }}
                                />
                                {form.date_of_class && (
                                    <span style={{
                                        position: 'absolute', right: '36px', top: '50%', transform: 'translateY(-50%)',
                                        fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600, pointerEvents: 'none',
                                    }}>
                                        {formatDateDisplay(form.date_of_class)}
                                    </span>
                                )}
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

                    {/* Approvers */}
                    <div className="form-group">
                        <label className="form-label form-label-required">Select Approvers</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                            {APPROVER_OPTIONS.map(name => {
                                const isSelected = approvers.includes(name);
                                return (
                                    <div
                                        key={name}
                                        onClick={() => {
                                            if (isSelected) setApprovers(prev => prev.filter(n => n !== name));
                                            else setApprovers(prev => [...prev, name]);
                                        }}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '20px',
                                            fontSize: '0.8125rem',
                                            cursor: 'pointer',
                                            border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                                            background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-secondary)',
                                            color: isSelected ? 'var(--primary)' : 'var(--text-primary)',
                                            transition: 'all 0.2s',
                                            fontWeight: isSelected ? 500 : 400,
                                        }}
                                    >
                                        {name}
                                    </div>
                                );
                            })}
                        </div>
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
                                    {k === 'date_of_class' ? formatDateDisplay(v) : v}
                                </span>
                            </div>
                        ))}
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>Approvers: </span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{approvers.join(', ')}</span>
                        </div>
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
    cls['Class Type (Regular/Optional)'] || cls['Class Type'] || 'Regular';

/** Check if a class date is more than 3 days in the past */
const isOlderThan3Days = (cls: ClassItem): boolean => {
    const dateStr = cls['Date of Class (MM/DD/YYYY)'] || '';
    for (const fmt of ['MM/DD/YYYY', 'YYYY-MM-DD']) {
        // Simple parsing for MM/DD/YYYY and YYYY-MM-DD
        const parts = dateStr.trim().split(/[\/\-]/);
        if (parts.length !== 3) continue;
        let d: Date | null = null;
        if (fmt === 'MM/DD/YYYY') {
            const [m, day, y] = parts;
            d = new Date(Number(y.length === 2 ? '20' + y : y), Number(m) - 1, Number(day));
        } else {
            const [y, m, day] = parts;
            d = new Date(Number(y), Number(m) - 1, Number(day));
        }
        if (d && !isNaN(d.getTime())) {
            const now = new Date();
            const diffMs = now.getTime() - d.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            return diffDays > 3;
        }
    }
    return false;
};

const ClassCard: React.FC<ClassCardProps> = ({ cls, index, isPast, hasExistingRequest, onRaiseUnavailability }) => {
    const classType = getClassType(cls);
    const hideUnavail = isPast && isOlderThan3Days(cls);

    return (
        <div
            className="card class-card"
            style={{ animationDelay: `${index * 50}ms` }}
        >
            <div className="card-header">
                <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>
                        {cls['Class Title']}
                    </h3>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        {cls['Module Name']}
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
                <span> {cls['Date of Class (MM/DD/YYYY)']}</span>
                <span> {cls['Time of Class (HH:MM AM/PM) IST']} IST</span>
            </div>

            <div className="card-meta">
                <span className="card-meta-item">
                    <span className="card-meta-label">Module:</span> {cls['Module Name']}
                </span>
                <span className="card-meta-item">
                    <span className="card-meta-label">Batch:</span> {cls['Batch Name']}
                </span>
            </div>
            {/* Metrics row — past classes only */}
            {isPast && (cls['Average Rating'] || cls['Total Attendance Percentage'] || cls['PSP']) && (
                <div className="class-metrics">
                    {cls['Average Rating'] && (
                        <span className="metric-pill metric-rating">
                            Rating: {cls['Average Rating']}
                            {cls['Number of Ratings'] && <span className="metric-sub">({cls['Number of Ratings']})</span>}
                        </span>
                    )}
                    {cls['Total Attendance Percentage'] && (
                        <span className="metric-pill metric-attendance">
                            Attendance: {cls['Total Attendance Percentage']}%
                        </span>
                    )}
                    {cls['PSP'] && (
                        <span className="metric-pill metric-psp">
                            PSP: {cls['PSP']}
                        </span>
                    )}
                </div>
            )}
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

/* ─── Main Dashboard ─── */
const InstructorDashboard: React.FC = () => {
    const [upcoming, setUpcoming] = useState<ClassItem[]>([]);
    const [pastRecent, setPastRecent] = useState<ClassItem[]>([]);
    const [upcomingTotal, setUpcomingTotal] = useState(0);
    const [upcomingLimit, setUpcomingLimit] = useState(10);
    const [pastTotal, setPastTotal] = useState(0);
    const [pastLimit, setPastLimit] = useState(10);
    const [pastExpanded, setPastExpanded] = useState(true);
    const [loading, setLoading] = useState(true);

    // Set of class keys that already have a pending unavailability request
    const [requestedClassKeys, setRequestedClassKeys] = useState<Set<string>>(new Set());

    // Filters
    const [filterBatch, setFilterBatch] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [filterModule, setFilterModule] = useState('');

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
    const applyFilters = (classes: ClassItem[]) => {
        let result = classes;
        if (filterBatch) result = result.filter(c => String(c['Batch Name'] || '') === filterBatch);
        if (filterDate) result = result.filter(c => String(c['Date of Class (MM/DD/YYYY)'] || '') === filterDate);
        if (filterModule) result = result.filter(c => String(c['Module Name'] || '') === filterModule);
        return result;
    };

    const filteredUpcoming = applyFilters(upcoming);
    const filteredPast = applyFilters(pastRecent);

    // Derive unique filter options based on OTHER selections (Facet logic)
    const allClasses = [...upcoming, ...pastRecent];

    const getAvailableOptions = (exclude: 'batch' | 'date' | 'module') => {
        let result = allClasses;
        if (exclude !== 'batch' && filterBatch) {
            result = result.filter(c => String(c['Batch Name'] || '') === filterBatch);
        }
        if (exclude !== 'date' && filterDate) {
            result = result.filter(c => String(c['Date of Class (MM/DD/YYYY)'] || '') === filterDate);
        }
        if (exclude !== 'module' && filterModule) {
            result = result.filter(c => String(c['Module Name'] || '') === filterModule);
        }
        return result;
    };

    const uniqueBatches = [...new Set(getAvailableOptions('batch').map(c => String(c['Batch Name'] || '').trim()).filter(Boolean))].sort();
    const uniqueDates = [...new Set(getAvailableOptions('date').map(c => String(c['Date of Class (MM/DD/YYYY)'] || '').trim()).filter(Boolean))].sort();
    const uniqueModules = [...new Set(getAvailableOptions('module').map(c => String(c['Module Name'] || '').trim()).filter(Boolean))].sort();

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

            {/* Filters */}
            <div className="filters-bar">
                <select className="filter-select" value={filterBatch} onChange={e => setFilterBatch(e.target.value)}>
                    <option value="">All Batches</option>
                    {uniqueBatches.map(b => <option key={b} value={b}>{b.length > 50 ? b.slice(0, 50) + '…' : b}</option>)}
                </select>
                <select className="filter-select" value={filterDate} onChange={e => setFilterDate(e.target.value)}>
                    <option value="">All Dates</option>
                    {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select className="filter-select" value={filterModule} onChange={e => setFilterModule(e.target.value)}>
                    <option value="">All Modules</option>
                    {uniqueModules.map(m => <option key={m} value={m}>{m.length > 50 ? m.slice(0, 50) + '…' : m}</option>)}
                </select>
                {(filterBatch || filterDate || filterModule) && (
                    <button className="btn btn-sm btn-ghost" onClick={() => { setFilterBatch(''); setFilterDate(''); setFilterModule(''); }}>Clear</button>
                )}
            </div>

            {/* Upcoming Classes */}
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-md)', marginTop: 'var(--space-sm)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Upcoming
            </h2>
            {filteredUpcoming.length === 0 ? (
                <div className="empty-state" style={{ marginBottom: 'var(--space-xl)' }}>
                    <div className="empty-state-icon">&mdash;</div>
                    <p className="empty-state-text">{upcoming.length === 0 ? 'No upcoming classes found.' : 'No classes match current filters.'}</p>
                </div>
            ) : (
                <>
                    {filteredUpcoming.map((cls, i) => (
                        <ClassCard
                            key={`up-${cls['SBAT Group ID']}-${cls['Date of Class (MM/DD/YYYY)']}-${i}`}
                            cls={cls}
                            index={i}
                            hasExistingRequest={requestedClassKeys.has(classKey(
                                String(cls['Batch Name'] || ''),
                                String(cls['Class Title'] || ''),
                                String(cls['Date of Class (MM/DD/YYYY)'] || ''),
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

            {/* Past Classes */}
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
                            {filteredPast.map((cls, i) => (
                                <ClassCard
                                    key={`past-${cls['SBAT Group ID']}-${cls['Date of Class (MM/DD/YYYY)']}-${i}`}
                                    cls={cls}
                                    index={i}
                                    isPast
                                    hasExistingRequest={requestedClassKeys.has(classKey(
                                        String(cls['Batch Name'] || ''),
                                        String(cls['Class Title'] || ''),
                                        String(cls['Date of Class (MM/DD/YYYY)'] || ''),
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
