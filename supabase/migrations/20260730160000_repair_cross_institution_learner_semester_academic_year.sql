-- Repair learners_profiles rows whose semester_id / academic_year_id point at
-- ANOTHER institution's row, and add a guard so it cannot recur. 2026-07-30.
--
-- WHAT WENT WRONG
-- A bulk write on 2026-07-30 09:42:59..09:43:49 UTC re-pointed learners at
-- same-NAMED semesters / academic_years belonging to other institutions. Example:
-- 100 Dental BDS "1 Year" learners ended up on JKKN College of Pharmacy's
-- '1 Year' semester (2809cd41…) and '2025-2026' academic year (55d71a3b…).
-- Because the rows carry identical NAMES, every screen still rendered "1 Year"
-- and "2025-2026" — the corruption was invisible in the UI.
--
-- WHY IT MATTERED (the reported symptom)
-- get_billing_coverage_learners decides coverage by joining
--   b.academic_year_id = COALESCE(p_academic_year_id, s.academic_year_id)
-- i.e. equality between the BILL's academic year and the LEARNER's. Once the
-- learner's AY moved to Pharmacy's row, nothing joined: all 99 active Dental BDS
-- 1st-years reported 'not_generated' / 0 bills while actually holding 361 bills.
-- Filtering /billing/coverage by Dental's own AY returned nobody at all, because
-- no learner pointed at it any more.
--
-- SCOPE OF THE DAMAGE (measured immediately before this migration)
--   2,640  learners in scope (either field wrong)
--   2,625  wrong academic_year_id  — ALL uniquely resolvable
--   1,765  wrong semester_id       — 1,446 uniquely resolvable, 319 not
--
-- RESOLUTION KEYS, AND WHY THEY ARE TRUSTWORTHY
--   academic_year : (institution_id, academic_year_name)
--   semester      : (institution_id, program_id, semester_name)
-- `semesters` is programme-scoped (it carries degree_id/department_id/program_id),
-- which is why Dental legitimately has SIX rows named '1 Year' — one per
-- programme. Keying on name ALONE would be ambiguous; adding program_id makes it
-- unique. Verified: 0 rows resolve to more than one candidate for either field,
-- so the LIMIT 1 below is deterministic, not arbitrary.
--
-- Both keys were validated against independent ground truth: for the 99 learners
-- whose ORIGINAL ids survive in _bak_bds1y_scope_20260730 (snapshotted before the
-- corruption), the keys reproduce semester f6c09a29… and academic year 7847e67c…
-- for 99/99 — exactly the pre-corruption values.
--
-- DELIBERATELY NOT FIXED: 319 learners whose own institution+programme has NO
-- semester with the sought name at all (e.g. Nursing BSC learners pointing at
-- 'Semester VIII' / '6 Year'; 57 Dental BDS learners pointing at 'Semester IV',
-- a name Dental BDS does not use). Their true semester is unknowable from the
-- data — guessing would be worse than leaving a visible inconsistency. They are
-- listed in _bak_learner_scope_repair_20260730 with new_semester_id IS NULL.
--
-- TRIGGERS ARE DISABLED FOR THE UPDATE. learners_profiles carries six AFTER
-- INSERT/UPDATE sync/CDC triggers (email→profile, status→profile, referral
-- attribution, passed-out→alumni bridge) plus BEFORE triggers that set
-- activated_at and application_id. Those exist to propagate BUSINESS changes;
-- this migration corrects two mis-pointed foreign keys and is not a business
-- state change, so firing them would produce spurious downstream writes.
-- FK enforcement is internal and stays ACTIVE, so every new id is still verified
-- to be a real row.
--   Verified safe either way: trigger_detect_fee_dimension_change inspects only
--   program_id / quota_id / community_category_id / accommodation_type_id /
--   admission_year_id. It ignores semester_id and academic_year_id, so it would
--   have short-circuited on v_changed_field IS NULL and created no fee-change
--   events. Disabling it changes nothing; it is disabled only for consistency.
--
-- THE NEW GUARD mirrors the existing validate_learner_admission_year_scope
-- (same SECURITY DEFINER + search_path + check_violation errcode shape) with one
-- deliberate difference: it validates only when the value ACTUALLY CHANGES
-- (or on INSERT, or when institution_id itself moves). The admission-year guard
-- validates unconditionally, which is safe there because no bad rows exist. Here
-- 319 known-bad rows deliberately remain, and an unconditional guard would make
-- those learners impossible to edit at all — including to fix them.
--
-- TO ROLL BACK:
--   UPDATE public.learners_profiles lp
--      SET semester_id = r.old_semester_id, academic_year_id = r.old_academic_year_id
--     FROM public._bak_learner_scope_repair_20260730 r WHERE r.learner_id = lp.id;
--   DROP TRIGGER trg_validate_learner_semester_year_scope ON public.learners_profiles;

SET statement_timeout = '900s';

