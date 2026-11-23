import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { requestPayout } from '@/lib/server/services/seller-wallet-service';

const body = z.object({
  amount: z.number().positive(),
  currency: z.enum(['USD', 'EGP', 'SAR', 'KWD']),
  method: z.string().min(1).max(50),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') throw new Error('FORBIDDEN');
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    const result = await requestPayout(parsed.data);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 400 });
  }
}