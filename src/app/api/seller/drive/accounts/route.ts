import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listDriveAccounts } from '@/lib/server/services/drive-account-service';

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const accounts = await listDriveAccounts(user.id);
  return NextResponse.json({ accounts });
}