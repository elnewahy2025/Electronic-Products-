import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';

const body = z.object({ reason: z.string().min(3).max(500) });

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requireSuperAdmin();
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const db = await createClient();
    const { error } = await db.rpc('remove_staff_member', {
      p_profile_id: params.id,
    });
    if (error) {
      return NextResponse.json({ error: publicError(error) }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}