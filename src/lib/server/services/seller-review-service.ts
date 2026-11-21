import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';

export type SellerReviewRow = {
  id: string;
  product_id: string;
  product_title: string;
  product_slug: string;
  buyer_id: string;
  rating: number;
  body: string | null;
  status: 'published' | 'deleted';
  created_at: string;
  seller_reply: string | null;
  seller_replied_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
};

export type ProductStat = {
  product_id: string;
  product_title: string;
  total_reviews: number;
  avg_rating: number;
  r5: number;
  r4: number;
  r3: number;
  r2: number;
  r1: number;
  replied_count: number;
};

export type OverallStats = {
  total_reviews: number;
  avg_rating: number;
  unreplied_count: number;
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
  per_product: ProductStat[];
};

export async function getSellerOverallStats(sellerId: string): Promise<OverallStats> {
  const db = await createClient();
  const { data } = await db.rpc('seller_review_stats', { p_seller_id: sellerId });

  const rows = (data ?? []) as ProductStat[];

  let totalReviews = 0;
  let weightedSum = 0;
  let replied = 0;
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const r of rows) {
    totalReviews += Number(r.total_reviews);
    weightedSum += Number(r.avg_rating) * Number(r.total_reviews);
    replied += Number(r.replied_count);
    distribution[5] += Number(r.r5);
    distribution[4] += Number(r.r4);
    distribution[3] += Number(r.r3);
    distribution[2] += Number(r.r2);
    distribution[1] += Number(r.r1);
  }

  return {
    total_reviews: totalReviews,
    avg_rating: totalReviews > 0 ? Math.round((weightedSum / totalReviews) * 10) / 10 : 0,
    unreplied_count: totalReviews - replied,
    distribution,
    per_product: rows,
  };
}

export type ListFilters = {
  productId?: string;
  rating?: number;      // 1..5
  onlyUnreplied?: boolean;
  onlyDeleted?: boolean;
  limit?: number;
};

export async function listSellerReviews(
  sellerId: string,
  filters: ListFilters = {}
): Promise<SellerReviewRow[]> {
  const db = await createClient();

  let q = db
    .from('seller_reviews_view')
    .select('id, product_id, product_title, product_slug, buyer_id, rating, body, status, created_at, seller_reply, seller_replied_at, deleted_by, delete_reason')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(Math.min(filters.limit ?? 100, 200));

  if (filters.productId) q = q.eq('product_id', filters.productId);
  if (filters.rating) q = q.eq('rating', filters.rating);
  if (filters.onlyDeleted) {
    q = q.eq('status', 'deleted');
  } else {
    q = q.eq('status', 'published');
    if (filters.onlyUnreplied) q = q.is('seller_reply', null);
  }

  const { data } = await q;
  return (data ?? []) as SellerReviewRow[];
}

export async function replyToReview(input: {
  reviewId: string;
  sellerId: string;
  reply: string;
}): Promise<void> {
  const db = await createClient();
  const trimmed = input.reply.trim();

  if (!trimmed) throw new Error('reply_empty');
  if (trimmed.length > 2000) throw new Error('reply_too_long');

  // Verify ownership first
  const { data: review } = await db
    .from('seller_reviews_view')
    .select('id, product_id, seller_id')
    .eq('id', input.reviewId)
    .maybeSingle();

  if (!review) throw new Error('review_not_found');
  if (review.seller_id !== input.sellerId) throw new Error('forbidden');

  const { error } = await db
    .from('reviews')
    .update({
      seller_reply: trimmed,
      seller_replied_at: new Date().toISOString(),
      seller_replied_by: input.sellerId,
    })
    .eq('id', input.reviewId);

  if (error) {
    if (error.message.includes('not_authorized_for_reply')) throw new Error('forbidden');
    throw new Error(error.message);
  }

  await logAudit({
    action: 'review.replied',
    entityType: 'reviews',
    entityId: input.reviewId,
    after: { reply_length: trimmed.length },
  });
}

export async function deleteSellerReply(input: {
  reviewId: string;
  sellerId: string;
}): Promise<void> {
  const db = await createClient();

  const { data: review } = await db
    .from('seller_reviews_view')
    .select('id, seller_id')
    .eq('id', input.reviewId)
    .maybeSingle();

  if (!review) throw new Error('review_not_found');
  if (review.seller_id !== input.sellerId) throw new Error('forbidden');

  const { error } = await db
    .from('reviews')
    .update({
      seller_reply: null,
      seller_replied_at: null,
      seller_replied_by: null,
    })
    .eq('id', input.reviewId);

  if (error) throw new Error(error.message);

  await logAudit({
    action: 'review.reply_deleted',
    entityType: 'reviews',
    entityId: input.reviewId,
  });
}
