import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { KeyRound, ShieldCheck, MonitorSmartphone, History } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { PageHead, Card, Badge, Spinner, useAsync } from '../components/ui';
import { dateTime, ago } from '../lib/format';

export default function Account() {
  const { user, reload } = useAuth(); const toast = useToast();
  const [sp] = useSearchParams(); const force = sp.get('force') || user.must_change_password;
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' }); const [err, setErr] = useState('');
  const [setup, setSetup] = useState(null); const [code, setCode] = useState(''); const [disablePw, setDisablePw] = useState('');
  const sess = useAsync(() => api.get('/auth/sessions'), []);
  const att = useAsync(() => api.get('/auth/login-attempts'), []);

  const changePw = async (e) => {
    e.preventDefault(); setErr('');
    if (pw.next !== pw.confirm) return setErr('كلمتا المرور غير متطابقتين');
    try { await api.post('/auth/change-password', { current: pw.current, next: pw.next }); toast('تم تغيير كلمة المرور وإنهاء الجلسات الأخرى'); setPw({ current: '', next: '', confirm: '' }); reload(); } catch (x) { setErr(x.message); }
  };
  const start2fa = async () => setSetup(await api.post('/auth/2fa/setup'));
  const enable2fa = async () => { try { await api.post('/auth/2fa/enable', { code }); toast('تم تفعيل المصادقة الثنائية'); setSetup(null); setCode(''); reload(); } catch (x) { toast(x.message, 'error'); } };
  const disable2fa = async () => { try { await api.post('/auth/2fa/disable', { password: disablePw }); toast('تم إيقاف المصادقة الثنائية'); setDisablePw(''); reload(); } catch (x) { toast(x.message, 'error'); } };

  return (
    <>
      <PageHead crumb="الحساب" title="الحساب والأمان" desc={`${user.display_name} — ${user.role_name}`} />
      {force && <div className="error-box" style={{ marginBottom: 16 }}>يجب تغيير كلمة المرور المؤقتة قبل متابعة استخدام النظام.</div>}
      <div className="grid g2">
        <Card title="تغيير كلمة المرور" icon={KeyRound}>
          <form onSubmit={changePw} className="stack" style={{ gap: 12 }}>
            <div className="field"><label>كلمة المرور الحالية</label><input className="input" type="password" dir="ltr" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></div>
            <div className="field"><label>كلمة المرور الجديدة</label><input className="input" type="password" dir="ltr" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /><span className="hint">10 أحرف على الأقل، تحتوي على أحرف وأرقام.</span></div>
            <div className="field"><label>تأكيد كلمة المرور</label><input className="input" type="password" dir="ltr" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></div>
            {err && <div className="error-box">{err}</div>}
            <div><button className="btn primary">حفظ كلمة المرور</button></div>
          </form>
        </Card>
        {!force && <Card title="المصادقة الثنائية (2FA)" icon={ShieldCheck} actions={user.totp_enabled ? <Badge tone="green">مفعلة</Badge> : <Badge>غير مفعلة</Badge>}>
          {user.totp_enabled ? (
            <div className="stack" style={{ gap: 10 }}>
              <p style={{ margin: 0 }}>حسابك محمي برمز تحقق إضافي من تطبيق المصادقة عند كل تسجيل دخول.</p>
              <div className="field"><label>لإيقافها أدخل كلمة المرور</label><input className="input" type="password" dir="ltr" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} /></div>
              <div><button className="btn red" onClick={disable2fa} disabled={!disablePw}>إيقاف المصادقة الثنائية</button></div>
            </div>
          ) : setup ? (
            <div className="stack" style={{ gap: 12 }}>
              <p style={{ margin: 0 }}>امسح الرمز بتطبيق Google Authenticator أو Microsoft Authenticator، ثم أدخل الرمز الظاهر.</p>
              <div className="row" style={{ gap: 16 }}><img src={setup.qr} alt="QR" style={{ width: 160, border: '1px solid var(--line)', borderRadius: 8 }} /><div className="tiny muted">أو أدخل المفتاح يدوياً:<br /><code className="ltr" style={{ wordBreak: 'break-all' }}>{setup.secret}</code></div></div>
              <div className="row"><input className="input otp" style={{ maxWidth: 200 }} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /><button className="btn primary" onClick={enable2fa}>تفعيل</button></div>
            </div>
          ) : (<><p style={{ marginTop: 0 }}>أضف طبقة حماية ثانية لحسابك عبر تطبيق المصادقة على جوالك.</p><button className="btn primary" onClick={start2fa}><ShieldCheck />بدء التفعيل</button></>)}
        </Card>}
      </div>
      {!force && <div className="grid g2 mt">
        <Card title="الأجهزة والجلسات النشطة" icon={MonitorSmartphone} flush>
          {!sess.data ? <Spinner /> : <div className="list">{sess.data.map((s) => (
            <div key={s.id} className="list-item"><span className="li-ico"><MonitorSmartphone /></span>
              <div className="grow"><div className="small truncate ltr" style={{ maxWidth: 360, display: 'block' }}>{s.user_agent}</div><div className="meta"><span className="ltr">{s.ip}</span> · آخر نشاط {ago(s.last_seen_at)}</div></div>
              {s.current ? <Badge tone="green">الجهاز الحالي</Badge> : <button className="btn xs red" onClick={async () => { await api.del(`/auth/sessions/${s.id}`); sess.reload(); toast('تم إنهاء الجلسة'); }}>إنهاء</button>}
            </div>))}</div>}
        </Card>
        <Card title="آخر محاولات الدخول لحسابك" icon={History} flush>
          {!att.data ? <Spinner /> : <div className="list">{att.data.slice(0, 10).map((a) => (
            <div key={a.id} className="list-item"><div className="grow"><div className="small num">{dateTime(a.created_at)}</div><div className="meta ltr">{a.ip}</div></div>{a.success ? <Badge tone="green">ناجحة</Badge> : <Badge tone="red">فاشلة</Badge>}</div>))}</div>}
        </Card>
      </div>}
    </>
  );
}
