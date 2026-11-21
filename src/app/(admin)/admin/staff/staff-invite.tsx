'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function StaffInvite() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch('/api/admin/staff', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, role_code: role }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(json.error);
    setEmail('');
    setMsg('تمت الإضافة');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border rounded p-4 max-w-md space-y-2">
      <h2 className="font-semibold">إضافة موظف</h2>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="البريد الإلكتروني"
        className="w-full border rounded p-2 text-sm"
        required
      />
      <select
        value={role}
        onChange={e => setRole(e.target.value)}
        className="w-full border rounded p-2 text-sm"
      >
        <option value="staff">موظف</option>
        <option value="admin">أدمن</option>
        <option value="super_admin">Super Admin</option>
      </select>
      <button type="submit" disabled={busy} className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50">
        {busy ? 'جارٍ...' : 'إضافة'}
      </button>
      {msg && <p className="text-sm">{msg}</p>}
    </form>
  );
}