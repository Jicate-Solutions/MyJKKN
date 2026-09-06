-- =====================================================================
-- 20260725080000 — Register the two bug-FIXING runners in ai_job_types
--                  so their model is governed from /admin/ai-models
-- =====================================================================
-- THE GAP THIS CLOSES (found 2026-07-25):
-- The AI Jobs console showed all five registered bug.* jobs (reverify, triage,
-- suggest_fix, summarize, categorize) on `opus`, and per-job model selection
-- honours that. But the two runners that actually DIAGNOSE the root cause and
-- WRITE the production fix — the Mac launchd jobs bug-cluster-fixability.mjs and
-- bug-cluster-fix.mjs — had NO row in ai_job_types at all. They claim work
-- through their own RPCs (fn_bug_cluster_fixability_claim / _fix_claim), never
-- fn_ai_claim, so nothing in the registry described them. Each hardcoded
-- `'sonnet'`.
--
-- Net effect: the console truthfully said "bug work runs on opus" about the five
-- jobs it knew, while the single highest-stakes step in the loop — an AI writing
-- production code unsupervised — silently ran the cheaper model and was
-- invisible to governance. Observed cost: a mis-diagnosis that called a real
-- submit failure "pure perception" (shipped only a colour change), and a roster
-- fix aimed at the service layer when the defect was in the RPC (#2268 → #2308).
--
-- WHAT THIS DOES: adds the two missing registry rows on `opus`. The runners now
-- READ `ai_job_types.model_id` at startup (shared resolver ai-model-resolve.mjs)
-- instead of hardcoding a model, so changing the model in the UI changes what
-- the next run uses — no code edit, no redeploy. `model_id` is already the
-- resolver's source of truth that /api/admin/ai-models PATCHes.
--
-- NOT ENQUEUEABLE BY DESIGN: these two jobs are claimed by the Mac runners, not
-- by the generic drain, so a queued ai_jobs row of either type would never be
-- picked up. `allow_rule = 'permission:system.runner_claimed'` is a permission
-- nobody holds, so fn_ai_enqueue denies it ("not allowed for this job_type").
-- schedulable=false keeps the scheduler away. The rows exist to be READ (and to
-- have their model set) by the console — governance, not a queue entry point.
--
-- Idempotent: ON CONFLICT refreshes the governed fields. Already applied to prod
-- 2026-07-25 via the management API; re-running is a no-op.
-- =====================================================================

INSERT INTO public.ai_job_types
  (job_type, title, description, lane, provider, model_id, tool_set, output_target,
   allow_rule, interactive, schedulable, enabled, max_inflight, external_allowed, input_schema)
VALUES
  ('bug.fixability',
   'Bug cluster diagnosis (AI reads the code)',
   'Reads the real code READ-ONLY for a duplicate-report group and returns one-fix-vs-split with a root cause. Claimed by the Mac launchd runner bug-cluster-fixability.mjs (not enqueueable here) — this row governs which model it uses.',
   'max', 'anthropic', 'opus', 'none', 'job.result', 'permission:system.runner_claimed',
   false, false, true, 1, false, '[]'::jsonb),
  ('bug.cluster_fix',
   'Bug cluster auto-fix (writes the fix, opens PR)',
   'Writes the minimal fix for a one-fix group in a throwaway worktree, runs local gates + a 3-lens adversarial review, then opens a PR. Never merges. Claimed by the Mac launchd runner bug-cluster-fix.mjs (not enqueueable here) — this row governs which model writes production code.',
   'max', 'anthropic', 'opus', 'all', 'job.result', 'permission:system.runner_claimed',
   false, false, true, 1, false, '[]'::jsonb)
ON CONFLICT (job_type) DO UPDATE SET
  model_id    = EXCLUDED.model_id,
  provider    = EXCLUDED.provider,
  title       = EXCLUDED.title,
  description = EXCLUDED.description,
  updated_at  = now();
