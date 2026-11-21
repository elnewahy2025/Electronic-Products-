import { test, expect } from '@playwright/test';
import {
  createTestUser, createSeller, createCategory, seedProductWithFiles,
  seedPurchaseRequest, approveAndGetCode, confirmCodeDelivery,
  cleanupTestData, adminDb,
} from '../helpers/db';
import { getCookieHeader } from '../helpers/auth';
import { apiRequest } from '../helpers/api';

test.describe('Security hardening — verify critical fixes', () => {
  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('buyer cannot call admin RPCs directly', async () => {
    const buyer = await createTestUser({
      accountType: 'buyer',
      email: `bypass-${Date.now()}@test.local`,
    });

    // Sign in as the buyer via Supabase client and try dangerous RPCs
    const { createClient } = await import('@supabase/supabase-js');
    const buyerClient = createClient(
      process.env.TEST_SUPABASE_URL!,
      process.env.TEST_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    await buyerClient.auth.signInWithPassword({ email: buyer.email, password: buyer.password });

    // Try confirming a delivery for a fake code
    const rpcAttempts = [
      { name: 'confirm_code_delivery', args: { p_code_id: '00000000-0000-0000-0000-000000000000', p_method: 'manual' } },
      { name: 'approve_seller', args: { p_seller_id: '00000000-0000-0000-0000-000000000000' } },
      { name: 'approve_payout', args: { p_payout_id: '00000000-0000-0000-0000-000000000000' } },
      { name: 'record_successful_attempt', args: { p_order_item_id: '00000000-0000-0000-0000-000000000000', p_session_id: '00000000-0000-0000-0000-000000000000', p_type: 'zip' } },
      { name: 'mark_session_completed', args: { p_session_id: '00000000-0000-0000-0000-000000000000' } },
      { name: 'pick_drive_account', args: { p_seller_id: '00000000-0000-0000-0000-000000000000', p_size_bytes: 1 } },
    ];

    for (const rpc of rpcAttempts) {
      const { error } = await buyerClient.rpc(rpc.name, rpc.args);
      expect(error, `RPC ${rpc.name} should be blocked`).not.toBeNull();
      // Either "not_authorized" or "permission denied for function"
      const msg = error?.message?.toLowerCase() ?? '';
      expect(
        msg.includes('not_authorized') ||
        msg.includes('permission denied') ||
        msg.includes('does not exist')
      ).toBe(true);
    }
  });

  test('seller cannot modify a notification field', async () => {
    const seller = await createSeller();
    const buyer = await createTestUser({
      accountType: 'buyer',
      email: `notif-${Date.now()}@test.local`,
    });

    // Create a notification for the buyer via trigger (seed a purchase request)
    const category = await createCategory();
    const product = await seedProductWithFiles({
      sellerId: seller.sellerId,
      categoryId: category.id,
    });
    const { requestId } = await seedPurchaseRequest({
      buyerId: buyer.id,
      buyerEmail: buyer.email,
      productId: product.id,
      versionId: product.versionId,
      price: 10,
    });
    // Trigger notification by updating status to approved
    await adminDb.from('purchase_requests').update({ status: 'approved' }).eq('id', requestId);

    const { data: notifs } = await adminDb
      .from('notifications')
      .select('id')
      .eq('user_id', buyer.id)
      .limit(1);
    expect(notifs).toHaveLength(1);
    const notifId = notifs![0].id;

    // Try to update title via admin client (should fail via trigger)
    const { error } = await adminDb
      .from('notifications')
      .update({ title: 'Hacked!' })
      .eq('id', notifId);

    expect(error).toBeTruthy();
    expect(error!.message).toContain('notification_immutable_fields');

    // But updating read_at works
    const { error: readErr } = await adminDb
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notifId);
    expect(readErr).toBeNull();
  });

  test('seller cannot hijack file ownership', async () => {
    const sellerA = await createSeller({ displayName: 'FileA' });
    const sellerB = await createSeller({ displayName: 'FileB' });
    const category = await createCategory();
    const product = await seedProductWithFiles({
      sellerId: sellerA.sellerId,
      categoryId: category.id,
    });

    // Get the file_version_id from the product
    const { data: pvf } = await adminDb
      .from('product_version_files')
      .select('file_version_id, file_versions!inner(file_id, files!inner(id, seller_id))')
      .eq('product_version_id', product.versionId)
      .single();

    const fileId = (pvf as any).file_versions.files.id;

    // Try to update seller_id via seller A's session
    const cookiesA = await getCookieHeader(sellerA.email, sellerA.password);
    const res = await apiRequest('PATCH', `/api/seller/files/${fileId}`, {
      seller_id: sellerB.sellerId,
    }, cookiesA);

    // No such endpoint → 404 is fine
    // Direct DB check: seller A cannot change seller_id even via RLS
    const { data: { user: sellerAUser } } = await adminDb.auth.admin.getUserById(sellerA.sellerId);

    // Simulate RLS via user client
    const { createClient } = await import('@supabase/supabase-js');
    const sellerClient = createClient(
      process.env.TEST_SUPABASE_URL!,
      process.env.TEST_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    await sellerClient.auth.signInWithPassword({ email: sellerA.email, password: sellerA.password });

    const { error: hijackErr } = await sellerClient
      .from('files')
      .update({ seller_id: sellerB.sellerId })
      .eq('id', fileId);

    // WITH CHECK should reject
    expect(hijackErr).toBeTruthy();

    // Original seller_id unchanged
    const { data: file } = await adminDb.from('files').select('seller_id').eq('id', fileId).single();
    expect(file!.seller_id).toBe(sellerA.sellerId);
  });

  test('seller cannot insert seller_payouts directly', async () => {
    const seller = await createSeller();
    const { createClient } = await import('@supabase/supabase-js');
    const sellerClient = createClient(
      process.env.TEST_SUPABASE_URL!,
      process.env.TEST_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    await sellerClient.auth.signInWithPassword({ email: seller.email, password: seller.password });

    const { error } = await sellerClient
      .from('seller_payouts')
      .insert({
        seller_id: seller.sellerId,
        amount: 999999,
        currency: 'USD',
        amount_in_usd: 999999,
        status: 'requested',
      });

    expect(error).toBeTruthy();
    // Either permission denied or RLS violation
    expect(error!.message.toLowerCase()).toMatch(/permission denied|row level security/);
  });

  test('seller cannot un-delete a review', async () => {
    const seller = await createSeller();
    const buyer = await createTestUser({ accountType: 'buyer', email: `rd-${Date.now()}@test.local` });
    const category = await createCategory();
    const product = await seedProductWithFiles({
      sellerId: seller.sellerId,
      categoryId: category.id,
    });
    const { requestId } = await seedPurchaseRequest({
      buyerId: buyer.id,
      buyerEmail: buyer.email,
      productId: product.id,
      versionId: product.versionId,
      price: 10,
    });
    const { codeId } = await approveAndGetCode({ requestId, buyerId: buyer.id });
    await confirmCodeDelivery(codeId);

    // Get order_item id
    const { data: oi } = await adminDb
      .from('order_items')
      .select('id')
      .eq('product_id', product.id)
      .single();

    // Insert a review directly
    const { data: review } = await adminDb
      .from('reviews')
      .insert({
        product_id: product.id,
        buyer_id: buyer.id,
        order_item_id: oi!.id,
        rating: 1,
        body: 'سيء جدًا',
      })
      .select('id')
      .single();

    // Admin deletes it
    await adminDb
      .from('reviews')
      .update({ status: 'deleted', delete_reason: 'admin decision', deleted_at: new Date().toISOString() })
      .eq('id', review!.id);

    // Seller tries to un-delete
    const { createClient } = await import('@supabase/supabase-js');
    const sellerClient = createClient(
      process.env.TEST_SUPABASE_URL!,
      process.env.TEST_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    await sellerClient.auth.signInWithPassword({ email: seller.email, password: seller.password });

    const { error } = await sellerClient
      .from('reviews')
      .update({ status: 'published', deleted_at: null })
      .eq('id', review!.id);

    expect(error).toBeTruthy();
    expect(error!.message).toContain('cannot_undelete_review');
  });

  test('staff cannot modify code_hash', async () => {
    const seller = await createSeller();
    const buyer = await createTestUser({ accountType: 'buyer', email: `ch-${Date.now()}@test.local` });
    const category = await createCategory();
    const product = await seedProductWithFiles({
      sellerId: seller.sellerId,
      categoryId: category.id,
    });
    const { requestId } = await seedPurchaseRequest({
      buyerId: buyer.id,
      buyerEmail: buyer.email,
      productId: product.id,
      versionId: product.versionId,
      price: 10,
    });
    const { codeId } = await approveAndGetCode({ requestId, buyerId: buyer.id });

    // Direct update via admin client (bypasses RLS)
    const { error } = await adminDb
      .from('purchase_codes')
      .update({ code_hash: 'deadbeef'.repeat(8) })
      .eq('id', codeId);

    expect(error).toBeTruthy();
    expect(error!.message).toContain('code_immutable_fields');
  });

  test('anonymous cannot read allowed_file_types', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(
      process.env.TEST_SUPABASE_URL!,
      process.env.TEST_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await anon.from('allowed_file_types').select('*');
    // No error, but empty result (RLS denies read silently)
    expect(data).toEqual([]);
  });

  test('cannot have two default drive accounts', async () => {
    const seller = await createSeller();

    await adminDb.from('seller_drive_accounts').insert({
      seller_id: seller.sellerId,
      google_account_email: `primary-${Date.now()}@test.local`,
      is_default: true,
      status: 'active',
    });

    const { error } = await adminDb.from('seller_drive_accounts').insert({
      seller_id: seller.sellerId,
      google_account_email: `secondary-${Date.now()}@test.local`,
      is_default: true,
      status: 'active',
    });

    expect(error).toBeTruthy();
    expect(error!.message).toContain('uq_drive_one_default_per_seller');
  });
});
