-- =====================================================================
-- Cron-cap wave: move 45 daily/weekly crons onto the AI-routine dispatcher
-- Migration: 2026-08-13 (applies as 20260825010000)
-- =====================================================================
-- WHY: vercel.json has a HARD 100-cron cap and sat at exactly 100 — PR #2938
-- already pushed it to 101 once and every production build failed schema
-- validation until super-admin-daily-digest was moved off (migration
-- 20260818003700, the precedent this file copies). This wave moves every
-- once-a-day / once-a-week cron whose route the dispatcher can fire, taking
-- vercel.json from 100 -> 55 entries and making each routine's day/time
-- editable at /admin/ai-routines without a redeploy.
--
-- WHAT MOVED: nothing about any routine's behaviour. The dispatcher
-- (app/api/cron/ai-routine-dispatcher/route.ts, every 15 min) calls each
-- routine's own endpoint with CRON_SECRET — "the exact same call Vercel used
-- to make; only the clock moved." The vercel.json entries are removed in the
-- SAME PR that adds the registry entries (lib/ai-routines/platform-ops.ts and
-- friends) which let the dispatcher resolve these rows at all.
--
-- WHAT DID NOT MOVE (still vercel.json crons, on purpose):
--   * every sub-daily cron (hourly / 15-min / 30-min / every-N-hours /
--     multi-time-daily): ai_routine_schedules expresses ONE minute_of_day —
--     no interval support (yet);
--   * the ?mode=collect drain lanes (improvement-rank-ideas, work-signal-
--     suggestions, scf/induction/curriculum collect ticks): sub-daily anyway;
--   * rcltp-question-generate's daily lane: it needs ?mode=enqueue, and
--     triggerPath cannot carry a query string (registry-cron-wiring.test.ts
--     resolves triggerPath to a route.ts on disk);
--   * the 4 monthly crons: days_of_week cannot express day-of-month.
--
-- ⚠️ TIMEZONE (same trap the precedent documents at length): vercel.json cron
-- expressions are UTC; minute_of_day is IST (fn_ai_routine_claim_due compares
-- now() AT TIME ZONE 'Asia/Kolkata', floored to a 15-min slot). Every value
-- below is the cron's UTC time + 5:30, kept EXACT (the dispatcher floors it
-- to the slot itself). Late-UTC dailies (>= 18:30 UTC) land on the next IST
-- calendar day — irrelevant for every-day rows; the weekly rows below were
-- each hand-checked (none crosses midnight IST).
--
-- ⚠️ AUTH: the dispatcher sends GET with `Authorization: Bearer` ONLY. All 45
-- routes were audited on 2026-08-13: every one accepts Bearer (three are
-- Bearer-only, which is exactly compatible; none is ?secret=-only, none
-- checks the x-vercel-cron header).
--
-- ORDERING: apply this migration BEFORE deploying the PR that removes the
-- vercel.json entries. In that order the old crons keep firing until the
-- deploy, and the dispatcher's extra fires are idempotent no-ops or harmless
-- 'skipped: not in registry' records. Deploying FIRST would open a window in
-- which these routines fire zero times until the migration lands.
--
-- ON CONFLICT DO UPDATE (not DO NOTHING): cutover must land these values even
-- if a routine_id somehow pre-exists; after cutover, super_admin edits win
-- because this migration never re-runs.
--
-- No transaction control in this file on purpose: an inner COMMIT would defeat
-- a BEGIN..ROLLBACK rehearsal by the person applying it.

INSERT INTO public.ai_routine_schedules
  (routine_id, enabled, days_of_week, minute_of_day, managed)
