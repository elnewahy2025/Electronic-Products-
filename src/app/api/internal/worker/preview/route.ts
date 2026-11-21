import { NextRequest, NextResponse } from 'next/server';
import { processPendingPreviews } from '@/lib/server/services/preview-service';

export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return false;
  const provided = req.headers.get('authorization')?.replace(/^Bearer /, '');
  return provided === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const limit = Math.min(
    parseInt(new URL(req.url).searchParams.get('limit') ?? '2', 10),
    5
  );

  try {
    const result = await processPendingPreviews(limit);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
