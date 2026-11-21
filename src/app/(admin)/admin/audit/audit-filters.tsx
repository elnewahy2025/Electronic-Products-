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
    <div className="border rounded p-4 flex flex-wrap gap-2 items-end">
      <div>
        <label className="block text-xs mb-1">الحدث</label>
        <input
          value={action}
          onChange={e => setAction(e.target.value)}
          placeholder="code.issued"
          className="border rounded p-2 text-sm w-48"
        />
      </div>
      <div>
        <label className="block text-xs mb-1">من</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded p-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs mb-1">إلى</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded p-2 text-sm" />
      </div>
      <button onClick={apply} className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm">
        تطبيق
      </button>
      <button
        onClick={() => router.push('/admin/audit')}
        className="border rounded px-4 py-2 text-sm"
      >
        مسح
      </button>
    </div>
  );
}