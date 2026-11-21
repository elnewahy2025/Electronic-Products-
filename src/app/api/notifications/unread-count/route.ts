import { NextResponse } from 'next/server';
import { getMyUnreadCount } from '@/lib/server/services/notification-service';

export async function GET() {
  const count = await getMyUnreadCount();
  return NextResponse.json({ count });
}
