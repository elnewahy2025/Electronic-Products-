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

    // Grant ONLY `request.read.any` (not `request.update`, not `super_admin`).
    // This permission is referenced by RLS but not seeded by the migrations,
    // so create it here to keep the spec reproducible on a fresh database.
    const { data: readPerm } = await adminDb
      .from('permissions')
      .upsert(
        { code: 'request.read.any', description: 'Read any purchase request' },
        { onConflict: 'code' },
      )
      .select('id')
      .single();
    expect(readPerm?.id).toBeTruthy();

    await adminDb.from('member_permissions').upsert({
      member_id: readOnlyStaff.id,
      permission_id: readPerm!.id,
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
      const tamperAmt = await restAsJwt(`/rest/v1/purchase_requests?id=eq.${prId}&select=id,status,total_amount`, buyerJwt, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { total_amount: 0.01 },
      });
      expect(tamperAmt.status).toBeGreaterThanOrEqual(400);
      expect(String(tamperAmt.json?.message ?? '')).toContain('purchase_request_protected_field_change');

      // 2. Buyer cannot self-approve
      const selfApprove = await restAsJwt(`/rest/v1/purchase_requests?id=eq.${prId}&select=id,status,total_amount`, buyerJwt, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { status: 'approved' },
      });
      expect(selfApprove.status).toBeGreaterThanOrEqual(400);
      expect(String(selfApprove.json?.message ?? '')).toContain('purchase_request_status_change_forbidden');

      // 3. Read-only staff (`request.read.any`) cannot update purchase_requests at all
      const staffPatch = await restAsJwt(`/rest/v1/purchase_requests?id=eq.${prId}&select=id,status,total_amount`, staffJwt, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { status: 'rejected' },
      });
      expect(Array.isArray(staffPatch.json) ? staffPatch.json.length : 0).toBe(0);

      // 4. Buyer CAN legitimately cancel their own pending request
      const cancel = await restAsJwt(`/rest/v1/purchase_requests?id=eq.${prId}&select=id,status,total_amount`, buyerJwt, {
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

  test('063: seller cannot self-approve via PostgREST UPDATE or INSERT, but can edit display_name', async () => {
    const pendingSeller = await createTestUser({ accountType: 'seller', mfaEnabled: false });
    const buyer = await createTestUser({ accountType: 'buyer', mfaEnabled: false });

    const { error: spErr } = await adminDb.from('seller_profiles').upsert(
      {
        profile_id: pendingSeller.id,
        display_name: 'Pending Seller',
        status: 'pending',
      },
      { onConflict: 'profile_id' },
    );
    expect(spErr).toBeNull();

    const sellerJwt = await signInForJwt(pendingSeller.email, pendingSeller.password);
    const buyerJwt = await signInForJwt(buyer.email, buyer.password);

    // 1. Pending seller attempts PATCH status='approved' -> MUST FAIL with 42501
    const selfApprove = await restAsJwt(
      `/rest/v1/seller_profiles?profile_id=eq.${pendingSeller.id}`,
      sellerJwt,
      {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { status: 'approved' },
      },
    );
    expect(selfApprove.status).toBeGreaterThanOrEqual(400);
    expect(selfApprove.json?.code).toBe('42501');
    expect(String(selfApprove.json?.message ?? '')).toContain('seller_profile_fields_forbidden');

    // 2. Buyer attempts INSERT seller_profiles with status='approved' -> MUST FAIL RLS
    const buyerSelfInsert = await restAsJwt('/rest/v1/seller_profiles', buyerJwt, {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        profile_id: buyer.id,
        display_name: 'Sneaky Buyer',
        status: 'approved',
      },
    });
    expect(buyerSelfInsert.status).toBeGreaterThanOrEqual(400);

    // 3. Pending seller CAN legitimately update display_name
    const editName = await restAsJwt(
      `/rest/v1/seller_profiles?profile_id=eq.${pendingSeller.id}`,
      sellerJwt,
      {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { display_name: 'Updated Pending Seller' },
      },
    );
    expect(editName.status).toBe(200);
    expect(editName.json?.[0]?.display_name).toBe('Updated Pending Seller');
    expect(editName.json?.[0]?.status).toBe('pending');

    // 4. Positive test: Super Admin CAN still approve pending seller via approve_seller RPC after 063
    const admin = await createTestUser({
      accountType: 'staff',
      roleCode: 'super_admin',
      mfaEnabled: false,
    });
    const adminJwt = await signInForJwt(admin.email, admin.password);
    const approveRes = await restAsJwt('/rest/v1/rpc/approve_seller', adminJwt, {
      method: 'POST',
      body: { p_seller_id: pendingSeller.id },
    });
    expect(approveRes.status).toBeLessThan(300);

    const { data: approvedRow } = await adminDb
      .from('seller_profiles')
      .select('status, approved_by')
      .eq('profile_id', pendingSeller.id)
      .single();
    expect(approvedRow?.status).toBe('approved');
    expect(approvedRow?.approved_by).toBe(admin.id);
  });

  test('health: GET /api/health returns 200 ok with db up', async () => {
    const health = await fetch(`${APP_URL}/api/health`);
    expect(health.status).toBe(200);
    const healthJson = await health.json();
    expect(healthJson?.ok).toBe(true);
    expect(healthJson?.db).toBe('up');
  });

  test('064: RLS sweep blocks file_versions/file_previews/upload_sessions/drive_accounts/pvf/product_versions tampering', async () => {
    const sellerA = await createTestUser({ accountType: 'seller', mfaEnabled: false });
    const sellerB = await createTestUser({ accountType: 'seller', mfaEnabled: false });

    await adminDb.from('seller_profiles').upsert(
      [
        { profile_id: sellerA.id, display_name: 'Seller A 064', status: 'approved' },
        { profile_id: sellerB.id, display_name: 'Seller B 064', status: 'approved' },
      ],
      { onConflict: 'profile_id' },
    );

    const jwtA = await signInForJwt(sellerA.email, sellerA.password);

    // Seed files & file_versions via adminDb (service_role)
    const { data: fileA } = await adminDb
      .from('files')
      .insert({ seller_id: sellerA.id, original_name: 'a-quarantined.pdf', mime: 'application/pdf', extension: 'pdf' })
      .select('id')
      .single();
    const { data: fvQuarantined } = await adminDb
      .from('file_versions')
      .insert({ file_id: fileA!.id, version_number: 1, size_bytes: 1024, scan_status: 'quarantined' })
      .select('id')
      .single();
    const { data: fvReadyA } = await adminDb
      .from('file_versions')
      .insert({ file_id: fileA!.id, version_number: 2, size_bytes: 1024, scan_status: 'ready' })
      .select('id')
      .single();

    const { data: fileB } = await adminDb
      .from('files')
      .insert({ seller_id: sellerB.id, original_name: 'b-secret.pdf', mime: 'application/pdf', extension: 'pdf' })
      .select('id')
      .single();
    const { data: fvReadyB } = await adminDb
      .from('file_versions')
      .insert({ file_id: fileB!.id, version_number: 1, size_bytes: 2048, scan_status: 'ready' })
      .select('id')
      .single();

    // 1. Negative: Seller A cannot flip quarantined file_version to ready
    const fvPatch = await restAsJwt(`/rest/v1/file_versions?id=eq.${fvQuarantined!.id}`, jwtA, {
      method: 'PATCH',
      body: { scan_status: 'ready' },
    });
    expect(fvPatch.status).toBeGreaterThanOrEqual(400);

    // 2. Negative: Seller A cannot forge file_previews, upload_sessions, or seller_drive_accounts
    const previewIns = await restAsJwt('/rest/v1/file_previews', jwtA, {
      method: 'POST',
      body: { file_version_id: fvReadyA!.id, preview_type: 'image', status: 'ready' },
    });
    expect(previewIns.status).toBeGreaterThanOrEqual(400);

    const sessionIns = await restAsJwt('/rest/v1/upload_sessions', jwtA, {
      method: 'POST',
      body: { seller_id: sellerA.id, provider: 'google_drive', status: 'uploading', total_bytes: 100 },
    });
    expect(sessionIns.status).toBeGreaterThanOrEqual(400);

    const driveIns = await restAsJwt('/rest/v1/seller_drive_accounts', jwtA, {
      method: 'POST',
      body: { seller_id: sellerA.id, google_account_email: 'fake@example.com' },
    });
    expect(driveIns.status).toBeGreaterThanOrEqual(400);

    // Seed a draft product + draft version for Seller A
    const slugA = `p064-${Date.now()}`;
    const prodIns = await restAsJwt('/rest/v1/products', jwtA, {
      method: 'POST',
      prefer: 'return=representation',
      body: { seller_id: sellerA.id, title: 'Product 064', slug: slugA, price_amount: 10, price_currency: 'USD' },
    });
    expect(prodIns.status).toBe(201);
    const productId = prodIns.json?.[0]?.id as string;

    // 3. Negative: Seller A cannot insert product_version with status='published'
    const pvPubIns = await restAsJwt('/rest/v1/product_versions', jwtA, {
      method: 'POST',
      body: { product_id: productId, version_number: 1, status: 'published' },
    });
    expect(pvPubIns.status).toBeGreaterThanOrEqual(400);

    // Positive: Seller A CAN insert draft product_version
    const pvDraftIns = await restAsJwt('/rest/v1/product_versions', jwtA, {
      method: 'POST',
      prefer: 'return=representation',
      body: { product_id: productId, version_number: 1, status: 'draft' },
    });
    expect(pvDraftIns.status).toBe(201);
    const versionId = pvDraftIns.json?.[0]?.id as string;

    // Negative: Seller A cannot PATCH product_versions.status='published' directly
    const pvPatch = await restAsJwt(`/rest/v1/product_versions?id=eq.${versionId}`, jwtA, {
      method: 'PATCH',
      body: { status: 'published' },
    });
    expect(pvPatch.status).toBeGreaterThanOrEqual(400);
    expect(pvPatch.json?.code).toBe('42501');

    // 4. Negative: Seller A cannot attach Seller B's file (cross-seller IDOR) or quarantined file
    const pvfIdor = await restAsJwt('/rest/v1/product_version_files', jwtA, {
      method: 'POST',
      body: { product_version_id: versionId, file_version_id: fvReadyB!.id },
    });
    expect(pvfIdor.status).toBeGreaterThanOrEqual(400);

    const pvfQuarantined = await restAsJwt('/rest/v1/product_version_files', jwtA, {
      method: 'POST',
      body: { product_version_id: versionId, file_version_id: fvQuarantined!.id },
    });
    expect(pvfQuarantined.status).toBeGreaterThanOrEqual(400);

    // Positive: Seller A CAN attach their own ready file and update display_name, but cannot swap file_version_id
    const pvfOk = await restAsJwt('/rest/v1/product_version_files', jwtA, {
      method: 'POST',
      prefer: 'return=representation',
      body: { product_version_id: versionId, file_version_id: fvReadyA!.id, display_name: 'Guide.pdf' },
    });
    expect(pvfOk.status).toBe(201);
    const pvfId = pvfOk.json?.[0]?.id as string;

    const pvfRename = await restAsJwt(`/rest/v1/product_version_files?id=eq.${pvfId}`, jwtA, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { display_name: 'Guide v2.pdf' },
    });
    expect(pvfRename.status).toBe(200);
    expect(pvfRename.json?.[0]?.display_name).toBe('Guide v2.pdf');

    const pvfSwap = await restAsJwt(`/rest/v1/product_version_files?id=eq.${pvfId}`, jwtA, {
      method: 'PATCH',
      body: { file_version_id: fvReadyB!.id },
    });
    expect(pvfSwap.status).toBeGreaterThanOrEqual(400);
    expect(pvfSwap.json?.code).toBe('42501');
  });

  test('064: products trigger, reopen_product RPC, admin moderation, and suspend_seller protection', async () => {
    const seller = await createTestUser({ accountType: 'seller', mfaEnabled: false });
    const admin = await createTestUser({ accountType: 'staff', roleCode: 'super_admin', mfaEnabled: false });

    await adminDb.from('seller_profiles').upsert(
      { profile_id: seller.id, display_name: 'Mod Seller 064', status: 'approved' },
      { onConflict: 'profile_id' },
    );

    const sellerJwt = await signInForJwt(seller.email, seller.password);
    const adminJwt = await signInForJwt(admin.email, admin.password);

    // 1. Negative: Seller cannot INSERT product with status='published'
    const badProdIns = await restAsJwt('/rest/v1/products', sellerJwt, {
      method: 'POST',
      body: {
        seller_id: seller.id,
        title: 'Sneaky Published',
        slug: `sneaky-${Date.now()}`,
        price_amount: 10,
        price_currency: 'USD',
        status: 'published',
      },
    });
    expect(badProdIns.status).toBeGreaterThanOrEqual(400);

    // 2. Positive: Seller creates draft product, edits title, attaches ready file, publishes, pauses, and reopens
    const prodIns = await restAsJwt('/rest/v1/products', sellerJwt, {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        seller_id: seller.id,
        title: 'Legit Product',
        slug: `legit-${Date.now()}`,
        price_amount: 15,
        price_currency: 'USD',
      },
    });
    expect(prodIns.status).toBe(201);
    const productId = prodIns.json?.[0]?.id as string;

    const editTitle = await restAsJwt(`/rest/v1/products?id=eq.${productId}`, sellerJwt, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { title: 'Legit Product Edited' },
    });
    expect(editTitle.status).toBe(200);
    expect(editTitle.json?.[0]?.title).toBe('Legit Product Edited');

    // Negative: Seller cannot directly PATCH status='published'
    const directPub = await restAsJwt(`/rest/v1/products?id=eq.${productId}`, sellerJwt, {
      method: 'PATCH',
      body: { status: 'published' },
    });
    expect(directPub.status).toBeGreaterThanOrEqual(400);
    expect(directPub.json?.code).toBe('42501');

    // Seed ready file + draft version + attach + publish via RPC
    const { data: f } = await adminDb
      .from('files')
      .insert({ seller_id: seller.id, original_name: 'ok.pdf', mime: 'application/pdf', extension: 'pdf' })
      .select('id')
      .single();
    const { data: fv } = await adminDb
      .from('file_versions')
      .insert({ file_id: f!.id, version_number: 1, size_bytes: 512, scan_status: 'ready' })
      .select('id')
      .single();
    const pvIns = await restAsJwt('/rest/v1/product_versions', sellerJwt, {
      method: 'POST',
      prefer: 'return=representation',
      body: { product_id: productId, version_number: 1, status: 'draft' },
    });
    const versionId = pvIns.json?.[0]?.id as string;
    await restAsJwt('/rest/v1/product_version_files', sellerJwt, {
      method: 'POST',
      body: { product_version_id: versionId, file_version_id: fv!.id },
    });

    const pubRpc = await restAsJwt('/rest/v1/rpc/publish_product_version', sellerJwt, {
      method: 'POST',
      body: { p_version_id: versionId },
    });
    expect(pubRpc.status).toBeLessThan(300);

    // Pause via unpublish_product, then reopen via reopen_product -> MUST SUCCEED
    const pauseRpc = await restAsJwt('/rest/v1/rpc/unpublish_product', sellerJwt, {
      method: 'POST',
      body: { p_product_id: productId },
    });
    expect(pauseRpc.status).toBeLessThan(300);

    const reopenOk = await restAsJwt('/rest/v1/rpc/reopen_product', sellerJwt, {
      method: 'POST',
      body: { p_product_id: productId },
    });
    expect(reopenOk.status).toBeLessThan(300);

    const { data: afterReopen } = await adminDb
      .from('products')
      .select('status')
      .eq('id', productId)
      .single();
    expect(afterReopen?.status).toBe('published');

    // 3. Positive admin moderation: Admin suspends product -> Seller cannot republish or clear suspension_reason
    const adminSuspend = await restAsJwt(`/rest/v1/products?id=eq.${productId}`, adminJwt, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { status: 'suspended', suspension_reason: 'Policy check' },
    });
    expect(adminSuspend.status).toBe(200);
    expect(adminSuspend.json?.[0]?.status).toBe('suspended');

    const sellerRepubAfterSuspend = await restAsJwt('/rest/v1/rpc/publish_product_version', sellerJwt, {
      method: 'POST',
      body: { p_version_id: versionId },
    });
    expect(sellerRepubAfterSuspend.status).toBeGreaterThanOrEqual(400);
    expect(sellerRepubAfterSuspend.json?.code).toBe('42501');

    // 4. Positive soft-delete on a separate draft product
    const draftProd = await restAsJwt('/rest/v1/products', sellerJwt, {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        seller_id: seller.id,
        title: 'To Soft Delete',
        slug: `softdel-${Date.now()}`,
        price_amount: 12,
        price_currency: 'USD',
      },
    });
    expect(draftProd.status).toBe(201);
    const softDelId = draftProd.json?.[0]?.id as string;

    const softDelRes = await restAsJwt(`/rest/v1/products?id=eq.${softDelId}`, sellerJwt, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { status: 'deleted', deleted_at: new Date().toISOString() },
    });
    expect(softDelRes.status).toBe(200);
    expect(softDelRes.json?.[0]?.status).toBe('deleted');

    // 5. suspend_seller pauses published products with suspension_reason -> seller CANNOT reopen!
    await adminDb
      .from('products')
      .update({ status: 'published', suspension_reason: null })
      .eq('id', productId);

    const suspendSellerRes = await restAsJwt('/rest/v1/rpc/suspend_seller', adminJwt, {
      method: 'POST',
      body: { p_seller_id: seller.id, p_reason: 'Account suspended for review' },
    });
    expect(suspendSellerRes.status).toBeLessThan(300);

    const reopenBlocked = await restAsJwt('/rest/v1/rpc/reopen_product', sellerJwt, {
      method: 'POST',
      body: { p_product_id: productId },
    });
    expect(reopenBlocked.status).toBeGreaterThanOrEqual(400);
    expect(reopenBlocked.json?.code).toBe('42501');
  });
});
