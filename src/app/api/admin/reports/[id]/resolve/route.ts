import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePerm } from '@/lib/auth/admin-guard';
import { resolveReport } from '@/lib/server/services/report-service';

const body = z.object({
  resolution: z.enum(['resolved', 'dismissed']),
  note: z.string().min(3),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePerm('report.resolve');
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    await resolveReport({
      reportId: params.id,
      resolution: parsed.data.resolution,
      note: parsed.data.note,
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
}