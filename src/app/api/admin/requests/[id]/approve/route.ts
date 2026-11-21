import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePerm('code.issue');
    const db = await createClient();
    const { data, error } = await db.rpc('approve_purchase_request', { p_request_id: params.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, codes: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
}