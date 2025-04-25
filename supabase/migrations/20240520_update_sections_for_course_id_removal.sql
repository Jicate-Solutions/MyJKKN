-- Migration to update sections table for course_id removal from semesters
-- Up Migration

-- Update the unique constraint on the sections table
ALTER TABLE public.sections DROP CONSTRAINT IF EXISTS sections_institution_id_degree_id_department_id_program_id_course_id_semester_id_section_code_key;

-- Add a new unique constraint without the course_id reference
ALTER TABLE public.sections ADD CONSTRAINT sections_institution_program_semester_section_unique UNIQUE(institution_id, degree_id, department_id, program_id, semester_id, section_code);

-- Down Migration (commented out)
/*
-- Restore the original constraint if needed
ALTER TABLE public.sections DROP CONSTRAINT IF EXISTS sections_institution_program_semester_section_unique;
ALTER TABLE public.sections ADD CONSTRAINT sections_institution_id_degree_id_department_id_program_id_course_id_semester_id_section_code_key UNIQUE(institution_id, degree_id, department_id, program_id, course_id, semester_id, section_code);
*/ 