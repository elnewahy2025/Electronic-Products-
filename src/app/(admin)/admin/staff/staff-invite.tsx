'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function StaffInvite() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/admin/staff', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, role_code: role }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg({ type: 'err', text: json.error ?? 'تعذر إضافة العضو' });
    setEmail('');
    setMsg({ type: 'ok', text: 'تمت إضافة العضو إلى الفريق بنجاح.' });
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4"
    >
      <div>
        <h2 className="font-semibold text-base text-foreground">إضافة عضو جديد</h2>
        <p className="text-xs text-muted-foreground mt-1">
          أدخل البريد الإلكتروني لحساب مسجّل لترقيته إلى الفريق الإداري.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-foreground">البريد الإلكتروني</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="member@company.com"
          dir="ltr"
          className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-foreground">الدور المبدئي</label>
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
        >
          <option value="staff">موظف (صلاحيات مخصصة)</option>
          <option value="admin">أدمن (إشراف شامل)</option>
          <option value="super_admin">Super Admin (صلاحية كاملة)</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-primary/90 active:scale-[0.99] transition disabled:opacity-50"
      >
        {busy ? 'جارٍ الإضافة...' : 'إضافة إلى الفريق'}
      </button>

      {msg && (
        <div
          className={`text-xs rounded-xl px-3.5 py-2.5 border ${
            msg.type === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {msg.text}
        </div>
      )}
    </form>
  );
}
