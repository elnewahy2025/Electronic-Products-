-- 054_review_delete_ticket_guard.sql
-- Review soft-delete is now an admin/staff moderation action that must be
-- requested by the product's seller through a structured support ticket.
-- The buyer must not have an open compensation request, an open attempt
-- exception, or an open buyer-owned support ticket for the same order item or
-- product.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_id uuid REFERENCES public.reviews(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_product_status
  ON public.support_tickets(product_id, status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order_item_status
  ON public.support_tickets(order_item_id, status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_review_status
  ON public.support_tickets(review_id, status);

-- Replace the legacy delete_review RPC. It is retained for service-role
-- maintenance only; user-facing moderation goes through the ticket-guarded
-- function below.
CREATE OR REPLACE FUNCTION public.delete_review(p_review_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'review_delete_requires_ticket';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  UPDATE public.reviews
     SET status = 'deleted', deleted_by = auth.uid(),
         delete_reason = p_reason, deleted_at = now()
   WHERE id = p_review_id AND status <> 'deleted';

  IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found_or_already_deleted'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_review(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_review(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_review(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_review_from_ticket(
  p_review_id uuid,
  p_ticket_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_review public.reviews%ROWTYPE;
  v_ticket public.support_tickets%ROWTYPE;
  v_seller_id uuid;
BEGIN
  IF NOT (public.is_admin_or_above() OR public.staff_has('review.delete')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT * INTO v_review FROM public.reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review_not_found'; END IF;
  IF v_review.status = 'deleted' THEN RAISE EXCEPTION 'already_deleted'; END IF;

  SELECT seller_id INTO v_seller_id FROM public.products WHERE id = v_review.product_id;
  IF v_seller_id IS NULL THEN RAISE EXCEPTION 'product_not_found'; END IF;

  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found'; END IF;
  IF v_ticket.status NOT IN ('open', 'pending') THEN
    RAISE EXCEPTION 'ticket_not_open';
  END IF;

  -- The ticket must be the seller's structured request for this exact review,
  -- product, or order item. Free-text tickets are not enough.
  IF v_ticket.owner_id <> v_seller_id
     OR NOT (
       v_ticket.review_id IS NOT DISTINCT FROM v_review.id
       OR (v_ticket.order_item_id IS NOT NULL AND v_ticket.order_item_id = v_review.order_item_id)
       OR (v_ticket.product_id IS NOT NULL AND v_ticket.product_id = v_review.product_id)
     ) THEN
    RAISE EXCEPTION 'ticket_not_linked_to_review';
  END IF;

  -- No open buyer case on the same purchase or product.
  IF EXISTS (
    SELECT 1
      FROM public.purchase_codes pc
      JOIN public.compensation_requests cr ON cr.code_id = pc.id
     WHERE pc.order_item_id = v_review.order_item_id
       AND cr.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'buyer_case_compensation_open';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.purchase_codes pc
      JOIN public.attempt_exception_requests ae ON ae.code_id = pc.id
     WHERE pc.order_item_id = v_review.order_item_id
       AND ae.status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'buyer_case_exception_open';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.support_tickets st
     WHERE st.owner_id = v_review.buyer_id
       AND st.status IN ('open', 'pending')
       AND (
         st.review_id IS NOT DISTINCT FROM v_review.id
         OR (st.order_item_id IS NOT NULL AND st.order_item_id = v_review.order_item_id)
         OR (st.product_id IS NOT NULL AND st.product_id = v_review.product_id)
       )
  ) THEN
    RAISE EXCEPTION 'buyer_case_ticket_open';
  END IF;

  UPDATE public.reviews
     SET status = 'deleted', deleted_by = auth.uid(),
         delete_reason = p_reason, deleted_at = now()
   WHERE id = p_review_id;

  PERFORM public.log_audit(
    'review.deleted_from_ticket', 'reviews', p_review_id,
    jsonb_build_object('status', v_review.status),
    jsonb_build_object('status', 'deleted', 'ticket_id', p_ticket_id),
    p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_review_from_ticket(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_review_from_ticket(uuid, uuid, text) TO authenticated, service_role;

-- Defense in depth: even a direct PostgREST update by an admin must reference
-- an open seller ticket for the same review/product/order. Service role is
-- exempt for maintenance and isolated restore verification.
CREATE OR REPLACE FUNCTION public.restrict_review_soft_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_seller_id uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
     OR NEW.delete_reason IS DISTINCT FROM OLD.delete_reason THEN
    IF NOT (
      public.is_admin_or_above()
      OR public.staff_has('review.delete')
      OR auth.role() = 'service_role'
    ) THEN
      RAISE EXCEPTION 'review_delete_forbidden';
    END IF;
  END IF;

  IF NEW.status = 'deleted'
     AND (OLD.status IS DISTINCT FROM NEW.status
          OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
          OR OLD.deleted_by IS DISTINCT FROM NEW.deleted_by
          OR OLD.delete_reason IS DISTINCT FROM NEW.delete_reason)
     AND auth.role() <> 'service_role' THEN
    SELECT p.seller_id INTO v_seller_id
      FROM public.products p
     WHERE p.id = NEW.product_id;

    IF NOT EXISTS (
      SELECT 1
        FROM public.support_tickets st
       WHERE st.owner_id = v_seller_id
         AND st.status IN ('open', 'pending')
         AND (
           st.review_id IS NOT DISTINCT FROM NEW.id
           OR (st.order_item_id IS NOT NULL AND st.order_item_id = NEW.order_item_id)
           OR (st.product_id IS NOT NULL AND st.product_id = NEW.product_id)
         )
    ) THEN
      RAISE EXCEPTION 'review_delete_requires_ticket';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_review_soft_delete ON public.reviews;
CREATE TRIGGER trg_restrict_review_soft_delete
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.restrict_review_soft_delete();
