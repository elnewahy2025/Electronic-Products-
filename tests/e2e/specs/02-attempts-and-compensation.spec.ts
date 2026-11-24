import { test, expect } from '@playwright/test';
import {
  createTestUser, createSeller, createCategory, seedProductWithFiles,
  seedPurchaseRequest, approveAndGetCode, confirmCodeDelivery,
  cleanupTestData, adminDb, randomCode,
} from '../helpers/db';
import { getCookieHeader } from '../helpers/auth';
import { apiRequest, claimDownloadToken, completeDownloadAsWorker } from '../helpers/api';

// Multi-step attempt/compensation journey; the default 30s is too tight.
test.setTimeout(120_000);

type DeliverableFile = {
  fileVersionId: string;
  bytesSent: number;
  checksum: string;
  includedInZip: boolean;
};

/** Read the real seeded file metadata instead of inventing byte counts. */
async function versionFiles(versionId: string): Promise<DeliverableFile[]> {
  const { data: links, error: linkError } = await adminDb
    .from('product_version_files')
    .select('file_version_id, included_in_zip')
    .eq('product_version_id', versionId)
    .order('file_version_id');
  if (linkError) throw new Error(`versionFiles links: ${linkError.message}`);

  const files: DeliverableFile[] = [];
  for (const link of links ?? []) {
    const { data: version, error: versionError } = await adminDb
      .from('file_versions')
      .select('size_bytes, checksum_sha256')
      .eq('id', link.file_version_id)
      .single();
    if (versionError || !version) throw new Error(`versionFiles version: ${versionError?.message}`);
    files.push({
      fileVersionId: link.file_version_id as string,
      bytesSent: Number(version.size_bytes),
      checksum: String(version.checksum_sha256).toLowerCase(),
      includedInZip: Boolean(link.included_in_zip),
    });
  }
  return files;
}

async function deliverSingle(sessionId: string, file: DeliverableFile, cookies: string) {
  const init = await apiRequest(
    'POST',
    `/api/download/${sessionId}/init`,
    { type: 'single', file_version_id: file.fileVersionId },
    cookies,
  );
  expect(init.status, JSON.stringify(init.json)).toBe(200);
  const token = new URL(init.json.url).searchParams.get('token')!;
  expect(token).toBeTruthy();
  return completeDownloadAsWorker(sessionId, token, [{
    file_version_id: file.fileVersionId,
    bytes_sent: file.bytesSent,
    checksum: file.checksum,
  }]);
}

async function deliverZip(sessionId: string, files: DeliverableFile[], cookies: string) {
  const init = await apiRequest('POST', `/api/download/${sessionId}/init`, { type: 'zip' }, cookies);
  expect(init.status, JSON.stringify(init.json)).toBe(200);
  const token = new URL(init.json.url).searchParams.get('token')!;
  expect(token).toBeTruthy();
  return completeDownloadAsWorker(sessionId, token, files
    .filter((file) => file.includedInZip)
    .map((file) => ({
      file_version_id: file.fileVersionId,
      bytes_sent: file.bytesSent,
      checksum: file.checksum,
    })));
}

