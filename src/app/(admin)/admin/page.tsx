import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

async function getStats() {
  const db = await createClient();
  const [{ count: pendingSellers }, { count: openRequests }, { count: pendingComp }, { count: activeSessions }] =
    await Promise.all([
      db.from('seller_profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('purchase_requests').select('*', { count: 'exact', head: true }).in('status', ['created', 'pending']),
      db.from('compensation_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('download_sessions').select('*', { count: 'exact', head: true }).in('status', ['active', 'compensation_active']),
    ]);
  return {
    pendingSellers: pendingSellers ?? 0,
    openRequests: openRequests ?? 0,
    pendingComp: pendingComp ?? 0,
    activeSessions: activeSessions ?? 0,
  };
}

export default async function AdminHome() {
  const s = await getStats();

  const cards = [
    { href: '/admin/sellers?status=pending', label: 'بائعون بانتظار الموافقة', value: s.pendingSellers, color: 'text-yellow-600' },
    { href: '/admin/requests?status=open', label: 'طلبات شراء مفتوحة', value: s.openRequests, color: 'text-blue-600' },
    { href: '/admin/compensation?status=pending', label: 'تعويضات معلّقة', value: s.pendingComp, color: 'text-red-600' },
    { href: '/admin/downloads?status=active', label: 'جلسات تنزيل نشطة', value: s.activeSessions, color: 'text-green-600' },
  ];

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-6">لوحة التحكم</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <Link key={c.href} href={c.href} className="border rounded-lg p-4 hover:shadow-sm">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className={`text-3xl font-bold mt-2 ${c.color}`}>{c.value}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}