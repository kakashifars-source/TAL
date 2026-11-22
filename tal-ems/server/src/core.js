require('dotenv').config();
const knexLib = require('knex');
const jwt = require('jsonwebtoken');
const config = require('../knexfile');

const db = knexLib(config);
// numeric -> JS number (amounts are well within double precision for this domain)
require('pg').types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
require('pg').types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
require('pg').types.setTypeParser(1082, (v) => v); // DATE stays 'YYYY-MM-DD'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
const COOKIE = 'tal_session';

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- permission cache per role (invalidated when role permissions change) ----
const permCache = new Map();
async function rolePermissions(roleId) {
  if (permCache.has(roleId)) return permCache.get(roleId);
  const rows = await db('role_permissions').where({ role_id: roleId }).pluck('permission_key');
  const set = new Set(rows);
  permCache.set(roleId, set);
  return set;
}
function invalidatePerms() { permCache.clear(); }

async function loadUser(userId) {
  const u = await db('users as u')
    .join('roles as r', 'r.id', 'u.role_id')
    .leftJoin('employees as e', 'e.id', 'u.employee_id')
    .where('u.id', userId)
    .first('u.id', 'u.display_name', 'u.email', 'u.username', 'u.employee_id', 'u.is_active', 'u.totp_enabled',
      'u.must_change_password', 'u.role_id', 'r.key as role_key', 'r.name as role_name', 'r.level as role_level',
      'e.photo_url', 'e.job_title', 'e.department_id');
  if (!u) return null;
  const perms = await rolePermissions(u.role_id);
  u.isOwner = u.role_key === 'owner';
  u.permissions = u.isOwner ? require('./permissions').ALL : [...perms];
  u.can = (p) => u.isOwner || perms.has(p);
  return u;
}

// ---- authentication middleware: JWT cookie -> live DB session ----
async function authenticate(req, res, next) {
  try {
    const token = req.cookies[COOKIE];
    if (!token) throw new HttpError(401, 'غير مسجل الدخول');
    let payload;
    try { payload = jwt.verify(token, JWT_SECRET); } catch { throw new HttpError(401, 'انتهت الجلسة'); }
    const s = await db('sessions').where({ id: payload.sid }).first();
    if (!s || s.revoked_at || new Date(s.expires_at) < new Date()) throw new HttpError(401, 'انتهت الجلسة');
    const user = await loadUser(s.user_id);
    if (!user || !user.is_active) throw new HttpError(401, 'الحساب غير مفعل');
    if (Date.now() - new Date(s.last_seen_at).getTime() > 60_000) {
      db('sessions').where({ id: s.id }).update({ last_seen_at: db.fn.now() }).catch(() => {});
    }
    req.user = user;
    req.sessionId = s.id;
    next();
  } catch (e) { next(e); }
}

const requirePerm = (...perms) => (req, res, next) => {
  if (perms.some((p) => req.user.can(p))) return next();
  next(new HttpError(403, 'ليست لديك صلاحية لهذا الإجراء'));
};
const requireOwner = (req, res, next) => (req.user.isOwner ? next() : next(new HttpError(403, 'هذا الإجراء للمالك فقط')));

// ---- audit log ----
async function audit(req, action, entity, entityId, summary, details, trx) {
  const u = req && req.user;
  await (trx || db)('audit_logs').insert({
    user_id: u ? u.id : null,
    user_name: u ? u.display_name : (details && details.identifier) || 'system',
    role_name: u ? u.role_name : null,
    action, entity, entity_id: entityId != null ? String(entityId) : null,
    summary: summary ? String(summary).slice(0, 500) : null,
    details: details ? JSON.stringify(details) : null,
    ip: req ? (req.ip || '').slice(0, 64) : null,
  });
}

// ---- notifications ----
async function notify(userIds, n, trx) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
  if (!ids.length) return;
  await (trx || db)('notifications').insert(ids.map((user_id) => ({ user_id, type: n.type, title: n.title, body: n.body || null, link: n.link || null })));
}
async function usersWithPerm(perm) {
  const rows = await db('users as u').join('roles as r', 'r.id', 'u.role_id')
    .leftJoin('role_permissions as rp', 'rp.role_id', 'u.role_id')
    .where('u.is_active', true)
    .andWhere((q) => q.where('r.key', 'owner').orWhere('rp.permission_key', perm))
    .distinct('u.id');
  return rows.map((r) => r.id);
}
async function userIdForEmployee(employeeId) {
  if (!employeeId) return null;
  const u = await db('users').where({ employee_id: employeeId }).first('id');
  return u ? u.id : null;
}

async function getSetting(key, fallback) {
  const r = await db('settings').where({ key }).first();
  return r ? r.value : fallback;
}

// project ids the user can see (null = all)
async function visibleProjectIds(user) {
  if (user.can('projects.view_all')) return null;
  if (!user.employee_id) return [];
  const managed = await db('projects').where({ manager_id: user.employee_id }).pluck('id');
  const member = await db('project_members').where({ employee_id: user.employee_id }).pluck('project_id');
  return [...new Set([...managed, ...member])];
}
async function managedProjectIds(user) {
  if (user.can('projects.view_all') && user.can('projects.update')) return null;
  if (!user.employee_id) return [];
  return db('projects').where({ manager_id: user.employee_id }).pluck('id');
}

module.exports = {
  db, JWT_SECRET, COOKIE, HttpError, wrap, authenticate, requirePerm, requireOwner, loadUser,
  audit, notify, usersWithPerm, userIdForEmployee, getSetting, invalidatePerms, visibleProjectIds, managedProjectIds,
};
