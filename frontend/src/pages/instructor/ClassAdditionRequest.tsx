import React, { useState } from 'react';
import { createClassAdditionRequest } from '../../api/client';
import Modal from '../../components/Modal';

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
        contest_impact: 'Not Aware',
        assignment_requirement: 'None',
        reason: '',
        other_comments: '',
        approver: '',
    });
    const [showConfirm, setShowConfirm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    const update = (key: string, value: string) => {
        setForm(prev => ({ ...prev, [key]: value }));
    };

    const requiredFields = ['program', 'batch_name', 'class_title', 'module_name', 'date_of_class', 'time_of_class', 'reason', 'approver'];

    const validate = () => {
        for (const f of requiredFields) {
            if (!(form as any)[f]) {
                setError(`Please fill the "${f.replace(/_/g, ' ')}" field.`);
                return false;
            }
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
            await createClassAdditionRequest(form);
            setSuccess('Class addition request submitted successfully!');
            setShowConfirm(false);
            setForm({
                program: '', batch_name: '', class_title: '', module_name: '',
                date_of_class: '', time_of_class: '', class_type: 'Regular',
                shift_other_classes: 'No', contest_impact: 'Not Aware',
                assignment_requirement: 'None', reason: '', other_comments: '', approver: '',
            });
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
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label form-label-required">Program</label>
                        <input className="form-input" value={form.program} onChange={e => update('program', e.target.value)} placeholder="e.g. DSML, FullStack" />
                    </div>
                    <div className="form-group">
                        <label className="form-label form-label-required">Batch Name</label>
                        <input className="form-input" value={form.batch_name} onChange={e => update('batch_name', e.target.value)} placeholder="Batch name" />
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label form-label-required">Class Title</label>
                        <input className="form-input" value={form.class_title} onChange={e => update('class_title', e.target.value)} placeholder="Class title" />
                    </div>
                    <div className="form-group">
                        <label className="form-label form-label-required">Module Name</label>
                        <input className="form-input" value={form.module_name} onChange={e => update('module_name', e.target.value)} placeholder="Module" />
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label form-label-required">Date of Class</label>
                        <input className="form-input" type="date" value={form.date_of_class} onChange={e => update('date_of_class', e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label className="form-label form-label-required">Time (IST)</label>
                        <input className="form-input" type="time" value={form.time_of_class} onChange={e => update('time_of_class', e.target.value)} />
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Class Type</label>
                        <select className="form-select" value={form.class_type} onChange={e => update('class_type', e.target.value)}>
                            <option value="Regular">Regular</option>
                            <option value="Optional">Optional</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Shift Other Classes by 1?</label>
                        <select className="form-select" value={form.shift_other_classes} onChange={e => update('shift_other_classes', e.target.value)}>
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                        </select>
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Will this affect the live contest date?</label>
                        <select className="form-select" value={form.contest_impact} onChange={e => update('contest_impact', e.target.value)}>
                            <option value="Not Aware">Not Aware</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Assignment & Homework Requirement</label>
                        <select className="form-select" value={form.assignment_requirement} onChange={e => update('assignment_requirement', e.target.value)}>
                            <option value="None">None</option>
                            <option value="Assignment">Assignment</option>
                            <option value="Homework">Homework</option>
                            <option value="Both">Both</option>
                        </select>
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label form-label-required">Reason for Addition</label>
                    <textarea className="form-textarea" value={form.reason} onChange={e => update('reason', e.target.value)} placeholder="Explain why this class needs to be added" />
                </div>

                <div className="form-group">
                    <label className="form-label">Other Comments</label>
                    <textarea className="form-textarea" value={form.other_comments} onChange={e => update('other_comments', e.target.value)} placeholder="Optional" />
                </div>

                <div className="form-group">
                    <label className="form-label form-label-required">Select Approver</label>
                    <input className="form-input" value={form.approver} onChange={e => update('approver', e.target.value)} placeholder="Approver name or email" />
                </div>

                <div style={{ marginTop: 'var(--space-lg)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary btn-lg" onClick={handleContinue}>
                        Review & Submit
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
                            <span style={{ color: 'var(--text-muted)' }}>{k.replace(/_/g, ' ')}: </span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
                        </div>
                    ))}
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
