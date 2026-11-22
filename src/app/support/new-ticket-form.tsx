'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function NewTicketForm() {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'تعذّر فتح التذكرة.');
      } else {
        setSubject('');
        setMessage('');
        router.push(`/support/${json.ticket.id}`);
        router.refresh();
      }
    } catch {
      setError('تعذّر الاتصال بالخادم.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4"
    >
      <h2 className="text-base font-semibold text-foreground">فتح تذكرة دعم جديدة</h2>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">الموضوع</label>
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          required
          minLength={4}
          maxLength={200}
          placeholder="ملخص سريع للمشكلة أو الاستفسار"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">التفاصيل</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          required
          minLength={10}
          maxLength={5000}
          rows={4}
          placeholder="اشرح مشكلتك بوضوح (يمكنك تضمين رقم الطلب أو بادئة الكود إن وُجد)"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition disabled:opacity-50"
      >
        {busy ? 'جارٍ الإرسال...' : 'إرسال التذكرة'}
      </button>
    </form>
  );
}
