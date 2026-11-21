import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBuyerOrderDetail } from '@/lib/server/services/buyer-service';
import { StatusBadge } from '@/components/buyer/status-badge';
import { Countdown } from '@/components/buyer/countdown';

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const detail = await getBuyerOrderDetail(params.id);
  if (!detail) notFound();

  const { request, items, compensation_requests } = detail;

  return (
    <main className="p-6 space-y-6 max-w-4xl">
      <nav className="text-sm text-muted-foreground">
        <Link href="/account/orders" className="hover:underline">طلباتي</Link>
        {' / '}
        <span>طلب #{request.purchase_request_id.slice(0, 8)}</span>
      </nav>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {request.product_titles.join(', ') || 'طلب'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(request.created_at).toLocaleString('ar')}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="border rounded p-3">
          <p className="text-xs text-muted-foreground">المبلغ</p>
          <p className="font-medium">{request.total_amount} {request.currency}</p>
        </div>
        <div className="border rounded p-3">
          <p className="text-xs text-muted-foreground">المبلغ بالدولار</p>
          <p className="font-medium">{request.amount_in_usd} USD</p>
        </div>
      </div>

      <section>
        <h2 className="font-semibold mb-2">المنتجات</h2>
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="border rounded p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/products/${item.product_slug}`} className="font-medium hover:underline">
                    {item.product_title}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.price} {item.currency}
                  </p>
                </div>

                {item.code && (
                  <div className="text-left space-y-1">
                    <p className="text-xs text-muted-foreground">كود الشراء</p>
                    <p className="font-mono text-sm">{item.code.code_prefix}••••</p>
                    <StatusBadge status={item.code.code_status} />
                    {item.code.code_status === 'delivered' && (
                      <Link
                        href="/redeem"
                        className="block text-xs text-primary mt-1"
                      >
                        تفعيل الآن →
                      </Link>
                    )}
                    {item.code.redeemed_at && item.code.session_id && (
                      <Link
                        href={`/account/downloads/${item.code.session_id}`}
                        className="block text-xs text-primary mt-1"
                      >
                        عرض التنزيل →
                      </Link>
                    )}
                    {item.code.code_status === 'issued' && (
                      <p className="text-xs text-muted-foreground">
                        ينتهي بعد <Countdown to={item.code.expires_at} />
                      </p>
                    )}
                    {item.code.code_status === 'expired' && (
                      <p className="text-xs text-red-600">انتهت صلاحية الكود</p>
                    )}
                  </div>
                )}
              </div>

              {item.attempts && (
                <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                  المحاولات: {item.attempts.used}/{item.attempts.max} مستخدمة —{' '}
                  <b className={item.attempts.remaining === 0 ? 'text-red-600' : ''}>
                    {item.attempts.remaining} متبقية
                  </b>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {compensation_requests.length > 0 && (
        <section>
          <h2 className="font-semibold mb-2">طلبات التعويض</h2>
          <div className="border rounded divide-y text-sm">
            {compensation_requests.map(c => (
              <div key={c.id} className="p-3 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs">التسلسل {c.sequence_number}/3</span>
                  <StatusBadge status={c.status} />
                </div>
                {c.admin_reason && (
                  <p className="text-xs text-muted-foreground">
                    سبب الرفض: {c.admin_reason}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {new Date(c.requested_at).toLocaleString('ar')}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {request.status === 'created' || request.status === 'pending' ? (
        <div className="border rounded p-4 bg-muted/30 text-sm text-muted-foreground">
          <p>طلبك قيد المراجعة. سيتم إرسال كود الشراء عبر البريد أو الهاتف عند الاعتماد.</p>
        </div>
      ) : null}
    </main>
  );
}
