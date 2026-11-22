import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building, Network, ShieldCheck, Users, Lock, Bell, Cog, Coins, FileBarChart, DatabaseBackup, ScrollText, FlaskConical, Plus, KeyRound, Power, LogOut, Unlock, Save, Trash2, Download, Copy } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { PageHead, Tabs, Card, Spinner, Empty, Modal, Badge, Confirm, useAsync } from '../components/ui';
import ResourceView from '../components/ResourceView';
import { useOptions, clearOptions } from '../components/fields';
import { dateTime, ago } from '../lib/format';

const MOD_LABEL = { dashboard: 'لوحة التحكم', projects: 'المشاريع', employees: 'الموظفون', hr: 'الموارد البشرية', attendance: 'الحضور والإجازات', tasks: 'المهام', finance: 'المالية', purchasing: 'المشتريات', inventory: 'المستودعات', reports: 'التقارير', documents: 'المستندات', meetings: 'الاجتماعات والقرارات', messages: 'المراسلات', notifications: 'الإشعارات', audit: 'سجل العمليات', settings: 'الإعدادات' };

function SettingForm({ k, fields, title, icon }) {
  const toast = useToast(); const { reload: reloadAuth } = useAuth();
  const { data } = useAsync(() => api.get('/settings'), []);
  const [v, setV] = useState(null);
  useEffect(() => { if (data) setV(data[k] || {}); }, [data, k]);
  if (!v) return <Spinner />;
  const save = async () => { try { await api.put(`/settings/${k}`, v); toast('تم حفظ الإعدادات'); reloadAuth(); } catch (e) { toast(e.message, 'error'); } };
  return (
    <Card title={title} icon={icon} actions={<button className="btn sm primary" onClick={save}><Save />حفظ</button>}>
      <div className="form-grid">
        {fields.map(([name, label, type = 'text', opts]) => (
          <div key={name} className={`field ${type === 'textarea' ? 'full' : ''}`}>
            {type === 'bool' ? <label className="check" style={{ marginTop: 22 }}><input type="checkbox" checked={!!v[name]} onChange={(e) => setV({ ...v, [name]: e.target.checked })} />{label}</label> : <>
              <label>{label}</label>
              {type === 'select' ? <select className="select" value={v[name] ?? ''} onChange={(e) => setV({ ...v, [name]: e.target.value })}>{opts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
                : type === 'textarea' ? <textarea className="textarea" value={v[name] ?? ''} onChange={(e) => setV({ ...v, [name]: e.target.value })} />
                  : <input className="input" type={type} value={v[name] ?? ''} onChange={(e) => setV({ ...v, [name]: type === 'number' ? Number(e.target.value) : e.target.value })} />}</>}
          </div>))}
      </div>
    </Card>
  );
}

function Roles() {
  const toast = useToast(); const { user } = useAuth();
  const { data, reload } = useAsync(async () => ({ roles: await api.get('/roles'), perms: await api.get('/permissions') }), []);
  const [sel, setSel] = useState(null); const [draft, setDraft] = useState(null); const [newRole, setNewRole] = useState(null); const [del, setDel] = useState(null);
  useEffect(() => { if (data && !sel) setSel(data.roles[1]?.id || data.roles[0].id); }, [data]); // eslint-disable-line
  useEffect(() => { if (data && sel) setDraft(new Set(data.roles.find((r) => r.id === sel).permissions)); }, [sel, data]);
  if (!data || !draft) return <Spinner />;
  const role = data.roles.find((r) => r.id === sel);
  const locked = role.key === 'owner' || !(user.isOwner || role.level < user.role_level);
  const mods = [...new Set(data.perms.map((p) => p.module))];
  const toggle = (k) => { if (locked) return; const n = new Set(draft); n.has(k) ? n.delete(k) : n.add(k); setDraft(n); };
  const save = async () => { try { await api.put(`/roles/${role.id}/permissions`, { permissions: [...draft] }); toast('تم حفظ الصلاحيات وتسجيل التغيير في سجل العمليات'); reload(); } catch (e) { toast(e.message, 'error'); } };
  const createRole = async () => { try { const r = await api.post('/roles', newRole); setNewRole(null); await reload(); setSel(r.id); toast('تم إنشاء المنصب'); } catch (e) { toast(e.message, 'error'); } };
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(240px, 300px) 1fr', alignItems: 'start' }}>
      <Card title="المناصب" icon={Network} flush actions={<button className="btn xs" onClick={() => setNewRole({ name: '', level: 30, description: '' })}><Plus size={13} />منصب</button>}>
        <div className="list">{data.roles.map((r) => (
          <button key={r.id} className="list-item" onClick={() => setSel(r.id)} style={{ border: 0, borderBottom: '1px solid var(--line-2)', width: '100%', textAlign: 'right', cursor: 'pointer', background: sel === r.id ? 'var(--tal-50)' : '#fff' }}>
            <div className="grow"><div className="title" style={{ color: sel === r.id ? 'var(--tal-700)' : undefined }}>{r.name}</div><div className="meta">المستوى {r.level} · {r.users} مستخدم</div></div>
            {r.is_system && <Badge tone="gray" plain>أساسي</Badge>}
          </button>))}</div>
      </Card>
      <Card title={`صلاحيات: ${role.name}`} icon={ShieldCheck} sub={role.description} flush
        actions={<>{!locked && <button className="btn sm primary" onClick={save}><Save />حفظ الصلاحيات</button>}{!role.is_system && !locked && <button className="btn sm red" onClick={() => setDel(role)}><Trash2 /></button>}</>}>
        {role.key === 'owner' && <div className="info-box" style={{ margin: 14 }}>المالك يملك جميع الصلاحيات دائماً ولا يمكن تقييده.</div>}
        {locked && role.key !== 'owner' && <div className="info-box" style={{ margin: 14 }}>لا يمكنك تعديل منصب مساوٍ أو أعلى من منصبك.</div>}
        <div className="table-wrap"><table className="table matrix">
          <tbody>{mods.map((m) => (<Fragment key={m}>
            <tr><td className="mod" colSpan={2}>{MOD_LABEL[m] || m}</td></tr>
            {data.perms.filter((p) => p.module === m).map((p) => (
              <tr key={p.key} onClick={() => toggle(p.key)} style={{ cursor: locked ? 'default' : 'pointer' }}>
                <td>{p.label}<div className="tiny muted" dir="ltr" style={{ textAlign: 'right' }}>{p.key}</div></td>
                <td style={{ width: 80 }}><input type="checkbox" checked={draft.has(p.key)} disabled={locked} readOnly style={{ width: 17, height: 17, accentColor: 'var(--tal-500)' }} /></td>
              </tr>))}</Fragment>))}</tbody>
        </table></div>
      </Card>
      {newRole && <Modal title="منصب جديد" size="sm" onClose={() => setNewRole(null)} footer={<><button className="btn primary" onClick={createRole}>إنشاء</button><button className="btn" onClick={() => setNewRole(null)}>إلغاء</button></>}>
        <div className="stack" style={{ gap: 12 }}>
          <div className="field"><label>اسم المنصب</label><input className="input" value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} placeholder="مثال: مهندس جودة أول" /></div>
          <div className="field"><label>مستوى السلطة (1–99)</label><input className="input" type="number" value={newRole.level} onChange={(e) => setNewRole({ ...newRole, level: Number(e.target.value) })} /><span className="hint">يمكن لكل منصب إدارة المناصب الأقل منه مستوى فقط.</span></div>
          <div className="field"><label>الوصف</label><textarea className="textarea" value={newRole.description} onChange={(e) => setNewRole({ ...newRole, description: e.target.value })} /></div>
        </div></Modal>}
      {del && <Confirm danger title="حذف المنصب" message={`حذف منصب "${del.name}"؟`} confirmLabel="حذف" onConfirm={async () => { await api.del(`/roles/${del.id}`); setSel(null); reload(); }} onClose={() => setDel(null)} />}
    </div>
  );
}

