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