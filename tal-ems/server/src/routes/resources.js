const express = require('express');
const { db, HttpError, wrap, audit } = require('../core');
const { R } = require('../resources');

const router = express.Router();

const can = (user, spec) => (typeof spec === 'function' ? !!spec(user) : !!spec && user.can(spec));
const getRes = (name) => { const r = R[name]; if (!r) throw new HttpError(404, 'مورد غير معروف'); return r; };

function isSelf(res, row, user) {
  if (!row || !user.employee_id) return false;
  if (res.table === 'employees') return row.id === user.employee_id;
  return row.employee_id === user.employee_id;
}
function fieldVisible(f, user, res, row) {
  if (f.hiddenFor && f.hiddenFor(user) && !row) return false;
  if (!f.perm) return true;
  if (user.can(f.perm)) return true;
  return !!(f.selfVisible && row && isSelf(res, row, user));
}
function shapeRow(res, row, user) {
  const out = { id: row.id, created_at: row.created_at, updated_at: row.updated_at, created_by: row.created_by, is_demo: row.is_demo };
  for (const f of res.fields) {
    if (!fieldVisible(f, user, res, row)) continue;
    out[f.name] = row[f.name];
    if (f.type === 'ref') out[`${f.name}__label`] = row[`${f.name}__label`] ?? null;
  }
  // keep a few internal columns used by the UI
  for (const k of ['approved_by', 'approved_at', 'decided_by', 'decided_at', 'file_name', 'file_size']) if (k in row) out[k] = row[k];
  return out;
}

// scoped subquery of visible ids (avoids column ambiguity with label joins)
async function scopedIds(res, user) {
  const sub = db(res.table).select(`${res.table}.id`);
  if (res.scope) await res.scope(sub, user);
  return { sub }; // wrapped: a bare knex builder is thenable and would execute when awaited
}

async function baseQuery(res, user) {
  const t = res.table;
  const q = db(t).select(`${t}.*`);
  for (const f of res.fields.filter((x) => x.type === 'ref')) {
    const rr = R[f.ref]; const alias = `j_${f.name}`;
    q.leftJoin(`${rr.table} as ${alias}`, `${alias}.id`, `${t}.${f.name}`).select(`${alias}.${rr.labelField} as ${f.name}__label`);
  }
  if (res.scope) q.whereIn(`${t}.id`, (await scopedIds(res, user)).sub);
  return { q };
}

async function fetchOne(res, user, id) {
  const { q } = await baseQuery(res, user);
  const row = await q.where(`${res.table}.id`, Number(id)).first();
  if (!row) throw new HttpError(404, 'السجل غير موجود أو لا تملك صلاحية الوصول إليه');
  return row;
}

// ----------- validation -----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function coerce(f, v) {
  if (v === '' || v === undefined) v = null;
  if (v === null) { if (f.required) throw new HttpError(422, `الحقل "${f.label}" مطلوب`, { field: f.name }); return null; }
  switch (f.type) {
    case 'number': case 'money': case 'percent': {
      const n = Number(v); if (!Number.isFinite(n)) throw new HttpError(422, `قيمة غير صالحة في "${f.label}"`, { field: f.name });
      if (f.min != null && n < f.min) throw new HttpError(422, `"${f.label}" يجب ألا تقل عن ${f.min}`, { field: f.name });
      if (f.max != null && n > f.max) throw new HttpError(422, `"${f.label}" يجب ألا تزيد عن ${f.max}`, { field: f.name });
      if ((f.type === 'money') && n < 0) throw new HttpError(422, `"${f.label}" لا يمكن أن تكون سالبة`, { field: f.name });
      return n;
    }
    case 'ref': { const n = parseInt(v, 10); if (!Number.isInteger(n)) throw new HttpError(422, `اختيار غير صالح في "${f.label}"`, { field: f.name }); return n; }
    case 'date': { const s = String(v).slice(0, 10); if (!DATE_RE.test(s) || isNaN(new Date(s))) throw new HttpError(422, `تاريخ غير صالح في "${f.label}"`, { field: f.name }); return s; }
    case 'datetime': { const d = new Date(v); if (isNaN(d)) throw new HttpError(422, `تاريخ غير صالح في "${f.label}"`, { field: f.name }); return d.toISOString(); }
    case 'time': { const s = String(v); if (!/^\d{2}:\d{2}(:\d{2})?$/.test(s)) throw new HttpError(422, `وقت غير صالح في "${f.label}"`, { field: f.name }); return s; }
    case 'select': { if (!f.options.some((o) => o.value === v)) throw new HttpError(422, `قيمة غير مسموحة في "${f.label}"`, { field: f.name }); return v; }
    case 'image': case 'file': { const s = String(v); if (!/^\/api\/files\/[0-9a-f-]{36}$/.test(s)) throw new HttpError(422, `ملف غير صالح في "${f.label}"`, { field: f.name }); return s; }
    default: {
      const s = String(v).trim(); if (s.length > (f.type === 'textarea' ? 20000 : 500)) throw new HttpError(422, `"${f.label}" أطول من المسموح`, { field: f.name });
      if (f.type === 'email' && s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(422, 'بريد إلكتروني غير صالح', { field: f.name });
      if (f.required && !s) throw new HttpError(422, `الحقل "${f.label}" مطلوب`, { field: f.name });
      return s;
    }
  }
}

