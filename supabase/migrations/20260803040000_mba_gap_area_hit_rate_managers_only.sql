-- ============================================================================
-- MBA Teaching-Enterprise · Data-gap area scoreboard → managers only (Phase 4)
-- Created: 2026-07-26
-- ----------------------------------------------------------------------------
-- Rulebook decision #6: the health scoreboard is for managers only. #2458
-- shipped fn_mba_gap_area_hit_rate GRANTed to `authenticated` with NO internal
-- guard — i.e. any signed-in user could read every area's accept/produce hit
-- rate. This adds an in-body manager guard so a future scoreboard UI is locked
-- from day one. No app code calls this RPC yet (verified), so nothing breaks.
--
-- Why an in-body guard and not a grant: every logged-in user is `authenticated`,
-- so a grant cannot express "managers only". The check lives inside the function
-- via user_has_permission('improvement.board.manage'), NULL-safe with COALESCE
-- (a bare `IF NOT (SELECT …)` falls through when auth.uid() is NULL). The cron's
-- feed-forward wire does NOT call this RPC (it computes the track record inline),
-- so gating here does not touch the loop.
--
-- CREATE OR REPLACE only (no signature change); grants unchanged
-- (REVOKE anon,PUBLIC / GRANT authenticated — the body does the manager gate).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_mba_gap_area_hit_rate()
RETURNS TABLE (
  area_id      uuid,
  area_label   text,
  accepted     int,
  produced     int,
  hit_rate_pct numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;
  IF NOT (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('improvement.board.manage'), false)
  ) THEN
    RAISE EXCEPTION 'Only Improvement Board managers can view the data-gap area scoreboard.';
  END IF;

  RETURN QUERY
  SELECT
    g.area_id,
    a.label                                                                AS area_label,
    COUNT(*) FILTER (WHERE g.status = 'accepted')::int                     AS accepted,
    COUNT(*) FILTER (WHERE g.gap_outcome = 'produced_applied_improvement')::int
                                                                           AS produced,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE g.gap_outcome = 'produced_applied_improvement')
      / NULLIF(COUNT(*) FILTER (WHERE g.status = 'accepted'), 0),
      1
    )                                                                      AS hit_rate_pct
  FROM public.mba_data_gaps g
  LEFT JOIN public.improvement_areas a ON a.id = g.area_id
  GROUP BY g.area_id, a.label
  ORDER BY hit_rate_pct DESC NULLS LAST;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_gap_area_hit_rate() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_gap_area_hit_rate() TO authenticated;

COMMIT;
