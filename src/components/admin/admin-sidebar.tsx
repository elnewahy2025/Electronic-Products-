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
    <aside className="w-64 border-l bg-muted/30 min-h-screen p-4 hidden md:block">
      <div className="font-bold text-lg mb-6">لوحة الإدارة</div>
      <nav className="space-y-6">
        {GROUPS.map(g => (
          <div key={g.title}>
            <p className="text-xs text-muted-foreground mb-2 font-medium">{g.title}</p>
            <ul className="space-y-1">
              {g.items.map(item => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'block px-3 py-1.5 rounded text-sm hover:bg-accent',
                      pathname === item.href && 'bg-accent font-medium'
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
