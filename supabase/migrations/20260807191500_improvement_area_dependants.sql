-- Migration: read what is attached to an Improvement Board before switching it off
-- Created: 2026-07-30
-- ============================================================================
-- Switching a board off hides it everywhere — every read filters is_active —
-- but keeps every row filed against it, INCLUDING the people recorded in
-- hr_additional_roles as current holders of a role on that board. That is the
-- intended, reversible behaviour and the Director confirmed it on 2026-07-30.
--
-- The gap that was closed: it happened SILENTLY. A manager could switch off a
-- board that eight people are currently posted to and be told nothing about
-- them, while those eight stay recorded as current holders of a board nobody
-- can see. The decision was to WARN, not to block, and above all NOT to end
-- anyone's role — so switching the board back on restores everything exactly.
--
-- This function is the read that warning needs. It writes nothing and changes
-- nothing; it only counts.
--
-- The counting logic is lifted from fn_improvement_area_delete's guard
-- (20260807120000) rather than re-derived, so the warning and the delete guard
-- can never disagree about what "attached" means: eight dependent tables plus
-- current role holders. Seven of those eight foreign keys CASCADE, which is why
-- the delete guard refuses; a switch-off touches none of them.
--
-- SECURITY DEFINER because a board manager has no RLS read path to several of
-- the referencing tables, gated on the same authority as every other board
-- management RPC (fn_improvement_can_manage_areas — already COALESCE-wrapped,
-- so NOT (...) cannot fall through on a NULL).

CREATE OR REPLACE FUNCTION public.fn_improvement_area_dependants(p_area_id uuid)
RETURNS TABLE (
  label                     text,
  is_system                 boolean,
  is_active                 boolean,
  idea_count                bigint,
  artifact_count            bigint,
  artifact_version_count    bigint,
  data_gap_count            bigint,
  posting_count             bigint,
  analyst_view_count        bigint,
  rotation_slot_count       bigint,
  rotation_cycle_dept_count bigint,
  role_holder_count         bigint,
  dependent_count           bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_improvement_can_manage_areas() THEN
    RAISE EXCEPTION 'You do not have permission to manage improvement boards.';
  END IF;
  IF p_area_id IS NULL THEN
    RAISE EXCEPTION 'A board is required.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.improvement_areas a WHERE a.id = p_area_id
  ) THEN
    RAISE EXCEPTION 'That board no longer exists. Refresh and try again.';
  END IF;

  RETURN QUERY
  SELECT
    a.label,
    a.is_system,
    a.is_active,
    c.ideas,
    c.artifacts,
    c.versions,
    c.gaps,
    c.postings,
    c.views,
    c.slots,
    c.cycle_depts,
    c.holders,
    (c.ideas + c.artifacts + c.versions + c.gaps + c.postings
     + c.views + c.slots + c.cycle_depts + c.holders) AS dependent_count
  FROM public.improvement_areas a
  CROSS JOIN LATERAL (
    SELECT
      (SELECT count(*) FROM public.improvement_ideas              x WHERE x.area_id = a.id) AS ideas,
      (SELECT count(*) FROM public.mba_dept_artifacts             x WHERE x.area_id = a.id) AS artifacts,
      (SELECT count(*) FROM public.mba_dept_artifact_versions     x WHERE x.area_id = a.id) AS versions,
      (SELECT count(*) FROM public.mba_data_gaps                  x WHERE x.area_id = a.id) AS gaps,
      (SELECT count(*) FROM public.mba_associate_postings         x WHERE x.area_id = a.id) AS postings,
      (SELECT count(*) FROM public.mba_area_analyst_views         x WHERE x.area_id = a.id) AS views,
      (SELECT count(*) FROM public.mba_rotation_slots             x WHERE x.area_id = a.id) AS slots,
      (SELECT count(*) FROM public.mba_rotation_cycle_departments x WHERE x.area_id = a.id) AS cycle_depts,
      (SELECT count(*) FROM public.hr_additional_roles            x
        WHERE x.improvement_area_id = a.id AND x.is_current)                                AS holders
  ) c
  WHERE a.id = p_area_id;
END $$;

COMMENT ON FUNCTION public.fn_improvement_area_dependants(uuid) IS
  'Counts everything attached to one improvement board (eight dependent tables plus current role holders in hr_additional_roles) so the manage-boards screen can warn before the board is switched off. Read-only; same authority as the other board-management RPCs.';

REVOKE EXECUTE ON FUNCTION public.fn_improvement_area_dependants(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_area_dependants(uuid) TO authenticated;
