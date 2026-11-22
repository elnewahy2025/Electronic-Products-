'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { LogoutButton } from '@/components/shared/logout-button';

const ITEMS = [
  { href: '/seller', label: 'لوحة التحكم' },
  { href: '/seller/products', label: 'منتجاتي' },
  { href: '/seller/orders', label: 'مبيعاتي' },
  { href: '/seller/files', label: 'مكتبة الملفات' },
  { href: '/seller/upload', label: 'رفع ملف جديد' },
  { href: '/seller/drive-accounts', label: 'حسابات Drive' },
  { href: '/seller/reviews', label: 'التقييمات' },
  { href: '/seller/wallet', label: 'المحفظة والمستحقات' },
  { href: '/support', label: 'الدعم الفني' },
  { href: '/notifications', label: 'الإشعارات' },
];

function SellerNav({
  email,
  displayName,
  pathname,
  onNavigate,
}: {
  email: string;
  displayName: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="mb-4 px-2">
        <p className="text-sm font-bold text-foreground truncate">{displayName}</p>
        <p className="text-xs text-muted-foreground truncate font-mono" dir="ltr">
          {email}
        </p>
      </div>
      <nav className="space-y-0.5 flex-1">
        {ITEMS.map(item => {
          const isActive =
            item.href === '/seller'
              ? pathname === '/seller'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'block px-3 py-2 rounded-[9px] text-[14px] font-medium transition-colors',
                isActive
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-5 pt-4 border-t border-border">
        <LogoutButton variant="sidebar" redirectTo="/" />
      </div>
    </>
  );
}

export function SellerSidebar({ email, displayName }: { email: string; displayName: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="فتح قائمة البائع"
        className="md:hidden fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-brand text-brand-foreground px-4 py-2.5 text-sm font-medium shadow-lg active:scale-[0.98] transition"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" x2="21" y1="6" y2="6" />
          <line x1="3" x2="21" y1="12" y2="12" />
          <line x1="3" x2="21" y1="18" y2="18" />
        </svg>
        <span>لوحة البائع</span>
      </button>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 w-64 max-w-[85vw] bg-card border-l border-border min-h-[100dvh] p-4 flex flex-col shadow-xl">
            <SellerNav
              email={email}
              displayName={displayName}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <aside className="w-[205px] shrink-0 hidden md:flex flex-col sticky top-20 self-start">
        <SellerNav email={email} displayName={displayName} pathname={pathname} />
      </aside>
    </>
  );
}
