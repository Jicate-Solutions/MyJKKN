-- =============================================================================
-- 20260824300000_hr_purge_approved_casual_leave_and_revert.sql
--
-- Removes the approved Casual Leave application and REVERSES everything it did.
--
-- Scope: exactly ONE application — NOT148 (BOOBALAN A), JKKN Main Office,
-- 2026-07-17 to 2026-07-18, 2.0 days, approved 2026-08-21. It is the only
-- approved Casual Leave in the system.
--
-- WHY THIS ONE IS DIFFERENT FROM 20260824260000
-- ---------------------------------------------
-- That migration deleted 46 applications and deliberately touched nothing else,
-- because none had ever been approved. This one HAS been approved, so two
-- triggers already fired and left state behind that no DELETE will undo:
--
--   hr_trig_update_leave_balance            -> hr_leave_balances.used += 2.00
--   fn_recompute_attendance_on_leave_approval -> 2 attendance days set to LEAVE
--
-- Neither trigger fires on DELETE. Deleting the row alone would burn 2 days into
-- the ledger forever with no application left to explain them, and leave two
-- days reading LEAVE for leave that no longer exists. The reversal below is the
-- whole point of this migration; the DELETE is the easy part.
--
-- THE ATTENDANCE REVERT IS RECOVERED, NOT GUESSED
-- -----------------------------------------------
-- fn_recompute_attendance_on_leave_approval writes an hr_attendance_audit_log
-- row before it flips a day, carrying before_state.status_type_id. Both days
-- restore to ABSENT from that record — which independently agrees with
-- device_status = 'A' on both rows, the raw biometric verdict. So the day goes
-- back to what the biometric engine said, not to something inferred here.
--
-- The audit trail is APPENDED to, never rewritten: a second 'recompute' row
-- records the revert. Erasing the original entries would hide that the flip
-- ever happened, which is the opposite of what an audit log is for.
--
-- THE BALANCE DECREMENT CANNOT EAT THE JUNE BACKFILL
-- --------------------------------------------------
-- hr_leave_balances.used now carries two different things: the June-2026
-- opening consumption seeded from the legacy app (455 days across 258 staff,
-- migrations 20260822160000 .. 20260824235900), and in-app approvals since
-- July. Only the second may be reversed here.
--
-- Verified for this row before writing: used = 2.00 and the sum of approved
-- applications = 2.00, so the June component is 0.00 and the decrement lands
-- exactly on zero. The DO block re-checks that equality and aborts if it does
-- not hold, rather than subtracting blind. GREATEST(0, ...) is a floor, not the
-- plan.
--
-- entitled stays NULL — the row keeps following the policy default, and a
-- literal written here would freeze it. See the note on that in
-- 20260824200000_hr_on_duty_leave_uncapped.sql.
--
-- Idempotent: a second run finds no approved Casual Leave and exits quietly.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hr_leave_applications_backup_20260824_cl
  (LIKE public.hr_leave_applications);

COMMENT ON TABLE public.hr_leave_applications_backup_20260824_cl IS
  'Snapshot of the approved Casual Leave application removed on 2026-08-24 by 20260824300000, together with its balance and attendance reversal. Unlike the unapproved purge, this one had moved real state.';

REVOKE ALL ON TABLE public.hr_leave_applications_backup_20260824_cl FROM PUBLIC, anon;

DO $$
DECLARE
  v_app          record;
  v_count        int;
  v_used_now     numeric;
  v_from_apps    numeric;
  v_locked       int;
  v_reverted     int;
  v_absent_id    uuid;
  v_deleted      int;
  v_used_after   numeric;
  v_still_leave  int;
