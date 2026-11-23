import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCOPES = new Set(['global', 'category', 'product_type']);

export async function GET() {
  try {
    await requirePerm('commission.seller.override');
    const db = await createClient();
    const { data, error } = await db
      .from('seller_commissions')
      .select(`
        id, seller_id, scope, reference_id, rate, effective_from, effective_to,
        seller_profiles!seller_commissions_seller_id_fkey(display_name)
      `)
      .order('effective_from', { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: publicError(error) }, { status: 400 });
    return NextResponse.json({ items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePerm('commission.seller.override');
    const body = await req.json().catch(() => null);
    const sellerId = String(body?.seller_id ?? '');
    const scope = String(body?.scope ?? 'global');
    const referenceId = body?.reference_id ? String(body.reference_id) : null;
    const rate = Number(body?.rate);
    const effectiveTo = body?.effective_to ? String(body.effective_to) : null;

    if (!UUID_RE.test(sellerId)) {
      return NextResponse.json({ error: 'معرّف البائع غير صالح.' }, { status: 400 });
    }
    if (!SCOPES.has(scope)) {
      return NextResponse.json({ error: 'نطاق العمولة غير صالح.' }, { status: 400 });
    }
    if (scope === 'category' && (!referenceId || !UUID_RE.test(referenceId))) {
      return NextResponse.json({ error: 'يرجى اختيار التصنيف لنطاق التصنيف.' }, { status: 400 });
    }
    if (Number.isNaN(rate) || rate < 0 || rate > 1) {
      return NextResponse.json({ error: 'نسبة العمولة يجب أن تكون بين 0 و1 (مثلاً 0.08 لـ 8%).' }, { status: 400 });
    }

    const db = await createClient();
    const { data, error } = await db
      .from('seller_commissions')
      .insert({
        seller_id: sellerId,
        scope: scope as any,
        reference_id: scope === 'category' ? referenceId : null,
        rate,
        effective_to: effectiveTo || null,
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: publicError(error) }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}
