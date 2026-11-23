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
    <div className="space-y-5">
      <nav className="flex flex-wrap items-center gap-2 border-b border-border pb-3" aria-label="أقسام الإعدادات">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`ui-chip ${tab === t.key ? 'ui-chip-active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {!data && (
        <div className="ui-box p-10 text-center text-sm text-muted-foreground">
          جارٍ التحميل...
        </div>
      )}

      {data && (
        <div className="ui-box space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border/70">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
            {msg && (
              <p className={`text-sm ${msg.includes('تم') ? 'text-success' : 'text-destructive'}`}>
                {msg}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ name, value, onChange }: { name: string; value: unknown; onChange: (v: unknown) => void }) {
  const label = name.replace(/_/g, ' ');

  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={value}
          onChange={e => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <span>{label}</span>
      </label>
    );
  }

  if (typeof value === 'number') {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
        <input
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="ui-num w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          dir="ltr"
        />
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{label} (مفصولة بفاصلة)</label>
        <input
          value={value.join(', ')}
          onChange={e => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      />
    </div>
  );
}
