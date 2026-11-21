import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyDownloadToken } from '@/lib/crypto/download-token';
import { resolveDriveUrl } from '@/lib/server/services/drive-service';
import { createAdminClient } from '@/lib/supabase/admin';

const bodySchema = z.object({ token: z.string() });

export async function POST(req: NextRequest) {
  if (req.headers.get('x-internal-secret') !== process.env.DOWNLOAD_SERVICE_TOKEN) {
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

  // Resolve Drive URLs one by one (short-lived)
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
        };
      })
    );

    return NextResponse.json({
      type: payload.typ,
      files: resolved,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}