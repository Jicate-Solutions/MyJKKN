-- Admission Year → institution-wide, step 2/4: collapse 288→38 + re-point dependents.
-- Atomic. Backups in _bak_*_20260605 (taken 2026-06-05). Triggers suppressed for the
-- structural admission_year_id remap so no spurious fee-change events / scope aborts fire.

-- 0. Replace the learner-scope validation with an institution-only check (safe before AND
--    after the program_id column is dropped in step 3).
CREATE OR REPLACE FUNCTION public.validate_learner_admission_year_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ay_institution_id uuid;
BEGIN
  IF NEW.admission_year_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT ay.institution_id INTO v_ay_institution_id
  FROM public.admission_years ay WHERE ay.id = NEW.admission_year_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF v_ay_institution_id IS DISTINCT FROM NEW.institution_id THEN
    RAISE EXCEPTION
      'admission_year_id % does not match learner institution_id %',
      NEW.admission_year_id, NEW.institution_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

-- 1. Suppress learner triggers for the bulk remap (re-enabled at step 4).
ALTER TABLE learners_profiles DISABLE TRIGGER trg_validate_learner_admission_year_scope;
ALTER TABLE learners_profiles DISABLE TRIGGER trg_detect_fee_dimension_change;

-- 2. Canonical map: one surviving row per (institution, year); prefer active, then earliest.
CREATE TABLE _mig_ay_canonical_map AS
SELECT id AS old_id,
       first_value(id) OVER (
         PARTITION BY institution_id, program_start_year
         ORDER BY is_active DESC, created_at ASC, id ASC
       ) AS canonical_id
FROM admission_years;
CREATE INDEX ON _mig_ay_canonical_map (old_id);

-- 3. Re-point the "clean" dependents (each keeps its own program/programme_id).
UPDATE learners_profiles t SET admission_year_id = m.canonical_id
  FROM _mig_ay_canonical_map m WHERE t.admission_year_id = m.old_id AND m.old_id <> m.canonical_id;
UPDATE admission_leads t SET admission_year_id = m.canonical_id
  FROM _mig_ay_canonical_map m WHERE t.admission_year_id = m.old_id AND m.old_id <> m.canonical_id;
UPDATE admission_campaigns t SET admission_year_id = m.canonical_id
  FROM _mig_ay_canonical_map m WHERE t.admission_year_id = m.old_id AND m.old_id <> m.canonical_id;
UPDATE admission_fee_structures t SET admission_year_id = m.canonical_id
  FROM _mig_ay_canonical_map m WHERE t.admission_year_id = m.old_id AND m.old_id <> m.canonical_id;
UPDATE admission_packages t SET admission_year_id = m.canonical_id
  FROM _mig_ay_canonical_map m WHERE t.admission_year_id = m.old_id AND m.old_id <> m.canonical_id;
UPDATE accreditation_iiqa_snapshots t SET admission_year_id = m.canonical_id
  FROM _mig_ay_canonical_map m WHERE t.admission_year_id = m.old_id AND m.old_id <> m.canonical_id;

-- 4. Re-enable learner triggers.
ALTER TABLE learners_profiles ENABLE TRIGGER trg_validate_learner_admission_year_scope;
ALTER TABLE learners_profiles ENABLE TRIGGER trg_detect_fee_dimension_change;

-- 5. Historical pivot has UNIQUE(admission_year_id, admission_date) → can't naively re-point.
--    Compute merged rows, wipe the participants, re-insert (institution-level sum).
CREATE TABLE _mig_pivot_merged AS
SELECT m.canonical_id   AS admission_year_id,
       p.admission_date,
       sum(p.admitted_count) AS admitted_count,
       min(p.source)         AS source,
       max(p.imported_at)    AS imported_at,
       min(p.imported_by)    AS imported_by
FROM admission_historical_pivot p
JOIN _mig_ay_canonical_map m ON m.old_id = p.admission_year_id
GROUP BY m.canonical_id, p.admission_date;

DELETE FROM admission_historical_pivot
WHERE admission_year_id IN (SELECT old_id FROM _mig_ay_canonical_map);

INSERT INTO admission_historical_pivot
  (admission_year_id, admission_date, admitted_count, source, imported_at, imported_by)
SELECT admission_year_id, admission_date, admitted_count, source, imported_at, imported_by
FROM _mig_pivot_merged;

-- 6. Drop program-level quota seats (decision: seats live on programs).
DROP TABLE IF EXISTS admission_year_quota_seats CASCADE;

-- 7. Delete the now-unreferenced non-canonical years (288→38).
DELETE FROM admission_years a
USING _mig_ay_canonical_map m
WHERE a.id = m.old_id AND m.old_id <> m.canonical_id;

-- 8. Normalize surviving names to an institution-level label.
UPDATE admission_years
SET admission_year_name = program_start_year::text || ' Admissions',
    updated_at = now();

-- 9. Clean up migration scratch tables.
DROP TABLE _mig_pivot_merged;
DROP TABLE _mig_ay_canonical_map;
