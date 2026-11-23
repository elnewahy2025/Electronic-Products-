import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePerm } from '@/lib/auth/admin-guard';
import { reorderCategories } from '@/lib/server/services/category-service';

const bodySchema = z.object({
  order: z.array(z.object({
    id: z.string().uuid(),
    sort_order: z.number().int().min(0),
  })).max(500),
});

export async function POST(req: NextRequest) {
  try {
    await requirePerm('category.manage');
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    await reorderCategories(parsed.data.order);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 400 });
  }
}