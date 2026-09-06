-- ============================================================================
-- CARRE sealed-lane PARTICIPATION LINE (ADDITIVE) — backlog item 5
-- 2026-07-25 · specs/carre-evidence-instrumentation-backlog-2026-07-25.md
--
-- GAP: leadership sees NOTHING about the sealed participant lane until an
-- item-level (parameter, lane) group reaches k>=3 — so a cycle where 1-2
-- learners have already spoken looks identical to a dead one. Even raw
-- participation VOLUME is invisible.
--
-- FIX: one read-only RPC returning a single cycle-level activity row
-- (scorers, items_scored, last_activity) — and ONLY once the cycle has
-- 3 or more DISTINCT scorers. The k-floor applies to the count itself:
-- a "2 scorers" reveal could isolate voices, so below 3 the function
-- returns NOTHING, exactly like fn_carre_participant_rollup's item floor.
--
-- SEAL DISCIPLINE (unchanged from 20260725101500):
--   • no identities, no lanes, no per-item data — three aggregate numbers only
--   • last_activity is a DATE (not a timestamp) — recency without a
--     submission-time fingerprint
--   • leadership gate mirrors fn_carre_participant_rollup verbatim
--   • base table untouched; RLS seal untouched; write path untouched
--
-- ADDITIVE-ONLY: 1 new RPC. No existing fn_care_*/fn_carre_* touched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_carre_participant_activity(p_cycle_id uuid)
RETURNS TABLE (scorers int, items_scored int, last_activity date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Mirror of fn_carre_participant_rollup's leadership gate.
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('audit.cycle.view')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT count(DISTINCT s.scorer_id)::int,
         count(DISTINCT s.parameter_code)::int,
         max(s.updated_at)::date
  FROM public.carre_participant_scores s
  WHERE s.cycle_id = p_cycle_id
  HAVING count(DISTINCT s.scorer_id) >= 3;  -- k-floor on the COUNT itself:
                                            -- below 3 scorers, NOTHING returns
END;
$$;

COMMENT ON FUNCTION public.fn_carre_participant_activity(uuid) IS
  'CARRE sealed-lane participation line: cycle-level (scorers, items_scored, last_activity) for leadership, returned ONLY when the cycle has >= 3 distinct sealed scorers. No identities, no lanes, no per-item data. Gate mirrors fn_carre_participant_rollup.';

REVOKE EXECUTE ON FUNCTION public.fn_carre_participant_activity(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_carre_participant_activity(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
