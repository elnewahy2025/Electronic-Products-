'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useState } from 'react';

const ITEMS = [
  { href: '/seller', label: 'لوحة التحكم' },
  { href: '/seller/products', label: 'منتجاتي' },
  { href: '/seller/orders', label: 'مبيعاتي' },
  { href: '/seller/files', label: 'مكتبة الملفات' },
  { href: '/seller/upload', label: 'رفع ملف جديد' },
  { href: '/seller/drive-accounts', label: 'حسابات Drive' },
  { href: '/seller/reviews', label: 'التقييمات' },
  { href: '/seller/wallet', label: 'المحفظة والمستحقات' },
  { href: '/notifications', label: 'الإشعارات' },
];

export function SellerSidebar({ email, displayName }: { email: string; displayName: string }) {
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
    <aside className="w-56 border-l bg-muted/20 min-h-[calc(100vh-64px)] p-4 hidden md:flex flex-col">
      <div className="mb-6">
        <p className="text-sm font-medium">{displayName}</p>
        <p className="text-xs text-muted-foreground truncate" dir="ltr">{email}</p>
      </div>
      <nav className="space-y-1 flex-1">
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
        className="mt-6 text-sm text-red-600 border border-red-200 rounded px-3 py-2 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? '...' : 'تسجيل الخروج'}
      </button>
    </aside>
  );
}