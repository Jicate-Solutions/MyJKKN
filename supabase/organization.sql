-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- Create degrees table
    CREATE TABLE public.degrees (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
        degree_id VARCHAR(20) NOT NULL,
        degree_name VARCHAR(100) NOT NULL,
        degree_type VARCHAR(10) NOT NULL CHECK (degree_type IN ('ug', 'pg')),
        is_active BOOLEAN DEFAULT true,
        created_by UUID REFERENCES auth.users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
    );



-- Add indexes
CREATE INDEX idx_degrees_institution_id ON public.degrees(institution_id);
CREATE INDEX idx_degrees_degree_id ON public.degrees(degree_id);
CREATE INDEX idx_degrees_degree_type ON public.degrees(degree_type);

-- Add RLS policies
ALTER TABLE public.degrees ENABLE ROW LEVEL SECURITY;

-- Policies for degrees table
CREATE POLICY "Enable read access for authenticated users" ON public.degrees
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert for authenticated admin users" ON public.degrees
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

CREATE POLICY "Enable update for authenticated admin users" ON public.degrees
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );

CREATE POLICY "Enable delete for authenticated admin users" ON public.degrees
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'super_admin')
        )
    );


-- Drop existing table if it exists
drop table if exists public.departments;

-- Create departments table with correct relationships
create table public.departments (
    id uuid default gen_random_uuid() primary key,
    institution_id uuid references public.institutions(id) on delete restrict not null,
    degree_id uuid references public.degrees(id) on delete restrict not null,
    department_code varchar(20) not null,
    department_name varchar(255) not null,
    is_active boolean default true,
    created_by uuid references auth.users(id),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    -- Add a composite unique constraint for institution and department code
    constraint departments_institution_code_unique unique (institution_id, department_code)
);

-- Add RLS policies
alter table public.departments enable row level security;

-- Create indexes for better query performance
create index departments_institution_id_idx on public.departments(institution_id);
create index departments_degree_id_idx on public.departments(degree_id);
create index departments_code_idx on public.departments(department_code);

-- Policy for select
create policy "Enable read access for all users"
    on departments for select
    using (true);

-- Add API key access policy for departments
create policy "Enable read access for API keys" on public.departments
    for select to public
    using (
      EXISTS (
        SELECT 1 FROM api_keys
        WHERE key_value = current_setting('request.header.apikey', true)::text
        AND is_active = true 
        AND (expires_at IS NULL OR expires_at > now())
        AND (permissions->>'read')::boolean = true
      )
    );

-- Policy for insert
create policy "Enable insert for authenticated users only"
    on departments for insert
    to authenticated
    with check (true);

-- Policy for update
create policy "Enable update for authenticated users only"
    on departments for update
    to authenticated
    using (true);

-- Policy for delete
create policy "Enable delete for authenticated users only"
    on departments for delete
    to authenticated
    using (true);

-- Add function to update timestamps
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- Add trigger for updating timestamps
create trigger set_departments_updated_at
    before update on public.departments
    for each row
    execute function public.handle_updated_at();

-- Add comments for better documentation
comment on table public.departments is 'Stores department information for institutions';
comment on column public.departments.institution_id is 'Reference to the institution';
comment on column public.departments.degree_id is 'Reference to the degree program';
comment on column public.departments.department_code is 'Unique code for the department within an institution';
comment on column public.departments.department_name is 'Full name of the department';


-- First create the extension if not exists
create extension if not exists moddatetime;

-- Create programs table
create table programs (
  id uuid default uuid_generate_v4() primary key,
  institution_id uuid references institutions(id) on delete cascade,
  degree_id uuid references degrees(id) on delete cascade, 
  department_id uuid references departments(id) on delete cascade,
  program_id text not null,
  program_name text not null,
  is_active boolean default true,
  created_by uuid references auth.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  unique(institution_id, program_id)
);

-- Enable RLS
alter table programs enable row level security;

-- Create policies
-- Allow admins to do everything
create policy "Admins can do everything" on programs to authenticated
using (
  auth.jwt() ->> 'email' in (
    select email from profiles 
    where role in ('super_admin', 'administrator')
  )
)
with check (
  auth.jwt() ->> 'email' in (
    select email from profiles 
    where role in ('super_admin', 'administrator')
  )
);

-- Allow read access for all authenticated users
create policy "Authenticated users can view" on programs
for select to authenticated using (true);

-- Allow users to create/update programs if they have edit access
create policy "Users can create/update programs" on programs
for all to authenticated
using (
  auth.jwt() ->> 'email' in (
    select email from profiles 
    where role in ('super_admin', 'administrator', 'faculty')
  )
) 
with check (
  auth.jwt() ->> 'email' in (
    select email from profiles 
    where role in ('super_admin', 'administrator', 'faculty')
  )
);

-- Create indexes
create index programs_institution_id_idx on programs(institution_id);
create index programs_degree_id_idx on programs(degree_id);
create index programs_department_id_idx on programs(department_id);
create index programs_program_id_idx on programs(program_id);

-- Create the correct trigger
CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON programs
    FOR EACH ROW
EXECUTE FUNCTION moddatetime('updated_at');


-- Create courses table
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    degree_id UUID REFERENCES degrees(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
    course_code TEXT NOT NULL,
    course_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(institution_id, course_code)
);

-- Create RLS policies
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Policy for selecting courses
CREATE POLICY "Select courses for authenticated users" ON public.courses
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Policy for inserting courses
CREATE POLICY "Insert courses for authorized users" ON public.courses
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND 
            role IN ('administrator', 'super_admin')
        )
    );

