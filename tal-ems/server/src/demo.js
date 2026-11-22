// Tables that can contain demo rows (child tables first so FK deletes are clean)
const { db } = require('./core');
const DEMO_TABLES = [
  'notifications', 'messages', 'task_comments', 'tasks', 'meeting_attendees', 'decisions', 'meetings', 'circulars',
  'documents', 'folders', 'stock_movements', 'materials', 'equipment', 'quotations', 'purchase_orders', 'purchase_requests',
  'payments', 'invoices', 'transactions', 'payroll', 'daily_reports', 'project_issues', 'project_phases', 'project_members',
  'project_progress', 'projects', 'clients', 'suppliers', 'attendance', 'leave_requests', 'evaluations', 'employee_history',
  'users', 'employees', 'shifts', 'departments', 'files',
];
async function clearDemo() {
  const result = {};
  const path = require('path'); const fs = require('fs');
  const dir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../storage/uploads'));
  const stored = await db('files').where('is_demo', true).pluck('stored_name');
  await db.transaction(async (trx) => {
    // detach real records that may point to demo rows
    const demoEmp = trx('employees').where('is_demo', true).select('id');
    await trx('employees').where('is_demo', false).whereIn('manager_id', demoEmp).update({ manager_id: null });
    await trx('users').where('is_demo', false).whereIn('employee_id', demoEmp).update({ employee_id: null });
    for (const t of DEMO_TABLES) result[t] = await trx(t).where('is_demo', true).del();
  });
  for (const n of stored) { try { fs.unlinkSync(path.join(dir, n)); } catch { /* already gone */ } }
  return result;
}
module.exports = { DEMO_TABLES, clearDemo };
