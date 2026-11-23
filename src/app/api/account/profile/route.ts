import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';

const body = z.object({
  full_name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional(),
  avatar_url: z.string().url().max(500).optional(),
}).strict();

export async function PATCH(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

  const { data: before } = await db
    .from('profiles')
    .select('full_name, phone, avatar_url')
    .eq('id', user.id)
    .single();

  const { error } = await db
    .from('profiles')
    .update(parsed.data)
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAudit({
    action: 'profile.updated',
    entityType: 'profiles',
    entityId: user.id,
    before,
    after: parsed.data,
  });

  return NextResponse.json({ ok: true });
}
