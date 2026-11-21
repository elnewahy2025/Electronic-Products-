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
type PermFilter = 'all' | 'effective' | 'override' | 'inherited' | 'inactive';

const ROLE_META: Record<string, { label: string; desc: string }> = {
  super_admin: {
    label: 'Super Admin',
    desc: 'وصول كامل للإعدادات، الأدوار، استثناءات المحاولات، والاستعادة.',
  },
  admin: {
    label: 'أدمن',
    desc: 'إشراف تشغيلي على الطلبات، البائعين، التعويضات، والبلاغات.',
  },
  staff: {
    label: 'موظف',
    desc: 'وصول مقيّد بالصلاحيات الفردية الممنوحة صراحةً فقط.',
  },
};

const GROUP_LABEL: Record<string, string> = {
  settings: 'الإعدادات العامة',
  role: 'الأدوار',
  permission: 'الصلاحيات',
  staff: 'الموظفون والمستخدمون',
  seller: 'البائعون',
  product: 'المنتجات',
  category: 'التصنيفات',
  filetype: 'أنواع الملفات',
  file: 'الملفات والعزل',
  request: 'طلبات الشراء',
  code: 'أكواد الشراء',
  download: 'التنزيل والتعويض',
  compensation: 'التعويض',
  commission: 'العمولات',
  exchange_rate: 'أسعار الصرف',
  payout: 'المستحقات والسحب',
  wallet: 'المحافظ المالية',
  review: 'التقييمات',
  report: 'البلاغات',
  support: 'الدعم الفني',
  security: 'الأمان ومحاولات التفعيل',
  backup: 'النسخ الاحتياطي',
  retention: 'سياسات الاحتفاظ',
  audit: 'سجل التدقيق',
};

function groupKey(code: string): string {
  return code.split('.')[0] ?? 'other';
}

