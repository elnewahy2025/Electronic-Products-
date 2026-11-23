import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAttemptState, recordSuccessfulAttempt, AttemptType } from './attempt-service';
import { createDownloadToken } from '@/lib/crypto/download-token';
import { logAudit } from '@/lib/audit/logger';

export type SessionInfo = {
  id: string;
  code_id: string;
  order_item_id: string;
  product_version_id: string;
  buyer_id: string | null;
  status: string;
  started_at: string;
  expires_at: string;
  is_compensation: boolean;
};

export type FileStatus = {
  file_version_id: string;
  display_name: string;
  size_bytes: number;
  mime: string | null;
  included_in_zip: boolean;
  delivered: boolean;
};

/**
 * Fetch session + files + delivery status.
 * Enforces ownership and expiry (auto-expires on read).
 */
export async function getSessionWithFiles(sessionId: string): Promise<{
  session: SessionInfo;
  files: FileStatus[];
  attempts: { max: number; used: number; remaining: number };
}> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');

  const { data: session, error: se } = await db
    .from('download_sessions')
    .select('id, code_id, order_item_id, product_version_id, buyer_id, status, started_at, expires_at, is_compensation')
    .eq('id', sessionId)
    .single();

  if (se || !session) throw new Error('SESSION_NOT_FOUND');

  // Auto-expire on read
  const expired = new Date(session.expires_at).getTime() < Date.now();
  if (expired && ['active', 'compensation_active'].includes(session.status)) {
    const admin = createAdminClient();
    await admin.rpc('expire_partial_session', { p_session_id: sessionId });
    throw new Error('SESSION_EXPIRED');
  }

  // Files + their delivered status in this session
  const { data: fileRows } = await db
    .from('product_version_files')
    .select(`
      file_version_id, display_name, sort_order, included_in_zip,
      file_versions!inner(size_bytes, mime)
    `)
    .eq('product_version_id', session.product_version_id)
    .order('sort_order', { ascending: true });

  const { data: deliveries } = await db
    .from('download_deliveries')
    .select('file_version_id')
    .eq('session_id', sessionId)
    .eq('completed', true);

  const deliveredSet = new Set((deliveries ?? []).map(d => d.file_version_id));

  const files: FileStatus[] = (fileRows ?? []).map((row: any) => ({
    file_version_id: row.file_version_id,
    display_name: row.display_name ?? row.file_versions?.original_name ?? '',
    size_bytes: Number(row.file_versions?.size_bytes ?? 0),
    mime: row.file_versions?.mime ?? null,
    included_in_zip: !!row.included_in_zip,
    delivered: deliveredSet.has(row.file_version_id),
  }));

  const attempts = await getAttemptState(session.order_item_id);

  return {
    session: session as SessionInfo,
    files,
    attempts,
  };
}

/**
 * Issue a signed token + download URL.
 * Does NOT consume an attempt — attempt is consumed on successful completion.
 */
export async function initiateDownload(params: {
  sessionId: string;
  type: AttemptType | 'single';
  fileVersionId?: string;
}): Promise<{ url: string; expiresAt: string }> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');

  const { data: session } = await db
    .from('download_sessions')
    .select('id, order_item_id, product_version_id, status, expires_at')
    .eq('id', params.sessionId)
    .single();

  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (!['active', 'compensation_active'].includes(session.status)) {
    throw new Error('SESSION_NOT_ACTIVE');
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    throw new Error('SESSION_EXPIRED');
  }

  const attempts = await getAttemptState(session.order_item_id);
  if (attempts.remaining <= 0) {
    throw new Error('ATTEMPTS_EXHAUSTED');
  }

  // Validate that the requested file belongs to this product version
  if (params.type === 'single') {
    if (!params.fileVersionId) throw new Error('FILE_REQUIRED');
    const { data: pvf } = await db
      .from('product_version_files')
      .select('file_version_id')
      .eq('product_version_id', session.product_version_id)
      .eq('file_version_id', params.fileVersionId)
      .maybeSingle();
    if (!pvf) throw new Error('FILE_NOT_IN_SESSION');

    const { data: existing } = await db
      .from('download_deliveries')
      .select('id')
      .eq('session_id', params.sessionId)
      .eq('file_version_id', params.fileVersionId)
      .eq('completed', true)
      .maybeSingle();
    if (existing) throw new Error('FILE_ALREADY_DELIVERED');
  }

  const token = createDownloadToken({
    sid: params.sessionId,
    fid: params.fileVersionId,
    typ: params.type === 'zip' ? 'zip' : 'single',
    ttlSec: 15 * 60,
  });

  const base = process.env.DOWNLOAD_SERVICE_URL;
  if (!base) throw new Error('DOWNLOAD_SERVICE_URL_NOT_SET');

  return {
    url: `${base}/stream?token=${encodeURIComponent(token)}`,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

/**
 * Called by download service (webhook) after successful transmission.
 * Records deliveries, then consumes attempt if the session is now complete.
 */
export async function recordCompletion(params: {
  sessionId: string;
  type: AttemptType;
  files: Array<{ fileVersionId: string; bytesSent: number; checksum?: string }>;
}): Promise<{ sessionCompleted: boolean; attemptNumber?: number }> {
  const admin = createAdminClient();

  const { data: session } = await admin
    .from('download_sessions')
    .select('id, order_item_id, status, expires_at')
    .eq('id', params.sessionId)
    .single();

  if (!session) throw new Error('SESSION_NOT_FOUND');

  // Insert deliveries. The unique constraint on (session_id, file_version_id)
  // is partial (completed = true), which PostgREST cannot express as an
  // ON CONFLICT target, so check first and ignore a duplicate-key race.
  for (const f of params.files) {
    const { data: existing } = await admin
      .from('download_deliveries')
      .select('id')
      .eq('session_id', params.sessionId)
      .eq('file_version_id', f.fileVersionId)
      .eq('completed', true)
      .maybeSingle();
    if (existing) continue;

    const { error: deliveryError } = await admin
      .from('download_deliveries')
      .insert({
        session_id: params.sessionId,
        file_version_id: f.fileVersionId,
        delivery_type: params.type === 'zip' ? 'zip' : 'single',
        bytes_sent: f.bytesSent,
        checksum: f.checksum ?? null,
        completed: true,
        delivered_at: new Date().toISOString(),
      });
    if (deliveryError && !deliveryError.message.includes('duplicate key')) {
      throw new Error(deliveryError.message);
    }
  }

  // Is the session now fully delivered?
  const { data: fullyDelivered } = await admin.rpc('is_session_fully_delivered', {
    p_session_id: params.sessionId,
  });

  if (!fullyDelivered) {
    return { sessionCompleted: false };
  }

  // Consume one attempt atomically (idempotent per session)
  let attemptNumber: number | undefined;
  try {
    attemptNumber = await recordSuccessfulAttempt({
      orderItemId: session.order_item_id,
      sessionId: params.sessionId,
      type: params.type,
    });
    await admin.rpc('mark_session_completed', { p_session_id: params.sessionId });
  } catch (e: any) {
    if (e.message?.includes('attempts_exhausted')) {
      // Session delivered but no attempt available? Shouldn't happen because
      // we checked before initiating. Log and mark exhausted.
      await admin
        .from('download_sessions')
        .update({ status: 'exhausted', ended_at: new Date().toISOString() })
        .eq('id', params.sessionId);
      throw new Error('ATTEMPTS_EXHAUSTED');
    }
    throw e;
  }

  return { sessionCompleted: true, attemptNumber };
}