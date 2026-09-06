-- Phase 4: Extend evaluate_learner_status_after_payment to support multi-tier promotion.
--
-- New gates (in order):
--   GATE A: From 'account', if both kind='application_fee' AND kind='tuition' bills are
--           fully paid (status='paid'), promote to the status with
--           auto_promote_when_universal_paid=true (i.e., 'reserved').
--   GATE B: From 'account' or 'reserved', if paid_pct >= fee_paid_threshold_percent on
--           a configured status (e.g., 'admitted' at 50%), promote to that status.
--           Excludes gates_login=true statuses (e.g., 'active') because those require
--           additional profile-completeness checks handled by
--           LearnerProfileService.checkAndAutoActivate() in the application layer.
--
-- Triggered by trg_evaluate_status_after_payment AFTER INSERT on billing_receipt_items.
-- Both gates can fire sequentially in a single invocation (account -> reserved -> admitted
-- if a single large payment clears both).

BEGIN;

CREATE OR REPLACE FUNCTION public.evaluate_learner_status_after_payment(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_current_status   lifecycle_status;
  v_paid_pct         numeric;
  v_app_paid         boolean;
  v_tuition_paid     boolean;
  v_threshold        numeric;
  v_target_code      text;
  v_updated          integer := 0;
  v_universal_target text;
  v_promoted_to_universal boolean := false;
  v_promoted_to_threshold boolean := false;
BEGIN
  SELECT lp.lifecycle_status INTO v_current_status
  FROM public.learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false, 'reason', 'not_found');
  END IF;

  -- Only auto-promote from 'account' or 'reserved' (sequential gates).
  IF v_current_status::text NOT IN ('account', 'reserved') THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false,
      'reason', 'no_op_for_status', 'current_status', v_current_status::text);
  END IF;

  -- Read paid percentage + application_fee_paid flag from the view.
  SELECT v.paid_pct, v.application_fee_paid
    INTO v_paid_pct, v_app_paid
  FROM public.vw_learner_payment_progress v
  WHERE v.learner_id = p_learner_id;

  v_paid_pct := COALESCE(v_paid_pct, 0);
  v_app_paid := COALESCE(v_app_paid, false);

  -- Check whether ALL tuition bills are fully paid (Gate A condition #2).
  -- Edge case: learner with zero tuition bills -> bool_and over empty set = NULL -> treat as false.
  SELECT COALESCE(bool_and(b.status::text = 'paid'), false)
    INTO v_tuition_paid
  FROM public.billing_student_bills b
  JOIN public.billing_categories bc ON bc.id = b.item_category_id
  WHERE b.student_id = p_learner_id
    AND bc.kind = 'tuition'
    AND b.status::text <> 'superseded';

  -- ───────────────────────────────────────────────────────────────────────
  -- GATE A: 'account' + both universal categories fully paid -> 'reserved'
  -- ───────────────────────────────────────────────────────────────────────
  IF v_current_status::text = 'account' AND v_app_paid = true AND v_tuition_paid = true THEN
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
                              'tuition_fully_paid', v_tuition_paid));
        -- Refresh current_status so Gate B can fire if threshold also met.
        v_current_status := v_universal_target::lifecycle_status;
        v_promoted_to_universal := true;
      END IF;
    END IF;
  END IF;

  -- ───────────────────────────────────────────────────────────────────────
  -- GATE B: 'account'/'reserved' + paid_pct >= configured threshold -> 'admitted'
  -- (or whichever non-login-gated status the admin has configured)
  -- ───────────────────────────────────────────────────────────────────────
  IF v_current_status::text IN ('account', 'reserved') THEN
    SELECT s.code, s.fee_paid_threshold_percent
      INTO v_target_code, v_threshold
    FROM public.admission_statuses s
    WHERE s.scope = 'learner'
      AND s.is_active = true
      AND s.fee_paid_threshold_percent IS NOT NULL
      AND s.gates_login = false                       -- skip 'active' (needs profile-complete check)
      AND s.auto_promote_when_universal_paid = false  -- skip 'reserved' itself
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
    'tuition_fully_paid', v_tuition_paid,
    'threshold', v_threshold
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.evaluate_learner_status_after_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_learner_status_after_payment(uuid) TO authenticated;

-- Trigger function on billing_receipt_items unchanged; the existing
-- trg_evaluate_status_after_payment continues to call this RPC body.

COMMIT;
