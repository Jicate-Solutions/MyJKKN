-- ============================================================================
-- 20260825030000_loop_charter_proposals.sql
-- ----------------------------------------------------------------------------
-- MetaLoop charter-drafting — the PROPOSALS table (Wave 0 of the loop program,
-- .claude/loop-program-master-spec-2026-08-13.md: "the chartering factory").
--
-- WHY: loop_registry holds 22 loops; most lack charters (the 5 legs from
-- 20260726012000: outcome_metric · counter_metric · intervention ·
-- baseline_window · remeasure_window). The decided path (Director rulebook,
-- 08-08→12): the MACHINE drafts charters from live data; HUMANS sign. This is
-- the house machine-proposes-human-decides pattern — a *_proposals table
-- (mirrors ai_prompt_graduation_proposals / cohort_adjustment_proposals):
--
--   1. The metaloop-charter-drafts routine enqueues a 'loops.charter_draft'
--      ai_job per uncharted loop (₹0 Max lane, evidence bundle in the payload).
--   2. Its collect pass parses the drain's strict-JSON draft into ONE row here
--      (status='proposed'). Drafts that self-report {insufficient:true} are
--      logged, never filed — an honest "can't charter this yet" stays honest.
--   3. A super admin reviews on /admin/loops/charters and decides: Approve
--      calls fn_loop_apply_charter_proposal (sibling migration — the ONLY door
--      that writes charter legs onto loop_registry); Reject stamps the row.
--
-- NOTHING here auto-applies. A proposal is words in a jsonb column until a
-- human approves it. Kill rule + suggested verdict owner ride in `proposed`
-- alongside the 5 legs: loop_registry has NO kill_rule column (candidate
-- follow-up), and owner assignment stays fn_loop_set_owner's job.
--
-- NO institution_id — loops are cluster-wide governance config, like ai_jobs
-- and loop_registry itself.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; in this file, so a BEGIN..ROLLBACK rehearsal stays a
--    rehearsal (ref feedback_inner_commit_defeats_your_rollback_wrapper).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.loop_charter_proposals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_key      text NOT NULL REFERENCES public.loop_registry(loop_key) ON DELETE CASCADE,
  -- The machine's draft: the 5 charter legs + kill_rule + suggested_verdict_owner.
  proposed      jsonb NOT NULL,
  rationale     text,
  -- The ai_jobs row this draft came from. UNIQUE = the collect pass can never
  -- file the same drain result twice (idempotency belt on top of the
  -- fn_ai_collect_claim delivered_at stamp).
  source_job_id uuid UNIQUE,
  status        text NOT NULL DEFAULT 'proposed',
  decided_by    uuid,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loop_charter_proposals_status_chk
    CHECK (status IN ('proposed','approved','rejected'))
);

-- At most ONE undecided proposal per loop — a second draft for a loop whose
-- first draft nobody has judged yet would only split the reviewer's attention.
-- (Mirrors ai_prompt_graduation_proposals_one_pending_idx.)
CREATE UNIQUE INDEX IF NOT EXISTS loop_charter_proposals_one_proposed_idx
  ON public.loop_charter_proposals (loop_key)
  WHERE status = 'proposed';

CREATE INDEX IF NOT EXISTS idx_loop_charter_proposals_status_created
  ON public.loop_charter_proposals (status, created_at DESC);

COMMENT ON TABLE public.loop_charter_proposals IS
  'MetaLoop charter drafts: one row per machine-drafted loop charter (5 legs + kill_rule + suggested_verdict_owner in `proposed`), written by the metaloop-charter-drafts collect pass from finished loops.charter_draft ai_jobs. RECOMMENDATION-ONLY — a human approves via fn_loop_apply_charter_proposal (the only path that writes legs onto loop_registry) or rejects. Never auto-applied.';
COMMENT ON COLUMN public.loop_charter_proposals.proposed IS
  'Strict-JSON draft from the Max-lane model: {outcome_metric, counter_metric, intervention, baseline_window, remeasure_window, kill_rule, suggested_verdict_owner}. kill_rule and suggested_verdict_owner stay HERE on approval — loop_registry has no kill_rule column (candidate follow-up) and owners are assigned via fn_loop_set_owner.';
COMMENT ON COLUMN public.loop_charter_proposals.source_job_id IS
  'ai_jobs.id of the loops.charter_draft job this draft was parsed from. UNIQUE — the same drain result can never be filed twice.';

-- ── RLS: admin read + decide; INSERTs come only from the service-role cron ───
-- (house proposals pattern: ai_prompt_graduation_proposals is admin-read with
-- RPC-only writes; cohort_adjustment_proposals adds an admin UPDATE policy as
-- the human-decision surface. This table takes the cohort shape minus the
-- institution scoping — loops have none.)
ALTER TABLE public.loop_charter_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loop_charter_proposals_select_admin ON public.loop_charter_proposals;
CREATE POLICY loop_charter_proposals_select_admin ON public.loop_charter_proposals
  FOR SELECT TO authenticated
  USING ((select is_super_admin()) OR (select is_admin()));

-- UPDATE is the human-decision surface: Reject stamps status/decided_* directly
-- from the panel; Approve goes through fn_loop_apply_charter_proposal (SECURITY
-- DEFINER, super-admin-asserted) — but the fn's UPDATE also passes this policy
-- shape, so nothing depends on definer-bypass semantics.
DROP POLICY IF EXISTS loop_charter_proposals_update_admin ON public.loop_charter_proposals;
CREATE POLICY loop_charter_proposals_update_admin ON public.loop_charter_proposals
  FOR UPDATE TO authenticated
  USING ((select is_super_admin()) OR (select is_admin()));

-- No INSERT/DELETE policies: proposals are minted only by the service-role
-- collect pass; history is never deleted from the panel.

REVOKE ALL ON public.loop_charter_proposals FROM anon;
