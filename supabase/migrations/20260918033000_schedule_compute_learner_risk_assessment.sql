-- ============================================================================
-- Give the learner risk engine a clock — it has never had one
-- Migration: 20260918033000
-- ============================================================================
--
-- FINDING (production, read-only, 2026-09-18 02:40Z):
--
--     assess_rows      4339
--     max_created      2026-07-30 10:57:51.409118+00
--     max_assessment   2026-07-30
--     distinct_dates   1          <-- the whole story
--     active_learners  5097
--
-- `distinct_dates = 1` is the fact that reframes this. The engine did not stop
-- on 2026-07-30. It RAN ONCE, on 2026-07-30, and has never run again, because
-- nothing has ever been scheduled to call it. The 4,339 rows are the operator's
-- own verification run while repairing the function in PR #2643 — the run whose
-- result that migration records as "59 critical and 403 high learners now
-- surface, out of 4,342 assessed".
--
-- The repo already says so in two places, and both were written by people who
-- had noticed:
--
--   * 20260730160100 (the repair itself): "Nothing calls it: a repo-wide search
--     of jicate/main finds no caller outside migrations and generated types,
--     and no pg_cron job invokes it. It is run by a server-side operator."
--   * app/api/cron/learner-risk-notifications/route.ts:182 — "Nothing upstream
--     of this route writes learner_risk_assessments on a schedule
--     (compute_learner_risk_assessment is operator-run — 20260730160100)".
--
-- What was missing was not a diagnosis. It was the scheduled call. This
-- migration is that call, and nothing else.
--
-- CONSEQUENCE TODAY: every downstream consumer re-reads a single 49-day-old
-- snapshot every night — the learner-360 verdict routine (01:05Z, HTTP 200,
-- 199 verdicts recorded nightly against July's numbers) and the
-- learner-risk-staff-notifications routine (which correctly sends nothing,
-- because "new or worsened since yesterday" is never true in a table with one
-- date). 758 learners enrolled since July have never been scored at all
-- (5,097 active vs 4,339 assessed).
--
-- ---------------------------------------------------------------------------
-- WHY pg_cron AND NOT A ROUTE
-- ---------------------------------------------------------------------------
-- Two mechanisms exist here, and this job belongs to the older one.
--
--   * vercel.json `crons` is at its plan ceiling — a 101st entry fails the
--     build for every deploy (stated in both misc-ai.ts routine notes). New
--     HTTP-shaped jobs therefore go through ai_routine_schedules and the
--     AI-routine dispatcher.
--   * But the dispatcher fires each routine with
--     `AbortSignal.timeout(120_000)` (app/api/cron/ai-routine-dispatcher,
--     step 3). This function loops 5,097 learners with ~6 subqueries each and
--     opens by refreshing a materialized view. A run that overshoots 120s would
--     have its HTTP client aborted while the database transaction kept going —
--     recording a permanent "error: ..." status on a routine that actually
--     succeeded. That is a worse failure than the silence it replaces.
--
-- pg_cron has no HTTP leg to time out, and it is already the established home
-- for exactly this class of job — a pure-SQL nightly compute. Five siblings
-- run there today, including the one this function READS:
--
--     jobid 1  0 2 * * *   compute-daily-engagement-metrics
--     jobid 2  0 3 * * *   compute-student-engagement-scores   <-- input
--     jobid 7  15 2 * * *  compute-module-usage-daily
--     jobid 8  30 2 * * *  compute-feature-usage-summary
--     jobid 9  15 3 * * *  compute-institution-health-scores
--
-- compute_learner_risk_assessment is the one member of that family that was
-- never enrolled in it.
--
-- ---------------------------------------------------------------------------
-- WHY 00:35 UTC
-- ---------------------------------------------------------------------------
-- cron.timezone is GMT and the database TimeZone is UTC (both read live), so
-- this expression is UTC. 00:35 UTC = 06:05 IST.
--
-- Chosen so the engine writes BEFORE its consumers read:
--   00:35Z  this job writes today's assessments
--   01:05Z  learner-360-verdict reads them (30-minute head start)
--   11:50Z  learner-risk-staff-notifications reads them (17:20 IST)
--
-- The minute avoids the two jobs already sitting in the 00:xx hour (00:05
-- auto-update-expo-statuses, 00:20 induction-expire-mentor-covers).
--
-- It must also stay OUT of the 18:30-24:00 UTC window: the function keys rows
-- by CURRENT_DATE (a UTC date) while learner-risk-notifications selects them
-- with istToday(). Those two agree on every hour except that window, where the
-- IST calendar has already rolled over and the UTC one has not. 00:35Z is
-- safely inside the agreeing range.
--
-- KNOWN TRADE-OFF, deliberate: running at 00:35Z means the engagement
-- dimension reads scores written by jobid 2 at 03:00Z the PREVIOUS day, so
-- that input is ~21.5h old. Engagement carries 10 of the 55 points currently
-- earnable, and engagement_level is a slow-moving band, so a same-day-minus-one
-- read does not move a learner's band. The alternative — running after 03:00Z —
-- would instead make every learner-360 verdict a full day stale, which is the
-- surface Principals actually read. Freshness was spent on the verdict.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT FIX (deliberately out of scope, reported instead)
-- ---------------------------------------------------------------------------
--   * Only 55 of the 100 configured weight points are earnable on production:
--     obe_assessment_co_marks, hostel_risk_alerts, learner_pulse_responses and
--     health_escalations are all at 0 rows, so academic/hostel/belonging/
--     wellness contribute nothing. The 20260730160100 renormalisation already
--     divides by the earnable weight, so tiers remain reachable; this is a
--     data-coverage gap, not an arithmetic one.
--   * mv_learner_attendance_summary holds 3,527 rows against 5,097 active
--     learners. The ~1,570 learners with no attendance row score 0 on the
--     attendance dimension while the denominator still counts attendance's 25
--     points globally, which systematically under-scores them. Fixing that
--     means making v_w_applied per-learner rather than per-run — a change to
--     the scoring function's meaning, which belongs in its own reviewed PR.
--   * The two recommended_actions strings inside the function body still read
--     "student". Unchanged here for the same reason 20260730160100 left them:
--     this file must not rewrite that function's body.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The schedule
-- ---------------------------------------------------------------------------
-- Guarded on the extension rather than assuming it: pg_cron is installed on
-- production (verified live), but it is NOT present on a bare local or CI
-- Postgres, and an unguarded `SELECT cron.schedule(...)` would make this file
-- fail to apply there. The guard degrades to a NOTICE so a developer database
-- stays applyable and says why it skipped.
--
-- cron.schedule() upserts by job name, so re-applying this migration re-points
-- the existing job instead of creating a duplicate.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'compute-learner-risk-assessment',
      '35 0 * * *',
      $job$ SELECT public.compute_learner_risk_assessment(CURRENT_DATE); $job$
    );
    RAISE NOTICE 'scheduled compute-learner-risk-assessment at 35 0 * * * (UTC)';
  ELSE
    RAISE NOTICE 'pg_cron not installed — skipping schedule for compute_learner_risk_assessment';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Close the EXECUTE grant 20260730160100 intended to close
