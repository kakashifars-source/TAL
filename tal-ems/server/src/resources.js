/**
 * Resource registry. Each entry drives:
 *  - the generic REST API (list/search/sort/filter/get/create/update/delete)
 *  - row-level scoping (what rows a user may see)  -> scope()
 *  - write guards (what rows a user may change)     -> guard()
 *  - field-level permissions                        -> field.perm
 *  - workflow actions (approve/reject/...)          -> actions
 *  - form & table metadata sent to the frontend     -> /api/meta
 */
const { db, HttpError, notify, usersWithPerm, userIdForEmployee, visibleProjectIds, managedProjectIds } = require('./core');

// ---------- vocabularies ----------
const o = (pairs) => pairs.map(([value, label, tone]) => ({ value, label, tone }));
const V = {
  projectStatus: o([['study', 'قيد الدراسة', 'gray'], ['pending_approval', 'بانتظار الاعتماد', 'amber'], ['ready', 'جاهز للتنفيذ', 'teal'],
    ['in_progress', 'قيد التنفيذ', 'blue'], ['on_hold', 'متوقف مؤقتاً', 'slate'], ['delayed', 'متأخر', 'red'], ['completed', 'مكتمل', 'green'], ['cancelled', 'ملغي', 'gray']]),
  taskStatus: o([['new', 'جديدة', 'gray'], ['in_progress', 'قيد التنفيذ', 'blue'], ['review', 'بانتظار المراجعة', 'amber'], ['done', 'مكتملة', 'green'], ['overdue', 'متأخرة', 'red']]),
  priority: o([['low', 'منخفضة', 'gray'], ['medium', 'متوسطة', 'blue'], ['high', 'عالية', 'amber'], ['urgent', 'عاجلة', 'red']]),
  approval: o([['pending', 'بانتظار الاعتماد', 'amber'], ['approved', 'معتمد', 'green'], ['rejected', 'مرفوض', 'red']]),
  txStatus: o([['pending', 'بانتظار الاعتماد', 'amber'], ['approved', 'معتمد', 'green'], ['paid', 'مدفوع / مستلم', 'teal'], ['rejected', 'مرفوض', 'red']]),
  empStatus: o([['active', 'على رأس العمل', 'green'], ['on_leave', 'في إجازة', 'amber'], ['suspended', 'موقوف', 'red'], ['terminated', 'منتهية خدمته', 'gray']]),
  attStatus: o([['present', 'حاضر', 'green'], ['late', 'متأخر', 'amber'], ['absent', 'غائب', 'red'], ['leave', 'إجازة', 'blue']]),
  leaveType: o([['annual', 'سنوية'], ['sick', 'مرضية'], ['emergency', 'اضطرارية'], ['unpaid', 'بدون راتب'], ['other', 'أخرى']]),
  phaseStatus: o([['not_started', 'لم تبدأ', 'gray'], ['in_progress', 'جارية', 'blue'], ['completed', 'مكتملة', 'green'], ['delayed', 'متأخرة', 'red']]),
  severity: o([['low', 'منخفضة', 'gray'], ['medium', 'متوسطة', 'blue'], ['high', 'عالية', 'amber'], ['critical', 'حرجة', 'red']]),
  issueStatus: o([['open', 'مفتوح', 'amber'], ['in_progress', 'قيد المعالجة', 'blue'], ['resolved', 'تمت المعالجة', 'green']]),
  issueKind: o([['obstacle', 'معوق'], ['note', 'ملاحظة'], ['update', 'تحديث']]),
  invStatus: o([['draft', 'مسودة', 'gray'], ['issued', 'صادرة', 'blue'], ['partial', 'مدفوعة جزئياً', 'amber'], ['paid', 'مدفوعة', 'green'], ['overdue', 'متأخرة السداد', 'red'], ['cancelled', 'ملغاة', 'gray']]),
  payStatus: o([['due', 'مستحقة', 'amber'], ['received', 'مستلمة', 'green'], ['paid', 'مدفوعة', 'teal']]),
  payrollStatus: o([['pending', 'بانتظار الاعتماد', 'amber'], ['approved', 'معتمد', 'blue'], ['paid', 'مصروف', 'green']]),
  prStatus: o([['pending', 'بانتظار الاعتماد', 'amber'], ['approved', 'معتمد', 'green'], ['rejected', 'مرفوض', 'red'], ['ordered', 'تم إصدار أمر شراء', 'teal']]),
  poStatus: o([['pending', 'بانتظار الاعتماد', 'amber'], ['approved', 'معتمد', 'blue'], ['sent', 'مرسل للمورد', 'teal'], ['delivered', 'تم التوريد', 'green'], ['cancelled', 'ملغي', 'gray']]),
  quoteStatus: o([['received', 'مستلم', 'blue'], ['selected', 'مختار', 'green'], ['rejected', 'مستبعد', 'gray']]),
  eqStatus: o([['available', 'متاحة', 'green'], ['in_use', 'قيد الاستخدام', 'blue'], ['maintenance', 'صيانة', 'amber'], ['out_of_service', 'خارج الخدمة', 'red']]),
  docCategory: o([['contract', 'عقود'], ['drawing', 'مخططات هندسية'], ['invoice', 'فواتير'], ['license', 'تراخيص'], ['admin', 'مستندات إدارية'],
    ['employee', 'ملفات الموظفين'], ['project', 'مستندات المشاريع'], ['minutes', 'محاضر الاجتماعات'], ['decision', 'قرارات رسمية']]),
  access: o([['all', 'جميع المستخدمين'], ['management', 'الإدارة فقط'], ['owner', 'المالك فقط']]),
  meetingStatus: o([['scheduled', 'مجدول', 'blue'], ['held', 'منعقد', 'green'], ['cancelled', 'ملغي', 'gray']]),
  decisionStatus: o([['pending', 'بانتظار الاعتماد', 'amber'], ['approved', 'معتمد', 'blue'], ['in_progress', 'قيد التنفيذ', 'teal'], ['done', 'منفذ', 'green'], ['rejected', 'مرفوض', 'red']]),
  decisionLevel: o([['operational', 'تشغيلي (المدير التنفيذي)'], ['strategic', 'استراتيجي (المالك)']]),
  txKind: o([['income', 'إيراد', 'green'], ['expense', 'مصروف', 'red']]),
  invDirection: o([['sales', 'فاتورة مبيعات (عميل)'], ['purchase', 'فاتورة مشتريات (مورد)']]),
  payDirection: o([['in', 'دفعة واردة', 'green'], ['out', 'دفعة صادرة', 'red']]),
  moveDirection: o([['in', 'إدخال', 'green'], ['out', 'صرف', 'red']]),
  ownership: o([['owned', 'مملوكة'], ['rented', 'مستأجرة']]),
  supplierStatus: o([['active', 'نشط', 'green'], ['blocked', 'موقوف', 'red']]),
  memberAtt: o([['invited', 'مدعو'], ['attended', 'حضر', 'green'], ['absent', 'غاب', 'red']]),
  audience: o([['all', 'جميع الموظفين'], ['management', 'الإدارة'], ['project_managers', 'مدراء المشاريع']]),
};

// ---------- scope helpers ----------
const inProjects = (col) => async (q, user) => {
  const ids = await visibleProjectIds(user);
  if (ids !== null) q.whereIn(col, ids.length ? ids : [-1]);
};
// write guard: project-bound record must belong to a project the user manages
const projectWriteGuard = async (user, data, existing) => {
  const pid = (data && data.project_id) || (existing && existing.project_id);
  if (!pid) return;
  const ids = await managedProjectIds(user);
  if (ids !== null && !ids.includes(Number(pid))) throw new HttpError(403, 'لا يمكنك التعديل إلا على المشاريع المسندة إليك');
};
const nextNumber = async (table, col, prefix) => {
  const year = new Date().getFullYear();
  const r = await db(table).where(col, 'like', `${prefix}-${year}-%`).count('* as c').first();
  return `${prefix}-${year}-${String(Number(r.c) + 1).padStart(4, '0')}`;
};
const meEmp = (user) => user.employee_id || -1;