function getInitials(name?: string | null, email?: string | null) {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
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
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [roleCode, setRoleCode] = useState(detail.role_code ?? 'staff');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PermFilter>('all');

  const totalCount = detail.permissions.length;
  const effectiveCount = detail.permissions.filter(p => p.effective).length;
  const overrideCount = detail.permissions.filter(p => p.has_override).length;
  const inheritedCount = detail.permissions.filter(p => p.from_role).length;
  const coveragePct = totalCount > 0 ? Math.round((effectiveCount / totalCount) * 100) : 0;

  const filteredPermissions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return detail.permissions.filter(p => {
      if (filter === 'effective' && !p.effective) return false;
      if (filter === 'override' && !p.has_override) return false;
      if (filter === 'inherited' && !p.from_role) return false;
      if (filter === 'inactive' && p.effective) return false;
      if (!q) return true;
      const groupName = (GROUP_LABEL[groupKey(p.code)] ?? '').toLowerCase();
      return (
        p.code.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        groupName.includes(q)
      );
    });
  }, [detail.permissions, search, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of filteredPermissions) {
      const g = groupKey(p.code);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredPermissions]);

  async function toggleOverride(perm: Permission) {
    if (!canEdit || busyPerm) return;
    setBusyPerm(perm.code);
    setFeedback(null);

    const action = perm.has_override ? 'revoke' : 'grant';
    const res = await fetch(`/api/admin/staff/${detail.profile_id}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ permission_code: perm.code }),
    });
    const json = await res.json();
    setBusyPerm(null);

    if (!res.ok) {
      setFeedback({ type: 'err', text: json.error ?? 'تعذر تحديث الصلاحية.' });
      return;
    }
    setFeedback({
      type: 'ok',
      text: action === 'grant' ? `تم منح الصلاحية ${perm.code}` : `تم سحب الصلاحية الفردية ${perm.code}`,
    });
    router.refresh();
  }

  async function changeRole() {
    if (!canEdit || roleCode === detail.role_code || busyRole) return;
    setBusyRole(true);
    setFeedback(null);

    const res = await fetch(`/api/admin/staff/${detail.profile_id}/role`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role_code: roleCode }),
    });
    const json = await res.json();
    setBusyRole(false);

    if (!res.ok) {
      const map: Record<string, string> = {
        cannot_demote_self: 'لا يمكنك تخفيض دورك بنفسك.',
        cannot_remove_last_super_admin: 'لا يمكن إزالة آخر Super Admin في المنصة.',
        role_not_found: 'الدور المحدد غير موجود.',
      };
      setFeedback({ type: 'err', text: map[json.error] ?? json.error });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `تم تحديث الدور إلى ${ROLE_META[roleCode]?.label ?? roleCode}.`,
    });
    router.refresh();
  }

  async function removeStaff() {
    if (!canEdit || busyRemove) return;
    setBusyRemove(true);
    setFeedback(null);

    const res = await fetch(`/api/admin/staff/${detail.profile_id}/remove`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: removeReason.trim() || 'staff_removed' }),
    });
    const json = await res.json();
    setBusyRemove(false);

    if (!res.ok) {
      const map: Record<string, string> = {
        cannot_remove_self: 'لا يمكنك إزالة عضويتك بنفسك.',
        cannot_remove_last_super_admin: 'لا يمكن إزالة آخر Super Admin.',
      };
      setFeedback({ type: 'err', text: map[json.error] ?? json.error });
      return;
    }

    router.push('/admin/staff');
    router.refresh();
  }

  const currentRoleLabel = detail.role_code
    ? ROLE_META[detail.role_code]?.label ?? detail.role_name ?? detail.role_code
    : 'بدون دور';

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm flex items-center gap-2.5">
          <svg className="w-4 h-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>أنت تعرض هذه الصفحة بوضع القراءة فقط. تعديل الأدوار والصلاحيات محصور بـ Super Admin.</span>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-sm border flex items-center justify-between gap-3 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Asymmetric 12-column Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Right Sticky Identity & Role Column (4 cols) */}
        <aside className="lg:col-span-4 space-y-5 lg:sticky lg:top-6">
          {/* Profile Identity Card */}
          <section className="bg-white border border-border rounded-2xl p-5 shadow-sm space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-accent text-accent-foreground font-bold text-sm flex items-center justify-center shrink-0 border border-primary/15">
                {getInitials(detail.full_name, detail.email)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-foreground leading-snug truncate">
                    {detail.full_name || detail.email}
                  </h1>
                  {detail.is_self && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                      أنت
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate mt-0.5" dir="ltr">
                  {detail.email}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-accent text-accent-foreground border border-primary/15">
                {currentRoleLabel}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border ${
                  detail.status === 'active'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    detail.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                />
                {detail.status === 'active' ? 'حساب نشط' : detail.status === 'suspended' ? 'موقوف' : 'محذوف'}
              </span>
              {detail.member_status && detail.member_status !== 'active' && (
                <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                  العضوية: {detail.member_status}
                </span>
              )}
            </div>

            {/* Real Permission Coverage Summary */}
            <div className="pt-4 border-t border-border/70 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">نطاق الصلاحيات الفعّالة</span>
                <span className="font-mono font-semibold text-foreground tabular-nums">
                  {effectiveCount} / {totalCount}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${coveragePct}%` }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs tabular-nums">
                <div className="bg-muted/50 rounded-xl px-3 py-2">
                  <span className="text-muted-foreground block text-[11px]">موروثة من الدور</span>
                  <span className="font-semibold text-foreground">{inheritedCount}</span>
                </div>
                <div className="bg-accent/50 rounded-xl px-3 py-2">
                  <span className="text-accent-foreground/80 block text-[11px]">تخصيص فردي</span>
                  <span className="font-semibold text-accent-foreground">{overrideCount}</span>
                </div>
              </div>
            </div>

            {detail.granted_at && (
              <p className="text-[11px] text-muted-foreground pt-2 border-t border-border/60">
                عضو في الفريق منذ{' '}
                <span className="font-medium text-foreground">
                  {new Date(detail.granted_at).toLocaleDateString('ar-EG', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </p>
            )}
          </section>

          {/* Role Assignment Card */}
          <section className="bg-white border border-border rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <h2 className="font-semibold text-sm text-foreground">الدور الوظيفي</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                تغيير الدور يحدّث الصلاحيات الموروثة دون المساس بالصلاحيات الفردية.
              </p>
            </div>

            <div className="space-y-2">
              {roles.map(r => {
                const meta = ROLE_META[r.code] ?? { label: r.name, desc: '' };
                const selected = roleCode === r.code;
                return (
                  <button
                    key={r.code}
                    type="button"
                    disabled={!canEdit || busyRole}
                    onClick={() => setRoleCode(r.code)}
                    className={`w-full text-right rounded-xl border p-3 transition-all duration-150 disabled:opacity-60 ${
                      selected
                        ? 'border-primary bg-accent/40 ring-1 ring-primary/30'
                        : 'border-border hover:border-muted-foreground/40 bg-background/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          selected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                        }`}
                      >
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </div>
                    {meta.desc && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {meta.desc}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={changeRole}
              disabled={!canEdit || busyRole || roleCode === detail.role_code}
              className="w-full bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-primary/90 active:scale-[0.99] transition disabled:opacity-40"
            >
              {busyRole ? 'جارٍ التحديث...' : 'حفظ تغيير الدور'}
            </button>
          </section>

          {/* Danger Zone Card */}
          {!detail.is_self && detail.member_status === 'active' && (
            <section className="bg-white border border-red-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div>
                <h2 className="font-semibold text-sm text-red-800">إزالة العضوية الإدارية</h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  يُحوّل الحساب إلى مشترٍ عادي ويسحب كافة الصلاحيات الفردية مع تسجيل الإجراء في سجل التدقيق.
                </p>
              </div>

              {!showRemoveConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowRemoveConfirm(true)}
                  disabled={!canEdit}
                  className="w-full text-red-700 bg-red-50 hover:bg-red-100/80 border border-red-200 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50"
                >
                  إزالة من الفريق
                </button>
              ) : (
                <div className="space-y-2.5 pt-1">
                  <input
                    value={removeReason}
                    onChange={e => setRemoveReason(e.target.value)}
                    placeholder="اكتب سبب الإزالة (3 أحرف على الأقل)"
                    className="w-full bg-background border border-red-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                    minLength={3}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={removeStaff}
                      disabled={busyRemove || removeReason.trim().length < 3}
                      className="bg-red-600 text-white rounded-xl px-3 py-2 text-xs font-medium hover:bg-red-700 transition disabled:opacity-50"
                    >
                      {busyRemove ? 'جارٍ الإزالة...' : 'تأكيد الإزالة'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowRemoveConfirm(false);
                        setRemoveReason('');
                      }}
                      className="border border-border rounded-xl px-3 py-2 text-xs font-medium hover:bg-muted transition"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </aside>

        {/* Main Permissions Workspace (8 cols) */}
        <section className="lg:col-span-8 bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="p-5 border-b border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-base text-foreground">مصفوفة الصلاحيات التفصيلية</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  تحكّم في الصلاحيات الفردية الإضافية لكل نطاق، مع تمييز واضح للصلاحيات الموروثة من الدور.
                </p>
              </div>
              <span className="text-xs font-mono text-muted-foreground tabular-nums bg-muted px-2.5 py-1 rounded-lg self-start">
                {filteredPermissions.length} صلاحية معروضة
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <svg
                  className="w-4 h-4 text-muted-foreground absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="ابحث بكود الصلاحية أو الوصف أو النطاق..."
                  className="w-full bg-background border border-border rounded-xl pr-10 pl-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {(
                  [
                    { key: 'all', label: 'الكل' },
                    { key: 'effective', label: `الفعّالة (${effectiveCount})` },
                    { key: 'override', label: `فردية (${overrideCount})` },
                    { key: 'inherited', label: `من الدور (${inheritedCount})` },
                    { key: 'inactive', label: 'غير ممنوحة' },
                  ] as Array<{ key: PermFilter; label: string }>
                ).map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setFilter(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      filter === tab.key
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Grouped Permissions List */}
          {grouped.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">لا توجد صلاحيات مطابقة للبحث</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFilter('all');
                }}
                className="text-xs text-primary hover:underline"
              >
                إعادة ضبط الفلاتر
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {grouped.map(([group, perms]) => {
                const groupActive = perms.filter(p => p.effective).length;
                return (
                  <div key={group}>
                    <div className="px-5 py-2.5 bg-muted/45 flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        {GROUP_LABEL[group] ?? group}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                        {groupActive}/{perms.length} مفعّلة
                      </span>
                    </div>

                    <div className="divide-y divide-border/60">
                      {perms.map(p => {
                        const isBusy = busyPerm === p.code;
                        return (
                          <div
                            key={p.code}
                            className={`px-5 py-3.5 flex items-center justify-between gap-4 transition-colors ${
                              p.effective ? 'bg-white' : 'bg-background/30'
                            } hover:bg-muted/25`}
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <code
                                  dir="ltr"
                                  className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md ${
                                    p.effective
                                      ? 'bg-accent/60 text-accent-foreground'
                                      : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {p.code}
                                </code>
                                {p.from_role && (
                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/80">
                                    موروثة من الدور
                                  </span>
                                )}
                                {p.has_override && (
                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                                    منح فردي
                                  </span>
                                )}
                              </div>
                              {p.description && (
                                <p className="text-xs text-muted-foreground leading-relaxed pt-0.5">
                                  {p.description}
                                </p>
                              )}
                            </div>

                            {/* Accessible Toggle Switch for Individual Override */}
                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                                تخصيص فردي
                              </span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={p.has_override}
                                aria-label={`تبديل الصلاحية الفردية ${p.code}`}
                                disabled={!canEdit || isBusy}
                                onClick={() => toggleOverride(p)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-45 ${
                                  p.has_override ? 'bg-primary' : 'bg-slate-200'
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
                                    p.has_override ? '-translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
