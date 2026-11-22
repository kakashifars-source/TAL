import { useSearchParams } from 'react-router-dom';
import { Palmtree, Star, History, Building2, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { PageHead, Tabs, Card, Stat, useAsync, Spinner } from '../components/ui';
import ResourceView from '../components/ResourceView';
import { Donut } from '../components/Charts';
import { api } from '../lib/api';

function Overview() {
  const { data } = useAsync(async () => {
    const [emps, leaves, deps] = await Promise.all([api.get('/r/employees?pageSize=1000'), api.get('/r/leave_requests?pageSize=1000&filter[status]=pending'), api.get('/r/departments?pageSize=100')]);
    const byDep = {}; emps.rows.forEach((e) => { const k = e.department_id__label || 'غير محدد'; byDep[k] = (byDep[k] || 0) + 1; });
    const byStatus = {}; emps.rows.forEach((e) => { byStatus[e.status] = (byStatus[e.status] || 0) + 1; });
    return { total: emps.total, active: byStatus.active || 0, onLeave: byStatus.on_leave || 0, pending: leaves.total, deps: deps.total, byDep: Object.entries(byDep).map(([name, value]) => ({ name, value })) };
  }, []);
  if (!data) return <Spinner />;
  return (
    <div className="stack">
      <div className="grid g4">
        <Stat label="إجمالي الموظفين" value={data.total} icon={Users} />
        <Stat label="على رأس العمل" value={data.active} icon={Users} tone="green" />
        <Stat label="طلبات إجازة معلقة" value={data.pending} icon={Palmtree} tone="amber" />
        <Stat label="الإدارات والأقسام" value={data.deps} icon={Building2} tone="dark" />
      </div>
      <Card title="توزيع الموظفين على الإدارات" icon={Building2}><Donut data={data.byDep} /></Card>
    </div>
  );
}

export default function HR() {
  const [sp, setSp] = useSearchParams(); const tab = sp.get('tab') || 'overview';
  const { meta, can } = useAuth();
  return (
    <>
      <PageHead crumb="الموارد البشرية" title="الموارد البشرية" desc="الإجازات، التقييمات، السجل الوظيفي، والهيكل التنظيمي" />
      <Tabs value={tab} onChange={(t) => setSp({ tab: t })} tabs={[
        can('hr.view') && { key: 'overview', label: 'نظرة عامة', icon: Users }, { key: 'leaves', label: 'طلبات الإجازات', icon: Palmtree },
        meta.evaluations && can('hr.view') && { key: 'evals', label: 'تقييمات الأداء', icon: Star }, meta.employee_history && can('hr.view') && { key: 'history', label: 'السجل الوظيفي', icon: History },
        { key: 'departments', label: 'الأقسام والإدارات', icon: Building2 },
      ]} />
      {tab === 'overview' && can('hr.view') && <Overview />}
      {tab === 'leaves' && <ResourceView resource="leave_requests" createLabel="طلب إجازة" initialFilters={{ status: 'pending' }} />}
      {tab === 'evals' && <ResourceView resource="evaluations" createLabel="تقييم جديد" />}
      {tab === 'history' && <ResourceView resource="employee_history" createLabel="إضافة حدث" />}
      {tab === 'departments' && <ResourceView resource="departments" createLabel="إدارة / قسم جديد" />}
    </>
  );
}
