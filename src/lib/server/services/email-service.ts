import 'server-only';
import nodemailer from 'nodemailer';
import { createAdminClient } from '@/lib/supabase/admin';
import { rpcNullable } from '@/lib/types/rpc-nullable';

type SendInput = {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
};

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapRtlHtml(subject: string, textBody: string, platformName: string): string {
  const safeSubject = escapeHtml(subject);
  const safePlatform = escapeHtml(platformName);
  const escaped = escapeHtml(textBody).replace(/\n/g, '<br/>');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Tahoma,Arial,sans-serif;color:#18181b;direction:rtl;text-align:right;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
    <div style="background:#0f766e;color:#ffffff;padding:18px 24px;font-weight:bold;font-size:16px;">
      ${safePlatform}
    </div>
    <div style="padding:24px;line-height:1.75;font-size:14px;">
      <h2 style="margin:0 0 12px 0;font-size:18px;color:#18181b;">${safeSubject}</h2>
      <p style="margin:0;color:#334155;">${escaped}</p>
    </div>
    <div style="padding:14px 24px;background:#f1f5f9;color:#64748b;font-size:12px;">
      هذه رسالة آلية من ${safePlatform}. يُرجى عدم الرد مباشرة على هذا البريد.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends an email via real configured transport:
 * 1) Resend HTTP API (if RESEND_API_KEY is set)
 * 2) Standard SMTP via nodemailer (if SMTP_HOST is set — works with Mailpit, SES, Postmark, Gmail, etc.)
 */
export async function sendEmailDirect(input: SendInput): Promise<{ messageId: string }> {
  const from = process.env.SMTP_FROM || 'no-reply@electronic-products.local';
  const platformName = process.env.NEXT_PUBLIC_APP_NAME || 'المنصة';
  const html = input.html || wrapRtlHtml(input.subject, input.text, platformName);

  // Transport 1: Resend API
  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`resend_error_${res.status}: ${json.message ?? JSON.stringify(json)}`);
    }
    return { messageId: json.id ?? 'resend-sent' };
  }

  // Transport 2: Standard SMTP via nodemailer
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const auth =
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth,
    });

    const info = await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html,
    });

    return { messageId: info.messageId ?? 'smtp-sent' };
  }

  throw new Error('EMAIL_TRANSPORT_NOT_CONFIGURED');
}

/**
 * Claims queued rows from `email_outbox` and dispatches them via real transport.
 */
export async function processEmailOutbox(limit = 15): Promise<{
  claimed: number;
  sent: number;
  failed: number;
}> {
  const adminDb = createAdminClient();
  const { data: rows, error } = await adminDb.rpc('claim_email_outbox', { p_limit: limit });
  if (error) throw new Error(error.message);

  const jobs = (rows ?? []) as Array<{
    id: string;
    to_email: string;
    subject: string;
    text_body: string;
    html_body: string | null;
  }>;

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const result = await sendEmailDirect({
        to: job.to_email,
        subject: job.subject,
        text: job.text_body,
        html: job.html_body,
      });
      await adminDb.rpc('mark_email_sent', {
        p_id: job.id,
        p_provider_id: result.messageId,
      });
      sent++;
    } catch (err: any) {
      await adminDb.rpc('mark_email_failed', {
        p_id: job.id,
        p_error: err?.message ?? 'send_failed',
      });
      failed++;
    }
  }

  return { claimed: jobs.length, sent, failed };
}

/**
 * Builds and dispatches a live pending-items digest email to active admin/super_admin staff.
 */
export async function sendAdminDigest(): Promise<{
  recipients: number;
  pendingTotal: number;
  dispatched: { claimed: number; sent: number; failed: number };
}> {
  const adminDb = createAdminClient();

  const [pr, sellers, payouts, quarantine, comp, staffRes, settingsRes] = await Promise.all([
    adminDb.from('purchase_requests').select('*', { count: 'exact', head: true }).in('status', ['created', 'pending']),
    adminDb.from('seller_profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    adminDb.from('seller_payouts').select('*', { count: 'exact', head: true }).eq('status', 'requested'),
    adminDb.from('quarantine_records').select('*', { count: 'exact', head: true }).is('released_at', null),
    adminDb.from('compensation_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    adminDb
      .from('store_members')
      .select('profiles:profiles!store_members_profile_id_fkey(email), roles!inner(code)')
      .eq('status', 'active')
      .in('roles.code', ['super_admin', 'admin']),
    adminDb.from('general_settings').select('platform_name').eq('id', 1).maybeSingle(),
  ]);

  const counts = {
    purchaseRequests: pr.count ?? 0,
    sellers: sellers.count ?? 0,
    payouts: payouts.count ?? 0,
    quarantine: quarantine.count ?? 0,
    compensations: comp.count ?? 0,
  };

  const pendingTotal =
    counts.purchaseRequests +
    counts.sellers +
    counts.payouts +
    counts.quarantine +
    counts.compensations;

  if (pendingTotal === 0) {
    return { recipients: 0, pendingTotal: 0, dispatched: { claimed: 0, sent: 0, failed: 0 } };
  }

  const platformName = settingsRes.data?.platform_name ?? process.env.NEXT_PUBLIC_APP_NAME ?? 'المنصة';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3010';
  const emails = Array.from(
    new Set(
      ((staffRes.data ?? []) as any[])
        .map(row => row.profiles?.email)
        .filter((e): e is string => Boolean(e))
    )
  );

  const textBody = [
    `ملخص العناصر المعلّقة التي تحتاج إجراءً إداريًا في ${platformName}:`,
    `- طلبات شراء قيد المراجعة: ${counts.purchaseRequests}`,
    `- طلبات انضمام بائعين: ${counts.sellers}`,
    `- طلبات سحب مستحقات: ${counts.payouts}`,
    `- ملفات في العزل: ${counts.quarantine}`,
    `- طلبات تعويض معلّقة: ${counts.compensations}`,
    ``,
    `لوحة الإدارة: ${appUrl}/admin`,
  ].join('\n');

  for (const to of emails) {
    await adminDb.rpc('enqueue_email', {
      p_to_email: to,
      p_subject: `ملخص الإدارة اليومي (${pendingTotal} عنصر معلّق) — ${platformName}`,
      p_text_body: textBody,
      p_html_body: rpcNullable<string>(null),
      p_template: 'admin_digest',
      p_reference_type: rpcNullable<string>(null),
      p_reference_id: rpcNullable<string>(null),
    });
  }

  const dispatched = await processEmailOutbox(Math.max(emails.length, 10));
  return { recipients: emails.length, pendingTotal, dispatched };
}
