-- =============================================================================
-- 20260824320000_hr_purge_remaining_casual_leave_requests.sql
--
-- Removes every remaining Casual Leave application: 192 pending (172.5 days,
-- 128 staff) and 2 withdrawn (1.0 day), across all organisations. Together with
-- 20260824300000, which took the single approved one, this clears Casual Leave
-- to zero.
--
-- Dates span 2026-06-08 to 2026-11-07 — the tail is future-dated requests that
-- had not come round yet.
--
-- THE ONE THING THIS MUST NOT BREAK
-- ---------------------------------
-- hr_leave_balances.used carries 496.50 days of Casual Leave across 296 staff,
-- and NONE of it comes from an application. Every day of it is the June-2026
-- opening consumption seeded from the legacy HR app by migrations
-- 20260822160000 .. 20260824235900 — the reason those exist at all is that
-- June ran in the old system and MyJKKN has no attendance before July.
--
-- Verified before writing: the sum of approved Casual Leave applications is
-- 0.00, so `used` is 100% seeded. Deleting these 194 rows must therefore move
-- the balance by EXACTLY ZERO. The DO block asserts that rather than trusting
-- it, and aborts if a single day shifts. A purge that quietly reset 296 staff
-- to a full 12-day entitlement would hand back leave they already took, and
-- nothing downstream would notice until the year-end figures were wrong.
--
-- WHY NO REVERSAL IS NEEDED HERE
-- ------------------------------
-- Unlike 20260824300000, nothing in this batch was ever approved, so no trigger
-- ever fired on it:
--   * hr_trig_update_leave_balance fires on the transition INTO approved, so
--     none of these touched `used`
--   * fn_recompute_attendance_on_leave_approval likewise, so no attendance day
--     was flipped — confirmed: 0 audit-log rows reference any of these 194, and
--     0 attendance rows name one in excused_by_application_ids
--   * 0 comp-off credits were consumed, 0 rows point here via superseded_by
--
-- CASCADE: 1 hr_leave_application_comments row goes with its application. That
-- is the FK's own ON DELETE CASCADE and is correct — a comment on a request
-- that no longer exists has nothing to say.
--
-- trg_hla_block_locked_period fires on DELETE and raises P0001 for any request
-- overlapping a LOCKED attendance month. Checked: 0 of 194.
--
-- Rows are appended to hr_leave_applications_backup_20260824_cl, the same table
-- 20260824300000 created, so the whole Casual Leave purge sits in one snapshot.
--
-- Idempotent: a second run finds nothing and exits quietly.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hr_leave_applications_backup_20260824_cl
  (LIKE public.hr_leave_applications);

REVOKE ALL ON TABLE public.hr_leave_applications_backup_20260824_cl FROM PUBLIC, anon;

DO $$
DECLARE
  v_target      int;
  v_approved    int;
  v_locked      int;
  v_backed_up   int;
  v_deleted     int;
  v_used_before numeric;
  v_used_after  numeric;
  v_att_before  int;
  v_att_after   int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE a.status = 'approved')
    INTO v_target, v_approved
    FROM hr_leave_applications a
    JOIN hr_leave_types lt ON lt.id = a.leave_type_id
   WHERE lt.leave_type_code = 'CL';

  IF v_target = 0 THEN
    RAISE NOTICE 'No Casual Leave applications remain — already clear.';
    RETURN;
  END IF;

  IF v_target <> 194 THEN
    RAISE EXCEPTION
      'Expected 194 Casual Leave applications, found %. Staff are still filing; re-check the scope before purging.', v_target;
  END IF;

  -- An approved row would have moved balance AND attendance, and this migration
  -- reverses neither. 20260824300000 is the one that knows how to do that.
  IF v_approved > 0 THEN
    RAISE EXCEPTION
      '% Casual Leave applications are APPROVED. They have consumed balance and flipped attendance; this migration does not reverse either. Use the pattern in 20260824300000.', v_approved;
  END IF;

  SELECT count(*) INTO v_locked
    FROM hr_leave_applications a
    JOIN hr_leave_types lt ON lt.id = a.leave_type_id
    JOIN staff s ON s.id = a.employee_id
   WHERE lt.leave_type_code = 'CL'
     AND EXISTS (
       SELECT 1 FROM hr_attendance_periods ap
        WHERE ap.institution_id = s.institution_id
          AND ap.status = 'locked'
          AND make_date(ap.period_year, ap.period_month, 1) <= a.end_date
          AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > a.start_date
     );
  IF v_locked > 0 THEN
    RAISE EXCEPTION
      '% applications fall in a LOCKED attendance month; trg_hla_block_locked_period would abort the delete part-way.', v_locked;
  END IF;

  -- Baselines. The balance one is the whole point.
  SELECT COALESCE(sum(b.used), 0) INTO v_used_before
    FROM hr_leave_balances b
    JOIN hr_leave_types lt ON lt.id = b.leave_type_id
   WHERE lt.leave_type_code = 'CL';

  SELECT count(*) INTO v_att_before
    FROM hr_attendance_records r
   WHERE r.recomputed_from_event_id IS NOT NULL;

  INSERT INTO public.hr_leave_applications_backup_20260824_cl
  SELECT a.*
    FROM hr_leave_applications a
    JOIN hr_leave_types lt ON lt.id = a.leave_type_id
   WHERE lt.leave_type_code = 'CL';
  GET DIAGNOSTICS v_backed_up = ROW_COUNT;

  IF v_backed_up <> v_target THEN
    RAISE EXCEPTION 'Backed up % of % rows. Refusing to delete without a complete snapshot.', v_backed_up, v_target;
  END IF;

  DELETE FROM hr_leave_applications a
   USING hr_leave_types lt
   WHERE lt.id = a.leave_type_id
     AND lt.leave_type_code = 'CL';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> v_target THEN
    RAISE EXCEPTION 'Deleted % rows, expected %.', v_deleted, v_target;
  END IF;

  SELECT COALESCE(sum(b.used), 0) INTO v_used_after
    FROM hr_leave_balances b
    JOIN hr_leave_types lt ON lt.id = b.leave_type_id
   WHERE lt.leave_type_code = 'CL';

  SELECT count(*) INTO v_att_after
    FROM hr_attendance_records r
   WHERE r.recomputed_from_event_id IS NOT NULL;

  -- The seeded June consumption must be exactly where it was.
  IF v_used_after IS DISTINCT FROM v_used_before THEN
    RAISE EXCEPTION
      'Casual Leave `used` moved from % to %. That is seeded June-2026 opening consumption and nothing here should have written to it.',
      v_used_before, v_used_after;
  END IF;

  IF v_att_after IS DISTINCT FROM v_att_before THEN
    RAISE EXCEPTION 'Leave-recomputed attendance rows moved from % to %.', v_att_before, v_att_after;
  END IF;

  RAISE NOTICE
    'Purged % Casual Leave applications. Seeded `used` held at % days; leave-recomputed attendance rows unchanged at %.',
    v_deleted, v_used_after, v_att_after;
END;
$$;
