import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
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

    const user = await getCurrentUser();
    const { error: logError } = await admin.from('code_delivery_attempts').insert({
      code_id: params.id,
      channel: 'manual',
      result: 'skipped',
      sent_by: user?.id ?? null,
      error: 'resend_delivery_not_implemented',
    });
    if (logError) return NextResponse.json({ error: 'RESEND_LOG_FAILED' }, { status: 500 });

    return NextResponse.json(
      { error: 'RESEND_NOT_IMPLEMENTED' },
      { status: 501 },
    );
  } catch (e: any) {
    const status = e?.message === 'FORBIDDEN' || e?.message === 'UNAUTHENTICATED' ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR' }, { status });
  }
}
