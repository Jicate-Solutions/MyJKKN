-- ============================================================================
-- Retroactive correction — subdivided (practical/lab) periods publish their
-- top-level roster, so the 35 remaining roster-blind functions see history.
-- Updated: 2026-07-26 — Director ruled FULL RETROACTIVE correction, overriding
-- the forward-only premise asserted (without a recorded ruling) by PR #2401.
--
-- WHY
-- A subdivided period stores its roster in groups[].students[] and leaves the
-- top-level students[] EMPTY. 35 production functions read ONLY the top-level
-- array, so 493 learners' 16,537 lab sessions are invisible to exam-eligibility
-- aggregation, the attendance dashboards, and the CARRE/CRS/DHS/TES scorers.
--
-- PR #2401 fixed the WRITER, so every practical marked after its deploy carries
-- a correct top-level roster. This migration applies the identical shape to the
-- 302 HISTORICAL periods (2025-11-25 -> 2026-07-24), which #2401 deliberately
-- left untouched. After this runs, history and future have the same shape and
-- no function needs editing.
--
-- MEASURED EFFECT (production, read-only, 2026-07-26)
--   4,954 learners | 487 change | 290 up, 197 down
--   best gain +2.94pp | worst drop -10.22pp
--   6 learners GAIN exam eligibility | 2 LOSE it | 0 cross the 65% floor
-- The 8 band-crossers are listed for the Registrar in the accompanying note.
--
-- NO DOUBLE COUNTING
-- Verified on all 302 periods: flattening groups[] yields 0 duplicate
-- student_ids (periods_with_dupes=0). The guard below re-asserts this at apply
-- time and ABORTS rather than silently choosing a winner. Consumers read the
-- top-level array INSTEAD of flattening groups[] (fn_attendance_slot_students
-- returns top-level when non-empty), never in addition to it.
--
-- REVERSIBLE
-- groups[] is left untouched, so the rollback is to set the mirrored periods'
-- students[] back to '[]'. Only 'updated_at' changes irreversibly.
-- ============================================================================

DO $$
DECLARE
  v_dupes   int;
  v_before  int;
  v_rows    int;
  v_after   int;
BEGIN
  -- Guard: the flatten must be injective, or we would double-count sessions.
  SELECT count(*) INTO v_dupes
  FROM student_attendance sa, jsonb_each(sa.attendance_data) p
  WHERE jsonb_typeof(p.value) = 'object'
    AND jsonb_typeof(p.value -> 'groups') = 'array'
    AND jsonb_array_length(COALESCE(p.value -> 'students', '[]'::jsonb)) = 0
    AND jsonb_array_length(public.fn_attendance_slot_students(p.value))
        <> (SELECT count(DISTINCT st ->> 'student_id')
              FROM jsonb_array_elements(public.fn_attendance_slot_students(p.value)) st);

  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      'ABORT: % subdivided period(s) flatten to duplicate student_ids. Backfilling would double-count their sessions. Dedupe policy must be decided before this migration runs.',
      v_dupes;
  END IF;

  SELECT count(*) INTO v_before
  FROM student_attendance sa, jsonb_each(sa.attendance_data) p
  WHERE jsonb_typeof(p.value) = 'object'
    AND jsonb_typeof(p.value -> 'groups') = 'array'
    AND jsonb_array_length(COALESCE(p.value -> 'students', '[]'::jsonb)) = 0;

  -- Mirror groups[].students[] into the top-level roster, per period.
  -- Idempotent: only periods whose top-level roster is empty are rewritten.
  UPDATE student_attendance sa
  SET attendance_data = (
        SELECT jsonb_object_agg(
                 p.key,
                 CASE
                   WHEN jsonb_typeof(p.value) = 'object'
                    AND jsonb_typeof(p.value -> 'groups') = 'array'
                    AND jsonb_array_length(COALESCE(p.value -> 'students', '[]'::jsonb)) = 0
                   THEN jsonb_set(p.value, '{students}',
                                  public.fn_attendance_slot_students(p.value))
                   ELSE p.value
                 END)
          FROM jsonb_each(sa.attendance_data) p)
  WHERE EXISTS (
    SELECT 1 FROM jsonb_each(sa.attendance_data) p
    WHERE jsonb_typeof(p.value) = 'object'
      AND jsonb_typeof(p.value -> 'groups') = 'array'
      AND jsonb_array_length(COALESCE(p.value -> 'students', '[]'::jsonb)) = 0);

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  SELECT count(*) INTO v_after
  FROM student_attendance sa, jsonb_each(sa.attendance_data) p
  WHERE jsonb_typeof(p.value) = 'object'
    AND jsonb_typeof(p.value -> 'groups') = 'array'
    AND jsonb_array_length(COALESCE(p.value -> 'students', '[]'::jsonb)) = 0;

  RAISE NOTICE 'backfill: % day-rows touched | empty subdivided periods % -> %',
    v_rows, v_before, v_after;

  IF v_after <> 0 THEN
    RAISE EXCEPTION 'ABORT: % subdivided period(s) still empty after backfill', v_after;
  END IF;
END $$;
