import Link from 'next/link';
import { listBuyerCodes } from '@/lib/server/services/buyer-service';
import { StatusBadge } from '@/components/buyer/status-badge';
import { Countdown } from '@/components/buyer/countdown';

export default async function CodesPage() {
  const codes = await listBuyerCodes();

  return (
    <main className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">أكوادي</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {codes.length} كود
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          الكود الكامل يصل عبر البريد/الهاتف. هنا ترى البادئة والحالة فقط.
        </p>
      </div>

      {codes.length === 0 ? (
        <div className="border rounded p-8 text-center text-muted-foreground">
          <p>لا توجد أكواد بعد.</p>
        </div>
      ) : (
        <div className="border rounded divide-y">
          {codes.map(c => (
            <div key={c.code_id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{c.product_title}</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">{c.code_prefix}••••</p>
                <p className="text-xs text-muted-foreground mt-1">
                  أُصدر {new Date(c.issued_at).toLocaleDateString('ar')}
                </p>
              </div>
              <div className="text-left space-y-1 shrink-0">
                <StatusBadge status={c.code_status} />
                {(c.code_status === 'issued' || c.code_status === 'delivered') && (
                  <p className="text-xs text-muted-foreground">
                    ينتهي بعد <Countdown to={c.expires_at} />
                  </p>
                )}
                {c.code_status === 'delivered' && (
                  <Link href="/redeem" className="block text-xs text-primary">
                    تفعيل الآن →
                  </Link>
                )}
                {c.code_status === 'redeemed' && c.session_id && (
                  <Link
                    href={`/account/downloads/${c.session_id}`}
                    className="block text-xs text-primary"
                  >
                    عرض التنزيل →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
