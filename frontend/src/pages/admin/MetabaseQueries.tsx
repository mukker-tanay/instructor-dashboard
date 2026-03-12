import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getMetabaseQueries, addMetabaseQuery, deleteMetabaseQuery, MetabaseQuery } from '../../api/client';

const MetabaseQueries: React.FC = () => {
    const { user } = useAuth();
    const canManage = user?.role === 'admin';

    const [queries, setQueries] = useState<MetabaseQuery[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ title: '', url: '', description: '' });
    const [submitting, setSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getMetabaseQueries();
            setQueries(data.queries);
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Failed to load queries.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = queries.filter(q => {
        const qLower = search.toLowerCase();
        return !search || q.title.toLowerCase().includes(qLower) || q.description.toLowerCase().includes(qLower);
    });

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim() || !form.url.trim()) {
            setError('Title and URL are required.');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await addMetabaseQuery({ title: form.title, url: form.url, description: form.description });
            setSuccess('Query added successfully.');
            setForm({ title: '', url: '', description: '' });
            setShowForm(false);
            await load();
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Failed to add query.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (q: MetabaseQuery) => {
        if (!confirm(`Delete "${q.title}"?`)) return;
        setDeletingId(q.id);
        setError('');
        try {
            await deleteMetabaseQuery(q.id);
            setSuccess('Query deleted.');
            await load();
        } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Failed to delete query.');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="page-container">
            <div className="action-bar">
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <h1 className="page-title">Metabase Queries</h1>
                    <p className="page-subtitle">Saved Metabase report and query links</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading} title="Refresh list">
                        {loading ? '…' : '↻ Refresh'}
                    </button>
                    {canManage && (
                        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
                            {showForm ? 'Cancel' : '+ Add Query'}
                        </button>
                    )}
                </div>
            </div>

            {/* Feedback */}
            {success && (
                <div style={{ padding: 'var(--space-md)', background: 'var(--success-bg)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--success)', marginBottom: 'var(--space-lg)', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{success}</span>
                    <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--success)' }}>✕</button>
                </div>
            )}
            {error && (
                <div style={{ padding: 'var(--space-md)', background: 'var(--danger-bg)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', marginBottom: 'var(--space-lg)', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{error}</span>
                    <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>✕</button>
                </div>
            )}

            {/* Add query form (admin only) */}
            {showForm && canManage && (
                <div className="card" style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-lg)' }}>
                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: 'var(--space-md)' }}>New Metabase Query</h3>
                    <form onSubmit={handleAdd}>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label form-label-required">Title</label>
                                <input
                                    className="form-input"
                                    value={form.title}
                                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="e.g. Weekly Attendance Report"
                                    style={{ backgroundImage: 'none' }}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label form-label-required">Metabase URL</label>
                                <input
                                    className="form-input"
                                    value={form.url}
                                    onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                                    placeholder="https://metabase.example.com/question/123"
                                    style={{ backgroundImage: 'none' }}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea
                                className="form-textarea"
                                value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="What does this query show?"
                                rows={2}
                            />
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? 'Adding...' : 'Add Query'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Search bar */}
            <div className="filters-bar" style={{ marginBottom: 'var(--space-lg)' }}>
                <input
                    className="filter-select"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search queries..."
                    style={{ backgroundImage: 'none', minWidth: '200px' }}
                />
                {search && (
                    <button className="btn btn-sm btn-ghost" onClick={() => setSearch('')}>Clear</button>
                )}
            </div>

            {/* Query list */}
            {loading ? (
                <div className="loading-container"><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <p className="empty-state-text">
                        {queries.length === 0 ? 'No Metabase queries have been added yet.' : 'No queries match your search.'}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                    {filtered.map(q => (
                        <div key={q.id} className="card" style={{ padding: 'var(--space-md) var(--space-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
                            {/* Chart icon */}
                            <div style={{
                                width: '40px', height: '48px', flexShrink: 0, borderRadius: '6px',
                                background: 'rgba(89, 131, 176, 0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '1px solid rgba(89, 131, 176, 0.25)',
                            }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <rect x="3" y="3" width="18" height="18" rx="2" stroke="#5983B0" strokeWidth="1.5" />
                                    <path d="M7 16l3-4 3 3 3-5" stroke="#5983B0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>

                            {/* Text */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <a
                                    href={q.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--primary)', textDecoration: 'none' }}
                                >
                                    {q.title} ↗
                                </a>
                                {q.description && (
                                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
                                        {q.description}
                                    </p>
                                )}
                                {canManage && q.added_by && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                                        Added by {q.added_by}
                                    </div>
                                )}
                            </div>

                            {/* Delete (admin only) */}
                            {canManage && (
                                <div style={{ flexShrink: 0 }}>
                                    <button
                                        className="btn btn-sm"
                                        onClick={() => handleDelete(q)}
                                        disabled={deletingId === q.id}
                                        style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' }}
                                    >
                                        {deletingId === q.id ? '...' : 'Delete'}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MetabaseQueries;
