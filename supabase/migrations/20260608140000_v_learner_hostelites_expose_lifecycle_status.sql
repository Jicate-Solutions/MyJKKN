-- Surface lifecycle_status on v_learner_hostelites so the Residents → Learners
-- table can show a "Status" column. Appends one column to the END of the view's
-- SELECT (CREATE OR REPLACE permits appending columns), keeping the
-- active/reserved/admitted filter from 20260608130000. Mirrored into
-- supabase/setup/05_views.sql.

CREATE OR REPLACE VIEW public.v_learner_hostelites AS
 SELECT lp.id,
    lp.first_name,
    lp.last_name,
    lp.roll_number,
    lp.student_email,
    lp.college_email,
    lp.gender,
    lp.institution_id,
    acc.code AS accommodation_type,
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
    ay.year AS program_start_year,
    (ay.year::numeric + pr.program_duration_yrs)::integer AS program_end_year,
        CASE
            WHEN lp.admission_year_id IS NOT NULL AND ay.year IS NOT NULL THEN GREATEST(1, LEAST(EXTRACT(year FROM CURRENT_DATE)::integer - ay.year + 1, pr.program_duration_yrs::integer + 1))
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
            WHEN lp.admission_year_id IS NOT NULL AND ay.year IS NOT NULL THEN 'admission_year'::text
            WHEN lp.batch_id IS NOT NULL AND b.start_date IS NOT NULL THEN 'batch'::text
            WHEN lp.enquiry_date IS NOT NULL THEN 'enquiry'::text
            ELSE NULL::text
        END AS year_source,
    dg.degree_name,
    sm.semester_name,
    lp.lifecycle_status
   FROM learners_profiles lp
     LEFT JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
     LEFT JOIN admission_years ay ON ay.id = lp.admission_year_id
     LEFT JOIN batches b ON b.id = lp.batch_id
     LEFT JOIN programs pr ON pr.id = lp.program_id
     LEFT JOIN hostel_allocations ha ON ha.learner_id = lp.id AND ha.status = 'active'::allocation_status_enum
     LEFT JOIN hostel_blocks hb ON hb.id = ha.block_id
     LEFT JOIN degrees dg ON dg.id = lp.degree_id
     LEFT JOIN semesters sm ON sm.id = lp.semester_id
  WHERE acc.code = 'hostel'::text
    AND lp.lifecycle_status::text IN ('active', 'reserved', 'admitted');
