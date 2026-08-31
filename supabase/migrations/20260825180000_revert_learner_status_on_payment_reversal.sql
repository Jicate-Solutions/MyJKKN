-- Step a learner's lifecycle status back when the payment that promoted them
-- is reversed.
--
-- evaluate_learner_status_after_payment is a one-way ratchet by construction:
--
--   IF v_current_status::text NOT IN ('account', 'reserved') THEN
--     RETURN ... 'no_op_for_status';
--
-- Once a learner leaves account/reserved it never looks at them again, and
-- nothing called anything at all on a reversal — _fn_exec_receipt_void reverts
-- the bill and stops. Observed 2026-08-25 on learner 961112d3: a 40,000
-- receipt settled the first instalment (promotes_to_status_code='admitted'),
-- the receipt was then cancelled, the bill went back to unpaid with the full
-- 106,000 outstanding — and the learner stayed 'admitted' with nothing paid.
--
-- Three safety rules, because demotion is far more dangerous than promotion:
--   1. ONLY undo automatic promotions. A manual status change is never
--      reverted by a payment movement — an admin who set 'admitted' by hand
--      means it.
--   2. ONLY if the learner still sits exactly where the rule put them. If they
--      have since moved on (active, graduated, …) leave them alone.
--   3. Log every reversal to learners_profile_status_history, so a demotion is
--      as auditable as the promotion that preceded it.

CREATE OR REPLACE FUNCTION public.fn_reevaluate_learner_status_after_reversal(
  p_learner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status      lifecycle_status;
  v_last        public.learners_profile_status_history%ROWTYPE;
  v_still_holds boolean := true;
  v_gate_bills  integer := 0;
  v_gate_paid   integer := 0;
  v_pct_billed  numeric;
  v_pct_due     numeric;
  v_pct_due_cy  numeric;
  v_used_pct    numeric;
  v_updated     integer := 0;
BEGIN
  SELECT lp.lifecycle_status INTO v_status
  FROM public.learners_profiles lp WHERE lp.id = p_learner_id;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'reverted', false, 'reason', 'not_found');
  END IF;

  SELECT * INTO v_last
  FROM public.learners_profile_status_history h
  WHERE h.learner_id = p_learner_id
  ORDER BY h.changed_at DESC
  LIMIT 1;

  -- Safety rule 1: only automatic, fee-driven promotions are reversible.
  IF v_last.learner_id IS NULL
     OR v_last.reason_code NOT IN ('auto_item_rule', 'auto_universal_paid', 'auto_threshold')
  THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'reverted', false,
      'reason', 'last_change_not_auto', 'reason_code', v_last.reason_code);
  END IF;

  -- Safety rule 2: they must still be sitting where that promotion put them.
  IF v_status::text IS DISTINCT FROM v_last.to_status::text THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'reverted', false,
      'reason', 'moved_on_since', 'current_status', v_status::text);
  END IF;

  IF v_last.from_status IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'reverted', false,
      'reason', 'no_from_status');
  END IF;

  -- Re-test the SAME condition that granted the promotion. The expressions
  -- below are lifted verbatim from evaluate_learner_status_after_payment so
  -- the two directions cannot disagree about what "settled" means.
  IF v_last.reason_code = 'auto_item_rule' THEN
    WITH tranche AS (
      SELECT
        i.promotes_to_status_code AS target,
        (LEAST(
           GREATEST(
             GREATEST(0, b.final_amount - COALESCE(b.balance_amount, b.final_amount))
             - COALESCE(SUM(i.amount) OVER (
                 PARTITION BY i.bill_id ORDER BY i.due_date, i.sequence_no
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0),
             0),
           i.amount) >= i.amount) AS settled
      FROM public.billing_bill_instalments i
      JOIN public.billing_student_bills b ON b.id = i.bill_id
      WHERE b.student_id = p_learner_id
        AND b.status::text NOT IN ('cancelled', 'superseded')
    ),
    unscheduled AS (
      SELECT
        fsi.promotes_to_status_code AS target,
        (COALESCE(b.status::text = 'paid', false)
         OR COALESCE(b.balance_amount, b.final_amount) <= 0) AS settled
      FROM public.billing_student_bills b
      JOIN public.admission_fee_structure_items fsi ON fsi.id = b.fee_structure_item_id
      WHERE b.student_id = p_learner_id
        AND b.status::text NOT IN ('cancelled', 'superseded')
        AND NOT EXISTS (SELECT 1 FROM public.billing_bill_instalments i WHERE i.bill_id = b.id)
    ),
    rule_rows AS (
      SELECT target, settled FROM tranche     WHERE target IS NOT NULL
      UNION ALL
      SELECT target, settled FROM unscheduled WHERE target IS NOT NULL
    )
    SELECT EXISTS (SELECT 1 FROM rule_rows r WHERE r.target = v_last.to_status::text)
       AND NOT EXISTS (SELECT 1 FROM rule_rows r WHERE r.target = v_last.to_status::text AND NOT r.settled)
    INTO v_still_holds;

  ELSIF v_last.reason_code = 'auto_universal_paid' THEN
    SELECT
      count(*) FILTER (WHERE bc.kind IN ('application_fee','university_fee')),
      count(*) FILTER (WHERE bc.kind IN ('application_fee','university_fee')
          AND (b.status::text = 'paid'
               OR (b.final_amount - COALESCE(b.balance_amount, b.final_amount)) > 0
               OR (b.final_amount = 0 AND COALESCE(b.balance_amount, 0) = 0)))
    INTO v_gate_bills, v_gate_paid
    FROM public.billing_student_bills b
    JOIN public.billing_categories bc ON bc.id = b.item_category_id
    WHERE b.student_id = p_learner_id
      AND b.status::text <> 'superseded';

    v_still_holds := (v_gate_bills > 0 AND v_gate_paid = v_gate_bills);

  ELSE -- auto_threshold
    SELECT v.pct_billed_to_date, v.pct_due_to_date, v.pct_due_current_year
      INTO v_pct_billed, v_pct_due, v_pct_due_cy
    FROM public.vw_learner_payment_progress v
    WHERE v.learner_id = p_learner_id;

    SELECT CASE s.threshold_basis
             WHEN 'billed_to_date'           THEN COALESCE(v_pct_billed, 0)
             WHEN 'due_to_date_current_year' THEN COALESCE(v_pct_due_cy, 0)
             ELSE                                 COALESCE(v_pct_due, 0)
           END >= s.fee_paid_threshold_percent,
           CASE s.threshold_basis
             WHEN 'billed_to_date'           THEN COALESCE(v_pct_billed, 0)
             WHEN 'due_to_date_current_year' THEN COALESCE(v_pct_due_cy, 0)
             ELSE                                 COALESCE(v_pct_due, 0)
           END
      INTO v_still_holds, v_used_pct
    FROM public.admission_statuses s
    WHERE s.scope = 'learner' AND s.code = v_last.to_status::text
    LIMIT 1;

    v_still_holds := COALESCE(v_still_holds, true);
  END IF;

  IF v_still_holds THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'reverted', false,
      'reason', 'condition_still_holds', 'current_status', v_status::text);
  END IF;

  UPDATE public.learners_profiles
     SET lifecycle_status = v_last.from_status
   WHERE id = p_learner_id
     AND lifecycle_status::text = v_last.to_status::text;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'reverted', false,
      'reason', 'raced');
  END IF;

  INSERT INTO public.learners_profile_status_history
    (learner_id, from_status, to_status, reason_code, paid_pct_at_change,
     threshold_at_change, changed_by, metadata)
  VALUES
    (p_learner_id, v_last.to_status, v_last.from_status,
     'auto_reverted_on_payment_reversal', v_used_pct, NULL, NULL,
     jsonb_build_object('rpc', 'fn_reevaluate_learner_status_after_reversal',
                        'undid_reason_code', v_last.reason_code,
                        'undid_changed_at',  v_last.changed_at));

  RETURN jsonb_build_object('learner_id', p_learner_id, 'reverted', true,
    'from_status', v_last.to_status::text, 'to_status', v_last.from_status::text,
    'undid_reason_code', v_last.reason_code);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_reevaluate_learner_status_after_reversal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_reevaluate_learner_status_after_reversal(uuid) TO authenticated, service_role;

