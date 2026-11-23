import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';

const body = z.object({ reason: z.string().min(3) });

const STATUS_BY_ERROR: Record<string, number> = {
  not_authorized: 403,
  reason_required: 400,
  compensation_not_allowed: 409,
  compensation_pending_exists: 409,
  compensation_limit_reached: 409,
};

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

    const { data: resultId, error } = await db.rpc('create_compensation_session', {
      p_code_id: session.code_id,
      p_reason: parsed.data.reason,
    });
    if (error) {
      const known = Object.keys(STATUS_BY_ERROR).find(code => error.message.includes(code));
      const code = known ?? 'COMPENSATION_REQUEST_FAILED';
      return NextResponse.json({ error: code }, { status: STATUS_BY_ERROR[code] ?? 400 });
    }

    // Admins get a ready session; other staff get a pending request that an
    // approver must decide via /api/admin/compensation/[id]/approve.
    const { data: readySession } = await db
      .from('download_sessions')
      .select('id')
      .eq('id', resultId)
      .maybeSingle();

    if (readySession) {
      return NextResponse.json({ ok: true, session_id: resultId, request_id: null });
    }
    return NextResponse.json({ ok: true, session_id: null, request_id: resultId });
  } catch (e: any) {
    const status = e?.message === 'FORBIDDEN' || e?.message === 'UNAUTHENTICATED' ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR' }, { status });
  }
}
