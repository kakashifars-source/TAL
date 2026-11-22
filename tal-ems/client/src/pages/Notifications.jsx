import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ListChecks, Palmtree, Gavel, Building2, Wallet, CalendarClock, Megaphone, ShieldAlert, MessageSquare, ShoppingCart, Boxes } from 'lucide-react';
import { api } from '../lib/api';
import { PageHead, Card, Empty, Spinner, useAsync } from '../components/ui';
import { ago } from '../lib/format';

const TYPES = { task: ['المهام', ListChecks], leave: ['الإجازات', Palmtree], approval: ['الاعتمادات', Gavel], project: ['المشاريع', Building2], finance: ['المالية', Wallet], meeting: ['الاجتماعات', CalendarClock],
  circular: ['التعاميم', Megaphone], security: ['الأمان', ShieldAlert], message: ['المراسلات', MessageSquare], purchase: ['المشتريات', ShoppingCart], inventory: ['المخزون', Boxes], hr: ['الموارد البشرية', Bell] };

export default function Notifications() {
  const nav = useNavigate();
  const [type, setType] = useState(''); const [unread, setUnread] = useState(false);
  const { data, reload } = useAsync(() => api.get(`/notifications?limit=200${type ? `&type=${type}` : ''}${unread ? '&unread=1' : ''}`), [type, unread]);
  const openN = async (n) => { if (!n.read_at) await api.post(`/notifications/${n.id}/read`); window.dispatchEvent(new Event('tal:counts')); if (n.link) nav(n.link); else reload(); };
  const readAll = async () => { await api.post('/notifications/read-all'); window.dispatchEvent(new Event('tal:counts')); reload(); };
  return (
    <>
      <PageHead crumb="الإشعارات" title="مركز الإشعارات" desc={data ? `${data.unread} إشعار غير مقروء` : ''}><button className="btn" onClick={readAll}><CheckCheck />تحديد الكل كمقروء</button></PageHead>
      <Card flush>
        <div className="toolbar">
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}><option value="">جميع الأنواع</option>{Object.entries(TYPES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
          <label className="check"><input type="checkbox" checked={unread} onChange={(e) => setUnread(e.target.checked)} />غير المقروءة فقط</label>
        </div>
        {!data ? <Spinner /> : data.rows.length === 0 ? <Empty icon={Bell}>لا توجد إشعارات</Empty> : (
          <div className="list">{data.rows.map((n) => { const [label, Icon] = TYPES[n.type] || ['عام', Bell]; return (
            <button key={n.id} className="list-item" style={{ border: 0, borderBottom: '1px solid var(--line-2)', background: n.read_at ? '#fff' : 'var(--tal-50)', cursor: 'pointer', textAlign: 'right', width: '100%' }} onClick={() => openN(n)}>
              <span className="li-ico"><Icon /></span>
              <div className="grow"><div className="title" style={{ fontWeight: n.read_at ? 400 : 600 }}>{n.title}</div>{n.body && <div className="meta">{n.body}</div>}</div>
              <div style={{ textAlign: 'left' }}><div className="tiny muted">{ago(n.created_at)}</div><div className="tiny" style={{ color: 'var(--tal-500)' }}>{label}</div></div>
            </button>); })}</div>)}
      </Card>
    </>
  );
}
