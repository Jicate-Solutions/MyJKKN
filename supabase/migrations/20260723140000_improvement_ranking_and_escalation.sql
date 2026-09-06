-- ============================================================================
-- MBA Teaching-Enterprise · PR-2 · Improvement Board — AI ranking + escalation
-- Created: 2026-07-23  (spec: specs/mba-improvement-board-design-2026-07-23.md)
--
-- Builds on PR-1 (20260723090000). Adds:
--   1. improvement_idea_rankings  — snapshot table (one row per idea per run),
--      honouring the locked spec: "AI rank stored as a snapshot per ranking run".
--   2. improvement_idea_latest_ranking — security_invoker VIEW returning only the
--      most-recent run per institution (the board reads this).
--   3. ai_job_types row 'improvement.rank_ideas' — the Max-lane prioritisation job
--      (interactive=false, output_target=job.result, tool_set=none). Mirrors the
--      proven scf.suggest_improvement shape; explicit anthropic/claude-sonnet-4-6.
--   4. platform_policies config 'improvement.escalate_after_days' (default 7).
--   5. fn_improvement_escalate_stale_approved() — SERVICE-ROLE-ONLY SECDEF sweep:
--      an 'approved' idea unapplied past the window auto-escalates (one activity
--      row action='escalated', idempotent per approval cycle). Cron-only → grants
--      service_role, NOT authenticated (CLAUDE.md cron-RPC rule).
-- ============================================================================

-- 1) improvement_idea_rankings — snapshot per ranking run ---------------------
CREATE TABLE IF NOT EXISTS public.improvement_idea_rankings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         uuid NOT NULL,                       -- groups one ranking pass
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  idea_id        uuid NOT NULL REFERENCES public.improvement_ideas(id) ON DELETE CASCADE,
  rank           integer NOT NULL,                    -- 1 = highest priority in the run
  reason         text,                                -- one-line why (AI)
  impact         integer,                             -- sub-scores the model assigned (1-5)
  feasibility    integer,
  strategic_fit  integer,
  model          text,                                -- which model produced it
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_improvement_rankings_run   ON public.improvement_idea_rankings(run_id);
CREATE INDEX IF NOT EXISTS idx_improvement_rankings_idea  ON public.improvement_idea_rankings(idea_id);
CREATE INDEX IF NOT EXISTS idx_improvement_rankings_inst  ON public.improvement_idea_rankings(institution_id, created_at DESC);

ALTER TABLE public.improvement_idea_rankings ENABLE ROW LEVEL SECURITY;

-- SELECT: a ranking is visible IFF its idea is visible to the viewer. The EXISTS
-- subquery is itself RLS-filtered against improvement_ideas, so idea-visibility
-- (own / open+view / board.manage / sensitive) governs ranking-visibility with no
-- policy duplication. No INSERT/UPDATE policy → only the service-role cron writes.
DROP POLICY IF EXISTS improvement_rankings_select ON public.improvement_idea_rankings;
CREATE POLICY improvement_rankings_select ON public.improvement_idea_rankings FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR EXISTS (SELECT 1 FROM public.improvement_ideas i WHERE i.id = idea_id)
);

-- 2) latest-ranking view — most recent run per institution -------------------
-- security_invoker=on is MANDATORY: a default (owner-rights) view would bypass the
-- base-table RLS above and leak every institution's rankings to every viewer.
DROP VIEW IF EXISTS public.improvement_idea_latest_ranking;
CREATE VIEW public.improvement_idea_latest_ranking
  WITH (security_invoker = on) AS
WITH latest_run AS (
  SELECT DISTINCT ON (institution_id) institution_id, run_id
  FROM public.improvement_idea_rankings
  ORDER BY institution_id, created_at DESC
)
SELECT r.id, r.run_id, r.institution_id, r.idea_id, r.rank, r.reason,
       r.impact, r.feasibility, r.strategic_fit, r.model, r.created_at
FROM public.improvement_idea_rankings r
JOIN latest_run lr ON r.run_id = lr.run_id;

GRANT SELECT ON public.improvement_idea_latest_ranking TO authenticated;

