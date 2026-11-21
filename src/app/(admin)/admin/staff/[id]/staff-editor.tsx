'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Permission = {
  code: string;
  description: string | null;
  from_role: boolean;
  has_override: boolean;
  effective: boolean;
};

type Detail = {
  profile_id: string;
  email: string;
  full_name: string | null;
  account_type: string;
  status: string;
  role_code: string | null;
  role_name: string | null;
  member_status: string | null;
  granted_at: string | null;
  is_self: boolean;
  permissions: Permission[];
};

type Role = { code: string; name: string };

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'أدمن',
  staff: 'موظف',
};

const GROUP_LABEL: Record<string, string> = {
  settings: 'الإعدادات',
  role: 'الأدوار',
  permission: 'الصلاحيات',
  staff: 'الموظفون',
  seller: 'البائعون',
  product: 'المنتجات',
  category: 'التصنيفات',
  filetype: 'أنواع الملفات',
  file: 'الملفات',
  code: 'الأكواد',
  download: 'التنزيل',
  compensation: 'التعويض',
  commission: 'العمولات',
  exchange_rate: 'أسعار الصرف',
  payout: 'المدفوعات',
  wallet: 'المحافظ',
  review: 'التقييمات',
  report: 'البلاغات',
  support: 'الدعم',
  security: 'الأمان',
  backup: 'النسخ الاحتياطي',
  retention: 'الاحتفاظ',
  audit: 'سجل التدقيق',
};

function groupKey(code: string): string {
  return code.split('.')[0] ?? 'other';
}

