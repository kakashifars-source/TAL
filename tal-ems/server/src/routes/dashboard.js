const express = require('express');
const { db, HttpError, wrap, visibleProjectIds, managedProjectIds } = require('../core');
const { plannedProgress } = require('../metrics');
const { R } = require('../resources');
const { scopedIds } = require('./resources');

const router = express.Router();
const today = () => new Date().toISOString().slice(0, 10);
const sumOf = async (q, col = 'amount') => Number((await q.sum(`${col} as s`).first()).s || 0);

async function projectRows(ids) {
  const q = db('projects as p').leftJoin('employees as e', 'e.id', 'p.manager_id').select('p.*', 'e.full_name as manager_name');
  if (ids !== null) q.whereIn('p.id', ids.length ? ids : [-1]);
  const projects = await q;
  const phases = await db('project_phases').whereIn('project_id', projects.map((p) => p.id));
  const spent = await db('transactions').where('kind', 'expense').whereIn('status', ['approved', 'paid']).whereIn('project_id', projects.map((p) => p.id)).groupBy('project_id').select('project_id').sum('amount as s');
  const spentMap = Object.fromEntries(spent.map((r) => [r.project_id, Number(r.s)]));
  return projects.map((p) => ({ ...p, planned: plannedProgress(p, phases.filter((x) => x.project_id === p.id)), spent: spentMap[p.id] || 0 }));
}

