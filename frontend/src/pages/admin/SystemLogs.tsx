import React, { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getSystemLogs, SystemLog } from '../../api/client';

// Inline simple SVGs to avoid dependency issues
const Icons = {
    AlertCircle: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    ),
    FileText: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    ),
    ChevronDown: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    ),
    ChevronRight: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    ),
    RefreshCw: ({ className }: { className?: string }) => (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
    ),
    XCircle: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
    )
};

const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
        case 'ERROR': return 'badge-rejected';
        case 'WARNING': return 'badge-pending';
        case 'INFO': return 'badge-approved';
        default: return 'badge-regular';
    }
};

const LogRow: React.FC<{ log: SystemLog }> = ({ log }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div 
            className="card"
            style={{ 
                marginBottom: 'var(--space-md)', 
                cursor: 'pointer',
                padding: 'var(--space-md)',
                animation: 'slideUp 0.2s ease both'
            }}
            onClick={() => setExpanded(!expanded)}
        >
            <div 
                style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    gap: 'var(--space-md)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flex: 1 }}>
                    <div style={{ minWidth: '160px', fontSize: '0.8125rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {new Date(log.timestamp).toLocaleString()}
                    </div>
                    <div>
                        <span className={`badge ${getLevelColor(log.level)}`}>
                            {log.level}
                        </span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', flex: 1 }}>
                        {log.message}
                    </div>
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                    {(log.trace || log.metadata) && (
                        expanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />
                    )}
                </div>
            </div>
            
            <div style={{ marginTop: 'var(--space-sm)', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                Logger: {log.logger_name}
            </div>
            
            {expanded && (log.trace || log.metadata) && (
                <div 
                    style={{ 
                        marginTop: 'var(--space-md)', 
                        padding: 'var(--space-md)', 
                        background: 'var(--bg-secondary)', 
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.8125rem',
                        overflowX: 'auto'
                    }}
                >
                    {log.metadata && (
                        <div style={{ marginBottom: 'var(--space-md)' }}>
                            <div style={{ fontWeight: 600, marginBottom: 'var(--space-xs)', color: 'var(--text-secondary)' }}>Metadata:</div>
                            <pre style={{ margin: 0, color: 'var(--text-secondary)' }}>{JSON.stringify(log.metadata, null, 2)}</pre>
                        </div>
                    )}
                    {log.trace && (
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: 'var(--space-xs)', color: 'var(--danger)' }}>Stack Trace:</div>
                            <pre style={{ margin: 0, color: 'var(--danger)', whiteSpace: 'pre-wrap' }}>{log.trace}</pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const SystemLogs: React.FC = () => {
    const { user } = useAuth();
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterLevel, setFilterLevel] = useState<string>('ALL');
    const [searchTerm, setSearchTerm] = useState<string>('');

    const fetchLogs = async (searchOverride?: string) => {
        try {
            setLoading(true);
            const level = filterLevel === 'ALL' ? undefined : filterLevel;
            const search = searchOverride !== undefined ? searchOverride : searchTerm;
            const data = await getSystemLogs(level, search, 100);
            setLogs(data);
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to fetch logs');
        } finally {
            setLoading(false);
        }
    };

    // Debounced search effect
    useEffect(() => {
        if (user?.role !== 'admin') return;
        
        const timer = setTimeout(() => {
            fetchLogs();
        }, 500);

        return () => clearTimeout(timer);
    }, [user, filterLevel, searchTerm]);

    if (user?.role !== 'admin') {
        return (
            <div className="page-container" style={{ textAlign: 'center', paddingTop: 'var(--space-2xl)' }}>
                <div style={{ color: 'var(--danger)', marginBottom: 'var(--space-md)' }}>
                    <Icons.AlertCircle />
                </div>
                <h2 className="page-title">Access Denied</h2>
                <p className="page-subtitle">You do not have permission to view system logs.</p>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="page-title flex items-center gap-2">
                        <Icons.FileText />
                        System Logs
                    </h1>
                    <p className="page-subtitle">Real-time backend system alerts, errors, and login tracking.</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
                    <div style={{ position: 'relative', width: '250px' }}>
                        <input
                            type="text"
                            placeholder="Search logs/logins..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="form-input"
                            style={{ paddingRight: '35px' }}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                style={{
                                    position: 'absolute',
                                    right: '10px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer'
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    <select
                        value={filterLevel}
                        onChange={(e) => setFilterLevel(e.target.value)}
                        className="form-select"
                        style={{ width: 'auto', minWidth: '150px' }}
                    >
                        <option value="ALL">All Levels</option>
                        <option value="ERROR">Error</option>
                        <option value="WARNING">Warning</option>
                        <option value="INFO">Info</option>
                    </select>
                    <button
                        onClick={() => fetchLogs()}
                        disabled={loading}
                        className="btn btn-primary"
                    >
                        <Icons.RefreshCw className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ padding: 'var(--space-md)', background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', marginBottom: 'var(--space-lg)', display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
                    <Icons.XCircle />
                    <span>{error}</span>
                </div>
            )}

            <div style={{ marginTop: 'var(--space-lg)' }}>
                {loading && logs.length === 0 ? (
                    <div className="loading-container">
                        <div className="spinner" />
                        <p>Loading system logs...</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <Icons.FileText />
                        </div>
                        <p className="empty-state-text">No logs found matching the current filter.</p>
                    </div>
                ) : (
                    logs.map(log => <LogRow key={log.id} log={log} />)
                )}
            </div>
        </div>
    );
};
