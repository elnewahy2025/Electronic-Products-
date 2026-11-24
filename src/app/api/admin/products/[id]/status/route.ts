import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/permissions';
import { logAudit } from '@/lib/audit/logger';
import type { TablesUpdate } from '@/lib/types/database';

const bodySchema = z.object({
  status: z.enum(['published', 'suspended', 'rejected']),
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    }

    const { status, reason } = parsed.data;

    // Publishing is an approval action, not a moderation action: it must not
    // be reachable with the `product.suspend` permission alone.
    if (status === 'published') {
      await requirePermission('product.publish');
    } else {
      await requirePermission('product.suspend');
    }

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

    if (status === 'published') {
      // H-02: publishing is validated atomically in the database. The RPC
      // checks seller approval, a published version, ready files and staff
      // permission, owns published_at, and writes the audit row. A direct
      // client UPDATE cannot satisfy these checks.
      const { error: publishError } = await db.rpc('admin_publish_product', {
        p_product_id: params.id,
      });
      if (publishError) {
        const httpStatus =
          publishError.code === '42501' ? 403 :
          publishError.code === 'P0002' ? 404 : 400;
        const mapped =
          publishError.message === 'no_published_version' ? 'NO_PUBLISHED_VERSION' :
          publishError.message === 'seller_not_approved' ? 'SELLER_NOT_APPROVED' :
          publishError.message === 'version_has_unready_files' ? 'VERSION_HAS_UNREADY_FILES' :
          undefined;
        return NextResponse.json(
          { error: mapped ?? publicError(publishError, 'REQUEST_FAILED', 'api/admin/products/[id]/status') },
          { status: httpStatus },
        );
      }
      revalidateTag('storefront-products');
      return NextResponse.json({ ok: true });
    }

    const patch: TablesUpdate<'products'> = { status };
    if (status === 'suspended') patch.suspension_reason = reason?.trim() ?? null;
    if (status === 'rejected') patch.rejection_reason = reason?.trim() ?? null;

    const { error } = await db
      .from('products')
      .update(patch)
      .eq('id', params.id);

    if (error) {
      return NextResponse.json(
        { error: publicError(error, 'REQUEST_FAILED', 'api/admin/products/[id]/status') },
        { status: 400 },
      );
    }

    await logAudit({
      action: status === 'suspended' ? 'product.suspended' : 'product.rejected',
      entityType: 'products',
      entityId: params.id,
      before,
      after: patch,
      reason: reason?.trim(),
      required: true,
    });

    revalidateTag('storefront-products');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const code = e.message === 'FORBIDDEN' ? 403 : e.message === 'UNAUTHENTICATED' ? 401 : 400;
    return NextResponse.json(
      { error: publicError(e, 'REQUEST_FAILED', 'api/admin/products/[id]/status') },
      { status: code },
    );
  }
}
