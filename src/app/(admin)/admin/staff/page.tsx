import { createClient } from '@/lib/supabase/server';
import { StaffInvite } from './staff-invite';
import Link from 'next/link';

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'bg-teal-50 text-teal-800 border-teal-200',
  admin: 'bg-slate-100 text-slate-800 border-slate-200',
  staff: 'bg-zinc-50 text-zinc-700 border-zinc-200',
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
    <main className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-border">
        <div>
          <p className="text-xs font-medium text-primary mb-1">إدارة الفريق والصلاحيات</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            الموظفون والمشرفون
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            إدارة أدوار الفريق الإداري ومنح الصلاحيات الفردية ومراجعة حالة العضوية.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <div className="bg-white border border-border rounded-xl px-4 py-2.5 shadow-sm">
            <span className="text-muted-foreground block">إجمالي الأعضاء</span>
            <span className="text-lg font-bold text-foreground">{list.length}</span>
          </div>
          <div className="bg-white border border-border rounded-xl px-4 py-2.5 shadow-sm">
            <span className="text-muted-foreground block">النشطون</span>
            <span className="text-lg font-bold text-emerald-700">{activeCount}</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4">
          <StaffInvite />
        </div>

        <section className="lg:col-span-8 bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-base text-foreground">الأعضاء الحاليون</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{list.length} عضو</span>
          </div>

          {list.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
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

                return (
                  <div
                    key={m.profile_id}
                    className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-muted text-foreground font-semibold text-xs flex items-center justify-center shrink-0 border border-border">
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
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${badgeClass}`}>
                        {roleLabel}
                      </span>

                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            m.status === 'active'
                              ? 'bg-emerald-500'
                              : m.status === 'suspended'
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                          }`}
                        />
                        {m.status === 'active' ? 'نشط' : m.status === 'suspended' ? 'موقوف' : 'ملغى'}
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
