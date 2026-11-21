import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';

export type ReportRow = {
  id: string;
  reporter_id: string | null;
  entity_type: string;
  entity_id: string;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
};

export async function createReport(input: {
  entityType: 'product' | 'review' | 'seller';
  entityId: string;
  reason: string;
}): Promise<{ id: string }> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  if (!input.reason.trim() || input.reason.trim().length < 5) {
    throw new Error('reason_too_short');
  }

  const { data, error } = await db
    .from('content_reports')
    .insert({
      reporter_id: user?.id ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId,
      reason: input.reason.trim(),
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    action: 'report.created',
    entityType: 'content_reports',
    entityId: data.id,
    after: { for: input.entityType, target: input.entityId },
  });

  return { id: data.id };
}

export async function resolveReport(input: {
  reportId: string;
  resolution: 'resolved' | 'dismissed';
  note: string;
}): Promise<void> {
  const db = await createClient();
  const { error } = await db.rpc('resolve_report', {
    p_report_id: input.reportId,
    p_resolution: input.resolution,
    p_note: input.note,
  });
  if (error) throw new Error(error.message);
}