-- ── Fire on ANY reversal, not just receipt cancellation ─────────────────────
--
-- Keyed on the paid amount DROPPING rather than on a particular workflow, so
-- cancellation, a direct void, a refund disbursement and a manual bill edit
-- are all covered by one mechanism with no path left uncovered.

CREATE OR REPLACE FUNCTION public._fn_learner_status_on_bill_payment_drop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_paid numeric;
  v_new_paid numeric;
BEGIN
  IF NEW.student_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_old_paid := GREATEST(0, OLD.final_amount - COALESCE(OLD.balance_amount, OLD.final_amount));
  v_new_paid := GREATEST(0, NEW.final_amount - COALESCE(NEW.balance_amount, NEW.final_amount));

  IF v_new_paid < v_old_paid THEN
    -- Never let a status re-evaluation fail the reversal that triggered it.
    BEGIN
      PERFORM public.fn_reevaluate_learner_status_after_reversal(NEW.student_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'learner status re-evaluation failed for %: %', NEW.student_id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_learner_status_on_bill_payment_drop
  ON public.billing_student_bills;

-- AFTER, so the reverted balance is already visible to the re-evaluation.
CREATE TRIGGER trg_learner_status_on_bill_payment_drop
  AFTER UPDATE OF balance_amount, final_amount, status ON public.billing_student_bills
  FOR EACH ROW
  EXECUTE FUNCTION public._fn_learner_status_on_bill_payment_drop();

-- Repair the learners already stranded by the missing path. Swept 2026-08-25:
-- exactly one, the receipt-cancellation test case.
DO $$
DECLARE
  r record;
  v_result jsonb;
  v_count integer := 0;
BEGIN
  FOR r IN
    WITH last_change AS (
      SELECT DISTINCT ON (h.learner_id) h.learner_id, h.to_status, h.reason_code
      FROM public.learners_profile_status_history h
      ORDER BY h.learner_id, h.changed_at DESC
    )
    SELECT lc.learner_id
    FROM last_change lc
    JOIN public.learners_profiles lp ON lp.id = lc.learner_id
    WHERE lc.reason_code IN ('auto_item_rule','auto_universal_paid','auto_threshold')
      AND lp.lifecycle_status::text = lc.to_status::text
  LOOP
    v_result := public.fn_reevaluate_learner_status_after_reversal(r.learner_id);
    IF (v_result->>'reverted')::boolean THEN
      v_count := v_count + 1;
      RAISE NOTICE 'reverted % : % -> %', r.learner_id,
        v_result->>'from_status', v_result->>'to_status';
    END IF;
  END LOOP;
  RAISE NOTICE 'backfill complete, % learner(s) reverted', v_count;
END $$;
