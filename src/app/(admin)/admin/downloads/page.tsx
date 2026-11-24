import { createClient } from '@/lib/supabase/server';
import type { Enums } from '@/lib/types/database';
import Link from 'next/link';

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'neutral';

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: 'نشطة', tone: 'green' },
  compensation_active: { label: 'تعويضية نشطة', tone: 'blue' },
  expired_partial: { label: 'منتهية جزئيًا', tone: 'amber' },
  expired: { label: 'منتهية', tone: 'red' },
  exhausted: { label: 'مستنفدة', tone: 'red' },
  completed: { label: 'مكتملة', tone: 'green' },
  revoked: { label: 'ملغاة', tone: 'red' },
};

export default async function DownloadsPage(props: { searchParams: Promise<{ status?: string }> }) {
  const searchParams = await props.searchParams;
  const db = await createClient();
  let q = db
    .from('download_sessions')
    .select(`
      id, status, started_at, expires_at, is_compensation,
      order_items!inner(products!inner(title))
    `)
    .order('started_at', { ascending: false })
    .limit(100);

  if (searchParams.status) q = q.eq('status', searchParams.status as Enums<'download_session_status_enum'>);

  const { data } = await q;
  const rows: any[] = data ?? [];
  const activeStatus = searchParams.status ?? '';
  const activeCount = rows.filter(r => r.status === 'active' || r.status === 'compensation_active').length;
  const compensationCount = rows.filter(r => r.is_compensation).length;
  const endedCount = rows.filter(r => ['expired', 'expired_partial', 'exhausted', 'revoked'].includes(r.status)).length;

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="pb-5 border-b border-border">
        <p className="text-xs font-medium text-primary mb-1">التسليم</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">جلسات التنزيل</h1>
        <p className="text-sm text-muted-foreground mt-1">
          متابعة جلسات التنزيل النشطة والمنتهية وإجراءات التمديد والتعويض.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{rows.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">جلسات في هذه القائمة</p>
          </div>
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{activeCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">جلسات نشطة</p>
          </div>
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{compensationCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">جلسات تعويضية</p>
          </div>
          <div className="ui-stat">
            <p className="text-xl font-bold text-foreground ui-num">{endedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">جلسات منتهية</p>
          </div>
        </div>
      </header>

      <section className="ui-box flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-2" aria-label="تصفية جلسات التنزيل">
          <Link href="/admin/downloads" className={`ui-chip ${activeStatus === '' ? 'ui-chip-active' : ''}`}>
            الكل
          </Link>
          <Link
            href="/admin/downloads?status=active"
            className={`ui-chip ${activeStatus === 'active' ? 'ui-chip-active' : ''}`}
          >
            نشطة
          </Link>
          <Link
            href="/admin/downloads?status=expired_partial"
            className={`ui-chip ${activeStatus === 'expired_partial' ? 'ui-chip-active' : ''}`}
          >
            جزئية
          </Link>
          <Link
            href="/admin/downloads?status=compensation_active"
            className={`ui-chip ${activeStatus === 'compensation_active' ? 'ui-chip-active' : ''}`}
          >
            تعويضية
          </Link>
        </nav>
      </section>

      <section className="ui-table-wrap">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="text-right font-semibold px-3.5 py-2.5">المنتج</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الحالة</th>
              <th className="text-right font-semibold px-3.5 py-2.5">البداية</th>
              <th className="text-right font-semibold px-3.5 py-2.5">الانتهاء</th>
              <th className="text-right font-semibold px-3.5 py-2.5">النوع</th>
              <th className="px-3.5 py-2.5"><span className="sr-only">إجراءات</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((row: any) => {
              const meta = STATUS_META[row.status] ?? { label: 'غير معروف', tone: 'neutral' as const };
              return (
                <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3.5 py-3 text-sm text-foreground">{row.order_items.products.title}</td>
                  <td className="px-3.5 py-3">
                    <span className={`ui-badge ui-badge-${meta.tone}`}>{meta.label}</span>
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num">
                    {new Date(row.started_at).toLocaleString('ar')}
                  </td>
                  <td className="px-3.5 py-3 text-xs text-muted-foreground ui-num">
                    {new Date(row.expires_at).toLocaleString('ar')}
                  </td>
                  <td className="px-3.5 py-3">
                    <span className={`ui-badge ${row.is_compensation ? 'ui-badge-blue' : 'ui-badge-neutral'}`}>
                      {row.is_compensation ? 'تعويضية' : 'عادية'}
                    </span>
                  </td>
                  <td className="px-3.5 py-3 text-left">
                    <Link
                      href={`/admin/downloads/${row.id}`}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      عرض
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                  لا توجد جلسات تنزيل لعرضها في هذه القائمة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
