import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

function Shell({ title, desc, children }) {
  return (
    <div className="login" style={{ gridTemplateColumns: '1fr' }}>
      <div className="login-form"><div className="login-box">
        <img src="/tal-logo.png" alt="TAL" className="logo" />
        <h1>{title}</h1><p className="muted" style={{ marginTop: 0, marginBottom: 22 }}>{desc}</p>{children}
        <Link to="/" className="small" style={{ display: 'block', marginTop: 20 }}>العودة لتسجيل الدخول</Link>
      </div></div>
    </div>
  );
}

export function ForgotPassword() {
  const [id, setId] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const r = await api.post('/auth/forgot', { identifier: id }); setMsg(r.message); } catch (x) { setErr(x.message); } setBusy(false); };
  return (
    <Shell title="استعادة كلمة المرور" desc="أدخل بريدك أو اسم المستخدم وسنرسل رابط إعادة التعيين إلى بريدك المسجل.">
      {msg ? <div className="ok-box">{msg}</div> : (
        <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
          <input className="input" value={id} onChange={(e) => setId(e.target.value)} dir="ltr" required placeholder="name@tal.com" />
          {err && <div className="error-box">{err}</div>}
          <button className="btn primary block" disabled={busy}>إرسال الرابط</button>
        </form>)}
    </Shell>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams(); const nav = useNavigate();
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState(''); const [ok, setOk] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (pw !== pw2) return setErr('كلمتا المرور غير متطابقتين');
    try { await api.post('/auth/reset', { token: sp.get('token'), password: pw }); setOk(true); setTimeout(() => nav('/'), 2500); } catch (x) { setErr(x.message); }
  };
  return (
    <Shell title="تعيين كلمة مرور جديدة" desc="10 أحرف على الأقل، تحتوي على أحرف وأرقام.">
      {ok ? <div className="ok-box">تم تغيير كلمة المرور. سيتم تحويلك لتسجيل الدخول.</div> : (
        <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
          <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="كلمة المرور الجديدة" required dir="ltr" />
          <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="تأكيد كلمة المرور" required dir="ltr" />
          {err && <div className="error-box">{err}</div>}
          <button className="btn primary block">حفظ</button>
        </form>)}
    </Shell>
  );
}
