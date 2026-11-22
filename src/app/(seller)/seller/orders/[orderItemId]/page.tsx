import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import {
  getDisplayStatus,
  getSellerOrderDetail,
} from '@/lib/server/services/seller-order-service';

const VARIANT_CLASSES: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700 border-slate-200',
  yellow: 'bg-amber-50 text-amber-800 border-amber-200',
  blue: 'bg-sky-50 text-sky-800 border-sky-200',
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  orange: 'bg-orange-50 text-orange-800 border-orange-200',
  red: 'bg-red-50 text-red-800 border-red-200',
};

const CODE_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  issued: { label: 'صادر (بانتظار التسليم)', cls: VARIANT_CLASSES.yellow },
  delivered: { label: 'تم التسليم للمشتري', cls: VARIANT_CLASSES.blue },
  redeemed: { label: 'مُفعّل', cls: VARIANT_CLASSES.green },
  expired: { label: 'منتهي الصلاحية', cls: VARIANT_CLASSES.gray },
  revoked: { label: 'ملغى', cls: VARIANT_CLASSES.red },
};

const SESSION_STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active: { label: 'جلسة نشطة', cls: VARIANT_CLASSES.green },
  completed: { label: 'مكتملة', cls: VARIANT_CLASSES.green },
  compensation_active: { label: 'جلسة تعويضية نشطة', cls: VARIANT_CLASSES.blue },
  compensation_pending: { label: 'تعويض بانتظار التنفيذ', cls: VARIANT_CLASSES.yellow },
  expired_partial: { label: 'انتهت جزئيًا', cls: VARIANT_CLASSES.orange },
  exhausted: { label: 'استنفدت المحاولات', cls: VARIANT_CLASSES.red },
  expired: { label: 'منتهية', cls: VARIANT_CLASSES.gray },
  revoked: { label: 'ملغاة', cls: VARIANT_CLASSES.red },
};

const CHANNEL_LABELS: Record<string, string> = {
  email: 'بريد إلكتروني',
  sms: 'رسالة نصية',
  manual: 'تسليم يدوي',
};

