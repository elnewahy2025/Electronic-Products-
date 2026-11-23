import Link from 'next/link';
import { listBuyerSessions } from '@/lib/server/services/buyer-service';
import { StatusBadge } from '@/components/buyer/status-badge';
import { Countdown } from '@/components/buyer/countdown';

const FILTERS = [
  { key: '', label: 'الكل' },
  { key: 'active', label: 'نشطة' },
  { key: 'expired', label: 'منتهية' },
  { key: 'completed', label: 'مكتملة' },
];

export default async function DownloadsPage(
  props: {
    searchParams: Promise<{ status?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const sessions = await listBuyerSessions(searchParams.status);

  return (
    <main className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">التنزيلات</h1>
        <p className="text-sm text-muted-foreground mt-1">{sessions.length} جلسة</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => {
          const active = (searchParams.status ?? '') === f.key;
          const href = f.key ? `/account/downloads?status=${f.key}` : '/account/downloads';
          return (
            <Link
              key={f.key}
              href={href}
              className={`text-sm px-3 py-1 rounded border ${active ? 'bg-primary text-primary-foreground' : ''}`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {sessions.length === 0 ? (
        <div className="border rounded p-8 text-center text-muted-foreground">
          <p>لا توجد جلسات تنزيل{searchParams.status ? ' بهذه الحالة' : ''}.</p>
          <Link href="/account/codes" className="text-primary mt-2 inline-block">
            عرض أكوادي ←
          </Link>
        </div>
      ) : (
        <div className="border rounded divide-y">
          {sessions.map(s => {
            const isActive = ['active', 'compensation_active'].includes(s.status);
            const canDownload = isActive && new Date(s.expires_at).getTime() > Date.now();

            return (
              <div key={s.session_id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.product_title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    كود: <span className="font-mono">{s.code_prefix}••••</span>
                    {s.is_compensation && <span className="mr-2 text-blue-600">— تعويضية</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    بدأت {new Date(s.started_at).toLocaleString('ar')}
                  </p>
                  {isActive && (
                    <p className="text-xs mt-1">
                      ينتهي بعد <Countdown to={s.expires_at} />
                    </p>
                  )}
                </div>
                <div className="text-left space-y-2 shrink-0">
                  <StatusBadge status={s.status} />
                  {canDownload && (
                    <Link
                      href={`/account/downloads/${s.session_id}`}
                      className="block text-xs bg-primary text-primary-foreground rounded px-3 py-1 text-center"
                    >
                      تنزيل
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