function writableFieldList(res, user, existing) {
  const restrict = res.writableFields ? res.writableFields(user, existing) : null;
  return res.fields.filter((f) => {
    if (f.readonly) return false;
    if (existing && f.readonlyAfterCreate) return false;
    if (f.lockFor && f.lockFor(user)) return false;
    if (f.perm && !user.can(f.perm)) return false;
    if (restrict && !restrict.includes(f.name)) return false;
    return true;
  });
}

function cleanInput(res, user, body, existing) {
  const fields = writableFieldList(res, user, existing);
  if (existing && res.writableFields && fields.length === 0) throw new HttpError(403, 'ليست لديك صلاحية تعديل هذا السجل');
  const data = {};
  for (const f of fields) {
    if (existing && !(f.name in body)) continue; // partial update
    if (!existing && !(f.name in body) && f.default !== undefined) { data[f.name] = f.default; continue; }
    if (!existing && !(f.name in body)) { if (f.required) throw new HttpError(422, `الحقل "${f.label}" مطلوب`, { field: f.name }); continue; }
    data[f.name] = coerce(f, body[f.name]);
  }
  return data;
}

function friendlyDbError(e) {
  if (e.code === '23505') return new HttpError(409, 'القيمة مكررة — يوجد سجل بنفس الرقم أو الرمز');
  if (e.code === '23503') return new HttpError(409, 'لا يمكن تنفيذ العملية لارتباط السجل بسجلات أخرى');
  return e;
}

// ----------- meta -----------
function metaFor(res, user, name) {
  return {
    name, label: res.label, labelField: res.labelField,
    perms: { create: can(user, res.perm.create), update: can(user, res.perm.update), delete: can(user, res.perm.delete) },
    actions: Object.entries(res.actions || {}).filter(([, a]) => user.can(a.perm)).map(([key, a]) => ({ key, label: a.label, from: a.from, tone: a.tone, needsNote: !!a.needsNote })),
    fields: res.fields.filter((f) => fieldVisible(f, user, res, null) || f.selfVisible).map((f) => ({
      name: f.name, label: f.label, type: f.type, ref: f.ref, options: f.options, required: !!f.required, list: f.list !== false,
      filter: !!f.filter, readonly: !!f.readonly || !!(f.lockFor && f.lockFor(user)) || (f.perm && !user.can(f.perm)),
      readonlyAfterCreate: !!f.readonlyAfterCreate, hidden: !!(f.hiddenFor && f.hiddenFor(user)), createHidden: !!f.createHidden,
      min: f.min, max: f.max, placeholder: f.placeholder, hint: f.hint, suggestions: f.suggestions, default: f.default,
      selfOnly: !!(f.perm && !user.can(f.perm)),
    })),
    hasTotals: res.fields.some((f) => f.type === 'money'),
  };
}

router.get('/meta', wrap(async (req, res) => {
  const out = {};
  for (const [name, r] of Object.entries(R)) if (!r.internal && can(req.user, r.perm.view)) out[name] = metaFor(r, req.user, name);
  res.json(out);
}));

