import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const status = req.nextUrl.searchParams.get('status');
  let query = db
    .from('support_tickets')
    .select('id, owner_id, subject, status, created_at, updated_at, profiles!support_tickets_owner_id_fkey(email, full_name)')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (status && ['open', 'pending', 'closed'].includes(status)) {
    query = query.eq('status', status as any);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: publicError(error) }, { status: 400 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const subject = String(body?.subject ?? '').trim();
  const message = String(body?.message ?? '').trim();
  const reviewId = body?.review_id ? String(body.review_id) : null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (reviewId && !isUuid.test(reviewId)) {
    return NextResponse.json({ error: 'invalid_review_id' }, { status: 400 });
  }

  if (subject.length < 4 || subject.length > 200) {
    return NextResponse.json({ error: 'عنوان التذكرة يجب أن يكون بين 4 و200 حرف.' }, { status: 400 });
  }
  if (message.length < 10 || message.length > 5000) {
    return NextResponse.json({ error: 'تفاصيل الرسالة يجب أن تكون بين 10 و5000 حرف.' }, { status: 400 });
  }

  const adminDb = createAdminClient();
  let linked: { product_id: string | null; order_item_id: string | null; review_id: string | null } = {
    product_id: null,
    order_item_id: null,
    review_id: null,
  };

  if (reviewId) {
    const { data: review } = await adminDb
      .from('reviews')
      .select('id, product_id, order_item_id, products!inner(seller_id)')
      .eq('id', reviewId)
      .maybeSingle();

    if (!review || (review as any).products?.seller_id !== user.id) {
      return NextResponse.json({ error: 'review_not_found' }, { status: 404 });
    }

    linked = {
      review_id: review.id,
      product_id: review.product_id,
      order_item_id: review.order_item_id,
    };
  }

  const { data: ticket, error: ticketErr } = await db
    .from('support_tickets')
    .insert({ owner_id: user.id, subject, status: 'open', ...linked })
    .select('id, subject, status, created_at')
    .single();

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: publicError(ticketErr, 'failed_to_create_ticket') }, { status: 400 });
  }

  const { error: msgErr } = await db
    .from('support_messages')
    .insert({
      ticket_id: ticket.id,
      sender_id: user.id,
      body: message,
      is_internal: false,
    });

  if (msgErr) {
    return NextResponse.json({ error: publicError(msgErr) }, { status: 400 });
  }

  // Notify staff with support.read permission (best-effort)
  await adminDb.rpc('notify_staff_with_permission', {
    p_permission: 'support.read',
    p_type: 'support_ticket_opened',
    p_category: 'support',
    p_title: 'تذكرة دعم فني جديدة',
    p_body: subject,
    p_link: `/admin/support/${ticket.id}`,
    p_data: { ticket_id: ticket.id },
  });

  return NextResponse.json({ ok: true, ticket }, { status: 201 });
}
