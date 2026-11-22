import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, LogIn } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

function Blueprint() {
  // abstract architectural elevation drawn in fine lines
  return (
    <svg className="blueprint" viewBox="0 0 600 420" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1">
      <g opacity=".9">
        <rect x="70" y="80" width="150" height="320" /><rect x="240" y="150" width="120" height="250" /><rect x="380" y="40" width="170" height="360" />
        {Array.from({ length: 13 }).map((_, i) => <line key={`a${i}`} x1="70" x2="220" y1={100 + i * 23} y2={100 + i * 23} strokeOpacity=".5" />)}
        {Array.from({ length: 4 }).map((_, i) => <line key={`b${i}`} y1="80" y2="400" x1={100 + i * 30} x2={100 + i * 30} strokeOpacity=".35" />)}
        {Array.from({ length: 10 }).map((_, i) => <rect key={`c${i}`} x="255" y={168 + i * 22} width="90" height="12" strokeOpacity=".55" />)}
        {Array.from({ length: 15 }).map((_, i) => <line key={`d${i}`} x1="380" x2="550" y1={62 + i * 23} y2={62 + i * 23} strokeOpacity=".5" />)}
        {Array.from({ length: 5 }).map((_, i) => <line key={`e${i}`} y1="40" y2="400" x1={408 + i * 28} x2={408 + i * 28} strokeOpacity=".35" />)}
        <line x1="20" x2="590" y1="400" y2="400" strokeWidth="1.5" />
        <path d="M465 40 V8 M380 22 H560 M465 8 L380 22 M465 8 L560 22" strokeOpacity=".8" />
        <path d="M40 80 V400 M34 80 H46 M34 400 H46" strokeOpacity=".6" /><text x="18" y="245" fill="rgba(255,255,255,.6)" stroke="none" fontSize="10" transform="rotate(-90 18 245)">+72.00</text>
        <circle cx="300" cy="120" r="18" strokeDasharray="3 3" /><path d="M300 96 V144 M276 120 H324" strokeOpacity=".6" />
      </g>
    </svg>
  );
}

export default function Login() {
  const { reload } = useAuth();
  const [identifier, setId] = useState(''); const [password, setPw] = useState(''); const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [challenge, setChallenge] = useState(null); const [code, setCode] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      if (challenge) { await api.post('/auth/login/2fa', { challenge, code }); await reload(); return; }
      const r = await api.post('/auth/login', { identifier, password, remember });
      if (r.requires2fa) { setChallenge(r.challenge); setBusy(false); return; }
      await reload();
    } catch (x) { setErr(x.message); setBusy(false); }
  };

  return (
    <div className="login">
      <div className="login-form">
        <form className="login-box" onSubmit={submit}>
          <img src="/tal-logo.png" alt="TAL Construction Company" className="logo" />
          {!challenge ? (<>
            <h1>تسجيل الدخول</h1>
            <p className="muted" style={{ marginTop: 0, marginBottom: 26 }}>المقر الإداري الإلكتروني لشركة تال الإنشائية للمقاولات</p>
            <div className="stack" style={{ gap: 14 }}>
              <div className="field"><label htmlFor="id">البريد الإلكتروني أو اسم المستخدم</label>
                <input id="id" className="input" autoComplete="username" value={identifier} onChange={(e) => setId(e.target.value)} dir="ltr" style={{ textAlign: 'right' }} required autoFocus /></div>
              <div className="field"><label htmlFor="pw">كلمة المرور</label>
                <div className="pw-wrap"><input id="pw" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPw(e.target.value)} dir="ltr" style={{ textAlign: 'right' }} required />
                  <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{show ? <EyeOff /> : <Eye />}</button></div></div>
              <div className="row between">
                <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />تذكرني على هذا الجهاز</label>
                <Link to="/forgot-password" className="small">نسيت كلمة المرور؟</Link>
              </div>
            </div>
          </>) : (<>
            <h1 className="row" style={{ gap: 8 }}><ShieldCheck color="var(--tal-500)" />التحقق بخطوتين</h1>
            <p className="muted" style={{ marginTop: 0, marginBottom: 22 }}>أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة على جوالك.</p>
            <input className="input otp" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus aria-label="رمز التحقق" />
            <button type="button" className="btn ghost sm mt" onClick={() => { setChallenge(null); setCode(''); }}>رجوع</button>
          </>)}
          {err && <div className="error-box mt">{err}</div>}
          <button className="btn primary block mt" style={{ height: 42 }} disabled={busy}><LogIn />{busy ? 'جارٍ التحقق...' : challenge ? 'تأكيد' : 'دخول'}</button>
          <p className="tiny muted" style={{ marginTop: 24, lineHeight: 1.7 }}>الحسابات تُنشأ من قبل الإدارة فقط. جميع محاولات الدخول مسجلة لأغراض الأمان.</p>
        </form>
      </div>
      <div className="login-art">
        <div style={{ position: 'relative' }}>
          <div className="tiny" style={{ color: 'var(--tal-200)', letterSpacing: '.12em', marginBottom: 14 }} dir="ltr">TAL CONSTRUCTION COMPANY — ENTERPRISE MANAGEMENT SYSTEM</div>
          <h2>إدارة المشاريع والموارد والقرارات من منصة واحدة</h2>
          <p>متابعة الإنجاز الفعلي مقابل المخطط، الاعتمادات المالية، فرق العمل، والتقارير الهندسية — بصلاحيات دقيقة لكل منصب.</p>
        </div>
        <Blueprint />
        <div className="facts">
          <div><b>RBAC</b>صلاحيات متعددة المستويات</div>
          <div><b>2FA</b>مصادقة ثنائية</div>
          <div><b>Audit</b>سجل عمليات غير قابل للتعديل</div>
        </div>
      </div>
    </div>
  );
}
