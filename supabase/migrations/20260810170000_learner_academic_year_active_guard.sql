-- ============================================================================
-- learners_profiles.academic_year_id — repair inactive years + guard the write
-- ============================================================================
--
-- REPORTED 2026-08-10: DB22095 VISHALI T (JKKN Dental) shows academic year
--   "2025-2026 Additional 3", a year that does not appear anywhere in the
--   Academic Years screen.
--
-- The row is not missing — it is DEACTIVATED. Four duplicate Dental years
--   ("2025-2026 Additional 1/3/4", "2026-2027 Additional 2") were hand-created
--   on 2026-03-13 and 2026-03-25 with start/end dates IDENTICAL to the real
--   years, and all four were switched off in ONE update on
--   2026-07-28 08:45:19.98671 (identical updated_at on all four). Every learner
--   sitting on them was orphaned in that instant. Nothing complained.
--
-- AUDIT of all 7,215 learners_profiles rows, 2026-08-10:
--     academic_year_id NULL ................. 55   (54 are pre-enrolment
--                                                   lifecycle states — enquiry,
--                                                   admitted, rejected — where
--                                                   no academic year exists yet;
--                                                   1 genuine gap, an active
--                                                   Engineering learner)
--     dangling (id not in academic_years) ....  0   (impossible — see FK below)
--     INACTIVE academic year ................. 15   <- the defect, all Dental
--     cross-institution ......................  0   (existing guard holds)
--
-- WHY NOTHING CAUGHT IT — three layers, none checks is_active:
--   1. fk_learners_profiles_academic_year checks EXISTENCE only
--      (REFERENCES academic_years(id) ON DELETE SET NULL). This is why
--      "dangling" is structurally impossible and why only two failure modes
--      are reachable at all: inactive, or NULL.
--   2. validate_learner_semester_year_scope checks INSTITUTION SCOPE only.
--      Its academic_year_id block compares a.institution_id to the learner's
--      and never looks at a.is_active. Fixed below.
--   3. The pickers filter on read (hooks/use-academic-years.ts does
--      .eq('is_active', true)) — which constrains new CHOICES but cannot
--      display, flag or correct a stale id that is already stored. The field
--      renders blank and every unrelated save preserves the bad value.
--
--   Read-filtered / write-unguarded. Enforcement has to sit where the write
--   lands, not where the options are rendered.
--
-- A SECOND, INDEPENDENT ENTRY PATH is fixed outside this migration, in
--   lib/services/name-to-id-resolver.ts (resolveAcademicYearId): none of its
--   three name->id fallbacks filtered is_active, so a bulk sheet whose cell
--   reads "2025-2026 Additional 3" resolved straight onto the inactive row —
--   and its last-ditch fallback, ilike('%2025%') with limit(1) and NO ORDER BY,
--   matched five Dental rows with "2024-2025" (the WRONG YEAR) first.
--
-- NOT TOUCHED HERE, deliberately — the same four dead years are still
--   referenced by records with their own semantics, and moving them is a
--   different decision from repointing a learner's profile attribute:
--       student_attendance ... 30 rows (Additional 4)
--       timetables ...........  3 rows (Additional 1 / 4 / 2026-27 Add 2)
--       billing_student_bills   1 row  (Additional 4)
--       intake_history .......  1 row  (2026-2027 Additional 2)
--   This is ALSO why the four duplicates are NOT deleted: academic_years is
--   referenced by 19 tables, and timetables/intake_history are ON DELETE
--   CASCADE. Deleting the "empty" duplicates would have silently destroyed
--   3 timetables and untagged a paid bill. They stay, inactive and now
--   unreachable from both the picker and the resolver.
-- ============================================================================


-- ── 1. Snapshot before touching anything ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bak_learners_profiles_academic_year_20260810 AS
SELECT lp.id,
       lp.roll_number,
       lp.first_name,
       lp.last_name,
       lp.institution_id,
       lp.lifecycle_status,
       lp.academic_year_id           AS old_academic_year_id,
       ay.academic_year_name         AS old_academic_year_name,
       now()                         AS snapshot_at
FROM   public.learners_profiles lp
JOIN   public.academic_years    ay ON ay.id = lp.academic_year_id
WHERE  ay.is_active = false;

