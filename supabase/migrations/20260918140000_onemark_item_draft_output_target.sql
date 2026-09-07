-- =============================================================================
-- OneMark AI drafting — point the job type at the target its runner supports
-- File: 20260918140000_onemark_item_draft_output_target.sql
-- Date: 2026-09-06 (Director ruling, 09:4x IST)
--
-- MEASURED FAILURE. The first real drafting job ever queued (ai_jobs
-- 86a78507-f13f-47c1-9477-37fe9ef00373, 2026-09-06 04:01:05Z, enqueued through
-- fn_ai_enqueue_system) was claimed by the Max seat runner 'windows-2' one
-- second later and failed 61 ms after that with:
--
--     output_target 'table:fp_items': table-writeback not implemented
--     (MyJKKN-side follow-up)
--
-- So AI drafting has been dead since the job type went live: every request
-- errors before a token is spent. Read live the same morning, the Max lane's
-- 61 job types split 49 × 'job.result' and 11 × 'inbox' — 'table:fp_items'
-- (this row) is the only table:% target in the estate, and no runner honours it.
--
-- THE APP ALREADY OWNS THE TABLE WRITE. lib/services/onemark/draft-collect.ts
-- (Lane J, merged 2026-09-05) states the reason in its own header: "WHY a
-- collect pass and not the row's output_target='table:fp_items': read live
-- 2026-09-04, none of the 67 job types uses a table:% target, so the seat
-- runner's support for it is unproven". Its cron (/api/cron/onemark-item-drafts,
-- vercel.json, :09 and :39 past every hour) claims each finished job exactly
-- once through fn_ai_collect_claim, validates every item against the draft
-- contract, and inserts survivors as fp_items rows with is_active=false and
-- source_key='internal'. The job type row was simply never switched to match
-- the design that shipped around it.
--
-- THIS FILE is one UPDATE: output_target 'table:fp_items' -> 'job.result', so
-- the runner writes the model text to ai_jobs.result and the collect pass does
-- the rest. Nothing else changes — the row stays enabled, on lane 'max',
-- anthropic/sonnet, cap ₹5,000/month, 5 per person per day, gated on
-- foundation.items.manage. No schema change, no policy change, no DELETE.
--
-- INVARIANT UNAFFECTED: nothing in this path can write is_active=true. The
-- collect pass hard-codes is_active=false and one subject Senior Learner still
-- approves each draft on /foundation/onemark/review (decision 7).
--
-- Rollback:
--   UPDATE public.ai_job_types SET output_target = 'table:fp_items'
--    WHERE job_type = 'onemark.item_draft';
--   (which restores the broken state — only do this alongside a runner that
--    implements table writeback.)
-- =============================================================================

UPDATE public.ai_job_types
   SET output_target = 'job.result',
       updated_at    = now()
 WHERE job_type = 'onemark.item_draft'
   AND output_target IS DISTINCT FROM 'job.result';

DO $chk$
DECLARE
  v public.ai_job_types%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.ai_job_types WHERE job_type = 'onemark.item_draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'onemark.item_draft is missing — 20260918101500 must be applied first';
  END IF;
  IF v.output_target IS DISTINCT FROM 'job.result' THEN
    RAISE EXCEPTION 'output_target is % , expected job.result', v.output_target;
  END IF;
  IF NOT v.enabled THEN
    RAISE EXCEPTION 'onemark.item_draft is disabled — 20260918120000 (Lane J) enables it';
  END IF;
  IF v.lane IS DISTINCT FROM 'max' THEN
    RAISE EXCEPTION 'lane is %, expected max', v.lane;
  END IF;
  IF v.monthly_spend_cap_inr IS DISTINCT FROM 5000 THEN
    RAISE EXCEPTION 'monthly cap is %, expected 5000 (Director ruling 2026-09-05)', v.monthly_spend_cap_inr;
  END IF;
  IF v.allow_rule IS DISTINCT FROM 'permission:foundation.items.manage' THEN
    RAISE EXCEPTION 'allow_rule is %, expected permission:foundation.items.manage', v.allow_rule;
  END IF;
  -- The target this file exists to align with: no other job type writes a table.
  IF EXISTS (SELECT 1 FROM public.ai_job_types WHERE output_target LIKE 'table:%') THEN
    RAISE EXCEPTION 'a table:%% output_target still exists — the runner cannot honour it';
  END IF;
END
$chk$;
