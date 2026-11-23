import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';

const body = z.object({ reason: z.string().min(3) });

const STATUS_BY_ERROR: Record<string, number> = {
  not_authorized: 403,
  reason_required: 400,
  compensation_not_found: 404,
  compensation_not_pending: 409,
  compensation_not_allowed: 409,
  compensation_limit_reached: 409,
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePerm('download.compensation.approve');
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const db = await createClient();
    const { data: sessionId, error } = await db.rpc('approve_compensation', {
      p_request_id: params.id,
      p_reason: parsed.data.reason,
    });
    if (error) {
      const code = error.message.includes('compensation_') || error.message === 'not_authorized'
        ? error.message
        : 'COMPENSATION_APPROVE_FAILED';
      return NextResponse.json(
        { error: code },
        { status: STATUS_BY_ERROR[code] ?? 400 },
      );
    }

    return NextResponse.json({ ok: true, session_id: sessionId });
  } catch (e: any) {
    const status = e?.message === 'FORBIDDEN' || e?.message === 'UNAUTHENTICATED' ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR' }, { status });
  }
}
