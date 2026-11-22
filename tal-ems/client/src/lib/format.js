let currency = { code: 'SAR', symbol: 'ر.س', decimals: 2 };
export const setCurrency = (c) => { if (c && c.code) currency = { ...currency, ...c }; };
export const getCurrency = () => currency;

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
export const num = (v, d = 0) => (v == null || v === '' ? '—' : (d ? nf1 : nf0).format(Number(v)));
export const money = (v, opts = {}) => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (opts.compact) {
    const a = Math.abs(n);
    if (a >= 1e6) return `${nf1.format(n / 1e6)} مليون`;
    if (a >= 1e3) return `${nf0.format(n / 1e3)} ألف`;
  }
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: opts.noDec ? 0 : 0, maximumFractionDigits: opts.noDec ? 0 : currency.decimals }).format(n)} ${currency.symbol}`;
};
export const pct = (v) => (v == null ? '—' : `${nf1.format(Number(v))}%`);
const dFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });
const dtFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const tFmt = new Intl.DateTimeFormat('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
export const date = (v) => { if (!v) return '—'; const d = new Date(String(v).length === 10 ? `${v}T12:00:00` : v); return isNaN(d) ? v : dFmt.format(d); };
export const dateTime = (v) => (v ? dtFmt.format(new Date(v)) : '—');
export const time = (v) => (v ? tFmt.format(new Date(v)) : '—');
export const monthLabel = (m) => { const [y, mm] = m.split('-'); return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { month: 'short' }).format(new Date(Number(y), Number(mm) - 1, 1)); };
export const ago = (v) => {
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'الآن'; if (s < 3600) return `قبل ${Math.floor(s / 60)} د`; if (s < 86400) return `قبل ${Math.floor(s / 3600)} س`;
  if (s < 86400 * 7) return `قبل ${Math.floor(s / 86400)} يوم`; return date(v);
};
export const initials = (name = '') => name.replace(/^(م\.|أ\.|د\.)\s*/, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join(' ');
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const fileSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
