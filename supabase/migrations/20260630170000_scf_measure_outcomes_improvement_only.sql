-- =============================================================================
-- 20260630170000_scf_measure_outcomes_improvement_only.sql
-- Scope outcome measurement to kind='improvement' (PR #1681 review).
-- =============================================================================
-- fn_scf_measure_suggestion_outcomes grades a suggestion by understanding-LIFT:
-- next session's avg minus the window baseline. That is the right verifier for an
-- 'improvement' suggestion (low avg -> did it recover?). It is MEANINGLESS for a
-- 'success' suggestion, whose baseline already sits at the ceiling (>=4.5) — its
-- "lift" is almost always <=0, which would mis-grade a genuinely great class as
-- "ineffective" and pollute any avg-lift metric.
--
-- So: only measure kind='improvement'. Success rows keep outcome_lift NULL until
-- a dedicated "did it SUSTAIN >=4.5?" verifier is added with the strengths board.
-- Body is identical to the deployed function except the one new candidates filter
-- (AND s.kind = 'improvement').
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_measure_suggestion_outcomes(p_min_age_days integer DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_measured int;
BEGIN
  WITH candidates AS (
    SELECT s.id, s.institution_id, s.section_id, s.course_code,
           s.faculty_email, s.window_from, s.window_to
    FROM public.scf_ai_suggestions s
    WHERE s.outcome_lift IS NULL
      AND s.domain = 'session_feedback'
      AND s.kind = 'improvement'   -- success rows are not graded on lift (review #1681)
      AND s.generated_at <= now() - make_interval(days => p_min_age_days)
  ),
  -- Recompute the input baseline over the suggestion's own window using the SAME
  -- estimator as the outcome side: round(avg(understood),2) over feedback rows that
  -- belong to a session (date) with >=3 responses. (Fix 2026-06-28: the prior
  -- response-weighted division double-counted s_responses once per joined row,
  -- yielding sum(understood)/(responses*responses) — e.g. 6/9=0.67 for three 2s.)
  recomputed_baseline AS (
    SELECT c.id, round(avg(f.understood)::numeric, 2) AS baseline_avg
    FROM candidates c
    JOIN (
      SELECT course_code, institution_id, lower(faculty_email) AS faculty_email, attendance_date
      FROM public.session_feedback
      GROUP BY course_code, institution_id, lower(faculty_email), attendance_date
      HAVING count(*) >= 3
    ) sess
      ON  sess.course_code     = c.course_code
      AND sess.institution_id IS NOT DISTINCT FROM c.institution_id
      AND (c.faculty_email IS NULL
           OR sess.faculty_email IS NOT DISTINCT FROM lower(c.faculty_email))
    JOIN public.session_feedback f
      ON  f.course_code     = sess.course_code
      AND f.institution_id IS NOT DISTINCT FROM sess.institution_id
      AND lower(f.faculty_email) IS NOT DISTINCT FROM sess.faculty_email
      AND f.attendance_date = sess.attendance_date
      AND f.attendance_date BETWEEN c.window_from AND c.window_to
    GROUP BY c.id
  ),
  next_session AS (
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
      AND f.attendance_date = ns.next_date
    LEFT JOIN recomputed_baseline rb ON rb.id = c.id
    GROUP BY c.id, rb.baseline_avg
  )
  UPDATE public.scf_ai_suggestions s
  SET outcome_avg_understood = o.out_avg::numeric,
      outcome_responses      = o.out_n::integer,
      outcome_lift           = round((o.out_avg - COALESCE(o.baseline_avg, o.out_avg))::numeric, 2)::numeric,
      outcome_measured_at    = now(),
      updated_at             = now()
  FROM outcome o
  WHERE s.id = o.id;

  GET DIAGNOSTICS v_measured = ROW_COUNT;
  RETURN v_measured;
END;
$function$;

-- Preserve the service_role-only lock from 20260630160000.
REVOKE EXECUTE ON FUNCTION public.fn_scf_measure_suggestion_outcomes(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_measure_suggestion_outcomes(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
