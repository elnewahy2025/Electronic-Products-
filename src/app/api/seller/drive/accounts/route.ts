import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';
import { listDriveAccounts } from '@/lib/server/services/drive-account-service';

export async function GET() {
  try {
    const user = await requireUser();
    if (user.accountType !== 'seller') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
    const accounts = await listDriveAccounts(user.id);
    return NextResponse.json({ accounts });
  } catch (e: any) {
    const status = e?.message === 'UNAUTHENTICATED' ? 401 : 403;
    return NextResponse.json({ error: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN' }, { status });
  }
}
