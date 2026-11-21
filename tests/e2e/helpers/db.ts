import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const SERVICE_ROLE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.TEST_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
  throw new Error('Missing TEST_SUPABASE_* env variables in .env.test');
}

export const adminDb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const anonDb: SupabaseClient = createClient(SUPABASE_URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Users ──────────────────────────────────────────────

const PASSWORD = 'Test-Password-123!';

export type TestUser = {
  id: string;
  email: string;
  password: string;
};

let userCounter = 0;

export async function createTestUser(opts: {
  email?: string;
  accountType?: 'buyer' | 'seller' | 'staff';
  roleCode?: 'super_admin' | 'admin' | 'staff';
  mfaEnabled?: boolean;
  phone?: string;
  fullName?: string;
}): Promise<TestUser> {
  userCounter++;
  const email = opts.email ?? `user-${userCounter}-${Date.now()}@test.local`;
  const accountType = opts.accountType ?? 'buyer';
  const mfaEnabled = opts.mfaEnabled ?? accountType === 'staff';

  const { data, error } = await adminDb.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: opts.fullName ?? 'Test User' },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);

  await adminDb.from('profiles').upsert({
    id: data.user.id,
    email,
    account_type: accountType,
    status: 'active',
    mfa_enabled: mfaEnabled,
    phone: opts.phone ?? '+201000000000',
    full_name: opts.fullName ?? 'Test User',
  });

  if (accountType === 'staff' && opts.roleCode) {
    const { data: role } = await adminDb.from('roles').select('id').eq('code', opts.roleCode).single();
    if (!role) throw new Error(`role ${opts.roleCode} not found`);
    await adminDb.from('store_members').upsert({
      profile_id: data.user.id,
      role_id: role.id,
      status: 'active',
    });
  }

  return { id: data.user.id, email, password: PASSWORD };
}

// ─── Sellers ────────────────────────────────────────────

export type TestSeller = TestUser & {
  sellerId: string;
  displayName: string;
};

export async function createSeller(opts?: {
  email?: string;
  displayName?: string;
}): Promise<TestSeller> {
  const user = await createTestUser({
    email: opts?.email,
    accountType: 'seller',
  });
  const displayName = opts?.displayName ?? `Seller-${userCounter}`;

  await adminDb.from('seller_profiles').upsert({
    profile_id: user.id,
    display_name: displayName,
    status: 'approved',
    agreement_accepted_at: new Date().toISOString(),
    agreement_version: '1.0',
  });

  // Ensure wallet exists
  await adminDb.from('seller_wallets').upsert(
    { seller_id: user.id, currency: 'USD', balance: 0 },
    { onConflict: 'seller_id,currency' }
  );

  return { ...user, sellerId: user.id, displayName };
}

// ─── Categories & Products ──────────────────────────────

export async function createCategory(name?: string): Promise<{ id: string; name: string; slug: string }> {
  const n = name ?? `Cat-${Date.now()}`;
  const slug = n.toLowerCase().replace(/\s+/g, '-');
  const { data, error } = await adminDb
    .from('categories')
    .insert({ name: n, slug, is_active: true })
    .select('id, name, slug')
    .single();
  if (error) throw new Error(error.message);
  return data!;
}

export type TestProduct = {
  id: string;
  slug: string;
  title: string;
  price: number;
  currency: string;
  versionId: string;
  fileVersionIds: string[];
};

/**
 * Create a fully-published product with a ready file + preview.
 * Bypasses Drive/scan/preview workers by seeding rows directly.
 */
