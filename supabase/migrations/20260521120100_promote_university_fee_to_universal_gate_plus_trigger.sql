-- ============================================================================
-- 20260521120100 — Promote 'university_fee' to a universal gating category +
--                  wire AFTER-UPDATE trigger so paid bills auto-promote
--                  learner lifecycle
-- ============================================================================
-- Step 2 of a 2-migration sequence (see 20260521120000 for enum addition).
--
-- Three things happen here, atomically per migration:
--   1) Reclassify any billing_categories row named "University Fee" from
--      kind='other' to kind='university_fee'.
--   2) CREATE OR REPLACE evaluate_learner_status_after_payment — change
--      Gate A condition #2 from `bc.kind = 'tuition'` to
--      `bc.kind = 'university_fee'`. The RPC now requires
--      (application_fee bills all paid) + (university_fee bills all paid)
--      to promote 'account' → 'reserved'. The big multi-year tuition
--      stays as kind='tuition' and is no longer the universal gate; it
--      still counts toward the threshold-based Gate B (paid_pct >= 50%
--      promotes to 'admitted').
--   3) Add fn_evaluate_status_after_bill_paid + trigger on
--      billing_student_bills (AFTER UPDATE) that fires the RPC when a
--      bill's status flips to 'paid'. Previously NO trigger called the
--      RPC at all — auto-promotion was documented but only fired via the
--      /admission/tools/re-evaluate-learner manual tool. This closes that
--      gap.
-- ============================================================================

-- 1) Reclassify "University Fee" category(ies)
UPDATE public.billing_categories
   SET kind = 'university_fee'
 WHERE category_name ILIKE '%university%fee%'
   AND kind = 'other';

-- 2) RPC update — change Gate A condition #2 to check 'university_fee'
--    instead of 'tuition'. Full body re-emitted so the function stays in
--    one place; only the WHERE bc.kind = 'university_fee' line is new.

