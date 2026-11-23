import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { RequestActions } from './request-actions';

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  created: { label: 'منشأ', tone: 'blue' },
  pending: { label: 'قيد المراجعة', tone: 'amber' },
  approved: { label: 'معتمد', tone: 'green' },
  rejected: { label: 'مرفوض', tone: 'red' },
  cancelled: { label: 'ملغى', tone: 'neutral' },
  completed: { label: 'مكتمل', tone: 'green' },
};

const CODE_STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  issued: { label: 'صادر', tone: 'blue' },
  delivered: { label: 'تم التسليم', tone: 'green' },
  redeemed: { label: 'مُفعّل', tone: 'green' },
  expired: { label: 'منتهي', tone: 'red' },
  revoked: { label: 'ملغى', tone: 'red' },
};

export default async function RequestDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
  const statusMeta = STATUS_META[req.status] ?? { label: 'غير معروف', tone: 'neutral' as const };

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">المبيعات</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          تفاصيل طلب الشراء <span className="ui-num">#{req.id.slice(0, 8)}</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          مراجعة بيانات المشتري والبنود والأكواد المرتبطة بهذا الطلب واتخاذ القرار المناسب.
        </p>
        <Link
          href="/admin/requests"
          className="mt-3 inline-flex items-center text-xs font-medium text-primary hover:underline"
        >
          العودة إلى طلبات الشراء
        </Link>
      </header>

      <section className="ui-box space-y-3 text-sm">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <p className="text-foreground">
            <span className="text-muted-foreground">البريد:</span>{' '}
            <span className="ui-num" dir="ltr">{req.customer_email ?? '—'}</span>
          </p>
          <p className="text-foreground">
            <span className="text-muted-foreground">الهاتف:</span>{' '}
            <span className="ui-num" dir="ltr">{req.customer_phone ?? '—'}</span>
          </p>
          {req.full_name && (
            <p className="text-foreground">
              <span className="text-muted-foreground">الاسم:</span> {req.full_name}
            </p>
          )}
        </div>
        {req.buyer_id && (
          <p className="text-xs text-primary">
            مرتبط بحساب مسجّل
            {req.customer_email && (
              <span className="text-muted-foreground">
                {' '}(إن كان البريد مختلفًا عن بريد الحساب، تحقق قبل الإرسال)
              </span>
            )}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">الحالة</span>
          <span className={`ui-badge ui-badge-${statusMeta.tone}`}>{statusMeta.label}</span>
        </div>
        <p className="text-foreground">
          <span className="text-muted-foreground">الإجمالي:</span>{' '}
          <span className="ui-num font-semibold">{req.total_amount} {req.currency}</span>{' '}
          <span className="text-xs text-muted-foreground">
            (~<span className="ui-num">{req.amount_in_usd}</span> USD)
          </span>
        </p>
      </section>

      {req.notes && (
        <section className="ui-box">
          <p className="text-xs font-medium text-muted-foreground mb-1">ملاحظات المشتري:</p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{req.notes}</p>
        </section>
      )}

      {/* تحذير تغيّر السعر */}
      {req.purchase_request_items?.some((item: any) => {
        const currentPrice = Number(item.products?.price_amount ?? 0);
        const requestedPrice = Number(item.unit_price);
        return Math.abs(currentPrice - requestedPrice) > 0.01;
      }) && (
        <section className="ui-box border-warning/40 bg-warning-soft">
          <p className="text-sm font-semibold text-warning">تنبيه: تغيّر سعر المنتج</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/80">
            بعض المنتجات غيّرت سعرها منذ إنشاء الطلب. عند الموافقة، سيُصدر الكود بالسعر المذكور أعلاه.
            إذا كان السعر الجديد مطلوبًا، ارفض الطلب ليُعيد المشتري الإرسال.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">البنود</h2>
          <span className="text-xs text-muted-foreground">
            <span className="ui-num font-semibold text-foreground">{req.purchase_request_items?.length ?? 0}</span> بند
          </span>
        </div>
        <div className="ui-table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="text-right font-semibold px-3.5 py-2.5">المنتج</th>
                <th className="text-right font-semibold px-3.5 py-2.5">السعر</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {req.purchase_request_items?.map((item: any) => (
                <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-3 text-sm text-foreground">{item.products.title}</td>
                  <td className="px-3.5 py-3 text-sm text-foreground ui-num">
                    {item.unit_price} {item.currency}
                  </td>
                </tr>
              ))}
              {!req.purchase_request_items?.length && (
                <tr>
                  <td colSpan={2} className="p-10 text-center text-sm text-muted-foreground">
                    لا توجد بنود لعرضها في هذا الطلب.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {alreadyApproved && req.orders?.[0]?.order_items && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">الأكواد الصادرة</h2>
          <div className="ui-table-wrap">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th className="text-right font-semibold px-3.5 py-2.5">الكود</th>
                  <th className="text-right font-semibold px-3.5 py-2.5">الحالة</th>
                  <th className="text-right font-semibold px-3.5 py-2.5">ينتهي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {req.orders[0].order_items.map((oi: any) =>
                  oi.purchase_codes?.map((code: any) => {
                    const codeMeta = CODE_STATUS_META[code.status] ?? {
                      label: 'غير معروف',
                      tone: 'neutral' as const,
                    };
                    return (
                      <tr key={code.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3.5 py-3 text-sm font-medium text-foreground font-mono ui-num">
                          {code.code_prefix}••••
                        </td>
                        <td className="px-3.5 py-3">
                          <span className={`ui-badge ui-badge-${codeMeta.tone}`}>{codeMeta.label}</span>
                        </td>
                        <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num">
                          {new Date(code.expires_at).toLocaleString('ar')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!alreadyApproved && req.status !== 'rejected' && req.status !== 'cancelled' && (
        <RequestActions
          requestId={params.id}
          totalAmount={Number(req.total_amount)}
          currency={String(req.currency)}
        />
      )}
    </main>
  );
}
