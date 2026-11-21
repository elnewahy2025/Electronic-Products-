import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function PendingPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');

  const { data: seller } = await db
    .from('seller_profiles')
    .select('status, display_name, rejection_reason, suspension_reason')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (!seller) redirect('/register?as=seller');
  if (seller.status === 'approved') redirect('/seller');

  return (
    <main className="container max-w-lg py-16 space-y-6 text-center">
      <h1 className="text-2xl font-bold">حسابك قيد المراجعة</h1>
      <p className="text-muted-foreground">
        شكرًا لتسجيلك كبائع. سيراجع فريق الإدارة طلبك وسيتم إشعارك عند الاعتماد.
      </p>
      {seller.status === 'rejected' && (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-sm text-right">
          <p className="font-medium text-red-800">تم رفض طلبك</p>
          {seller.rejection_reason && <p className="text-red-700 mt-1">السبب: {seller.rejection_reason}</p>}
        </div>
      )}
      {seller.status === 'suspended' && (
        <div className="bg-orange-50 border border-orange-200 rounded p-4 text-sm text-right">
          <p className="font-medium text-orange-800">تم إيقاف حسابك مؤقتًا</p>
          {seller.suspension_reason && <p className="text-orange-700 mt-1">السبب: {seller.suspension_reason}</p>}
        </div>
      )}
    </main>
  );
}