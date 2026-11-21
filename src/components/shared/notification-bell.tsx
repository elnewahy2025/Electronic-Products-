'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NotificationBell({ href }: { href: string }) {
  const [count, setCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    let active = true;

    async function fetchCount() {
      try {
        const res = await fetch('/api/notifications/unread-count', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (active) setCount(json.count ?? 0);
      } catch {
        /* ignore */
      }
    }

    fetchCount();
    const interval = setInterval(fetchCount, 45000);

    // Re-fetch on route change (mark-as-read navigation)
    return () => { active = false; clearInterval(interval); };
  }, [pathname]);

  if (!mounted) return null;

  return (
    <Link
      href={href}
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted"
      aria-label={`الإشعارات${count > 0 ? ` (${count} غير مقروء)` : ''}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
