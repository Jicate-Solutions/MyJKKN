-- Receipt cancellation requires approval (Chief Accountant), 2026-07-29.
--
-- THE PROBLEM THIS SOLVES:
--   An accounts user who issued a receipt by mistake (wrong learner, wrong
--   amount, or the same payment receipted twice) could void it themselves --
--   Accountant Assistant held billing.receipts.delete, the very key gating both
--   Void and Delete. Reversing money had no second pair of eyes.
--
-- WHY NOT REUSE THE REFUND WORKFLOW:
--   A refund means money genuinely arrived and is going back: the bill stays
--   settled and billing_student_bills.refunded_amount grows, status untouched.
--   A cancellation means the receipt was never valid: the bill must UN-settle,
--   back to unpaid with its balance restored. Opposite effects on the bill, so
--   they get separate tables -- but the same proven shape (frozen snapshot,
--   append-only actions, self-authorizing SECURITY DEFINER RPCs, SELECT-only
--   RLS) as billing_refund_requests.
--
-- WHILE A REQUEST IS PENDING the receipt stays FULLY VALID and the bill stays
--   paid. Collections must reflect reality until a cancellation is actually
--   approved, and it keeps all 26 functions that read billing_receipts correct
--   with no changes. Only a UI badge differs.

-- ---------------------------------------------------------------------------
-- 1. Request + audit tables
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.billing_receipt_cancel_number_seq;

CREATE TABLE IF NOT EXISTS public.billing_receipt_cancel_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number   text NOT NULL UNIQUE,
  -- DELIBERATELY NO FOREIGN KEY to billing_receipts. Approving this request
  -- DELETES that receipt row; an FK (this repo defaults to NO ACTION, see
  -- payment_transactions_razorpay_account_id_fkey) would make approval fail
  -- with 23503. receipt_snapshot below is what preserves its identity.
  receipt_id       uuid NOT NULL,
  institution_id   uuid,
  student_id       uuid,
  -- Receipt number/amount/mode frozen at request time, so the queue and the
  -- history still read correctly after the receipt row is gone.
  receipt_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason           text NOT NULL,
  status           text NOT NULL DEFAULT 'pending_approval'
                   CHECK (status IN ('pending_approval','approved','declined','withdrawn','failed')),
  requested_by     uuid,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_notes   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- At most ONE open request per receipt: two assistants noticing the same
-- duplicate must not create two requests the Chief approves twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_receipt_cancel_open_per_receipt
  ON public.billing_receipt_cancel_requests (receipt_id)
  WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS idx_receipt_cancel_status
  ON public.billing_receipt_cancel_requests (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_cancel_institution
  ON public.billing_receipt_cancel_requests (institution_id);
CREATE INDEX IF NOT EXISTS idx_receipt_cancel_student
  ON public.billing_receipt_cancel_requests (student_id);

CREATE TABLE IF NOT EXISTS public.billing_receipt_cancel_request_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL
                  REFERENCES public.billing_receipt_cancel_requests(id) ON DELETE CASCADE,
  action_type     text NOT NULL
                  CHECK (action_type IN ('requested','approved','declined','withdrawn','failed')),
  actor_id        uuid,
  actor_role_name text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_cancel_actions_request
  ON public.billing_receipt_cancel_request_actions (request_id, created_at);

-- Links the void archive back to the approval that authorised it, so the full
-- history is one join.
ALTER TABLE public.billing_receipts_voided
  ADD COLUMN IF NOT EXISTS cancel_request_id uuid;

-- Supabase default-grants new public tables to the anon key shipped in every
-- page of jkkn.ai; RLS is not a substitute.
REVOKE ALL ON TABLE public.billing_receipt_cancel_requests FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.billing_receipt_cancel_request_actions FROM anon, PUBLIC;
REVOKE ALL ON SEQUENCE public.billing_receipt_cancel_number_seq FROM anon, PUBLIC;

ALTER TABLE public.billing_receipt_cancel_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_receipt_cancel_request_actions ENABLE ROW LEVEL SECURITY;

-- SELECT-only: every write goes through the RPCs below, so the audit trail
-- cannot be edited by whoever it incriminates.
DROP POLICY IF EXISTS billing_receipt_cancel_requests_select ON public.billing_receipt_cancel_requests;
CREATE POLICY billing_receipt_cancel_requests_select
  ON public.billing_receipt_cancel_requests FOR SELECT
  USING (
    is_super_admin()
    OR is_admin()
    OR requested_by = auth.uid()
    OR (user_has_permission('billing.receipts.cancel.approve') AND role_has_institution_access(institution_id))
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
        OR is_admin()
        OR r.requested_by = auth.uid()
        OR (user_has_permission('billing.receipts.cancel.approve') AND role_has_institution_access(r.institution_id))
        OR (user_has_permission('billing.receipts.view') AND role_has_institution_access(r.institution_id))
      )
  ));

