-- Repair learners_profiles rows whose degree_id points at ANOTHER institution's
-- degree, and extend the existing scope guard so it cannot recur. 2026-07-30.
--
-- WHAT WENT WRONG
-- The same bulk write that corrupted semester_id / academic_year_id (repaired in
-- 20260730160000_repair_cross_institution_learner_semester_academic_year.sql)
-- also re-pointed degree_id at same-NAMED degrees belonging to other
-- institutions. That migration did not cover degree_id, so it survived.
-- updated_at on the affected rows clusters at 2026-07-30 09:43..10:00 UTC —
-- the same window.
--
-- `degrees` is institution-scoped: there are NINE rows named 'Undergraduate',
-- one per institution. Because the rows carry identical NAMES, every screen
-- still rendered "Undergraduate" and the corruption was invisible in the UI.
--
-- WHY IT MATTERED (the reported symptom)
-- /learners/profiles advanced filter. Filtering Dental alone returns 476 active
-- learners; adding Dental's OWN Undergraduate degree (f1ab9cc0…) returns 10.
-- The 466 others point at JKKN College of Pharmacy's 'Undergraduate' (45dfeb21…)
-- and 'Postgraduate' (24b71f95…). The filter ANDs each hierarchy level
-- independently and the Degree dropdown is correctly institution-scoped, so the
-- picked id can never match those learners. Every level BELOW degree
-- (department, programme, semester, section) is filtered together with
-- degree_id, so all of them collapsed to zero rows too.
--
-- SCOPE OF THE DAMAGE (measured immediately before this migration)
--   2,828  learners with a foreign degree_id — ALL lifecycle_status='active'
--   2,828  uniquely resolvable (100%)
--       0  unresolvable
-- Donors: JKKN College of Pharmacy (1,807) and JKKN Dental College (1,021).
-- Affected: Engineering 786, Arts & Science Self 781, Dental 466,
--           Arts & Science Aided 326, Allied Health 240, Nursing 229.
--
-- RESOLUTION KEY, AND WHY IT IS TRUSTWORTHY
--   degree := the degree of the learner's OWN department (departments.degree_id)
-- Unlike the semester/AY repair, this needs no name matching at all — it is a
-- direct FK read, so there is nothing to disambiguate and no LIMIT 1 anywhere.
-- Verified before writing this migration:
--   department_id matches the learner's institution : 4,341 / 4,341  (0 wrong)
--   program_id    matches the learner's department  : 4,320 / 4,341  (21 wrong)
--   resolved degree is in the learner's institution : 2,828 / 2,828
-- i.e. department_id and program_id are mutually consistent and correctly
-- scoped; ONLY degree_id moved. The department is therefore ground truth here.
--
-- INNER JOIN IS LOAD-BEARING. 57 learners have no department at all. With a LEFT
-- join, departments.degree_id would read NULL for them and the UPDATE would WIPE
-- their degree_id. The join below excludes them by construction; they are left
-- exactly as they are (all 57 already have a NULL degree_id, so none are wrong).
--
-- DELIBERATELY NOT FIXED: the 21 learners whose program_id belongs to a
-- different department than their own department_id. That is a separate
-- inconsistency with two plausible readings (wrong programme, or wrong
-- department) and no ground truth to choose between them. Guessing would be
-- worse than leaving a visible inconsistency. They are reported by NOTICE below.
--
-- TRIGGERS ARE DISABLED FOR THE UPDATE, for the same reason and with the same
-- safety argument as the 2026-07-30 semester/AY repair: learners_profiles
-- carries six AFTER INSERT/UPDATE sync/CDC triggers (email→profile,
-- status→profile, referral attribution, passed-out→alumni bridge) that exist to
-- propagate BUSINESS changes. This corrects one mis-pointed foreign key and is
-- not a business state change. FK enforcement is internal and stays ACTIVE, so
-- every new id is still verified to be a real row.
--   Verified safe: trigger_detect_fee_dimension_change inspects only program_id,
--   quota_id, community_category_id, accommodation_type_id and admission_year_id.
--   It does NOT read degree_id, so it would have short-circuited anyway and no
--   fee-change events are created or suppressed by this migration.
--
-- WHY A TRIGGER GUARD AND NOT A COMPOSITE FOREIGN KEY
-- The obvious structural guard is UNIQUE(id, institution_id) on degrees plus
-- FK (degree_id, institution_id) REFERENCES degrees(id, institution_id). It is
-- rejected here: the existing fk_learners_profiles_degree and
-- fk_learners_profiles_institution are both ON DELETE SET NULL, so a composite
-- FK would null BOTH columns when a degree is deleted — silently stripping the
-- learner's institution_id. Extending the existing validate_learner_*_scope
-- trigger keeps the delete semantics untouched and matches the pattern already
-- established for semester / academic year / admission year.
--
-- TO ROLL BACK:
--   ALTER TABLE public.learners_profiles DISABLE TRIGGER USER;
--   UPDATE public.learners_profiles lp SET degree_id = r.old_degree_id
--     FROM public._bak_learner_degree_repair_20260730 r WHERE r.learner_id = lp.id;
--   ALTER TABLE public.learners_profiles ENABLE TRIGGER USER;
--   (and re-run 20260730160000's version of validate_learner_semester_year_scope)

SET statement_timeout = '900s';

-- ---------------------------------------------------------------------------
-- 1. Freeze the scope, with old AND resolved values, in one shot.
-- ---------------------------------------------------------------------------
CREATE TABLE public._bak_learner_degree_repair_20260730 AS
SELECT
  lp.id              AS learner_id,
  lp.roll_number,
  lp.institution_id,
  lp.department_id,
  lp.degree_id       AS old_degree_id,
  d.degree_id        AS new_degree_id,
  owner.name         AS old_degree_belonged_to
FROM public.learners_profiles lp
JOIN public.departments d      ON d.id     = lp.department_id
LEFT JOIN public.degrees old   ON old.id   = lp.degree_id
LEFT JOIN public.institutions owner ON owner.id = old.institution_id
WHERE lp.degree_id IS DISTINCT FROM d.degree_id;

ALTER TABLE public._bak_learner_degree_repair_20260730 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._bak_learner_degree_repair_20260730 FROM anon, authenticated;

COMMENT ON TABLE public._bak_learner_degree_repair_20260730 IS
  'Pre-repair snapshot (2026-07-30) of learners_profiles rows whose degree_id pointed at another institution''s same-named degree. Holds old + resolved values for rollback.';

-- ---------------------------------------------------------------------------
-- 2. Guards. Abort on any drift from what was measured and approved.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_scope int; v_resolvable int; v_non_active int; v_prog_mismatch int;
BEGIN
  SELECT COUNT(*) INTO v_scope FROM public._bak_learner_degree_repair_20260730;
  SELECT COUNT(*) INTO v_resolvable
    FROM public._bak_learner_degree_repair_20260730 WHERE new_degree_id IS NOT NULL;

  IF v_scope <> 2828 THEN
    RAISE EXCEPTION 'Aborting: scope is % rows, expected 2828.', v_scope;
  END IF;
  IF v_resolvable <> 2828 THEN
    RAISE EXCEPTION 'Aborting: only % of % rows resolvable, expected all.', v_resolvable, v_scope;
  END IF;

  -- Never re-point across institutions: every resolved degree must belong to the
  -- learner's OWN institution. This is the entire point of the repair.
  IF EXISTS (
    SELECT 1 FROM public._bak_learner_degree_repair_20260730 r
      JOIN public.degrees g ON g.id = r.new_degree_id
     WHERE g.institution_id IS DISTINCT FROM r.institution_id
  ) THEN
    RAISE EXCEPTION 'Aborting: a resolved degree belongs to a different institution.';
  END IF;

  -- The corruption was only ever observed on active learners. If other statuses
  -- are now in scope the incident is wider than analysed — stop and re-measure.
  SELECT COUNT(*) INTO v_non_active
  FROM public._bak_learner_degree_repair_20260730 r
  JOIN public.learners_profiles lp ON lp.id = r.learner_id
  WHERE lp.lifecycle_status <> 'active';
  IF v_non_active <> 0 THEN
    RAISE EXCEPTION 'Aborting: % non-active learner(s) in scope, expected 0.', v_non_active;
  END IF;

  -- Reported, not fixed. See header.
  SELECT COUNT(*) INTO v_prog_mismatch
  FROM public.learners_profiles lp
  JOIN public.programs p ON p.id = lp.program_id
  WHERE p.department_id IS DISTINCT FROM lp.department_id;

  RAISE NOTICE 'Guards passed. Repairing % degree_id values. Separately, % learner(s) have a programme outside their own department — NOT touched by this migration.',
    v_scope, v_prog_mismatch;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Apply. USER triggers off; FK enforcement stays on (see header).
-- ---------------------------------------------------------------------------
ALTER TABLE public.learners_profiles DISABLE TRIGGER USER;

UPDATE public.learners_profiles lp
   SET degree_id = r.new_degree_id
  FROM public._bak_learner_degree_repair_20260730 r
 WHERE r.learner_id = lp.id
   AND r.new_degree_id IS NOT NULL;

ALTER TABLE public.learners_profiles ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------------
-- 4. Extend the existing scope guard to cover degree_id and department_id.
--
-- Rebuilt from the 20260730160000 version (semester + academic year) with two
-- checks added. Same SECURITY DEFINER + search_path + check_violation shape, and
-- the same validate-only-on-change rule so the 319 known-unresolvable semester
-- rows from that migration stay editable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_learner_semester_year_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid;
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

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.validate_learner_semester_year_scope() IS
  'Rejects a learners_profiles row whose degree_id, department_id, semester_id or academic_year_id belongs to a different institution. Validates only on INSERT or when the value (or institution_id) actually changes, so the 319 known-unresolvable semester rows from the 2026-07-30 repair stay editable.';

-- Trigger already exists from 20260730160000; recreate defensively so this
-- migration is self-contained if applied to an environment that lacks it.
DROP TRIGGER IF EXISTS trg_validate_learner_semester_year_scope ON public.learners_profiles;
CREATE TRIGGER trg_validate_learner_semester_year_scope
BEFORE INSERT OR UPDATE ON public.learners_profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_learner_semester_year_scope();

-- ---------------------------------------------------------------------------
-- 5. Verify before committing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad_degree int; v_bad_dept int; v_dental_ug int; v_disabled int; v_trg int;
BEGIN
  SELECT COUNT(*) INTO v_bad_degree
  FROM public.learners_profiles lp
  JOIN public.degrees g ON g.id = lp.degree_id
  WHERE g.institution_id IS DISTINCT FROM lp.institution_id;

  IF v_bad_degree <> 0 THEN
    RAISE EXCEPTION 'Incomplete: % learner(s) still on a foreign degree.', v_bad_degree;
  END IF;

  SELECT COUNT(*) INTO v_bad_dept
  FROM public.learners_profiles lp
  JOIN public.departments dp ON dp.id = lp.department_id
  WHERE dp.institution_id IS DISTINCT FROM lp.institution_id;

  IF v_bad_dept <> 0 THEN
    RAISE EXCEPTION 'Unexpected: % learner(s) on a foreign department, expected 0.', v_bad_dept;
  END IF;

  -- Every learner's degree must now agree with their own department's degree.
  IF EXISTS (
    SELECT 1 FROM public.learners_profiles lp
      JOIN public.departments d ON d.id = lp.department_id
     WHERE lp.degree_id IS DISTINCT FROM d.degree_id
  ) THEN
    RAISE EXCEPTION 'Incomplete: a learner''s degree still disagrees with their department.';
  END IF;

  -- The reported symptom, asserted directly: Dental + Dental's own Undergraduate
  -- degree must now return the full UG cohort, not 10.
  SELECT COUNT(*) INTO v_dental_ug
  FROM public.learners_profiles lp
  WHERE lp.institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'
    AND lp.degree_id      = 'f1ab9cc0-053f-4ceb-90e3-b7170f31ee53'
    AND lp.lifecycle_status = 'active';

  IF v_dental_ug < 400 THEN
    RAISE EXCEPTION 'Incomplete: Dental + own UG degree returns % active learners, expected the full UG cohort (~435).', v_dental_ug;
  END IF;

  SELECT COUNT(*) INTO v_disabled
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal AND t.tgenabled = 'D' AND c.relname = 'learners_profiles';
  IF v_disabled <> 0 THEN
    RAISE EXCEPTION 'CRITICAL: % trigger(s) left DISABLED on learners_profiles.', v_disabled;
  END IF;

  SELECT COUNT(*) INTO v_trg
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname = 'learners_profiles'
    AND t.tgname = 'trg_validate_learner_semester_year_scope';
  IF v_trg <> 1 THEN
    RAISE EXCEPTION 'Guard trigger was not created.';
  END IF;

  RAISE NOTICE 'Verified: 0 foreign degree_id remain; Dental UG cohort now % active; guard active.', v_dental_ug;
END $$;
