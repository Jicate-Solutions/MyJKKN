-- Migration: 004_create_timetables_tables
-- Description: Creates timetables and timetable_slots tables for timetable management

-- Create timetables table
CREATE TABLE IF NOT EXISTS timetables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id),
  academic_year_id UUID REFERENCES academic_years(id),
  degree_id UUID REFERENCES degrees(id),
  program_id UUID REFERENCES programs(id),
  department_id UUID REFERENCES departments(id),
  semester TEXT NOT NULL,
  section TEXT NOT NULL,
  timetable_name TEXT NOT NULL,
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  is_template BOOLEAN DEFAULT FALSE,
  template_name TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create timetable_slots table
CREATE TABLE IF NOT EXISTS timetable_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id UUID REFERENCES timetables(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL,
  period_id UUID REFERENCES periods(id),
  course_id UUID REFERENCES courses(id),
  staff_id UUID REFERENCES staff(id),
  is_break_slot BOOLEAN DEFAULT FALSE,
  break_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one entry per slot in a timetable
  CONSTRAINT unique_timetable_slot UNIQUE (timetable_id, day_of_week, period_id),
  
  -- Check constraint to ensure day_of_week is valid
  CONSTRAINT valid_day_of_week CHECK (
    day_of_week IN ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY')
  ),
  
  -- Check constraint to ensure either course_id or is_break_slot is set
  CONSTRAINT course_or_break CHECK (
    (course_id IS NOT NULL AND is_break_slot = FALSE) OR
    (course_id IS NULL AND is_break_slot = TRUE) OR
    (course_id IS NULL AND is_break_slot = FALSE)
  )
);

-- Create enum type for day of week
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'day_of_week') THEN
    CREATE TYPE day_of_week AS ENUM (
      'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'
    );
  END IF;
END $$;

-- Add update trigger for timetables
CREATE TRIGGER update_timetables_updated_at
BEFORE UPDATE ON timetables
FOR EACH ROW
EXECUTE PROCEDURE update_modified_column();

-- Add update trigger for timetable_slots
CREATE TRIGGER update_timetable_slots_updated_at
BEFORE UPDATE ON timetable_slots
FOR EACH ROW
EXECUTE PROCEDURE update_modified_column();

-- Grant appropriate permissions for timetables
ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;

-- RLS Policies for timetables
-- 1. Allow authenticated users to view any timetable (read-only)
CREATE POLICY "Authenticated users can view any timetable" ON timetables
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Allow users with specific permission to create timetables
CREATE POLICY "Users with academic.timetables.create permission can insert timetables" ON timetables
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 3. Allow users with specific permission to update timetables
CREATE POLICY "Users with academic.timetables.update permission can update timetables" ON timetables
  FOR UPDATE
  TO authenticated
  USING (true);

-- 4. Allow users with specific permission to delete timetables
CREATE POLICY "Users with academic.timetables.delete permission can delete timetables" ON timetables
  FOR DELETE
  TO authenticated
  USING (true);

-- Grant appropriate permissions for timetable_slots
ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;

-- RLS Policies for timetable_slots
-- 1. Allow authenticated users to view any timetable_slot (read-only)
CREATE POLICY "Authenticated users can view any timetable_slot" ON timetable_slots
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Allow users with specific permission to create timetable_slots
CREATE POLICY "Users with academic.timetables.create permission can insert timetable_slots" ON timetable_slots
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 3. Allow users with specific permission to update timetable_slots
CREATE POLICY "Users with academic.timetables.update permission can update timetable_slots" ON timetable_slots
  FOR UPDATE
  TO authenticated
  USING (true);

-- 4. Allow users with specific permission to delete timetable_slots
CREATE POLICY "Users with academic.timetables.delete permission can delete timetable_slots" ON timetable_slots
  FOR DELETE
  TO authenticated
  USING (true);

-- Create function to get all timetables by program
CREATE OR REPLACE FUNCTION get_timetables_by_program(
  p_program_id UUID
) RETURNS SETOF timetables AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM timetables
  WHERE program_id = p_program_id
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to get all timetable templates
CREATE OR REPLACE FUNCTION get_timetable_templates() RETURNS SETOF timetables AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM timetables
  WHERE is_template = TRUE
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to check for staff conflicts in timetable slots
CREATE OR REPLACE FUNCTION check_staff_timetable_conflicts(
  p_staff_id UUID,
  p_day_of_week TEXT,
  p_period_id UUID,
  p_exclude_timetable_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM timetable_slots
  WHERE
    staff_id = p_staff_id AND
    day_of_week = p_day_of_week AND
    period_id = p_period_id AND
    (p_exclude_timetable_id IS NULL OR timetable_id != p_exclude_timetable_id);
    
  RETURN conflict_count > 0;
END;
$$ LANGUAGE plpgsql; 