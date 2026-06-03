import React, { useState, useEffect, useCallback } from 'react';
import {
    getAvailabilityMe,
    getClasses,
    createStandbySlot,
    deleteStandbySlot,
    updateSlotPreferences,
} from '../../api/client';
import type { BackupAvailability, SlotPreference } from '../../types';

/* ─── Constants ─── */
const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const PREF_OPTIONS: { value: SlotPreference['general_preference']; label: string; emoji: string; desc: string }[] = [
    { value: 'morning', label: 'Morning', emoji: '🌅', desc: 'e.g. 7 AM – 12 PM' },
    { value: 'evening', label: 'Evening', emoji: '🌇', desc: 'e.g. 6 PM – 10 PM' },
    { value: 'both',    label: 'Both',    emoji: '🔄', desc: 'Flexible on timings' },
    { value: 'none',    label: 'None',    emoji: '🛑', desc: 'Not open to new classes' },
];

/* ─── Helpers ─── */
const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const getFirstDay    = (y: number, m: number) => new Date(y, m, 1).getDay();
const toISO = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

const normDate = (raw: string): string => {
    const s = String(raw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
        const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
        return `${yr}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
    }
    return '';
};

const timeToSlot = (raw: string): 'morning' | 'evening' | null => {
    const s = String(raw || '').toUpperCase().trim();
    if (!s) return null;
    if (s.includes('AM')) return 'morning';
    if (s.includes('PM')) return 'evening';
    const hm = s.match(/^(\d{1,2}):/);
    if (hm) return parseInt(hm[1], 10) < 14 ? 'morning' : 'evening';
    return null;
};

const fmtShort = (iso: string): string => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${MONTH_NAMES[m-1].slice(0,3)} ${d}, ${y}`;
};

const slotLabel = (slot: string) =>
    slot === 'morning' ? '🌅 Morning' : slot === 'evening' ? '🌇 Evening' : slot === 'both' ? '🔄 Both' : slot;

/* ─── Component ─── */
const BackupAvailability: React.FC = () => {
    const todayISO  = new Date().toISOString().split('T')[0];
    const todayDate = new Date();

    /* Preference */
    const [preference, setPreference] = useState<SlotPreference['general_preference']>('none');
    const [prefNotes,  setPrefNotes]  = useState('');
    const [prefSaving, setPrefSaving] = useState(false);
    const [prefSaved,  setPrefSaved]  = useState(false);

    /* Standby list */
    const [standbySlots, setStandbySlots] = useState<BackupAvailability[]>([]);
    const [loading,      setLoading]      = useState(true);
    const [deletingId,   setDeletingId]   = useState<string | null>(null);

    /* classMap: dateISO → ('morning'|'evening')[] */
    const [classMap, setClassMap] = useState<Record<string, ('morning'|'evening')[]>>({});

    /* Calendar nav */
    const [viewYear,  setViewYear]  = useState(todayDate.getFullYear());
    const [viewMonth, setViewMonth] = useState(todayDate.getMonth());

    /* Multi-select */
    const [selectedDays,    setSelectedDays]    = useState<Set<string>>(new Set());
    const [panelSlot,       setPanelSlot]       = useState<'morning'|'evening'|'both'>('morning');
    const [panelNotes,      setPanelNotes]      = useState('');
    const [panelSubmitting, setPanelSubmitting] = useState(false);
    const [panelResult,     setPanelResult]     = useState<{ created: number; skipped: number } | null>(null);
    const [panelError,      setPanelError]      = useState('');

    /* ─── Fetch ─── */
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [availData, classData] = await Promise.all([
                getAvailabilityMe(),
                getClasses('upcoming', 100, 0),
            ]);
            if (availData.preferences) {
                setPreference(availData.preferences.general_preference || 'none');
                setPrefNotes(availData.preferences.notes || '');
            }
            setStandbySlots(availData.standby_slots || []);

            const map: Record<string, ('morning'|'evening')[]> = {};
            for (const cls of classData.classes) {
                const dateISO = normDate(cls.class_date);
                if (!dateISO) continue;
                const slot = timeToSlot(cls.time_of_day);
                if (!slot) continue;
                if (!map[dateISO]) map[dateISO] = [];
                if (!map[dateISO].includes(slot)) map[dateISO].push(slot);
            }
            setClassMap(map);
        } catch (err) {
            console.error('Failed to fetch availability data', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    /* ─── Preference save ─── */
    const handleSavePref = async (newPref: SlotPreference['general_preference']) => {
        setPreference(newPref);
        setPrefSaving(true); setPrefSaved(false);
        try {
            await updateSlotPreferences({ general_preference: newPref, notes: prefNotes });
            setPrefSaved(true);
            setTimeout(() => setPrefSaved(false), 2500);
        } catch (err) {
            console.error('Failed to save preference', err);
        } finally { setPrefSaving(false); }
    };

    /* ─── Calendar nav ─── */
    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    };

    /* ─── Day toggle ─── */
    const isFullyBlocked = (iso: string) => {
        const b = classMap[iso] || [];
        return b.includes('morning') && b.includes('evening');
    };

    const toggleDay = (iso: string) => {
        if (iso < todayISO || isFullyBlocked(iso)) return;
        setSelectedDays(prev => {
            const next = new Set(prev);
            if (next.has(iso)) next.delete(iso); else next.add(iso);
            return next;
        });
        setPanelResult(null);
        setPanelError('');
    };

    const clearSelection = () => {
        setSelectedDays(new Set());
        setPanelResult(null);
        setPanelError('');
    };

    /* ─── Panel slot availability across selected days ─── */
    const slotBlockedOnAll = (slot: 'morning'|'evening'|'both'): boolean => {
        if (selectedDays.size === 0) return false;
        return [...selectedDays].every(iso => {
            const b = classMap[iso] || [];
            if (slot === 'morning') return b.includes('morning');
            if (slot === 'evening') return b.includes('evening');
            return b.length > 0; // 'both' blocked if any class
        });
    };

    const blockedForSlot = (iso: string, slot: 'morning'|'evening'|'both'): boolean => {
        const b = classMap[iso] || [];
        if (slot === 'morning') return b.includes('morning');
        if (slot === 'evening') return b.includes('evening');
        return b.length > 0;
    };

    const skippedCount = [...selectedDays].filter(iso => blockedForSlot(iso, panelSlot)).length;
    const availableCount = selectedDays.size - skippedCount;

    /* ─── Submit ─── */
    const handleSubmit = async () => {
        if (availableCount === 0) return;
        setPanelSubmitting(true);
        setPanelError('');
        setPanelResult(null);

        const daysToCreate = [...selectedDays].filter(iso => !blockedForSlot(iso, panelSlot));
        let created = 0;
        const errors: string[] = [];

        await Promise.all(
            daysToCreate.map(async iso => {
                try {
                    await createStandbySlot({ start_date: iso, end_date: iso, slot: panelSlot, notes: panelNotes.trim() });
                    created++;
                } catch (err: any) {
                    errors.push(err.response?.data?.detail || iso);
                }
            })
        );

        if (errors.length) setPanelError(`Some slots failed: ${errors.join(', ')}`);
        setPanelResult({ created, skipped: skippedCount + errors.length });
        setPanelSubmitting(false);
        setPanelNotes('');
        fetchData();

        // Clear selection after short delay
        setTimeout(() => {
            setSelectedDays(new Set());
            setPanelResult(null);
        }, 2500);
    };

    /* ─── Delete slot ─── */
    const handleDeleteSlot = async (slotId: string) => {
        if (!window.confirm('Remove this standby declaration?')) return;
        setDeletingId(slotId);
        try {
            await deleteStandbySlot(slotId);
            setStandbySlots(prev => prev.filter(s => s.id !== slotId));
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Failed to remove standby slot.');
        } finally { setDeletingId(null); }
    };

    /* ─── Loading ─── */
    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container"><div className="spinner" /></div>
            </div>
        );
    }

    /* ─── Calendar grid data ─── */
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay    = getFirstDay(viewYear, viewMonth);
    const gridCells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (gridCells.length % 7 !== 0) gridCells.push(null);

    const getDayStandby = (iso: string) =>
        standbySlots.filter(s => iso >= s.start_date && iso <= s.end_date);

    /* ─── Render ─── */
    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Backup &amp; Availability</h1>
                <p className="page-subtitle">
                    Let the team know when you're open to covering classes as a backup instructor.
                </p>
            </div>

            {/* ── Section 1: General Preference ── */}
            <section style={{ marginBottom: 'var(--space-xl)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-md)' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>General Teaching Preference</h2>
                    {prefSaving && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Saving…</span>}
                    {prefSaved  && <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>✓ Saved</span>}
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)', marginTop: 0 }}>
                    Helps us prioritise you for backup requests that match your timings.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '12px' }}>
                    {PREF_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => handleSavePref(opt.value)} disabled={prefSaving}
                            style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px',
                                padding: '14px 16px', borderRadius: 'var(--radius-md)',
                                border: `2px solid ${preference === opt.value ? 'var(--primary)' : 'var(--border-light)'}`,
                                background: preference === opt.value ? 'var(--primary-bg, rgba(99,102,241,0.08))' : 'var(--bg-card)',
                                cursor: prefSaving ? 'not-allowed' : 'pointer', transition: 'all 0.15s ease',
                                textAlign: 'left', opacity: prefSaving ? 0.7 : 1,
                                boxShadow: preference === opt.value ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none',
                            }}>
                            <span style={{ fontSize: '1.375rem', lineHeight: 1 }}>{opt.emoji}</span>
                            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: preference === opt.value ? 'var(--primary)' : 'var(--text-primary)' }}>{opt.label}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{opt.desc}</span>
                        </button>
                    ))}
                </div>
            </section>

            <div style={{ height: '1px', background: 'var(--border-subtle)', marginBottom: 'var(--space-xl)' }} />

            {/* ── Section 2: Calendar ── */}
            <section style={{ marginBottom: 'var(--space-xl)' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>Opt-in as Backup</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)', marginTop: 0 }}>
                    Click one or more dates to select them, then choose your available time slot in the panel.
                </p>

                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

                    {/* ── Calendar ── */}
                    <div style={{
                        flex: '1 1 300px', minWidth: '290px',
                        background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)',
                    }}>
                        {/* Month nav */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                            <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', fontSize: '1.1rem', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}>‹</button>
                            <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
                            <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', fontSize: '1.1rem', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}>›</button>
                        </div>

                        {/* Day headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '6px' }}>
                            {DAY_NAMES.map(d => (
                                <div key={d} style={{ textAlign: 'center', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', padding: '2px 0' }}>{d}</div>
                            ))}
                        </div>

                        {/* Day grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
                            {gridCells.map((day, i) => {
                                if (day === null) return <div key={`e${i}`} />;
                                const iso        = toISO(viewYear, viewMonth, day);
                                const isPast     = iso < todayISO;
                                const isToday    = iso === todayISO;
                                const isSelected = selectedDays.has(iso);
                                const fullyBlk   = isFullyBlocked(iso);
                                const dayStandby = getDayStandby(iso);
                                const blocked    = classMap[iso] || [];

                                return (
                                    <button
                                        key={iso}
                                        onClick={() => toggleDay(iso)}
                                        title={fullyBlk ? 'Classes at all times — unavailable' : isPast ? 'Past date' : iso}
                                        style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                                            padding: '5px 2px', borderRadius: 'var(--radius-sm)',
                                            border: isSelected
                                                ? '2px solid var(--primary)'
                                                : isToday
                                                    ? '1.5px solid var(--primary)'
                                                    : '1.5px solid transparent',
                                            background: isSelected
                                                ? 'rgba(99,102,241,0.18)'
                                                : isToday
                                                    ? 'rgba(99,102,241,0.06)'
                                                    : 'transparent',
                                            cursor: isPast || fullyBlk ? 'not-allowed' : 'pointer',
                                            opacity: isPast ? 0.3 : fullyBlk ? 0.45 : 1,
                                            transition: 'all 0.1s ease',
                                        }}
                                    >
                                        <span style={{
                                            fontSize: '0.8rem', lineHeight: 1,
                                            fontWeight: isToday || isSelected ? 700 : 400,
                                            color: isSelected ? 'var(--primary)' : isToday ? 'var(--primary)' : 'var(--text-primary)',
                                        }}>{day}</span>

                                        <div style={{ display: 'flex', gap: '2px', height: '5px', alignItems: 'center' }}>
                                            {blocked.includes('morning')  && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />}
                                            {blocked.includes('evening')  && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />}
                                            {dayStandby.some(s => s.slot === 'morning' || s.slot === 'both') && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />}
                                            {dayStandby.some(s => s.slot === 'evening' || s.slot === 'both') && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#8b5cf6', flexShrink: 0 }} />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                            {[
                                { color: '#ef4444', label: 'AM class' },
                                { color: '#f97316', label: 'PM class' },
                                { color: '#3b82f6', label: 'AM standby' },
                                { color: '#8b5cf6', label: 'PM standby' },
                            ].map(({ color, label }) => (
                                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                                    {label}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* ── Side panel ── */}
                    <div style={{
                        flex: '0 0 255px', minWidth: '230px',
                        background: 'var(--bg-card)',
                        border: `1.5px solid ${selectedDays.size > 0 ? 'var(--primary)' : 'var(--border-light)'}`,
                        borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)',
                        transition: 'border-color 0.2s ease',
                    }}>
                        {selectedDays.size === 0 ? (
                            /* Empty state */
                            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '10px' }}>📅</div>
                                <p style={{ fontSize: '0.8125rem', margin: 0, lineHeight: 1.5 }}>
                                    Click one or more dates on the calendar to get started.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Panel header */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            Offer Backup Standby
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginTop: '2px' }}>
                                            {selectedDays.size} {selectedDays.size === 1 ? 'date' : 'dates'} selected
                                        </div>
                                    </div>
                                    <button onClick={clearSelection} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}>×</button>
                                </div>

                                {/* Selected dates list */}
                                <div style={{
                                    maxHeight: '120px', overflowY: 'auto', marginBottom: '14px',
                                    padding: '8px 10px', background: 'var(--surface-elevated, var(--bg-page))',
                                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
                                }}>
                                    {[...selectedDays].sort().map(iso => {
                                        const b = classMap[iso] || [];
                                        const willSkip = blockedForSlot(iso, panelSlot);
                                        return (
                                            <div key={iso} style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                fontSize: '0.8rem', padding: '2px 0',
                                                color: willSkip ? 'var(--text-muted)' : 'var(--text-primary)',
                                                textDecoration: willSkip ? 'line-through' : 'none',
                                            }}>
                                                <span>{fmtShort(iso)}</span>
                                                <div style={{ display: 'flex', gap: '3px' }}>
                                                    {b.includes('morning') && <span style={{ fontSize: '0.6rem', background: '#fef2f2', color: '#ef4444', padding: '1px 5px', borderRadius: '99px', fontWeight: 600 }}>AM</span>}
                                                    {b.includes('evening') && <span style={{ fontSize: '0.6rem', background: '#fff7ed', color: '#f97316', padding: '1px 5px', borderRadius: '99px', fontWeight: 600 }}>PM</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Alerts */}
                                {panelError && (
                                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '0.8rem' }}>
                                        {panelError}
                                    </div>
                                )}
                                {panelResult && (
                                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'var(--success-bg)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '0.8rem' }}>
                                        ✅ Opted-in for {panelResult.created} date{panelResult.created !== 1 ? 's' : ''}
                                        {panelResult.skipped > 0 && ` · ${panelResult.skipped} skipped`}
                                    </div>
                                )}

                                {/* Slot options */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px' }}>
                                    {(['morning','evening','both'] as const).map(s => {
                                        const disabledForAll = slotBlockedOnAll(s);
                                        const skippedForThis = [...selectedDays].filter(iso => blockedForSlot(iso, s)).length;
                                        const isActive = panelSlot === s && !disabledForAll;

                                        return (
                                            <label key={s} style={{
                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                                                border: `1.5px solid ${isActive ? 'var(--primary)' : 'var(--border-subtle)'}`,
                                                background: isActive ? 'rgba(99,102,241,0.08)' : 'transparent',
                                                cursor: disabledForAll ? 'not-allowed' : 'pointer',
                                                opacity: disabledForAll ? 0.4 : 1,
                                                transition: 'all 0.1s',
                                            }}>
                                                <input
                                                    type="radio" name="panelSlot" value={s}
                                                    checked={panelSlot === s}
                                                    disabled={disabledForAll}
                                                    onChange={() => setPanelSlot(s)}
                                                    style={{ accentColor: 'var(--primary)', margin: 0, flexShrink: 0 }}
                                                />
                                                <span style={{ fontSize: '0.875rem', fontWeight: 500, flex: 1 }}>
                                                    {s === 'morning' ? '🌅 Morning' : s === 'evening' ? '🌇 Evening' : '🔄 Both'}
                                                </span>
                                                {skippedForThis > 0 && !disabledForAll && (
                                                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                        skip {skippedForThis}
                                                    </span>
                                                )}
                                                {disabledForAll && (
                                                    <span style={{ fontSize: '0.6875rem', color: 'var(--danger)', fontWeight: 600 }}>N/A</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>

                                {/* Skip notice */}
                                {skippedCount > 0 && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px', padding: '6px 10px', background: 'var(--surface-elevated, var(--bg-page))', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                                        ⚠️ {skippedCount} date{skippedCount !== 1 ? 's' : ''} will be skipped (class already scheduled)
                                    </div>
                                )}

                                {/* Notes */}
                                <div style={{ marginBottom: '14px' }}>
                                    <textarea
                                        rows={2}
                                        className="form-input"
                                        placeholder="Notes (optional)"
                                        value={panelNotes}
                                        onChange={e => setPanelNotes(e.target.value)}
                                        maxLength={200}
                                        disabled={availableCount === 0}
                                        style={{ resize: 'none', fontSize: '0.8125rem', width: '100%', boxSizing: 'border-box' }}
                                    />
                                </div>

                                {/* Submit */}
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSubmit}
                                    disabled={panelSubmitting || availableCount === 0}
                                    style={{ width: '100%', fontWeight: 700 }}
                                >
                                    {panelSubmitting
                                        ? 'Saving…'
                                        : availableCount === 0
                                            ? 'All dates blocked'
                                            : `✅ Opt-in for ${availableCount} date${availableCount !== 1 ? 's' : ''}`}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </section>

            <div style={{ height: '1px', background: 'var(--border-subtle)', marginBottom: 'var(--space-xl)' }} />

            {/* ── Section 3: Standby List ── */}
            <section>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>
                    My Standby Slots
                    {standbySlots.length > 0 && (
                        <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: 'var(--primary-bg, rgba(99,102,241,0.1))', color: 'var(--primary)' }}>
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
                        <p className="empty-state-text">No active standby slots. Select dates on the calendar above to opt-in.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {standbySlots.map(slot => (
                            <div key={slot.id} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
                                padding: '14px 18px', background: 'var(--bg-card)',
                                border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', flexWrap: 'wrap',
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '200px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                                            {slot.start_date === slot.end_date
                                                ? fmtShort(slot.start_date)
                                                : `${fmtShort(slot.start_date)} → ${fmtShort(slot.end_date)}`}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: '99px', background: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                                            {slotLabel(slot.slot)}
                                        </span>
                                        <span style={{
                                            fontSize: '0.75rem', fontWeight: 700, padding: '2px 10px', borderRadius: '99px',
                                            background: slot.status === 'assigned' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                                            color: slot.status === 'assigned' ? 'var(--success)' : 'var(--primary)',
                                            border: `1px solid ${slot.status === 'assigned' ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.25)'}`,
                                        }}>
                                            {slot.status === 'assigned' ? '✓ Assigned' : 'Awaiting Class'}
                                        </span>
                                    </div>
                                    {slot.notes && <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{slot.notes}</span>}
                                </div>
                                {slot.status !== 'assigned' && (
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => handleDeleteSlot(slot.id)}
                                        disabled={deletingId === slot.id}
                                        style={{ color: 'var(--danger)', borderColor: 'var(--danger)', opacity: deletingId === slot.id ? 0.5 : 1, whiteSpace: 'nowrap' }}
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
