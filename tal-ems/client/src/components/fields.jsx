import { useEffect, useState } from 'react';
import { Paperclip, Upload, X, FileText } from 'lucide-react';
import { api } from '../lib/api';
import { OptionBadge } from './ui';
import { money, date, dateTime, pct, num } from '../lib/format';

// cached lookup options per resource
const optCache = new Map();
export function useOptions(resource) {
  const [opts, setOpts] = useState(optCache.get(resource) || null);
  useEffect(() => {
    if (!resource) return;
    if (optCache.has(resource)) { setOpts(optCache.get(resource)); return; }
    let alive = true;
    api.get(`/options/${resource}`).then((o) => { optCache.set(resource, o); if (alive) setOpts(o); }).catch(() => alive && setOpts([]));
    return () => { alive = false; };
  }, [resource]);
  return opts || [];
}
export const clearOptions = (resource) => (resource ? optCache.delete(resource) : optCache.clear());

export function FileLink({ url, label = 'عرض الملف' }) {
  if (!url) return <span className="muted">—</span>;
  return <a href={url} target="_blank" rel="noreferrer" className="row" style={{ gap: 5, display: 'inline-flex' }} onClick={(e) => e.stopPropagation()}><Paperclip size={14} />{label}</a>;
}

// read-only rendering of a value by field type
export function FieldValue({ f, row }) {
  const v = row[f.name];
  if (f.type === 'ref') return row[`${f.name}__label`] ? <span>{row[`${f.name}__label`]}</span> : <span className="muted">—</span>;
  if (v == null || v === '') return <span className="muted">—</span>;
  switch (f.type) {
    case 'select': return <OptionBadge options={f.options} value={v} />;
    case 'money': return <span className="num">{money(v)}</span>;
    case 'percent': return <span className="num">{pct(v)}</span>;
    case 'number': return <span className="num">{num(v, 1)}</span>;
    case 'date': return <span className="num">{date(v)}</span>;
    case 'datetime': return <span className="num">{dateTime(v)}</span>;
    case 'time': return <span className="num ltr">{String(v).slice(0, 5)}</span>;
    case 'image': return <a href={v} target="_blank" rel="noreferrer"><img src={v} alt="" style={{ maxWidth: 220, borderRadius: 8, border: '1px solid var(--line)' }} /></a>;
    case 'file': return <FileLink url={v} />;
    default: return <span>{String(v)}</span>;
  }
}

function UploadInput({ value, onChange, image, disabled }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [name, setName] = useState('');
  const pickFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy(true); setErr('');
    try { const r = await api.upload(file); setName(r.name); onChange(r.url, r); } catch (x) { setErr(x.message); }
    setBusy(false); e.target.value = '';
  };
  return (
    <div>
      <div className="upload">
        {value && image && <img src={value} alt="" />}
        {value && !image && <FileText size={20} color="var(--tal-500)" />}
        <div style={{ flex: 1, minWidth: 0 }} className="small">
          {value ? <a href={value} target="_blank" rel="noreferrer">{name || 'الملف المرفق'}</a> : <span className="muted">{busy ? 'جارٍ الرفع...' : 'لم يتم اختيار ملف'}</span>}
        </div>
        {!disabled && <label className="btn sm" style={{ cursor: 'pointer' }}><Upload />{value ? 'استبدال' : 'رفع'}<input type="file" hidden accept={image ? 'image/*' : undefined} onChange={pickFile} /></label>}
        {value && !disabled && <button type="button" className="btn sm ghost" onClick={() => onChange(null)} aria-label="إزالة"><X /></button>}
      </div>
      {err && <div className="hint" style={{ color: 'var(--red)' }}>{err}</div>}
    </div>
  );
}

function RefSelect({ f, value, onChange, disabled, error }) {
  const opts = useOptions(f.ref);
  return (
    <select className={`select ${error ? 'err' : ''}`} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">— اختر —</option>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function FieldInput({ f, value, onChange, disabled, error }) {
  const cls = (base) => `${base} ${error ? 'err' : ''}`;
  switch (f.type) {
    case 'textarea': return <textarea className={cls('textarea')} value={value ?? ''} disabled={disabled} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case 'select': return (
      <select className={cls('select')} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— اختر —</option>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>);
    case 'ref': return <RefSelect f={f} value={value} onChange={onChange} disabled={disabled} error={error} />;
    case 'number': case 'money': case 'percent':
      return <input className={cls('input num')} type="number" step="any" min={f.min} max={f.max} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} dir="ltr" style={{ textAlign: 'right' }} />;
    case 'date': return <input className={cls('input')} type="date" value={value ? String(value).slice(0, 10) : ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />;
    case 'datetime': {
      const local = value ? new Date(new Date(value).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
      return <input className={cls('input')} type="datetime-local" value={local} disabled={disabled} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />;
    }
    case 'time': return <input className={cls('input')} type="time" value={value ? String(value).slice(0, 5) : ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />;
    case 'image': return <UploadInput image value={value} onChange={onChange} disabled={disabled} />;
    case 'file': return <UploadInput value={value} onChange={onChange} disabled={disabled} />;
    default: return (
      <>
        <input className={cls('input')} type={f.type === 'email' ? 'email' : 'text'} value={value ?? ''} disabled={disabled} placeholder={f.placeholder} list={f.suggestions ? `sug-${f.name}` : undefined} onChange={(e) => onChange(e.target.value)} />
        {f.suggestions && <datalist id={`sug-${f.name}`}>{f.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
      </>);
  }
}
