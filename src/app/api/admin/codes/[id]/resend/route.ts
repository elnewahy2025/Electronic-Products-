import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePerm } from '@/lib/auth/admin-guard';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePerm('code.confirm_delivery');
    const admin = createAdminClient();

    const { data: code } = await admin
      .from('purchase_codes')
      .select('id, status, redeemed_at')
      .eq('id', params.id)
      .single();

    if (!code) return NextResponse.json({ error: 'CODE_NOT_FOUND' }, { status: 404 });
    if (code.redeemed_at) return NextResponse.json({ error: 'CODE_ALREADY_REDEEMED' }, { status: 409 });

    // Log the resend attempt. Actual email/SMS sending is out of scope for this batch.
    await admin.from('code_delivery_attempts').insert({
      code_id: params.id,
      channel: 'manual',
      result: 'sent',
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
}