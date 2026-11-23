import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { processPendingScans } from '@/lib/server/services/scan-service';
import { isAuthorizedCron } from '@/lib/auth/cron';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req.headers)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const limit = Math.min(
    parseInt(new URL(req.url).searchParams.get('limit') ?? '3', 10),
    10
  );

  try {
    const result = await processPendingScans(limit);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 500 });
  }
}
