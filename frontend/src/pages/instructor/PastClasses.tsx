import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getClasses } from '../../api/client';
import type { ClassItem } from '../../types';

const PastClasses: React.FC = () => {
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [total, setTotal] = useState(0);
    const [limit, setLimit] = useState(10);
    const [loading, setLoading] = useState(true);

    const fetchPast = useCallback(async () => {
        try {
            const data = await getClasses('past', limit, 0);
            setClasses(data.classes);
            setTotal(data.total);
        } catch (err) {
            console.error('Failed to fetch past classes:', err);
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        fetchPast();
    }, [fetchPast]);

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container">
                    <div className="spinner" />
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div className="action-bar">
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <h1 className="page-title">Past Classes</h1>
                    <p className="page-subtitle">{total} classes completed</p>
                </div>
                <Link to="/instructor/dashboard" className="btn btn-ghost">
                    Back to Dashboard
                </Link>
            </div>

            {classes.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">—</div>
                    <p className="empty-state-text">No past classes found.</p>
                </div>
            ) : (
                <>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Batch</th>
                                    <th>Class Topic</th>
                                    <th>Date & Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {classes.map((cls, i) => (
                                    <tr key={`${cls['sbat_group_id']}-${cls['class_date']}-${i}`}>
                                        <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                                            {cls['sb_names']}
                                        </td>
                                        <td>{cls['class_topic']}</td>
                                        <td>
                                            {cls['class_date']}
                                            <br />
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {cls['time_of_day']} IST
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {classes.length < total && (
                        <div style={{ textAlign: 'center', marginTop: 'var(--space-lg)' }}>
                            <button className="btn btn-secondary" onClick={() => setLimit(prev => prev + 10)}>
                                Load More
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default PastClasses;