-- ---------------------------------------------------------------------------
-- 1. Freeze the scope, with old AND resolved values, in one shot.
-- ---------------------------------------------------------------------------
CREATE TABLE public._bak_learner_scope_repair_20260730 AS
SELECT
  lp.id                AS learner_id,
  lp.roll_number,
  lp.institution_id,
  lp.program_id,
  lp.semester_id       AS old_semester_id,
  lp.academic_year_id  AS old_academic_year_id,
  CASE WHEN sem.institution_id IS DISTINCT FROM lp.institution_id THEN (
    SELECT s2.id FROM public.semesters s2
     WHERE s2.institution_id = lp.institution_id
       AND s2.program_id IS NOT DISTINCT FROM lp.program_id
       AND s2.semester_name = sem.semester_name
     LIMIT 1) END      AS new_semester_id,
  CASE WHEN ay.institution_id IS DISTINCT FROM lp.institution_id THEN (
    SELECT a2.id FROM public.academic_years a2
     WHERE a2.institution_id = lp.institution_id
       AND a2.academic_year_name = ay.academic_year_name
     LIMIT 1) END      AS new_academic_year_id,
  CASE WHEN sem.institution_id IS DISTINCT FROM lp.institution_id THEN (
    SELECT COUNT(*) FROM public.semesters s2
     WHERE s2.institution_id = lp.institution_id
       AND s2.program_id IS NOT DISTINCT FROM lp.program_id
       AND s2.semester_name = sem.semester_name) END AS semester_candidates,
  CASE WHEN ay.institution_id IS DISTINCT FROM lp.institution_id THEN (
    SELECT COUNT(*) FROM public.academic_years a2
     WHERE a2.institution_id = lp.institution_id
       AND a2.academic_year_name = ay.academic_year_name) END AS ay_candidates
FROM public.learners_profiles lp
LEFT JOIN public.semesters      sem ON sem.id = lp.semester_id
LEFT JOIN public.academic_years ay  ON ay.id  = lp.academic_year_id
WHERE (sem.id IS NOT NULL AND sem.institution_id IS DISTINCT FROM lp.institution_id)
   OR (ay.id  IS NOT NULL AND ay.institution_id  IS DISTINCT FROM lp.institution_id);

ALTER TABLE public._bak_learner_scope_repair_20260730 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._bak_learner_scope_repair_20260730 FROM anon, authenticated;

COMMENT ON TABLE public._bak_learner_scope_repair_20260730 IS
  'Pre-repair snapshot (2026-07-30) of learners_profiles rows whose semester_id/academic_year_id pointed at another institution. Holds old + resolved values; new_semester_id IS NULL marks the 319 unresolvable cases.';

-- ---------------------------------------------------------------------------
-- 2. Guards. Abort on any drift from what was measured and approved.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_scope int; v_sem_fix int; v_ay_fix int;
  v_sem_amb int; v_ay_amb int; v_sem_unres int; v_ay_unres int;
BEGIN
  SELECT COUNT(*) INTO v_scope     FROM public._bak_learner_scope_repair_20260730;
  SELECT COUNT(*) INTO v_sem_fix   FROM public._bak_learner_scope_repair_20260730 WHERE new_semester_id IS NOT NULL;
  SELECT COUNT(*) INTO v_ay_fix    FROM public._bak_learner_scope_repair_20260730 WHERE new_academic_year_id IS NOT NULL;
  SELECT COUNT(*) INTO v_sem_amb   FROM public._bak_learner_scope_repair_20260730 WHERE semester_candidates > 1;
  SELECT COUNT(*) INTO v_ay_amb    FROM public._bak_learner_scope_repair_20260730 WHERE ay_candidates > 1;
  SELECT COUNT(*) INTO v_sem_unres FROM public._bak_learner_scope_repair_20260730 WHERE semester_candidates = 0;
  SELECT COUNT(*) INTO v_ay_unres  FROM public._bak_learner_scope_repair_20260730 WHERE ay_candidates = 0;

  IF v_scope   <> 2640 THEN RAISE EXCEPTION 'Aborting: scope is % rows, expected 2640.', v_scope;        END IF;
  IF v_sem_fix <> 1446 THEN RAISE EXCEPTION 'Aborting: % semester fixes, expected 1446.', v_sem_fix;     END IF;
  IF v_ay_fix  <> 2625 THEN RAISE EXCEPTION 'Aborting: % academic year fixes, expected 2625.', v_ay_fix; END IF;
  IF v_sem_unres <> 319 THEN RAISE EXCEPTION 'Aborting: % unresolvable semesters, expected 319.', v_sem_unres; END IF;
  IF v_ay_unres  <> 0   THEN RAISE EXCEPTION 'Aborting: % unresolvable academic years, expected 0.', v_ay_unres; END IF;

  -- The whole approach rests on the resolution key being unique. If it is not,
  -- LIMIT 1 would be picking arbitrarily — refuse.
  IF v_sem_amb <> 0 THEN RAISE EXCEPTION 'Aborting: % learner(s) have >1 candidate semester; key is not unique.', v_sem_amb; END IF;
  IF v_ay_amb  <> 0 THEN RAISE EXCEPTION 'Aborting: % learner(s) have >1 candidate academic year; key is not unique.', v_ay_amb; END IF;

  -- Never re-point across institutions: every resolved target must belong to the
  -- learner's OWN institution.
  IF EXISTS (
    SELECT 1 FROM public._bak_learner_scope_repair_20260730 r
      JOIN public.semesters s ON s.id = r.new_semester_id
     WHERE s.institution_id IS DISTINCT FROM r.institution_id
  ) THEN RAISE EXCEPTION 'Aborting: a resolved semester belongs to a different institution.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public._bak_learner_scope_repair_20260730 r
      JOIN public.academic_years a ON a.id = r.new_academic_year_id
     WHERE a.institution_id IS DISTINCT FROM r.institution_id
  ) THEN RAISE EXCEPTION 'Aborting: a resolved academic year belongs to a different institution.'; END IF;

  -- Ground truth: the 99 learners snapshotted BEFORE the corruption must resolve
  -- back to their original ids.
  IF EXISTS (
    SELECT 1
    FROM public._bak_bds1y_scope_20260730 g
    JOIN public._bak_learner_scope_repair_20260730 r ON r.learner_id = g.learner_id
    WHERE r.new_semester_id      IS DISTINCT FROM g.semester_id
       OR r.new_academic_year_id IS DISTINCT FROM g.academic_year_id
  ) THEN
    RAISE EXCEPTION 'Aborting: resolution disagrees with the pre-corruption snapshot for at least one of the 99 Dental learners.';
  END IF;

  RAISE NOTICE 'Guards passed. Applying % academic year and % semester fixes; leaving % unresolvable.',
    v_ay_fix, v_sem_fix, v_sem_unres;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Apply. USER triggers off; FK enforcement stays on (see header).
