-- ============================================================================
-- MBA Teaching-Enterprise · Data-Gap loop v2 — DB foundations (Phase 4 refine)
-- Created: 2026-07-27
-- ----------------------------------------------------------------------------
-- Schema + function groundwork for the v2 refinement interview (2026-07-27).
-- Everything the later route/UI PRs need, applied in ONE migration so the list
-- RPC and the measure fn are each rewritten exactly once (avoids conflicting
-- DROP/CREATEs across PRs). Additive + non-destructive.
--
--   1. Columns on mba_data_gaps:
--        owner_id            — optional named owner (any staff), decision #7
--        class_confirmed_by/at — a manager confirmed the AI's Type A/B guess (#8)
--        stalled_notified_at — last "stuck" notification stamp (#5, used by PR2)
--   2. Config row: mba_data_gap.stalled_days = 14 (#1) — the stuck timer becomes
--      an editable policy read via fn_get_policy_int, so retuning is a 1-line
--      flip with no migration. (ON CONFLICT is unusable on platform_policies'
--      expression unique index → seed via WHERE NOT EXISTS.)
--   3. fn_mba_measure_gap_outcomes — reads the config threshold instead of the
--      hardcoded 30 days.
--   4. fn_mba_list_data_gaps — also returns owner_id / owner_name / class_confirmed.
--   5. fn_mba_assign_gap_owner    — manager sets/clears a gap's owner (any staff).
--   6. fn_mba_confirm_gap_class   — manager confirms/overrides the AI Type A/B.
--   7. fn_mba_suggest_duplicate_gaps — VERY-similar look-alikes in the same area
--      (tight trigram threshold), a suggestion for a manager to confirm (#9/#14).
--
-- Every new SECDEF RPC: REVOKE anon,PUBLIC + GRANT authenticated; NULL-safe
-- manager guard (COALESCE). No end-user write path except through these RPCs.
-- ============================================================================

BEGIN;

-- 1) Columns ----------------------------------------------------------------
ALTER TABLE public.mba_data_gaps
  ADD COLUMN IF NOT EXISTS owner_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS class_confirmed_by  uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS class_confirmed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS stalled_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_mba_data_gaps_owner ON public.mba_data_gaps(owner_id);

COMMENT ON COLUMN public.mba_data_gaps.owner_id IS
  'Optional named owner (any staff) put in charge by a manager; NULL = shared board. Gets the stuck alert alongside managers.';
COMMENT ON COLUMN public.mba_data_gaps.class_confirmed_at IS
  'Set when a manager confirms/overrides the AI Type A/B (gap_class) guess. Only a confirmed type_a_surface is fast-tracked.';

-- 2) Config row — the stuck timer (editable) --------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, description, is_system, is_active, classification, publication_state)
SELECT 'mba_data_gap.stalled_days', 'global', '14'::jsonb, 'number',
       'Days after a data gap is accepted before its still-unshipped improvement idea is flagged as stalled.',
       false, true, 'major', 'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'mba_data_gap.stalled_days' AND scope_type = 'global'
);

-- 3) fn_mba_measure_gap_outcomes — config-driven stalled threshold -----------
CREATE OR REPLACE FUNCTION public.fn_mba_measure_gap_outcomes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_stalled_days integer := fn_get_policy_int('mba_data_gap.stalled_days', 14);
BEGIN
  UPDATE public.mba_data_gaps g
  SET
    gap_outcome = CASE
      WHEN g2.status = 'accepted' AND i.status IN ('applied', 'verified')
        THEN 'produced_applied_improvement'
      WHEN g2.status = 'accepted' AND i.status IN ('rejected', 'withdrawn', 'not_pursued')
        THEN 'improvement_dropped'
      WHEN g2.status = 'accepted'
           AND (i.status IN ('logged', 'under_review', 'approved', 'closed') OR i.id IS NULL)
           AND g2.triaged_at IS NOT NULL
           AND g2.triaged_at < now() - make_interval(days => v_stalled_days)
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

