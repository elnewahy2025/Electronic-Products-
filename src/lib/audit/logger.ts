import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
  actorId?: string | null;
  /** Fail closed when the audit write fails (for critical privileged mutations). */
  required?: boolean;
};

/**
 * The ONLY sanctioned way to write audit_logs from application code.
 * Resolves the authenticated actor (if any) on the server and invokes the
 * service_role-only `log_audit` SQL function so browser clients cannot spoof
 * or spam audit entries directly via PostgREST.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  let actorId: string | null = input.actorId ?? null;
  if (actorId === null && input.actorId === undefined) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      actorId = user?.id ?? null;
    } catch {
      actorId = null;
    }
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc('log_audit', {
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_before: input.before as Json | undefined,
    p_after: input.after as Json | undefined,
    p_reason: input.reason,
    p_ip: input.ip,
    p_user_agent: input.userAgent,
    p_request_id: input.requestId,
    p_actor_id: actorId ?? undefined,
  });
  if (error) {
    const code = (error as { code?: string })?.code ?? 'AUDIT_WRITE_FAILED';
    console.error('[audit] failed', {
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      code,
    });
    if (input.required) throw new Error(code);
  }
}
