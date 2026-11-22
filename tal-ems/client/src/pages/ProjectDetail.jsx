import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  LayoutDashboard, GanttChart, Layers, ListChecks, Users, Receipt, ShoppingCart, Truck, ClipboardList, Images, FileText, AlertTriangle,
  MapPin, User, Building, CalendarDays, Pencil, Wallet, Image as ImageIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHead, Card, Tabs, Progress, OptionBadge, Spinner, Empty, useAsync, Avatar, Stat, Badge } from '../components/ui';
import ResourceView, { FormModal } from '../components/ResourceView';
import { ProgressTrendChart, Donut, C } from '../components/Charts';
import { money, date, pct, num } from '../lib/format';

function Gantt({ project, phases, planned }) {
  if (!phases.length || !project.start_date || !project.end_date) return <Empty>أضف مراحل التنفيذ بتواريخها لعرض الجدول الزمني</Empty>;
  const s = Math.min(new Date(project.start_date), ...phases.map((p) => new Date(p.start_date || project.start_date)));
  const e = Math.max(new Date(project.end_date), ...phases.map((p) => new Date(p.end_date || project.end_date)));
  const span = e - s; const posPct = (d) => ((new Date(d) - s) / span) * 100;
  const today = posPct(new Date());
  const months = []; const c = new Date(s); c.setDate(1);
  while (c <= e) { months.push(new Date(c)); c.setMonth(c.getMonth() + 1); }
  const step = Math.ceil(months.length / 12);
  return (
    <div>
      <div className="row between small muted" style={{ marginBottom: 12 }}>
        <span>الخط الأزرق الداكن = المدة المخططة · التعبئة = نسبة الإنجاز الفعلي · الخط الأحمر = اليوم</span>
        <span>الإنجاز الكلي: <b className="num">{pct(project.progress)}</b> مقابل المخطط <b className="num">{pct(planned)}</b></span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 0, fontSize: 12.5 }}>
        <div />
        <div style={{ position: 'relative', height: 24, borderBottom: '1px solid var(--line)' }}>
          {months.map((m, i) => i % step === 0 && <span key={i} className="tiny muted" style={{ position: 'absolute', right: `${posPct(m)}%`, top: 2, whiteSpace: 'nowrap' }}>{new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { month: 'short', year: '2-digit' }).format(m)}</span>)}
        </div>
        {phases.map((p) => {
          const r = posPct(p.start_date || project.start_date); const w = Math.max(1.5, posPct(p.end_date || project.end_date) - r);
          const late = p.progress < 100 && new Date(p.end_date) < new Date();
          return (
            <div key={p.id} style={{ display: 'contents' }}>
              <div style={{ padding: '10px 0', borderBottom: '1px solid var(--line-2)' }}><div className="bold">{p.name}</div><div className="tiny muted num">{date(p.start_date)} — {date(p.end_date)}</div></div>
              <div style={{ position: 'relative', borderBottom: '1px solid var(--line-2)', background: 'repeating-linear-gradient(90deg, transparent, transparent 59px, #F1F4F7 59px, #F1F4F7 60px)' }}>
                <div style={{ position: 'absolute', top: 14, height: 20, right: `${r}%`, width: `${w}%`, background: 'var(--tal-100)', border: `1px solid ${late ? 'var(--red)' : 'var(--tal-300)'}`, borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${p.progress}%`, background: p.progress >= 100 ? 'var(--green)' : late ? 'var(--red)' : 'var(--tal-500)' }} />
                </div>
                <span className="tiny num" style={{ position: 'absolute', top: 16, right: `calc(${r + w}% + 6px)`, color: 'var(--ink-2)' }}>{pct(p.progress)}</span>
                <div style={{ position: 'absolute', top: 0, bottom: 0, right: `${today}%`, width: 2, background: 'var(--red)', opacity: 0.7 }} />
              </div>
            </div>);
        })}
      </div>
    </div>
  );
}

function Gallery({ projectId, project }) {
  const { data } = useAsync(async () => {
    const reports = await api.get(`/r/daily_reports?pageSize=200&filter[project_id]=${projectId}`);
    const docs = await api.get(`/r/documents?pageSize=200&filter[project_id]=${projectId}`).catch(() => ({ rows: [] }));
    return { photos: reports.rows.filter((r) => r.photo_url).map((r) => ({ url: r.photo_url, caption: `تقرير ${date(r.report_date)}` })), docs: docs.rows };
  }, [projectId]);
  if (!data) return <Spinner />;
  const items = [...(project.image_url ? [{ url: project.image_url, caption: 'صورة المشروع' }] : []), ...data.photos];
  return (
    <div className="stack">
      <Card title="صور الموقع" icon={ImageIcon} sub="من صورة المشروع والتقارير اليومية — أضف صوراً عبر التقارير اليومية أو تبويب المستندات">
        {items.length === 0 ? <Empty>لا توجد صور</Empty> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {items.map((it, i) => <a key={i} href={it.url} target="_blank" rel="noreferrer" className="card" style={{ overflow: 'hidden' }}><img src={it.url} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} /><div className="tiny muted" style={{ padding: '6px 10px' }}>{it.caption}</div></a>)}
          </div>)}
      </Card>
      <Card title="المرفقات" icon={FileText} flush>
        <div className="list">{data.docs.length === 0 ? <Empty>لا توجد مرفقات</Empty> : data.docs.map((d) => (
          <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" className="list-item" style={{ color: 'var(--ink)' }}><span className="li-ico"><FileText /></span><div className="grow"><div className="title">{d.title}</div><div className="meta">{date(d.created_at)}</div></div></a>))}</div>
      </Card>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'overview';
  const setTab = (t) => setSp({ tab: t }, { replace: true });
  const { meta, can } = useAuth();
  const { data, loading, error, reload } = useAsync(() => api.get(`/projects/${id}/overview`), [id]);
  const [editing, setEditing] = useState(false);
  if (loading && !data) return <Spinner />;
  if (error) return <div className="card"><Empty>{error.message}</Empty></div>;
  const p = data.project; const statusOpts = meta.projects.fields.find((f) => f.name === 'status').options;
  const fx = { project_id: Number(id) };
  const fin = data.finance;

  const tabs = [
    { key: 'overview', label: 'نظرة عامة', icon: LayoutDashboard }, { key: 'timeline', label: 'الجدول الزمني', icon: GanttChart },
    { key: 'phases', label: 'مراحل التنفيذ', icon: Layers, count: data.phases.length }, { key: 'tasks', label: 'المهام', icon: ListChecks },
    { key: 'team', label: 'فريق العمل', icon: Users, count: data.team }, meta.transactions && { key: 'expenses', label: 'المصروفات', icon: Receipt },
    meta.purchase_requests && { key: 'purchases', label: 'المشتريات', icon: ShoppingCart }, meta.equipment && { key: 'equipment', label: 'المعدات', icon: Truck, count: data.equipment },
    { key: 'daily', label: 'التقارير اليومية', icon: ClipboardList }, { key: 'gallery', label: 'الصور والمرفقات', icon: Images },
    meta.documents && { key: 'docs', label: 'المستندات والعقود', icon: FileText }, { key: 'issues', label: 'الملاحظات والمعوقات', icon: AlertTriangle, count: data.openIssues },
  ];
  const change = () => reload();

  return (
    <>
      <PageHead crumb={<><Link to="/projects">المشاريع</Link></>} title={p.name} desc={<span className="row" style={{ gap: 8 }}><span className="ltr">{p.code}</span><OptionBadge options={statusOpts} value={p.status} />{p.is_demo && <Badge tone="demo" plain>بيانات تجريبية</Badge>}</span>}>
        {meta.projects.perms.update && data.canManage && <button className="btn" onClick={() => setEditing(true)}><Pencil />تعديل بيانات المشروع</button>}
      </PageHead>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="stack">
          <div className="card proj-hero">
            <div className="cover" style={{ backgroundImage: p.image_url ? `url(${p.image_url})` : undefined }} />
            <div className="info">
              <div className="grid g2" style={{ gap: 10 }}>
                <span className="row small" style={{ gap: 7 }}><MapPin size={15} color="var(--tal-500)" />{p.location || '—'}</span>
                <span className="row small" style={{ gap: 7 }}><Building size={15} color="var(--tal-500)" />العميل: {p.client_name || '—'}</span>
                <span className="row small" style={{ gap: 7 }}><User size={15} color="var(--tal-500)" />مدير المشروع: {p.manager_name || '—'}</span>
                <span className="row small" style={{ gap: 7 }}><CalendarDays size={15} color="var(--tal-500)" /><span className="num">{date(p.start_date)} ← {date(p.end_date)}</span></span>
              </div>
              <div className="hr" />
              <div className="small muted" style={{ marginBottom: 8 }}>نسبة الإنجاز — الفعلي مقابل المخطط الزمني</div>
              <Progress value={p.progress} planned={data.planned} lg showLabel />
              {p.progress + 5 < data.planned && <div className="error-box" style={{ marginTop: 12 }}>المشروع متأخر عن الخطة بفارق {pct(data.planned - p.progress)}</div>}
              {p.description && <p className="small muted" style={{ marginBottom: 0 }}>{p.description}</p>}
            </div>
          </div>
          <div className="grid g4">
            <Stat label="المهام المفتوحة" value={num((data.tasks.new || 0) + (data.tasks.in_progress || 0) + (data.tasks.review || 0))} icon={ListChecks} foot={`مكتملة ${data.tasks.done || 0} · متأخرة ${data.tasks.overdue || 0}`} onClick={() => setTab('tasks')} />
            <Stat label="فريق العمل" value={num(data.team)} icon={Users} tone="teal" onClick={() => setTab('team')} />
            <Stat label="المعدات في الموقع" value={num(data.equipment)} icon={Truck} tone="dark" onClick={() => setTab('equipment')} />
            <Stat label="معوقات مفتوحة" value={num(data.openIssues)} icon={AlertTriangle} tone={data.openIssues ? 'red' : 'green'} onClick={() => setTab('issues')} />
          </div>
          {fin && (
            <div className="grid g-3-2">
              <Card title="الملخص المالي للمشروع" icon={Wallet}>
                <div className="grid g3" style={{ gap: 12 }}>
                  {[['قيمة العقد', fin.contract_value], ['الميزانية المعتمدة', fin.budget], ['المصروف الفعلي', fin.spent], ['بانتظار الاعتماد', fin.pending], ['المحصّل من العميل', fin.received], ['أوامر الشراء', fin.purchases]].map(([l, v]) => (
                    <div key={l} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}><div className="tiny muted">{l}</div><div className="bold num" style={{ fontSize: 16, color: 'var(--tal-900)' }}>{money(v, { compact: true })}</div></div>))}
                </div>
                <div className="small muted" style={{ margin: '16px 0 6px' }}>استهلاك الميزانية</div>
                <Progress value={fin.budget ? (fin.spent / fin.budget) * 100 : 0} planned={p.progress} showLabel />
                <div className="tiny muted" style={{ marginTop: 6 }}>المؤشر = نسبة الإنجاز الفعلي؛ الاستهلاك الأعلى منه يعني تجاوزاً محتملاً للتكلفة.</div>
              </Card>
              <Card title="المصروفات حسب البند" icon={Receipt}>{fin.byCategory.length ? <Donut data={fin.byCategory} height={170} fmt={(v) => money(v, { compact: true })} center={money(fin.spent, { compact: true })} /> : <Empty>لا توجد مصروفات معتمدة</Empty>}</Card>
            </div>)}
          <div className="grid g2">
            <Card title="منحنى الإنجاز الشهري" icon={GanttChart} actions={<div className="legend"><span><i style={{ background: C.brand }} />الفعلي</span><span><i style={{ background: C.dark }} />المخطط</span></div>}>
              {data.history.length ? <ProgressTrendChart data={data.history} height={230} /> : <Empty>لا توجد بيانات تاريخية بعد</Empty>}
            </Card>
            <Card title="مراحل التنفيذ" icon={Layers} flush>
              <div className="list">{data.phases.length === 0 ? <Empty>لا توجد مراحل</Empty> : data.phases.map((ph) => (
                <div key={ph.id} className="list-item"><div className="grow"><div className="row between"><span className="title">{ph.name}</span><span className="tiny muted">الوزن {num(ph.weight)}%</span></div><div style={{ marginTop: 6 }}><Progress value={ph.progress} /></div></div><b className="num small" style={{ width: 44, textAlign: 'left' }}>{pct(ph.progress)}</b></div>))}</div>
            </Card>
          </div>
          {data.lastReport && <Card title={`آخر تقرير يومي — ${date(data.lastReport.report_date)}`} icon={ClipboardList}><p style={{ margin: 0 }}>{data.lastReport.work_done}</p><div className="tiny muted mt">العمالة: {data.lastReport.workers_count}</div></Card>}
        </div>)}

      {tab === 'timeline' && <Card title="الجدول الزمني ومقارنة الإنجاز" icon={GanttChart}><Gantt project={p} phases={data.phases} planned={data.planned} /></Card>}
      {tab === 'phases' && <ResourceView resource="project_phases" fixed={fx} createLabel="إضافة مرحلة" reloadKey={tab} canCreate={data.canManage && meta.project_phases.perms.create} columns={['name', 'start_date', 'end_date', 'weight', 'progress', 'status']} />}
      {tab === 'tasks' && <ResourceView resource="tasks" fixed={fx} createLabel="مهمة جديدة" canCreate={data.canManage && meta.tasks.perms.create} columns={['title', 'assignee_id', 'priority', 'due_date', 'progress', 'status']} />}
      {tab === 'team' && <ResourceView resource="project_members" fixed={fx} createLabel="إضافة عضو" canCreate={data.canManage && meta.project_members.perms.create} />}
      {tab === 'expenses' && <ResourceView resource="transactions" fixed={fx} createLabel={can('finance.manage') ? 'عملية مالية' : 'طلب مصروف'} defaults={{ kind: 'expense' }} columns={['ref_no', 'kind', 'category', 'amount', 'tx_date', 'status']} />}
      {tab === 'purchases' && (<div className="stack">
        <ResourceView resource="purchase_requests" title="طلبات الشراء" fixed={fx} createLabel="طلب شراء" columns={['number', 'title', 'estimated_total', 'needed_by', 'priority', 'status']} />
        {meta.purchase_orders && <ResourceView resource="purchase_orders" title="أوامر الشراء" fixed={fx} columns={['number', 'supplier_id', 'total', 'order_date', 'delivery_date', 'status']} />}
      </div>)}
      {tab === 'equipment' && <ResourceView resource="equipment" fixed={fx} columns={['code', 'name', 'category', 'status', 'ownership', 'next_maintenance']} />}
      {tab === 'daily' && <ResourceView resource="daily_reports" fixed={fx} createLabel="تقرير يومي" canCreate={data.canManage && meta.daily_reports.perms.create} defaults={{ report_date: new Date().toISOString().slice(0, 10) }} columns={['report_date', 'weather', 'workers_count', 'equipment_count', 'work_done']} cellRender={{ work_done: (r) => <div className="truncate">{r.work_done}</div> }} />}
      {tab === 'gallery' && <Gallery projectId={id} project={p} />}
      {tab === 'docs' && <ResourceView resource="documents" fixed={fx} createLabel="رفع مستند" defaults={{ category: 'project' }} columns={['title', 'category', 'access_level', 'expiry_date']} />}
      {tab === 'issues' && <ResourceView resource="project_issues" fixed={fx} createLabel="تسجيل ملاحظة / معوق" columns={['kind', 'title', 'severity', 'status']} onRowClick={undefined} />}

      {editing && <FormModal resource="projects" meta={meta.projects} row={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); change(); }} />}
      {Avatar && null}
    </>
  );
}
