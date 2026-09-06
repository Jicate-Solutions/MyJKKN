-- ============================================================================
-- fn_activate_learner_from_onboarding
-- 2026-08-10
-- ============================================================================
-- Bridges the one hop in the learner lifecycle that no single layer can perform.
--
-- The chain is:
--     account --(universal fees paid)--> reserved --(paid_pct >= 30%)--> admitted
--            --(4 onboarding fields filled)--> active
--
-- Everything up to 'admitted' happens INSIDE Postgres: triggers on
-- billing_receipt_items (INSERT) and billing_student_bills (status UPDATE) call
-- evaluate_learner_status_after_payment. No application code participates.
--
-- The last hop cannot live in SQL, because becoming 'active' must also provision
-- the learner's login, and that runs through POST /api/learners/complete-onboarding.
-- sync_learner_status_to_profile only flips is_active on an EXISTING profiles
-- row; it cannot create an auth user.
--
-- Consequence: when a payment promoted someone to 'admitted' whose profile was
-- ALREADY complete, nothing re-evaluated activation. They stalled at 'admitted'
-- forever and were invisible, because the onboarding page listed only INCOMPLETE
-- profiles. 23 learners were in that state when this was written.
--
-- This function owns the status half of that hop (guarded + audited); the caller
-- owns the login half. It is SECURITY DEFINER for one specific reason:
-- learners_profile_status_history has RLS enabled with a SELECT policy and NO
-- INSERT policy, so the audit row is unwritable from a normal client session.
-- Because DEFINER also bypasses the learners_profiles RLS, the permission check
-- below is NOT optional — it is the only thing gating this function.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_activate_learner_from_onboarding(
  p_learner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status        lifecycle_status;
  v_email         text;
  v_ay            uuid;
  v_sem           uuid;
  v_sec           uuid;
  v_paid_pct      numeric;
  v_threshold     numeric;
  v_actor         uuid := auth.uid();
  v_updated       integer := 0;
BEGIN
  -- ---- Authorisation -------------------------------------------------------
  -- DEFINER bypasses RLS, so this check IS the access control. Uses the 1-arg
  -- user_has_permission overload: the 2-arg (uuid, text) form is REVOKED from
  -- `authenticated` on purpose and raises 42501 when called from a cookie client.
  IF NOT (
    COALESCE(is_super_admin(), false)
    OR COALESCE(user_has_permission('learners.onboarding.edit'::text), false)
  ) THEN
    RETURN jsonb_build_object(
      'activated', false,
      'reason', 'forbidden',
      'message', 'You do not have permission to activate learners.'
    );
  END IF;

  SELECT lp.lifecycle_status, lp.college_email, lp.academic_year_id,
         lp.semester_id, lp.section_id
    INTO v_status, v_email, v_ay, v_sem, v_sec
  FROM public.learners_profiles lp
  WHERE lp.id = p_learner_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'not_found',
      'message', 'Learner not found.');
  END IF;

  IF v_status::text = 'active' THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'already_active',
      'message', 'Learner is already active.');
  END IF;

  -- ---- The fee gate --------------------------------------------------------
  -- 'reserved' means universal fees are paid but the balance threshold is NOT
  -- cleared. Those learners are legitimately visible in the onboarding
  -- workspace and their academic fields can be filled there, but promoting one
  -- here would walk straight past the payment gate that
  -- evaluate_learner_status_after_payment exists to enforce. Only that RPC may
  -- produce 'admitted'; only this function may then produce 'active'.
  IF v_status::text <> 'admitted' THEN
    RETURN jsonb_build_object(
      'activated', false,
      'reason', 'status_not_admitted',
      'current_status', v_status::text,
      'message', format(
        'Only admitted learners can be activated (this learner is %s). Reserved learners activate once their fees clear the threshold.',
        v_status::text)
    );
  END IF;

  -- ---- Onboarding completeness --------------------------------------------
  -- Same four fields as LearnerProfileService.calculateProfileCompleteness.
  IF v_email IS NULL OR btrim(v_email) = ''
     OR v_ay IS NULL OR v_sem IS NULL OR v_sec IS NULL THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'incomplete_profile',
      'message', 'College Email, Academic Year, Semester and Section must all be set.');
  END IF;

  -- Login creation is keyed off the college email domain; without it the caller
  -- would flip the status and then silently fail to create an account, leaving
  -- an active learner who cannot log in.
  IF lower(v_email) NOT LIKE '%@jkkn.ac.in' THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'invalid_college_email',
      'message', 'College Email must be on the @jkkn.ac.in domain.');
  END IF;

  -- ---- Audit context -------------------------------------------------------
  -- Recorded, NOT enforced. admission_statuses.active.fee_paid_threshold_percent
  -- is 60, but the pre-existing onboarding path (checkAndAutoActivate, and the
  -- Quick Complete drawer that calls it) has always activated on the four fields
  -- alone. Enforcing 60 here would make this button behave differently from the
  -- drawer sitting next to it on the same page. Both numbers are written to the
  -- history row so the gap is auditable rather than invisible.
  SELECT v.paid_pct INTO v_paid_pct
  FROM public.vw_learner_payment_progress v WHERE v.learner_id = p_learner_id;
  v_paid_pct := COALESCE(v_paid_pct, 0);

  SELECT s.fee_paid_threshold_percent INTO v_threshold
  FROM public.admission_statuses s
  WHERE s.scope = 'learner' AND s.code = 'active' AND s.is_active = true
  LIMIT 1;

  -- ---- Promote -------------------------------------------------------------
  UPDATE public.learners_profiles
     SET lifecycle_status    = 'active'::lifecycle_status,
         is_profile_complete = true,
         updated_at          = now(),
         updated_by          = v_actor
   WHERE id = p_learner_id
     AND lifecycle_status::text = 'admitted';  -- re-checked: guards a concurrent flip

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'concurrent_change',
      'message', 'Learner status changed while activating. Refresh and retry.');
  END IF;

  -- Activation has never written history — learners_profile_status_history holds
  -- 1,124 payment-driven rows and zero admitted->active rows. This closes that gap.
  INSERT INTO public.learners_profile_status_history
    (learner_id, from_status, to_status, reason_code, paid_pct_at_change,
     threshold_at_change, changed_by, metadata)
  VALUES
    (p_learner_id, 'admitted'::lifecycle_status, 'active'::lifecycle_status,
     'onboarding_activation', v_paid_pct, v_threshold, v_actor,
     jsonb_build_object(
       'source', 'fn_activate_learner_from_onboarding',
       'threshold_enforced', false,
       'met_configured_threshold', (v_threshold IS NULL OR v_paid_pct >= v_threshold)));

  RETURN jsonb_build_object(
    'activated', true,
    'learner_id', p_learner_id,
    'paid_pct', v_paid_pct,
    'threshold', v_threshold,
    'met_configured_threshold', (v_threshold IS NULL OR v_paid_pct >= v_threshold),
    'message', 'Learner activated.'
  );
END;
$function$;

-- CREATE OR REPLACE preserves grants, but this is the first CREATE, so the grant
-- is required. Without it PostgREST returns 42883 "function does not exist" to
-- the authenticated role rather than a permission error.
REVOKE ALL ON FUNCTION public.fn_activate_learner_from_onboarding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_activate_learner_from_onboarding(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_activate_learner_from_onboarding(uuid) IS
  'Onboarding activation: admitted -> active with the four required fields set. '
  'Refuses reserved learners (payment gate). Writes learners_profile_status_history. '
  'Caller must still provision the login via POST /api/learners/complete-onboarding.';
