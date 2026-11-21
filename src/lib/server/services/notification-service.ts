import 'server-only';
import { createClient } from '@/lib/supabase/server';

export type NotificationCategory =
  | 'general'
  | 'purchase'
  | 'code'
  | 'download'
  | 'compensation'
  | 'system'
  | 'admin';

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

  if (filter === 'unread') q = q.is('read_at', null);
  else if (filter !== 'all') q = q.eq('category', filter);

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

export function visibleCategoriesFor(accountType: string): Array<{ key: NotificationFilter; label: string }> {
  const common: Array<{ key: NotificationFilter; label: string }> = [
    { key: 'all', label: 'الكل' },
    { key: 'unread', label: 'غير مقروءة' },
  ];

  if (accountType === 'staff') {
    return [
      ...common,
      { key: 'admin', label: 'إدارة' },
      { key: 'purchase', label: 'الطلبات' },
      { key: 'compensation', label: 'التعويضات' },
      { key: 'system', label: 'النظام' },
    ];
  }

  if (accountType === 'seller') {
    return [
      ...common,
      { key: 'general', label: 'عام' },
      { key: 'system', label: 'النظام' },
    ];
  }

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

/**
 * Live snapshot of pending items for the admin banner.
 * Only queries tables the user can see via RLS.
 */
export async function getAdminPendingSummary(): Promise<{
  purchase_requests: number;
  seller_applications: number;
  payouts: number;
  quarantined: number;
} | null> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  const [pr, sa, po, q] = await Promise.all([
    db.from('purchase_requests').select('*', { count: 'exact', head: true })
      .in('status', ['created', 'pending']),
    db.from('seller_profiles').select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    db.from('seller_payouts').select('*', { count: 'exact', head: true })
      .eq('status', 'requested'),
    db.from('quarantine_records').select('*', { count: 'exact', head: true })
      .is('released_at', null),
  ]);

  return {
    purchase_requests: pr.count ?? 0,
    seller_applications: sa.count ?? 0,
    payouts: po.count ?? 0,
    quarantined: q.count ?? 0,
  };
}
