import { NextRequest, NextResponse } from 'next/server';
import { startMfaSetup, verifyMfaAndEnable } from '@/lib/auth/mfa';
import { z } from 'zod';

const bodySchema = z.union([
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('verify'), code: z.string().regex(/^\d{6}$/) }),
]);

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  try {
    if (parsed.data.action === 'start') {
      const { secret, qr } = await startMfaSetup();
      return NextResponse.json({ secret, qr });
    }
    await verifyMfaAndEnable(parsed.data.code);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'MFA_ERROR' }, { status: 400 });
  }
}