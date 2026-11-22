import { useState } from 'react';
import { ScrollText, Download, ShieldCheck, ChevronRight, ChevronLeft } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useOptions } from '../components/fields';
import { PageHead, Card, Spinner, Empty, useAsync, Badge, Modal } from '../components/ui';
import { dateTime } from '../lib/format';

const ACT = { create: ['إضافة', 'green'], update: ['تعديل', 'blue'], delete: ['حذف', 'red'], login: ['دخول', 'gray'], logout: ['خروج', 'gray'], permissions_change: ['تغيير صلاحيات', 'red'],
  user_create: ['إنشاء حساب', 'amber'], user_update: ['تعديل حساب', 'amber'], export: ['تصدير', 'teal'], check_in: ['حضور', 'gray'], check_out: ['انصراف', 'gray'], account_locked: ['قفل حساب', 'red'], settings_update: ['إعدادات', 'amber'], backup: ['نسخ احتياطي', 'teal'], demo_clear: ['حذف تجريبي', 'red'], role_create: ['منصب جديد', 'amber'], role_update: ['تعديل منصب', 'amber'], role_delete: ['حذف منصب', 'red'] };
const actBadge = (a) => { if (a.startsWith('approve:')) return <Badge tone="green">اعتماد / قرار</Badge>; const [l, t] = ACT[a] || [a, 'gray']; return <Badge tone={t}>{l}</Badge>; };

export default function Audit() {
  const users = useOptions('users');
  const [f, setF] = useState({ q: '', user_id: '', entity: '', action: '', from: '', to: '' }); const [page, setPage] = useState(1); const [detail, setDetail] = useState(null);
  const { data } = useAsync(() => api.get(`/audit${qs({ ...f, page, pageSize: 50 })}`), [JSON.stringify(f), page]);
  const set = (k) => (e) => { setPage(1); setF((s) => ({ ...s, [k]: e.target.value })); };
  return (
    <>
      <PageHead crumb="سجل العمليات" title="سجل العمليات والمراقبة" desc="سجل غير قابل للتعديل أو الحذف لجميع العمليات الحساسة — محمي على مستوى قاعدة البيانات">
        <button className="btn" onClick={() => api.download(`/audit/export${qs(f)}`, 'tal-audit-log.xlsx')}><Download />تصدير Excel</button>
      </PageHead>
      <div className="info-box row" style={{ marginBottom: 16, gap: 8 }}><ShieldCheck size={18} />يمنع النظام تعديل أو حذف أي سجل عملية، بما في ذلك المحاولات المباشرة على قاعدة البيانات. الأرشفة متاحة للمالك فقط للسجلات الأقدم من سنة، وتُسجّل بدورها.</div>
      <Card flush>
        <div className="toolbar">
          <input className="input" style={{ width: 220, height: 34 }} placeholder="بحث في الوصف أو المستخدم" value={f.q} onChange={set('q')} />
          <select className="select" value={f.user_id} onChange={set('user_id')}><option value="">كل المستخدمين</option>{users.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select>
          <select className="select" value={f.entity} onChange={set('entity')}><option value="">كل الأقسام</option>{data && data.entities.map((e) => <option key={e} value={e}>{e}</option>)}</select>
          <select className="select" value={f.action} onChange={set('action')}><option value="">كل العمليات</option><option value="create">إضافة</option><option value="update">تعديل</option><option value="delete">حذف</option><option value="approve">اعتمادات</option><option value="permissions_change">تغيير الصلاحيات</option><option value="login">دخول</option><option value="export">تصدير</option></select>
          <input type="date" className="input" style={{ width: 150, height: 34 }} value={f.from} onChange={set('from')} title="من" />
          <input type="date" className="input" style={{ width: 150, height: 34 }} value={f.to} onChange={set('to')} title="إلى" />
        </div>
        {!data ? <Spinner /> : data.rows.length === 0 ? <Empty icon={ScrollText}>لا توجد سجلات</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>#</th><th>التاريخ والوقت</th><th>المستخدم</th><th>العملية</th><th>القسم</th><th>الوصف</th><th>IP</th></tr></thead>
            <tbody>{data.rows.map((r) => (
              <tr key={r.id} className="click" onClick={() => setDetail(r)}><td className="num muted">{r.id}</td><td className="num" style={{ whiteSpace: 'nowrap' }}>{dateTime(r.created_at)}</td>
                <td><div>{r.user_name}</div><div className="tiny muted">{r.role_name}</div></td><td>{actBadge(r.action)}</td><td className="tiny ltr">{r.entity}{r.entity_id ? ` #${r.entity_id}` : ''}</td>
                <td className="truncate" style={{ maxWidth: 420 }}>{r.summary}</td><td className="tiny muted ltr">{r.ip}</td></tr>))}</tbody>
          </table></div>)}
        {data && data.total > 50 && <div className="pager"><span className="num">{data.total} سجل</span><div className="row" style={{ gap: 4 }}>
          <button className="btn xs" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronRight size={14} /></button><span className="num">{page}</span>
          <button className="btn xs" disabled={page * 50 >= data.total} onClick={() => setPage(page + 1)}><ChevronLeft size={14} /></button></div></div>}
      </Card>
      {detail && <Modal title={`تفاصيل العملية #${detail.id}`} onClose={() => setDetail(null)}>
        <dl className="kv"><dt>الوقت</dt><dd className="num">{dateTime(detail.created_at)}</dd><dt>المستخدم</dt><dd>{detail.user_name} — {detail.role_name}</dd><dt>العملية</dt><dd>{actBadge(detail.action)}</dd><dt>الوصف</dt><dd>{detail.summary}</dd><dt>IP</dt><dd className="ltr">{detail.ip}</dd></dl>
        {detail.details && <pre style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, fontSize: 12, direction: 'ltr', textAlign: 'left', overflow: 'auto', maxHeight: 300 }}>{JSON.stringify(detail.details, null, 2)}</pre>}
      </Modal>}
    </>
  );
}
