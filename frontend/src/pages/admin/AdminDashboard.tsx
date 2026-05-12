import React, { useState, useEffect, useCallback } from 'react';
import { getAdminRequests, updateRequestStatus, getInstructorOptions, deleteRequests, getAllowedInstructors, addAllowedInstructor, removeAllowedInstructor, updateAllowedInstructorAlias, getLocoUsers, addLocoUser, removeLocoUser } from '../../api/client';
import type { RequestItem, StatusUpdate } from '../../types';
import Modal from '../../components/Modal';
import AdminManualUnavailability from './AdminManualUnavailability';

const AdminDashboard: React.FC = () => {
    const [requests, setRequests] = useState<RequestItem[]>([]);
    const [filter, setFilter] = useState<'Pending' | 'all'>('Pending');
    const [typeFilter, setTypeFilter] = useState<'all' | 'unavailability' | 'class_addition'>('all');
    const [loading, setLoading] = useState(true);
    const [requestSearch, setRequestSearch] = useState('');
    const [startDateFilter, setStartDateFilter] = useState('');
    const [endDateFilter, setEndDateFilter] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
    const [showModal, setShowModal] = useState(false);

    // Top-level navigation
    const [activeView, setActiveView] = useState<'requests' | 'access' | 'loco' | 'manual'>('requests');

    // Access Control state
    const [instructors, setInstructors] = useState<{ email: string; added_by?: string; added_at?: string; alias_email?: string }[]>([]);
    const [newInstructorEmail, setNewInstructorEmail] = useState('');
    const [instructorSearch, setInstructorSearch] = useState('');
    const [accessLoading, setAccessLoading] = useState(false);

    // Loco Control state
    const [locoUsers, setLocoUsers] = useState<{ email: string }[]>([]);
    const [newLocoEmail, setNewLocoEmail] = useState('');
    const [locoSearch, setLocoSearch] = useState('');
    const [locoLoading, setLocoLoading] = useState(false);

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
    const [instructorOptions, setInstructorOptions] = useState<{ name: string, email: string }[]>([]);
    const [customInstructor, setCustomInstructor] = useState('');

    // Class addition-specific fields
    const [paymentStatus, setPaymentStatus] = useState('Sanctioned');
    const [classAddedOnDay, setClassAddedOnDay] = useState('');
    const [redFlag, setRedFlag] = useState('No');
    const [redFlagReason, setRedFlagReason] = useState('');
    const [paymentFilter, setPaymentFilter] = useState(false);
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

    const displayedRequests = requests.filter(r => {
        // 1. Payment Filter
        if (paymentFilter) {
            const isApproved = String(r.status || r.Status || '').trim() === 'Approved';
            const isAddition = r.request_type === 'class_addition';
            const needsAudit = ['Pending', 'To be Audited'].includes(String(r.payment_status || '').trim());
            if (!isAddition || !isApproved || !needsAudit) return false;
        }

        // 2. Instructor Search Filter
        if (requestSearch) {
            const query = requestSearch.toLowerCase();
            const name = String(r['Instructor Name'] || '').toLowerCase();
            const email = String(r['Instructor Email'] || '').toLowerCase();
            if (!name.includes(query) && !email.includes(query)) return false;
        }

        // 3. Date Range Filter
        if (startDateFilter || endDateFilter) {
            const classDateStr = r.request_type === 'unavailability' 
                ? r['Original Date of Class (MM/DD/YYYY)'] || r['original_date_of_class'] || r['date_of_class']
                : r['Date of Class (MM/DD/YYYY)'] || r['date_of_class'];
            
            if (!classDateStr) return false;

            // Robust Normalization to YYYY-MM-DD
            let normalized = '';
            const s = String(classDateStr).trim();
            
            // Try YYYY-MM-DD or YYYY/MM/DD
            let m = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
            if (m) {
                normalized = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
            } else {
                // Try DD/MM/YYYY or MM/DD/YYYY
                m = s.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{2,4})/);
                if (m) {
                    let p1 = parseInt(m[1]);
                    let p2 = parseInt(m[2]);
                    let year = m[3];
                    if (year.length === 2) year = `20${year}`;

                    // If p1 > 12, it MUST be DD/MM/YYYY
                    // If p2 > 12, it MUST be MM/DD/YYYY
                    // Default to DD/MM/YYYY for India if ambiguous
                    if (p1 > 12) {
                        normalized = `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
                    } else if (p2 > 12) {
                        normalized = `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
                    } else {
                        normalized = `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
                    }
                } else {
                    // Fallback to JS Date parsing for strings like "12 May 2026"
                    const d = new Date(s);
                    if (!isNaN(d.getTime())) {
                        normalized = d.toISOString().split('T')[0];
                    }
                }
            }

            if (normalized) {
                if (startDateFilter && normalized < startDateFilter) return false;
                if (endDateFilter && normalized > endDateFilter) return false;
            } else {
                // If we can't parse it at all, don't hide it unless both filters are set?
                // Actually, let's just skip filtering for unparseable dates to be safe
                // but for now let's try to be strict to see if it works.
                return false; 
            }
        }

        return true;
    });

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

    const fetchLocoUsers = useCallback(async () => {
        setLocoLoading(true);
        try {
            const data = await getLocoUsers();
            setLocoUsers(data.loco_users);
        } catch (err) {
            console.error(err);
        } finally {
            setLocoLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeView === 'requests') {
            fetchRequests();
        } else if (activeView === 'access') {
            fetchInstructors();
        } else if (activeView === 'loco') {
            fetchLocoUsers();
        }
    }, [activeView, fetchRequests, fetchInstructors, fetchLocoUsers]);

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

    // --- Loco Handlers ---
    const handleAddLoco = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLocoEmail.trim()) return;
        try {
            const emails = newLocoEmail.split(/[\s,]+/).map(em => em.trim()).filter(Boolean);
            if (emails.length === 0) return;
            for (const em of emails) {
                await addLocoUser(em);
            }
            setNewLocoEmail('');
            fetchLocoUsers();
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Failed to add loco user(s)');
        }
    };

    const handleRemoveLoco = async (email: string) => {
        if (!window.confirm(`Are you sure you want to revoke Loco dashboard access for ${email}?`)) return;
        try {
            await removeLocoUser(email);
            fetchLocoUsers();
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Failed to remove loco user');
        }
    };

    const filteredLocoUsers = locoUsers.filter(u =>
        u.email.toLowerCase().includes(locoSearch.toLowerCase())
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
            setClassAddedOnDay('');
            setRedFlag('No');
            setRedFlagReason('');
            setRejectionReason('');
        }

        setFinalStatus('');
        setReplacementInstructor('');
        setCustomInstructor('');
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

        if (!isUnavail && statusVal === 'Approved' && redFlag === 'Exempted' && !redFlagReason) {
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
                    payload.replacement_instructor = replacementInstructor === '__others__'
                        ? customInstructor || undefined
                        : replacementInstructor || undefined;
                    payload.red_flag_reason = redFlagProof || undefined;
                } else {
                    payload.payment_status = paymentStatus as any;
                    payload.class_added_on_class_day = classAddedOnDay || undefined;
                    payload.red_flag = redFlag as any;
                    payload.red_flag_reason = redFlag === 'Exempted' ? redFlagReason : undefined;
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
            <div className="action-bar" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <h1 className="page-title">Admin Dashboard</h1>
                    <p className="page-subtitle">
                        {activeView === 'requests'
                            ? `${requests.length} request${requests.length !== 1 ? 's' : ''}`
                            : 'Manage Instructor Access'}
                    </p>
                </div>
                <div className="tabs" style={{ margin: 0, flexShrink: 0 }}>
                    <button className={`tab ${activeView === 'requests' ? 'active' : ''}`} onClick={() => setActiveView('requests')}>Requests</button>
                    <button className={`tab ${activeView === 'access' ? 'active' : ''}`} onClick={() => setActiveView('access')}>Access Control</button>
                    <button className={`tab ${activeView === 'loco' ? 'active' : ''}`} onClick={() => setActiveView('loco')}>Loco Team</button>
                    <button className={`tab ${activeView === 'manual' ? 'active' : ''}`} onClick={() => setActiveView('manual')}>Manual Override</button>
                </div>
            </div>

            {activeView === 'requests' ? (
                <>
                    {/* Filters + Bulk Actions */}
                    <div className="filters-bar" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                        {/* Row 1: Primary Filters */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', alignItems: 'center', width: '100%' }}>
                            <div className="tabs" style={{ margin: 0 }}>
                                <button className={`tab ${filter === 'Pending' ? 'active' : ''}`} onClick={() => { setFilter('Pending'); setPaymentFilter(false); }}>Pending</button>
                                <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => { setFilter('all'); setPaymentFilter(false); }}>All</button>
                            </div>
                            <div className="tabs" style={{ margin: 0 }}>
                                <button className={`tab ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => setTypeFilter('all')}>All Types</button>
                                <button className={`tab ${typeFilter === 'unavailability' ? 'active' : ''}`} onClick={() => setTypeFilter('unavailability')}>Unavailability</button>
                                <button className={`tab ${typeFilter === 'class_addition' ? 'active' : ''}`} onClick={() => setTypeFilter('class_addition')}>Class Addition</button>
                            </div>
                            <button
                                className="btn btn-danger btn-sm"
                                onClick={() => { setPaymentFilter(p => !p); setFilter('all'); setTypeFilter('all'); }}
                                style={{ marginLeft: 'auto', whiteSpace: 'nowrap', opacity: paymentFilter ? 1 : 0.75 }}
                            >
                                {paymentFilter ? 'Pending Payment Status ✕' : 'Pending Payment Status'}
                            </button>
                        </div>

                        {/* Row 2: Search and Date Range */}
                        <div style={{ 
                            display: 'flex', 
                            flexWrap: 'wrap', 
                            gap: '12px', 
                            alignItems: 'center', 
                            width: '100%', 
                            padding: '12px 16px', 
                            background: 'var(--surface-elevated, #f8f9fa)', 
                            borderRadius: 'var(--radius-md, 8px)',
                            border: '1px solid var(--border-subtle, #e2e8f0)'
                        }}>
                            <div style={{ position: 'relative', flex: '1 1 300px', minWidth: '250px' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Search instructor name or email..."
                                    value={requestSearch}
                                    onChange={e => setRequestSearch(e.target.value)}
                                    style={{ paddingLeft: '32px', margin: 0, height: '38px', fontSize: '0.875rem' }}
                                />
                                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, pointerEvents: 'none' }}>🔍</span>
                                {requestSearch && (
                                    <button 
                                        onClick={() => setRequestSearch('')}
                                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
                                    >
                                        ×
                                    </button>
                                )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 600 }}>From:</span>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={startDateFilter}
                                    onChange={e => setStartDateFilter(e.target.value)}
                                    style={{ width: '140px', margin: 0, height: '38px', fontSize: '0.8125rem', padding: '0 8px' }}
                                />
                                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 600 }}>To:</span>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={endDateFilter}
                                    onChange={e => setEndDateFilter(e.target.value)}
                                    style={{ width: '140px', margin: 0, height: '38px', fontSize: '0.8125rem', padding: '0 8px' }}
                                />
                            </div>

                            {(requestSearch || startDateFilter || endDateFilter) && (
                                <button 
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => { setRequestSearch(''); setStartDateFilter(''); setEndDateFilter(''); }}
                                    style={{ height: '38px', padding: '0 16px', fontSize: '0.8125rem', border: '1px solid var(--border-light)', background: 'var(--bg-card)' }}
                                >
                                    Reset Filters
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Bulk action bar — visible when requests exist */}
                    {!loading && displayedRequests.length > 0 && (
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
                    ) : displayedRequests.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">—</div>
                                <p className="empty-state-text">
                                    {paymentFilter 
                                        ? 'No requests needing attention.' 
                                        : (requestSearch || startDateFilter || endDateFilter)
                                            ? 'No requests match your current filters.'
                                            : `No ${filter === 'Pending' ? 'pending ' : ''}requests.`
                                    }
                                </p>
                        </div>
                    ) : (
                        displayedRequests.map((r, i) => {
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
                                                <select className="form-select" value={replacementInstructor} onChange={e => {
                                                    setReplacementInstructor(e.target.value);
                                                    if (e.target.value !== '__others__') setCustomInstructor('');
                                                }}>
                                                    <option value="">Select instructor...</option>
                                                    {instructorOptions.map(inst => (
                                                        <option key={inst.email} value={inst.email}>{inst.name} ({inst.email})</option>
                                                    ))}
                                                    <option value="__others__">Others</option>
                                                </select>
                                                {replacementInstructor === '__others__' && (
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        style={{ marginTop: '8px' }}
                                                        placeholder="Enter instructor name or email..."
                                                        value={customInstructor}
                                                        onChange={e => setCustomInstructor(e.target.value)}
                                                    />
                                                )}
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
                                                <option value="Non- Sanctioned">Non- Sanctioned</option>
                                                <option value="Unpaid">Unpaid</option>
                                                <option value="To be Audited">To be Audited</option>
                                                <option value="Pending">Pending</option>
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Class Added On</label>
                                            <select className="form-select" value={classAddedOnDay} onChange={e => setClassAddedOnDay(e.target.value)}>
                                                <option value="">Not specified</option>
                                                <option value="Class Added on Class Day">Class Added on Class Day</option>
                                                <option value="Class added on Non-class day">Class added on Non-class day</option>
                                            </select>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Red Flag Exemption</label>
                                            <select className="form-select" value={redFlag} onChange={e => setRedFlag(e.target.value)}>
                                                <option value="No">No</option>
                                                <option value="Exempted">Exempted</option>
                                            </select>
                                        </div>

                                        {redFlag === 'Exempted' && (
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
            ) : activeView === 'access' ? (
                /* --- Access Control View --- */
                <div style={{ marginTop: '20px' }}>
                    <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>Grant Instructor Access</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '16px' }}>
                            Only instructors added to this list can log in to the dashboard. Admins always have access.
                        </p>
                        <form onSubmit={handleAddInstructor} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="name1@scaler.com, name2@scaler.com..."
                                value={newInstructorEmail}
                                onChange={e => setNewInstructorEmail(e.target.value)}
                                style={{ flex: '1 1 220px', minWidth: 0 }}
                                required
                            />
                            <button type="submit" className="btn btn-primary" style={{ flexShrink: 0 }}>
                                Give Access
                            </button>
                        </form>
                    </div>

                    <div className="card">
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Allowed Instructors ({filteredInstructors.length})</h3>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Search emails..."
                                value={instructorSearch}
                                onChange={e => setInstructorSearch(e.target.value)}
                                style={{ width: '220px', maxWidth: '100%', padding: '6px 12px', fontSize: '0.875rem' }}
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
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {filteredInstructors.map(inst => (
                                    <div key={inst.email} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '16px 24px', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ fontWeight: 500, wordBreak: 'break-word' }}>{inst.email}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                Added {inst.added_at ? new Date(inst.added_at).toLocaleDateString() : '—'} by {inst.added_by || 'System'}
                                            </div>
                                            {inst.alias_email ? (
                                                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                    Alias: <span style={{ fontWeight: 500 }}>{inst.alias_email}</span>
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '4px' }}>No alias</div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
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
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : activeView === 'loco' ? (
                /* --- Loco Control View --- */
                <div style={{ marginTop: '20px' }}>
                    <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>Grant Loco Team Access</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '16px' }}>
                            Loco Team members can impersonate any instructor to manage their classes, without having full admin access.
                        </p>
                        <form onSubmit={handleAddLoco} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="name1@scaler.com, name2@scaler.com..."
                                value={newLocoEmail}
                                onChange={e => setNewLocoEmail(e.target.value)}
                                style={{ flex: '1 1 220px', minWidth: 0 }}
                                required
                            />
                            <button type="submit" className="btn btn-primary" style={{ flexShrink: 0 }}>
                                Give Access
                            </button>
                        </form>
                    </div>

                    <div className="card">
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Loco Team ({filteredLocoUsers.length})</h3>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Search emails..."
                                value={locoSearch}
                                onChange={e => setLocoSearch(e.target.value)}
                                style={{ width: '220px', maxWidth: '100%', padding: '6px 12px', fontSize: '0.875rem' }}
                            />
                        </div>
                        {locoLoading ? (
                            <div className="loading-container"><div className="spinner" /></div>
                        ) : locoUsers.length === 0 ? (
                            <div className="empty-state" style={{ padding: '40px' }}>
                                <p className="empty-state-text">No Loco Team members added yet.</p>
                            </div>
                        ) : filteredLocoUsers.length === 0 ? (
                            <div className="empty-state" style={{ padding: '40px' }}>
                                <p className="empty-state-text">No users matching "{locoSearch}".</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {filteredLocoUsers.map(user => (
                                    <div key={user.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                                        <div style={{ fontWeight: 500 }}>{user.email}</div>
                                        <button
                                            className="btn btn-danger btn-sm"
                                            onClick={() => handleRemoveLoco(user.email)}
                                        >
                                            Revoke
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : activeView === 'manual' ? (
                <AdminManualUnavailability />
            ) : null}

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
