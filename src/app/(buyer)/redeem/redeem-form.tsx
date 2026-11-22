'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const MAX_LEN = 19; // ABCD-EFGH-JKLM-NPQR

function formatCode(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16);
  const groups = clean.match(/.{1,4}/g) ?? [];
  return groups.join('-');
}

export function RedeemForm() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState(() => formatCode(searchParams.get('code') ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const normalized = code.replace(/-/g, '');
  const isComplete = normalized.length === 16;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isComplete) return;

    setError(null);
    setRetryAfter(null);
    setLoading(true);

    const res = await fetch('/api/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? 'تعذر تفعيل الكود.');
      if (res.status === 429) {
        const retry = parseInt(res.headers.get('retry-after') ?? '60', 10);
        setRetryAfter(retry);
      }
      return;
    }

    router.push(`/account/downloads/${json.session_id}`);
    router.refresh();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCode(formatCode(e.target.value));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    setCode(formatCode(text));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-xs mb-1 text-muted-foreground">كود الشراء</label>
        <input
          value={code}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder="ABCD-EFGH-JKLM-NPQR"
          maxLength={MAX_LEN}
          dir="ltr"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          className="w-full border rounded-lg p-4 text-center font-mono tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground mt-1 text-center">
          {normalized.length}/16 حرفًا
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          <p>{error}</p>
          {retryAfter !== null && (
            <p className="text-xs mt-1">
              يمكنك المحاولة بعد {retryAfter} ثانية.
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={!isComplete || loading}
        className="w-full bg-primary text-primary-foreground rounded-lg p-3 font-medium disabled:opacity-50"
      >
        {loading ? 'جارٍ التفعيل...' : 'تفعيل الكود وبدء التنزيل'}
      </button>

      <div className="border rounded p-3 bg-muted/30 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">ملاحظات:</p>
        <ul className="list-disc pr-5 space-y-0.5">
          <li>الكود يجب أن يكون مسجّلًا بنفس البريد الذي سجّلت الدخول به.</li>
          <li>صلاحية الكود 72 ساعة من إصداره.</li>
          <li>يُفعّل الكود مرة واحدة فقط.</li>
          <li>بعد التفعيل تبدأ جلسة تنزيل مدتها 4 ساعات.</li>
        </ul>
      </div>
    </form>
  );
}