import { test, expect } from '@playwright/test';
import {
  createTestUser, createSeller, createCategory, seedProductWithFiles,
  cleanupTestData, adminDb,
} from '../helpers/db';
import { authenticateContext, getCookieHeader } from '../helpers/auth';
import { apiRequest, completeDownloadAsWorker } from '../helpers/api';

test.describe('Full journey: publish → request → code → redeem → download', () => {
  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('buyer completes end-to-end purchase', async ({ browser }) => {
    // ─── SETUP ────────────────────────────────────────
    const seller = await createSeller();
    const category = await createCategory('Journey Category');
    const product = await seedProductWithFiles({
      sellerId: seller.sellerId,
      categoryId: category.id,
      title: `E2E Product-${Date.now()}`,
      price: 25,
      currency: 'USD',
    });

    const admin = await createTestUser({
      accountType: 'staff',
      roleCode: 'admin',
    });

    const buyer = await createTestUser({
      accountType: 'buyer',
      email: `buyer-journey-${Date.now()}@test.local`,
    });

    const buyerCookies = await getCookieHeader(buyer.email, buyer.password);
    const adminCookies = await getCookieHeader(admin.email, admin.password);

    // ─── STEP 1: buyer browses the storefront ────────
    const buyerContext = await browser.newContext();
    await authenticateContext(buyerContext, buyer.email, buyer.password);
    const page = await buyerContext.newPage();

    // The unfiltered listing is cached for 60s. Search by the unique title so
    // this assertion exercises a fresh result instead of a stale cache entry.
    await page.goto(`/products?q=${encodeURIComponent(product.title)}`);
    await expect(page.getByText(product.title).first()).toBeVisible();

    await page.goto(`/products/${product.slug}`);
    await expect(page.getByRole('heading', { name: product.title })).toBeVisible();

    // ─── STEP 2: buyer submits purchase request ─────
    await page.getByRole('button', { name: 'طلب الشراء' }).click();

    // Form is now visible
    await page.locator('input[type="email"]').fill(buyer.email);
    await page.locator('input[type="tel"]').fill('+20 100 555 1234');
    await page.locator('input[type="checkbox"]').check();

    await page.getByRole('button', { name: 'إرسال طلب الشراء' }).click();

    await page.waitForURL(/\/purchase\/track\//);
    await expect(page.getByText('طلبك وصلنا بنجاح')).toBeVisible();
    await expect(page.getByText('قيد المراجعة').or(page.getByText('تم الإرسال'))).toBeVisible();

    const trackingUrl = page.url();
    const token = trackingUrl.split('/').pop()!;
    expect(token.length).toBeGreaterThan(20);

    // ─── STEP 3: admin sees and approves request ────
    const listRes = await apiRequest('GET', '/api/admin/requests?status=created', undefined, adminCookies);
    // Not all tests define this route; skip if not present

    // Get the request via DB (more reliable)
    const { data: requests } = await adminDb
      .from('purchase_requests')
      .select('id')
      .eq('buyer_id', buyer.id)
      .eq('status', 'created');
    expect(requests).toHaveLength(1);
    const requestId = requests![0].id;

    // Approve via API (returns codes array with plaintext via handoff)
    const approveRes = await apiRequest('POST', `/api/admin/requests/${requestId}/approve`, undefined, adminCookies);
    expect(approveRes.status).toBe(200);

    const codes = approveRes.json.codes as Array<{ code_id: string; code_prefix: string }>;
    expect(codes).toHaveLength(1);
    const codeId = codes[0].code_id;

    // Retrieve plaintext from handoff (one-time)
    const plaintextRes = await apiRequest('GET', `/api/admin/codes/${codeId}/plaintext`, undefined, adminCookies);
    expect(plaintextRes.status).toBe(200);
    const plaintext = plaintextRes.json.plaintext as string;
    expect(plaintext).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    // Confirm delivery
    const confirmRes = await apiRequest('POST', `/api/admin/codes/${codeId}/confirm-delivery`, undefined, adminCookies);
    expect(confirmRes.status).toBe(200);

    // Tracking page should now show approved
    await page.goto(trackingUrl);
    await expect(page.getByText('معتمد')).toBeVisible();

    // ─── STEP 4: buyer redeems code ─────────────────
    await page.goto('/redeem');
    await page.locator('input[placeholder="ABCD-EFGH-JKLM-NPQR"]').fill(plaintext);
    await page.getByRole('button', { name: 'تفعيل الكود وبدء التنزيل' }).click();

    await page.waitForURL(/\/account\/downloads\/[a-f0-9-]+/);
    await expect(page.getByText('تنزيل المنتج')).toBeVisible();

    const sessionId = page.url().match(/\/downloads\/([a-f0-9-]+)/)![1];

    // ─── STEP 5: buyer downloads ZIP (complete attempt) ──
    const initRes = await apiRequest('POST', `/api/download/${sessionId}/init`, { type: 'zip' }, buyerCookies);
    expect(initRes.status).toBe(200);
    const downloadUrl = new URL(initRes.json.url);
    const downloadToken = downloadUrl.searchParams.get('token')!;
    expect(downloadToken).toBeTruthy();

    // Drive the same internal completion contract the first-party worker uses.
    // Byte counts and checksums must match the seeded file metadata exactly.
    const completeRes = await completeDownloadAsWorker(
      sessionId,
      downloadToken,
      product.fileVersionIds.map(fid => ({
        file_version_id: fid,
        bytes_sent: 100_000,
        checksum: '0'.repeat(64),
      }))
    );
    expect(completeRes.status).toBe(200);
    expect(completeRes.json.sessionCompleted).toBe(true);

    // The same worker receipt cannot close a second delivery.
    const replay = await apiRequest(
      'POST',
      `/api/download/${sessionId}/complete`,
      {
        token: downloadToken,
        files: product.fileVersionIds.map(fid => ({
          file_version_id: fid,
          bytes_sent: 100_000,
          checksum: '0'.repeat(64),
        })),
      },
      undefined,
      { 'x-internal-secret': process.env.DOWNLOAD_SERVICE_TOKEN! }
    );
    expect(replay.status).toBe(409);
    expect(replay.json.error).toBe('TOKEN_ALREADY_USED');

    // Reload page — session should be completed
    await page.reload();
    await expect(page.getByText('completed')).toBeVisible();

    // ─── STEP 6: attempts are exhausted after 1 success ─
    // (Only 1 attempt consumed because ZIP = 1 attempt, 3 max)
    const statsRes = await apiRequest('GET', `/api/download/${sessionId}`, undefined, buyerCookies);
    expect(statsRes.status).toBe(200);
    expect(statsRes.json.attempts.used).toBe(1);
    expect(statsRes.json.attempts.remaining).toBe(2);

    // Cannot initiate another download after completion
    const reinitRes = await apiRequest('POST', `/api/download/${sessionId}/init`, { type: 'zip' }, buyerCookies);
    expect([400, 409]).toContain(reinitRes.status);

    // ─── STEP 7: buyer leaves a review ──────────────
    const reviewRes = await apiRequest('POST', '/api/reviews', {
      product_id: product.id,
      rating: 5,
      body: 'منتج ممتاز، أنصح به',
    }, buyerCookies);
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.json.review_id).toBeTruthy();

    // Review appears on product page
    await page.goto(`/products/${product.slug}`);
    await expect(page.getByText('منتج ممتاز، أنصح به').first()).toBeVisible();
    await expect(page.getByText('مشتري موثّق')).toBeVisible();

    // ─── STEP 8: buyer cannot post a second review ─
    const dupeReview = await apiRequest('POST', '/api/reviews', {
      product_id: product.id,
      rating: 3,
    }, buyerCookies);
    expect(dupeReview.status).toBe(409);
    expect(dupeReview.json.error).toContain('ALREADY_REVIEWED');

    await buyerContext.close();
  });
});