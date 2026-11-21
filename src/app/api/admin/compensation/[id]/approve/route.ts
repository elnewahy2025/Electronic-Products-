import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';

const body = z.object({ reason: z.string().min(3) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePerm('download.compensation.approve');
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const db = await createClient();
    const { data: comp } = await db
      .from('compensation_requests')
      .select('code_id')
      .eq('id', params.id)
      .single();
    if (!comp) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    const { error } = await db.rpc('create_compensation_session', {
      p_code_id: comp.code_id,
      p_reason: parsed.data.reason,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
}