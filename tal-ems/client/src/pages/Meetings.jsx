import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Gavel, Megaphone } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { PageHead, Tabs, Empty, Badge } from '../components/ui';
import ResourceView from '../components/ResourceView';
import { date } from '../lib/format';

export default function Meetings() {
  const [sp, setSp] = useSearchParams(); const tab = sp.get('tab') || 'meetings';
  const { meta } = useAuth();
  const circularCards = ({ rows, open }) => rows.length === 0 ? <Empty>لا توجد تعاميم</Empty> : (
    <div className="stack" style={{ padding: 16, gap: 12 }}>
      {rows.map((c) => (
        <article key={c.id} className="card" style={{ padding: '16px 18px', cursor: 'pointer', borderInlineStart: '3px solid var(--tal-500)' }} onClick={() => open(c)}>
          <div className="row between wrap"><h3 style={{ margin: 0, fontSize: 15, color: 'var(--tal-900)' }}>{c.title}</h3><span className="tiny muted"><span className="ltr">{c.number}</span> · {date(c.issue_date)}</span></div>
          <p className="small" style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', color: 'var(--ink-2)' }}>{c.body}</p>
          <div className="mt" style={{ marginTop: 10 }}><Badge tone="blue" plain>{(meta.circulars.fields.find((f) => f.name === 'audience').options.find((o) => o.value === c.audience) || {}).label}</Badge></div>
        </article>))}
    </div>
  );
  return (
    <>
      <PageHead crumb="الاجتماعات والقرارات" title="الاجتماعات والقرارات الإدارية" desc="جدولة الاجتماعات، المحاضر، القرارات ومتابعة تنفيذها، والتعاميم الرسمية" />
      <Tabs value={tab} onChange={(t) => setSp({ tab: t })} tabs={[{ key: 'meetings', label: 'الاجتماعات', icon: CalendarClock }, { key: 'decisions', label: 'القرارات', icon: Gavel }, { key: 'circulars', label: 'التعاميم', icon: Megaphone }]} />
      {tab === 'meetings' && <ResourceView resource="meetings" createLabel="جدولة اجتماع" columns={['title', 'starts_at', 'location', 'project_id', 'status']}
        drawerExtra={(row) => <div><div className="bold" style={{ marginBottom: 8 }}>الحضور</div><ResourceView resource="meeting_attendees" fixed={{ meeting_id: row.id }} createLabel="دعوة" columns={['employee_id', 'attendance']} /></div>} />}
      {tab === 'decisions' && <ResourceView resource="decisions" createLabel="قرار جديد" columns={['number', 'title', 'level', 'responsible_id', 'due_date', 'status']} />}
      {tab === 'circulars' && <ResourceView resource="circulars" createLabel="إصدار تعميم" renderView={circularCards} />}
    </>
  );
}
