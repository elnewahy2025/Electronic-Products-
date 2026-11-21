-- ============================================================
-- 014_upload_and_quota.sql
-- Direct-to-Drive upload + quota management
-- ============================================================

-- Extend upload_sessions
ALTER TABLE upload_sessions
  ADD COLUMN IF NOT EXISTS drive_account_id uuid REFERENCES seller_drive_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_name text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS mime text,
  ADD COLUMN IF NOT EXISTS extension text,
  ADD COLUMN IF NOT EXISTS checksum_sha256 text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error text;

CREATE INDEX IF NOT EXISTS idx_upload_sessions_seller_status
  ON upload_sessions(seller_id, status);

-- Auto-clear the sensitive upload URL after completion
CREATE OR REPLACE FUNCTION clear_upload_url_on_complete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    NEW.provider_upload_url := NULL;
  END IF;
  IF NEW.status = 'aborted' OR NEW.status = 'expired' THEN
    NEW.provider_upload_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_upload_url ON upload_sessions;
CREATE TRIGGER trg_clear_upload_url
  BEFORE UPDATE ON upload_sessions
  FOR EACH ROW EXECUTE FUNCTION clear_upload_url_on_complete();

-- RLS: owner only (already exists from 011, reaffirm)
DROP POLICY IF EXISTS upload_sessions_owner ON upload_sessions;
CREATE POLICY upload_sessions_owner ON upload_sessions FOR ALL
  USING (seller_id = auth.uid() OR is_super_admin())
  WITH CHECK (seller_id = auth.uid() OR is_super_admin());

-- Safe view: never expose provider_upload_url
CREATE OR REPLACE VIEW upload_sessions_safe AS
SELECT id, seller_id, file_id, provider, drive_account_id,
       original_name, display_name, mime, extension,
       status, bytes_uploaded, total_bytes, expires_at, completed_at, created_at
FROM upload_sessions;

GRANT SELECT ON upload_sessions_safe TO authenticated;

-- Account selection for automatic distribution
CREATE OR REPLACE FUNCTION pick_drive_account(
  p_seller_id uuid,
  p_size_bytes bigint
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account_id uuid;
BEGIN
  SELECT id INTO v_account_id
  FROM seller_drive_accounts
  WHERE seller_id = p_seller_id
    AND status = 'active'
    AND (quota_total IS NULL OR (COALESCE(quota_total, 0) - COALESCE(quota_used, 0)) >= p_size_bytes)
  ORDER BY
    CASE WHEN is_default THEN 0 ELSE 1 END,
    priority ASC,
    (COALESCE(quota_total, 0) - COALESCE(quota_used, 0)) DESC NULLS LAST,
    created_at ASC
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'no_drive_account_available';
  END IF;
  RETURN v_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION pick_drive_account(uuid, bigint) TO authenticated, service_role;

-- Quota updater
CREATE OR REPLACE FUNCTION update_drive_quota(
  p_account_id uuid,
  p_total bigint,
  p_used bigint
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE seller_drive_accounts
    SET quota_total = p_total,
        quota_used = p_used,
        last_checked_at = now()
    WHERE id = p_account_id;

  -- Flip status based on remaining headroom
  IF p_total > 0 AND (p_total - p_used) < (p_total / 100) THEN
    UPDATE seller_drive_accounts SET status = 'quota_exceeded'
    WHERE id = p_account_id AND status = 'active';
  ELSIF p_total > 0 AND (p_total - p_used) >= (p_total / 20) THEN
    UPDATE seller_drive_accounts SET status = 'active'
    WHERE id = p_account_id AND status = 'quota_exceeded';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_drive_quota(uuid, bigint, bigint) TO service_role;