COMMENT ON TABLE public.bak_learners_profiles_academic_year_20260810 IS
  'Pre-repair snapshot, 2026-08-10: the 15 learners_profiles rows that pointed '
  'at a DEACTIVATED academic year (Dental "2025-2026 Additional 3"/"Additional 4"). '
  'Restore with: UPDATE learners_profiles lp SET academic_year_id = b.old_academic_year_id '
  'FROM bak_learners_profiles_academic_year_20260810 b WHERE b.id = lp.id;';

-- CREATE TABLE ... AS picks up this project's default privileges, which hand
-- `authenticated` full CRUD. RLS is on with no policies, so rows are already
-- denied — but that is one permissive policy away from exposing a snapshot of
-- learner records to every signed-in user, and the sibling snapshot from the
-- 2026-08-06 hostel repair (bak_learner_hostel_categories_male_20260806) is
-- correctly postgres + service_role only. Match it.
REVOKE ALL ON public.bak_learners_profiles_academic_year_20260810 FROM anon, authenticated;


-- ── 2. Repoint each learner onto the ACTIVE twin of the same year ──────────
--
-- Matched on (institution_id, start_date, end_date) rather than by name or by a
-- hardcoded uuid: the "Additional N" rows carry dates identical to the real
-- year, which is precisely what makes them duplicates, and a date match repairs
-- any future duplicate of this shape without editing this migration.
--
-- A learner whose inactive year has NO active same-dates twin is left ALONE
-- (the LATERAL yields no row, so the UPDATE does not match) rather than being
-- guessed at. The assertion in step 4 fails loudly if that ever happens.
--
-- Dry-run verified 2026-08-10: all 15 rows resolve to Dental "2025-2026"
-- (7847e67c-ed20-45f4-bab3-df1907c10809). 0 unmapped.
--
-- Safe against the other triggers on this table: trigger_detect_fee_dimension_change
-- fires only on program_id / quota_id / community_category_id /
-- accommodation_type_id / admission_year_id, so changing academic_year_id
-- returns early and spawns no admission_fee_change_events row.
UPDATE public.learners_profiles lp
SET    academic_year_id = tgt.id,
       updated_at       = now()
FROM   public.academic_years stale
JOIN   LATERAL (
         SELECT a.id
         FROM   public.academic_years a
         WHERE  a.institution_id = stale.institution_id
           AND  a.is_active
           AND  a.start_date     = stale.start_date
           AND  a.end_date       = stale.end_date
         ORDER  BY a.academic_year_name
         LIMIT  1
       ) tgt ON true
WHERE  lp.academic_year_id = stale.id
  AND  stale.is_active = false;


-- ── 3. Teach the scope guard about activity state ──────────────────────────
--
-- Full body reproduced (CREATE OR REPLACE cannot patch a single block). The
-- only change is the new "activity state" block after the academic-year
-- institution check; every pre-existing check is byte-identical.
CREATE OR REPLACE FUNCTION public.validate_learner_semester_year_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst   uuid;
  v_prog   uuid;
  v_active boolean;
