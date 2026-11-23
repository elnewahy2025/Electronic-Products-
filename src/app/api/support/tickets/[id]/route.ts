import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/auth/permissions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const [{ data: ticket, error: tErr }, { data: messages, error: mErr }] = await Promise.all([
    db.from('support_tickets')
      .select('id, owner_id, subject, status, created_at, updated_at, profiles!support_tickets_owner_id_fkey(email, full_name)')
      .eq('id', params.id)
      .maybeSingle(),
    db.from('support_messages')
      .select('id, sender_id, body, is_internal, created_at, profiles!support_messages_sender_id_fkey(email, full_name, account_type)')
      .eq('ticket_id', params.id)
      .order('created_at', { ascending: true }),
  ]);

  if (tErr) return NextResponse.json({ error: publicError(tErr) }, { status: 400 });
  if (!ticket) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (mErr) return NextResponse.json({ error: publicError(mErr) }, { status: 400 });

  return NextResponse.json({ ticket, messages: messages ?? [] });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text = String(body?.body ?? '').trim();
  const isInternal = Boolean(body?.is_internal);

  if (isInternal && !(await can('support.read'))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  if (text.length < 2 || text.length > 5000) {
    return NextResponse.json({ error: 'الرسالة يجب أن تكون بين حرفين و5000 حرف.' }, { status: 400 });
  }

  const { data: msg, error } = await db
    .from('support_messages')
    .insert({
      ticket_id: params.id,
      sender_id: user.id,
      body: text,
      is_internal: isInternal,
    })
    .select('id, body, is_internal, created_at')
    .single();

  if (error) return NextResponse.json({ error: publicError(error) }, { status: 400 });
  return NextResponse.json({ ok: true, message: msg }, { status: 201 });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const status = String(body?.status ?? '');
  if (!['open', 'pending', 'closed'].includes(status)) {
    return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
  }

  const { error } = await db
    .from('support_tickets')
    .update({ status: status as any })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: publicError(error) }, { status: 403 });
  return NextResponse.json({ ok: true, status });
}
