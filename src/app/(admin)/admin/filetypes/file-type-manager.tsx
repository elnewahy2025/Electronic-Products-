'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type FileType = {
  id: string;
  extension: string;
  mime: string;
  is_enabled: boolean;
  max_size_bytes: number | null;
};

export function FileTypeManager({ initial }: { initial: FileType[] }) {
  const [rows, setRows] = useState(initial);
  const [ext, setExt] = useState('');
  const [mime, setMime] = useState('');
  const [maxMB, setMaxMB] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch('/api/admin/filetypes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        extension: ext.replace('.', ''),
        mime,
        max_size_bytes: maxMB ? parseInt(maxMB, 10) * 1024 * 1024 : null,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    setExt(''); setMime(''); setMaxMB('');
    router.refresh();
  }

  async function toggle(id: string, current: boolean) {
    await fetch(`/api/admin/filetypes/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_enabled: !current }),
    });
    setRows(r => r.map(x => x.id === id ? { ...x, is_enabled: !current } : x));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={add} className="border rounded p-4 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
        <div>
          <label className="block text-xs mb-1">الامتداد</label>
          <input value={ext} onChange={e => setExt(e.target.value)} placeholder="pdf" className="w-full border rounded p-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs mb-1">MIME</label>
          <input value={mime} onChange={e => setMime(e.target.value)} placeholder="application/pdf" className="w-full border rounded p-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs mb-1">الحد الأقصى (MB)</label>
          <input type="number" value={maxMB} onChange={e => setMaxMB(e.target.value)} placeholder="فارغ = بلا حد" className="w-full border rounded p-2 text-sm" />
        </div>
        <button type="submit" disabled={busy} className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm">
          إضافة
        </button>
        {error && <p className="text-red-600 text-sm col-span-full">{error}</p>}
      </form>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right p-3">الامتداد</th>
              <th className="text-right p-3">MIME</th>
              <th className="text-right p-3">الحد الأقصى</th>
              <th className="text-right p-3">الحالة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-3 font-mono">{r.extension}</td>
                <td className="p-3 text-xs">{r.mime}</td>
                <td className="p-3 text-xs">{r.max_size_bytes ? `${(r.max_size_bytes / 1024 / 1024).toFixed(0)} MB` : 'بلا حد'}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${r.is_enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {r.is_enabled ? 'مفعّل' : 'معطّل'}
                  </span>
                </td>
                <td className="p-3">
                  <button onClick={() => toggle(r.id, r.is_enabled)} className="text-primary text-xs">
                    {r.is_enabled ? 'تعطيل' : 'تفعيل'}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد أنواع</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}