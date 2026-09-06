-- ============================================================================
-- MBA Teaching-Enterprise · Data-Gap MEASUREMENT MOAT (Phase 3)
-- Created: 2026-07-26
-- ----------------------------------------------------------------------------
-- Phase 1 let an Associate FILE a data gap; accepting it spawns a linked
-- improvement_ideas row (mba_data_gaps.linked_idea_id). Phase 3 MEASURES whether
-- that linked Idea actually got APPLIED, so the loop becomes self-improving:
--   measure the outcome → each Associate earns a track record of real impact →
--   a per-area "hit rate" signal the ranking will later weight on.
-- This is the SCF-loop pattern (measure the outcome → the next suggestion
-- changes BECAUSE it was measured).
--
-- Additive only. It ADDs two columns + three SECURITY DEFINER RPCs. It does NOT
-- touch fn_mba_list_data_gaps or the Phase-2 ranking columns (owned elsewhere).
--
-- Outcome classification (per gap, LEFT JOIN improvement_ideas on linked_idea_id):
--   accepted + idea applied/verified                          → produced_applied_improvement
--   accepted + idea rejected/withdrawn/not_pursued            → improvement_dropped
--   accepted + idea logged/under_review/approved/closed OR no idea → accepted_pending_improvement
--   not_feasible/captured_elsewhere/duplicate                 → not_accepted
--   else (filed/triaged)                                      → pending
-- ============================================================================

BEGIN;

-- 1) Outcome columns --------------------------------------------------------
ALTER TABLE public.mba_data_gaps
  ADD COLUMN IF NOT EXISTS gap_outcome text
    CHECK (gap_outcome IN (
      'produced_applied_improvement',
      'accepted_pending_improvement',
      'improvement_dropped',
      'not_accepted',
      'pending'
    )),
  ADD COLUMN IF NOT EXISTS outcome_measured_at timestamptz;

-- 2) Measure gap outcomes (SECDEF, service-role-only) -----------------------
-- Pure SQL. Recomputes gap_outcome for EVERY gap from its own status + the
-- linked idea's status, stamps outcome_measured_at, and returns the row count.
-- Idempotent — safe to re-run every day. Service-role only (called by the cron
-- via createServiceRoleClient); no auth.uid() gate is needed because it is never
-- reachable by an end-user session.
CREATE OR REPLACE FUNCTION public.fn_mba_measure_gap_outcomes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Self-join the target to a LEFT-JOINed copy so we can read the linked idea's
  -- status (or NULL when no idea is linked) while updating every gap row.
  UPDATE public.mba_data_gaps g
  SET
    gap_outcome = CASE
      WHEN g2.status = 'accepted' AND i.status IN ('applied', 'verified')
        THEN 'produced_applied_improvement'
      WHEN g2.status = 'accepted' AND i.status IN ('rejected', 'withdrawn', 'not_pursued')
        THEN 'improvement_dropped'
      WHEN g2.status = 'accepted'
           AND (i.status IN ('logged', 'under_review', 'approved', 'closed') OR i.id IS NULL)
        THEN 'accepted_pending_improvement'
      WHEN g2.status IN ('not_feasible', 'captured_elsewhere', 'duplicate')
        THEN 'not_accepted'
      ELSE 'pending'
    END,
    outcome_measured_at = now()
  FROM public.mba_data_gaps g2
  LEFT JOIN public.improvement_ideas i ON i.id = g2.linked_idea_id
  WHERE g2.id = g.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_measure_gap_outcomes() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_measure_gap_outcomes() TO service_role;

-- 3) Per-Associate track record (SECDEF) ------------------------------------
-- filed → accepted → produced-improvement, grouped by filer. A manager may pass
-- any p_associate_id (or NULL for all associates); a non-manager is FORCED to
-- their own auth.uid() so an Associate can only ever see their own record.
CREATE OR REPLACE FUNCTION public.fn_mba_gap_track_record(
  p_associate_id uuid DEFAULT NULL
) RETURNS TABLE (
  associate_id         uuid,
  associate_name       text,
  filed                int,
  accepted             int,
  produced_improvement int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := (
    COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR COALESCE(user_has_permission('improvement.board.manage'), false)
  );
  v_target uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  -- Managers may scope to anyone (or all); everyone else is pinned to self.
  IF v_is_manager THEN
    v_target := p_associate_id;      -- NULL => every associate
  ELSE
    v_target := v_uid;
  END IF;

  RETURN QUERY
  SELECT
    g.filed_by                                                            AS associate_id,
    p.full_name                                                           AS associate_name,
    COUNT(*)::int                                                         AS filed,
    COUNT(*) FILTER (WHERE g.status = 'accepted')::int                    AS accepted,
    COUNT(*) FILTER (WHERE g.gap_outcome = 'produced_applied_improvement')::int
                                                                          AS produced_improvement
  FROM public.mba_data_gaps g
  LEFT JOIN public.profiles p ON p.id = g.filed_by
  WHERE (v_target IS NULL OR g.filed_by = v_target)
  GROUP BY g.filed_by, p.full_name
  ORDER BY filed DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_gap_track_record(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_gap_track_record(uuid) TO authenticated;

-- 4) Per-area hit rate (SECDEF) — the feed-forward signal -------------------
-- Per improvement_area: how many accepted gaps, how many produced an applied
-- improvement, and the hit-rate %. This is the aggregate the ranking will later
-- weight on so high-yield areas get prioritised. Authenticated-only; aggregate
-- (no individual rows), so no per-row permission gate is needed.
CREATE OR REPLACE FUNCTION public.fn_mba_gap_area_hit_rate()
RETURNS TABLE (
  area_id      uuid,
  area_label   text,
  accepted     int,
  produced     int,
  hit_rate_pct numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
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
