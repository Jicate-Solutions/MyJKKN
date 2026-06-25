-- =====================================================================
-- Session Feedback (SCF) — Self-improving loop substrate
-- Created: 2026-06-25
-- =====================================================================
-- Turns the AI suggestion path from STATELESS into SELF-IMPROVING. Today the
-- AI re-derives a fresh suggestion each time from raw feedback, blind to whether
-- its LAST advice worked. This adds the missing mechanic the Director's vision
-- requires ("a loop is not just a repeat thing — how does it self-improve?"):
--
--   suggest --record--> act --measure next-class lift--> feed (suggestion+lift)
--   back into the next suggest --> the AI proposes BETTER, having seen its own
--   track record.
--
-- 1. scf_ai_suggestions      — the loop's MEMORY: each AI suggestion + the input
--                              state it was based on + the OUTCOME (next-class
--                              lift) + an optional human verdict.
-- 2. fn_scf_record_suggestion — store a suggestion at generate time.
-- 3. fn_scf_prior_suggestion  — fetch the most recent prior suggestion + its
--                              outcome, to feed back into the next prompt.
-- 4. fn_scf_measure_suggestion_outcomes — attribute each suggestion's outcome:
--                              the avg understanding of the NEXT session for the
--                              same course+faculty after the suggestion's window.
--                              This is the verifier that closes the loop.
--
-- All RPCs are service-role only (the ai-suggest route + the daily cron call them
-- via the admin client). The stored suggestion is synthesized teaching guidance
-- (aggregate) — the raw anonymized free_texts are NEVER stored here.
-- =====================================================================

