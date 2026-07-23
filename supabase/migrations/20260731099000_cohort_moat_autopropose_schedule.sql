-- ============================================================================
-- COHORT CORE — Phase 7 · M5→M7: auto-propose dispatcher schedule
-- Created: 2026-07-06  (Director decision — assumption-thrash follow-up to #1843)
-- ============================================================================
-- Registers the "cohort-moat-autopropose" routine with the AI-routine dispatcher
-- so it fires DAILY (05:43 IST) instead of waiting for an admin to click "check
-- for adjustments". The dispatcher (*/15 vercel cron) resolves the triggerPath
-- from the AI_ROUTINES registry (lib/ai-routines/misc-ai.ts) and hits it with the
-- CRON_SECRET. Registering here (not a 60th raw vercel.json cron) keeps it under
-- the Vercel cron cap AND visible/editable in the /admin/ai-routines Control Tower.
--
-- The routine only queues status='pending' proposals for CLOSED cohorts with a
-- computable causal lift (M5), and NEVER auto-applies (M7 human approval still
-- required). It does nothing until a cohort actually closes — safe to enable now.
--
-- TIER: TIER-1 (single idempotent seed INSERT; DROPS-NOTHING).
-- days_of_week: 0=Sun..6=Sat (all 7 = daily). minute_of_day: IST minutes (343=05:43).
-- ============================================================================

INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('cohort-moat-autopropose', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 343)
ON CONFLICT (routine_id) DO NOTHING;
