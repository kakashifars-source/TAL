const { db } = require('./core');

const clamp = (x) => Math.max(0, Math.min(1, x));
const frac = (start, end, at) => {
  if (!start || !end) return 0;
  const s = new Date(start).getTime(); const e = new Date(end).getTime();
  if (e <= s) return at >= e ? 1 : 0;
  return clamp((at - s) / (e - s));
};

// Planned (baseline) progress at a point in time: weighted by phases if present, else linear across the contract period.
function plannedProgress(project, phases, at = Date.now()) {
  if (phases && phases.length) {
    const tw = phases.reduce((s, p) => s + Number(p.weight || 0), 0) || phases.length;
    return Math.round(phases.reduce((s, p) => s + (Number(p.weight || 0) || (tw === phases.length ? 1 : 0)) * frac(p.start_date, p.end_date, at), 0) / tw * 1000) / 10;
  }
  return Math.round(frac(project.start_date, project.end_date, at) * 1000) / 10;
}

async function snapshot(projectId, trx = db) {
  const p = await trx('projects').where({ id: projectId }).first();
  if (!p) return;
  const phases = await trx('project_phases').where({ project_id: projectId });
  const month = new Date().toISOString().slice(0, 7);
  await trx('project_progress').insert({ project_id: projectId, month, actual: p.progress, planned: plannedProgress(p, phases), is_demo: p.is_demo })
    .onConflict(['project_id', 'month']).merge(['actual', 'planned']);
}

// Housekeeping: mark overdue tasks/invoices and delayed projects
async function refreshStatuses() {
  const today = new Date().toISOString().slice(0, 10);
  await db('tasks').whereIn('status', ['new', 'in_progress']).where('due_date', '<', today).update({ status: 'overdue' });
  await db('invoices').whereIn('status', ['issued', 'partial']).where('due_date', '<', today).update({ status: 'overdue' });
  await db('projects').where('status', 'in_progress').where('end_date', '<', today).where('progress', '<', 100).update({ status: 'delayed' });
}

module.exports = { plannedProgress, snapshot, refreshStatuses };
