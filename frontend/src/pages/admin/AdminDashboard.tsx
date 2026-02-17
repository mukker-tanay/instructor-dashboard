import React, { useState, useEffect, useCallback } from 'react';
import { getAdminRequests, lockRequest, updateRequestStatus, getInstructorOptions } from '../../api/client';
import type { RequestItem, StatusUpdate } from '../../types';
import Modal from '../../components/Modal';

const AdminDashboard: React.FC = () => {
    const [requests, setRequests] = useState<RequestItem[]>([]);
    const [filter, setFilter] = useState<'Pending' | 'all'>('Pending');
    const [typeFilter, setTypeFilter] = useState<'all' | 'unavailability' | 'class_addition'>('all');
    const [loading, setLoading] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
    const [showModal, setShowModal] = useState(false);

    // Shared form state
    const [statusVal, setStatusVal] = useState<'Approved' | 'Rejected'>('Approved');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [lockError, setLockError] = useState('');

    // Unavailability-specific fields
    const [finalStatus, setFinalStatus] = useState('');
    const [replacementInstructor, setReplacementInstructor] = useState('');
    const [redFlagProof, setRedFlagProof] = useState('');
    const [instructorOptions, setInstructorOptions] = useState<string[]>([]);

    // Class addition-specific fields
    const [paymentStatus, setPaymentStatus] = useState('Sanctioned');
    const [redFlag, setRedFlag] = useState('No');
    const [redFlagReason, setRedFlagReason] = useState('');

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getAdminRequests(filter, typeFilter);
            setRequests(data.requests);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [filter, typeFilter]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const openApproval = async (r: RequestItem) => {
        setSelectedRequest(r);
        setError('');
        setLockError('');
        setStatusVal('Approved');

        // Reset unavailability fields
        setFinalStatus('');
        setReplacementInstructor('');
        setRedFlagProof('');

        // Reset class addition fields
        setPaymentStatus('Sanctioned');
        setRedFlag('No');
        setRedFlagReason('');

        // Fetch instructors for replacement dropdown if unavailability
        if (r.request_type === 'unavailability') {
            getInstructorOptions().then(d => setInstructorOptions(d.instructors)).catch(() => { });
        }

        const rid = String(r.request_id || r['Request ID'] || '');
        if (rid) {
            try {
                await lockRequest(rid);
            } catch (err: any) {
                if (err.response?.status === 409) {
                    setLockError(err.response.data.detail);
                }
            }
        }
        setShowModal(true);
    };

    const handleSubmitStatus = async () => {
        if (!selectedRequest) return;
        const rid = String(selectedRequest.request_id || selectedRequest['Request ID'] || '');
        if (!rid) { setError('No request ID found.'); return; }

        const isUnavail = selectedRequest.request_type === 'unavailability';

        // Class addition validations
        if (!isUnavail && statusVal === 'Approved' && redFlag === 'Yes' && !redFlagReason) {
            setError('Red flag reason is required.');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            const payload: StatusUpdate = {
                status: statusVal,
            };

            if (statusVal === 'Approved') {
                if (isUnavail) {
                    // Unavailability approval fields
                    payload.final_status = finalStatus || undefined;
                    payload.replacement_instructor = replacementInstructor || undefined;
                    payload.red_flag_reason = redFlagProof || undefined;
                } else {
                    // Class addition approval fields
                    payload.payment_status = paymentStatus as any;
                    payload.red_flag = redFlag as any;
                    payload.red_flag_reason = redFlag === 'Yes' ? redFlagReason : undefined;
                }
            }

            await updateRequestStatus(rid, payload);
            setShowModal(false);
            fetchRequests();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to update status.');
        } finally {
            setSubmitting(false);
        }
    };

    const getStatus = (r: RequestItem) => String(r.status || r.Status || 'Pending').trim();
    const getStatusBadge = (s: string) => {
        if (s.toLowerCase() === 'approved') return 'badge-approved';
        if (s.toLowerCase() === 'rejected') return 'badge-rejected';
        return 'badge-pending';
    };

    return (
        <div className="page-container">
            <div className="action-bar">
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <h1 className="page-title">Admin Dashboard</h1>
                    <p className="page-subtitle">{requests.length} request{requests.length !== 1 ? 's' : ''}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="tabs" style={{ margin: 0 }}>
                    <button className={`tab ${filter === 'Pending' ? 'active' : ''}`} onClick={() => setFilter('Pending')}>Pending</button>
                    <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
                </div>
                <div className="tabs" style={{ margin: 0 }}>
                    <button className={`tab ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => setTypeFilter('all')}>All Types</button>
                    <button className={`tab ${typeFilter === 'unavailability' ? 'active' : ''}`} onClick={() => setTypeFilter('unavailability')}>Unavailability</button>
                    <button className={`tab ${typeFilter === 'class_addition' ? 'active' : ''}`} onClick={() => setTypeFilter('class_addition')}>Class Addition</button>
                </div>
            </div>

            {loading ? (
                <div className="loading-container"><div className="spinner" /></div>
            ) : requests.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">—</div>
                    <p className="empty-state-text">No {filter === 'Pending' ? 'pending ' : ''}requests.</p>
                </div>
            ) : (
                requests.map((r, i) => {
                    const status = getStatus(r);
                    const isUnavail = r.request_type === 'unavailability';
                    const date = isUnavail
                        ? r['Original Date of Class (MM/DD/YYYY)']
                        : r['Date of Class (MM/DD/YYYY)'];
                    const time = isUnavail
                        ? r['Original Time of Class (HH:MM AM/PM) IST']
                        : r['Time of Class (HH:MM AM/PM) IST'];
                    const classType = String(r['Class Type (Regular/Optional)'] || r['Class Type'] || '');
                    const reason = isUnavail
                        ? String(r['Reason for Unavailability'] || '')
                        : String(r['Reason for Addition of Class'] || '');
                    const isLocked = !!(r.locked_by);

                    return (
                        <div key={i} className="card class-card" style={{ animationDelay: `${i * 30}ms` }}>
                            <div className="card-header">
                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
                                        {r['Class Title'] || 'Untitled'}
                                    </h3>
                                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                                        {r['Instructor Name']} ({r['Instructor Email']})
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <span className={`badge badge-${r.request_type}`}>
                                        {isUnavail ? 'Unavailability' : 'Addition'}
                                    </span>
                                    <span className={`badge ${getStatusBadge(status)}`}>{status}</span>
                                </div>
                            </div>
                            <div className="card-meta">
                                <span className="card-meta-item">
                                    <span className="card-meta-label">Batch:</span> {r['Batch Name']}
                                </span>
                                <span className="card-meta-item">
                                    <span className="card-meta-label">Date:</span> {date} {time}
                                </span>
                                <span className="card-meta-item">
                                    <span className="card-meta-label">Program:</span> {r['Program']}
                                </span>
                                {classType && (
                                    <span className="card-meta-item">
                                        <span className="card-meta-label">Type:</span> {classType}
                                    </span>
                                )}
                                {reason && (
                                    <span className="card-meta-item">
                                        <span className="card-meta-label">Reason:</span> {reason.slice(0, 100)}
                                    </span>
                                )}
                            </div>
                            {isLocked && (
                                <div className="lock-info" style={{ marginTop: '8px' }}>
                                    Currently handled by {String(r.locked_by)}
                                </div>
                            )}
                            {status === 'Pending' && (
                                <div style={{ marginTop: '12px' }}>
                                    <button className="btn btn-primary btn-sm" onClick={() => openApproval(r)}>
                                        Change Status
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })
            )}

            {/* Approval Modal */}
            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                title="Update Request Status"
            >
                {lockError && (
                    <div className="lock-info" style={{ marginBottom: '16px' }}>
                        {lockError}
                    </div>
                )}

                {selectedRequest && (
                    <>
                        <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem' }}>
                            <strong>{selectedRequest['Class Title']}</strong><br />
                            {selectedRequest['Instructor Name']} • {selectedRequest['Batch Name']}<br />
                            <span style={{ color: 'var(--text-muted)' }}>
                                {selectedRequest.request_type === 'unavailability' ? 'Unavailability' : 'Class Addition'} Request
                            </span>
                        </div>

                        {/* Decision */}
                        <div className="form-group">
                            <label className="form-label form-label-required">Decision</label>
                            <div className="tabs" style={{ marginBottom: 0 }}>
                                <button className={`tab ${statusVal === 'Approved' ? 'active' : ''}`} onClick={() => setStatusVal('Approved')}>Approve</button>
                                <button className={`tab ${statusVal === 'Rejected' ? 'active' : ''}`} onClick={() => setStatusVal('Rejected')} style={statusVal === 'Rejected' ? { background: 'var(--danger)', color: 'white' } : {}}>Reject</button>
                            </div>
                        </div>

                        {/* ── Unavailability-specific fields (on Approve) ── */}
                        {statusVal === 'Approved' && selectedRequest.request_type === 'unavailability' && (
                            <>
                                <div className="form-group">
                                    <label className="form-label">Final Status</label>
                                    <select className="form-select" value={finalStatus} onChange={e => {
                                        setFinalStatus(e.target.value);
                                        if (e.target.value !== 'Instructor change') setReplacementInstructor('');
                                    }}>
                                        <option value="">Select...</option>
                                        <option value="Instructor change">Instructor change</option>
                                        <option value="Reschedule to a class day">Reschedule to a class day</option>
                                        <option value="Reschedule to a non-class day">Reschedule to a non-class day</option>
                                    </select>
                                </div>

                                {finalStatus === 'Instructor change' && (
                                    <div className="form-group">
                                        <label className="form-label">Replacement Instructor</label>
                                        <select className="form-select" value={replacementInstructor} onChange={e => setReplacementInstructor(e.target.value)}>
                                            <option value="">Select instructor...</option>
                                            {instructorOptions.map(name => (
                                                <option key={name} value={name}>{name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label">Red Flag Proof (admin bookkeeping)</label>
                                    <textarea
                                        className="form-textarea"
                                        value={redFlagProof}
                                        onChange={e => setRedFlagProof(e.target.value)}
                                        placeholder="If request has to be considered for red flag exception, document proof here..."
                                        rows={3}
                                    />
                                </div>
                            </>
                        )}

                        {/* ── Class Addition-specific fields (on Approve) ── */}
                        {statusVal === 'Approved' && selectedRequest.request_type === 'class_addition' && (
                            <>
                                <div className="form-group">
                                    <label className="form-label">Payment Status</label>
                                    <select className="form-select" value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                                        <option value="Sanctioned">Sanctioned</option>
                                        <option value="Non-sanctioned">Non-sanctioned</option>
                                        <option value="Unpaid">Unpaid</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Red Flag Exemption</label>
                                    <select className="form-select" value={redFlag} onChange={e => setRedFlag(e.target.value)}>
                                        <option value="No">No</option>
                                        <option value="Yes">Yes</option>
                                    </select>
                                </div>

                                {redFlag === 'Yes' && (
                                    <div className="form-group">
                                        <label className="form-label form-label-required">Red Flag Proof</label>
                                        <textarea
                                            className="form-textarea"
                                            value={redFlagReason}
                                            onChange={e => setRedFlagReason(e.target.value)}
                                            placeholder="Document proof for red flag exception..."
                                            rows={3}
                                        />
                                    </div>
                                )}
                            </>
                        )}

                        {error && (
                            <div style={{ marginTop: '8px', padding: '8px 12px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '0.8125rem' }}>
                                {error}
                            </div>
                        )}

                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button
                                className={`btn ${statusVal === 'Approved' ? 'btn-success' : 'btn-danger'}`}
                                onClick={handleSubmitStatus}
                                disabled={submitting || !!lockError}
                            >
                                {submitting ? 'Saving...' : `${statusVal === 'Approved' ? 'Approve' : 'Reject'}`}
                            </button>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
};

export default AdminDashboard;
