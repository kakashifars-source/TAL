import { useEffect, useState } from 'react';
import { X, Inbox, ChevronLeft } from 'lucide-react';
import { initials, pct } from '../lib/format';

export function PageHead({ crumb, title, desc, children }) {
  return (
    <div className="page-head">
      <div>
        <div className="crumb"><b>TAL</b><ChevronLeft size={12} />{crumb}</div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {children && <div className="page-actions no-print">{children}</div>}
    </div>
  );
}

export function Card({ title, icon: Icon, sub, actions, children, flush, className = '', style }) {
  return (
    <div className={`card ${className}`} style={style}>
      {(title || actions) && (
        <div className="card-head">
          <div><h3>{Icon && <Icon />}{title}</h3>{sub && <div className="sub">{sub}</div>}</div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={`card-body ${flush ? 'flush' : ''}`}>{children}</div>
    </div>
  );
}

export function Stat({ label, value, unit, icon: Icon, foot, tone = 'blue', onClick }) {
  const tones = { blue: ['var(--tal-500)', 'var(--tal-50)'], green: ['var(--green)', 'var(--green-bg)'], red: ['var(--red)', 'var(--red-bg)'], amber: ['var(--amber)', 'var(--amber-bg)'], teal: ['var(--teal)', 'var(--teal-bg)'], dark: ['var(--tal-800)', 'var(--tal-100)'] };
  const [a, b] = tones[tone] || tones.blue;
  return (
    <div className={`card stat ${onClick ? 'clickable' : ''}`} style={{ '--accent': a, '--accent-bg': b }} onClick={onClick}>
      <div className="label"><span>{label}</span>{Icon && <span className="ico"><Icon /></span>}</div>
      <div className="value">{value}{unit && <small>{unit}</small>}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

export function Badge({ tone = 'gray', children, plain }) { return <span className={`badge ${tone} ${plain ? 'plain' : ''}`}>{children}</span>; }

export function OptionBadge({ options, value }) {
  const o = (options || []).find((x) => x.value === value);
  if (!o) return value ? <Badge>{value}</Badge> : <span className="muted">—</span>;
  return o.tone ? <Badge tone={o.tone}>{o.label}</Badge> : <span>{o.label}</span>;
}

export function Progress({ value = 0, planned, lg, showLabel }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const tone = planned != null ? (v + 10 < planned ? 'red' : v + 3 < planned ? 'amber' : v >= 100 ? 'green' : '') : v >= 100 ? 'green' : '';
  return (
    <div>
      <div className={`progress ${lg ? 'lg' : ''}`} title={planned != null ? `الفعلي ${pct(v)} — المخطط ${pct(planned)}` : pct(v)}>
        <div className={`bar ${tone}`} style={{ width: `${v}%` }} />
        {planned != null && <div className="plan" style={{ right: `calc(${Math.min(100, planned)}% - 1px)` }} />}
      </div>
      {showLabel && (
        <div className="row between tiny muted" style={{ marginTop: 5 }}>
          <span>الفعلي <b className="num" style={{ color: 'var(--ink)' }}>{pct(v)}</b></span>
          {planned != null && <span>المخطط <b className="num" style={{ color: 'var(--ink)' }}>{pct(planned)}</b></span>}
        </div>
      )}
    </div>
  );
}

export function Avatar({ name, src, size }) {
  return <span className={`avatar ${size || ''}`}>{src ? <img src={src} alt="" /> : initials(name)}</span>;
}

export function Modal({ title, onClose, children, footer, size }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size || ''}`} role="dialog" aria-modal="true">
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="إغلاق"><X /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, sub, onClose, children, footer }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head"><div><h3 style={{ margin: 0, fontSize: 16, color: 'var(--tal-900)' }}>{title}</h3>{sub && <div className="small muted" style={{ marginTop: 4 }}>{sub}</div>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق"><X /></button></div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.filter(Boolean).map((t) => (
        <button key={t.key} role="tab" className={value === t.key ? 'on' : ''} onClick={() => onChange(t.key)}>
          {t.icon && <t.icon />}{t.label}{t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, children = 'لا توجد بيانات' }) { return <div className="empty"><Icon /><div>{children}</div></div>; }
export function Spinner() { return <div className="center"><div className="spinner" /></div>; }

export function Confirm({ title = 'تأكيد', message, confirmLabel = 'تأكيد', danger, onConfirm, onClose, needNote, notePlaceholder }) {
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => {
    if (needNote && !note.trim()) { setErr('يرجى كتابة السبب'); return; }
    setBusy(true); setErr('');
    try { await onConfirm(note); onClose(); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose} size="sm" footer={<>
      <button className={`btn ${danger ? 'solid-red' : 'primary'}`} disabled={busy} onClick={go}>{busy ? '...' : confirmLabel}</button>
      <button className="btn" onClick={onClose}>إلغاء</button></>}>
      {message && <p style={{ marginTop: 0 }}>{message}</p>}
      {needNote !== undefined && <div className="field"><label>{needNote ? 'السبب / الملاحظة' : 'ملاحظة (اختياري)'}</label><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={notePlaceholder} /></div>}
      {err && <div className="error-box mt">{err}</div>}
    </Modal>
  );
}

export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then((data) => alive && setState({ loading: false, data, error: null })).catch((error) => alive && setState({ loading: false, data: null, error }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
