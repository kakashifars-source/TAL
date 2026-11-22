require('dotenv').config();
const { db } = require('../src/core');
const { clearDemo } = require('../src/demo');
clearDemo().then(async (r) => { console.log('Demo data removed:', Object.fromEntries(Object.entries(r).filter(([, n]) => n))); await db('audit_logs').insert({ user_name: 'system', action: 'demo_clear', entity: 'system', summary: 'حذف البيانات التجريبية (سطر الأوامر)' }); await db.destroy(); }).catch((e) => { console.error(e); process.exit(1); });
