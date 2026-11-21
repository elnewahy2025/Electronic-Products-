'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ProfileForm({
  initialFullName,
  initialPhone,
  initialAvatarUrl,
}: {
  initialFullName: string;
  initialPhone: string;
  initialAvatarUrl: string;
}) {
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const res = await fetch('/api/account/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        avatar_url: avatarUrl.trim() || undefined,
      }),
    });
    const json = await res.json();
    setBusy(false);

    if (!res.ok) return setMsg({ type: 'err', text: json.error ?? 'حدث خطأ' });
    setMsg({ type: 'ok', text: 'تم الحفظ' });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border rounded p-4 space-y-3">
      <h2 className="font-semibold">تعديل البيانات</h2>

      <div>
        <label className="block text-xs mb-1 text-muted-foreground">الاسم الكامل</label>
        <input
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          maxLength={100}
          className="w-full border rounded p-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs mb-1 text-muted-foreground">رقم الهاتف</label>
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          maxLength={20}
          dir="ltr"
          placeholder="+20 100 000 0000"
          className="w-full border rounded p-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs mb-1 text-muted-foreground">رابط الصورة الشخصية (اختياري)</label>
        <input
          value={avatarUrl}
          onChange={e => setAvatarUrl(e.target.value)}
          placeholder="https://..."
          dir="ltr"
          className="w-full border rounded p-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {busy ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
      </button>

      {msg && (
        <p className={`text-sm ${msg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
