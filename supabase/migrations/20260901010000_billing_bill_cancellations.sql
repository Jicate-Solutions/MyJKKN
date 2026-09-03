-- Bill cancellation with mandatory evidence, 2026-09-01.
--
-- THE PROBLEM THIS SOLVES:
--   Cancelling a learner bill voids real money -- it removes the amount from
--   what the learner owes -- and until now it took one click with NO reason,
--   NO document, and NO audit record. StudentBillService.cancelStudentBill()
--   has always ACCEPTED a `reason` argument, but the only single-bill caller
--   (billing/schedule/_components/row-actions.tsx) never passed one. The
--   argument was dead code.
--
--   The database confirms it: 40 bills sit in status='cancelled' and
--   user_activity_logs holds ZERO rows with sub_type='bill_cancel', while the
--   same logger wrote 5,064 'student_bill' rows over the same period. Nobody
--   has ever cancelled a bill through the app -- all 40 arrived via direct SQL,
--   which is also why 38 of them still carry a non-zero balance_amount the
--   service is supposed to zero. (Repaired in the companion migration.)
--
-- WHY A DEFINER RPC AND A TRIGGER, RATHER THAN A CHECK IN THE SERVICE LAYER:
--   The UPDATE policy on billing_student_bills reads
--     is_super_admin() OR is_admin()
--     OR (user_has_permission('billing.schedule.update')
--         AND role_has_institution_access(institution_id))
--   so anyone who can fix a typo in a bill -- and anyone is_admin() considers
--   an admin, with no permission key at all -- can PATCH status='cancelled'
--   straight from a browser console and never see the dialog. A service-layer
--   guard would be decorative. The RPC below is the only authorised route in,
--   and trg_billing_bills_guard_cancel closes every other one.
--
-- WHY BILLS WITH RECEIPTED MONEY ARE REFUSED OUTRIGHT:
--   lib/billing/bill-status.ts documents the accounting consequence: a
--   cancelled bill raises `total` while contributing nothing to `outstanding`,
--   and the bills table derives `paid = total - outstanding`, so the gap is
--   silently reported as money received. Cancel a bill that has a receipt
--   against it and that receipt's money is orphaned onto a void bill. One row
--   in production is already in this state (a cancelled bill holding Rs 2,500).
--   The receipt must be cancelled first -- that flow already exists
--   (fn_request_receipt_cancellation), and it un-settles the bill on approval,
--   which is exactly the state this RPC then accepts.
--   NOTE the practical effect: 'partially_paid' is listed as a cancellable
--   status for symmetry with the pre-existing allow-list, but a partially paid
--   bill ALWAYS has a receipt, so it is always refused by the money guard with
--   a message naming the receipt to cancel. That is deliberate.

