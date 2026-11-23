import Link from 'next/link';
import { notFound } from 'next/navigation';
import { trackPurchaseByToken } from '@/lib/server/services/purchase-request-service';

export default async function TrackPage({ params }: { params: { token: string } }) {
  const req = await trackPurchaseByToken(params.token);
  if (!req) notFound();

  const statusLabel = {
    created: 'تم الإرسال',
    pending: 'قيد المراجعة',
    approved: 'معتمد',
    rejected: 'مرفوض',
    cancelled: 'ملغى',
    completed: 'مكتمل',
  }[req.status] ?? req.status;

  return (
    <main className="container max-w-2xl py-12 space-y-6">
      <div className="text-center space-y-2">
        <div className="text-4xl">✓</div>
        <h1 className="text-2xl font-bold">طلبك وصلنا بنجاح</h1>
        <p className="text-muted-foreground">
          احتفظ بهذا الرابط لمتابعة طلبك.
        </p>
      </div>

      <div className="border rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">الرقم المرجعي</span>
          <span className="font-mono font-bold">#{req.short_ref}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">المنتج</span>
          <Link href={`/products/${req.product_slug}`} className="text-primary text-sm">
            {req.product_title}
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">المبلغ</span>
          <span className="font-medium">{req.total_amount} {req.currency}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">الحالة</span>
          <span className="font-medium">{statusLabel}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">تاريخ الإرسال</span>
          <span>{new Date(req.created_at).toLocaleString('ar')}</span>
        </div>
      </div>

      <div className="border rounded-lg p-4 bg-muted/30 text-sm space-y-2">
        <p className="font-medium">ما الخطوة التالية؟</p>
        {req.status === 'created' || req.status === 'pending' ? (
          <p className="text-muted-foreground">
            سيراجع فريق الإدارة طلبك ويتواصل معك عبر البريد أو الهاتف الذي أدخلته.
            الدفع يتم خارج المنصة بعد التأكيد.
          </p>
        ) : req.status === 'approved' && req.has_codes ? (
          <p className="text-muted-foreground">
            تم اعتماد طلبك وإصدار الكود. تحقق من بريدك الإلكتروني لاستلام الكود.
            ثم استخدم صفحة <Link href="/redeem" className="text-primary">تفعيل الكود</Link> لبدء التنزيل.
          </p>
        ) : req.status === 'approved' ? (
          <p className="text-muted-foreground">
            تم اعتماد طلبك. الكود سيصلك قريبًا عبر البريد أو الهاتف.
          </p>
        ) : req.status === 'rejected' ? (
          <p className="text-red-700">
            للأسف، تم رفض طلبك. تواصل مع الإدارة لمعرفة السبب.
          </p>
        ) : null}
      </div>

      <div className="text-xs text-muted-foreground text-center space-y-1">
        <p>احتفظ بهذا الرابط: <code className="bg-muted px-1.5 py-0.5 rounded" dir="ltr">{`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/purchase/track/${params.token}`}</code></p>
        <p>إذا كنت مسجّلًا، ستجد الطلب في <Link href="/account/orders" className="text-primary">صفحة طلباتي</Link>.</p>
      </div>

      <div className="flex justify-center gap-3">
        <Link href="/" className="border rounded px-4 py-2 text-sm">الرئيسية</Link>
        <Link href="/products" className="border rounded px-4 py-2 text-sm">تصفح المنتجات</Link>
      </div>
    </main>
  );
}