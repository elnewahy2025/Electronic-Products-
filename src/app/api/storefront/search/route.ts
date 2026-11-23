import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchStorefront } from '@/lib/server/services/storefront-service';

const optionalFiniteNumber = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : Number(v)))
  .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0 && v <= 1_000_000), {
    message: 'invalid_number',
  });

const optionalBoundedInt = (def: number, min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .refine((v) => Number.isInteger(v) && v >= min && v <= max, {
      message: 'invalid_integer',
    });

const querySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    category: z
      .string()
      .trim()
      .max(100)
      .regex(/^[a-z0-9-]+$/i)
      .optional(),
    sort: z
      .enum(['newest', 'popular', 'price_asc', 'price_desc', 'rating'])
      .optional()
      .default('newest'),
    min: optionalFiniteNumber,
    max: optionalFiniteNumber,
    limit: optionalBoundedInt(6, 1, 60),
    offset: optionalBoundedInt(0, 0, 10_000),
  })
  .refine((d) => d.min === undefined || d.max === undefined || d.min <= d.max, {
    message: 'invalid_price_range',
  });

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const parsed = querySchema.safeParse({
    q: searchParams.get('q') || undefined,
    category: searchParams.get('category') || undefined,
    sort: searchParams.get('sort') || undefined,
    min: searchParams.get('min') ?? undefined,
    max: searchParams.get('max') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    offset: searchParams.get('offset') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_QUERY', items: [], total: 0 }, { status: 400 });
  }

  try {
    const result = await searchStorefront({
      query: parsed.data.q,
      categorySlug: parsed.data.category,
      sort: parsed.data.sort as any,
      minPrice: parsed.data.min,
      maxPrice: parsed.data.max,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e), items: [], total: 0 }, { status: 500 });
  }
}
