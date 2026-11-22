import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Plus, ChevronUp, ChevronDown, Pencil, Trash2, Download, RefreshCw, ShieldOff, ChevronRight, ChevronLeft } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Modal, Drawer, Confirm, Empty, Spinner, Badge, Progress } from './ui';
import { FieldInput, FieldValue, useOptions, clearOptions } from './fields';
import { money, dateTime } from '../lib/format';

const LIST_SKIP = new Set(['textarea', 'image', 'file']);

function FilterSelect({ f, value, onChange }) {
  const refOpts = useOptions(f.type === 'ref' ? f.ref : null);
  const opts = f.type === 'ref' ? refOpts : f.options || [];
  return (
    <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={f.label}>
      <option value="">{f.label}: الكل</option>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function FormModal({ resource, meta, row, fixed = {}, defaults = {}, onClose, onSaved, editFields, title }) {
  const toast = useToast();
  const isEdit = !!row;
  const fields = meta.fields.filter((f) => {
    if (f.hidden || f.selfOnly || f.name in fixed) return false;
    if (editFields && isEdit && !editFields.includes(f.name)) return false;
    if (!isEdit && (f.readonly || f.createHidden)) return false;
    return true;
  });
  const [values, setValues] = useState(() => {
    if (isEdit) return Object.fromEntries(fields.map((f) => [f.name, row[f.name]]));
    return Object.fromEntries(fields.map((f) => [f.name, defaults[f.name] ?? f.default ?? null]));
  });
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const disabled = (f) => f.readonly || (isEdit && f.readonlyAfterCreate);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const body = { ...fixed };
    for (const f of fields) if (!disabled(f)) body[f.name] = values[f.name];
    try {
      const saved = isEdit ? await api.put(`/r/${resource}/${row.id}`, body) : await api.post(`/r/${resource}`, body);
      clearOptions(resource);
      toast(isEdit ? 'تم حفظ التعديلات' : 'تمت الإضافة بنجاح');
      onSaved(saved);
    } catch (x) { setErr({ msg: x.message, field: x.data && x.data.field }); setBusy(false); }
  };
  return (
    <Modal title={title || `${isEdit ? 'تعديل' : 'إضافة'} — ${meta.label}`} onClose={onClose} size={fields.length > 8 ? 'lg' : undefined}
      footer={<><button className="btn primary" form="res-form" disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ'}</button><button className="btn" type="button" onClick={onClose}>إلغاء</button></>}>
      <form id="res-form" onSubmit={submit} className="form-grid">
        {fields.map((f) => (
          <div key={f.name} className={`field ${['textarea', 'image', 'file'].includes(f.type) ? 'full' : ''}`}>
            <label>{f.label}{f.required && !disabled(f) && <span className="req">*</span>}</label>
            <FieldInput f={f} value={values[f.name]} disabled={disabled(f)} error={err && err.field === f.name} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
            {f.hint && <span className="hint">{f.hint}</span>}
          </div>
        ))}
      </form>
      {err && <div className="error-box mt">{err.msg}</div>}
    </Modal>
  );
}

export function RecordDrawer({ resource, meta, id, onClose, onChanged, drawerExtra, editFields, fixed = {} }) {
  const toast = useToast();
  const [row, setRow] = useState(null); const [edit, setEdit] = useState(false); const [confirm, setConfirm] = useState(null);
  const load = useCallback(() => api.get(`/r/${resource}/${id}`).then(setRow).catch((e) => { toast(e.message, 'error'); onClose(); }), [resource, id]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);
  if (!row) return <Drawer title={meta.label} onClose={onClose}><Spinner /></Drawer>;
  const titleField = meta.labelField && row[meta.labelField] != null ? row[meta.labelField] : `#${row.id}`;
  const acts = meta.actions.filter((a) => !a.from || a.from.includes(row.status));
  const canEdit = meta.perms.update && (!editFields || editFields.length);
  const runAction = async (a, note) => { const r = await api.post(`/r/${resource}/${row.id}/actions/${a.key}`, { note }); setRow(r); toast(`تم: ${a.label}`); onChanged && onChanged(); };
  return (
    <Drawer title={String(titleField)} sub={<span className="row" style={{ gap: 6 }}>{meta.label}{row.is_demo && <Badge tone="demo" plain>تجريبي</Badge>}</span>} onClose={onClose}
      footer={<>
        {acts.map((a) => <button key={a.key} className={`btn ${a.tone === 'green' ? 'green' : a.tone === 'red' ? 'red' : a.tone === 'amber' ? 'amber' : 'teal'}`} onClick={() => setConfirm({ action: a })}>{a.label}</button>)}
        {canEdit && <button className="btn" onClick={() => setEdit(true)}><Pencil />تعديل</button>}
        {meta.perms.delete && <button className="btn red" style={{ marginInlineStart: 'auto' }} onClick={() => setConfirm({ del: true })}><Trash2 />حذف</button>}
      </>}>
      <dl className="kv">
        {meta.fields.filter((f) => !f.hidden && !(f.name in fixed) && (f.name in row || f.type === 'ref')).map((f) => (
          <div key={f.name} style={{ display: 'contents' }}>
            <dt>{f.label}</dt>
            <dd>{f.type === 'percent' && f.name === 'progress' ? <div style={{ maxWidth: 240 }}><Progress value={row[f.name]} showLabel /></div> : <FieldValue f={f} row={row} />}</dd>
          </div>
        ))}
        <dt>تاريخ الإنشاء</dt><dd className="num muted">{dateTime(row.created_at)}</dd>
        {row.updated_at && row.updated_at !== row.created_at && <><dt>آخر تحديث</dt><dd className="num muted">{dateTime(row.updated_at)}</dd></>}
      </dl>
      {drawerExtra && <div className="mt">{drawerExtra(row, load)}</div>}
      {edit && <FormModal resource={resource} meta={meta} row={row} fixed={fixed} editFields={editFields} onClose={() => setEdit(false)} onSaved={(r) => { setEdit(false); setRow(r); onChanged && onChanged(); }} />}
      {confirm && confirm.action && <Confirm title={confirm.action.label} message={`تأكيد ${confirm.action.label} للسجل "${titleField}"؟`} confirmLabel={confirm.action.label} danger={confirm.action.tone === 'red'}
        needNote={confirm.action.needsNote} onConfirm={(note) => runAction(confirm.action, note)} onClose={() => setConfirm(null)} />}
      {confirm && confirm.del && <Confirm title="حذف السجل" danger confirmLabel="حذف نهائي" message={`سيتم حذف "${titleField}" وتسجيل العملية في سجل العمليات. هل أنت متأكد؟`}
        onConfirm={async () => { await api.del(`/r/${resource}/${row.id}`); toast('تم الحذف'); onChanged && onChanged(); onClose(); }} onClose={() => setConfirm(null)} />}
    </Drawer>
  );
}

export default function ResourceView({
  resource, fixed = {}, defaults, columns, hideColumns = [], createLabel, onRowClick, toolbar, initialFilters = {}, pageSize = 25,
  renderView, drawerExtra, editFields, openId, canCreate, title, flush = true, reloadKey, cellRender = {}, defaultSort,
}) {
  const { meta: allMeta } = useAuth();
  const meta = allMeta[resource];
  const [q, setQ] = useState(''); const [filters, setFilters] = useState(initialFilters);
  const [sort, setSort] = useState(defaultSort || null); const [page, setPage] = useState(1);
  const [data, setData] = useState(null); const [err, setErr] = useState(null);
  const [creating, setCreating] = useState(false); const [openRow, setOpenRow] = useState(openId || null);
  const [tick, setTick] = useState(0);
  const fixedKey = JSON.stringify(fixed);

  useEffect(() => { setPage(1); }, [q, JSON.stringify(filters), fixedKey]); // eslint-disable-line
  useEffect(() => { if (openId) setOpenRow(openId); }, [openId]);
  useEffect(() => {
    if (!meta) return;
    let alive = true;
    const t = setTimeout(() => {
      api.get(`/r/${resource}${qs({ q, page, pageSize, sort: sort && sort[0], dir: sort && sort[1], filter: { ...filters, ...fixed } })}`)
        .then((d) => alive && (setData(d), setErr(null))).catch((e) => alive && setErr(e.message));
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [resource, q, page, pageSize, JSON.stringify(sort), JSON.stringify(filters), fixedKey, tick, reloadKey]); // eslint-disable-line

  const cols = useMemo(() => {
    if (!meta) return [];
    if (columns) return columns.map((n) => meta.fields.find((f) => f.name === n)).filter(Boolean);
    return meta.fields.filter((f) => f.list && !f.hidden && !LIST_SKIP.has(f.type) && !(f.name in fixed) && !hideColumns.includes(f.name)).slice(0, 8);
  }, [meta, columns, fixedKey, hideColumns.join()]); // eslint-disable-line

  if (!meta) return <div className="card"><Empty icon={ShieldOff}>ليست لديك صلاحية الوصول إلى هذا القسم</Empty></div>;
  const reload = () => setTick((t) => t + 1);
  const filterFields = meta.fields.filter((f) => f.filter && (f.type === 'select' || f.type === 'ref') && !(f.name in fixed) && !f.hidden);
  const toggleSort = (f) => setSort((s) => (s && s[0] === f.name ? (s[1] === 'asc' ? [f.name, 'desc'] : null) : [f.name, 'asc']));
  const allowCreate = canCreate ?? meta.perms.create;

  const exportCsv = async () => {
    const all = await api.get(`/r/${resource}${qs({ q, pageSize: 1000, sort: sort && sort[0], dir: sort && sort[1], filter: { ...filters, ...fixed } })}`);
    const fs = meta.fields.filter((f) => !f.hidden && !LIST_SKIP.has(f.type));
    const val = (f, r) => { if (f.type === 'ref') return r[`${f.name}__label`] ?? ''; if (f.type === 'select') return (f.options.find((o) => o.value === r[f.name]) || {}).label ?? r[f.name] ?? ''; return r[f.name] ?? ''; };
    const csv = [fs.map((f) => f.label), ...all.rows.map((r) => fs.map((f) => val(f, r)))].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `${resource}.csv`; a.click();
  };

  const rows = data ? data.rows : [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const openFn = onRowClick || ((r) => setOpenRow(r.id));

  return (
    <div className={flush ? 'card' : ''}>
      <div className="toolbar">
        {title && <b style={{ marginInlineEnd: 6, color: 'var(--tal-900)' }}>{title}</b>}
        <div className="search-mini"><Search /><input className="input" placeholder="بحث..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {filterFields.map((f) => <FilterSelect key={f.name} f={f} value={filters[f.name]} onChange={(v) => setFilters((s) => ({ ...s, [f.name]: v }))} />)}
        {toolbar}
        <div className="row" style={{ marginInlineStart: 'auto', gap: 6 }}>
          <button className="btn sm ghost" onClick={reload} title="تحديث"><RefreshCw /></button>
          <button className="btn sm ghost" onClick={exportCsv} title="تصدير CSV"><Download /></button>
          {allowCreate && <button className="btn sm primary" onClick={() => setCreating(true)}><Plus />{createLabel || 'إضافة'}</button>}
        </div>
      </div>
      {err && <div className="error-box" style={{ margin: 14 }}>{err}</div>}
      {!data && !err && <Spinner />}
      {data && renderView && renderView({ rows, reload, open: openFn, meta })}
      {data && !renderView && (rows.length === 0 ? <Empty>لا توجد سجلات{q ? ' مطابقة للبحث' : ''}</Empty> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr>{cols.map((f) => (
              <th key={f.name} className={`sortable ${f.type === 'money' ? 'money' : ''}`} onClick={() => toggleSort(f)}>
                {f.label} <span className="sort">{sort && sort[0] === f.name ? (sort[1] === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : ''}</span>
              </th>))}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="click" onClick={() => openFn(r)}>
                {cols.map((f, i) => <td key={f.name} className={f.type === 'money' ? 'money' : f.type === 'number' ? 'num' : ''}>
                  {cellRender[f.name] ? cellRender[f.name](r) : f.type === 'percent' ? <div style={{ minWidth: 90 }}><Progress value={r[f.name]} /><span className="tiny muted num">{Math.round(r[f.name] || 0)}%</span></div> : <FieldValue f={f} row={r} />}
                  {i === 0 && r.is_demo && <span className="badge demo plain" style={{ marginInlineStart: 6, height: 18, fontSize: 10 }}>تجريبي</span>}
                </td>)}
              </tr>))}</tbody>
            {data.totals && rows.length > 0 && cols.some((f) => f.type === 'money') && (
              <tfoot><tr>{cols.map((f, i) => <td key={f.name} className="money">{f.type === 'money' && data.totals[f.name] != null ? money(data.totals[f.name]) : i === 0 ? `الإجمالي (${data.total})` : ''}</td>)}</tr></tfoot>)}
          </table>
        </div>))}
      {data && data.total > data.pageSize && (
        <div className="pager">
          <span className="num">{(page - 1) * data.pageSize + 1}–{Math.min(page * data.pageSize, data.total)} من {data.total}</span>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn xs" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronRight size={14} /></button>
            <span className="num">{page} / {pages}</span>
            <button className="btn xs" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronLeft size={14} /></button>
          </div>
        </div>)}
      {creating && <FormModal resource={resource} meta={meta} fixed={fixed} defaults={defaults} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {openRow && <RecordDrawer resource={resource} meta={meta} id={openRow} fixed={fixed} editFields={editFields} drawerExtra={drawerExtra} onClose={() => setOpenRow(null)} onChanged={reload} />}
    </div>
  );
}
