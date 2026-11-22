const express = require('express');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { db, HttpError, wrap, audit, visibleProjectIds, getSetting } = require('../core');
const { plannedProgress } = require('../metrics');
const { V } = require('../resources');

const router = express.Router();
const lbl = (vocab, v) => (V[vocab].find((o) => o.value === v) || {}).label || v;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function range(qs) {
  const to = ISO.test(qs.to || '') ? qs.to : new Date().toISOString().slice(0, 10);
  const from = ISO.test(qs.from || '') ? qs.from : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}
async function projScope(user, qs, col = 'project_id') {
  const ids = await visibleProjectIds(user);
  return (q) => {
    if (ids !== null) q.whereIn(col, ids.length ? ids : [-1]);
    if (qs.project_id) q.where(col, Number(qs.project_id));
  };
}

const REPORTS = {
  progress: {
    title: 'تقرير الإنجاز', perm: 'reports.view', group: 'المشاريع',
    async run(user, qs) {
      const scope = await projScope(user, qs, 'p.id');
      const projects = await db('projects as p').leftJoin('employees as e', 'e.id', 'p.manager_id').leftJoin('clients as c', 'c.id', 'p.client_id').modify(scope).whereNot('p.status', 'cancelled')
        .select('p.*', 'e.full_name as manager', 'c.name as client').orderBy('p.code');
      const phases = await db('project_phases').whereIn('project_id', projects.map((p) => p.id));
      const rows = projects.map((p) => { const planned = plannedProgress(p, phases.filter((x) => x.project_id === p.id)); return { code: p.code, name: p.name, client: p.client, manager: p.manager, status: lbl('projectStatus', p.status), start_date: p.start_date, end_date: p.end_date, progress: Number(p.progress), planned, variance: Math.round((Number(p.progress) - planned) * 10) / 10 }; });
      const avg = (k) => rows.length ? Math.round(rows.reduce((s, r) => s + r[k], 0) / rows.length * 10) / 10 : 0;
      return { columns: [['code', 'رقم المشروع'], ['name', 'المشروع'], ['client', 'العميل'], ['manager', 'مدير المشروع'], ['status', 'الحالة'], ['start_date', 'البداية', 'date'], ['end_date', 'التسليم', 'date'], ['planned', 'المخطط %', 'percent'], ['progress', 'الفعلي %', 'percent'], ['variance', 'الانحراف %', 'number']],
        rows, summary: [['عدد المشاريع', rows.length], ['متوسط الإنجاز الفعلي', avg('progress'), 'percent'], ['متوسط الإنجاز المخطط', avg('planned'), 'percent'], ['مشاريع خلف الجدول', rows.filter((r) => r.variance < -5).length]] };
    },
  },
  delays: {
    title: 'تقرير التأخير', perm: 'reports.view', group: 'المشاريع',
    async run(user, qs) {
      const scope = await projScope(user, qs, 'p.id');
      const projects = await db('projects as p').leftJoin('employees as e', 'e.id', 'p.manager_id').modify(scope).whereIn('p.status', ['in_progress', 'delayed', 'on_hold']).select('p.*', 'e.full_name as manager');
      const phases = await db('project_phases').whereIn('project_id', projects.map((p) => p.id));
      const today = new Date();
      const rows = [];
      for (const p of projects) {
        const planned = plannedProgress(p, phases.filter((x) => x.project_id === p.id));
        const overdue = Number((await db('tasks').where({ project_id: p.id, status: 'overdue' }).count('* as c').first()).c);
        const lateDays = p.end_date && new Date(p.end_date) < today ? Math.floor((today - new Date(p.end_date)) / 86400000) : 0;
        const gap = Math.round((planned - Number(p.progress)) * 10) / 10;
        if (gap > 0 || overdue || lateDays || p.status === 'delayed') {
          const obstacles = await db('project_issues').where({ project_id: p.id, kind: 'obstacle' }).whereNot('status', 'resolved').pluck('title');
          rows.push({ code: p.code, name: p.name, manager: p.manager, status: lbl('projectStatus', p.status), end_date: p.end_date, planned, progress: Number(p.progress), gap, late_days: lateDays, overdue_tasks: overdue, obstacles: obstacles.join('، ') || '—' });
        }
      }
      rows.sort((a, b) => b.gap - a.gap);
      return { columns: [['code', 'رقم المشروع'], ['name', 'المشروع'], ['manager', 'مدير المشروع'], ['status', 'الحالة'], ['end_date', 'التسليم', 'date'], ['planned', 'المخطط %', 'percent'], ['progress', 'الفعلي %', 'percent'], ['gap', 'الفجوة %', 'number'], ['late_days', 'أيام تجاوز التسليم', 'number'], ['overdue_tasks', 'مهام متأخرة', 'number'], ['obstacles', 'المعوقات المفتوحة']],
        rows, summary: [['مشاريع متأخرة', rows.length], ['إجمالي المهام المتأخرة', rows.reduce((s, r) => s + r.overdue_tasks, 0)]] };
    },
  },
  daily: {
    title: 'التقارير اليومية للمشاريع', perm: 'reports.view', group: 'المشاريع', usesRange: true,
    async run(user, qs) {
      const { from, to } = range(qs); const scope = await projScope(user, qs, 'd.project_id');
      const rows = await db('daily_reports as d').join('projects as p', 'p.id', 'd.project_id').modify(scope).whereBetween('d.report_date', [from, to]).orderBy('d.report_date', 'desc')
        .select('d.report_date', 'p.name as project', 'd.weather', 'd.workers_count', 'd.equipment_count', 'd.work_done', 'd.issues');
      return { columns: [['report_date', 'التاريخ', 'date'], ['project', 'المشروع'], ['weather', 'الطقس'], ['workers_count', 'العمالة', 'number'], ['equipment_count', 'المعدات', 'number'], ['work_done', 'الأعمال المنجزة'], ['issues', 'المعوقات']],
        rows, summary: [['عدد التقارير', rows.length], ['متوسط العمالة اليومية', rows.length ? Math.round(rows.reduce((s, r) => s + r.workers_count, 0) / rows.length) : 0]] };
    },
  },
  weekly: { title: 'التقرير الأسبوعي', perm: 'reports.view', group: 'المشاريع', period: 'week' },
  monthly: { title: 'التقرير الشهري', perm: 'reports.view', group: 'المشاريع', period: 'month' },
  employees: {
    title: 'تقرير الموظفين', perm: 'reports.view', extra: ['hr.view', 'attendance.view_all'], group: 'الموارد البشرية', usesRange: true,
    async run(user, qs) {
      const { from, to } = range(qs);
      const rows = await db('employees as e').leftJoin('departments as d', 'd.id', 'e.department_id').whereNot('e.status', 'terminated').orderBy('e.full_name')
        .select('e.emp_no', 'e.full_name', 'e.job_title', 'd.name as department', 'e.status', 'e.leave_balance',
          db.raw("(select count(*) from tasks t where t.assignee_id = e.id and t.status = 'done' and t.updated_at::date between ? and ?) as tasks_done", [from, to]),
          db.raw("(select count(*) from tasks t where t.assignee_id = e.id and t.status not in ('done')) as tasks_open"),
          db.raw("(select count(*) from tasks t where t.assignee_id = e.id and t.status = 'overdue') as tasks_overdue"),
          db.raw("(select count(*) from attendance a where a.employee_id = e.id and a.status in ('present','late') and a.work_date between ? and ?) as days_present", [from, to]),
          db.raw("(select count(*) from attendance a where a.employee_id = e.id and a.status = 'absent' and a.work_date between ? and ?) as days_absent", [from, to]),
          db.raw("(select coalesce(sum(late_minutes),0) from attendance a where a.employee_id = e.id and a.work_date between ? and ?) as late_minutes", [from, to]),
          db.raw('(select score from evaluations v where v.employee_id = e.id order by v.created_at desc limit 1) as last_score'));
      const out = rows.map((r) => ({ ...r, status: lbl('empStatus', r.status), tasks_done: +r.tasks_done, tasks_open: +r.tasks_open, tasks_overdue: +r.tasks_overdue, days_present: +r.days_present, days_absent: +r.days_absent, late_minutes: +r.late_minutes }));
      return { columns: [['emp_no', 'الرقم'], ['full_name', 'الموظف'], ['job_title', 'المسمى'], ['department', 'الإدارة'], ['status', 'الحالة'], ['days_present', 'أيام الحضور', 'number'], ['days_absent', 'الغياب', 'number'], ['late_minutes', 'دقائق التأخير', 'number'], ['tasks_done', 'مهام منجزة', 'number'], ['tasks_open', 'مهام مفتوحة', 'number'], ['tasks_overdue', 'متأخرة', 'number'], ['last_score', 'آخر تقييم', 'number'], ['leave_balance', 'رصيد الإجازات', 'number']],
        rows: out, summary: [['عدد الموظفين', out.length], ['إجمالي أيام الغياب', out.reduce((s, r) => s + r.days_absent, 0)], ['إجمالي المهام المنجزة', out.reduce((s, r) => s + r.tasks_done, 0)]] };
    },
  },
  financial: {
    title: 'التقرير المالي للمشاريع', perm: 'reports.finance', group: 'المالية', usesRange: true,
    async run(user, qs) {
      const { from, to } = range(qs);
      const projects = await db('projects as p').whereNot('p.status', 'cancelled').modify((q) => { if (qs.project_id) q.where('p.id', Number(qs.project_id)); }).orderBy('p.code')
        .select('p.code', 'p.name', 'p.contract_value', 'p.budget',
          db.raw("(select coalesce(sum(amount),0) from transactions t where t.project_id = p.id and t.kind='income' and t.status in ('approved','paid') and t.tx_date between ? and ?) as income", [from, to]),
          db.raw("(select coalesce(sum(amount),0) from transactions t where t.project_id = p.id and t.kind='expense' and t.status in ('approved','paid') and t.tx_date between ? and ?) as expense", [from, to]),
          db.raw("(select coalesce(sum(amount),0) from transactions t where t.project_id = p.id and t.kind='expense' and t.status in ('approved','paid')) as expense_total"));
      const rows = projects.map((p) => ({ ...p, income: +p.income, expense: +p.expense, net: +p.income - +p.expense, usage: p.budget > 0 ? Math.round(+p.expense_total / p.budget * 1000) / 10 : 0 }));
      const general = await db('transactions').whereNull('project_id').whereIn('status', ['approved', 'paid']).whereBetween('tx_date', [from, to]).groupBy('kind').select('kind').sum('amount as s');
      const gi = Number((general.find((g) => g.kind === 'income') || {}).s || 0); const ge = Number((general.find((g) => g.kind === 'expense') || {}).s || 0);
      const ti = rows.reduce((s, r) => s + r.income, 0) + gi; const te = rows.reduce((s, r) => s + r.expense, 0) + ge;
      return { columns: [['code', 'رقم المشروع'], ['name', 'المشروع'], ['contract_value', 'قيمة العقد', 'money'], ['budget', 'الميزانية', 'money'], ['income', 'الإيرادات', 'money'], ['expense', 'المصروفات', 'money'], ['net', 'الصافي', 'money'], ['usage', 'استهلاك الميزانية %', 'percent']],
        rows, summary: [['إجمالي الإيرادات', ti, 'money'], ['إجمالي المصروفات', te, 'money'], ['مصروفات عامة (غير مرتبطة بمشروع)', ge, 'money'], ['صافي الربح', ti - te, 'money']] };
    },
  },
  expenses: {
    title: 'تقرير المصروفات', perm: 'reports.finance', group: 'المالية', usesRange: true,
    async run(user, qs) {
      const { from, to } = range(qs);
      const rows = await db('transactions as t').leftJoin('projects as p', 'p.id', 't.project_id').leftJoin('suppliers as s', 's.id', 't.supplier_id')
        .where('t.kind', 'expense').whereBetween('t.tx_date', [from, to]).modify((q) => { if (qs.project_id) q.where('t.project_id', Number(qs.project_id)); }).orderBy('t.tx_date', 'desc')
        .select('t.ref_no', 't.tx_date', 't.category', 'p.name as project', 's.name as supplier', 't.description', 't.amount', 't.status');
      const out = rows.map((r) => ({ ...r, project: r.project || 'عام', status: lbl('txStatus', r.status) }));
      const byCat = {}; rows.filter((r) => ['approved', 'paid'].includes(r.status)).forEach((r) => { byCat[r.category] = (byCat[r.category] || 0) + Number(r.amount); });
      return { columns: [['ref_no', 'المرجع'], ['tx_date', 'التاريخ', 'date'], ['category', 'البند'], ['project', 'المشروع'], ['supplier', 'المورد'], ['description', 'البيان'], ['amount', 'المبلغ', 'money'], ['status', 'الحالة']],
        rows: out, summary: [['إجمالي المعتمد', rows.filter((r) => ['approved', 'paid'].includes(r.status)).reduce((s, r) => s + Number(r.amount), 0), 'money'], ['بانتظار الاعتماد', rows.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.amount), 0), 'money'],
          ...Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => [k, v, 'money'])] };
    },
  },
  materials: {
    title: 'تقرير المواد والمعدات', perm: 'reports.view', extra: ['inventory.view'], group: 'المستودعات', usesRange: true,
    async run(user, qs) {
      const { from, to } = range(qs);
      const rows = await db('materials as m').orderBy('m.code').select('m.code', 'm.name', 'm.category', 'm.unit', 'm.quantity', 'm.min_quantity', 'm.unit_cost', 'm.warehouse',
        db.raw("(select coalesce(sum(quantity),0) from stock_movements s where s.material_id = m.id and s.direction='in' and s.move_date between ? and ?) as qty_in", [from, to]),
        db.raw("(select coalesce(sum(quantity),0) from stock_movements s where s.material_id = m.id and s.direction='out' and s.move_date between ? and ?) as qty_out", [from, to]));
      const out = rows.map((r) => ({ ...r, qty_in: +r.qty_in, qty_out: +r.qty_out, value: Number(r.quantity) * Number(r.unit_cost), alert: Number(r.quantity) <= Number(r.min_quantity) ? 'منخفض' : '—' }));
      const eq = await db('equipment').groupBy('status').select('status').count('* as c');
      return { columns: [['code', 'الرمز'], ['name', 'المادة'], ['category', 'التصنيف'], ['unit', 'الوحدة'], ['qty_in', 'وارد', 'number'], ['qty_out', 'منصرف', 'number'], ['quantity', 'الرصيد', 'number'], ['min_quantity', 'حد التنبيه', 'number'], ['value', 'قيمة المخزون', 'money'], ['alert', 'التنبيه']],
        rows: out, summary: [['قيمة المخزون الإجمالية', out.reduce((s, r) => s + r.value, 0), 'money'], ['مواد تحت حد التنبيه', out.filter((r) => r.alert !== '—').length],
          ...eq.map((e) => [`معدات: ${lbl('eqStatus', e.status)}`, Number(e.c)])] };
    },
  },
};

