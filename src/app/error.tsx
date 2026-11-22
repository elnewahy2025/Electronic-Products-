'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app-error]', error);
  }, [error]);

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-6 bg-background text-foreground">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center space-y-4 shadow-sm">
        <h1 className="text-xl font-bold text-foreground">حدث خطأ غير متوقع</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          نعتذر عن هذا الخلل المؤقت. يمكنك إعادة المحاولة أو العودة للصفحة الرئيسية.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono" dir="ltr">
            ref: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition"
          >
            إعادة المحاولة
          </button>
          <Link
            href="/"
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted/60 transition"
          >
            الرئيسية
          </Link>
        </div>
      </div>
    </main>
  );
}