-- 3) ai_job_types — the Max-lane prioritisation job --------------------------
-- Mirrors the proven scf.suggest_improvement row (interactive=false dodges the
-- chat-drain-only failure; single {key:prompt} input_schema dodges the field-name
-- RUN bug). Explicit anthropic/claude-sonnet-4-6 (verified enabled in ai_job_types).
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled,
   input_schema, expected_seconds, provider, model_id)
VALUES
  ('improvement.rank_ideas',
   'Improvement Board — AI idea prioritisation (Max lane)',
   'Ranks one institution''s open Improvement Board business cases by impact × feasibility × strategic-fit and returns a ranked list with a one-line reason each. Free-text cases → an LLM ranking a naive numeric sort cannot produce. Facilitators + CEO adjust the result on the board.',
   '{{prompt}}',
   'none', 'job.result', false, 'max', 'seat_owner', 3, true, true,
   '[{"key":"prompt","type":"textarea","label":"Assembled ranking prompt","required":true}]'::jsonb,
   45, 'anthropic', 'claude-sonnet-4-6')
ON CONFLICT (job_type) DO NOTHING;

-- 4) escalation window config (admin-editable; default 7) --------------------
-- platform_policies has only a PK on id (no unique on policy_key) → guard with
-- NOT EXISTS for idempotency. Read by fn_improvement_escalate_stale_approved.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, classification, publication_state, ui_widget, ui_category)
SELECT 'improvement.escalate_after_days', 'global', NULL, to_jsonb(7),
       'Days after an Improvement Board idea is approved before an unapplied fix auto-escalates to the CEO office / target department head.',
       'number', true, true, 'operational', 'published', 'number', 'Improvement Board'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'improvement.escalate_after_days' AND scope_type = 'global' AND scope_id IS NULL
);

-- 5) escalation sweep — SERVICE-ROLE-ONLY SECDEF -----------------------------
-- An 'approved' idea whose fix has not been applied within the configured window
-- auto-escalates: one activity row (action='escalated') per approval cycle. The
-- NOT EXISTS guard (escalated AFTER approved_at) makes re-runs idempotent; a
-- re-approval (approved_at moves forward) re-arms escalation. Returns the escalated
-- ideas so the caller can route a notification (target_department_id / CEO office).
CREATE OR REPLACE FUNCTION public.fn_improvement_escalate_stale_approved()
RETURNS TABLE (
  idea_id uuid,
  institution_id uuid,
  target_department_id uuid,
  title text,
  days_stale integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer;
BEGIN
  -- config (default 7 on any miss/parse-failure)
  SELECT COALESCE(NULLIF(value #>> '{}', '')::integer, 7)
    INTO v_days
    FROM public.platform_policies
   WHERE policy_key = 'improvement.escalate_after_days'
     AND scope_type = 'global' AND scope_id IS NULL AND is_active
   LIMIT 1;
  IF v_days IS NULL OR v_days < 0 THEN v_days := 7; END IF;

  RETURN QUERY
  WITH stale AS (
    SELECT i.id, i.institution_id, i.target_department_id, i.title,
           GREATEST(0, EXTRACT(DAY FROM (now() - i.approved_at))::integer) AS d
    FROM public.improvement_ideas i
    WHERE i.status = 'approved'
      AND i.approved_at IS NOT NULL
      AND i.approved_at < now() - make_interval(days => v_days)
      AND NOT EXISTS (
        SELECT 1 FROM public.improvement_idea_activity a
        WHERE a.idea_id = i.id
          AND a.action = 'escalated'
          AND a.created_at > i.approved_at
      )
  ),
  ins AS (
    INSERT INTO public.improvement_idea_activity (idea_id, actor_id, action, note)
    SELECT s.id, NULL, 'escalated',
           format('Auto-escalated: approved fix not applied after %s days.', v_days)
    FROM stale s
    RETURNING improvement_idea_activity.idea_id
  )
  SELECT s.id, s.institution_id, s.target_department_id, s.title, s.d
  FROM stale s
  -- force the data-modifying CTE to materialise even though referenced only here
  WHERE (SELECT count(*) FROM ins) >= 0;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_improvement_escalate_stale_approved() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_escalate_stale_approved() TO service_role;

-- ============================================================================
-- End PR-2 migration.
-- ============================================================================
