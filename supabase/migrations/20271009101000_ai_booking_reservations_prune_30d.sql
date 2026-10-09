-- 20271009101000_ai_booking_reservations_prune_30d.sql
--
-- WHAT
--   A nightly job that deletes ai_booking_reservations rows older than 30 days.
--   Each schedule_meeting attempt through the outside-AI booking door
--   (20271008160000, PR #4275) leaves one "hold" row. Nothing else removes them.
--
-- WHY 30 DAYS IS SAFE
--   The booking limits read only the last hour and the last 24 hours
--   (fn_ai_booking_reserve: 20/hour and 60/day per key, 150 invitees/day per
--   owner). A row older than 30 days counts toward nothing. Meetings,
--   invitations and meeting history live in meeting_bookings and are not
--   touched.
--
-- AUTHORITY
--   The DELETE is allowed by the Director's ruling of 2026-10-09 (09:15 IST,
--   AskUserQuestion): "Yes, delete after 30 days". It covers this table and
--   this job only.
--
-- HOW
--   The same guarded cron.schedule form as 20270304090000: pg_cron is on
--   production but not on a bare local or CI Postgres, where this degrades to a
--   NOTICE so the file still applies. cron.schedule upserts by job name, so
--   re-applying re-points the same job.
--   Undo: SELECT cron.unschedule('ai-booking-reservations-retention');
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.schedule(
      'ai-booking-reservations-retention',
      '47 3 * * *',
      $job$DELETE FROM public.ai_booking_reservations WHERE created_at < now() - interval '30 days'$job$
    );
    RAISE NOTICE 'scheduled ai-booking-reservations-retention nightly at 03:47';
  ELSE
    RAISE NOTICE 'pg_cron not installed — skipping schedule for ai-booking-reservations-retention';
  END IF;
END
$$;
