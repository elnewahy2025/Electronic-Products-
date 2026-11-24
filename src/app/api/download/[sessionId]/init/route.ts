import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { initiateDownload } from '@/lib/server/services/download-service';

const bodySchema = z.union([
  z.object({ type: z.literal('zip') }),
  z.object({ type: z.literal('single'), file_version_id: z.string().uuid() }),
]);

export async function POST(req: NextRequest, props: { params: Promise<{ sessionId: string }> }) {
  const params = await props.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  try {
    const result = await initiateDownload({
      sessionId: params.sessionId,
      type: parsed.data.type === 'zip' ? 'zip' : 'single',
      fileVersionId: parsed.data.type === 'single' ? parsed.data.file_version_id : undefined,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    const code = e.message === 'FORBIDDEN' ? 403
              : e.message === 'UNAUTHENTICATED' ? 401
              : e.message === 'ATTEMPTS_EXHAUSTED' ? 409
              : e.message === 'FILE_ALREADY_DELIVERED' ? 409
              : e.message === 'SESSION_EXPIRED' ? 410
              : 400;
    return NextResponse.json({ error: publicError(e) }, { status: code });
  }
}