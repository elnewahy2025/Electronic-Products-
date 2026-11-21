import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type NotificationCategory =
  | 'general'
  | 'purchase'
  | 'code'
  | 'download'
  | 'compensation'
  | 'system';

export type NotificationRow = {
  id: string;
  type: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationFilter = 'all' | 'unread' | NotificationCategory;

export async function listMyNotifications(
  filter: NotificationFilter = 'all',
  limit = 50
): Promise<NotificationRow[]> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return [];

  let q = db
    .from('notifications')
    .select('id, type, category, title, body, link, data, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (filter === 'unread') {
    q = q.is('read_at', null);
  } else if (filter !== 'all') {
    q = q.eq('category', filter);
  }

  const { data } = await q;
  return (data ?? []) as NotificationRow[];
}

export async function getMyUnreadCount(): Promise<number> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return 0;

  const { count } = await db
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);

  return count ?? 0;
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return false;

  const { error } = await db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', user.id)
    .is('read_at', null);

  return !error;
}

export async function markAllMyNotificationsRead(): Promise<number> {
  const db = await createClient();
  const { data, error } = await db.rpc('mark_all_notifications_read');
  if (error) return 0;
  return (data as number) ?? 0;
}

/**
 * Which categories the current user should see tabs for.
 * Buyers see most; sellers see a subset (they don't get purchase codes).
 */
export function visibleCategoriesFor(accountType: string): Array<{ key: NotificationFilter; label: string }> {
  const common: Array<{ key: NotificationFilter; label: string }> = [
    { key: 'all', label: 'الكل' },
    { key: 'unread', label: 'غير مقروءة' },
  ];

  if (accountType === 'seller') {
    return [
      ...common,
      { key: 'general', label: 'عام' },
      { key: 'system', label: 'النظام' },
    ];
  }

  // buyer / staff (staff sees their own notifications here too)
  return [
    ...common,
    { key: 'purchase', label: 'الطلبات' },
    { key: 'code', label: 'الأكواد' },
    { key: 'download', label: 'التنزيلات' },
    { key: 'compensation', label: 'التعويضات' },
    { key: 'general', label: 'عام' },
    { key: 'system', label: 'النظام' },
  ];
}
