/**
 * Formats any date string into "13 March 2026" display format.
 * Handles MM/DD/YYYY (Google Sheets), YYYY-MM-DD (ISO), and already-formatted strings.
 */
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatDate(dateStr: string | undefined | null): string {
    if (!dateStr) return '';
    const s = String(dateStr).trim();
    if (!s) return '';

    let d: Date | null = null;

    // MM/DD/YYYY  (Google Sheets format)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
        const [m, day, y] = s.split('/').map(Number);
        d = new Date(y, m - 1, day);
    }
    // YYYY-MM-DD  (ISO / Supabase format)
    else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const [y, m, day] = s.substring(0, 10).split('-').map(Number);
        d = new Date(y, m - 1, day);
    }

    if (!d || isNaN(d.getTime())) return s; // fallback: return original

    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
