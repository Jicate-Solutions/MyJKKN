-- ============================================================================
-- MBA Teaching-Enterprise · Data-Gap AI ranking + Type-A/B classification (Phase 2)
-- Created: 2026-07-26
-- ----------------------------------------------------------------------------
-- Phase 1 (20260731150000) gave an MBA Associate a structured way to FILE a data
-- gap and a manager a way to triage it. Managers now face a flat, time-ordered
-- queue. Phase 2 ranks the un-triaged gaps so managers triage the highest-value
-- ones first, and classifies each as:
--   type_a_surface — the data almost certainly already exists in a campus system
--                    and only needs a view/report (surface it).
--   type_b_capture — the institution genuinely does not record this yet (build a
--                    new capture).
--   uncertain      — unclear from what was filed.
--
-- The ranking is produced on the ₹0 Max lane (mirrors improvement.rank_ideas):
-- a cron (app/api/cron/rank-data-gaps) assembles ONE comparative prompt per
-- institution, ENQUEUEs an 'improvement.rank_data_gaps' job, and a later COLLECT
-- pass parses the JSON and writes priority_rank / priority_reason / gap_class /
-- ranked_at straight onto the gap row. A DEDICATED job type (not the shared
-- improvement.rank_ideas) so the two crons never claim each other's jobs.
--
-- Nothing here is destructive: additive columns, an additive (ON CONFLICT DO
-- NOTHING) job-type seed, and a CREATE OR REPLACE of the list RPC that only adds
-- the four new output columns and an ORDER BY.
-- ============================================================================

BEGIN;

-- 1) mba_data_gaps — AI ranking + classification columns ---------------------
ALTER TABLE public.mba_data_gaps
  ADD COLUMN IF NOT EXISTS priority_rank   int,
  ADD COLUMN IF NOT EXISTS priority_reason text,
  ADD COLUMN IF NOT EXISTS gap_class       text
    CHECK (gap_class IN ('type_a_surface','type_b_capture','uncertain')),
  ADD COLUMN IF NOT EXISTS ranked_at       timestamptz;

COMMENT ON COLUMN public.mba_data_gaps.priority_rank IS
  'AI-assigned comparative rank within the institution (1 = highest value). NULL until the rank-data-gaps cron has ranked it.';
COMMENT ON COLUMN public.mba_data_gaps.gap_class IS
  'AI classification: type_a_surface = data exists, surface it; type_b_capture = not recorded yet, build capture; uncertain.';

-- 2) ai_job_types — the dedicated Max-lane data-gap ranking job ---------------
-- Mirrors improvement.rank_ideas EXACTLY (interactive=false dodges the
-- chat-drain-only failure; single {key:prompt} textarea input dodges the
-- field-name RUN bug; tool_set none; lane max; output to job.result). A SEPARATE
-- job_type is mandatory: collectJobsLane claims by job_type, so sharing
-- improvement.rank_ideas would make the two crons steal each other's jobs.
-- model_id 'sonnet' is the always-latest family alias (never a dated id).
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled,
   input_schema, expected_seconds, provider, model_id)
VALUES
  ('improvement.rank_data_gaps',
   'Improvement Board — AI data-gap ranking (Max lane)',
   'Ranks one institution''s un-triaged MBA data gaps by value × feasibility so managers triage the highest-value first, and classifies each as type_a_surface (data exists, surface it), type_b_capture (not recorded yet, build capture), or uncertain. Free-text gaps → an LLM ranking a naive numeric sort cannot produce.',
   '{{prompt}}',
   'none', 'job.result', false, 'max', 'seat_owner', 3, true, true,
   '[{"key":"prompt","type":"textarea","label":"Assembled ranking prompt","required":true}]'::jsonb,
   45, 'anthropic', 'sonnet')
ON CONFLICT (job_type) DO NOTHING;

-- 3) fn_mba_list_data_gaps — return the new columns + priority ordering -------
-- RETURNS TABLE changes (four new output columns), so CREATE OR REPLACE alone
-- cannot change the return type → DROP first. Guards are unchanged (manager sees
-- all with optional filters; an Associate sees only their own).
DROP FUNCTION IF EXISTS public.fn_mba_list_data_gaps(uuid, text);

CREATE FUNCTION public.fn_mba_list_data_gaps(
  p_area_id uuid DEFAULT NULL,
  p_status  text DEFAULT NULL
) RETURNS TABLE (
  id               uuid,
  area_id          uuid,
  area_label       text,
  filed_by         uuid,
  filer_name       text,
  institution_id   uuid,
  gap_type         text,
  title            text,
  what_missing     text,
  what_analysis    text,
  what_decision    text,
  candidate_source text,
  status           text,
  linked_idea_id   uuid,
  triaged_by       uuid,
  triaged_at       timestamptz,
  triage_note      text,
  priority_rank    int,
  priority_reason  text,
  gap_class        text,
  ranked_at        timestamptz,
  created_at       timestamptz,
  updated_at       timestamptz
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
    g.created_at, g.updated_at
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
