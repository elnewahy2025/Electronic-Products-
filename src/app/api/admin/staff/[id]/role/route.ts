import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';

const body = z.object({
  role_code: z.enum(['super_admin', 'admin', 'staff']),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSuperAdmin();
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const db = await createClient();
    const { error } = await db.rpc('change_staff_role', {
      p_profile_id: params.id,
      p_new_role_code: parsed.data.role_code,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
}