-- ---------------------------------------------------------------------------
-- 1. The audit record. One row per cancellation, written only by the RPC.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_bill_cancellations (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id                     uuid NOT NULL
                              REFERENCES public.billing_student_bills(id) ON DELETE CASCADE,
  institution_id              uuid NOT NULL,
  student_id                  uuid NOT NULL,
  reason_code                 text NOT NULL
                              CHECK (reason_code IN ('duplicate_bill','raised_in_error','fee_waived',
                                                     'learner_withdrawn','structure_corrected','other')),
  reason                      text NOT NULL,
  -- [{name, drive_file_id, drive_url, mime, size}] -- Google Drive, same shape
  -- and same reason as billing_refund_request_actions.attachments: Supabase
  -- Storage quota is not spent on documents that are read a handful of times.
  attachments                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The bill as it stood at cancel time. The bill row survives (status flips to
  -- 'cancelled'), but its amounts can still be edited afterwards by anyone with
  -- billing.schedule.update, so the figures behind the decision are frozen here.
  bill_snapshot               jsonb NOT NULL DEFAULT '{}'::jsonb,
  amount_cancelled            numeric NOT NULL,
  -- Identity SNAPSHOTS. A profile can be renamed, have its email changed or be
  -- deactivated long after the fact; the uuid alone cannot answer "who voided
  -- this bill" years later. Same rationale as billing_receipt_cancel_requests.
  cancelled_by                uuid,
  cancelled_by_name           text,
  cancelled_by_email          text,
  cancelled_by_role           text,
  cancelled_by_is_super_admin boolean,
  cancelled_at                timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- A bill is cancelled at most once. Nothing un-cancels a bill today, so this is
-- a plain unique index rather than a partial one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_cancellation_per_bill
  ON public.billing_bill_cancellations (bill_id);

CREATE INDEX IF NOT EXISTS idx_bill_cancellations_student
  ON public.billing_bill_cancellations (student_id, cancelled_at DESC);
CREATE INDEX IF NOT EXISTS idx_bill_cancellations_institution
  ON public.billing_bill_cancellations (institution_id, cancelled_at DESC);

-- Supabase default-grants new public tables to the anon key shipped in every
-- page of jkkn.ai; RLS is not a substitute. REVOKE FROM public does NOT cover
-- anon -- the grants are separate -- so anon is named explicitly.
REVOKE ALL ON TABLE public.billing_bill_cancellations FROM anon, PUBLIC;

ALTER TABLE public.billing_bill_cancellations ENABLE ROW LEVEL SECURITY;

-- SELECT-only, and ONE permissive policy rather than several ORed together:
-- multiple permissive policies are all evaluated per candidate row.
-- auth helpers are wrapped in scalar subqueries so they become InitPlans
-- evaluated once per query instead of once per row.
DROP POLICY IF EXISTS billing_bill_cancellations_select ON public.billing_bill_cancellations;
CREATE POLICY billing_bill_cancellations_select
  ON public.billing_bill_cancellations FOR SELECT
  USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR (
      role_has_institution_access(institution_id)
      AND (
        (SELECT user_has_permission('billing.schedule.view'))
        OR (SELECT user_has_permission('billing.bills.view'))
      )
    )
  );

-- No UPDATE and no DELETE policy, deliberately. Every write goes through the
-- RPC below, so the trail cannot be edited by whoever it incriminates.

-- ---------------------------------------------------------------------------
-- 2. Permission key. billing.schedule.cancel is SEPARATE from .update so that
--    correcting a typo and voiding Rs 3.5 lakh stop being the same right.
--    A key declared in lib/constants/permissions.ts does NOTHING until it is
--    in a role's JSONB, so it is granted here in the same migration.
-- ---------------------------------------------------------------------------
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('billing.schedule.cancel', true)
 WHERE role_name IN ('Chief Accountant', 'Administrator');

-- Everyone else gets the key present-but-false so Role Management can toggle it
-- without another migration. `permissions ? key` is the correct test HERE: this
-- asks whether the key EXISTS, not whether it is granted.
UPDATE public.custom_roles
   SET permissions = jsonb_build_object('billing.schedule.cancel', false) || permissions
 WHERE NOT (permissions ? 'billing.schedule.cancel');

