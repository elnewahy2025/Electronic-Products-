import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';

const body = z.object({ reason: z.string().min(3) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePerm('download.session.revoke');
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const db = await createClient();
    const { error } = await db.rpc('revoke_session_before_delivery', {
      p_session_id: params.id,
      p_reason: parsed.data.reason,
    });
    if (error) {
      const status = error.message.includes('blocked_after_delivery') ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
}