CREATE OR REPLACE FUNCTION public.evaluate_learner_status_after_payment(p_learner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status        lifecycle_status;
  v_paid_pct              numeric;
  v_app_paid              boolean;
  v_universals_paid       boolean;
  v_threshold             numeric;
  v_target_code           text;
  v_updated               boolean := false;
  v_universal_target      text;
  v_promoted_to_universal boolean := false;
  v_promoted_to_threshold boolean := false;
BEGIN
  SELECT lp.lifecycle_status INTO v_current_status
  FROM public.learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false, 'reason', 'not_found');
  END IF;

  IF v_current_status::text NOT IN ('account', 'reserved') THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false,
      'reason', 'no_op_for_status', 'current_status', v_current_status::text);
  END IF;

  SELECT v.paid_pct, v.application_fee_paid
    INTO v_paid_pct, v_app_paid
  FROM public.vw_learner_payment_progress v
  WHERE v.learner_id = p_learner_id;

  v_paid_pct := COALESCE(v_paid_pct, 0);
  v_app_paid := COALESCE(v_app_paid, false);

  -- Gate A condition #2: all university_fee bills must be fully paid.
  -- Was bc.kind = 'tuition' before 2026-05-21; switched per product call —
  -- the small University Fee is the universal gate, not the multi-year
  -- tuition (which now only counts toward the threshold-based Gate B).
  -- Edge case: learner with zero university_fee bills -> bool_and over
  -- empty set = NULL -> treat as false so a no-bill learner doesn't get
  -- auto-promoted.
  SELECT COALESCE(bool_and(b.status::text = 'paid'), false)
    INTO v_universals_paid
  FROM public.billing_student_bills b
  JOIN public.billing_categories bc ON bc.id = b.item_category_id
  WHERE b.student_id = p_learner_id
    AND bc.kind = 'university_fee'
    AND b.status::text <> 'superseded';

  -- ───────────────────────────────────────────────────────────────────────
  -- GATE A: 'account' + app_fee paid + university_fee fully paid -> 'reserved'
  -- ───────────────────────────────────────────────────────────────────────
  IF v_current_status::text = 'account' AND v_app_paid = true AND v_universals_paid = true THEN
    SELECT s.code INTO v_universal_target
    FROM public.admission_statuses s
    WHERE s.scope = 'learner'
      AND s.is_active = true
      AND s.auto_promote_when_universal_paid = true
    LIMIT 1;

    IF v_universal_target IS NOT NULL THEN
      UPDATE public.learners_profiles
         SET lifecycle_status = v_universal_target::lifecycle_status
       WHERE id = p_learner_id
         AND lifecycle_status::text = 'account';

      GET DIAGNOSTICS v_updated = ROW_COUNT;

      IF v_updated > 0 THEN
        INSERT INTO public.learners_profile_status_history
          (learner_id, from_status, to_status, reason_code, paid_pct_at_change,
           threshold_at_change, changed_by, metadata)
        VALUES
          (p_learner_id, 'account'::lifecycle_status, v_universal_target::lifecycle_status,
           'auto_universal_paid', v_paid_pct, NULL, NULL,
           jsonb_build_object('rpc', 'evaluate_learner_status_after_payment',
                              'application_fee_paid', v_app_paid,
                              'university_fee_paid', v_universals_paid));
        v_current_status := v_universal_target::lifecycle_status;
        v_promoted_to_universal := true;
      END IF;
    END IF;
  END IF;

  -- ───────────────────────────────────────────────────────────────────────
  -- GATE B: 'account'/'reserved' + paid_pct >= threshold -> 'admitted'
  -- ───────────────────────────────────────────────────────────────────────
  IF v_current_status::text IN ('account', 'reserved') THEN
    SELECT s.code, s.fee_paid_threshold_percent
      INTO v_target_code, v_threshold
    FROM public.admission_statuses s
    WHERE s.scope = 'learner'
      AND s.is_active = true
      AND s.fee_paid_threshold_percent IS NOT NULL
      AND s.gates_login = false
      AND s.auto_promote_when_universal_paid = false
      AND v_paid_pct >= s.fee_paid_threshold_percent
    ORDER BY s.fee_paid_threshold_percent DESC
    LIMIT 1;

    IF v_target_code IS NOT NULL THEN
      UPDATE public.learners_profiles
         SET lifecycle_status = v_target_code::lifecycle_status
       WHERE id = p_learner_id
         AND lifecycle_status::text IN ('account', 'reserved');

      GET DIAGNOSTICS v_updated = ROW_COUNT;

      IF v_updated > 0 THEN
        INSERT INTO public.learners_profile_status_history
          (learner_id, from_status, to_status, reason_code, paid_pct_at_change,
           threshold_at_change, changed_by, metadata)
        VALUES
          (p_learner_id, v_current_status, v_target_code::lifecycle_status,
           'auto_threshold', v_paid_pct, v_threshold, NULL,
           jsonb_build_object('rpc', 'evaluate_learner_status_after_payment',
                              'cascaded_from_universal', v_promoted_to_universal));
        v_promoted_to_threshold := true;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'learner_id', p_learner_id,
    'updated', (v_promoted_to_universal OR v_promoted_to_threshold),
    'promoted_to_universal', v_promoted_to_universal,
    'promoted_to_threshold', v_promoted_to_threshold,
    'final_status', v_current_status::text,
    'paid_pct', v_paid_pct,
    'application_fee_paid', v_app_paid,
    'university_fee_paid', v_universals_paid,
    'threshold', v_threshold
  );
END;
$function$;

-- 3) Trigger function + trigger on billing_student_bills
--    Fires the RPC whenever a bill's status flips to 'paid'. Idempotent —
--    the RPC short-circuits for learners not in account/reserved. Failure
--    inside the RPC is swallowed (logged as NOTICE) so a bug in the RPC
--    never blocks an operator from marking a bill as paid.

CREATE OR REPLACE FUNCTION public.fn_evaluate_status_after_bill_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act on status transitions INTO 'paid' from anything else.
  -- Bills that re-update while already paid (e.g., remarks edit) don't
  -- need to re-trigger the RPC.
  IF NEW.status::text = 'paid' AND COALESCE(OLD.status::text, '') <> 'paid' THEN
    BEGIN
      PERFORM public.evaluate_learner_status_after_payment(NEW.student_id);
    EXCEPTION WHEN OTHERS THEN
      -- Swallow the error — operator marking a bill paid must not be
      -- blocked by a status-evaluation bug. The bill update completes;
      -- a later manual re-evaluate (from the admission tools page) will
      -- pick up the missed promotion.
      RAISE NOTICE 'evaluate_learner_status_after_payment failed for learner %: %',
        NEW.student_id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evaluate_status_after_bill_paid
  ON public.billing_student_bills;

CREATE TRIGGER trg_evaluate_status_after_bill_paid
  AFTER UPDATE OF status ON public.billing_student_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_evaluate_status_after_bill_paid();
