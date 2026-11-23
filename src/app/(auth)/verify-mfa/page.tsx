'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Mode = 'loading' | 'challenge' | 'enroll';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_MFA_CODE: 'الكود غير صحيح، حاول مجددًا.',
  MFA_TOO_MANY_ATTEMPTS: 'محاولات كثيرة، انتظر قليلًا ثم حاول مجددًا.',
  MFA_NOT_ENROLLED: 'لم يتم إعداد المصادقة الثنائية لهذا الحساب.',
  MFA_SETUP_EXPIRED: 'انتهت صلاحية الإعداد، ابدأ من جديد.',
  MFA_ALREADY_ENROLLED: 'المصادقة الثنائية مفعّلة بالفعل.',
  INVALID_BODY: 'أدخل رمزًا مكوّنًا من 6 أرقام.',
};

function messageFor(code: string | undefined): string {
  return (code && ERROR_MESSAGES[code]) || 'تعذر إتمام المصادقة، حاول مجددًا.';
}

export default function VerifyMfaPage() {
  const [mode, setMode] = useState<Mode>('loading');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawNext = searchParams.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/mfa', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'status' }),
        });
        const status = await res.json();
        if (!res.ok) throw new Error(status?.error);
        if (cancelled) return;
        if (!status.required) {
          router.replace(next);
          return;
        }
        setMode(status.enrolled ? 'challenge' : 'enroll');
      } catch {
        if (!cancelled) {
          setError('تعذر قراءة حالة المصادقة الثنائية.');
          setMode('challenge');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  async function startSetup() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setQr(data.qr);
      setSecret(data.secret);
    } catch (e: any) {
      setError(messageFor(e?.message));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (busy || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError(null);
    try {
      const action = mode === 'enroll' ? 'verify' : 'challenge';
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      router.replace(next);
      router.refresh();
    } catch (e: any) {
      setError(messageFor(e?.message));
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => null);
    router.replace('/login');
    router.refresh();
  }

  return (
    <main className="container max-w-md py-16 space-y-6">
      <h1 className="text-2xl font-bold">المصادقة الثنائية</h1>

      {mode === 'loading' && <p className="text-muted-foreground">جارٍ التحقق...</p>}

      {mode === 'challenge' && (
        <>
          <p className="text-muted-foreground">أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.</p>
          <input
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="w-full border rounded p-3 text-center font-mono text-lg tracking-widest"
            dir="ltr"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            onClick={confirm}
            disabled={busy || code.length !== 6}
            className="bg-primary text-primary-foreground rounded p-3 w-full disabled:opacity-50"
          >
            {busy ? 'جارٍ التحقق...' : 'تحقق'}
          </button>
          <button onClick={signOut} className="text-xs text-muted-foreground underline w-full">
            تسجيل الخروج والدخول بحساب آخر
          </button>
        </>
      )}

      {mode === 'enroll' && (
        <>
          <p className="text-muted-foreground">
            2FA إلزامي لحسابك. لن تتمكن من استخدام المنصة قبل تفعيله.
          </p>
          {!qr ? (
            <button
              onClick={startSetup}
              disabled={busy}
              className="bg-primary text-primary-foreground rounded p-3 w-full disabled:opacity-50"
            >
              {busy ? 'جارٍ الإعداد...' : 'بدء الإعداد'}
            </button>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR" className="mx-auto rounded border p-2 bg-white" />
              {secret && (
                <p className="text-xs text-muted-foreground text-center" dir="ltr">
                  {secret}
                </p>
              )}
              <p className="text-sm">امسح الرمز بتطبيق المصادقة، ثم أدخل الكود الظاهر.</p>
              <input
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="w-full border rounded p-3 text-center font-mono text-lg tracking-widest"
                dir="ltr"
              />
              <button
                onClick={confirm}
                disabled={busy || code.length !== 6}
                className="bg-primary text-primary-foreground rounded p-3 w-full disabled:opacity-50"
              >
                {busy ? 'جارٍ التأكيد...' : 'تأكيد'}
              </button>
              <button onClick={signOut} className="text-xs text-muted-foreground underline w-full">
                تسجيل الخروج والدخول بحساب آخر
              </button>
            </>
          )}
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </>
      )}
    </main>
  );
}
