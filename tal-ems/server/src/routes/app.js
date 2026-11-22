const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { db, HttpError, wrap, audit, notify, requirePerm, requireOwner, getSetting, invalidatePerms, usersWithPerm } = require('../core');
const { PERMISSIONS } = require('../permissions');
const { R } = require('../resources');
const { scopedIds } = require('./resources');
const { passwordPolicy } = require('./auth');

const router = express.Router();
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../storage/uploads'));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ======================= Files =======================
const ALLOWED = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|application\/(msword|vnd\.openxmlformats-officedocument\..+|vnd\.ms-excel|vnd\.ms-powerpoint|zip|x-zip-compressed|acad|x-dwg|octet-stream)|image\/vnd\.dwg|text\/plain|text\/csv)$/;
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (req, file, cb) => cb(null, crypto.randomUUID()) }),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024 },
  fileFilter: (req, file, cb) => (ALLOWED.test(file.mimetype) ? cb(null, true) : cb(new HttpError(415, 'نوع الملف غير مسموح'))),
});
router.post('/files', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(422, 'لم يتم إرفاق ملف');
  const original = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const [f] = await db('files').insert({ original_name: original.slice(0, 250), stored_name: req.file.filename, mime: req.file.mimetype, size: req.file.size, uploaded_by: req.user.id }).returning('*');
  res.status(201).json({ id: f.id, url: `/api/files/${f.id}`, name: f.original_name, size: f.size, mime: f.mime });
}));
router.get('/files/:id', wrap(async (req, res) => {
  if (!/^[0-9a-f-]{36}$/.test(req.params.id)) throw new HttpError(404, 'غير موجود');
  const f = await db('files').where({ id: req.params.id }).first();
  if (!f) throw new HttpError(404, 'الملف غير موجود');
  const url = `/api/files/${f.id}`;
  // files attached to documents follow the document's access rules
  const docs = await db('documents').where({ file_url: url }).select('id');
  if (docs.length) {
    const allowed = await db('documents').whereIn('id', (await scopedIds(R.documents, req.user)).sub).where({ file_url: url }).first('id');
    if (!allowed) throw new HttpError(403, 'لا تملك صلاحية الوصول لهذا المستند');
  }
  const p = path.join(UPLOAD_DIR, f.stored_name);
  if (!fs.existsSync(p)) throw new HttpError(404, 'الملف غير موجود على الخادم');
  res.setHeader('Content-Type', f.mime || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const inline = /^image\/|application\/pdf/.test(f.mime || '') && req.query.download === undefined;
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
  fs.createReadStream(p).pipe(res);
}));

// ======================= Attendance =======================
const todayStr = () => new Date().toISOString().slice(0, 10);
router.get('/attendance/today', wrap(async (req, res) => {
  if (!req.user.employee_id) return res.json({ linked: false });
  const row = await db('attendance').where({ employee_id: req.user.employee_id, work_date: todayStr() }).first();
  const emp = await db('employees as e').leftJoin('shifts as s', 's.id', 'e.shift_id').where('e.id', req.user.employee_id).first('s.name as shift_name', 's.start_time', 's.end_time', 's.grace_minutes');
  res.json({ linked: true, record: row || null, shift: emp && emp.shift_name ? emp : null });
}));
router.post('/attendance/check-in', requirePerm('attendance.self'), wrap(async (req, res) => {
  const empId = req.user.employee_id;
  if (!empId) throw new HttpError(400, 'حسابك غير مرتبط بملف موظف');
  const exists = await db('attendance').where({ employee_id: empId, work_date: todayStr() }).first();
  if (exists && exists.check_in) throw new HttpError(409, 'تم تسجيل الحضور مسبقاً اليوم');
  const emp = await db('employees as e').leftJoin('shifts as s', 's.id', 'e.shift_id').where('e.id', empId).first('s.start_time', 's.grace_minutes');
  const now = new Date();
  let late = 0;
  if (emp && emp.start_time) {
    const tz = (await getSetting('system', {})).timezone || 'Asia/Riyadh';
    const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const [h, m] = emp.start_time.split(':').map(Number);
    late = Math.max(0, Math.round((local.getHours() * 60 + local.getMinutes()) - (h * 60 + m) - (emp.grace_minutes || 0)));
  }
  const geo = req.body && Number.isFinite(Number(req.body.lat)) ? { lat: Number(req.body.lat), lng: Number(req.body.lng), source: 'gps' } : { source: 'web' };
  const data = { employee_id: empId, work_date: todayStr(), check_in: now, status: late > 0 ? 'late' : 'present', late_minutes: late, ...geo, created_by: req.user.id };
  if (exists) await db('attendance').where({ id: exists.id }).update(data); else await db('attendance').insert(data);
  await audit(req, 'check_in', 'attendance', empId, `تسجيل حضور${late ? ` (تأخير ${late} دقيقة)` : ''}`);
  res.json(await db('attendance').where({ employee_id: empId, work_date: todayStr() }).first());
}));
router.post('/attendance/check-out', requirePerm('attendance.self'), wrap(async (req, res) => {
  const empId = req.user.employee_id;
  const row = empId && await db('attendance').where({ employee_id: empId, work_date: todayStr() }).first();
  if (!row || !row.check_in) throw new HttpError(409, 'لم يتم تسجيل الحضور اليوم');
  if (row.check_out) throw new HttpError(409, 'تم تسجيل الانصراف مسبقاً');
  await db('attendance').where({ id: row.id }).update({ check_out: new Date(), updated_at: db.fn.now() });
  await audit(req, 'check_out', 'attendance', empId, 'تسجيل انصراف');
  res.json(await db('attendance').where({ id: row.id }).first());
}));
router.get('/attendance/monthly', requirePerm('attendance.view_all'), wrap(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : todayStr().slice(0, 7);
  const rows = await db('employees as e').leftJoin('departments as d', 'd.id', 'e.department_id')
    .leftJoin('attendance as a', function () { this.on('a.employee_id', 'e.id').andOn(db.raw("to_char(a.work_date,'YYYY-MM') = ?", [month])); })
    .whereNot('e.status', 'terminated').groupBy('e.id', 'd.name').orderBy('e.full_name')
    .select('e.id', 'e.emp_no', 'e.full_name', 'd.name as department',
      db.raw("count(*) filter (where a.status = 'present') as present"), db.raw("count(*) filter (where a.status = 'late') as late"),
      db.raw("count(*) filter (where a.status = 'absent') as absent"), db.raw("count(*) filter (where a.status = 'leave') as leave"),
      db.raw('coalesce(sum(a.late_minutes),0) as late_minutes'),
      db.raw("coalesce(round(sum(extract(epoch from (a.check_out - a.check_in))/3600)::numeric,1),0) as hours"));
  res.json({ month, rows: rows.map((r) => ({ ...r, present: +r.present, late: +r.late, absent: +r.absent, leave: +r.leave, late_minutes: +r.late_minutes, hours: +r.hours })) });
}));

