import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/admin-guard';

const body = z.object({ permission_code: z.string().min(1).max(80) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSuperAdmin();
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

    const db = await createClient();
    const { error } = await db.rpc('grant_member_permission', {
      p_profile_id: params.id,
      p_permission_code: parsed.data.permission_code,
      p_expires_at: null,
    });
    if (error) {
      if (error.message.includes('permission_not_found')) {
        return NextResponse.json({ error: 'permission_not_found' }, { status: 404 });
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: publicError(e) }, { status: 403 });
  }
}