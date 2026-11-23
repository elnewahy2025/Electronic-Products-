import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePerm('payout.approve');
    const db = await createClient();
    const { error } = await db.rpc('approve_payout', { p_payout_id: params.id });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}