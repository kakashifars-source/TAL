// Idempotent production bootstrap: permissions catalog, system roles, default settings, owner account.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../src/core');
const { PERMISSIONS, DEFAULT_ROLES } = require('../src/permissions');

(async () => {
  await db('permissions').insert(PERMISSIONS.map(([key, module, label], i) => ({ key, module, label, sort: i }))).onConflict('key').merge(['module', 'label', 'sort']);
  await db('permissions').whereNotIn('key', PERMISSIONS.map((p) => p[0])).del();
  for (const r of DEFAULT_ROLES) {
    let role = await db('roles').where({ key: r.key }).first();
    if (!role) {
      [role] = await db('roles').insert({ key: r.key, name: r.name, level: r.level, is_system: r.is_system, description: r.description }).returning('*');
      await db('role_permissions').insert(r.permissions.map((p) => ({ role_id: role.id, permission_key: p }))).onConflict().ignore();
      console.log(`role created: ${r.name}`);
    }
  }
  const defaults = {
    company: { name_ar: 'شركة تال الإنشائية للمقاولات', name_en: 'TAL Construction Company', cr_number: '', vat_number: '', address: '', phone: '', email: '', website: '' },
    system: { timezone: 'Asia/Riyadh', date_format: 'YYYY-MM-DD', week_start: 'sunday', session_hours: 12 },
    currency: { code: 'SAR', symbol: 'ر.س', decimals: 2, vat_rate: 15 },
    notifications: { tasks: true, leaves: true, approvals: true, projects: true, finance: true, meetings: true, circulars: true, inventory: true },
    reports: { footer_note: 'وثيقة داخلية — شركة تال الإنشائية للمقاولات', show_logo: true, default_range_days: 30 },
    security: { require2faForManagement: false, max_failed_attempts: 5, lock_minutes: 15, password_min_length: 10 },
  };
  for (const [key, value] of Object.entries(defaults)) await db('settings').insert({ key, value: JSON.stringify(value) }).onConflict('key').ignore();

  const ownerRole = await db('roles').where({ key: 'owner' }).first();
  const hasOwner = await db('users').where({ role_id: ownerRole.id }).first();
  if (!hasOwner) {
    const email = (process.env.OWNER_EMAIL || 'owner@tal.local').toLowerCase();
    const password = process.env.OWNER_PASSWORD || `Tal-${crypto.randomBytes(6).toString('hex')}`;
    await db('users').insert({ display_name: process.env.OWNER_NAME || 'مالك الشركة', email, username: process.env.OWNER_USERNAME || 'owner', password_hash: await bcrypt.hash(password, 12), role_id: ownerRole.id, must_change_password: !process.env.OWNER_PASSWORD });
    console.log('\n=== Owner account created ===');
    console.log(`username: ${process.env.OWNER_USERNAME || 'owner'}\nemail: ${email}\npassword: ${process.env.OWNER_PASSWORD ? '(from OWNER_PASSWORD)' : password}`);
    console.log('Change the password after first login.\n');
  }
  await db.destroy();
})().catch((e) => { console.error(e); process.exit(1); });
