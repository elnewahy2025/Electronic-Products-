import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center space-y-4 shadow-sm">
        <p className="font-mono text-4xl font-bold text-primary tabular-nums" dir="ltr">
          404
        </p>
        <h1 className="text-xl font-bold">الصفحة غير موجودة</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          الرابط الذي تحاول الوصول إليه غير موجود أو ربما تم نقله.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/"
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition"
          >
            الصفحة الرئيسية
          </Link>
          <Link
            href="/products"
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted/60 transition"
          >
            تصفح المنتجات
          </Link>
        </div>
      </div>
    </main>
  );
}
