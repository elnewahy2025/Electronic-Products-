import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { NewTicketForm } from './new-ticket-form';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  open: { label: 'مفتوحة', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
  pending: { label: 'قيد المتابعة', cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  closed: { label: 'مغلقة', cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
};

export default async function SupportPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/support');
  if (user.accountType === 'staff') redirect('/admin/support');

  const db = await createClient();
  const { data: tickets } = await db
    .from('support_tickets')
    .select('id, subject, status, created_at, updated_at')
    .eq('owner_id', user.id)
    .order('updated_at', { ascending: false });

  return (
    <main className="p-6 max-w-5xl space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold text-foreground">الدعم الفني</h1>
        <p className="text-sm text-muted-foreground mt-1">
          تواصل مع فريق المنصة لمتابعة طلباتك أو استفساراتك الفنية.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5">
          <NewTicketForm />
        </div>

        <section className="lg:col-span-7 space-y-3">
          <h2 className="text-base font-semibold text-foreground">
            تذاكرك ({tickets?.length ?? 0})
          </h2>

          {!tickets?.length ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              لا توجد تذاكر دعم فني بعد.
            </div>
          ) : (
            <div className="space-y-2.5">
              {tickets.map((t: any) => {
                const st = STATUS_BADGE[t.status] ?? STATUS_BADGE.open;
                return (
                  <Link
                    key={t.id}
                    href={`/support/${t.id}`}
                    className="block rounded-2xl border border-border bg-card p-4 hover:border-primary/50 transition shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="font-semibold text-foreground truncate">{t.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          آخر تحديث: {new Date(t.updated_at).toLocaleString('ar')}
                        </p>
                      </div>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full border shrink-0 ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
