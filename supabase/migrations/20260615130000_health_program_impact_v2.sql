-- ============================================================================
-- Migration: 20260615130000_health_program_impact_v2
-- Health — Wellness Programs impact RPC v2 (activation rate + retention curve)
-- Spec: specs/health-wellness-programs-2026-06-15.md
-- ============================================================================
-- Extends fn_health_program_impact with two NEW keys, preserving every
-- existing key (program_id / days_total / policy / reach / engagement /
-- learning / usefulness / adoption_lift):
--
--   • retention  — array of {day_number, viewers, retained_from_prev}, where
--                  retained_from_prev = distinct users who watched day N AND
--                  also watched day N-1 (day-over-day return). Day 1's
--                  retained_from_prev is null (no prior day to return from).
--
--   • activation — {eligible, activated, rate_pct}, where
--                  activated = unique participants (already computed for reach),
--                  eligible  = an ESTIMATE of who could participate (see comment
--                  at the eligible CTE), rate_pct = round(100*activated/eligible,1).
--
-- TIER: additive (CREATE OR REPLACE only). Idempotent. Safe to re-apply.
-- NOTE: NOT applied to prod by this session — file only; lead applies on merge.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_health_program_impact(p_program_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rule         TEXT := fn_get_policy_text('health.programs.completion_rule', 'watch');
  v_pass_pct     INT  := fn_get_policy_int('health.programs.quiz_pass_pct', 60);
  v_window_days  INT  := fn_get_policy_int('health.programs.adoption_window_days', 14);
  v_days_total   INT;
  v_start        DATE;
  v_activated    INT;
  v_eligible     INT;
  v_result       JSONB;
BEGIN
  -- Permission gate (SECURITY DEFINER bypasses RLS, so check explicitly)
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('health.programs.manage')) THEN
    RAISE EXCEPTION 'not authorized to view program impact';
  END IF;

  SELECT count(*)::int INTO v_days_total
    FROM health_program_days WHERE program_id = p_program_id;
  SELECT start_date INTO v_start
    FROM health_programs WHERE id = p_program_id;

  -- activated = unique participants in this program (same number as reach)
  SELECT count(DISTINCT user_id)::int INTO v_activated
    FROM health_program_participation WHERE program_id = p_program_id;

  -- eligible = ESTIMATE of who COULD participate: active profiles whose role(s)
  -- carry the health.programs.view permission. This is an estimate, not an exact
  -- audience — it counts permission-holders org-wide and ignores per-program
  -- institution/audience scoping. It is intended only to give activation rate a
  -- denominator; treat the % as directional.
  SELECT count(DISTINCT p.id)::int INTO v_eligible
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE p.is_active
      AND (cr.permissions->>'health.programs.view')::boolean IS TRUE;

  WITH completed_per_user AS (
    SELECT
      pp.user_id,
      count(*) FILTER (
        WHERE pp.watch_completed
          AND (v_rule = 'watch'
               OR (v_rule = 'watch_and_quiz'
                   AND pp.quiz_score IS NOT NULL
                   AND pp.quiz_score >= v_pass_pct))
      ) AS days_done
    FROM health_program_participation pp
    WHERE pp.program_id = p_program_id
    GROUP BY pp.user_id
  ),
  -- distinct (day_number, user) pairs that were actually watched
  watched_by_day AS (
    SELECT d.day_number, pp.user_id
    FROM health_program_days d
    JOIN health_program_participation pp
      ON pp.day_id = d.id
     AND pp.watched_at IS NOT NULL
    WHERE d.program_id = p_program_id
    GROUP BY d.day_number, pp.user_id
  ),
  -- per-day: viewers and how many of them also watched the previous day
  retention_per_day AS (
    SELECT
      d.day_number,
      count(DISTINCT w.user_id) AS viewers,
      CASE
        WHEN d.day_number = 1 THEN NULL
        ELSE count(DISTINCT w.user_id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM watched_by_day wp
            WHERE wp.user_id = w.user_id
              AND wp.day_number = d.day_number - 1
          )
        )
      END AS retained_from_prev
    FROM health_program_days d
    LEFT JOIN watched_by_day w ON w.day_number = d.day_number
    WHERE d.program_id = p_program_id
    GROUP BY d.day_number
  )
  SELECT jsonb_build_object(
    'program_id', p_program_id,
    'days_total', v_days_total,
    'policy', jsonb_build_object(
      'completion_rule', v_rule,
      'quiz_pass_pct', v_pass_pct,
      'adoption_window_days', v_window_days
    ),
    'reach', jsonb_build_object(
      'unique_participants', v_activated,
      'by_day', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('day_number', d.day_number,
                                            'unique_viewers', x.viewers) ORDER BY d.day_number)
        FROM health_program_days d
        LEFT JOIN (
          SELECT day_id, count(DISTINCT user_id) AS viewers
          FROM health_program_participation
          WHERE program_id = p_program_id AND watched_at IS NOT NULL
          GROUP BY day_id
        ) x ON x.day_id = d.id
        WHERE d.program_id = p_program_id
      ), '[]'::jsonb)
    ),
    'engagement', jsonb_build_object(
      'completed_all', (SELECT count(*) FROM completed_per_user WHERE days_done >= v_days_total AND v_days_total > 0),
      'avg_days_completed', COALESCE((SELECT round(avg(days_done), 2) FROM completed_per_user), 0),
      'funnel', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('days_completed', days_done, 'people', ppl) ORDER BY days_done)
        FROM (SELECT days_done, count(*) AS ppl FROM completed_per_user GROUP BY days_done) f
      ), '[]'::jsonb)
    ),
    'learning', jsonb_build_object(
      'quiz_attempts', (SELECT count(*) FROM health_program_participation
                          WHERE program_id = p_program_id AND quiz_score IS NOT NULL),
      'avg_quiz_score', COALESCE((SELECT round(avg(quiz_score), 1) FROM health_program_participation
                          WHERE program_id = p_program_id AND quiz_score IS NOT NULL), 0),
      'pass_rate_pct', COALESCE((
        SELECT round(100.0 * count(*) FILTER (WHERE quiz_score >= v_pass_pct) / NULLIF(count(*), 0), 1)
        FROM health_program_participation
        WHERE program_id = p_program_id AND quiz_score IS NOT NULL), 0)
    ),
    'usefulness', jsonb_build_object(
      'responses', (SELECT count(*) FROM health_program_participation
                      WHERE program_id = p_program_id AND usefulness_rating IS NOT NULL),
      'avg_rating', COALESCE((SELECT round(avg(usefulness_rating), 2) FROM health_program_participation
                      WHERE program_id = p_program_id AND usefulness_rating IS NOT NULL), 0)
    ),
    -- Adoption-lift: student participants (learner_id present) who gave a health
    -- consent on/after the program start, within the configured window. Honest,
    -- student-scoped (consent/mood tables are student-only).
    'adoption_lift', jsonb_build_object(
      'window_days', v_window_days,
      'new_consents', COALESCE((
        SELECT count(DISTINCT pp.learner_id)
        FROM health_program_participation pp
        JOIN health_consents hc ON hc.learner_id = pp.learner_id
        WHERE pp.program_id = p_program_id
          AND pp.learner_id IS NOT NULL
          AND v_start IS NOT NULL
          AND hc.consented_at >= v_start::timestamptz
          AND hc.consented_at < (v_start + (v_window_days || ' days')::interval)
      ), 0)
    ),
    -- NEW — retention curve: day-over-day return.
    -- retained_from_prev = of the people who watched day N, how many also
    -- watched day N-1. Day 1 is null (nothing to return from).
    'retention', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'day_number', r.day_number,
               'viewers', r.viewers,
               'retained_from_prev', r.retained_from_prev
             ) ORDER BY r.day_number)
      FROM retention_per_day r
    ), '[]'::jsonb),
    -- NEW — activation rate: activated vs an estimate of the eligible audience.
    'activation', jsonb_build_object(
      'eligible', v_eligible,
      'activated', v_activated,
      'rate_pct', round(100.0 * v_activated / NULLIF(v_eligible, 0), 1)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_health_program_impact(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_health_program_impact(UUID) TO authenticated, service_role;

-- Reload PostgREST schema cache so the updated RPC signature is visible to REST.
NOTIFY pgrst, 'reload schema';
