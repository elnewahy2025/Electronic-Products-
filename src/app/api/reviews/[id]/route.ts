import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';
import { deleteReview } from '@/lib/server/services/review-service';

const body = z.object({ reason: z.string().min(3) });

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'REASON_REQUIRED' }, { status: 400 });

    // Allowed for: admin/staff with review.delete, OR the seller who owns the product
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

    const { data: review } = await db
      .from('reviews')
      .select('id, product_id, products!inner(seller_id)')
      .eq('id', params.id)
      .single();

    if (!review) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    const sellerId = (review as any).products?.seller_id;
    const isOwner = sellerId === user.id;

    if (!isOwner) {
      // Must be admin/staff with review.delete
      try { await requirePerm('review.delete'); }
      catch { return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }); }
    }

    await deleteReview({ reviewId: params.id, reason: parsed.data.reason });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}