import { NextResponse } from 'next/server';
import { markAllMyNotificationsRead } from '@/lib/server/services/notification-service';

export async function POST() {
  const count = await markAllMyNotificationsRead();
  return NextResponse.json({ ok: true, count });
}