// lookup options for selects (id + label only)
const OPEN_LOOKUPS = new Set(['employees', 'departments', 'shifts', 'clients', 'suppliers', 'materials', 'users']);
router.get('/options/:res', wrap(async (req, res) => {
  const r = getRes(req.params.res);
  if (!OPEN_LOOKUPS.has(req.params.res) && !can(req.user, r.perm.view)) throw new HttpError(403, 'غير مسموح');
  const q = db(r.table).select('id', `${r.labelField} as label`).orderBy(r.labelField).limit(1000);
  if (r.scope && !OPEN_LOOKUPS.has(req.params.res)) q.whereIn('id', (await scopedIds(r, req.user)).sub);
  if (req.params.res === 'employees') q.whereNot('status', 'terminated');
  if (req.params.res === 'users') q.where('is_active', true);
  if (req.query.q) q.whereILike(r.labelField, `%${req.query.q}%`);
  res.json((await q).map((x) => ({ value: x.id, label: String(x.label) })));
}));

// ----------- list -----------
router.get('/r/:res', wrap(async (req, res) => {
  const r = getRes(req.params.res); const user = req.user; const t = r.table;
  if (!can(user, r.perm.view)) throw new HttpError(403, 'ليست لديك صلاحية عرض هذا القسم');
  const { q } = await baseQuery(r, user);

  if (req.query.q && r.search.length) {
    const term = `%${String(req.query.q).slice(0, 100)}%`;
    q.where((w) => r.search.forEach((c) => w.orWhereILike(`${t}.${c}`, term)));
  }
  const filters = req.query.filter || {};
  for (const [k, v] of Object.entries(filters)) {
    if (v === '' || v == null) continue;
    const [name, op] = k.split('__');
    if (r.customFilters && r.customFilters[name]) { r.customFilters[name](q, v); continue; }
    const f = r.fields.find((x) => x.name === name) || (name === 'id' ? { name: 'id' } : null);
    if (!f || !fieldVisible(f, user, r, null) && f.perm) continue;
    const col = `${t}.${name}`;
    if (op === 'in') q.whereIn(col, String(v).split(','));
    else if (op === 'not') q.whereNot(col, v);
    else if (op === 'gte') q.where(col, '>=', v);
    else if (op === 'lte') q.where(col, '<=', v);
    else if (op === 'null') q.whereNull(col);
    else q.where(col, v);
  }

  const countQ = q.clone().clearSelect().clearOrder().count(`${t}.id as c`).first();
  const moneyFields = r.fields.filter((f) => f.type === 'money' && fieldVisible(f, user, r, null));
  const totalsQ = moneyFields.length ? q.clone().clearSelect().clearOrder().select(moneyFields.map((f) => db.raw(`coalesce(sum(??),0) as ??`, [`${t}.${f.name}`, f.name]))).first() : null;

  const sortable = new Set(['id', 'created_at', ...r.fields.map((f) => f.name)]);
  const [ds, dd] = r.defaultSort || ['created_at', 'desc'];
  let sort = sortable.has(req.query.sort) ? req.query.sort : ds;
  const sf = r.fields.find((f) => f.name === sort);
  const sortCol = sf && sf.type === 'ref' ? `${sort}__label` : `${t}.${sort}`;
  const dir = req.query.dir === 'asc' ? 'asc' : req.query.dir === 'desc' ? 'desc' : (sortable.has(req.query.sort) ? 'asc' : dd);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 1000);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  q.orderByRaw(`?? ${dir} nulls last`, [sortCol]).orderBy(`${t}.id`, 'desc').limit(pageSize).offset((page - 1) * pageSize);

  const [rows, cnt, totals] = await Promise.all([q, countQ, totalsQ]);
  res.json({ rows: rows.map((row) => shapeRow(r, row, user)), total: Number(cnt.c), page, pageSize, totals: totals || null });
}));

router.get('/r/:res/:id', wrap(async (req, res) => {
  const r = getRes(req.params.res);
  if (!can(req.user, r.perm.view)) throw new HttpError(403, 'ليست لديك صلاحية');
  res.json(shapeRow(r, await fetchOne(r, req.user, req.params.id), req.user));
}));

