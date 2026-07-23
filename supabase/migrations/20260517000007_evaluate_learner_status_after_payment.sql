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
  v_threshold        numeric;
  v_target_code      text;
  v_updated          boolean := false;
BEGIN
  SELECT lp.lifecycle_status INTO v_current_status
  FROM public.learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false, 'reason', 'not_found');
  END IF;

  -- Only auto-promote from 'account'. Other transitions stay manual.
  IF v_current_status::text <> 'account' THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false,
      'reason', 'no_op_for_status', 'current_status', v_current_status::text);
  END IF;

  -- Read current paid percentage from the view.
  SELECT v.paid_pct INTO v_paid_pct
  FROM public.vw_learner_payment_progress v
  WHERE v.learner_id = p_learner_id;

  v_paid_pct := COALESCE(v_paid_pct, 0);

  -- Find the threshold target row in admission_statuses (highest threshold
  -- the learner currently qualifies for among active learner statuses).
  SELECT s.code, s.fee_paid_threshold_percent
  INTO v_target_code, v_threshold
  FROM public.admission_statuses s
  WHERE s.scope = 'learner'
    AND s.is_active = true
    AND s.fee_paid_threshold_percent IS NOT NULL
    AND v_paid_pct >= s.fee_paid_threshold_percent
  ORDER BY s.fee_paid_threshold_percent DESC
  LIMIT 1;

  IF v_target_code IS NULL THEN
    RETURN jsonb_build_object('learner_id', p_learner_id, 'updated', false,
      'reason', 'below_threshold', 'paid_pct', v_paid_pct);
  END IF;

  -- Promote.
  UPDATE public.learners_profiles
  SET lifecycle_status = v_target_code::lifecycle_status
  WHERE id = p_learner_id
    AND lifecycle_status::text = 'account';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated THEN
    INSERT INTO public.learners_profile_status_history
      (learner_id, from_status, to_status, reason_code, paid_pct_at_change,
       threshold_at_change, changed_by, metadata)
    VALUES
      (p_learner_id, 'account'::lifecycle_status, v_target_code::lifecycle_status,
       'auto_threshold', v_paid_pct, v_threshold, NULL,
       jsonb_build_object('rpc', 'evaluate_learner_status_after_payment'));
  END IF;

  RETURN jsonb_build_object(
    'learner_id', p_learner_id,
    'updated', v_updated,
    'from_status', 'account',
    'to_status', v_target_code,
    'paid_pct', v_paid_pct,
    'threshold', v_threshold
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.evaluate_learner_status_after_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_learner_status_after_payment(uuid) TO authenticated;

-- Trigger function on billing_receipt_items
CREATE OR REPLACE FUNCTION public._on_receipt_item_evaluate_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_student_id uuid;
BEGIN
  SELECT br.student_id INTO v_student_id
  FROM public.billing_receipts br
  WHERE br.id = NEW.receipt_id;

  IF v_student_id IS NOT NULL THEN
    PERFORM public.evaluate_learner_status_after_payment(v_student_id);
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_evaluate_status_after_payment
  AFTER INSERT ON public.billing_receipt_items
  FOR EACH ROW
  EXECUTE FUNCTION public._on_receipt_item_evaluate_status();

COMMIT;
