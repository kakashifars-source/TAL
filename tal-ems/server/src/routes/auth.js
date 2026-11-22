const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const { db, JWT_SECRET, COOKIE, HttpError, wrap, authenticate, audit, loadUser, getSetting, notify, usersWithPerm } = require('../core');
const totp = require('../totp');
const { sendMail } = require('../mailer');

const router = express.Router();
const MAX_FAILS = 5;
const LOCK_MIN = 15;
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 12);

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'محاولات كثيرة، حاول لاحقاً' } });

function passwordPolicy(p) {
  if (typeof p !== 'string' || p.length < 10) throw new HttpError(422, 'كلمة المرور يجب ألا تقل عن 10 أحرف');
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) throw new HttpError(422, 'كلمة المرور يجب أن تحتوي على أحرف وأرقام');
}

async function logAttempt(req, identifier, userId, success, reason) {
  await db('login_attempts').insert({ identifier: String(identifier || '').slice(0, 200), user_id: userId || null, ip: (req.ip || '').slice(0, 64), user_agent: (req.get('user-agent') || '').slice(0, 400), success, reason });
}

async function startSession(req, res, user, remember) {
  const hours = remember ? 24 * 30 : 12;
  const expires = new Date(Date.now() + hours * 3600 * 1000);
  const [s] = await db('sessions').insert({ user_id: user.id, user_agent: (req.get('user-agent') || '').slice(0, 400), ip: (req.ip || '').slice(0, 64), remember: !!remember, expires_at: expires }).returning('id');
  const token = jwt.sign({ sid: s.id }, JWT_SECRET, { expiresIn: `${hours}h` });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', path: '/', ...(remember ? { expires } : {}) });
  await db('users').where({ id: user.id }).update({ last_login_at: db.fn.now(), failed_attempts: 0, locked_until: null });
}

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const identifier = String((req.body && req.body.identifier) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  if (!identifier || !password) throw new HttpError(422, 'يرجى إدخال اسم المستخدم وكلمة المرور');
  const user = await db('users').whereRaw('lower(email) = ? or lower(username) = ?', [identifier, identifier]).first();
  const fail = async (reason, msg = 'بيانات الدخول غير صحيحة') => {
    await logAttempt(req, identifier, user && user.id, false, reason);
    throw new HttpError(401, msg);
  };
  if (!user) { await bcrypt.compare(password, DUMMY_HASH); return fail('unknown_user'); }
  if (!user.is_active) return fail('inactive', 'الحساب موقوف، تواصل مع الإدارة');
  if (user.locked_until && new Date(user.locked_until) > new Date()) return fail('locked', `الحساب مقفل مؤقتاً بسبب محاولات خاطئة متكررة. حاول بعد ${LOCK_MIN} دقيقة`);
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    const fails = user.failed_attempts + 1;
    await db('users').where({ id: user.id }).update({ failed_attempts: fails, locked_until: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60000) : null });
    if (fails >= MAX_FAILS) {
      await audit(req, 'account_locked', 'users', user.id, `قفل حساب ${user.display_name} بعد ${fails} محاولات خاطئة`, { identifier });
      await notify(await usersWithPerm('users.manage'), { type: 'security', title: 'تنبيه أمني: قفل حساب', body: `${user.display_name} — محاولات دخول خاطئة متكررة`, link: '/settings?tab=security' });
    }
    return fail('bad_password');
  }
  if (user.totp_enabled) {
    await logAttempt(req, identifier, user.id, true, 'password_ok_2fa_pending');
    const challenge = jwt.sign({ uid: user.id, stage: '2fa', remember: !!req.body.remember }, JWT_SECRET, { expiresIn: '5m' });
    return res.json({ requires2fa: true, challenge });
  }
  await startSession(req, res, user, req.body.remember);
  await logAttempt(req, identifier, user.id, true, 'ok');
  req.user = await loadUser(user.id);
  await audit(req, 'login', 'users', user.id, 'تسجيل دخول');
  res.json({ ok: true });
}));

router.post('/login/2fa', loginLimiter, wrap(async (req, res) => {
  let p; try { p = jwt.verify(String(req.body.challenge || ''), JWT_SECRET); } catch { throw new HttpError(401, 'انتهت صلاحية التحقق، أعد تسجيل الدخول'); }
  if (p.stage !== '2fa') throw new HttpError(401, 'طلب غير صالح');
  const user = await db('users').where({ id: p.uid }).first();
  if (!user || !user.is_active || !user.totp_enabled) throw new HttpError(401, 'طلب غير صالح');
  if (!totp.verify(user.totp_secret, req.body.code)) { await logAttempt(req, user.username, user.id, false, 'bad_2fa'); throw new HttpError(401, 'رمز التحقق غير صحيح'); }
  await startSession(req, res, user, p.remember);
  await logAttempt(req, user.username, user.id, true, 'ok_2fa');
  req.user = await loadUser(user.id);
  await audit(req, 'login', 'users', user.id, 'تسجيل دخول (مصادقة ثنائية)');
  res.json({ ok: true });
}));

