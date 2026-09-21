-- ============================================================================
-- 3924-first-present-activation.sql
--
-- 🛑 NOT RUN by the lane. Rolls back. The desk runs it only with the
--    Director's word.
--
-- Proves, against TODAY's production triggers, the three things repair round 1
-- of PR #3924 claims, WITHOUT persisting anything:
--
--   A  an activation that fails does NOT reject the attendance save,
--      and the failure is recorded in public.learner_activation_failures
--   B  the audit row names the reason, the attendance record and who marked it
--   C  an UPDATE that does not move somebody INTO Present activates nobody
--
-- HOW IT REPORTS. Everything is gathered into one JSONB and thrown as the
-- message of a deliberate exception, so the whole run is visible in the error
-- text of a single Management-API call and CANNOT commit. The final ROLLBACK is
-- belt-and-braces: the RAISE has already aborted the transaction.
--
--   Expect the call to FAIL with:  REPORT {"a_attendance_saved": true, …}
--   That failure IS the result. A clean success would mean the RAISE never ran.
--
-- WHAT IT TOUCHES. It creates one throwaway learner, one throwaway attendance
-- row and (via the trigger) at most one status-history row and one failure row,
-- all inside the aborted transaction. It reads nothing about real people and
-- changes nothing about them. Run it on a database where
-- 20260821030000 + 20260919005000 + 20260919010000 are applied.
-- ============================================================================

BEGIN;

-- ── Apply the migrations under test, in order ───────────────────────────────
-- Uncomment these two \ir lines when rehearsing on a database that does NOT yet
-- carry them. On production they are already applied (or are being applied in
-- the same aborted transaction by the desk), so they are left commented so the
-- script measures what is LIVE rather than what this branch happens to contain.
--
-- \ir ../../supabase/migrations/20260919005000_harden_first_present_activation.sql
-- \ir ../../supabase/migrations/20260919010000_enable_activate_learner_on_first_present.sql

DO $rehearsal$
DECLARE
  -- Fixture ids, fixed so a failure names a row rather than a random uuid.
  k_learner_a  constant uuid := '3924aaaa-0000-4000-8000-000000000001';
  k_learner_b  constant uuid := '3924aaaa-0000-4000-8000-000000000002';
  k_ghost      constant uuid := '3924aaaa-0000-4000-8000-0000000000ff';

  v_inst       uuid;
  v_section    uuid;
  v_timetable  uuid;
  v_marker     uuid;
  v_att_1      uuid;
  v_att_2      uuid;

  v_report     jsonb;
  v_hist       record;
  v_fail       record;
  v_saved      boolean;
  v_status_a   text;
  v_status_b   text;
  v_template   public.learners_profiles;
  v_row        public.learners_profiles;
  v_date       date;
  v_date_b     date;
