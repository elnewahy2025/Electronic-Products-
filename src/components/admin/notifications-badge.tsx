'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export function NotificationsBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function fetchCount() {
      const res = await fetch('/api/notifications/unread-count');
      if (!res.ok) return;
      const json = await res.json();
      if (mounted) setCount(json.count ?? 0);
    }
    fetchCount();
    const t = setInterval(fetchCount, 60000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  if (count === 0) return null;

  return (
    <Link href="/admin/requests?status=pending" className="relative text-sm">
      طلبات
      <span className="absolute -top-2 -left-3 bg-red-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
        {count > 9 ? '9+' : count}
      </span>
    </Link>
  );
}