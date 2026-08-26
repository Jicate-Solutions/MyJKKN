-- Make "the last status change" tie-safe.
--
-- 20260825180000 picked the row to undo with ORDER BY changed_at DESC LIMIT 1.
-- learners_profile_status_history.changed_at defaults to now(), which is the
-- TRANSACTION timestamp — every row written inside one transaction carries the
-- identical value, and id is a random uuid so it cannot break the tie. The
-- ordering was therefore arbitrary whenever a transaction wrote more than one
-- status change, and a manual override tying with an automatic promotion could
-- lose the coin toss and be silently reverted. Caught by the safety test for
-- rule 1, which demoted a manual 'admitted' it was written to protect.
--
-- Now: take the whole tied set as "the last change", REFUSE outright if any
-- row in it is not an automatic fee-driven promotion, and then undo only the
-- auto row whose to_status is where the learner actually sits. Ambiguity
-- resolves to "do nothing", which is the correct default for a demotion.

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
  v_last_at     timestamptz;
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

  SELECT max(h.changed_at) INTO v_last_at
  FROM public.learners_profile_status_history h
  WHERE h.learner_id = p_learner_id;

  IF v_last_at IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'reverted', false, 'reason', 'no_history');
  END IF;

  -- Safety rule 1, tie-safe: if ANYTHING in the newest set of changes was not
  -- an automatic fee-driven promotion, leave the learner alone entirely.
  IF EXISTS (
    SELECT 1 FROM public.learners_profile_status_history h
    WHERE h.learner_id = p_learner_id
      AND h.changed_at = v_last_at
      AND (h.reason_code IS NULL
           OR h.reason_code NOT IN ('auto_item_rule', 'auto_universal_paid', 'auto_threshold'))
  ) THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'reverted', false,
      'reason', 'last_change_not_auto');
  END IF;

  -- Safety rule 2: undo only the promotion that put them where they now are.
  SELECT * INTO v_last
  FROM public.learners_profile_status_history h
  WHERE h.learner_id = p_learner_id
    AND h.changed_at = v_last_at
    AND h.to_status::text = v_status::text
    AND h.reason_code IN ('auto_item_rule', 'auto_universal_paid', 'auto_threshold')
  LIMIT 1;

  IF v_last.learner_id IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'reverted', false,
      'reason', 'moved_on_since', 'current_status', v_status::text);
  END IF;

  IF v_last.from_status IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'reverted', false,
      'reason', 'no_from_status');
  END IF;

  -- Re-test the SAME condition that granted the promotion. The expressions are
  -- lifted verbatim from evaluate_learner_status_after_payment so the two
  -- directions cannot disagree about what "settled" means.
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

    -- No matching status row means nothing to re-test; keep the promotion.
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
    RETURN jsonb_build_object('learner_id', p_learner_id, 'reverted', false, 'reason', 'raced');
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
