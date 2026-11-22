import Link from 'next/link';
import {
  getDisplayStatus,
  type SellerOrderRow,
} from '@/lib/server/services/seller-order-service';

const VARIANT_CLASSES: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
  orange: 'bg-orange-100 text-orange-800',
  red: 'bg-red-100 text-red-800',
};

export function OrdersTable({ orders }: { orders: SellerOrderRow[] }) {
  if (orders.length === 0) {
    return (
      <div className="border rounded-lg p-10 text-center text-muted-foreground">
        <p>لا توجد مبيعات مطابقة للفلاتر.</p>
        <Link href="/seller/orders" className="text-primary text-sm mt-2 inline-block">
          مسح الفلاتر
        </Link>
      </div>
    );
  }

  return (
    <div className="border rounded-xl overflow-x-auto bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/70">
          <tr>
            <th className="text-right p-3">المنتج</th>
            <th className="text-right p-3">بادئة الكود</th>
            <th className="text-right p-3">المشتري</th>
            <th className="text-right p-3">المبلغ</th>
            <th className="text-right p-3">الصافي</th>
            <th className="text-right p-3">الحالة</th>
            <th className="text-right p-3">المحاولات</th>
            <th className="text-right p-3">التاريخ</th>
            <th className="text-right p-3"></th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => {
            const status = getDisplayStatus(o);
            const badge = VARIANT_CLASSES[status.variant] ?? VARIANT_CLASSES.gray;

            return (
              <tr key={o.order_item_id} className="border-t hover:bg-muted/20 transition-colors">
                <td className="p-3">
                  <Link
                    href={`/seller/orders/${o.order_item_id}`}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {o.product_title}
                  </Link>
                </td>
                <td className="p-3">
                  {o.code_prefix ? (
                    <span
                      className="font-mono text-xs bg-muted px-2 py-0.5 rounded tabular-nums"
                      dir="ltr"
                    >
                      {o.code_prefix}-****
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3 text-xs text-muted-foreground font-mono" dir="ltr">
                  {o.buyer_masked}
                </td>
                <td className="p-3 text-xs tabular-nums" dir="ltr">
                  {o.price.toFixed(2)} {o.currency}
                </td>
                <td className="p-3 text-xs text-emerald-700 font-medium tabular-nums" dir="ltr">
                  {o.net_amount.toFixed(2)} {o.currency}
                </td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${badge}`}>
                    {status.label}
                  </span>
                </td>
                <td className="p-3 text-xs text-muted-foreground tabular-nums" dir="ltr">
                  {o.attempts_used}/{o.attempts_max}
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {new Date(o.ordered_at).toLocaleDateString('ar')}
                </td>
                <td className="p-3 text-left">
                  <Link
                    href={`/seller/orders/${o.order_item_id}`}
                    className="text-xs font-medium text-primary hover:underline whitespace-nowrap"
                  >
                    التفاصيل ←
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
