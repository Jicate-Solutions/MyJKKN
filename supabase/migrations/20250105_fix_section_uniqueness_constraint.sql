-- Migration to fix section name uniqueness constraint
-- The issue: Section names are globally unique instead of unique within context

-- Up Migration

-- First, remove the global unique constraint on section_name if it exists
ALTER TABLE public.sections DROP CONSTRAINT IF EXISTS sections_section_name_key;

-- Remove the institution-section_name unique constraint that's preventing same names in different semesters
ALTER TABLE public.sections DROP CONSTRAINT IF EXISTS sections_institution_section_name_unique;

-- Add missing columns if they don't exist (in case the table structure is outdated)
DO $$ 
BEGIN
    -- Add institution_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sections' 
        AND column_name = 'institution_id'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.sections ADD COLUMN institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE;
    END IF;

    -- Add degree_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sections' 
        AND column_name = 'degree_id'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.sections ADD COLUMN degree_id UUID REFERENCES public.degrees(id) ON DELETE CASCADE;
    END IF;

    -- Add department_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sections' 
        AND column_name = 'department_id'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.sections ADD COLUMN department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE;
    END IF;

    -- Add program_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sections' 
        AND column_name = 'program_id'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.sections ADD COLUMN program_id UUID REFERENCES public.programs(id) ON DELETE CASCADE;
    END IF;

    -- Add semester_id if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sections' 
        AND column_name = 'semester_id'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.sections ADD COLUMN semester_id UUID REFERENCES public.semesters(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Remove any old constraints that might conflict
ALTER TABLE public.sections DROP CONSTRAINT IF EXISTS sections_institution_program_semester_section_unique;
ALTER TABLE public.sections DROP CONSTRAINT IF EXISTS sections_institution_id_degree_id_department_id_program_id_course_id_semester_id_section_code_key;

-- Add the correct unique constraint: section_name should be unique within a semester context
-- This allows the same section name (like "A") to exist in different semesters
ALTER TABLE public.sections ADD CONSTRAINT sections_unique_per_semester 
    UNIQUE(institution_id, degree_id, department_id, program_id, semester_id, section_name);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sections_institution_id ON public.sections(institution_id);
CREATE INDEX IF NOT EXISTS idx_sections_degree_id ON public.sections(degree_id);
CREATE INDEX IF NOT EXISTS idx_sections_department_id ON public.sections(department_id);
CREATE INDEX IF NOT EXISTS idx_sections_program_id ON public.sections(program_id);
CREATE INDEX IF NOT EXISTS idx_sections_semester_id ON public.sections(semester_id);
CREATE INDEX IF NOT EXISTS idx_sections_section_name ON public.sections(section_name);

-- Add comment for documentation
COMMENT ON CONSTRAINT sections_unique_per_semester ON public.sections IS 
    'Ensures section names are unique within the same semester context, allowing same section names across different semesters';

-- Down Migration (commented out for reference)
/*
-- To rollback this migration:
ALTER TABLE public.sections DROP CONSTRAINT IF EXISTS sections_unique_per_semester;
ALTER TABLE public.sections ADD CONSTRAINT sections_section_name_key UNIQUE(section_name);
*/ 