async function periodic(user, qs, period) {
  const end = ISO.test(qs.to || '') ? new Date(qs.to) : new Date();
  const start = new Date(end.getTime() - (period === 'week' ? 6 : 29) * 86400000);
  const from = start.toISOString().slice(0, 10); const to = end.toISOString().slice(0, 10);
  const scope = await projScope(user, qs, 'p.id');
  const projects = await db('projects as p').leftJoin('employees as e', 'e.id', 'p.manager_id').modify(scope).whereIn('p.status', ['in_progress', 'delayed', 'on_hold', 'ready'])
    .select('p.id', 'p.code', 'p.name', 'p.progress', 'p.status', 'e.full_name as manager',
      db.raw('(select count(*) from daily_reports d where d.project_id = p.id and d.report_date between ? and ?) as reports', [from, to]),
      db.raw('(select coalesce(round(avg(workers_count)),0) from daily_reports d where d.project_id = p.id and d.report_date between ? and ?) as avg_workers', [from, to]),
      db.raw("(select count(*) from tasks t where t.project_id = p.id and t.status = 'done' and t.updated_at::date between ? and ?) as tasks_done", [from, to]),
      db.raw("(select count(*) from tasks t where t.project_id = p.id and t.status = 'overdue') as tasks_overdue"),
      db.raw("(select count(*) from project_issues i where i.project_id = p.id and i.created_at::date between ? and ?) as new_issues", [from, to]));
  const canFin = user.can('projects.budget');
  const rows = [];
  for (const p of projects) {
    const r = { code: p.code, name: p.name, manager: p.manager, status: lbl('projectStatus', p.status), progress: Number(p.progress), reports: +p.reports, avg_workers: +p.avg_workers, tasks_done: +p.tasks_done, tasks_overdue: +p.tasks_overdue, new_issues: +p.new_issues };
    if (canFin) r.spent = Number((await db('transactions').where({ project_id: p.id, kind: 'expense' }).whereIn('status', ['approved', 'paid']).whereBetween('tx_date', [from, to]).sum('amount as s').first()).s || 0);
    rows.push(r);
  }
  const cols = [['code', 'رقم المشروع'], ['name', 'المشروع'], ['manager', 'مدير المشروع'], ['status', 'الحالة'], ['progress', 'الإنجاز %', 'percent'], ['reports', 'تقارير يومية', 'number'], ['avg_workers', 'متوسط العمالة', 'number'], ['tasks_done', 'مهام منجزة', 'number'], ['tasks_overdue', 'مهام متأخرة', 'number'], ['new_issues', 'معوقات جديدة', 'number']];
  if (canFin) cols.push(['spent', 'مصروفات الفترة', 'money']);
  return { from, to, columns: cols, rows, summary: [['المشاريع النشطة', rows.length], ['المهام المنجزة', rows.reduce((s, r) => s + r.tasks_done, 0)], ['التقارير اليومية المرفوعة', rows.reduce((s, r) => s + r.reports, 0)], ...(canFin ? [['مصروفات الفترة', rows.reduce((s, r) => s + r.spent, 0), 'money']] : [])] };
}

