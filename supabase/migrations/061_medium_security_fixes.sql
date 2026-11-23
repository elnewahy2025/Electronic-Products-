-- ============================================================
-- 061_medium_security_fixes.sql
-- Medium findings #7, #9, #10, #12 and backup verification evidence (#14)
-- ============================================================

-- ------------------------------------------------------------
-- #7 — support_messages.sender_id must equal auth.uid()
-- ------------------------------------------------------------
DROP POLICY IF EXISTS support_msgs_insert ON public.support_messages;
CREATE POLICY support_msgs_insert ON public.support_messages FOR INSERT
  WITH CHECK (
    support_messages.sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (t.owner_id = auth.uid() OR staff_has('support.read') OR is_admin_or_above())
    )
    AND (
      support_messages.is_internal = false
      OR staff_has('support.read')
      OR is_admin_or_above()
    )
  );

-- Defense in depth for any future non-PostgREST writer. service_role/SECURITY
-- DEFINER maintenance paths are exempt, matching the 058 pattern.
CREATE OR REPLACE FUNCTION public.guard_support_message_sender() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin')
     OR current_setting('role', true) = 'service_role'
  THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_id IS NULL OR NEW.sender_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'support_sender_mismatch';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_messages_sender_guard ON public.support_messages;
CREATE TRIGGER trg_support_messages_sender_guard
  BEFORE INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_support_message_sender();

-- ------------------------------------------------------------
-- #9 — Persist payment approval attestation atomically
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_request_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id uuid NOT NULL UNIQUE
    REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  attested_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  attested_at timestamptz NOT NULL DEFAULT now(),
  amount numeric(18,4) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL,
  reference text NOT NULL CHECK (length(btrim(reference)) >= 3),
  method text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_request_attestations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_request_attestations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.purchase_request_attestations TO service_role;

