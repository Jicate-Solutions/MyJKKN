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
-- on production inside BEGIN..ROLLBACK only, and production was re-verified
-- unchanged in a separate call afterwards. It is a data migration touching
-- ~44,855 notification rows and must be run deliberately, by a human, after
-- reading the numbers below.
--
-- Companion: 20260816040000_notification_expiry_director_categories.sql fixes
-- the generators so this backlog does not rebuild. Apply that one FIRST.
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
-- MEASURED IMPACT (production, 2026-08-09, BEGIN..ROLLBACK)
-- --------------------------------------------------------------------------------
--   rows given an expires_at ................................ 44,855
--   of those, already lapsed at run time .................... 42,226
--   unread rows that stop counting, ALL users ............... 36,362
--
--   director@jkkn.ac.in unread ....................... 680 -> 90
--
--   category                          unread  cleared  remaining
--   --------------------------------  ------  -------  ---------
--   Alert (Instagram monitor)            244      211         33
--   accreditation                        194      170         24
--   dashboard:anomaly                     64       64          0
--   loops                                 65       62          3
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
--   * Alert 33 = exactly one live row per silent Instagram handle (the monitor
--     re-alerts each account every 7 days; an 8-day TTL keeps the newest).
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
--   8 days  -- Instagram silence / ownership monitor. lib/instagram/silence-detect.ts
--              re-alerts the same account every `ig.silence_realert_days`
--              (DEFAULT_REALERT_DAYS = 7). 8d > 7d keeps exactly one live row per
--              account rather than one per re-alert since 2026-07-01.
--   36 hours - everything else here is a DAILY emitter keyed to a calendar day.
--              36h is 1.5x the cycle, so a single skipped cron run still leaves
--              one live row while the stack is capped at 2 instead of unbounded.
-- ================================================================================

BEGIN;

-- Selector: rows whose SAME underlying fact is re-announced on a fixed cycle
-- under a period-scoped idempotency key. Nothing that is the only record of a
-- specific un-actioned item is matched here.
WITH ttl(bucket, ttl) AS (
  VALUES
    -- Instagram silence / ownership-flip monitor. lib/instagram/silence-detect.ts
    -- re-alerts the same account every `ig.silence_realert_days` days
    -- (DEFAULT_REALERT_DAYS = 7). An 8-day TTL keeps exactly ONE live row per
    -- account instead of one per re-alert since 2026-07-01.
    ('ig_monitor',     interval '8 days'),
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
      -- 'Attendance not marked today - X', one row per timetable per DAY. The
      -- rows created before 2026-04-24 carry a bare-UUID idempotency key rather
      -- than the 'unmarked_attendance:' prefix, so match the structural marker
      -- (action_config.timetable_id) as well -- 53 of the Director's 64
      -- dashboard:anomaly rows are the older key shape.
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

COMMIT;
