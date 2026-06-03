import React, { useState, useEffect, useCallback } from 'react';
import {
    getAvailabilityMe,
    createStandbySlot,
    deleteStandbySlot,
    updateSlotPreferences,
} from '../../api/client';
import type { BackupAvailability, SlotPreference } from '../../types';

/* ─── Helpers ─── */
const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const slotLabel = (slot: string) => {
    if (slot === 'morning') return '🌅 Morning';
    if (slot === 'evening') return '🌇 Evening';
    if (slot === 'both') return '🔄 Both';
    return slot;
};

const PREF_OPTIONS: { value: SlotPreference['general_preference']; label: string; emoji: string; desc: string }[] = [
    { value: 'morning', label: 'Morning', emoji: '🌅', desc: 'e.g. 7 AM – 12 PM' },
    { value: 'evening', label: 'Evening', emoji: '🌇', desc: 'e.g. 6 PM – 10 PM' },
    { value: 'both', label: 'Both', emoji: '🔄', desc: 'Flexible on timings' },
    { value: 'none', label: 'None', emoji: '🛑', desc: 'Not open to new classes' },
];

/* ─── Component ─── */
const BackupAvailability: React.FC = () => {
    const [preference, setPreference] = useState<SlotPreference['general_preference']>('none');
    const [prefNotes, setPrefNotes] = useState('');
    const [prefSaving, setPrefSaving] = useState(false);
    const [prefSaved, setPrefSaved] = useState(false);

    const [standbySlots, setStandbySlots] = useState<BackupAvailability[]>([]);
    const [loading, setLoading] = useState(true);

    // New slot form
    const [formStartDate, setFormStartDate] = useState('');
    const [formEndDate, setFormEndDate] = useState('');
    const [formSlot, setFormSlot] = useState<'morning' | 'evening' | 'both'>('morning');
    const [formNotes, setFormNotes] = useState('');
    const [formSubmitting, setFormSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [formSuccess, setFormSuccess] = useState('');

    const [deletingId, setDeletingId] = useState<string | null>(null);

    const today = new Date().toISOString().split('T')[0];

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getAvailabilityMe();
            if (data.preferences) {
                setPreference(data.preferences.general_preference || 'none');
                setPrefNotes(data.preferences.notes || '');
            }
            setStandbySlots(data.standby_slots || []);
        } catch (err) {
            console.error('Failed to fetch availability data', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    /* ─── Preference save ─── */
    const handleSavePref = async (newPref: SlotPreference['general_preference']) => {
        setPreference(newPref);
        setPrefSaving(true);
        setPrefSaved(false);
        try {
            await updateSlotPreferences({ general_preference: newPref, notes: prefNotes });
            setPrefSaved(true);
            setTimeout(() => setPrefSaved(false), 2500);
        } catch (err) {
            console.error('Failed to save preference', err);
        } finally {
            setPrefSaving(false);
        }
    };

    /* ─── Add standby slot ─── */
    const handleAddSlot = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setFormSuccess('');

        if (!formStartDate || !formEndDate) {
            setFormError('Please select both start and end dates.');
            return;
        }
        if (formEndDate < formStartDate) {
            setFormError('End date must be on or after the start date.');
            return;
        }

        setFormSubmitting(true);
        try {
            await createStandbySlot({
                start_date: formStartDate,
                end_date: formEndDate,
                slot: formSlot,
                notes: formNotes.trim(),
            });
            setFormSuccess('Standby slot added! You are now opted-in as backup for these dates.');
            setFormStartDate('');
            setFormEndDate('');
            setFormSlot('morning');
            setFormNotes('');
            fetchData();
        } catch (err: any) {
            setFormError(err.response?.data?.detail || 'Failed to add standby slot.');
        } finally {
            setFormSubmitting(false);
        }
    };

    /* ─── Delete standby slot ─── */
    const handleDeleteSlot = async (slotId: string) => {
        if (!window.confirm('Remove this standby declaration?')) return;
        setDeletingId(slotId);
        try {
            await deleteStandbySlot(slotId);
            setStandbySlots(prev => prev.filter(s => s.id !== slotId));
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Failed to remove standby slot.');
        } finally {
            setDeletingId(null);
        }
    };

    /* ─── Render ─── */
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
            {/* Page header */}
            <div className="page-header">
                <h1 className="page-title">Backup &amp; Availability</h1>
                <p className="page-subtitle">
                    Let the team know when you&apos;re open to covering classes as a backup instructor.
                </p>
            </div>

            {/* ─── Section 1: General Preference ─── */}
            <section style={{ marginBottom: 'var(--space-xl)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-md)' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>General Teaching Preference</h2>
                    {prefSaving && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Saving…</span>
                    )}
                    {prefSaved && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>✓ Saved</span>
                    )}
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)', marginTop: 0 }}>
                    Your general preference helps us prioritize you for backup requests that match your timings.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                    {PREF_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => handleSavePref(opt.value)}
                            disabled={prefSaving}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-start',
                                gap: '4px',
                                padding: '14px 16px',
                                borderRadius: 'var(--radius-md)',
                                border: `2px solid ${preference === opt.value ? 'var(--primary)' : 'var(--border-light)'}`,
                                background: preference === opt.value ? 'var(--primary-bg, rgba(99,102,241,0.08))' : 'var(--bg-card)',
                                cursor: prefSaving ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease',
                                textAlign: 'left',
                                opacity: prefSaving ? 0.7 : 1,
                                boxShadow: preference === opt.value ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none',
                            }}
                        >
                            <span style={{ fontSize: '1.375rem', lineHeight: 1 }}>{opt.emoji}</span>
                            <span style={{
                                fontWeight: 700,
                                fontSize: '0.875rem',
                                color: preference === opt.value ? 'var(--primary)' : 'var(--text-primary)',
                            }}>
                                {opt.label}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{opt.desc}</span>
                        </button>
                    ))}
                </div>
            </section>

            <div style={{ height: '1px', background: 'var(--border-subtle)', marginBottom: 'var(--space-xl)' }} />

            {/* ─── Section 2: Add Standby Slot ─── */}
            <section style={{ marginBottom: 'var(--space-xl)' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>Opt-in as Backup</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)', marginTop: 0 }}>
                    Declare specific dates when you&apos;re available to cover a class if needed. Admins will see your standby slots when assigning replacements.
                </p>

                <form onSubmit={handleAddSlot}>
                    <div style={{
                        padding: 'var(--space-lg)',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-lg)',
                    }}>
                        {formError && (
                            <div style={{
                                marginBottom: 'var(--space-md)',
                                padding: '10px 14px',
                                background: 'var(--danger-bg)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--danger)',
                                fontSize: '0.8125rem',
                            }}>
                                {formError}
                            </div>
                        )}
                        {formSuccess && (
                            <div style={{
                                marginBottom: 'var(--space-md)',
                                padding: '10px 14px',
                                background: 'var(--success-bg)',
                                border: '1px solid rgba(16,185,129,0.2)',
                                borderRadius: 'var(--radius-sm)',
                                color: 'var(--success)',
                                fontSize: '0.8125rem',
                            }}>
                                {formSuccess}
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                            {/* Start date */}
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label form-label-required">From</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={formStartDate}
                                    min={today}
                                    onChange={e => {
                                        setFormStartDate(e.target.value);
                                        if (formEndDate && e.target.value > formEndDate) setFormEndDate(e.target.value);
                                    }}
                                    required
                                />
                            </div>

                            {/* End date */}
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label form-label-required">To</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={formEndDate}
                                    min={formStartDate || today}
                                    onChange={e => setFormEndDate(e.target.value)}
                                    required
                                />
                            </div>

                            {/* Slot */}
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label form-label-required">Time Slot</label>
                                <select
                                    className="form-select"
                                    value={formSlot}
                                    onChange={e => setFormSlot(e.target.value as typeof formSlot)}
                                >
                                    <option value="morning">🌅 Morning</option>
                                    <option value="evening">🌇 Evening</option>
                                    <option value="both">🔄 Both</option>
                                </select>
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="form-group" style={{ marginBottom: '16px' }}>
                            <label className="form-label">Notes (optional)</label>
                            <input
                                type="text"
                                className="form-input"
                                value={formNotes}
                                onChange={e => setFormNotes(e.target.value)}
                                placeholder="e.g. Only available for NodeJS or React classes"
                                maxLength={200}
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={formSubmitting}
                            style={{ minWidth: '160px' }}
                        >
                            {formSubmitting ? 'Saving…' : '✅ Opt-in as Backup'}
                        </button>
                    </div>
                </form>
            </section>

            <div style={{ height: '1px', background: 'var(--border-subtle)', marginBottom: 'var(--space-xl)' }} />

            {/* ─── Section 3: Active Standby Slots ─── */}
            <section>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>
                    My Standby Slots
                    {standbySlots.length > 0 && (
                        <span style={{
                            marginLeft: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '99px',
                            background: 'var(--primary-bg, rgba(99,102,241,0.1))',
                            color: 'var(--primary)',
                        }}>
                            {standbySlots.length}
                        </span>
                    )}
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)', marginTop: 0 }}>
                    Active and upcoming standby declarations. Past slots are automatically hidden.
                </p>

                {standbySlots.length === 0 ? (
                    <div className="empty-state" style={{ padding: 'var(--space-xl) 0' }}>
                        <div className="empty-state-icon" style={{ fontSize: '1.75rem', marginBottom: '8px' }}>📅</div>
                        <p className="empty-state-text">No active standby slots. Use the form above to opt-in.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {standbySlots.map(slot => (
                            <div
                                key={slot.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '16px',
                                    padding: '14px 18px',
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-light)',
                                    borderRadius: 'var(--radius-md)',
                                    flexWrap: 'wrap',
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '200px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                                            {formatDateDisplay(slot.start_date)}
                                            {slot.start_date !== slot.end_date && (
                                                <> → {formatDateDisplay(slot.end_date)}</>
                                            )}
                                        </span>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            padding: '2px 10px',
                                            borderRadius: '99px',
                                            background: 'var(--surface-elevated)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--border-subtle)',
                                        }}>
                                            {slotLabel(slot.slot)}
                                        </span>
                                        <span style={{
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            padding: '2px 10px',
                                            borderRadius: '99px',
                                            background: slot.status === 'assigned'
                                                ? 'rgba(16,185,129,0.1)'
                                                : 'rgba(99,102,241,0.1)',
                                            color: slot.status === 'assigned'
                                                ? 'var(--success)'
                                                : 'var(--primary)',
                                            border: `1px solid ${slot.status === 'assigned' ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.25)'}`,
                                        }}>
                                            {slot.status === 'assigned' ? '✓ Assigned' : 'Awaiting Class'}
                                        </span>
                                    </div>
                                    {slot.notes && (
                                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                                            {slot.notes}
                                        </span>
                                    )}
                                </div>

                                {slot.status !== 'assigned' && (
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => handleDeleteSlot(slot.id)}
                                        disabled={deletingId === slot.id}
                                        style={{
                                            color: 'var(--danger)',
                                            borderColor: 'var(--danger)',
                                            opacity: deletingId === slot.id ? 0.5 : 1,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {deletingId === slot.id ? 'Removing…' : 'Cancel Standby'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default BackupAvailability;
