import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/types/database';

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
  /** Fail closed when the audit write fails (for critical privileged mutations). */
  required?: boolean;
};

/**
 * The ONLY sanctioned way to write audit_logs.
 * Calls the SECURITY DEFINER `log_audit` SQL function; direct inserts are blocked.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('log_audit', {
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_before: input.before as Json | undefined,
    p_after: input.after as Json | undefined,
    p_reason: input.reason,
    p_ip: input.ip,
    p_user_agent: input.userAgent,
    p_request_id: input.requestId,
  });
  if (error) {
    const code = (error as any)?.code ?? 'AUDIT_WRITE_FAILED';
    console.error('[audit] failed', {
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      code,
    });
    if (input.required) throw new Error(code);
  }
}