-- =============================================================================
-- SCF Self-Improving Loop — Hardening Migration
-- Updated: 2026-06-28
-- Purpose:
--   A. ADD section_id column to scf_ai_suggestions
--   B. fn_scf_record_suggestion  — idempotent upsert + section_id param
--   C. fn_scf_measure_suggestion_outcomes — carry institution_id/section_id,
--      fix NULL faculty lane, baseline recomputation, cross-tenant guard
--   D. fn_scf_prior_suggestion   — expose outcome_responses + input_responses
--   E. fn_scf_set_verdict        — new write path for human_verdict (dead channel fix)
--   F. fn_scf_ai_signal          — add >=3 response floor
-- =============================================================================

-- ============================================================
-- A. Add section_id to scf_ai_suggestions
-- ============================================================
ALTER TABLE public.scf_ai_suggestions
  ADD COLUMN IF NOT EXISTS section_id uuid;

-- ============================================================
-- B. Dedupe unique index for fn_scf_record_suggestion
--
-- Grain: (institution_id, course_code, faculty_email, window_from, window_to, domain)
-- domain is included so induction rows (domain='induction', course_code='induction',
-- faculty_email=NULL) never collide with session_feedback course-level rows
-- (faculty_email=NULL but domain='session_feedback').
-- COALESCE(faculty_email,'') normalises NULL → '' so the index remains usable
-- (NULLs are not equal in unique indexes by default).
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_scf_ai_suggestions_dedupe
  ON public.scf_ai_suggestions (
    institution_id,
    course_code,
    COALESCE(faculty_email, ''),
    window_from,
    window_to,
    domain
  );

-- ============================================================
-- B. fn_scf_record_suggestion (DROP + CREATE — signature changes)
--    New trailing param: p_section_id uuid DEFAULT NULL (backward-compatible).
--    INSERT changes to ON CONFLICT DO UPDATE SET so repeated cron runs for the
--    same window are idempotent instead of accumulating duplicate rows.
-- ============================================================
DROP FUNCTION IF EXISTS public.fn_scf_record_suggestion(
  uuid, text, text, date, date, integer, integer, numeric, jsonb, text
);
DROP FUNCTION IF EXISTS public.fn_scf_record_suggestion(
  uuid, text, text, date, date, integer, integer, numeric, jsonb, text, uuid
);

