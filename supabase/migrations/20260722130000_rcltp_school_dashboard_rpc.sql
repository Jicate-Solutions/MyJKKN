-- =====================================================================
-- 2026-07-22 — RCLTP principal (school-head) dashboard aggregation RPC
-- =====================================================================
-- Powers the four panels of /rcltp/principal from PROVISIONAL scored results.
-- SECURITY DEFINER (bypasses RLS to aggregate the whole cohort) but gates the
-- caller to rcltp.report.view_all / rcltp.config.manage on the target institution
-- (super/admin bypass), then re-scopes every read to p_institution_id.
--
-- ⚠️ The bands/scores it returns are PROVISIONAL — pending EKSAQ validation. The
-- UI MUST render the "Provisional — pending EKSAQ validation" banner. This fn
-- adds no scoring logic; it only aggregates rows the engine already wrote.
--
-- Uses the LATEST result per learner for standing panels (band distribution,
-- at-risk, section comparison) and ALL sittings for the cycle trend.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_rcltp_school_dashboard(p_institution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_institution_id IS NULL THEN
    RAISE EXCEPTION 'institution id is required';
  END IF;

  -- Access gate: super/admin, or a report/config permission holder with access
  -- to THIS institution. Mirrors the page guard (rcltp.report.view_all OR
  -- rcltp.config.manage) so the API and UI can never disagree.
  IF NOT (
    is_super_admin() OR is_admin()
    OR (
      (user_has_permission('rcltp.report.view_all')
       OR user_has_permission('rcltp.config.manage'))
      AND role_has_institution_access(p_institution_id)
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to view the RCLTP dashboard for this institution'
      USING ERRCODE = '42501';
  END IF;

  WITH scoped AS (
    SELECT r.learner_id,
           r.overall_band,
           r.overall_score,
           r.previous_overall_score,
           r.created_at,
           a.section_id,
           a.grade_level,
           a.cycle_no
    FROM rcltp_assessment_results r
    JOIN rcltp_assessments a ON a.id = r.assessment_id
    WHERE a.institution_id = p_institution_id
  ),
  latest AS (
    SELECT DISTINCT ON (learner_id) *
    FROM scoped
    ORDER BY learner_id, created_at DESC
  )
  SELECT jsonb_build_object(
    'provisional', true,
    'totals', jsonb_build_object(
      'scoredSittings', (SELECT count(*) FROM scoped),
      'learners', (SELECT count(*) FROM latest)
    ),
    -- (a) cohort band distribution — latest standing per learner, enum order
    'bandDistribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('band', band, 'count', c) ORDER BY band)
      FROM (
        SELECT overall_band AS band, count(*) AS c
        FROM latest WHERE overall_band IS NOT NULL
        GROUP BY overall_band
      ) t
    ), '[]'::jsonb),
    -- (b) cycle progress — avg overall per cycle across ALL sittings
    'cycleProgress', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'cycle', cycle_no, 'avgOverall', round(avg_o, 1), 'count', c
      ) ORDER BY cycle_no)
      FROM (
        SELECT cycle_no, avg(overall_score) AS avg_o, count(*) AS c
        FROM scoped WHERE cycle_no IS NOT NULL AND overall_score IS NOT NULL
        GROUP BY cycle_no
      ) t
    ), '[]'::jsonb),
    -- (c) at-risk — emergent band OR a regression vs the learner's prior overall
    'atRisk', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'learnerId', learner_id, 'name', name, 'roll', roll_number,
        'band', overall_band, 'overall', overall_score, 'reason', reason
      ) ORDER BY overall_score NULLS LAST)
      FROM (
        SELECT l.learner_id,
               nullif(trim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), '') AS name,
               lp.roll_number,
               l.overall_band,
               l.overall_score,
               CASE
                 WHEN l.overall_band = 'emergent' THEN 'low_band'
                 WHEN l.previous_overall_score IS NOT NULL
                      AND l.overall_score < l.previous_overall_score THEN 'regression'
                 ELSE 'other'
               END AS reason
        FROM latest l
        JOIN learners_profiles lp ON lp.id = l.learner_id
        WHERE l.overall_band = 'emergent'
           OR (l.previous_overall_score IS NOT NULL
               AND l.overall_score < l.previous_overall_score)
        LIMIT 50
      ) t
    ), '[]'::jsonb),
    -- (d) class & section comparison — avg overall per section/grade (latest)
    'sectionComparison', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sectionId', section_id, 'section', section_name,
        'grade', grade_level, 'avgOverall', round(avg_o, 1), 'count', c
      ) ORDER BY grade_level NULLS LAST, section_name NULLS LAST)
      FROM (
        SELECT l.section_id, s.section_name, l.grade_level,
               avg(l.overall_score) AS avg_o, count(*) AS c
        FROM latest l
        LEFT JOIN sections s ON s.id = l.section_id
        WHERE l.overall_score IS NOT NULL
        GROUP BY l.section_id, s.section_name, l.grade_level
      ) t
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Lock down: authenticated only (the fn self-checks the caller's permission);
-- never anon (public anon key is embedded in the client bundle).
REVOKE EXECUTE ON FUNCTION public.fn_rcltp_school_dashboard(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_rcltp_school_dashboard(uuid) TO authenticated;
