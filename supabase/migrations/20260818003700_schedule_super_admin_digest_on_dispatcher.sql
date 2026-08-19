-- Updated: 2026-08-11 - Move the Super Admin Daily Digest onto the AI-routine
-- dispatcher, freeing one vercel.json cron slot.
--
-- WHY (this is a production outage fix, not a nicety):
-- vercel.json accepts at most 100 `crons` entries. PR #2938 (learners-council
-- lc-broadcast-autosend) took the file to 101, and from that moment EVERY
-- production build failed before compiling:
--     The `vercel.json` schema validation failed with the following message:
--     `crons` should NOT have more than 100 items
-- A failed build does not take production down — the last good deployment keeps
-- serving — so nothing looked wrong until someone deployed. Four prior builds
-- were Ready; the next attempt errored. All 101 cron paths pointed at real route
-- files, so there was no dead entry to reclaim.
--
-- WHAT MOVED: nothing about the digest's behaviour. The dispatcher
-- (app/api/cron/ai-routine-dispatcher/route.ts, every 15 min) calls the routine's
-- own endpoint with CRON_SECRET — as its header puts it, "the exact same call
-- Vercel used to make; only the clock moved." The vercel.json entry is removed in
-- the same PR; the registry entry in lib/ai-routines/misc-ai.ts is what lets the
-- dispatcher resolve this row at all.
--
-- ⚠️ TIMEZONE — the whole reason this migration needs a comment this long.
-- vercel.json cron expressions are UTC. ai_routine_schedules.minute_of_day is
-- IST: fn_ai_routine_claim_due computes `now() AT TIME ZONE 'Asia/Kolkata'` and
-- floors to a 15-minute slot. The retired entry was "3 3 * * *" = 03:03 UTC =
-- 08:33 IST, so minute_of_day = 8*60+33 = 513, which floors to the 08:30 IST
-- slot (03:00 UTC) — 3 minutes earlier than before, irrelevant for a daily
-- digest. Copying the literal "3:03" as minute_of_day 183 would have moved the
-- Director's digest 5.5 HOURS earlier. Do not "simplify" 513.
--
-- ⚠️ REGISTRY IS LOAD-BEARING. The dispatcher does:
--     if (!routine || !routine.triggerPath) { record('skipped: not in registry') }
-- so a valid schedule row for an unregistered id is dead on arrival while looking
-- fully configured in /admin/ai-routines. This is not hypothetical — as of
-- 2026-08-11 'soi-weekly-quiet-digest' sits in this table with
-- last_status = 'skipped: not in registry'. __tests__/lib/ai-routines/
-- registry-cron-wiring.test.ts asserts every migration-seeded routine_id is
-- registered; this migration's VALUES shape is deliberately the one that test
-- greps for.
--
-- AUTH: /api/dashboard/cron/super-admin-digest accepts `Authorization: Bearer`
-- ONLY (no ?secret= fallback). The dispatcher sends Bearer only. Compatible.
-- The inverse mistake — moving a query-param-only route onto the dispatcher —
-- would 401 every run and silently do nothing.
--
-- ORDERING IS SAFE EITHER WAY. If this migration is applied before the code
-- deploys, the old vercel.json cron is still live and still fires, while the
-- dispatcher logs one harmless 'skipped: not in registry' per day. After the
-- deploy the vercel entry is gone and the dispatcher owns the clock. There is no
-- window in which the digest fires twice, and none in which it fires zero times.
--
-- No transaction control in this file on purpose: an inner COMMIT would defeat a
-- BEGIN..ROLLBACK rehearsal by the person applying it.

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, days_of_week, minute_of_day, managed)
VALUES
  ('super-admin-daily-digest', true, ARRAY[0,1,2,3,4,5,6]::smallint[], 513, true)
ON CONFLICT (routine_id) DO UPDATE
  SET enabled       = EXCLUDED.enabled,
      days_of_week  = EXCLUDED.days_of_week,
      minute_of_day = EXCLUDED.minute_of_day,
      managed       = EXCLUDED.managed,
      updated_at    = now();

-- Guard: RAISE EXCEPTION, never RAISE NOTICE. A NOTICE-only miss path stamps
-- zero rows and reads as success (Studio hides NOTICE), which is how a migration
-- gets recorded as applied while having done nothing.
DO $$
DECLARE
  v_min  smallint;
  v_days smallint[];
  v_on   boolean;
BEGIN
  SELECT minute_of_day, days_of_week, enabled
    INTO v_min, v_days, v_on
    FROM public.ai_routine_schedules
   WHERE routine_id = 'super-admin-daily-digest';

  IF v_min IS NULL THEN
    RAISE EXCEPTION
      'super-admin-daily-digest was not seeded into ai_routine_schedules';
  END IF;

  IF v_min <> 513 THEN
    RAISE EXCEPTION
      'super-admin-daily-digest minute_of_day is %, expected 513 (08:33 IST = 03:03 UTC)',
      v_min;
  END IF;

  IF NOT v_on OR array_length(v_days, 1) <> 7 THEN
    RAISE EXCEPTION
      'super-admin-daily-digest must be enabled on all 7 days (enabled=%, days=%)',
      v_on, v_days;
  END IF;
END $$;