-- ---------------------------------------------------------------------------
-- 2. The guards + archive + delete, WITHOUT authorization.
--    Extracted so the direct-void RPC and the approve RPC share ONE
--    implementation; duplicating the guards is how they drift apart.
--    Not callable directly -- EXECUTE is revoked from everyone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_exec_receipt_void(
  p_receipt_id        uuid,
  p_reason            text,
  p_cancel_request_id uuid DEFAULT NULL
)
RETURNS TABLE(receipt_number text, bill_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt public.billing_receipts%ROWTYPE;
  v_items   jsonb;
  v_bills   uuid[];
BEGIN
  SELECT * INTO v_receipt FROM public.billing_receipts WHERE id = p_receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt % not found (already voided or deleted)', p_receipt_id;
  END IF;

  -- Refunds cascade from billing_receipts: voiding would erase the record that
  -- money went back to the learner.
  IF EXISTS (SELECT 1 FROM public.billing_refunds WHERE receipt_id = p_receipt_id) THEN
    RAISE EXCEPTION 'Cannot void: this receipt has refunds recorded against it. Reverse the refund first.';
  END IF;

  -- Invoice items cascade too, leaving an invoice with a grand_total and no lines.
  IF EXISTS (SELECT 1 FROM public.billing_invoice_items WHERE receipt_id = p_receipt_id) THEN
    RAISE EXCEPTION 'Cannot void: this receipt is attached to an invoice. Cancel the invoice first.';
  END IF;

  -- An online receipt would simply come back: processSuccessfulPayment dedupes
  -- on payment_reference_number, so the next webhook or late-auth sweep
  -- re-creates it. Captured money is reversed with a refund, never a void.
  IF v_receipt.payment_reference_number IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payment_transactions t
    WHERE t.status = 'success'
      AND v_receipt.payment_reference_number IN (
            t.razorpay_payment_id, t.gateway_transaction_id, t.transaction_ref
          )
  ) THEN
    RAISE EXCEPTION 'Cannot void: this receipt settles a captured online payment (%). Issue a refund instead - voiding it would be undone by the next webhook or reconciliation sweep.',
      v_receipt.payment_reference_number;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(ri)), '[]'::jsonb),
         COALESCE(array_agg(ri.bill_id), ARRAY[]::uuid[])
    INTO v_items, v_bills
  FROM public.billing_receipt_items ri
  WHERE ri.receipt_id = p_receipt_id;

  INSERT INTO public.billing_receipts_voided (
    id, receipt_number, receipt_date, student_id, institution_id, payment_mode,
    payment_reference_number, payment_amount, payment_paid_date, payer_name,
    payer_contact, accountant_id, payment_remarks, created_by, created_at,
    updated_at, items_snapshot, voided_by, void_reason, cancel_request_id
  ) VALUES (
    v_receipt.id, v_receipt.receipt_number, v_receipt.receipt_date,
    v_receipt.student_id, v_receipt.institution_id, v_receipt.payment_mode,
    v_receipt.payment_reference_number, v_receipt.payment_amount,
    v_receipt.payment_paid_date, v_receipt.payer_name, v_receipt.payer_contact,
    v_receipt.accountant_id, v_receipt.payment_remarks, v_receipt.created_by,
    v_receipt.created_at, v_receipt.updated_at, v_items, auth.uid(),
    trim(p_reason), p_cancel_request_id
  );

  -- Cascades to billing_receipt_items, whose AFTER DELETE trigger recomputes
  -- each affected bill's status and balance_amount.
  DELETE FROM public.billing_receipts WHERE id = p_receipt_id;

  -- ::text is load-bearing: receipt_number is varchar(50), this signature says
  -- text, and without the cast Postgres rejects the call with 42804.
  RETURN QUERY SELECT v_receipt.receipt_number::text, v_bills;
