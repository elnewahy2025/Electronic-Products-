import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { removeFileFromVersion, updateVersionFile } from '@/lib/server/services/seller-version-service';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; pvfId: string } }) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') throw new Error('FORBIDDEN');
    await removeFileFromVersion(params.id, params.pvfId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 400 });
  }
}

const patchBody = z.object({
  display_name: z.string().max(200).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  included_in_zip: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string; pvfId: string } }) {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') throw new Error('FORBIDDEN');
    const parsed = patchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    await updateVersionFile(params.pvfId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 400 });
  }
}