async function attemptRows(orderItemId: string) {
  const { data, error } = await adminDb
    .from('download_attempts')
    .select('attempt_number, completed, type, session_id')
    .eq('order_item_id', orderItemId)
    .order('attempt_number');
  if (error) throw new Error(`attemptRows: ${error.message}`);
  return data ?? [];
}

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

    // A second ready file makes partial delivery possible: the first single
    // delivery does not complete the session and therefore consumes no attempt.
    const { data: firstVersion, error: firstVersionError } = await adminDb
      .from('file_versions')
      .select('file_id, storage_location_id, mime, extension')
      .eq('id', product.fileVersionIds[0])
      .single();
    if (firstVersionError || !firstVersion) {
      throw new Error(`first file version: ${firstVersionError?.message}`);
    }
    const { data: secondVersion, error: secondVersionError } = await adminDb
      .from('file_versions')
      .insert({
        file_id: firstVersion.file_id,
        version_number: 2,
        storage_location_id: firstVersion.storage_location_id,
        size_bytes: 50_000,
        checksum_sha256: '1'.repeat(64),
        mime: firstVersion.mime,
        extension: firstVersion.extension,
        scan_status: 'ready',
      })
      .select('id')
      .single();
    if (secondVersionError || !secondVersion) {
      throw new Error(`second file version: ${secondVersionError?.message}`);
    }
    const { error: linkError } = await adminDb
      .from('product_version_files')
      .insert({
        product_version_id: product.versionId,
        file_version_id: secondVersion.id,
        included_in_zip: true,
        sort_order: 1,
      });
    if (linkError) throw new Error(`link second file: ${linkError.message}`);

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

    // ─── STEP 2: partial single-file delivery consumes NO attempt ─────
    const { data: sessionRow, error: sessionError } = await adminDb
      .from('download_sessions')
      .select('order_item_id')
      .eq('id', sessionId)
      .single();
    if (sessionError || !sessionRow) throw new Error(`session lookup: ${sessionError?.message}`);
    const orderItemId = sessionRow.order_item_id as string;

    const files = await versionFiles(product.versionId);
    expect(files).toHaveLength(2);

    const partial = await deliverSingle(sessionId, files[0], buyerCookies);
    expect(partial.status, JSON.stringify(partial.json)).toBe(200);
    expect(partial.json.sessionCompleted).toBe(false);
    expect(await attemptRows(orderItemId)).toHaveLength(0);

    // ─── STEP 3: create all 3 compensations BEFORE any session completes ───
    // create_compensation_session() rejects once any session for the code is
    // completed, so the sessions must be opened up front.
    const compensationIds: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const compensation = await apiRequest(
        'POST',
        `/api/admin/downloads/${sessionId}/compensate`,
        { reason: `تعويض رقم ${i}` },
        adminCookies,
      );
      expect(compensation.status, JSON.stringify(compensation.json)).toBe(200);
      expect(compensation.json.session_id).toBeTruthy();
      compensationIds.push(compensation.json.session_id as string);
    }

    const fourth = await apiRequest(
      'POST',
      `/api/admin/downloads/${sessionId}/compensate`,
      { reason: 'تعويض رابع' },
      adminCookies,
    );
    expect(fourth.status).toBe(409);
    expect(fourth.json.error).toContain('compensation_limit_reached');

    const { data: compensationSession } = await adminDb
      .from('download_sessions')
      .select('status, is_compensation, parent_session_id, compensation_request_id')
      .eq('id', compensationIds[0])
      .single();
    expect(compensationSession).toMatchObject({
      status: 'compensation_active',
      is_compensation: true,
      parent_session_id: null,
    });
    expect(compensationSession!.compensation_request_id).toBeTruthy();

    // ─── STEP 4: consume 3 REAL attempts across 3 sessions ─────────────
    const originalFinal = await deliverSingle(sessionId, files[1], buyerCookies);
    expect(originalFinal.status, JSON.stringify(originalFinal.json)).toBe(200);
    expect(originalFinal.json.sessionCompleted).toBe(true);
    expect(originalFinal.json.attemptNumber).toBe(1);

    for (let i = 0; i < 2; i++) {
      const delivery = await deliverZip(compensationIds[i], files, buyerCookies);
      expect(delivery.status, JSON.stringify(delivery.json)).toBe(200);
      expect(delivery.json.sessionCompleted).toBe(true);
      expect(delivery.json.attemptNumber).toBe(i + 2);
    }

    // The third compensation is still active, but the shared attempt counter is full.
    const exhausted = await apiRequest(
      'POST',
      `/api/download/${compensationIds[2]}/init`,
      { type: 'zip' },
      buyerCookies,
    );
    expect(exhausted.status).toBe(409);
    expect(exhausted.json.error).toBe('ATTEMPTS_EXHAUSTED');

    const attempts = await attemptRows(orderItemId);
    expect(attempts).toHaveLength(3);
    expect(attempts.map((attempt) => attempt.attempt_number)).toEqual([1, 2, 3]);
    expect(attempts.every((attempt) => attempt.completed)).toBe(true);
    expect(attempts.map((attempt) => attempt.type)).toEqual(['single_files', 'zip', 'zip']);
    expect(attempts[0].session_id).toBe(sessionId);
    expect(attempts.slice(1).map((attempt) => attempt.session_id).sort())
      .toEqual(compensationIds.slice(0, 2).sort());

    const stats = await apiRequest(
      'GET',
      `/api/download/${compensationIds[2]}`,
      undefined,
      buyerCookies,
    );
    expect(stats.status).toBe(200);
    expect(stats.json.attempts).toMatchObject({ max: 3, used: 3, remaining: 0 });

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

  test('internal completion rejects worker byte-count mismatches', async () => {
    const seller = await createSeller();
    const category = await createCategory();
    const product = await seedProductWithFiles({
      sellerId: seller.sellerId,
      categoryId: category.id,
      title: 'Byte Verification Product',
      price: 12,
    });
    const buyer = await createTestUser({
      accountType: 'buyer',
      email: `bytes-${Date.now()}@test.local`,
    });
    const buyerCookies = await getCookieHeader(buyer.email, buyer.password);

    const { requestId } = await seedPurchaseRequest({
      buyerId: buyer.id,
      buyerEmail: buyer.email,
      productId: product.id,
      versionId: product.versionId,
      price: 12,
    });
    const { codeId, plaintext } = await approveAndGetCode({
      requestId,
      buyerId: buyer.id,
    });
    await confirmCodeDelivery(codeId);

    const redeem = await apiRequest('POST', '/api/redeem', { code: plaintext }, buyerCookies);
    expect(redeem.status).toBe(200);
    const sessionId = redeem.json.session_id as string;

    const init = await apiRequest(
      'POST',
      `/api/download/${sessionId}/init`,
      { type: 'single', file_version_id: product.fileVersionIds[0] },
      buyerCookies
    );
    expect(init.status).toBe(200);
    const token = new URL(init.json.url).searchParams.get('token')!;
    expect(token).toBeTruthy();
    await claimDownloadToken(token);

    const [file] = await versionFiles(product.versionId);
    const badReceipt = await apiRequest(
      'POST',
      `/api/download/${sessionId}/complete`,
      {
        token,
        files: [{
          file_version_id: file.fileVersionId,
          bytes_sent: file.bytesSent + 1,
          checksum: file.checksum,
        }],
      },
      undefined,
      { 'x-internal-secret': process.env.DOWNLOAD_SERVICE_TOKEN! }
    );
    expect(badReceipt.status).toBe(400);
    expect(badReceipt.json.error).toBe('BYTE_COUNT_MISMATCH');

    const stats = await apiRequest('GET', `/api/download/${sessionId}`, undefined, buyerCookies);
    expect(stats.json.attempts.used).toBe(0);
  });
});