END;
$function$;

REVOKE ALL ON FUNCTION public._fn_exec_receipt_void(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- Direct void now delegates. Authorization here, mechanics there.
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

  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('billing.receipts.delete') AND role_has_institution_access(v_inst))
  ) THEN
    RAISE EXCEPTION 'Not authorized to void receipts for this institution';
  END IF;

  RETURN QUERY SELECT * FROM public._fn_exec_receipt_void(p_receipt_id, p_reason, NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_void_billing_receipt(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_void_billing_receipt(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Request a cancellation.
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
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required';
  END IF;

  SELECT * INTO v_receipt FROM public.billing_receipts WHERE id = p_receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt % not found (already cancelled or deleted)', p_receipt_id;
  END IF;

  IF NOT (
    is_super_admin()
    OR is_admin()
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

  -- Run the same guards the approval will run. A request that could never be
  -- approved should fail here, not after it has sat in the Chief's queue.
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
            t.razorpay_payment_id, t.gateway_transaction_id, t.transaction_ref
          )
  ) THEN
    RAISE EXCEPTION 'Cannot cancel: this receipt settles a captured online payment (%). Issue a refund instead.',
      v_receipt.payment_reference_number;
  END IF;

  v_number := 'RCX-' || EXTRACT(YEAR FROM NOW())::text || '-'
              || LPAD(nextval('billing_receipt_cancel_number_seq')::text, 6, '0');

  SELECT cr.role_name INTO v_role
  FROM public.user_roles ur JOIN public.custom_roles cr ON cr.id = ur.role_id
  WHERE ur.user_id = auth.uid() LIMIT 1;

  INSERT INTO public.billing_receipt_cancel_requests (
    request_number, receipt_id, institution_id, student_id, receipt_snapshot,
    reason, requested_by
  ) VALUES (
    v_number, p_receipt_id, v_receipt.institution_id, v_receipt.student_id,
    jsonb_build_object(
      'receipt_number', v_receipt.receipt_number,
      'payment_amount', v_receipt.payment_amount,
      'payment_mode',   v_receipt.payment_mode,
      'receipt_date',   v_receipt.receipt_date,
      'payer_name',     v_receipt.payer_name
    ),
    trim(p_reason), auth.uid()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.billing_receipt_cancel_request_actions (
    request_id, action_type, actor_id, actor_role_name, notes
  ) VALUES (v_id, 'requested', auth.uid(), v_role, trim(p_reason));

  RETURN QUERY SELECT v_id, v_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_request_receipt_cancellation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_request_receipt_cancellation(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Approve / decline.
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
  v_req  public.billing_receipt_cancel_requests%ROWTYPE;
  v_role text;
  v_num  text;
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

  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('billing.receipts.cancel.approve')
        AND role_has_institution_access(v_req.institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to approve receipt cancellations for this institution';
  END IF;

  -- Separation of duties: whoever raised it cannot wave it through, even when
  -- they hold the approver permission too.
  IF v_req.requested_by IS NOT NULL AND v_req.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'You cannot approve your own cancellation request - another approver must act on it';
  END IF;

  SELECT cr.role_name INTO v_role
  FROM public.user_roles ur JOIN public.custom_roles cr ON cr.id = ur.role_id
  WHERE ur.user_id = auth.uid() LIMIT 1;

  IF p_action = 'decline' THEN
    UPDATE public.billing_receipt_cancel_requests
       SET status='declined', decided_by=auth.uid(), decided_at=now(),
           decision_notes=p_notes, updated_at=now()
     WHERE id = p_request_id;
    INSERT INTO public.billing_receipt_cancel_request_actions
      (request_id, action_type, actor_id, actor_role_name, notes)
      VALUES (p_request_id, 'declined', auth.uid(), v_role, p_notes);
    RETURN QUERY SELECT 'declined'::text,
                        (v_req.receipt_snapshot->>'receipt_number')::text,
                        'Request declined.'::text;
    RETURN;
  END IF;

  -- The receipt vanishing between request and approval is TERMINAL, so close
  -- the request rather than leaving it stuck pending forever. Guard failures
  -- (refund/invoice/online) are different: those RAISE out of the exec helper
  -- and roll back, because they are fixable and the request should survive.
  IF NOT EXISTS (SELECT 1 FROM public.billing_receipts WHERE id = v_req.receipt_id) THEN
    UPDATE public.billing_receipt_cancel_requests
       SET status='failed', decided_by=auth.uid(), decided_at=now(),
           decision_notes='Receipt no longer exists at approval time', updated_at=now()
     WHERE id = p_request_id;
    INSERT INTO public.billing_receipt_cancel_request_actions
      (request_id, action_type, actor_id, actor_role_name, notes)
      VALUES (p_request_id, 'failed', auth.uid(), v_role,
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
         decision_notes=p_notes, updated_at=now()
   WHERE id = p_request_id;
  INSERT INTO public.billing_receipt_cancel_request_actions
    (request_id, action_type, actor_id, actor_role_name, notes)
    VALUES (p_request_id, 'approved', auth.uid(), v_role, p_notes);

  RETURN QUERY SELECT 'approved'::text, v_num::text,
                      'Receipt cancelled and the bill reverted.'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_act_on_receipt_cancellation(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_act_on_receipt_cancellation(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Withdraw (initiator only, while pending).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_withdraw_receipt_cancellation(
  p_request_id uuid,
  p_notes      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.billing_receipt_cancel_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.billing_receipt_cancel_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cancellation request % not found', p_request_id;
  END IF;
  IF v_req.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'This request is already %', v_req.status;
  END IF;
  IF v_req.requested_by IS DISTINCT FROM auth.uid() AND NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'Only the requester can withdraw this request';
  END IF;

  UPDATE public.billing_receipt_cancel_requests
     SET status='withdrawn', updated_at=now() WHERE id = p_request_id;
  INSERT INTO public.billing_receipt_cancel_request_actions
    (request_id, action_type, actor_id, notes)
    VALUES (p_request_id, 'withdrawn', auth.uid(), p_notes);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_withdraw_receipt_cancellation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_withdraw_receipt_cancellation(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Permission grants. A key declared in permissions.ts does NOTHING until it
--    is in a role's JSONB -- and the bypass must close, or the workflow is
--    optional: Accountant Assistant currently holds billing.receipts.delete,
--    the same key that gates direct Void.
-- ---------------------------------------------------------------------------
UPDATE public.custom_roles
   SET permissions = permissions
       || jsonb_build_object('billing.receipts.cancel.request', true,
                             'billing.receipts.cancel.approve', false,
                             'billing.receipts.delete', false)
 WHERE role_name IN ('Accountant Assistant', 'Admission Officer');

UPDATE public.custom_roles
   SET permissions = permissions
       || jsonb_build_object('billing.receipts.cancel.request', true,
                             'billing.receipts.cancel.approve', true)
 WHERE role_name IN ('Chief Accountant', 'Administrator');

-- Everyone else gets the keys present-but-false so Role Management can toggle
-- them without a migration (permissions is a flat {key: boolean} object).
UPDATE public.custom_roles
   SET permissions = jsonb_build_object('billing.receipts.cancel.request', false,
                                        'billing.receipts.cancel.approve', false)
                     || permissions
 WHERE NOT (permissions ? 'billing.receipts.cancel.request');
