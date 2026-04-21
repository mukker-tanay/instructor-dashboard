import React, { useState, useEffect, useRef } from 'react';
import { getInstructorOptions, createAdminUnavailabilityRequest } from '../../api/client';
import type { AdminUnavailabilityPayload } from '../../types';

interface SearchableDropdownProps {
    options: string[];
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({ options, value, onChange, placeholder = 'Select...', disabled }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSelect = (val: string) => {
        onChange(val);
        setQuery('');
        setOpen(false);
    };

    return (
        <div ref={ref} style={{ position: 'relative', width: '100%', minWidth: 0 }}>
            <div
                className="form-select"
                onClick={() => { if (!disabled) setOpen(o => !o); }}
                style={{
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', userSelect: 'none',
                    opacity: disabled ? 0.6 : 1, overflow: 'hidden',
                }}
            >
                <span style={{
                    color: value ? 'var(--text-primary)' : 'var(--text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    flex: '1 1 auto', minWidth: 0, display: 'block'
                }}>
                    {value || placeholder}
                </span>
            </div>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)', zIndex: 9999,
                    boxShadow: 'var(--shadow-lg)', maxHeight: '220px', display: 'flex', flexDirection: 'column',
                }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border-light)' }}>
                        <input
                            autoFocus className="form-input"
                            style={{ padding: '6px 10px', fontSize: '0.8125rem', margin: 0, backgroundImage: 'none' }}
                            placeholder="Search..."
                            value={query} onChange={e => setQuery(e.target.value)}
                            onClick={e => e.stopPropagation()}
                        />
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {filtered.length === 0 ? (
                            <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No results</div>
                        ) : filtered.map(o => (
                            <div key={o} onMouseDown={() => handleSelect(o)}
                                style={{
                                    padding: '9px 12px', cursor: 'pointer', fontSize: '0.875rem',
                                    background: value === o ? 'rgba(59,130,246,0.08)' : 'transparent',
                                    color: value === o ? 'var(--primary)' : 'var(--text-primary)',
                                    transition: 'background 0.15s', whiteSpace: 'normal',
                                    wordBreak: 'break-word', lineHeight: '1.4'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                onMouseLeave={e => (e.currentTarget.style.background = value === o ? 'rgba(59,130,246,0.12)' : 'transparent')}
                            >{o}</div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const AdminManualUnavailability: React.FC = () => {
    const [instructors, setInstructors] = useState<{name: string, email: string}[]>([]);
    
    // Form fields
    const [selectedInstructorDisplay, setSelectedInstructorDisplay] = useState('');
    const [program, setProgram] = useState('Academy');
    const [batchName, setBatchName] = useState('');
    const [sbatGroup, setSbatGroup] = useState('');
    const [moduleName, setModuleName] = useState('');
    const [classTitle, setClassTitle] = useState('');
    const [dateOfClass, setDateOfClass] = useState('');
    const [timeOfClass, setTimeOfClass] = useState('');
    const [classType, setClassType] = useState('Regular');
    const [reason, setReason] = useState('');
    const [topics, setTopics] = useState('');
    const [batchPulse, setBatchPulse] = useState('');
    const [teachingPace, setTeachingPace] = useState('');
    const [suggestedReplacement, setSuggestedReplacement] = useState('');
    const [otherComments, setOtherComments] = useState('');

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        getInstructorOptions().then(d => setInstructors(d.instructors)).catch(() => {});
    }, []);

    const resetForm = () => {
        setSelectedInstructorDisplay('');
        setProgram('Academy');
        setBatchName('');
        setSbatGroup('');
        setModuleName('');
        setClassTitle('');
        setDateOfClass('');
        setTimeOfClass('');
        setClassType('Regular');
        setReason('');
        setTopics('');
        setBatchPulse('');
        setTeachingPace('');
        setSuggestedReplacement('');
        setOtherComments('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!selectedInstructorDisplay || !batchName || !moduleName || !classTitle || !dateOfClass || !timeOfClass || !reason || !topics || !batchPulse || !teachingPace) {
            setError('Please fill in all mandatory fields.');
            return;
        }

        // Parse instructor display back to name/email
        const instMatch = selectedInstructorDisplay.match(/^(.*) \((.*)\)$/);
        let instructor_name = selectedInstructorDisplay;
        let instructor_email = '';
        if (instMatch) {
            instructor_name = instMatch[1];
            instructor_email = instMatch[2];
        } else {
            setError('Invalid instructor selection. Please select from the dropdown.');
            return;
        }

        setSubmitting(true);
        try {
            const payload: AdminUnavailabilityPayload = {
                instructor_email,
                instructor_name,
                program,
                batch_name: batchName,
                sbat_group_id: sbatGroup,
                module_name: moduleName,
                class_title: classTitle,
                date_of_class: dateOfClass,
                time_of_class: timeOfClass,
                class_type: classType,
                reason,
                topics_and_promises: topics,
                batch_pulse_persona: batchPulse,
                teaching_pace_style: teachingPace,
                suggested_replacement: suggestedReplacement,
                other_comments: otherComments
            };
            
            await createAdminUnavailabilityRequest(payload);
            setSuccess('Unavailability request manually raised and Slack notification sent!');
            resetForm();
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to submit request.');
        } finally {
            setSubmitting(false);
        }
    };

    const instructorOptions = instructors.map(i => `${i.name} (${i.email})`);
    const replacementOptions = Array.from(new Set(instructors.map(i => i.name))).filter(Boolean).sort();

    return (
        <div style={{ marginTop: '20px' }}>
            <div className="card" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>Manual Unavailability Request (Admin Override)</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '24px' }}>
                    Use this form to manually log an unavailability request for an instructor. This will actively trigger the Slack workflow and register the ticket without requiring a predefined class fetched from tracking endpoints.
                </p>

                {error && (
                    <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '0.875rem' }}>
                        {error}
                    </div>
                )}
                {success && (
                    <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--success-bg)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-md)', color: 'var(--success)', fontSize: '0.875rem' }}>
                        {success}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label className="form-label form-label-required">Target Instructor</label>
                        <SearchableDropdown
                            options={instructorOptions}
                            value={selectedInstructorDisplay}
                            onChange={setSelectedInstructorDisplay}
                            placeholder="Select the instructor who is unavailable..."
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label form-label-required">Program</label>
                        <select className="form-select" value={program} onChange={e => setProgram(e.target.value)}>
                            <option value="Academy">Academy</option>
                            <option value="DSML">DSML</option>
                            <option value="DevOps">DevOps</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label form-label-required">Batch Name</label>
                        <input className="form-input" value={batchName} onChange={e => setBatchName(e.target.value)} placeholder="e.g. Sept22_Beg_Java" />
                    </div>

                    <div className="form-group">
                        <label className="form-label form-label-required">Module Name</label>
                        <input className="form-input" value={moduleName} onChange={e => setModuleName(e.target.value)} placeholder="e.g. LLD" />
                    </div>

                    <div className="form-group">
                        <label className="form-label">SBAT Group ID</label>
                        <input className="form-input" value={sbatGroup} onChange={e => setSbatGroup(e.target.value)} placeholder="Optional" />
                    </div>

                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label className="form-label form-label-required">Class Title / Topic</label>
                        <input className="form-input" value={classTitle} onChange={e => setClassTitle(e.target.value)} placeholder="e.g. Intro to Arrays" />
                    </div>

                    <div className="form-group">
                        <label className="form-label form-label-required">Date of Class (MM/DD/YYYY)</label>
                        <input type="date" className="form-input" value={dateOfClass} onChange={e => setDateOfClass(e.target.value)} />
                    </div>

                    <div className="form-group">
                        <label className="form-label form-label-required">Time of Class (IST)</label>
                        <input type="time" className="form-input" value={timeOfClass} onChange={e => setTimeOfClass(e.target.value)} />
                    </div>

                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label className="form-label form-label-required">Reason for Unavailability</label>
                        <textarea className="form-textarea" value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain the reason..." rows={2} />
                    </div>

                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label className="form-label form-label-required">Topics & Promises from Previous Class</label>
                        <textarea className="form-textarea" value={topics} onChange={e => setTopics(e.target.value)} placeholder="What was covered or promised..." rows={2} />
                    </div>

                    <div className="form-group">
                        <label className="form-label form-label-required">Batch Pulse & Persona</label>
                        <textarea className="form-textarea" value={batchPulse} onChange={e => setBatchPulse(e.target.value)} placeholder="Describe batch engagement..." rows={2} />
                    </div>

                    <div className="form-group">
                        <label className="form-label form-label-required">Recommended Teaching Pace</label>
                        <textarea className="form-textarea" value={teachingPace} onChange={e => setTeachingPace(e.target.value)} placeholder="Describe preferred pace..." rows={2} />
                    </div>

                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label className="form-label">Suggested Instructors for Replacement</label>
                        <SearchableDropdown
                            options={replacementOptions}
                            value={suggestedReplacement}
                            onChange={setSuggestedReplacement}
                            placeholder="Select an instructor (optional)"
                        />
                    </div>

                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label className="form-label">Other Comments</label>
                        <textarea className="form-textarea" value={otherComments} onChange={e => setOtherComments(e.target.value)} placeholder="Optional" rows={2}></textarea>
                    </div>

                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'Submitting...' : 'Submit Override Request'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminManualUnavailability;
