-- Receipt cancellation: approval restricted to SUPER ADMIN only, 2026-07-29.
--
-- CHANGE FROM THE ORIGINAL FLOW:
--   Chief Accountant was an approver. Now Chief Accountant (and the accounts
--   roles) may only RAISE a cancellation request; every request is decided by a
--   super admin. Two things had to move together, or the restriction is fiction:
--
--   1. billing.receipts.cancel.approve is revoked from EVERY role. The key is
--      also removed from lib/constants/permissions.ts so Role Management no
--      longer shows a toggle that cannot grant anything.
--   2. The approve RPC dropped its `is_admin()` branch. is_admin() is BROADER
--      than is_super_admin() -- it also matches profiles.role IN ('admin',
--      'super_admin','administrator') -- so leaving it in would have let plain
--      admins keep approving while the permission toggle said otherwise.
--
--   billing.receipts.delete is untouched: it stays with the senior roles as the
--   documented break-glass direct void. Anyone holding it still bypasses this
--   flow entirely, which is why it is NOT held by the accounts roles.
--
-- IDENTITY SNAPSHOT:
--   decided_by/requested_by are uuids, and a profile can be renamed, have its
--   email changed, or be deactivated long after the decision. For an audit trail
--   that has to answer "who approved this, and what were they" years later, the
--   uuid alone is not enough -- so name/email/role/super-admin-flag are captured
--   AT DECISION TIME and never updated.

-- ---------------------------------------------------------------------------
-- 1. Identity snapshot columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_receipt_cancel_requests
  ADD COLUMN IF NOT EXISTS requested_by_name       text,
  ADD COLUMN IF NOT EXISTS requested_by_email      text,
  ADD COLUMN IF NOT EXISTS requested_by_role       text,
  ADD COLUMN IF NOT EXISTS decided_by_name         text,
  ADD COLUMN IF NOT EXISTS decided_by_email        text,
  ADD COLUMN IF NOT EXISTS decided_by_role         text,
  ADD COLUMN IF NOT EXISTS decided_by_designation  text,
  ADD COLUMN IF NOT EXISTS decided_by_is_super_admin boolean;

ALTER TABLE public.billing_receipt_cancel_request_actions
  ADD COLUMN IF NOT EXISTS actor_name           text,
  ADD COLUMN IF NOT EXISTS actor_email          text,
  ADD COLUMN IF NOT EXISTS actor_is_super_admin boolean;