-- ---------------------------------------------------------------------------
-- 3. The only authorised way to cancel a bill.
-- ---------------------------------------------------------------------------
-- Dropped first because the RETURNS TABLE shape below is authoritative for the
-- activity log: institution_id and the description come back FROM THE BILL, so
-- the log entry cannot be shaped by whatever the client chose to send.
DROP FUNCTION IF EXISTS public.fn_cancel_student_bill(uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.fn_cancel_student_bill(
  p_bill_id     uuid,
  p_reason_code text,
  p_reason      text,
  p_attachments jsonb
)
RETURNS TABLE(cancellation_id uuid, cancelled_bill_id uuid, amount_cancelled numeric,
              institution_id uuid, student_id uuid, bill_description text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bill      public.billing_student_bills%ROWTYPE;
  v_receipted numeric;
  v_refs      text;
  v_id        uuid;
  v_name      text;
  v_email     text;
  v_role      text;
  v_super     boolean;
  v_category  text;
BEGIN
  SELECT * INTO v_bill FROM public.billing_student_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill % not found', p_bill_id;
  END IF;

  -- Authorization first, so an unauthorised caller learns nothing about the
  -- bill's state from the error message.
  IF NOT (
    is_super_admin()
    OR (user_has_permission('billing.schedule.cancel')
        AND role_has_institution_access(v_bill.institution_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to cancel bills for this institution';
  END IF;

  IF v_bill.status = 'cancelled' THEN
    RAISE EXCEPTION 'This bill is already cancelled';
  END IF;

  IF v_bill.status NOT IN ('unpaid', 'partially_paid', 'overdue') THEN
    RAISE EXCEPTION 'Cannot cancel a bill with status "%". Only unpaid, partially paid or overdue bills can be cancelled.',
      v_bill.status;
  END IF;

  -- Money guard. See the header: a receipt pointing at a void bill is silently
  -- reported as collected revenue.
  SELECT COALESCE(SUM(ri.amount_paid), 0),
         string_agg(DISTINCT r.receipt_number, ', ')
    INTO v_receipted, v_refs
  FROM public.billing_receipt_items ri
  JOIN public.billing_receipts r ON r.id = ri.receipt_id
  WHERE ri.bill_id = p_bill_id;

  IF v_receipted > 0 THEN
    RAISE EXCEPTION 'Cannot cancel: Rs % is receipted against this bill (%). Cancel that receipt first, then cancel the bill.',
      to_char(v_receipted, 'FM99,99,99,999.00'), COALESCE(v_refs, 'receipt unknown');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required';
  END IF;

  IF p_attachments IS NULL
     OR jsonb_typeof(p_attachments) <> 'array'
     OR jsonb_array_length(p_attachments) < 1 THEN
    RAISE EXCEPTION 'At least one supporting document must be attached before a bill can be cancelled';
  END IF;

  SELECT p.full_name, p.email, COALESCE(p.is_super_admin, false)
    INTO v_name, v_email, v_super
  FROM public.profiles p WHERE p.id = auth.uid();

  SELECT cr.role_name INTO v_role
  FROM public.user_roles ur JOIN public.custom_roles cr ON cr.id = ur.role_id
  WHERE ur.user_id = auth.uid() LIMIT 1;

  SELECT bc.category_name INTO v_category
  FROM public.billing_categories bc WHERE bc.id = v_bill.item_category_id;

  INSERT INTO public.billing_bill_cancellations (
    bill_id, institution_id, student_id, reason_code, reason, attachments,
    bill_snapshot, amount_cancelled,
    cancelled_by, cancelled_by_name, cancelled_by_email, cancelled_by_role,
    cancelled_by_is_super_admin
  ) VALUES (
    p_bill_id, v_bill.institution_id, v_bill.student_id,
    p_reason_code, trim(p_reason), p_attachments,
    jsonb_build_object('bill_description', v_bill.bill_description,
                       'final_amount',     v_bill.final_amount,
                       'balance_amount',   v_bill.balance_amount,
                       'status',           v_bill.status,
                       'due_date',         v_bill.due_date,
                       'fee_source',       v_bill.fee_source,
                       'category_name',    v_category),
    v_bill.final_amount,
    auth.uid(), v_name, v_email, v_role, v_super
  ) RETURNING id INTO v_id;

  -- Transaction-local flag the guard trigger below looks for. Set AFTER every
  -- check has passed, and only for this one bill id.
  PERFORM set_config('app.bill_cancel_ctx', p_bill_id::text, true);

  UPDATE public.billing_student_bills
     SET status         = 'cancelled',
         balance_amount = 0,
         updated_at     = now()
   WHERE id = p_bill_id;

  PERFORM set_config('app.bill_cancel_ctx', '', true);

  RETURN QUERY SELECT v_id, p_bill_id, v_bill.final_amount,
                      v_bill.institution_id, v_bill.student_id,
                      COALESCE(v_bill.bill_description, v_category, 'Student bill');
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cancel_student_bill(uuid, text, text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cancel_student_bill(uuid, text, text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Close every other route into status='cancelled'.
--    Without this the document requirement is advisory: the UPDATE policy lets
--    any billing.schedule.update holder set the status directly.
--    Only transitions INTO 'cancelled' are guarded -- editing a bill that is
--    already cancelled (the balance repair migration, for instance) is
--    untouched, and 'superseded' is a different status with its own flow.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_bill_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF COALESCE(current_setting('app.bill_cancel_ctx', true), '') <> NEW.id::text THEN
      RAISE EXCEPTION 'Bills must be cancelled through fn_cancel_student_bill, which records the reason and supporting documents. Direct status updates are not permitted.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_billing_bills_guard_cancel ON public.billing_student_bills;
CREATE TRIGGER trg_billing_bills_guard_cancel
  BEFORE UPDATE ON public.billing_student_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_bill_cancellation();
