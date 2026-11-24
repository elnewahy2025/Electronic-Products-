import { test, expect } from '@playwright/test';
import { authenticator } from 'otplib';
import {
  createTestUser,
  createCategory,
  cleanupTestData,
  adminDb,
  TEST_MFA_SECRET,
} from '../helpers/db';
import { getCookieHeader } from '../helpers/auth';
import { apiRequest, completeDownloadAsWorker } from '../helpers/api';

async function loginThroughUi(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  expectMfa: boolean,
) {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'دخول', exact: true }).click();

  if (expectMfa) {
    await page.waitForURL(/\/verify-mfa/);
    const code = authenticator.generate(TEST_MFA_SECRET);
    await page.locator('input[inputmode="numeric"], input[type="text"], input[name="code"]').first().fill(code);
    await page.getByRole('button', { name: /تحقق|تأكيد|متابعة/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/verify-mfa') && !u.pathname.startsWith('/login'));
  } else {
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  }
}

test.describe('Full All-Roles Workflow: Admin -> Seller -> Buyer -> Purchase -> Download -> Review', () => {
  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('completes full lifecycle logging in as Super Admin, Seller, and Buyer', async ({ browser }) => {
    test.setTimeout(90_000);
    const ts = Date.now();

    // ─── 0. Seed actors (Super Admin with MFA, Pending Seller, Buyer) ─────────
    const superAdmin = await createTestUser({
      accountType: 'staff',
      roleCode: 'super_admin',
      email: `admin-flow-${ts}@test.local`,
      mfaEnabled: true,
    });

    const sellerUser = await createTestUser({
      accountType: 'seller',
      email: `seller-flow-${ts}@test.local`,
      mfaEnabled: false,
    });
    await adminDb.from('seller_profiles').upsert(
      {
        profile_id: sellerUser.id,
        display_name: `Workflow Seller ${ts}`,
        status: 'pending',
      },
      { onConflict: 'profile_id' },
    );

    const buyer = await createTestUser({
      accountType: 'buyer',
      email: `buyer-flow-${ts}@test.local`,
      mfaEnabled: false,
    });

    const category = await createCategory(`Workflow Category ${ts}`);

    // ─── 1. SUPER ADMIN: UI login + TOTP MFA -> /admin -> approve pending seller ──
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await loginThroughUi(adminPage, superAdmin.email, superAdmin.password, true);
    await adminPage.goto('/admin');
    await expect(adminPage).toHaveURL(/\/admin/);

    // Approve pending seller through the real admin API. No service-role
    // direct-update fallback: a broken approve_seller RPC must fail the test.
    const adminCookies = await getCookieHeader(superAdmin.email, superAdmin.password);
    const approveSellerRes = await apiRequest(
      'POST',
      `/api/admin/sellers/${sellerUser.id}/approve`,
      undefined,
      adminCookies,
    );
    expect(
      approveSellerRes.status,
      `approve_seller API failed: ${JSON.stringify(approveSellerRes.json)}`,
    ).toBe(200);
    expect(approveSellerRes.json.ok).toBe(true);

    const { data: spCheck } = await adminDb
      .from('seller_profiles')
      .select('status')
      .eq('profile_id', sellerUser.id)
      .single();
    expect(spCheck?.status).toBe('approved');
    await adminCtx.close();

    // ─── 2. SELLER: UI login -> /seller -> seed ready file -> create & publish product ──
    const sellerCtx = await browser.newContext();
    const sellerPage = await sellerCtx.newPage();
    await loginThroughUi(sellerPage, sellerUser.email, sellerUser.password, false);
    await sellerPage.goto('/seller');
    await expect(sellerPage).toHaveURL(/\/seller/);

    // Seed Drive account + scanned ready file (simulating completed Drive upload + scan)
    const { data: driveAcc } = await adminDb
      .from('seller_drive_accounts')
      .insert({
        seller_id: sellerUser.id,
        google_account_email: `drive-flow-${ts}@gmail.com`,
        encrypted_refresh_token: 'enc-workflow-token',
        status: 'active',
        is_default: true,
        quota_total: 15_000_000_000,
        quota_used: 0,
      })
      .select('id')
      .single();

    const { data: fileRow } = await adminDb
      .from('files')
      .insert({
        seller_id: sellerUser.id,
        original_name: 'complete-workflow-guide.pdf',
        display_name: 'دليل العمل الكامل.pdf',
        mime: 'application/pdf',
        extension: 'pdf',
      })
      .select('id')
      .single();

    const { data: storageLoc } = await adminDb
      .from('file_storage_locations')
      .insert({
        provider: 'google_drive',
        seller_drive_account_id: driveAcc!.id,
        provider_file_id: `wf_drive_file_${ts}`,
        status: 'active',
      })
      .select('id')
      .single();

    const fileChecksum = 'a'.repeat(64);
    const fileSizeBytes = 256_000;
    const { data: fvRow } = await adminDb
      .from('file_versions')
      .insert({
        file_id: fileRow!.id,
        version_number: 1,
        storage_location_id: storageLoc!.id,
        size_bytes: fileSizeBytes,
        checksum_sha256: fileChecksum,
        mime: 'application/pdf',
        extension: 'pdf',
        scan_status: 'ready',
      })
      .select('id')
      .single();

    // Seller creates & publishes product through real seller API
    const sellerCookies = await getCookieHeader(sellerUser.email, sellerUser.password);
    const productTitle = `Full Workflow Product ${ts}`;
    const createProdRes = await apiRequest(
      'POST',
      '/api/seller/products',
      {
        title: productTitle,
        short_description: 'منتج رقمي كامل للاختبار',
        description: 'وصف تفصيلي لمنتج اختبار دورة الشراء والتنزيل الكاملة.',
        price_amount: 30,
        price_currency: 'USD',
        category_id: category.id,
        file_version_ids: [fvRow!.id],
        publish_now: true,
      },
      sellerCookies,
    );
    expect(createProdRes.status).toBe(200);
    const createdProduct = createProdRes.json.product ?? createProdRes.json;
    const productId = createdProduct.id as string;
    const productSlug = createdProduct.slug as string;
    expect(productId).toBeTruthy();
    expect(productSlug).toBeTruthy();
    await sellerCtx.close();

    // ─── 3. BUYER: UI login -> browse product -> submit purchase request ─────────
    const buyerCtx = await browser.newContext();
    const buyerPage = await buyerCtx.newPage();
    await loginThroughUi(buyerPage, buyer.email, buyer.password, false);

    await buyerPage.goto(`/products?q=${encodeURIComponent(productTitle)}`);
    await expect(buyerPage.getByText(productTitle).first()).toBeVisible();

    await buyerPage.goto(`/products/${productSlug}`);
    await expect(buyerPage.getByRole('heading', { name: productTitle })).toBeVisible();

    await buyerPage.getByRole('button', { name: 'طلب الشراء' }).click();
    await buyerPage.locator('input[type="email"]').fill(buyer.email);
    await buyerPage.locator('input[type="tel"]').fill('+20 100 555 9876');
    await buyerPage.locator('input[type="checkbox"]').check();
    await buyerPage.getByRole('button', { name: 'إرسال طلب الشراء' }).click();

    await buyerPage.waitForURL(/\/purchase\/track\//);
    await expect(buyerPage.getByText('طلبك وصلنا بنجاح')).toBeVisible();
    const trackingUrl = buyerPage.url();

    // ─── 4. ADMIN: approve purchase request -> fetch one-time code -> confirm delivery ──
    const { data: reqRow } = await adminDb
      .from('purchase_requests')
      .select('id')
      .eq('buyer_id', buyer.id)
      .eq('status', 'created')
      .single();
    expect(reqRow?.id).toBeTruthy();

    const approveRes = await apiRequest(
      'POST',
      `/api/admin/requests/${reqRow!.id}/approve`,
      {
        amount: 30,
        currency: 'USD',
        reference: `TXN-WF-${ts}`,
        method: 'bank_transfer',
      },
      adminCookies,
    );
    expect(approveRes.status).toBe(200);
    const codeId = approveRes.json.codes[0].code_id as string;

    const plaintextRes = await apiRequest(
      'GET',
      `/api/admin/codes/${codeId}/plaintext`,
      undefined,
      adminCookies,
    );
    expect(plaintextRes.status).toBe(200);
    const plaintextCode = plaintextRes.json.plaintext as string;
    expect(plaintextCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const confirmDeliveryRes = await apiRequest(
      'POST',
      `/api/admin/codes/${codeId}/confirm-delivery`,
      undefined,
      adminCookies,
    );
    expect(confirmDeliveryRes.status).toBe(200);

    // Buyer sees approved status on tracking page
    await buyerPage.goto(trackingUrl);
    await expect(buyerPage.getByText('معتمد')).toBeVisible();

    // ─── 5. BUYER: redeem code via /redeem UI -> init & complete download ────────
    await buyerPage.goto('/redeem');
    await buyerPage.locator('input[placeholder="ABCD-EFGH-JKLM-NPQR"]').fill(plaintextCode);
    await buyerPage.getByRole('button', { name: 'تفعيل الكود وبدء التنزيل' }).click();

    await buyerPage.waitForURL(/\/account\/downloads\/[a-f0-9-]+/);
    await expect(buyerPage.getByText('تنزيل المنتج')).toBeVisible();
    const sessionId = buyerPage.url().match(/\/downloads\/([a-f0-9-]+)/)![1];

    const buyerCookies = await getCookieHeader(buyer.email, buyer.password);
    const initDlRes = await apiRequest(
      'POST',
      `/api/download/${sessionId}/init`,
      { type: 'zip' },
      buyerCookies,
    );
    expect(initDlRes.status).toBe(200);
    const dlUrl = new URL(initDlRes.json.url);
    const dlToken = dlUrl.searchParams.get('token')!;
    expect(dlToken).toBeTruthy();

    const completeRes = await completeDownloadAsWorker(sessionId, dlToken, [
      {
        file_version_id: fvRow!.id,
        bytes_sent: fileSizeBytes,
        checksum: fileChecksum,
      },
    ]);
    expect(completeRes.status).toBe(200);
    expect(completeRes.json.sessionCompleted).toBe(true);

    // Reload download page -> completed
    await buyerPage.reload();
    await expect(buyerPage.getByText('completed')).toBeVisible();

    // Verify attempts accounting
    const statsRes = await apiRequest('GET', `/api/download/${sessionId}`, undefined, buyerCookies);
    expect(statsRes.status).toBe(200);
    expect(statsRes.json.attempts.used).toBe(1);
    expect(statsRes.json.attempts.remaining).toBe(2);

    // ─── 6. BUYER: post verified review -> visible on product page ───────────────
    const reviewRes = await apiRequest(
      'POST',
      '/api/reviews',
      {
        product_id: productId,
        rating: 5,
        body: 'تجربة شراء وتنزيل ناجحة بالكامل!',
      },
      buyerCookies,
    );
    expect(reviewRes.status).toBe(200);

    await buyerPage.goto(`/products/${productSlug}`);
    await expect(buyerPage.getByText('تجربة شراء وتنزيل ناجحة بالكامل!').first()).toBeVisible();
    await expect(buyerPage.getByText('مشتري موثّق')).toBeVisible();

    await buyerCtx.close();
  });
});
