-- ============================================================================
-- Migration: 20260928120000_health_wellness_surveys
-- Health & Wellness — program-scoped scenario SURVEYS (2026-09-28).
-- ============================================================================
-- Two flows, kept separate:
--   • Program flow (health_programs / _days / _participation) — UNCHANGED.
--   • Survey flow (this file) — a survey hangs off a program. Respondents pick
--     a program, answer scenario questions with an immediate constructive /
--     needs-improvement review per answer, and submit ONCE. Responses persist
--     for the Excel report + analytics.
--
-- Respondents: students + staff (logged in, auth.uid()) and the public
-- (no login, /ws/<public_token>, submitted through a service-role API route).
-- One submission per survey: per user_id for logged-in users, per lower(email)
-- for everyone (so a staff member can't re-submit through the public link).
--
-- Writes go through SECURITY DEFINER RPCs that score server-side — the client
-- never supplies the score, and the constructive key never has to be trusted
-- from the browser.
--
-- TIER: additive (new tables/functions only). Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. health_surveys — survey definition (questions JSONB)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.health_surveys (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id     UUID NOT NULL REFERENCES public.health_programs(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'active', 'closed')),
  -- which respondent categories may answer: subset of student/staff/public
  audience       TEXT[] NOT NULL DEFAULT ARRAY['student', 'staff']::TEXT[]
                   CHECK (audience <@ ARRAY['student', 'staff', 'public']::TEXT[]
                          AND cardinality(audience) > 0),
  -- languages the question text is authored in ('en' always; 'ta' optional)
  languages      TEXT[] NOT NULL DEFAULT ARRAY['en']::TEXT[],
  -- [{id, title:{en,ta?}, text:{en,ta?}, constructive:"A",
  --   options:[{id:"A", text:{en,ta?}, justification:{en,ta?}}], guidance:{en,ta?}}]
  questions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  public_token   TEXT UNIQUE,
  created_by     UUID REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_surveys_program
  ON public.health_surveys (program_id, status);

-- ----------------------------------------------------------------------------
-- 2. health_survey_responses — one row per respondent per survey
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.health_survey_responses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id           UUID NOT NULL REFERENCES public.health_surveys(id) ON DELETE CASCADE,
  program_id          UUID NOT NULL REFERENCES public.health_programs(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  respondent_type     TEXT NOT NULL CHECK (respondent_type IN ('student', 'staff', 'public')),
  name                TEXT NOT NULL,
  designation         TEXT,
  institution_id      UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
  institution_name    TEXT,
  email               TEXT NOT NULL,
  language            TEXT NOT NULL DEFAULT 'en',
  answers             JSONB NOT NULL,   -- { [question_id]: option_id }
  constructive_count  INT NOT NULL DEFAULT 0,
  total_questions     INT NOT NULL DEFAULT 0,
  score_pct           NUMERIC(5, 2),
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_health_survey_responses_user
  ON public.health_survey_responses (survey_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_health_survey_responses_email
  ON public.health_survey_responses (survey_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_health_survey_responses_survey
  ON public.health_survey_responses (survey_id, submitted_at);

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.health_surveys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_survey_responses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.health_surveys          FROM anon;
REVOKE ALL ON public.health_survey_responses FROM anon;

-- Surveys: managers see everything; viewers see active/closed surveys.
DROP POLICY IF EXISTS health_surveys_select ON public.health_surveys;
CREATE POLICY health_surveys_select ON public.health_surveys
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('health.programs.manage')
    OR (user_has_permission('health.programs.view') AND status IN ('active', 'closed'))
  );

DROP POLICY IF EXISTS health_surveys_write ON public.health_surveys;
CREATE POLICY health_surveys_write ON public.health_surveys
  FOR ALL USING (
    is_super_admin() OR is_admin() OR user_has_permission('health.programs.manage')
  )
  WITH CHECK (
    is_super_admin() OR is_admin() OR user_has_permission('health.programs.manage')
  );

-- Responses: own row + managers. NO direct insert/update policy — writes only
-- through fn_health_survey_submit (DEFINER) so the score is server-computed.
DROP POLICY IF EXISTS health_survey_responses_select ON public.health_survey_responses;
CREATE POLICY health_survey_responses_select ON public.health_survey_responses
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_super_admin() OR is_admin()
    OR user_has_permission('health.programs.manage')
  );

DROP POLICY IF EXISTS health_survey_responses_delete ON public.health_survey_responses;
CREATE POLICY health_survey_responses_delete ON public.health_survey_responses
  FOR DELETE USING (
    is_super_admin() OR is_admin() OR user_has_permission('health.programs.manage')
  );

-- ----------------------------------------------------------------------------
-- 4. Scoring helper — validates answers against the survey's questions.
--    Every question must be answered with one of its option ids.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_survey_score(p_questions JSONB, p_answers JSONB)
RETURNS TABLE (constructive_count INT, total_questions INT)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  q        JSONB;
  v_answer TEXT;
  v_total  INT := 0;
  v_good   INT := 0;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'answers must be an object' USING ERRCODE = '22023';
  END IF;

  FOR q IN SELECT * FROM jsonb_array_elements(COALESCE(p_questions, '[]'::jsonb)) LOOP
    v_total := v_total + 1;
    v_answer := p_answers ->> (q ->> 'id');
    IF v_answer IS NULL THEN
      RAISE EXCEPTION 'please answer every question' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(q -> 'options') o WHERE o ->> 'id' = v_answer
    ) THEN
      RAISE EXCEPTION 'invalid answer for question %', q ->> 'id' USING ERRCODE = '22023';
    END IF;
    IF v_answer = q ->> 'constructive' THEN
      v_good := v_good + 1;
    END IF;
  END LOOP;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'this survey has no questions' USING ERRCODE = '22023';
  END IF;

  constructive_count := v_good;
  total_questions := v_total;
  RETURN NEXT;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Logged-in submit (students + staff). Identity comes from profiles.
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

  v_type := CASE WHEN v_prof.learner_id IS NOT NULL THEN 'student' ELSE 'staff' END;
  IF NOT (v_type = ANY (v_survey.audience)) THEN
    RAISE EXCEPTION 'this survey is not open to % respondents', v_type USING ERRCODE = '42501';
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
     institution_id, institution_name, email, language, answers,
     constructive_count, total_questions, score_pct)
  VALUES
    (p_survey_id, v_survey.program_id, v_uid, v_type,
     COALESCE(NULLIF(trim(v_prof.full_name), ''), v_prof.email, 'Unknown'),
     v_desig, v_prof.institution_id, v_inst,
     COALESCE(v_prof.email, v_uid::text),
     CASE WHEN p_language = ANY (v_survey.languages) THEN p_language ELSE 'en' END,
     p_answers, v_score.constructive_count, v_score.total_questions,
     round(100.0 * v_score.constructive_count / v_score.total_questions, 2))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_health_survey_submit(UUID, JSONB, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_survey_submit(UUID, JSONB, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Public submit — service_role ONLY (called by /api/public/health-surveys).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_health_survey_submit_public(
  p_token        TEXT,
  p_name         TEXT,
  p_designation  TEXT,
  p_institution  TEXT,
  p_email        TEXT,
  p_answers      JSONB,
  p_language     TEXT DEFAULT 'en'
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
  IF EXISTS (SELECT 1 FROM health_survey_responses
             WHERE survey_id = v_survey.id AND lower(email) = v_email) THEN
    RAISE EXCEPTION 'this email has already submitted the survey' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_score FROM fn_health_survey_score(v_survey.questions, p_answers);

  INSERT INTO health_survey_responses
    (survey_id, program_id, user_id, respondent_type, name, designation,
     institution_id, institution_name, email, language, answers,
     constructive_count, total_questions, score_pct)
  VALUES
    (v_survey.id, v_survey.program_id, NULL, 'public',
     left(trim(p_name), 200), NULLIF(left(trim(COALESCE(p_designation, '')), 200), ''),
     NULL, NULLIF(left(trim(COALESCE(p_institution, '')), 300), ''),
     v_email,
     CASE WHEN p_language = ANY (v_survey.languages) THEN p_language ELSE 'en' END,
     p_answers, v_score.constructive_count, v_score.total_questions,
     round(100.0 * v_score.constructive_count / v_score.total_questions, 2))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_health_survey_submit_public(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT)
  FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_survey_submit_public(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT)
  TO service_role;

NOTIFY pgrst, 'reload schema';
