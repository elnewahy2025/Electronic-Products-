'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useState } from 'react';

const ITEMS = [
  { href: '/account', label: 'نظرة عامة' },
  { href: '/account/orders', label: 'طلباتي' },
  { href: '/account/codes', label: 'أكوادي' },
  { href: '/account/downloads', label: 'التنزيلات' },
  { href: '/notifications', label: 'الإشعارات' },
  { href: '/account/profile', label: 'الملف الشخصي' },
];

export function AccountSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <aside className="w-56 border-l bg-muted/20 min-h-[calc(100vh-64px)] p-4 hidden md:block">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground">مسجّل الدخول</p>
        <p className="text-sm font-medium truncate" dir="ltr">{email}</p>
      </div>
      <nav className="space-y-1">
        {ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'block px-3 py-2 rounded text-sm hover:bg-accent',
              pathname === item.href && 'bg-accent font-medium'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <button
        onClick={signOut}
        disabled={busy}
        className="mt-6 w-full text-sm text-red-600 border border-red-200 rounded px-3 py-2 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? '...' : 'تسجيل الخروج'}
      </button>
    </aside>
  );
}
