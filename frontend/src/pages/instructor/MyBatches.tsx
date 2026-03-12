import React, { useState, useEffect } from 'react';
import { getMyBatches } from '../../api/client';
import { formatDate } from '../../utils/formatDate';

type ClassItem = Record<string, any>;
type BatchData = {
    program: string;
    modules: Record<string, ClassItem[]>;
};

const MyBatches: React.FC = () => {
    const [batches, setBatches] = useState<Record<string, BatchData>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

    useEffect(() => {
        setLoading(true);
        getMyBatches()
            .then(d => {
                setBatches(d.batches);
                // Batches start collapsed — user opens the ones they need
            })
            .catch(() => setError('Failed to load batch data.'))
            .finally(() => setLoading(false));
    }, []);

    const toggleBatch = (batch: string) => {
        setExpandedBatches(prev => {
            const next = new Set(prev);
            if (next.has(batch)) next.delete(batch);
            else next.add(batch);
            return next;
        });
    };

    const toggleModule = (key: string) => {
        setExpandedModules(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container"><div className="spinner" /><span style={{ color: 'var(--text-muted)' }}>Loading batches...</span></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="page-container">
                <div className="empty-state"><div className="empty-icon">—</div><h3>{error}</h3></div>
            </div>
        );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isCurrent = (batch: BatchData): boolean => {
        return Object.values(batch.modules).some(classes =>
            classes.some(cls => {
                const s = String(cls['class_date'] || '').trim();
                // MM/DD/YYYY
                if (s.includes('/')) {
                    const [m, d, y] = s.split('/').map(Number);
                    return new Date(y, m - 1, d) >= today;
                }
                // YYYY-MM-DD
                if (s.includes('-') && s.length >= 10) {
                    const dt = new Date(s.substring(0, 10));
                    return dt >= today;
                }
                return false;
            })
        );
    };

    const batchNames = Object.keys(batches).sort((a, b) => {
        const aCurrent = isCurrent(batches[a]) ? 0 : 1;
        const bCurrent = isCurrent(batches[b]) ? 0 : 1;
        if (aCurrent !== bCurrent) return aCurrent - bCurrent;
        return a.localeCompare(b); // alphabetical within same group
    });

    if (batchNames.length === 0) {
        return (
            <div className="page-container">
                <h1 className="page-title">My Batches</h1>
                <div className="empty-state">
                    <div className="empty-icon">—</div>
                    <h3>No batches found</h3>
                    <p>You don't appear to be the primary instructor for any batch modules.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
                <h1 className="page-title" style={{ margin: 0 }}>My Batches</h1>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    {batchNames.length} batch{batchNames.length !== 1 ? 'es' : ''}
                </span>
            </div>

            {batchNames.map(batchName => (
                <BatchAccordionItem
                    key={batchName}
                    batchName={batchName}
                    batch={batches[batchName]}
                    isExpanded={expandedBatches.has(batchName)}
                    onToggle={() => toggleBatch(batchName)}
                    expandedModules={expandedModules}
                    toggleModule={toggleModule}
                />
            ))}
        </div>
    );
};

interface BatchAccordionItemProps {
    batchName: string;
    batch: BatchData;
    isExpanded: boolean;
    onToggle: () => void;
    expandedModules: Set<string>;
    toggleModule: (key: string) => void;
}

const BatchAccordionItem: React.FC<BatchAccordionItemProps> = ({
    batchName,
    batch,
    isExpanded,
    onToggle,
    expandedModules,
    toggleModule
}) => {
    const [isTextExpanded, setIsTextExpanded] = useState(false);
    const moduleNames = Object.keys(batch.modules);
    const totalClasses = moduleNames.reduce((sum, m) => sum + batch.modules[m].length, 0);

    const handleTextClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsTextExpanded(prev => !prev);
    };

    return (
        <div className="batch-accordion">
            {/* Batch Header */}
            <div
                className="batch-accordion-header"
                onClick={onToggle}
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
            >
                <div className="batch-accordion-title">
                    <span className={`accordion-chevron ${isExpanded ? 'expanded' : ''}`}>▶</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2
                            className={`batch-name ${!isTextExpanded ? 'line-clamp-3' : ''}`}
                            onClick={handleTextClick}
                            title={!isTextExpanded ? "Click to expand/collapse full text" : ""}
                            style={{ cursor: 'pointer' }}
                        >
                            {batchName}
                        </h2>
                        <span className="batch-subtitle">
                            {batch.program} · {moduleNames.length} module{moduleNames.length !== 1 ? 's' : ''} · {totalClasses} class{totalClasses !== 1 ? 'es' : ''}
                        </span>
                    </div>
                </div>
            </div>

            {/* Batch Body */}
            {isExpanded && (
                <div className="batch-accordion-body">
                    {moduleNames.map(modName => {
                        const modKey = `${batchName}::${modName}`;
                        const classes = batch.modules[modName];
                        const modExpanded = expandedModules.has(modKey);
                        const uniqueRIs = new Set(
                            classes.filter(c => c.is_replacement)
                                .map(c => c['instructor_email'] || c['instructor_name'] || 'Unknown')
                        );
                        const riCount = uniqueRIs.size;

                        return (
                            <div key={modKey} className="module-section">
                                <button
                                    className="module-section-header"
                                    onClick={() => toggleModule(modKey)}
                                >
                                    <div className="module-section-title">
                                        <span className={`accordion-chevron small ${modExpanded ? 'expanded' : ''}`}>▶</span>
                                        <span className="module-name">{modName}</span>
                                        <span className="module-count">
                                            {classes.length} class{classes.length !== 1 ? 'es' : ''}
                                            {riCount > 0 && (
                                                <span className="ri-badge">{riCount} RI</span>
                                            )}
                                        </span>
                                    </div>
                                </button>

                                {modExpanded && (
                                    <div className="module-classes">
                                        {classes.map((cls, i) => (
                                            <BatchClassCard key={i} cls={cls} index={i} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

/* ─── Simple class card for batch view ─── */
const BatchClassCard: React.FC<{ cls: ClassItem; index: number }> = ({ cls, index }) => {
    const isRI = cls.is_replacement;
    const classType = cls['class_type'] || 'Regular';
    const instructorName = cls['instructor_name'] || '';

    return (
        <div
            className={`card class-card ${isRI ? 'ri-class' : ''}`}
            style={{ animationDelay: `${index * 30}ms` }}
        >
            <div className="card-header">
                <div>
                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '2px' }}>
                        {cls['class_topic']}
                    </h3>
                    {isRI && (
                        <span className="ri-indicator">
                            Taken by: {instructorName}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={`badge badge-${classType.toLowerCase() === 'optional' ? 'optional' : 'regular'}`}>
                        {classType}
                    </span>
                    {isRI && (
                        <span className="badge badge-ri">RI</span>
                    )}
                </div>
            </div>

            <div style={{ margin: '8px 0', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
                <span>{formatDate(cls['class_date'])}</span>
                <span>{cls['time_of_day']} IST</span>
            </div>

            <div className="card-meta">
                <span className="card-meta-item">
                    <span className="card-meta-label">Batch:</span> {cls['sb_names']}
                </span>
                {cls['sbat_group_id'] && (
                    <span className="card-meta-item">
                        <span className="card-meta-label">SBAT:</span> {cls['sbat_group_id']}
                    </span>
                )}
            </div>

        </div>
    );
};

export default MyBatches;
