import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getClasses, createUnavailabilityRequest, getInstructorOptions } from '../../api/client';
import type { ClassItem } from '../../types';
import Modal from '../../components/Modal';


/* ─── SearchableDropdown (same as InstructorDashboard) ─── */
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
                    display: 'flex', alignItems: 'center', userSelect: 'none',
                    opacity: disabled ? 0.6 : 1, overflow: 'hidden',
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
                    boxShadow: 'var(--shadow-lg)', maxHeight: '220px', display: 'flex', flexDirection: 'column',
                }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border-light)' }}>
                        <input
                            autoFocus className="form-input"
                            style={{ padding: '6px 10px', fontSize: '0.8125rem', margin: 0, backgroundImage: 'none' }}
                            placeholder="Search..."
                            value={query} onChange={e => setQuery(e.target.value)}
                            onClick={e => e.stopPropagation()}
                        />
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {filtered.length === 0 ? (
                            <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No results</div>
                        ) : filtered.map(o => (
                            <div key={o} onMouseDown={() => handleSelect(o)}
                                style={{
                                    padding: '9px 12px', cursor: 'pointer', fontSize: '0.875rem',
                                    background: value === o ? 'rgba(59,130,246,0.08)' : 'transparent',
                                    color: value === o ? 'var(--primary)' : 'var(--text-primary)',
                                    transition: 'background 0.15s',
                                    whiteSpace: 'normal',
                                    wordBreak: 'break-word',
                                    lineHeight: '1.4'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                onMouseLeave={e => (e.currentTarget.style.background = value === o ? 'rgba(59,130,246,0.12)' : 'transparent')}
                            >{o}</div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

/* ─── Unavailability Modal (same as InstructorDashboard) ─── */
const UnavailabilityModal: React.FC<{
    cls: ClassItem; isOpen: boolean; onClose: () => void; onSuccess: () => void;
}> = ({ cls, isOpen, onClose, onSuccess }) => {
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
        setSubmitting(true); setError('');
        try {
            await createUnavailabilityRequest({
                classes: [cls], reason,
                topics_and_promises: topics,
                batch_pulse_persona: batchPulse,
                teaching_pace_style: teachingPace,
                suggested_replacement: suggestedReplacement,
                other_comments: otherComments,
            });
            resetForm(); onSuccess(); onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to submit request.');
        } finally { setSubmitting(false); }
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

/* ─── Main PastClasses Page ─── */
const PastClasses: React.FC = () => {
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [total, setTotal] = useState(0);
    const [limit, setLimit] = useState(10);
    const [loading, setLoading] = useState(true);

    // Confirmation popup state
    const [confirmClass, setConfirmClass] = useState<ClassItem | null>(null);
    // Unavailability modal state
    const [unavailClass, setUnavailClass] = useState<ClassItem | null>(null);
    // Success banner
    const [successMsg, setSuccessMsg] = useState('');

    const fetchPast = useCallback(async () => {
        try {
            const data = await getClasses('past', limit, 0);
            setClasses(data.classes);
            setTotal(data.total);
        } catch (err) {
            console.error('Failed to fetch past classes:', err);
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        fetchPast();
    }, [fetchPast]);

    const handleConfirmYes = () => {
        const cls = confirmClass;
        setConfirmClass(null);
        if (cls) setUnavailClass(cls);
    };

    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 4000);
        fetchPast();
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container">
                    <div className="spinner" />
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="action-bar">
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <h1 className="page-title">Past Classes</h1>
                    <p className="page-subtitle">{total} classes completed</p>
                </div>
                <Link to="/instructor/dashboard" className="btn btn-ghost">
                    Back to Dashboard
                </Link>
            </div>

            {successMsg && (
                <div style={{ padding: 'var(--space-md)', background: 'var(--success-bg)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-md)', color: 'var(--success)', marginBottom: 'var(--space-lg)', fontSize: '0.875rem' }}>
                    {successMsg}
                </div>
            )}

            {classes.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">—</div>
                    <p className="empty-state-text">No past classes found.</p>
                </div>
            ) : (
                <>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Batch</th>
                                    <th>Class Topic</th>
                                    <th>Date & Time</th>
                                    <th>Rating</th>
                                    <th style={{ width: '1%', whiteSpace: 'nowrap' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {classes.map((cls, i) => {
                                    const recent = !!(cls as any)['_recent_past'];
                                    return (
                                        <tr key={`${cls['sbat_group_id']}-${cls['class_date']}-${i}`}>
                                            <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                                                {cls['sb_names']}
                                            </td>
                                            <td>{cls['class_topic']}</td>
                                            <td>
                                                {cls['class_date']}
                                                <br />
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {cls['time_of_day']} IST
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 500, color: cls['class_rating'] ? 'var(--warning)' : 'var(--text-muted)' }}>
                                                {cls['class_rating'] ? `⭐ ${cls['class_rating']}` : '—'}
                                            </td>
                                            <td>
                                                {recent && (
                                                    <button
                                                        className="btn btn-ghost"
                                                        style={{ fontSize: '0.75rem', padding: '4px 10px', whiteSpace: 'nowrap', color: 'var(--danger)' }}
                                                        onClick={() => setConfirmClass(cls)}
                                                    >
                                                        Raise Unavailability
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {classes.length < total && (
                        <div style={{ textAlign: 'center', marginTop: 'var(--space-lg)' }}>
                            <button className="btn btn-secondary" onClick={() => setLimit(prev => prev + 10)}>
                                Load More
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Confirmation Popup */}
            <Modal isOpen={!!confirmClass} onClose={() => setConfirmClass(null)} title="Confirm Unavailability">
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)', lineHeight: 1.6 }}>
                    This class has already completed. Do you want to raise an unavailability request?
                </p>
                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={() => setConfirmClass(null)}>
                        No, I clicked by mistake
                    </button>
                    <button className="btn btn-primary" onClick={handleConfirmYes}>
                        Yes, raise a request
                    </button>
                </div>
            </Modal>

            {/* Unavailability Form Modal */}
            {unavailClass && (
                <UnavailabilityModal
                    cls={unavailClass}
                    isOpen={true}
                    onClose={() => setUnavailClass(null)}
                    onSuccess={() => showSuccess('Unavailability request submitted successfully!')}
                />
            )}
        </div>
    );
};

export default PastClasses;
