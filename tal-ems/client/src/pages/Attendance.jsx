import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, LogIn, LogOut, Palmtree, CalendarRange, Timer, BarChart3, MapPin, Fingerprint } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { PageHead, Tabs, Card, Badge, Spinner, useAsync, Empty } from '../components/ui';
import ResourceView from '../components/ResourceView';
import { time, date, todayISO } from '../lib/format';

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return <div className="clock-time">{now.toLocaleTimeString('en-GB')}</div>;
}

function MyDay() {
  const toast = useToast();
  const { data, reload } = useAsync(() => api.get('/attendance/today'), []);
  const [busy, setBusy] = useState(false);
  if (!data) return <Spinner />;
  if (!data.linked) return <div className="info-box">حسابك غير مرتبط بملف موظف، لذلك لا يمكن تسجيل الحضور.</div>;
  const r = data.record;
  const act = (type) => {
    setBusy(true);
    const send = (body) => api.post(`/attendance/check-${type}`, body).then(() => { toast(type === 'in' ? 'تم تسجيل الحضور' : 'تم تسجيل الانصراف'); reload(); window.dispatchEvent(new Event('tal:counts')); })
      .catch((e) => toast(e.message, 'error')).finally(() => setBusy(false));
    if (type === 'in' && navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => send({ lat: p.coords.latitude, lng: p.coords.longitude }), () => send({}), { timeout: 4000 });
    else send({});
  };
  return (
    <div className="card clock-card" style={{ padding: 24 }}>
      <div className="row between wrap" style={{ gap: 20 }}>
        <div>
          <div className="small" style={{ color: 'var(--tal-200)' }}>{date(new Date())}{data.shift && ` · ${data.shift.shift_name} (${data.shift.start_time.slice(0, 5)} – ${data.shift.end_time.slice(0, 5)})`}</div>
          <LiveClock />
        </div>
        <div className="row" style={{ gap: 28 }}>
          <div><div className="tiny" style={{ color: 'var(--tal-200)' }}>الحضور</div><div style={{ fontSize: 20, fontWeight: 600 }} className="num">{r && r.check_in ? time(r.check_in) : '--:--'}</div></div>
          <div><div className="tiny" style={{ color: 'var(--tal-200)' }}>الانصراف</div><div style={{ fontSize: 20, fontWeight: 600 }} className="num">{r && r.check_out ? time(r.check_out) : '--:--'}</div></div>
          {r && r.late_minutes > 0 && <div><div className="tiny" style={{ color: 'var(--tal-200)' }}>التأخير</div><div style={{ fontSize: 20, fontWeight: 600, color: '#F5C36B' }} className="num">{r.late_minutes} د</div></div>}
        </div>
        <div>
          {!r || !r.check_in ? <button className="btn" style={{ height: 44, paddingInline: 22 }} disabled={busy} onClick={() => act('in')}><LogIn />تسجيل الحضور</button>
            : !r.check_out ? <button className="btn" style={{ height: 44, paddingInline: 22 }} disabled={busy} onClick={() => act('out')}><LogOut />تسجيل الانصراف</button>
              : <Badge tone="green">تم تسجيل اليوم بالكامل</Badge>}
        </div>
      </div>
      <div className="tiny row" style={{ gap: 14, marginTop: 16, color: 'var(--tal-200)' }}>
        <span className="row" style={{ gap: 5 }}><MapPin size={13} />يُرفق الموقع الجغرافي عند السماح من المتصفح</span>
        <span className="row" style={{ gap: 5 }}><Fingerprint size={13} />جاهز للربط بأجهزة البصمة (المصدر: biometric)</span>
      </div>
    </div>
  );
}

function Monthly() {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const { data } = useAsync(() => api.get(`/attendance/monthly?month=${month}`), [month]);
  return (
    <Card title="تقرير الحضور الشهري" icon={BarChart3} flush actions={<input type="month" className="input" style={{ height: 32, width: 160 }} value={month} onChange={(e) => setMonth(e.target.value)} />}>
      {!data ? <Spinner /> : data.rows.length === 0 ? <Empty /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>الموظف</th><th>الإدارة</th><th>حضور</th><th>تأخير</th><th>غياب</th><th>إجازة</th><th>دقائق التأخير</th><th>ساعات العمل</th></tr></thead>
          <tbody>{data.rows.map((r) => (
            <tr key={r.id}><td><b style={{ fontWeight: 500 }}>{r.full_name}</b><div className="tiny muted ltr">{r.emp_no}</div></td><td>{r.department}</td>
              <td className="num">{r.present}</td><td className="num">{r.late ? <Badge tone="amber" plain>{r.late}</Badge> : 0}</td><td className="num">{r.absent ? <Badge tone="red" plain>{r.absent}</Badge> : 0}</td>
              <td className="num">{r.leave}</td><td className="num">{r.late_minutes}</td><td className="num">{r.hours}</td></tr>))}</tbody>
        </table></div>)}
    </Card>
  );
}

export default function Attendance() {
  const [sp, setSp] = useSearchParams(); const { can, user } = useAuth();
  const tab = sp.get('tab') || (can('attendance.self') ? 'me' : 'log');
  return (
    <>
      <PageHead crumb="الحضور والانصراف" title="الحضور والانصراف والإجازات" />
      <Tabs value={tab} onChange={(t) => setSp({ tab: t })} tabs={[
        can('attendance.self') && { key: 'me', label: 'يومي', icon: Clock },
        { key: 'log', label: can('attendance.view_all') ? 'سجل الحضور اليومي' : 'سجل حضوري', icon: CalendarRange },
        { key: 'leaves', label: 'الإجازات', icon: Palmtree },
        can('attendance.view_all') && { key: 'monthly', label: 'التقرير الشهري', icon: BarChart3 },
        { key: 'shifts', label: 'الورديات', icon: Timer },
      ]} />
      {tab === 'me' && <div className="stack"><MyDay /><ResourceView resource="attendance" title="سجلي خلال الفترة الأخيرة" canCreate={false} fixed={{ employee_id: user.employee_id || -1 }} columns={['work_date', 'check_in', 'check_out', 'status', 'late_minutes', 'source']} pageSize={10} /></div>}
      {tab === 'log' && <ResourceView resource="attendance" createLabel="إدخال يدوي" initialFilters={can('attendance.view_all') ? { work_date: todayISO() } : {}} columns={['employee_id', 'work_date', 'check_in', 'check_out', 'status', 'late_minutes', 'source']} />}
      {tab === 'leaves' && <ResourceView resource="leave_requests" createLabel="طلب إجازة" />}
      {tab === 'monthly' && <Monthly />}
      {tab === 'shifts' && <ResourceView resource="shifts" createLabel="وردية جديدة" />}
    </>
  );
}