-- ---------------------------------------------------------------------------
-- 2. Raise a request -- now also snapshots who raised it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_request_receipt_cancellation(
  p_receipt_id uuid,
  p_reason     text
)
RETURNS TABLE(request_id uuid, request_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt public.billing_receipts%ROWTYPE;
  v_id      uuid;
  v_number  text;
  v_role    text;
  v_name    text;
  v_email   text;
  v_super   boolean;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required';
  END IF;

  SELECT * INTO v_receipt FROM public.billing_receipts WHERE id = p_receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt % not found (already cancelled or deleted)', p_receipt_id;
  END IF;

  -- Super admins may raise too (they can also approve, just not their own).
  IF NOT (
    is_super_admin()
    OR (user_has_permission('billing.receipts.cancel.request')
        AND role_has_institution_access(v_receipt.institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to request receipt cancellation for this institution';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.billing_receipt_cancel_requests
    WHERE receipt_id = p_receipt_id AND status = 'pending_approval'
  ) THEN
    RAISE EXCEPTION 'A cancellation request for this receipt is already awaiting approval';
  END IF;

  -- Same guards the approval will run: a request that could never be approved
  -- should fail here, not after sitting in the super admin's queue.
  IF EXISTS (SELECT 1 FROM public.billing_refunds WHERE receipt_id = p_receipt_id) THEN
    RAISE EXCEPTION 'Cannot cancel: this receipt has refunds recorded against it. Reverse the refund first.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.billing_invoice_items WHERE receipt_id = p_receipt_id) THEN
    RAISE EXCEPTION 'Cannot cancel: this receipt is attached to an invoice. Cancel the invoice first.';
  END IF;
  IF v_receipt.payment_reference_number IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payment_transactions t
    WHERE t.status = 'success'
      AND v_receipt.payment_reference_number IN (
            t.razorpay_payment_id, t.gateway_transaction_id, t.transaction_ref)
  ) THEN
    RAISE EXCEPTION 'Cannot cancel: this receipt settles a captured online payment (%). Issue a refund instead.',
      v_receipt.payment_reference_number;
  END IF;

  v_number := 'RCX-' || EXTRACT(YEAR FROM NOW())::text || '-'
              || LPAD(nextval('billing_receipt_cancel_number_seq')::text, 6, '0');

  SELECT p.full_name, p.email, COALESCE(p.is_super_admin, false)
    INTO v_name, v_email, v_super
  FROM public.profiles p WHERE p.id = auth.uid();

  SELECT cr.role_name INTO v_role
  FROM public.user_roles ur JOIN public.custom_roles cr ON cr.id = ur.role_id
  WHERE ur.user_id = auth.uid() LIMIT 1;

  INSERT INTO public.billing_receipt_cancel_requests (
    request_number, receipt_id, institution_id, student_id, receipt_snapshot,
    reason, requested_by, requested_by_name, requested_by_email, requested_by_role
  ) VALUES (
    v_number, p_receipt_id, v_receipt.institution_id, v_receipt.student_id,
    jsonb_build_object('receipt_number', v_receipt.receipt_number,
                       'payment_amount', v_receipt.payment_amount,
                       'payment_mode',   v_receipt.payment_mode,
                       'receipt_date',   v_receipt.receipt_date,
                       'payer_name',     v_receipt.payer_name),
    trim(p_reason), auth.uid(), v_name, v_email, v_role
  ) RETURNING id INTO v_id;

  INSERT INTO public.billing_receipt_cancel_request_actions (
    request_id, action_type, actor_id, actor_role_name, actor_name, actor_email,
    actor_is_super_admin, notes
  ) VALUES (v_id, 'requested', auth.uid(), v_role, v_name, v_email, v_super, trim(p_reason));

  RETURN QUERY SELECT v_id, v_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_request_receipt_cancellation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_request_receipt_cancellation(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Decide -- SUPER ADMIN ONLY, with a full identity snapshot.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_act_on_receipt_cancellation(
  p_request_id uuid,
  p_action     text,
  p_notes      text DEFAULT NULL
)
RETURNS TABLE(status text, receipt_number text, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req   public.billing_receipt_cancel_requests%ROWTYPE;
  v_role  text;
  v_name  text;
  v_email text;
  v_desig text;
  v_num   text;
BEGIN
  IF p_action NOT IN ('approve','decline') THEN
    RAISE EXCEPTION 'p_action must be approve or decline';
  END IF;

  SELECT * INTO v_req FROM public.billing_receipt_cancel_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancellation request % not found', p_request_id;
  END IF;
  IF v_req.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'This request is already %', v_req.status;
  END IF;

  -- SUPER ADMIN ONLY. Deliberately NOT is_admin(), which also matches
  -- profiles.role IN ('admin','super_admin','administrator') and would let
  -- plain admins decide. Deliberately no permission-key branch either: the key
  -- is revoked everywhere and removed from the catalog, so a key check here
  -- would be a silent no-op that looks like a control.
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can decide receipt cancellation requests';
  END IF;

  -- Separation of duties still applies: a super admin who raised the request
  -- cannot wave their own through.
  IF v_req.requested_by IS NOT NULL AND v_req.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'You cannot approve your own cancellation request - another super admin must act on it';
  END IF;

  SELECT p.full_name, p.email, p.designation
    INTO v_name, v_email, v_desig
  FROM public.profiles p WHERE p.id = auth.uid();

  SELECT cr.role_name INTO v_role
  FROM public.user_roles ur JOIN public.custom_roles cr ON cr.id = ur.role_id
  WHERE ur.user_id = auth.uid() LIMIT 1;

  IF p_action = 'decline' THEN
    UPDATE public.billing_receipt_cancel_requests
       SET status='declined', decided_by=auth.uid(), decided_at=now(),
           decision_notes=p_notes, decided_by_name=v_name, decided_by_email=v_email,
           decided_by_role=v_role, decided_by_designation=v_desig,
           decided_by_is_super_admin=true, updated_at=now()
     WHERE id = p_request_id;
    INSERT INTO public.billing_receipt_cancel_request_actions
      (request_id, action_type, actor_id, actor_role_name, actor_name, actor_email,
       actor_is_super_admin, notes)
      VALUES (p_request_id, 'declined', auth.uid(), v_role, v_name, v_email, true, p_notes);
    RETURN QUERY SELECT 'declined'::text,
                        (v_req.receipt_snapshot->>'receipt_number')::text,
                        'Request declined.'::text;
    RETURN;
  END IF;

  -- The receipt vanishing between request and approval is TERMINAL, so close the
  -- request instead of leaving it stuck pending. Guard failures are different:
  -- those RAISE out of the helper and roll back, because they are fixable.
  IF NOT EXISTS (SELECT 1 FROM public.billing_receipts WHERE id = v_req.receipt_id) THEN
    UPDATE public.billing_receipt_cancel_requests
       SET status='failed', decided_by=auth.uid(), decided_at=now(),
           decision_notes='Receipt no longer exists at approval time',
           decided_by_name=v_name, decided_by_email=v_email, decided_by_role=v_role,
           decided_by_designation=v_desig, decided_by_is_super_admin=true, updated_at=now()
     WHERE id = p_request_id;
    INSERT INTO public.billing_receipt_cancel_request_actions
      (request_id, action_type, actor_id, actor_role_name, actor_name, actor_email,
       actor_is_super_admin, notes)
      VALUES (p_request_id, 'failed', auth.uid(), v_role, v_name, v_email, true,
              'Receipt no longer exists at approval time');
    RETURN QUERY SELECT 'failed'::text,
                        (v_req.receipt_snapshot->>'receipt_number')::text,
                        'The receipt no longer exists - it was already voided or deleted.'::text;
    RETURN;
  END IF;

  SELECT e.receipt_number INTO v_num
  FROM public._fn_exec_receipt_void(v_req.receipt_id, v_req.reason, p_request_id) e;

  UPDATE public.billing_receipt_cancel_requests
     SET status='approved', decided_by=auth.uid(), decided_at=now(),
         decision_notes=p_notes, decided_by_name=v_name, decided_by_email=v_email,
         decided_by_role=v_role, decided_by_designation=v_desig,
         decided_by_is_super_admin=true, updated_at=now()
   WHERE id = p_request_id;
  INSERT INTO public.billing_receipt_cancel_request_actions
    (request_id, action_type, actor_id, actor_role_name, actor_name, actor_email,
     actor_is_super_admin, notes)
    VALUES (p_request_id, 'approved', auth.uid(), v_role, v_name, v_email, true, p_notes);

  RETURN QUERY SELECT 'approved'::text, v_num::text,
                      'Receipt cancelled and the bill reverted.'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_act_on_receipt_cancellation(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_act_on_receipt_cancellation(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS: drop the now-dead cancel.approve branch. Super admins already see
--    everything via is_super_admin(); requesters see their own; billing staff
--    with billing.receipts.view see their institutions'.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS billing_receipt_cancel_requests_select ON public.billing_receipt_cancel_requests;
CREATE POLICY billing_receipt_cancel_requests_select
  ON public.billing_receipt_cancel_requests FOR SELECT
  USING (
    is_super_admin()
    OR requested_by = auth.uid()
    OR (user_has_permission('billing.receipts.view') AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS billing_receipt_cancel_actions_select ON public.billing_receipt_cancel_request_actions;
CREATE POLICY billing_receipt_cancel_actions_select
  ON public.billing_receipt_cancel_request_actions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.billing_receipt_cancel_requests r
    WHERE r.id = request_id
      AND (
        is_super_admin()
        OR r.requested_by = auth.uid()
        OR (user_has_permission('billing.receipts.view') AND role_has_institution_access(r.institution_id))
      )
  ));

-- ---------------------------------------------------------------------------
-- 5. Permissions. Chief Accountant becomes request-only; nobody keeps the
--    approve key. Revoking it from EVERY role (not just the two that had it) is
--    what makes "super admin only" true rather than aspirational.
-- ---------------------------------------------------------------------------
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('billing.receipts.cancel.request', true)
 WHERE role_name IN ('Chief Accountant', 'Accountant Assistant', 'Admission Officer');

UPDATE public.custom_roles
   SET permissions = permissions - 'billing.receipts.cancel.approve'
 WHERE permissions ? 'billing.receipts.cancel.approve';

-- "Chief Accountant can only request" is only true once direct void is gone:
-- billing.receipts.delete gates fn_void_billing_receipt, which bypasses this
-- flow entirely. NOTE Administrator, Chief Administrative Officer and Executive
-- Administrative Officer deliberately KEEP it as documented break-glass -- they
-- were not named in the change. Anyone holding that key can still cancel a
-- receipt without a super admin, so revisit if the intent is truly no-exceptions.
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('billing.receipts.delete', false)
 WHERE role_name = 'Chief Accountant';