BEGIN
  SELECT count(*) INTO v_count
    FROM hr_leave_applications a
    JOIN hr_leave_types lt ON lt.id = a.leave_type_id
   WHERE lt.leave_type_code = 'CL' AND a.status = 'approved';

  IF v_count = 0 THEN
    RAISE NOTICE 'No approved Casual Leave remains — already done.';
    RETURN;
  END IF;

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly 1 approved Casual Leave, found %. More approvals have landed since this was written; re-scope before running.', v_count;
  END IF;

  SELECT a.* INTO v_app
    FROM hr_leave_applications a
    JOIN hr_leave_types lt ON lt.id = a.leave_type_id
   WHERE lt.leave_type_code = 'CL' AND a.status = 'approved';

  -- trg_hla_block_locked_period fires on DELETE too and would abort mid-way.
  SELECT count(*) INTO v_locked
    FROM staff s
   WHERE s.id = v_app.employee_id
     AND EXISTS (
       SELECT 1 FROM hr_attendance_periods ap
        WHERE ap.institution_id = s.institution_id
          AND ap.status = 'locked'
          AND make_date(ap.period_year, ap.period_month, 1) <= v_app.end_date
          AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > v_app.start_date
     );
  IF v_locked > 0 THEN
    RAISE EXCEPTION 'The application falls in a LOCKED attendance month; unlock it before purging.';
  END IF;

  -- ── Guard the balance decrement ─────────────────────────────────────────
  SELECT b.used INTO v_used_now
    FROM hr_leave_balances b
   WHERE b.employee_id = v_app.employee_id
     AND b.leave_type_id = v_app.leave_type_id
     AND b.hr_academic_year_id = v_app.hr_academic_year_id;

  SELECT COALESCE(sum(a2.total_days), 0) INTO v_from_apps
    FROM hr_leave_applications a2
   WHERE a2.employee_id = v_app.employee_id
     AND a2.leave_type_id = v_app.leave_type_id
     AND a2.hr_academic_year_id = v_app.hr_academic_year_id
     AND a2.status = 'approved';

  -- If `used` exceeds what approvals account for, the surplus is seeded June
  -- consumption and must survive. Refuse rather than guess which part is which.
  IF v_used_now IS NOT NULL AND v_used_now <> v_from_apps THEN
    RAISE EXCEPTION
      'Balance used = % but approved applications total % for this staff/type/year. The difference is seeded June-2026 opening consumption; decrementing blind would destroy it.',
      v_used_now, v_from_apps;
  END IF;

  INSERT INTO public.hr_leave_applications_backup_20260824_cl
  SELECT * FROM hr_leave_applications WHERE id = v_app.id;

  -- ── 1. Revert attendance to the status recorded before the flip ─────────
  SELECT id INTO v_absent_id
    FROM hr_attendance_status_types
   WHERE code = 'ABSENT' AND institution_id IS NULL
   LIMIT 1;

  -- Append the reversal to the audit trail before changing anything.
  INSERT INTO hr_attendance_audit_log (
    attendance_record_id, employee_id, institution_id, actor_id, action,
    before_state, after_state, reason, created_at
  )
  SELECT r.id, r.employee_id, r.institution_id, v_app.final_approver_id, 'recompute',
         jsonb_build_object('status_type_id', r.status_type_id),
         jsonb_build_object('status_type_id', (l.before_state->>'status_type_id')::uuid,
                            'reverted_leave_application_id', v_app.id),
         'Approved leave purged (20260824300000); restored the status recorded before the approval flipped it',
         now()
    FROM hr_attendance_records r
    JOIN hr_attendance_audit_log l
      ON l.attendance_record_id = r.id
     AND l.after_state->>'leave_application_id' = v_app.id::text
   WHERE r.employee_id = v_app.employee_id
     AND r.work_date BETWEEN v_app.start_date AND v_app.end_date;

  UPDATE hr_attendance_records r
     SET status_type_id = COALESCE((l.before_state->>'status_type_id')::uuid, v_absent_id),
         recomputed_from_event_id = NULL,
         updated_at = now()
    FROM hr_attendance_audit_log l
   WHERE l.attendance_record_id = r.id
     AND l.after_state->>'leave_application_id' = v_app.id::text
     AND r.employee_id = v_app.employee_id
     AND r.work_date BETWEEN v_app.start_date AND v_app.end_date;
  GET DIAGNOSTICS v_reverted = ROW_COUNT;

  -- ── 2. Give the days back to the ledger ─────────────────────────────────
  UPDATE hr_leave_balances b
     SET used = GREATEST(0, b.used - v_app.total_days),
         updated_at = now()
   WHERE b.employee_id = v_app.employee_id
     AND b.leave_type_id = v_app.leave_type_id
     AND b.hr_academic_year_id = v_app.hr_academic_year_id;

  -- ── 3. Remove the application ───────────────────────────────────────────
  DELETE FROM hr_leave_applications WHERE id = v_app.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'Expected to delete 1 application, deleted %.', v_deleted;
  END IF;

  -- ── Verify all three ────────────────────────────────────────────────────
  SELECT COALESCE(b.used, 0) INTO v_used_after
    FROM hr_leave_balances b
   WHERE b.employee_id = v_app.employee_id
     AND b.leave_type_id = v_app.leave_type_id
     AND b.hr_academic_year_id = v_app.hr_academic_year_id;

  IF v_used_after IS DISTINCT FROM GREATEST(0, COALESCE(v_used_now, 0) - v_app.total_days) THEN
    RAISE EXCEPTION 'Balance did not land where expected: % (was %, less % days).',
      v_used_after, v_used_now, v_app.total_days;
  END IF;

  SELECT count(*) INTO v_still_leave
    FROM hr_attendance_records r
    JOIN hr_attendance_status_types st ON st.id = r.status_type_id
   WHERE r.employee_id = v_app.employee_id
     AND r.work_date BETWEEN v_app.start_date AND v_app.end_date
     AND st.code IN ('LEAVE', 'HALF_DAY');

  IF v_still_leave > 0 THEN
    RAISE EXCEPTION '% attendance day(s) still read LEAVE after the revert.', v_still_leave;
  END IF;

  RAISE NOTICE
    'Purged 1 approved Casual Leave (% days). Balance used % -> %; % attendance day(s) restored to their pre-approval status.',
    v_app.total_days, v_used_now, v_used_after, v_reverted;
END;
$$;
