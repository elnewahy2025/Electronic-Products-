'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';
  const reason = searchParams.get('reason');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signInError) {
      setError('بيانات الدخول غير صحيحة.');
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthErr) {
      setBusy(false);
      setError(oauthErr.message);
    }
  }

  return (
    <main className="container max-w-md py-16 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">تسجيل الدخول</h1>
        <p className="text-sm text-muted-foreground">
          ادخل إلى حسابك لإدارة طلباتك أو متجرك
        </p>
      </div>

      {reason && (
        <div className="border border-orange-300 bg-orange-50 text-orange-900 rounded p-3 text-xs">
          {reason === 'inactive' ? 'تم إيقاف الحساب.' : 'تعذر إتمام الدخول، حاول مجددًا.'}
        </div>
      )}

      <form onSubmit={onSubmit} className="border rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-xs mb-1">البريد الإلكتروني</label>
          <input
            type="email"
            name="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            dir="ltr"
            className="w-full border rounded p-2 text-sm"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">كلمة المرور</label>
          <input
            type="password"
            name="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            dir="ltr"
            className="w-full border rounded p-2 text-sm"
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-primary text-primary-foreground rounded p-2.5 font-medium disabled:opacity-50"
        >
          {busy ? 'جارٍ الدخول...' : 'دخول'}
        </button>

        <div className="relative py-2 text-center text-xs text-muted-foreground">
          <span>أو</span>
        </div>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy}
          className="w-full border rounded p-2.5 text-sm font-medium hover:bg-muted/50 disabled:opacity-50"
        >
          الدخول بواسطة Google
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        ليس لديك حساب؟{' '}
        <Link href="/register" className="text-primary hover:underline">
          إنشاء حساب جديد
        </Link>
      </p>
    </main>
  );
}
