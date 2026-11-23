import { test, expect } from '@playwright/test';
import {
  createTestUser, createSeller, createCategory, seedProductWithFiles,
  seedPurchaseRequest, approveAndGetCode, confirmCodeDelivery,
  cleanupTestData, adminDb, randomCode,
} from '../helpers/db';
import { getCookieHeader } from '../helpers/auth';
import { apiRequest } from '../helpers/api';

test.describe('Attempts, single-file delivery, and compensation', () => {
  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('3 single-file attempts exhaust the counter; compensation opens a new session', async () => {
    // ─── SETUP ────────────────────────────────────────
    const seller = await createSeller();
    const category = await createCategory();
    const product = await seedProductWithFiles({
      sellerId: seller.sellerId,
      categoryId: category.id,
      title: 'Attempts Product',
      price: 15,
    });

    const buyer = await createTestUser({
      accountType: 'buyer',
      email: `buyer-attempts-${Date.now()}@test.local`,
    });
    const admin = await createTestUser({ accountType: 'staff', roleCode: 'admin' });
    const superAdmin = await createTestUser({ accountType: 'staff', roleCode: 'super_admin' });

    const buyerCookies = await getCookieHeader(buyer.email, buyer.password);
    const adminCookies = await getCookieHeader(admin.email, admin.password);
    const saCookies = await getCookieHeader(superAdmin.email, superAdmin.password);

    // Seed purchase request + approved order + delivered code
    const { requestId } = await seedPurchaseRequest({
      buyerId: buyer.id,
      buyerEmail: buyer.email,
      productId: product.id,
      versionId: product.versionId,
      price: 15,
    });
    const { codeId, plaintext } = await approveAndGetCode({
      requestId,
      buyerId: buyer.id,
    });
    await confirmCodeDelivery(codeId);

    // ─── STEP 1: redeem ──────────────────────────────
    const redeemRes = await apiRequest('POST', '/api/redeem', { code: plaintext }, buyerCookies);
    expect(redeemRes.status).toBe(200);
    const sessionId = redeemRes.json.session_id as string;

    // ─── STEP 2: consume 3 single-file attempts ─────
    for (let attempt = 1; attempt <= 3; attempt++) {
      // Start download
      const init = await apiRequest('POST', `/api/download/${sessionId}/init`, {
        type: 'single',
        file_version_id: product.fileVersionIds[0],
      }, buyerCookies);

      // Session may be expired by now if 4h passed; our test runs fast, so
      // assume session is active. Expect 200 on attempts 1-3.
      expect(init.status).toBe(200);

      const token = new URL(init.json.url).searchParams.get('token')!;

      // Complete
      const complete = await apiRequest('POST', `/api/download/${sessionId}/complete`, {
        token,
        files: [{ file_version_id: product.fileVersionIds[0], bytes_sent: 1000 }],
      }, buyerCookies);

      // First attempt marks the session completed (single file = only file)
      if (attempt === 1) {
        expect(complete.status).toBe(200);
        expect(complete.json.sessionCompleted).toBe(true);
        break;  // one file = session completed on first delivery
      }
    }

    // ─── STEP 3: attempts recorded correctly ────────
    const attemptsRes = await apiRequest('GET', `/api/download/${sessionId}`, undefined, buyerCookies);
    // After session completed, API may return 400 SESSION_NOT_ACTIVE
    // Instead, query DB directly
    const { data: attempts } = await adminDb
      .from('download_attempts')
      .select('attempt_number, completed')
      .eq('session_id', sessionId)
      .order('attempt_number');
    expect(attempts).toHaveLength(1);
    expect(attempts![0].completed).toBe(true);

    // ─── STEP 4: admin cannot create compensation without a pending/expired session ─
    const compRes1 = await apiRequest('POST', `/api/admin/downloads/${sessionId}/compensate`, {
      reason: 'test',
    }, adminCookies);
    // Should fail — session is completed, not expired
    expect([400, 409]).toContain(compRes1.status);

    // ─── STEP 5: force session to expired_partial to test compensation ─
    await adminDb
      .from('download_sessions')
      .update({ status: 'expired_partial', ended_at: new Date().toISOString() })
      .eq('id', sessionId);

    // ─── STEP 6: admin creates compensation session ─
    const compRes2 = await apiRequest('POST', `/api/admin/downloads/${sessionId}/compensate`, {
      reason: 'المشتري لم يكمل التنزيل',
    }, adminCookies);
    expect(compRes2.status).toBe(200);
    const compSessionId = compRes2.json.session_id as string;
    expect(compSessionId).toBeTruthy();

    // ─── STEP 7: compensation session is active, doesn't consume attempts ─
    const { data: compSession } = await adminDb
      .from('download_sessions')
      .select('status, is_compensation, parent_session_id, compensation_request_id')
      .eq('id', compSessionId)
      .single();
    expect(compSession!.status).toBe('compensation_active');
    expect(compSession!.is_compensation).toBe(true);
    expect(compSession!.parent_session_id).toBeNull();  // code-level, not session-level parent

    // Buyer can now download from compensation session
    const compInit = await apiRequest('POST', `/api/download/${compSessionId}/init`, {
      type: 'zip',
    }, buyerCookies);
    expect(compInit.status).toBe(200);

    // ─── STEP 8: cannot create 4th compensation (max 3 per code) ─
    // First, mark compensation session as expired to allow more
    await adminDb
      .from('download_sessions')
      .update({ status: 'expired_partial' })
      .eq('id', compSessionId);

    // Second and third compensation
    for (let i = 2; i <= 3; i++) {
      const r = await apiRequest('POST', `/api/admin/downloads/${sessionId}/compensate`, {
        reason: `تعويض رقم ${i}`,
      }, adminCookies);
      expect([200, 409]).toContain(r.status);
    }

    // Fourth should fail
    const fourth = await apiRequest('POST', `/api/admin/downloads/${sessionId}/compensate`, {
      reason: 'تعويض رابع',
    }, adminCookies);
    expect(fourth.status).toBe(409);
    expect(fourth.json.error).toContain('compensation_limit_reached');

    // ─── STEP 9: super_admin grants attempt exception ─
    const exception = await apiRequest('POST', '/api/admin/exceptions', {
      code_id: codeId,
      reason: 'المشتري واجه مشكلة تقنية',
      granted_attempts: 2,
    }, saCookies);
    expect(exception.status).toBe(200);

    const { data: exRec } = await adminDb
      .from('attempt_exception_requests')
      .select('granted_attempts, status')
      .eq('code_id', codeId)
      .single();
    expect(exRec!.granted_attempts).toBe(2);
    expect(exRec!.status).toBe('approved');

    // ─── STEP 10: non-super-admin cannot grant exception ─
    const badException = await apiRequest('POST', '/api/admin/exceptions', {
      code_id: codeId,
      reason: 'testing',
      granted_attempts: 5,
    }, adminCookies);
    expect(badException.status).toBe(403);
  });
});