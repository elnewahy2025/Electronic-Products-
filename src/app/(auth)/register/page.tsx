'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const defaultAsSeller = searchParams.get('as') === 'seller';
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [asSeller, setAsSeller] = useState(defaultAsSeller);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          phone: phone.trim(),
          account_type: asSeller ? 'seller' : 'buyer',
        },
      },
    });
    setBusy(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    router.push(asSeller ? '/seller/pending' : '/account');
    router.refresh();
  }

  return (
    <main className="container max-w-md py-16 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">إنشاء حساب جديد</h1>
        <p className="text-sm text-muted-foreground">
          انضم إلى المنصة كمشتري أو بائع للمنتجات الرقمية
        </p>
      </div>

      <form onSubmit={onSubmit} className="border rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-xs mb-1">الاسم الكامل</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            className="w-full border rounded p-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">البريد الإلكتروني</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            dir="ltr"
            className="w-full border rounded p-2 text-sm"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">رقم الهاتف</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            dir="ltr"
            className="w-full border rounded p-2 text-sm"
            placeholder="+20 100 000 0000"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">كلمة المرور</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            dir="ltr"
            className="w-full border rounded p-2 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={asSeller}
            onChange={e => setAsSeller(e.target.checked)}
          />
          <span>التسجيل كبائع (يتطلب اعتماد الإدارة وربط Google Drive)</span>
        </label>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-primary text-primary-foreground rounded p-2.5 font-medium disabled:opacity-50"
        >
          {busy ? 'جارٍ الإنشاء...' : 'إنشاء الحساب'}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        لديك حساب بالفعل؟{' '}
        <Link href="/login" className="text-primary hover:underline">
          تسجيل الدخول
        </Link>
      </p>
    </main>
  );
}
