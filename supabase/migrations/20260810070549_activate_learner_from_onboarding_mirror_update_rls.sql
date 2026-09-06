-- ============================================================================
-- fn_activate_learner_from_onboarding — authorisation correction
-- 2026-08-10
-- ============================================================================
-- Supersedes the gate introduced in 20260810065650.
--
-- v1 gated on user_has_permission('learners.onboarding.edit'). Checked against
-- this deployment, that key is granted to 68 of the custom_roles rows —
-- including Student, Parent / Guardian, Driver, Mess Caterer and Security /
-- Gate Guard. Practically the entire `learners.*` namespace is granted that
-- broadly here, so those keys are not a meaningful gate on their own; RLS is
-- what actually constrains this table.
--
-- Combined with SECURITY DEFINER (which bypasses RLS), v1 would therefore have
-- allowed a student or parent to activate ANY learner by id and provision a
-- login — strictly MORE authority than the same caller has through a plain
-- UPDATE. This replaces that check with the exact predicate from
-- learners_profiles_update_policy, so the function confers no privilege beyond
-- a direct UPDATE on the row.
--
-- SECURITY DEFINER is retained for one reason only: learners_profile_status_history
-- has RLS enabled with a SELECT policy and NO INSERT policy, so the audit row
-- cannot be written from a normal client session. DEFINER is used to reach that
-- table, never to widen who may act.
--
-- NOTE (pre-existing, out of scope): because `learners.edit` is itself granted
-- to 68 roles, that UPDATE policy already permits any authenticated user to
-- modify learner rows at their own institution. This migration deliberately
-- matches that existing bar rather than silently tightening or loosening it.
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
  v_institution   uuid;
  v_paid_pct      numeric;
  v_threshold     numeric;
  v_actor         uuid := auth.uid();
  v_updated       integer := 0;
BEGIN
  SELECT lp.lifecycle_status, lp.college_email, lp.academic_year_id,
         lp.semester_id, lp.section_id, lp.institution_id
    INTO v_status, v_email, v_ay, v_sem, v_sec, v_institution
  FROM public.learners_profiles lp
  WHERE lp.id = p_learner_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'not_found',
      'message', 'Learner not found.');
  END IF;

  -- Authorisation: byte-for-byte the predicate in learners_profiles_update_policy.
  -- DEFINER bypassed that policy, so it is re-applied here by hand. Uses the
  -- 1-arg user_has_permission overload; the 2-arg (uuid,text) form is REVOKED
  -- from `authenticated` and raises 42501 from a cookie client.
  IF NOT (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR (
      role_has_institution_access(v_institution)
      AND (
        COALESCE(user_has_permission('learners.admissions.edit'::text), false)
        OR COALESCE(user_has_permission('learners.profiles.edit'::text), false)
        OR COALESCE(user_has_permission('learners.edit'::text), false)
      )
    )
  ) THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'forbidden',
      'message', 'You do not have permission to activate this learner.');
  END IF;

  IF v_status::text = 'active' THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'already_active',
      'message', 'Learner is already active.');
  END IF;

  -- The fee gate: only evaluate_learner_status_after_payment may produce
  -- 'admitted'; only this function may then produce 'active'. A 'reserved'
  -- learner has paid the universal fees but NOT cleared the balance threshold,
  -- and is refused here no matter how complete their profile is.
  IF v_status::text <> 'admitted' THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'status_not_admitted',
      'current_status', v_status::text,
      'message', format('Only admitted learners can be activated (this learner is %s). Reserved learners activate once their fees clear the threshold.', v_status::text));
  END IF;

  -- Same four fields as LearnerProfileService.calculateProfileCompleteness.
  IF v_email IS NULL OR btrim(v_email) = ''
     OR v_ay IS NULL OR v_sem IS NULL OR v_sec IS NULL THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'incomplete_profile',
      'message', 'College Email, Academic Year, Semester and Section must all be set.');
  END IF;

  -- Login creation keys off the college email domain; without it the caller
  -- would flip the status and then silently fail to create an account, leaving
  -- an active learner who cannot log in.
  IF lower(v_email) NOT LIKE '%@jkkn.ac.in' THEN
    RETURN jsonb_build_object('activated', false, 'reason', 'invalid_college_email',
      'message', 'College Email must be on the @jkkn.ac.in domain.');
  END IF;

  -- Recorded, NOT enforced. admission_statuses.active.fee_paid_threshold_percent
  -- is 60, but the pre-existing onboarding path (checkAndAutoActivate, and the
  -- Quick Complete drawer that calls it) has always activated on the four fields
  -- alone. Enforcing 60 here would make this button behave differently from the
  -- drawer beside it on the same page. Both numbers go into the history row so
  -- the gap is auditable rather than invisible.
  SELECT v.paid_pct INTO v_paid_pct
  FROM public.vw_learner_payment_progress v WHERE v.learner_id = p_learner_id;
  v_paid_pct := COALESCE(v_paid_pct, 0);

  SELECT s.fee_paid_threshold_percent INTO v_threshold
  FROM public.admission_statuses s
  WHERE s.scope = 'learner' AND s.code = 'active' AND s.is_active = true
  LIMIT 1;

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

  -- Activation has never written history — learners_profile_status_history held
  -- 1,124 payment-driven rows and zero admitted->active rows. This closes that gap.
  INSERT INTO public.learners_profile_status_history
    (learner_id, from_status, to_status, reason_code, paid_pct_at_change,
     threshold_at_change, changed_by, metadata)
  VALUES
    (p_learner_id, 'admitted'::lifecycle_status, 'active'::lifecycle_status,
     'onboarding_activation', v_paid_pct, v_threshold, v_actor,
     jsonb_build_object('source', 'fn_activate_learner_from_onboarding',
       'threshold_enforced', false,
       'met_configured_threshold', (v_threshold IS NULL OR v_paid_pct >= v_threshold)));

  RETURN jsonb_build_object('activated', true, 'learner_id', p_learner_id,
    'paid_pct', v_paid_pct, 'threshold', v_threshold,
    'met_configured_threshold', (v_threshold IS NULL OR v_paid_pct >= v_threshold),
    'message', 'Learner activated.');
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_activate_learner_from_onboarding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_activate_learner_from_onboarding(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_activate_learner_from_onboarding(uuid) IS
  'Onboarding activation: admitted -> active with the four required fields set. '
  'Refuses reserved learners (payment gate). Authorisation mirrors '
  'learners_profiles_update_policy. Writes learners_profile_status_history. '
  'Caller must still provision the login via POST /api/learners/complete-onboarding.';
