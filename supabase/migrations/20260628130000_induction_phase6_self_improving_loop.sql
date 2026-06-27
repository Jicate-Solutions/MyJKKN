-- ============================================================================
-- Fresher Induction — Phase 6: self-improving loop (re-pointed SCF verifier)
-- File: 20260628130000_induction_phase6_self_improving_loop.sql | Date: 2026-06-28
-- Spec: specs/induction-program-module-2026-06-27.md §5d (self-improving loop)
--
-- Director's instruction: reuse the SCF ONE loop, multi-scope — NOT a second loop.
-- Change ONLY what the verifier CLOSES ON, reusing the whole memory+verifier core:
--    SCF closes on  "did the NEXT SESSION's understanding lift?"
--    Induction closes on "did this COHORT refer AND did the referrals JOIN a seat,
--                         WITHOUT sacrificing the value they experienced?"
--
-- WHY THE GRAIN IS A COHORT, NOT A SESSION: a fresher inducts ONCE — there is no
-- "next session" for them. Induction's self-improving cycle is per academic-year
-- cohort: THIS year's induction → measure refer+joined → feed next year's playbook.
-- So the loop's scope key is (institution_id, academic_year_id); the verifier
-- measures the cohort's value-balanced join outcome and lift vs the prior cohort.
--
-- ONE MEMORY (decision: not two loops): induction rows live in the SAME
-- scf_ai_suggestions table, tagged domain='induction'. Two additive columns make
-- the table multi-domain:
--   - domain            text NOT NULL DEFAULT 'session_feedback'
--   - academic_year_id  uuid  (the induction cohort key; NULL for session rows)
-- The numeric columns are reused per-domain (documented):
--   input_avg_understood / outcome_avg_understood hold the domain's "before"/"after"
--   score; for induction that score is the VALUE-BALANCED JOIN score (below).
--
-- DECISION 13 (no referral-pressure-over-education) is baked into the MEASUREMENT:
--   value_balanced_join_score = 100 · (joins_per_fresher) · (cohort_value_avg / 5)
-- A playbook that lifts joins while value drops is discounted by value_health, so
-- the loop cannot learn to optimise joins at the expense of experienced value.
-- Freshers themselves get NO reward (joins are the programme KPI, never held
-- against the individual) — the loop improves the COLLEGE's playbook.
--
-- "JOINED" = admission_leads.funnel_stage IN ('token_paid','confirmed','enrolled')
-- read LIVE off the admission funnel (same source of truth as Phase 4/5).
--
-- Security: induction loop fns are service_role only (the cron + a future AI route
-- call them via the admin client), mirroring the SCF loop fns. Existing
-- scf_ai_suggestions RLS already lets super/admin/institution read induction rows
-- (they carry institution_id), so no new read fn is needed.
-- ============================================================================

-- ── 1. Make the ONE memory multi-domain (additive, backfills existing rows) ────
ALTER TABLE public.scf_ai_suggestions
  ADD COLUMN IF NOT EXISTS domain           text NOT NULL DEFAULT 'session_feedback',
  ADD COLUMN IF NOT EXISTS academic_year_id uuid;

COMMENT ON COLUMN public.scf_ai_suggestions.domain IS
  'Which self-improving loop this row belongs to: ''session_feedback'' (the SCF verifier closes on next-session understanding lift) or ''induction'' (the induction verifier closes on the cohort''s value-balanced refer+join outcome). One memory, multi-scope.';
COMMENT ON COLUMN public.scf_ai_suggestions.academic_year_id IS
  'Induction-domain cohort key (NULL for session_feedback rows). With institution_id it identifies the cohort the verifier measures: freshers enrolled in induction events of that institution+year.';

