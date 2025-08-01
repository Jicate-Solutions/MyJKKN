BEGIN;

-- Drop the existing unique constraint on section_name
ALTER TABLE public.sections DROP CONSTRAINT if exists sections_section_name_key;

-- Add a new composite unique constraint
ALTER TABLE public.sections ADD CONSTRAINT unique_section_per_semester
UNIQUE (institution_id, program_id, semester_id, section_name);

COMMIT;
