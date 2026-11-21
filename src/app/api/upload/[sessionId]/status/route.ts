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

  try {
    const result = await getUploadStatus({
      sellerId: user.id,
      sessionId: params.sessionId,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}