'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      },
    );
    setBusy(false);
    if (resetErr) {
      setError('تعذّر إرسال رابط الاستعادة حالياً. يرجى المحاولة لاحقاً.');
      return;
    }
    setSent(true);
  }

  return (
    <main className="container max-w-md py-16 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-foreground">استعادة كلمة المرور</h1>
        <p className="text-sm text-muted-foreground">
          أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.
        </p>
      </div>

      {sent ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/30 dark:border-emerald-800 p-6 space-y-4 text-center">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
            إذا كان البريد الإلكتروني مسجّلاً لدينا، فقد تم إرسال رابط إعادة تعيين كلمة المرور إليه.
          </p>
          <p className="text-xs text-muted-foreground">
            تحقق من صندوق الوارد أو مجلد الرسائل غير المرغوب فيها.
          </p>
          <Link
            href="/login"
            className="inline-block rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            العودة لتسجيل الدخول
          </Link>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm"
        >
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              البريد الإلكتروني
            </label>
            <input
              type="email"
              name="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              dir="ltr"
              placeholder="you@example.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition disabled:opacity-50"
          >
            {busy ? 'جارٍ الإرسال...' : 'إرسال رابط الاستعادة'}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        تذكّرت كلمة المرور؟{' '}
        <Link href="/login" className="text-primary hover:underline">
          تسجيل الدخول
        </Link>
      </p>
    </main>
  );
}
