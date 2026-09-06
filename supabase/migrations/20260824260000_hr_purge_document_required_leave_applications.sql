-- =============================================================================
-- 20260824260000_hr_purge_document_required_leave_applications.sql
--
-- Removes every leave application filed against a leave type that requires a
-- supporting document, across all organisations. 46 rows: On-Duty (39) and
-- Half Pay Leave (7), spread over five colleges.
--
-- WHY
-- ---
-- Both types have carried requires_documents = true for months, but the Apply
-- Leave drawer never asked for the file and the server never checked — so every
-- one of these 46 was filed with no document at all (verified: zero rows carry
-- a non-empty documents array). They are the backlog from before the
-- requirement was actually enforced. The enforcement landed in e1e241e79, so
-- this cannot recur; this migration clears what accumulated behind it.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ----------------------------------
-- It does not touch hr_leave_balances, and it does not touch attendance.
-- Both were checked rather than assumed, and both are already correct:
--
--   BALANCES. trg_hla_balance_update fires on UPDATE only — a leave application
--   consumes balance when it is APPROVED, not when it is submitted. None of
--   these 46 was ever approved (45 pending, 1 withdrawn), so none ever
--   incremented `used`. Verified across all 1,076 On-Duty and 1,076 Half Pay
--   Leave balance rows: used = 0 and carried_forward = 0 on every one. Writing
--   a "correction" here would corrupt correct data, so the DO block below
--   ASSERTS the totals are unchanged instead of adjusting them.
--
--   ATTENDANCE / BIOMETRIC. fn_recompute_attendance_on_leave_approval only
--   fires on the transition into 'approved', so no day was ever flipped to
--   LEAVE by these rows — confirmed three ways: zero hr_attendance_audit_log
--   entries reference any of the 46, zero attendance rows list one in
--   excused_by_application_ids, and every one of the 20 overlapping days has
--   recomputed_from_event_id IS NULL. Those 20 days read 17 ABSENT (device A),
--   1 HALF_DAY (device P) and 2 WEEKLY_OFF (device A) — each already agreeing
--   with the raw biometric verdict in device_status. There is nothing to
--   re-derive.
--
-- THE TRIGGER THAT CAN BLOCK THIS
-- -------------------------------
-- trg_hla_block_locked_period fires on INSERT, DELETE and UPDATE, and raises
-- P0001 for any request overlapping a LOCKED attendance month — a DELETE is not
-- exempt. Checked: 0 of the 46 overlap a locked period. If that changes before
-- this runs, the migration fails loudly rather than half-deleting.
--
-- SAFETY
-- ------
-- Every row is copied to hr_leave_applications_backup_20260824 first, in the
-- same transaction, following the precedent set by the Short Time Off reset
-- (hr_leave_applications_backup_20260728). The DO block refuses to proceed
-- unless the world still looks the way it did when this was written: exactly 46
-- rows, none approved, none carrying a document. Idempotent — a second run
-- finds nothing left and exits quietly.
-- =============================================================================

-- Full-fidelity snapshot, including the columns nothing else records.
CREATE TABLE IF NOT EXISTS public.hr_leave_applications_backup_20260824
  (LIKE public.hr_leave_applications);

COMMENT ON TABLE public.hr_leave_applications_backup_20260824 IS
  'Snapshot of the 46 On-Duty / Half Pay Leave applications purged on 2026-08-24 by 20260824260000. All were filed before the supporting-document requirement was enforced and carried no document. None was ever approved, so no balance or attendance state moved with them.';

REVOKE ALL ON TABLE public.hr_leave_applications_backup_20260824 FROM PUBLIC, anon;

DO $$
DECLARE
  v_target       int;
  v_approved     int;
  v_with_docs    int;
  v_locked       int;
  v_backed_up    int;
  v_deleted      int;
  v_used_before  numeric;
  v_used_after   numeric;
  v_att_before   int;
  v_att_after    int;
