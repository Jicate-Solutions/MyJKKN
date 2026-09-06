-- Deleting bills and receipts becomes super-admin-only, 2026-07-29.
--
-- Revoking the permission keys is NOT sufficient on its own, for two reasons
-- that are invisible from the Role Management screen:
--
--  1. Every DELETE policy reads
--       is_super_admin() OR is_admin() OR (key AND role_has_institution_access)
--     and is_admin() is BROADER than is_super_admin(): it also matches
--     profiles.role IN ('admin','super_admin','administrator'). THREE accounts
--     currently hold one of those roles WITHOUT profiles.is_super_admin, so they
--     would have kept deleting bills after every key was revoked. The is_admin()
--     branch is removed below.
--
--  2. billing_student_bills has TWO DELETE policies gated on DIFFERENT keys --
--     billing_bills_delete_permission (billing.schedule.delete) and
--     bills_delete_admin (billing.bills.delete). RLS policies are OR'd, so
--     hardening one leaves the other as an open path. billing.bills.delete is
--     held by nobody today, but the route is live; both are hardened.
--
-- The permission-key branch is deliberately KEPT so the capability can be
-- re-delegated through Role Management later without a migration. What changes
-- is that no role holds the key today, and no non-super-admin can slip in
-- through is_admin().

-- ---------------------------------------------------------------------------
-- 1. Revoke the delete keys from every role.
-- ---------------------------------------------------------------------------
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('billing.receipts.delete', false)
 WHERE (permissions->>'billing.receipts.delete')::boolean IS TRUE;

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('billing.schedule.delete', false)
 WHERE (permissions->>'billing.schedule.delete')::boolean IS TRUE;

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('billing.bills.delete', false)
 WHERE (permissions->>'billing.bills.delete')::boolean IS TRUE;

-- ---------------------------------------------------------------------------
-- 2. Drop the is_admin() branch from the delete policies.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS billing_receipts_delete_permission ON public.billing_receipts;
CREATE POLICY billing_receipts_delete_permission
  ON public.billing_receipts FOR DELETE
  USING (
    is_super_admin()
    OR (user_has_permission('billing.receipts.delete') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS billing_bills_delete_permission ON public.billing_student_bills;
CREATE POLICY billing_bills_delete_permission
  ON public.billing_student_bills FOR DELETE
  USING (
    is_super_admin()
    OR (user_has_permission('billing.schedule.delete') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS bills_delete_admin ON public.billing_student_bills;
CREATE POLICY bills_delete_admin
  ON public.billing_student_bills FOR DELETE
  USING (
    is_super_admin()
    OR (user_has_permission('billing.bills.delete') AND role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------------
-- 3. Same treatment for the direct-void RPC, which bypasses the cancellation
--    approval flow. It gated on is_admin() too, so an 'administrator' profile
--    could void a receipt without a super admin and without a request.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_void_billing_receipt(
  p_receipt_id uuid,
  p_reason     text
)
RETURNS TABLE(receipt_number text, bill_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid;
BEGIN
  IF p_receipt_id IS NULL THEN
    RAISE EXCEPTION 'fn_void_billing_receipt: p_receipt_id must not be NULL';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required to void a receipt';
  END IF;

  SELECT institution_id INTO v_inst FROM public.billing_receipts WHERE id = p_receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt % not found (already voided or deleted)', p_receipt_id;
  END IF;

  -- NOT is_admin(): that also matches profiles.role IN ('admin','super_admin',
  -- 'administrator'), which would let a non-super-admin void a receipt outright
  -- and skip the cancellation approval flow entirely.
  IF NOT (
    is_super_admin()
    OR (user_has_permission('billing.receipts.delete') AND role_has_institution_access(v_inst))
  ) THEN
    RAISE EXCEPTION 'Only a super admin can void a receipt directly - raise a cancellation request instead';
  END IF;

  RETURN QUERY SELECT * FROM public._fn_exec_receipt_void(p_receipt_id, p_reason, NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_void_billing_receipt(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_void_billing_receipt(uuid, text) TO authenticated, service_role;