VALUES
  -- ── daily, every day (IST minute = UTC + 5:30, exact) ──────────────────────
  ('improvement-rank-ideas',                true, ARRAY[0,1,2,3,4,5,6]::smallint[],  613, true), -- 04:43 UTC = 10:13 IST
  ('teaching-cohort-sync',                  true, ARRAY[0,1,2,3,4,5,6]::smallint[],  581, true), -- 04:11 UTC = 09:41 IST
  ('mba-associate-sync',                    true, ARRAY[0,1,2,3,4,5,6]::smallint[],  623, true), -- 04:53 UTC = 10:23 IST
  ('mba-faculty-sync',                      true, ARRAY[0,1,2,3,4,5,6]::smallint[],  649, true), -- 05:19 UTC = 10:49 IST
  ('mba-rotation-tick',                     true, ARRAY[0,1,2,3,4,5,6]::smallint[],  637, true), -- 05:07 UTC = 10:37 IST
  ('scf-freetext-carry',                    true, ARRAY[0,1,2,3,4,5,6]::smallint[],  217, true), -- 22:07 UTC = 03:37 IST +1d
  ('pde-case-due-soon',                     true, ARRAY[0,1,2,3,4,5,6]::smallint[],  473, true), -- 02:23 UTC = 07:53 IST
  ('rcltp-review-chase',                    true, ARRAY[0,1,2,3,4,5,6]::smallint[],  116, true), -- 20:26 UTC = 01:56 IST +1d
  ('attendance-breach-check',               true, ARRAY[0,1,2,3,4,5,6]::smallint[],  187, true), -- 21:37 UTC = 03:07 IST +1d
  ('director-handover-chase',               true, ARRAY[0,1,2,3,4,5,6]::smallint[],   83, true), -- 19:53 UTC = 01:23 IST +1d
  ('accreditation-naac-narrative-draft',    true, ARRAY[0,1,2,3,4,5,6]::smallint[],   52, true), -- 19:22 UTC = 00:52 IST +1d
  ('accreditation-narrative-reminders',     true, ARRAY[0,1,2,3,4,5,6]::smallint[],  522, true), -- 03:12 UTC = 08:42 IST
  ('accreditation-narrative-capout-notice', true, ARRAY[0,1,2,3,4,5,6]::smallint[],   82, true), -- 19:52 UTC = 01:22 IST +1d
  ('refresh-conversion-leaderboard',        true, ARRAY[0,1,2,3,4,5,6]::smallint[],    0, true), -- 18:30 UTC = 00:00 IST +1d
  ('decisions-verdict-check',               true, ARRAY[0,1,2,3,4,5,6]::smallint[],  570, true), -- 04:00 UTC = 09:30 IST (after digest)
  ('campus-vacancy-price-drops',            true, ARRAY[0,1,2,3,4,5,6]::smallint[],  450, true), -- 02:00 UTC = 07:30 IST
  ('campus-occupancy-snapshot',             true, ARRAY[0,1,2,3,4,5,6]::smallint[],  420, true), -- 01:30 UTC = 07:00 IST
  ('campus-housekeeping-task-generator',    true, ARRAY[0,1,2,3,4,5,6]::smallint[],    5, true), -- 18:35 UTC = 00:05 IST +1d (start of Indian day — deliberate)
  ('attention-bar-prune',                   true, ARRAY[0,1,2,3,4,5,6]::smallint[],   17, true), -- 18:47 UTC = 00:17 IST +1d
  ('prospect-reminders',                    true, ARRAY[0,1,2,3,4,5,6]::smallint[],  833, true), -- 08:23 UTC = 13:53 IST
  ('hr-document-expiry-reminders',          true, ARRAY[0,1,2,3,4,5,6]::smallint[],  750, true), -- 07:00 UTC = 12:30 IST
  ('ig-login-token-refresh',                true, ARRAY[0,1,2,3,4,5,6]::smallint[],  493, true), -- 02:43 UTC = 08:13 IST
  ('ig-accounts-sync',                      true, ARRAY[0,1,2,3,4,5,6]::smallint[],  641, true), -- 05:11 UTC = 10:41 IST
  ('meta-subscription-drift-check',         true, ARRAY[0,1,2,3,4,5,6]::smallint[],  180, true), -- 21:30 UTC = 03:00 IST +1d
  ('meta-leadgen-backfill',                 true, ARRAY[0,1,2,3,4,5,6]::smallint[],  257, true), -- 22:47 UTC = 04:17 IST +1d
  ('google-calendar-connection-check',      true, ARRAY[0,1,2,3,4,5,6]::smallint[],  409, true), -- 01:19 UTC = 06:49 IST
  ('schools-visit-nudges',                  true, ARRAY[0,1,2,3,4,5,6]::smallint[],  583, true), -- 04:13 UTC = 09:43 IST
  ('induction-mentorship-rollover',         true, ARRAY[0,1,2,3,4,5,6]::smallint[],  527, true), -- 03:17 UTC = 08:47 IST
  ('sf100-accountability',                  true, ARRAY[0,1,2,3,4,5,6]::smallint[],  547, true), -- 03:37 UTC = 09:07 IST
  ('bug-cluster-scan',                      true, ARRAY[0,1,2,3,4,5,6]::smallint[],  169, true), -- 21:19 UTC = 02:49 IST +1d
  ('pde-image-orphans',                     true, ARRAY[0,1,2,3,4,5,6]::smallint[],  551, true), -- 03:41 UTC = 09:11 IST
  ('aipulse-prompt-graduate',               true, ARRAY[0,1,2,3,4,5,6]::smallint[],  425, true), -- 01:35 UTC = 07:05 IST
  ('aipulse-prompt-dedup',                  true, ARRAY[0,1,2,3,4,5,6]::smallint[],  440, true), -- 01:50 UTC = 07:20 IST
  ('admission-counselor-briefing',          true, ARRAY[0,1,2,3,4,5,6]::smallint[],  360, true), -- 00:30 UTC = 06:00 IST (already-registered id; entry lives in admission-ai.ts)
  -- ── weekly (IST day checked — none crosses midnight IST) ───────────────────
  ('work-signal-suggestions',               true, ARRAY[1]::smallint[],               523, true), -- Mon 03:13 UTC = Mon 08:43 IST
  ('sunday-wrap',                           true, ARRAY[0]::smallint[],              1260, true), -- Sun 15:30 UTC = Sun 21:00 IST
  ('friday-reflection',                     true, ARRAY[5]::smallint[],               960, true), -- Fri 10:30 UTC = Fri 16:00 IST
  ('duty-log-retention',                    true, ARRAY[0]::smallint[],               510, true), -- Sun 03:00 UTC = Sun 08:30 IST
  ('whatsapp-byow-bypass-detect',           true, ARRAY[1]::smallint[],               870, true), -- Mon 09:00 UTC = Mon 14:30 IST
  ('hr-policy-promote-detector',            true, ARRAY[1]::smallint[],               450, true), -- Mon 02:00 UTC = Mon 07:30 IST
  ('ig-silence-detect',                     true, ARRAY[1]::smallint[],               773, true), -- Mon 07:23 UTC = Mon 12:53 IST
  ('exam-audit-alerts',                     true, ARRAY[1]::smallint[],               493, true), -- Mon 02:43 UTC = Mon 08:13 IST
  ('sf100-weekly-reminder',                 true, ARRAY[0]::smallint[],              1203, true), -- Sun 14:33 UTC = Sun 20:03 IST
  ('aipulse-domain-starter-measure',        true, ARRAY[6]::smallint[],               690, true), -- Sat 06:00 UTC = Sat 11:30 IST
  -- ── multi-day weekly ────────────────────────────────────────────────────────
  ('aipulse-domain-starter',                true, ARRAY[0,1,2,6]::smallint[],         878, true)  -- Sat/Sun/Mon/Tue 09:08 UTC = 14:38 IST (no day shift)
