import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { processPendingPreviews } from '@/lib/server/services/preview-service';
import { isAuthorizedCron } from '@/lib/auth/cron';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req.headers)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const limit = Math.min(
    parseInt(new URL(req.url).searchParams.get('limit') ?? '2', 10),
    5
  );

  try {
    const result = await processPendingPreviews(limit);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 500 });
  }
}
