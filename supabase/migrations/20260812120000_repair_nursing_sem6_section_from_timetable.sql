-- 2026-08-05: repair the Nursing BSC Semester-6 cohort left unresolvable by the
-- 2026-07-31 section repair (20260731100000_repair_learner_section_cross_institution.sql).
--
-- HOW IT SURFACED: Ms Sujitha S (faculty, College of Nursing) could not mark
-- attendance for period 'CNR T5' on 2026-08-05. The page logged
--   [academic/attendance/mark] No students returned - check RLS policy
-- which is a red herring: mark/page.tsx prints that on ANY zero-row roster.
-- fn_attendance_roster is SECURITY DEFINER and RAISEs 42501 on a permission
-- failure, so a real authz problem would have logged an RPC error instead. She
-- holds academic.attendance.mark = true; the roster was empty on the data.
--
-- CAUSE: her timetable (5084e383, created 2026-08-01) targets section 402dc980
--   = BSC (Nursing) / Semester 6 / 'A' at College of Nursing  -> 0 learners.
-- Her 57 learners (NB23xxx) carried
--   section_id  = 96986409  (PHARMD / '6 Year' / 'A' at College of PHARMACY)
--   semester_id = 07496f22  ('6 Year', also a Pharmacy row)
-- fn_attendance_roster filters institution_id = p_institution_id AND
-- section_id = ANY(p_section_ids); both fail, so the roster came back empty.
--
-- WHY THE JULY REPAIR SKIPPED THEM: it resolved on the key
-- (institution_id, program_id, semester_id, section_name) but used the learners'
-- OWN semester_id -- which is itself corrupt here. Nursing has no semester named
-- '6 Year', so the lookup found 0 candidates and the rows were recorded with
-- candidate_count = 0 and deliberately left alone ("True value is unknowable").
-- The repair was defeated by a second corruption sitting in its own join key.
--
-- WHY IT IS RESOLVABLE NOW: the cohort ladder for BSC (Nursing) is unambiguous
-- and the college's own timetable names the destination.
--   NB22 -> Semester 8   (acd52e34, 58 learners)
--   NB23 -> ???          (the broken set)
--   NB24 -> Semester 4   (1c0966c3, 56 learners)
--   NB25 -> Semester 2   (27d957e3, 57 learners)
-- NB23 lands on Semester 6, exactly what timetable 5084e383 targets.
--
-- SCOPE: 57 active BSC (Nursing) learners only. NOT included, on purpose:
--   * one enquiry_submitted Nursing row (089a7b8d, no roll number) pointing at an
--     ENGINEERING section -- a different defect; an enquiry-stage record should
--     carry no section at all, and its true value is still unknowable.
--   * the 20 Arts & Science (Self) M.Com 'Semester III' rows on an Aided section
--     -- same bug class, same fix shape, but a separate cohort decision.
-- Group-wide cross-institution rows: 82 -> 25.
--
-- TRIGGERS STAY ENABLED (unlike the July repair, which disabled them). Both new
-- FKs point at College of Nursing rows, so trg_validate_learner_semester_year_scope
-- passes and actively certifies the fix. No fee impact:
-- trigger_detect_fee_dimension_change reacts only to program_id / quota_id /
-- community_category_id / accommodation_type_id / admission_year_id -- section_id
-- and semester_id are not fee dimensions. Verified: 0 admission_fee_change_events
-- were created by this repair.

-- ---------------------------------------------------------------------------
-- 1. Snapshot (rollback source).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public._bak_nursing_sem6_section_repair_20260805;

CREATE TABLE public._bak_nursing_sem6_section_repair_20260805 AS
SELECT lp.id AS learner_id, lp.roll_number, lp.first_name, lp.last_name,
       lp.lifecycle_status, lp.institution_id, lp.program_id,
       lp.section_id  AS old_section_id,
       lp.semester_id AS old_semester_id,
       '402dc980-00a7-43ff-9d14-d72bc78f1ce6'::uuid AS new_section_id,
       '3d6ff9e8-5755-4fbe-bb3b-1734a2d11bec'::uuid AS new_semester_id,
       now() AS snapshot_at
FROM public.learners_profiles lp
WHERE lp.section_id     = '96986409-0288-45d8-b7db-e3a72fec35b1'  -- PHARMD '6 Year' A
  AND lp.institution_id = '70e54e51-9b98-4e07-9534-a85310609bfd'  -- College of Nursing
  AND lp.program_id     = '35412f80-1100-4be9-ba82-92111eac57fc'; -- BSC (Nursing)

-- ---------------------------------------------------------------------------
-- 2. Repair.
-- ---------------------------------------------------------------------------
UPDATE public.learners_profiles lp
SET section_id  = b.new_section_id,
    semester_id = b.new_semester_id,
    updated_at  = now()
FROM public._bak_nursing_sem6_section_repair_20260805 b
WHERE lp.id = b.learner_id
  AND lp.section_id = b.old_section_id;  -- idempotent: no-op on re-run

-- ---------------------------------------------------------------------------
-- 3. Verify: the Nursing Semester-6 section must hold the whole cohort, and the
--    Pharmacy section must keep its own PHARMD learners untouched.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_moved     int;
  v_sem6      int;
  v_leftover  int;
BEGIN
  SELECT count(*) INTO v_moved
  FROM public._bak_nursing_sem6_section_repair_20260805;

  SELECT count(*) INTO v_sem6
  FROM public.learners_profiles
  WHERE section_id = '402dc980-00a7-43ff-9d14-d72bc78f1ce6'
    AND lifecycle_status = 'active';

  SELECT count(*) INTO v_leftover
  FROM public.learners_profiles lp
  JOIN public.sections s ON s.id = lp.section_id
  WHERE lp.institution_id = '70e54e51-9b98-4e07-9534-a85310609bfd'
    AND lp.program_id     = '35412f80-1100-4be9-ba82-92111eac57fc'
    AND s.institution_id IS DISTINCT FROM lp.institution_id
    AND lp.lifecycle_status = 'active';

  IF v_sem6 <> v_moved THEN
    RAISE EXCEPTION
      'nursing sem6 repair failed: section holds % active learners, expected %',
      v_sem6, v_moved;
  END IF;

  IF v_leftover <> 0 THEN
    RAISE EXCEPTION
      'nursing sem6 repair incomplete: % active BSC (Nursing) learners still on a foreign section',
      v_leftover;
  END IF;

  RAISE NOTICE 'nursing sem6 repair OK: % learners moved to Semester 6 section A', v_moved;
END $$;
