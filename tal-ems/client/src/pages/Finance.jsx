import { useSearchParams } from 'react-router-dom';
import { LayoutDashboard, ArrowLeftRight, FileText, HandCoins, CalendarClock, Users, PiggyBank, Building, Truck, TrendingUp, TrendingDown, Scale, Landmark } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHead, Tabs, Card, Stat, Spinner, useAsync, Progress, Badge } from '../components/ui';
import ResourceView from '../components/ResourceView';
import { IncomeExpenseChart, Donut, C } from '../components/Charts';
import { money, pct } from '../lib/format';

function Overview() {
  const { data: d } = useAsync(() => api.get('/dashboard'), []);
  if (!d) return <Spinner />;
  if (!d.finance) return null;
  const f = d.finance;
  return (
    <div className="stack">
      <div className="grid g4">
        <Stat label={`الإيرادات ${f.year}`} value={money(f.revenue, { compact: true })} icon={TrendingUp} tone="green" foot={money(f.revenue)} />
        <Stat label={`المصروفات ${f.year}`} value={money(f.expenses, { compact: true })} icon={TrendingDown} tone="amber" foot={money(f.expenses)} />
        <Stat label="صافي الأرباح" value={money(f.net, { compact: true })} icon={Scale} foot={`هامش ${f.revenue ? pct((f.net / f.revenue) * 100) : '—'}`} />
        <Stat label="الالتزامات / المستحقات" value={money(f.obligations, { compact: true })} icon={Landmark} tone="dark" foot={<>مستحق لنا: {money(f.receivables, { compact: true })}</>} />
      </div>
      <div className="grid g-2-1">
        <Card title="الإيرادات والمصروفات الشهرية" icon={TrendingUp} actions={<div className="legend"><span><i style={{ background: C.brand }} />الإيرادات</span><span><i style={{ background: C.amber }} />المصروفات</span></div>}><IncomeExpenseChart data={d.monthly} /></Card>
        <Card title="المصروفات حسب البند" icon={PiggyBank}><Donut data={d.expenseByCategory} height={180} fmt={(v) => money(v, { compact: true })} center={money(f.expenses, { compact: true })} /></Card>
      </div>
    </div>
  );
}

function Budgets() {
  const { data } = useAsync(() => api.get('/reports/financial?from=2000-01-01'), []);
  if (!data) return <Spinner />;
  return (
    <Card title="ميزانيات المشاريع" icon={PiggyBank} sub="المصروف المعتمد الكلي مقابل الميزانية المعتمدة" flush>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>المشروع</th><th className="money">قيمة العقد</th><th className="money">الميزانية</th><th className="money">الإيرادات</th><th className="money">المصروفات</th><th className="money">الصافي</th><th style={{ width: 200 }}>استهلاك الميزانية</th></tr></thead>
        <tbody>{data.rows.map((r) => (
          <tr key={r.code}><td><b style={{ fontWeight: 500 }}>{r.name}</b><div className="tiny muted ltr">{r.code}</div></td>
            <td className="money">{money(r.contract_value, { compact: true })}</td><td className="money">{money(r.budget, { compact: true })}</td><td className="money">{money(r.income, { compact: true })}</td><td className="money">{money(r.expense, { compact: true })}</td>
            <td className="money" style={{ color: r.net < 0 ? 'var(--red)' : 'var(--green)' }}>{money(r.net, { compact: true })}</td>
            <td><Progress value={r.usage} /><span className="tiny num muted">{pct(r.usage)}</span>{r.usage > 90 && <Badge tone="red" plain>مرتفع</Badge>}</td></tr>))}</tbody>
      </table></div>
    </Card>
  );
}

export default function Finance() {
  const { can } = useAuth();
  const full = can('finance.view');
  const [sp, setSp] = useSearchParams(); const tab = sp.get('tab') || (full ? 'overview' : 'transactions');
  return (
    <>
      <PageHead crumb="الإدارة المالية" title="الإدارة المالية والمحاسبية" desc={full ? 'الإيرادات والمصروفات والفواتير والمستحقات والرواتب مع نظام اعتماد مالي' : 'طلبات المصروفات لمشاريعك — تخضع للاعتماد المالي'} />
      <Tabs value={tab} onChange={(t) => setSp({ tab: t })} tabs={[
        full && can('dashboard.finance') && { key: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
        { key: 'transactions', label: full ? 'الإيرادات والمصروفات' : 'طلبات المصروفات', icon: ArrowLeftRight },
        full && { key: 'invoices', label: 'الفواتير', icon: FileText },
        full && { key: 'received', label: 'الدفعات المستلمة', icon: HandCoins },
        full && { key: 'due', label: 'الدفعات المستحقة', icon: CalendarClock },
        full && can('employees.salary') && { key: 'payroll', label: 'الرواتب', icon: Users },
        full && can('reports.finance') && { key: 'budgets', label: 'ميزانيات المشاريع', icon: PiggyBank },
        full && { key: 'clients', label: 'العملاء', icon: Building },
        full && { key: 'suppliers', label: 'الموردون', icon: Truck },
      ]} />
      {tab === 'overview' && <Overview />}
      {tab === 'transactions' && <ResourceView resource="transactions" createLabel={can('finance.manage') ? 'عملية مالية' : 'طلب مصروف'} defaults={{ kind: 'expense', tx_date: new Date().toISOString().slice(0, 10) }} columns={['ref_no', 'kind', 'category', 'project_id', 'amount', 'tx_date', 'status']} />}
      {tab === 'invoices' && <ResourceView resource="invoices" createLabel="فاتورة جديدة" columns={['number', 'direction', 'client_id', 'project_id', 'amount', 'vat', 'paid_amount', 'due_date', 'status']} />}
      {tab === 'received' && <ResourceView resource="payments" fixed={{ direction: 'in' }} createLabel="تسجيل دفعة مستلمة" columns={['invoice_id', 'project_id', 'amount', 'pay_date', 'method', 'reference', 'status']} />}
      {tab === 'due' && <ResourceView resource="payments" fixed={{ status: 'due' }} createLabel="دفعة مستحقة" columns={['direction', 'project_id', 'supplier_id', 'client_id', 'amount', 'due_date', 'reference']} defaultSort={['due_date', 'asc']} />}
      {tab === 'payroll' && <ResourceView resource="payroll" createLabel="إضافة راتب" />}
      {tab === 'budgets' && <Budgets />}
      {tab === 'clients' && <ResourceView resource="clients" createLabel="عميل جديد" />}
      {tab === 'suppliers' && <ResourceView resource="suppliers" createLabel="مورد جديد" />}
    </>
  );
}
