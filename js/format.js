// Formatting helpers: money, dates, tags, dimensions, relative time, countdown.
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export function price(cents, currency = 'INR') {
    if (cents == null)
        return '';
    if (currency === 'INR')
        return inr.format(cents / 100);
    return `${(cents / 100).toFixed(2)} ${currency}`;
}
export function formatDate(epochSeconds) {
    if (!epochSeconds)
        return '';
    return new Date(epochSeconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
export function formatDateShort(epochSeconds) {
    if (!epochSeconds)
        return '';
    return new Date(epochSeconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function dims(d) {
    if (d && d.width && d.height)
        return `${d.width} × ${d.height} ${d.unit || 'cm'}`;
    return '';
}
export function relativeTime(epochSeconds, from = nowSeconds()) {
    if (!epochSeconds)
        return '';
    const diff = epochSeconds - from;
    const abs = Math.abs(diff);
    const min = 60, hour = 3600, day = 86400;
    let text;
    if (abs < min)
        return 'just now';
    else if (abs < hour)
        text = `${Math.round(abs / min)} min`;
    else if (abs < day)
        text = `${Math.round(abs / hour)} h`;
    else if (abs < day * 30) {
        const d = Math.round(abs / day);
        text = `${d} day${d === 1 ? '' : 's'}`;
    }
    else
        return formatDateShort(epochSeconds);
    return diff >= 0 ? `in ${text}` : `${text} ago`;
}
// Live countdown: "2d 04h 12m 09s", shrinking units as time runs out.
export function countdown(endsAt, from = nowSeconds()) {
    let s = Math.max(0, endsAt - from);
    const d = Math.floor(s / 86400);
    s -= d * 86400;
    const h = Math.floor(s / 3600);
    s -= h * 3600;
    const m = Math.floor(s / 60);
    s -= m * 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (d > 0)
        return `${d}d ${pad(h)}h ${pad(m)}m`;
    if (h > 0)
        return `${h}h ${pad(m)}m ${pad(s)}s`;
    return `${m}m ${pad(s)}s`;
}
export function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}
export function todayLabel() {
    return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}
export function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