BEGIN
  SELECT count(*) FILTER (WHERE true),
         count(*) FILTER (WHERE a.status = 'approved'),
         count(*) FILTER (WHERE jsonb_array_length(COALESCE(a.documents, '[]'::jsonb)) > 0)
    INTO v_target, v_approved, v_with_docs
    FROM hr_leave_applications a
    JOIN hr_leave_types lt ON lt.id = a.leave_type_id
   WHERE lt.requires_documents;

  IF v_target = 0 THEN
    RAISE NOTICE 'Nothing to purge — already clear.';
    RETURN;
  END IF;

  -- Refuse on a world that has moved. A purge that silently takes 300 rows
  -- because someone reconfigured a leave type in the meantime is far worse
  -- than one that stops and asks.
  IF v_target <> 46 THEN
    RAISE EXCEPTION
      'Expected 46 applications on document-requiring leave types, found %. Re-check the scope before purging.', v_target;
  END IF;

  -- An approved row HAS moved balance and attendance. This migration reverts
  -- neither, so it must not be the thing that deletes one.
  IF v_approved > 0 THEN
    RAISE EXCEPTION
      '% of these applications are APPROVED. They have consumed balance and flipped attendance days; purging them here would strand both. Handle them separately.', v_approved;
  END IF;

  -- The whole premise is that these were filed without documents. One that has
  -- a document is a legitimate post-enforcement request and is not ours to take.
  IF v_with_docs > 0 THEN
    RAISE EXCEPTION
      '% of these applications carry a supporting document and are not part of the pre-enforcement backlog.', v_with_docs;
  END IF;

  SELECT count(*) INTO v_locked
    FROM hr_leave_applications a
    JOIN hr_leave_types lt ON lt.id = a.leave_type_id
    JOIN staff s ON s.id = a.employee_id
   WHERE lt.requires_documents
     AND EXISTS (
       SELECT 1 FROM hr_attendance_periods ap
        WHERE ap.institution_id = s.institution_id
          AND ap.status = 'locked'
          AND make_date(ap.period_year, ap.period_month, 1) <= a.end_date
          AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > a.start_date
     );

  IF v_locked > 0 THEN
    RAISE EXCEPTION
      '% applications fall in a LOCKED attendance month. trg_hla_block_locked_period would abort the delete part-way; unlock the period or exclude them.', v_locked;
  END IF;

  -- Baselines for the assertions after the delete.
  SELECT COALESCE(sum(b.used), 0) INTO v_used_before
    FROM hr_leave_balances b
    JOIN hr_leave_types lt ON lt.id = b.leave_type_id
   WHERE lt.requires_documents;

  SELECT count(*) INTO v_att_before
    FROM hr_attendance_records r
   WHERE r.recomputed_from_event_id IS NOT NULL;

  INSERT INTO public.hr_leave_applications_backup_20260824
  SELECT a.*
    FROM hr_leave_applications a
    JOIN hr_leave_types lt ON lt.id = a.leave_type_id
   WHERE lt.requires_documents;
  GET DIAGNOSTICS v_backed_up = ROW_COUNT;

  IF v_backed_up <> v_target THEN
    RAISE EXCEPTION 'Backed up % of % rows. Refusing to delete without a complete snapshot.', v_backed_up, v_target;
  END IF;

  DELETE FROM hr_leave_applications a
   USING hr_leave_types lt
   WHERE lt.id = a.leave_type_id
     AND lt.requires_documents;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> v_target THEN
    RAISE EXCEPTION 'Deleted % rows, expected %.', v_deleted, v_target;
  END IF;

  -- Prove the two things this migration promised NOT to disturb.
  SELECT COALESCE(sum(b.used), 0) INTO v_used_after
    FROM hr_leave_balances b
    JOIN hr_leave_types lt ON lt.id = b.leave_type_id
   WHERE lt.requires_documents;

  SELECT count(*) INTO v_att_after
    FROM hr_attendance_records r
   WHERE r.recomputed_from_event_id IS NOT NULL;

  IF v_used_after IS DISTINCT FROM v_used_before THEN
    RAISE EXCEPTION 'Leave balance `used` moved from % to %. Nothing here should have written to it.', v_used_before, v_used_after;
  END IF;

  IF v_att_after IS DISTINCT FROM v_att_before THEN
    RAISE EXCEPTION 'Leave-recomputed attendance rows moved from % to %.', v_att_before, v_att_after;
  END IF;

  RAISE NOTICE
    'Purged % applications (backed up to hr_leave_applications_backup_20260824). Balance used unchanged at %; leave-recomputed attendance rows unchanged at %.',
    v_deleted, v_used_after, v_att_after;
END;
$$;
