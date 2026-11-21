import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import {
  getSellerOverallStats,
  listSellerReviews,
} from '@/lib/server/services/seller-review-service';
import { SellerReviewsList } from './seller-reviews-list';
import { ReviewsStats } from './reviews-stats';
import { ReviewsFilters } from './reviews-filters';

export default async function SellerReviewsPage({
  searchParams,
}: {
  searchParams: {
    product?: string;
    rating?: string;
    unreplied?: string;
    deleted?: string;
  };
}) {
  const user = await getCurrentUser();
  if (!user || user.accountType !== 'seller') redirect('/');

  const [stats, reviews] = await Promise.all([
    getSellerOverallStats(user.id),
    listSellerReviews(user.id, {
      productId: searchParams.product,
      rating: searchParams.rating ? parseInt(searchParams.rating, 10) : undefined,
      onlyUnreplied: searchParams.unreplied === '1',
      onlyDeleted: searchParams.deleted === '1',
    }),
  ]);

  return (
    <main className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">تقييمات منتجاتي</h1>
        <p className="text-sm text-muted-foreground mt-1">
          راقب آراء المشترين وردّ عليها لبناء الثقة.
        </p>
      </div>

      <ReviewsStats stats={stats} />

      <ReviewsFilters
        perProduct={stats.per_product}
        currentProduct={searchParams.product}
        currentRating={searchParams.rating}
        onlyUnreplied={searchParams.unreplied === '1'}
        onlyDeleted={searchParams.deleted === '1'}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {reviews.length} تقييم
        </p>
        <Link
          href="/seller/products"
          className="text-sm text-primary hover:underline"
        >
          إدارة المنتجات ←
        </Link>
      </div>

      <SellerReviewsList initial={reviews} />
    </main>
  );
}
