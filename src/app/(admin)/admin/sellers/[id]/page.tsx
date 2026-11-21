import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { SellerActions } from './seller-actions';

const STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار الموافقة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  suspended: 'موقوف',
};

export default async function SellerDetailPage({ params }: { params: { id: string } }) {
  const db = await createClient();
  const { data: seller } = await db
    .from('seller_profiles')
    .select('*, profiles!inner(email, phone, full_name, avatar_url, created_at)')
    .eq('profile_id', params.id)
    .single();

  if (!seller) notFound();

  const { data: products } = await db
    .from('products')
    .select('id, title, status, price_amount, price_currency')
    .eq('seller_id', params.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: drives } = await db
    .from('seller_drive_accounts_safe')
    .select('id, google_account_email, status, quota_total, quota_used')
    .eq('seller_id', params.id);

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{seller.display_name}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {seller.profiles.email} — {seller.profiles.phone ?? 'لا يوجد هاتف'}
        </p>
        <p className="mt-2">
          الحالة: <b>{STATUS_LABELS[seller.status]}</b>
        </p>
        {seller.rejection_reason && <p className="text-red-600 text-sm mt-1">سبب الرفض: {seller.rejection_reason}</p>}
        {seller.suspension_reason && <p className="text-red-600 text-sm mt-1">سبب الإيقاف: {seller.suspension_reason}</p>}
      </div>

      <SellerActions
        sellerId={params.id}
        status={seller.status}
      />

      <section>
        <h2 className="font-semibold mb-2">حسابات Drive ({drives?.length ?? 0})</h2>
        <div className="border rounded divide-y text-sm">
          {(drives ?? []).map((d: any) => (
            <div key={d.id} className="p-3 flex justify-between">
              <span>{d.google_account_email}</span>
              <span className={d.status === 'active' ? 'text-green-600' : 'text-red-600'}>{d.status}</span>
            </div>
          ))}
          {!drives?.length && <p className="p-3 text-muted-foreground">لا يوجد</p>}
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-2">آخر المنتجات</h2>
        <div className="border rounded divide-y text-sm">
          {(products ?? []).map(p => (
            <div key={p.id} className="p-3 flex justify-between">
              <span>{p.title}</span>
              <span className="text-muted-foreground">{p.status}</span>
            </div>
          ))}
          {!products?.length && <p className="p-3 text-muted-foreground">لا يوجد</p>}
        </div>
      </section>
    </main>
  );
}