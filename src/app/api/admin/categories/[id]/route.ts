import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePerm } from '@/lib/auth/admin-guard';
import { updateCategory, deleteCategory } from '@/lib/server/services/category-service';

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  slug: z.string().min(2).max(80).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requirePerm('category.manage');
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    await updateCategory({
      id: params.id,
      name: parsed.data.name,
      slug: parsed.data.slug,
      parentId: parsed.data.parent_id,
      isActive: parsed.data.is_active,
      sortOrder: parsed.data.sort_order,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 400 });
  }
}

const deleteSchema = z.object({
  mode: z.enum(['block', 'reassign']),
  fallback_category_id: z.string().uuid().nullable().optional(),
});

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requirePerm('category.manage');
    const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const result = await deleteCategory({
      id: params.id,
      mode: parsed.data.mode,
      fallbackCategoryId: parsed.data.fallback_category_id ?? null,
    });

    return NextResponse.json({
      ok: true,
      reassigned_children: result.reassignedChildren,
      reassigned_products: result.reassignedProducts,
    });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 400 });
  }
}