// ======================= Notifications =======================
router.get('/notifications', wrap(async (req, res) => {
  const q = db('notifications').where({ user_id: req.user.id }).orderBy('id', 'desc').limit(Math.min(Number(req.query.limit) || 50, 200));
  if (req.query.unread) q.whereNull('read_at');
  if (req.query.type) q.where('type', req.query.type);
  const unread = Number((await db('notifications').where({ user_id: req.user.id }).whereNull('read_at').count('* as c').first()).c);
  res.json({ rows: await q, unread });
}));
router.post('/notifications/:id/read', wrap(async (req, res) => {
  await db('notifications').where({ id: req.params.id, user_id: req.user.id }).update({ read_at: db.fn.now() });
  res.json({ ok: true });
}));
router.post('/notifications/read-all', wrap(async (req, res) => {
  await db('notifications').where({ user_id: req.user.id }).whereNull('read_at').update({ read_at: db.fn.now() });
  res.json({ ok: true });
}));

// ======================= Messages =======================
const msgVisible = (u) => (q) => q.where((w) => w.where('m.sender_id', u.id).orWhere('m.recipient_id', u.id)
  .orWhere((x) => x.whereNotNull('m.department_id').where('m.department_id', u.department_id || -1)));
router.get('/messages', requirePerm('messages.use'), wrap(async (req, res) => {
  const u = req.user; const box = req.query.box === 'sent' ? 'sent' : 'inbox';
  const q = db('messages as m').join('users as s', 's.id', 'm.sender_id').leftJoin('users as r', 'r.id', 'm.recipient_id').leftJoin('departments as d', 'd.id', 'm.department_id')
    .leftJoin('message_reads as mr', function () { this.on('mr.message_id', 'm.id').andOn('mr.user_id', db.raw('?', [u.id])); })
    .whereNull('m.parent_id')
    .select('m.*', 's.display_name as sender_name', 'r.display_name as recipient_name', 'd.name as department_name', 'mr.read_at')
    .select(db.raw('(select count(*) from messages c where c.parent_id = m.id) as replies'))
    .select(db.raw('(select max(created_at) from messages c where c.parent_id = m.id) as last_reply_at'))
    .orderByRaw('coalesce((select max(created_at) from messages c where c.parent_id = m.id), m.created_at) desc').limit(200);
  if (box === 'sent') q.where('m.sender_id', u.id);
  else q.where((w) => w.where('m.recipient_id', u.id).orWhere((x) => x.whereNotNull('m.department_id').where('m.department_id', u.department_id || -1))
    .orWhere((x) => x.where('m.sender_id', u.id).whereExists(db('messages as c').whereRaw('c.parent_id = m.id').whereNot('c.sender_id', u.id))));
  const rows = await q;
  res.json(rows.map((r) => ({ ...r, replies: Number(r.replies) })));
}));
router.get('/messages/:id', requirePerm('messages.use'), wrap(async (req, res) => {
  const u = req.user;
  const root = await db('messages as m').where('m.id', req.params.id).modify(msgVisible(u)).first('m.*');
  if (!root) throw new HttpError(404, 'الرسالة غير موجودة');
  const thread = await db('messages as m').join('users as s', 's.id', 'm.sender_id').where('m.id', root.id).orWhere('m.parent_id', root.id).orderBy('m.created_at').select('m.*', 's.display_name as sender_name');
  await db('message_reads').insert(thread.map((m) => ({ message_id: m.id, user_id: u.id }))).onConflict(['message_id', 'user_id']).ignore();
  res.json({ root, thread });
}));
router.post('/messages', requirePerm('messages.use'), wrap(async (req, res) => {
  const u = req.user; const b = req.body || {};
  const body = String(b.body || '').trim();
  if (!body) throw new HttpError(422, 'نص الرسالة مطلوب');
  if (b.attachment_url && !/^\/api\/files\/[0-9a-f-]{36}$/.test(b.attachment_url)) throw new HttpError(422, 'مرفق غير صالح');
  let data = { sender_id: u.id, body: body.slice(0, 20000), attachment_url: b.attachment_url || null, attachment_name: b.attachment_name ? String(b.attachment_name).slice(0, 250) : null };
  let recipients = [];
  if (b.parent_id) {
    const root = await db('messages as m').where('m.id', b.parent_id).whereNull('m.parent_id').modify(msgVisible(u)).first('m.*');
    if (!root) throw new HttpError(404, 'المحادثة غير موجودة');
    data = { ...data, parent_id: root.id, subject: root.subject, recipient_id: root.recipient_id, department_id: root.department_id };
    recipients = root.department_id ? await db('users as us').join('employees as e', 'e.id', 'us.employee_id').where('e.department_id', root.department_id).pluck('us.id') : [root.sender_id, root.recipient_id];
    recipients.push(root.sender_id);
  } else {
    if (!b.recipient_id && !b.department_id) throw new HttpError(422, 'حدد المستلم أو الإدارة');
    data.subject = String(b.subject || '').slice(0, 250) || 'بدون عنوان';
    if (b.recipient_id) { const r = await db('users').where({ id: b.recipient_id, is_active: true }).first('id'); if (!r) throw new HttpError(422, 'المستلم غير موجود'); data.recipient_id = r.id; recipients = [r.id]; }
    else { const d = await db('departments').where({ id: b.department_id }).first('id'); if (!d) throw new HttpError(422, 'الإدارة غير موجودة'); data.department_id = d.id; recipients = await db('users as us').join('employees as e', 'e.id', 'us.employee_id').where('e.department_id', d.id).pluck('us.id'); }
  }
  const [m] = await db('messages').insert(data).returning('*');
  await db('message_reads').insert({ message_id: m.id, user_id: u.id }).onConflict(['message_id', 'user_id']).ignore();
  await notify(recipients.filter((id) => id && id !== u.id), { type: 'message', title: `رسالة من ${u.display_name}`, body: data.subject, link: `/messages?open=${m.parent_id || m.id}` });
  res.status(201).json(m);
}));
router.get('/messages-unread', requirePerm('messages.use'), wrap(async (req, res) => {
  const u = req.user;
  const c = await db('messages as m').modify(msgVisible(u)).whereNot('m.sender_id', u.id)
    .whereNotExists(db('message_reads as r').whereRaw('r.message_id = m.id').where('r.user_id', u.id)).count('* as c').first();
  res.json({ unread: Number(c.c) });
}));

