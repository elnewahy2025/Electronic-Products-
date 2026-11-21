import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyDownloadToken } from '@/lib/crypto/download-token';
import { recordCompletion } from '@/lib/server/services/download-service';
import { createClient } from '@/lib/supabase/server';

const bodySchema = z.object({
  token: z.string(),
  files: z.array(z.object({
    file_version_id: z.string().uuid(),
    bytes_sent: z.number().int().nonnegative(),
    checksum: z.string().optional(),
  })).min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  // Internal secret OR authenticated buyer
  const internalSecret = req.headers.get('x-internal-secret');
  const isInternal = internalSecret === process.env.DOWNLOAD_SERVICE_TOKEN;

  if (!isInternal) {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const payload = verifyDownloadToken(parsed.data.token);
  if (!payload) return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 401 });
  if (payload.sid !== params.sessionId) {
    return NextResponse.json({ error: 'TOKEN_SESSION_MISMATCH' }, { status: 403 });
  }

  // For single, verify file matches
  if (payload.typ === 'single') {
    if (parsed.data.files.length !== 1 || parsed.data.files[0].file_version_id !== payload.fid) {
      return NextResponse.json({ error: 'FILE_MISMATCH' }, { status: 400 });
    }
  }

  try {
    const result = await recordCompletion({
      sessionId: params.sessionId,
      type: payload.typ === 'zip' ? 'zip' : 'single_files',
      files: parsed.data.files.map(f => ({
        fileVersionId: f.file_version_id,
        bytesSent: f.bytes_sent,
        checksum: f.checksum,
      })),
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}