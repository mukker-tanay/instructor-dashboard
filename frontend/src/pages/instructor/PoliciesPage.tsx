import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getPolicies, addPolicy, deletePolicy } from '../../api/client';

interface Policy {
    row: number;
    name: string;
    url: string;
    description: string;
    category: string;
    added_by: string;
    added_at: string;
}

const PoliciesPage: React.FC = () => {
    const { user } = useAuth();
    // Use role directly — isAdmin can be true for impersonating admins
    const canManage = user?.role === 'admin';

    const [policies, setPolicies] = useState<Policy[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // add-form state (admin only)
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', url: '', description: '', category: '' });
    const [submitting, setSubmitting] = useState(false);
    const [deletingRow, setDeletingRow] = useState<number | null>(null);


    // search / filter
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getPolicies();
            setPolicies(data.policies);
        } catch (err: any) {
            const msg = err?.response?.data?.detail || err?.message || 'Failed to load policies.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const categories = [...new Set(policies.map(p => p.category).filter(Boolean))];

    const filtered = policies.filter(p => {
        const q = search.toLowerCase();
        const matchSearch = !search || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
        const matchCat = !filterCategory || p.category === filterCategory;
        return matchSearch && matchCat;
    });

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !form.url.trim()) {
            setError('Policy name and file path are required.');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await addPolicy({ name: form.name, url: form.url, description: form.description, category: form.category });
            setSuccess('Policy added successfully.');
            setForm({ name: '', url: '', description: '', category: '' });
            setShowForm(false);
            await load();
        } catch (err: any) {
            const msg = err?.response?.data?.detail || err?.message || 'Failed to add policy.';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (row: number, name: string) => {
        if (!confirm(`Delete policy "${name}"?`)) return;
        setDeletingRow(row);
        setError('');
        try {
            await deletePolicy(row);
            setSuccess('Policy deleted.');
            await load();
        } catch (err: any) {
            const msg = err?.response?.data?.detail || err?.message || 'Failed to delete policy.';
            setError(msg);
        } finally {
            setDeletingRow(null);
        }
    };

    return (
        <div className="page-container">
            <div className="action-bar" style={{ flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <h1 className="page-title">Policies</h1>
                    <p className="page-subtitle">Company policy documents and guidelines</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading} title="Refresh list">
                        {loading ? '…' : '↻ Refresh'}
                    </button>
                    {canManage && (
                        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
                            {showForm ? 'Cancel' : 'Add Policy'}
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

            {/* Add policy form (admin only) */}
            {showForm && canManage && (
                <div className="card" style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-lg)' }}>
                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '4px' }}>New Policy</h3>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
                        Paste a Google Docs, Drive, or any document URL below.
                    </p>
                    <form onSubmit={handleAdd}>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label form-label-required">Policy Name</label>
                                <input
                                    className="form-input"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g. Leave Policy 2025"
                                    style={{ backgroundImage: 'none' }}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Category</label>
                                <input
                                    className="form-input"
                                    value={form.category}
                                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                    placeholder="e.g. HR, Compliance..."
                                    style={{ backgroundImage: 'none' }}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label form-label-required">Document URL</label>
                            <input
                                className="form-input"
                                value={form.url}
                                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                                placeholder="https://docs.google.com/document/d/..."
                                style={{ backgroundImage: 'none' }}
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                                Paste any Google Docs, Drive, or external document link.
                            </span>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea
                                className="form-textarea"
                                value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="Brief description of this policy..."
                                rows={2}
                            />
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? 'Adding...' : 'Add Policy'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Search + filter bar */}
            <div className="filters-bar" style={{ marginBottom: 'var(--space-lg)' }}>
                <input
                    className="filter-select"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search policies..."
                    style={{ backgroundImage: 'none', minWidth: '200px' }}
                />
                {categories.length > 0 && (
                    <select className="filter-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                        <option value="">All Categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                )}
                {(search || filterCategory) && (
                    <button className="btn btn-sm btn-ghost" onClick={() => { setSearch(''); setFilterCategory(''); }}>Clear</button>
                )}
            </div>

            {/* Policy list */}
            {loading ? (
                <div className="loading-container"><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">—</div>
                    <p className="empty-state-text">
                        {policies.length === 0 ? 'No policies have been added yet.' : 'No policies match your search.'}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                    {filtered.map(policy => (
                        <div key={policy.row} className="card" style={{ padding: '12px var(--space-lg)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                            {/* File icon */}
                            <div style={{
                                width: '38px', height: '38px', flexShrink: 0, borderRadius: '8px',
                                background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '1px solid rgba(239,68,68,0.18)',
                            }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <polyline points="14,2 14,8 20,8" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <line x1="9" y1="13" x2="15" y2="13" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
                                    <line x1="9" y1="17" x2="15" y2="17" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
                                    <line x1="9" y1="9" x2="11" y2="9" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                            </div>

                            {/* Text */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{policy.name}</span>
                                    {policy.category && (
                                        <span style={{
                                            padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500,
                                            background: 'rgba(99,102,241,0.12)', color: 'var(--accent-primary)',
                                        }}>{policy.category}</span>
                                    )}
                                </div>
                                {policy.description && (
                                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px', marginBottom: 0 }}>
                                        {policy.description}
                                    </p>
                                )}
                                {canManage && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Added by {policy.added_by || 'Admin'}{policy.added_at ? ` · ${policy.added_at}` : ''}
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <a
                                    href={policy.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-primary btn-sm"
                                >
                                    View ↗
                                </a>
                                {canManage && (
                                    <button
                                        className="btn btn-sm"
                                        onClick={() => handleDelete(policy.row, policy.name)}
                                        disabled={deletingRow === policy.row}
                                        style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' }}
                                    >
                                        {deletingRow === policy.row ? '...' : 'Delete'}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

        </div>
    );
};

export default PoliciesPage;
