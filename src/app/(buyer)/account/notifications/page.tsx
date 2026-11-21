import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import {
  listMyNotifications,
  getMyUnreadCount,
  visibleCategoriesFor,
  type NotificationFilter,
} from '@/lib/server/services/notification-service';
import { NotificationList } from './notification-list';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/account/notifications');

  const filter = (searchParams.filter ?? 'all') as NotificationFilter;
  const tabs = visibleCategoriesFor(user.accountType);

  const [items, unreadCount] = await Promise.all([
    listMyNotifications(filter, 100),
    getMyUnreadCount(),
  ]);

  return (
    <main className="p-6 space-y-6 max-w-3xl">
      <nav className="text-sm text-muted-foreground">
        <Link href="/account" className="hover:underline">حسابي</Link>
        {' / '}
        <span>الإشعارات</span>
      </nav>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">الإشعارات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadCount > 0 ? `${unreadCount} غير مقروءة` : 'لا إشعارات غير مقروءة'}
          </p>
        </div>
        {unreadCount > 0 && (
          <MarkAllReadButton />
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-sm border-b pb-2">
        {tabs.map(t => {
          const active = filter === t.key;
          const href = t.key === 'all'
            ? '/account/notifications'
            : `/account/notifications?filter=${t.key}`;
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

      <NotificationList initial={items} />
    </main>
  );
}

function MarkAllReadButton() {
  return (
    <form action={markAllReadAction}>
      <button
        type="submit"
        className="text-sm border rounded px-3 py-1.5 hover:bg-muted"
      >
        تعليم الكل كمقروء
      </button>
    </form>
  );
}

async function markAllReadAction() {
  'use server';
  const { markAllMyNotificationsRead } = await import('@/lib/server/services/notification-service');
  await markAllMyNotificationsRead();
  const { revalidatePath } = await import('next/cache');
  revalidatePath('/account/notifications');
  revalidatePath('/');
}
