import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePerm } from '@/lib/auth/admin-guard';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePerm('code.read.any');
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('consume_plaintext_handoff', { p_code_id: params.id });
    if (error) return NextResponse.json({ error: publicError(error) }, { status: 404 });
    return NextResponse.json({ plaintext: data });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}