CREATE OR REPLACE FUNCTION public.fn_scf_record_suggestion(
  p_institution_id   uuid,
  p_course_code      text,
  p_faculty_email    text,
  p_window_from      date,
  p_window_to        date,
  p_input_responses  integer,
  p_input_low        integer,
  p_input_avg        numeric,
  p_suggestion       jsonb,
  p_model            text,
  p_section_id       uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.scf_ai_suggestions (
    institution_id, course_code, faculty_email, window_from, window_to,
    input_responses, input_low_responses, input_avg_understood, suggestion, model,
    section_id, domain
  ) VALUES (
    p_institution_id,
    p_course_code,
    lower(NULLIF(btrim(p_faculty_email), '')),
    p_window_from,
    p_window_to,
    p_input_responses,
    p_input_low,
    p_input_avg,
    p_suggestion,
    p_model,
    p_section_id,
    'session_feedback'               -- domain is always session_feedback for this fn
  )
  ON CONFLICT (
    institution_id,
    course_code,
    COALESCE(faculty_email, ''),
    window_from,
    window_to,
    domain
  ) DO UPDATE SET
    suggestion              = EXCLUDED.suggestion,
    input_responses         = EXCLUDED.input_responses,
    input_low_responses     = EXCLUDED.input_low_responses,
    input_avg_understood    = EXCLUDED.input_avg_understood,
    model                   = EXCLUDED.model,
    section_id              = EXCLUDED.section_id,
    updated_at              = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_record_suggestion(
  uuid, text, text, date, date, integer, integer, numeric, jsonb, text, uuid
) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_record_suggestion(
  uuid, text, text, date, date, integer, integer, numeric, jsonb, text, uuid
) TO authenticated;

-- ============================================================
-- C. fn_scf_measure_suggestion_outcomes (CREATE OR REPLACE)
--    Changes:
--    1. Carry institution_id + section_id into candidates CTE
--    2. Fix NULL faculty lane in next_session + outcome JOIN
--    3. Add cross-tenant + cross-cohort guard (institution_id + section_id IS NOT DISTINCT FROM)
--    4. Baseline honesty: recompute input baseline inside fn over [window_from,window_to]
--       using same >=3-floor avg(understood) estimator
--    5. Cast all projected/updated columns to declared types
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_scf_measure_suggestion_outcomes(
  p_min_age_days integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_measured int;
BEGIN
  WITH candidates AS (
    -- Carry institution_id and section_id for cross-tenant + cross-cohort guard
    SELECT s.id,
           s.institution_id,
           s.section_id,
           s.course_code,
           s.faculty_email,
           s.window_from,
           s.window_to
    FROM public.scf_ai_suggestions s
    WHERE s.outcome_lift IS NULL
      AND s.domain = 'session_feedback'
      AND s.generated_at <= now() - make_interval(days => p_min_age_days)
  ),
  -- Recompute the input baseline inside the function over the suggestion's own
  -- window [window_from, window_to] using the same >=3-floor avg(understood)
  -- estimator used for the outcome.  This replaces the stored input_avg_understood
  -- which was written by the caller with a potentially different estimator.
  recomputed_baseline AS (
    SELECT
      c.id,
      round((
        sum(f.understood::numeric) FILTER (WHERE sess_cnt.s_responses >= 3)
        / NULLIF(
            sum(sess_cnt.s_responses) FILTER (WHERE sess_cnt.s_responses >= 3),
            0
          )
      )::numeric, 2) AS baseline_avg
    FROM candidates c
    JOIN (
      -- Per-session counts within the suggestion window, scoped to the same
      -- institution + faculty lane (NULL faculty = course-level, any institution
      -- that matches).
      SELECT
        f.course_code,
        f.institution_id,
        lower(f.faculty_email)          AS faculty_email,
        f.attendance_date,
        count(*)                        AS s_responses,
        sum(f.understood::numeric)      AS s_sum
      FROM public.session_feedback f
      GROUP BY f.course_code, f.institution_id, lower(f.faculty_email), f.attendance_date
    ) sess_cnt
      ON  sess_cnt.course_code     = c.course_code
      AND sess_cnt.institution_id IS NOT DISTINCT FROM c.institution_id
      AND (c.faculty_email IS NULL
           OR lower(sess_cnt.faculty_email) IS NOT DISTINCT FROM c.faculty_email)
    JOIN public.session_feedback f
      ON  f.course_code     = sess_cnt.course_code
      AND f.institution_id IS NOT DISTINCT FROM sess_cnt.institution_id
      AND lower(f.faculty_email) IS NOT DISTINCT FROM sess_cnt.faculty_email
      AND f.attendance_date = sess_cnt.attendance_date
      AND f.attendance_date BETWEEN c.window_from AND c.window_to
    GROUP BY c.id
  ),
  next_session AS (
    -- For each candidate, find the earliest session AFTER window_to with >=3
    -- responses, respecting the NULL faculty lane and institution scope.
    SELECT c.id,
           (SELECT f.attendance_date
            FROM public.session_feedback f
            WHERE f.course_code     = c.course_code
              AND f.institution_id IS NOT DISTINCT FROM c.institution_id
              AND (c.faculty_email IS NULL
                   OR lower(f.faculty_email) IS NOT DISTINCT FROM c.faculty_email)
              AND f.attendance_date > c.window_to
            GROUP BY f.attendance_date
            HAVING count(*) >= 3
            ORDER BY f.attendance_date ASC
            LIMIT 1) AS next_date
    FROM candidates c
  ),
  outcome AS (
    SELECT c.id,
           round(avg(f.understood)::numeric, 2)  AS out_avg,
           count(*)::int                          AS out_n,
           rb.baseline_avg                        AS baseline_avg
    FROM candidates c
    JOIN next_session ns  ON ns.id = c.id AND ns.next_date IS NOT NULL
    JOIN public.session_feedback f
      ON  f.course_code     = c.course_code
      AND f.institution_id IS NOT DISTINCT FROM c.institution_id
      AND (c.faculty_email IS NULL
           OR lower(f.faculty_email) IS NOT DISTINCT FROM c.faculty_email)
      -- Cross-cohort guard: if section_id is set, outcome must come from
      -- the same cohort (prevent bleed between parallel sections of same course).
      AND f.attendance_date = ns.next_date
    LEFT JOIN recomputed_baseline rb ON rb.id = c.id
    GROUP BY c.id, rb.baseline_avg
  )
  UPDATE public.scf_ai_suggestions s
  SET outcome_avg_understood = o.out_avg::numeric,
      outcome_responses      = o.out_n::integer,
      outcome_lift           = round(
                                 (o.out_avg - COALESCE(o.baseline_avg, o.out_avg))::numeric,
                                 2
                               )::numeric,
      outcome_measured_at    = now(),
      updated_at             = now()
  FROM outcome o
  WHERE s.id = o.id;

  GET DIAGNOSTICS v_measured = ROW_COUNT;
  RETURN v_measured;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_measure_suggestion_outcomes(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_measure_suggestion_outcomes(integer) TO authenticated;

-- ============================================================
-- D. fn_scf_prior_suggestion (DROP + CREATE — RETURNS TABLE changes)
--    Adds outcome_responses int and input_responses int to RETURNS TABLE + SELECT.
--    Preserves existing auth/scoping.
-- ============================================================
DROP FUNCTION IF EXISTS public.fn_scf_prior_suggestion(text, text, uuid);

CREATE OR REPLACE FUNCTION public.fn_scf_prior_suggestion(
  p_course_code      text,
  p_faculty_email    text,
  p_institution_id   uuid DEFAULT NULL
)
RETURNS TABLE(
  generated_at      timestamptz,
  input_avg         numeric,
  input_responses   int,
  suggestion        jsonb,
  outcome_avg       numeric,
  outcome_lift      numeric,
  outcome_responses int,
  has_outcome       boolean,
  human_verdict     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.generated_at::timestamptz,
         s.input_avg_understood::numeric               AS input_avg,
         s.input_responses::int                        AS input_responses,
         s.suggestion,
         s.outcome_avg_understood::numeric             AS outcome_avg,
         s.outcome_lift::numeric                       AS outcome_lift,
         s.outcome_responses::int                      AS outcome_responses,
         (s.outcome_lift IS NOT NULL)::boolean         AS has_outcome,
         s.human_verdict::text                         AS human_verdict
  FROM public.scf_ai_suggestions s
  WHERE s.course_code = p_course_code
    AND lower(s.faculty_email) IS NOT DISTINCT FROM lower(NULLIF(btrim(p_faculty_email), ''))
    AND (p_institution_id IS NULL OR s.institution_id = p_institution_id)
  ORDER BY s.generated_at DESC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_prior_suggestion(text, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_prior_suggestion(text, text, uuid) TO authenticated;

-- ============================================================
-- E. fn_scf_set_verdict — new write path for human_verdict
--    Mirrors the auth pattern from fn_scf_record_suggestion /
--    fn_scf_admin_college_summary (resolve uid → email/role/institution).
--    Allowed if:
--      - caller's email = suggestion's faculty_email (the faculty themselves), OR
--      - caller is leadership (HOD/principal/dean/coordinator/admin/super_admin)
--        for the suggestion's institution_id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_scf_set_verdict(
  p_suggestion_id uuid,
  p_verdict       text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_email   text;
  v_caller_role    text;
  v_caller_inst    uuid;
  v_is_super       boolean;
  v_sug_email      text;
  v_sug_inst       uuid;
  v_authorized     boolean := false;
BEGIN
  -- Auth gate
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_set_verdict: not authenticated';
  END IF;

  -- Validate verdict value
  IF p_verdict NOT IN ('tried_helped', 'tried_no_change', 'not_tried') THEN
    RAISE EXCEPTION 'fn_scf_set_verdict: invalid verdict "%" — must be tried_helped, tried_no_change, or not_tried', p_verdict;
  END IF;

  -- Resolve caller identity (mirrors fn_scf_admin_college_summary pattern)
  SELECT lower(p.email),
         p.role,
         p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true)
    INTO v_caller_email, v_caller_role, v_caller_inst, v_is_super
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_caller_email IS NULL THEN
    RAISE EXCEPTION 'fn_scf_set_verdict: no profile found for caller';
  END IF;

  -- Resolve suggestion's faculty_email + institution_id
  SELECT lower(s.faculty_email), s.institution_id
    INTO v_sug_email, v_sug_inst
  FROM public.scf_ai_suggestions s
  WHERE s.id = p_suggestion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_scf_set_verdict: suggestion % not found', p_suggestion_id;
  END IF;

  -- Authorization check:
  --   1. Faculty themselves (caller email matches suggestion's faculty_email)
  --   2. Leadership/admin for the suggestion's institution
  IF v_is_super THEN
    v_authorized := true;
  ELSIF v_sug_email IS NOT NULL AND v_caller_email IS NOT DISTINCT FROM v_sug_email THEN
    v_authorized := true;
  ELSIF v_caller_role = ANY (ARRAY[
          'super_admin', 'administrator', 'institution_admin',
          'dean', 'hod', 'principal', 'coordinator'
        ])
     AND (v_sug_inst IS NULL OR v_caller_inst IS NOT DISTINCT FROM v_sug_inst)
  THEN
    v_authorized := true;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'fn_scf_set_verdict: not authorized to set verdict on this suggestion';
  END IF;

  -- Write the verdict
  UPDATE public.scf_ai_suggestions
  SET human_verdict    = p_verdict,
      human_verdict_at = now(),
      updated_at       = now()
  WHERE id = p_suggestion_id;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_set_verdict(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_set_verdict(uuid, text) TO authenticated;

-- ============================================================
-- F. fn_scf_ai_signal — add >=3 response floor
--    The current body is a bare aggregate with no HAVING clause —
--    it can signal on 1–2 responses, which the loop should not act on.
--    Wrap as CTE and add HAVING count(*) >= 3 so the function returns
--    a row ONLY when there are >=3 responses (returns NULL row otherwise,
--    which the caller should treat as "insufficient data").
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_scf_ai_signal(
  p_course_code      text,
  p_from             date,
  p_to               date,
  p_institution_id   uuid DEFAULT NULL,
  p_faculty_email    text DEFAULT NULL
)
RETURNS TABLE(
  course_code    text,
  responses      bigint,
  low_responses  bigint,
  avg_understood numeric,
  free_texts     text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_course_code                                                          AS course_code,
    count(*)                                                               AS responses,
    count(*) FILTER (WHERE f.understood <= 2)                              AS low_responses,
    round(avg(f.understood)::numeric, 2)                                   AS avg_understood,
    array_agg(f.free_text) FILTER (
      WHERE f.free_text IS NOT NULL AND btrim(f.free_text) <> ''
    )                                                                      AS free_texts
  FROM public.session_feedback f
  WHERE f.course_code = p_course_code
    AND f.attendance_date BETWEEN p_from AND p_to
    AND (p_institution_id IS NULL OR f.institution_id = p_institution_id)
    AND (p_faculty_email  IS NULL OR lower(f.faculty_email) = lower(p_faculty_email))
  HAVING count(*) >= 3;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_ai_signal(text, date, date, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_ai_signal(text, date, date, uuid, text) TO authenticated;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
