import { NextRequest, NextResponse } from 'next/server';
import { processEmailOutbox } from '@/lib/server/services/email-service';

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.WORKER_SECRET;
  const auth = req.headers.get('authorization');
  return Boolean(secret && auth === `Bearer ${secret}`);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await processEmailOutbox(15);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
