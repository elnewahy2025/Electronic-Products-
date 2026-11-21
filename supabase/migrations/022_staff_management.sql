-- ============================================================
-- 022_staff_management.sql
-- Safe role change + staff removal with super_admin protection
-- ============================================================

-- Change role (with self-demotion and last-SA protection)
CREATE OR REPLACE FUNCTION change_staff_role(
  p_profile_id uuid,
  p_new_role_code text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role_id uuid;
  v_current_role text;
  v_sa_count int;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT id INTO v_role_id FROM roles WHERE code = p_new_role_code;
  IF v_role_id IS NULL THEN RAISE EXCEPTION 'role_not_found'; END IF;

  IF p_profile_id = auth.uid() AND p_new_role_code <> 'super_admin' THEN
    RAISE EXCEPTION 'cannot_demote_self';
  END IF;

  SELECT r.code INTO v_current_role
  FROM store_members sm
  JOIN roles r ON r.id = sm.role_id
  WHERE sm.profile_id = p_profile_id AND sm.status = 'active';

  IF v_current_role = 'super_admin' AND p_new_role_code <> 'super_admin' THEN
    SELECT COUNT(*) INTO v_sa_count
    FROM store_members sm
    JOIN roles r ON r.id = sm.role_id
    WHERE r.code = 'super_admin' AND sm.status = 'active' AND sm.profile_id <> p_profile_id;

    IF v_sa_count < 1 THEN
      RAISE EXCEPTION 'cannot_remove_last_super_admin';
    END IF;
  END IF;

  UPDATE store_members
    SET role_id = v_role_id
    WHERE profile_id = p_profile_id;

  IF NOT FOUND THEN
    INSERT INTO store_members(profile_id, role_id, granted_by, status)
      VALUES (p_profile_id, v_role_id, auth.uid(), 'active');
    UPDATE profiles SET account_type = 'staff' WHERE id = p_profile_id;
  END IF;

  PERFORM log_audit('auth.role_changed', 'store_members', p_profile_id,
    jsonb_build_object('role', v_current_role),
    jsonb_build_object('role', p_new_role_code), NULL);
END;
$$;

-- Remove staff membership (with last-SA protection, clears overrides)
CREATE OR REPLACE FUNCTION remove_staff_member(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current_role text;
  v_sa_count int;
BEGIN
  IF NOT is_super_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_profile_id = auth.uid() THEN RAISE EXCEPTION 'cannot_remove_self'; END IF;

  SELECT r.code INTO v_current_role
  FROM store_members sm
  JOIN roles r ON r.id = sm.role_id
  WHERE sm.profile_id = p_profile_id AND sm.status = 'active';

  IF v_current_role = 'super_admin' THEN
    SELECT COUNT(*) INTO v_sa_count
    FROM store_members sm
    JOIN roles r ON r.id = sm.role_id
    WHERE r.code = 'super_admin' AND sm.status = 'active' AND sm.profile_id <> p_profile_id;

    IF v_sa_count < 1 THEN
      RAISE EXCEPTION 'cannot_remove_last_super_admin';
    END IF;
  END IF;

  UPDATE store_members SET status = 'revoked' WHERE profile_id = p_profile_id;
  UPDATE profiles SET account_type = 'buyer' WHERE id = p_profile_id;

  DELETE FROM member_permissions WHERE member_id = p_profile_id;

  PERFORM log_audit('auth.permission_revoked', 'store_members', p_profile_id,
    NULL, NULL, 'staff_removed');
END;
$$;

GRANT EXECUTE ON FUNCTION change_staff_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_staff_member(uuid) TO authenticated;