function allowed(user, def) {
  if (!user.can(def.perm)) return false;
  if (def.extra && !def.extra.some((p) => user.can(p))) return false;
  return true;
}

async function build(user, type, qs) {
  const def = REPORTS[type];
  if (!def) throw new HttpError(404, 'تقرير غير معروف');
  if (!allowed(user, def)) throw new HttpError(403, 'ليست لديك صلاحية هذا التقرير');
  const data = def.period ? await periodic(user, qs, def.period) : await def.run(user, qs);
  const r = def.usesRange ? range(qs) : {};
  return {
    type, title: def.title, from: data.from || r.from, to: data.to || r.to, generated_at: new Date().toISOString(), generated_by: user.display_name,
    columns: data.columns.map(([key, label, kind]) => ({ key, label, kind: kind || 'text' })), rows: data.rows,
    summary: (data.summary || []).map(([label, value, kind]) => ({ label, value, kind: kind || 'number' })),
  };
}

router.get('/reports', wrap(async (req, res) => {
  res.json(Object.entries(REPORTS).filter(([, d]) => allowed(req.user, d)).map(([key, d]) => ({ key, title: d.title, group: d.group, usesRange: !!d.usesRange, period: d.period || null })));
}));
router.get('/reports/:type', wrap(async (req, res) => {
  res.json(await build(req.user, req.params.type, req.query));
}));

