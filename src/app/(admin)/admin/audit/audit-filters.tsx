'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export function AuditFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [action, setAction] = useState(params.get('action') ?? '');
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');

  function apply() {
    const qs = new URLSearchParams();
    if (action) qs.set('action', action);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    router.push(`/admin/audit?${qs.toString()}`);
  }

  return (
    <section className="ui-box" aria-label="تصفية سجل التدقيق">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-auto space-y-1.5">
          <label htmlFor="audit-action" className="block text-xs font-medium text-muted-foreground">
            الحدث
          </label>
          <input
            id="audit-action"
            value={action}
            onChange={e => setAction(e.target.value)}
            placeholder="code.issued"
            className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div className="w-full sm:w-auto space-y-1.5">
          <label htmlFor="audit-from" className="block text-xs font-medium text-muted-foreground">
            من
          </label>
          <input
            id="audit-from"
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div className="w-full sm:w-auto space-y-1.5">
          <label htmlFor="audit-to" className="block text-xs font-medium text-muted-foreground">
            إلى
          </label>
          <input
            id="audit-to"
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={apply}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          تطبيق
        </button>
        <button
          type="button"
          onClick={() => router.push('/admin/audit')}
          className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          مسح
        </button>
      </div>
    </section>
  );
}
