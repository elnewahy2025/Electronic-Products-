import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';
import { logAudit } from '@/lib/audit/logger';

const isoDateTime = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'invalid_datetime');

const bodySchema = z
  .discriminatedUnion('scope', [
    z.object({
      seller_id: z.string().uuid(),
      scope: z.literal('global'),
      reference_id: z.null().optional(),
      rate: z.number().finite().min(0).max(1),
      effective_from: isoDateTime.optional(),
      effective_to: isoDateTime.nullable().optional(),
    }),
    z.object({
      seller_id: z.string().uuid(),
      scope: z.literal('category'),
      reference_id: z.string().uuid(),
      rate: z.number().finite().min(0).max(1),
      effective_from: isoDateTime.optional(),
      effective_to: isoDateTime.nullable().optional(),
    }),
  ])
  .refine(
    (v) => {
      if (!v.effective_to) return true;
      const fromMs = v.effective_from ? Date.parse(v.effective_from) : Date.now();
      return Date.parse(v.effective_to) > fromMs;
    },
    { message: 'effective_to_before_effective_from' },
  );

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

    if (error) return NextResponse.json({ error: publicError(error, 'REQUEST_FAILED', 'api/admin/commissions:GET') }, { status: 400 });
    return NextResponse.json({ items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e, 'REQUEST_FAILED', 'api/admin/commissions:GET') }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePerm('commission.seller.override');
    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    }

    const normalized = {
      seller_id: raw.seller_id,
      scope: raw.scope ?? 'global',
      reference_id: raw.scope === 'category' ? raw.reference_id : null,
      rate: typeof raw.rate === 'string' ? Number(raw.rate) : raw.rate,
      effective_from: raw.effective_from || undefined,
      effective_to: raw.effective_to || null,
    };

    const parsed = bodySchema.safeParse(normalized);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات استثناء العمولة غير صالحة (المسموح: global أو category مع تصنيف صالح ونسبة بين 0 و1).' },
        { status: 400 },
      );
    }

    const db = await createClient();
    const insertRow = {
      seller_id: parsed.data.seller_id,
      scope: parsed.data.scope,
      reference_id: parsed.data.scope === 'category' ? parsed.data.reference_id : null,
      rate: parsed.data.rate,
      ...(parsed.data.effective_from ? { effective_from: parsed.data.effective_from } : {}),
      effective_to: parsed.data.effective_to ?? null,
    };

    const { data, error } = await db
      .from('seller_commissions')
      .insert(insertRow)
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: publicError(error, 'REQUEST_FAILED', 'api/admin/commissions:POST') }, { status: 400 });

    await logAudit({
      action: 'commission.override_created',
      entityType: 'seller_commissions',
      entityId: data.id,
      after: insertRow,
      required: true,
    });

    return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e, 'REQUEST_FAILED', 'api/admin/commissions:POST') }, { status: 403 });
  }
}