-- The legacy 2-argument RPC must never silently approve again.
CREATE OR REPLACE FUNCTION public.approve_purchase_request(
  p_request_id uuid, p_pepper text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  RAISE EXCEPTION 'attestation_required';
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_purchase_request(
  p_request_id uuid,
  p_pepper text,
  p_attestation jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_req purchase_requests%ROWTYPE;
  v_order_id uuid;
  v_item record;
  v_code_id uuid; v_code text; v_hash text; v_prefix char(4);
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_attempt int;
  v_output jsonb := '[]'::jsonb;
  v_seller_id uuid;
  v_category_id uuid;
  v_comm_rate numeric;
  v_comm_amount numeric;
  v_net_amount numeric;
  v_amount numeric;
  v_currency text;
  v_reference text;
  v_method text;
  v_attestation_id uuid;
BEGIN
  IF NOT (is_admin_or_above() OR staff_has('code.issue')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_pepper IS NULL OR length(p_pepper) < 8 THEN
    RAISE EXCEPTION 'pepper_required';
  END IF;
  IF p_attestation IS NULL OR jsonb_typeof(p_attestation) <> 'object' THEN
    RAISE EXCEPTION 'attestation_required';
  END IF;

  IF (p_attestation->>'amount') !~ '^[0-9]+(\.[0-9]{1,4})?$' THEN
    RAISE EXCEPTION 'attestation_invalid';
  END IF;
  v_amount := (p_attestation->>'amount')::numeric;
  v_currency := upper(btrim(COALESCE(p_attestation->>'currency', '')));
  v_reference := btrim(COALESCE(p_attestation->>'reference', ''));
  v_method := nullif(btrim(COALESCE(p_attestation->>'method', '')), '');

  IF v_amount <= 0 OR v_currency !~ '^[A-Z]{3}$'
     OR length(v_reference) < 3 OR length(v_reference) > 200
     OR (v_method IS NOT NULL AND length(v_method) > 50)
  THEN
    RAISE EXCEPTION 'attestation_invalid';
  END IF;

  SELECT * INTO v_req FROM purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase_request_not_found'; END IF;
  IF v_req.status NOT IN ('created','pending') THEN RAISE EXCEPTION 'purchase_request_not_approvable'; END IF;

  IF v_amount <> v_req.total_amount OR v_currency <> upper(btrim(v_req.currency::text)) THEN
    RAISE EXCEPTION 'payment_attestation_mismatch';
  END IF;

  -- Approval itself is the settlement attestation. It is written before any
  -- order/code/wallet side effect and rolls back with them on any failure.
  INSERT INTO purchase_request_attestations(
    purchase_request_id, attested_by, attested_at, amount, currency, reference, method
  ) VALUES (
    p_request_id, auth.uid(), now(), v_amount, v_currency, v_reference, v_method
  ) RETURNING id INTO v_attestation_id;

  INSERT INTO orders(purchase_request_id, buyer_id, status,
    total_amount, currency, amount_in_usd, exchange_rate_at_purchase)
  VALUES (v_req.id, v_req.buyer_id, 'created',
    v_req.total_amount, v_req.currency, v_req.amount_in_usd, v_req.exchange_rate_at_purchase)
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT id, product_id, product_version_id, unit_price, currency, quantity
    FROM purchase_request_items WHERE purchase_request_id = p_request_id
  LOOP
    IF v_item.product_version_id IS NULL THEN RAISE EXCEPTION 'product_version_required'; END IF;

    SELECT p.seller_id, p.category_id
      INTO v_seller_id, v_category_id
      FROM products p WHERE p.id = v_item.product_id;

    v_comm_rate := resolve_effective_commission_rate(v_seller_id, v_category_id);
    v_comm_amount := ROUND(v_item.unit_price * v_comm_rate, 4);
    v_net_amount := ROUND(v_item.unit_price - v_comm_amount, 4);

    DECLARE v_order_item_id uuid;
    BEGIN
      INSERT INTO order_items(
        order_id, product_id, product_version_id, price, currency,
        commission_rate_at_sale, commission_amount, net_seller_amount
      ) VALUES (
        v_order_id, v_item.product_id, v_item.product_version_id, v_item.unit_price, v_item.currency,
        v_comm_rate, v_comm_amount, v_net_amount
      ) RETURNING id INTO v_order_item_id;

      PERFORM credit_seller_wallet_for_order_item(
        v_order_item_id, v_seller_id, v_item.unit_price, v_comm_amount, v_net_amount, v_item.currency
      );

      v_attempt := 0;
      LOOP
        v_attempt := v_attempt + 1;
        IF v_attempt > 10 THEN RAISE EXCEPTION 'code_generation_failed'; END IF;
        v_code := '';
        FOR i IN 1..16 LOOP
          v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
          IF i IN (4,8,12) THEN v_code := v_code || '-'; END IF;
        END LOOP;
        v_hash := encode(hmac(v_code, p_pepper, 'sha256'), 'hex');
        v_prefix := substring(v_code from 1 for 4);
        BEGIN
          INSERT INTO purchase_codes(order_item_id, code_hash, code_prefix, status,
            issued_by, issued_at, expires_at)
          VALUES (v_order_item_id, v_hash, v_prefix, 'issued',
            auth.uid(), now(), now() + interval '72 hours')
          RETURNING id INTO v_code_id;
          EXIT;
        EXCEPTION WHEN unique_violation THEN CONTINUE;
        END;
      END LOOP;

      INSERT INTO code_plaintext_handoff(code_id, plaintext, expires_at)
        VALUES (v_code_id, v_code, now() + interval '10 minutes');

      v_output := v_output || jsonb_build_object(
        'code_id', v_code_id, 'order_item_id', v_order_item_id,
        'code_prefix', v_prefix, 'product_id', v_item.product_id,
        'commission_rate', v_comm_rate, 'net_seller_amount', v_net_amount
      );
    END;
  END LOOP;

  UPDATE purchase_requests SET status = 'approved' WHERE id = p_request_id;

  PERFORM log_audit('purchase_request.approved', 'purchase_requests', p_request_id,
    jsonb_build_object('status', v_req.status),
    jsonb_build_object(
      'status', 'approved',
      'order_id', v_order_id,
      'attestation_id', v_attestation_id,
      'amount', v_amount,
      'currency', v_currency,
      'reference', v_reference,
      'method', v_method,
      'attested_by', auth.uid(),
      'attested_at', now()
    ), NULL);

  RETURN v_output;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_purchase_request(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_purchase_request(uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_purchase_request(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_purchase_request(uuid, text, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------
-- #12 — Atomic Drive-file registration used by upload + import
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.file_storage_locations
    WHERE provider_file_id IS NOT NULL AND status = 'active'
    GROUP BY provider, seller_drive_account_id, provider_file_id
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_file_storage_active_provider_file
      ON public.file_storage_locations (provider, seller_drive_account_id, provider_file_id)
      WHERE status = 'active' AND provider_file_id IS NOT NULL;
  ELSE
    RAISE NOTICE 'Skipped uq_file_storage_active_provider_file: existing duplicates found';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.register_drive_file(
  p_seller_id uuid,
  p_drive_account_id uuid,
  p_provider_file_id text,
  p_original_name text,
  p_mime text,
  p_extension text,
  p_size_bytes bigint,
  p_checksum text,
  p_audit_action text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_file_id uuid;
  v_storage_id uuid;
  v_version_id uuid;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
     AND current_setting('role', true) <> 'service_role'
  THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'not_authenticated';
    END IF;
    IF auth.uid() <> p_seller_id AND NOT is_admin_or_above() THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;
  IF p_provider_file_id IS NULL OR length(btrim(p_provider_file_id)) = 0 THEN
    RAISE EXCEPTION 'provider_file_required';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 THEN
    RAISE EXCEPTION 'invalid_file_size';
  END IF;
  IF p_mime IS NULL OR p_extension IS NULL THEN
    RAISE EXCEPTION 'file_type_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.seller_drive_accounts a
    WHERE a.id = p_drive_account_id AND a.seller_id = p_seller_id
  ) THEN
    RAISE EXCEPTION 'drive_account_not_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.allowed_file_types a
    WHERE a.extension = p_extension AND a.mime = p_mime AND a.is_enabled = true
      AND (a.max_size_bytes IS NULL OR p_size_bytes <= a.max_size_bytes)
  ) THEN
    RAISE EXCEPTION 'file_type_not_allowed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.file_storage_locations fsl
    WHERE fsl.provider = 'google_drive'
      AND fsl.seller_drive_account_id IS NOT DISTINCT FROM p_drive_account_id
      AND fsl.provider_file_id = p_provider_file_id
      AND fsl.status = 'active'
  ) THEN
    RAISE EXCEPTION 'duplicate_provider_file';
  END IF;

  INSERT INTO public.files(seller_id, original_name, display_name, mime, extension)
  VALUES (p_seller_id, p_original_name, p_original_name, p_mime, p_extension)
  RETURNING id INTO v_file_id;

  INSERT INTO public.file_storage_locations(
    provider, seller_drive_account_id, provider_file_id, status
  ) VALUES ('google_drive', p_drive_account_id, p_provider_file_id, 'active')
  RETURNING id INTO v_storage_id;

  INSERT INTO public.file_versions(
    file_id, version_number, storage_location_id, size_bytes, checksum_sha256,
    mime, extension, scan_status
  ) VALUES (
    v_file_id, 1, v_storage_id, p_size_bytes, p_checksum,
    p_mime, p_extension, 'uploaded'
  ) RETURNING id INTO v_version_id;

  INSERT INTO public.scan_jobs(file_version_id, status, engine)
  VALUES (v_version_id, 'queued', 'pending');

  PERFORM public.log_audit(
    p_audit_action, 'file_versions', v_version_id, NULL,
    jsonb_build_object(
      'file_id', v_file_id,
      'drive_file_id', p_provider_file_id,
      'size', p_size_bytes,
      'mime', p_mime
    ), NULL
  );

  RETURN jsonb_build_object(
    'file_id', v_file_id,
    'file_version_id', v_version_id,
    'fileId', v_file_id,
    'fileVersionId', v_version_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_upload_session(
  p_session_id uuid,
  p_provider_file_id text,
  p_size_bytes bigint,
  p_checksum text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session upload_sessions%ROWTYPE;
  v_existing file_versions%ROWTYPE;
  v_result jsonb;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
     AND current_setting('role', true) <> 'service_role'
  THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'not_authenticated';
    END IF;
    SELECT * INTO v_session FROM public.upload_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
    IF v_session.seller_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSE
    SELECT * INTO v_session FROM public.upload_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  END IF;

  IF v_session.status = 'completed' AND v_session.file_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.file_versions
    WHERE file_id = v_session.file_id ORDER BY version_number DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'file_id', v_session.file_id,
        'file_version_id', v_existing.id,
        'fileId', v_session.file_id,
        'fileVersionId', v_existing.id
      );
    END IF;
  END IF;

  IF v_session.status NOT IN ('uploading', 'completing') THEN RAISE EXCEPTION 'session_not_active'; END IF;
  IF v_session.total_bytes IS NULL OR p_size_bytes IS NULL OR p_size_bytes <= 0
     OR p_size_bytes <> v_session.total_bytes THEN
    RAISE EXCEPTION 'size_mismatch';
  END IF;
  IF v_session.original_name IS NULL OR v_session.mime IS NULL OR v_session.extension IS NULL THEN
    RAISE EXCEPTION 'session_metadata_missing';
  END IF;

  IF v_session.status = 'uploading' THEN
    UPDATE public.upload_sessions SET status = 'completing'
    WHERE id = p_session_id AND status = 'uploading';
    IF NOT FOUND THEN RAISE EXCEPTION 'session_not_active'; END IF;
  END IF;

  v_result := public.register_drive_file(
    v_session.seller_id,
    v_session.drive_account_id,
    p_provider_file_id,
    v_session.original_name,
    v_session.mime,
    v_session.extension,
    p_size_bytes,
    p_checksum,
    'file.uploaded'
  );

  UPDATE public.upload_sessions
  SET status = 'completed', completed_at = now(),
      file_id = (v_result->>'file_id')::uuid
  WHERE id = p_session_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.register_drive_file(uuid, uuid, text, text, text, text, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_upload_session(uuid, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_drive_file(uuid, uuid, text, text, text, text, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_upload_session(uuid, text, bigint, text) TO service_role;

-- ------------------------------------------------------------
-- #14 — Backup verification evidence columns and strict RPCs
-- ------------------------------------------------------------
ALTER TABLE public.backup_archives
  ADD COLUMN IF NOT EXISTS source_pg_version text,
  ADD COLUMN IF NOT EXISTS row_counts jsonb;
ALTER TABLE public.restore_jobs
  ADD COLUMN IF NOT EXISTS evidence jsonb;

CREATE OR REPLACE FUNCTION public.complete_backup_job(
  p_job_id uuid,
  p_size_bytes bigint,
  p_storage_location text,
  p_checksum text,
  p_source_pg_version text,
  p_row_counts jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_archive_id uuid;
  v_started_at timestamptz;
BEGIN
  UPDATE backup_jobs
  SET status = 'completed',
      finished_at = now(),
      size_bytes = p_size_bytes,
      storage_location = p_storage_location,
      error = NULL
  WHERE id = p_job_id
  RETURNING started_at INTO v_started_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'backup_job_not_found';
  END IF;

  INSERT INTO backup_archives(
    backup_job_id, period_start, period_end, storage_location, checksum,
    source_pg_version, row_counts
  )
  VALUES (
    p_job_id, v_started_at, now(), p_storage_location, p_checksum,
    p_source_pg_version, p_row_counts
  )
  RETURNING id INTO v_archive_id;

  PERFORM log_audit('backup.completed', 'backup_jobs', p_job_id, NULL,
    jsonb_build_object(
      'archive_id', v_archive_id,
      'size_bytes', p_size_bytes,
      'checksum', p_checksum,
      'storage_location', p_storage_location,
      'source_pg_version', p_source_pg_version,
      'row_counts', p_row_counts
    ), NULL);

  RETURN v_archive_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_backup_job(
  p_job_id uuid,
  p_size_bytes bigint,
  p_storage_location text,
  p_checksum text
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.complete_backup_job(
    p_job_id, p_size_bytes, p_storage_location, p_checksum, NULL, NULL::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.complete_backup_job(uuid, bigint, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_backup_job(uuid, bigint, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_backup_job(uuid, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_backup_job(uuid, bigint, text, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.record_restore_verification(
  p_archive_id uuid,
  p_status restore_status_enum,
  p_error text,
  p_performed_by uuid,
  p_evidence jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_restore_id uuid;
BEGIN
  INSERT INTO restore_jobs(
    backup_archive_id, status, started_at, finished_at, error, performed_by, evidence
  )
  VALUES (
    p_archive_id, p_status, now(), now(),
    CASE WHEN p_error IS NOT NULL THEN left(p_error, 2000) ELSE NULL END,
    p_performed_by, p_evidence
  )
  RETURNING id INTO v_restore_id;

  PERFORM log_audit(
    CASE WHEN p_status = 'completed' THEN 'backup.restore_verified' ELSE 'backup.restore_failed' END,
    'restore_jobs',
    v_restore_id,
    NULL,
    jsonb_build_object(
      'archive_id', p_archive_id,
      'status', p_status,
      'error', p_error,
      'evidence', p_evidence
    ),
    NULL
  );

  IF p_status = 'failed' THEN
    PERFORM notify_staff_with_permission(
      'backup.read',
      'restore_test_failed',
      'فشل اختبار استعادة النسخة الاحتياطية',
      'فشل التحقق التلقائي من استعادة أحدث نسخة احتياطية. يرجى التدخل فوراً.',
      jsonb_build_object('restore_job_id', v_restore_id, 'archive_id', p_archive_id)
    );
  END IF;

  RETURN v_restore_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_restore_verification(
  p_archive_id uuid,
  p_status restore_status_enum,
  p_error text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.record_restore_verification(
    p_archive_id, p_status, p_error, p_performed_by, NULL::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.record_restore_verification(uuid, restore_status_enum, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_restore_verification(uuid, restore_status_enum, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_restore_verification(uuid, restore_status_enum, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_restore_verification(uuid, restore_status_enum, text, uuid, jsonb) TO service_role;
