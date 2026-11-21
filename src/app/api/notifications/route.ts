import { NextRequest, NextResponse } from 'next/server';
import { listMyNotifications, type NotificationFilter } from '@/lib/server/services/notification-service';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filter = (searchParams.get('filter') ?? 'all') as NotificationFilter;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

  const items = await listMyNotifications(filter, limit);
  return NextResponse.json({ items });
}
