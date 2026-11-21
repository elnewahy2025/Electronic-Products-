import { NextRequest, NextResponse } from 'next/server';
import { getSessionWithFiles } from '@/lib/server/services/download-service';

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const data = await getSessionWithFiles(params.sessionId);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}