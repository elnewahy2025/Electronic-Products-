import { NextRequest, NextResponse } from 'next/server';
import { processPendingScans } from '@/lib/server/services/scan-service';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel adds this header only for cron jobs
  if (req.headers.get('x-vercel-cron') !== '1') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const result = await processPendingScans(3);
  return NextResponse.json(result);
}
