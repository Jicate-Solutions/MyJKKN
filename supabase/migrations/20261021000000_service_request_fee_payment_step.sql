-- ============================================================================
-- 2026-10-05 — Service Requests: fee payment step (duplicate ID card, Rs. 200)
--
-- ⚠️ NOT APPLIED — FILE ONLY. Apply out-of-band BEFORE deploying the code:
--      node scripts/apply-migration-file.mjs 20261021000000_service_request_fee_payment_step.sql
--    (no BEGIN/COMMIT here on purpose — exec_sql runs the file as one
--    transaction and cannot nest transaction control).
--
-- THE FLOW THIS ENABLES
-- ---------------------
--   learner requests a duplicate ID card
--     -> HOD / Principal approve              (ordinary approval steps)
--     -> accounts section: Rs. 200 ID Card Fee (a FEE step)
--     -> ID card desk prints and issues        (ordinary last step)
--
-- A FEE step is an approval step with fee_category_id + fee_amount set. When a
-- request reaches it, a bill is raised for the requester in that billing
-- category. Nobody "approves" the step: it completes by itself the moment the
-- bill is paid, by either existing route — the learner pays online from
-- My Bills, or accounts collects cash at the ordinary receipt counter. The
-- request then moves to the next step.
--
-- WHAT THIS DOES NOT TOUCH
-- ------------------------
-- No existing billing object is altered: no column, trigger, policy, function
-- or constraint on billing_student_bills / billing_receipts / billing_categories
-- changes, and no existing category row is updated. The only billing writes are
--   (a) ONE new billing_categories row, 'ID Card Fee', and
--   (b) ordinary fee_source = 'ad_hoc' bill rows — the same shape the transport
--       module already inserts (2,900+ live rows).
-- The request -> bill link lives on service_requests.fee_bill_id and is
-- deliberately NOT a foreign key, so nothing new hangs off the bills table
-- (no RI trigger on bill deletes). A bill that disappears is simply re-raised.
--
-- REPEAT REQUESTS ARE ALLOWED. The bill is keyed to the REQUEST, not the
-- learner, and the category is once_per_learner = false: a learner who loses
-- the card again files a new request and pays again.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. The fee head. Inserted once; no existing category is modified.
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.billing_categories
  (category_name, kind, frequency, amount, collection_type, applies_to,
   visible_to_learners, once_per_learner, is_active, description)
SELECT
  'ID Card Fee',
  'other'::billing_category_kind,
  'one-time',
  200,
  'management',
  '{college}'::text[],
  true,    -- the learner must see it in My Bills to pay online
  false,   -- a card can be lost more than once
  true,
  'Duplicate identity card fee. Raised automatically when an Identity Card '
  || 'service request reaches its fee step (service_request_sync_fee); the '
  || 'card is printed and issued only after this bill is paid.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.billing_categories
  WHERE lower(category_name) = lower('ID Card Fee')
);

-- ────────────────────────────────────────────────────────────────────────
-- 2. Approval steps: the fee-step marker
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.service_request_approval_steps
  ADD COLUMN IF NOT EXISTS fee_category_id uuid REFERENCES public.billing_categories(id),
  ADD COLUMN IF NOT EXISTS fee_amount      numeric(10,2);

ALTER TABLE public.service_request_approval_steps
  DROP CONSTRAINT IF EXISTS sr_approval_steps_fee_pair_chk;
ALTER TABLE public.service_request_approval_steps
  ADD CONSTRAINT sr_approval_steps_fee_pair_chk CHECK (
    (fee_category_id IS NULL AND fee_amount IS NULL)
    OR (fee_category_id IS NOT NULL AND fee_amount > 0)
  );

COMMENT ON COLUMN public.service_request_approval_steps.fee_category_id IS
  'Set (with fee_amount) = FEE step: a bill in this billing category is raised when a request reaches the step, and the step completes when that bill is paid. NULL = ordinary approval step.';

-- ────────────────────────────────────────────────────────────────────────
-- 3. Requests: the bill raised for the fee step
-- ────────────────────────────────────────────────────────────────────────
-- Plain uuid, no FK — see header.
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS fee_bill_id uuid;

CREATE INDEX IF NOT EXISTS idx_service_requests_fee_bill
  ON public.service_requests (fee_bill_id)
  WHERE fee_bill_id IS NOT NULL;

COMMENT ON COLUMN public.service_requests.fee_bill_id IS
  'billing_student_bills.id raised for this request''s fee step (no FK by design). One bill per request.';

