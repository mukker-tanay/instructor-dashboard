import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

type SlotType = 'morning' | 'evening' | 'both';

export type StandbyGroup = {
    start_date: string;
    end_date: string;
    slot: SlotType;
    status: BackupAvailability['status'];
    notes?: string;
    ids: string[];
};

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
    return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}, ${y}`;
};

const slotLabel = (slot: string) =>
    slot === 'morning' ? '🌅 Morning' : slot === 'evening' ? '🌇 Evening' : slot === 'both' ? '🔄 Both' : slot;

const addOneDay = (iso: string): string => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + 1);
    return toISO(dt.getFullYear(), dt.getMonth(), dt.getDate());
};

/** One active row per calendar day (single-day rows). */
const dedupeStandbySlots = (slots: BackupAvailability[]): BackupAvailability[] => {
    const byKey = new Map<string, BackupAvailability>();
    for (const s of slots) {
        if (s.start_date !== s.end_date) {
            byKey.set(`range:${s.id}`, s);
            continue;
        }
        const key = `day:${s.start_date}`;
        const prev = byKey.get(key);
        if (!prev || String(s.created_at || '') > String(prev.created_at || '')) {
            byKey.set(key, s);
        }
    }
    return [...byKey.values()].sort((a, b) => a.start_date.localeCompare(b.start_date));
};

/** Group consecutive single-day standbys with same slot, status, and notes. */
export const groupConsecutiveStandbys = (slots: BackupAvailability[]): StandbyGroup[] => {
    const groups: StandbyGroup[] = [];
    const rangeRows = slots.filter(s => s.start_date !== s.end_date);
    for (const r of rangeRows) {
        groups.push({
            start_date: r.start_date,
            end_date: r.end_date,
            slot: r.slot as SlotType,
            status: r.status,
            notes: r.notes,
            ids: [r.id],
        });
    }

    const singles = slots
        .filter(s => s.start_date === s.end_date)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));

    let current: StandbyGroup | null = null;
    for (const day of singles) {
        const slot = day.slot as SlotType;
        if (!current) {
            current = {
                start_date: day.start_date,
                end_date: day.end_date,
                slot,
                status: day.status,
                notes: day.notes,
                ids: [day.id],
            };
            continue;
        }
        const consecutive = addOneDay(current.end_date) === day.start_date;
        const sameMeta =
            day.slot === current.slot &&
            day.status === current.status &&
            (day.notes || '') === (current.notes || '');

        if (consecutive && sameMeta) {
            current.end_date = day.end_date;
            current.ids.push(day.id);
        } else {
            groups.push(current);
            current = {
                start_date: day.start_date,
                end_date: day.end_date,
                slot,
                status: day.status,
                notes: day.notes,
                ids: [day.id],
            };
        }
    }
    if (current) groups.push(current);

    return groups.sort((a, b) => a.start_date.localeCompare(b.start_date));
};

const formatGroupDates = (g: StandbyGroup) =>
    g.start_date === g.end_date
        ? fmtShort(g.start_date)
        : `${fmtShort(g.start_date)} → ${fmtShort(g.end_date)}`;

/* ─── Component ─── */
const BackupAvailability: React.FC = () => {
    const todayISO  = new Date().toISOString().split('T')[0];
    const todayDate = new Date();

    const [preference, setPreference] = useState<SlotPreference['general_preference']>('none');
    const [prefNotes,  setPrefNotes]  = useState('');
    const [prefSaving, setPrefSaving] = useState(false);
    const [prefSaved,  setPrefSaved]  = useState(false);

    const [standbySlots, setStandbySlots] = useState<BackupAvailability[]>([]);
    const [loading,      setLoading]      = useState(true);

    const [classMap, setClassMap] = useState<Record<string, ('morning'|'evening')[]>>({});

    const [viewYear,  setViewYear]  = useState(todayDate.getFullYear());
    const [viewMonth, setViewMonth] = useState(todayDate.getMonth());

    const [selectedDays,    setSelectedDays]    = useState<Set<string>>(new Set());
    const [panelSlot,       setPanelSlot]       = useState<SlotType>('morning');
    const [panelNotes,      setPanelNotes]      = useState('');
    const [panelSubmitting, setPanelSubmitting] = useState(false);
    const [panelResult,     setPanelResult]     = useState<{ created: number; updated: number; skipped: number } | null>(null);
    const [panelError,      setPanelError]      = useState('');

    const dedupedSlots = useMemo(() => dedupeStandbySlots(standbySlots), [standbySlots]);
    const standbyByDay = useMemo(() => {
        const map: Record<string, BackupAvailability> = {};
        for (const s of dedupedSlots) {
            if (s.start_date !== s.end_date) {
                let d = s.start_date;
                while (d <= s.end_date) {
                    map[d] = s;
                    d = addOneDay(d);
                }
            } else {
                map[s.start_date] = s;
            }
        }
        return map;
    }, [dedupedSlots]);

    const standbyGroups = useMemo(() => groupConsecutiveStandbys(dedupedSlots), [dedupedSlots]);

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

    /* Sync panel slot/notes when selection changes */
    useEffect(() => {
        if (selectedDays.size === 0) return;
        const ordered = [...selectedDays].sort();
        const withStandby = ordered.map(iso => standbyByDay[iso]).filter(Boolean) as BackupAvailability[];
        if (withStandby.length === 0) return;

        const slots = new Set(withStandby.map(s => s.slot));
        if (slots.size === 1) {
            setPanelSlot([...slots][0] as SlotType);
        }
        const notesSet = new Set(withStandby.map(s => s.notes || ''));
        if (notesSet.size === 1) {
            setPanelNotes([...notesSet][0]);
        }
    }, [selectedDays, standbyByDay]);

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

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    };

    const isFullyBlocked = (iso: string) => {
        const b = classMap[iso] || [];
        return b.includes('morning') && b.includes('evening');
    };

    const toggleDay = (iso: string) => {
        if (iso < todayISO || isFullyBlocked(iso)) return;
        setSelectedDays(prev => {
            const next = new Set(prev);
            if (next.has(iso)) next.delete(iso);
            else next.add(iso);
            return next;
        });
        setPanelResult(null);
        setPanelError('');
    };

    const clearSelection = () => {
        setSelectedDays(new Set());
        setPanelNotes('');
        setPanelResult(null);
        setPanelError('');
    };

    const slotBlockedOnAll = (slot: SlotType): boolean => {
        if (selectedDays.size === 0) return false;
        return [...selectedDays].every(iso => {
            const b = classMap[iso] || [];
            if (slot === 'morning') return b.includes('morning');
            if (slot === 'evening') return b.includes('evening');
            return b.length > 0;
        });
    };

    const blockedForSlot = (iso: string, slot: SlotType): boolean => {
        const b = classMap[iso] || [];
        if (slot === 'morning') return b.includes('morning');
        if (slot === 'evening') return b.includes('evening');
        return b.length > 0;
    };

    const selectedSorted = useMemo(() => [...selectedDays].sort(), [selectedDays]);

    const actionableDays = useMemo(
        () => selectedSorted.filter(iso => !blockedForSlot(iso, panelSlot)),
        [selectedSorted, panelSlot, classMap]
    );

    const skippedCount = selectedSorted.length - actionableDays.length;

    const selectionAnalysis = useMemo(() => {
        let createCount = 0;
        let updateCount = 0;
        let unchangedCount = 0;
        let assignedCount = 0;
        let removableCount = 0;

        for (const iso of selectedSorted) {
            const standby = standbyByDay[iso];
            if (standby?.status === 'assigned') {
                assignedCount++;
                continue;
            }
            if (standby?.status === 'active') {
                removableCount++;
                if (blockedForSlot(iso, panelSlot)) continue;
                if (standby.slot === panelSlot && (standby.notes || '') === panelNotes.trim()) {
                    unchangedCount++;
                } else {
                    updateCount++;
                }
                continue;
            }
            if (!blockedForSlot(iso, panelSlot)) createCount++;
        }

        return { createCount, updateCount, unchangedCount, assignedCount, removableCount };
    }, [selectedSorted, standbyByDay, panelSlot, panelNotes, classMap]);

    const submitLabel = useMemo(() => {
        const { createCount, updateCount, unchangedCount } = selectionAnalysis;
        const actionCount = createCount + updateCount;
        if (actionCount === 0) {
            if (unchangedCount > 0) return 'Already set for this slot';
            return 'All dates blocked';
        }
        if (updateCount > 0 && createCount === 0) {
            return `Change availability (${updateCount} date${updateCount !== 1 ? 's' : ''})`;
        }
        if (updateCount > 0 && createCount > 0) {
            return `Save availability (${createCount} new, ${updateCount} update${updateCount !== 1 ? 's' : ''})`;
        }
        return `Opt-in for ${createCount} date${createCount !== 1 ? 's' : ''}`;
    }, [selectionAnalysis]);

    const canSubmit =
        !panelSubmitting &&
        selectionAnalysis.createCount + selectionAnalysis.updateCount > 0;

    const canRemoveStandby =
        selectionAnalysis.removableCount > 0 &&
        selectionAnalysis.removableCount ===
            selectedSorted.filter(iso => standbyByDay[iso]?.status === 'active').length;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setPanelSubmitting(true);
        setPanelError('');
        setPanelResult(null);

        let created = 0;
        let updated = 0;
        const errors: string[] = [];

        await Promise.all(
            actionableDays.map(async iso => {
                const existing = standbyByDay[iso];
                if (existing?.status === 'active' && existing.slot === panelSlot && (existing.notes || '') === panelNotes.trim()) {
                    return;
                }
                try {
                    const res = await createStandbySlot({
                        start_date: iso,
                        end_date: iso,
                        slot: panelSlot,
                        notes: panelNotes.trim(),
                    });
                    if (res.updated) updated++;
                    else created++;
                } catch (err: unknown) {
                    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                    errors.push(detail || iso);
                }
            })
        );

        if (errors.length) setPanelError(`Some slots failed: ${errors.join(', ')}`);
        setPanelResult({
            created,
            updated,
            skipped: skippedCount + errors.length,
        });
        setPanelSubmitting(false);
        fetchData();
        setTimeout(() => {
            setSelectedDays(new Set());
            setPanelResult(null);
        }, 2500);
    };

    const handleRemoveSelected = async () => {
        const toRemove = selectedSorted
            .map(iso => standbyByDay[iso])
            .filter((s): s is BackupAvailability => !!s && s.status === 'active' && s.start_date === s.end_date);

        if (toRemove.length === 0) return;
        const label = toRemove.length === 1
            ? fmtShort(toRemove[0].start_date)
            : `${toRemove.length} dates`;
        if (!window.confirm(`Remove backup standby for ${label}?`)) return;

        setPanelSubmitting(true);
        setPanelError('');
        try {
            const seen = new Set<string>();
            for (const slot of toRemove) {
                if (seen.has(slot.start_date)) continue;
                seen.add(slot.start_date);
                await deleteStandbySlot(slot.id);
            }
            setStandbySlots(prev =>
                prev.filter(s => !seen.has(s.start_date) || s.status !== 'active')
            );
            clearSelection();
            fetchData();
        } catch (err: unknown) {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setPanelError(detail || 'Failed to remove standby.');
        } finally {
            setPanelSubmitting(false);
        }
    };

    const jumpToGroup = (g: StandbyGroup) => {
        const [y, m] = g.start_date.split('-').map(Number);
        setViewYear(y);
        setViewMonth(m - 1);
        setSelectedDays(new Set(g.ids.length === 1 && g.start_date === g.end_date
            ? [g.start_date]
            : (() => {
                const days: string[] = [];
                let d = g.start_date;
                while (d <= g.end_date) {
                    days.push(d);
                    d = addOneDay(d);
                }
                return days;
            })()));
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-container"><div className="spinner" /></div>
            </div>
        );
    }

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay    = getFirstDay(viewYear, viewMonth);
    const gridCells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (gridCells.length % 7 !== 0) gridCells.push(null);

    const panelHasStandby = selectionAnalysis.removableCount > 0 || selectionAnalysis.assignedCount > 0;

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">Backup &amp; Availability</h1>
                <p className="page-subtitle">
                    Let the team know when you're open to covering classes as a backup instructor.
                </p>
            </div>

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

            <section style={{ marginBottom: 'var(--space-xl)' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>Backup calendar</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)', marginTop: 0 }}>
                    Select dates on the calendar to opt in, change your slot, or remove standby. Manage everything from the panel — no need to scroll.
                </p>

                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

                    <div style={{
                        flex: '1 1 300px', minWidth: '290px',
                        background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                            <button type="button" onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', fontSize: '1.1rem', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}>‹</button>
                            <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
                            <button type="button" onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 10px', fontSize: '1.1rem', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', lineHeight: 1 }}>›</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '6px' }}>
                            {DAY_NAMES.map(d => (
                                <div key={d} style={{ textAlign: 'center', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', padding: '2px 0' }}>{d}</div>
                            ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
                            {gridCells.map((day, i) => {
                                if (day === null) return <div key={`e${i}`} />;
                                const iso = toISO(viewYear, viewMonth, day);
                                const isPast = iso < todayISO;
                                const isToday = iso === todayISO;
                                const isSelected = selectedDays.has(iso);
                                const fullyBlk = isFullyBlocked(iso);
                                const standby = standbyByDay[iso];
                                const hasStandby = !!standby && standby.status === 'active';
                                const blocked = classMap[iso] || [];

                                return (
                                    <button
                                        type="button"
                                        key={iso}
                                        onClick={() => toggleDay(iso)}
                                        title={
                                            fullyBlk ? 'Classes at all times — unavailable'
                                                : hasStandby ? `${iso} — on standby (${standby!.slot})`
                                                : isPast ? 'Past date' : iso
                                        }
                                        style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                                            padding: '5px 2px', borderRadius: 'var(--radius-sm)',
                                            border: isSelected
                                                ? '2px solid var(--primary)'
                                                : hasStandby
                                                    ? '1.5px solid rgba(139,92,246,0.55)'
                                                    : isToday
                                                        ? '1.5px solid var(--primary)'
                                                        : '1.5px solid transparent',
                                            background: isSelected
                                                ? 'rgba(99,102,241,0.18)'
                                                : hasStandby
                                                    ? 'rgba(139,92,246,0.1)'
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
                                            fontWeight: isToday || isSelected || hasStandby ? 700 : 400,
                                            color: isSelected ? 'var(--primary)' : hasStandby ? '#7c3aed' : isToday ? 'var(--primary)' : 'var(--text-primary)',
                                        }}>{day}</span>
                                        <div style={{ display: 'flex', gap: '2px', height: '5px', alignItems: 'center' }}>
                                            {blocked.includes('morning') && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />}
                                            {blocked.includes('evening') && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />}
                                            {standby && (standby.slot === 'morning' || standby.slot === 'both') && (
                                                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                                            )}
                                            {standby && (standby.slot === 'evening' || standby.slot === 'both') && (
                                                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#8b5cf6', flexShrink: 0 }} />
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

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

                    <div style={{
                        flex: '0 0 280px', minWidth: '240px',
                        background: 'var(--bg-card)',
                        border: `1.5px solid ${selectedDays.size > 0 ? 'var(--primary)' : 'var(--border-light)'}`,
                        borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)',
                        transition: 'border-color 0.2s ease',
                    }}>
                        {selectedDays.size === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '10px' }}>📅</div>
                                <p style={{ fontSize: '0.8125rem', margin: 0, lineHeight: 1.5 }}>
                                    Click dates on the calendar to add, change, or remove standby.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            {panelHasStandby ? 'Manage standby' : 'Offer backup standby'}
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginTop: '2px' }}>
                                            {selectedDays.size} {selectedDays.size === 1 ? 'date' : 'dates'} selected
                                        </div>
                                    </div>
                                    <button type="button" onClick={clearSelection} aria-label="Clear selection" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}>×</button>
                                </div>

                                <div style={{
                                    maxHeight: '140px', overflowY: 'auto', marginBottom: '14px',
                                    padding: '8px 10px', background: 'var(--surface-elevated, var(--bg-page))',
                                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
                                }}>
                                    {selectedSorted.map(iso => {
                                        const b = classMap[iso] || [];
                                        const standby = standbyByDay[iso];
                                        const willSkip = blockedForSlot(iso, panelSlot);
                                        const isAssigned = standby?.status === 'assigned';
                                        return (
                                            <div key={iso} style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                fontSize: '0.8rem', padding: '3px 0', gap: '6px',
                                                color: willSkip || isAssigned ? 'var(--text-muted)' : 'var(--text-primary)',
                                                textDecoration: willSkip ? 'line-through' : 'none',
                                            }}>
                                                <span>{fmtShort(iso)}</span>
                                                <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                    {standby?.status === 'active' && (
                                                        <span style={{ fontSize: '0.6rem', background: 'rgba(139,92,246,0.12)', color: '#7c3aed', padding: '1px 5px', borderRadius: '99px', fontWeight: 600 }}>
                                                            {slotLabel(standby.slot).replace(/^.\s/, '')}
                                                        </span>
                                                    )}
                                                    {isAssigned && (
                                                        <span style={{ fontSize: '0.6rem', background: 'rgba(16,185,129,0.12)', color: 'var(--success)', padding: '1px 5px', borderRadius: '99px', fontWeight: 600 }}>Assigned</span>
                                                    )}
                                                    {b.includes('morning') && <span style={{ fontSize: '0.6rem', background: '#fef2f2', color: '#ef4444', padding: '1px 5px', borderRadius: '99px', fontWeight: 600 }}>AM class</span>}
                                                    {b.includes('evening') && <span style={{ fontSize: '0.6rem', background: '#fff7ed', color: '#f97316', padding: '1px 5px', borderRadius: '99px', fontWeight: 600 }}>PM class</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {panelError && (
                                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '0.8rem' }}>
                                        {panelError}
                                    </div>
                                )}
                                {panelResult && (
                                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'var(--success-bg)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '0.8rem' }}>
                                        ✅
                                        {panelResult.created > 0 && ` ${panelResult.created} added`}
                                        {panelResult.updated > 0 && ` ${panelResult.updated} updated`}
                                        {panelResult.skipped > 0 && ` · ${panelResult.skipped} skipped`}
                                    </div>
                                )}

                                {selectionAnalysis.assignedCount > 0 && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px', padding: '6px 10px', background: 'var(--surface-elevated, var(--bg-page))', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                                        {selectionAnalysis.assignedCount} date{selectionAnalysis.assignedCount !== 1 ? 's' : ''} already assigned to a class — cannot change or remove.
                                    </div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px' }}>
                                    {(['morning', 'evening', 'both'] as const).map(s => {
                                        const disabledForAll = slotBlockedOnAll(s);
                                        const skippedForThis = selectedSorted.filter(iso => blockedForSlot(iso, s)).length;
                                        const isActive = panelSlot === s && !disabledForAll;
                                        return (
                                            <label key={s} style={{
                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                                                border: `1.5px solid ${isActive ? 'var(--primary)' : 'var(--border-subtle)'}`,
                                                background: isActive ? 'rgba(99,102,241,0.08)' : 'transparent',
                                                cursor: disabledForAll ? 'not-allowed' : 'pointer',
                                                opacity: disabledForAll ? 0.4 : 1,
                                            }}>
                                                <input
                                                    type="radio"
                                                    name="panelSlot"
                                                    value={s}
                                                    checked={panelSlot === s}
                                                    disabled={disabledForAll}
                                                    onChange={() => setPanelSlot(s)}
                                                    style={{ accentColor: 'var(--primary)', margin: 0, flexShrink: 0 }}
                                                />
                                                <span style={{ fontSize: '0.875rem', fontWeight: 500, flex: 1 }}>
                                                    {s === 'morning' ? '🌅 Morning' : s === 'evening' ? '🌇 Evening' : '🔄 Both'}
                                                </span>
                                                {skippedForThis > 0 && !disabledForAll && (
                                                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>skip {skippedForThis}</span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>

                                {skippedCount > 0 && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px', padding: '6px 10px', background: 'var(--surface-elevated, var(--bg-page))', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                                        ⚠️ {skippedCount} date{skippedCount !== 1 ? 's' : ''} skipped (class already scheduled for this slot)
                                    </div>
                                )}

                                <div style={{ marginBottom: '12px' }}>
                                    <textarea
                                        rows={2}
                                        className="form-input"
                                        placeholder="Notes (optional)"
                                        value={panelNotes}
                                        onChange={e => setPanelNotes(e.target.value)}
                                        maxLength={200}
                                        disabled={selectionAnalysis.createCount + selectionAnalysis.updateCount === 0 && selectionAnalysis.unchangedCount > 0}
                                        style={{ resize: 'none', fontSize: '0.8125rem', width: '100%', boxSizing: 'border-box' }}
                                    />
                                </div>

                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleSubmit}
                                    disabled={!canSubmit}
                                    style={{ width: '100%', fontWeight: 700, marginBottom: '8px' }}
                                >
                                    {panelSubmitting ? 'Saving…' : submitLabel}
                                </button>

                                {selectionAnalysis.removableCount > 0 && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={handleRemoveSelected}
                                        disabled={panelSubmitting}
                                        style={{ width: '100%', color: 'var(--danger)', borderColor: 'var(--danger)', fontWeight: 600 }}
                                    >
                                        {panelSubmitting
                                            ? 'Working…'
                                            : canRemoveStandby && selectedSorted.length === selectionAnalysis.removableCount
                                                ? `Remove standby (${selectionAnalysis.removableCount} date${selectionAnalysis.removableCount !== 1 ? 's' : ''})`
                                                : `Remove standby from selected dates (${selectionAnalysis.removableCount})`}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </section>

            {standbyGroups.length > 0 && (
                <>
                    <div style={{ height: '1px', background: 'var(--border-subtle)', marginBottom: 'var(--space-xl)' }} />
                    <section>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>
                            My standby overview
                            <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: 'var(--primary-bg, rgba(99,102,241,0.1))', color: 'var(--primary)' }}>
                                {standbyGroups.length} {standbyGroups.length === 1 ? 'block' : 'blocks'}
                            </span>
                        </h2>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)', marginTop: 0 }}>
                            Consecutive dates with the same slot are grouped. Click a row to jump to those dates on the calendar and manage them there.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {standbyGroups.map(g => (
                                <button
                                    type="button"
                                    key={`${g.start_date}-${g.end_date}-${g.slot}-${g.ids[0]}`}
                                    onClick={() => jumpToGroup(g)}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                                        padding: '12px 16px', background: 'var(--bg-card)',
                                        border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer', textAlign: 'left', width: '100%',
                                        transition: 'border-color 0.15s, background 0.15s',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{formatGroupDates(g)}</span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: '99px', background: 'var(--surface-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                                            {slotLabel(g.slot)}
                                        </span>
                                        {g.start_date !== g.end_date && (
                                            <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                                                {g.ids.length} days
                                            </span>
                                        )}
                                    </div>
                                    <span style={{
                                        fontSize: '0.75rem', fontWeight: 700, padding: '2px 10px', borderRadius: '99px', flexShrink: 0,
                                        background: g.status === 'assigned' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                                        color: g.status === 'assigned' ? 'var(--success)' : 'var(--primary)',
                                    }}>
                                        {g.status === 'assigned' ? '✓ Assigned' : 'Awaiting'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
};

export default BackupAvailability;
