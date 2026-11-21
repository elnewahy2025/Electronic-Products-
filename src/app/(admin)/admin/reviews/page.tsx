import { createClient } from '@/lib/supabase/server';
import { ReviewActions } from './review-actions';

export default async function ReviewsPage({ searchParams }: { searchParams: { status?: string } }) {
  const db = await createClient();
  let q = db
    .from('reviews')
    .select(`
      id, rating, body, status, created_at, delete_reason,
      products!inner(id, title, slug, seller_id),
      profiles!inner(email)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (searchParams.status) q = q.eq('status', searchParams.status);

  const { data } = await q;

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-6">التقييمات</h1>

      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-right p-3">المنتج</th>
              <th className="text-right p-3">المشتري</th>
              <th className="text-right p-3">النجوم</th>
              <th className="text-right p-3">النص</th>
              <th className="text-right p-3">الحالة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row: any) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">{row.products.title}</td>
                <td className="p-3 text-xs text-muted-foreground">{row.profiles.email}</td>
                <td className="p-3">{'★'.repeat(row.rating)}{'☆'.repeat(5 - row.rating)}</td>
                <td className="p-3 text-xs max-w-xs truncate">{row.body ?? '—'}</td>
                <td className="p-3 text-xs">
                  <span className={row.status === 'published' ? 'text-green-600' : 'text-red-600'}>
                    {row.status === 'published' ? 'منشور' : 'محذوف'}
                  </span>
                </td>
                <td className="p-3">
                  {row.status === 'published' && <ReviewActions reviewId={row.id} />}
                </td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد تقييمات</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}