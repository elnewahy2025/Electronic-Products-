import { NextRequest, NextResponse } from 'next/server';
import { markNotificationRead } from '@/lib/server/services/notification-service';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = await markNotificationRead(params.id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
