export function fmtTime(s, { tenths = false } = {}) {
  if (s == null || !Number.isFinite(s)) return '–';
  const neg = s < 0;
  s = Math.abs(s);
  let whole = Math.floor(s);
  let frac = Math.round((s - whole) * 10);
  if (frac === 10) {
    whole += 1;
    frac = 0;
  }
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const sec = whole % 60;
  let out = h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  if (tenths) out += `.${frac}`;
  return (neg ? '-' : '') + out;
}

/** "1:02:03.5", "3:20", "200" -> seconds (null if invalid). */
export function parseTime(text) {
  const t = String(text).trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(t)) return null;
  const parts = t.split(':');
  let s = 0;
  for (const p of parts) s = s * 60 + parseFloat(p);
  return s;
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function fmtBytes(n) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
