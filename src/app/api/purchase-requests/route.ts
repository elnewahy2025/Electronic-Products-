import { publicError } from '@/lib/api/errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createPurchaseRequest } from '@/lib/server/services/purchase-request-service';
import { getTrustedClientIp } from '@/lib/security/rate-limit';

const bodySchema = z.object({
  product_id: z.string().uuid(),
  email: z.string().email().max(200),
  phone: z.string().min(5).max(30),
  full_name: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});

const MESSAGES: Record<string, string> = {
  product_not_found: 'المنتج غير موجود.',
  product_not_available: 'المنتج غير متاح للطلب حاليًا.',
  no_published_version: 'المنتج غير جاهز للطلب حاليًا.',
  email_required: 'البريد الإلكتروني مطلوب.',
  phone_required: 'رقم الهاتف مطلوب.',
  rate_limit_email: 'تجاوزت الحد المسموح من الطلبات بهذا البريد. حاول بعد ساعة.',
  rate_limit_ip: 'تجاوزت الحد المسموح من الطلبات. حاول بعد قليل.',
  duplicate_request: 'لقد أرسلت طلبًا مشابهًا مؤخرًا. تفقّد بريدك.',
  no_exchange_rate: 'تعذر حساب السعر. تواصل مع الإدارة.',
};

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'بيانات غير صالحة.', details: parsed.error.flatten() }, { status: 400 });
  }

  const ip = getTrustedClientIp(req) ?? undefined;
  const userAgent = req.headers.get('user-agent') ?? undefined;

  try {
    const result = await createPurchaseRequest({
      productId: parsed.data.product_id,
      email: parsed.data.email,
      phone: parsed.data.phone,
      fullName: parsed.data.full_name,
      notes: parsed.data.notes,
      ip,
      userAgent,
    });

    return NextResponse.json({
      ok: true,
      request_id: result.requestId,
      short_ref: result.shortRef,
      amount: result.amount,
      currency: result.currency,
      amount_usd: result.amountUsd,
      tracking_token: result.token,
      tracking_url: `/purchase/track/${result.token}`,
    });
  } catch (e: any) {
    const message = MESSAGES[e.message] ?? 'تعذر إنشاء الطلب.';
    const status = e.message === 'duplicate_request' ? 409
      : e.message?.startsWith('rate_limit') ? 429
        : 400;
    return NextResponse.json(
      { error: message, code: publicError(e, 'REQUEST_FAILED', 'api/purchase-requests') },
      { status },
    );
  }
}