-- ── 2. Re-point ONLY the SCF verifier''s candidate scan to its own domain ───────
-- Additive WHERE filter so induction rows are never picked up by the session
-- verifier (and vice-versa). Body otherwise identical to 20260625120000.
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
      AND s.domain = 'session_feedback'                 -- <-- the only change: stay in-domain
      AND s.generated_at <= now() - make_interval(days => p_min_age_days)
  ),
  next_session AS (
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

-- ── 3. Record an induction playbook suggestion (the "suggest --record-->" step) ─
CREATE OR REPLACE FUNCTION public.fn_induction_record_loop_suggestion(
  p_institution_id    uuid,
  p_academic_year_id  uuid,
  p_window_from       date,
  p_window_to         date,
  p_input_score       numeric,   -- prior cohort's value-balanced join score (NULL = first cycle)
  p_suggestion        jsonb,
  p_model             text DEFAULT NULL
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
    domain, institution_id, academic_year_id, course_code, faculty_email,
    window_from, window_to, input_avg_understood, suggestion, model
  ) VALUES (
    'induction', p_institution_id, p_academic_year_id, 'induction', NULL,
    p_window_from, p_window_to, p_input_score, p_suggestion, p_model
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── 4. Fetch the prior induction suggestion (+ its outcome) for feed-back ───────
-- The self-improving step: next year's playbook reads last year's guidance AND
-- whether refer+join actually improved, so the AI proposes a BETTER (still
-- value-first) playbook from its own track record.
CREATE OR REPLACE FUNCTION public.fn_induction_prior_loop_suggestion(
  p_institution_id uuid
)
RETURNS TABLE (
  generated_at      timestamptz,
  academic_year_id  uuid,
  input_score       numeric,
  suggestion        jsonb,
  outcome_score     numeric,
  outcome_lift      numeric,
  has_outcome       boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.generated_at,
         s.academic_year_id::uuid,
         s.input_avg_understood::numeric    AS input_score,
         s.suggestion,
         s.outcome_avg_understood::numeric  AS outcome_score,
         s.outcome_lift::numeric            AS outcome_lift,
         (s.outcome_lift IS NOT NULL)       AS has_outcome
  FROM public.scf_ai_suggestions s
  WHERE s.domain = 'induction'
    AND s.institution_id = p_institution_id
  ORDER BY s.generated_at DESC
  LIMIT 1;
$$;

-- ── 5. The RE-POINTED verifier — close the loop on value-balanced refer+join ───
-- For each unmeasured induction suggestion old enough, measure its cohort
-- (freshers enrolled in induction events of the suggestion's institution+year):
--   joins_per_fresher = LIVE joined referrals / enrolled freshers
--   value_health      = cohort avg value_score_avg / 5
--   score             = 100 · joins_per_fresher · value_health   (decision 13)
--   lift              = score − prior cohort's score (0 on the first cycle)
CREATE OR REPLACE FUNCTION public.fn_induction_measure_loop_outcomes(
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
    SELECT s.id, s.institution_id, s.academic_year_id, s.input_avg_understood
    FROM public.scf_ai_suggestions s
    WHERE s.domain = 'induction'
      AND s.outcome_lift IS NULL
      AND s.academic_year_id IS NOT NULL
      AND s.generated_at <= now() - make_interval(days => p_min_age_days)
  ),
  cohort AS (  -- one row per candidate: enrolled count + cohort value/advocacy
    SELECT c.id,
           count(DISTINCT ie.learner_id)              AS enrolled,
           round(avg(comp.value_score_avg), 2)        AS value_avg,
           round(avg(comp.advocacy_score), 2)         AS advocacy_avg
    FROM candidates c
    JOIN public.induction_programs ip
      ON ip.institution_id = c.institution_id AND ip.academic_year_id = c.academic_year_id
    JOIN public.induction_enrollment ie ON ie.event_id = ip.event_id
    LEFT JOIN public.induction_completion comp
      ON comp.event_id = ie.event_id AND comp.learner_id = ie.learner_id
    GROUP BY c.id
  ),
  joins AS (  -- LIVE joined referrals by the cohort's freshers
    SELECT c.id,
           count(*) FILTER (
             WHERE al.funnel_stage IN ('token_paid','confirmed','enrolled')
           )::int AS joined
    FROM candidates c
    JOIN public.induction_programs ip
      ON ip.institution_id = c.institution_id AND ip.academic_year_id = c.academic_year_id
    JOIN public.induction_enrollment ie ON ie.event_id = ip.event_id
    LEFT JOIN public.admission_leads al
      ON al.referred_by_id = ie.learner_id AND al.source = 'referral'::lead_source
    GROUP BY c.id
  ),
  scored AS (
    SELECT c.id, c.input_avg_understood,
           co.enrolled, co.value_avg,
           CASE WHEN COALESCE(co.enrolled, 0) = 0 THEN 0
                ELSE round(100.0 * (j.joined::numeric / co.enrolled)
                                 * (COALESCE(co.value_avg, 0) / 5.0), 2)
           END AS score
    FROM candidates c
    JOIN cohort co ON co.id = c.id
    JOIN joins  j  ON j.id  = c.id
  )
  UPDATE public.scf_ai_suggestions s
  SET outcome_avg_understood = sc.score,
      outcome_responses      = sc.enrolled,
      outcome_lift           = round(sc.score - COALESCE(sc.input_avg_understood, sc.score), 2),
      outcome_measured_at    = now(),
      updated_at             = now()
  FROM scored sc
  WHERE s.id = sc.id;

  GET DIAGNOSTICS v_measured = ROW_COUNT;
  RETURN v_measured;
END;
$$;

-- ── Anon-lock: induction loop fns are service-role only (cron + future AI route) ─
REVOKE EXECUTE ON FUNCTION public.fn_induction_record_loop_suggestion(uuid,uuid,date,date,numeric,jsonb,text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_induction_record_loop_suggestion(uuid,uuid,date,date,numeric,jsonb,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_induction_prior_loop_suggestion(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_induction_prior_loop_suggestion(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_induction_measure_loop_outcomes(int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_induction_measure_loop_outcomes(int) TO service_role;

COMMENT ON FUNCTION public.fn_induction_measure_loop_outcomes(int) IS
  'Re-pointed verifier (induction domain): closes the loop on the cohort''s value-balanced refer+join outcome. score = 100 · joins_per_fresher · (value_avg/5); lift = score − prior cohort score. JOINED read live off admission_leads. Run daily alongside the SCF verifier. service_role only.';

NOTIFY pgrst, 'reload schema';
