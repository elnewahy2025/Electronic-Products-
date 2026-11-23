import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/admin-guard';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await requireAdmin();
    if (!UUID_RE.test(params.id)) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }

    const db = await createClient();
    const { error } = await db
      .from('seller_commissions')
      .update({ effective_to: new Date().toISOString() })
      .eq('id', params.id);

    if (error) return NextResponse.json({ error: publicError(error) }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}
