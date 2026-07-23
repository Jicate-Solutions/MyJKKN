-- ============================================================================
-- RCLTP remedial-plan draft loop — Slice 3: at-risk learners RPC (review-gated)
-- 2026-07-23
-- ----------------------------------------------------------------------------
-- The remedial-plans console lists at-risk readers so a Senior Learner can draft
-- and approve plans for them. That console is gated on rcltp.review — but the
-- principal dashboard's at-risk list (fn_rcltp_school_dashboard) is gated on
-- rcltp.report.view_all / rcltp.config.manage, which a plain reviewer (faculty
-- with rcltp.review only) does NOT hold. Reusing the dashboard RPC would leave
-- the at-risk list empty for the exact user the feature is for.
--
-- This RPC returns ONLY the at-risk array (same logic + shape as the dashboard's
-- atRisk), gated so an rcltp.review holder can read it — decoupling the reviewer's
-- tool from the principal aggregate dashboard's permission. Aggregate-only stays:
-- this exposes the same flagged-learner list the principal already sees, nothing
-- more (no per-child band is shown to learners anywhere).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_rcltp_at_risk_learners(p_institution_id uuid)
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

  -- Access gate: super/admin, or a reviewer/reporter/config holder WITH access to
  -- this institution. rcltp.review is the capability that can act on the plans, so
  -- it can also see who needs one.
  IF NOT (
    is_super_admin() OR is_admin()
    OR (
      (user_has_permission('rcltp.review')
       OR user_has_permission('rcltp.report.view_all')
       OR user_has_permission('rcltp.config.manage'))
      AND role_has_institution_access(p_institution_id)
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to view at-risk learners for this institution'
      USING ERRCODE = '42501';
  END IF;

  WITH scoped AS (
    SELECT r.learner_id, r.overall_band, r.overall_score, r.previous_overall_score, r.created_at
    FROM rcltp_assessment_results r
    JOIN rcltp_assessments a ON a.id = r.assessment_id
    WHERE a.institution_id = p_institution_id
  ),
  latest AS (
    SELECT DISTINCT ON (learner_id) *
    FROM scoped
    ORDER BY learner_id, created_at DESC
  )
  SELECT COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'learnerId', learner_id,
      'name', name,
      'roll', roll_number,
      'band', overall_band,
      'overall', overall_score,
      'reason', reason
    ) ORDER BY overall_score NULLS LAST)
    FROM (
      SELECT l.learner_id,
             COALESCE(nullif(trim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), ''), '') AS name,
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
  ), '[]'::jsonb) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_rcltp_at_risk_learners(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_rcltp_at_risk_learners(uuid) TO authenticated;

COMMIT;
