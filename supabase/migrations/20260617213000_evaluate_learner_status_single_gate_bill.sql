-- 2026-06-17: Onboarding auto-status engine — Stage A (account -> reserved) gate reworked.
--
-- Context: lifecycle_status flows account -> reserved -> admitted -> active. Two triggers
-- (trg_evaluate_status_after_payment on billing_receipt_items, and
--  trg_evaluate_status_after_bill_paid on billing_student_bills) both call
-- evaluate_learner_status_after_payment() after any payment.
--
-- OLD Stage A rule (-> reserved): required the application fee paid AND ALL
--   university_fee bills paid. Implemented as bool_and over university_fee bills, which
--   returns NULL (-> false) when the learner has NO university_fee bill at all. Effect:
--   single-bill admissions (e.g. some Arts & Science programs billed only an Application
--   Fee, no University Fee) could NEVER reach 'reserved' and were stuck in 'account'.
--
-- NEW Stage A rule (-> reserved): ALL EXISTING application_fee + university_fee bills must
--   be paid AND at least one such bill must exist. Both kinds present -> both must be paid
--   (unchanged). Only one kind present -> that single paid bill is sufficient. No gate bill
--   at all -> no promotion (no basis).
--
-- Stage B (-> admitted via admission_statuses.fee_paid_threshold_percent) is UNCHANGED.
--
-- A one-time backfill at the bottom re-derives status for all account/reserved learners.
-- This is required because the 2026-05-20 lifecycle taxonomy realignment bulk-reset many
-- learners' lifecycle_status without re-running this engine, leaving fully-paid learners
-- frozen in 'account' (the engine only fires on NEW billing events; it never retro-scans).
-- The function is idempotent + forward-only, so re-running it is safe.

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
  v_gate_bills            integer := 0;
  v_gate_paid             integer := 0;
  v_threshold             numeric;
  v_target_code           text;
  v_updated               integer := 0;
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

  -- Threshold progress (drives Stage B -> admitted) still comes from the view.
  SELECT v.paid_pct INTO v_paid_pct
  FROM public.vw_learner_payment_progress v
  WHERE v.learner_id = p_learner_id;
  v_paid_pct := COALESCE(v_paid_pct, 0);

  -- Stage A gate (-> reserved): all EXISTING application_fee + university_fee bills
  -- must be paid, with at least one such bill present. v_app_paid / v_universals_paid
  -- are retained purely for the history audit metadata.
  SELECT
    count(*) FILTER (WHERE bc.kind IN ('application_fee','university_fee')),
    count(*) FILTER (WHERE bc.kind IN ('application_fee','university_fee') AND b.status::text = 'paid'),
    COALESCE(bool_or(bc.kind = 'application_fee' AND b.status::text = 'paid'), false),
    COALESCE(bool_and(b.status::text = 'paid') FILTER (WHERE bc.kind = 'university_fee'), false)
  INTO v_gate_bills, v_gate_paid, v_app_paid, v_universals_paid
  FROM public.billing_student_bills b
  JOIN public.billing_categories bc ON bc.id = b.item_category_id
  WHERE b.student_id = p_learner_id
    AND b.status::text <> 'superseded';

  IF v_current_status::text = 'account' AND v_gate_bills > 0 AND v_gate_paid = v_gate_bills THEN
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
                              'university_fee_paid', v_universals_paid,
                              'gate_bills', v_gate_bills,
                              'gate_paid', v_gate_paid));
        v_current_status := v_universal_target::lifecycle_status;
        v_promoted_to_universal := true;
      END IF;
    END IF;
  END IF;

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
    'gate_bills', v_gate_bills,
    'gate_paid', v_gate_paid,
    'threshold', v_threshold
  );
END;
$function$;

-- One-time backfill: re-derive status for every learner currently parked in
-- account/reserved. Idempotent + forward-only (no-op for anyone not qualifying).
SELECT public.evaluate_learner_status_after_payment(id)
FROM public.learners_profiles
WHERE lifecycle_status IN ('account', 'reserved');
