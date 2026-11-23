import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createCipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';

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

/** Fixed TOTP secret enrolled for test users that require MFA. */
export const TEST_MFA_SECRET = 'JBSWY3DPEHPK3PXP';

function encryptMfaSecret(plain: string): string {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('Missing ENCRYPTION_KEY in .env.test');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(raw, 'base64'), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export type TestUser = {
  id: string;
  email: string;
  password: string;
};

let userCounter = 0;
const createdCategoryIds: string[] = [];
const createdUserIds: string[] = [];
const createdProductIds: string[] = [];

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
  createdUserIds.push(data.user.id);

  await adminDb.from('profiles').upsert({
    id: data.user.id,
    email,
    account_type: accountType,
    status: 'active',
    mfa_enabled: mfaEnabled,
    phone: opts.phone ?? '+201000000000',
    full_name: opts.fullName ?? 'Test User',
  });

  // Staff accounts are MFA-required even when mfa_enabled is false, so
  // enroll a known secret for every account that will face the challenge.
  if (mfaEnabled || accountType === 'staff') {
    await adminDb
      .from('profiles')
      .update({ mfa_secret_encrypted: encryptMfaSecret(TEST_MFA_SECRET) })
      .eq('id', data.user.id);
  }

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
  const unique = randomUUID().slice(0, 8);
  const n = name ?? `Cat-${Date.now()}-${unique}`;
  const slug = `${n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${unique}`;
  const { data, error } = await adminDb
    .from('categories')
    .insert({ name: n, slug, is_active: true })
    .select('id, name, slug')
    .single();
  if (error) throw new Error(error.message);
  createdCategoryIds.push(data!.id);
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
  // The DB has a global unique index on products.slug. Two seeds can land in
  // the same millisecond (or share an explicit title), so always add a
  // random suffix to the slug while keeping the caller's title unchanged.
  const unique = randomUUID().slice(0, 8);
  const title = opts.title ?? `Product-${Date.now()}-${unique}`;
  const slug = `${title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${unique}`;
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
  createdProductIds.push(product!.id);

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
  // Rate-limit rows are keyed by IP/user and survive user deletion. A fresh
  // run must not inherit failures from a previous one.
  await adminDb.from('redeem_attempts').delete().gte('id', 1);

  // Categories are not tied to a user, so track and remove them explicitly.
  if (createdCategoryIds.length > 0) {
    await adminDb.from('categories').delete().in('id', createdCategoryIds);
    createdCategoryIds.length = 0;
  }

  const { data: users } = await adminDb.auth.admin.listUsers();
  const allUserIds = (users?.users ?? []).map(u => u.id);
  const testUserIds = Array.from(new Set([
    ...createdUserIds,
    ...(users?.users ?? []).filter(u => u.email?.endsWith('@test.local')).map(u => u.id),
  ]));

  const requestIds = new Set<string>();
  const orderIds = new Set<string>();
  const orderItemIds = new Set<string>();
  const codeIds = new Set<string>();
  const sessionIds = new Set<string>();
  const productIds = new Set<string>(createdProductIds);
  const versionIds = new Set<string>();
  const fileIds = new Set<string>();
  const fileVersionIds = new Set<string>();

  const addIds = async (
    table: string, column: string, values: string[], sink: Set<string>
  ) => {
    if (values.length === 0) return;
    const { data } = await (adminDb as any).from(table).select('id').in(column, values);
    for (const row of data ?? []) sink.add(row.id);
  };

  const deleteIds = async (table: string, column: string, values: Iterable<string>) => {
    const ids = Array.from(values);
    if (ids.length === 0) return;
    await (adminDb as any).from(table).delete().in(column, ids);
  };

  // Gather everything first, then delete in dependency order. FKs on sold
  // items are RESTRICT, so a single out-of-order delete silently leaves rows
  // behind and the next run inherits stale rate limits and products.
  await addIds('purchase_requests', 'buyer_id', testUserIds, requestIds);
  {
    const { data } = await (adminDb as any)
      .from('purchase_requests').select('id').like('customer_email', '%@test.local');
    for (const row of data ?? []) requestIds.add(row.id);
  }

  await addIds('products', 'seller_id', testUserIds, productIds);
  if (allUserIds.length > 0) {
    // Clean up products orphaned by an earlier failed cleanup as well.
    const { data } = await (adminDb as any)
      .from('products').select('id').not('seller_id', 'in', allUserIds);
    for (const row of data ?? []) productIds.add(row.id);
  }

  await addIds('orders', 'buyer_id', testUserIds, orderIds);
  await addIds('orders', 'purchase_request_id', Array.from(requestIds), orderIds);
  await addIds('order_items', 'order_id', Array.from(orderIds), orderItemIds);
  await addIds('order_items', 'product_id', Array.from(productIds), orderItemIds);
  await addIds('purchase_codes', 'order_item_id', Array.from(orderItemIds), codeIds);
  await addIds('purchase_codes', 'issued_by', testUserIds, codeIds);
  await addIds('download_sessions', 'buyer_id', testUserIds, sessionIds);
  await addIds('download_sessions', 'code_id', Array.from(codeIds), sessionIds);
  await addIds('download_sessions', 'order_item_id', Array.from(orderItemIds), sessionIds);
  await addIds('product_versions', 'product_id', Array.from(productIds), versionIds);
  await addIds('files', 'seller_id', testUserIds, fileIds);
  await addIds('file_versions', 'file_id', Array.from(fileIds), fileVersionIds);
  await addIds(
    'product_version_files', 'product_version_id', Array.from(versionIds), fileVersionIds
  );

  const { data: ticketRefs } = await (adminDb as any)
    .from('support_tickets').select('id').in('owner_id', testUserIds);
  const ticketIds = (ticketRefs ?? []).map((t: any) => t.id as string);
  await deleteIds('support_messages', 'ticket_id', ticketIds);
  await deleteIds('support_tickets', 'id', ticketIds);

  await deleteIds('download_attempts', 'order_item_id', orderItemIds);
  await deleteIds('download_attempts', 'session_id', sessionIds);
  await deleteIds('download_deliveries', 'session_id', sessionIds);
  await deleteIds('download_tokens', 'session_id', sessionIds);
  await deleteIds('attempt_exception_requests', 'session_id', sessionIds);
  await deleteIds('attempt_exception_requests', 'code_id', codeIds);
  await deleteIds('compensation_requests', 'code_id', codeIds);
  await deleteIds('code_delivery_attempts', 'code_id', codeIds);
  await deleteIds('code_plaintext_handoff', 'code_id', codeIds);
  await deleteIds('code_redemptions', 'code_id', codeIds);
  await deleteIds('download_sessions', 'id', sessionIds);
  await deleteIds('purchase_codes', 'id', codeIds);

  await deleteIds('reviews', 'product_id', productIds);
  await deleteIds('reviews', 'order_item_id', orderItemIds);
  await deleteIds('payments', 'order_id', orderIds);
  await deleteIds('order_items', 'id', orderItemIds);
  await deleteIds('orders', 'id', orderIds);
  await deleteIds('purchase_request_items', 'purchase_request_id', requestIds);
  await deleteIds('purchase_request_items', 'product_id', productIds);
  await deleteIds('purchase_requests', 'id', requestIds);

  await deleteIds('product_version_files', 'product_version_id', versionIds);
  await deleteIds('file_previews', 'file_version_id', fileVersionIds);
  await deleteIds('file_versions', 'id', fileVersionIds);
  await deleteIds('files', 'id', fileIds);
  await deleteIds('product_versions', 'id', versionIds);
  await deleteIds('products', 'id', productIds);

  // seller_profiles has several RESTRICT children; remove them first.
  const { data: wallets } = await (adminDb as any)
    .from('seller_wallets').select('id').in('seller_id', testUserIds);
  const walletIds = (wallets ?? []).map((w: any) => w.id);
  await deleteIds('financial_transactions', 'wallet_id', walletIds);
  await deleteIds('seller_payouts', 'seller_id', testUserIds);
  await deleteIds('seller_drive_accounts', 'seller_id', testUserIds);
  await deleteIds('seller_commissions', 'seller_id', testUserIds);
  await deleteIds('seller_profiles', 'profile_id', testUserIds);
  await deleteIds('seller_wallets', 'seller_id', testUserIds);
  await deleteIds('store_members', 'profile_id', testUserIds);
  await deleteIds('mfa_enrollments', 'profile_id', testUserIds);
  await deleteIds('mfa_attempts', 'profile_id', testUserIds);

  // audit_logs.actor_id is ON DELETE SET NULL, but audit rows are append-only;
  // deleting a referenced profile would fire the append-only trigger.
  const { data: auditRefs } = await (adminDb as any)
    .from('audit_logs').select('actor_id').in('actor_id', testUserIds);
  const auditActors = new Set((auditRefs ?? []).map((a: any) => a.actor_id));
  await deleteIds(
    'profiles', 'id', testUserIds.filter(id => !auditActors.has(id))
  );

  for (const id of testUserIds) {
    await adminDb.auth.admin.deleteUser(id).catch(() => {});
  }

  createdUserIds.length = 0;
  createdProductIds.length = 0;
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