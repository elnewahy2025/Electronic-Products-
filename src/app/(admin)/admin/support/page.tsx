import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  open: { label: 'مفتوحة', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300' },
  pending: { label: 'قيد المتابعة', cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300' },
  closed: { label: 'مغلقة', cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300' },
};

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const db = await createClient();
  const statusFilter = searchParams.status;

  let query = db
    .from('support_tickets')
    .select('id, subject, status, created_at, updated_at, profiles!support_tickets_owner_id_fkey(email, full_name, account_type)')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (statusFilter && ['open', 'pending', 'closed'].includes(statusFilter)) {
    query = query.eq('status', statusFilter as any);
  }

  const { data: tickets } = await query;

  return (
    <main className="p-6 max-w-6xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">تذاكر الدعم الفني</h1>
          <p className="text-sm text-muted-foreground mt-1">
            متابعة والرد على استفسارات المشترين والبائعين.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {[
            { k: '', label: 'الكل' },
            { k: 'open', label: 'مفتوحة' },
            { k: 'pending', label: 'قيد المتابعة' },
            { k: 'closed', label: 'مغلقة' },
          ].map(f => (
            <Link
              key={f.k}
              href={f.k ? `/admin/support?status=${f.k}` : '/admin/support'}
              className={`px-3 py-1.5 rounded-lg border transition ${
                (statusFilter ?? '') === f.k
                  ? 'bg-primary text-primary-foreground border-primary font-medium'
                  : 'border-border bg-card hover:bg-muted/60'
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/70">
            <tr>
              <th className="text-right p-3">الموضوع</th>
              <th className="text-right p-3">صاحب التذكرة</th>
              <th className="text-right p-3">الحالة</th>
              <th className="text-right p-3">آخر تحديث</th>
              <th className="text-right p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(tickets ?? []).map((t: any) => {
              const st = STATUS_BADGE[t.status] ?? STATUS_BADGE.open;
              return (
                <tr key={t.id} className="border-t border-border hover:bg-muted/20">
                  <td className="p-3 font-medium text-foreground">{t.subject}</td>
                  <td className="p-3 text-xs">
                    <div className="font-medium">{t.profiles?.full_name ?? '—'}</div>
                    <div className="text-muted-foreground font-mono" dir="ltr">
                      {t.profiles?.email ?? '—'}
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    <span className={`px-2.5 py-0.5 rounded-full border ${st.cls}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(t.updated_at).toLocaleString('ar')}
                  </td>
                  <td className="p-3 text-left">
                    <Link
                      href={`/admin/support/${t.id}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      عرض والرد ←
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!tickets?.length && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted-foreground text-sm">
                  لا توجد تذاكر مطابقة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