-- ---------------------------------------------------------------------------
-- 20260730160100 declared this its "ONE DELIBERATE DELTA FROM LIVE" and wrote
-- the REVOKE. Production never received it. Read live 2026-09-18:
--
--     proacl = {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- `authenticated` still holds EXECUTE. The function opens by DELETEing every
-- row for the target date and then loops all 5,097 active learners, so that
-- grant is both a data-destruction primitive and a cheap denial-of-service,
-- reachable over PostgREST by any signed-in user.
--
-- This was tolerable-ish while nothing ran on a schedule. It stops being
-- tolerable in the same migration that gives the function a nightly clock: a
-- user calling it mid-run would contend with the scheduled run on the same
-- rows.
--
-- Safe to revoke — re-verified on today's main, not taken on trust from the
-- July file: no application code calls it. The only occurrences outside
-- supabase/migrations are a comment in learner-risk-notifications/route.ts, a
-- comment in types/learner-risk.ts, and the generated signature in
-- types/supabase.ts. The callers are pg_cron (as postgres, the owner) and a
-- server-side operator (service_role); both keep their grant below.
--
-- anon is revoked alongside PUBLIC because anon inherits PUBLIC's default
-- EXECUTE grant on every new function, so revoking anon alone leaves the
-- function callable with the public anon key.
REVOKE EXECUTE ON FUNCTION public.compute_learner_risk_assessment(date) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.compute_learner_risk_assessment(date) TO service_role;
