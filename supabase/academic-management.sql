-- Create academic_years table
create table academic_years (
  id uuid default uuid_generate_v4() primary key,
  institution_id uuid references institutions(id) on delete cascade not null,
  academic_year_name varchar(100) not null,
  start_date date not null,
  end_date date not null, 
  is_active boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(institution_id, academic_year_name)
);

-- Add RLS policies
alter table academic_years enable row level security;

-- 1. View Policy - Allow users to view academic years
CREATE POLICY "View academic years"
  ON academic_years
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
  );

-- 2. Create Policy - Allow authenticated users to create academic years
CREATE POLICY "Create academic years"
  ON academic_years
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
  );

-- 3. Update Policy - Allow users to update academic years
CREATE POLICY "Update academic years"
  ON academic_years
  FOR UPDATE
  USING (
    auth.role() = 'authenticated'
  );

-- 4. Delete Policy - Allow users to delete academic years
CREATE POLICY "Delete academic years"
  ON academic_years
  FOR DELETE
  USING (
    auth.role() = 'authenticated'
  );

-- Create indexes for frequently queried columns
CREATE INDEX idx_academic_years_institution_id 
  ON academic_years(institution_id);

CREATE INDEX idx_academic_years_is_active 
  ON academic_years(is_active);

CREATE INDEX idx_academic_years_dates 
  ON academic_years(start_date, end_date);

-- Create index for search
CREATE INDEX idx_academic_years_name 
  ON academic_years(academic_year_name);