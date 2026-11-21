'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

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
    ],
  },
  {
    title: 'التفاعل',
    items: [
      { href: '/admin/reviews', label: 'التقييمات' },
      { href: '/admin/reports', label: 'البلاغات' },
    ],
  },
  {
    title: 'النظام',
    items: [
      { href: '/admin/audit', label: 'سجل التدقيق', perm: 'audit.read' },
      { href: '/admin/redeem-attempts', label: 'محاولات التفعيل', perm: 'security.read' },
      { href: '/admin/backups', label: 'النسخ الاحتياطي' },
      { href: '/admin/settings', label: 'الإعدادات' },
      { href: '/admin/staff', label: 'الموظفون', perm: 'staff.manage' },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 shrink-0 border-l border-border bg-white min-h-[100dvh] hidden md:flex flex-col">
      <div className="px-5 py-5 border-b border-border/70 flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-2.5 group">
          <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold tracking-tight transition-transform duration-150 group-hover:scale-105">
            إ
          </span>
          <div>
            <p className="font-bold text-sm text-foreground leading-tight">لوحة الإدارة</p>
            <p className="text-[11px] text-muted-foreground">إدارة المنصة</p>
          </div>
        </Link>
        <Link
          href="/"
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
          title="العودة للمتجر"
        >
          المتجر
        </Link>
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
                      className={cn(
                        'flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors duration-150',
                        isActive
                          ? 'bg-accent text-accent-foreground font-semibold'
                          : 'text-foreground/75 hover:bg-muted/70 hover:text-foreground'
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
    </aside>
  );
}
