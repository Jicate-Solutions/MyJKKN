-- ============================================================================
-- SECURITY — revoke anon from unprotected leftover backup tables
-- File: 20260726180000_revoke_anon_on_unprotected_backup_tables.sql
-- Date: 2026-07-26
--
-- WHAT WAS FOUND (verified live on prod, 2026-07-26, over HTTPS)
--   37 tables in schema public have RLS DISABLED and carry Supabase's default
--   grants to `anon`. `anon` is the public key embedded in every page of
--   https://www.jkkn.ai, so PostgREST serves these tables to anyone on the
--   internet. Confirmed empirically, not inferred:
--
--     GET /rest/v1/_bak_hostel_allocations_20260612?select=*
--         apikey: <public anon key>
--     -> HTTP 200, content-range 0-0/67
--
--   Across the 37 tables that is 2,702 rows of REAL learner data — hostel
--   allocations, learner fee categories, billing bills, staff role keys and
--   academic-year rollbacks. `anon` holds SELECT **and INSERT, UPDATE and
--   DELETE on all 37** (has_table_privilege, live). So the data is not merely
--   readable by the public: it is deletable by the public.
--
-- WHY IT HAPPENED
--   Almost all of these are repair-migration leftovers (`_bak_*`,
--   `*_rollback_*`, `_archive_*`) created with plain CREATE TABLE AS. That
--   inherits Supabase's ALTER DEFAULT PRIVILEGES grant to anon and does NOT
--   enable RLS, so every one shipped open. The CLAUDE.md rule requiring an
--   explicit REVOKE on every new table exists precisely for this. The live
--   production tables these were copied FROM are correctly protected — only
--   the copies leak.
--
-- WHAT THIS DOES
--   1. REVOKE ALL FROM anon, PUBLIC on each table (the actual fix — this is
--      what PostgREST checks).
--   2. ENABLE ROW LEVEL SECURITY on each as defence in depth. No policies are
--      added, so the tables become deny-all for anon and authenticated while
--      service_role and the owner still reach them (RLS is bypassed for those).
--      Verified safe: NOT ONE of these tables is referenced by any file under
--      app/, lib/ or components/. They are backups, not features.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   It does NOT drop the tables. They are somebody's rollback safety net and
--   deleting data is not this migration's call — it only closes public access.
--   Whether these stale backups should still exist is a separate decision.
--
--   It also does NOT touch the ~1,300 other tables that carry anon grants but
--   DO have RLS enabled. Those are not exposed (RLS denies the rows) and a
--   blanket revoke risks breaking intentionally-public reads such as the
--   community/caste lists on the unauthenticated admission landing page.
-- ============================================================================

