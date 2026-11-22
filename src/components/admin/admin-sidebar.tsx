'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { LogoutButton } from '@/components/shared/logout-button';
import { ThemeToggle } from '@/components/shared/theme-toggle';

type Item = { href: string; label: string; perm?: string };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'الرئيسية',
    items: [
      { href: '/admin', label: 'لوحة التحكم' },
      { href: '/notifications', label: 'الإشعارات' },
    ],
  },
  {
    title: 'البائعون والمنتجات',
    items: [
      { href: '/admin/sellers', label: 'البائعون', perm: 'seller.read' },
      { href: '/admin/products', label: 'المنتجات', perm: 'product.read.any' },
      { href: '/admin/categories', label: 'التصنيفات', perm: 'category.manage' },
      { href: '/admin/filetypes', label: 'أنواع الملفات' },
      { href: '/admin/quarantine', label: 'الملفات المعزولة', perm: 'file.quarantine' },
    ],
  },
  {
    title: 'المبيعات',
    items: [
      { href: '/admin/requests', label: 'طلبات الشراء' },
      { href: '/admin/codes', label: 'أكواد الشراء' },
    ],
  },
  {
    title: 'التنزيلات',
    items: [
      { href: '/admin/downloads', label: 'جلسات التنزيل' },
      { href: '/admin/compensation', label: 'طلبات التعويض' },
      { href: '/admin/exceptions', label: 'استثناءات المحاولات', perm: 'download.attempt.exception.decide' },
    ],
  },
  {
    title: 'المالية',
    items: [
      { href: '/admin/payouts', label: 'طلبات السحب', perm: 'payout.read' },
      { href: '/admin/commissions', label: 'عمولات البائعين', perm: 'commission.seller.override' },
      { href: '/admin/exchange-rates', label: 'أسعار الصرف', perm: 'exchange_rate.manage' },
    ],
  },
  {
    title: 'التفاعل والدعم',
    items: [
      { href: '/admin/support', label: 'تذاكر الدعم الفني', perm: 'support.read' },
      { href: '/admin/reviews', label: 'التقييمات' },
      { href: '/admin/reports', label: 'البلاغات' },
    ],
  },
  {
    title: 'النظام',
    items: [
      { href: '/admin/audit', label: 'سجل التدقيق', perm: 'audit.read' },
      { href: '/admin/security-events', label: 'أحداث الأمان', perm: 'security.read' },
      { href: '/admin/redeem-attempts', label: 'محاولات التفعيل', perm: 'security.read' },
      { href: '/admin/backups', label: 'النسخ الاحتياطي' },
      { href: '/admin/settings', label: 'الإعدادات' },
      { href: '/admin/staff', label: 'الموظفون', perm: 'staff.manage' },
    ],
  },
];

function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="px-5 py-5 border-b border-border/70 flex items-center justify-between">
        <Link href="/admin" onClick={onNavigate} className="flex items-center gap-2.5 group">
          <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold tracking-tight transition-transform duration-150 group-hover:scale-105">
            إ
          </span>
          <div>
            <p className="font-bold text-sm text-foreground leading-tight">لوحة الإدارة</p>
            <p className="text-[11px] text-muted-foreground">إدارة المنصة</p>
          </div>
        </Link>
        <div className="flex items-center gap-1.5">
          <ThemeToggle className="w-8 h-8" />
          <Link
            href="/"
            onClick={onNavigate}
            className="text-xs text-muted-foreground hover:text-primary transition-colors px-1.5"
            title="العودة للمتجر"
          >
            المتجر
          </Link>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {GROUPS.map(g => (
          <div key={g.title}>
            <p className="px-3 text-[11px] font-semibold text-muted-foreground/80 tracking-wide mb-1.5">
              {g.title}
            </p>
            <ul className="space-y-0.5">
              {g.items.map(item => {
                const isActive =
                  item.href === '/admin'
                    ? pathname === '/admin'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-150',
                        isActive
                          ? 'bg-accent text-accent-foreground font-semibold'
                          : 'text-foreground/75 hover:bg-muted/70 hover:text-foreground',
                      )}
                    >
                      <span>{item.label}</span>
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-border/70">
        <LogoutButton variant="sidebar" />
      </div>
    </>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile trigger button */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="فتح قائمة الإدارة"
        className="md:hidden fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium shadow-lg active:scale-[0.98] transition"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" x2="21" y1="6" y2="6" />
          <line x1="3" x2="21" y1="12" y2="12" />
          <line x1="3" x2="21" y1="18" y2="18" />
        </svg>
        <span>القائمة</span>
      </button>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-card border-l border-border min-h-[100dvh] flex flex-col shadow-xl">
            <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="w-64 shrink-0 border-l border-border bg-card min-h-[100dvh] hidden md:flex flex-col">
        <SidebarContent pathname={pathname} />
      </aside>
    </>
  );
}