router.get('/dashboard', wrap(async (req, res) => {
  const u = req.user;
  if (!u.can('dashboard.view')) throw new HttpError(403, 'غير مسموح');
  const out = { role: u.role_key, sections: [] };
  const year = new Date().getFullYear();
  const t = today();

  // ---------- Executive (owner / CEO / anyone with view_all) ----------
  if (u.can('projects.view_all') && (u.can('projects.approve') || u.can('dashboard.finance'))) {
    out.sections.push('executive');
    const projects = await projectRows(null);
    const count = (s) => projects.filter((p) => s.includes(p.status)).length;
    const empTotal = Number((await db('employees').whereNot('status', 'terminated').count('* as c').first()).c);
    const present = Number((await db('attendance').where('work_date', t).whereIn('status', ['present', 'late']).whereNotNull('check_in').whereNull('check_out').count('* as c').first()).c);
    const checkedToday = Number((await db('attendance').where('work_date', t).whereNotNull('check_in').count('* as c').first()).c);
    out.kpis = {
      projects_total: projects.length, projects_active: count(['in_progress']), projects_completed: count(['completed']),
      projects_delayed: projects.filter((p) => p.status === 'delayed' || (p.status === 'in_progress' && p.progress + 10 < p.planned)).length,
      employees_total: empTotal, employees_present: present, employees_checked_today: checkedToday,
      tasks_overdue: Number((await db('tasks').where('status', 'overdue').count('* as c').first()).c),
    };
    out.projectComparison = projects.filter((p) => !['cancelled', 'study'].includes(p.status)).map((p) => ({
      id: p.id, code: p.code, name: p.name, status: p.status, progress: Number(p.progress), planned: p.planned,
      ...(u.can('projects.budget') ? { budget: Number(p.budget), spent: p.spent, contract_value: Number(p.contract_value) } : {}),
    }));
    const statusDist = {}; projects.forEach((p) => { statusDist[p.status] = (statusDist[p.status] || 0) + 1; });
    out.projectStatus = Object.entries(statusDist).map(([status, count]) => ({ status, count }));
    out.departments = (await db('employees as e').leftJoin('departments as d', 'd.id', 'e.department_id').whereNot('e.status', 'terminated')
      .groupBy('d.name').select(db.raw("coalesce(d.name, 'غير محدد') as name")).count('* as count')).map((r) => ({ name: r.name, count: Number(r.count) }));
    // portfolio progress through the year (avg actual vs planned per month)
    const snaps = await db('project_progress').where('month', 'like', `${year}-%`).groupBy('month').orderBy('month')
      .select('month').avg('actual as actual').avg('planned as planned');
    out.progressTrend = snaps.map((s) => ({ month: s.month, actual: Math.round(s.actual * 10) / 10, planned: Math.round(s.planned * 10) / 10 }));
  }

  // ---------- Finance ----------
  if (u.can('dashboard.finance')) {
    out.sections.push('finance');
    const ok = ['approved', 'paid'];
    const revenue = await sumOf(db('transactions').where('kind', 'income').whereIn('status', ok).whereRaw('extract(year from tx_date) = ?', [year]));
    const expenses = await sumOf(db('transactions').where('kind', 'expense').whereIn('status', ok).whereRaw('extract(year from tx_date) = ?', [year]));
    const payablesDue = await sumOf(db('payments').where({ direction: 'out', status: 'due' }));
    const purchaseInv = await db('invoices').where('direction', 'purchase').whereNotIn('status', ['paid', 'cancelled', 'draft']).select(db.raw('coalesce(sum(amount + vat - paid_amount),0) as s')).first();
    const payrollDue = await sumOf(db('payroll').whereIn('status', ['pending', 'approved']), 'net');
    const receivables = await db('invoices').where('direction', 'sales').whereNotIn('status', ['paid', 'cancelled', 'draft']).select(db.raw('coalesce(sum(amount + vat - paid_amount),0) as s')).first();
    out.finance = { revenue, expenses, net: revenue - expenses, obligations: payablesDue + Number(purchaseInv.s) + payrollDue, receivables: Number(receivables.s), year };
    const monthly = await db('transactions').whereIn('status', ok).whereRaw('extract(year from tx_date) = ?', [year])
      .select(db.raw("to_char(tx_date, 'YYYY-MM') as month"), 'kind').sum('amount as s').groupByRaw("to_char(tx_date, 'YYYY-MM'), kind");
    out.monthly = Array.from({ length: 12 }, (_, i) => {
      const m = `${year}-${String(i + 1).padStart(2, '0')}`;
      return { month: m, income: Number((monthly.find((r) => r.month === m && r.kind === 'income') || {}).s || 0), expense: Number((monthly.find((r) => r.month === m && r.kind === 'expense') || {}).s || 0) };
    });
    out.expenseByCategory = (await db('transactions').where('kind', 'expense').whereIn('status', ok).whereRaw('extract(year from tx_date) = ?', [year])
      .groupBy('category').select('category').sum('amount as s').orderBy('s', 'desc').limit(6)).map((r) => ({ name: r.category, value: Number(r.s) }));
  }

  // ---------- Pending approvals (only what this user can approve) ----------
  const approvals = [];
  const addA = async (perm, key, label, link, q) => { if (u.can(perm)) { const c = Number((await q.count('* as c').first()).c); approvals.push({ key, label, count: c, link }); } };
  await addA('decisions.approve', 'decisions', 'قرارات إدارية', '/meetings?tab=decisions', db('decisions').where('status', 'pending').modify((q) => { if (!u.isOwner) q.whereNot('level', 'strategic'); }));
  await addA('finance.approve', 'transactions', 'عمليات مالية', '/finance?tab=transactions', db('transactions').where('status', 'pending'));
  await addA('finance.approve', 'payroll', 'مسيرات رواتب', '/finance?tab=payroll', db('payroll').where('status', 'pending'));
  await addA('purchasing.approve', 'purchase_requests', 'طلبات شراء', '/purchasing', db('purchase_requests').where('status', 'pending'));
  await addA('purchasing.approve', 'purchase_orders', 'أوامر شراء', '/purchasing?tab=orders', db('purchase_orders').where('status', 'pending'));
  await addA('leaves.approve', 'leave_requests', 'طلبات إجازة', '/attendance?tab=leaves', db('leave_requests').where('status', 'pending'));
  await addA('projects.approve', 'projects', 'مشاريع بانتظار الاعتماد', '/projects', db('projects').where('status', 'pending_approval'));
  if (u.can('tasks.approve')) {
    const q = db('tasks').where('status', 'review');
    if (!u.can('tasks.view_all')) { const m = await managedProjectIds(u); q.where((w) => { w.where('created_by', u.id); if (m && m.length) w.orWhereIn('project_id', m); }); }
    approvals.push({ key: 'tasks', label: 'مهام بانتظار المراجعة', count: Number((await q.count('* as c').first()).c), link: '/tasks?filter=review' });
  }
  out.approvals = approvals;
  out.approvalsTotal = approvals.reduce((s, a) => s + a.count, 0);

  // ---------- Project manager ----------
  if (!u.can('projects.view_all') && u.can('projects.update') && u.employee_id) {
    out.sections.push('pm');
    const ids = await managedProjectIds(u);
    const projects = await projectRows(ids);
    out.myProjects = projects.map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status, progress: Number(p.progress), planned: p.planned, budget: Number(p.budget), spent: p.spent, end_date: p.end_date, image_url: p.image_url, location: p.location }));
    const tq = db('tasks').whereIn('project_id', ids.length ? ids : [-1]);
    const byStatus = await tq.clone().groupBy('status').select('status').count('* as c');
    out.projectTasks = Object.fromEntries(byStatus.map((r) => [r.status, Number(r.c)]));
    out.teamSize = Number((await db('project_members').whereIn('project_id', ids.length ? ids : [-1]).countDistinct('employee_id as c').first()).c);
    out.openIssues = await db('project_issues as i').join('projects as p', 'p.id', 'i.project_id').whereIn('i.project_id', ids.length ? ids : [-1]).whereNot('i.status', 'resolved')
      .orderByRaw("case i.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end").limit(6).select('i.id', 'i.title', 'i.severity', 'i.project_id', 'p.name as project_name');
  }

  // ---------- Inventory / procurement ----------
  if (u.can('inventory.view') && u.can('inventory.manage')) {
    out.sections.push('inventory');
    out.inventory = {
      lowStock: await db('materials').whereRaw('quantity <= min_quantity').orderBy('name').select('id', 'name', 'quantity', 'min_quantity', 'unit'),
      prPending: Number((await db('purchase_requests').where('status', 'pending').count('* as c').first()).c),
      prApproved: Number((await db('purchase_requests').where('status', 'approved').count('* as c').first()).c),
      poOpen: Number((await db('purchase_orders').whereIn('status', ['pending', 'approved', 'sent']).count('* as c').first()).c),
      equipment: (await db('equipment').groupBy('status').select('status').count('* as c')).map((r) => ({ status: r.status, count: Number(r.c) })),
    };
  }

  // ---------- Personal (everyone with an employee file) ----------
  if (u.employee_id) {
    out.sections.push('personal');
    const mine = db('tasks').where('tasks.assignee_id', u.employee_id);
    out.myTasks = await mine.clone().whereNot('tasks.status', 'done').leftJoin('projects as p', 'p.id', 'tasks.project_id')
      .select('tasks.id', 'tasks.title', 'tasks.status', 'tasks.priority', 'tasks.due_date', 'tasks.progress', 'p.name as project_name').orderByRaw('tasks.due_date asc nulls last').limit(8);
    const counts = await mine.clone().groupBy('status').select('status').count('* as c');
    out.myTaskCounts = Object.fromEntries(counts.map((r) => [r.status, Number(r.c)]));
    out.myAttendance = await db('attendance').where({ employee_id: u.employee_id, work_date: t }).first();
    const emp = await db('employees').where({ id: u.employee_id }).first('leave_balance');
    out.leaveBalance = emp ? Number(emp.leave_balance) : null;
  }

  const circQ = db('circulars').orderBy('issue_date', 'desc').limit(4).select('id', 'number', 'title', 'issue_date');
  await R.circulars.scope(circQ, u);
  out.circulars = await circQ;
  out.upcomingMeetings = await db('meetings').whereIn('id', (await scopedIds(R.meetings, u)).sub).where('starts_at', '>=', new Date()).where('status', 'scheduled').orderBy('starts_at').limit(4).select('id', 'title', 'starts_at', 'location');

  // ---------- Recent activity ----------
  const aq = db('audit_logs').orderBy('id', 'desc').limit(12).select('id', 'user_name', 'action', 'entity', 'summary', 'created_at');
  if (!u.can('audit.view')) aq.where('user_id', u.id);
  out.activity = await aq;

  res.json(out);
}));

