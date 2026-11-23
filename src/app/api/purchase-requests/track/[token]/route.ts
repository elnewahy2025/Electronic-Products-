import { NextRequest, NextResponse } from 'next/server';
import { trackPurchaseByToken } from '@/lib/server/services/purchase-request-service';

export async function GET(_req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const result = await trackPurchaseByToken(params.token);
  if (!result) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  return NextResponse.json(result);
}