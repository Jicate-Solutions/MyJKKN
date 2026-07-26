-- 20260801160000_maxlane_regen_zero_lane_schedule.sql
-- ============================================================================
-- Finish the 2026-07-13 "₹0 migration" for lesson-spine REGEN.
--
-- CONTEXT: PR #2028 (work order 2026-07-13 §B) moved curriculum.lesson_spine_
-- GENERATE onto the #1998 ai_jobs free lane (drained by the generic Windows Max
-- seat, ₹0) but left REGEN on the paid-only ai_task_queue, read solely by
-- ai-tasks-sweep — which dispatches to the paid Anthropic Batch API AND submits
-- the family alias `sonnet`, which the API 404s (`model: sonnet` not_found). So
-- regen's `lane=max` was decorative: nothing ever enqueued it on the free lane.
--
-- THIS ROW is the lane marker that shouldDeferToMaxLane('curriculum-lesson-
-- spine-regen') reads. With enabled=true AND max_only=true it returns true
-- UNCONDITIONALLY, so the paid ai-tasks-sweep stands down for regen (heartbeat
-- or not) and the new sibling cron (app/api/cron/curriculum-lesson-spine-regen)
-- becomes the sole claimer of regen's queued rows — forwarding each onto ai_jobs
-- (fn_ai_enqueue_system) where the Windows seat drains it ₹0. Mirrors the
-- max_only pin every other maxlane:<id> batch row already carries
-- (20260713000200_ai_routine_max_only_flag.sql).
--
-- managed=false is MANDATORY: fn_ai_routine_claim_due dispatches only
-- managed=true rows, and 20260710080000_maxlane_managed_guard forces all
-- maxlane:% rows to managed=false — this marker must NEVER be dispatched as a
-- cloud routine (it has no dispatch semantics; it only gates the sweep's defer).
-- days_of_week/minute_of_day are unused for a max_only marker but provided so the
-- INSERT is column-complete. Idempotent (ON CONFLICT DO NOTHING) — a replay after
-- someone toggles it in the UI never clobbers the live state.
-- ============================================================================

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day, max_only)
VALUES
  ('maxlane:curriculum-lesson-spine-regen', true, false, ARRAY[0,1,2,3,4,5,6]::smallint[], 0, true)
ON CONFLICT (routine_id) DO NOTHING;

-- ── Glue the regen job type to the generic Windows drain ────────────────────
-- The #1998 free lane runs `ai_job_types.prompt_template` with the job's payload
-- substituted; the enqueueJobsLane contract (mirrored by curriculum.lesson_spine_
-- GENERATE) is that jobs-lane types carry the GLUE template '{{prompt}}' and the
-- cron passes the FULL assembled system+user prompt as payload.prompt. Regen's
-- row still carries the DECLARATIVE '{{entityId}}' template from PR #1994 — a
-- leftover used by NOTHING today (the ⚡ button + paid ai-tasks-sweep both build
-- the prompt in code via buildSubmitItem, never this column). Switch it to the
-- glue template so the new sibling cron's assembled prompt is what the seat runs
-- verbatim. Safe + idempotent: no current reader depends on the old value.
UPDATE public.ai_job_types
   SET prompt_template = '{{prompt}}', updated_at = now()
 WHERE job_type = 'curriculum.lesson_spine_regen'
   AND prompt_template IS DISTINCT FROM '{{prompt}}';

NOTIFY pgrst, 'reload schema';
