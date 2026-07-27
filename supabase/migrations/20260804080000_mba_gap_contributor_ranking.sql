-- ============================================================================
-- MBA Teaching-Enterprise · Data-Gap contributor ranking (managers only)
-- Created: 2026-07-27
-- ----------------------------------------------------------------------------
-- Decision #10/#11: a MANAGERS-ONLY per-person ranking, ranked by REAL
-- improvements produced (not raw volume), surfaced with both a per-college and a
-- combined all-JKKN view. This RPC returns one row per contributor with their
-- college attached, ordered by produced_improvement DESC → the UI toggles
-- per-college vs combined by filtering client-side (one call, both views).
--
-- Ranking by produced_improvement (a filed gap that reached an APPLIED idea) is
-- the anti-gaming choice: 3 gaps that all led to fixes outrank 30 that went
-- nowhere. Manager-gated in-body (NULL-safe COALESCE), aggregate-only.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_mba_gap_contributor_ranking()
RETURNS TABLE (
  associate_id         uuid,
  associate_name       text,
  institution_id       uuid,
  institution_name     text,
  filed                int,
  accepted             int,
  produced_improvement int
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
    RAISE EXCEPTION 'Only Improvement Board managers can view the contributor ranking.';
  END IF;

  RETURN QUERY
  SELECT
    g.filed_by                                                            AS associate_id,
    p.full_name                                                           AS associate_name,
    p.institution_id                                                      AS institution_id,
    i.name::text                                                          AS institution_name,
    COUNT(*)::int                                                         AS filed,
    COUNT(*) FILTER (WHERE g.status = 'accepted')::int                    AS accepted,
    COUNT(*) FILTER (WHERE g.gap_outcome = 'produced_applied_improvement')::int
                                                                          AS produced_improvement
  FROM public.mba_data_gaps g
  LEFT JOIN public.profiles p     ON p.id = g.filed_by
  LEFT JOIN public.institutions i ON i.id = p.institution_id
  GROUP BY g.filed_by, p.full_name, p.institution_id, i.name
  ORDER BY produced_improvement DESC, accepted DESC, filed DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_mba_gap_contributor_ranking() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_gap_contributor_ranking() TO authenticated;

COMMIT;
