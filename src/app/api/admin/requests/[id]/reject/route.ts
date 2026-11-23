import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';

const body = z.object({ reason: z.string().min(3) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePerm('request.reject');
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const db = await createClient();
    const { error } = await db.rpc('reject_purchase_request', {
      p_request_id: params.id,
      p_reason: parsed.data.reason,
    });
    if (error) return NextResponse.json({ error: publicError(error) }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}