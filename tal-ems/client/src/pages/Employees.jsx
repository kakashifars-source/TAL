import { useNavigate } from 'react-router-dom';
import { PageHead, Avatar } from '../components/ui';
import ResourceView from '../components/ResourceView';

export default function Employees() {
  const nav = useNavigate();
  return (
    <>
      <PageHead crumb="الموظفون" title="دليل الموظفين" desc="الملفات الوظيفية لمنسوبي الشركة" />
      <ResourceView resource="employees" createLabel="موظف جديد" onRowClick={(r) => nav(`/employees/${r.id}`)}
        columns={['full_name', 'emp_no', 'job_title', 'department_id', 'manager_id', 'hire_date', 'salary', 'status']}
        cellRender={{ full_name: (r) => <span className="row" style={{ gap: 10 }}><Avatar name={r.full_name} src={r.photo_url} size="sm" /><b style={{ fontWeight: 500 }}>{r.full_name}</b></span> }} />
    </>
  );
}
