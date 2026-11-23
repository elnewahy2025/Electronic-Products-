import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';

export const SETTINGS_TABLES = {
  general: 'general_settings',
  pricing: 'pricing_settings',
  download: 'download_settings',
  compensation: 'compensation_settings',
  attempt_exception: 'attempt_exception_settings',
  watermark: 'watermark_settings',
  backup: 'backup_settings',
  audit: 'audit_settings',
  security: 'security_settings',
  payout: 'payout_settings',
  commission: 'commission_settings',
} as const;

export type SettingsTab = keyof typeof SETTINGS_TABLES;

export async function getSettings(tab: SettingsTab): Promise<Record<string, unknown>> {
  const db = await createClient();
  const { data } = await db.from(SETTINGS_TABLES[tab]).select('*').eq('id', 1).single();
  return (data ?? {}) as Record<string, unknown>;
}

export async function updateSettings(
  tab: SettingsTab,
  patch: Record<string, unknown>
): Promise<void> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');

  const table = SETTINGS_TABLES[tab];

  const { data: before } = await db.from(table).select('*').eq('id', 1).single();

  const { error } = await db
    .from(table)
    .update({ ...patch, updated_by: user.id })
    .eq('id', 1);

  if (error) throw new Error(error.message);

  await logAudit({
    action: 'settings.updated',
    entityType: table,
    entityId: '1',
    before,
    after: patch,
    required: true,
  });
}
