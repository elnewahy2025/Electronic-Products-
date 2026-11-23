import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { publicError } from '@/lib/api/errors';
import { requireUser } from '@/lib/auth/session';
import { importDriveFiles } from '@/lib/server/services/upload-service';
import { processPendingScans } from '@/lib/server/services/scan-service';
import { processPendingPreviews } from '@/lib/server/services/preview-service';
import { enforceSellerThrottle } from '@/lib/security/seller-throttle';
import { acquireConcurrencySlot } from '@/lib/security/rate-limit';

const bodySchema = z.object({
  drive_account_id: z.string().uuid(),
  files: z
    .array(
      z.object({
        drive_file_id: z.string().min(1).max(256),
        name: z.string().max(300).optional(),
        mime: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const throttled = await enforceSellerThrottle({
      req,
      sellerId: user.id,
      scope: 'seller:drive:import',
      sellerLimit: 10,
      ipLimit: 20,
      windowSeconds: 600,
    });
    if (throttled) return throttled;

    const release = acquireConcurrencySlot(`seller:drive:import:${user.id}`, 1);
    if (!release) {
      return NextResponse.json(
        { error: 'CONCURRENT_IMPORT_IN_PROGRESS' },
        { status: 429, headers: { 'Retry-After': '10' } },
      );
    }

    try {
      const parsed = bodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
      }

      const results = await importDriveFiles({
        sellerId: user.id,
        driveAccountId: parsed.data.drive_account_id,
        files: parsed.data.files.map(f => ({
          driveFileId: f.drive_file_id,
          name: f.name,
          mime: f.mime,
        })),
      });

      const importedCount = results.filter(r => r.status === 'imported').length;
      if (importedCount > 0) {
        // Kick off real magic-byte scan AND preview generation so imported files become ready immediately
        void processPendingScans(Math.min(importedCount, 5))
          .then(() => processPendingPreviews(Math.min(importedCount, 5)))
          .catch(() => {});
      }

      return NextResponse.json({ results });
    } finally {
      release();
    }
  } catch (e: any) {
    const error = publicError(e, 'DRIVE_IMPORT_FAILED');
    return NextResponse.json(
      { error },
      { status: error === 'UNAUTHENTICATED' ? 401 : 400 },
    );
  }
}
