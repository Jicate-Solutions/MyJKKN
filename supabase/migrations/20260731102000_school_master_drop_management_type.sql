-- Remove management_type from school_master — unused (0 populated rows; the
-- real State Board import carries only district + school name).
ALTER TABLE public.school_master DROP COLUMN IF EXISTS management_type;