function UsersAdmin() {
  const toast = useToast(); const { user } = useAuth();
  const { data, reload } = useAsync(async () => ({ users: await api.get('/users'), roles: await api.get('/roles') }), []);
  const employees = useOptions('employees');
  const [form, setForm] = useState(null); const [temp, setTemp] = useState(null); const [edit, setEdit] = useState(null);
  if (!data) return <Spinner />;
  const assignable = data.roles.filter((r) => r.assignable && (r.key !== 'owner' || user.isOwner));
  const create = async () => { try { const r = await api.post('/users', form); setForm(null); setTemp({ name: form.display_name || 'المستخدم', pw: r.temporaryPassword }); reload(); clearOptions('users'); } catch (e) { toast(e.message, 'error'); } };
  const update = async (id, body, msg) => { try { await api.put(`/users/${id}`, body); toast(msg || 'تم التحديث'); reload(); setEdit(null); } catch (e) { toast(e.message, 'error'); } };
  const resetPw = async (u) => { try { const r = await api.post(`/users/${u.id}/reset-password`); setTemp({ name: u.display_name, pw: r.temporaryPassword }); } catch (e) { toast(e.message, 'error'); } };
  const revoke = async (u) => { try { const r = await api.post(`/users/${u.id}/revoke-sessions`); toast(`تم إنهاء ${r.revoked} جلسة`); reload(); } catch (e) { toast(e.message, 'error'); } };
  return (
    <Card title="المستخدمون والحسابات" icon={Users} sub="إنشاء الحسابات ومنح المناصب يتم من قبل المالك أو المخولين فقط" flush actions={<button className="btn sm primary" onClick={() => setForm({ display_name: '', email: '', username: '', role_id: assignable[assignable.length - 1]?.id, employee_id: '' })}><Plus />مستخدم جديد</button>}>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>المستخدم</th><th>اسم الدخول</th><th>المنصب</th><th>الموظف المرتبط</th><th>2FA</th><th>آخر دخول</th><th>الجلسات</th><th>الحالة</th><th /></tr></thead>
        <tbody>{data.users.map((u) => {
          const canManage = user.isOwner || u.role_level < user.role_level;
          return (
            <tr key={u.id}>
              <td><b style={{ fontWeight: 500 }}>{u.display_name}</b>{u.is_demo && <span className="badge demo plain" style={{ marginInlineStart: 6, height: 18, fontSize: 10 }}>تجريبي</span>}<div className="tiny muted ltr">{u.email}</div></td>
              <td className="ltr small">{u.username}</td>
              <td><Badge tone={u.role_key === 'owner' ? 'red' : u.role_key === 'ceo' ? 'amber' : 'blue'} plain>{u.role_name}</Badge></td>
              <td className="small">{u.employee_name || '—'}</td>
              <td>{u.totp_enabled ? <Badge tone="green" plain>مفعل</Badge> : <span className="muted tiny">—</span>}</td>
              <td className="small num">{u.last_login_at ? ago(u.last_login_at) : '—'}</td>
              <td className="num">{u.active_sessions}</td>
              <td>{!u.is_active ? <Badge tone="red">موقوف</Badge> : u.locked_until && new Date(u.locked_until) > new Date() ? <Badge tone="amber">مقفل مؤقتاً</Badge> : <Badge tone="green">نشط</Badge>}</td>
              <td>{canManage && u.id !== user.id && <div className="row" style={{ gap: 4 }}>
                <button className="btn xs" onClick={() => setEdit(u)} title="تغيير المنصب"><Network size={13} /></button>
                <button className="btn xs" onClick={() => resetPw(u)} title="إعادة تعيين كلمة المرور"><KeyRound size={13} /></button>
                <button className="btn xs" onClick={() => revoke(u)} title="إنهاء الجلسات"><LogOut size={13} /></button>
                {u.locked_until && new Date(u.locked_until) > new Date() && <button className="btn xs" onClick={() => update(u.id, { unlock: true }, 'تم فك القفل')} title="فك القفل"><Unlock size={13} /></button>}
                <button className={`btn xs ${u.is_active ? 'red' : 'green'}`} onClick={() => update(u.id, { is_active: !u.is_active }, u.is_active ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب')} title={u.is_active ? 'إيقاف' : 'تفعيل'}><Power size={13} /></button>
              </div>}</td>
            </tr>);
        })}</tbody>
      </table></div>
      {form && <Modal title="إنشاء حساب مستخدم" onClose={() => setForm(null)} footer={<><button className="btn primary" onClick={create}>إنشاء الحساب</button><button className="btn" onClick={() => setForm(null)}>إلغاء</button></>}>
        <div className="form-grid">
          <div className="field full"><label>ربط بملف موظف (اختياري)</label><select className="select" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value ? Number(e.target.value) : '' })}><option value="">— بدون —</option>{employees.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <div className="field"><label>الاسم الظاهر</label><input className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="يؤخذ من ملف الموظف إن تُرك فارغاً" /></div>
          <div className="field"><label>المنصب</label><select className="select" value={form.role_id} onChange={(e) => setForm({ ...form, role_id: Number(e.target.value) })}>{assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div className="field"><label>البريد الإلكتروني</label><input className="input ltr" style={{ display: 'block' }} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field"><label>اسم المستخدم</label><input className="input ltr" style={{ display: 'block' }} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="a.alqahtani" /></div>
        </div>
        <div className="info-box mt">سيتم توليد كلمة مرور مؤقتة، ويُلزم المستخدم بتغييرها عند أول دخول.</div>
      </Modal>}
      {edit && <Modal title={`تغيير منصب: ${edit.display_name}`} size="sm" onClose={() => setEdit(null)}>
        <div className="stack" style={{ gap: 8 }}>{assignable.map((r) => <button key={r.id} className={`btn ${r.id === edit.role_id ? 'primary' : ''}`} style={{ justifyContent: 'space-between' }} onClick={() => update(edit.id, { role_id: r.id }, 'تم تغيير المنصب وإنهاء جلسات المستخدم')}>{r.name}<span className="tiny">المستوى {r.level}</span></button>)}</div>
        <div className="tiny muted mt">تغيير المنصب يُسجّل في سجل العمليات ويُنهي جلسات المستخدم الحالية.</div>
      </Modal>}
      {temp && <Modal title="كلمة المرور المؤقتة" size="sm" onClose={() => setTemp(null)} footer={<button className="btn primary" onClick={() => setTemp(null)}>تم</button>}>
        <p style={{ marginTop: 0 }}>سلّم كلمة المرور التالية إلى <b>{temp.name}</b> بشكل آمن. لن تظهر مرة أخرى.</p>
        <div className="row" style={{ background: 'var(--bg)', padding: 12, borderRadius: 8 }}><code className="ltr" style={{ fontSize: 17, flex: 1 }}>{temp.pw}</code><button className="btn sm" onClick={() => { navigator.clipboard.writeText(temp.pw); toast('تم النسخ'); }}><Copy /></button></div>
      </Modal>}
    </Card>
  );
}

function Security() {
  const toast = useToast();
  const { data, reload } = useAsync(async () => ({ attempts: await api.get('/security/login-attempts'), sessions: await api.get('/security/sessions') }), []);
  const [failed, setFailed] = useState(false);
  return (
    <div className="stack">
      <SettingForm k="security" title="سياسات الأمان" icon={Lock} fields={[['require2faForManagement', 'إلزام المصادقة الثنائية لحسابات الإدارة', 'bool'], ['max_failed_attempts', 'عدد المحاولات الخاطئة قبل القفل', 'number'], ['lock_minutes', 'مدة القفل (دقيقة)', 'number'], ['password_min_length', 'الحد الأدنى لطول كلمة المرور', 'number']]} />
      {!data ? <Spinner /> : <>
        <Card title="الجلسات النشطة والأجهزة" icon={ShieldCheck} flush>
          <div className="table-wrap"><table className="table"><thead><tr><th>المستخدم</th><th>الجهاز / المتصفح</th><th>IP</th><th>بدأت</th><th>آخر نشاط</th><th /></tr></thead>
            <tbody>{data.sessions.map((s) => <tr key={s.id}><td>{s.display_name}</td><td className="tiny truncate ltr" style={{ maxWidth: 300 }}>{s.user_agent}</td><td className="tiny ltr">{s.ip}</td><td className="small num">{dateTime(s.created_at)}</td><td className="small">{ago(s.last_seen_at)}</td>
              <td><button className="btn xs red" onClick={async () => { try { await api.del(`/security/sessions/${s.id}`); toast('تم إنهاء الجلسة'); reload(); } catch (e) { toast(e.message, 'error'); } }}>إنهاء</button></td></tr>)}</tbody></table></div>
        </Card>
        <Card title="سجل محاولات الدخول" icon={ScrollText} flush actions={<label className="check small"><input type="checkbox" checked={failed} onChange={(e) => setFailed(e.target.checked)} />الفاشلة فقط</label>}>
          <div className="table-wrap"><table className="table"><thead><tr><th>الوقت</th><th>المعرّف</th><th>المستخدم</th><th>النتيجة</th><th>السبب</th><th>IP</th></tr></thead>
            <tbody>{data.attempts.filter((a) => !failed || !a.success).slice(0, 100).map((a) => <tr key={a.id}><td className="small num">{dateTime(a.created_at)}</td><td className="small ltr">{a.identifier}</td><td className="small">{a.display_name || '—'}</td>
              <td>{a.success ? <Badge tone="green">ناجحة</Badge> : <Badge tone="red">فاشلة</Badge>}</td><td className="tiny muted ltr">{a.reason}</td><td className="tiny ltr">{a.ip}</td></tr>)}</tbody></table></div>
        </Card>
      </>}
    </div>
  );
}

function Backup() {
  const toast = useToast();
  return (
    <div className="stack">
      <Card title="النسخ الاحتياطي" icon={DatabaseBackup}>
        <p style={{ marginTop: 0 }}>تنزيل نسخة كاملة من بيانات النظام بصيغة JSON (جميع الجداول بما فيها سجل العمليات). تُسجَّل عملية التنزيل في سجل العمليات.</p>
        <button className="btn primary" onClick={() => api.download('/settings/backup', `tal-backup-${new Date().toISOString().slice(0, 10)}.json`).then(() => toast('تم تنزيل النسخة الاحتياطية')).catch((e) => toast(e.message, 'error'))}><Download />تنزيل نسخة احتياطية الآن</button>
        <div className="info-box mt">للنسخ الاحتياطي الدوري على مستوى الخادم استخدم الأمر <code className="ltr">npm run backup</code> (pg_dump) وجدولته عبر cron كما هو موضح في دليل التشغيل.</div>
      </Card>
      <ArchiveAudit />
    </div>
  );
}

function ArchiveAudit() {
  const toast = useToast(); const [before, setBefore] = useState(''); const [c, setC] = useState(false);
  return (
    <Card title="إدارة سجل العمليات" icon={ScrollText}>
      <p style={{ marginTop: 0 }}>أرشفة السجلات الأقدم من سنة إلى ملف على الخادم ثم إزالتها من الجدول النشط. هذه العملية متاحة للمالك فقط وتُسجّل بدورها.</p>
      <div className="row"><input type="date" className="input" style={{ width: 180 }} value={before} onChange={(e) => setBefore(e.target.value)} /><button className="btn" disabled={!before} onClick={() => setC(true)}>أرشفة السجلات قبل هذا التاريخ</button></div>
      {c && <Confirm title="أرشفة سجل العمليات" message={`سيتم نقل السجلات الأقدم من ${before} إلى ملف أرشيف.`} onConfirm={async () => { const r = await api.post('/audit/archive', { before }); toast(`تمت أرشفة ${r.archived} سجل`); }} onClose={() => setC(false)} />}
    </Card>
  );
}

function Demo() {
  const toast = useToast(); const { reload } = useAuth();
  const { data, reload: r2 } = useAsync(() => api.get('/settings/demo'), []);
  const [txt, setTxt] = useState(''); const [busy, setBusy] = useState(false);
  const PHRASE = 'حذف البيانات التجريبية';
  const clear = async () => { setBusy(true); try { await api.post('/settings/demo/clear', { confirm: txt }); toast('تم حذف جميع البيانات التجريبية'); setTxt(''); r2(); reload(); } catch (e) { toast(e.message, 'error'); } setBusy(false); };
  if (!data) return <Spinner />;
  return (
    <Card title="البيانات التجريبية" icon={FlaskConical}>
      <p style={{ marginTop: 0 }}>جميع البيانات التجريبية مُعلَّمة في قاعدة البيانات، ويمكن حذفها بالكامل دون المساس بأي بيانات حقيقية أدخلتها الشركة. سيتم حذف حسابات الدخول التجريبية (demo.*) أيضاً، ويبقى حساب المالك الأساسي.</p>
      <div className="grid g4" style={{ gap: 8, marginBottom: 16 }}>
        {Object.entries(data.counts).filter(([, n]) => n > 0).map(([t, n]) => <div key={t} className="row between small" style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 6 }}><span className="ltr">{t}</span><b className="num">{n}</b></div>)}
      </div>
      {data.total === 0 ? <div className="ok-box">لا توجد بيانات تجريبية في النظام.</div> : (<>
        <div className="field" style={{ maxWidth: 420 }}><label>للتأكيد اكتب: <b>{PHRASE}</b></label><input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} /></div>
        <button className="btn solid-red mt" disabled={txt !== PHRASE || busy} onClick={clear}><Trash2 />{busy ? 'جارٍ الحذف...' : `حذف ${data.total} سجل تجريبي`}</button>
      </>)}
    </Card>
  );
}

