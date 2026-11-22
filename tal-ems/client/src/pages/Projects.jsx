import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Table2, MapPin, User, CalendarDays } from 'lucide-react';
import { PageHead, Progress, OptionBadge, Empty } from '../components/ui';
import ResourceView from '../components/ResourceView';
import { useAuth } from '../lib/auth';
import { money, date } from '../lib/format';

export default function Projects() {
  const [view, setView] = useState('cards');
  const nav = useNavigate();
  const { meta, can } = useAuth();
  const statusOpts = meta.projects.fields.find((f) => f.name === 'status').options;
  const showMoney = can('projects.budget');

  const cards = ({ rows }) => rows.length === 0 ? <Empty>لا توجد مشاريع</Empty> : (
    <div className="proj-grid" style={{ padding: 16 }}>
      {rows.map((p) => (
        <div key={p.id} className="card proj-card" onClick={() => nav(`/projects/${p.id}`)}>
          <div className="cover" style={{ backgroundImage: p.image_url ? `url(${p.image_url})` : undefined }}>
            <OptionBadge options={statusOpts} value={p.status} /><span className="code">{p.code}</span>
          </div>
          <div className="body">
            <h4>{p.name}{p.is_demo && <span className="badge demo plain" style={{ marginInlineStart: 6, height: 18, fontSize: 10 }}>تجريبي</span>}</h4>
            <div className="stack small muted" style={{ gap: 4 }}>
              <span className="row" style={{ gap: 6 }}><MapPin size={14} />{p.location || '—'}</span>
              <span className="row" style={{ gap: 6 }}><User size={14} />{p.manager_id__label || 'لم يحدد مدير'}</span>
              <span className="row" style={{ gap: 6 }}><CalendarDays size={14} /><span className="num">{date(p.start_date)} ← {date(p.end_date)}</span></span>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <Progress value={p.progress} showLabel />
              {showMoney && p.contract_value != null && <div className="row between tiny muted" style={{ marginTop: 8 }}><span>قيمة العقد</span><b className="num" style={{ color: 'var(--ink)' }}>{money(p.contract_value, { compact: true })}</b></div>}
            </div>
          </div>
        </div>))}
    </div>
  );

  return (
    <>
      <PageHead crumb="المشاريع" title="إدارة المشاريع" desc={can('projects.view_all') ? 'جميع مشاريع الشركة' : 'المشاريع المسندة إليك'}>
        <div className="row" style={{ gap: 4, background: '#fff', border: '1px solid var(--line)', borderRadius: 9, padding: 3 }}>
          <button className={`btn sm ${view === 'cards' ? 'primary' : 'ghost'}`} onClick={() => setView('cards')}><LayoutGrid />بطاقات</button>
          <button className={`btn sm ${view === 'table' ? 'primary' : 'ghost'}`} onClick={() => setView('table')}><Table2 />جدول</button>
        </div>
      </PageHead>
      <ResourceView resource="projects" createLabel="مشروع جديد" pageSize={view === 'cards' ? 24 : 25} onRowClick={(r) => nav(`/projects/${r.id}`)}
        renderView={view === 'cards' ? cards : undefined} columns={['code', 'name', 'client_id', 'manager_id', 'end_date', ...(showMoney ? ['contract_value'] : []), 'status', 'progress']} />
    </>
  );
}