router.post('/forgot', loginLimiter, wrap(async (req, res) => {
  const identifier = String((req.body && req.body.identifier) || '').trim().toLowerCase();
  const user = identifier && await db('users').whereRaw('lower(email) = ? or lower(username) = ?', [identifier, identifier]).where('is_active', true).first();
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    await db('password_resets').insert({ user_id: user.id, token_hash: crypto.createHash('sha256').update(token).digest('hex'), expires_at: new Date(Date.now() + 3600 * 1000) });
    const link = `${process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    await sendMail(user.email, 'استعادة كلمة المرور — TAL', `لإعادة تعيين كلمة المرور افتح الرابط التالي خلال ساعة:\n${link}\n\nإذا لم تطلب ذلك فتجاهل هذه الرسالة.`);
    await audit(null, 'password_reset_requested', 'users', user.id, `طلب استعادة كلمة المرور: ${user.display_name}`, { identifier });
  }
  res.json({ ok: true, message: 'إذا كان الحساب موجوداً فسيصلك رابط الاستعادة على البريد المسجل.' });
}));

router.post('/reset', loginLimiter, wrap(async (req, res) => {
  const hash = crypto.createHash('sha256').update(String(req.body.token || '')).digest('hex');
  const pr = await db('password_resets').where({ token_hash: hash }).whereNull('used_at').where('expires_at', '>', new Date()).first();
  if (!pr) throw new HttpError(400, 'الرابط غير صالح أو منتهي الصلاحية');
  passwordPolicy(req.body.password);
  await db.transaction(async (trx) => {
    await trx('users').where({ id: pr.user_id }).update({ password_hash: await bcrypt.hash(req.body.password, 12), failed_attempts: 0, locked_until: null, must_change_password: false });
    await trx('password_resets').where({ id: pr.id }).update({ used_at: trx.fn.now() });
    await trx('sessions').where({ user_id: pr.user_id }).whereNull('revoked_at').update({ revoked_at: trx.fn.now() });
  });
  await audit(null, 'password_reset', 'users', pr.user_id, 'إعادة تعيين كلمة المرور عبر رابط الاستعادة');
  res.json({ ok: true });
}));

// ---------- authenticated ----------
router.use(authenticate);

router.post('/logout', wrap(async (req, res) => {
  await db('sessions').where({ id: req.sessionId }).update({ revoked_at: db.fn.now() });
  await audit(req, 'logout', 'users', req.user.id, 'تسجيل خروج');
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}));

router.get('/me', wrap(async (req, res) => {
  const u = req.user;
  const company = await getSetting('company', {});
  const system = await getSetting('system', {});
  const currency = await getSetting('currency', {});
  const demo = await db('projects').where({ is_demo: true }).first('id');
  res.json({
    user: { id: u.id, display_name: u.display_name, email: u.email, username: u.username, employee_id: u.employee_id, role_key: u.role_key, role_name: u.role_name,
      role_level: u.role_level, isOwner: u.isOwner, totp_enabled: u.totp_enabled, must_change_password: u.must_change_password, photo_url: u.photo_url, job_title: u.job_title },
    permissions: u.permissions, company, system, currency, demoData: !!demo,
  });
}));

router.post('/change-password', wrap(async (req, res) => {
  const user = await db('users').where({ id: req.user.id }).first();
  if (!(await bcrypt.compare(String(req.body.current || ''), user.password_hash))) throw new HttpError(422, 'كلمة المرور الحالية غير صحيحة');
  passwordPolicy(req.body.next);
  await db('users').where({ id: user.id }).update({ password_hash: await bcrypt.hash(req.body.next, 12), must_change_password: false });
  await db('sessions').where({ user_id: user.id }).whereNot({ id: req.sessionId }).whereNull('revoked_at').update({ revoked_at: db.fn.now() });
  await audit(req, 'password_change', 'users', user.id, 'تغيير كلمة المرور');
  res.json({ ok: true });
}));

router.post('/2fa/setup', wrap(async (req, res) => {
  const secret = totp.generateSecret();
  await db('users').where({ id: req.user.id }).update({ totp_secret: secret, totp_enabled: false });
  const otpauth = totp.uri(secret, req.user.email, 'TAL Construction');
  res.json({ secret, qr: await QRCode.toDataURL(otpauth, { margin: 1, width: 220 }) });
}));
router.post('/2fa/enable', wrap(async (req, res) => {
  const user = await db('users').where({ id: req.user.id }).first();
  if (!user.totp_secret || !totp.verify(user.totp_secret, req.body.code)) throw new HttpError(422, 'رمز التحقق غير صحيح');
  await db('users').where({ id: user.id }).update({ totp_enabled: true });
  await audit(req, '2fa_enabled', 'users', user.id, 'تفعيل المصادقة الثنائية');
  res.json({ ok: true });
}));
router.post('/2fa/disable', wrap(async (req, res) => {
  const user = await db('users').where({ id: req.user.id }).first();
  if (!(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) throw new HttpError(422, 'كلمة المرور غير صحيحة');
  const policy = await getSetting('security', {});
  if (policy.require2faForManagement && req.user.role_level >= 50) throw new HttpError(403, 'المصادقة الثنائية إلزامية لحسابات الإدارة حسب سياسة الشركة');
  await db('users').where({ id: user.id }).update({ totp_enabled: false, totp_secret: null });
  await audit(req, '2fa_disabled', 'users', user.id, 'إيقاف المصادقة الثنائية');
  res.json({ ok: true });
}));

router.get('/sessions', wrap(async (req, res) => {
  const rows = await db('sessions').where({ user_id: req.user.id }).whereNull('revoked_at').where('expires_at', '>', new Date()).orderBy('last_seen_at', 'desc');
  res.json(rows.map((s) => ({ ...s, current: s.id === req.sessionId })));
}));
router.delete('/sessions/:id', wrap(async (req, res) => {
  const n = await db('sessions').where({ id: req.params.id, user_id: req.user.id }).update({ revoked_at: db.fn.now() });
  if (!n) throw new HttpError(404, 'الجلسة غير موجودة');
  await audit(req, 'session_revoked', 'sessions', req.params.id, 'إنهاء جلسة على جهاز آخر');
  res.json({ ok: true });
}));
router.get('/login-attempts', wrap(async (req, res) => {
  res.json(await db('login_attempts').where({ user_id: req.user.id }).orderBy('created_at', 'desc').limit(30));
}));

module.exports = { router, passwordPolicy };
