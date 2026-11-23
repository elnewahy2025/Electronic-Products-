import { NextRequest, NextResponse } from 'next/server';
import { markNotificationRead } from '@/lib/server/services/notification-service';

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const ok = await markNotificationRead(params.id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
