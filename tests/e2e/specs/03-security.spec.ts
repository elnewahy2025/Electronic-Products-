import { test, expect } from '@playwright/test';
import {
  createTestUser, createSeller, createCategory, seedProductWithFiles,
  seedPurchaseRequest, approveAndGetCode, confirmCodeDelivery,
  cleanupTestData, adminDb, randomCode,
} from '../helpers/db';
import { getCookieHeader } from '../helpers/auth';
import { apiRequest, completeDownloadAsWorker } from '../helpers/api';

// Several tests chain multiple admin/buyer API calls; give them headroom.
test.setTimeout(90_000);

test.describe('Security: ownership, rate limits, blocked operations', () => {
  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('redeem requires authentication', async () => {
    const res = await apiRequest('POST', '/api/redeem', { code: randomCode() });
    expect(res.status).toBe(401);
    expect(res.json.code).toBe('UNAUTHENTICATED');
  });

  test('cannot redeem a code owned by another buyer', async () => {
    const seller = await createSeller();
    const category = await createCategory();
    const product = await seedProductWithFiles({
      sellerId: seller.sellerId,
      categoryId: category.id,
    });

    const buyerA = await createTestUser({ accountType: 'buyer', email: `a-${Date.now()}@test.local` });
    const buyerB = await createTestUser({ accountType: 'buyer', email: `b-${Date.now()}@test.local` });

    const buyerACookies = await getCookieHeader(buyerA.email, buyerA.password);
    const buyerBCookies = await getCookieHeader(buyerB.email, buyerB.password);

    const { requestId } = await seedPurchaseRequest({
      buyerId: buyerA.id,
      buyerEmail: buyerA.email,
      productId: product.id,
      versionId: product.versionId,
      price: 10,
    });
    const { codeId, plaintext } = await approveAndGetCode({ requestId, buyerId: buyerA.id });
    await confirmCodeDelivery(codeId);

    // Buyer B tries to redeem Buyer A's code
    const res = await apiRequest('POST', '/api/redeem', { code: plaintext }, buyerBCookies);
    expect(res.status).toBe(403);
    expect(res.json.code).toBe('not_owner');

    // Buyer A succeeds
    const okRes = await apiRequest('POST', '/api/redeem', { code: plaintext }, buyerACookies);
    expect(okRes.status).toBe(200);
  });

  test('rate limit after 5 failed redeem attempts', async () => {
    const buyer = await createTestUser({
      accountType: 'buyer',
      email: `rl-${Date.now()}@test.local`,
    });
    const cookies = await getCookieHeader(buyer.email, buyer.password);

    // 5 failed attempts (wrong codes)
    for (let i = 0; i < 5; i++) {
      const res = await apiRequest('POST', '/api/redeem', { code: randomCode() }, cookies);
      expect(res.status).toBe(404);
    }

    // 6th attempt is rate-limited
    const sixth = await apiRequest('POST', '/api/redeem', { code: randomCode() }, cookies);
    expect(sixth.status).toBe(429);
    expect(sixth.json.code).toMatch(/rate_limited/);
  });

  test('cannot revoke code after delivery', async () => {
    const seller = await createSeller();
    const category = await createCategory();
    const product = await seedProductWithFiles({
      sellerId: seller.sellerId,
      categoryId: category.id,
    });
    const buyer = await createTestUser({ accountType: 'buyer', email: `rc-${Date.now()}@test.local` });
    const admin = await createTestUser({ accountType: 'staff', roleCode: 'admin' });

    const adminCookies = await getCookieHeader(admin.email, admin.password);

    const { requestId } = await seedPurchaseRequest({
      buyerId: buyer.id,
      buyerEmail: buyer.email,
      productId: product.id,
      versionId: product.versionId,
      price: 10,
    });
    const { codeId, plaintext } = await approveAndGetCode({ requestId, buyerId: buyer.id });
    await confirmCodeDelivery(codeId);

    // Attempt to revoke after delivery
    const res = await apiRequest('POST', `/api/admin/codes/${codeId}/revoke`, {
      reason: 'محاولة إلغاء',
    }, adminCookies);

    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/blocked_after_delivery|REQUEST_FAILED/);

    // Code is still valid
    const { data: code } = await adminDb
      .from('purchase_codes')
      .select('status, delivered_at')
      .eq('id', codeId)
      .single();
    expect(code!.status).toBe('delivered');
    expect(code!.delivered_at).not.toBeNull();
  });

  test('cannot revoke session after delivery started', async () => {
    const seller = await createSeller();
    const category = await createCategory();
    const product = await seedProductWithFiles({
      sellerId: seller.sellerId,
      categoryId: category.id,
    });
    const buyer = await createTestUser({ accountType: 'buyer', email: `rs-${Date.now()}@test.local` });
    const admin = await createTestUser({ accountType: 'staff', roleCode: 'admin' });

    const buyerCookies = await getCookieHeader(buyer.email, buyer.password);
    const adminCookies = await getCookieHeader(admin.email, admin.password);

    const { requestId } = await seedPurchaseRequest({
      buyerId: buyer.id,
      buyerEmail: buyer.email,
      productId: product.id,
      versionId: product.versionId,
      price: 10,
    });
    const { codeId, plaintext } = await approveAndGetCode({ requestId, buyerId: buyer.id });
    await confirmCodeDelivery(codeId);

    const redeemRes = await apiRequest('POST', '/api/redeem', { code: plaintext }, buyerCookies);
    const sessionId = redeemRes.json.session_id;

    // Start a delivery (creates a download_deliveries row)
    const init = await apiRequest('POST', `/api/download/${sessionId}/init`, { type: 'zip' }, buyerCookies);
    const token = new URL(init.json.url).searchParams.get('token');
    expect(token).toBeTruthy();
    await completeDownloadAsWorker(sessionId, token!, [{
      file_version_id: product.fileVersionIds[0],
      bytes_sent: 100_000,
      checksum: '0'.repeat(64),
    }]);

    // Attempt to revoke
    const res = await apiRequest('POST', `/api/admin/downloads/${sessionId}/revoke`, {
      reason: 'test',
    }, adminCookies);
    expect(res.status).toBe(409);
    expect(res.json.error).toMatch(/blocked_after_delivery|REQUEST_FAILED/);
  });

  test('seller A cannot see or modify seller B products', async () => {
    const sellerA = await createSeller({ displayName: 'Seller A' });
    const sellerB = await createSeller({ displayName: 'Seller B' });
    const category = await createCategory();

    const prodA = await seedProductWithFiles({
      sellerId: sellerA.sellerId,
      categoryId: category.id,
      title: 'A Product',
    });
    const prodB = await seedProductWithFiles({
      sellerId: sellerB.sellerId,
      categoryId: category.id,
      title: 'B Product',
    });

    const cookiesA = await getCookieHeader(sellerA.email, sellerA.password);

    // Seller A tries to modify product B via API
    const res = await apiRequest('PATCH', `/api/seller/products/${prodB.id}`, {
      title: 'Hacked',
    }, cookiesA);
    expect([403, 404]).toContain(res.status);

    // Product B is unchanged
    const { data: pb } = await adminDb
      .from('products')
      .select('title')
      .eq('id', prodB.id)
      .single();
    expect(pb!.title).toBe('B Product');
  });

  test('buyer cannot see another buyer orders', async () => {
    const seller = await createSeller();
    const category = await createCategory();
    const product = await seedProductWithFiles({
      sellerId: seller.sellerId,
      categoryId: category.id,
    });

    const buyerA = await createTestUser({ accountType: 'buyer', email: `oa-${Date.now()}@test.local` });
    const buyerB = await createTestUser({ accountType: 'buyer', email: `ob-${Date.now()}@test.local` });

    const { requestId: reqA } = await seedPurchaseRequest({
      buyerId: buyerA.id,
      buyerEmail: buyerA.email,
      productId: product.id,
      versionId: product.versionId,
      price: 10,
    });

    const cookiesB = await getCookieHeader(buyerB.email, buyerB.password);
    const res = await apiRequest('GET', `/api/admin/requests/${reqA}`, undefined, cookiesB);
    // B should not have access; endpoint may return 403 or 404
    expect([403, 404]).toContain(res.status);

    // And buyer B sees no orders in their view
    const { data: bOrders } = await adminDb
      .from('purchase_requests')
      .select('id')
      .eq('buyer_id', buyerB.id);
    expect(bOrders).toHaveLength(0);
  });

  test('audit log is append-only (cannot delete)', async () => {
    // Insert a test audit row via log_audit (as a user)
    const user = await createTestUser({ accountType: 'buyer', email: `audit-${Date.now()}@test.local` });
    const cookies = await getCookieHeader(user.email, user.password);

    // Trigger an audit event: create purchase request via API
    const seller = await createSeller();
    const category = await createCategory();
    const product = await seedProductWithFiles({
      sellerId: seller.sellerId,
      categoryId: category.id,
    });

    const prRes = await apiRequest('POST', '/api/purchase-requests', {
      product_id: product.id,
      email: user.email,
      phone: '+201000000000',
    }, cookies);
    expect(prRes.status).toBe(200);

    // Get the audit row
    const { data: logs } = await adminDb
      .from('audit_logs')
      .select('id')
      .eq('action', 'purchase_request.created')
      .order('id', { ascending: false })
      .limit(1);
    expect(logs).toHaveLength(1);

    // Try to delete via service_role (should fail due to trigger)
    const { error: delErr } = await adminDb
      .from('audit_logs')
      .delete()
      .eq('id', logs![0].id);
    expect(delErr).toBeTruthy();
    expect(delErr!.message).toContain('append_only_violation');

    // Try to update (should fail)
    const { error: updErr } = await adminDb
      .from('audit_logs')
      .update({ action: 'tampered' })
      .eq('id', logs![0].id);
    expect(updErr).toBeTruthy();
  });
});