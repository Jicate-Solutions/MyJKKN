-- ============================================================================
-- 20260917175510_ai_pulse_quiz_missing_warn.sql
-- ----------------------------------------------------------------------------
-- AI Pulse — the two config knobs and the dispatcher schedule row for the
-- "this cycle has no quiz" guard (app/api/cron/ai-pulse-quiz-missing-warn).
--
-- WHY
--   On 2026-09-17 the AI Pulse session ran with 437 attendees and ZERO quiz
--   submissions, against 198 and 195 the two cycles before. Nothing was broken:
--   no quiz had ever been authored for that cycle, and no surface anywhere said
--   so. Read off production that night, top-level keys of startup_events.config:
--     2026-09-17  {ai_pulse, kind}          <- no quiz
--     2026-09-10  {ai_pulse, kind, quiz}    5 questions
--     2026-09-03  {ai_pulse, kind, quiz}    5 questions
--   and 2026-08-27 / 2026-07-02 / 2026-06-25 carry no quiz key either — the
--   same loss, three times, unremarked.
--
-- NO DDL HERE. Two seed rows and one schedule row, nothing else. The check
-- itself is TypeScript reading JSONB that already exists; it needs no table,
-- no function and no grant, so there is deliberately no SECURITY DEFINER
-- function in this file to revoke from anon/PUBLIC.
--
-- ⛔ NOT APPLIED by merging — a production apply is a separate, Director-gated
--    step. No BEGIN;/COMMIT; (rollback-rehearsal safe).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Config knobs (Director standing rule: every policy decision = a config row)
--
--    Both knobs ALSO carry a code default in
--    lib/services/ai-pulse/quiz-missing-warn.ts, so the route is correct in the
--    window between the deploy and this apply. Seeding them is what makes them
--    editable at the AI Pulse policies surface without a redeploy.
--
--    quiz_missing_warning_enabled DEFAULTS TRUE, unlike the dark-by-default
--    switches in this family (domain_starter_enabled, prompt_dedup_enabled …).
--    Those gate a NEW capability whose blast radius is learner-facing output.
--    This one gates an alarm, and an alarm that ships switched off reproduces
--    the exact bug it was written for.
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_pulse_policies
  (config_key, display_name, description, value_jsonb, data_type, is_active)
SELECT 'quiz_missing_warning_enabled',
       'AI Pulse: warn when a cycle has no quiz',
       'When on, a daily check flags any AI Pulse cycle whose session day is within quiz_missing_warning_days and which has no quiz authored (or a quiz with no questions), and notifies everyone holding the aiPulse:quiz.author permission. ON by default — the 2026-09-17 session ran with 437 attendees and zero quiz answers because nothing warned that no quiz existed.',
       'true'::jsonb, 'bool', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_pulse_policies WHERE config_key = 'quiz_missing_warning_enabled'
);

-- 3 days, not the ~7 the two working cycles were actually authored at: a
-- warning that opens a full week out overlaps the previous cycle still running
-- live, and the point is a signal someone acts on rather than one they learn to
-- scroll past. The route caps whatever is stored here at 30.
INSERT INTO public.ai_pulse_policies
  (config_key, display_name, description, value_jsonb, data_type, min_value, max_value, is_active)
SELECT 'quiz_missing_warning_days',
       'AI Pulse: days ahead to warn about a missing quiz',
       'How many days before an AI Pulse session a missing quiz starts being reported. A cycle is flagged when its demo_date falls between today (IST) and today + this many days. Values above 30 are ignored by the route in favour of its code default of 3.',
       -- data_type 'int', NOT 'number': the live column's vocabulary is
       -- int/bool/enum/jsonb/time/float (read off production 2026-09-17,
       -- 39 of 71 rows are 'int'). 'number' renders as an unknown type.
       '3'::jsonb, 'int', 0, 30, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_pulse_policies WHERE config_key = 'quiz_missing_warning_days'
);

-- ----------------------------------------------------------------------------
-- 2. Dispatcher schedule row — THIS is the registration.
--
--    ⛔ vercel.json is deliberately untouched (hard 100-cron cap —
--    ref feedback_vercel_cron_limit_100_blocks_all_deploys). The AI-routine
--    dispatcher fires ai_routine_schedules rows against the static registry in
--    lib/ai-routines/, where the matching 'ai-pulse-quiz-missing-warn' entry
--    ships in the same PR.
--
--    Cadence: DAILY at minute_of_day 547 = 09:07 IST. fn_ai_routine_claim_due
--    floors to the 15-minute tick, so it fires in the 09:00 slot.
--
--    WHY DAILY, AND WHY THE MORNING. Cycles land on a Thursday with the session
--    at 18:55 IST. Daily + a 3-day window means the Champion is told on Monday,
--    Tuesday, Wednesday and again on Thursday morning — roughly ten hours
--    before the doors open, which is still enough time to author five
--    questions. A weekly warning would have one shot and could land on the one
--    morning nobody looked.
--
--    managed=true  → day/time editable on /admin/ai-routines, no redeploy.
--    max_only      → not applicable (no Max-lane twin); cloud cron only.
--    ON CONFLICT DO NOTHING → a re-run never clobbers a Director-retuned row.
--
--    ORDERING IS SAFE EITHER WAY: applied before the code deploys, the
--    dispatcher logs 'skipped: not in registry' each morning until the deploy
--    lands; applied after, the first 09:00 slot simply fires.
-- ----------------------------------------------------------------------------
INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES
  ('ai-pulse-quiz-missing-warn', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 547)
ON CONFLICT (routine_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Guard: RAISE EXCEPTION, never RAISE NOTICE — a NOTICE-only miss path
--    stamps zero rows and reads as success
--    (ref feedback_a_raise_notice_guard_reads_as_success).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_policies int;
  v_schedule int;
BEGIN
  SELECT count(*) INTO v_policies
    FROM public.ai_pulse_policies
   WHERE config_key IN ('quiz_missing_warning_enabled', 'quiz_missing_warning_days');
  IF v_policies <> 2 THEN
    RAISE EXCEPTION 'ai_pulse quiz-missing-warn policies missing after seed (count=%, expected 2)', v_policies;
  END IF;

  SELECT count(*) INTO v_schedule
    FROM public.ai_routine_schedules
   WHERE routine_id = 'ai-pulse-quiz-missing-warn';
  IF v_schedule <> 1 THEN
    RAISE EXCEPTION 'ai-pulse-quiz-missing-warn schedule row missing after seed (count=%)', v_schedule;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
