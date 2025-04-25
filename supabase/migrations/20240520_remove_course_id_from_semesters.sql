-- Migration to remove course_id from semesters table
-- Up Migration

-- Create a temporary table with the new structure
CREATE TABLE public.semesters_new (
  id uuid default gen_random_uuid() primary key,
  institution_id uuid references public.institutions(id) on delete cascade not null,
  degree_id uuid references public.degrees(id) on delete cascade not null,
  department_id uuid references public.departments(id) on delete cascade not null,
  program_id uuid references public.programs(id) on delete cascade not null,
  semester_code varchar(20) not null,
  semester_name varchar(255) not null,
  semester_type varchar(50) check (semester_type in ('even', 'odd')) not null,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Copy data from old table to new table
INSERT INTO public.semesters_new (
  id, institution_id, degree_id, department_id, program_id, 
  semester_code, semester_name, semester_type, is_active, 
  created_at, updated_at
)
SELECT 
  id, institution_id, degree_id, department_id, program_id, 
  semester_code, semester_name, semester_type, is_active, 
  created_at, updated_at
FROM public.semesters;

-- Drop the old table
DROP TABLE public.semesters;

-- Rename the new table
ALTER TABLE public.semesters_new RENAME TO semesters;

-- Add unique constraint on semester_code
ALTER TABLE public.semesters
  ADD CONSTRAINT semesters_semester_code_unique UNIQUE (semester_code);

-- Add RLS policies
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON public.semesters
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON public.semesters
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON public.semesters
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON public.semesters
  FOR DELETE USING (auth.role() = 'authenticated');

-- Add API key access policy for semesters
CREATE POLICY "Enable read access for API keys" ON public.semesters
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM api_keys
    WHERE key_value = current_setting('request.header.apikey', true)::text
    AND is_active = true 
    AND (expires_at IS NULL OR expires_at > now())
    AND (permissions->>'read')::boolean = true
  )
);

-- Create necessary indexes
CREATE INDEX IF NOT EXISTS idx_semesters_institution ON public.semesters(institution_id);
CREATE INDEX IF NOT EXISTS idx_semesters_degree ON public.semesters(degree_id);
CREATE INDEX IF NOT EXISTS idx_semesters_department ON public.semesters(department_id);
CREATE INDEX IF NOT EXISTS idx_semesters_program ON public.semesters(program_id);
CREATE INDEX IF NOT EXISTS idx_semesters_code ON public.semesters(semester_code);

-- Down Migration (commented out)
/*
-- This would recreate the original structure if needed to roll back
ALTER TABLE public.semesters ADD COLUMN course_id uuid references public.courses(id) on delete cascade;
*/ 