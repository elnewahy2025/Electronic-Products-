import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/permissions';
import { logAudit } from '@/lib/audit/logger';

const bodySchema = z.object({
  status: z.enum(['published', 'suspended', 'rejected']),
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission('product.suspend');

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    }

    const { status, reason } = parsed.data;
    if ((status === 'suspended' || status === 'rejected') && (!reason || reason.trim().length < 3)) {
      return NextResponse.json({ error: 'REASON_REQUIRED' }, { status: 400 });
    }

    const db = await createClient();
    const { data: before } = await db
      .from('products')
      .select('id, status, suspension_reason, rejection_reason')
      .eq('id', params.id)
      .maybeSingle();

    if (!before) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    const patch: Record<string, unknown> = { status };
    if (status === 'suspended') patch.suspension_reason = reason?.trim() ?? null;
    if (status === 'rejected') patch.rejection_reason = reason?.trim() ?? null;
    if (status === 'published') {
      patch.suspension_reason = null;
      patch.rejection_reason = null;
      patch.published_at = new Date().toISOString();
    }

    const { error } = await db
      .from('products')
      .update(patch)
      .eq('id', params.id);

    if (error) return NextResponse.json({ error: publicError(error) }, { status: 400 });

    await logAudit({
      action: status === 'suspended' ? 'product.suspended' : status === 'rejected' ? 'product.rejected' : 'product.published',
      entityType: 'products',
      entityId: params.id,
      before,
      after: patch,
      reason: reason?.trim(),
    });

    revalidateTag('storefront-products');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const code = e.message === 'FORBIDDEN' ? 403 : e.message === 'UNAUTHENTICATED' ? 401 : 400;
    return NextResponse.json({ error: publicError(e) }, { status: code });
  }
}
