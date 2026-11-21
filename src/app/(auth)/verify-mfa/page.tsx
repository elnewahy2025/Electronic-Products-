'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function VerifyMfaPage() {
  const [stage, setStage] = useState<'intro' | 'setup' | 'verify'>('intro');
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function startSetup() {
    const res = await fetch('/api/auth/mfa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setQr(data.qr);
    setStage('setup');
  }

  async function verify() {
    setError(null);
    const res = await fetch('/api/auth/mfa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'verify', code }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    router.push('/');
    router.refresh();
  }

  return (
    <main className="container max-w-md py-16 space-y-6">
      <h1 className="text-2xl font-bold">المصادقة الثنائية</h1>
      <p className="text-muted-foreground">
        2FA إلزامي لحسابك. لن تتمكن من استخدام المنصة قبل تفعيله.
      </p>

      {stage === 'intro' && (
        <button onClick={startSetup} className="bg-primary text-primary-foreground rounded p-3 w-full">
          بدء الإعداد
        </button>
      )}

      {stage === 'setup' && qr && (
        <>
          <img src={qr} alt="QR" className="mx-auto rounded border p-2 bg-white" />
          <p className="text-sm">امسح الرمز بتطبيق المصادقة، ثم أدخل الكود الظاهر.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            className="w-full border rounded p-3 text-center font-mono text-lg tracking-widest"
            dir="ltr"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button onClick={verify} className="bg-primary text-primary-foreground rounded p-3 w-full">
            تأكيد
          </button>
        </>
      )}
    </main>
  );
}