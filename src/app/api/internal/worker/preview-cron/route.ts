import { NextRequest, NextResponse } from 'next/server';
import { processPendingPreviews } from '@/lib/server/services/preview-service';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (req.headers.get('x-vercel-cron') !== '1') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const result = await processPendingPreviews(2);
  return NextResponse.json(result);
}
