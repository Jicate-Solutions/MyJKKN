-- =============================================================================
-- 20260918120000_onemark_item_draft_enable.sql
-- -----------------------------------------------------------------------------
-- OneMark Wave 2, Lane J — DATA STEP ONLY: flip the `onemark.item_draft` AI
-- job type from enabled=false to enabled=true.
--
-- WHY A SEPARATE FILE. Lane S (20260918101500, PR #3275) ships the job type
-- row DARK (enabled=false) because at the time it was written nothing on main
-- consumed a finished draft — fn_ai_enqueue refuses a disabled job_type, so a
-- Senior Learner pressing "draft" got a 503 "contract pending" and nothing was
-- queued or spent. This file is the switch, and it lives in the runner's PR
-- (Lane J) so the two cannot be applied in the wrong order by accident:
--
--   APPLY ONLY AFTER THE LANE J RUNNER IS ON MAIN AND DEPLOYED
--   (app/api/cron/onemark-item-drafts + lib/services/onemark/draft-collect.ts).
--   Enabling the job type before the collect pass is live re-creates the exact
--   failure Lane S's fixer found: queued jobs that complete on the seat and sit
--   in ai_jobs.result forever.
--
-- ORDER: 20260918101500 (Lane S) FIRST. If the row does not exist yet this
-- file RAISES rather than silently doing nothing — a 0-row UPDATE here would
-- look like success and leave the type dark after Lane S lands.
--
-- Idempotent: a second apply is a no-op (already true). No schema change, no
-- function, no grant — nothing for the anon-lock gate to check.
--
-- ROLLBACK (rehearsed shape):
--   UPDATE public.ai_job_types SET enabled = false
--    WHERE job_type = 'onemark.item_draft';
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; in this file (rollback-rehearsal safe).
-- =============================================================================

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ai_job_types WHERE job_type = 'onemark.item_draft') THEN
    RAISE EXCEPTION
      'onemark.item_draft job type not found — apply 20260918101500_onemark_wave2_rpcs_pools_jobtype_owners.sql (Lane S, PR #3275) first';
  END IF;
END
$do$;

-- Updated: 2026-09-05 — Lane J: the runner exists, so the job type may take work.
UPDATE public.ai_job_types
   SET enabled = true
 WHERE job_type = 'onemark.item_draft'
   AND enabled = false;
