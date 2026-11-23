-- 051_download_ownership_rpc.sql
-- M2: completion must be tied to the buyer who owns the purchase, including
-- guest purchases later claimed by registering with the same email.
CREATE OR REPLACE FUNCTION public.download_session_owned_by_current_user(p_session_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.download_sessions ds
    JOIN public.purchase_codes pc ON pc.id = ds.code_id
    JOIN public.order_items oi ON oi.id = pc.order_item_id
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.purchase_requests pr ON pr.id = o.purchase_request_id
    WHERE ds.id = p_session_id
      AND (
        ds.buyer_id = auth.uid()
        OR pr.buyer_id = auth.uid()
        OR (pr.customer_email IS NOT NULL
            AND lower(pr.customer_email) = lower(coalesce(auth.email(), '')))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.download_session_owned_by_current_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.download_session_owned_by_current_user(uuid) TO authenticated, service_role;
