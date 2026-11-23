import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyDownloadToken } from '@/lib/crypto/download-token';
import { constantTimeEqual } from '@/lib/crypto/constant-time';
import { recordCompletion } from '@/lib/server/services/download-service';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
  // Internal secret OR the buyer who owns the session.
  const isInternal = constantTimeEqual(
    req.headers.get('x-internal-secret'),
    process.env.DOWNLOAD_SERVICE_TOKEN
  );

  let userId: string | undefined;
  if (!isInternal) {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    userId = user.id;
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

  // Re-validate server state: tokens outlive sessions by design.
  const admin = createAdminClient();
  const { data: session } = await admin
    .from('download_sessions')
    .select('id, product_version_id, status, expires_at')
    .eq('id', params.sessionId)
    .single();
  if (!session) return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 });
  if (!['active', 'compensation_active'].includes(session.status)) {
    return NextResponse.json({ error: 'SESSION_NOT_ACTIVE' }, { status: 409 });
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'SESSION_EXPIRED' }, { status: 410 });
  }

  if (userId) {
    // Must run as the signed-in user: the RPC reads auth.uid().
    const userDb = await createClient();
    const { data: owned, error: ownerError } = await userDb.rpc(
      'download_session_owned_by_current_user',
      { p_session_id: params.sessionId }
    );
    if (ownerError || !owned) {
      return NextResponse.json({ error: 'SESSION_OWNERSHIP_REQUIRED' }, { status: 403 });
    }
  }

  // Only files that belong to this session's version may be recorded.
  const { data: allowedFiles } = await admin
    .from('product_version_files')
    .select('file_version_id, included_in_zip')
    .eq('product_version_id', session.product_version_id);
  const allowed = new Set(
    (allowedFiles ?? [])
      .filter(f => payload.typ === 'zip' ? f.included_in_zip : true)
      .map(f => f.file_version_id)
  );

  const submitted = parsed.data.files.map(f => f.file_version_id);
  if (new Set(submitted).size !== submitted.length) {
    return NextResponse.json({ error: 'DUPLICATE_FILE' }, { status: 400 });
  }
  if (payload.typ === 'single') {
    if (submitted.length !== 1 || submitted[0] !== payload.fid) {
      return NextResponse.json({ error: 'FILE_MISMATCH' }, { status: 400 });
    }
  }
  if (!submitted.every(id => allowed.has(id))) {
    return NextResponse.json({ error: 'FILE_NOT_IN_SESSION' }, { status: 400 });
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
    const code = typeof e?.message === 'string' && /^[A-Z_]+$/.test(e.message)
      ? e.message
      : 'COMPLETION_FAILED';
    const status = code === 'SESSION_NOT_FOUND' ? 404
      : code === 'ATTEMPTS_EXHAUSTED' ? 409
      : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
