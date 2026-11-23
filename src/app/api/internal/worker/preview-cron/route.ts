import { NextRequest, NextResponse } from 'next/server';
import { processPendingPreviews } from '@/lib/server/services/preview-service';
import { isAuthorizedCron } from '@/lib/auth/cron';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const result = await processPendingPreviews(2);
  return NextResponse.json(result);
}
