import Link from 'next/link';
import { listBuyerOrders } from '@/lib/server/services/buyer-service';
import { StatusBadge } from '@/components/buyer/status-badge';

export default async function OrdersPage() {
  const orders = await listBuyerOrders();

  return (
    <main className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">طلباتي</h1>
        <p className="text-sm text-muted-foreground mt-1">{orders.length} طلب</p>
      </div>

      {orders.length === 0 ? (
        <div className="border rounded p-8 text-center text-muted-foreground">
          <p>لا توجد طلبات بعد.</p>
          <Link href="/products" className="text-primary mt-2 inline-block">
            تصفح المنتجات ←
          </Link>
        </div>
      ) : (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-right p-3">المنتج</th>
                <th className="text-right p-3">المبلغ</th>
                <th className="text-right p-3">الحالة</th>
                <th className="text-right p-3">التاريخ</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.purchase_request_id} className="border-t">
                  <td className="p-3 max-w-xs truncate">
                    {o.product_titles.join(', ') || '—'}
                  </td>
                  <td className="p-3 text-xs">
                    {o.total_amount} {o.currency}
                  </td>
                  <td className="p-3"><StatusBadge status={o.status} /></td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString('ar')}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/account/orders/${o.purchase_request_id}`}
                      className="text-primary text-xs"
                    >
                      عرض
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
