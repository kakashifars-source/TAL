import { useSearchParams } from 'react-router-dom';
import { ClipboardList, FileSpreadsheet, ShoppingBag, Truck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { PageHead, Tabs } from '../components/ui';
import ResourceView from '../components/ResourceView';

export default function Purchasing() {
  const [sp, setSp] = useSearchParams(); const tab = sp.get('tab') || 'requests';
  const { meta } = useAuth();
  return (
    <>
      <PageHead crumb="المشتريات" title="إدارة المشتريات" desc="طلبات الشراء ← عروض الأسعار ← أوامر الشراء، مع اعتماد الإدارة المختصة" />
      <Tabs value={tab} onChange={(t) => setSp({ tab: t })} tabs={[
        { key: 'requests', label: 'طلبات الشراء', icon: ClipboardList }, meta.quotations && { key: 'quotes', label: 'عروض الأسعار', icon: FileSpreadsheet },
        meta.purchase_orders && { key: 'orders', label: 'أوامر الشراء', icon: ShoppingBag }, meta.suppliers && { key: 'suppliers', label: 'الموردون', icon: Truck },
      ]} />
      {tab === 'requests' && <ResourceView resource="purchase_requests" createLabel="طلب شراء" columns={['number', 'title', 'project_id', 'estimated_total', 'needed_by', 'priority', 'status']}
        drawerExtra={(row) => meta.quotations && <div><div className="bold" style={{ marginBottom: 8 }}>عروض الأسعار لهذا الطلب</div><ResourceView resource="quotations" fixed={{ purchase_request_id: row.id }} columns={['supplier_id', 'amount', 'delivery_days', 'valid_until', 'status']} /></div>} />}
      {tab === 'quotes' && <ResourceView resource="quotations" createLabel="عرض سعر" />}
      {tab === 'orders' && <ResourceView resource="purchase_orders" createLabel="أمر شراء" />}
      {tab === 'suppliers' && <ResourceView resource="suppliers" createLabel="مورد جديد" />}
    </>
  );
}
