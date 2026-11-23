import { createClient } from '@/lib/supabase/server';
import { StaffInvite } from './staff-invite';
import Link from 'next/link';

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'ui-badge-blue',
  admin: 'ui-badge-green',
  staff: 'ui-badge-neutral',
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'أدمن',
  staff: 'موظف',
};

function getInitials(name?: string | null, email?: string | null) {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default async function StaffPage() {
  const db = await createClient();
  const { data: members } = await db
    .from('store_members')
    .select('profile_id, status, granted_at, roles(code, name), profiles:profiles!store_members_profile_id_fkey(email, full_name)')
    .order('granted_at', { ascending: false });

  const list = (members ?? []) as any[];
  const activeCount = list.filter(m => m.status === 'active').length;

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">إدارة الفريق والصلاحيات</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          الموظفون والمشرفون
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          إدارة أدوار الفريق الإداري ومنح الصلاحيات الفردية ومراجعة حالة العضوية.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="ui-stat">
            <span className="text-xs text-muted-foreground block">إجمالي الأعضاء</span>
            <span className="mt-1 block text-lg font-bold text-foreground ui-num">{list.length}</span>
          </div>
          <div className="ui-stat">
            <span className="text-xs text-muted-foreground block">النشطون</span>
            <span className="mt-1 block text-lg font-bold text-success ui-num">{activeCount}</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4">
          <StaffInvite />
        </div>

        <section className="lg:col-span-8 ui-box">
          <div className="pb-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-semibold text-base text-foreground">الأعضاء الحاليون</h2>
            <span className="text-xs text-muted-foreground">
              <span className="ui-num">{list.length}</span> عضو
            </span>
          </div>

          {list.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              لا يوجد أعضاء في الفريق الإداري بعد.
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {list.map(m => {
                const roleCode = m.roles?.code ?? 'staff';
                const roleLabel = ROLE_LABEL[roleCode] ?? m.roles?.name ?? roleCode;
                const badgeClass = ROLE_BADGE[roleCode] ?? ROLE_BADGE.staff;
                const email = m.profiles?.email ?? '—';
                const fullName = m.profiles?.full_name;
                const statusLabel = m.status === 'active' ? 'نشط' : m.status === 'suspended' ? 'موقوف' : 'ملغى';
                const statusTone = m.status === 'active'
                  ? 'ui-badge-green'
                  : m.status === 'suspended'
                    ? 'ui-badge-amber'
                    : 'ui-badge-neutral';

                return (
                  <div
                    key={m.profile_id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-muted text-foreground font-semibold text-xs flex items-center justify-center shrink-0 border border-border ui-num">
                        {getInitials(fullName, email)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {fullName || email}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate mt-0.5" dir="ltr">
                          {email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap shrink-0">
                      <span className={`ui-badge ${badgeClass}`}>
                        {roleLabel}
                      </span>

                      <span className={`ui-badge ${statusTone}`}>
                        {statusLabel}
                      </span>

                      <Link
                        href={`/admin/staff/${m.profile_id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary border border-primary/25 bg-accent/50 hover:bg-accent px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <span>إدارة الصلاحيات</span>
                        <span aria-hidden="true">←</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
