import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import {
  revokeDriveAccount,
  setDefaultDriveAccount,
} from '@/lib/server/services/drive-account-service';

export async function PATCH(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
    await setDefaultDriveAccount(user.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e?.message === 'UNAUTHENTICATED' ? 401 : e?.message === 'INACTIVE_USER' ? 403 : 400;
    return NextResponse.json({ error: publicError(e) }, { status });
  }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
    await revokeDriveAccount(user.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e?.message === 'UNAUTHENTICATED' ? 401 : e?.message === 'INACTIVE_USER' ? 403 : 400;
    return NextResponse.json({ error: publicError(e) }, { status });
  }
}
