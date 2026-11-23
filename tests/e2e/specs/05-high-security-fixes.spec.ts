import { test, expect } from '@playwright/test';
import { adminDb, anonDb, createTestUser, cleanupTestData } from '../helpers/db';

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;
const APP_URL = process.env.TEST_APP_URL ?? 'http://localhost:3000';

async function restAsJwt(
  path: string,
  jwt: string,
  opts: { method?: string; body?: unknown; prefer?: string } = {},
) {
  const headers: Record<string, string> = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${jwt}`,
    'content-type': 'application/json',
  };
  if (opts.prefer) headers.Prefer = opts.prefer;

  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function signInForJwt(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json?.access_token) {
    throw new Error(`signInForJwt failed for ${email}: ${JSON.stringify(json)}`);
  }
  return json.access_token as string;
}

test.describe('HIGH Security Fixes (H1–H4) — Reproducible Verification', () => {
  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('H1: purchase_requests RLS & trigger block buyer tampering and read-only staff updates', async () => {
    const buyer = await createTestUser({ accountType: 'buyer', mfaEnabled: false });
    const readOnlyStaff = await createTestUser({
      accountType: 'staff',
      roleCode: 'staff',
      mfaEnabled: false,
    });

    // Grant ONLY `request.read.any` (not `request.update`, not `super_admin`)
    const { data: readPerm } = await adminDb
      .from('permissions')
      .select('id')
      .eq('code', 'request.read.any')
      .single();
    expect(readPerm?.id).toBeTruthy();

    await adminDb.from('member_permissions').upsert({
      member_id: readOnlyStaff.id,
      permission_id: readPerm!.id,
      granted: true,
    });

    const { data: pr, error: prErr } = await adminDb
      .from('purchase_requests')
      .insert({
        buyer_id: buyer.id,
        customer_email: buyer.email,
        status: 'pending',
        total_amount: 120.0,
        currency: 'USD',
        exchange_rate_at_purchase: 1,
        amount_in_usd: 120.0,
      })
      .select('id')
      .single();
    expect(prErr).toBeNull();
    const prId = pr!.id;

    try {
      const buyerJwt = await signInForJwt(buyer.email, buyer.password);
      const staffJwt = await signInForJwt(readOnlyStaff.email, readOnlyStaff.password);

      // 1. Buyer cannot tamper with total_amount
      const tamperAmt = await restAsJwt(`/rest/v1/purchase_requests?id=eq.${prId}`, buyerJwt, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { total_amount: 0.01 },
      });
      expect(tamperAmt.status).toBeGreaterThanOrEqual(400);
      expect(String(tamperAmt.json?.message ?? '')).toContain('purchase_request_protected_field_change');

      // 2. Buyer cannot self-approve
      const selfApprove = await restAsJwt(`/rest/v1/purchase_requests?id=eq.${prId}`, buyerJwt, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { status: 'approved' },
      });
      expect(selfApprove.status).toBeGreaterThanOrEqual(400);
      expect(String(selfApprove.json?.message ?? '')).toContain('purchase_request_status_change_forbidden');

      // 3. Read-only staff (`request.read.any`) cannot update purchase_requests at all
      const staffPatch = await restAsJwt(`/rest/v1/purchase_requests?id=eq.${prId}`, staffJwt, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { status: 'rejected' },
      });
      expect(Array.isArray(staffPatch.json) ? staffPatch.json.length : 0).toBe(0);

      // 4. Buyer CAN legitimately cancel their own pending request
      const cancel = await restAsJwt(`/rest/v1/purchase_requests?id=eq.${prId}`, buyerJwt, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { status: 'cancelled', cancelled_by: buyer.id },
      });
      expect(cancel.status).toBe(200);
      expect(cancel.json?.[0]?.status).toBe('cancelled');

      // 5. Authenticated users cannot read `profiles.mfa_secret_encrypted`
      const mfaRead = await restAsJwt(
        `/rest/v1/profiles?id=eq.${buyer.id}&select=mfa_secret_encrypted`,
        buyerJwt,
      );
      expect(mfaRead.status).toBeGreaterThanOrEqual(400);
      expect(mfaRead.json?.code).toBe('42501');

      // 6. Authenticated users cannot read `seller_drive_accounts.encrypted_access_token`
      const driveTokRead = await restAsJwt(
        `/rest/v1/seller_drive_accounts?select=encrypted_access_token&limit=1`,
        buyerJwt,
      );
      expect(driveTokRead.status).toBeGreaterThanOrEqual(400);
      expect(driveTokRead.json?.code).toBe('42501');
    } finally {
      await adminDb.from('purchase_requests').delete().eq('id', prId);
    }
  });

  test('H2: auth routes enforce Origin guard, enumeration-safe recovery, and DB rate limit RPC', async () => {
    const origin = new URL(APP_URL).origin;

    // Cross-origin POSTs must be rejected with 403
    for (const [path, body] of [
      ['/api/auth/login', { email: 'e2e@example.com', password: 'wrong' }],
      ['/api/auth/forgot-password', { email: 'e2e@example.com' }],
      ['/api/auth/oauth', { provider: 'google' }],
    ] as const) {
      const res = await fetch(`${APP_URL}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(403);
    }

    // Same-origin forgot-password returns enumeration-safe 200
    const fp = await fetch(`${APP_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ email: `nonexistent-${Date.now()}@example.test` }),
    });
    expect(fp.status).toBe(200);
    expect(await fp.json()).toEqual({ ok: true });

    // Atomic `consume_rate_limit` blocks on N+1 and denies `anon`
    const scope = 'e2e:rate_limit_check';
    const key = `k_${Date.now()}`;
    try {
      const r1 = await adminDb.rpc('consume_rate_limit', {
        p_scope: scope,
        p_bucket_key: key,
        p_limit: 2,
        p_window_seconds: 60,
        p_ip: '203.0.113.5',
      });
      const r2 = await adminDb.rpc('consume_rate_limit', {
        p_scope: scope,
        p_bucket_key: key,
        p_limit: 2,
        p_window_seconds: 60,
        p_ip: '203.0.113.5',
      });
      const r3 = await adminDb.rpc('consume_rate_limit', {
        p_scope: scope,
        p_bucket_key: key,
        p_limit: 2,
        p_window_seconds: 60,
        p_ip: '203.0.113.5',
      });

      expect((r1.data as any)?.[0]?.allowed).toBe(true);
      expect((r2.data as any)?.[0]?.allowed).toBe(true);
      expect((r3.data as any)?.[0]?.allowed).toBe(false);
      expect((r3.data as any)?.[0]?.retry_after_seconds).toBeGreaterThan(0);

      const anonRpc = await anonDb.rpc('consume_rate_limit', {
        p_scope: scope,
        p_bucket_key: key,
        p_limit: 2,
        p_window_seconds: 60,
      });
      expect(anonRpc.error).toBeTruthy();
    } finally {
      await adminDb.from('api_rate_limit_hits').delete().eq('scope', scope).eq('bucket_key', key);
    }
  });

  test('H3: distributed PostgreSQL concurrency lock prevents overlap and denies anon', async () => {
    const lockKey = `e2e:lock:${Date.now()}`;
    const first = await adminDb.rpc('acquire_concurrency_lock', {
      p_key: lockKey,
      p_ttl_seconds: 60,
    });
    const row1 = (first.data as any)?.[0];
    expect(row1?.acquired).toBe(true);
    expect(row1?.owner_token).toBeTruthy();

    try {
      const second = await adminDb.rpc('acquire_concurrency_lock', {
        p_key: lockKey,
        p_ttl_seconds: 60,
      });
      expect((second.data as any)?.[0]?.acquired).toBe(false);

      const anonLock = await anonDb.rpc('acquire_concurrency_lock', {
        p_key: lockKey,
        p_ttl_seconds: 60,
      });
      expect(anonLock.error).toBeTruthy();
    } finally {
      await adminDb.rpc('release_concurrency_lock', {
        p_key: lockKey,
        p_owner_token: row1.owner_token,
      });
    }

    // Re-acquiring after release must succeed
    const third = await adminDb.rpc('acquire_concurrency_lock', {
      p_key: lockKey,
      p_ttl_seconds: 60,
    });
    const row3 = (third.data as any)?.[0];
    expect(row3?.acquired).toBe(true);
    await adminDb.rpc('release_concurrency_lock', {
      p_key: lockKey,
      p_owner_token: row3.owner_token,
    });
  });
});