export function StaffEditor({
  detail,
  roles,
  canEdit,
}: {
  detail: Detail;
  roles: Role[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busyPerm, setBusyPerm] = useState<string | null>(null);
  const [busyRole, setBusyRole] = useState(false);
  const [busyRemove, setBusyRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removeReason, setRemoveReason] = useState('');

  const [roleCode, setRoleCode] = useState(detail.role_code ?? 'staff');

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of detail.permissions) {
      const g = groupKey(p.code);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [detail.permissions]);

  async function toggleOverride(perm: Permission) {
    if (!canEdit) return;
    setBusyPerm(perm.code);
    setError(null); setMsg(null);

    const action = perm.has_override ? 'revoke' : 'grant';
    const res = await fetch(`/api/admin/staff/${detail.profile_id}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ permission_code: perm.code }),
    });
    const json = await res.json();
    setBusyPerm(null);

    if (!res.ok) return setError(json.error ?? 'حدث خطأ');
    router.refresh();
  }

  async function changeRole() {
    if (!canEdit || roleCode === detail.role_code) return;
    if (!confirm(`تغيير دور ${detail.email} إلى "${ROLE_LABEL[roleCode] ?? roleCode}"؟`)) return;

    setBusyRole(true);
    setError(null); setMsg(null);

    const res = await fetch(`/api/admin/staff/${detail.profile_id}/role`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role_code: roleCode }),
    });
    const json = await res.json();
    setBusyRole(false);

    if (!res.ok) {
      const map: Record<string, string> = {
        cannot_demote_self: 'لا يمكنك تخفيض دورك بنفسك',
        cannot_remove_last_super_admin: 'لا يمكن إزالة آخر Super Admin',
        role_not_found: 'الدور غير موجود',
      };
      return setError(map[json.error] ?? json.error);
    }
    setMsg('تم تحديث الدور');
    router.refresh();
  }

  async function removeStaff() {
    if (!canEdit) return;
    setBusyRemove(true);
    setError(null); setMsg(null);

    const res = await fetch(`/api/admin/staff/${detail.profile_id}/remove`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: removeReason || 'staff_removed' }),
    });
    const json = await res.json();
    setBusyRemove(false);

    if (!res.ok) {
      const map: Record<string, string> = {
        cannot_remove_self: 'لا يمكنك إزالة نفسك',
        cannot_remove_last_super_admin: 'لا يمكن إزالة آخر Super Admin',
      };
      return setError(map[json.error] ?? json.error);
    }

    router.push('/admin/staff');
    router.refresh();
  }

  const effectiveCount = detail.permissions.filter(p => p.effective).length;
  const overrideCount = detail.permissions.filter(p => p.has_override).length;

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="border border-orange-200 bg-orange-50 rounded p-3 text-sm text-orange-900">
          أنت لا تملك صلاحية Super Admin. العرض للقراءة فقط.
        </div>
      )}

      {/* Role section */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold">الدور</h2>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={roleCode}
            onChange={e => setRoleCode(e.target.value)}
            disabled={!canEdit || busyRole}
            className="border rounded p-2 text-sm min-w-[200px]"
          >
            {roles.map(r => (
              <option key={r.code} value={r.code}>
                {ROLE_LABEL[r.code] ?? r.name}
              </option>
            ))}
          </select>

          <button
            onClick={changeRole}
            disabled={!canEdit || busyRole || roleCode === detail.role_code}
            className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {busyRole ? '...' : 'تحديث الدور'}
          </button>

          <span className="text-xs text-muted-foreground">
            الدور الحالي: <b>{detail.role_code ? ROLE_LABEL[detail.role_code] ?? detail.role_name : 'لا يوجد'}</b>
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          تغيير الدور يمنح/يسحب الصلاحيات الموروثة من الدور، لكنه لا يمس الصلاحيات الفردية.
        </p>
      </section>

      {/* Permissions section */}
      <section className="border rounded">
        <header className="p-4 border-b flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold">الصلاحيات</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {effectiveCount} صلاحية فعّالة — {overrideCount} فردية
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-gray-300 rounded-sm inline-block" /> من الدور
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-primary rounded-sm inline-block" /> فردية
            </span>
          </div>
        </header>

        <div className="divide-y">
          {grouped.map(([group, perms]) => (
            <div key={group}>
              <div className="px-4 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
                {GROUP_LABEL[group] ?? group}
              </div>
              <div className="divide-y">
                {perms.map(p => (
                  <div key={p.code} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-mono text-xs">{p.code}</p>
                      {p.description && (
                        <p className="text-xs text-muted-foreground">{p.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {p.from_role && (
                        <span className="text-xs text-muted-foreground">من الدور</span>
                      )}
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={p.has_override}
                          disabled={!canEdit || busyPerm === p.code}
                          onChange={() => toggleOverride(p)}
                        />
                        <span className="text-xs">فردية</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Remove section */}
      {!detail.is_self && detail.member_status === 'active' && (
        <section className="border border-red-200 rounded p-4 space-y-3">
          <h2 className="font-semibold text-red-800">إزالة العضوية</h2>
          <p className="text-xs text-muted-foreground">
            ستحوّل الحساب إلى مشترٍ عادي وتحذف كل صلاحياته الفردية. لا يمكن التراجع بسهولة.
          </p>

          {!showRemoveConfirm ? (
            <button
              onClick={() => setShowRemoveConfirm(true)}
              disabled={!canEdit}
              className="text-red-700 border border-red-300 rounded px-4 py-2 text-sm disabled:opacity-50"
            >
              إزالة الموظف
            </button>
          ) : (
            <div className="space-y-2">
              <input
                value={removeReason}
                onChange={e => setRemoveReason(e.target.value)}
                placeholder="السبب (إلزامي)"
                className="w-full border rounded p-2 text-sm"
                minLength={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={removeStaff}
                  disabled={busyRemove || removeReason.trim().length < 3}
                  className="bg-red-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
                >
                  {busyRemove ? '...' : 'تأكيد الإزالة'}
                </button>
                <button
                  onClick={() => { setShowRemoveConfirm(false); setRemoveReason(''); }}
                  className="border rounded px-4 py-2 text-sm"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {msg && <p className="text-green-600 text-sm">{msg}</p>}
    </div>
  );
}