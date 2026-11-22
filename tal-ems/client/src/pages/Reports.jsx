import { useState } from 'react';
import { FileBarChart, FileSpreadsheet, FileDown, Play, Building2, Users, Wallet, Boxes } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { useOptions } from '../components/fields';
import { PageHead, Card, Spinner, Empty, useAsync } from '../components/ui';
import { money, num, pct, date, dateTime, todayISO } from '../lib/format';

const GROUP_ICON = { 'المشاريع': Building2, 'الموارد البشرية': Users, 'المالية': Wallet, 'المستودعات': Boxes };
const cell = (c, v) => (c.kind === 'money' ? money(v) : c.kind === 'percent' ? pct(v) : c.kind === 'number' ? num(v, 1) : c.kind === 'date' ? date(v) : v ?? '—');

export default function Reports() {
  const { can, company, user } = useAuth(); const toast = useToast();
  const { data: types } = useAsync(() => api.get('/reports'), []);
  const projects = useOptions('projects');
  const [type, setType] = useState(null);
  const [params, setParams] = useState({ from: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), to: todayISO(), project_id: '' });
  const [rep, setRep] = useState(null); const [busy, setBusy] = useState(false);

  const run = async (t = type) => { if (!t) return; setBusy(true); try { setRep(await api.get(`/reports/${t}${qs(params)}`)); } catch (e) { toast(e.message, 'error'); } setBusy(false); };
  const choose = (t) => { setType(t); setRep(null); setTimeout(() => run(t), 0); };
  const pdf = async () => { await api.post(`/reports/${type}/pdf-log`).catch(() => {}); window.print(); };
  if (!types) return <Spinner />;
  const groups = [...new Set(types.map((t) => t.group))];
  const def = types.find((t) => t.key === type);

  return (
    <>
      <PageHead crumb="التقارير" title="التقارير الإدارية والهندسية" desc="تقارير المشاريع والإنجاز والتأخير والموظفين والمالية والمواد — مع التصدير إلى PDF وExcel بشعار الشركة" />
      <div className="grid no-print" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', marginBottom: 18 }}>
        {groups.map((g) => { const Icon = GROUP_ICON[g] || FileBarChart; return (
          <Card key={g} title={g} icon={Icon} flush>
            <div className="list">{types.filter((t) => t.group === g).map((t) => (
              <button key={t.key} className="list-item" onClick={() => choose(t.key)} style={{ border: 0, borderBottom: '1px solid var(--line-2)', width: '100%', textAlign: 'right', cursor: 'pointer', background: type === t.key ? 'var(--tal-50)' : '#fff', fontWeight: type === t.key ? 600 : 400, color: type === t.key ? 'var(--tal-700)' : 'var(--ink)' }}>
                <FileBarChart size={15} color="var(--tal-500)" /><span className="grow">{t.title}</span></button>))}</div>
          </Card>); })}
      </div>

      {type && (
        <div className="card report-sheet">
          <div className="toolbar no-print">
            <b style={{ color: 'var(--tal-900)' }}>{def && def.title}</b>
            {(def && (def.usesRange || def.period)) && <>
              {!def.period && <><span className="small muted">من</span><input type="date" className="input" style={{ width: 150, height: 34 }} value={params.from} onChange={(e) => setParams({ ...params, from: e.target.value })} /></>}
              <span className="small muted">{def.period ? 'حتى تاريخ' : 'إلى'}</span><input type="date" className="input" style={{ width: 150, height: 34 }} value={params.to} onChange={(e) => setParams({ ...params, to: e.target.value })} /></>}
            {!['employees', 'materials'].includes(type) && <select className="select" value={params.project_id} onChange={(e) => setParams({ ...params, project_id: e.target.value })}><option value="">كل المشاريع</option>{projects.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>}
            <button className="btn sm primary" onClick={() => run()} disabled={busy}><Play />{busy ? '...' : 'عرض'}</button>
            {can('reports.export') && rep && <div className="row" style={{ marginInlineStart: 'auto', gap: 6 }}>
              <button className="btn sm" onClick={pdf}><FileDown />PDF</button>
              <button className="btn sm" onClick={() => api.download(`/reports/${type}/xlsx${qs(params)}`, `tal-${type}.xlsx`).catch((e) => toast(e.message, 'error'))}><FileSpreadsheet />Excel</button>
            </div>}
          </div>
          {busy && <Spinner />}
          {rep && !busy && (
            <div style={{ padding: 18 }}>
              <div className="row between" style={{ borderBottom: '2px solid var(--tal-500)', paddingBottom: 12, marginBottom: 16 }}>
                <div>
                  <div className="print-only tiny muted">{company.name_ar || 'شركة تال الإنشائية للمقاولات'}</div>
                  <h2 style={{ margin: 0, fontSize: 19, color: 'var(--tal-900)' }}>{rep.title}</h2>
                  <div className="small muted">{rep.from && <>الفترة: <span className="num">{date(rep.from)} — {date(rep.to)}</span> · </>}تاريخ الإصدار: <span className="num">{dateTime(rep.generated_at)}</span> · أعدّه: {rep.generated_by}</div>
                </div>
                <img src="/tal-logo.png" alt="TAL" style={{ height: 46 }} />
              </div>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(4, rep.summary.length)}, 1fr)`, marginBottom: 16, gap: 10 }}>
                {rep.summary.map((s) => <div key={s.label} style={{ background: 'var(--tal-50)', border: '1px solid var(--tal-100)', borderRadius: 8, padding: '10px 12px' }}><div className="tiny muted">{s.label}</div><div className="bold num" style={{ fontSize: 16, color: 'var(--tal-900)' }}>{cell({ kind: s.kind }, s.value)}</div></div>)}
              </div>
              {rep.rows.length === 0 ? <Empty>لا توجد بيانات للفترة المحددة</Empty> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr>{rep.columns.map((c) => <th key={c.key} className={c.kind === 'money' ? 'money' : ''}>{c.label}</th>)}</tr></thead>
                  <tbody>{rep.rows.map((r, i) => <tr key={i}>{rep.columns.map((c) => <td key={c.key} className={['money', 'number', 'percent'].includes(c.kind) ? 'num' : ''} style={c.key === 'variance' || c.key === 'gap' ? { color: (c.key === 'variance' ? r[c.key] < -5 : r[c.key] > 5) ? 'var(--red)' : undefined } : undefined}>{cell(c, r[c.key])}</td>)}</tr>)}</tbody>
                </table></div>)}
              <div className="print-only tiny muted" style={{ marginTop: 16, borderTop: '1px solid #ddd', paddingTop: 8 }}>وثيقة داخلية — {company.name_en || 'TAL Construction Company'} — طُبعت بواسطة {user.display_name}</div>
            </div>)}
        </div>)}
      {!type && <div className="card"><Empty icon={FileBarChart}>اختر تقريراً من القائمة أعلاه</Empty></div>}
    </>
  );
}
