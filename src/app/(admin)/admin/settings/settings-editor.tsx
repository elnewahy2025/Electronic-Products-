'use client';

import { useEffect, useState } from 'react';

const TABS = [
  { key: 'general', label: 'عامة' },
  { key: 'pricing', label: 'التسعير' },
  { key: 'download', label: 'التنزيل' },
  { key: 'compensation', label: 'التعويض' },
  { key: 'attempt_exception', label: 'استثناء المحاولات' },
  { key: 'watermark', label: 'العلامة المائية' },
  { key: 'backup', label: 'النسخ الاحتياطي' },
  { key: 'audit', label: 'سجل التدقيق' },
  { key: 'security', label: 'الأمان' },
  { key: 'payout', label: 'المستحقات' },
  { key: 'commission', label: 'العمولات' },
] as const;

type Tab = typeof TABS[number]['key'];

export function SettingsEditor() {
  const [tab, setTab] = useState<Tab>('general');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load(t: Tab) {
    setData(null); setMsg(null);
    const res = await fetch(`/api/admin/settings/${t}`);
    const json = await res.json();
    if (res.ok) setData(json.settings);
    else setMsg(json.error);
  }

  useEffect(() => { load(tab); }, [tab]);

  async function save() {
    if (!data) return;
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/admin/settings/${tab}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    setBusy(false);
    setMsg(res.ok ? 'تم الحفظ' : json.error);
  }

  function update(key: string, value: unknown) {
    setData(d => ({ ...d, [key]: value }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-sm px-3 py-1 rounded ${tab === t.key ? 'bg-primary text-primary-foreground' : 'border'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!data && <p className="text-muted-foreground">جارٍ التحميل...</p>}

      {data && (
        <div className="border rounded p-4 space-y-3 max-w-2xl">
          {Object.entries(data)
            .filter(([k]) => !['id', 'updated_by', 'updated_at'].includes(k))
            .map(([key, value]) => (
              <Field
                key={key}
                name={key}
                value={value}
                onChange={v => update(key, v)}
              />
            ))}
          <button
            onClick={save}
            disabled={busy}
            className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {busy ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
          {msg && <p className={`text-sm ${msg.includes('تم') ? 'text-green-600' : 'text-red-600'}`}>{msg}</p>}
        </div>
      )}
    </div>
  );
}

function Field({ name, value, onChange }: { name: string; value: unknown; onChange: (v: unknown) => void }) {
  const label = name.replace(/_/g, ' ');

  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value}
          onChange={e => onChange(e.target.checked)}
        />
        {label}
      </label>
    );
  }

  if (typeof value === 'number') {
    return (
      <div>
        <label className="block text-xs mb-1">{label}</label>
        <input
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full border rounded p-2 text-sm"
        />
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div>
        <label className="block text-xs mb-1">{label} (مفصولة بفاصلة)</label>
        <input
          value={value.join(', ')}
          onChange={e => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          className="w-full border rounded p-2 text-sm"
        />
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs mb-1">{label}</label>
      <input
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        className="w-full border rounded p-2 text-sm"
      />
    </div>
  );
}