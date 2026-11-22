import { useNavigate, Link } from 'react-router-dom';
import {
  Building2, Users, AlarmClock, Gavel, TrendingUp, TrendingDown, Landmark, Scale, ListChecks, Activity, CalendarClock, Megaphone,
  CheckCircle2, ClipboardCheck, AlertTriangle, PackageX, ChevronLeft, LogIn, LogOut, Palmtree, HardHat, UserCheck,
} from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { PageHead, Card, Stat, Progress, Badge, Spinner, Empty, useAsync, OptionBadge } from '../components/ui';
import { IncomeExpenseChart, ProgressTrendChart, ProjectCompareChart, Donut, C } from '../components/Charts';
import { money, num, date, dateTime, ago, time, pct } from '../lib/format';

const ACTION_LABEL = { create: 'إضافة', update: 'تعديل', delete: 'حذف', login: 'دخول', logout: 'خروج', check_in: 'حضور', check_out: 'انصراف', export: 'تصدير' };
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'صباح الخير' : 'مساء الخير'; };

function AttendanceQuick({ rec, onDone }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const act = async (type) => {
    setBusy(true);
    const send = (body) => api.post(`/attendance/check-${type}`, body).then(() => { toast(type === 'in' ? 'تم تسجيل الحضور' : 'تم تسجيل الانصراف'); onDone(); }).catch((e) => toast(e.message, 'error')).finally(() => setBusy(false));
    if (type === 'in' && navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => send({ lat: p.coords.latitude, lng: p.coords.longitude }), () => send({}), { timeout: 4000 });
    else send({});
  };
  return (
    <div className="card clock-card" style={{ padding: 18 }}>
      <div className="row between"><span className="small" style={{ color: 'var(--tal-200)' }}>حضور اليوم — {date(new Date())}</span><Clock4 /></div>
      <div className="row between" style={{ marginTop: 10, alignItems: 'flex-end' }}>
        <div>
          <div className="tiny" style={{ color: 'var(--tal-200)' }}>الحضور / الانصراف</div>
          <div style={{ fontSize: 22, fontWeight: 600 }} className="num">{rec && rec.check_in ? time(rec.check_in) : '--:--'} <span style={{ opacity: .5 }}>/</span> {rec && rec.check_out ? time(rec.check_out) : '--:--'}</div>
          {rec && rec.late_minutes > 0 && <div className="tiny" style={{ color: '#F5C36B' }}>تأخير {rec.late_minutes} دقيقة</div>}
        </div>
        {!rec || !rec.check_in ? <button className="btn" disabled={busy} onClick={() => act('in')}><LogIn />تسجيل حضور</button>
          : !rec.check_out ? <button className="btn" disabled={busy} onClick={() => act('out')}><LogOut />تسجيل انصراف</button>
            : <Badge tone="green">اكتمل اليوم</Badge>}
      </div>
    </div>
  );
}
const Clock4 = () => <AlarmClock size={18} color="#9CC2DD" />;

