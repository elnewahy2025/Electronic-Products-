import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type AttemptType = 'zip' | 'single_files';

export type AttemptState = {
  max: number;
  used: number;
  remaining: number;
};

export async function getAttemptState(orderItemId: string): Promise<AttemptState> {
  const db = await createClient();

  const [{ data: settings }, { count }] = await Promise.all([
    db.from('download_settings').select('max_attempts_per_product').eq('id', 1).single(),
    db
      .from('download_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('order_item_id', orderItemId)
      .eq('completed', true),
  ]);

  const max = settings?.max_attempts_per_product ?? 3;
  const used = count ?? 0;
  return { max, used, remaining: Math.max(0, max - used) };
}

/**
 * Records a successful attempt via SECURITY DEFINER function (atomic).
 * Idempotent per session.
 * Throws 'attempts_exhausted' if the limit is already reached.
 */
export async function recordSuccessfulAttempt(params: {
  orderItemId: string;
  sessionId: string;
  type: AttemptType;
}): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('record_successful_attempt', {
    p_order_item_id: params.orderItemId,
    p_session_id: params.sessionId,
    p_type: params.type,
  });
  if (error) throw new Error(error.message);
  return data as number;
}