-- Policy for updating courses
CREATE POLICY "Update courses for authorized users" ON public.courses
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND 
            role IN ('administrator', 'super_admin')
        )
    );

-- Policy for deleting courses
CREATE POLICY "Delete courses for authorized users" ON public.courses
    FOR DELETE
    USING (
        auth.role() = 'authenticated' AND 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND 
            role IN ('administrator', 'super_admin')
        )
    );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_courses_institution ON public.courses(institution_id);
CREATE INDEX IF NOT EXISTS idx_courses_degree ON public.courses(degree_id);
CREATE INDEX IF NOT EXISTS idx_courses_department ON public.courses(department_id);
CREATE INDEX IF NOT EXISTS idx_courses_program ON public.courses(program_id);
CREATE INDEX IF NOT EXISTS idx_courses_code ON public.courses(course_code);

create table public.semesters (
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

-- Add unique constraint on semester_code
alter table public.semesters
  add constraint semesters_semester_code_unique unique (semester_code);

-- Add RLS policies
alter table public.semesters enable row level security;

create policy "Enable read access for authenticated users" on public.semesters
  for select using (auth.role() = 'authenticated');

create policy "Enable insert access for authenticated users" on public.semesters
  for insert with check (auth.role() = 'authenticated');

create policy "Enable update access for authenticated users" on public.semesters
  for update using (auth.role() = 'authenticated');

create policy "Enable delete access for authenticated users" on public.semesters
  for delete using (auth.role() = 'authenticated');

  create table public.sections (
    id uuid default gen_random_uuid() primary key,
    institution_id uuid references public.institutions(id) on delete cascade not null,
    degree_id uuid references public.degrees(id) on delete cascade not null,
    department_id uuid references public.departments(id) on delete cascade not null,
    program_id uuid references public.programs(id) on delete cascade not null,
    course_id uuid references public.courses(id) on delete cascade not null,
    semester_id uuid references public.semesters(id) on delete cascade not null,
    section_code text not null,
    section_name text not null,
    is_active boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(institution_id, degree_id, department_id, program_id, course_id, semester_id, section_code)
);

-- Add RLS policies
alter table public.sections enable row level security;

create policy "Allow public read access"
    on public.sections for select
    using ( true );

create policy "Allow authenticated create access"
    on public.sections for insert
    to authenticated
    with check ( true );

create policy "Allow individual update access"
    on public.sections for update
    to authenticated
    using ( true );

create policy "Allow individual delete access"
    on public.sections for delete
    to authenticated
    using ( true );


-- For each related table, ensure there's a policy for API key access
CREATE POLICY "Enable read access for API keys" ON public.degrees
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

-- Add API key access policy for programs
CREATE POLICY "Enable read access for API keys" ON public.programs
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

-- Add API key access policy for courses
CREATE POLICY "Enable read access for API keys" ON public.courses
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

-- Add API key access policy for sections
CREATE POLICY "Enable read access for API keys" ON public.sections
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

-- Create course_mappings table for mapping courses to degrees, departments, programs, and semesters
CREATE TABLE IF NOT EXISTS public.course_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE NOT NULL,
  degree_id UUID REFERENCES public.degrees(id) ON DELETE CASCADE NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  program_id UUID REFERENCES public.programs(id) ON DELETE CASCADE NOT NULL,
  semester_id UUID REFERENCES public.semesters(id) ON DELETE CASCADE NOT NULL,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  
  -- Add a unique constraint to prevent duplicate mappings
  CONSTRAINT course_mappings_unique UNIQUE (institution_id, degree_id, department_id, program_id, semester_id, course_id)
);

-- Add comment for documentation
COMMENT ON TABLE public.course_mappings IS 'Maps courses to institutions, degrees, departments, programs, and semesters';

-- Create indexes for better query performance
CREATE INDEX idx_course_mappings_institution ON public.course_mappings(institution_id);
CREATE INDEX idx_course_mappings_degree ON public.course_mappings(degree_id);
CREATE INDEX idx_course_mappings_department ON public.course_mappings(department_id);
CREATE INDEX idx_course_mappings_program ON public.course_mappings(program_id);
CREATE INDEX idx_course_mappings_semester ON public.course_mappings(semester_id);
CREATE INDEX idx_course_mappings_course ON public.course_mappings(course_id);

-- Enable RLS
ALTER TABLE public.course_mappings ENABLE ROW LEVEL SECURITY;

-- Policy for selecting course mappings (read access)
CREATE POLICY "Enable read access for authenticated users" ON public.course_mappings
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy for inserting course mappings
CREATE POLICY "Enable insert for authorized users" ON public.course_mappings
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' AND 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND 
      role IN ('administrator', 'super_admin')
    )
  );

-- Policy for updating course mappings
CREATE POLICY "Enable update for authorized users" ON public.course_mappings
  FOR UPDATE
  USING (
    auth.role() = 'authenticated' AND 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND 
      role IN ('administrator', 'super_admin')
    )
  );

-- Policy for deleting course mappings
CREATE POLICY "Enable delete for authorized users" ON public.course_mappings
  FOR DELETE
  USING (
    auth.role() = 'authenticated' AND 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND 
      role IN ('administrator', 'super_admin')
    )
  );

-- Create a trigger for updating the updated_at timestamp
CREATE TRIGGER set_course_mappings_updated_at
  BEFORE UPDATE ON public.course_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add API key access policy for course_mappings
CREATE POLICY "Enable read access for API keys" ON public.course_mappings
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