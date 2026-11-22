import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Mail, Phone, Building, CalendarDays, UserCog, Pencil, ListChecks, Palmtree, Star, History, Clock, FileText, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHead, Card, Tabs, Avatar, Spinner, Empty, useAsync, OptionBadge, Stat } from '../components/ui';
import ResourceView, { FormModal } from '../components/ResourceView';
import { money, date, num } from '../lib/format';

export default function EmployeeProfile({ self }) {
  const params = useParams();
  const { user, meta, can } = useAuth();
  const id = self ? user.employee_id : Number(params.id);
  const [tab, setTab] = useState('tasks'); const [edit, setEdit] = useState(false);
  const { data: e, loading, error, reload } = useAsync(() => (id ? api.get(`/r/employees/${id}`) : Promise.reject(new Error('حسابك غير مرتبط بملف موظف'))), [id]);
  const stats = useAsync(async () => {
    if (!id) return null;
    const [tasks, att] = await Promise.all([
      api.get(`/r/tasks?pageSize=1000&filter[assignee_id]=${id}`).catch(() => ({ rows: [] })),
      api.get(`/r/attendance?pageSize=40&filter[employee_id]=${id}`).catch(() => ({ rows: [] })),
    ]);
    return { open: tasks.rows.filter((t) => t.status !== 'done').length, done: tasks.rows.filter((t) => t.status === 'done').length, overdue: tasks.rows.filter((t) => t.status === 'overdue').length,
      late: att.rows.filter((a) => a.status === 'late').length, absent: att.rows.filter((a) => a.status === 'absent').length };
  }, [id]);
  if (loading) return <Spinner />;
  if (error) return <div className="card"><Empty>{error.message}</Empty></div>;
  const em = meta.employees; const statusOpts = em.fields.find((f) => f.name === 'status').options;
  const fx = { employee_id: id };
  const isSelf = user.employee_id === id;
  const s = stats.data || {};
  return (
    <>
      <PageHead crumb={self ? 'ملفي الوظيفي' : <Link to="/employees">الموظفون</Link>} title={self ? 'ملفي الوظيفي' : 'الملف الوظيفي'}>
        {em.perms.update && !self && <button className="btn" onClick={() => setEdit(true)}><Pencil />تعديل البيانات</button>}
      </PageHead>
      <div className="grid g-2-1">
        <div className="card" style={{ padding: 22 }}>
          <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
            <Avatar name={e.full_name} src={e.photo_url} size="lg" />
            <div style={{ flex: 1 }}>
              <div className="row wrap" style={{ gap: 8 }}><h2 style={{ margin: 0, fontSize: 20, color: 'var(--tal-900)' }}>{e.full_name}</h2><OptionBadge options={statusOpts} value={e.status} /></div>
              <div className="muted" style={{ marginTop: 2 }}>{e.job_title} · <span className="ltr">{e.emp_no}</span></div>
              <div className="grid g2 mt" style={{ gap: 10 }}>
                <span className="row small" style={{ gap: 7 }}><Building size={15} color="var(--tal-500)" />{e.department_id__label || '—'}</span>
                <span className="row small" style={{ gap: 7 }}><UserCog size={15} color="var(--tal-500)" />المدير المباشر: {e.manager_id__label || '—'}</span>
                <span className="row small" style={{ gap: 7 }}><CalendarDays size={15} color="var(--tal-500)" />تاريخ التوظيف: {date(e.hire_date)}</span>
                {e.email && <span className="row small" style={{ gap: 7 }}><Mail size={15} color="var(--tal-500)" /><span className="ltr">{e.email}</span></span>}
                {e.phone && <span className="row small" style={{ gap: 7 }}><Phone size={15} color="var(--tal-500)" /><span className="ltr">{e.phone}</span></span>}
                {e.national_id && <span className="row small" style={{ gap: 7 }}><FileText size={15} color="var(--tal-500)" />الهوية: <span className="ltr">{e.national_id}</span></span>}
              </div>
            </div>
          </div>
        </div>
        <div className="stack">
          {e.salary != null && (
            <Card title="الراتب والمستحقات" icon={Wallet} sub={isSelf && !can('employees.salary') ? 'ظاهر لك فقط' : 'حسب الصلاحيات'}>
              <div className="row between"><span className="muted">الأساسي</span><b className="num">{money(e.salary)}</b></div>
              <div className="row between mt" style={{ marginTop: 8 }}><span className="muted">البدلات</span><b className="num">{money(e.allowances)}</b></div>
              <div className="hr" /><div className="row between"><span className="bold">الإجمالي</span><b className="num" style={{ color: 'var(--tal-700)' }}>{money(Number(e.salary) + Number(e.allowances || 0))}</b></div>
            </Card>)}
          <div className="grid g2">
            <Stat label="رصيد الإجازات" value={e.leave_balance != null ? num(e.leave_balance, 1) : '—'} unit="يوم" icon={Palmtree} tone="teal" />
            <Stat label="مهام مفتوحة" value={num(s.open)} icon={ListChecks} foot={`منجزة ${s.done ?? 0} · متأخرة ${s.overdue ?? 0}`} />
          </div>
        </div>
      </div>
      <div className="mt">
        <Tabs value={tab} onChange={setTab} tabs={[
          { key: 'tasks', label: 'سجل المهام', icon: ListChecks }, { key: 'leaves', label: 'الإجازات', icon: Palmtree }, { key: 'attendance', label: 'الحضور', icon: Clock },
          meta.evaluations && { key: 'evals', label: 'التقييمات', icon: Star }, meta.employee_history && { key: 'history', label: 'السجل الوظيفي', icon: History },
          meta.documents && { key: 'docs', label: 'العقود والمستندات', icon: FileText },
        ]} />
        {tab === 'tasks' && <ResourceView resource="tasks" fixed={{ assignee_id: id }} canCreate={meta.tasks.perms.create} columns={['title', 'project_id', 'priority', 'due_date', 'progress', 'status']} />}
        {tab === 'leaves' && <ResourceView resource="leave_requests" fixed={fx} canCreate={isSelf || can('leaves.approve')} createLabel="طلب إجازة" />}
        {tab === 'attendance' && <ResourceView resource="attendance" fixed={fx} canCreate={can('attendance.manage')} columns={['work_date', 'check_in', 'check_out', 'status', 'late_minutes', 'source']} />}
        {tab === 'evals' && <ResourceView resource="evaluations" fixed={fx} createLabel="تقييم جديد" />}
        {tab === 'history' && <ResourceView resource="employee_history" fixed={fx} createLabel="إضافة حدث" />}
        {tab === 'docs' && <ResourceView resource="documents" fixed={fx} createLabel="رفع مستند" defaults={{ category: 'employee', access_level: 'management' }} columns={['title', 'category', 'access_level', 'expiry_date']} />}
      </div>
      {edit && <FormModal resource="employees" meta={em} row={e} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />}
    </>
  );
}
