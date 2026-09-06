-- =============================================================================
-- 20260713042000_loop_adherence_alerts_wire.sql
-- Loop Adherence Alerts wire (Director interview 2026-07-13: "build both and
-- activate"; cadence DAILY UNTIL FIXED). Two escalations that were missing —
-- the loops GENERATE work but nothing paged when the humans stopped doing it:
--   • missed mentor monthly check-ins   (mentor-checkins → decisions)
--   • quiet referral desk                (referral-desk → decisions)
-- Fired by /api/cron/loop-adherence-alerts (daily 09:41 IST); the routine
-- 'loop-adherence' is registered in lib/ai-routines/loop-governance.ts.
--
-- Three additive, idempotent parts, one transaction:
--   (1) dispatcher schedule row for the routine (identity-guarded on routine_id).
--   (2) the two loop_edges the alerts realise — re-INSERTed here because both
--       were deleted 2026-07-13 as fiction (no escalation mechanism existed);
--       this build makes them REAL. Guarded by NOT EXISTS on
--       (from_key, to_key, what_flows). Both node keys verified present in
--       loop_registry 2026-07-13 (mentor-checkins, referral-desk, decisions).
--   No DDL — additive rows only. Safe to apply before or after the code deploy:
--   the cron 401s until the dispatcher (which sends the CRON_SECRET header)
--   calls it, and the edges are display-only on /admin/loops.
-- =============================================================================
BEGIN;

-- (1) Dispatcher schedule: daily 09:41 IST (minute_of_day = 9*60+41 = 581).
--     Editable on /admin/ai-routines with no deploy. Off-minute by design
--     (avoids the :00/:30 fleet pile-up). managed=true so the loop-watchdog
--     watches IT for silence too.
INSERT INTO public.ai_routine_schedules (routine_id, enabled, managed, days_of_week, minute_of_day)
VALUES ('loop-adherence', true, true, ARRAY[0,1,2,3,4,5,6], 581)
ON CONFLICT (routine_id) DO NOTHING;

-- (2) The two escalation edges this wire realises.
INSERT INTO public.loop_edges (from_key, to_key, what_flows, note, is_draft)
SELECT 'mentor-checkins', 'decisions', 'escalations',
       '≥2 consecutive missed monthly check-in beats page super admins daily until cleared (loop-adherence cron)',
       false
WHERE NOT EXISTS (
  SELECT 1 FROM public.loop_edges
  WHERE from_key = 'mentor-checkins' AND to_key = 'decisions' AND what_flows = 'escalations'
);

INSERT INTO public.loop_edges (from_key, to_key, what_flows, note, is_draft)
SELECT 'referral-desk', 'decisions', 'escalations',
       'desks with open leads + 7d zero activity page super admins daily until cleared (loop-adherence cron)',
       false
WHERE NOT EXISTS (
  SELECT 1 FROM public.loop_edges
  WHERE from_key = 'referral-desk' AND to_key = 'decisions' AND what_flows = 'escalations'
);

COMMIT;