export default function Dashboard() {
  const { user, meta } = useAuth();
  const nav = useNavigate();
  const { data: d, loading, reload } = useAsync(() => api.get('/dashboard'), []);
  if (loading && !d) return <Spinner />;
  if (!d) return <Empty>تعذر تحميل لوحة التحكم</Empty>;
  const has = (s) => d.sections.includes(s);
  const k = d.kpis; const f = d.finance;
  const projStatusOpts = meta.projects && meta.projects.fields.find((x) => x.name === 'status').options;
  const statusLabel = (s) => ((projStatusOpts || []).find((o) => o.value === s) || {}).label || s;
  const taskOpts = meta.tasks && meta.tasks.fields.find((x) => x.name === 'status').options;

  return (
    <>
      <PageHead crumb="لوحة التحكم" title={`${greet()}، ${user.display_name.split(' ').slice(0, 2).join(' ')}`} desc={`${user.role_name} — ${date(new Date())}`} />

      {has('executive') && (<>
        <div className="grid g4">
          <Stat label="إجمالي المشاريع" value={num(k.projects_total)} icon={Building2} onClick={() => nav('/projects')}
            foot={<span>نشطة <b className="num">{k.projects_active}</b> · مكتملة <b className="num">{k.projects_completed}</b> · <span style={{ color: 'var(--red)' }}>متأخرة <b className="num">{k.projects_delayed}</b></span></span>} />
          <Stat label="الموظفون" value={num(k.employees_total)} icon={Users} tone="teal" onClick={() => nav('/attendance')}
            foot={<span>حاضرون الآن <b className="num">{k.employees_present}</b> · سجلوا اليوم <b className="num">{k.employees_checked_today}</b></span>} />
          <Stat label="المهام المتأخرة" value={num(k.tasks_overdue)} icon={AlarmClock} tone={k.tasks_overdue ? 'red' : 'green'} onClick={() => nav('/tasks')} foot="مهام تجاوزت تاريخ التسليم" />
          <Stat label="بانتظار اعتمادك" value={num(d.approvalsTotal)} icon={Gavel} tone="amber" foot="قرارات ومالية ومشتريات وإجازات" />
        </div>
        {has('finance') && (
          <div className="grid g4 mt">
            <Stat label={`إجمالي الإيرادات ${f.year}`} value={money(f.revenue, { compact: true })} icon={TrendingUp} tone="green" foot={money(f.revenue, { noDec: true })} />
            <Stat label={`إجمالي المصروفات ${f.year}`} value={money(f.expenses, { compact: true })} icon={TrendingDown} tone="amber" foot={money(f.expenses, { noDec: true })} />
            <Stat label="صافي الأرباح" value={money(f.net, { compact: true })} icon={Scale} tone={f.net >= 0 ? 'blue' : 'red'} foot={`هامش ${f.revenue ? pct((f.net / f.revenue) * 100) : '—'}`} />
            <Stat label="الالتزامات المالية" value={money(f.obligations, { compact: true })} icon={Landmark} tone="dark" foot={<>مستحقات لنا من العملاء: <b className="num">{money(f.receivables, { compact: true })}</b></>} />
          </div>)}

        <div className="grid g-2-1 mt">
          {has('finance') ? (
            <Card title="الإيرادات والمصروفات الشهرية" icon={TrendingUp} sub={`المعتمد فقط — ${f.year}`}
              actions={<div className="legend"><span><i style={{ background: C.brand }} />الإيرادات</span><span><i style={{ background: C.amber }} />المصروفات</span></div>}>
              <IncomeExpenseChart data={d.monthly} />
            </Card>
          ) : (
            <Card title="أداء المشاريع خلال السنة" icon={Activity} sub="متوسط الإنجاز الفعلي مقابل المخطط">
              <ProgressTrendChart data={d.progressTrend} height={280} />
            </Card>)}
          <Card title="طلبات تنتظر الاعتماد" icon={ClipboardCheck} flush>
            <div className="list">
              {d.approvals.length === 0 && <Empty>لا توجد طلبات</Empty>}
              {d.approvals.map((a) => (
                <Link key={a.key} to={a.link} className="list-item" style={{ color: 'var(--ink)' }}>
                  <span className="li-ico" style={a.count ? { background: 'var(--amber-bg)', color: 'var(--amber)' } : {}}>{a.count ? <AlertTriangle /> : <CheckCircle2 />}</span>
                  <span className="grow">{a.label}</span><b className="num" style={{ fontSize: 16, color: a.count ? 'var(--tal-900)' : 'var(--faint)' }}>{a.count}</b><ChevronLeft size={16} color="var(--faint)" />
                </Link>))}
            </div>
          </Card>
        </div>

        <div className="grid g2 mt">
          {has('finance') && <Card title="أداء المشاريع خلال السنة" icon={Activity} sub="متوسط الإنجاز الفعلي مقابل المخطط لجميع المشاريع"
            actions={<div className="legend"><span><i style={{ background: C.brand }} />الفعلي</span><span><i style={{ background: C.dark }} />المخطط</span></div>}>
            <ProgressTrendChart data={d.progressTrend} /></Card>}
          <Card title="نسبة إنجاز المشاريع" icon={Building2} sub="الفعلي مقابل المخطط حسب الجدول الزمني"
            actions={<div className="legend"><span><i style={{ background: C.brand }} />الفعلي</span><span><i style={{ background: C.brandLight }} />المخطط</span></div>}>
            <ProjectCompareChart data={d.projectComparison} keys={[{ key: 'progress', label: 'الفعلي', color: C.brand }, { key: 'planned', label: 'المخطط', color: C.brandLight }]} />
          </Card>
          {!has('finance') && <Card title="توزيع الموظفين على الإدارات" icon={Users}><Donut data={d.departments.map((x) => ({ name: x.name, value: x.count }))} /></Card>}
        </div>

        {has('finance') && (
          <div className="grid g-2-1 mt">
            <Card title="مقارنة المشاريع: الميزانية مقابل المصروف الفعلي" icon={Scale}
              actions={<div className="legend"><span><i style={{ background: C.dark }} />الميزانية</span><span><i style={{ background: C.amber }} />المصروف</span></div>}>
              <ProjectCompareChart data={d.projectComparison.filter((p) => p.budget > 0)} keys={[{ key: 'budget', label: 'الميزانية', color: C.dark, money: true }, { key: 'spent', label: 'المصروف', color: C.amber, money: true }]} />
            </Card>
            <Card title="توزيع الموظفين على الإدارات" icon={Users}><Donut data={d.departments.map((x) => ({ name: x.name, value: x.count }))} height={190} /></Card>
          </div>)}

        <Card title="حالة المشاريع" icon={Building2} className="mt" flush>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>المشروع</th><th>الحالة</th><th style={{ width: 260 }}>الإنجاز (الفعلي / المخطط)</th>{has('finance') && <><th className="money">الميزانية</th><th className="money">المصروف</th><th>الاستهلاك</th></>}</tr></thead>
            <tbody>{d.projectComparison.map((p) => (
              <tr key={p.id} className="click" onClick={() => nav(`/projects/${p.id}`)}>
                <td><div className="bold">{p.name}</div><div className="tiny muted ltr">{p.code}</div></td>
                <td><OptionBadge options={projStatusOpts} value={p.status} /></td>
                <td><Progress value={p.progress} planned={p.planned} showLabel /></td>
                {has('finance') && <><td className="money">{money(p.budget, { compact: true })}</td><td className="money">{money(p.spent, { compact: true })}</td>
                  <td className="num">{p.budget ? <Badge tone={p.spent / p.budget > p.progress / 100 + 0.1 ? 'red' : 'green'} plain>{pct((p.spent / p.budget) * 100)}</Badge> : '—'}</td></>}
              </tr>))}</tbody>
          </table></div>
        </Card>
      </>)}

      {has('pm') && (<>
        <div className="grid g4">
          <Stat label="مشاريعي" value={num(d.myProjects.length)} icon={Building2} onClick={() => nav('/projects')} foot={`متوسط الإنجاز ${pct(d.myProjects.reduce((s, p) => s + p.progress, 0) / (d.myProjects.length || 1))}`} />
          <Stat label="فريق العمل" value={num(d.teamSize)} icon={HardHat} tone="teal" foot="موظفون في مشاريعي" />
          <Stat label="مهام متأخرة" value={num(d.projectTasks.overdue || 0)} icon={AlarmClock} tone="red" onClick={() => nav('/tasks')} foot={`قيد التنفيذ ${d.projectTasks.in_progress || 0}`} />
          <Stat label="بانتظار مراجعتي" value={num(d.projectTasks.review || 0)} icon={ClipboardCheck} tone="amber" onClick={() => nav('/tasks')} foot="مهام بانتظار اعتماد الإكمال" />
        </div>
        <div className="grid g-2-1 mt">
          <Card title="مشاريعي" icon={Building2} flush>
            <div className="list">{d.myProjects.map((p) => (
              <Link to={`/projects/${p.id}`} key={p.id} className="list-item" style={{ color: 'var(--ink)', alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="row between"><span className="title">{p.name}</span><OptionBadge options={projStatusOpts} value={p.status} /></div>
                  <div className="meta" style={{ margin: '3px 0 8px' }}>{p.location} · التسليم {date(p.end_date)}</div>
                  <Progress value={p.progress} planned={p.planned} showLabel />
                  <div className="tiny muted mt" style={{ marginTop: 6 }}>الميزانية {money(p.budget, { compact: true })} · المصروف {money(p.spent, { compact: true })}</div>
                </div>
              </Link>))}</div>
          </Card>
          <Card title="معوقات مفتوحة" icon={AlertTriangle} flush>
            <div className="list">{d.openIssues.length === 0 ? <Empty>لا توجد معوقات</Empty> : d.openIssues.map((i) => (
              <Link key={i.id} to={`/projects/${i.project_id}?tab=issues`} className="list-item" style={{ color: 'var(--ink)' }}>
                <div className="grow"><div className="title">{i.title}</div><div className="meta">{i.project_name}</div></div>
                <Badge tone={{ critical: 'red', high: 'amber', medium: 'blue', low: 'gray' }[i.severity]}>{{ critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' }[i.severity]}</Badge>
              </Link>))}</div>
          </Card>
        </div>
      </>)}

      {has('inventory') && (
        <div className="grid g-2-1" style={{ marginTop: has('pm') || has('executive') ? 16 : 0 }}>
          <Card title="تنبيهات انخفاض المخزون" icon={PackageX} flush actions={<Link to="/inventory" className="small">المستودعات</Link>}>
            <div className="list">{d.inventory.lowStock.length === 0 ? <Empty>المخزون ضمن الحدود</Empty> : d.inventory.lowStock.map((m) => (
              <div key={m.id} className="list-item"><span className="li-ico" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}><PackageX /></span>
                <div className="grow"><div className="title">{m.name}</div><div className="meta num">المتوفر {num(m.quantity)} {m.unit} · الحد {num(m.min_quantity)}</div></div></div>))}</div>
          </Card>
          <div className="stack">
            <Stat label="طلبات شراء بانتظار الاعتماد" value={d.inventory.prPending} icon={ClipboardCheck} tone="amber" onClick={() => nav('/purchasing')} />
            <Stat label="طلبات معتمدة بانتظار أمر شراء" value={d.inventory.prApproved} icon={CheckCircle2} tone="green" onClick={() => nav('/purchasing')} />
            <Stat label="أوامر شراء مفتوحة" value={d.inventory.poOpen} icon={ListChecks} onClick={() => nav('/purchasing?tab=orders')} />
          </div>
        </div>)}

      {has('personal') && (
        <div className="grid g-2-1" style={{ marginTop: d.sections.length > 1 ? 16 : 0 }}>
          <Card title="مهامي" icon={ListChecks} flush actions={<Link to="/tasks" className="small">كل المهام</Link>}>
            <div className="list">{d.myTasks.length === 0 ? <Empty>لا توجد مهام مفتوحة</Empty> : d.myTasks.map((t) => (
              <Link key={t.id} to={`/tasks?open=${t.id}`} className="list-item" style={{ color: 'var(--ink)' }}>
                <div className="grow"><div className="title">{t.title}</div><div className="meta">{t.project_name || 'مهمة إدارية'} · التسليم {date(t.due_date)}</div></div>
                <OptionBadge options={taskOpts} value={t.status} />
              </Link>))}</div>
          </Card>
          <div className="stack">
            <AttendanceQuick rec={d.myAttendance} onDone={reload} />
            <div className="grid g2">
              <Stat label="رصيد الإجازات" value={num(d.leaveBalance, 1)} unit="يوم" icon={Palmtree} tone="teal" onClick={() => nav('/attendance?tab=leaves')} />
              <Stat label="مهام متأخرة" value={num(d.myTaskCounts.overdue || 0)} icon={AlarmClock} tone={(d.myTaskCounts.overdue || 0) ? 'red' : 'green'} />
            </div>
            {!has('executive') && !has('pm') && <Stat label="بانتظار المراجعة" value={num(d.myTaskCounts.review || 0)} icon={UserCheck} tone="amber" foot="مهام أنهيتها وتنتظر اعتماد الإكمال" />}
          </div>
        </div>)}

      <div className="grid g3 mt">
        <Card title="آخر النشاطات" icon={Activity} flush actions={d.activity.length > 0 && <Link to="/audit" className="small">{user.isOwner || meta ? 'السجل الكامل' : ''}</Link>}>
          <div className="list">{d.activity.length === 0 ? <Empty>لا توجد نشاطات</Empty> : d.activity.slice(0, 8).map((a) => (
            <div key={a.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <span className="li-ico"><Activity /></span>
              <div className="grow"><div className="small" style={{ lineHeight: 1.5 }}>{a.summary}</div><div className="meta">{a.user_name} · {ago(a.created_at)}</div></div>
              <span className="tiny muted">{ACTION_LABEL[a.action] || ''}</span>
            </div>))}</div>
        </Card>
        <Card title="الاجتماعات القادمة" icon={CalendarClock} flush actions={<Link to="/meetings" className="small">الكل</Link>}>
          <div className="list">{d.upcomingMeetings.length === 0 ? <Empty>لا توجد اجتماعات قادمة</Empty> : d.upcomingMeetings.map((m) => (
            <div key={m.id} className="list-item"><span className="li-ico"><CalendarClock /></span><div className="grow"><div className="title">{m.title}</div><div className="meta num">{dateTime(m.starts_at)} · {m.location}</div></div></div>))}</div>
        </Card>
        <Card title="التعاميم الإدارية" icon={Megaphone} flush actions={<Link to="/meetings?tab=circulars" className="small">الكل</Link>}>
          <div className="list">{d.circulars.length === 0 ? <Empty>لا توجد تعاميم</Empty> : d.circulars.map((c) => (
            <Link key={c.id} to="/meetings?tab=circulars" className="list-item" style={{ color: 'var(--ink)' }}><span className="li-ico"><Megaphone /></span><div className="grow"><div className="title">{c.title}</div><div className="meta"><span className="ltr">{c.number}</span> · {date(c.issue_date)}</div></div></Link>))}</div>
        </Card>
      </div>
      {statusLabel && null}
    </>
  );
}
