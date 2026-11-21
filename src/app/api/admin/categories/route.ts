import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePerm } from '@/lib/auth/admin-guard';
import { createCategory, listCategoriesFlat } from '@/lib/server/services/category-service';

const createSchema = z.object({
  name: z.string().min(2).max(80),
  parent_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export async function GET() {
  try {
    await requirePerm('category.manage');
    const categories = await listCategoriesFlat();
    return NextResponse.json({ categories });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePerm('category.manage');
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_BODY', details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await createCategory({
      name: parsed.data.name,
      parentId: parsed.data.parent_id ?? null,
      isActive: parsed.data.is_active,
      sortOrder: parsed.data.sort_order,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}