// ---------- field builders ----------
const F = {
  text: (name, label, x = {}) => ({ name, label, type: 'text', ...x }),
  area: (name, label, x = {}) => ({ name, label, type: 'textarea', list: false, ...x }),
  num: (name, label, x = {}) => ({ name, label, type: 'number', ...x }),
  money: (name, label, x = {}) => ({ name, label, type: 'money', ...x }),
  pct: (name, label, x = {}) => ({ name, label, type: 'percent', min: 0, max: 100, ...x }),
  date: (name, label, x = {}) => ({ name, label, type: 'date', ...x }),
  dt: (name, label, x = {}) => ({ name, label, type: 'datetime', ...x }),
  sel: (name, label, options, x = {}) => ({ name, label, type: 'select', options, filter: true, ...x }),
  ref: (name, label, ref, x = {}) => ({ name, label, type: 'ref', ref, ...x }),
  img: (name, label, x = {}) => ({ name, label, type: 'image', list: false, ...x }),
  file: (name, label, x = {}) => ({ name, label, type: 'file', list: false, ...x }),
};

const R = {};

// ===================== Organization =====================
R.departments = {
  table: 'departments', label: 'الأقسام والإدارات', labelField: 'name', search: ['name', 'code'],
  perm: { view: () => true, create: 'settings.manage', update: 'settings.manage', delete: 'settings.manage' },
  fields: [F.text('name', 'اسم الإدارة / القسم', { required: true }), F.text('code', 'الرمز'), F.ref('parent_id', 'تتبع إدارة', 'departments'), F.area('description', 'الوصف')],
};

R.shifts = {
  table: 'shifts', label: 'الورديات', labelField: 'name', search: ['name'],
  perm: { view: () => true, create: 'attendance.manage', update: 'attendance.manage', delete: 'attendance.manage' },
  fields: [F.text('name', 'اسم الوردية', { required: true }), { name: 'start_time', label: 'بداية الدوام', type: 'time', required: true },
    { name: 'end_time', label: 'نهاية الدوام', type: 'time', required: true }, F.num('grace_minutes', 'فترة السماح (دقيقة)')],
};

// ===================== HR =====================
R.employees = {
  table: 'employees', label: 'الموظفون', labelField: 'full_name', search: ['full_name', 'emp_no', 'job_title', 'email', 'phone'],
  perm: { view: 'employees.view', create: 'employees.create', update: 'employees.update', delete: 'employees.delete' },
  fields: [
    F.img('photo_url', 'الصورة الشخصية'),
    F.text('emp_no', 'رقم الموظف', { required: true }), F.text('full_name', 'الاسم الكامل', { required: true }),
    F.text('job_title', 'المسمى الوظيفي'), F.ref('department_id', 'الإدارة / القسم', 'departments', { filter: true }),
    F.ref('manager_id', 'المدير المباشر', 'employees'), F.date('hire_date', 'تاريخ التوظيف'),
    F.text('phone', 'الجوال', { list: false }), F.text('email', 'البريد الإلكتروني', { type: 'email', list: false }),
    F.text('national_id', 'رقم الهوية / الإقامة', { list: false, perm: 'hr.view', selfVisible: true }),
    F.text('nationality', 'الجنسية', { list: false }),
    F.sel('status', 'حالة الموظف', V.empStatus, { default: 'active' }),
    F.ref('shift_id', 'الوردية', 'shifts', { list: false }),
    F.money('salary', 'الراتب الأساسي', { perm: 'employees.salary', selfVisible: true }),
    F.money('allowances', 'البدلات', { perm: 'employees.salary', selfVisible: true, list: false }),
    F.num('leave_balance', 'رصيد الإجازات (يوم)', { list: false, perm: 'hr.view', selfVisible: true }),
    F.area('notes', 'ملاحظات', { perm: 'hr.view' }),
  ],
  afterSave: async (row, { op, user, trx }) => {
    if (op === 'create') await trx('employee_history').insert({ employee_id: row.id, event_type: 'hired', details: `تعيين بمسمى ${row.job_title || ''}`, event_date: row.hire_date || new Date(), created_by: user.id, is_demo: false });
  },
};

R.evaluations = {
  table: 'evaluations', label: 'تقييمات الأداء', labelField: 'period', search: ['period'],
  perm: { view: (u) => u.can('hr.view') || !!u.employee_id, create: 'hr.manage', update: 'hr.manage', delete: 'hr.manage' },
  scope: async (q, u) => { if (!u.can('hr.view')) q.where('employee_id', meEmp(u)); },
  fields: [F.ref('employee_id', 'الموظف', 'employees', { required: true, filter: true }), F.text('period', 'فترة التقييم', { required: true, placeholder: 'مثال: الربع الثالث 2026' }),
    F.num('score', 'الدرجة (من 100)', { required: true, min: 0, max: 100 }), F.area('strengths', 'نقاط القوة'), F.area('improvements', 'مجالات التحسين')],
  beforeSave: async (d, { user, op }) => { if (op === 'create') d.evaluator_id = user.id; },
  afterSave: async (row, { op }) => {
    if (op === 'create') { const uid = await userIdForEmployee(row.employee_id); await notify(uid, { type: 'hr', title: 'تم إضافة تقييم أداء جديد', body: row.period, link: '/profile' }); }
  },
};

R.employee_history = {
  table: 'employee_history', label: 'السجل الوظيفي', labelField: 'event_type', search: ['details'],
  perm: { view: (u) => u.can('hr.view') || !!u.employee_id, create: 'hr.manage', update: 'hr.manage', delete: 'hr.manage' },
  scope: async (q, u) => { if (!u.can('hr.view')) q.where('employee_id', meEmp(u)); },
  defaultSort: ['event_date', 'desc'],
  fields: [F.ref('employee_id', 'الموظف', 'employees', { required: true, filter: true }),
    F.sel('event_type', 'نوع الحدث', o([['hired', 'تعيين'], ['promotion', 'ترقية'], ['transfer', 'نقل'], ['salary_change', 'تعديل راتب'], ['warning', 'إنذار'], ['training', 'تدريب'], ['termination', 'إنهاء خدمة'], ['other', 'أخرى']])),
    F.date('event_date', 'التاريخ', { required: true }), F.area('details', 'التفاصيل', { list: true })],
};