const TX_TYPE_LABELS: Record<string, string> = {
  earning: 'إيراد مبيعة',
  commission: 'عمولة المنصة',
  refund: 'استرداد',
  adjustment: 'تسوية',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ar', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function SellerOrderDetailPage({
  params,
}: {
  params: { orderItemId: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.accountType !== 'seller') redirect('/');

  const detail = await getSellerOrderDetail(params.orderItemId);
  if (!detail) notFound();

  const latestCode = detail.codes[0] ?? null;
  const latestSession = detail.sessions[0] ?? null;
  const overallStatus = getDisplayStatus({
    code_status: latestCode?.status ?? null,
    session_status: latestSession?.status ?? null,
  });
  const overallBadge = VARIANT_CLASSES[overallStatus.variant] ?? VARIANT_CLASSES.gray;
  const attemptsPct = detail.attempts_max > 0
    ? Math.min(100, Math.round((detail.attempts_used / detail.attempts_max) * 100))
    : 0;

  return (
    <main className="p-6 max-w-6xl space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/seller/orders" className="hover:text-primary hover:underline">
              مبيعاتي
            </Link>
            <span>/</span>
            <span className="font-mono" dir="ltr">
              {detail.order_item_id.slice(0, 8)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              تفاصيل المبيعة
            </h1>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${overallBadge}`}>
              {overallStatus.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            بتاريخ {formatDateTime(detail.ordered_at)} — معرف البند{' '}
            <span className="font-mono text-xs text-foreground" dir="ltr">
              {detail.order_item_id}
            </span>
          </p>
        </div>

        <Link
          href="/seller/orders"
          className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60 active:scale-[0.98] transition"
        >
          العودة للمبيعات ←
        </Link>
      </div>

      {/* Asymmetric 12-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 4-column summary rail */}
        <aside className="lg:col-span-4 space-y-5 lg:sticky lg:top-6">
          {/* Product Card */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              المنتج المباع
            </h2>
            <div className="flex items-start gap-3">
              {detail.cover_image_url ? (
                <img
                  src={detail.cover_image_url}
                  alt={detail.product_title}
                  className="w-16 h-16 rounded-xl object-cover border border-border shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-muted border border-border flex items-center justify-center text-xs text-muted-foreground shrink-0">
                  بدون صورة
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <Link
                  href={`/products/${detail.product_slug}`}
                  className="font-semibold text-foreground hover:text-primary hover:underline line-clamp-2"
                >
                  {detail.product_title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  الإصدار المباع:{' '}
                  <span className="font-mono text-foreground" dir="ltr">
                    v{detail.version_number}
                  </span>
                </p>
              </div>
            </div>
          </section>

          {/* Financial Breakdown (Snapshotted at Sale) */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                التفاصيل المالية (مثبّتة وقت البيع)
              </h2>
              <Link href="/seller/wallet" className="text-xs text-primary hover:underline">
                المحفظة
              </Link>
            </div>

            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">سعر البيع الإجمالي</dt>
                <dd className="font-mono tabular-nums font-medium" dir="ltr">
                  {detail.price.toFixed(2)} {detail.currency}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">
                  عمولة المنصة ({(detail.commission_rate_at_sale * 100).toFixed(1)}%)
                </dt>
                <dd className="font-mono tabular-nums text-red-700" dir="ltr">
                  -{detail.commission_amount.toFixed(2)} {detail.currency}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2.5">
                <dt className="font-semibold text-foreground">صافي مستحق البائع</dt>
                <dd className="font-mono tabular-nums font-bold text-emerald-700 text-base" dir="ltr">
                  {detail.net_seller_amount.toFixed(2)} {detail.currency}
                </dd>
              </div>
            </dl>

            {detail.ledger_transactions.length > 0 && (
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  قيود المحفظة المرتبطة
                </p>
                <ul className="space-y-1.5">
                  {detail.ledger_transactions.map(tx => (
                    <li
                      key={tx.id}
                      className="flex items-center justify-between text-xs bg-muted/50 rounded-lg px-3 py-2"
                    >
                      <span className="text-foreground">
                        {TX_TYPE_LABELS[tx.type] ?? tx.type}
                      </span>
                      <span
                        className={`font-mono tabular-nums font-medium ${
                          tx.amount >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                        dir="ltr"
                      >
                        {tx.amount >= 0 ? '+' : ''}
                        {tx.amount.toFixed(2)} {tx.currency}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Masked Buyer & Privacy Notice */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              المشتري (مقنّع للخصوصية)
            </h2>
            <p className="font-mono text-sm text-foreground bg-muted/60 rounded-lg px-3 py-2" dir="ltr">
              {detail.buyer_masked}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              لحماية خصوصية المشتري وسياسة المنصة كوسيط وحيد، لا تُعرض بيانات الاتصال الكاملة
              أو عنوان IP. استخدم بادئة الكود ومعرف البند عند التواصل مع الدعم.
            </p>
          </section>
        </aside>

        {/* 8-column main workspace */}
        <div className="lg:col-span-8 space-y-6">
          {/* Purchase Codes & Delivery Attempts */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                أكواد الشراء وحالة التسليم
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {detail.codes.length} كود
              </span>
            </div>

            {detail.codes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-xl">
                لم يُصدر كود شراء لهذا البند بعد.
              </p>
            ) : (
              <div className="space-y-4">
                {detail.codes.map(code => {
                  const st = CODE_STATUS_LABELS[code.status] ?? {
                    label: code.status,
                    cls: VARIANT_CLASSES.gray,
                  };
                  return (
                    <div
                      key={code.id}
                      className="rounded-xl border border-border bg-muted/20 p-4 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="font-mono text-base font-bold tracking-wider bg-card border border-border px-3 py-1 rounded-lg tabular-nums"
                            dir="ltr"
                          >
                            {code.code_prefix}-****-****-****
                          </span>
                          {code.is_replacement && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                              كود بديل
                            </span>
                          )}
                        </div>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${st.cls}`}>
                          {st.label}
                        </span>
                      </div>

                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="rounded-lg bg-card border border-border/70 p-2.5">
                          <dt className="text-muted-foreground">تاريخ الإصدار</dt>
                          <dd className="mt-1 font-medium text-foreground">
                            {formatDateTime(code.issued_at)}
                          </dd>
                        </div>
                        <div className="rounded-lg bg-card border border-border/70 p-2.5">
                          <dt className="text-muted-foreground">تاريخ التسليم</dt>
                          <dd className="mt-1 font-medium text-foreground">
                            {formatDateTime(code.delivered_at)}
                            {code.delivery_confirmation_method && (
                              <span className="text-muted-foreground mr-1">
                                ({code.delivery_confirmation_method === 'auto' ? 'تلقائي' : 'يدوي'})
                              </span>
                            )}
                          </dd>
                        </div>
                        <div className="rounded-lg bg-card border border-border/70 p-2.5">
                          <dt className="text-muted-foreground">تاريخ التفعيل</dt>
                          <dd className="mt-1 font-medium text-foreground">
                            {formatDateTime(code.redeemed_at)}
                          </dd>
                        </div>
                        <div className="rounded-lg bg-card border border-border/70 p-2.5">
                          <dt className="text-muted-foreground">
                            {code.revoked_at ? 'تاريخ الإلغاء' : 'صلاحية الكود حتى'}
                          </dt>
                          <dd className="mt-1 font-medium text-foreground">
                            {formatDateTime(code.revoked_at ?? code.expires_at)}
                          </dd>
                        </div>
                      </dl>

                      {code.delivery_attempts.length > 0 && (
                        <div className="pt-2 border-t border-border/70 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            محاولات تسليم الكود
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {code.delivery_attempts.map(att => (
                              <div
                                key={att.id}
                                className="inline-flex items-center gap-2 text-xs bg-card border border-border rounded-lg px-3 py-1.5"
                              >
                                <span className="font-medium">
                                  {CHANNEL_LABELS[att.channel] ?? att.channel}
                                </span>
                                <span
                                  className={
                                    att.result === 'sent' ? 'text-emerald-700' : 'text-red-700'
                                  }
                                >
                                  {att.result === 'sent' ? 'تم الإرسال' : 'فشل'}
                                </span>
                                <span className="text-muted-foreground">
                                  {formatDateTime(att.sent_at)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Attempts Progress */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                محاولات التنزيل
              </h2>
              <span className="font-mono text-sm font-semibold tabular-nums text-foreground" dir="ltr">
                {detail.attempts_used} / {detail.attempts_max}
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${attemptsPct}%` }}
              />
            </div>

            {detail.attempts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                لم يستهلك المشتري أي محاولة تنزيل بعد.
              </p>
            ) : (
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-muted/70">
                    <tr>
                      <th className="text-right p-2.5">رقم المحاولة</th>
                      <th className="text-right p-2.5">النوع</th>
                      <th className="text-right p-2.5">التوقيت</th>
                      <th className="text-right p-2.5">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.attempts.map(att => (
                      <tr key={att.id} className="border-t border-border">
                        <td className="p-2.5 font-mono tabular-nums" dir="ltr">
                          #{att.attempt_number}
                        </td>
                        <td className="p-2.5">
                          {att.type === 'zip' ? 'ملف مضغوط (ZIP)' : 'ملفات فردية'}
                        </td>
                        <td className="p-2.5 text-muted-foreground">
                          {formatDateTime(att.consumed_at)}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full border ${
                              att.completed
                                ? VARIANT_CLASSES.green
                                : VARIANT_CLASSES.yellow
                            }`}
                          >
                            {att.completed ? 'مكتملة' : 'غير مكتملة'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Download Sessions & File Deliveries */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                جلسات التنزيل وتسليمات الملفات
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {detail.sessions.length} جلسة
              </span>
            </div>

            {detail.sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-xl">
                لم تبدأ أي جلسة تنزيل لهذه المبيعة بعد.
              </p>
            ) : (
              <div className="space-y-4">
                {detail.sessions.map((session, idx) => {
                  const st = SESSION_STATUS_LABELS[session.status] ?? {
                    label: session.status,
                    cls: VARIANT_CLASSES.gray,
                  };
                  return (
                    <div
                      key={session.id}
                      className="rounded-xl border border-border overflow-hidden"
                    >
                      <div className="bg-muted/40 px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-border">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            جلسة #{detail.sessions.length - idx}
                          </span>
                          {session.is_compensation && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                              تعويضية
                            </span>
                          )}
                          <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                            {session.id.slice(0, 8)}
                          </span>
                        </div>
                        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${st.cls}`}>
                          {st.label}
                        </span>
                      </div>

                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-muted-foreground block">بدأت في</span>
                            <span className="font-medium text-foreground">
                              {formatDateTime(session.started_at)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">تنتهي في</span>
                            <span className="font-medium text-foreground">
                              {formatDateTime(session.expires_at)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">انتهت فعليًا</span>
                            <span className="font-medium text-foreground">
                              {formatDateTime(session.ended_at ?? session.revoked_at)}
                            </span>
                          </div>
                        </div>

                        {session.deliveries.length === 0 ? (
                          <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2.5">
                            لا توجد عمليات تسليم ملفات مسجّلة داخل هذه الجلسة.
                          </p>
                        ) : (
                          <div className="overflow-x-auto border border-border rounded-lg">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/60">
                                <tr>
                                  <th className="text-right p-2.5">الملف</th>
                                  <th className="text-right p-2.5">النوع</th>
                                  <th className="text-right p-2.5">الحجم المرسل</th>
                                  <th className="text-right p-2.5">التوقيت</th>
                                  <th className="text-right p-2.5">الحالة</th>
                                </tr>
                              </thead>
                              <tbody>
                                {session.deliveries.map(dl => (
                                  <tr key={dl.id} className="border-t border-border">
                                    <td className="p-2.5 font-medium text-foreground">
                                      {dl.file_name}
                                    </td>
                                    <td className="p-2.5 text-muted-foreground">
                                      {dl.delivery_type === 'zip' ? 'ZIP' : 'ملف مفرد'}
                                    </td>
                                    <td className="p-2.5 font-mono tabular-nums text-muted-foreground" dir="ltr">
                                      {formatBytes(dl.bytes_sent ?? dl.file_size_bytes)}
                                    </td>
                                    <td className="p-2.5 text-muted-foreground">
                                      {formatDateTime(dl.delivered_at)}
                                    </td>
                                    <td className="p-2.5">
                                      {dl.completed ? (
                                        <span className={`px-2 py-0.5 rounded-full border ${VARIANT_CLASSES.green}`}>
                                          تم التسليم
                                        </span>
                                      ) : (
                                        <span
                                          className={`px-2 py-0.5 rounded-full border ${VARIANT_CLASSES.red}`}
                                          title={dl.failure_reason ?? undefined}
                                        >
                                          لم يكتمل
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
