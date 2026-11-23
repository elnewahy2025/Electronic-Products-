-- 052_guest_review_eligibility.sql
-- M7: review eligibility must use the same guest-email fallback as the other
-- buyer RPCs. Direct order_items reads are RLS-scoped to buyer_id only, so a
-- guest purchase could never be reviewed even after claiming the same email.
CREATE OR REPLACE FUNCTION public.can_current_user_review(p_product_id uuid)
RETURNS TABLE (can_review boolean, order_item_id uuid, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.email(), ''));
  v_existing uuid;
  v_item uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'login_required'::text;
    RETURN;
  END IF;

  SELECT r.id INTO v_existing
    FROM public.reviews r
    WHERE r.product_id = p_product_id AND r.buyer_id = v_uid
    LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'already_reviewed'::text;
    RETURN;
  END IF;

  SELECT oi.id INTO v_item
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.purchase_requests pr ON pr.id = o.purchase_request_id
    WHERE oi.product_id = p_product_id
      AND pr.status IN ('approved', 'completed')
      AND (
        pr.buyer_id = v_uid
        OR (pr.customer_email IS NOT NULL AND lower(pr.customer_email) = v_email)
      )
    LIMIT 1;

  IF v_item IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'not_purchased'::text;
  ELSE
    RETURN QUERY SELECT true, v_item, NULL::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.can_current_user_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_current_user_review(uuid) TO anon, authenticated;
