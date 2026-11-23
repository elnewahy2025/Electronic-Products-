import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { addFileToVersion } from '@/lib/server/services/seller-version-service';

const body = z.object({ file_version_id: z.string().uuid() });

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') throw new Error('FORBIDDEN');
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    await addFileToVersion(params.id, parsed.data.file_version_id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 400 });
  }
}