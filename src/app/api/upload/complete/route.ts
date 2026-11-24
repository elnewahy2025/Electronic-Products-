import { logServerError, publicError } from '@/lib/api/errors';
import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { completeUpload } from '@/lib/server/services/upload-service';
import { processPendingScans } from '@/lib/server/services/scan-service';
import { processPendingPreviews } from '@/lib/server/services/preview-service';

const bodySchema = z.object({
  session_id: z.string().uuid(),
  drive_file_id: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  try {
    const result = await completeUpload({
      sellerId: user.id,
      sessionId: parsed.data.session_id,
      driveFileId: parsed.data.drive_file_id,
    });
    // M-08: bind background scan/preview kick to Next.js `after()` lifecycle
    after(async () => {
      try {
        await processPendingScans(3);
        await processPendingPreviews(3);
      } catch (err) {
        logServerError('api/upload/complete:post-process', err);
      }
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: publicError(e, 'REQUEST_FAILED', 'api/upload/complete') },
      { status: 400 },
    );
  }
}