import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import {
  listMyNotifications,
  getMyUnreadCount,
  visibleCategoriesFor,
  getAdminPendingSummary,
  type NotificationFilter,
} from '@/lib/server/services/notification-service';
import { NotificationList } from './notification-list';
import { MarkAllReadButton } from './mark-all-read-button';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/notifications');

  const filter = (searchParams.filter ?? 'all') as NotificationFilter;
  const tabs = visibleCategoriesFor(user.accountType);

  const [items, unreadCount, adminSummary] = await Promise.all([
    listMyNotifications(filter, 100),
    getMyUnreadCount(),
    user.accountType === 'staff' ? getAdminPendingSummary() : Promise.resolve(null),
  ]);

  return (
    <main className="container max-w-3xl py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">الإشعارات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadCount > 0 ? `${unreadCount} غير مقروءة` : 'لا إشعارات غير مقروءة'}
          </p>
        </div>
        {unreadCount > 0 && <MarkAllReadButton />}
      </div>

      {adminSummary && (adminSummary.purchase_requests + adminSummary.seller_applications + adminSummary.payouts + adminSummary.quarantined) > 0 && (
        <div className="border border-primary/30 bg-primary/5 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium">عناصر تحتاج إجراءً:</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {adminSummary.purchase_requests > 0 && (
              <Link href="/admin/requests?status=pending" className="inline-flex items-center gap-1 bg-background border rounded px-3 py-1 hover:bg-muted">
                <b>{adminSummary.purchase_requests}</b> طلبات شراء
              </Link>
            )}
            {adminSummary.seller_applications > 0 && (
              <Link href="/admin/sellers?status=pending" className="inline-flex items-center gap-1 bg-background border rounded px-3 py-1 hover:bg-muted">
                <b>{adminSummary.seller_applications}</b> بائعين بانتظار الموافقة
              </Link>
            )}
            {adminSummary.payouts > 0 && (
              <Link href="/admin/payouts" className="inline-flex items-center gap-1 bg-background border rounded px-3 py-1 hover:bg-muted">
                <b>{adminSummary.payouts}</b> طلبات سحب
              </Link>
            )}
            {adminSummary.quarantined > 0 && (
              <Link href="/admin/quarantine" className="inline-flex items-center gap-1 bg-background border rounded px-3 py-1 hover:bg-muted">
                <b>{adminSummary.quarantined}</b> ملفات معزولة
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-sm border-b pb-2">
        {tabs.map(t => {
          const active = filter === t.key;
          const href = t.key === 'all' ? '/notifications' : `/notifications?filter=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              className={`px-3 py-1 rounded ${active ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted'}`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <NotificationList key={filter} initial={items} />
    </main>
  );
}
