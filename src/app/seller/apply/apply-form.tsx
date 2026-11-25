'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SellerApplyForm({ defaultDisplayName }: { defaultDisplayName: string }) {
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/seller/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName.trim(),
          bio: bio.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error === 'INVALID_BODY' ? 'يرجى إدخال اسم متجر صالح (حرفان على الأقل).' : 'تعذر إرسال طلب البائع. حاول مرة أخرى.');
        setBusy(false);
        return;
      }

      router.push(json.redirect ?? '/seller/pending');
      router.refresh();
    } catch {
      setError('تعذر الاتصال بالخادم. حاول مرة أخرى.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 text-right">
      <div>
        <label htmlFor="seller-display-name" className="block text-xs font-medium text-muted-foreground mb-1">
          اسم المتجر / البائع
        </label>
        <input
          id="seller-display-name"
          name="display_name"
          type="text"
          required
          minLength={2}
          maxLength={80}
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="مثال: استوديو القوالب الرقمية"
          className="w-full border border-border rounded-lg bg-background text-foreground p-2.5 text-sm"
        />
      </div>

      <div>
        <label htmlFor="seller-bio" className="block text-xs font-medium text-muted-foreground mb-1">
          نبذة مختصرة عن منتجاتك (اختياري)
        </label>
        <textarea
          id="seller-bio"
          name="bio"
          rows={3}
          maxLength={500}
          value={bio}
          onChange={e => setBio(e.target.value)}
          placeholder="صف نوع المنتجات الرقمية التي ستعرضها على المنصة..."
          className="w-full border border-border rounded-lg bg-background text-foreground p-2.5 text-sm"
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={busy || displayName.trim().length < 2}
        className="w-full rounded-[9px] bg-primary text-primary-foreground py-2.5 px-4 text-sm font-semibold hover:opacity-95 transition disabled:opacity-50"
      >
        {busy ? 'جارٍ إرسال الطلب...' : 'إرسال طلب الاعتماد كبائع'}
      </button>
    </form>
  );
}