-- ── 1. The loop's memory ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scf_ai_suggestions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id           uuid,
  course_code              text NOT NULL,
  faculty_email            text,                    -- lower-cased; NULL = course-level (leadership view)
  generated_at             timestamptz NOT NULL DEFAULT clock_timestamp(), -- wall-clock (advances within a tx) so prior-ordering is deterministic even for same-tx records

  window_from              date NOT NULL,
  window_to                date NOT NULL,
  -- input state the suggestion was based on (the "before")
  input_responses          int,
  input_low_responses      int,
  input_avg_understood     numeric,
  -- the AI output (synthesized guidance only — never raw student comments)
  suggestion               jsonb NOT NULL,
  model                    text,
  -- outcome: how understanding moved in the NEXT session (the verifier, filled later)
  outcome_avg_understood   numeric,
  outcome_responses        int,
  outcome_lift             numeric,                 -- outcome_avg - input_avg; NULL = not measured yet
  outcome_measured_at      timestamptz,
  -- optional human-in-the-loop verdict ("I tried this — it helped / no change")
  human_verdict            text CHECK (human_verdict IN ('tried_helped','tried_no_change','not_tried')),
  human_verdict_at         timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scf_ai_suggestions_course_faculty
  ON public.scf_ai_suggestions (course_code, faculty_email, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_scf_ai_suggestions_unmeasured
  ON public.scf_ai_suggestions (generated_at) WHERE outcome_lift IS NULL;

ALTER TABLE public.scf_ai_suggestions ENABLE ROW LEVEL SECURITY;

-- Read: super/admin/institution-scoped (content is non-PII aggregate guidance).
-- Writes service-role only (RPCs below are SECURITY DEFINER).
DROP POLICY IF EXISTS scf_ai_suggestions_select ON public.scf_ai_suggestions;
CREATE POLICY scf_ai_suggestions_select ON public.scf_ai_suggestions
FOR SELECT USING (
  is_super_admin() OR is_admin()
  -- Guard NULL: role_has_institution_access(NULL) returns TRUE, which would
  -- over-grant course-level (NULL-institution) rows to every authenticated user.
  -- Faculty-self rows now carry the resolved institution (see the route); only
  -- super-admin course-level rows remain NULL → readable by super/admin only.
  OR (institution_id IS NOT NULL AND role_has_institution_access(institution_id))
);

-- ── 2. Record a suggestion at generate time ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_scf_record_suggestion(
  p_institution_id     uuid,
  p_course_code        text,
  p_faculty_email      text,
  p_window_from        date,
  p_window_to          date,
  p_input_responses    int,
  p_input_low          int,
  p_input_avg          numeric,
  p_suggestion         jsonb,
  p_model              text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.scf_ai_suggestions (
    institution_id, course_code, faculty_email, window_from, window_to,
    input_responses, input_low_responses, input_avg_understood, suggestion, model
  ) VALUES (
    p_institution_id, p_course_code, lower(NULLIF(btrim(p_faculty_email), '')),
    p_window_from, p_window_to,
    p_input_responses, p_input_low, p_input_avg, p_suggestion, p_model
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── 3. Fetch the most recent prior suggestion (+ its outcome) for feed-back ────
CREATE OR REPLACE FUNCTION public.fn_scf_prior_suggestion(
  p_course_code     text,
  p_faculty_email   text,
  p_institution_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  generated_at     timestamptz,
  input_avg        numeric,
  suggestion       jsonb,
  outcome_avg      numeric,
  outcome_lift     numeric,
  has_outcome      boolean,
  human_verdict    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.generated_at,
         s.input_avg_understood::numeric    AS input_avg,
         s.suggestion,
         s.outcome_avg_understood::numeric  AS outcome_avg,
         s.outcome_lift::numeric            AS outcome_lift,
         (s.outcome_lift IS NOT NULL)       AS has_outcome,
         s.human_verdict::text              AS human_verdict
  FROM public.scf_ai_suggestions s
  WHERE s.course_code = p_course_code
    AND lower(s.faculty_email) IS NOT DISTINCT FROM lower(NULLIF(btrim(p_faculty_email), ''))
    AND (p_institution_id IS NULL OR s.institution_id = p_institution_id)
  ORDER BY s.generated_at DESC
  LIMIT 1;
$$;

-- ── 4. Measure outcomes — the verifier that closes the loop ────────────────────
-- For each not-yet-measured suggestion old enough to have a "next" session, set
-- outcome = avg understanding of the EARLIEST session of the same course+faculty
-- AFTER the suggestion's window, and lift = outcome_avg - input_avg.
CREATE OR REPLACE FUNCTION public.fn_scf_measure_suggestion_outcomes(
  p_min_age_days int DEFAULT 1
)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_measured int;
BEGIN
  WITH candidates AS (
    SELECT s.id, s.course_code, s.faculty_email, s.window_to, s.input_avg_understood
    FROM public.scf_ai_suggestions s
    WHERE s.outcome_lift IS NULL
      AND s.generated_at <= now() - make_interval(days => p_min_age_days)
  ),
  next_session AS (
    -- The EARLIEST next session that has >= 3 responses. Mirroring the input-side
    -- floor (the AI only advises at >= 3 responses) prevents a stray 1-response
    -- session the day after from permanently locking in a false lift; the
    -- suggestion stays unmeasured until a real (>=3) next class happens.
    SELECT c.id,
           (SELECT f.attendance_date
            FROM public.session_feedback f
            WHERE f.course_code = c.course_code
              AND lower(f.faculty_email) IS NOT DISTINCT FROM c.faculty_email
              AND f.attendance_date > c.window_to
            GROUP BY f.attendance_date
            HAVING count(*) >= 3
            ORDER BY f.attendance_date ASC
            LIMIT 1) AS next_date
    FROM candidates c
  ),
  outcome AS (
    SELECT c.id,
           round(avg(f.understood)::numeric, 2) AS out_avg,
           count(*)::int                         AS out_n,
           c.input_avg_understood
    FROM candidates c
    JOIN next_session ns ON ns.id = c.id AND ns.next_date IS NOT NULL
    JOIN public.session_feedback f
      ON f.course_code = c.course_code
     AND lower(f.faculty_email) IS NOT DISTINCT FROM c.faculty_email
     AND f.attendance_date = ns.next_date
    GROUP BY c.id, c.input_avg_understood
  )
  UPDATE public.scf_ai_suggestions s
  SET outcome_avg_understood = o.out_avg,
      outcome_responses      = o.out_n,
      outcome_lift           = round(o.out_avg - COALESCE(o.input_avg_understood, o.out_avg), 2),
      outcome_measured_at    = now(),
      updated_at             = now()
  FROM outcome o
  WHERE s.id = o.id;

  GET DIAGNOSTICS v_measured = ROW_COUNT;
  RETURN v_measured;
END;
$$;

-- ── Anon-lock: all service-role only (route admin client + daily cron) ─────────
REVOKE EXECUTE ON FUNCTION public.fn_scf_record_suggestion(uuid,text,text,date,date,int,int,numeric,jsonb,text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_scf_record_suggestion(uuid,text,text,date,date,int,int,numeric,jsonb,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_scf_prior_suggestion(text,text,uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_scf_prior_suggestion(text,text,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_scf_measure_suggestion_outcomes(int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_scf_measure_suggestion_outcomes(int) TO service_role;

COMMENT ON TABLE public.scf_ai_suggestions IS
  'Self-improving loop memory: each AI teaching suggestion + the input state it was based on + the measured next-class outcome (lift) + optional human verdict. Stores synthesized guidance only (never raw student comments). Feeds fn_scf_prior_suggestion back into the next AI prompt so the model improves from its own track record.';
COMMENT ON FUNCTION public.fn_scf_measure_suggestion_outcomes(int) IS
  'Closes the loop: for unmeasured suggestions, sets outcome = avg understanding of the earliest next session (>=3 responses, same course+faculty after the window) and lift = outcome - input. Run daily. service_role only.';

-- Reload PostgREST's schema cache so the new RPCs resolve immediately after a raw
-- Management-API apply (which does NOT auto-reload) — otherwise the route's
-- .rpc() calls 404 until the next reload. (feedback_exec_sql_ddl_needs_pgrst_schema_reload)
NOTIFY pgrst, 'reload schema';
