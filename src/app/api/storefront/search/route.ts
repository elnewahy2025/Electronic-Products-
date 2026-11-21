import { NextRequest, NextResponse } from 'next/server';
import { searchStorefront } from '@/lib/server/services/storefront-service';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  try {
    const result = await searchStorefront({
      query: searchParams.get('q') ?? undefined,
      categorySlug: searchParams.get('category') ?? undefined,
      sort: (searchParams.get('sort') as any) ?? 'newest',
      minPrice: searchParams.get('min') ? Number(searchParams.get('min')) : undefined,
      maxPrice: searchParams.get('max') ? Number(searchParams.get('max')) : undefined,
      limit: Math.min(parseInt(searchParams.get('limit') ?? '6', 10), 60),
      offset: parseInt(searchParams.get('offset') ?? '0', 10),
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, items: [], total: 0 }, { status: 500 });
  }
}