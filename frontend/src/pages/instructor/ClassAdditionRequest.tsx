import React, { useState, useEffect, useRef } from 'react';
import { createClassAdditionRequest, getMyBatches, getBatchMetadata } from '../../api/client';
import type { BatchMeta } from '../../api/client';
import Modal from '../../components/Modal';

const APPROVER_OPTIONS = [
    "Shivank Agrawal",
    "Shubham Yadav",
    "Vilas Varghese",
    "Ayush Raj",
    "Yogesh K"
];

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
        <div ref={ref} style={{ position: 'relative', minWidth: 0, width: '100%' }}>
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
                <span style={{ color: value ? 'var(--text-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
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

/* Generate 30-min time slots */
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

const FIELD_LABELS: Record<string, string> = {
    program: 'Program', batch_name: 'Batch Name', class_title: 'Class Title',
    module_name: 'Module Name', date_of_class: 'Date of Class',
    time_of_class: 'Time (IST)', class_type: 'Class Type',
    shift_other_classes: 'Shift Others by 1',
    assignment_requirement: 'Assignment & Homework', reason: 'Reason for Addition',
    other_comments: 'Other Comments',
};

const formatDateDisplay = (val: string) => {
    if (!val) return '';
    const [y, m, d] = val.split('-');
    if (!y || !m || !d) return val;
    return `${d}/${m}/${y}`;
};

const ClassAdditionRequest: React.FC = () => {
    const [form, setForm] = useState({
        program: '',
        batch_name: '',
        class_title: '',
        module_name: '',
        date_of_class: '',
        time_of_class: '',
        class_type: 'Regular',
        shift_other_classes: 'No',
        assignment_requirement: 'None',
        reason: '',
        other_comments: '',
    });
    const [approvers, setApprovers] = useState<string[]>([]);
    const [showConfirm, setShowConfirm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [batchOptions, setBatchOptions] = useState<string[]>([]);
    const [batchMeta, setBatchMeta] = useState<Record<string, BatchMeta>>({});

    useEffect(() => {
        getMyBatches()
            .then(d => setBatchOptions(Object.keys(d.batches)))
            .catch(err => console.error('my-batches error:', err));
        getBatchMetadata()
            .then(d => setBatchMeta(d.batch_metadata))
            .catch(err => console.error('batch-metadata error:', err));
    }, []);

    const update = (key: string, value: string) => {
        setForm(prev => ({ ...prev, [key]: value }));
    };

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

    const handleContinue = () => {
        setError('');
        if (validate()) setShowConfirm(true);
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError('');
        try {
            await createClassAdditionRequest({ ...form, approvers });
            setSuccess('Class addition request submitted successfully!');
            setShowConfirm(false);
            setForm({
                program: '', batch_name: '', class_title: '', module_name: '',
                date_of_class: '', time_of_class: '', class_type: 'Regular',
                shift_other_classes: 'No',
                assignment_requirement: 'None', reason: '', other_comments: '',
            });
            setApprovers([]);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to submit request.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Class Addition Request</h1>
                <p className="page-subtitle">Request a new class to be added to the schedule</p>
            </div>

            {success && (
                <div style={{ padding: 'var(--space-md)', background: 'var(--success-bg)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-md)', color: 'var(--success)', marginBottom: 'var(--space-lg)', fontSize: '0.875rem' }}>
                    {success}
                </div>
            )}
            {error && !showConfirm && (
                <div style={{ padding: 'var(--space-md)', background: 'var(--danger-bg)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', marginBottom: 'var(--space-lg)', fontSize: '0.875rem' }}>
                    {error}
                </div>
            )}

            <div className="card">
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

                {/* Assignment & Homework */}
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

                <div style={{ marginTop: 'var(--space-lg)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary btn-lg" onClick={handleContinue}>
                        Review &amp; Submit
                    </button>
                </div>
            </div>

            {/* Confirmation Modal */}
            <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title="Confirm Submission">
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
                    <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Edit</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? 'Submitting...' : 'Confirm & Submit'}
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default ClassAdditionRequest;
