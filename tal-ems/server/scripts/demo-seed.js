/**
 * Loads clearly-flagged DEMO data (is_demo = true) so the system can be tried before launch.
 * Remove it any time:  npm run demo:clear   (or Settings → البيانات التجريبية, owner only)
 * Demo login accounts all use the password printed at the end.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const { db } = require('../src/core');
const { plannedProgress } = require('../src/metrics');

const DEMO_PASSWORD = 'TalDemo2026';
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../storage/uploads'));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let seed = 20261122;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => Math.floor(rnd() * (b - a + 1)) + a;
const TODAY = new Date(); TODAY.setHours(12, 0, 0, 0);
const day = (offset) => { const d = new Date(TODAY); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const at = (offset, h, m) => { const d = new Date(TODAY); d.setDate(d.getDate() + offset); d.setUTCHours(h - 3, m, 0, 0); return d; }; // Riyadh = UTC+3
const D = { is_demo: true };

async function storeFile(name, buffer, mime) {
  const stored = crypto.randomUUID();
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), buffer);
  const [f] = await db('files').insert({ original_name: name, stored_name: stored, mime, size: buffer.length, ...D }).returning('id');
  return `/api/files/${f.id}`;
}
function demoPdf(title) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 }); const chunks = [];
    doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));
    const logo = path.join(__dirname, '../assets/tal-logo.png'); if (fs.existsSync(logo)) doc.image(logo, 50, 40, { width: 140 });
    doc.moveDown(5).fontSize(18).fillColor('#1F3A52').text('TAL Construction Company');
    doc.moveDown().fontSize(12).fillColor('#477597').text('DEMO DOCUMENT — sample file for system testing');
    doc.moveDown().fontSize(11).fillColor('#333').text(`Reference: ${title}`);
    doc.moveDown().text(`Generated: ${new Date().toISOString().slice(0, 10)}`);
    doc.moveDown(2).fontSize(9).fillColor('#888').text('This placeholder will be removed together with all demo data.');
    doc.end();
  });
}

(async () => {
  const exists = await db('employees').where({ is_demo: true }).first();
  if (exists) { console.log('Demo data already loaded. Run npm run demo:clear first to reload.'); return db.destroy(); }
  const roles = Object.fromEntries((await db('roles').select('id', 'key')).map((r) => [r.key, r.id]));
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---------- departments & shifts ----------
  const depNames = [['الإدارة العليا', 'EXE'], ['إدارة المشاريع', 'PMO'], ['الإدارة الهندسية', 'ENG'], ['الإدارة المالية', 'FIN'], ['الموارد البشرية', 'HR'], ['المشتريات والمستودعات', 'PRC'], ['السلامة والجودة', 'HSE'], ['التنفيذ والمواقع', 'SITE']];
  const deps = {};
  for (const [name, code] of depNames) { const [r] = await db('departments').insert({ name, code: `${code}`, ...D }).returning('id'); deps[code] = r.id; }
  const [shOffice] = await db('shifts').insert({ name: 'الدوام الإداري', start_time: '08:00', end_time: '16:00', grace_minutes: 15, ...D }).returning('id');
  const [shSite] = await db('shifts').insert({ name: 'وردية المواقع', start_time: '07:00', end_time: '15:00', grace_minutes: 10, ...D }).returning('id');

  // ---------- employees ----------
  const E = [
    ['ceo', 'عبدالله بن سعد القحطاني', 'المدير التنفيذي', 'EXE', null, 38000, shOffice.id],
    ['cfo', 'خالد محمد العتيبي', 'المدير المالي', 'FIN', 'ceo', 26000, shOffice.id],
    ['hr', 'نورة عبدالرحمن الشهري', 'مديرة الموارد البشرية', 'HR', 'ceo', 22000, shOffice.id],
    ['pmo', 'م. فيصل أحمد الغامدي', 'مدير إدارة المشاريع', 'PMO', 'ceo', 30000, shOffice.id],
    ['pm1', 'م. سلطان ناصر الدوسري', 'مدير مشروع', 'PMO', 'pmo', 24000, shSite.id],
    ['pm2', 'م. ريم سعود الحربي', 'مديرة مشروع', 'PMO', 'pmo', 24000, shSite.id],
    ['pm3', 'م. ماجد علي الزهراني', 'مدير مشروع', 'PMO', 'pmo', 23000, shSite.id],
    ['eng1', 'م. أحمد يوسف المالكي', 'مهندس مدني أول', 'ENG', 'pmo', 17000, shSite.id],
    ['eng2', 'م. عمر حسن باوزير', 'مهندس إنشائي', 'ENG', 'eng1', 14500, shOffice.id],
    ['eng3', 'م. سارة فهد العمري', 'مهندسة معمارية', 'ENG', 'eng1', 14000, shOffice.id],
    ['eng4', 'م. محمد إبراهيم السبيعي', 'مهندس كهرباء', 'ENG', 'eng1', 13500, shSite.id],
    ['eng5', 'م. ياسر عادل الشمري', 'مهندس ميكانيكا', 'ENG', 'eng1', 13500, shSite.id],
    ['qs', 'م. هشام طارق النمر', 'مهندس كميات', 'ENG', 'pmo', 12500, shOffice.id],
    ['sur', 'بندر سالم العنزي', 'مساح', 'SITE', 'pm1', 8500, shSite.id],
    ['sup1', 'عبدالعزيز مشعل الرشيدي', 'مشرف موقع', 'SITE', 'pm1', 9500, shSite.id],
    ['sup2', 'تركي حمد البقمي', 'مشرف موقع', 'SITE', 'pm2', 9500, shSite.id],
    ['sup3', 'راشد مبارك اليامي', 'مشرف موقع', 'SITE', 'pm3', 9200, shSite.id],
    ['fore1', 'محمد شاهد خان', 'رئيس عمال', 'SITE', 'sup1', 5200, shSite.id],
    ['fore2', 'رامي جمال حداد', 'رئيس عمال', 'SITE', 'sup2', 5200, shSite.id],
    ['hse', 'م. وليد كمال الجهني', 'مسؤول السلامة', 'HSE', 'pmo', 12000, shSite.id],
    ['qc', 'م. إياد سمير الأحمد', 'مهندس جودة', 'HSE', 'pmo', 12000, shSite.id],
    ['acc1', 'منى صالح القرني', 'محاسبة أولى', 'FIN', 'cfo', 11000, shOffice.id],
    ['acc2', 'فهد عبدالله المطيري', 'محاسب', 'FIN', 'cfo', 9000, shOffice.id],
    ['prc', 'سعد ناصر الحمدان', 'مسؤول المشتريات', 'PRC', 'cfo', 11500, shOffice.id],
    ['store', 'جابر علي الفيفي', 'أمين مستودع', 'PRC', 'prc', 7000, shSite.id],
    ['hr2', 'هيا محمد السديري', 'أخصائية موارد بشرية', 'HR', 'hr', 9500, shOffice.id],
    ['sec', 'لمى خالد الدخيل', 'سكرتيرة تنفيذية', 'EXE', 'ceo', 8500, shOffice.id],
    ['drv', 'أنور حسين مياه', 'مشغل معدات ثقيلة', 'SITE', 'sup1', 4800, shSite.id],
  ];
  const emp = {};
  for (let i = 0; i < E.length; i++) {
    const [k, name, title, dep, , salary, shift] = E[i];
    const [r] = await db('employees').insert({ emp_no: `TAL-${String(1001 + i)}`, full_name: name, job_title: title, department_id: deps[dep], hire_date: day(-int(120, 2400)),
      phone: `05${int(10000000, 99999999)}`, email: `demo.${k}@tal.local`, national_id: `1${int(100000000, 999999999)}`, nationality: i >= 17 && i <= 18 ? 'غير سعودي' : 'سعودي',
      status: 'active', salary, allowances: Math.round(salary * 0.25), leave_balance: int(8, 30), shift_id: shift, ...D }).returning('id');
    emp[k] = r.id;
  }
  for (const [k, , , , mgr] of E) if (mgr) await db('employees').where({ id: emp[k] }).update({ manager_id: emp[mgr] });

  // ---------- demo user accounts ----------
  const U = [['demo.owner', 'مالك الشركة (تجريبي)', 'owner', null], ['demo.ceo', null, 'ceo', 'ceo'], ['demo.cfo', null, 'finance_manager', 'cfo'], ['demo.hr', null, 'hr_manager', 'hr'],
    ['demo.pm', null, 'project_manager', 'pm1'], ['demo.pm2', null, 'project_manager', 'pm2'], ['demo.pm3', null, 'project_manager', 'pm3'], ['demo.pmo', null, 'ceo', 'pmo'],
    ['demo.procurement', null, 'procurement_officer', 'prc'], ['demo.employee', null, 'employee', 'eng2'], ['demo.engineer', null, 'employee', 'eng1'], ['demo.supervisor', null, 'employee', 'sup1']];
  const users = {};
  for (const [username, display, role, ek] of U) {
    const name = display || E.find((e) => e[0] === ek)[1];
    const [r] = await db('users').insert({ username, email: `${username}@tal.local`, display_name: name, password_hash: hash, role_id: roles[role], employee_id: ek ? emp[ek] : null, ...D }).returning('id');
    users[username] = r.id;
  }
  // PMO head gets CEO-like oversight in demo? keep as project_manager for realism
  await db('users').where({ id: users['demo.pmo'] }).update({ role_id: roles.project_manager });

  // ---------- clients & suppliers ----------
  const C = [['شركة الأفق للتطوير العقاري', 'الرياض'], ['مجموعة الواحة القابضة', 'جدة'], ['شركة رواسي للاستثمار', 'الدمام'], ['مؤسسة المدار التجارية', 'الرياض'], ['شركة النخبة للمستشفيات', 'الخبر'], ['جمعية البر الخيرية (عميل تجريبي)', 'المدينة المنورة']];
  const cl = [];
  for (const [name, city] of C) { const [r] = await db('clients').insert({ name, city, contact_person: pick(['أ. سامي', 'م. هاني', 'أ. عبدالمجيد', 'م. لينا']), phone: `05${int(10000000, 99999999)}`, email: `contact${cl.length + 1}@client.demo`, cr_number: `10${int(10000000, 99999999)}`, vat_number: `3${int(10000000000000, 99999999999999)}`, ...D }).returning('id'); cl.push(r.id); }
  const S = [['مصنع الخليج للحديد', 'حديد تسليح'], ['شركة اليمامة للخرسانة الجاهزة', 'خرسانة'], ['مؤسسة الصخرة لمواد البناء', 'مواد بناء'], ['شركة الريادة للمعدات', 'تأجير معدات'], ['مصنع الوطنية للبلوك', 'بلوك'],
    ['شركة النور للأدوات الكهربائية', 'كهرباء'], ['مؤسسة المياه للسباكة', 'سباكة'], ['شركة الجزيرة للعزل', 'عزل']];
  const sp = [];
  for (const [name, category] of S) { const [r] = await db('suppliers').insert({ name, category, contact_person: pick(['أ. عادل', 'أ. ناصر', 'م. حسام', 'أ. ماهر']), phone: `05${int(10000000, 99999999)}`, email: `sales${sp.length + 1}@supplier.demo`, rating: int(3, 5), status: 'active', ...D }).returning('id'); sp.push(r.id); }

  // ---------- projects ----------
  const imgs = [];
  for (let i = 1; i <= 9; i++) imgs.push(await storeFile(`project-${i}.png`, fs.readFileSync(path.join(__dirname, `../seeds/assets/project-${i}.png`)), 'image/png'));
  const P = [
    ['P-2025-014', 'برج الأفق التجاري — 18 طابق', 'الرياض — حي الملقا', 0, 'pm1', -420, 300, 118000000, 104000000, 'in_progress', 'مبنى تجاري'],
    ['P-2025-021', 'مجمع الواحة السكني — 64 فيلا', 'جدة — أبحر الشمالية', 1, 'pm2', -360, 210, 86500000, 77000000, 'in_progress', 'سكني'],
    ['P-2025-030', 'مستشفى النخبة التخصصي — المرحلة الأولى', 'الخبر — العقربية', 4, 'pm3', -300, 120, 64200000, 57800000, 'delayed', 'صحي'],
    ['P-2026-003', 'مستودعات رواسي اللوجستية', 'الدمام — المدينة الصناعية الثانية', 2, 'pm1', -200, 160, 27400000, 24300000, 'in_progress', 'صناعي'],
    ['P-2026-008', 'مبنى المدار الإداري', 'الرياض — طريق الملك فهد', 3, 'pm2', -150, 400, 41800000, 37500000, 'in_progress', 'إداري'],
    ['P-2024-019', 'فلل الأفق — المرحلة الثانية', 'الرياض — حي النرجس', 0, 'pm3', -720, -40, 35600000, 31900000, 'completed', 'سكني'],
    ['P-2026-015', 'مركز البر المجتمعي', 'المدينة المنورة — قباء', 5, 'pm2', 30, 330, 12800000, 11500000, 'pending_approval', 'مجتمعي'],
    ['P-2026-019', 'توسعة مصنع الواحة للأغذية', 'جدة — الخمرة', 1, 'pm1', 60, 420, 22300000, 0, 'study', 'صناعي'],
    ['P-2026-011', 'محطة خدمات رواسي — طريق الدمام', 'الدمام — طريق الظهران', 2, 'pm3', -90, 150, 9400000, 8600000, 'on_hold', 'تجاري'],
  ];
  const proj = [];
  const phaseTpl = [['أعمال الحفر والتسوية', 8], ['الأساسات والقواعد', 15], ['الهيكل الخرساني', 30], ['أعمال المباني والعزل', 15], ['الأعمال الكهروميكانيكية', 17], ['التشطيبات والتسليم', 15]];
  for (let i = 0; i < P.length; i++) {
    const [code, name, location, ci, pm, s, e, contract, budget, status, type] = P[i];
    const [r] = await db('projects').insert({ code, name, location, client_id: cl[ci], manager_id: emp[pm], start_date: day(s), end_date: day(e), contract_value: contract, budget, status, project_type: type,
      image_url: imgs[i], description: `مشروع ${type} — بيانات تجريبية لأغراض اختبار النظام.`, ...D }).returning('*');
    proj.push({ ...r, pmKey: pm });
    // phases: split project duration proportionally
    const total = e - s; let cursor = s; const phases = [];
    for (let k = 0; k < phaseTpl.length; k++) {
      const [pn, w] = phaseTpl[k]; const len = Math.round(total * (w / 100) * 1.15);
      const ps = cursor - (k > 0 ? Math.round(len * 0.15) : 0); const pe = Math.min(ps + len, e); cursor = pe;
      phases.push({ project_id: r.id, name: pn, weight: w, start_date: day(ps), end_date: day(pe), sort: k + 1, ...D });
    }
    // actual progress by status
    const timeFrac = (ph) => Math.max(0, Math.min(1, (TODAY - new Date(ph.start_date)) / (new Date(ph.end_date) - new Date(ph.start_date))));
    const factor = { in_progress: 0.95 + rnd() * 0.12, delayed: 0.72, on_hold: 0.8, completed: 1, pending_approval: 0, study: 0 }[status];
    for (const ph of phases) {
      let pr = status === 'completed' ? 100 : Math.round(Math.min(100, timeFrac(ph) * 100 * factor));
      if (['pending_approval', 'study'].includes(status)) pr = 0;
      ph.progress = pr; ph.status = pr >= 100 ? 'completed' : pr > 0 ? (status === 'delayed' && pr < timeFrac(ph) * 100 - 10 ? 'delayed' : 'in_progress') : 'not_started';
    }
    await db('project_phases').insert(phases);
    const prog = Math.round(phases.reduce((a, p) => a + p.weight * p.progress, 0) / 100 * 100) / 100;
    await db('projects').where({ id: r.id }).update({ progress: prog });
    proj[i].progress = prog; proj[i].phases = phases;
    // monthly snapshots for current year
    const year = TODAY.getFullYear();
    for (let m = 0; m <= TODAY.getMonth(); m++) {
      const monthEnd = new Date(year, m + 1, 0, 12).getTime();
      if (monthEnd < new Date(day(s)).getTime() && m < TODAY.getMonth()) continue;
      const planned = plannedProgress(r, phases, Math.min(monthEnd, TODAY.getTime()));
      const actual = status === 'completed' ? Math.min(100, planned) : m === TODAY.getMonth() ? prog : Math.min(prog, Math.round(planned * factor * 10) / 10);
      await db('project_progress').insert({ project_id: r.id, month: `${year}-${String(m + 1).padStart(2, '0')}`, actual, planned, ...D }).onConflict(['project_id', 'month']).ignore();
    }
  }
  const active = proj.filter((p) => ['in_progress', 'delayed', 'on_hold'].includes(p.status));

  // ---------- teams ----------
  const teams = { pm1: ['eng1', 'eng4', 'sur', 'sup1', 'fore1', 'hse', 'drv', 'qs'], pm2: ['eng3', 'eng5', 'sup2', 'fore2', 'qc', 'qs'], pm3: ['eng2', 'eng4', 'sup3', 'hse', 'qc'] };
  for (const p of proj) for (const k of teams[p.pmKey]) await db('project_members').insert({ project_id: p.id, employee_id: emp[k], role_in_project: E.find((e) => e[0] === k)[2], joined_at: p.start_date, ...D }).onConflict().ignore();

  // ---------- tasks ----------
  const taskTitles = ['مراجعة مخططات التسليح للدور', 'اعتماد عينات البلاط من الاستشاري', 'صب خرسانة سقف الدور', 'فحص مكعبات الخرسانة (28 يوم)', 'تحديث الجدول الزمني الأسبوعي', 'استلام شحنة حديد التسليح', 'تركيب نظام العزل المائي للسطح',
    'تمديدات الكهرباء — الدور', 'اختبار ضغط شبكة المياه', 'رفع مستخلص الشهر للعميل', 'تقرير السلامة الأسبوعي', 'معاينة الاستشاري لأعمال الشدات', 'تجهيز طلب شراء مواد التشطيبات', 'تنسيق دخول مقاول الواجهات',
    'رفع مخططات As-Built', 'حصر كميات أعمال البلوك', 'اعتماد مصنع الألمنيوم', 'إصلاح ملاحظات الجودة في الدور'];
  const assignees = ['eng1', 'eng2', 'eng3', 'eng4', 'eng5', 'qs', 'sup1', 'sup2', 'sup3', 'hse', 'qc', 'sur', 'fore1', 'fore2'];
  const taskRows = [];
  for (const p of active.concat(proj.filter((x) => x.status === 'completed'))) {
    const n = p.status === 'completed' ? 4 : int(7, 10);
    for (let i = 0; i < n; i++) {
      const due = p.status === 'completed' ? int(-200, -45) : int(-12, 30);
      let status = p.status === 'completed' ? 'done' : due < -2 ? pick(['done', 'done', 'overdue', 'review']) : due < 5 ? pick(['in_progress', 'review', 'new', 'done']) : pick(['new', 'in_progress', 'new']);
      if (status === 'overdue' && due >= 0) status = 'in_progress';
      const team = teams[p.pmKey].filter((k) => assignees.includes(k));
      const who = pick(team);
      taskRows.push({ title: `${pick(taskTitles)}${pick(['', ' الثالث', ' الخامس', ' الأرضي', ' (المبنى B)', ''])}`, description: 'مهمة تجريبية مرتبطة بالمشروع لأغراض الاختبار.', project_id: p.id, assignee_id: emp[who],
        priority: pick(['low', 'medium', 'medium', 'high', 'urgent']), status, start_date: day(due - int(5, 20)), due_date: day(due), progress: status === 'done' ? 100 : status === 'review' ? 95 : status === 'new' ? 0 : int(20, 80),
        created_by: users[p.pmKey === 'pm1' ? 'demo.pm' : p.pmKey === 'pm2' ? 'demo.pm2' : 'demo.pm3'], ...D });
    }
  }
  // personal tasks for demo.employee (eng2) and admin tasks
  taskRows.push({ title: 'إعداد دراسة إنشائية لتوسعة مصنع الواحة', project_id: proj[7].id, assignee_id: emp.eng2, priority: 'high', status: 'in_progress', start_date: day(-5), due_date: day(6), progress: 40, created_by: users['demo.ceo'], ...D });
  taskRows.push({ title: 'مراجعة تقرير الاستشاري لمستشفى النخبة', project_id: proj[2].id, assignee_id: emp.eng2, priority: 'urgent', status: 'new', start_date: day(0), due_date: day(2), progress: 0, created_by: users['demo.pm3'], ...D });
  taskRows.push({ title: 'تحديث سياسة الحضور والانصراف', assignee_id: emp.hr2, priority: 'medium', status: 'in_progress', start_date: day(-10), due_date: day(10), progress: 50, created_by: users['demo.hr'], ...D });
  taskRows.push({ title: 'إعداد الميزانية التقديرية لعام 2027', assignee_id: emp.acc1, priority: 'high', status: 'in_progress', start_date: day(-14), due_date: day(20), progress: 35, created_by: users['demo.cfo'], ...D });
  const insertedTasks = await db('tasks').insert(taskRows).returning(['id', 'status', 'created_by']);
  for (const t of insertedTasks.slice(0, 12)) await db('task_comments').insert({ task_id: t.id, user_id: t.created_by, body: pick(['يرجى إرفاق صور الموقع مع التحديث.', 'تمت مراجعة المخططات، توجد ملاحظتان بسيطتان.', 'تم التنسيق مع الاستشاري للمعاينة يوم الأحد.', 'الرجاء الالتزام بموعد التسليم.']), ...D });

  // ---------- issues & daily reports ----------
  const issues = [['تأخر توريد حديد التسليح من المورد', 'high', 'obstacle'], ['ملاحظات الاستشاري على أعمال الشدات', 'medium', 'obstacle'], ['تعارض في مخططات التكييف مع الإنشائي', 'high', 'obstacle'], ['نقص في العمالة الماهرة للتشطيبات', 'medium', 'obstacle'],
    ['انقطاع الكهرباء المؤقتة في الموقع', 'low', 'obstacle'], ['تعديل العميل لتصميم الواجهة', 'critical', 'obstacle'], ['اجتماع أسبوعي مع الاستشاري تم بنجاح', 'low', 'update'], ['اعتماد عينة الرخام', 'low', 'note']];
  for (const p of active) for (let i = 0; i < int(2, 4); i++) { const [title, severity, kind] = pick(issues); await db('project_issues').insert({ project_id: p.id, title, severity, kind, details: 'تفاصيل تجريبية.', status: pick(['open', 'open', 'in_progress', 'resolved']), created_by: users['demo.pm'], ...D }); }
  const work = ['صب خرسانة أعمدة الدور', 'تركيب شدات السقف', 'أعمال البلوك للجدران الخارجية', 'تمديد مواسير الصرف', 'تمديدات الكهرباء في الأسقف', 'أعمال العزل المائي', 'لياسة داخلية', 'تركيب حديد تسليح البلاطات', 'ردم ودك طبقات'];
  for (const p of active.filter((x) => x.status !== 'on_hold')) {
    for (let d = -20; d <= -1; d++) {
      const wd = new Date(day(d)).getDay(); if (wd === 5) continue;
      await db('daily_reports').insert({ project_id: p.id, report_date: day(d), weather: pick(['مشمس', 'مشمس', 'غائم جزئياً', 'رياح مثيرة للغبار', 'حار']), workers_count: int(35, 140), equipment_count: int(4, 15),
        work_done: `${pick(work)}، ${pick(work)}.`, issues: rnd() > 0.7 ? pick(issues)[0] : '', next_plan: pick(work), created_by: users['demo.pm'], ...D });
    }
  }

  // ---------- finance ----------
  const ok = (d) => (d > -10 ? pick(['pending', 'approved', 'approved']) : pick(['approved', 'paid', 'paid']));
  const txs = []; let inc = 0, exp = 0;
  const year = TODAY.getFullYear();
  for (const p of proj.filter((x) => !['study', 'pending_approval'].includes(x.status))) {
    const startOffset = Math.max(Math.round((new Date(p.start_date) - TODAY) / 86400000), Math.round((new Date(year, 0, 1) - TODAY) / 86400000));
    for (let d = startOffset; d < (p.status === 'completed' ? Math.round((new Date(p.end_date) - TODAY) / 86400000) : 0); d += int(18, 32)) {
      const amt = Math.round(p.contract_value * (0.03 + rnd() * 0.04) / 1000) * 1000;
      txs.push({ ref_no: `INC-${year}-${String(++inc).padStart(4, '0')}`, kind: 'income', category: pick(['مستخلص', 'مستخلص', 'دفعة مقدمة']), amount: amt, tx_date: day(d), project_id: p.id, client_id: p.client_id, description: `مستخلص رقم ${inc} — ${p.name}`, status: ok(d), created_by: users['demo.cfo'], ...D });
      for (let k = 0; k < int(3, 5); k++) {
        const cat = pick(['مواد إنشائية', 'مواد إنشائية', 'أجور عمالة', 'تأجير معدات', 'مقاولي باطن', 'نقل', 'رسوم حكومية']);
        const dd = d + int(0, 15); if (dd > 0) continue;
        txs.push({ ref_no: `EXP-${year}-${String(++exp).padStart(4, '0')}`, kind: 'expense', category: cat, amount: Math.round(p.contract_value * (0.004 + rnd() * 0.012) / 100) * 100, tx_date: day(dd), project_id: p.id, supplier_id: cat === 'مواد إنشائية' ? pick(sp) : null,
          description: `${cat} — ${p.name}`, status: ok(dd), created_by: users[p.pmKey === 'pm1' ? 'demo.pm' : 'demo.cfo'], ...D });
      }
    }
  }
  for (let m = 0; m <= TODAY.getMonth(); m++) {
    const d = Math.round((new Date(year, m, 5, 12) - TODAY) / 86400000); if (d > 0) continue;
    txs.push({ ref_no: `EXP-${year}-${String(++exp).padStart(4, '0')}`, kind: 'expense', category: 'مصاريف إدارية', amount: int(180, 260) * 1000, tx_date: day(d), description: 'إيجار المقر والمصاريف التشغيلية', status: 'paid', created_by: users['demo.cfo'], ...D });
  }
  txs.push({ ref_no: `EXP-${year}-${String(++exp).padStart(4, '0')}`, kind: 'expense', category: 'تأجير معدات', amount: 86000, tx_date: day(-1), project_id: proj[0].id, supplier_id: sp[3], description: 'تأجير رافعة برجية — شهر إضافي', status: 'pending', created_by: users['demo.pm'], ...D });
  txs.push({ ref_no: `EXP-${year}-${String(++exp).padStart(4, '0')}`, kind: 'expense', category: 'مقاولي باطن', amount: 412000, tx_date: day(-2), project_id: proj[1].id, description: 'دفعة مقاول الأعمال الكهربائية', status: 'pending', created_by: users['demo.pm2'], ...D });
  await db('transactions').insert(txs);

  let invN = 0;
  for (const p of proj.filter((x) => ['in_progress', 'delayed', 'completed'].includes(x.status))) {
    for (let k = 0; k < 3; k++) {
      const amount = Math.round(p.contract_value * 0.05 / 1000) * 1000; const vat = Math.round(amount * 0.15);
      const issue = -int(10, 150); const status = k === 0 ? 'paid' : k === 1 ? pick(['partial', 'paid']) : pick(['issued', 'overdue']);
      const paid = status === 'paid' ? amount + vat : status === 'partial' ? Math.round((amount + vat) * 0.5) : 0;
      await db('invoices').insert({ number: `INV-${year}-${String(++invN).padStart(4, '0')}`, direction: 'sales', client_id: p.client_id, project_id: p.id, amount, vat, paid_amount: paid, issue_date: day(issue), due_date: day(issue + 30), status: status === 'issued' && issue + 30 < 0 ? 'overdue' : status, ...D });
    }
  }
  for (let k = 0; k < 5; k++) { const amount = int(80, 600) * 1000; await db('invoices').insert({ number: `PINV-${year}-${String(k + 1).padStart(4, '0')}`, direction: 'purchase', supplier_id: pick(sp), project_id: pick(active).id, amount, vat: Math.round(amount * 0.15), paid_amount: 0, issue_date: day(-int(5, 40)), due_date: day(int(-5, 30)), status: 'issued', ...D }); }
  for (let k = 0; k < 8; k++) { const out = rnd() > 0.5; await db('payments').insert({ direction: out ? 'out' : 'in', project_id: pick(active).id, supplier_id: out ? pick(sp) : null, client_id: out ? null : pick(cl), amount: int(50, 900) * 1000, due_date: day(int(-5, 45)), status: 'due', method: 'transfer', reference: `REF-${int(10000, 99999)}`, ...D }); }

  const months = [new Date(year, TODAY.getMonth() - 1, 1), new Date(year, TODAY.getMonth(), 1)].map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  for (const [k, , , , , salary] of E) for (const [mi, month] of months.entries()) {
    const allowances = Math.round(salary * 0.25); const deductions = Math.round(salary * 0.0975);
    await db('payroll').insert({ employee_id: emp[k], month, basic: salary, allowances, deductions, net: salary + allowances - deductions, status: mi === 0 ? 'paid' : 'pending', ...D });
  }

  // ---------- purchasing & inventory ----------
  const prs = [['حديد تسليح للأسقف — برج الأفق', 0, 'حديد تسليح 16مم — 60 طن\nحديد تسليح 12مم — 35 طن', 214000, 'approved'], ['بلوك عازل للمرحلة B', 1, 'بلوك أسمنتي معزول 20سم — 18,000 حبة', 97000, 'pending'],
    ['مواد عزل مائي للأسطح', 3, 'رولات عزل بيتومين — 450 رول\nبرايمر — 60 برميل', 76500, 'pending'], ['كابلات ولوحات كهرباء', 2, 'كابلات 4×95مم — 1,200 م\nلوحات توزيع رئيسية — 6', 338000, 'ordered'],
    ['خرسانة جاهزة للأساسات', 4, 'خرسانة C40 مقاومة — 850 م³', 255000, 'approved'], ['أدوات سلامة', 0, 'خوذات وأحزمة أمان وسترات عاكسة', 18400, 'rejected']];
  const prIds = [];
  for (let i = 0; i < prs.length; i++) { const [title, pi, items, total, status] = prs[i]; const [r] = await db('purchase_requests').insert({ number: `PR-${year}-${String(i + 1).padStart(4, '0')}`, title, project_id: proj[pi].id, items, estimated_total: total, needed_by: day(int(3, 25)), priority: pick(['medium', 'high', 'urgent']), status, requested_by: users['demo.pm'], approved_by: ['approved', 'ordered'].includes(status) ? users['demo.ceo'] : null, ...D }).returning('id'); prIds.push(r.id); }
  for (const [i, pr] of prIds.entries()) for (let k = 0; k < 3; k++) await db('quotations').insert({ purchase_request_id: pr, supplier_id: sp[(i + k) % sp.length], amount: Math.round(prs[i][3] * (0.9 + rnd() * 0.2)), delivery_days: int(3, 21), valid_until: day(int(10, 30)), status: i === 3 && k === 0 ? 'selected' : 'received', ...D });
  await db('purchase_orders').insert([
    { number: `PO-${year}-0001`, purchase_request_id: prIds[3], supplier_id: sp[5], project_id: proj[2].id, total: 329500, order_date: day(-6), delivery_date: day(8), status: 'sent', approved_by: users['demo.ceo'], ...D },
    { number: `PO-${year}-0002`, purchase_request_id: prIds[0], supplier_id: sp[0], project_id: proj[0].id, total: 209800, order_date: day(-1), delivery_date: day(10), status: 'pending', ...D },
  ]);
  const mats = [['M-001', 'حديد تسليح 16مم', 'حديد', 'طن', 42, 25, 2950], ['M-002', 'حديد تسليح 12مم', 'حديد', 'طن', 18, 20, 3010], ['M-003', 'أسمنت بورتلاندي', 'أسمنت', 'كيس', 2400, 1000, 17], ['M-004', 'أسمنت مقاوم للكبريتات', 'أسمنت', 'كيس', 640, 800, 21],
    ['M-005', 'بلوك أسمنتي 20سم', 'بلوك', 'حبة', 12500, 5000, 3.4], ['M-006', 'بلوك معزول 20سم', 'بلوك', 'حبة', 3200, 4000, 5.8], ['M-007', 'رمل ناعم', 'ركام', 'م³', 320, 100, 65], ['M-008', 'بحص مقاس 3/4', 'ركام', 'م³', 210, 120, 85],
    ['M-009', 'رولات عزل بيتومين', 'عزل', 'رول', 85, 120, 145], ['M-010', 'ألواح بوليسترين', 'عزل', 'لوح', 900, 300, 22], ['M-011', 'مواسير PVC 4 بوصة', 'سباكة', 'متر', 1450, 500, 18], ['M-012', 'كابل نحاس 4×16مم', 'كهرباء', 'متر', 2200, 800, 39],
    ['M-013', 'خشب شدات', 'شدات', 'م³', 46, 30, 1650], ['M-014', 'بلاط بورسلان 60×60', 'تشطيبات', 'م²', 3800, 1000, 48], ['M-015', 'دهان داخلي أساس', 'تشطيبات', 'جالون', 160, 200, 95]];
  const matIds = [];
  for (const [code, name, category, unit, quantity, min_quantity, unit_cost] of mats) { const [r] = await db('materials').insert({ code, name, category, unit, quantity, min_quantity, unit_cost, warehouse: pick(['المستودع الرئيسي — الرياض', 'مستودع المنطقة الشرقية', 'مستودع جدة']), ...D }).returning('id'); matIds.push(r.id); }
  for (let k = 0; k < 30; k++) { const out = rnd() > 0.4; await db('stock_movements').insert({ material_id: pick(matIds), direction: out ? 'out' : 'in', quantity: int(5, 300), project_id: out ? pick(active).id : null, reference: out ? `سند صرف ${int(100, 999)}` : `PO-${year}-000${int(1, 2)}`, move_date: day(-int(0, 45)), created_by: users['demo.procurement'], ...D }); }
  const eqs = [['EQ-01', 'رافعة برجية Liebherr 150', 'رافعات', 'in_use', 0, 'rented', 0], ['EQ-02', 'حفار كاتربيلر 320', 'حفارات', 'in_use', 3, 'owned', 620000], ['EQ-03', 'لودر كوماتسو WA380', 'لوادر', 'available', null, 'owned', 480000], ['EQ-04', 'مضخة خرسانة 42م', 'خرسانة', 'in_use', 1, 'rented', 0],
    ['EQ-05', 'رافعة شوكية 5 طن', 'رافعات', 'maintenance', null, 'owned', 140000], ['EQ-06', 'هزاز خرسانة', 'خرسانة', 'in_use', 4, 'owned', 4500], ['EQ-07', 'مولد كهرباء 250KVA', 'كهرباء', 'in_use', 2, 'owned', 175000], ['EQ-08', 'شاحنة قلاب 20م³', 'نقل', 'in_use', 0, 'owned', 390000],
    ['EQ-09', 'جهاز مساحة Total Station', 'مساحة', 'available', null, 'owned', 68000], ['EQ-10', 'سقالات معدنية (طقم)', 'سقالات', 'in_use', 1, 'owned', 95000], ['EQ-11', 'بوب كات S650', 'لوادر', 'out_of_service', null, 'owned', 160000], ['EQ-12', 'رافعة متحركة 50 طن', 'رافعات', 'in_use', 2, 'rented', 0]];
  for (const [code, name, category, status, pi, ownership, value] of eqs) await db('equipment').insert({ code, name, category, status, project_id: pi != null ? proj[pi].id : null, ownership, value, purchase_date: ownership === 'owned' ? day(-int(300, 1500)) : null, next_maintenance: day(int(-3, 60)), ...D });

  // ---------- documents ----------
  const folders = {};
  for (const [k, name, access] of [['contracts', 'العقود', 'management'], ['drawings', 'المخططات الهندسية', 'all'], ['licenses', 'التراخيص والسجلات', 'management'], ['hr', 'ملفات الموظفين', 'management'], ['minutes', 'محاضر الاجتماعات', 'all'], ['board', 'وثائق مجلس الإدارة', 'owner']]) {
    const [r] = await db('folders').insert({ name, access_level: access, ...D }).returning('id'); folders[k] = r.id;
  }
  const docs = [['عقد مقاولة — برج الأفق التجاري', 'contract', 'contracts', 0, 'management'], ['عقد مقاولة — مجمع الواحة السكني', 'contract', 'contracts', 1, 'management'], ['مخططات إنشائية — برج الأفق (Rev.3)', 'drawing', 'drawings', 0, 'all'],
    ['مخططات معمارية — مستشفى النخبة', 'drawing', 'drawings', 2, 'all'], ['رخصة البناء — مبنى المدار', 'license', 'licenses', 4, 'management'], ['السجل التجاري للشركة', 'license', 'licenses', null, 'management'], ['شهادة تصنيف المقاولين', 'license', 'licenses', null, 'management'],
    ['محضر اجتماع مجلس الإدارة — الربع الثالث', 'minutes', 'board', null, 'owner'], ['محضر اجتماع تنسيقي — مستشفى النخبة', 'minutes', 'minutes', 2, 'all'], ['جدول كميات — مستودعات رواسي', 'project', 'drawings', 3, 'all']];
  for (const [title, category, f, pi, access] of docs) {
    const url = await storeFile(`${title}.pdf`, await demoPdf(title), 'application/pdf');
    await db('documents').insert({ title, category, folder_id: folders[f], project_id: pi != null ? proj[pi].id : null, file_url: url, file_name: `${title}.pdf`, access_level: access, expiry_date: category === 'license' ? day(int(30, 400)) : null, created_by: users['demo.ceo'], ...D });
  }

  // ---------- meetings, decisions, circulars ----------
  const mts = [['الاجتماع الأسبوعي لمدراء المشاريع', -7, 'held'], ['مراجعة الأداء المالي للربع الرابع', -3, 'held'], ['اجتماع تنسيقي مع استشاري مستشفى النخبة', 2, 'scheduled'], ['الاجتماع الأسبوعي لمدراء المشاريع', 1, 'scheduled'], ['لجنة المشتريات — ترسية توريد الحديد', 4, 'scheduled']];
  const mIds = [];
  for (const [title, d, status] of mts) {
    const [r] = await db('meetings').insert({ title, starts_at: at(d, 10, 0), duration_minutes: 60, location: pick(['قاعة الاجتماعات — المقر الرئيسي', 'Microsoft Teams', 'مكتب الموقع']), agenda: '1. مراجعة الإنجاز\n2. المعوقات\n3. التوصيات', minutes: status === 'held' ? 'تمت مناقشة نسب الإنجاز والاتفاق على تسريع أعمال الهيكل الخرساني.' : null, status, created_by: users['demo.ceo'], ...D }).returning('id');
    mIds.push(r.id);
    for (const k of ['pmo', 'pm1', 'pm2', 'pm3', 'cfo', 'eng2']) await db('meeting_attendees').insert({ meeting_id: r.id, employee_id: emp[k], attendance: status === 'held' ? pick(['attended', 'attended', 'absent']) : 'invited', ...D });
  }
  const decs = [['اعتماد خطة تسريع الأعمال في مستشفى النخبة', 'operational', 'pm3', 'in_progress'], ['زيادة ميزانية مشروع برج الأفق بنسبة 4%', 'strategic', 'cfo', 'pending'], ['اعتماد مورد الحديد الرئيسي لعام 2027', 'operational', 'prc', 'pending'],
    ['تطبيق نظام البصمة في جميع المواقع', 'operational', 'hr', 'approved'], ['الدخول في مناقصة مشروع جامعي بقيمة 210 مليون', 'strategic', 'ceo', 'pending'], ['تعيين مهندس سلامة إضافي لكل موقع', 'operational', 'hse', 'done']];
  for (const [i, [title, level, k, status]] of decs.entries()) await db('decisions').insert({ number: `DEC-${year}-${String(i + 1).padStart(4, '0')}`, title, level, details: 'نص القرار التجريبي.', meeting_id: mIds[i % 2], responsible_id: emp[k], due_date: day(int(5, 40)), status, approved_by: ['approved', 'in_progress', 'done'].includes(status) ? users['demo.owner'] : null, created_by: users['demo.ceo'], ...D });
  const circs = [['تحديث سياسة السلامة في المواقع', 'all', 'يُلزم جميع العاملين في المواقع بارتداء معدات الوقاية الشخصية كاملة، ويمنع دخول أي شخص دون بطاقة تعريف.'], ['مواعيد الدوام خلال فصل الشتاء', 'all', 'يبدأ دوام المواقع الساعة 7:00 صباحاً وينتهي 3:00 عصراً اعتباراً من الأحد القادم.'],
    ['آلية رفع طلبات المصروفات عبر النظام', 'management', 'تُرفع جميع طلبات المصروفات عبر النظام مع إرفاق الفواتير، ولا يتم صرف أي مبلغ دون اعتماد مالي.'], ['إطلاق نظام TAL الإداري', 'all', 'يسرنا إطلاق نظام الإدارة المتكامل لشركة تال. نرجو من الجميع تسجيل الحضور والمهام عبر النظام.']];
  for (const [i, [title, audience, body]] of circs.entries()) await db('circulars').insert({ number: `CIR-${year}-${String(i + 1).padStart(4, '0')}`, title, audience, body, issue_date: day(-int(1, 40)), created_by: users['demo.ceo'], ...D });

  // ---------- attendance (last 30 days) & leave ----------
  const att = [];
  for (const [k, , , , , , shift] of E) {
    const start = shift === shSite.id ? 7 : 8;
    for (let d = -30; d <= 0; d++) {
      const wd = new Date(day(d)).getDay(); if (wd === 5 || wd === 6) continue;
      if (d === 0 && rnd() < 0.2) continue; // some haven't checked in yet today
      const r = rnd();
      if (r < 0.04) { att.push({ employee_id: emp[k], work_date: day(d), status: 'absent', ...D }); continue; }
      const late = r < 0.18 ? int(16, 55) : 0; const mins = late ? late + (shift === shSite.id ? 10 : 15) : int(0, 12) - 10;
      const inT = at(d, start, 0); inT.setMinutes(inT.getMinutes() + mins);
      const outT = d === 0 ? null : at(d, start + 8, int(0, 40));
      att.push({ employee_id: emp[k], work_date: day(d), check_in: inT, check_out: outT, status: late ? 'late' : 'present', late_minutes: late, source: pick(['web', 'gps', 'web']), ...D });
    }
  }
  await db('attendance').insert(att);
  await db('leave_requests').insert([
    { employee_id: emp.eng3, leave_type: 'annual', start_date: day(10), end_date: day(16), days: 7, reason: 'إجازة عائلية', status: 'pending', ...D },
    { employee_id: emp.acc2, leave_type: 'sick', start_date: day(-4), end_date: day(-3), days: 2, reason: 'مراجعة طبية', status: 'approved', decided_by: users['demo.hr'], ...D },
    { employee_id: emp.eng2, leave_type: 'annual', start_date: day(25), end_date: day(29), days: 5, reason: 'سفر', status: 'pending', ...D },
    { employee_id: emp.sup2, leave_type: 'emergency', start_date: day(-15), end_date: day(-14), days: 2, reason: 'ظرف طارئ', status: 'approved', decided_by: users['demo.hr'], ...D },
    { employee_id: emp.fore1, leave_type: 'annual', start_date: day(3), end_date: day(30), days: 28, reason: 'إجازة سنوية', status: 'pending', ...D },
  ]);
  for (const [k] of E) {
    await db('evaluations').insert({ employee_id: emp[k], period: `النصف الأول ${year}`, score: int(68, 97), strengths: 'الالتزام وجودة العمل', improvements: 'إدارة الوقت والتوثيق', evaluator_id: users['demo.hr'], ...D });
    await db('employee_history').insert({ employee_id: emp[k], event_type: 'hired', details: 'تعيين', event_date: (await db('employees').where({ id: emp[k] }).first('hire_date')).hire_date, ...D });
  }
  await db('employee_history').insert([{ employee_id: emp.eng1, event_type: 'promotion', details: 'ترقية إلى مهندس مدني أول', event_date: day(-200), ...D }, { employee_id: emp.pm2, event_type: 'promotion', details: 'ترقية إلى مديرة مشروع', event_date: day(-330), ...D }, { employee_id: emp.eng2, event_type: 'training', details: 'دورة تصميم المنشآت الخرسانية — 40 ساعة', event_date: day(-90), ...D }]);

  // ---------- notifications & messages ----------
  const nf = [];
  for (const u of Object.values(users)) {
    nf.push({ user_id: u, type: 'circular', title: 'تعميم إداري: إطلاق نظام TAL الإداري', link: '/meetings?tab=circulars', ...D });
    nf.push({ user_id: u, type: 'meeting', title: 'دعوة لاجتماع: الاجتماع الأسبوعي لمدراء المشاريع', link: '/meetings', ...D });
  }
  nf.push({ user_id: users['demo.employee'], type: 'task', title: 'مهمة جديدة مسندة إليك', body: 'مراجعة تقرير الاستشاري لمستشفى النخبة', link: '/tasks', ...D });
  nf.push({ user_id: users['demo.owner'], type: 'approval', title: 'قرار بانتظار الاعتماد', body: 'زيادة ميزانية مشروع برج الأفق بنسبة 4%', link: '/meetings?tab=decisions', ...D });
  await db('notifications').insert(nf);
  const [m1] = await db('messages').insert({ sender_id: users['demo.pm'], recipient_id: users['demo.ceo'], subject: 'طلب تمديد تأجير الرافعة البرجية', body: 'نرجو الموافقة على تمديد تأجير الرافعة البرجية لمدة شهر إضافي نظراً لتأخر توريد الحديد. تم رفع طلب المصروف في النظام.', ...D }).returning('id');
  await db('messages').insert({ sender_id: users['demo.ceo'], recipient_id: users['demo.pm'], parent_id: m1.id, subject: 'طلب تمديد تأجير الرافعة البرجية', body: 'تمت المراجعة، سيتم الاعتماد من الإدارة المالية اليوم.', ...D });
  await db('messages').insert({ sender_id: users['demo.hr'], department_id: deps.ENG, subject: 'تحديث بيانات الموظفين', body: 'نرجو من جميع منسوبي الإدارة الهندسية مراجعة بياناتهم في ملفهم الوظيفي وإبلاغنا بأي تعديل.', ...D });

  await db('audit_logs').insert({ user_name: 'system', action: 'demo_seed', entity: 'system', summary: 'تحميل البيانات التجريبية لاختبار النظام (يمكن حذفها من الإعدادات)' });
  console.log(`\nDemo data loaded. Demo accounts (password: ${DEMO_PASSWORD}):`);
  for (const [u] of U) console.log(`  ${u}`);
  await db.destroy();
})().catch(async (e) => { console.error(e); await db.destroy(); process.exit(1); });