// ======================= Audit log =======================
function auditQuery(qs) {
  const q = db('audit_logs');
  if (qs.user_id) q.where('user_id', qs.user_id);
  if (qs.entity) q.where('entity', qs.entity);
  if (qs.action) q.where('action', 'like', `${qs.action}%`);
  if (qs.from) q.where('created_at', '>=', qs.from);
  if (qs.to) q.where('created_at', '<', new Date(new Date(qs.to).getTime() + 86400000));
  if (qs.q) q.where((w) => w.whereILike('summary', `%${qs.q}%`).orWhereILike('user_name', `%${qs.q}%`));
  return q;
}
router.get('/audit', requirePerm('audit.view'), wrap(async (req, res) => {
  const pageSize = Math.min(Number(req.query.pageSize) || 50, 200); const page = Math.max(Number(req.query.page) || 1, 1);
  const base = auditQuery(req.query);
  const [rows, c] = await Promise.all([base.clone().orderBy('id', 'desc').limit(pageSize).offset((page - 1) * pageSize), base.clone().count('* as c').first()]);
  const entities = await db('audit_logs').distinct('entity').whereNotNull('entity').pluck('entity');
  res.json({ rows, total: Number(c.c), page, pageSize, entities });
}));
router.get('/audit/export', requirePerm('audit.view'), wrap(async (req, res) => {
  const ExcelJS = require('exceljs');
  const rows = await auditQuery(req.query).orderBy('id', 'desc').limit(50000);
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('سجل العمليات', { views: [{ rightToLeft: true }] });
  ws.columns = [{ header: '#', key: 'id', width: 8 }, { header: 'التاريخ والوقت', key: 'created_at', width: 22 }, { header: 'المستخدم', key: 'user_name', width: 24 }, { header: 'المنصب', key: 'role_name', width: 18 },
    { header: 'العملية', key: 'action', width: 18 }, { header: 'القسم', key: 'entity', width: 18 }, { header: 'الوصف', key: 'summary', width: 60 }, { header: 'IP', key: 'ip', width: 16 }];
  rows.forEach((r) => ws.addRow({ ...r, created_at: new Date(r.created_at).toLocaleString('en-GB') }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF477597' } };
  await audit(req, 'export', 'audit_logs', null, 'تصدير سجل العمليات', { count: rows.length });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="tal-audit-log.xlsx"');
  await wb.xlsx.write(res); res.end();
}));
// Owner-only archival: export old entries then remove them; the archival itself is logged.
router.post('/audit/archive', requireOwner, wrap(async (req, res) => {
  const before = req.body && req.body.before;
  if (!before || isNaN(new Date(before))) throw new HttpError(422, 'حدد تاريخاً صالحاً');
  const minAgeDays = 365;
  if (new Date(before) > new Date(Date.now() - minAgeDays * 86400000)) throw new HttpError(422, 'لا يمكن أرشفة سجلات أحدث من سنة');
  const rows = await db('audit_logs').where('created_at', '<', before).orderBy('id');
  const dir = path.resolve(path.join(UPLOAD_DIR, '../archives')); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `audit-archive-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(rows));
  await db.transaction(async (trx) => {
    await trx.raw("select set_config('tal.audit_archive', 'on', true)");
    await trx('audit_logs').where('created_at', '<', before).del();
  });
  await audit(req, 'audit_archive', 'audit_logs', null, `أرشفة ${rows.length} سجل قبل ${before}`, { file: path.basename(file), count: rows.length });
  res.json({ ok: true, archived: rows.length, file: path.basename(file) });
}));

// ======================= Settings =======================
const SETTING_KEYS = ['company', 'system', 'currency', 'notifications', 'reports', 'security'];
router.get('/settings', requirePerm('settings.manage'), wrap(async (req, res) => {
  const rows = await db('settings').whereIn('key', SETTING_KEYS);
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}));
router.put('/settings/:key', requirePerm('settings.manage'), wrap(async (req, res) => {
  if (!SETTING_KEYS.includes(req.params.key)) throw new HttpError(404, 'إعداد غير معروف');
  const value = req.body && typeof req.body === 'object' ? req.body : {};
  if (JSON.stringify(value).length > 20000) throw new HttpError(422, 'حجم الإعدادات كبير');
  const before = await getSetting(req.params.key, {});
  await db('settings').insert({ key: req.params.key, value: JSON.stringify(value), updated_at: db.fn.now() }).onConflict('key').merge();
  await audit(req, 'settings_update', 'settings', req.params.key, `تحديث إعدادات: ${req.params.key}`, { before, after: value });
  res.json(value);
}));
router.get('/settings/backup', requireOwner, wrap(async (req, res) => {
  const tables = (await db.raw("select tablename from pg_tables where schemaname='public' and tablename not like 'knex_%' and tablename not in ('sessions','password_resets')")).rows.map((r) => r.tablename);
  const dump = { generated_at: new Date().toISOString(), app: 'TAL EMS', tables: {} };
  for (const t of tables) {
    let rows = await db(t).select('*');
    if (t === 'users') rows = rows.map(({ totp_secret, ...r }) => r);
    dump.tables[t] = rows;
  }
  await audit(req, 'backup', 'system', null, 'تنزيل نسخة احتياطية كاملة للبيانات');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="tal-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(dump));
}));
router.get('/settings/demo', requireOwner, wrap(async (req, res) => {
  const { DEMO_TABLES } = require('../demo');
  const counts = {};
  for (const t of DEMO_TABLES) counts[t] = Number((await db(t).where('is_demo', true).count('* as c').first()).c);
  res.json({ counts, total: Object.values(counts).reduce((a, b) => a + b, 0) });
}));
router.post('/settings/demo/clear', requireOwner, wrap(async (req, res) => {
  if ((req.body && req.body.confirm) !== 'حذف البيانات التجريبية') throw new HttpError(422, 'اكتب عبارة التأكيد كما هي');
  const { clearDemo } = require('../demo');
  const result = await clearDemo();
  await audit(req, 'demo_clear', 'system', null, 'حذف جميع البيانات التجريبية من النظام', result);
  res.json(result);
}));

// ======================= Roles & permissions =======================
router.get('/permissions', requirePerm('roles.manage', 'users.manage'), wrap(async (req, res) => {
  res.json(await db('permissions').orderBy('sort'));
}));
router.get('/roles', requirePerm('roles.manage', 'users.manage'), wrap(async (req, res) => {
  const roles = await db('roles').orderBy('level', 'desc');
  const rp = await db('role_permissions');
  const counts = await db('users').groupBy('role_id').select('role_id').count('* as c');
  res.json(roles.map((r) => ({ ...r, permissions: r.key === 'owner' ? PERMISSIONS.map((p) => p[0]) : rp.filter((x) => x.role_id === r.id).map((x) => x.permission_key),
    users: Number((counts.find((c) => c.role_id === r.id) || {}).c || 0), assignable: req.user.isOwner || r.level < req.user.role_level })));
}));
function roleInput(b, user) {
  const name = String(b.name || '').trim(); if (!name) throw new HttpError(422, 'اسم المنصب مطلوب');
  const level = Number(b.level); if (!Number.isInteger(level) || level < 1 || level > 99) throw new HttpError(422, 'المستوى بين 1 و 99');
  if (!user.isOwner && level >= user.role_level) throw new HttpError(403, 'لا يمكنك إنشاء منصب بمستوى يساوي أو يفوق منصبك');
  return { name: name.slice(0, 120), level, description: b.description ? String(b.description).slice(0, 1000) : null };
}
router.post('/roles', requirePerm('roles.manage'), wrap(async (req, res) => {
  const data = roleInput(req.body || {}, req.user);
  const key = `custom_${Date.now().toString(36)}`;
  const [r] = await db('roles').insert({ ...data, key }).returning('*');
  await audit(req, 'role_create', 'roles', r.id, `إنشاء منصب: ${r.name}`, data);
  res.status(201).json(r);
}));
router.put('/roles/:id', requirePerm('roles.manage'), wrap(async (req, res) => {
  const r = await db('roles').where({ id: req.params.id }).first();
  if (!r) throw new HttpError(404, 'غير موجود');
  if (r.key === 'owner') throw new HttpError(403, 'منصب المالك محمي ولا يمكن تعديله');
  if (!req.user.isOwner && r.level >= req.user.role_level) throw new HttpError(403, 'لا يمكنك تعديل منصب مساوٍ أو أعلى من منصبك');
  const data = roleInput({ ...r, ...req.body }, req.user);
  if (r.is_system) data.level = r.level;
  await db('roles').where({ id: r.id }).update({ ...data, updated_at: db.fn.now() });
  await audit(req, 'role_update', 'roles', r.id, `تعديل منصب: ${r.name}`, { before: r, after: data });
  res.json({ ok: true });
}));
router.put('/roles/:id/permissions', requirePerm('roles.manage'), wrap(async (req, res) => {
  const r = await db('roles').where({ id: req.params.id }).first();
  if (!r) throw new HttpError(404, 'غير موجود');
  if (r.key === 'owner') throw new HttpError(403, 'صلاحيات المالك كاملة دائماً');
  if (!req.user.isOwner && r.level >= req.user.role_level) throw new HttpError(403, 'لا يمكنك تعديل صلاحيات منصب مساوٍ أو أعلى');
  const valid = new Set(PERMISSIONS.map((p) => p[0]));
  const perms = [...new Set((req.body.permissions || []).filter((p) => valid.has(p)))];
  if (!req.user.isOwner) {
    const notMine = perms.filter((p) => !req.user.can(p));
    if (notMine.length) throw new HttpError(403, 'لا يمكنك منح صلاحيات لا تملكها');
    if (perms.includes('roles.manage') || perms.includes('settings.manage')) throw new HttpError(403, 'صلاحيات الإعدادات يمنحها المالك فقط');
  }
  const before = await db('role_permissions').where({ role_id: r.id }).pluck('permission_key');
  await db.transaction(async (trx) => {
    await trx('role_permissions').where({ role_id: r.id }).del();
    if (perms.length) await trx('role_permissions').insert(perms.map((p) => ({ role_id: r.id, permission_key: p })));
  });
  invalidatePerms();
  const added = perms.filter((p) => !before.includes(p)); const removed = before.filter((p) => !perms.includes(p));
  await audit(req, 'permissions_change', 'roles', r.id, `تغيير صلاحيات منصب: ${r.name} (+${added.length} / -${removed.length})`, { added, removed });
  res.json({ ok: true });
}));
router.delete('/roles/:id', requirePerm('roles.manage'), wrap(async (req, res) => {
  const r = await db('roles').where({ id: req.params.id }).first();
  if (!r) throw new HttpError(404, 'غير موجود');
  if (r.is_system) throw new HttpError(403, 'لا يمكن حذف منصب أساسي في النظام');
  if (!req.user.isOwner && r.level >= req.user.role_level) throw new HttpError(403, 'غير مسموح');
  const used = await db('users').where({ role_id: r.id }).first('id');
  if (used) throw new HttpError(409, 'المنصب مسند لمستخدمين، انقلهم لمنصب آخر أولاً');
  await db('roles').where({ id: r.id }).del();
  await audit(req, 'role_delete', 'roles', r.id, `حذف منصب: ${r.name}`);
  res.json({ ok: true });
}));

// ======================= Users =======================
router.get('/users', requirePerm('users.manage'), wrap(async (req, res) => {
  const rows = await db('users as u').join('roles as r', 'r.id', 'u.role_id').leftJoin('employees as e', 'e.id', 'u.employee_id')
    .select('u.id', 'u.display_name', 'u.email', 'u.username', 'u.is_active', 'u.totp_enabled', 'u.last_login_at', 'u.locked_until', 'u.employee_id', 'u.role_id', 'u.created_at', 'u.is_demo',
      'r.name as role_name', 'r.key as role_key', 'r.level as role_level', 'e.full_name as employee_name', 'e.emp_no')
    .select(db.raw('(select count(*) from sessions s where s.user_id = u.id and s.revoked_at is null and s.expires_at > now()) as active_sessions'))
    .orderBy('r.level', 'desc').orderBy('u.display_name');
  res.json(rows.map((r) => ({ ...r, active_sessions: Number(r.active_sessions), manageable: req.user.isOwner ? r.id !== req.user.id || true : r.role_level < req.user.role_level })));
}));
async function assertAssignableRole(user, roleId) {
  const role = await db('roles').where({ id: roleId }).first();
  if (!role) throw new HttpError(422, 'المنصب غير موجود');
  if (role.key === 'owner' && !user.isOwner) throw new HttpError(403, 'منصب المالك لا يمنحه إلا المالك');
  if (!user.isOwner && role.level >= user.role_level) throw new HttpError(403, 'لا يمكنك منح منصب مساوٍ أو أعلى من منصبك');
  return role;
}
async function assertManageable(user, target) {
  if (user.isOwner) return;
  const r = await db('roles').where({ id: target.role_id }).first();
  if (r.level >= user.role_level) throw new HttpError(403, 'لا يمكنك إدارة حساب بمنصب مساوٍ أو أعلى');
}
const genTempPassword = () => `Tal-${crypto.randomBytes(4).toString('hex')}${Math.floor(Math.random() * 90 + 10)}`;
router.post('/users', requirePerm('users.manage'), wrap(async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase(); const username = String(b.username || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, 'بريد إلكتروني غير صالح');
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new HttpError(422, 'اسم المستخدم: أحرف إنجليزية وأرقام فقط (3-40)');
  const role = await assertAssignableRole(req.user, b.role_id);
  let display = String(b.display_name || '').trim();
  if (b.employee_id) { const e = await db('employees').where({ id: b.employee_id }).first(); if (!e) throw new HttpError(422, 'الموظف غير موجود'); display = display || e.full_name; }
  if (!display) throw new HttpError(422, 'الاسم مطلوب');
  const temp = b.password ? (passwordPolicy(b.password), b.password) : genTempPassword();
  try {
    const [u] = await db('users').insert({ display_name: display, email, username, employee_id: b.employee_id || null, role_id: role.id, password_hash: await bcrypt.hash(temp, 12), must_change_password: true, created_by: req.user.id }).returning(['id', 'display_name']);
    await audit(req, 'user_create', 'users', u.id, `إنشاء حساب ${u.display_name} بمنصب ${role.name}`, { email, username, role: role.name });
    res.status(201).json({ id: u.id, temporaryPassword: temp });
  } catch (e) { if (e.code === '23505') throw new HttpError(409, 'البريد أو اسم المستخدم أو الموظف مرتبط بحساب آخر'); throw e; }
}));
router.put('/users/:id', requirePerm('users.manage'), wrap(async (req, res) => {
  const target = await db('users').where({ id: req.params.id }).first();
  if (!target) throw new HttpError(404, 'غير موجود');
  await assertManageable(req.user, target);
  const b = req.body || {}; const data = {}; const changes = {};
  if (b.role_id && Number(b.role_id) !== target.role_id) {
    if (target.id === req.user.id) throw new HttpError(403, 'لا يمكنك تغيير منصبك بنفسك');
    const role = await assertAssignableRole(req.user, b.role_id);
    const oldRole = await db('roles').where({ id: target.role_id }).first();
    if (oldRole.key === 'owner') { const owners = await db('users').where({ role_id: oldRole.id, is_active: true }).count('* as c').first(); if (Number(owners.c) <= 1) throw new HttpError(409, 'يجب أن يبقى مالك واحد على الأقل'); }
    data.role_id = role.id; changes.role = { from: oldRole.name, to: role.name };
  }
  if (b.is_active !== undefined && !!b.is_active !== target.is_active) {
    if (target.id === req.user.id) throw new HttpError(403, 'لا يمكنك إيقاف حسابك');
    data.is_active = !!b.is_active; changes.is_active = { from: target.is_active, to: data.is_active };
  }
  if (b.display_name) data.display_name = String(b.display_name).slice(0, 200);
  if (b.employee_id !== undefined) data.employee_id = b.employee_id || null;
  if (b.unlock) { data.locked_until = null; data.failed_attempts = 0; changes.unlocked = true; }
  if (!Object.keys(data).length) return res.json({ ok: true });
  try { await db('users').where({ id: target.id }).update({ ...data, updated_at: db.fn.now() }); } catch (e) { if (e.code === '23505') throw new HttpError(409, 'الموظف مرتبط بحساب آخر'); throw e; }
  if (data.is_active === false || data.role_id) await db('sessions').where({ user_id: target.id }).whereNull('revoked_at').update({ revoked_at: db.fn.now() });
  await audit(req, changes.role ? 'permissions_change' : 'user_update', 'users', target.id, changes.role ? `تغيير منصب ${target.display_name}: ${changes.role.from} ← ${changes.role.to}` : `تعديل حساب ${target.display_name}`, changes);
  if (changes.role) await notify(target.id, { type: 'security', title: 'تم تغيير منصبك في النظام', body: changes.role.to });
  res.json({ ok: true });
}));
router.post('/users/:id/reset-password', requirePerm('users.manage'), wrap(async (req, res) => {
  const target = await db('users').where({ id: req.params.id }).first();
  if (!target) throw new HttpError(404, 'غير موجود');
  await assertManageable(req.user, target);
  const temp = genTempPassword();
  await db('users').where({ id: target.id }).update({ password_hash: await bcrypt.hash(temp, 12), must_change_password: true, failed_attempts: 0, locked_until: null });
  await db('sessions').where({ user_id: target.id }).whereNull('revoked_at').update({ revoked_at: db.fn.now() });
  await audit(req, 'password_reset_admin', 'users', target.id, `إعادة تعيين كلمة مرور ${target.display_name}`);
  res.json({ temporaryPassword: temp });
}));
router.post('/users/:id/revoke-sessions', requirePerm('users.manage'), wrap(async (req, res) => {
  const target = await db('users').where({ id: req.params.id }).first();
  if (!target) throw new HttpError(404, 'غير موجود');
  await assertManageable(req.user, target);
  const n = await db('sessions').where({ user_id: target.id }).whereNull('revoked_at').update({ revoked_at: db.fn.now() });
  await audit(req, 'session_revoked', 'users', target.id, `إنهاء جميع جلسات ${target.display_name} (${n})`);
  res.json({ revoked: n });
}));
router.get('/security/login-attempts', requirePerm('users.manage'), wrap(async (req, res) => {
  const q = db('login_attempts as a').leftJoin('users as u', 'u.id', 'a.user_id').select('a.*', 'u.display_name').orderBy('a.id', 'desc').limit(200);
  if (req.query.failed) q.where('a.success', false);
  res.json(await q);
}));
router.get('/security/sessions', requirePerm('users.manage'), wrap(async (req, res) => {
  res.json(await db('sessions as s').join('users as u', 'u.id', 's.user_id').whereNull('s.revoked_at').where('s.expires_at', '>', new Date())
    .select('s.id', 's.user_id', 's.ip', 's.user_agent', 's.created_at', 's.last_seen_at', 'u.display_name').orderBy('s.last_seen_at', 'desc'));
}));
router.delete('/security/sessions/:id', requirePerm('users.manage'), wrap(async (req, res) => {
  const s = await db('sessions').where({ id: req.params.id }).first();
  if (!s) throw new HttpError(404, 'غير موجود');
  await assertManageable(req.user, await db('users').where({ id: s.user_id }).first());
  await db('sessions').where({ id: s.id }).update({ revoked_at: db.fn.now() });
  await audit(req, 'session_revoked', 'sessions', s.id, 'إنهاء جلسة مستخدم');
  res.json({ ok: true });
}));

void usersWithPerm;
module.exports = router;
