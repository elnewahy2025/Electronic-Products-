import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { processEmailOutbox } from '@/lib/server/services/email-service';
import { isAuthorizedCron } from '@/lib/auth/cron';

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req.headers)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await processEmailOutbox(15);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 500 });
  }
}