// ----------- create -----------
router.post('/r/:res', wrap(async (req, res) => {
  const r = getRes(req.params.res); const user = req.user;
  if (!can(user, r.perm.create)) throw new HttpError(403, 'ليست لديك صلاحية الإضافة');
  const data = cleanInput(r, user, req.body || {}, null);
  if (r.beforeSave) await r.beforeSave(data, { user, op: 'create' });
  if (r.guard) await r.guard(user, data, null);
  data.created_by = user.id;
  let row;
  try {
    row = await db.transaction(async (trx) => {
      const [ins] = await trx(r.table).insert(data).returning('*');
      if (r.afterSave) await r.afterSave(ins, { op: 'create', user, trx, req });
      await audit(req, 'create', req.params.res, ins.id, `إضافة ${r.label}: ${ins[r.labelField] ?? ins.id}`, { data }, trx);
      return ins;
    });
  } catch (e) { throw friendlyDbError(e); }
  res.status(201).json(shapeRow(r, await fetchOne(r, user, row.id).catch(() => row), user));
}));

// ----------- update -----------
router.put('/r/:res/:id', wrap(async (req, res) => {
  const r = getRes(req.params.res); const user = req.user;
  if (!can(user, r.perm.update)) throw new HttpError(403, 'ليست لديك صلاحية التعديل');
  const existing = await fetchOne(r, user, req.params.id);
  const data = cleanInput(r, user, req.body || {}, existing);
  if (r.beforeSave) await r.beforeSave(data, { user, op: 'update', existing });
  if (r.guard) await r.guard(user, { ...existing, ...data }, existing);
  const changes = {};
  for (const [k, v] of Object.entries(data)) if (String(existing[k] ?? '') !== String(v ?? '')) changes[k] = { from: existing[k], to: v };
  if (!Object.keys(changes).length) return res.json(shapeRow(r, existing, user));
  try {
    await db.transaction(async (trx) => {
      const [row] = await trx(r.table).where({ id: existing.id }).update({ ...data, updated_at: trx.fn.now() }).returning('*');
      if (r.afterSave) await r.afterSave(row, { op: 'update', user, trx, existing, req });
      await audit(req, 'update', req.params.res, existing.id, `تعديل ${r.label}: ${existing[r.labelField] ?? existing.id}`, { changes }, trx);
    });
  } catch (e) { throw friendlyDbError(e); }
  res.json(shapeRow(r, await fetchOne(r, user, existing.id), user));
}));

// ----------- delete -----------
router.delete('/r/:res/:id', wrap(async (req, res) => {
  const r = getRes(req.params.res); const user = req.user;
  if (!can(user, r.perm.delete)) throw new HttpError(403, 'ليست لديك صلاحية الحذف');
  const existing = await fetchOne(r, user, req.params.id);
  if (r.guard) await r.guard(user, existing, existing);
  try {
    await db.transaction(async (trx) => {
      await trx(r.table).where({ id: existing.id }).del();
      const snapshot = shapeRow(r, existing, user);
      await audit(req, 'delete', req.params.res, existing.id, `حذف ${r.label}: ${existing[r.labelField] ?? existing.id}`, { snapshot }, trx);
    });
  } catch (e) { throw friendlyDbError(e); }
  if (r.afterDelete) await r.afterDelete(existing);
  res.json({ ok: true });
}));

// ----------- workflow actions -----------
router.post('/r/:res/:id/actions/:action', wrap(async (req, res) => {
  const r = getRes(req.params.res); const user = req.user;
  const a = r.actions && r.actions[req.params.action];
  if (!a) throw new HttpError(404, 'إجراء غير معروف');
  if (!user.can(a.perm)) throw new HttpError(403, 'ليست لديك صلاحية هذا الاعتماد');
  const row = await fetchOne(r, user, req.params.id);
  if (a.from && !a.from.includes(row.status)) throw new HttpError(409, 'لا يمكن تنفيذ الإجراء على السجل في حالته الحالية');
  if (a.check) a.check(row, user);
  const note = req.body && req.body.note ? String(req.body.note).slice(0, 2000) : null;
  if (a.needsNote && !note) throw new HttpError(422, 'يرجى كتابة سبب أو ملاحظة');
  await db.transaction(async (trx) => {
    await trx(r.table).where({ id: row.id }).update({ ...a.to, updated_at: trx.fn.now() });
    if (a.run) await a.run(row, { user, trx, note, req });
    await audit(req, a.perm.endsWith('approve') ? `approve:${req.params.action}` : req.params.action, req.params.res, row.id,
      `${a.label} — ${r.label}: ${row[r.labelField] ?? row.id}`, { from: row.status, to: a.to, note }, trx);
  });
  res.json(shapeRow(r, await fetchOne(r, user, row.id), user));
}));

module.exports = { router, fetchOne, scopedIds, can };
