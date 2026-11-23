import { publicError } from '@/lib/api/errors';
import { requirePerm } from '@/lib/auth/admin-guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const bodySchema = z.object({ reason: z.string().trim().min(3).max(1000) });

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: 'لا تملك صلاحية حذف التقييمات.',
  reason_required: 'السبب مطلوب (3 أحرف على الأقل).',
  review_not_found: 'التقييم غير موجود.',
  already_deleted: 'تم حذف هذا التقييم بالفعل.',
  ticket_not_found: 'التذكرة غير موجودة.',
  ticket_not_open: 'يجب أن تكون تذكرة البائع مفتوحة أو قيد المتابعة.',
  ticket_not_linked_to_review: 'التذكرة غير مرتبطة بهذا التقييم أو المنتج أو الطلب.',
  buyer_case_compensation_open: 'لا يمكن الحذف؛ يوجد طلب تعويض مفتوح للمشتري على هذا الطلب.',
  buyer_case_exception_open: 'لا يمكن الحذف؛ يوجد طلب استثناء مفتوح للمشتري على هذا الطلب.',
  buyer_case_ticket_open: 'لا يمكن الحذف؛ توجد تذكرة مفتوحة للمشتري على هذا المنتج أو الطلب.',
  review_delete_requires_ticket: 'يجب أن يكون الحذف مرتبطًا بتذكرة بائع.',
};

function respondError(code: string, status = 400) {
  return NextResponse.json(
    { error: code, message: ERROR_MESSAGES[code] ?? code },
    { status }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requirePerm('review.delete');

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return respondError('reason_required');

    const admin = createAdminClient();
    const { data: ticket } = await admin
      .from('support_tickets')
      .select('id, review_id')
      .eq('id', params.id)
      .maybeSingle();

    if (!ticket) return respondError('ticket_not_found', 404);
    if (!ticket.review_id) return respondError('ticket_not_linked_to_review');

    const db = await createClient();
    const { error } = await db.rpc('delete_review_from_ticket', {
      p_review_id: ticket.review_id,
      p_ticket_id: params.id,
      p_reason: parsed.data.reason,
    });

    if (error) {
      const code = publicError(error);
      return respondError(code, code === 'not_authorized' ? 403 : 400);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const code = publicError(e);
    return respondError(code, code === 'FORBIDDEN' || code === 'not_authorized' ? 403 : 400);
  }
}
