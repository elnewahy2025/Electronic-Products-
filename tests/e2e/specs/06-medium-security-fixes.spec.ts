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

async function seedMinimalCategory() {
  const slug = `m6-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const { data, error } = await adminDb
    .from('categories')
    .insert({ name: `Cat ${slug}`, slug, is_active: true, sort_order: 0 })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seed category failed: ${error?.message}`);
  return data.id as string;
}

async function seedApprovalRequest() {
  const buyer = await createTestUser({ accountType: 'buyer', mfaEnabled: false });
  const seller = await createTestUser({ accountType: 'seller', mfaEnabled: false });
  const categoryId = await seedMinimalCategory();

  const { error: spErr } = await adminDb.from('seller_profiles').upsert({
    profile_id: seller.id,
    display_name: 'M6 Seller',
    status: 'approved',
  }, { onConflict: 'profile_id' });
  if (spErr) throw new Error(`seller profile upsert failed: ${spErr.message}`);

  const { data: product, error: productErr } = await adminDb
    .from('products')
    .insert({
      seller_id: seller.id,
      category_id: categoryId,
      title: `M6 Product ${Date.now()}`,
      slug: `m6-product-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      price_amount: 100,
      price_currency: 'USD',
      status: 'published',
    })
    .select('id')
    .single();
  if (productErr || !product) throw new Error(`product insert failed: ${productErr?.message}`);

  const { data: version, error: verErr } = await adminDb
    .from('product_versions')
    .insert({ product_id: product.id, version_number: 1, status: 'published', published_at: new Date().toISOString() })
    .select('id')
    .single();
  if (verErr || !version) throw new Error(`version insert failed: ${verErr?.message}`);

  const { data: pr, error: prErr } = await adminDb
    .from('purchase_requests')
    .insert({
      buyer_id: buyer.id,
      status: 'pending',
      total_amount: 100,
      currency: 'USD',
      exchange_rate_at_purchase: 1,
      amount_in_usd: 100,
      customer_email: buyer.email,
    })
    .select('id')
    .single();
  if (prErr || !pr) throw new Error(`purchase request insert failed: ${prErr?.message}`);

  const { error: itemErr } = await adminDb.from('purchase_request_items').insert({
    purchase_request_id: pr.id,
    product_id: product.id,
    product_version_id: version.id,
    unit_price: 100,
    currency: 'USD',
    quantity: 1,
  });
  if (itemErr) throw new Error(`purchase item insert failed: ${itemErr.message}`);

  return { buyer, seller, prId: pr.id as string };
}

test.describe('MEDIUM Security Fixes (#5-#15)', () => {
  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('M6: cookie-authenticated mutation requires canonical origin', async () => {
    const res = await fetch(`${APP_URL}/api/support/tickets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      body: JSON.stringify({ subject: 'x', message: 'y' }),
    });
    expect(res.status).toBe(403);
    const json = await res.json().catch(() => null);
    expect(json?.error).toBe('CSRF_INVALID_ORIGIN');
  });

  test('M7: support_messages INSERT binds sender_id to auth.uid()', async () => {
    const owner = await createTestUser({ accountType: 'buyer', mfaEnabled: false });
    const other = await createTestUser({ accountType: 'buyer', mfaEnabled: false });
    const ownerJwt = await signInForJwt(owner.email, owner.password);

    const { data: ticket, error: ticketErr } = await adminDb
      .from('support_tickets')
      .insert({ owner_id: owner.id, subject: 'M7 ticket', status: 'open' })
      .select('id')
      .single();
    if (ticketErr || !ticket) throw new Error(`ticket insert failed: ${ticketErr?.message}`);

    const spoof = await restAsJwt('/rest/v1/support_messages', ownerJwt, {
      method: 'POST',
      prefer: 'return=minimal',
      body: { ticket_id: ticket.id, sender_id: other.id, body: 'spoofed', is_internal: false },
    });
    expect(spoof.status).toBeGreaterThanOrEqual(400);

    const ok = await restAsJwt('/rest/v1/support_messages', ownerJwt, {
      method: 'POST',
      prefer: 'return=representation',
      body: { ticket_id: ticket.id, sender_id: owner.id, body: 'legit', is_internal: false },
    });
    expect(ok.status).toBeLessThan(300);
    expect(ok.json?.[0]?.sender_id ?? ok.json?.sender_id).toBe(owner.id);
  });

  test('M9: approve_purchase_request requires attestation and writes it atomically', async () => {
    const { prId } = await seedApprovalRequest();
    const staff = await createTestUser({ accountType: 'staff', roleCode: 'super_admin', mfaEnabled: false });
    const staffJwt = await signInForJwt(staff.email, staff.password);

    const noAttestation = await restAsJwt('/rest/v1/rpc/approve_purchase_request', staffJwt, {
      method: 'POST',
      body: {
        p_request_id: prId,
        p_pepper: process.env.CODE_HASH_PEPPER,
      },
    });
    expect(noAttestation.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(noAttestation.json)).toContain('attestation_required');

    const badAmount = await restAsJwt('/rest/v1/rpc/approve_purchase_request', staffJwt, {
      method: 'POST',
      body: {
        p_request_id: prId,
        p_pepper: process.env.CODE_HASH_PEPPER,
        p_attestation: { amount: 1, currency: 'USD', reference: 'bank-ref-001' },
      },
    });
    expect(badAmount.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(badAmount.json)).toContain('payment_attestation_mismatch');

    const { data: attBefore } = await adminDb
      .from('purchase_request_attestations')
      .select('id')
      .eq('purchase_request_id', prId)
      .maybeSingle();
    expect(attBefore).toBeNull();

    const ok = await restAsJwt('/rest/v1/rpc/approve_purchase_request', staffJwt, {
      method: 'POST',
      body: {
        p_request_id: prId,
        p_pepper: process.env.CODE_HASH_PEPPER,
        p_attestation: { amount: 100, currency: 'USD', reference: 'bank-ref-001', method: 'manual_transfer' },
      },
    });
    expect(ok.status).toBeLessThan(300);
    expect(Array.isArray(ok.json)).toBe(true);

    const { data: att } = await adminDb
      .from('purchase_request_attestations')
      .select('amount,currency,reference,method')
      .eq('purchase_request_id', prId)
      .single();
    expect(att?.amount).toBe(100);
    expect(att?.currency).toBe('USD');
    expect(att?.reference).toBe('bank-ref-001');

    // Avoid unused var lint in case role grants differ across environments.
    expect(staff.id).toBeTruthy();
  });

  test('M12: complete_upload_session is atomic and idempotent', async () => {
    const seller = await createTestUser({ accountType: 'seller', mfaEnabled: false });
    const { error: spErr } = await adminDb.from('seller_profiles').upsert({
      profile_id: seller.id,
      display_name: 'M12 Seller',
      status: 'approved',
    }, { onConflict: 'profile_id' });
    if (spErr) throw new Error(`seller profile upsert failed: ${spErr.message}`);
    const { data: account, error: accErr } = await adminDb
      .from('seller_drive_accounts')
      .insert({
        seller_id: seller.id,
        google_account_email: `m12-${Date.now()}@example.test`,
        encrypted_refresh_token: 'enc',
        status: 'active',
        is_default: true,
      })
      .select('id')
      .single();
    if (accErr || !account) throw new Error(`drive account insert failed: ${accErr?.message}`);

    const { data: session, error: sessErr } = await adminDb
      .from('upload_sessions')
      .insert({
        seller_id: seller.id,
        drive_account_id: account.id,
        provider: 'google_drive',
        status: 'uploading',
        original_name: 'file.pdf',
        display_name: 'file.pdf',
        mime: 'application/pdf',
        extension: 'pdf',
        total_bytes: 1234,
      })
      .select('id')
      .single();
    if (sessErr || !session) throw new Error(`upload session insert failed: ${sessErr?.message}`);

    // Authenticated seller must NOT be able to bypass app-layer Drive verification
    const sellerJwt = await signInForJwt(seller.email, seller.password);
    const directRpc = await restAsJwt('/rest/v1/rpc/complete_upload_session', sellerJwt, {
      method: 'POST',
      body: {
        p_session_id: session.id,
        p_provider_file_id: `bypass-${Date.now()}`,
        p_size_bytes: 1234,
        p_checksum: null,
      },
    });
    expect(directRpc.status).toBeGreaterThanOrEqual(400);

    // Simulate upload-service.ts claiming the session (`uploading` -> `completing`)
    // before finalizing via service_role RPC.
    const { error: claimErr } = await adminDb
      .from('upload_sessions')
      .update({ status: 'completing' as any })
      .eq('id', session.id)
      .eq('status', 'uploading');
    expect(claimErr).toBeNull();

    const first = await adminDb.rpc('complete_upload_session', {
      p_session_id: session.id,
      p_provider_file_id: `drive-file-${Date.now()}`,
      p_size_bytes: 1234,
      p_checksum: null,
    });
    expect(first.error).toBeNull();

    const second = await adminDb.rpc('complete_upload_session', {
      p_session_id: session.id,
      p_provider_file_id: `drive-file-${Date.now()}`,
      p_size_bytes: 1234,
      p_checksum: null,
    });
    expect(second.error).toBeNull();
    expect(second.data?.file_version_id ?? second.data?.fileVersionId).toBe(
      first.data?.file_version_id ?? first.data?.fileVersionId,
    );

    const { count } = await adminDb
      .from('file_versions')
      .select('id', { count: 'exact', head: true })
      .eq('file_id', first.data?.file_id ?? first.data?.fileId);
    expect(count).toBe(1);
  });

  test('M14: record_restore_verification accepts evidence payload', async () => {
    const { data: job } = await adminDb
      .from('backup_jobs')
      .insert({ type: 'manual', status: 'completed', started_at: new Date().toISOString(), finished_at: new Date().toISOString() })
      .select('id')
      .single();
    if (!job) throw new Error('backup job insert failed');

    const { data: archive } = await adminDb
      .from('backup_archives')
      .insert({
        backup_job_id: job.id,
        storage_location: 'database-backups/backups/test.sql.gz',
        checksum: 'a'.repeat(64),
        source_pg_version: '170000',
        row_counts: { backup_settings: 1, profiles: 0, products: 0 },
      })
      .select('id')
      .single();
    if (!archive) throw new Error('backup archive insert failed');

    const { error } = await adminDb.rpc('record_restore_verification', {
      p_archive_id: archive.id,
      p_status: 'completed',
      p_error: null,
      p_performed_by: null,
      p_evidence: { ok: true },
    });
    expect(error).toBeNull();
  });
});
