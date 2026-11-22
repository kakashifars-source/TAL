import { useState } from 'react';
import { Folder, FolderOpen, Lock, FileText, Plus, Archive } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHead, Card, useAsync, Badge } from '../components/ui';
import ResourceView, { FormModal } from '../components/ResourceView';
import { FileLink } from '../components/fields';
import { fileSize } from '../lib/format';

export default function Documents() {
  const { meta } = useAuth();
  const [folder, setFolder] = useState(null); const [newFolder, setNewFolder] = useState(false);
  const { data: folders, reload } = useAsync(() => api.get('/r/folders?pageSize=500&sort=name&dir=asc'), []);
  const fx = folder ? { folder_id: folder } : {};
  return (
    <>
      <PageHead crumb="المستندات والأرشيف" title="مكتبة المستندات المركزية" desc="العقود، المخططات، التراخيص، محاضر الاجتماعات، والقرارات — مع صلاحيات وصول لكل مستند" />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(220px, 260px) 1fr', alignItems: 'start' }}>
        <Card title="المجلدات" icon={Archive} flush actions={meta.folders && meta.folders.perms.create && <button className="btn xs" onClick={() => setNewFolder(true)}><Plus size={13} />مجلد</button>}>
          <div className="list">
            <button className="list-item" style={{ border: 0, background: folder === null ? 'var(--tal-50)' : 'none', cursor: 'pointer', width: '100%', textAlign: 'right' }} onClick={() => setFolder(null)}>
              <span className="li-ico"><FolderOpen /></span><span className="grow">جميع المستندات</span></button>
            {folders && folders.rows.map((f) => (
              <button key={f.id} className="list-item" style={{ border: 0, background: folder === f.id ? 'var(--tal-50)' : 'none', cursor: 'pointer', width: '100%', textAlign: 'right' }} onClick={() => setFolder(f.id)}>
                <span className="li-ico">{folder === f.id ? <FolderOpen /> : <Folder />}</span><span className="grow">{f.name}</span>
                {f.access_level !== 'all' && <Lock size={13} color="var(--amber)" />}
              </button>))}
          </div>
        </Card>
        <ResourceView resource="documents" fixed={fx} createLabel="رفع مستند" columns={['title', 'category', 'project_id', 'access_level', 'expiry_date', 'file_url']}
          cellRender={{
            title: (r) => <span className="row" style={{ gap: 8 }}><FileText size={16} color="var(--tal-500)" /><span>{r.title}{r.file_size ? <span className="tiny muted"> · {fileSize(r.file_size)}</span> : ''}</span></span>,
            file_url: (r) => <FileLink url={r.file_url} label="فتح" />,
            access_level: (r) => <Badge tone={r.access_level === 'all' ? 'gray' : r.access_level === 'owner' ? 'red' : 'amber'} plain>{{ all: 'الجميع', management: 'الإدارة', owner: 'المالك فقط' }[r.access_level]}</Badge>,
          }} />
      </div>
      {newFolder && <FormModal resource="folders" meta={meta.folders} onClose={() => setNewFolder(false)} onSaved={() => { setNewFolder(false); reload(); }} />}
    </>
  );
}