-- 4) fn_mba_list_data_gaps — return owner + class_confirmed ------------------
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
  owner_id            uuid,
  owner_name          text,
  priority_rank       int,
  priority_reason     text,
  gap_class           text,
  class_confirmed     boolean,
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
    g.triage_note, g.owner_id, po.full_name, g.priority_rank, g.priority_reason,
    g.gap_class, (g.class_confirmed_at IS NOT NULL), g.ranked_at,
    g.gap_outcome, g.outcome_measured_at, g.created_at, g.updated_at
  FROM public.mba_data_gaps g
  LEFT JOIN public.improvement_areas a ON a.id = g.area_id
  LEFT JOIN public.profiles p  ON p.id  = g.filed_by
  LEFT JOIN public.profiles po ON po.id = g.owner_id
  WHERE (v_is_manager OR g.filed_by = v_uid)
    AND (p_area_id IS NULL OR g.area_id = p_area_id)
    AND (p_status IS NULL OR g.status = p_status)
  ORDER BY g.priority_rank NULLS LAST, g.created_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_mba_list_data_gaps(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_list_data_gaps(uuid, text) TO authenticated;

-- 5) fn_mba_assign_gap_owner — manager sets/clears the owner (any staff) -----
CREATE OR REPLACE FUNCTION public.fn_mba_assign_gap_owner(
  p_gap_id   uuid,
  p_owner_id uuid  -- NULL clears the owner (back to shared board)
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;
  IF NOT (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)
          OR COALESCE(user_has_permission('improvement.board.manage'), false)) THEN
    RAISE EXCEPTION 'Only Improvement Board managers can assign a data-gap owner.';
  END IF;
  IF p_owner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_owner_id) THEN
    RAISE EXCEPTION 'That owner is not a valid staff member.';
  END IF;

  UPDATE public.mba_data_gaps SET owner_id = p_owner_id WHERE id = p_gap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data gap not found.';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_mba_assign_gap_owner(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_assign_gap_owner(uuid, uuid) TO authenticated;

-- 6) fn_mba_confirm_gap_class — manager confirms/overrides the AI Type A/B ---
CREATE OR REPLACE FUNCTION public.fn_mba_confirm_gap_class(
  p_gap_id    uuid,
  p_gap_class text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;
  IF NOT (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)
          OR COALESCE(user_has_permission('improvement.board.manage'), false)) THEN
    RAISE EXCEPTION 'Only Improvement Board managers can confirm a gap''s type.';
  END IF;
  IF p_gap_class NOT IN ('type_a_surface', 'type_b_capture', 'uncertain') THEN
    RAISE EXCEPTION 'Invalid gap class: %', p_gap_class;
  END IF;

  UPDATE public.mba_data_gaps
     SET gap_class = p_gap_class, class_confirmed_by = v_uid, class_confirmed_at = now()
   WHERE id = p_gap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data gap not found.';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_mba_confirm_gap_class(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_confirm_gap_class(uuid, text) TO authenticated;

-- 7) fn_mba_suggest_duplicate_gaps — VERY-similar look-alikes (same area) ----
-- Trigram similarity on title + what_missing; tight threshold so a manager sees
-- only confident look-alikes (decision #14). Suggestion only — no auto-merge.
CREATE OR REPLACE FUNCTION public.fn_mba_suggest_duplicate_gaps(
  p_gap_id uuid
) RETURNS TABLE (
  id         uuid,
  title      text,
  filer_name text,
  status     text,
  similarity numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_threshold numeric := 0.6;  -- "only very similar"
  v_area uuid;
  v_title text;
  v_missing text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;
  IF NOT (COALESCE(is_super_admin(), false) OR COALESCE(is_admin(), false)
          OR COALESCE(user_has_permission('improvement.board.manage'), false)) THEN
    RAISE EXCEPTION 'Only Improvement Board managers can view duplicate suggestions.';
  END IF;

  SELECT g.area_id, g.title, coalesce(g.what_missing, '')
    INTO v_area, v_title, v_missing
  FROM public.mba_data_gaps g WHERE g.id = p_gap_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data gap not found.';
  END IF;

  RETURN QUERY
  SELECT
    o.id, o.title, p.full_name, o.status,
    ROUND(GREATEST(
      similarity(o.title, v_title),
      similarity(coalesce(o.what_missing, ''), v_missing)
    )::numeric, 3) AS sim
  FROM public.mba_data_gaps o
  LEFT JOIN public.profiles p ON p.id = o.filed_by
  WHERE o.id <> p_gap_id
    AND o.area_id = v_area
    AND o.status <> 'duplicate'
    AND GREATEST(
          similarity(o.title, v_title),
          similarity(coalesce(o.what_missing, ''), v_missing)
        ) >= v_threshold
  ORDER BY sim DESC
  LIMIT 5;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_mba_suggest_duplicate_gaps(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_suggest_duplicate_gaps(uuid) TO authenticated;

COMMIT;
