import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithFiles } from '@/lib/server/services/download-service';

export async function GET(_req: NextRequest, props: { params: Promise<{ sessionId: string }> }) {
  const params = await props.params;
  try {
    const data = await getSessionWithFiles(params.sessionId);
    return NextResponse.json(data);
  } catch (e: any) {
    const status = e.message === 'FORBIDDEN' ? 403
      : e.message === 'UNAUTHENTICATED' ? 401
        : e.message === 'SESSION_EXPIRED' ? 410
          : 400;
    return NextResponse.json({ error: publicError(e) }, { status });
  }
}