-- ────────────────────────────────────────────────────────────────────────
-- 4. service_request_sync_fee — raise the bill / move on once it is paid
-- ────────────────────────────────────────────────────────────────────────
-- Idempotent reconciliation, safe to call any number of times:
--   * request sitting on a fee step with no bill  -> raise it
--   * request sitting on a fee step, bill paid    -> advance (or finish)
--   * anything else                               -> report only
-- service_role only: the API authorises the caller first, then calls this
-- with the service-role client. p_actor is recorded as the bill's creator.
CREATE OR REPLACE FUNCTION public.service_request_sync_fee(
  p_request_id uuid,
  p_actor      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req         record;
  v_step        record;
  v_next_name   text;
  v_bill        record;
  v_learner     record;
  v_cat_name    text;
  v_last        integer;
  v_on_fee_step boolean;
  v_bill_id     uuid;
  v_raised      boolean := false;
  v_advanced    boolean := false;
  v_new_status  public.service_request_status;
  v_now         timestamptz := now();
BEGIN
  SELECT sr.id, sr.request_number, sr.requester_id, sr.institution_id,
         sr.status, sr.current_approval_step, sr.service_type_id, sr.fee_bill_id,
         st.name AS type_name, st.auto_fulfill_on_approval, st.validity_period_days
    INTO v_req
    FROM public.service_requests sr
    JOIN public.service_types st ON st.id = sr.service_type_id
   WHERE sr.id = p_request_id
     FOR UPDATE OF sr;

  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('applicable', false);
  END IF;

  SELECT s.id, s.step_order, s.step_name, s.fee_category_id, s.fee_amount
    INTO v_step
    FROM public.service_request_approval_steps s
   WHERE s.service_type_id = v_req.service_type_id
     AND s.step_order = v_req.current_approval_step
     AND s.is_active;

  v_on_fee_step := v_req.status IN ('submitted', 'in_review')
                   AND v_step.fee_category_id IS NOT NULL
                   AND COALESCE(v_step.fee_amount, 0) > 0;

  IF v_req.fee_bill_id IS NOT NULL THEN
    SELECT b.id, b.status, b.final_amount, b.balance_amount, b.payment_date, b.item_category_id
      INTO v_bill
      FROM public.billing_student_bills b
     WHERE b.id = v_req.fee_bill_id;

    -- The bill was deleted from billing: forget it so a fresh one is raised.
    IF v_bill.id IS NULL THEN
      UPDATE public.service_requests SET fee_bill_id = NULL WHERE id = p_request_id;
      v_req.fee_bill_id := NULL;
    END IF;
  END IF;

  IF v_req.fee_bill_id IS NULL AND NOT v_on_fee_step THEN
    RETURN jsonb_build_object('applicable', false);
  END IF;

  -- ── Raise the bill ────────────────────────────────────────────────────
  IF v_req.fee_bill_id IS NULL THEN
    SELECT lp.id, lp.institution_id
      INTO v_learner
      FROM public.profiles p
      JOIN public.learners_profiles lp ON lp.id = p.learner_id
     WHERE p.id = v_req.requester_id;

    IF v_learner.id IS NULL THEN
      SELECT lp.id, lp.institution_id
        INTO v_learner
        FROM public.profiles p
        JOIN public.learners_profiles lp ON lower(lp.college_email) = lower(p.email)
       WHERE p.id = v_req.requester_id
       LIMIT 1;
    END IF;

    SELECT bc.category_name INTO v_cat_name
      FROM public.billing_categories bc WHERE bc.id = v_step.fee_category_id;

    IF v_learner.id IS NULL
       OR COALESCE(v_learner.institution_id, v_req.institution_id) IS NULL THEN
      RETURN jsonb_build_object(
        'applicable', true, 'on_fee_step', true, 'bill_id', NULL,
        'category_name', v_cat_name, 'amount', v_step.fee_amount,
        'balance', v_step.fee_amount, 'bill_status', 'not_raised',
        'reason', 'no_learner_profile', 'raised', false, 'advanced', false);
    END IF;

    INSERT INTO public.billing_student_bills (
      student_id, institution_id, item_category_id, bill_description, due_date,
      quantity, unit_amount, total_amount, tax_amount, final_amount, balance_amount,
      status, fee_source, remarks, created_by
    ) VALUES (
      v_learner.id,
      COALESCE(v_learner.institution_id, v_req.institution_id),
      v_step.fee_category_id,
      v_cat_name || ' - ' || v_req.request_number,
      (timezone('Asia/Kolkata', v_now))::date + 7,
      1, v_step.fee_amount, v_step.fee_amount, 0, v_step.fee_amount, v_step.fee_amount,
      'unpaid', 'ad_hoc',
      'Raised by service request ' || v_req.request_number || ' (' || v_req.type_name || ')',
      p_actor
    )
    RETURNING id INTO v_bill_id;

    UPDATE public.service_requests SET fee_bill_id = v_bill_id WHERE id = p_request_id;

    INSERT INTO public.service_request_timeline
      (service_request_id, actor_id, event_type, content, metadata)
    VALUES (
      p_request_id, NULL, 'system',
      format('%s of Rs. %s raised. Pay online from My Bills, or in cash at the accounts section.',
             v_cat_name, to_char(v_step.fee_amount, 'FM999999990.00')),
      jsonb_build_object('bill_id', v_bill_id)
    );

    v_raised := true;

    SELECT b.id, b.status, b.final_amount, b.balance_amount, b.payment_date, b.item_category_id
      INTO v_bill
      FROM public.billing_student_bills b
     WHERE b.id = v_bill_id;
  END IF;

  IF v_cat_name IS NULL THEN
    SELECT bc.category_name INTO v_cat_name
      FROM public.billing_categories bc WHERE bc.id = v_bill.item_category_id;
  END IF;

  -- ── Paid: the fee step is done ────────────────────────────────────────
  IF v_on_fee_step AND v_bill.status = 'paid' THEN
    SELECT max(s.step_order) INTO v_last
      FROM public.service_request_approval_steps s
     WHERE s.service_type_id = v_req.service_type_id AND s.is_active;

    IF v_step.step_order >= v_last THEN
      v_new_status := CASE WHEN v_req.auto_fulfill_on_approval
                           THEN 'fulfilled' ELSE 'approved' END;
      UPDATE public.service_requests
         SET status       = v_new_status,
             approved_at  = v_now,
             fulfilled_at = CASE WHEN v_req.auto_fulfill_on_approval THEN v_now ELSE fulfilled_at END,
             validity_expires_at = CASE
               WHEN v_req.auto_fulfill_on_approval AND v_req.validity_period_days IS NOT NULL
               THEN v_now + make_interval(days => v_req.validity_period_days)
               ELSE validity_expires_at END
       WHERE id = p_request_id;
    ELSE
      v_new_status := 'in_review';
      UPDATE public.service_requests
         SET status = 'in_review',
             current_approval_step = v_step.step_order + 1
       WHERE id = p_request_id;

      SELECT s.step_name INTO v_next_name
        FROM public.service_request_approval_steps s
       WHERE s.service_type_id = v_req.service_type_id
         AND s.step_order = v_step.step_order + 1
         AND s.is_active;
    END IF;

    INSERT INTO public.service_request_timeline
      (service_request_id, actor_id, event_type, old_status, new_status, content, metadata)
    VALUES (
      p_request_id, NULL, 'status_change', v_req.status, v_new_status,
      format('%s of Rs. %s received.', v_cat_name, to_char(v_bill.final_amount, 'FM999999990.00'))
        || CASE WHEN v_new_status = 'in_review'
                THEN format(' Proceeding to step %s (%s).', v_step.step_order + 1, COALESCE(v_next_name, 'next step'))
                ELSE '' END,
      jsonb_build_object('bill_id', v_bill.id)
    );

    v_advanced := true;
  END IF;

  RETURN jsonb_build_object(
    'applicable',    true,
    'on_fee_step',   v_on_fee_step AND NOT v_advanced,
    'bill_id',       v_bill.id,
    'category_name', v_cat_name,
    'amount',        v_bill.final_amount,
    'balance',       v_bill.balance_amount,
    'bill_status',   v_bill.status,
    'paid_at',       v_bill.payment_date,
    'raised',        v_raised,
    'advanced',      v_advanced
  );
END;
$$;

REVOKE ALL ON FUNCTION public.service_request_sync_fee(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_request_sync_fee(uuid, uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 5. service_requests_sync_paid_fees — sweep for the approvals inbox
-- ────────────────────────────────────────────────────────────────────────
-- A cash receipt at the counter marks the bill paid without anyone opening the
-- request. The approvals inbox calls this first, so the next person (the ID
-- card desk) finds every paid request already waiting for them. Only requests
-- still parked on a fee step with a paid bill are touched — normally none.
CREATE OR REPLACE FUNCTION public.service_requests_sync_paid_fees()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r     record;
  v_out integer := 0;
BEGIN
  FOR r IN
    SELECT sr.id
      FROM public.service_requests sr
      JOIN public.billing_student_bills b ON b.id = sr.fee_bill_id
      JOIN public.service_request_approval_steps s
        ON s.service_type_id = sr.service_type_id
       AND s.step_order = sr.current_approval_step
       AND s.is_active
       AND s.fee_category_id IS NOT NULL
     WHERE sr.fee_bill_id IS NOT NULL
       AND sr.status IN ('submitted', 'in_review')
       AND b.status = 'paid'
  LOOP
    IF COALESCE((public.service_request_sync_fee(r.id, NULL) ->> 'advanced')::boolean, false) THEN
      v_out := v_out + 1;
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.service_requests_sync_paid_fees() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_requests_sync_paid_fees() TO service_role;

-- ────────────────────────────────────────────────────────────────────────
-- 6. Identity Card types: no cap on requests in progress
-- ────────────────────────────────────────────────────────────────────────
-- A learner may ask for a card as often as needed, including while an earlier
-- request is still open. max_active_requests = 0 means "no limit":
-- ServiceRequestService.createRequest only enforces the cap when it is > 0.
-- Each request still raises (and must clear) its own bill.
UPDATE public.service_types
   SET max_active_requests = 0
 WHERE slug LIKE 'identity-card-%'
   AND max_active_requests <> 0;
