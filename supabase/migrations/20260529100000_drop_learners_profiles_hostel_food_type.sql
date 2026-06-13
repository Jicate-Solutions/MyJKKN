-- Remove the legacy learners_profiles.hostel_type (AC/Non-AC) and food_type
-- (VEG/NON-VEG) free-text preference columns. The AC/Non-AC distinction now
-- lives in the gender-scoped hostel room category (hostel_category_id) and the
-- mess plan in mess_category_id, so these two columns are redundant.
--
-- This migration:
--   1. Backfills existing hostel learners that have no room/mess category yet
--      with the gender-matched "Classic" category (boys/girls), so no hostel
--      student is left without a category after the columns are dropped.
--   2. Recreates v_learner_hostelites WITHOUT hostel_type (the only DB object
--      that referenced the column).
--   3. Drops both columns from learners_profiles.

-- ── 1. Backfill room + mess categories for existing hostel learners ──────────
-- Classic Room  → boys 00fad18b-82ee-445a-a409-363c382bccd1
--               → girls 3039d5d8-3ddf-490e-9977-04a558b9062b
-- Classic Mess  → boys 38e0e107-8401-4f4a-b5cd-77a6105a52d0
--               → girls 5c6f1926-9bd0-4cb2-acf6-ef77c8bbba82
UPDATE learners_profiles
SET hostel_category_id = CASE gender
      WHEN 'MALE'   THEN '00fad18b-82ee-445a-a409-363c382bccd1'::uuid
      WHEN 'FEMALE' THEN '3039d5d8-3ddf-490e-9977-04a558b9062b'::uuid
    END
WHERE accommodation_type = 'HOSTEL'
  AND hostel_category_id IS NULL
  AND gender IN ('MALE', 'FEMALE');

UPDATE learners_profiles
SET mess_category_id = CASE gender
      WHEN 'MALE'   THEN '38e0e107-8401-4f4a-b5cd-77a6105a52d0'::uuid
      WHEN 'FEMALE' THEN '5c6f1926-9bd0-4cb2-acf6-ef77c8bbba82'::uuid
    END
WHERE accommodation_type = 'HOSTEL'
  AND mess_category_id IS NULL
  AND gender IN ('MALE', 'FEMALE');

-- ── 2. Recreate v_learner_hostelites without hostel_type ─────────────────────
-- CREATE OR REPLACE VIEW cannot drop a column, so drop + recreate. This mirrors
-- the extended definition from 20260529_extend_v_learner_hostelites_cascade.sql
-- (cascade FKs + program/block display names) MINUS the hostel_type column, so
-- the advanced-table feature keeps its columns after this migration runs.
DROP VIEW IF EXISTS v_learner_hostelites;

CREATE VIEW v_learner_hostelites AS
SELECT
  lp.id,
  lp.first_name,
  lp.last_name,
  lp.roll_number,
  lp.student_email,
  lp.college_email,
  lp.gender,
  lp.institution_id,
  lp.accommodation_type,
  lp.hostel_fee,
  lp.dayscholar_fee,
  lp.father_name,
  lp.mother_name,
  lp.admission_year_id,
  lp.degree_id,
  lp.department_id,
  lp.program_id,
  lp.semester_id,
  lp.section_id,
  lp.academic_year_id,
  pr.program_name,
  ay.program_start_year,
  ay.program_end_year,
  CASE
    WHEN lp.admission_year_id IS NOT NULL AND ay.program_start_year IS NOT NULL
      THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - ay.program_start_year + 1, ay.program_end_year - ay.program_start_year + 1))
    WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL
      THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM b.start_date)::integer + 1, EXTRACT(year FROM b.end_date)::integer - EXTRACT(year FROM b.start_date)::integer + 1))
    WHEN lp.enquiry_date IS NOT NULL
      THEN GREATEST(1, EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM lp.enquiry_date)::integer + 1)
    ELSE NULL::integer
  END AS year_of_study,
  ha.block_id AS current_block_id,
  ha.room_id AS current_room_id,
  ha.bed_id AS current_bed_id,
  ha.id AS current_allocation_id,
  hb.name AS current_block_name,
  hb.code AS current_block_code,
  CASE
    WHEN lp.admission_year_id IS NOT NULL AND ay.program_start_year IS NOT NULL THEN 'admission_year'::text
    WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN 'batch'::text
    WHEN lp.enquiry_date IS NOT NULL THEN 'enquiry'::text
    ELSE NULL::text
  END AS year_source
FROM learners_profiles lp
  LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN batches b ON b.id = lp.batch_id
  LEFT JOIN programs pr ON pr.id = lp.program_id
  LEFT JOIN hostel_allocations ha ON ha.learner_id = lp.id AND ha.status = 'active'::allocation_status_enum
  LEFT JOIN hostel_blocks hb ON hb.id = ha.block_id
WHERE lp.accommodation_type = 'HOSTEL'::text;

GRANT SELECT ON public.v_learner_hostelites TO anon, authenticated, service_role;

-- ── 3. Drop the columns ──────────────────────────────────────────────────────
ALTER TABLE learners_profiles
  DROP COLUMN IF EXISTS hostel_type,
  DROP COLUMN IF EXISTS food_type;
