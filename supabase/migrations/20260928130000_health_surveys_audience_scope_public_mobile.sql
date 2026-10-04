-- ============================================================================
-- Migration: 20260928130000_health_surveys_audience_scope_public_mobile
-- Follow-up to 20260928120000_health_wellness_surveys (applied).
-- ============================================================================
-- 1. Audience is now an ACCESS rule, not just a submit rule: a staff-only
--    survey is invisible to learners and vice versa (RLS on health_surveys).
--    Managers still see every survey.
-- 2. Public respondents give Name, Email ID and Mobile Number (designation /
--    institution dropped from the public form). New column: mobile.
--
-- Respondent category (single source: fn_health_survey_my_type):
--   profiles.learner_id present → 'student', otherwise → 'staff'.
--
-- TIER: additive + function replace. Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Caller's respondent category
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_survey_my_type()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN p.learner_id IS NOT NULL THEN 'student' ELSE 'staff' END
  FROM profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.fn_health_survey_my_type() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_survey_my_type() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Viewers only see active/closed surveys opened to THEIR category
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS health_surveys_select ON public.health_surveys;
CREATE POLICY health_surveys_select ON public.health_surveys
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('health.programs.manage')
    OR (user_has_permission('health.programs.view')
        AND status IN ('active', 'closed')
        AND fn_health_survey_my_type() = ANY (audience))
  );

-- ----------------------------------------------------------------------------
-- 3. Logged-in submit — use the shared category helper
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_survey_submit(
  p_survey_id UUID,
  p_answers   JSONB,
  p_language  TEXT DEFAULT 'en'
)
RETURNS public.health_survey_responses
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_survey  health_surveys;
  v_prof    profiles;
  v_type    TEXT;
  v_inst    TEXT;
  v_desig   TEXT;
  v_score   RECORD;
  v_row     health_survey_responses;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('health.programs.view')
          OR user_has_permission('health.programs.manage')) THEN
    RAISE EXCEPTION 'not authorized to take wellness surveys' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_survey FROM health_surveys WHERE id = p_survey_id;
  IF NOT FOUND OR v_survey.status <> 'active' THEN
    RAISE EXCEPTION 'this survey is not open' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_prof FROM profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '42501';
  END IF;

  v_type := fn_health_survey_my_type();
  IF v_type IS NULL OR NOT (v_type = ANY (v_survey.audience)) THEN
    RAISE EXCEPTION 'this survey is not open to you' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM health_survey_responses
             WHERE survey_id = p_survey_id
               AND (user_id = v_uid OR lower(email) = lower(COALESCE(v_prof.email, '')))) THEN
    RAISE EXCEPTION 'you have already submitted this survey' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_score FROM fn_health_survey_score(v_survey.questions, p_answers);

  SELECT i.name INTO v_inst FROM institutions i WHERE i.id = v_prof.institution_id;

  v_desig := NULLIF(trim(v_prof.designation), '');
  IF v_desig IS NULL AND v_type = 'staff' THEN
    SELECT NULLIF(trim(s.designation), '') INTO v_desig
      FROM staff s WHERE s.profile_id = v_uid LIMIT 1;
  END IF;
  IF v_desig IS NULL AND v_type = 'student' THEN
    v_desig := 'Learner';
  END IF;

  INSERT INTO health_survey_responses
    (survey_id, program_id, user_id, respondent_type, name, designation,
     institution_id, institution_name, email, mobile, language, answers,
     constructive_count, total_questions, score_pct)
  VALUES
    (p_survey_id, v_survey.program_id, v_uid, v_type,
     COALESCE(NULLIF(trim(v_prof.full_name), ''), v_prof.email, 'Unknown'),
     v_desig, v_prof.institution_id, v_inst,
     COALESCE(v_prof.email, v_uid::text),
     NULLIF(trim(COALESCE(v_prof.phone_number, '')), ''),
     CASE WHEN p_language = ANY (v_survey.languages) THEN p_language ELSE 'en' END,
     p_answers, v_score.constructive_count, v_score.total_questions,
     round(100.0 * v_score.constructive_count / v_score.total_questions, 2))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Mobile number on responses (public: required; logged-in: from profile)
-- ----------------------------------------------------------------------------
ALTER TABLE public.health_survey_responses
  ADD COLUMN IF NOT EXISTS mobile TEXT;

-- ----------------------------------------------------------------------------
-- 5. Public submit — Name + Email ID + Mobile Number. Old signature dropped
--    (0 responses at the time; only the service-role API route calls it).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_health_survey_submit_public(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT);

CREATE OR REPLACE FUNCTION public.fn_health_survey_submit_public(
  p_token     TEXT,
  p_name      TEXT,
  p_email     TEXT,
  p_mobile    TEXT,
  p_answers   JSONB,
  p_language  TEXT DEFAULT 'en'
)
RETURNS public.health_survey_responses
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_survey health_surveys;
  v_score  RECORD;
  v_row    health_survey_responses;
  v_email  TEXT := lower(trim(COALESCE(p_email, '')));
  v_mobile TEXT := regexp_replace(COALESCE(p_mobile, ''), '[\s()-]', '', 'g');
BEGIN
  SELECT * INTO v_survey FROM health_surveys WHERE public_token = p_token;
  IF NOT FOUND OR v_survey.status <> 'active' OR NOT ('public' = ANY (v_survey.audience)) THEN
    RAISE EXCEPTION 'this survey is not open' USING ERRCODE = '22023';
  END IF;
  IF length(trim(COALESCE(p_name, ''))) < 2 THEN
    RAISE EXCEPTION 'please enter your name' USING ERRCODE = '22023';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'please enter a valid email' USING ERRCODE = '22023';
  END IF;
  IF v_mobile !~ '^\+?[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'please enter a valid mobile number' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM health_survey_responses
             WHERE survey_id = v_survey.id AND lower(email) = v_email) THEN
    RAISE EXCEPTION 'this email has already submitted the survey' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_score FROM fn_health_survey_score(v_survey.questions, p_answers);

  INSERT INTO health_survey_responses
    (survey_id, program_id, user_id, respondent_type, name, designation,
     institution_id, institution_name, email, mobile, language, answers,
     constructive_count, total_questions, score_pct)
  VALUES
    (v_survey.id, v_survey.program_id, NULL, 'public',
     left(trim(p_name), 200), NULL, NULL, NULL,
     v_email, v_mobile,
     CASE WHEN p_language = ANY (v_survey.languages) THEN p_language ELSE 'en' END,
     p_answers, v_score.constructive_count, v_score.total_questions,
     round(100.0 * v_score.constructive_count / v_score.total_questions, 2))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_health_survey_submit_public(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_survey_submit_public(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT)
  TO service_role;

NOTIFY pgrst, 'reload schema';
