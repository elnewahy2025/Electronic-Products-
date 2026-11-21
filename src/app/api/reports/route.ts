import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createReport } from '@/lib/server/services/report-service';

const body = z.object({
  entity_type: z.enum(['product', 'review', 'seller']),
  entity_id: z.string().uuid(),
  reason: z.string().min(5).max(2000),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const result = await createReport({
      entityType: parsed.data.entity_type,
      entityId: parsed.data.entity_id,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ ok: true, report_id: result.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}