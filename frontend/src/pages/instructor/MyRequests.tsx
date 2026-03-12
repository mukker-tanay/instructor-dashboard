import React, { useState, useEffect } from 'react';
import { getMyRequests } from '../../api/client';
import type { RequestItem } from '../../types';

const MyRequests: React.FC = () => {
    const [requests, setRequests] = useState<RequestItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const data = await getMyRequests();
                setRequests(data.requests);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const getStatus = (r: RequestItem) => {
        const s = String(r.status || r.Status || 'Pending').trim();
        return s;
    };

    const getStatusBadge = (status: string) => {
        const s = status.toLowerCase();
        if (s === 'approved') return 'badge-approved';
        if (s === 'rejected') return 'badge-rejected';
        return 'badge-pending';
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container"><div className="spinner" /></div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">My Requests</h1>
                <p className="page-subtitle">{requests.length} request{requests.length !== 1 ? 's' : ''} raised</p>
            </div>

            {requests.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">—</div>
                    <p className="empty-state-text">You haven't raised any requests yet.</p>
                </div>
            ) : (
                requests.map((r, i) => {
                    const status = getStatus(r);
                    const isUnavail = r.request_type === 'unavailability';
                    const date =
                        (isUnavail
                            ? r['Original Date of Class (MM/DD/YYYY)']
                            : r['Date of Class (MM/DD/YYYY)']) || '';
                    const time =
                        (isUnavail
                            ? r['Original Time of Class (HH:MM AM/PM) IST']
                            : r['Time of Class (HH:MM AM/PM) IST']) || '';
                    const raisedRaw = r['Raised Timestamp'] || r['Time stamp'] || '';
                    const raised = raisedRaw
                        ? new Date(raisedRaw).toLocaleString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
                        })
                        : '';

                    return (
                        <div key={i} className="card class-card" style={{ animationDelay: `${i * 40}ms` }}>
                            <div className="card-header">
                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '2px' }}>
                                        {r['Class Title'] || 'Untitled Class'}
                                    </h3>
                                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                                        {r['Module Name'] || ''} • {r['Batch Name'] || ''}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <span className={`badge badge-${r.request_type}`}>
                                        {isUnavail ? 'Unavailability' : 'Class Addition'}
                                    </span>
                                    <span className={`badge ${getStatusBadge(status)}`}>{status}</span>
                                </div>
                            </div>
                            <div className="card-meta">
                                <span className="card-meta-item">
                                    <span className="card-meta-label">Class Date:</span> {date} {time}
                                </span>
                                <span className="card-meta-item">
                                    <span className="card-meta-label">Raised:</span> {raised}
                                </span>
                                {isUnavail && r['Reason for Unavailability'] && (
                                    <span className="card-meta-item">
                                        <span className="card-meta-label">Reason:</span> {String(r['Reason for Unavailability']).slice(0, 80)}
                                    </span>
                                )}
                                {!isUnavail && r['Reason for Addition of Class'] && (
                                    <span className="card-meta-item">
                                        <span className="card-meta-label">Reason:</span> {String(r['Reason for Addition of Class']).slice(0, 80)}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
};

export default MyRequests;
