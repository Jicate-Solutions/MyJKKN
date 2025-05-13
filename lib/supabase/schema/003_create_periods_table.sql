-- Migration: 003_create_periods_table
-- Description: Creates periods table for timetable management

-- Create periods table
CREATE TABLE IF NOT EXISTS periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_break BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Add a unique constraint for period_name
  CONSTRAINT period_name_unique UNIQUE (period_name),
  
  -- Add check constraints
  CONSTRAINT period_start_before_end CHECK (start_time < end_time)
);

-- Grant appropriate permissions
ALTER TABLE periods ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- 1. Allow authenticated users to view any period (read-only)
CREATE POLICY "Authenticated users can view any period" ON periods
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Allow users with specific permission to create periods
CREATE POLICY "Users with academic.periods.create permission can insert periods" ON periods
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 3. Allow users with specific permission to update periods
CREATE POLICY "Users with academic.periods.update permission can update periods" ON periods
  FOR UPDATE
  TO authenticated
  USING (true);

-- 4. Allow users with specific permission to delete periods
CREATE POLICY "Users with academic.periods.delete permission can delete periods" ON periods
  FOR DELETE
  TO authenticated
  USING (true);

-- Create function to get periods in a specific time range
CREATE OR REPLACE FUNCTION get_periods_in_range(
  p_start_time TIME,
  p_end_time TIME
) RETURNS SETOF periods AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM periods
  WHERE 
    (start_time >= p_start_time AND start_time < p_end_time) OR
    (end_time > p_start_time AND end_time <= p_end_time) OR
    (start_time <= p_start_time AND end_time >= p_end_time);
END;
$$ LANGUAGE plpgsql; 