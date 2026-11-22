'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    if (password !== confirm) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateErr) {
      setError('انتهت صلاحية رابط الاستعادة أو الجلسة غير صالحة. اطلب رابطاً جديداً.');
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push('/login');
      router.refresh();
    }, 1500);
  }

  return (
    <main className="container max-w-md py-16 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-foreground">تعيين كلمة مرور جديدة</h1>
        <p className="text-sm text-muted-foreground">
          اختر كلمة مرور قوية مكونة من 8 أحرف على الأقل.
        </p>
      </div>

      {done ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/30 dark:border-emerald-800 p-6 text-center space-y-3">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
            تم تحديث كلمة المرور بنجاح. جارٍ التحويل لصفحة تسجيل الدخول...
          </p>
          <Link href="/login" className="text-xs text-primary hover:underline">
            الانتقال الآن
          </Link>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-sm"
        >
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              كلمة المرور الجديدة
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              dir="ltr"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              تأكيد كلمة المرور
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={8}
              dir="ltr"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition disabled:opacity-50"
          >
            {busy ? 'جارٍ التحديث...' : 'حفظ كلمة المرور الجديدة'}
          </button>
        </form>
      )}
    </main>
  );
}
