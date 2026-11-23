import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';

const CURRENCY_RE = /^[A-Z]{3}$/;

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const body = await req.json().catch(() => null);
    const base = String(body?.base_currency ?? 'USD').toUpperCase().trim();
    const quote = String(body?.quote_currency ?? '').toUpperCase().trim();
    const rate = Number(body?.rate);

    if (!CURRENCY_RE.test(base) || !CURRENCY_RE.test(quote) || base === quote) {
      return NextResponse.json({ error: 'رموز العملات غير صالحة (3 أحرف إنجليزية مختلفة).' }, { status: 400 });
    }
    if (Number.isNaN(rate) || rate <= 0) {
      return NextResponse.json({ error: 'سعر الصرف يجب أن يكون رقماً موجباً.' }, { status: 400 });
    }

    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    const { data, error } = await db
      .from('exchange_rates')
      .insert({
        base_currency: base,
        quote_currency: quote,
        rate,
        set_by: user?.id ?? null,
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: publicError(error) }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}
