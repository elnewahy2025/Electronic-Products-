import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePerm } from '@/lib/auth/admin-guard';

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requirePerm('code.issue');
    const db = await createClient();
    const { data, error } = await db.rpc('approve_purchase_request', {
      p_request_id: params.id,
      p_pepper: process.env.CODE_HASH_PEPPER,
    });
    if (error) return NextResponse.json({ error: publicError(error) }, { status: 400 });

    return NextResponse.json({ ok: true, codes: data });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}