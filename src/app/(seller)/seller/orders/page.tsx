import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import {
  listSellerOrders,
  getSellerSalesStats,
  type SellerOrderStatus,
} from '@/lib/server/services/seller-order-service';
import { OrdersStats } from './orders-stats';
import { OrdersFilters } from './orders-filters';
import { OrdersTable } from './orders-table';
import { Pagination } from '@/components/storefront/pagination';

const PER_PAGE = 50;

export default async function SellerOrdersPage({
  searchParams,
}: {
  searchParams: {
    product?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  };
}) {
  const user = await getCurrentUser();
  if (!user || user.accountType !== 'seller') redirect('/');

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));

  const [stats, result, sellerProducts] = await Promise.all([
    getSellerSalesStats(),
    listSellerOrders({
      productId: searchParams.product,
      status: searchParams.status as SellerOrderStatus | undefined,
      from: searchParams.from,
      to: searchParams.to,
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
    }),
    (async () => {
      const db = await createClient();
      const { data } = await db
        .from('products')
        .select('id, title')
        .eq('seller_id', user.id)
        .neq('status', 'deleted')
        .order('title');
      return data ?? [];
    })(),
  ]);

  const totalPages = Math.ceil(result.total / PER_PAGE);

  if (!stats) {
    return (
      <main className="p-6">
        <p className="text-muted-foreground">تعذّر تحميل الإحصائيات. حاول لاحقًا.</p>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">مبيعاتي</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.total_sales === 0
              ? 'لا توجد مبيعات بعد.'
              : `${stats.total_sales} عملية بيع`}
          </p>
        </div>
        <Link href="/seller/wallet" className="text-sm text-primary hover:underline">
          المحفظة والمستحقات ←
        </Link>
      </div>

      <OrdersStats stats={stats} />

      <OrdersFilters products={sellerProducts} />

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {result.total} عملية مطابقة
        </p>
      </div>

      <OrdersTable orders={result.items} />

      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/seller/orders"
          query={{
            product: searchParams.product,
            status: searchParams.status,
            from: searchParams.from,
            to: searchParams.to,
          }}
        />
      )}
    </main>
  );
}
