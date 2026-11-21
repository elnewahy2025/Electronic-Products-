import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export type CreatePurchaseRequestInput = {
  productId: string;
  email: string;
  phone: string;
  fullName?: string;
  notes?: string;
  ip?: string;
  userAgent?: string;
};

export type CreatePurchaseRequestResult = {
  requestId: string;
  shortRef: string;
  amount: number;
  currency: string;
  amountUsd: number;
  token: string; // always returned; guest uses it, logged-in user can ignore
};

export async function createPurchaseRequest(
  input: CreatePurchaseRequestInput
): Promise<CreatePurchaseRequestResult> {
  const db = await createClient();

  // Validate email format lightly (server-side)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    throw new Error('email_required');
  }
  if (!input.phone || input.phone.trim().length < 5) {
    throw new Error('phone_required');
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);

  const { data, error } = await db.rpc('create_purchase_request', {
    p_product_id: input.productId,
    p_email: input.email.trim().toLowerCase(),
    p_phone: input.phone.trim(),
    p_full_name: input.fullName?.trim() || null,
    p_notes: input.notes?.trim() || null,
    p_access_token_hash: tokenHash,
    p_ip: input.ip ?? null,
    p_user_agent: input.userAgent ?? null,
  });

  if (error) throw new Error(error.message);

  const row = data as {
    request_id: string;
    short_ref: string;
    amount: number;
    currency: string;
    amount_in_usd: number;
  };

  return {
    requestId: row.request_id,
    shortRef: row.short_ref,
    amount: Number(row.amount),
    currency: row.currency,
    amountUsd: Number(row.amount_in_usd),
    token: rawToken,
  };
}

export type TrackedRequest = {
  request_id: string;
  short_ref: string;
  status: string;
  total_amount: number;
  currency: string;
  created_at: string;
  product_title: string;
  product_slug: string;
  has_codes: boolean;
};

export async function trackPurchaseByToken(rawToken: string): Promise<TrackedRequest | null> {
  if (!rawToken || rawToken.length < 20) return null;
  const db = await createClient();
  const hash = hashToken(rawToken);
  const { data } = await db.rpc('track_purchase_by_token', { p_token_hash: hash });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    ...row,
    total_amount: Number(row.total_amount),
  } as TrackedRequest;
}
