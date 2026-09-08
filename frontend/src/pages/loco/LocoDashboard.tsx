import React, { useState, useEffect, useMemo } from 'react';
import { getLocoSearchableInstructors, LocoInstructor } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const LocoDashboard: React.FC = () => {
    const { startImpersonating } = useAuth();
    const [instructors, setInstructors] = useState<LocoInstructor[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedProgram, setSelectedProgram] = useState('All');

    useEffect(() => {
        getLocoSearchableInstructors().then(data => {
            setInstructors(data.instructors);
        }).catch(err => {
            console.error(err);
        }).finally(() => {
            setLoading(false);
        });
    }, []);

    const programs = useMemo(() => {
        const progs = new Set<string>();
        instructors.forEach(inst => inst.programs.forEach(p => progs.add(p)));
        return ['All', ...Array.from(progs).sort()];
    }, [instructors]);

    const filtered = useMemo(() => {
        return instructors.filter(inst => {
            const matchesSearch = inst.name.toLowerCase().includes(search.toLowerCase()) || 
                                  inst.email.toLowerCase().includes(search.toLowerCase());
            const matchesProgram = selectedProgram === 'All' || inst.programs.includes(selectedProgram);
            return matchesSearch && matchesProgram;
        });
    }, [instructors, search, selectedProgram]);

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Loco Team Dashboard</h1>
                <p className="page-subtitle">Search for an instructor to impersonate and manage their classes.</p>
            </div>

            <div className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
                    <div className="form-group" style={{ flex: '1 1 300px', marginBottom: 0 }}>
                        <label className="form-label">Search Instructor Name or Email</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="e.g. John Doe, john.doe@scaler.com"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="form-group" style={{ flex: '0 0 200px', marginBottom: 0 }}>
                        <label className="form-label">Filter by Program</label>
                        <select
                            className="form-select"
                            value={selectedProgram}
                            onChange={e => setSelectedProgram(e.target.value)}
                        >
                            {programs.map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="loading-container"><div className="spinner" /></div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <p className="empty-state-text">No instructors found matching your criteria.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {filtered.map(inst => (
                            <div key={inst.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '1rem' }}>{inst.name}</div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{inst.email}</div>
                                    <div style={{ fontSize: '0.75rem', marginTop: '6px', color: 'var(--text-secondary)' }}>
                                        Programs: {inst.programs.join(', ') || 'None'}
                                    </div>
                                </div>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => startImpersonating(inst.email)}
                                >
                                    Impersonate
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LocoDashboard;