BEGIN
  -- Cannot judge scope without an institution on the learner.
  IF NEW.institution_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.degree_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.degree_id      IS DISTINCT FROM OLD.degree_id
          OR NEW.institution_id IS DISTINCT FROM OLD.institution_id) THEN
    SELECT g.institution_id INTO v_inst
      FROM public.degrees g WHERE g.id = NEW.degree_id;
    IF FOUND AND v_inst IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION
        'degree_id % belongs to institution %, not the learner''s institution %',
        NEW.degree_id, v_inst, NEW.institution_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.department_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.department_id  IS DISTINCT FROM OLD.department_id
          OR NEW.institution_id IS DISTINCT FROM OLD.institution_id) THEN
    SELECT dp.institution_id INTO v_inst
      FROM public.departments dp WHERE dp.id = NEW.department_id;
    IF FOUND AND v_inst IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION
        'department_id % belongs to institution %, not the learner''s institution %',
        NEW.department_id, v_inst, NEW.institution_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Added 2026-08-08 — program_id had NO validation of any kind before then.
  IF NEW.program_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.program_id     IS DISTINCT FROM OLD.program_id
          OR NEW.institution_id IS DISTINCT FROM OLD.institution_id) THEN
    SELECT pr.institution_id INTO v_inst
      FROM public.programs pr WHERE pr.id = NEW.program_id;
    IF FOUND AND v_inst IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION
        'program_id % belongs to institution %, not the learner''s institution %',
        NEW.program_id, v_inst, NEW.institution_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.semester_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.semester_id     IS DISTINCT FROM OLD.semester_id
          OR NEW.institution_id  IS DISTINCT FROM OLD.institution_id) THEN
    SELECT s.institution_id INTO v_inst
      FROM public.semesters s WHERE s.id = NEW.semester_id;
    IF FOUND AND v_inst IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION
        'semester_id % belongs to institution %, not the learner''s institution %',
        NEW.semester_id, v_inst, NEW.institution_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.academic_year_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id
          OR NEW.institution_id   IS DISTINCT FROM OLD.institution_id) THEN
    SELECT a.institution_id INTO v_inst
      FROM public.academic_years a WHERE a.id = NEW.academic_year_id;
    IF FOUND AND v_inst IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION
        'academic_year_id % belongs to institution %, not the learner''s institution %',
        NEW.academic_year_id, v_inst, NEW.institution_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── activity state (added 2026-08-10) ────────────────────────────────────
  -- Institution scope was never enough. A deactivated academic year is still a
  -- real row, so the FK and every check above wave it through, while the
  -- pickers can no longer even render it — the field shows blank and the stale
  -- id survives every subsequent save. 15 Dental learners were orphaned this
  -- way by a single bulk deactivation on 2026-07-28.
  --
  -- Gated on the academic_year_id ACTUALLY CHANGING (not on institution_id, as
  -- the scope block above is): a learner already sitting on an inactive year
  -- must stay editable — including editable in order to be moved OFF it. Same
  -- reasoning that keeps every other check in this function change-gated.
  --
  -- COALESCE(..., true) is permissive on a NULL is_active: this guard blocks
  -- writes, so its failure mode must be to let a write through, never to jam
  -- the profile form on a column that is only conventionally NOT NULL.
  IF NEW.academic_year_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id) THEN
    SELECT a.is_active INTO v_active
      FROM public.academic_years a WHERE a.id = NEW.academic_year_id;
    IF FOUND AND NOT COALESCE(v_active, true) THEN
      RAISE EXCEPTION
        'academic_year_id % is an INACTIVE academic year — pick an active one',
        NEW.academic_year_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Added 2026-07-31 — the gap that let the section_id corruption survive.
  IF NEW.section_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.section_id     IS DISTINCT FROM OLD.section_id
          OR NEW.institution_id IS DISTINCT FROM OLD.institution_id) THEN
    SELECT sc.institution_id INTO v_inst
      FROM public.sections sc WHERE sc.id = NEW.section_id;
    IF FOUND AND v_inst IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION
        'section_id % belongs to institution %, not the learner''s institution %',
        NEW.section_id, v_inst, NEW.institution_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── programme scope (added 2026-08-08) ───────────────────────────────────
  IF NEW.semester_id IS NOT NULL AND NEW.program_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.semester_id IS DISTINCT FROM OLD.semester_id
          OR NEW.program_id  IS DISTINCT FROM OLD.program_id) THEN
    SELECT s.program_id INTO v_prog
      FROM public.semesters s WHERE s.id = NEW.semester_id;
    IF FOUND AND v_prog IS DISTINCT FROM NEW.program_id THEN
      RAISE EXCEPTION
        'semester_id % belongs to programme %, not the learner''s programme %',
        NEW.semester_id, v_prog, NEW.program_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.section_id IS NOT NULL AND NEW.program_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.section_id IS DISTINCT FROM OLD.section_id
          OR NEW.program_id IS DISTINCT FROM OLD.program_id) THEN
    SELECT sc.program_id INTO v_prog
      FROM public.sections sc WHERE sc.id = NEW.section_id;
    IF FOUND AND v_prog IS DISTINCT FROM NEW.program_id THEN
      RAISE EXCEPTION
        'section_id % belongs to programme %, not the learner''s programme %',
        NEW.section_id, v_prog, NEW.program_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- ── 4. Assert the repair actually landed ───────────────────────────────────
-- Fails the whole migration rather than leaving a half-repaired table: if any
-- learner remains on an inactive year, that learner had no active same-dates
-- twin and needs a human decision, not a silent pass.
DO $$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left
  FROM   public.learners_profiles lp
  JOIN   public.academic_years    ay ON ay.id = lp.academic_year_id
  WHERE  ay.is_active = false;

  IF v_left > 0 THEN
    RAISE EXCEPTION
      'Repair incomplete: % learner(s) still on an INACTIVE academic year '
      '(no active same-dates twin at their institution)', v_left;
  END IF;
END $$;
