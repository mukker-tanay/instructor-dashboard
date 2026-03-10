import React, { useState, useEffect, useCallback } from 'react';
import { getAdminRequests, updateRequestStatus, getInstructorOptions, deleteRequests, getAllowedInstructors, addAllowedInstructor, removeAllowedInstructor, updateAllowedInstructorAlias } from '../../api/client';
import type { RequestItem, StatusUpdate } from '../../types';
import Modal from '../../components/Modal';

const AdminDashboard: React.FC = () => {
    const [requests, setRequests] = useState<RequestItem[]>([]);
    const [filter, setFilter] = useState<'Pending' | 'all'>('Pending');
    const [typeFilter, setTypeFilter] = useState<'all' | 'unavailability' | 'class_addition'>('all');
    const [loading, setLoading] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
    const [showModal, setShowModal] = useState(false);

    // Top-level navigation
    const [activeView, setActiveView] = useState<'requests' | 'access'>('requests');

    // Access Control state
    const [instructors, setInstructors] = useState<{ email: string; added_by?: string; added_at?: string; alias_email?: string }[]>([]);
    const [newInstructorEmail, setNewInstructorEmail] = useState('');
    const [instructorSearch, setInstructorSearch] = useState('');
    const [accessLoading, setAccessLoading] = useState(false);

    // Alias Modal State
    const [aliasModalEmail, setAliasModalEmail] = useState<string | null>(null);
    const [aliasModalValue, setAliasModalValue] = useState('');

    // Selection state for bulk delete
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);

    // Shared form state
    const [statusVal, setStatusVal] = useState<'Approved' | 'Rejected'>('Approved');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Unavailability-specific fields
    const [finalStatus, setFinalStatus] = useState('');
    const [replacementInstructor, setReplacementInstructor] = useState('');
    const [redFlagProof, setRedFlagProof] = useState('');
    const [instructorOptions, setInstructorOptions] = useState<string[]>([]);

    // Class addition-specific fields
    const [paymentStatus, setPaymentStatus] = useState('Sanctioned');
    const [redFlag, setRedFlag] = useState('No');
    const [redFlagReason, setRedFlagReason] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getAdminRequests(filter, typeFilter);
            setRequests(data.requests);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setSelectedIds(new Set()); // Clear selection on refresh
        }
    }, [filter, typeFilter]);

    const fetchInstructors = useCallback(async () => {
        setAccessLoading(true);
        try {
            const data = await getAllowedInstructors();
            setInstructors(data.instructors);
        } catch (err) {
            console.error(err);
        } finally {
            setAccessLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeView === 'requests') {
            fetchRequests();
        } else {
            fetchInstructors();
        }
    }, [activeView, fetchRequests, fetchInstructors]);

    // --- Access Control Handlers ---
    const handleAddInstructor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newInstructorEmail.trim()) return;
        try {
            // Split by comma or space, clean up, and remove empty strings
            const emails = newInstructorEmail
                .split(/[\s,]+/)
                .map(e => e.trim())
                .filter(Boolean);

            if (emails.length === 0) return;

            await addAllowedInstructor(emails);
            setNewInstructorEmail('');
            fetchInstructors();
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Failed to add instructor(s)');
        }
    };

    const handleRemoveInstructor = async (email: string) => {
        if (!window.confirm(`Are you sure you want to revoke dashboard access for ${email}?`)) return;
        try {
            await removeAllowedInstructor(email);
            fetchInstructors();
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Failed to remove instructor');
        }
    };

    const handleUpdateAlias = async () => {
        if (!aliasModalEmail) return;
        try {
            setSubmitting(true);
            await updateAllowedInstructorAlias(aliasModalEmail, aliasModalValue);
            setAliasModalEmail(null);
            setAliasModalValue('');
            fetchInstructors();
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Failed to update alias');
        } finally {
            setSubmitting(false);
        }
    };

    const filteredInstructors = instructors.filter(i =>
        i.email.toLowerCase().includes(instructorSearch.toLowerCase()) ||
        (i.alias_email && i.alias_email.toLowerCase().includes(instructorSearch.toLowerCase()))
    );

    // --- Selection helpers ---
    const getRequestId = (r: RequestItem): string =>
        String(r.id || r.request_id || r['Request ID'] || '');

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === requests.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(requests.map(getRequestId)));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        const confirmed = window.confirm(
            `Are you sure you want to permanently delete ${selectedIds.size} request(s)? This will remove them from both the database and Google Sheets.`
        );
        if (!confirmed) return;

        setDeleting(true);
        try {
            await deleteRequests(Array.from(selectedIds));
            fetchRequests();
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Failed to delete requests.');
        } finally {
            setDeleting(false);
        }
    };

    // --- Approval modal ---
    const openApproval = async (r: RequestItem) => {
        setSelectedRequest(r);
        setError('');

        const currentStatus = String(r.status || r.Status || 'Pending').trim();
        setStatusVal(currentStatus === 'Approved' ? 'Approved' : 'Approved');

        if (currentStatus === 'Approved' && r.request_type === 'class_addition') {
            const payment = String(r['Class Added on Class Day/Non-Class Day Sanctioned/Non-Sanctioned'] || r['Sanctioned/Non-Sanctioned'] || 'Sanctioned');
            setPaymentStatus(payment);
            const rf = String(r['Red Flag'] || 'No');
            setRedFlag(rf);
        } else {
            setPaymentStatus('Sanctioned');
            setRedFlag('No');
            setRedFlagReason('');
            setRejectionReason('');
        }

        setFinalStatus('');
        setReplacementInstructor('');
        setRedFlagProof('');

        if (r.request_type === 'unavailability') {
            getInstructorOptions().then(d => setInstructorOptions(d.instructors)).catch(() => { });
        }

        setShowModal(true);
    };

    const handleSubmitStatus = async () => {
        if (!selectedRequest) return;
        const rid = String(selectedRequest.request_id || selectedRequest['Request ID'] || '');
        if (!rid) { setError('No request ID found.'); return; }

        const isUnavail = selectedRequest.request_type === 'unavailability';

        if (!isUnavail && statusVal === 'Approved' && redFlag === 'Yes' && !redFlagReason) {
            setError('Red flag reason is required.');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            const payload: StatusUpdate = { status: statusVal };

            if (statusVal === 'Approved') {
                if (isUnavail) {
                    payload.final_status = finalStatus || undefined;
                    payload.replacement_instructor = replacementInstructor || undefined;
                    payload.red_flag_reason = redFlagProof || undefined;
                } else {
                    payload.payment_status = paymentStatus as any;
                    payload.red_flag = redFlag as any;
                    payload.red_flag_reason = redFlag === 'Yes' ? redFlagReason : undefined;
                }
            }

            if (statusVal === 'Rejected' && rejectionReason) {
                payload.rejection_reason = rejectionReason;
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
            <div className="action-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <h1 className="page-title">Admin Dashboard</h1>
                    <p className="page-subtitle">
                        {activeView === 'requests'
                            ? `${requests.length} request${requests.length !== 1 ? 's' : ''}`
                            : 'Manage Instructor Access'}
                    </p>
                </div>
                <div className="tabs" style={{ margin: 0 }}>
                    <button className={`tab ${activeView === 'requests' ? 'active' : ''}`} onClick={() => setActiveView('requests')}>Requests</button>
                    <button className={`tab ${activeView === 'access' ? 'active' : ''}`} onClick={() => setActiveView('access')}>Access Control</button>
                </div>
            </div>

            {activeView === 'requests' ? (
                <>
                    {/* Filters + Bulk Actions */}
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

                    {/* Bulk action bar — visible when requests exist */}
                    {!loading && requests.length > 0 && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '10px 16px',
                            marginBottom: '12px',
                            background: selectedIds.size > 0 ? 'var(--danger-bg, #fff1f0)' : 'var(--surface-elevated, #f8f9fa)',
                            borderRadius: 'var(--radius-md, 8px)',
                            transition: 'background 0.2s ease',
                        }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
                                <input
                                    type="checkbox"
                                    checked={selectedIds.size === requests.length && requests.length > 0}
                                    onChange={toggleSelectAll}
                                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary, #4f46e5)', cursor: 'pointer' }}
                                />
                                Select All
                            </label>
                            {selectedIds.size > 0 && (
                                <>
                                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                                        {selectedIds.size} selected
                                    </span>
                                    <button
                                        className="btn btn-danger btn-sm"
                                        onClick={handleBulkDelete}
                                        disabled={deleting}
                                        style={{ marginLeft: 'auto' }}
                                    >
                                        {deleting ? 'Deleting...' : `Delete ${selectedIds.size} Request${selectedIds.size > 1 ? 's' : ''}`}
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {loading ? (
                        <div className="loading-container"><div className="spinner" /></div>
                    ) : requests.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">—</div>
                            <p className="empty-state-text">No {filter === 'Pending' ? 'pending ' : ''}requests.</p>
                        </div>
                    ) : (
                        requests.map((r, i) => {
                            const rid = getRequestId(r);
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

                            return (
                                <div
                                    key={rid || i}
                                    className="card class-card"
                                    style={{
                                        animationDelay: `${i * 30}ms`,
                                        borderLeft: selectedIds.has(rid) ? '3px solid var(--danger, #ef4444)' : '3px solid transparent',
                                        transition: 'border-left 0.15s ease',
                                    }}
                                >
                                    <div className="card-header">
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(rid)}
                                                onChange={() => toggleSelect(rid)}
                                                style={{
                                                    width: '16px',
                                                    height: '16px',
                                                    marginTop: '3px',
                                                    accentColor: 'var(--primary, #4f46e5)',
                                                    cursor: 'pointer',
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <div>
                                                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
                                                    {r['Class Title'] || 'Untitled'}
                                                </h3>
                                                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                                                    {r['Instructor Name']} ({r['Instructor Email']})
                                                </span>
                                            </div>
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
                                    {(status === 'Pending' || (status === 'Approved' && !isUnavail)) && (
                                        <div style={{ marginTop: '12px' }}>
                                            <button className="btn btn-primary btn-sm" onClick={() => openApproval(r)}>
                                                {status === 'Pending' ? 'Change Status' : 'Edit'}
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

                                {/* Rejection reason */}
                                {statusVal === 'Rejected' && (
                                    <div className="form-group">
                                        <label className="form-label">Reason for Rejection</label>
                                        <textarea
                                            className="form-textarea"
                                            value={rejectionReason}
                                            onChange={e => setRejectionReason(e.target.value)}
                                            placeholder="Enter reason for rejecting this request..."
                                            rows={3}
                                        />
                                    </div>
                                )}

                                {/* Unavailability-specific fields (on Approve) */}
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

                                {/* Class Addition-specific fields (on Approve) */}
                                {statusVal === 'Approved' && selectedRequest.request_type === 'class_addition' && (
                                    <>
                                        <div className="form-group">
                                            <label className="form-label">Payment Status</label>
                                            <select className="form-select" value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                                                <option value="Sanctioned">Sanctioned</option>
                                                <option value="Non-sanctioned">Non-sanctioned</option>
                                                <option value="Unpaid">Unpaid</option>
                                                <option value="To be Audited">To be Audited</option>
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
                                        disabled={submitting}
                                    >
                                        {submitting ? 'Saving...' : `${statusVal === 'Approved' ? 'Approve' : 'Reject'}`}
                                    </button>
                                </div>
                            </>
                        )}
                    </Modal>
                </>
            ) : (
                /* --- Access Control View --- */
                <div style={{ marginTop: '20px' }}>
                    <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>Grant Instructor Access</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '16px' }}>
                            Only instructors added to this list can log in to the dashboard. Admins always have access.
                        </p>
                        <form onSubmit={handleAddInstructor} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="name1@scaler.com, name2@scaler.com..."
                                value={newInstructorEmail}
                                onChange={e => setNewInstructorEmail(e.target.value)}
                                style={{ flex: 1, maxWidth: '400px' }}
                                required
                            />
                            <button type="submit" className="btn btn-primary">
                                Give Access
                            </button>
                        </form>
                    </div>

                    <div className="card">
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Allowed Instructors ({filteredInstructors.length})</h3>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Search emails..."
                                value={instructorSearch}
                                onChange={e => setInstructorSearch(e.target.value)}
                                style={{ width: '250px', padding: '6px 12px', fontSize: '0.875rem' }}
                            />
                        </div>
                        {accessLoading ? (
                            <div className="loading-container"><div className="spinner" /></div>
                        ) : instructors.length === 0 ? (
                            <div className="empty-state" style={{ padding: '40px' }}>
                                <p className="empty-state-text">No instructors have been explicitly allowed yet.</p>
                            </div>
                        ) : filteredInstructors.length === 0 ? (
                            <div className="empty-state" style={{ padding: '40px' }}>
                                <p className="empty-state-text">No instructors matching "{instructorSearch}".</p>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                                <thead>
                                    <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '12px 24px', fontWeight: 500, color: 'var(--text-muted)' }}>Email</th>
                                        <th style={{ padding: '12px 24px', fontWeight: 500, color: 'var(--text-muted)' }}>Alias / Primary Email</th>
                                        <th style={{ padding: '12px 24px', fontWeight: 500, color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredInstructors.map(inst => (
                                        <tr key={inst.email} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '16px 24px', fontWeight: 500 }}>
                                                {inst.email}
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    Added {inst.added_at ? new Date(inst.added_at).toLocaleDateString() : '—'} by {inst.added_by || 'System'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px 24px', color: 'var(--text-muted)' }}>
                                                {inst.alias_email ? (
                                                    <span style={{ fontWeight: 500, color: 'var(--text)' }}>{inst.alias_email}</span>
                                                ) : (
                                                    <span style={{ fontStyle: 'italic', opacity: 0.7 }}>None</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => {
                                                            setAliasModalEmail(inst.email);
                                                            setAliasModalValue(inst.alias_email || '');
                                                        }}
                                                        style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                                                    >
                                                        {inst.alias_email ? 'Edit Alias' : 'Add Alias'}
                                                    </button>
                                                    <button
                                                        className="btn btn-danger btn-sm"
                                                        onClick={() => handleRemoveInstructor(inst.email)}
                                                        style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                                                    >
                                                        Revoke
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Alias Modal */}
            <Modal
                isOpen={!!aliasModalEmail}
                onClose={() => setAliasModalEmail(null)}
                title="Update Email Alias"
            >
                {aliasModalEmail && (
                    <>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                            If <strong>{aliasModalEmail}</strong> has classes assigned to a different primary email, enter it here. This will automatically redirect their dashboard to show the primary email's classes.
                        </p>
                        <div className="form-group">
                            <label className="form-label">Primary Email (Alias Target)</label>
                            <input
                                type="email"
                                className="form-input"
                                placeholder="primary.email@scaler.com"
                                value={aliasModalValue}
                                onChange={e => setAliasModalValue(e.target.value)}
                            />
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                                Leave blank to clear an existing alias.
                            </p>
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setAliasModalEmail(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleUpdateAlias} disabled={submitting}>
                                {submitting ? 'Saving...' : 'Save Alias'}
                            </button>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
};

export default AdminDashboard;