BEGIN
  -- Borrow real-but-arbitrary scope ids so no FK anywhere can complain. These
  -- are READ ONLY; nothing about them is modified.
  -- 2026-09-22: scope ids are taken FROM THE CLONED LEARNER'S OWN INSTITUTION,
  -- not from the oldest institution. Production runs
  -- validate_learner_admission_year_scope(), which refuses a learner whose
  -- admission_year_id belongs to another institution — and the clone keeps the
  -- template's admission_year_id. Picking the institution first (first rehearsal,
  -- 2026-09-22 05:22 IST, rolled back) raised 23514 before any of A/B/C could run.
  SELECT id INTO v_marker    FROM public.profiles WHERE is_active ORDER BY created_at LIMIT 1;

  -- ── Two throwaway learners at `admitted` ─────────────────────────────────
  -- Cloned from a real row and then overridden field by field, so every NOT
  -- NULL column on a 90-column table is satisfied without this script having to
  -- know the whole table. The clone is READ; the original is never modified.
  SELECT * INTO v_template
    FROM public.learners_profiles
   WHERE lifecycle_status::text = 'admitted'
     AND institution_id IS NOT NULL
     AND section_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.timetables tx WHERE tx.institution_id = learners_profiles.institution_id)
   ORDER BY created_at LIMIT 1;

  -- The learner keeps its OWN institution and section. validate_learner_semester_year_scope()
  -- also refuses a section that belongs to another programme, so overriding either field on the
  -- clone is what breaks, not the change under test (second rehearsal, 2026-09-22, rolled back).
  v_inst    := v_template.institution_id;
  -- A free date for this section. student_attendance carries
  -- idx_unique_consolidated_attendance_record (institution, timetable, section, date),
  -- so CURRENT_DATE collides with the real register whenever attendance was taken today
  -- (fourth rehearsal, 2026-09-22, rolled back: 23505). Walk back from today until free.
  v_section := v_template.section_id;
  SELECT id INTO v_timetable FROM public.timetables WHERE section_id = v_section ORDER BY created_at LIMIT 1;
  IF v_timetable IS NULL THEN
    SELECT id INTO v_timetable FROM public.timetables WHERE institution_id = v_inst ORDER BY created_at LIMIT 1;
  END IF;

  v_date := CURRENT_DATE;
  WHILE EXISTS (SELECT 1 FROM public.student_attendance
                 WHERE institution_id = v_inst AND timetable_id = v_timetable
                   AND section_id = v_section AND attendance_date = v_date) LOOP
    v_date := v_date - 1;
  END LOOP;

  -- The B/C cases write a SECOND consolidated row for the same section, so it
  -- needs its own free date under the same unique index.
  v_date_b := v_date - 1;
  WHILE EXISTS (SELECT 1 FROM public.student_attendance
                 WHERE institution_id = v_inst AND timetable_id = v_timetable
                   AND section_id = v_section AND attendance_date = v_date_b) LOOP
    v_date_b := v_date_b - 1;
  END LOOP;

  IF v_template.id IS NULL THEN
    RAISE EXCEPTION 'REPORT %', jsonb_build_object(
      'aborted', 'no admitted learner to clone a fixture from — nothing was written');
  END IF;

  v_row := jsonb_populate_record(NULL::public.learners_profiles,
    to_jsonb(v_template) || jsonb_build_object(
      'id',               k_learner_a,
      'application_id',   NULL,
      -- learners_profiles carries two UNIQUE columns: application_id and
      -- college_email. Both are nullable, so the clone drops them rather than
      -- inventing a value that could collide with a real learner
      -- (third rehearsal, 2026-09-22, rolled back: 23505 on college_email).
      'college_email',    NULL,
      'register_number',  NULL,
      'roll_number',      NULL,
      'activated_at',     NULL,
      'lifecycle_status', 'admitted',
      'section_id',       v_section,
      'institution_id',   v_inst));
  INSERT INTO public.learners_profiles SELECT (v_row).*;

  v_row := jsonb_populate_record(NULL::public.learners_profiles,
    to_jsonb(v_row) || jsonb_build_object('id', k_learner_b));
  INSERT INTO public.learners_profiles SELECT (v_row).*;

  -- ── 🅰️ A FAILING ACTIVATION MUST NOT LOSE THE MARKED ATTENDANCE ────────────
  -- auth.uid() is forced to an id with no `profiles` row, so the audit row's
  -- changed_by FK violates INSIDE the AFTER trigger — the exact shape that used
  -- to roll the attendance INSERT back.
  PERFORM set_config('request.jwt.claim.sub', k_ghost::text, true);

  INSERT INTO public.student_attendance
    (attendance_date, institution_id, timetable_id, section_id, attendance_data)
  VALUES
    (v_date, v_inst, v_timetable, v_section,
     jsonb_build_object('P1', jsonb_build_object(
       -- The marker lives HERE, in the payload — student_attendance has no
       -- marked_by column. This is the shape the marking screens write.
       'marked_by_details', jsonb_build_object('marker_id', v_marker::text),
       'students',
       jsonb_build_array(jsonb_build_object('status','Present','student_id', k_learner_a::text)))))
  RETURNING id INTO v_att_1;

  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT EXISTS (SELECT 1 FROM public.student_attendance WHERE id = v_att_1) INTO v_saved;
  SELECT lifecycle_status::text INTO v_status_a FROM public.learners_profiles WHERE id = k_learner_a;
  SELECT * INTO v_fail FROM public.learner_activation_failures
   WHERE student_attendance_id = v_att_1 ORDER BY occurred_at DESC LIMIT 1;

  -- ── 🅱️ THE NORMAL PATH, AND WHAT THE AUDIT ROW SAYS ──────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_marker::text, true);

  INSERT INTO public.student_attendance
    (attendance_date, institution_id, timetable_id, section_id, attendance_data)
  VALUES
    (v_date_b, v_inst, v_timetable, v_section,
     jsonb_build_object('P1', jsonb_build_object(
       'marked_by_details', jsonb_build_object('marker_id', v_marker::text),
       'students',
       jsonb_build_array(
         jsonb_build_object('status','Present','student_id', k_learner_b::text),
         jsonb_build_object('status','Absent', 'student_id', k_learner_a::text)))))
  RETURNING id INTO v_att_2;

  SELECT * INTO v_hist FROM public.learners_profile_status_history
   WHERE learner_id = k_learner_b AND reason_code = 'first_present_attendance'
   ORDER BY changed_at DESC LIMIT 1;

  -- ── 🅲 AN EDIT THAT MOVES NOBODY INTO PRESENT ACTIVATES NOBODY ────────────
  -- learner_b is already Present on this row. The edit flips learner_a from
  -- Absent to Present. learner_a must activate; learner_b must not be touched
  -- again (it already is active), and — the real claim — nobody who was ALREADY
  -- present is re-processed.
  UPDATE public.student_attendance
     SET attendance_data = jsonb_build_object('P1', jsonb_build_object(
           'marked_by_details', jsonb_build_object('marker_id', v_marker::text),
           'students',
           jsonb_build_array(
             jsonb_build_object('status','Present','student_id', k_learner_b::text),
             jsonb_build_object('status','Present','student_id', k_learner_a::text))))
   WHERE id = v_att_2;

  SELECT lifecycle_status::text INTO v_status_b FROM public.learners_profiles WHERE id = k_learner_b;

  PERFORM set_config('request.jwt.claim.sub', '', true);

  v_report := jsonb_build_object(
    -- A
    'a_attendance_saved_despite_failure',  v_saved,
    'a_learner_left_unactivated',          v_status_a,
    'a_failure_row_written',               (v_fail.id IS NOT NULL),
    'a_failure_sqlstate',                  v_fail.sqlstate,
    'a_failure_learner_ids',               to_jsonb(v_fail.learner_ids),
    'a_failure_marked_by_recorded',        (v_fail.marked_by IS NOT NULL),
    -- B
    'b_reason_code',                       v_hist.reason_code,
    'b_from_to',                           coalesce(v_hist.from_status::text,'?') || '->' || coalesce(v_hist.to_status::text,'?'),
    'b_attendance_ref',                    (v_hist.metadata ->> 'student_attendance_id'),
    'b_attendance_ref_matches',            ((v_hist.metadata ->> 'student_attendance_id') = v_att_2::text),
    'b_marked_by_in_metadata',             (v_hist.metadata ->> 'marked_by'),
    'b_marked_by_matches_payload',         ((v_hist.metadata ->> 'marked_by') = v_marker::text),
    'b_marked_by_source',                  (v_hist.metadata ->> 'marked_by_source'),
    -- The round-3 check: the trigger must read only columns this database has.
    'b_trigger_reads_only_real_columns',   NOT EXISTS (
      SELECT 1
      FROM (SELECT DISTINCT lower(m[1]) AS ref
            FROM regexp_matches(
              pg_get_functiondef('public.fn_activate_learner_on_first_present()'::regprocedure),
              '\m(?:NEW|OLD)\.([a-zA-Z_][a-zA-Z0-9_]*)', 'g') AS m) r
      WHERE r.ref NOT IN (SELECT lower(column_name) FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'student_attendance')),
    'b_changed_by',                        v_hist.changed_by,
    'b_fee_thresholds_bypassed',           (v_hist.metadata -> 'fee_thresholds_bypassed'),
    -- C
    'c_newly_present_learner_activated',   (SELECT lifecycle_status::text FROM public.learners_profiles WHERE id = k_learner_a),
    'c_already_present_learner_status',    v_status_b,
    -- The real C claim: the learner who was ALREADY present on this row was not
    -- re-processed by the edit. Exactly one history row, never two.
    'c_already_present_learner_history_rows',
      (SELECT count(*) FROM public.learners_profile_status_history
        WHERE learner_id = k_learner_b AND reason_code = 'first_present_attendance'),
    'c_history_rows_total_for_fixture',
      (SELECT count(*) FROM public.learners_profile_status_history
        WHERE learner_id IN (k_learner_a, k_learner_b)),
    -- context
    'policy_enabled_now',                  public.fn_get_policy_bool('learners.activate_on_first_present.enabled', false, NULL),
    'trigger_installed',                   EXISTS (
        SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'student_attendance'
          AND t.tgname = 'trg_activate_learner_on_first_present' AND NOT t.tgisinternal),
    'hardened_body_installed',
      position('learner_activation_failures' in
        pg_get_functiondef('public.fn_activate_learner_on_first_present()'::regprocedure)) > 0
  );

  -- The whole point. This aborts the transaction and hands back every value.
  RAISE EXCEPTION 'REPORT %', v_report;
END
$rehearsal$;

-- Unreachable while the RAISE above stands; kept so the file is safe to edit.
ROLLBACK;