export default function Settings() {
  const { can, user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const S = can('settings.manage');
  const tab = sp.get('tab') || (S ? 'company' : can('users.manage') ? 'users' : 'roles');
  return (
    <>
      <PageHead crumb="الإعدادات" title="الإعدادات العامة" desc="لوحة تحكم المالك: بيانات الشركة، الهيكل الإداري، المناصب والصلاحيات، المستخدمون، والأمان" />
      <Tabs value={tab} onChange={(t) => setSp({ tab: t })} tabs={[
        S && { key: 'company', label: 'بيانات الشركة', icon: Building }, S && { key: 'departments', label: 'الأقسام', icon: Network },
        (can('roles.manage') || can('users.manage')) && { key: 'roles', label: 'المناصب والصلاحيات', icon: ShieldCheck }, can('users.manage') && { key: 'users', label: 'المستخدمون', icon: Users },
        can('users.manage') && { key: 'security', label: 'الأمان والجلسات', icon: Lock }, S && { key: 'notifications', label: 'الإشعارات', icon: Bell },
        S && { key: 'system', label: 'النظام والعملة', icon: Cog }, S && { key: 'reports', label: 'التقارير', icon: FileBarChart },
        user.isOwner && { key: 'backup', label: 'النسخ الاحتياطي والسجل', icon: DatabaseBackup }, user.isOwner && { key: 'demo', label: 'البيانات التجريبية', icon: FlaskConical },
      ]} />
      {tab === 'company' && <SettingForm k="company" title="بيانات الشركة الرسمية" icon={Building} fields={[['name_ar', 'اسم الشركة (عربي)'], ['name_en', 'اسم الشركة (إنجليزي)'], ['cr_number', 'السجل التجاري'], ['vat_number', 'الرقم الضريبي'], ['phone', 'الهاتف'], ['email', 'البريد الرسمي', 'email'], ['website', 'الموقع الإلكتروني'], ['classification', 'تصنيف المقاولين'], ['address', 'العنوان', 'textarea']]} />}
      {tab === 'departments' && <ResourceView resource="departments" createLabel="إدارة / قسم" />}
      {tab === 'roles' && <Roles />}
      {tab === 'users' && <UsersAdmin />}
      {tab === 'security' && <Security />}
      {tab === 'notifications' && <SettingForm k="notifications" title="إعدادات الإشعارات" icon={Bell} fields={[['tasks', 'إشعارات المهام', 'bool'], ['leaves', 'طلبات الإجازات', 'bool'], ['approvals', 'طلبات الاعتماد', 'bool'], ['projects', 'تحديثات المشاريع', 'bool'], ['finance', 'التنبيهات المالية', 'bool'], ['meetings', 'الاجتماعات', 'bool'], ['circulars', 'التعاميم', 'bool'], ['inventory', 'تنبيهات المخزون', 'bool']]} />}
      {tab === 'system' && <div className="stack">
        <SettingForm k="system" title="إعدادات النظام" icon={Cog} fields={[['timezone', 'المنطقة الزمنية', 'select', [['Asia/Riyadh', 'الرياض (UTC+3)'], ['Asia/Dubai', 'دبي (UTC+4)'], ['Africa/Cairo', 'القاهرة']]], ['week_start', 'بداية الأسبوع', 'select', [['sunday', 'الأحد'], ['saturday', 'السبت'], ['monday', 'الاثنين']]], ['session_hours', 'مدة الجلسة (ساعة)', 'number']]} />
        <SettingForm k="currency" title="إعدادات العملة والضريبة" icon={Coins} fields={[['code', 'رمز العملة', 'select', [['SAR', 'ريال سعودي SAR'], ['AED', 'درهم إماراتي AED'], ['USD', 'دولار أمريكي USD']]], ['symbol', 'الرمز الظاهر'], ['decimals', 'الخانات العشرية', 'number'], ['vat_rate', 'نسبة ضريبة القيمة المضافة %', 'number']]} />
      </div>}
      {tab === 'reports' && <SettingForm k="reports" title="إعدادات التقارير" icon={FileBarChart} fields={[['show_logo', 'إظهار الشعار في التقارير', 'bool'], ['default_range_days', 'الفترة الافتراضية (يوم)', 'number'], ['footer_note', 'تذييل التقارير', 'textarea']]} />}
      {tab === 'backup' && <Backup />}
      {tab === 'demo' && <Demo />}
      {Empty && null}
    </>
  );
}
