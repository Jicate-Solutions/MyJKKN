-- ============================================================================
-- MBA Teaching-Enterprise · Data-Gap STALLED flagging (Phase 4)
-- Created: 2026-07-26
-- ----------------------------------------------------------------------------
-- Rulebook decision #8 (user interview 2026-07-26): flag gaps that were ACCEPTED
-- but whose linked improvement idea never reached applied/verified after a while,
-- so a manager can chase them instead of letting them rot.
--
-- Phase 3 (#2458) already classifies an accepted-but-unshipped gap as
-- 'accepted_pending_improvement'. This splits off the OLD ones: a gap accepted
-- more than STALE_AFTER ago whose idea is still not applied/verified/dropped is
-- 'accepted_stalled'. Threshold is 30 days (a documented constant; a config row
-- is a possible follow-up if leadership wants to tune it per institution).
--
-- Three moving parts, additive:
--   1. widen the gap_outcome CHECK to include 'accepted_stalled';
--   2. teach fn_mba_measure_gap_outcomes the stalled branch (before pending);
--   3. surface it — fn_mba_list_data_gaps now returns gap_outcome +
--      outcome_measured_at so the manager triage page can show a Stalled badge.
--
-- The stalled branch is orthogonal to fn_mba_gap_area_hit_rate /
-- fn_mba_gap_track_record (they key off status='accepted' and
-- gap_outcome='produced_applied_improvement'), so this does not disturb the
-- feed-forward wire.
-- ============================================================================

BEGIN;

-- 1) Widen the gap_outcome CHECK --------------------------------------------
ALTER TABLE public.mba_data_gaps
  DROP CONSTRAINT IF EXISTS mba_data_gaps_gap_outcome_check;
ALTER TABLE public.mba_data_gaps
  ADD CONSTRAINT mba_data_gaps_gap_outcome_check
  CHECK (gap_outcome IN (
    'produced_applied_improvement',
    'accepted_pending_improvement',
    'accepted_stalled',
    'improvement_dropped',
    'not_accepted',
    'pending'
  ));

-- 2) fn_mba_measure_gap_outcomes — add the stalled branch --------------------
-- Identical to #2458 except the accepted-pending case is split: accepted +
-- idea still not shipped + accepted more than 30 days ago → 'accepted_stalled'.
-- The stalled test MUST precede the pending test (more specific first).
-- Idempotent, service-role-only (unchanged).
CREATE OR REPLACE FUNCTION public.fn_mba_measure_gap_outcomes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.mba_data_gaps g
  SET
    gap_outcome = CASE
      WHEN g2.status = 'accepted' AND i.status IN ('applied', 'verified')
        THEN 'produced_applied_improvement'
      WHEN g2.status = 'accepted' AND i.status IN ('rejected', 'withdrawn', 'not_pursued')
        THEN 'improvement_dropped'
      -- Accepted, idea still not shipped, and accepted long ago → STALLED.
      WHEN g2.status = 'accepted'
           AND (i.status IN ('logged', 'under_review', 'approved', 'closed') OR i.id IS NULL)
           AND g2.triaged_at IS NOT NULL
           AND g2.triaged_at < now() - interval '30 days'
        THEN 'accepted_stalled'
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

-- 3) fn_mba_list_data_gaps — surface gap_outcome + outcome_measured_at -------
-- RETURNS TABLE gains two columns, so DROP first (CREATE OR REPLACE cannot
-- change the return type). Guards + ordering + filters unchanged.
DROP FUNCTION IF EXISTS public.fn_mba_list_data_gaps(uuid, text);

CREATE FUNCTION public.fn_mba_list_data_gaps(
  p_area_id uuid DEFAULT NULL,
  p_status  text DEFAULT NULL
) RETURNS TABLE (
  id                  uuid,
  area_id             uuid,
  area_label          text,
  filed_by            uuid,
  filer_name          text,
  institution_id      uuid,
  gap_type            text,
  title               text,
  what_missing        text,
  what_analysis       text,
  what_decision       text,
  candidate_source    text,
  status              text,
  linked_idea_id      uuid,
  triaged_by          uuid,
  triaged_at          timestamptz,
  triage_note         text,
  priority_rank       int,
  priority_reason     text,
  gap_class           text,
  ranked_at           timestamptz,
  gap_outcome         text,
  outcome_measured_at timestamptz,
  created_at          timestamptz,
  updated_at          timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := (is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage'));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  RETURN QUERY
  SELECT
    g.id, g.area_id, a.label, g.filed_by, p.full_name, g.institution_id,
    g.gap_type, g.title, g.what_missing, g.what_analysis, g.what_decision,
    g.candidate_source, g.status, g.linked_idea_id, g.triaged_by, g.triaged_at,
    g.triage_note, g.priority_rank, g.priority_reason, g.gap_class, g.ranked_at,
    g.gap_outcome, g.outcome_measured_at, g.created_at, g.updated_at
  FROM public.mba_data_gaps g
  LEFT JOIN public.improvement_areas a ON a.id = g.area_id
  LEFT JOIN public.profiles p ON p.id = g.filed_by
  WHERE (v_is_manager OR g.filed_by = v_uid)
    AND (p_area_id IS NULL OR g.area_id = p_area_id)
    AND (p_status IS NULL OR g.status = p_status)
  ORDER BY g.priority_rank NULLS LAST, g.created_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_mba_list_data_gaps(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_list_data_gaps(uuid, text) TO authenticated;

COMMIT;