router.get('/reports/:type/xlsx', wrap(async (req, res) => {
  if (!req.user.can('reports.export')) throw new HttpError(403, 'ليست لديك صلاحية التصدير');
  const rep = await build(req.user, req.params.type, req.query);
  const company = await getSetting('company', {});
  const currency = (await getSetting('currency', {})).code || 'SAR';
  const wb = new ExcelJS.Workbook(); wb.creator = 'TAL EMS';
  const ws = wb.addWorksheet(rep.title.slice(0, 30), { views: [{ rightToLeft: true, showGridLines: false }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 } });
  const n = rep.columns.length; const BLUE = 'FF477597'; const DARK = 'FF1F3A52';
  const logo = path.join(__dirname, '../../assets/tal-logo.png');
  if (fs.existsSync(logo)) { const img = wb.addImage({ filename: logo, extension: 'png' }); ws.addImage(img, { tl: { col: 0.2, row: 0.2 }, ext: { width: 150, height: 57 } }); }
  ws.getRow(1).height = 24; ws.getRow(2).height = 24; ws.getRow(3).height = 8;
  ws.mergeCells(1, 3, 1, n); ws.getCell(1, 3).value = company.name_ar || 'شركة تال الإنشائية للمقاولات'; ws.getCell(1, 3).font = { bold: true, size: 14, color: { argb: DARK } }; ws.getCell(1, 3).alignment = { horizontal: 'left' };
  ws.mergeCells(2, 3, 2, n); ws.getCell(2, 3).value = rep.title + (rep.from ? `  |  الفترة: ${rep.from} — ${rep.to}` : ''); ws.getCell(2, 3).font = { bold: true, size: 12, color: { argb: BLUE } }; ws.getCell(2, 3).alignment = { horizontal: 'left' };
  ws.mergeCells(4, 1, 4, n); ws.getCell(4, 1).value = `تاريخ الإصدار: ${new Date().toLocaleString('en-GB')}   —   أعدّه: ${rep.generated_by}`; ws.getCell(4, 1).font = { size: 9, color: { argb: 'FF6B7785' } };
  const hr = ws.getRow(6);
  rep.columns.forEach((c, i) => {
    const cell = hr.getCell(i + 1); cell.value = c.label; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }; cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    ws.getColumn(i + 1).width = ['name', 'work_done', 'description', 'obstacles', 'issues'].includes(c.key) ? 38 : c.kind === 'money' ? 18 : 15;
  });
  hr.height = 30;
  rep.rows.forEach((r, ri) => {
    const row = ws.getRow(7 + ri);
    rep.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1); let v = r[c.key];
      if (c.kind === 'money' || c.kind === 'number' || c.kind === 'percent') v = v == null ? null : Number(v);
      cell.value = v ?? '';
      if (c.kind === 'money') cell.numFmt = '#,##0.00'; if (c.kind === 'percent') cell.numFmt = '0.0"%"';
      cell.alignment = { vertical: 'top', wrapText: true }; cell.border = { bottom: { style: 'thin', color: { argb: 'FFE3E8EE' } } };
      if (ri % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    });
  });
  let sr = 7 + rep.rows.length + 1;
  ws.getCell(sr, 1).value = 'الملخص'; ws.getCell(sr, 1).font = { bold: true, color: { argb: DARK } }; sr++;
  rep.summary.forEach((s) => { ws.getCell(sr, 1).value = s.label; ws.mergeCells(sr, 1, sr, 2); const c = ws.getCell(sr, 3); c.value = Number(s.value); c.font = { bold: true }; if (s.kind === 'money') { c.numFmt = `#,##0.00 "${currency}"`; } if (s.kind === 'percent') c.numFmt = '0.0"%"'; sr++; });
  ws.headerFooter.oddFooter = `&L${company.name_en || 'TAL Construction Company'}&Rصفحة &P من &N`;
  await audit(req, 'export', 'reports', req.params.type, `تصدير ${rep.title} (Excel)`, { from: rep.from, to: rep.to });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="tal-${req.params.type}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res); res.end();
}));

// log PDF exports (PDF is rendered by the browser's print engine for correct Arabic shaping)
router.post('/reports/:type/pdf-log', wrap(async (req, res) => {
  if (!req.user.can('reports.export')) throw new HttpError(403, 'ليست لديك صلاحية التصدير');
  await audit(req, 'export', 'reports', req.params.type, `تصدير ${(REPORTS[req.params.type] || {}).title || req.params.type} (PDF)`);
  res.json({ ok: true });
}));

module.exports = router;