-- ---------------------------------------------------------------------------
ALTER TABLE public.learners_profiles DISABLE TRIGGER USER;

UPDATE public.learners_profiles lp
   SET academic_year_id = r.new_academic_year_id
  FROM public._bak_learner_scope_repair_20260730 r
 WHERE r.learner_id = lp.id
   AND r.new_academic_year_id IS NOT NULL;

UPDATE public.learners_profiles lp
   SET semester_id = r.new_semester_id
  FROM public._bak_learner_scope_repair_20260730 r
 WHERE r.learner_id = lp.id
   AND r.new_semester_id IS NOT NULL;

ALTER TABLE public.learners_profiles ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------------
-- 4. The guard, so this cannot recur.
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
  'Rejects a learners_profiles row whose semester_id or academic_year_id belongs to a different institution. Validates only on INSERT or when the value (or institution_id) actually changes, so the 319 known-unresolvable rows from the 2026-07-30 repair stay editable.';

DROP TRIGGER IF EXISTS trg_validate_learner_semester_year_scope ON public.learners_profiles;
CREATE TRIGGER trg_validate_learner_semester_year_scope
BEFORE INSERT OR UPDATE ON public.learners_profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_learner_semester_year_scope();

-- ---------------------------------------------------------------------------
-- 5. Verify before committing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad_ay int; v_bad_sem int; v_dental_wrong int; v_disabled int; v_trg int;
BEGIN
  SELECT COUNT(*) INTO v_bad_ay
  FROM public.learners_profiles lp
  JOIN public.academic_years ay ON ay.id = lp.academic_year_id
  WHERE ay.institution_id IS DISTINCT FROM lp.institution_id;

  SELECT COUNT(*) INTO v_bad_sem
  FROM public.learners_profiles lp
  JOIN public.semesters s ON s.id = lp.semester_id
  WHERE s.institution_id IS DISTINCT FROM lp.institution_id;

  IF v_bad_ay <> 0 THEN
    RAISE EXCEPTION 'Incomplete: % learner(s) still on a foreign academic year.', v_bad_ay;
  END IF;
  IF v_bad_sem <> 319 THEN
    RAISE EXCEPTION 'Unexpected: % learner(s) on a foreign semester, expected exactly the 319 unresolvable.', v_bad_sem;
  END IF;

  -- The 99 Dental learners must be back on their pre-corruption ids exactly.
  SELECT COUNT(*) INTO v_dental_wrong
  FROM public._bak_bds1y_scope_20260730 g
  JOIN public.learners_profiles lp ON lp.id = g.learner_id
  WHERE lp.semester_id      IS DISTINCT FROM g.semester_id
     OR lp.academic_year_id IS DISTINCT FROM g.academic_year_id;

  IF v_dental_wrong <> 0 THEN
    RAISE EXCEPTION 'Incomplete: % of the 99 Dental learners do not match their pre-corruption values.', v_dental_wrong;
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

  RAISE NOTICE 'Repair complete: 2625 academic years + 1446 semesters corrected, 319 unresolvable left, guard active, all 99 Dental learners restored to pre-corruption values.';
END $$;
