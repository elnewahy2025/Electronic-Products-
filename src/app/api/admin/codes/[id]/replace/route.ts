import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePerm } from '@/lib/auth/admin-guard';

const body = z.object({ reason: z.string().min(3) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePerm('code.issue');
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const db = await createClient();
    const { data: newId, error } = await db.rpc('issue_replacement_code', {
      p_original_code_id: params.id,
      p_reason: parsed.data.reason,
    });
    if (error) throw new Error(error.message);

    // Consume the one-time plaintext via service_role
    const admin = createAdminClient();
    const { data: plaintext, error: pe } = await admin.rpc('consume_plaintext_handoff', {
      p_code_id: newId,
    });
    if (pe) throw new Error(pe.message);

    return NextResponse.json({ ok: true, new_code_id: newId, plaintext });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
}