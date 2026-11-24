import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logServerError } from '@/lib/api/errors';
import { hashDownloadToken, verifyDownloadToken } from '@/lib/crypto/download-token';
import { constantTimeEqual } from '@/lib/crypto/constant-time';
import { recordCompletion } from '@/lib/server/services/download-service';
import { createAdminClient } from '@/lib/supabase/admin';

const SHA256_HEX = /^[a-f0-9]{64}$/i;

const bodySchema = z.object({
  token: z.string(),
  files: z.array(z.object({
    file_version_id: z.string().uuid(),
    bytes_sent: z.number().int().nonnegative(),
    checksum: z.string().regex(SHA256_HEX),
  })).min(1),
});

/**
 * Internal-only completion callback. The first-party streaming worker calls
 * this after it has read every byte from Drive and computed SHA-256 locally.
 * M-09: All session, file-set, byte-count, and SHA-256 checks run BEFORE the
 * single-use ledger token is marked completed, so transient/validation rejections
 * never permanently burn a legitimate token before delivery is recorded.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ sessionId: string }> }) {
  const params = await props.params;
  if (!constantTimeEqual(
    req.headers.get('x-internal-secret'),
    process.env.DOWNLOAD_SERVICE_TOKEN
  )) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
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

  const admin = createAdminClient();

  const tokenHash = hashDownloadToken(parsed.data.token);
  const { data: ledger } = await admin
    .from('download_tokens')
    .select('session_id, scope, file_version_id, expires_at, used_at, completed_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (
    !ledger ||
    ledger.session_id !== payload.sid ||
    ledger.scope !== payload.typ ||
    (payload.typ === 'single' && ledger.file_version_id !== payload.fid)
  ) {
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 401 });
  }
  if (!ledger.used_at) {
    return NextResponse.json({ error: 'TOKEN_NOT_RESOLVED' }, { status: 403 });
  }
  if (ledger.completed_at) {
    return NextResponse.json({ error: 'TOKEN_ALREADY_USED' }, { status: 409 });
  }
  if (new Date(ledger.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'TOKEN_EXPIRED' }, { status: 401 });
  }

  // Validate session state + expected file set/sizes/checksums BEFORE consuming the token
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

  const { data: fileRows } = await admin
    .from('product_version_files')
    .select('file_version_id, included_in_zip, file_versions!inner(size_bytes, checksum_sha256)')
    .eq('product_version_id', session.product_version_id);

  const expected = new Map<string, { sizeBytes: number; sha256: string | null; inZip: boolean }>(
    ((fileRows ?? []) as any[]).map(row => {
      const stored = typeof row.file_versions?.checksum_sha256 === 'string'
        ? row.file_versions.checksum_sha256.toLowerCase()
        : null;
      return [row.file_version_id, {
        sizeBytes: Number(row.file_versions?.size_bytes ?? 0),
        sha256: stored && SHA256_HEX.test(stored) ? stored : null,
        inZip: Boolean(row.included_in_zip),
      }];
    })
  );

  const submitted = parsed.data.files.map(f => f.file_version_id);
  if (new Set(submitted).size !== submitted.length) {
    return NextResponse.json({ error: 'DUPLICATE_FILE' }, { status: 400 });
  }

  if (payload.typ === 'single') {
    if (submitted.length !== 1 || submitted[0] !== payload.fid) {
      return NextResponse.json({ error: 'FILE_MISMATCH' }, { status: 400 });
    }
  } else {
    const zipIds = [...expected.entries()]
      .filter(([, meta]) => meta.inZip)
      .map(([id]) => id)
      .sort();
    if (submitted.length !== zipIds.length || [...submitted].sort().join(',') !== zipIds.join(',')) {
      return NextResponse.json({ error: 'FILE_SET_MISMATCH' }, { status: 400 });
    }
  }

  for (const file of parsed.data.files) {
    const meta = expected.get(file.file_version_id);
    if (!meta) return NextResponse.json({ error: 'FILE_NOT_IN_SESSION' }, { status: 400 });
    if (file.bytes_sent !== meta.sizeBytes) {
      return NextResponse.json({ error: 'BYTE_COUNT_MISMATCH' }, { status: 400 });
    }
    if (meta.sha256 && file.checksum.toLowerCase() !== meta.sha256) {
      return NextResponse.json({ error: 'CHECKSUM_MISMATCH' }, { status: 400 });
    }
  }

  // Atomically claim the single-use completion token ONLY after validation succeeds
  const { error: completeClaimError } = await admin.rpc(
    'mark_download_token_completed',
    { p_token_hash: tokenHash }
  );
  if (completeClaimError) {
    const code = /already_completed/.test(completeClaimError.message)
      ? 'TOKEN_ALREADY_USED'
      : 'TOKEN_NOT_RESOLVED';
    return NextResponse.json(
      { error: code },
      { status: code === 'TOKEN_ALREADY_USED' ? 409 : 403 }
    );
  }

  try {
    const result = await recordCompletion({
      sessionId: params.sessionId,
      type: payload.typ === 'zip' ? 'zip' : 'single_files',
      files: parsed.data.files.map(f => ({
        fileVersionId: f.file_version_id,
        bytesSent: f.bytes_sent,
        checksum: f.checksum.toLowerCase(),
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
    if (code === 'COMPLETION_FAILED') {
      logServerError('api/download/[sessionId]/complete', e, { status });
    }
    return NextResponse.json({ error: code }, { status });
  }
}
