import { useSearchParams } from 'react-router-dom';
import { Boxes, ArrowDownUp, Truck, PackageX } from 'lucide-react';
import { PageHead, Tabs, Badge } from '../components/ui';
import ResourceView from '../components/ResourceView';
import { num } from '../lib/format';

export default function Inventory() {
  const [sp, setSp] = useSearchParams(); const tab = sp.get('tab') || 'materials';
  const qty = (r) => <span className="num">{num(r.quantity, 1)} {r.unit} {Number(r.quantity) <= Number(r.min_quantity) && <Badge tone="red" plain>منخفض</Badge>}</span>;
  return (
    <>
      <PageHead crumb="المستودعات والمعدات" title="المستودعات والمعدات" desc="المواد الإنشائية والمخزون، حركة الدخول والصرف للمشاريع، والمعدات والأدوات" />
      <Tabs value={tab} onChange={(t) => setSp({ tab: t })} tabs={[
        { key: 'materials', label: 'المواد والمخزون', icon: Boxes }, { key: 'low', label: 'تنبيهات الانخفاض', icon: PackageX },
        { key: 'moves', label: 'حركة المواد', icon: ArrowDownUp }, { key: 'equipment', label: 'المعدات والأدوات', icon: Truck },
      ]} />
      {tab === 'materials' && <ResourceView resource="materials" createLabel="مادة جديدة" cellRender={{ quantity: qty }} columns={['code', 'name', 'category', 'quantity', 'min_quantity', 'unit_cost', 'warehouse']} />}
      {tab === 'low' && <LowStock qty={qty} />}
      {tab === 'moves' && <ResourceView resource="stock_movements" createLabel="حركة إدخال / صرف" defaults={{ move_date: new Date().toISOString().slice(0, 10) }} />}
      {tab === 'equipment' && <ResourceView resource="equipment" createLabel="معدة جديدة" />}
    </>
  );
}
function LowStock({ qty }) {
  return <ResourceView resource="materials" canCreate={false} pageSize={200} cellRender={{ quantity: qty }} columns={['code', 'name', 'quantity', 'min_quantity', 'warehouse']}
    toolbar={<span className="small muted">المواد التي وصلت لحد التنبيه أو أقل</span>} fixed={{ low_stock: '1' }} />;
}