R.leave_requests = {
  table: 'leave_requests', label: 'طلبات الإجازات', labelField: 'leave_type', search: ['reason'],
  perm: { view: (u) => u.can('leaves.request') || u.can('leaves.approve'), create: 'leaves.request', update: 'leaves.approve', delete: 'leaves.approve' },
  scope: async (q, u) => { if (!u.can('leaves.approve') && !u.can('hr.view')) q.where('employee_id', meEmp(u)); },
  fields: [F.ref('employee_id', 'الموظف', 'employees', { filter: true, hiddenFor: (u) => !u.can('leaves.approve') }),
    F.sel('leave_type', 'نوع الإجازة', V.leaveType, { required: true, default: 'annual' }),
    F.date('start_date', 'من تاريخ', { required: true }), F.date('end_date', 'إلى تاريخ', { required: true }),
    F.num('days', 'عدد الأيام', { readonly: true }), F.area('reason', 'السبب'),
    F.sel('status', 'الحالة', V.approval, { readonly: true }), F.area('decision_note', 'ملاحظة القرار', { readonly: true })],
  beforeSave: async (d, { user, op }) => {
    if (op === 'create') {
      if (!user.can('leaves.approve') || !d.employee_id) d.employee_id = user.employee_id;
      if (!d.employee_id) throw new HttpError(400, 'حسابك غير مرتبط بملف موظف');
      d.status = 'pending';
    }
    if (d.start_date && d.end_date) {
      const days = Math.round((new Date(d.end_date) - new Date(d.start_date)) / 86400000) + 1;
      if (days < 1) throw new HttpError(400, 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
      d.days = days;
    }
  },
  afterSave: async (row, { op }) => {
    if (op === 'create') {
      const emp = await db('employees').where({ id: row.employee_id }).first('full_name');
      await notify(await usersWithPerm('leaves.approve'), { type: 'leave', title: 'طلب إجازة جديد', body: `${emp ? emp.full_name : ''} — ${row.days} يوم`, link: '/attendance?tab=leaves' });
    }
  },
  actions: {
    approve: { label: 'اعتماد', perm: 'leaves.approve', from: ['pending'], to: { status: 'approved' }, tone: 'green',
      run: async (row, { user, trx, note }) => {
        await trx('leave_requests').where({ id: row.id }).update({ decided_by: user.id, decided_at: trx.fn.now(), decision_note: note || null });
        if (row.leave_type === 'annual') await trx('employees').where({ id: row.employee_id }).decrement('leave_balance', row.days);
        const uid = await userIdForEmployee(row.employee_id);
        await notify(uid, { type: 'leave', title: 'تم اعتماد طلب إجازتك', body: `${row.start_date} → ${row.end_date}`, link: '/attendance?tab=leaves' }, trx);
      } },
    reject: { label: 'رفض', perm: 'leaves.approve', from: ['pending'], to: { status: 'rejected' }, tone: 'red', needsNote: true,
      run: async (row, { user, trx, note }) => {
        await trx('leave_requests').where({ id: row.id }).update({ decided_by: user.id, decided_at: trx.fn.now(), decision_note: note || null });
        const uid = await userIdForEmployee(row.employee_id);
        await notify(uid, { type: 'leave', title: 'تم رفض طلب إجازتك', body: note || '', link: '/attendance?tab=leaves' }, trx);
      } },
  },
};

R.attendance = {
  table: 'attendance', label: 'سجل الحضور', labelField: 'work_date', search: [],
  perm: { view: (u) => u.can('attendance.self') || u.can('attendance.view_all'), create: 'attendance.manage', update: 'attendance.manage', delete: 'attendance.manage' },
  scope: async (q, u) => { if (!u.can('attendance.view_all')) q.where('employee_id', meEmp(u)); },
  defaultSort: ['work_date', 'desc'],
  fields: [F.ref('employee_id', 'الموظف', 'employees', { required: true, filter: true }), F.date('work_date', 'التاريخ', { required: true, filter: true }),
    F.dt('check_in', 'وقت الحضور'), F.dt('check_out', 'وقت الانصراف'), F.sel('status', 'الحالة', V.attStatus),
    F.num('late_minutes', 'دقائق التأخير'), F.sel('source', 'المصدر', o([['web', 'النظام'], ['gps', 'الموقع الجغرافي'], ['biometric', 'جهاز البصمة'], ['manual', 'إدخال يدوي']])), F.area('note', 'ملاحظة')],
};

// ===================== Parties =====================
R.clients = {
  table: 'clients', label: 'العملاء', labelField: 'name', search: ['name', 'contact_person', 'cr_number'],
  perm: { view: (u) => u.can('finance.view') || u.can('projects.view_all'), create: (u) => u.can('finance.manage') || u.can('projects.create'), update: (u) => u.can('finance.manage') || u.can('projects.create'), delete: 'finance.delete' },
  fields: [F.text('name', 'اسم العميل', { required: true }), F.text('contact_person', 'الشخص المسؤول'), F.text('phone', 'الجوال'), F.text('email', 'البريد', { type: 'email' }),
    F.text('cr_number', 'السجل التجاري'), F.text('vat_number', 'الرقم الضريبي', { list: false }), F.text('city', 'المدينة'), F.area('notes', 'ملاحظات')],
};

R.suppliers = {
  table: 'suppliers', label: 'الموردون', labelField: 'name', search: ['name', 'category', 'contact_person'],
  perm: { view: (u) => u.can('finance.view') || u.can('purchasing.view'), create: (u) => u.can('purchasing.manage') || u.can('finance.manage'), update: (u) => u.can('purchasing.manage') || u.can('finance.manage'), delete: 'purchasing.approve' },
  fields: [F.text('name', 'اسم المورد', { required: true }), F.text('category', 'التصنيف', { filter: true }), F.text('contact_person', 'الشخص المسؤول'), F.text('phone', 'الجوال'),
    F.text('email', 'البريد', { type: 'email', list: false }), F.text('vat_number', 'الرقم الضريبي', { list: false }), F.num('rating', 'التقييم (1-5)', { min: 1, max: 5 }), F.sel('status', 'الحالة', V.supplierStatus, { default: 'active' })],
};

// ===================== Projects =====================
R.projects = {
  table: 'projects', label: 'المشاريع', labelField: 'name', search: ['name', 'code', 'location'],
  perm: { view: (u) => u.can('projects.view') || u.can('projects.view_all'), create: 'projects.create', update: 'projects.update', delete: 'projects.delete' },
  scope: async (q, u) => { const ids = await visibleProjectIds(u); if (ids !== null) q.whereIn('projects.id', ids.length ? ids : [-1]); },
  guard: async (u, d, existing) => {
    if (existing) {
      const ids = await managedProjectIds(u);
      if (ids !== null && !ids.includes(existing.id)) throw new HttpError(403, 'لا يمكنك تعديل مشروع غير مسند إليك');
    }
  },
  fields: [
    F.img('image_url', 'صورة المشروع'),
    F.text('code', 'رقم المشروع', { required: true }), F.text('name', 'اسم المشروع', { required: true }),
    F.text('location', 'موقع المشروع'), F.ref('client_id', 'العميل', 'clients'),
    F.ref('manager_id', 'مدير المشروع', 'employees', { filter: true, lockFor: (u) => !u.can('projects.create') }),
    F.text('project_type', 'نوع المشروع', { list: false }),
    F.date('start_date', 'تاريخ البداية'), F.date('end_date', 'تاريخ التسليم المتوقع'),
    F.money('contract_value', 'قيمة العقد', { perm: 'projects.budget', lockFor: (u) => !u.can('projects.approve') }),
    F.money('budget', 'الميزانية المعتمدة', { perm: 'projects.budget', lockFor: (u) => !u.can('projects.approve') }),
    F.sel('status', 'حالة المشروع', V.projectStatus, { default: 'study' }),
    F.pct('progress', 'نسبة الإنجاز', { readonly: true, hint: 'تُحسب تلقائياً من أوزان ونسب إنجاز المراحل' }),
    F.area('description', 'الوصف'),
  ],
  beforeSave: async (d, { user, existing }) => {
    // Only roles with projects.approve may move a project out of the approval gate
    if (d.status && existing && d.status !== existing.status && ['ready', 'in_progress'].includes(d.status) && ['study', 'pending_approval'].includes(existing.status) && !user.can('projects.approve')) {
      throw new HttpError(403, 'اعتماد بدء المشروع يتطلب صلاحية الاعتماد');
    }
  },
  afterSave: async (row, { op, existing }) => {
    if (row.manager_id && (op === 'create' || (existing && existing.manager_id !== row.manager_id))) {
      await notify(await userIdForEmployee(row.manager_id), { type: 'project', title: 'تم إسناد مشروع إليك', body: row.name, link: `/projects/${row.id}` });
    }
  },
  actions: {
    approve: { label: 'اعتماد المشروع والعقد', perm: 'projects.approve', from: ['study', 'pending_approval'], to: { status: 'ready' }, tone: 'green' },
  },
};

const projectChild = (extra) => ({
  perm: { view: (u) => u.can('projects.view') || u.can('projects.view_all'), create: 'projects.update', update: 'projects.update', delete: 'projects.update' },
  scope: inProjects('project_id'),
  guard: projectWriteGuard,
  ...extra,
});

async function recalcProgress(projectId, trx = db) {
  const phases = await trx('project_phases').where({ project_id: projectId });
  if (!phases.length) return;
  const tw = phases.reduce((s, p) => s + Number(p.weight || 0), 0);
  const progress = tw > 0 ? phases.reduce((s, p) => s + Number(p.weight || 0) * Number(p.progress || 0), 0) / tw
    : phases.reduce((s, p) => s + Number(p.progress || 0), 0) / phases.length;
  await trx('projects').where({ id: projectId }).update({ progress: Math.round(progress * 100) / 100 });
  await require('./metrics').snapshot(projectId, trx);
}

R.project_phases = projectChild({
  table: 'project_phases', label: 'مراحل التنفيذ', labelField: 'name', search: ['name'], defaultSort: ['sort', 'asc'],
  fields: [F.ref('project_id', 'المشروع', 'projects', { required: true, filter: true }), F.text('name', 'اسم المرحلة', { required: true }),
    F.date('start_date', 'البداية'), F.date('end_date', 'النهاية'), F.num('weight', 'الوزن النسبي %'), F.pct('progress', 'الإنجاز %'),
    F.sel('status', 'الحالة', V.phaseStatus, { default: 'not_started' }), F.num('sort', 'الترتيب', { list: false })],
  afterSave: async (row, { trx }) => recalcProgress(row.project_id, trx),
  afterDelete: async (row) => recalcProgress(row.project_id),
});

R.project_members = projectChild({
  table: 'project_members', label: 'فريق العمل', labelField: 'role_in_project', search: [],
  fields: [F.ref('project_id', 'المشروع', 'projects', { required: true, filter: true }), F.ref('employee_id', 'الموظف', 'employees', { required: true }),
    F.text('role_in_project', 'الدور في المشروع'), F.date('joined_at', 'تاريخ الانضمام')],
  afterSave: async (row, { op }) => {
    if (op === 'create') {
      const p = await db('projects').where({ id: row.project_id }).first('name');
      await notify(await userIdForEmployee(row.employee_id), { type: 'project', title: 'تمت إضافتك إلى فريق مشروع', body: p && p.name, link: `/projects/${row.project_id}` });
    }
  },
});

R.project_issues = projectChild({
  table: 'project_issues', label: 'الملاحظات والمعوقات', labelField: 'title', search: ['title', 'details'],
  perm: { view: (u) => u.can('projects.view') || u.can('projects.view_all'), create: (u) => u.can('projects.view') || u.can('projects.view_all'), update: 'projects.update', delete: 'projects.update' },
  guard: async (u, d, existing) => { if (existing) return projectWriteGuard(u, d, existing); const ids = await visibleProjectIds(u); if (ids !== null && !ids.includes(Number(d.project_id))) throw new HttpError(403, 'مشروع غير متاح'); },
  fields: [F.ref('project_id', 'المشروع', 'projects', { required: true, filter: true }), F.sel('kind', 'النوع', V.issueKind, { default: 'obstacle' }),
    F.text('title', 'العنوان', { required: true }), F.area('details', 'التفاصيل'), F.sel('severity', 'الأهمية', V.severity, { default: 'medium' }),
    F.sel('status', 'الحالة', V.issueStatus, { default: 'open' })],
  afterSave: async (row, { op }) => {
    if (op === 'create' && row.kind === 'obstacle' && ['high', 'critical'].includes(row.severity)) {
      const p = await db('projects').where({ id: row.project_id }).first('name', 'manager_id');
      const ids = await usersWithPerm('projects.view_all');
      ids.push(await userIdForEmployee(p.manager_id));
      await notify(ids, { type: 'project', title: 'معوق عالي الأهمية في مشروع', body: `${p.name}: ${row.title}`, link: `/projects/${row.project_id}?tab=issues` });
    }
  },
});

R.daily_reports = projectChild({
  table: 'daily_reports', label: 'التقارير اليومية', labelField: 'report_date', search: ['work_done', 'issues'], defaultSort: ['report_date', 'desc'],
  perm: { view: (u) => u.can('projects.view') || u.can('projects.view_all'), create: 'projects.update', update: 'projects.update', delete: 'projects.update' },
  fields: [F.ref('project_id', 'المشروع', 'projects', { required: true, filter: true }), F.date('report_date', 'تاريخ التقرير', { required: true }),
    F.text('weather', 'حالة الطقس'), F.num('workers_count', 'عدد العمالة'), F.num('equipment_count', 'عدد المعدات'),
    F.area('work_done', 'الأعمال المنجزة', { list: true, required: true }), F.area('issues', 'المعوقات'), F.area('next_plan', 'خطة اليوم التالي'), F.img('photo_url', 'صورة من الموقع')],
});

// ===================== Tasks =====================
R.tasks = {
  table: 'tasks', label: 'المهام والتكليفات', labelField: 'title', search: ['title', 'description'], defaultSort: ['due_date', 'asc'],
  perm: { view: () => true, create: 'tasks.create', update: () => true, delete: 'tasks.delete' },
  scope: async (q, u) => {
    if (u.can('tasks.view_all')) return;
    const managed = await managedProjectIds(u);
    q.where((w) => {
      w.where('tasks.assignee_id', meEmp(u)).orWhere('tasks.created_by', u.id);
      if (managed && managed.length) w.orWhereIn('tasks.project_id', managed);
    });
  },
  guard: async (u, d, existing) => {
    const pid = (d && d.project_id) || (existing && existing.project_id);
    if (pid && !u.can('tasks.view_all')) {
      const managed = await managedProjectIds(u);
      const isAssignee = existing && existing.assignee_id === u.employee_id;
      if (managed !== null && !managed.includes(Number(pid)) && !isAssignee && !(existing && existing.created_by === u.id)) throw new HttpError(403, 'لا يمكنك توزيع مهام على مشروع غير مسند إليك');
    }
  },
  // Assignees without tasks.update may only change progress/status, and cannot self-approve completion
  writableFields: (u, existing) => {
    if (!existing || u.can('tasks.update')) return null;
    if (existing.assignee_id === u.employee_id) return ['status', 'progress'];
    return [];
  },
  fields: [F.text('title', 'عنوان المهمة', { required: true }), F.area('description', 'الوصف'),
    F.ref('project_id', 'المشروع المرتبط', 'projects', { filter: true }), F.ref('assignee_id', 'الموظف المسؤول', 'employees', { filter: true, required: true }),
    F.sel('priority', 'الأولوية', V.priority, { default: 'medium' }), F.sel('status', 'الحالة', V.taskStatus, { default: 'new' }),
    F.date('start_date', 'تاريخ البداية'), F.date('due_date', 'تاريخ التسليم'), F.pct('progress', 'نسبة الإنجاز'), F.file('attachment_url', 'مرفق')],
  beforeSave: async (d, { user, existing }) => {
    if (d.status === 'done' && (!existing || existing.status !== 'done') && !user.can('tasks.approve')) d.status = 'review';
    if (d.status === 'done') d.progress = 100;
  },
  afterSave: async (row, { op, existing, user }) => {
    if (row.assignee_id && (op === 'create' || (existing && existing.assignee_id !== row.assignee_id))) {
      await notify(await userIdForEmployee(row.assignee_id), { type: 'task', title: 'مهمة جديدة مسندة إليك', body: row.title, link: `/tasks?open=${row.id}` });
    }
    if (existing && row.status === 'review' && existing.status !== 'review') {
      const ids = [row.created_by];
      if (row.project_id) { const p = await db('projects').where({ id: row.project_id }).first('manager_id'); ids.push(await userIdForEmployee(p && p.manager_id)); }
      await notify(ids.filter((i) => i !== user.id), { type: 'task', title: 'مهمة بانتظار مراجعتك', body: row.title, link: `/tasks?open=${row.id}` });
    }
  },
  actions: {
    approve: { label: 'اعتماد الإكمال', perm: 'tasks.approve', from: ['review'], to: { status: 'done', progress: 100 }, tone: 'green',
      run: async (row, { user, trx }) => {
        await trx('tasks').where({ id: row.id }).update({ approved_by: user.id, approved_at: trx.fn.now() });
        await notify(await userIdForEmployee(row.assignee_id), { type: 'task', title: 'تم اعتماد إكمال مهمتك', body: row.title, link: `/tasks?open=${row.id}` }, trx);
      } },
    return: { label: 'إعادة للتنفيذ', perm: 'tasks.approve', from: ['review'], to: { status: 'in_progress' }, tone: 'amber', needsNote: true,
      run: async (row, { trx, note, user }) => {
        if (note) await trx('task_comments').insert({ task_id: row.id, user_id: user.id, body: `أعيدت للتنفيذ: ${note}` });
        await notify(await userIdForEmployee(row.assignee_id), { type: 'task', title: 'أعيدت مهمتك للتنفيذ', body: note || row.title, link: `/tasks?open=${row.id}` }, trx);
      } },
  },
};

R.task_comments = {
  table: 'task_comments', label: 'تعليقات المهام', labelField: 'body', search: ['body'], defaultSort: ['created_at', 'asc'],
  perm: { view: () => true, create: () => true, update: () => false, delete: 'tasks.delete' },
  scope: async (q, u) => {
    if (u.can('tasks.view_all')) return;
    const sub = db('tasks').select('id');
    await R.tasks.scope(sub, u);
    q.whereIn('task_comments.task_id', sub);
  },
  guard: async (u, d) => {
    const q = db('tasks').where('tasks.id', d.task_id); await R.tasks.scope(q, u);
    if (!(await q.first())) throw new HttpError(403, 'مهمة غير متاحة');
  },
  fields: [F.ref('task_id', 'المهمة', 'tasks', { required: true }), F.ref('user_id', 'الكاتب', 'users', { readonly: true }), F.area('body', 'التعليق', { required: true, list: true }), F.file('attachment_url', 'مرفق')],
  beforeSave: async (d, { user }) => { d.user_id = user.id; },
};

// ===================== Finance =====================
const financeScope = async (q, u, col = 'project_id') => {
  if (u.can('finance.view')) return;
  const ids = await managedProjectIds(u);
  q.whereIn(col, ids && ids.length ? ids : [-1]);
};
R.transactions = {
  table: 'transactions', label: 'الإيرادات والمصروفات', labelField: 'ref_no', search: ['ref_no', 'description', 'category'], defaultSort: ['tx_date', 'desc'],
  perm: { view: (u) => u.can('finance.view') || u.can('projects.budget'), create: (u) => u.can('finance.manage') || u.can('finance.request'), update: 'finance.manage', delete: 'finance.delete' },
  scope: (q, u) => financeScope(q, u),
  guard: async (u, d) => {
    if (u.can('finance.manage')) return;
    if (d.kind !== 'expense') throw new HttpError(403, 'يمكنك رفع طلبات المصروفات فقط');
    await projectWriteGuard(u, d);
    if (!d.project_id) throw new HttpError(400, 'يجب تحديد المشروع');
  },
  fields: [F.text('ref_no', 'رقم المرجع', { readonly: true }), F.sel('kind', 'النوع', V.txKind, { required: true, default: 'expense' }),
    F.text('category', 'البند', { required: true, filter: true, suggestions: ['مواد إنشائية', 'أجور عمالة', 'تأجير معدات', 'مقاولي باطن', 'نقل', 'رسوم حكومية', 'مصاريف إدارية', 'مستخلص', 'دفعة مقدمة'] }),
    F.money('amount', 'المبلغ', { required: true }), F.date('tx_date', 'التاريخ', { required: true }),
    F.ref('project_id', 'المشروع', 'projects', { filter: true }), F.ref('client_id', 'العميل', 'clients', { list: false }), F.ref('supplier_id', 'المورد', 'suppliers', { list: false }),
    F.area('description', 'البيان'), F.sel('status', 'الحالة', V.txStatus, { readonly: true }), F.file('attachment_url', 'الفاتورة / المستند')],
  beforeSave: async (d, { op, user }) => {
    if (op === 'create') { d.ref_no = await nextNumber('transactions', 'ref_no', d.kind === 'income' ? 'INC' : 'EXP'); d.status = 'pending'; void user; }
  },
  afterSave: async (row, { op }) => {
    if (op === 'create') await notify(await usersWithPerm('finance.approve'), { type: 'finance', title: 'عملية مالية بانتظار الاعتماد', body: `${row.ref_no} — ${row.amount.toLocaleString()}`, link: '/finance?tab=transactions' });
  },
  actions: {
    approve: { label: 'اعتماد', perm: 'finance.approve', from: ['pending'], to: { status: 'approved' }, tone: 'green',
      run: async (row, { user, trx }) => {
        await trx('transactions').where({ id: row.id }).update({ approved_by: user.id, approved_at: trx.fn.now() });
        if (row.created_by && row.created_by !== user.id) await notify(row.created_by, { type: 'finance', title: 'تم اعتماد العملية المالية', body: row.ref_no, link: '/finance' }, trx);
      } },
    reject: { label: 'رفض', perm: 'finance.approve', from: ['pending'], to: { status: 'rejected' }, tone: 'red', needsNote: true,
      run: async (row, { trx, note }) => { if (row.created_by) await notify(row.created_by, { type: 'finance', title: 'تم رفض العملية المالية', body: `${row.ref_no}: ${note || ''}`, link: '/finance' }, trx); } },
    mark_paid: { label: 'تأكيد الصرف / الاستلام', perm: 'finance.manage', from: ['approved'], to: { status: 'paid' }, tone: 'teal' },
  },
};

R.invoices = {
  table: 'invoices', label: 'الفواتير', labelField: 'number', search: ['number', 'notes'], defaultSort: ['issue_date', 'desc'],
  perm: { view: 'finance.view', create: 'finance.manage', update: 'finance.manage', delete: 'finance.delete' },
  fields: [F.text('number', 'رقم الفاتورة', { required: true }), F.sel('direction', 'النوع', V.invDirection, { default: 'sales' }),
    F.ref('client_id', 'العميل', 'clients'), F.ref('supplier_id', 'المورد', 'suppliers', { list: false }), F.ref('project_id', 'المشروع', 'projects', { filter: true }),
    F.money('amount', 'المبلغ قبل الضريبة', { required: true }), F.money('vat', 'ضريبة القيمة المضافة'), F.money('paid_amount', 'المدفوع'),
    F.date('issue_date', 'تاريخ الإصدار'), F.date('due_date', 'تاريخ الاستحقاق'), F.sel('status', 'الحالة', V.invStatus, { default: 'issued' }),
    F.file('attachment_url', 'نسخة الفاتورة'), F.area('notes', 'ملاحظات')],
  beforeSave: async (d) => {
    if (d.amount != null && (d.vat == null || d.vat === '')) d.vat = Math.round(Number(d.amount) * 0.15 * 100) / 100;
    if (d.paid_amount != null && d.amount != null && d.status !== 'cancelled' && d.status !== 'draft') {
      const total = Number(d.amount) + Number(d.vat || 0);
      d.status = Number(d.paid_amount) >= total ? 'paid' : Number(d.paid_amount) > 0 ? 'partial' : d.status;
    }
  },
};

R.payments = {
  table: 'payments', label: 'الدفعات', labelField: 'reference', search: ['reference'], defaultSort: ['pay_date', 'desc'],
  perm: { view: 'finance.view', create: 'finance.manage', update: 'finance.manage', delete: 'finance.delete' },
  fields: [F.sel('direction', 'الاتجاه', V.payDirection, { required: true, default: 'in' }), F.ref('invoice_id', 'الفاتورة', 'invoices'),
    F.ref('project_id', 'المشروع', 'projects', { filter: true }), F.ref('client_id', 'العميل', 'clients', { list: false }), F.ref('supplier_id', 'المورد', 'suppliers', { list: false }),
    F.money('amount', 'المبلغ', { required: true }), F.date('due_date', 'تاريخ الاستحقاق'), F.date('pay_date', 'تاريخ السداد'),
    F.sel('method', 'طريقة الدفع', o([['transfer', 'تحويل بنكي'], ['cheque', 'شيك'], ['cash', 'نقداً']])), F.text('reference', 'المرجع'),
    F.sel('status', 'الحالة', V.payStatus, { default: 'due' })],
  afterSave: async (row, { trx }) => {
    if (row.invoice_id) {
      const s = await trx('payments').where({ invoice_id: row.invoice_id }).whereIn('status', ['received', 'paid']).sum('amount as s').first();
      const inv = await trx('invoices').where({ id: row.invoice_id }).first();
      const paid = Number(s.s || 0); const total = Number(inv.amount) + Number(inv.vat || 0);
      await trx('invoices').where({ id: row.invoice_id }).update({ paid_amount: paid, status: paid >= total ? 'paid' : paid > 0 ? 'partial' : inv.status });
    }
  },
};

R.payroll = {
  table: 'payroll', label: 'الرواتب', labelField: 'month', search: ['month'], defaultSort: ['month', 'desc'],
  perm: { view: (u) => u.can('finance.view') && u.can('employees.salary'), create: 'finance.manage', update: 'finance.manage', delete: 'finance.delete' },
  fields: [F.ref('employee_id', 'الموظف', 'employees', { required: true, filter: true }), F.text('month', 'الشهر (YYYY-MM)', { required: true, filter: true }),
    F.money('basic', 'الأساسي'), F.money('allowances', 'البدلات'), F.money('deductions', 'الاستقطاعات'), F.money('net', 'الصافي', { readonly: true }),
    F.sel('status', 'الحالة', V.payrollStatus, { readonly: true })],
  beforeSave: async (d, { op }) => { d.net = Number(d.basic || 0) + Number(d.allowances || 0) - Number(d.deductions || 0); if (op === 'create') d.status = 'pending'; },
  actions: {
    approve: { label: 'اعتماد', perm: 'finance.approve', from: ['pending'], to: { status: 'approved' }, tone: 'green', run: async (row, { user, trx }) => trx('payroll').where({ id: row.id }).update({ approved_by: user.id }) },
    mark_paid: { label: 'تأكيد الصرف', perm: 'finance.manage', from: ['approved'], to: { status: 'paid' }, tone: 'teal' },
  },
};

// ===================== Purchasing =====================
R.purchase_requests = {
  table: 'purchase_requests', label: 'طلبات الشراء', labelField: 'number', search: ['number', 'title', 'items'],
  perm: { view: 'purchasing.view', create: 'purchasing.request', update: 'purchasing.manage', delete: 'purchasing.approve' },
  scope: async (q, u) => {
    if (u.can('purchasing.manage') || u.can('purchasing.approve') || u.can('projects.view_all')) return;
    const managed = await managedProjectIds(u);
    q.where((w) => { w.where('requested_by', u.id); if (managed && managed.length) w.orWhereIn('project_id', managed); });
  },
  guard: async (u, d, existing) => { if (!existing && d.project_id && !u.can('purchasing.manage')) await projectWriteGuard(u, d); },
  fields: [F.text('number', 'رقم الطلب', { readonly: true }), F.text('title', 'عنوان الطلب', { required: true }), F.ref('project_id', 'المشروع', 'projects', { filter: true }),
    F.area('items', 'المواد والكميات', { required: true, placeholder: 'حديد تسليح 16مم — 20 طن\nأسمنت مقاوم — 400 كيس' }), F.money('estimated_total', 'التكلفة التقديرية'),
    F.date('needed_by', 'مطلوب بتاريخ'), F.sel('priority', 'الأولوية', V.priority, { default: 'medium' }), F.sel('status', 'الحالة', V.prStatus, { readonly: true }),
    F.ref('requested_by', 'مقدم الطلب', 'users', { readonly: true })],
  beforeSave: async (d, { op, user }) => { if (op === 'create') { d.number = await nextNumber('purchase_requests', 'number', 'PR'); d.requested_by = user.id; d.status = 'pending'; } },
  afterSave: async (row, { op }) => { if (op === 'create') await notify(await usersWithPerm('purchasing.approve'), { type: 'purchase', title: 'طلب شراء بانتظار الاعتماد', body: `${row.number} — ${row.title}`, link: '/purchasing' }); },
  actions: {
    approve: { label: 'اعتماد', perm: 'purchasing.approve', from: ['pending'], to: { status: 'approved' }, tone: 'green',
      run: async (row, { user, trx }) => { await trx('purchase_requests').where({ id: row.id }).update({ approved_by: user.id, approved_at: trx.fn.now() }); await notify(row.requested_by, { type: 'purchase', title: 'تم اعتماد طلب الشراء', body: row.number, link: '/purchasing' }, trx); } },
    reject: { label: 'رفض', perm: 'purchasing.approve', from: ['pending'], to: { status: 'rejected' }, tone: 'red', needsNote: true,
      run: async (row, { trx, note }) => notify(row.requested_by, { type: 'purchase', title: 'تم رفض طلب الشراء', body: `${row.number}: ${note || ''}`, link: '/purchasing' }, trx) },
  },
};

R.quotations = {
  table: 'quotations', label: 'عروض الأسعار', labelField: 'id', search: ['notes'],
  perm: { view: 'purchasing.view', create: 'purchasing.manage', update: 'purchasing.manage', delete: 'purchasing.manage' },
  fields: [F.ref('purchase_request_id', 'طلب الشراء', 'purchase_requests', { required: true, filter: true }), F.ref('supplier_id', 'المورد', 'suppliers', { required: true }),
    F.money('amount', 'قيمة العرض', { required: true }), F.num('delivery_days', 'مدة التوريد (يوم)'), F.date('valid_until', 'صالح حتى'),
    F.sel('status', 'الحالة', V.quoteStatus, { default: 'received' }), F.file('attachment_url', 'ملف العرض'), F.area('notes', 'ملاحظات')],
};

R.purchase_orders = {
  table: 'purchase_orders', label: 'أوامر الشراء', labelField: 'number', search: ['number'], defaultSort: ['order_date', 'desc'],
  perm: { view: 'purchasing.view', create: 'purchasing.manage', update: 'purchasing.manage', delete: 'purchasing.approve' },
  fields: [F.text('number', 'رقم أمر الشراء', { readonly: true }), F.ref('purchase_request_id', 'طلب الشراء', 'purchase_requests'), F.ref('supplier_id', 'المورد', 'suppliers', { required: true }),
    F.ref('project_id', 'المشروع', 'projects', { filter: true }), F.money('total', 'الإجمالي', { required: true }), F.date('order_date', 'تاريخ الأمر'), F.date('delivery_date', 'تاريخ التوريد المتوقع'),
    F.sel('status', 'الحالة', V.poStatus, { default: 'pending' })],
  beforeSave: async (d, { op }) => {
    if (op === 'create') { d.number = await nextNumber('purchase_orders', 'number', 'PO'); d.status = 'pending'; }
    else if (d.status === 'approved') throw new HttpError(403, 'الاعتماد يتم عبر زر الاعتماد فقط');
  },
  afterSave: async (row, { op, trx }) => {
    if (op === 'create') {
      if (row.purchase_request_id) await trx('purchase_requests').where({ id: row.purchase_request_id }).update({ status: 'ordered' });
      await notify(await usersWithPerm('purchasing.approve'), { type: 'purchase', title: 'أمر شراء بانتظار الاعتماد', body: row.number, link: '/purchasing?tab=orders' }, trx);
    }
  },
  actions: {
    approve: { label: 'اعتماد', perm: 'purchasing.approve', from: ['pending'], to: { status: 'approved' }, tone: 'green', run: async (row, { user, trx }) => trx('purchase_orders').where({ id: row.id }).update({ approved_by: user.id }) },
  },
};

// ===================== Inventory =====================
R.materials = {
  table: 'materials', label: 'المواد الإنشائية', labelField: 'name', search: ['name', 'code', 'category'],
  customFilters: { low_stock: (q) => q.whereRaw('materials.quantity <= materials.min_quantity') },
  perm: { view: 'inventory.view', create: 'inventory.manage', update: 'inventory.manage', delete: 'inventory.manage' },
  fields: [F.text('code', 'رمز المادة', { required: true }), F.text('name', 'اسم المادة', { required: true }), F.text('category', 'التصنيف', { filter: true }),
    F.text('unit', 'الوحدة'), F.num('quantity', 'الكمية المتوفرة', { readonlyAfterCreate: true, hint: 'تتغير بعد الإنشاء عبر حركات المخزون فقط' }), F.num('min_quantity', 'حد التنبيه'),
    F.money('unit_cost', 'تكلفة الوحدة'), F.text('warehouse', 'المستودع', { filter: true })],
};

R.stock_movements = {
  table: 'stock_movements', label: 'حركة المواد', labelField: 'reference', search: ['reference', 'notes'], defaultSort: ['move_date', 'desc'],
  perm: { view: 'inventory.view', create: 'inventory.manage', update: () => false, delete: () => false },
  fields: [F.ref('material_id', 'المادة', 'materials', { required: true, filter: true }), F.sel('direction', 'نوع الحركة', V.moveDirection, { required: true }),
    F.num('quantity', 'الكمية', { required: true, min: 0.01 }), F.ref('project_id', 'صرف لمشروع', 'projects', { filter: true }),
    F.text('reference', 'المرجع (أمر شراء / سند)'), F.date('move_date', 'التاريخ', { required: true }), F.area('notes', 'ملاحظات')],
  afterSave: async (row, { trx }) => {
    const m = await trx('materials').where({ id: row.material_id }).first();
    const qty = Number(m.quantity) + (row.direction === 'in' ? 1 : -1) * Number(row.quantity);
    if (qty < 0) throw new HttpError(400, `الكمية المتوفرة من ${m.name} غير كافية (${m.quantity})`);
    await trx('materials').where({ id: m.id }).update({ quantity: qty });
    if (qty <= Number(m.min_quantity) && Number(m.quantity) > Number(m.min_quantity)) {
      await notify(await usersWithPerm('inventory.manage'), { type: 'inventory', title: 'تنبيه انخفاض مخزون', body: `${m.name}: المتبقي ${qty} ${m.unit || ''}`, link: '/inventory' }, trx);
    }
  },
};

R.equipment = {
  table: 'equipment', label: 'المعدات والأدوات', labelField: 'name', search: ['name', 'code', 'category'],
  perm: { view: (u) => u.can('inventory.view') || u.can('projects.view') || u.can('projects.view_all'), create: 'inventory.manage', update: 'inventory.manage', delete: 'inventory.manage' },
  scope: async (q, u) => { if (!u.can('inventory.view')) await inProjects('project_id')(q, u); },
  fields: [F.text('code', 'رمز المعدة', { required: true }), F.text('name', 'اسم المعدة', { required: true }), F.text('category', 'الفئة', { filter: true }),
    F.sel('status', 'الحالة', V.eqStatus, { default: 'available' }), F.ref('project_id', 'المشروع الحالي', 'projects', { filter: true }), F.sel('ownership', 'الملكية', V.ownership),
    F.date('purchase_date', 'تاريخ الشراء', { list: false }), F.money('value', 'القيمة', { perm: 'finance.view' }), F.date('next_maintenance', 'الصيانة القادمة')],
};

// ===================== Documents =====================
const docScope = async (q, u, t = 'documents') => {
  if (u.isOwner) return;
  q.whereNot(`${t}.access_level`, 'owner');
  if (!u.can('documents.restricted')) q.where(`${t}.access_level`, 'all');
  if (t === 'documents') {
    const ids = await visibleProjectIds(u);
    if (ids !== null) q.where((w) => w.whereNull('documents.project_id').orWhereIn('documents.project_id', ids.length ? ids : [-1]));
    if (!u.can('hr.view')) q.where((w) => w.whereNull('documents.employee_id').orWhere('documents.employee_id', meEmp(u)));
  }
};
R.folders = {
  table: 'folders', label: 'المجلدات', labelField: 'name', search: ['name'], defaultSort: ['name', 'asc'],
  perm: { view: 'documents.view', create: 'documents.upload', update: 'documents.delete', delete: 'documents.delete' },
  scope: (q, u) => docScope(q, u, 'folders'),
  fields: [F.text('name', 'اسم المجلد', { required: true }), F.ref('parent_id', 'داخل مجلد', 'folders'), F.sel('access_level', 'صلاحية الوصول', V.access, { default: 'all' })],
};
R.documents = {
  table: 'documents', label: 'المستندات', labelField: 'title', search: ['title', 'file_name', 'notes'],
  perm: { view: 'documents.view', create: 'documents.upload', update: 'documents.delete', delete: 'documents.delete' },
  scope: (q, u) => docScope(q, u),
  guard: async (u, d) => {
    if (d.access_level === 'owner' && !u.isOwner) throw new HttpError(403, 'مستوى "المالك فقط" متاح للمالك');
    if (d.access_level === 'management' && !u.can('documents.restricted')) throw new HttpError(403, 'لا تملك صلاحية المستندات المقيدة');
    if (d.project_id) { const ids = await visibleProjectIds(u); if (ids !== null && !ids.includes(Number(d.project_id))) throw new HttpError(403, 'مشروع غير متاح'); }
  },
  fields: [F.text('title', 'عنوان المستند', { required: true }), F.sel('category', 'التصنيف', V.docCategory, { required: true }),
    F.ref('folder_id', 'المجلد', 'folders', { filter: true }), F.ref('project_id', 'المشروع', 'projects', { filter: true }), F.ref('employee_id', 'الموظف', 'employees', { list: false }),
    F.file('file_url', 'الملف', { required: true }), F.sel('access_level', 'صلاحية الوصول', V.access, { default: 'all' }), F.date('expiry_date', 'تاريخ الانتهاء'),
    F.area('notes', 'ملاحظات')],
  beforeSave: async (d) => {
    if (d.file_url) { const f = await db('files').where({ id: d.file_url.split('/').pop() }).first(); if (f) { d.file_name = f.original_name; d.file_size = f.size; } }
  },
};

// ===================== Meetings & decisions =====================
R.meetings = {
  table: 'meetings', label: 'الاجتماعات', labelField: 'title', search: ['title', 'agenda'], defaultSort: ['starts_at', 'desc'],
  perm: { view: 'meetings.view', create: 'meetings.manage', update: 'meetings.manage', delete: 'meetings.manage' },
  scope: async (q, u) => {
    if (u.can('meetings.manage') && (u.can('projects.view_all') || u.can('hr.view'))) return;
    q.where((w) => w.where('meetings.created_by', u.id).orWhereIn('meetings.id', db('meeting_attendees').where('employee_id', meEmp(u)).select('meeting_id')));
  },
  fields: [F.text('title', 'عنوان الاجتماع', { required: true }), F.dt('starts_at', 'الموعد', { required: true }), F.num('duration_minutes', 'المدة (دقيقة)', { list: false }),
    F.text('location', 'المكان / الرابط'), F.ref('project_id', 'المشروع', 'projects'), F.area('agenda', 'جدول الأعمال'), F.area('minutes', 'محضر الاجتماع'),
    F.sel('status', 'الحالة', V.meetingStatus, { default: 'scheduled' }), F.file('attachment_url', 'مرفقات')],
};
R.meeting_attendees = {
  table: 'meeting_attendees', label: 'الحضور', labelField: 'attendance', search: [],
  perm: { view: 'meetings.view', create: 'meetings.manage', update: 'meetings.manage', delete: 'meetings.manage' },
  fields: [F.ref('meeting_id', 'الاجتماع', 'meetings', { required: true, filter: true }), F.ref('employee_id', 'المدعو', 'employees', { required: true }), F.sel('attendance', 'الحضور', V.memberAtt, { default: 'invited' })],
  afterSave: async (row, { op }) => {
    if (op === 'create') { const m = await db('meetings').where({ id: row.meeting_id }).first(); await notify(await userIdForEmployee(row.employee_id), { type: 'meeting', title: 'دعوة لاجتماع', body: `${m.title} — ${new Date(m.starts_at).toLocaleString('ar-SA')}`, link: '/meetings' }); }
  },
};
R.decisions = {
  table: 'decisions', label: 'القرارات الإدارية', labelField: 'title', search: ['title', 'number', 'details'],
  perm: { view: 'meetings.view', create: 'meetings.manage', update: (u) => u.can('meetings.manage') || u.can('decisions.approve'), delete: 'decisions.approve' },
  fields: [F.text('number', 'رقم القرار', { readonly: true }), F.text('title', 'موضوع القرار', { required: true }), F.area('details', 'نص القرار'),
    F.sel('level', 'مستوى الاعتماد', V.decisionLevel, { default: 'operational' }),
    F.ref('meeting_id', 'الاجتماع', 'meetings', { list: false }), F.ref('responsible_id', 'المسؤول عن التنفيذ', 'employees'), F.date('due_date', 'موعد التنفيذ'),
    F.sel('status', 'الحالة', V.decisionStatus, { createHidden: true, hint: 'بعد الاعتماد يمكن تحديثها إلى قيد التنفيذ أو منفذ' })],
  beforeSave: async (d, { op, existing }) => {
    if (op === 'create') { d.number = await nextNumber('decisions', 'number', 'DEC'); d.status = 'pending'; }
    else if (d.status && existing && d.status !== existing.status) {
      if (existing.status === 'pending' || existing.status === 'rejected' || ['pending', 'rejected'].includes(d.status)) throw new HttpError(403, 'الاعتماد والرفض يتمان عبر أزرار الاعتماد');
    }
  },
  afterSave: async (row, { op }) => {
    if (op === 'create') await notify(await usersWithPerm('decisions.approve'), { type: 'approval', title: 'قرار بانتظار الاعتماد', body: `${row.number} — ${row.title}`, link: '/meetings?tab=decisions' });
  },
  actions: {
    approve: { label: 'اعتماد القرار', perm: 'decisions.approve', from: ['pending'], to: { status: 'approved' }, tone: 'green',
      check: (row, u) => { if (row.level === 'strategic' && !u.isOwner) throw new HttpError(403, 'القرارات الاستراتيجية يعتمدها المالك فقط'); },
      run: async (row, { user, trx }) => {
        await trx('decisions').where({ id: row.id }).update({ approved_by: user.id, approved_at: trx.fn.now() });
        await notify(await userIdForEmployee(row.responsible_id), { type: 'approval', title: 'قرار معتمد مسند إليك للتنفيذ', body: row.title, link: '/meetings?tab=decisions' }, trx);
      } },
    reject: { label: 'رفض', perm: 'decisions.approve', from: ['pending'], to: { status: 'rejected' }, tone: 'red',
      check: (row, u) => { if (row.level === 'strategic' && !u.isOwner) throw new HttpError(403, 'القرارات الاستراتيجية يبت فيها المالك فقط'); } },
  },
};
R.circulars = {
  table: 'circulars', label: 'التعاميم الإدارية', labelField: 'title', search: ['title', 'body', 'number'], defaultSort: ['issue_date', 'desc'],
  perm: { view: () => true, create: 'circulars.issue', update: 'circulars.issue', delete: 'circulars.issue' },
  fields: [F.text('number', 'رقم التعميم', { readonly: true }), F.text('title', 'عنوان التعميم', { required: true }), F.area('body', 'نص التعميم', { required: true }),
    F.sel('audience', 'الفئة المستهدفة', V.audience, { default: 'all' }), F.date('issue_date', 'تاريخ الإصدار'), F.file('attachment_url', 'مرفق')],
  scope: async (q, u) => {
    if (u.can('circulars.issue')) return;
    const aud = ['all'];
    if (u.role_level >= 50) aud.push('management');
    if (u.role_key === 'project_manager') aud.push('project_managers');
    q.whereIn('audience', aud);
  },
  beforeSave: async (d, { op }) => { if (op === 'create') { d.number = await nextNumber('circulars', 'number', 'CIR'); d.issue_date = d.issue_date || new Date().toISOString().slice(0, 10); } },
  afterSave: async (row, { op }) => {
    if (op !== 'create') return;
    let q = db('users as u').join('roles as r', 'r.id', 'u.role_id').where('u.is_active', true);
    if (row.audience === 'management') q = q.where('r.level', '>=', 50);
    if (row.audience === 'project_managers') q = q.whereIn('r.key', ['project_manager', 'owner', 'ceo']);
    await notify(await q.pluck('u.id'), { type: 'circular', title: `تعميم إداري: ${row.title}`, body: row.number, link: '/meetings?tab=circulars' });
  },
};

// users (read-only lookup for labels)
R.users = {
  table: 'users', label: 'المستخدمون', labelField: 'display_name', search: ['display_name', 'email'], internal: true,
  perm: { view: 'users.manage', create: () => false, update: () => false, delete: () => false },
  fields: [F.text('display_name', 'الاسم'), F.text('email', 'البريد')],
};

module.exports = { R, V, recalcProgress };