// ---------- project overview (for the project page) ----------
router.get('/projects/:id/overview', wrap(async (req, res) => {
  const u = req.user; const id = Number(req.params.id);
  const ids = await visibleProjectIds(u);
  if (ids !== null && !ids.includes(id)) throw new HttpError(404, 'المشروع غير موجود أو غير متاح');
  const p = await db('projects as p').leftJoin('clients as c', 'c.id', 'p.client_id').leftJoin('employees as e', 'e.id', 'p.manager_id')
    .where('p.id', id).first('p.*', 'c.name as client_name', 'e.full_name as manager_name', 'e.photo_url as manager_photo');
  if (!p) throw new HttpError(404, 'المشروع غير موجود');
  const phases = await db('project_phases').where({ project_id: id }).orderBy('sort');
  const tasks = await db('tasks').where({ project_id: id }).groupBy('status').select('status').count('* as c');
  const managed = await managedProjectIds(u);
  const out = {
    project: { ...p }, planned: plannedProgress(p, phases), phases,
    tasks: Object.fromEntries(tasks.map((r) => [r.status, Number(r.c)])),
    team: Number((await db('project_members').where({ project_id: id }).count('* as c').first()).c),
    equipment: Number((await db('equipment').where({ project_id: id }).count('* as c').first()).c),
    openIssues: Number((await db('project_issues').where({ project_id: id }).whereNot('status', 'resolved').count('* as c').first()).c),
    lastReport: await db('daily_reports').where({ project_id: id }).orderBy('report_date', 'desc').first('report_date', 'workers_count', 'work_done'),
    history: await db('project_progress').where({ project_id: id }).orderBy('month').select('month', 'actual', 'planned'),
    canManage: managed === null || managed.includes(id),
  };
  if (u.can('projects.budget')) {
    const ok = ['approved', 'paid'];
    out.finance = {
      budget: Number(p.budget), contract_value: Number(p.contract_value),
      spent: await sumOf(db('transactions').where({ project_id: id, kind: 'expense' }).whereIn('status', ok)),
      pending: await sumOf(db('transactions').where({ project_id: id, kind: 'expense', status: 'pending' })),
      received: await sumOf(db('transactions').where({ project_id: id, kind: 'income' }).whereIn('status', ok)),
      purchases: await sumOf(db('purchase_orders').where({ project_id: id }).whereNot('status', 'cancelled'), 'total'),
      byCategory: (await db('transactions').where({ project_id: id, kind: 'expense' }).whereIn('status', ok).groupBy('category').select('category').sum('amount as s')).map((r) => ({ name: r.category, value: Number(r.s) })),
    };
  } else {
    delete out.project.budget; delete out.project.contract_value;
  }
  res.json(out);
}));

// ---------- global search ----------
router.get('/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const term = `%${q}%`; const u = req.user; const out = [];
  const { can } = require('./resources');
  const add = async (name, cols, link, sub) => {
    const r = R[name]; if (!can(u, r.perm.view)) return;
    const qq = db(r.table).select('id', `${r.labelField} as label`).where((w) => cols.forEach((c) => w.orWhereILike(c, term))).limit(5);
    if (r.scope) qq.whereIn('id', (await scopedIds(r, u)).sub);
    (await qq).forEach((x) => out.push({ type: name, typeLabel: r.label, id: x.id, label: x.label, sub: sub ? x[sub] : null, link: link(x) }));
  };
  await add('projects', ['name', 'code', 'location'], (x) => `/projects/${x.id}`);
  await add('employees', ['full_name', 'emp_no', 'job_title'], (x) => `/employees/${x.id}`);
  await add('tasks', ['title'], (x) => `/tasks?open=${x.id}`);
  await add('documents', ['title', 'file_name'], () => '/documents');
  await add('decisions', ['title', 'number'], () => '/meetings?tab=decisions');
  await add('suppliers', ['name'], () => '/purchasing?tab=suppliers');
  res.json(out);
}));

module.exports = router;
