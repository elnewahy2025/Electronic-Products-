import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { enforceSellerThrottle } from '@/lib/security/seller-throttle';
import { initUpload } from '@/lib/server/services/upload-service';

const SHA256_RE = /^[a-f0-9]{64}$/i;

const bodySchema = z.object({
  original_name: z.string().min(1).max(255),
  mime: z.string().trim().min(1).max(150),
  size: z.number().int().positive(),
  checksum: z.string().trim().regex(SHA256_RE, 'invalid_sha256').optional(),
  drive_account_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e: any) {
    const status = e?.message === 'UNAUTHENTICATED' ? 401 : 403;
    return NextResponse.json({ error: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN' }, { status });
  }
  if (user.accountType !== 'seller') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // M-17: throttle Drive folder creation & resumable session init per seller + IP
  const throttled = await enforceSellerThrottle({
    req,
    sellerId: user.id,
    scope: 'seller:upload:init',
    sellerLimit: 40,
    ipLimit: 80,
    windowSeconds: 3600,
  });
  if (throttled) return throttled;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', details: parsed.error.flatten() }, { status: 400 });
  }

  const origin = req.headers.get('origin') || req.nextUrl.origin;

  try {
    const result = await initUpload({
      sellerId: user.id,
      originalName: parsed.data.original_name,
      mime: parsed.data.mime,
      size: parsed.data.size,
      checksum: parsed.data.checksum,
      driveAccountId: parsed.data.drive_account_id,
      origin,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    const status = e.message === 'FILE_TOO_LARGE' ? 413
                : e.message === 'DRIVE_QUOTA_EXCEEDED' ? 507
                : e.message === 'NO_DRIVE_ACCOUNT' || e.message === 'no_drive_account_available' ? 409
                : 400;
    return NextResponse.json(
      { error: publicError(e, 'REQUEST_FAILED', 'api/upload/init') },
      { status },
    );
  }
}