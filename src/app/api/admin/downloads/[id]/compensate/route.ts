import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';

const body = z.object({ reason: z.string().min(3) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePerm('download.compensation.request');
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const db = await createClient();

    // Resolve code_id from the session
    const { data: session } = await db
      .from('download_sessions')
      .select('code_id')
      .eq('id', params.id)
      .single();
    if (!session) return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 });

    const { data: compId, error } = await db.rpc('create_compensation_session', {
      p_code_id: session.code_id,
      p_reason: parsed.data.reason,
    });
    if (error) {
      const status = error.message.includes('compensation_limit_reached') ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ ok: true, session_id: compId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
}