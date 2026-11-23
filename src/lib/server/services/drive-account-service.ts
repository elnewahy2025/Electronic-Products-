import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt, decrypt } from '@/lib/crypto/encryption';
import { getDriveQuota } from '@/lib/drive/client';
import { invalidateCachedDriveAccessToken } from '@/lib/drive/token-cache';
import { logAudit } from '@/lib/audit/logger';

export type LinkedDriveAccount = {
  id: string;
  google_account_email: string;
  status: 'active' | 'revoked' | 'quota_exceeded';
  quota_total: number | null;
  quota_used: number | null;
  is_default: boolean;
  last_checked_at: string | null;
};

export async function linkDriveAccount(params: {
  sellerId: string;
  googleEmail: string;
  refreshToken: string;
  scope: string;
}): Promise<{ id: string }> {
  const admin = createAdminClient();

  const encrypted = encrypt(params.refreshToken);

  const { data, error } = await admin
    .from('seller_drive_accounts')
    .upsert(
      {
        seller_id: params.sellerId,
        google_account_email: params.googleEmail,
        encrypted_refresh_token: encrypted,
        scopes: params.scope.split(' '),
        status: 'active',
      },
      { onConflict: 'seller_id,google_account_email' }
    )
    .select('id')
    .single();

  if (error || !data) throw new Error('DRIVE_LINK_FAILED');

  // Best-effort initial quota fetch
  try {
    const quota = await getDriveQuota(params.refreshToken);
    await admin.rpc('update_drive_quota', {
      p_account_id: data.id,
      p_total: quota.total,
      p_used: quota.used,
    });
  } catch {
    // Non-fatal; quota will be refreshed on next upload
  }

  await logAudit({
    action: 'seller.drive_linked',
    entityType: 'seller_drive_accounts',
    entityId: data.id,
    after: { google_email: params.googleEmail },
  });

  return { id: data.id };
}

export async function listDriveAccounts(sellerId: string): Promise<LinkedDriveAccount[]> {
  const db = await createClient();
  const { data } = await db
    .from('seller_drive_accounts_safe')
    .select('id, google_account_email, status, quota_total, quota_used, is_default, last_checked_at')
    .eq('seller_id', sellerId)
    .order('is_default', { ascending: false })
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    google_account_email: row.google_account_email,
    status: row.status,
    quota_total: row.quota_total === null ? null : Number(row.quota_total),
    quota_used: row.quota_used === null ? null : Number(row.quota_used),
    is_default: row.is_default,
    last_checked_at: row.last_checked_at,
  }));
}

export async function revokeDriveAccount(sellerId: string, accountId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: acc } = await admin
    .from('seller_drive_accounts')
    .select('id, seller_id, google_account_email')
    .eq('id', accountId)
    .maybeSingle();

  if (!acc || acc.seller_id !== sellerId) throw new Error('NOT_FOUND');

  // Refuse if this account has active files
  const { count } = await admin
    .from('file_storage_locations')
    .select('*', { count: 'exact', head: true })
    .eq('seller_drive_account_id', accountId)
    .eq('status', 'active');

  if ((count ?? 0) > 0) {
    throw new Error('DRIVE_HAS_ACTIVE_FILES');
  }

  await admin
    .from('seller_drive_accounts')
    .update({ status: 'revoked', encrypted_refresh_token: null })
    .eq('id', accountId);

  await invalidateCachedDriveAccessToken(accountId);

  await logAudit({
    action: 'seller.drive_revoked',
    entityType: 'seller_drive_accounts',
    entityId: accountId,
    before: { google_email: acc.google_account_email },
  });
}

export async function setDefaultDriveAccount(sellerId: string, accountId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: acc } = await admin
    .from('seller_drive_accounts')
    .select('id, seller_id, status, google_account_email')
    .eq('id', accountId)
    .maybeSingle();

  if (!acc || acc.seller_id !== sellerId) throw new Error('NOT_FOUND');
  if (acc.status !== 'active') throw new Error('DRIVE_ACCOUNT_NOT_ACTIVE');

  await admin
    .from('seller_drive_accounts')
    .update({ is_default: false })
    .eq('seller_id', sellerId)
    .eq('is_default', true);

  const { error } = await admin
    .from('seller_drive_accounts')
    .update({ is_default: true })
    .eq('id', accountId);

  if (error) throw new Error('DRIVE_DEFAULT_UPDATE_FAILED');

  await logAudit({
    action: 'seller.drive_default_changed',
    entityType: 'seller_drive_accounts',
    entityId: accountId,
    after: { google_email: acc.google_account_email },
  });
}

export async function refreshQuotaForAccount(accountId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: acc } = await admin
    .from('seller_drive_accounts')
    .select('encrypted_refresh_token')
    .eq('id', accountId)
    .single();

  if (!acc?.encrypted_refresh_token) return;
  const refreshToken = decrypt(acc.encrypted_refresh_token);
  const quota = await getDriveQuota(refreshToken);
  await admin.rpc('update_drive_quota', {
    p_account_id: accountId,
    p_total: quota.total,
    p_used: quota.used,
  });
}