export async function seedProductWithFiles(opts: {
  sellerId: string;
  categoryId: string;
  title?: string;
  price?: number;
  currency?: string;
  fileName?: string;
  fileExt?: 'pdf' | 'png' | 'jpg' | 'mp4';
  fileSize?: number;
}): Promise<TestProduct> {
  const title = opts.title ?? `Product-${Date.now()}`;
  const slug = title.toLowerCase().replace(/\s+/g, '-');
  const price = opts.price ?? 50;
  const currency = opts.currency ?? 'USD';
  const fileName = opts.fileName ?? 'test-file';
  const ext = opts.fileExt ?? 'pdf';
  const mime = mimeFor(ext);
  const size = opts.fileSize ?? 100_000;

  // 1. Product (draft)
  const { data: product, error: pErr } = await adminDb
    .from('products')
    .insert({
      seller_id: opts.sellerId,
      category_id: opts.categoryId,
      title,
      slug,
      short_description: 'Test product for E2E',
      price_amount: price,
      price_currency: currency,
      status: 'draft',
    })
    .select('id, slug')
    .single();
  if (pErr) throw new Error(`product: ${pErr.message}`);

  // 2. File + storage + file_version (ready)
  const { data: file } = await adminDb
    .from('files')
    .insert({
      seller_id: opts.sellerId,
      original_name: `${fileName}.${ext}`,
      display_name: fileName,
      mime,
      extension: ext,
    })
    .select('id')
    .single();

  const { data: storage } = await adminDb
    .from('file_storage_locations')
    .insert({
      provider: 'google_drive',
      provider_file_id: `fake-${file!.id}`,
      status: 'active',
    })
    .select('id')
    .single();

  const { data: fv } = await adminDb
    .from('file_versions')
    .insert({
      file_id: file!.id,
      version_number: 1,
      storage_location_id: storage!.id,
      size_bytes: size,
      checksum_sha256: '0'.repeat(64),
      mime,
      extension: ext,
      scan_status: 'ready',
    })
    .select('id')
    .single();

  // 3. Preview (ready)
  await adminDb.from('file_previews').insert({
    file_version_id: fv!.id,
    preview_type: 'image',
    status: 'ready',
    watermark_text: 'test — نسخة غير مرخصة',
    watermark_applied: true,
    storage_path: `previews/${fv!.id}.png`,
    public_url: `https://example.com/previews/${fv!.id}.png`,
  });

  // 4. Product version (published)
  const { data: version } = await adminDb
    .from('product_versions')
    .insert({
      product_id: product!.id,
      version_number: 1,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  await adminDb.from('product_version_files').insert({
    product_version_id: version!.id,
    file_version_id: fv!.id,
    included_in_zip: true,
  });

  // 5. Publish product
  await adminDb
    .from('products')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', product!.id);

  return {
    id: product!.id,
    slug: product!.slug,
    title,
    price,
    currency,
    versionId: version!.id,
    fileVersionIds: [fv!.id],
  };
}

// ─── Purchase requests & codes ──────────────────────────

export async function seedPurchaseRequest(opts: {
  buyerId: string;
  buyerEmail: string;
  productId: string;
  versionId: string;
  price: number;
  currency?: string;
}): Promise<{ requestId: string; orderItemId: string }> {
  const currency = opts.currency ?? 'USD';

  const { data: pr } = await adminDb
    .from('purchase_requests')
    .insert({
      buyer_id: opts.buyerId,
      customer_email: opts.buyerEmail,
      customer_phone: '+201000000000',
      status: 'created',
      total_amount: opts.price,
      currency,
      exchange_rate_at_purchase: 1,
      amount_in_usd: opts.price,
    })
    .select('id')
    .single();

  await adminDb.from('purchase_request_items').insert({
    purchase_request_id: pr!.id,
    product_id: opts.productId,
    product_version_id: opts.versionId,
    unit_price: opts.price,
    currency,
    quantity: 1,
  });

  return { requestId: pr!.id, orderItemId: '' };
}

/**
 * Full approve path via service_role (bypasses auth.uid() check in RPC).
 * Creates order + order_item + code, returns plaintext via handoff table.
 */
export async function approveAndGetCode(opts: {
  requestId: string;
  buyerId: string;
  plaintext?: string;
}): Promise<{
  codeId: string;
  orderItemId: string;
  plaintext: string;
}> {
  // Read request items
  const { data: req } = await adminDb
    .from('purchase_requests')
    .select('*, purchase_request_items(*)')
    .eq('id', opts.requestId)
    .single();

  const item = req!.purchase_request_items[0];

  const { data: order } = await adminDb
    .from('orders')
    .insert({
      purchase_request_id: opts.requestId,
      buyer_id: opts.buyerId,
      status: 'created',
      total_amount: req!.total_amount,
      currency: req!.currency,
      amount_in_usd: req!.amount_in_usd,
      exchange_rate_at_purchase: req!.exchange_rate_at_purchase,
    })
    .select('id')
    .single();

  const { data: orderItem } = await adminDb
    .from('order_items')
    .insert({
      order_id: order!.id,
      product_id: item.product_id,
      product_version_id: item.product_version_id,
      price: item.unit_price,
      currency: item.currency,
    })
    .select('id')
    .single();

  const plaintext = opts.plaintext ?? randomCode();
  const pepper = process.env.CODE_HASH_PEPPER!;
  const hash = createHmac('sha256', pepper).update(plaintext).digest('hex');

  const { data: code } = await adminDb
    .from('purchase_codes')
    .insert({
      order_item_id: orderItem!.id,
      code_hash: hash,
      code_prefix: plaintext.slice(0, 4),
      status: 'issued',
      expires_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
    })
    .select('id')
    .single();

  await adminDb
    .from('purchase_requests')
    .update({ status: 'approved' })
    .eq('id', opts.requestId);

  return {
    codeId: code!.id,
    orderItemId: orderItem!.id,
    plaintext,
  };
}

export async function confirmCodeDelivery(codeId: string): Promise<void> {
  await adminDb
    .from('purchase_codes')
    .update({
      delivered_at: new Date().toISOString(),
      delivery_confirmation_method: 'manual',
      status: 'delivered',
    })
    .eq('id', codeId);
}

// ─── Cleanup ────────────────────────────────────────────

/**
 * Delete test data created during a test. Identifies test users by
 * the `@test.local` email domain.
 */
export async function cleanupTestData(): Promise<void> {
  const { data: users } = await adminDb.auth.admin.listUsers();
  const testUserIds = (users?.users ?? [])
    .filter(u => u.email?.endsWith('@test.local'))
    .map(u => u.id);

  if (testUserIds.length === 0) return;

  // Delete in dependency order (FKs use RESTRICT on sold items)
  await adminDb.from('download_sessions').delete().in('buyer_id', testUserIds);
  await adminDb.from('purchase_codes').delete().in('issued_by', testUserIds);
  await adminDb.from('order_items').delete().in(
    'order_id',
    (await adminDb.from('orders').select('id').in('buyer_id', testUserIds)).data?.map(o => o.id) ?? []
  );
  await adminDb.from('orders').delete().in('buyer_id', testUserIds);
  await adminDb.from('purchase_request_items').delete().in(
    'purchase_request_id',
    (await adminDb.from('purchase_requests').select('id').in('buyer_id', testUserIds)).data?.map(p => p.id) ?? []
  );
  await adminDb.from('purchase_requests').delete().in('buyer_id', testUserIds);

  await adminDb.from('product_version_files').delete().in(
    'product_version_id',
    (await adminDb.from('product_versions').select('id').in(
      'product_id',
      (await adminDb.from('products').select('id').in('seller_id', testUserIds)).data?.map(p => p.id) ?? []
    )).data?.map(v => v.id) ?? []
  );
  await adminDb.from('product_versions').delete().in(
    'product_id',
    (await adminDb.from('products').select('id').in('seller_id', testUserIds)).data?.map(p => p.id) ?? []
  );
  await adminDb.from('file_previews').delete().in(
    'file_version_id',
    (await adminDb.from('file_versions').select('id').in(
      'file_id',
      (await adminDb.from('files').select('id').in('seller_id', testUserIds)).data?.map(f => f.id) ?? []
    )).data?.map(v => v.id) ?? []
  );
  await adminDb.from('file_versions').delete().in(
    'file_id',
    (await adminDb.from('files').select('id').in('seller_id', testUserIds)).data?.map(f => f.id) ?? []
  );
  await adminDb.from('file_storage_locations').delete().in('provider_file_id', []);
  await adminDb.from('files').delete().in('seller_id', testUserIds);
  await adminDb.from('products').delete().in('seller_id', testUserIds);
  await adminDb.from('seller_profiles').delete().in('profile_id', testUserIds);
  await adminDb.from('seller_wallets').delete().in('seller_id', testUserIds);
  await adminDb.from('profiles').delete().in('id', testUserIds);

  for (const id of testUserIds) {
    await adminDb.auth.admin.deleteUser(id).catch(() => {});
  }
}

// ─── Utils ──────────────────────────────────────────────

function mimeFor(ext: string): string {
  return ({
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    mp4: 'video/mp4',
  } as Record<string, string>)[ext] ?? 'application/octet-stream';
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomCode(): string {
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (i === 3 || i === 7 || i === 11) out += '-';
  }
  return out;
}