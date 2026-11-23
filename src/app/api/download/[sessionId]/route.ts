import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithFiles } from '@/lib/server/services/download-service';

export async function GET(_req: NextRequest, props: { params: Promise<{ sessionId: string }> }) {
  const params = await props.params;
  try {
    const data = await getSessionWithFiles(params.sessionId);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 400 });
  }
}