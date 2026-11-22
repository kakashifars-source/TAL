import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PenSquare, Inbox, Send, Paperclip, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { PageHead, Card, Modal, Empty, Spinner, useAsync, Avatar, Badge } from '../components/ui';
import { useOptions } from '../components/fields';
import { ago, dateTime } from '../lib/format';

function Attach({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="btn sm" style={{ cursor: 'pointer' }}><Paperclip />{busy ? '...' : value ? value.name : 'إرفاق ملف'}
      <input type="file" hidden onChange={async (e) => { const f = e.target.files[0]; if (!f) return; setBusy(true); try { onChange(await api.upload(f)); } finally { setBusy(false); } }} /></label>
  );
}

function Compose({ onClose, onSent }) {
  const users = useOptions('users'); const deps = useOptions('departments'); const toast = useToast();
  const [to, setTo] = useState('user'); const [rid, setRid] = useState(''); const [subject, setSubject] = useState(''); const [body, setBody] = useState(''); const [file, setFile] = useState(null);
  const [err, setErr] = useState('');
  const send = async () => {
    try { await api.post('/messages', { [to === 'user' ? 'recipient_id' : 'department_id']: Number(rid), subject, body, attachment_url: file && file.url, attachment_name: file && file.name }); toast('تم إرسال الرسالة'); onSent(); }
    catch (x) { setErr(x.message); }
  };
  return (
    <Modal title="رسالة جديدة" onClose={onClose} footer={<><button className="btn primary" onClick={send}><Send />إرسال</button><button className="btn" onClick={onClose}>إلغاء</button></>}>
      <div className="form-grid">
        <div className="field"><label>إرسال إلى</label><select className="select" value={to} onChange={(e) => { setTo(e.target.value); setRid(''); }}><option value="user">موظف / مستخدم</option><option value="dept">إدارة كاملة</option></select></div>
        <div className="field"><label>{to === 'user' ? 'المستلم' : 'الإدارة'}</label>
          <select className="select" value={rid} onChange={(e) => setRid(e.target.value)}><option value="">— اختر —</option>{(to === 'user' ? users : deps).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div className="field full"><label>الموضوع</label><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div className="field full"><label>نص الرسالة</label><textarea className="textarea" style={{ minHeight: 140 }} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div className="full"><Attach value={file} onChange={setFile} /></div>
      </div>
      {err && <div className="error-box mt">{err}</div>}
    </Modal>
  );
}

function Thread({ id, onReplied }) {
  const { user } = useAuth(); const toast = useToast();
  const { data, reload } = useAsync(() => api.get(`/messages/${id}`), [id]);
  const [body, setBody] = useState(''); const [file, setFile] = useState(null);
  useEffect(() => { if (data) window.dispatchEvent(new Event('tal:counts')); }, [data]);
  if (!data) return <Spinner />;
  const reply = async (e) => {
    e.preventDefault(); if (!body.trim()) return;
    try { await api.post('/messages', { parent_id: id, body, attachment_url: file && file.url, attachment_name: file && file.name }); setBody(''); setFile(null); reload(); onReplied(); } catch (x) { toast(x.message, 'error'); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="card-head"><h3>{data.root.subject}</h3></div>
      <div style={{ padding: 18, flex: 1, overflowY: 'auto', maxHeight: '55vh' }}>
        {data.thread.map((m) => (
          <div key={m.id} className={`bubble ${m.sender_id === user.id ? 'me' : ''}`}>
            <div className="row between tiny" style={{ gap: 16 }}><b>{m.sender_name}</b><span className="muted num">{dateTime(m.created_at)}</span></div>
            <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{m.body}</div>
            {m.attachment_url && <a href={m.attachment_url} target="_blank" rel="noreferrer" className="tiny row" style={{ gap: 4, marginTop: 6 }}><Paperclip size={12} />{m.attachment_name || 'مرفق'}</a>}
          </div>))}
      </div>
      <form onSubmit={reply} className="row" style={{ padding: 14, borderTop: '1px solid var(--line-2)' }}>
        <input className="input" placeholder="اكتب رداً..." value={body} onChange={(e) => setBody(e.target.value)} /><Attach value={file} onChange={setFile} /><button className="btn primary"><Send />رد</button>
      </form>
    </div>
  );
}

export default function Messages() {
  const [sp, setSp] = useSearchParams();
  const [box, setBox] = useState('inbox'); const [compose, setCompose] = useState(false);
  const open = sp.get('open') ? Number(sp.get('open')) : null;
  const { data, reload } = useAsync(() => api.get(`/messages?box=${box}`), [box]);
  return (
    <>
      <PageHead crumb="المراسلات" title="المراسلات الداخلية" desc="تواصل مباشر بين الموظفين والإدارات مع إمكانية إرفاق الملفات"><button className="btn primary" onClick={() => setCompose(true)}><PenSquare />رسالة جديدة</button></PageHead>
      <div className="card msg-layout">
        <div className="msg-list">
          <div className="row" style={{ padding: 10, gap: 6, borderBottom: '1px solid var(--line-2)' }}>
            <button className={`btn sm ${box === 'inbox' ? 'dark' : 'ghost'}`} onClick={() => setBox('inbox')}><Inbox />الوارد</button>
            <button className={`btn sm ${box === 'sent' ? 'dark' : 'ghost'}`} onClick={() => setBox('sent')}><Send />المرسل</button>
          </div>
          {!data ? <Spinner /> : data.length === 0 ? <Empty>لا توجد رسائل</Empty> : data.map((m) => (
            <div key={m.id} className={`msg-item ${open === m.id ? 'on' : ''} ${!m.read_at && box === 'inbox' ? 'unread' : ''}`} onClick={() => setSp({ open: m.id })}>
              <div className="row" style={{ gap: 10 }}>
                <Avatar name={box === 'sent' ? (m.recipient_name || m.department_name) : m.sender_name} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row between"><span className="small s" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{box === 'sent' ? (m.recipient_name || m.department_name) : m.sender_name}</span><span className="tiny muted">{ago(m.last_reply_at || m.created_at)}</span></div>
                  <div className="tiny" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject}</div>
                  <div className="row tiny muted" style={{ gap: 6, marginTop: 2 }}>{m.department_name && <Badge tone="blue" plain><Users size={11} />{m.department_name}</Badge>}{m.replies > 0 && <span>{m.replies} رد</span>}{m.attachment_url && <Paperclip size={11} />}</div>
                </div>
              </div>
            </div>))}
        </div>
        <div>{open ? <Thread id={open} onReplied={reload} /> : <Empty icon={Inbox}>اختر محادثة لعرضها</Empty>}</div>
      </div>
      {compose && <Compose onClose={() => setCompose(false)} onSent={() => { setCompose(false); setBox('sent'); reload(); }} />}
    </>
  );
}
