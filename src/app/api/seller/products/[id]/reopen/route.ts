import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
    const db = await createClient();
    const { error } = await db.rpc('reopen_product', { p_product_id: params.id });
    if (error) {
      const status = error.code === '42501' ? 403 : 400;
      return NextResponse.json({ error: publicError(error) }, { status });
    }
    revalidateTag('storefront-products');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e.message === 'UNAUTHENTICATED' ? 401 : e.message === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: publicError(e) }, { status });
  }
}