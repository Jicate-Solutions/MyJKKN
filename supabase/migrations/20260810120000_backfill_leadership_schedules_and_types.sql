-- 20260810120000_backfill_leadership_schedules_and_types.sql
--
-- Gives every principal and HOD the boring half of their booking setup, which a
-- one-off script did once in June and has never done since.
--
-- WHY
--   scripts/meetings/provision-leadership-native.ts creates a default schedule
--   and a default 30-minute meeting type per leader, so the only steps left are
--   the ones only they can do: claim a handle, connect Google, publish.
--
--   It ran on 2026-06-21 and has not run since. Nothing re-runs it. The roster
--   moved on without it, in both directions:
--
--     47 of 103 leaders (44 HOD + 3 principal) have no booking page.
--     Of those 47, only 15 have a schedule and only 2 have a meeting type.
--     DR. VIJAYABASKARAN M is an active HOD with none of the three.
--     Dr. KARTHICK S, provisioned in June, has since gone inactive.
--
--   A script that must be remembered is a script that will be forgotten. Putting
--   the same work in a migration makes it reviewable, versioned and replayable
--   instead of dependent on somebody's shell history.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   It creates NO meeting_host_pages row and NO handle. That restraint is the
--   script's, and it is right: the handle locks at publish and (until PR #2818)
--   nobody could change it afterwards, so a machine-picked address would trap
--   the leader with a name they never chose. Claiming an address stays theirs.
--
--   So this migration will NOT move anybody from "No page" to "Page not live"
--   on the adoption scoreboard. It removes the setup work behind that step; the
--   step itself is still a human one.
--
-- IDEMPOTENT, via NOT EXISTS rather than ON CONFLICT.
--   uq_mhs_default_per_host is a PARTIAL unique index
--   (host_profile_id) WHERE is_default = true. A conflict target must match a
--   partial index exactly, WHERE clause included, and getting that subtly wrong
--   raises 42P10 at runtime — which is precisely the failure that has been
--   breaking five nightly NAAC routines. NOT EXISTS has no such trap.
--
-- NEVER REACTIVATES a meeting type somebody deliberately switched off:
-- the guard tests for the row's existence, not its is_active flag.

BEGIN;

-- ---------------------------------------------------------------------------
-- Eligible leaders — mirrors the script's exclusion filter exactly.
-- If these drift apart, the migration and the script will disagree about who
-- counts, so the rules are restated here rather than referenced.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _eligible_leaders ON COMMIT DROP AS
SELECT p.id AS host_profile_id, p.institution_id
FROM profiles p
LEFT JOIN institutions i ON i.id = p.institution_id
WHERE p.role IN ('principal', 'hod')
  AND COALESCE(btrim(p.full_name), '') <> ''            -- empty name
  AND p.full_name !~* '\mtest\M'                        -- "test principal" etc.
  AND lower(btrim(p.full_name)) NOT IN ('hod', 'hod jkkn', 'principal')
  AND COALESCE(i.name, '') !~* 'testing';               -- the testing institution

-- ---------------------------------------------------------------------------
-- 1. Default "Working hours" schedule (Asia/Kolkata)
-- ---------------------------------------------------------------------------
WITH inserted AS (
  INSERT INTO meeting_host_schedules (host_profile_id, institution_id, name, timezone, is_default)
  SELECT e.host_profile_id, e.institution_id, 'Working hours', 'Asia/Kolkata', true
  FROM _eligible_leaders e
  WHERE NOT EXISTS (
    SELECT 1 FROM meeting_host_schedules s
    WHERE s.host_profile_id = e.host_profile_id AND s.is_default
  )
  RETURNING id
)
-- 2. Mon–Fri 10:00–16:00 windows, for the schedules just created ONLY.
--    Scoped to `inserted` on purpose: a leader who already had a default
--    schedule may have edited their hours, and appending a second set of
--    windows would silently widen their availability.
INSERT INTO meeting_schedule_windows (schedule_id, weekday, start_minute, end_minute)
SELECT i.id, w.weekday, 600, 960          -- 10:00 → 16:00
FROM inserted i
CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS w(weekday);

-- ---------------------------------------------------------------------------
-- 3. Default "30-Minute Meeting" type.
--    schedule_id NULL = follow the host's default schedule, so a leader who
--    later edits their hours does not have to edit this too.
-- ---------------------------------------------------------------------------
INSERT INTO meeting_types (
  host_profile_id, institution_id, title, slug, duration_min,
  min_notice_min, buffer_before_min, buffer_after_min, max_days_ahead,
  hidden, is_active, schedule_id
)
SELECT
  e.host_profile_id, e.institution_id, '30-Minute Meeting', 'meeting-30', 30,
  120, 0, 0, 30,
  false, true, NULL
FROM _eligible_leaders e
WHERE NOT EXISTS (
  SELECT 1 FROM meeting_types t
  WHERE t.host_profile_id = e.host_profile_id AND t.slug = 'meeting-30'
);

-- ---------------------------------------------------------------------------
-- Prove it. A backfill that matched nobody looks exactly like one that worked.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_eligible  int;
  v_no_sched  int;
  v_no_type   int;
BEGIN
  SELECT count(*) INTO v_eligible FROM _eligible_leaders;

  SELECT count(*) INTO v_no_sched
  FROM _eligible_leaders e
  WHERE NOT EXISTS (SELECT 1 FROM meeting_host_schedules s
                    WHERE s.host_profile_id = e.host_profile_id AND s.is_default);

  SELECT count(*) INTO v_no_type
  FROM _eligible_leaders e
  WHERE NOT EXISTS (SELECT 1 FROM meeting_types t
                    WHERE t.host_profile_id = e.host_profile_id AND t.slug = 'meeting-30');

  RAISE NOTICE 'leadership backfill: % eligible leader(s); still missing a default schedule: %; still missing meeting-30: %',
    v_eligible, v_no_sched, v_no_type;

  IF v_eligible = 0 THEN
    RAISE EXCEPTION
      'No eligible leaders matched. Either profiles.role no longer uses '
      '"principal"/"hod", or the exclusion filter is over-matching — either way '
      'this migration would be a silent no-op, so it fails loudly instead.';
  END IF;

  IF v_no_sched > 0 OR v_no_type > 0 THEN
    RAISE EXCEPTION
      'Backfill incomplete: % leader(s) still lack a default schedule and % still lack meeting-30.',
      v_no_sched, v_no_type;
  END IF;
END $$;

COMMIT;
