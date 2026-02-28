import React, { useState, useEffect, useCallback } from 'react';
import { getClasses, createUnavailabilityRequest } from '../../api/client';
import type { ClassItem } from '../../types';
import Modal from '../../components/Modal';

const UnavailabilityRequest: React.FC = () => {
    const [upcoming, setUpcoming] = useState<ClassItem[]>([]);
    const [pastRecent, setPastRecent] = useState<ClassItem[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [step, setStep] = useState(1);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    // Filters
    const [dateFilter, setDateFilter] = useState('');
    const [moduleFilter, setModuleFilter] = useState('');
    const [batchFilter, setBatchFilter] = useState('');

    // Form fields
    const [reason, setReason] = useState('');
    const [topics, setTopics] = useState('');
    const [batchPulse, setBatchPulse] = useState('');
    const [teachingPace, setTeachingPace] = useState('');
    const [suggestedReplacement, setSuggestedReplacement] = useState('');
    const [otherComments, setOtherComments] = useState('');

    const fetchClasses = useCallback(async () => {
        try {
            const [upData, pastData] = await Promise.all([
                getClasses('upcoming', 100, 0),
                getClasses('past', 3, 0),
            ]);
            setUpcoming(upData.classes);
            setPastRecent(pastData.classes);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchClasses();
    }, [fetchClasses]);

    const allClasses = [...upcoming, ...pastRecent];

    // Extract unique filter values
    const modules = [...new Set(allClasses.map(c => c['module_name']).filter(Boolean))];
    const batches = [...new Set(allClasses.map(c => c['sb_names']).filter(Boolean))];

    // Apply filters
    const filtered = allClasses.filter(c => {
        if (dateFilter && c['class_date'] !== dateFilter) return false;
        if (moduleFilter && c['module_name'] !== moduleFilter) return false;
        if (batchFilter && c['sb_names'] !== batchFilter) return false;
        return true;
    });

    const toggleSelect = (index: number) => {
        const newSet = new Set(selected);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
        setSelected(newSet);
    };

    const selectedClasses = Array.from(selected).map(i => filtered[i]).filter(Boolean);

    const handleSubmit = async () => {
        if (!reason || !topics || !batchPulse || !teachingPace) {
            setError('Please fill all mandatory fields.');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await createUnavailabilityRequest({
                classes: selectedClasses,
                reason,
                topics_and_promises: topics,
                batch_pulse_persona: batchPulse,
                teaching_pace_style: teachingPace,
                suggested_replacement: suggestedReplacement,
                other_comments: otherComments,
            });
            setSuccess('Unavailability request submitted successfully!');
            setShowModal(false);
            setSelected(new Set());
            resetForm();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to submit request.');
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setReason('');
        setTopics('');
        setBatchPulse('');
        setTeachingPace('');
        setSuggestedReplacement('');
        setOtherComments('');
        setStep(1);
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
            <div className="page-header">
                <h1 className="page-title">Raise Unavailability</h1>
                <p className="page-subtitle">Select classes you'll be unavailable for</p>
            </div>

            {success && (
                <div style={{
                    padding: 'var(--space-md)',
                    background: 'var(--success-bg)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--success)',
                    marginBottom: 'var(--space-lg)',
                    fontSize: '0.875rem',
                }}>
                    {success}
                </div>
            )}
            {error && !showModal && (
                <div style={{
                    padding: 'var(--space-md)',
                    background: 'var(--danger-bg)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--danger)',
                    marginBottom: 'var(--space-lg)',
                    fontSize: '0.875rem',
                }}>
                    {error}
                </div>
            )}

            {/* Filters */}
            <div className="filters-bar">
                <input
                    type="date"
                    className="filter-select"
                    value={dateFilter}
                    onChange={e => setDateFilter(e.target.value)}
                    placeholder="Filter by date"
                />
                <select className="filter-select" value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}>
                    <option value="">All Modules</option>
                    {modules.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className="filter-select" value={batchFilter} onChange={e => setBatchFilter(e.target.value)}>
                    <option value="">All Batches</option>
                    {batches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                {(dateFilter || moduleFilter || batchFilter) && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setDateFilter(''); setModuleFilter(''); setBatchFilter(''); }}>
                        ✕ Clear
                    </button>
                )}
            </div>

            {/* Class selection */}
            {filtered.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">—</div>
                    <p className="empty-state-text">No classes match your filters.</p>
                </div>
            ) : (
                <>
                    {filtered.map((cls, i) => (
                        <div key={i} className="checkbox-row" onClick={() => toggleSelect(i)}>
                            <input type="checkbox" checked={selected.has(i)} readOnly />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500 }}>{cls['class_topic']}</div>
                                <div className="card-meta" style={{ marginTop: '4px' }}>
                                    <span className="card-meta-item">
                                        <span className="card-meta-label">Batch:</span> {cls['sb_names']}
                                    </span>
                                    <span className="card-meta-item">
                                        <span className="card-meta-label">Date:</span> {cls['class_date']}
                                    </span>
                                    <span className="card-meta-item">
                                        <span className="card-meta-label">Time:</span> {cls['time_of_day']}
                                    </span>
                                </div>
                            </div>
                            <span className={`badge badge-${cls['Class Type']?.toLowerCase() === 'optional' ? 'optional' : 'regular'}`}>
                                {cls['Class Type'] || 'Regular'}
                            </span>
                        </div>
                    ))}
                </>
            )}

            {selected.size > 0 && (
                <div style={{ position: 'sticky', bottom: '24px', textAlign: 'center', marginTop: 'var(--space-lg)' }}>
                    <button className="btn btn-primary btn-lg" onClick={() => { setShowModal(true); setStep(1); }}>
                        Continue with {selected.size} class{selected.size > 1 ? 'es' : ''}
                    </button>
                </div>
            )}

            {/* Multi-step Modal */}
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Unavailability Request">
                <div className="steps">
                    <div className={`step ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`}>
                        <span className="step-number">1</span>
                        Confirm Classes
                    </div>
                    <div className={`step ${step === 2 ? 'active' : ''}`}>
                        <span className="step-number">2</span>
                        Details
                    </div>
                </div>

                {step === 1 && (
                    <>
                        <div className="selected-summary">
                            <div className="selected-summary-title">Selected Classes ({selectedClasses.length})</div>
                            {selectedClasses.map((cls, i) => (
                                <span key={i} className="selected-chip">
                                    {cls['class_topic']} — {cls['class_date']}
                                </span>
                            ))}
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={() => setStep(2)}>Next</button>
                        </div>
                    </>
                )}

                {step === 2 && (
                    <>
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
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
                            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                                {submitting ? 'Submitting...' : 'Submit Request'}
                            </button>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
};

export default UnavailabilityRequest;
