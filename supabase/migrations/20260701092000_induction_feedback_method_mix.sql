-- ============================================================================
-- Fresher Induction — Feedback coverage / method-mix + bias flag
-- File: 20260701092000_induction_feedback_method_mix.sql | Date: 2026-07-01
-- Spec: specs/induction-feedback-coverage-no-smartphone-2026-06-30.md (PR1 §C.4)
--
-- fn_induction_feedback_method_mix(event) → one row: enrolled, distinct responders,
-- response_rate, per-method responder counts (phone vs volunteer_kiosk), the
-- structurally-excluded no-account denominator, and a bias_flag the loop can read
-- to know when it is learning from a thin or single-method (biased) sample.
--   bias_flag = response_rate < 0.5  OR  one method > 0.8 of responders.
-- A responder is attributed to 'phone' if ANY of their session rows is own-login
-- (own-login is authoritative), else 'volunteer_kiosk'. View-gated, anon-locked.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_feedback_method_mix(p_event_id UUID)
RETURNS TABLE (
  enrolled            INTEGER,
  responders          INTEGER,
  response_rate       NUMERIC,   -- responders / enrolled (0..1)
  n_phone             INTEGER,   -- distinct responders whose method is own-login
  n_volunteer_kiosk   INTEGER,   -- distinct responders entered only via kiosk
  no_account_enrolled INTEGER,   -- enrolled freshers with NO login account (the ceiling)
  bias_flag           BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst       UUID;
  v_enrolled   INTEGER;
  v_responders INTEGER;
  v_phone      INTEGER;
  v_kiosk      INTEGER;
  v_no_account INTEGER;
  v_rate       NUMERIC;
  v_dominant   NUMERIC;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_feedback_method_mix: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_feedback_method_mix: not authorized';
  END IF;

  SELECT count(*) INTO v_enrolled
  FROM public.induction_enrollment e WHERE e.event_id = p_event_id;

  -- enrolled freshers with no login account IN THIS COLLEGE — the structural exclusion
  -- ceiling for the own-phone path. Institution-scoped: a profile in ANOTHER college
  -- does not let them self-submit here, so it must not count as "has account"
  -- (review #1694: cross-tenant no_account misclassification).
  SELECT count(*) INTO v_no_account
  FROM public.induction_enrollment e
  WHERE e.event_id = p_event_id
    AND NOT EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.learner_id = e.learner_id AND p.institution_id = v_inst);

  -- one row per distinct responder, attributed to phone if they EVER self-submitted.
  WITH per_learner AS (
    SELECT f.learner_id, bool_or(f.capture_method = 'phone') AS has_phone
    FROM public.event_session_feedback f
    WHERE f.event_id = p_event_id
      -- only still-enrolled learners (a since-unenrolled learner's old feedback must not
      -- push responders > enrolled / response_rate > 1.0 — review #1694 r4)
      AND EXISTS (SELECT 1 FROM public.induction_enrollment ie
                  WHERE ie.event_id = p_event_id AND ie.learner_id = f.learner_id)
    GROUP BY f.learner_id
  )
  SELECT count(*)::int,
         count(*) FILTER (WHERE has_phone)::int,
         count(*) FILTER (WHERE NOT has_phone)::int
  INTO v_responders, v_phone, v_kiosk
  FROM per_learner;

  v_rate := CASE WHEN v_enrolled = 0 THEN 0
                 ELSE round(v_responders::numeric / v_enrolled, 4) END;
  v_dominant := CASE WHEN v_responders = 0 THEN 0
                     ELSE round(greatest(v_phone, v_kiosk)::numeric / v_responders, 4) END;

  enrolled            := v_enrolled;
  responders          := v_responders;
  response_rate       := v_rate;
  n_phone             := v_phone;
  n_volunteer_kiosk   := v_kiosk;
  no_account_enrolled := v_no_account;
  bias_flag           := (v_rate < 0.5 OR v_dominant > 0.8);
  RETURN NEXT;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_feedback_method_mix(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_feedback_method_mix(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