ON CONFLICT (routine_id) DO UPDATE
  SET enabled       = EXCLUDED.enabled,
      days_of_week  = EXCLUDED.days_of_week,
      minute_of_day = EXCLUDED.minute_of_day,
      managed       = EXCLUDED.managed,
      updated_at    = now();

-- Guard: RAISE EXCEPTION, never RAISE NOTICE (a NOTICE-only miss path reads
-- as success in Studio while having done nothing).
DO $$
DECLARE
  v_count integer;
  v_min   smallint;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.ai_routine_schedules
   WHERE routine_id IN (
    'improvement-rank-ideas','teaching-cohort-sync','mba-associate-sync',
    'mba-faculty-sync','mba-rotation-tick','scf-freetext-carry',
    'pde-case-due-soon','rcltp-review-chase','attendance-breach-check',
    'director-handover-chase','accreditation-naac-narrative-draft',
    'accreditation-narrative-reminders','accreditation-narrative-capout-notice',
    'refresh-conversion-leaderboard','decisions-verdict-check',
    'campus-vacancy-price-drops','campus-occupancy-snapshot',
    'campus-housekeeping-task-generator','attention-bar-prune',
    'prospect-reminders','hr-document-expiry-reminders','ig-login-token-refresh',
    'ig-accounts-sync','meta-subscription-drift-check','meta-leadgen-backfill',
    'google-calendar-connection-check','schools-visit-nudges',
    'induction-mentorship-rollover','sf100-accountability','bug-cluster-scan',
    'pde-image-orphans','aipulse-prompt-graduate','aipulse-prompt-dedup',
    'admission-counselor-briefing','work-signal-suggestions','sunday-wrap',
    'friday-reflection','duty-log-retention','whatsapp-byow-bypass-detect',
    'hr-policy-promote-detector','ig-silence-detect','exam-audit-alerts',
    'sf100-weekly-reminder','aipulse-domain-starter','aipulse-domain-starter-measure'
   )
   AND enabled AND managed;

  IF v_count <> 45 THEN
    RAISE EXCEPTION
      'cron-cap wave: expected 45 enabled managed schedule rows, found %', v_count;
  END IF;

  -- Spot-check the two timezone traps: a midnight-IST row and a weekly row.
  SELECT minute_of_day INTO v_min FROM public.ai_routine_schedules
   WHERE routine_id = 'refresh-conversion-leaderboard';
  IF v_min <> 0 THEN
    RAISE EXCEPTION
      'refresh-conversion-leaderboard minute_of_day is %, expected 0 (18:30 UTC = 00:00 IST next day)', v_min;
  END IF;

  SELECT minute_of_day INTO v_min FROM public.ai_routine_schedules
   WHERE routine_id = 'sunday-wrap' AND days_of_week = ARRAY[0]::smallint[];
  IF v_min IS NULL OR v_min <> 1260 THEN
    RAISE EXCEPTION
      'sunday-wrap must be Sunday (days {0}) at minute 1260 (21:00 IST), got minute %', v_min;
  END IF;
END $$;
