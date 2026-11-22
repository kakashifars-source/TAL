import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table2, Columns3, Send, MessageSquare } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { PageHead, OptionBadge, Progress, useAsync, Avatar } from '../components/ui';
import ResourceView from '../components/ResourceView';
import { date, ago } from '../lib/format';

function Comments({ taskId }) {
  const toast = useToast();
  const { data, reload } = useAsync(() => api.get(`/r/task_comments?pageSize=200&filter[task_id]=${taskId}`), [taskId]);
  const [body, setBody] = useState('');
  const send = async (e) => { e.preventDefault(); if (!body.trim()) return; try { await api.post('/r/task_comments', { task_id: taskId, body }); setBody(''); reload(); } catch (x) { toast(x.message, 'error'); } };
  return (
    <div>
      <div className="bold row" style={{ gap: 6, marginBottom: 10 }}><MessageSquare size={16} color="var(--tal-500)" />التعليقات</div>
      {data && data.rows.map((c) => (
        <div key={c.id} className="row" style={{ alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <Avatar name={c.user_id__label} size="sm" />
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '8px 12px', flex: 1 }}>
            <div className="row between tiny"><b>{c.user_id__label}</b><span className="muted">{ago(c.created_at)}</span></div>
            <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{c.body}</div>
          </div>
        </div>))}
      {data && data.rows.length === 0 && <div className="small muted" style={{ marginBottom: 10 }}>لا توجد تعليقات بعد</div>}
      <form onSubmit={send} className="row"><input className="input" placeholder="اكتب تعليقاً..." value={body} onChange={(e) => setBody(e.target.value)} /><button className="btn primary" aria-label="إرسال"><Send /></button></form>
    </div>
  );
}

export default function Tasks() {
  const [sp] = useSearchParams();
  const { can, meta, user } = useAuth();
  const [view, setView] = useState('table'); const [scope, setScope] = useState('all');
  const statusOpts = meta.tasks.fields.find((f) => f.name === 'status').options;
  const prioOpts = meta.tasks.fields.find((f) => f.name === 'priority').options;
  const editFields = can('tasks.update') ? undefined : ['status', 'progress'];
  const initial = sp.get('filter') === 'review' ? { status: 'review' } : {};
  const fixed = scope === 'mine' && user.employee_id ? { assignee_id: user.employee_id } : {};

  const kanban = ({ rows, open }) => (
    <div className="kanban" style={{ padding: 14 }}>
      {statusOpts.map((s) => {
        const items = rows.filter((r) => r.status === s.value);
        return (
          <div key={s.value} className="kcol">
            <h4><OptionBadge options={statusOpts} value={s.value} /><span className="num muted">{items.length}</span></h4>
            {items.map((t) => (
              <div key={t.id} className="kcard" onClick={() => open(t)}>
                <div className="t">{t.title}</div>
                <div className="tiny muted" style={{ marginBottom: 6 }}>{t.project_id__label || 'مهمة إدارية'}</div>
                <Progress value={t.progress} />
                <div className="row between tiny" style={{ marginTop: 8 }}><span className="row" style={{ gap: 5 }}><Avatar name={t.assignee_id__label} size="sm" />{(t.assignee_id__label || '').split(' ').slice(0, 2).join(' ')}</span><OptionBadge options={prioOpts} value={t.priority} /></div>
                <div className="tiny muted num" style={{ marginTop: 4 }}>التسليم: {date(t.due_date)}</div>
              </div>))}
          </div>);
      })}
    </div>
  );

  return (
    <>
      <PageHead crumb="المهام والتكليفات" title="المهام والتكليفات" desc={can('tasks.view_all') ? 'جميع مهام الشركة' : can('tasks.create') ? 'مهامك ومهام المشاريع التي تديرها' : 'المهام المسندة إليك — حدّث الحالة ونسبة الإنجاز، والإكمال يُعتمد من المسؤول'}>
        {user.employee_id && (can('tasks.view_all') || can('tasks.create')) && (
          <div className="row" style={{ gap: 4, background: '#fff', border: '1px solid var(--line)', borderRadius: 9, padding: 3 }}>
            <button className={`btn sm ${scope === 'all' ? 'dark' : 'ghost'}`} onClick={() => setScope('all')}>الكل</button>
            <button className={`btn sm ${scope === 'mine' ? 'dark' : 'ghost'}`} onClick={() => setScope('mine')}>المسندة إليّ</button>
          </div>)}
        <div className="row" style={{ gap: 4, background: '#fff', border: '1px solid var(--line)', borderRadius: 9, padding: 3 }}>
          <button className={`btn sm ${view === 'table' ? 'primary' : 'ghost'}`} onClick={() => setView('table')}><Table2 />جدول</button>
          <button className={`btn sm ${view === 'kanban' ? 'primary' : 'ghost'}`} onClick={() => setView('kanban')}><Columns3 />لوحة</button>
        </div>
      </PageHead>
      <ResourceView resource="tasks" createLabel="مهمة جديدة" fixed={fixed} initialFilters={initial} openId={sp.get('open') ? Number(sp.get('open')) : null} editFields={editFields}
        pageSize={view === 'kanban' ? 300 : 25} renderView={view === 'kanban' ? kanban : undefined}
        columns={['title', 'project_id', 'assignee_id', 'priority', 'due_date', 'progress', 'status']} drawerExtra={(row) => <Comments taskId={row.id} />} />
    </>
  );
}
