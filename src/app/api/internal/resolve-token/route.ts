import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hashDownloadToken, verifyDownloadToken } from '@/lib/crypto/download-token';
import { resolveDriveUrl } from '@/lib/server/services/drive-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { constantTimeEqual } from '@/lib/crypto/constant-time';

const bodySchema = z.object({ token: z.string() });

export async function POST(req: NextRequest) {
  if (!constantTimeEqual(req.headers.get('x-internal-secret'), process.env.DOWNLOAD_SERVICE_TOKEN)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

  const payload = verifyDownloadToken(parsed.data.token);
  if (!payload) return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 401 });

  const admin = createAdminClient();

  // Fetch file list for this session/product_version
  const { data: session } = await admin
    .from('download_sessions')
    .select('product_version_id, expires_at, status')
    .eq('id', payload.sid)
    .single();

  if (!session) return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 });
  // A token minted earlier must stop working once the session is completed,
  // exhausted or revoked — otherwise it can be replayed for fresh Drive URLs.
  if (!['active', 'compensation_active'].includes(session.status)) {
    return NextResponse.json({ error: 'SESSION_NOT_ACTIVE' }, { status: 409 });
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'SESSION_EXPIRED' }, { status: 410 });
  }

  const { data: files } = await admin
    .from('product_version_files')
    .select('file_version_id, included_in_zip')
    .eq('product_version_id', session.product_version_id);

  if (!files) return NextResponse.json({ error: 'NO_FILES' }, { status: 404 });

  // Resolve which file(s) the download service should fetch
  let targets = files.map(f => f.file_version_id);

  if (payload.typ === 'zip') {
    // ZIP must include only included_in_zip=true
    targets = files.filter(f => f.included_in_zip).map(f => f.file_version_id);
  } else {
    if (!payload.fid) return NextResponse.json({ error: 'FILE_REQUIRED' }, { status: 400 });
    if (!targets.includes(payload.fid)) {
      return NextResponse.json({ error: 'FILE_NOT_IN_SESSION' }, { status: 404 });
    }
    targets = [payload.fid];
  }

  // Single-use ledger: verify the token was issued for this exact scope, then
  // atomically claim it before minting any Drive URLs. Replay never reaches Drive.
  const tokenHash = hashDownloadToken(parsed.data.token);
  const { data: ledger } = await admin
    .from('download_tokens')
    .select('session_id, scope, file_version_id')
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

  const { error: claimError } = await admin.rpc('claim_download_token', {
    p_token_hash: tokenHash,
  });
  if (claimError) {
    const code = /already_used/.test(claimError.message) ? 'TOKEN_ALREADY_USED' : 'INVALID_TOKEN';
    return NextResponse.json({ error: code }, { status: code === 'TOKEN_ALREADY_USED' ? 409 : 401 });
  }

  // Resolve Drive URLs one by one (short-lived). The bearer token is scoped to
  // the seller account that owns each file and is never returned to the buyer.
  try {
    const resolved = await Promise.all(
      targets.map(async (fid) => {
        const r = await resolveDriveUrl(fid);
        return {
          file_version_id: fid,
          drive_url: r.driveUrl,
          filename: r.filename,
          mime: r.mime,
          size_bytes: r.sizeBytes,
          sha256: r.expectedSha256,
          access_token: r.accessToken,
        };
      })
    );

    return NextResponse.json({
      type: payload.typ,
      session_id: payload.sid,
      files: resolved,
    });
  } catch {
    return NextResponse.json({ error: 'DRIVE_URL_RESOLUTION_FAILED' }, { status: 500 });
  }
}