import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { redeemCode } from '@/lib/server/services/redeem-service';

const bodySchema = z.object({
  code: z.string().min(8).max(32),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'بيانات غير صالحة.', code: 'INVALID_BODY' },
      { status: 400 }
    );
  }

  const result = await redeemCode(parsed.data.code, req);

  if (!result.ok) {
    const headers: Record<string, string> = {};
    if (result.retryAfter) headers['retry-after'] = String(result.retryAfter);

    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status, headers }
    );
  }

  return NextResponse.json({ ok: true, session_id: result.sessionId });
}