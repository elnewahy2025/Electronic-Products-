import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';

const attestationSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().trim().length(3),
  reference: z.string().trim().min(3).max(200),
  method: z.string().trim().min(1).max(50).optional().nullable(),
});

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requirePerm('code.issue');
    const body = attestationSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: 'ATTESTATION_REQUIRED' }, { status: 400 });
    }

    const db = await createClient();
    const { data, error } = await db.rpc('approve_purchase_request', {
      p_request_id: params.id,
      p_pepper: process.env.CODE_HASH_PEPPER,
      p_attestation: {
        amount: body.data.amount,
        currency: body.data.currency.toUpperCase(),
        reference: body.data.reference,
        method: body.data.method ?? undefined,
      },
    });
    if (error) return NextResponse.json({ error: publicError(error, 'REQUEST_FAILED') }, { status: 400 });

    return NextResponse.json({ ok: true, codes: data });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}