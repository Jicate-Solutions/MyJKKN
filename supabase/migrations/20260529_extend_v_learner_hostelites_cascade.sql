-- 20260529_extend_v_learner_hostelites_cascade.sql
-- Extends v_learner_hostelites for the Hostel Residents → Learners advanced
-- DataTable: adds cascade FK columns (degree/department/program/semester/
-- section/academic_year) for filter pushdown, plus program_name and the
-- current block's name/code for display columns. LEFT JOINs only — no
-- hostelite row may be dropped by a null FK or missing active allocation.
--
-- DROP + CREATE (not CREATE OR REPLACE): the new cascade FK columns are
-- inserted before existing columns, and Postgres forbids reordering an
-- existing view's columns via CREATE OR REPLACE (42P16). No object depends
-- on this view, and the default anon/authenticated SELECT grants are
-- re-applied below to match Supabase's defaults.

DROP VIEW IF EXISTS public.v_learner_hostelites;

CREATE VIEW public.v_learner_hostelites AS
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
  -- NEW: cascade FKs for filter pushdown
  lp.degree_id,
  lp.department_id,
  lp.program_id,
  lp.semester_id,
  lp.section_id,
  lp.academic_year_id,
  -- NEW: display name
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
  -- NEW: display names for the current active allocation's block
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
  LEFT JOIN hostel_allocations ha ON ha.learner_id = lp.id
    AND ha.status = 'active'::allocation_status_enum
  LEFT JOIN hostel_blocks hb ON hb.id = ha.block_id
WHERE lp.accommodation_type = 'HOSTEL'::text;

GRANT SELECT ON public.v_learner_hostelites TO anon, authenticated, service_role;
