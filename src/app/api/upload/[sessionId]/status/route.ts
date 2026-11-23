import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUploadStatus } from '@/lib/server/services/upload-service';

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  // The safe view performs the ownership check inside the view itself
  // (migration 041). getUploadStatus repeats it after switching to the
  // service-only client that can read the resumable upload URL.
  const { data: visibleSession } = await db
    .from('upload_sessions_safe')
    .select('id')
    .eq('id', params.sessionId)
    .eq('seller_id', user.id)
    .maybeSingle();
  if (!visibleSession) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  try {
    const result = await getUploadStatus({
      sellerId: user.id,
      sessionId: params.sessionId,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    const code = publicError(e);
    return NextResponse.json(
      { error: code },
      { status: code === 'UPLOAD_SESSION_EXPIRED' ? 410 : code === 'NOT_FOUND' ? 404 : 400 }
    );
  }
}