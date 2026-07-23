-- 20260529_add_degree_semester_names_to_v_learner_hostelites.sql
-- Adds degree_name + semester_name to v_learner_hostelites so the Hostel
-- Residents → Learners table can show Degree and Semester display columns
-- (only the FK ids degree_id/semester_id existed before). Appended at the END
-- of the select list so CREATE OR REPLACE VIEW is valid (Postgres allows adding
-- trailing columns to an existing view; no DROP needed → grants preserved).
-- LEFT JOINs only — a learner with a null degree_id/semester_id is not dropped.

CREATE OR REPLACE VIEW public.v_learner_hostelites AS
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
    WHEN lp.admission_year_id IS NOT NULL AND ay.program_start_year IS NOT NULL THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - ay.program_start_year + 1, ay.program_end_year - ay.program_start_year + 1))
    WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM b.start_date)::integer + 1, EXTRACT(year FROM b.end_date)::integer - EXTRACT(year FROM b.start_date)::integer + 1))
    WHEN lp.enquiry_date IS NOT NULL THEN GREATEST(1, EXTRACT(year FROM CURRENT_DATE)::integer - EXTRACT(year FROM lp.enquiry_date)::integer + 1)
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
  END AS year_source,
  -- NEW (appended): display names for the Degree + Semester columns
  dg.degree_name,
  sm.semester_name
FROM learners_profiles lp
  LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN batches b ON b.id = lp.batch_id
  LEFT JOIN programs pr ON pr.id = lp.program_id
  LEFT JOIN hostel_allocations ha ON ha.learner_id = lp.id
    AND ha.status = 'active'::allocation_status_enum
  LEFT JOIN hostel_blocks hb ON hb.id = ha.block_id
  LEFT JOIN degrees dg ON dg.id = lp.degree_id
  LEFT JOIN semesters sm ON sm.id = lp.semester_id
WHERE lp.accommodation_type = 'HOSTEL'::text;
