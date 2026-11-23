import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { BrandLogo } from '@/components/shared/brand-logo';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { LogoutButton } from '@/components/shared/logout-button';
import { NotificationBell } from '@/components/shared/notification-bell';

/**
 * Shared admin chrome (header + sidebar) for every staff-facing route.
 * Routes outside the (admin) route group — /notifications and /support —
 * use this too so the header never disappears when navigating between them.
 */
export async function AdminShell({ children, email }: { children: React.ReactNode; email: string }) {
  const db = await createClient();
  const [
    { count: pendingSellers },
    { count: openRequests },
    { count: pendingComp },
    { count: pendingPayouts },
    { count: openReports },
    { count: openTickets },
  ] = await Promise.all([
    db.from('seller_profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('purchase_requests').select('*', { count: 'exact', head: true }).in('status', ['created', 'pending']),
    db.from('compensation_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('seller_payouts').select('*', { count: 'exact', head: true }).eq('status', 'requested'),
    db.from('content_reports').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    db.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
  ]);

  const counts = {
    '/admin/sellers': pendingSellers ?? 0,
    '/admin/requests': openRequests ?? 0,
    '/admin/compensation': pendingComp ?? 0,
    '/admin/payouts': pendingPayouts ?? 0,
    '/admin/reports': openReports ?? 0,
    '/admin/support': openTickets ?? 0,
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="bg-brand text-brand-foreground sticky top-0 z-30 border-b border-white/10">
        <div className="px-3 sm:px-5 h-14 flex items-center gap-2 sm:gap-4">
          <BrandLogo href="/admin" subtitle="لوحة الإدارة" inverted className="shrink-0" />
          <div className="flex-1" />
          <Link
            href="/"
            className="hidden sm:inline-block text-xs text-[#9ccbbd] hover:text-white transition-colors"
          >
            المتجر
          </Link>
          <span className="hidden md:inline-block text-xs text-[#b4d3c8] font-mono" dir="ltr">
            {email}
          </span>
          <NotificationBell />
          <ThemeToggle className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white" />
          <LogoutButton
            variant="header"
            className="text-[#e8f5f0] hover:text-white hover:bg-white/10 [&>span]:hidden sm:[&>span]:inline"
          />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <AdminSidebar counts={counts} />
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
