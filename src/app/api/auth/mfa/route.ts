import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getMfaStatus,
  startMfaSetup,
  verifyMfaAndEnable,
  verifyMfaLogin,
} from '@/lib/auth/mfa';
import { MFA_COOKIE, clearMfaCookieOptions, mfaCookieOptions } from '@/lib/auth/mfa-session';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('begin') }),
  z.object({ action: z.literal('status') }),
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('verify'), code: z.string().regex(/^\d{6}$/) }),
  z.object({ action: z.literal('challenge'), code: z.string().regex(/^\d{6}$/) }),
]);

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  try {
    const { action } = parsed.data;

    if (action === 'begin') {
      // Called immediately after password/OAuth login: drop any MFA
      // satisfaction token from a previous login session.
      const status = await getMfaStatus();
      const res = NextResponse.json(status);
      res.cookies.set(MFA_COOKIE, '', clearMfaCookieOptions());
      return res;
    }

    if (action === 'status') {
      return NextResponse.json(await getMfaStatus());
    }

    if (action === 'start') {
      const { secret, qr } = await startMfaSetup();
      return NextResponse.json({ secret, qr });
    }

    const token =
      action === 'verify'
        ? await verifyMfaAndEnable(parsed.data.code)
        : await verifyMfaLogin(parsed.data.code);

    const res = NextResponse.json({ ok: true, ...(await getMfaStatus()) });
    res.cookies.set(MFA_COOKIE, token, mfaCookieOptions());
    return res;
  } catch (e: any) {
    const message = e?.message ?? 'MFA_ERROR';
    const status = message === 'MFA_TOO_MANY_ATTEMPTS' ? 429 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
