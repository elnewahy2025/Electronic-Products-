import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import { getTrustedClientIp } from '@/lib/security/rate-limit';
import { logServerError, publicError } from '@/lib/api/errors';

const applySchema = z.object({
  display_name: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(500).optional().or(z.literal('')),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user.accountType === 'staff') {
      return NextResponse.json({ error: 'STAFF_CANNOT_APPLY_AS_SELLER' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
    }

    const db = await createClient();
    const { data: existing, error: existingErr } = await db
      .from('seller_profiles')
      .select('status')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (existingErr) {
      logServerError('api/seller/apply:check', existingErr, { status: 500 });
      return NextResponse.json({ error: 'SELLER_CHECK_FAILED' }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json({
        ok: true,
        status: existing.status,
        redirect: existing.status === 'approved' ? '/seller' : '/seller/pending',
      });
    }

    const displayName = parsed.data.display_name;
    const bio = parsed.data.bio ? parsed.data.bio : null;

    const { error: insertErr } = await db.from('seller_profiles').insert({
      profile_id: user.id,
      display_name: displayName,
      bio,
      status: 'pending',
    });

    if (insertErr) {
      logServerError('api/seller/apply:insert', insertErr, { status: 400 });
      return NextResponse.json({ error: publicError(insertErr) }, { status: 400 });
    }

    await logAudit({
      action: 'seller.applied',
      entityType: 'seller_profiles',
      entityId: user.id,
      after: { display_name: displayName, status: 'pending' },
      ip: getTrustedClientIp(req) ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
      actorId: user.id,
    });

    return NextResponse.json(
      { ok: true, status: 'pending', redirect: '/seller/pending' },
      { status: 201 },
    );
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message ?? '';
    if (msg === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    logServerError('api/seller/apply', e, { status: 400 });
    return NextResponse.json({ error: publicError(e) }, { status: 400 });
  }
}