REVOKE ALL ON TABLE public.nullay_to_2026_rollback_20260724 FROM anon, PUBLIC;
ALTER TABLE public.nullay_to_2026_rollback_20260724 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pharmacy_ay_rollback_20260724 FROM anon, PUBLIC;
ALTER TABLE public.pharmacy_ay_rollback_20260724 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bds_ay_rollback_20260724 FROM anon, PUBLIC;
ALTER TABLE public.bds_ay_rollback_20260724 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ahs_ay_rollback_20260724 FROM anon, PUBLIC;
ALTER TABLE public.ahs_ay_rollback_20260724 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_hostel_waitlist_clear_20260616 FROM anon, PUBLIC;
ALTER TABLE public._bak_hostel_waitlist_clear_20260616 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_staff_role_key_20260717 FROM anon, PUBLIC;
ALTER TABLE public._bak_staff_role_key_20260717 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_hostel_waitlist_reset_20260616 FROM anon, PUBLIC;
ALTER TABLE public._bak_hostel_waitlist_reset_20260616 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_fee_structure_accommodation_retag_20260609 FROM anon, PUBLIC;
ALTER TABLE public._bak_fee_structure_accommodation_retag_20260609 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_learner_pending_cat_20260616 FROM anon, PUBLIC;
ALTER TABLE public._bak_learner_pending_cat_20260616 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._archive_cdc_exam_topic_map_20260706 FROM anon, PUBLIC;
ALTER TABLE public._archive_cdc_exam_topic_map_20260706 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_hostel_allocations_20260612 FROM anon, PUBLIC;
ALTER TABLE public._bak_hostel_allocations_20260612 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_learner_categories_20260612 FROM anon, PUBLIC;
ALTER TABLE public._bak_learner_categories_20260612 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_accommodation_types_20260610 FROM anon, PUBLIC;
ALTER TABLE public._bak_accommodation_types_20260610 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_billing_student_bills_tms_test_20260616 FROM anon, PUBLIC;
ALTER TABLE public._bak_billing_student_bills_tms_test_20260616 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_razorpay_transport_global_20260617 FROM anon, PUBLIC;
ALTER TABLE public._bak_razorpay_transport_global_20260617 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_tms_fee_structure_20260616 FROM anon, PUBLIC;
ALTER TABLE public._bak_tms_fee_structure_20260616 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_hostel_program_eligibility_20260615b FROM anon, PUBLIC;
ALTER TABLE public._bak_hostel_program_eligibility_20260615b ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_hostel_waitlist_20260612 FROM anon, PUBLIC;
ALTER TABLE public._bak_hostel_waitlist_20260612 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_hostel_program_eligibility_20260615c FROM anon, PUBLIC;
ALTER TABLE public._bak_hostel_program_eligibility_20260615c ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_fn_sync_staff_to_profiles_20260718 FROM anon, PUBLIC;
ALTER TABLE public._bak_fn_sync_staff_to_profiles_20260718 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_staff_role_phase1_20260717 FROM anon, PUBLIC;
ALTER TABLE public._bak_staff_role_phase1_20260717 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_hostel_program_eligibility_20260613 FROM anon, PUBLIC;
ALTER TABLE public._bak_hostel_program_eligibility_20260613 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_tms_fee_bill_20260616 FROM anon, PUBLIC;
ALTER TABLE public._bak_tms_fee_bill_20260616 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_tms_fee_structure_term_20260616 FROM anon, PUBLIC;
ALTER TABLE public._bak_tms_fee_structure_term_20260616 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_premium_reset_waitlist_20260617 FROM anon, PUBLIC;
ALTER TABLE public._bak_premium_reset_waitlist_20260617 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._audit_hostel_program_eligibility FROM anon, PUBLIC;
ALTER TABLE public._audit_hostel_program_eligibility ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_mess_upgrade_bills_20260616 FROM anon, PUBLIC;
ALTER TABLE public._bak_mess_upgrade_bills_20260616 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_hod_fix_20260717 FROM anon, PUBLIC;
ALTER TABLE public._bak_hod_fix_20260717 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_hostel_categories_threshold_20260615 FROM anon, PUBLIC;
ALTER TABLE public._bak_hostel_categories_threshold_20260615 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_premium_upgrade_cancel_20260616 FROM anon, PUBLIC;
ALTER TABLE public._bak_premium_upgrade_cancel_20260616 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_premium_reset_learner_cat_20260617 FROM anon, PUBLIC;
ALTER TABLE public._bak_premium_reset_learner_cat_20260617 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_room_upgrade_bills_20260616 FROM anon, PUBLIC;
ALTER TABLE public._bak_room_upgrade_bills_20260616 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_tms_fee_generation_run_20260616 FROM anon, PUBLIC;
ALTER TABLE public._bak_tms_fee_generation_run_20260616 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_hostel_program_eligibility_20260615 FROM anon, PUBLIC;
ALTER TABLE public._bak_hostel_program_eligibility_20260615 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._bak_released_beds_20260616 FROM anon, PUBLIC;
ALTER TABLE public._bak_released_beds_20260616 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tms_attendance_window FROM anon, PUBLIC;
ALTER TABLE public.tms_attendance_window ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.timetable_deactivate_rollback_20260724 FROM anon, PUBLIC;
ALTER TABLE public.timetable_deactivate_rollback_20260724 ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Apply-time assert — fail loudly rather than leaving anything public.
-- ----------------------------------------------------------------------------
DO $assert$
DECLARE v_open int;
BEGIN
  SELECT count(*) INTO v_open
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname = ANY (ARRAY['nullay_to_2026_rollback_20260724', 'pharmacy_ay_rollback_20260724', 'bds_ay_rollback_20260724', 'ahs_ay_rollback_20260724', '_bak_hostel_waitlist_clear_20260616', '_bak_staff_role_key_20260717', '_bak_hostel_waitlist_reset_20260616', '_bak_fee_structure_accommodation_retag_20260609', '_bak_learner_pending_cat_20260616', '_archive_cdc_exam_topic_map_20260706', '_bak_hostel_allocations_20260612', '_bak_learner_categories_20260612', '_bak_accommodation_types_20260610', '_bak_billing_student_bills_tms_test_20260616', '_bak_razorpay_transport_global_20260617', '_bak_tms_fee_structure_20260616', '_bak_hostel_program_eligibility_20260615b', '_bak_hostel_waitlist_20260612', '_bak_hostel_program_eligibility_20260615c', '_bak_fn_sync_staff_to_profiles_20260718', '_bak_staff_role_phase1_20260717', '_bak_hostel_program_eligibility_20260613', '_bak_tms_fee_bill_20260616', '_bak_tms_fee_structure_term_20260616', '_bak_premium_reset_waitlist_20260617', '_audit_hostel_program_eligibility', '_bak_mess_upgrade_bills_20260616', '_bak_hod_fix_20260717', '_bak_hostel_categories_threshold_20260615', '_bak_premium_upgrade_cancel_20260616', '_bak_premium_reset_learner_cat_20260617', '_bak_room_upgrade_bills_20260616', '_bak_tms_fee_generation_run_20260616', '_bak_hostel_program_eligibility_20260615', '_bak_released_beds_20260616', 'tms_attendance_window', 'timetable_deactivate_rollback_20260724'])
     -- OID form, NOT the text form: has_table_privilege(role, text, ...)
     -- resolves the name through search_path, and Postgres does not guarantee
     -- it is evaluated AFTER the nspname filter. With the text form this assert
     -- errors out on a same-named table in another schema (hit live during
     -- validation: storage.s3_multipart_uploads -> "public.s3_multipart_uploads
     -- does not exist"). c.oid cannot misresolve.
     AND (has_table_privilege('anon', c.oid, 'SELECT') OR NOT c.relrowsecurity);
  IF v_open > 0 THEN
    RAISE EXCEPTION 'still % table(s) readable by anon or without RLS after the revoke', v_open;
  END IF;
END $assert$;

NOTIFY pgrst, 'reload schema';
