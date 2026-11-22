import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Users, Briefcase, Clock, ListChecks, Wallet, ShoppingCart, Warehouse, FileBarChart, FolderArchive,
  Landmark, MessagesSquare, Bell, ScrollText, Settings, Search, Menu, LogOut, UserCircle2, KeyRound, FlaskConical,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Avatar } from './ui';

export const NAV = [
  { to: '/', label: 'الرئيسية', icon: LayoutDashboard, perm: ['dashboard.view'], end: true },
  { to: '/projects', label: 'المشاريع', icon: Building2, perm: ['projects.view', 'projects.view_all'] },
  { to: '/employees', label: 'الموظفون', icon: Users, perm: ['employees.view'] },
  { to: '/hr', label: 'الموارد البشرية', icon: Briefcase, perm: ['hr.view', 'leaves.approve'] },
  { to: '/attendance', label: 'الحضور والانصراف', icon: Clock, perm: ['attendance.self', 'attendance.view_all'] },
  { to: '/tasks', label: 'المهام والتكليفات', icon: ListChecks, perm: null },
  { to: '/finance', label: 'الإدارة المالية', icon: Wallet, perm: ['finance.view', 'finance.request'] },
  { to: '/purchasing', label: 'المشتريات', icon: ShoppingCart, perm: ['purchasing.view'] },
  { to: '/inventory', label: 'المستودعات والمعدات', icon: Warehouse, perm: ['inventory.view'] },
  { to: '/reports', label: 'التقارير', icon: FileBarChart, perm: ['reports.view'] },
  { to: '/documents', label: 'المستندات والأرشيف', icon: FolderArchive, perm: ['documents.view'] },
  { to: '/meetings', label: 'الاجتماعات والقرارات', icon: Landmark, perm: ['meetings.view'] },
  { to: '/messages', label: 'المراسلات', icon: MessagesSquare, perm: ['messages.use'], badge: 'messages' },
  { to: '/notifications', label: 'الإشعارات', icon: Bell, perm: ['notifications.view'], badge: 'notifications' },
  { to: '/audit', label: 'سجل العمليات', icon: ScrollText, perm: ['audit.view'] },
  { to: '/settings', label: 'الإعدادات', icon: Settings, perm: ['settings.manage', 'users.manage', 'roles.manage'] },
];

function GlobalSearch() {
  const [q, setQ] = useState(''); const [res, setRes] = useState([]); const [open, setOpen] = useState(false);
  const nav = useNavigate(); const box = useRef();
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return; }
    const t = setTimeout(() => api.get(`/search?q=${encodeURIComponent(q)}`).then(setRes).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { const h = (e) => box.current && !box.current.contains(e.target) && setOpen(false); document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  return (
    <div className="search" ref={box}>
      <Search />
      <input placeholder="بحث في المشاريع، الموظفين، المهام، المستندات..." value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} aria-label="بحث شامل" />
      {open && q.length >= 2 && (
        <div className="search-results">
          {res.length === 0 ? <div className="small muted" style={{ padding: 12 }}>لا توجد نتائج</div> : res.map((r) => (
            <a key={`${r.type}-${r.id}`} href={r.link} onClick={(e) => { e.preventDefault(); setOpen(false); setQ(''); nav(r.link); }}>
              <span>{r.label}</span><span className="tiny muted">{r.typeLabel}</span>
            </a>))}
        </div>)}
    </div>
  );
}

export default function Layout() {
  const { user, can, logout, demoData, company } = useAuth();
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 });
  const [menu, setMenu] = useState(false); const [side, setSide] = useState(false);
  const loc = useLocation(); const nav = useNavigate();

  useEffect(() => { setSide(false); setMenu(false); }, [loc.pathname]);
  useEffect(() => {
    const poll = () => {
      api.get('/notifications?limit=1').then((d) => setCounts((c) => ({ ...c, notifications: d.unread }))).catch(() => {});
      if (can('messages.use')) api.get('/messages-unread').then((d) => setCounts((c) => ({ ...c, messages: d.unread }))).catch(() => {});
    };
    poll(); const t = setInterval(poll, 45000);
    window.addEventListener('tal:counts', poll);
    return () => { clearInterval(t); window.removeEventListener('tal:counts', poll); };
  }, [loc.pathname]); // eslint-disable-line

  const items = NAV.filter((n) => !n.perm || can(...n.perm));
  return (
    <div className="shell">
      <aside className={`sidebar ${side ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-plate"><img src="/tal-logo.png" alt="TAL Construction Company" /></div>
          <div className="brand-sub"><span>نظام الإدارة المتكامل</span><span className="ltr">EMS</span></div>
        </div>
        <nav className="nav" aria-label="القائمة الرئيسية">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}><n.icon /><span>{n.label}</span>{n.badge && counts[n.badge] > 0 && <span className="count">{counts[n.badge]}</span>}</NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">{company.name_ar || 'شركة تال الإنشائية للمقاولات'}<br /><span className="ltr">© {new Date().getFullYear()} TAL Construction</span></div>
      </aside>
      {side && <div className="drawer-overlay" style={{ zIndex: 79 }} onClick={() => setSide(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setSide(true)} aria-label="القائمة"><Menu /></button>
          <GlobalSearch />
          <div className="top-actions">
            {can('messages.use') && <button className="icon-btn" onClick={() => nav('/messages')} aria-label="المراسلات"><MessagesSquare />{counts.messages > 0 && <span className="dot">{counts.messages}</span>}</button>}
            <button className="icon-btn" onClick={() => nav('/notifications')} aria-label="الإشعارات"><Bell />{counts.notifications > 0 && <span className="dot">{counts.notifications > 99 ? '99+' : counts.notifications}</span>}</button>
            <button className="user-chip" onClick={() => setMenu((m) => !m)}>
              <Avatar name={user.display_name} src={user.photo_url} />
              <div className="who"><b>{user.display_name}</b><span>{user.role_name}</span></div>
            </button>
            {menu && (
              <div className="dropdown" onMouseLeave={() => setMenu(false)}>
                <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--line-2)', marginBottom: 4 }}>
                  <div className="bold">{user.display_name}</div><div className="tiny muted">{user.email}</div>
                </div>
                {user.employee_id && <Link to="/profile"><UserCircle2 />ملفي الوظيفي</Link>}
                <Link to="/account"><KeyRound />الحساب والأمان</Link>
                <button onClick={logout}><LogOut />تسجيل الخروج</button>
              </div>)}
          </div>
        </header>
        {demoData && <div className="demo-banner"><FlaskConical />النظام يعمل حالياً ببيانات تجريبية لأغراض الاختبار — ليست بيانات حقيقية للشركة.{user.isOwner && <Link to="/settings?tab=demo" style={{ color: '#7A5410', textDecoration: 'underline', marginInlineStart: 6 }}>إدارة البيانات التجريبية</Link>}</div>}
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
