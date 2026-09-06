-- =====================================================================
-- Max-lane schedule weld + SCF candidates perf index
-- Migration: 2026-07-09  (ALREADY APPLIED to production via MCP the same day —
-- this file records it in the repo; both statements are idempotent.)
-- =====================================================================
-- 1) WELD: the local Max-lane runner's scheduled jobs (Max-lane night chain +
--    overnight PR pipeline, Windows Task Scheduler) become editable from
--    /admin/ai-routines like the dispatcher-managed cloud routines. Each local
--    job gets its own `maxlane:<registry-id>` row here with managed=false —
--    fn_ai_routine_claim_due filters managed=true, so the CLOUD dispatcher
--    never claims these rows. The runner box's schedule-sync (jkkn-max-lane/
--    schedule-sync.mjs, invoked by its poller at most every 15 min) reads them
--    and rewrites its Task Scheduler triggers — same ≤15-min propagation the
--    dispatcher gives. fn_ai_routine_schedule_upsert never touches `managed`,
--    so UI edits cannot flip these rows into the dispatcher's claim set.
--    Seeded times = the Task Scheduler state at cutover (2026-07-09).
INSERT INTO public.ai_routine_schedules (routine_id, enabled, days_of_week, minute_of_day, managed)
VALUES
  ('maxlane:scf-generate-suggestions',        true, '{0,1,2,3,4,5,6}', 1325, false),  -- 22:05 IST daily
  ('maxlane:scf-learner-notes',               true, '{0,1,2,3,4,5,6}', 1340, false),  -- 22:20
  ('maxlane:induction-session-effectiveness', true, '{0,1,2,3,4,5,6}', 1355, false),  -- 22:35
  ('maxlane:curriculum-lesson-spine-generate',true, '{0,1,2,3,4,5,6}', 1370, false),  -- 22:50
  ('maxlane:admission-insights-generate',     true, '{0,1,2,3,4,5,6}',  380, false),  -- 06:20
  ('maxlane:induction-generate-playbook',     true, '{0}',             1325, false),  -- Sun 22:05
  ('maxlane:session-feedback-escalation',     true, '{1}',              690, false),  -- Mon 11:30
  ('maxlane:work-pulse-analyze',              true, '{5}',              395, false),  -- Fri 06:35
  ('maxlane:overnight-bugfix',                true, '{0,1,2,3,4,5,6}', 1320, false),  -- 22:00
  ('maxlane:overnight-judge',                 true, '{0,1,2,3,4,5,6}',  435, false)   -- 07:15
ON CONFLICT (routine_id) DO NOTHING;

-- 2) PERF: fn_scf_candidate_windows filters session_feedback on a bare
--    attendance_date range + scoreable predicates; every pre-existing index
--    leads with another column, so the function seq-scanned. Fine warm
--    (~122ms) but it blew the authenticator role's 8s statement_timeout under
--    cold-cache + CPU contention in the crowded 06:00-IST dispatcher slot
--    (observed 2026-07-09: "HTTP 500 · error: canceling statement due to
--    statement timeout" on scf-generate-suggestions). Partial index matches
--    the function's exact predicate.
CREATE INDEX IF NOT EXISTS idx_session_feedback_scoreable_date
  ON public.session_feedback (attendance_date)
  WHERE course_code IS NOT NULL AND understood IS NOT NULL;
