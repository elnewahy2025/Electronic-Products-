import { NextRequest, NextResponse } from 'next/server';
import { processPendingScans } from '@/lib/server/services/scan-service';
import { isAuthorizedCron } from '@/lib/auth/cron';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const result = await processPendingScans(3);
  return NextResponse.json(result);
}
