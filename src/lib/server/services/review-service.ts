import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';

export type ReviewRow = {
  id: string;
  product_id: string;
  buyer_id: string;
  rating: number;
  body: string | null;
  status: 'published' | 'deleted';
  created_at: string;
  deleted_by: string | null;
  delete_reason: string | null;
  seller_reply?: string | null;
  seller_replied_at?: string | null;
};

export type ProductRating = { average: number; count: number };

export async function getProductRating(productId: string): Promise<ProductRating> {
  const db = await createClient();
  const { data } = await db
    .from('reviews')
    .select('rating')
    .eq('product_id', productId)
    .eq('status', 'published');

  const rows = data ?? [];
  if (!rows.length) return { average: 0, count: 0 };
  const sum = rows.reduce((s, r) => s + (r.rating ?? 0), 0);
  return { average: Math.round((sum / rows.length) * 10) / 10, count: rows.length };
}

export async function getProductReviews(productId: string, limit = 20): Promise<ReviewRow[]> {
  const db = await createClient();
  const { data } = await db
    .from('reviews')
    .select('id, product_id, buyer_id, rating, body, status, created_at, deleted_by, delete_reason, seller_reply, seller_replied_at')
    .eq('product_id', productId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as ReviewRow[];
}

export async function getMyReviewForProduct(
  productId: string
): Promise<ReviewRow | null> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  const { data } = await db
    .from('reviews')
    .select('id, product_id, buyer_id, rating, body, status, created_at, deleted_by, delete_reason')
    .eq('product_id', productId)
    .eq('buyer_id', user.id)
    .maybeSingle();

  return (data ?? null) as ReviewRow | null;
}

/**
 * Returns true if the current user has an approved order_item for this product.
 */
export async function canCurrentUserReview(productId: string): Promise<{
  canReview: boolean;
  orderItemId?: string;
  reason?: string;
}> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { canReview: false, reason: 'login_required' };

  const { data: existing } = await db
    .from('reviews')
    .select('id')
    .eq('product_id', productId)
    .eq('buyer_id', user.id)
    .maybeSingle();

  if (existing) return { canReview: false, reason: 'already_reviewed' };

  const { data: eligible } = await db
    .from('order_items')
    .select(`
      id,
      orders!inner(
        purchase_requests!inner(buyer_id, status, customer_email)
      )
    `)
    .eq('product_id', productId)
    .in('orders.purchase_requests.status', ['approved', 'completed'])
    .limit(1);

  const match = eligible?.find((row: any) => {
    const pr = row.orders?.purchase_requests;
    return pr?.buyer_id === user.id || pr?.customer_email === user.email;
  });

  if (!match) return { canReview: false, reason: 'not_purchased' };
  return { canReview: true, orderItemId: (match as any).id };
}

export async function createReview(input: {
  productId: string;
  rating: number;
  body?: string;
}): Promise<{ id: string }> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');

  if (input.rating < 1 || input.rating > 5) throw new Error('INVALID_RATING');

  const eligibility = await canCurrentUserReview(input.productId);
  if (!eligibility.canReview || !eligibility.orderItemId) {
    throw new Error(eligibility.reason ?? 'NOT_ELIGIBLE');
  }

  const { data, error } = await db
    .from('reviews')
    .insert({
      product_id: input.productId,
      buyer_id: user.id,
      order_item_id: eligibility.orderItemId,
      rating: input.rating,
      body: input.body ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.message.includes('duplicate key')) throw new Error('ALREADY_REVIEWED');
    throw new Error(error.message);
  }

  await logAudit({
    action: 'review.created',
    entityType: 'reviews',
    entityId: data.id,
    after: { product_id: input.productId, rating: input.rating },
  });

  return { id: data.id };
}

export async function deleteReview(input: { reviewId: string; reason: string }): Promise<void> {
  const db = await createClient();
  const { error } = await db.rpc('delete_review', {
    p_review_id: input.reviewId,
    p_reason: input.reason,
  });
  if (error) throw new Error(error.message);
}