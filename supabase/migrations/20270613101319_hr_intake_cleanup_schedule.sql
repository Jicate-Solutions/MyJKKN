-- Updated: 2026-10-01 - HR intake helper: daily clean-up of idle uploads.
--
-- WHAT THIS IS. One schedule row for the AI-routine dispatcher. It fires
-- GET /api/cron/hr-intake-cleanup once a day, which closes every CVViZ intake
-- upload nobody has touched for 30 days and removes the applicants' resume
-- copies it still holds in the private 'hr-intake' bucket (see
-- 20270613101241_hr_intake_helper.sql and lib/services/hr/intake/intake-service.ts
-- cleanupIdleBatches). Registered in lib/ai-routines/platform-ops.ts as
-- 'hr-intake-cleanup'.
--
-- 03:30 IST (minute_of_day 210), every day: the quietest hour, off the 05:00-06:00
-- block the accreditation snapshots already occupy.
--
-- TIER: ADDITIVE, one row. ON CONFLICT DO NOTHING keeps an operator's edited
-- day/time on a re-run. FILE ONLY at PR time; application is Director-gated.

INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('hr-intake-cleanup', true, true, ARRAY[0,1,2,3,4,5,6]::smallint[], 210)
ON CONFLICT (routine_id) DO NOTHING;
