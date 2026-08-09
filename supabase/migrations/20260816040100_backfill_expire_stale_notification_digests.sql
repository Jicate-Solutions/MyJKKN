-- ================================================================================
-- ONE-TIME BACKFILL: give the already-accumulated self-obsoleting notification
-- rows the expiry their generators never set.
--
-- Created: 2026-08-09
--
-- ############################################################################
-- ##  DO NOT AUTO-APPLY -- REQUIRES SIGN-OFF                                ##
-- ############################################################################
-- This migration was NOT applied by the PR that introduced it. It was validated
-- on production read-only / inside BEGIN..ROLLBACK only, and production was
-- re-verified unchanged in a separate call afterwards. It is a data migration
-- touching ~2,083 notification rows and must be run deliberately, by a human,
-- after reading the numbers below.
--
-- Companion: 20260816040000_notification_expiry_director_categories.sql fixes
-- the generators so this backlog does not rebuild. Apply that one FIRST.
--
-- ############################################################################
-- ##  APPLY-TIME CONSTRAINT -- THE CI WORKFLOW CANNOT RUN THIS ALONE        ##
-- ############################################################################
-- .github/workflows/supabase-migration-apply.yml is a blanket `supabase db push`:
-- it applies EVERY pending migration in version order. There is no per-file mode.
-- Firing it to apply this file would also apply 20260816040000 and every other
-- pending file in the diverged ledger (including
-- 20260803080000_backfill_expire_stale_broadcast_notifications.sql, an earlier
-- unapplied 'DO NOT AUTO-APPLY' backfill). The banner above is a comment, not a
-- gate.
--
-- Hand-apply instead: paste the statement below into Supabase Studio's SQL editor
-- (project kvizhngldtiuufknvehv) with the surrounding BEGIN/COMMIT, read the row
-- count it reports, then record the version so a later db push skips it:
--     INSERT INTO supabase_migrations.schema_migrations (version, name)
--     VALUES ('20260816040100', 'backfill_expire_stale_notification_digests')
--     ON CONFLICT DO NOTHING;
--
-- --------------------------------------------------------------------------------
-- WHAT IT DOES
-- --------------------------------------------------------------------------------
-- Sets notifications.expires_at = created_at + <TTL> on rows that are a periodic
-- restatement of a fact the generator re-announces on its own schedule. It
-- DELETES NOTHING and it does not touch user_notifications. Rows whose computed
-- expiry is already in the past simply stop counting toward the bell badge --
-- the read path (liveNotificationOrFilter() in
-- lib/services/notification/notification-service.ts) filters on expires_at, and
-- the admin/manage/stats paths deliberately do not, so every row below stays
-- fully auditable at /notifications/admin.
--
-- --------------------------------------------------------------------------------
-- MEASURED IMPACT (production, 2026-08-09, read-only re-measure after review)
-- --------------------------------------------------------------------------------
-- These numbers REPLACE the first cut's (44,855 rows / Director 680 -> 90). Two
-- corrections landed in review: dashboard:anomaly history was removed from the
-- selector entirely (see the block comment inside the query), and loop-watchdog
-- rows moved to a 7-day TTL.
--
--   rows given an expires_at ................................. 2,083
--   of those, already lapsed at run time ..................... 2,004
--   unread rows that stop counting, ALL users ................ 4,827
--
--   director@jkkn.ac.in unread ...................... 680 -> 149
--
--   category                          unread  cleared  remaining
--   --------------------------------  ------  -------  ---------
--   Alert (Instagram monitor)            244      211         33
--   accreditation                        194      170         24
--   loops                                 65       56          9
--   dashboard:anomaly                     64       11         53
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
--   * dashboard:anomaly 53 = the per-timetable 'Attendance not marked today'
--     rows, now deliberately LEFT ALONE (see the block comment in the query).
--     The 11 cleared from this category are NOT those: they are
--     'Daily digest - N anomaly signal(s)' rows, which carry category
--     dashboard:anomaly but are keyed 'digest:<user>:...:<DATE>' and genuinely
--     are re-announced every day.
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
--              36h is 1.5x the cycle, so a single skipped cron run still leaves
--              one live row while the stack is capped at 2 instead of unbounded.
--              These cadences are deploy-gated in vercel.json, so unlike the two
--              above they cannot be changed without a deploy that could carry a
--              matching TTL change.
-- ================================================================================

BEGIN;

-- Selector: rows whose SAME underlying fact is re-announced on a fixed cycle
-- under a period-scoped idempotency key. Nothing that is the only record of a
-- specific un-actioned item is matched here.
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
    -- Daily emitters. 36h = 1.5x the cycle: a skipped cron run still leaves one
    -- live row, and the stack is capped at 2 instead of growing without bound.
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
      -- ####################################################################
      -- ##  dashboard:anomaly is DELIBERATELY NOT MATCHED HERE.           ##
      -- ####################################################################
      -- 'Attendance not marked today - X' is keyed
      -- 'unmarked_attendance:<timetable>:<DATE>:<user>'. Because the key embeds
      -- the DATE, the fact "timetable T was unmarked on date D" is announced
      -- EXACTLY ONCE and is never re-announced -- tomorrow's row is a different
      -- day's class. It therefore fails this migration's own selector rule
      -- ("the SAME underlying fact is re-announced on a fixed cycle"), and it is
      -- also the block with no second surface: fn_aqs_attendance_unmarked_periods_today
      -- is CURRENT_DATE-only (no date parameter) and the row's action URL
      -- /academic/attendance/dashboard?timetable=<id> carries no date either.
      -- Expiring the history would put ~42.5K past unmarked sessions nowhere in
      -- the app except /notifications/admin.
      --
      -- That may well be the right call -- but it is a DIRECTOR POLICY DECISION
      -- about hiding history, not a mechanical consequence of the rule this file
      -- applies, and it has not been given. So it is out. Measured on prod
      -- 2026-08-09: 43,064 dashboard:anomaly rows exist, 42,523 of them would
      -- have been matched here -- 95% of the original 44,855-row backfill.
      -- The generator-side TTL in 20260816040000 still applies, FORWARD ONLY, to
      -- rows created after it is applied, and is switchable off from generator
      -- config with no deploy (unmarked_attendance.expires_hours = 0).
      -- If the Director later says "expire the history too", the clause is a
      -- one-line re-add:
      --   OR (n.category = 'dashboard:anomaly'
      --       AND (n.idempotency_key LIKE 'unmarked\_attendance:%'
      --         OR n.action_config ? 'timetable_id'))
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

COMMIT;
