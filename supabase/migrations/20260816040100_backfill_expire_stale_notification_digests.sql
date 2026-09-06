-- ================================================================================
-- ONE-TIME BACKFILL: give the already-accumulated self-obsoleting notification
-- rows the expiry their generators never set.
--
-- Created: 2026-08-09
--
-- ✅ APPLIED TO PRODUCTION 2026-08-10 by hand (Management API, single batch, with
--    `SET myjkkn.apply_backfill='yes'` sent in the SAME request as the body).
--    Recorded in supabase_migrations.schema_migrations as
--    ('20260816040100','backfill_expire_stale_notification_digests').
--    RESULT, read back from prod rather than inferred from an empty API
--    response: 45,643 rows stamped; the Director's live unread count went
--    746 -> 138; 43,775 dashboard:anomaly rows expired under the decision
--    recorded below. Do NOT re-run: the selector is `expires_at IS NULL`, so a
--    re-run is a no-op for these rows, but it would re-stamp anything that has
--    accumulated since with a TTL measured from ITS created_at.
--
-- ⚠️ IF YOU HAND-APPLY A FILE LIKE THIS AGAIN, note two traps this one carries:
--    1. It has its OWN `BEGIN;` ... `COMMIT;` (below). Wrapping it in your own
--       BEGIN..ROLLBACK to "rehearse" does NOT roll it back — the inner COMMIT
--       commits for real. Rehearse by running the selector as a SELECT COUNT
--       instead, which is what was done here (predicted 140 live rows remaining;
--       actual 138).
--    2. The guard's miss path is RAISE NOTICE, which Supabase Studio does not
--       surface, and Studio may run each execution on a DIFFERENT pooled
--       session — so setting the flag in a separate execution can leave it unset
--       here, stamp 0 rows, and still look like success. Send the SET and the
--       body in ONE request, and verify with a row count afterwards.
--
-- ############################################################################
-- ##  THIS FILE IS INERT UNLESS YOU DELIBERATELY ENABLE IT                  ##
-- ############################################################################
-- The UPDATE below is wrapped in a DO block guarded on a session setting:
--
--     current_setting('myjkkn.apply_backfill', true) IS DISTINCT FROM 'yes'
--        -> RAISE NOTICE, change nothing, return
--
-- So a blanket `supabase db push` (the repo's only apply mechanism -- see the
-- next banner) runs this file as a NO-OP. Nothing in this file is destructive
-- when the flag is unset; verified both ways inside BEGIN..ROLLBACK on
-- production 2026-08-09 (flag unset -> 0 rows changed; flag set -> 44,855 rows),
-- with production re-confirmed unchanged in a separate call.
--
-- KNOWN CONSEQUENCE OF NO-OPPING, stated so nobody is caught by it: such a push
-- still RECORDS this version in supabase_migrations.schema_migrations even
-- though no row was touched. The ledger would then read "applied" over an
-- untouched table. That is why the hand-apply below is a paste, not a push --
-- pasting the body works whether or not the version is already recorded, and the
-- DO block's NOTICE is the only honest report of what actually happened. The
-- companion 20260816040000 takes the opposite branch for exactly this reason: it
-- is DDL, so it RAISES instead of no-opping, and a push records nothing.
--
-- HAND-APPLY RECIPE (Supabase Studio SQL editor, project kvizhngldtiuufknvehv):
--     SET myjkkn.apply_backfill = 'yes';   -- session-level, survives the BEGIN below
--     <paste the whole body of this file>  -- it carries its own BEGIN/COMMIT
--     RESET myjkkn.apply_backfill;
-- The DO block raises a NOTICE with the row count it stamped. Then record the
-- version so a later db push skips it:
--     INSERT INTO supabase_migrations.schema_migrations (version, name)
--     VALUES ('20260816040100', 'backfill_expire_stale_notification_digests')
--     ON CONFLICT DO NOTHING;
--
-- ############################################################################
-- ##  APPLY-TIME CONSTRAINT -- THE CI WORKFLOW CANNOT RUN THIS ALONE        ##
-- ############################################################################
-- .github/workflows/supabase-migration-apply.yml is a blanket `supabase db push`:
-- it applies EVERY pending migration in version order. There is no per-file mode.
-- Firing it would also apply 20260816040000 and every other pending file in the
-- diverged ledger (including
-- 20260803080000_backfill_expire_stale_broadcast_notifications.sql, an earlier
-- unapplied 'DO NOT AUTO-APPLY' backfill, which has NO such guard). The guard
-- above protects THIS file's data change only; it does not make that workflow
-- safe to fire. Note the ordering: 20260803080000 sorts BEFORE both of the
-- 20260816 files, so a blanket push would already have applied it before either
-- gate here gets a chance to speak.
--
-- --------------------------------------------------------------------------------
-- WHAT IT DOES
-- --------------------------------------------------------------------------------
-- Sets notifications.expires_at = created_at + <TTL> on rows that are a periodic
-- restatement of a fact the generator re-announces on its own schedule, plus the
-- per-timetable 'Attendance not marked today' history covered by the Director
-- decision recorded below. It DELETES NOTHING and it does not touch
-- user_notifications. Rows whose computed expiry is already in the past simply
-- stop counting toward the bell badge -- the read path
-- (liveNotificationOrFilter() in lib/services/notification/notification-service.ts)
-- filters on expires_at, and the admin/manage/stats paths deliberately do not, so
-- every row below stays fully auditable at /notifications/admin.
--
-- --------------------------------------------------------------------------------
-- DIRECTOR DECISION, 2026-08-09 -- dashboard:anomaly history IS expired
-- --------------------------------------------------------------------------------
-- WHO: the Director, explicitly, after the previous review round removed this
-- clause and surfaced it as an open policy question rather than deciding it.
-- This is a recorded human call, not an agent's optimisation.
--
-- WHAT THEY WERE SHOWN AND ACCEPTED: the per-timetable 'Attendance not marked
-- today - X' rows are keyed 'unmarked_attendance:<timetable>:<DATE>:<user>' (an
-- older cohort is keyed '<uuid>:acknowledge' and identified by
-- action_config ? 'timetable_id'). Because the key embeds the DATE, each row is
-- announced EXACTLY ONCE and is never re-announced -- it does NOT satisfy this
-- file's own "same fact re-announced on a cycle" rule, and it is the one block
-- with no second surface in the product:
-- fn_aqs_attendance_unmarked_periods_today is CURRENT_DATE-only (no date
-- parameter) and the row's action URL /academic/attendance/dashboard?timetable=<id>
-- carries no date either. So expiring the history means 42,772 historical
-- notification rows, back to 2026-04-21, become visible NOWHERE in the product
-- except /notifications/admin. Those rows are the fan-out of 5,258 distinct
-- (timetable, day) unmarked sessions across 110 days -- roughly 8 recipients per
-- session -- so the underlying fact being hidden from every in-app surface is
-- 5,258 sessions, not 42,772 of them. The Director was told this and chose to
-- expire them anyway: clear the badge.
--
-- ROW COUNT COVERED BY THE DECISION: 42,772 dashboard:anomaly rows with
-- expires_at IS NULL (measured on production 2026-08-09) -- 42,523 matched by the
-- 'unmarked_attendance:%' key and a further 249 older rows matched only by
-- action_config ? 'timetable_id', all of them titled 'Attendance not marked
-- today - ...'. The 231 'Daily digest - N anomaly signal(s)' rows in the same
-- category are keyed 'digest:%' and were already in scope for a different reason.
--
-- (All 249 verified on production 2026-08-09 to carry the title 'Attendance not
-- marked today...' -- 249/249, none other.)
--
-- SCOPE LIMIT: nothing outside that population was added. Escalations
-- (missing_data:gap-escalated, attendance:breach-escalated, rcltp), per-item
-- approvals and per-bug rescues are still untouched -- see the "remaining"
-- column notes below and the NOT EXPIRED list in the companion migration.
--
-- --------------------------------------------------------------------------------
-- MEASURED IMPACT (production, 2026-08-09, read-only)
-- --------------------------------------------------------------------------------
--   rows given an expires_at ................................. 44,855
--   of those, already lapsed at run time ..................... 42,220
--   unread rows that stop counting, ALL users ................ 36,282
--
--   EVERY FIGURE HERE IS A POINT-IN-TIME READING, NOT A FIXTURE. The generators
--   keep emitting while this file sits unapplied, so the selector matches a few
--   more rows every hour -- re-measured 55 minutes apart on 2026-08-09 it went
--   44,855 -> 44,856. When you hand-apply, trust the row count in the DO block's
--   NOTICE, not this number; a slightly larger count is the expected drift, not
--   a sign the selector changed.
--
--   director@jkkn.ac.in unread ...................... 680 -> 96
--   (simulated against the real read filter: user_notifications.read_at IS NULL
--    AND (notifications.expires_at IS NULL OR expires_at > now()))
--
--   Breakdown of those 680 -> 96 (the DIRECTOR'S unread only, not cluster-wide):
--
--   category                          unread  cleared  remaining
--   --------------------------------  ------  -------  ---------
--   Alert (Instagram monitor)            244      211         33
--   accreditation                        194      170         24
--   loops                                 65       56          9
--   dashboard:anomaly                     64       64          0
--   dashboard:hr_brief                    35       34          1
--   general (AI runner health)            26       26          0
--   dashboard:approval                    16       10          6
--   dashboard:rescue                      15       13          2
--   missing_data:gap-escalated             6        0          6
--   meetings:calendar-connect-weekly       5        0          5
--   attendance:breach-escalated            4        0          4
--   rcltp                                  3        0          3
--   daily-intel                            2        0          2
--   Announcement                           1        0          1
--
-- The "remaining" column is the point of this migration, not a shortfall:
--   * loops 9 = one live loop-watchdog edition per day of the last week (7-day
--     TTL, see the bucket comment) plus the current loop-adherence editions.
--   * Alert 33 = exactly one live row per silent Instagram handle (the monitor
--     re-alerts each account every ig.silence_realert_days -- live value 7 -- and
--     the TTL is derived from that policy, so it keeps the newest).
--   * accreditation 24 = today's 17 live nudges/escalations plus 7 capout
--     notices, which are one-per-narrative and are deliberately NOT matched.
--   * dashboard:approval 6 = three real pending leave approvals and three real
--     decision verdicts. Those are un-actioned work and are left in the badge on
--     purpose.
--   * dashboard:rescue 2 = 'Bug BUG-003276 / BUG-003277 aging 110d'. Real work.
--   * missing_data:gap-escalated, attendance:breach-escalated, rcltp = 13 rows
--     of genuine escalation ('Review meeting warranted -- <college>', 'decision
--     stalled two weeks'). Left alone. Expiring these to make the badge smaller
--     would be hiding the problem rather than reporting it.
--
-- --------------------------------------------------------------------------------
-- WHAT REBUILDS AFTER THIS RUNS, AND WHAT DOES NOT
-- --------------------------------------------------------------------------------
-- Companion 20260816040000_notification_expiry_director_categories.sql patches
-- the generators behind MOST of these rows (super-admin daily digest, HR brief,
-- accreditation nudge/escalation, per-timetable unmarked-attendance), and the two
-- loop crons are patched in app/api/cron/loop-*/route.ts in the same PR. Apply
-- the companion FIRST.
--
-- It does NOT patch every generator this file stamps. Measured on production
-- 2026-08-09, 309 of the 44,855 rows come from generators that are NOT touched by
-- this PR and will therefore start accruing again with expires_at IS NULL:
--     ig-silence-detect ................ 243   (lib/instagram/silence-detect.ts)
--     ai-tasks-sweep:runner-down ........  36
--     ai-tasks-sweep:learner-note-drafts   25
--     ai-tasks-sweep:loop-lane-outage ...   4
--     ig-auto-route .....................   1
-- That is a known, disclosed gap, not a claim that the backlog cannot return.
--
-- --------------------------------------------------------------------------------
-- TTLs AND WHY
-- --------------------------------------------------------------------------------
--   DERIVED  - Instagram silence / ownership monitor. NOT a literal: the query
--              reads `ig.silence_realert_days` live via fn_get_policy_int and uses
--              GREATEST(policy, 7) + 1 days. The policy is runtime-editable (its
--              own ui_consequence text invites raising it), so a hardcoded 8 could
--              be silently outrun -- raise it to 14 and an 8-day TTL would open a
--              6-day window in which a still-silent handle has no live row at all.
--              GREATEST(...,7) because the cron itself is weekly (vercel.json
--              '23 7 * * 1'), so nothing is re-announced faster than 7 days.
--              Policy value at measurement time: 7 -> 8 days, i.e. today's numbers
--              are unchanged; what changes is that they stay correct if it moves.
--   7 days   - loop-watchdog only. That routine exists so that silence does not
--              look like health, and it is itself dispatcher-run: a dispatcher
--              outage stops NEW editions, so a 36h TTL would empty the bell of
--              watchdog rows exactly during the failure the routine was built to
--              surface. A TTL cannot make an outage visible; it can only avoid
--              deleting the last evidence too soon. 7 days outlives a plausible
--              outage and still caps the stack at ~7 rows instead of unbounded.
--              14 such rows exist today.
--   36 hours - everything else here is a DAILY emitter keyed to a calendar day.
--              36h = 1.5x the cycle. What that buys is tolerance of a LATE run,
--              not of a fully skipped day: a run that slips up to 12h still
--              overlaps the previous row, so the bell is never empty, and the
--              stack is capped at 2 instead of growing without bound. It does NOT
--              survive a skipped day -- successful emissions would then be 48h
--              apart while the surviving row dies at 36h, leaving a ~12h window
--              with no live row (surviving that needs >= 2x the cycle). The
--              consequence is a bounded, at-most-12h under-count of the badge.
--              For the digest / accreditation / hr_brief families that costs
--              nothing, because the work itself lives on a queue page and the
--              notification is only a pointer to it. It is NOT free for the
--              dashboard:anomaly rows, which have no second surface at all --
--              that is the whole subject of the Director decision above, and it
--              is why that decision is recorded rather than assumed.
--              These cadences are deploy-gated in vercel.json, so unlike the two
--              above they cannot be changed without a deploy that could carry a
--              matching TTL change.
-- ================================================================================

BEGIN;

DO $backfill$
DECLARE
  v_rows bigint;
BEGIN
  -- GATE. Unset (the state a blanket `supabase db push` runs in) = do nothing.
  IF current_setting('myjkkn.apply_backfill', true) IS DISTINCT FROM 'yes' THEN
    RAISE NOTICE 'backfill skipped -- set myjkkn.apply_backfill=''yes'' to run';
    RETURN;
  END IF;

  -- Selector: rows whose SAME underlying fact is re-announced on a fixed cycle
  -- under a period-scoped idempotency key, PLUS the dashboard:anomaly
  -- per-timetable history covered by the Director decision in the header.
  -- Nothing that is the only record of a specific un-actioned item is matched.
  WITH ttl(bucket, ttl) AS (
    VALUES
      -- Instagram silence / ownership-flip monitor. lib/instagram/silence-detect.ts
      -- re-alerts the same account every `ig.silence_realert_days` days, read live
      -- from platform_policies (DEFAULT_REALERT_DAYS = 7, current value 7). The TTL
      -- is DERIVED from that same policy rather than hardcoded at 8 days: the policy
      -- is runtime-editable on the admin surface and its own ui_consequence text
      -- invites raising it, so a literal 8 could be silently outrun (set it to 14
      -- and an 8-day TTL opens a 6-day window where a still-silent handle has no
      -- live row at all). GREATEST(policy, 7) because the cron itself only fires
      -- weekly (vercel.json '23 7 * * 1'), so the fact cannot be re-announced faster
      -- than every 7 days even when the policy says 0 (= suppression disabled);
      -- +1 day is the margin that keeps exactly one live row per account.
      ('ig_monitor',
         make_interval(days => GREATEST(
           COALESCE(public.fn_get_policy_int('ig.silence_realert_days', 7, NULL), 7), 7) + 1)),
      -- loop-watchdog only. Its whole purpose is "silence must not look like
      -- health", and it is itself dispatcher-run: if the dispatcher dies, no new
      -- edition is emitted, so a 36h TTL would empty the bell of watchdog rows
      -- exactly during the outage the routine exists to surface. A TTL cannot make
      -- an outage visible, but it must not delete the last evidence of one too
      -- soon -- 7 days outlives a plausible outage while still capping the stack at
      -- ~7 rows instead of unbounded. Matches WATCHDOG_MIN_TTL_MS in
      -- app/api/cron/loop-watchdog/route.ts; keep the two in step.
      ('loop_watchdog',  interval '7 days'),
      -- Daily emitters. 36h = 1.5x the cycle: it absorbs a LATE run (up to 12h of
      -- slip still overlaps the previous row) and caps the stack at 2 instead of
      -- unbounded. It does NOT cover a fully skipped day -- that leaves a ~12h
      -- window with no live row. See the TTL note in the header.
      ('daily_emitter',  interval '36 hours')
  ),
  targets AS (
    SELECT n.id, n.created_at,
           CASE
             WHEN n.category = 'Alert'
                  AND n.metadata->>'source' IN ('ig-silence-detect','ig-auto-route')
               THEN 'ig_monitor'
             WHEN n.metadata->>'source' = 'loop-watchdog-cron'
               THEN 'loop_watchdog'
             ELSE 'daily_emitter'
           END AS bucket
    FROM public.notifications n
    WHERE n.expires_at IS NULL
      AND (
        -- Instagram monitor (re-alert cycle 7d)
        (n.category = 'Alert'
         AND n.metadata->>'source' IN ('ig-silence-detect','ig-auto-route'))
        -- accreditation narrative nudge + escalation; key ends ':<YYYY-MM-DD>'.
        -- The capout notice (source 'accreditation-narrative-capout-cron') is one
        -- row per narrative and is deliberately NOT matched.
        OR (n.category = 'accreditation'
            AND (n.idempotency_key LIKE 'accred\_narr\_nudge:%'
              OR n.idempotency_key LIKE 'accred\_narr\_esc:%'))
        -- loop crons: all daily, keyed '<name>:<YYYY-MM-DD>[:fingerprint]'
        OR (n.category = 'loops'
            AND n.metadata->>'source' IN ('loop-adherence-cron','loop-watchdog-cron',
                                          'ai-tasks-sweep:learner-note-drafts',
                                          'ai-tasks-sweep:loop-lane-outage'))
        -- Max-lane runner health alert, keyed per hour
        OR (n.category = 'general'
            AND n.metadata->>'source' = 'ai-tasks-sweep:runner-down')
        -- DIRECTOR DECISION 2026-08-09 (see header): the per-timetable
        -- 'Attendance not marked today - X' history IS expired, accepting that
        -- 42,772 historical rows -- the fan-out of 5,258 (timetable, day)
        -- unmarked sessions -- are then visible nowhere in the product but
        -- /notifications/admin. Two key shapes, one population:
        -- the current 'unmarked_attendance:<timetable>:<DATE>:<user>' key and an
        -- older cohort keyed '<uuid>:acknowledge' that carries timetable_id in
        -- action_config. 42,772 rows on production 2026-08-09.
        OR (n.category = 'dashboard:anomaly'
            AND (n.idempotency_key LIKE 'unmarked\_attendance:%'
              OR n.action_config ? 'timetable_id'))
        -- 'Daily digest - N ...' from fn_generate_super_admin_daily_digest,
        -- keyed 'digest:<user>:<category>:<YYYY-MM-DD>'
        OR n.idempotency_key LIKE 'digest:%'
        -- daily HR Command Center brief, keyed 'hr_brief:<user>:<YYYY-MM-DD>'
        OR (n.category = 'dashboard:hr_brief'
            AND n.idempotency_key LIKE 'hr\_brief:%')
      )
  )
  UPDATE public.notifications n
  SET    expires_at = t.created_at + ttl.ttl
  FROM   targets t
  JOIN   ttl ON ttl.bucket = t.bucket
  WHERE  n.id = t.id
    AND  n.expires_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'backfill applied: % rows stamped with expires_at', v_rows;
END
$backfill$;

COMMIT;
