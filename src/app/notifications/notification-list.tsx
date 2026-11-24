'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Notification = {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  general: 'عام',
  purchase: 'طلب',
  code: 'كود',
  download: 'تنزيل',
  compensation: 'تعويض',
  system: 'نظام',
  admin: 'إدارة',
};

const CATEGORY_COLOR: Record<string, string> = {
  general: 'bg-gray-100 text-gray-800',
  purchase: 'bg-blue-100 text-blue-800',
  code: 'bg-green-100 text-green-800',
  download: 'bg-purple-100 text-purple-800',
  compensation: 'bg-orange-100 text-orange-800',
  system: 'bg-red-100 text-red-800',
  admin: 'bg-amber-100 text-amber-800',
};

export function NotificationList({ initial }: { initial: Notification[] }) {
  const [items, setItems] = useState(initial);
  const router = useRouter();

  // Server navigation (filters) and router.refresh() supply a new `initial`
  // list; keep the client state in sync instead of showing stale notifications.
  useEffect(() => {
    setItems(initial);
  }, [initial]);

  async function markRead(id: string) {
    const previous = items.find(n => n.id === id);
    setItems(prev => prev.map(n => n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n));
    const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    if (!res.ok && previous) {
      setItems(prev => prev.map(n => n.id === id ? previous : n));
      return;
    }
    router.refresh();
  }

  function handleClick(n: Notification) {
    if (!n.read_at) void markRead(n.id);
  }

  if (items.length === 0) {
    return (
      <div className="border rounded p-10 text-center text-muted-foreground">
        <div className="text-4xl mb-2">🔔</div>
        <p>لا توجد إشعارات</p>
      </div>
    );
  }

  return (
    <div className="border rounded divide-y">
      {items.map(n => {
        const unread = !n.read_at;
        const category = CATEGORY_LABEL[n.category] ?? n.category;
        const color = CATEGORY_COLOR[n.category] ?? 'bg-gray-100 text-gray-800';

        const safeLink =
          typeof n.link === 'string' && n.link.startsWith('/') && !n.link.startsWith('//')
            ? n.link
            : null;

        const content = (
          <div className={`p-4 flex items-start gap-3 transition ${unread ? 'bg-primary/5' : ''} ${safeLink ? 'hover:bg-muted/40 cursor-pointer' : ''}`}>
            <div className="mt-1">
              {unread
                ? <span className="inline-block w-2 h-2 bg-primary rounded-full" />
                : <span className="inline-block w-2 h-2 bg-transparent" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className={`text-sm ${unread ? 'font-semibold' : ''}`}>{n.title}</h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${color}`}>{category}</span>
              </div>
              {n.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{n.body}</p>}
              <p className="text-xs text-muted-foreground mt-2">{formatRelative(n.created_at)}</p>
            </div>
            {safeLink && <span className="text-muted-foreground text-sm shrink-0">←</span>}
          </div>
        );

        return safeLink ? (
          <Link key={n.id} href={safeLink} onClick={() => handleClick(n)} className="block">{content}</Link>
        ) : (
          <div key={n.id} onClick={() => handleClick(n)}>{content}</div>
        );
      })}
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'الآن';
  if (min < 60) return `منذ ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `منذ ${hr} ساعة`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `منذ ${day} يوم`;
  return new Date(iso).toLocaleDateString('ar');
}
