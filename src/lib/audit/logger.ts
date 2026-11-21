import 'server-only';
import { createClient } from '@/lib/supabase/server';

type AuditInput = {
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
};

/**
 * The ONLY sanctioned way to write audit_logs.
 * Calls the SECURITY DEFINER `log_audit` SQL function; direct inserts are blocked.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('log_audit', {
    p_action: input.action,
    p_entity_type: input.entityType ?? null,
    p_entity_id: input.entityId ?? null,
    p_before: input.before ?? null,
    p_after: input.after ?? null,
    p_reason: input.reason ?? null,
    p_ip: input.ip ?? null,
    p_user_agent: input.userAgent ?? null,
    p_request_id: input.requestId ?? null,
  });
  if (error) console.error('[audit] failed', error, input);
}