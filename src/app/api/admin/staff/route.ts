import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';

const body = z.object({
  email: z.string().email(),
  role_code: z.enum(['staff', 'admin', 'super_admin']),
});

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin();
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const db = await createClient();
    const { error } = await db.rpc('invite_staff', {
      p_email: parsed.data.email,
      p_role_code: parsed.data.role_code,
    });
    if (error) return NextResponse.json({ error: publicError(error) }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}