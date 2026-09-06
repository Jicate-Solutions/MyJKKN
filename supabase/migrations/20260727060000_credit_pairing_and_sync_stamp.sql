-- ============================================================================
-- Teaching-enterprise follow-ups: fixer-credit integrity + sync observability
-- ============================================================================
-- Date: 2026-07-27
-- Director decisions (interview 2026-07-27):
--   (1) "Yes — add the small rule that blocks it": a board manager must not be
--       able to pre-claim a learner's fixer credit.
--   (2) "Yes — have it stamp the time it last ran": the nightly participant sync
--       must leave a record, because "changed nothing" and "never ran" are
--       currently indistinguishable.
--
-- DELIBERATELY ADDITIVE ONLY. This migration does NOT touch
-- fn_teaching_cohort_sync. That function is 14,680 characters and governs role
-- access for 44 learners + 6 Senior Learners; it was hardened and verified on
-- 2026-07-26 (no-op proof: added=0 removed=0 total=44). Re-issuing it to append
-- a timestamp would risk that guarantee for no benefit, so the STAMP IS WRITTEN
-- BY THE CRON ROUTE (app/api/cron/teaching-cohort-sync/route.ts), which already
-- receives one result row per cohort. See feedback_secdef_replace_silently_
-- reverted_money_gate: a CREATE OR REPLACE is a blind full-body swap and is how
-- the include_financial money gate was silently lost.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Fixer credit cannot exist without an actual fix
-- ---------------------------------------------------------------------------
-- The existing improvement_ideas_resolution_status_chk guards ONE direction:
--     resolution_ref IS NOT NULL  =>  status IN (...) AND resolved_by IS NOT NULL
--                                     AND resolved_at IS NOT NULL
-- It says nothing about the reverse, so this passes today:
--     resolved_by = <a manager>, resolved_at = now(), resolution_ref = NULL
-- fn_improvement_set_resolution then refuses the learner who actually shipped
-- the fix ("already credited to another learner"), because resolved_by is
-- occupied. Net effect: anyone with base-table UPDATE can reserve the credit
-- slot on an idea they did not fix and lock the real fixer out of the
-- Impact Leaderboard.
--
-- This constraint makes the three columns move together: either the idea is
-- entirely unresolved, or it carries a real fix link AND the credit for it.
-- An empty claim becomes unrepresentable rather than merely discouraged.
--
-- Safe to add unvalidated-free: improvement_ideas has 0 rows on prod today, and
-- fn_improvement_set_resolution already writes all three columns in one UPDATE.
ALTER TABLE public.improvement_ideas
  DROP CONSTRAINT IF EXISTS improvement_ideas_resolution_credit_pairing_chk;

ALTER TABLE public.improvement_ideas
  ADD CONSTRAINT improvement_ideas_resolution_credit_pairing_chk
  CHECK (
    (resolved_by IS NULL AND resolved_at IS NULL AND resolution_ref IS NULL)
    OR
    (resolved_by IS NOT NULL AND resolved_at IS NOT NULL AND resolution_ref IS NOT NULL)
  );

COMMENT ON CONSTRAINT improvement_ideas_resolution_credit_pairing_chk
  ON public.improvement_ideas IS
  'Fixer credit and the fix link are inseparable. Blocks reserving resolved_by '
  'with a NULL resolution_ref, which would lock the real fixer out of credit '
  '(fn_improvement_set_resolution refuses an already-credited idea). Director '
  'decision 2026-07-27.';

-- ---------------------------------------------------------------------------
-- 2. The nightly participant sync leaves a record
-- ---------------------------------------------------------------------------
-- Problem this solves: on 2026-07-27 it was impossible to establish whether the
-- 04:11 cron had fired. Role counts were unchanged — which is EXACTLY what both
-- "ran and correctly did nothing" and "never started" look like. A job whose
-- healthy output is silence cannot be monitored.
ALTER TABLE public.teaching_enterprise_cohorts
  ADD COLUMN IF NOT EXISTS last_synced_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_result jsonb;

COMMENT ON COLUMN public.teaching_enterprise_cohorts.last_synced_at IS
  'When the participant sync last swept THIS cohort. Written by '
  'app/api/cron/teaching-cohort-sync after a successful RPC call. A stale value '
  'means the cron has stopped running — the whole point, since a healthy run '
  'changes nothing and is otherwise invisible.';

COMMENT ON COLUMN public.teaching_enterprise_cohorts.last_sync_result IS
  'Counts from the last sweep of this cohort: role_added/role_removed/'
  'role_total/faculty_added/faculty_removed/faculty_total. Lets an operator see '
  'that a run happened AND what it did, without reading Vercel logs (which are '
  'a stream and cannot be queried retrospectively).';

-- The cron writes these with the service-role client, which bypasses RLS. No
-- new policy is added on purpose: the table stays SELECT-only to every client
-- session (writes go through fn_teaching_cohort_update, super-admin gated), and
-- these two columns are machine-written telemetry, never operator input.

-- ---------------------------------------------------------------------------
-- 3. Operational note carried in the schema (not just in a doc)
-- ---------------------------------------------------------------------------
-- (a) SEMESTER ROLLOVER: fn_teaching_cohort_sync's >50% mass-revocation guard
--     WILL fire when a whole cohort legitimately turns over at the start of an
--     academic year, and the cron will report an error nightly until an
--     operator re-runs it deliberately. That is the intended fail-loud trade
--     (Director decision 2026-07-27: "leave the guard, and write down what to
--     do when it goes off"). Runbook:
--     docs/guides/2026-07-27-GUIDE-teaching-cohort-sync-runbook.md
-- (b) CSE SEMESTER WINDOW IS UNVERIFIED: the cse_resident row ships
--     semester_orders = {5,6,7}, chosen by a build agent without a stated
--     rationale. The Director has NOT yet confirmed those are the intended year
--     groups. Activating the cohort grants platform access to every matching
--     learner, so the window must be confirmed BEFORE is_active is flipped.
COMMENT ON COLUMN public.teaching_enterprise_cohorts.semester_orders IS
  'Which semester_order values qualify a learner for this cohort. ⚠️ The '
  'cse_resident row''s {5,6,7} is UNVERIFIED (agent-chosen, no stated '
  'rationale) — confirm the intended year groups before flipping is_active, '
  'because activation grants platform access to everyone who matches.';

COMMIT;
