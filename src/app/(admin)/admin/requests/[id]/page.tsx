import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { RequestActions } from './request-actions';

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const db = await createClient();
  const { data: req } = await db
    .from('purchase_requests')
    .select(`
      *,
      purchase_request_items(
        id, unit_price, currency, quantity, product_id,
        product_version_id,
        products!inner(title, seller_id, price_amount)
      ),
      orders(id, status, order_items(id, purchase_codes(id, code_prefix, status, expires_at)))
    `)
    .eq('id', params.id)
    .single();

  if (!req) notFound();

  const alreadyApproved = ['approved', 'completed'].includes(req.status);

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">طلب #{req.id.slice(0, 8)}</h1>
        <div className="mt-2 space-y-1 text-sm">
          <p><span className="text-muted-foreground">البريد:</span> {req.customer_email ?? '—'}</p>
          <p><span className="text-muted-foreground">الهاتف:</span> {req.customer_phone ?? '—'}</p>
          {req.full_name && <p><span className="text-muted-foreground">الاسم:</span> {req.full_name}</p>}
          {req.buyer_id && (
            <p className="text-xs text-blue-700">
              مرتبط بحساب مسجّل
              {req.customer_email && (
                <span className="text-muted-foreground">
                  {' '}(إن كان البريد مختلفًا عن بريد الحساب، تحقق قبل الإرسال)
                </span>
              )}
            </p>
          )}
        </div>
        <p className="mt-2">الحالة: <b>{req.status}</b></p>
        <p>الإجمالي: {req.total_amount} {req.currency} (~{req.amount_in_usd} USD)</p>
        {req.notes && (
          <div className="mt-3 border rounded p-2 bg-muted/30 text-sm">
            <p className="text-xs text-muted-foreground mb-1">ملاحظات المشتري:</p>
            <p className="whitespace-pre-wrap">{req.notes}</p>
          </div>
        )}
      </div>

      {/* تحذير تغيّر السعر */}
      {req.purchase_request_items?.some((item: any) => {
        const currentPrice = Number(item.products?.price_amount ?? 0);
        const requestedPrice = Number(item.unit_price);
        return Math.abs(currentPrice - requestedPrice) > 0.01;
      }) && (
        <div className="border border-orange-300 bg-orange-50 rounded p-3 text-sm text-orange-900">
          <p className="font-medium">تنبيه: تغيّر سعر المنتج</p>
          <p className="text-xs mt-1">
            بعض المنتجات غيّرت سعرها منذ إنشاء الطلب. عند الموافقة، سيُصدر الكود بالسعر المذكور أعلاه.
            إذا كان السعر الجديد مطلوبًا، ارفض الطلب ليُعيد المشتري الإرسال.
          </p>
        </div>
      )}

      <section>
        <h2 className="font-semibold mb-2">البنود</h2>
        <div className="border rounded divide-y text-sm">
          {req.purchase_request_items?.map((item: any) => (
            <div key={item.id} className="p-3 flex justify-between">
              <span>{item.products.title}</span>
              <span className="text-muted-foreground">{item.unit_price} {item.currency}</span>
            </div>
          ))}
        </div>
      </section>

      {alreadyApproved && req.orders?.[0]?.order_items && (
        <section>
          <h2 className="font-semibold mb-2">الأكواد الصادرة</h2>
          <div className="border rounded divide-y text-sm">
            {req.orders[0].order_items.map((oi: any) =>
              oi.purchase_codes?.map((code: any) => (
                <div key={code.id} className="p-3 flex justify-between">
                  <span className="font-mono">{code.code_prefix}••••</span>
                  <span className="text-xs text-muted-foreground">
                    {code.status} — ينتهي {new Date(code.expires_at).toLocaleString('ar')}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {!alreadyApproved && req.status !== 'rejected' && req.status !== 'cancelled' && (
        <RequestActions requestId={params.id} />
      )}
    </main>
  );
}
