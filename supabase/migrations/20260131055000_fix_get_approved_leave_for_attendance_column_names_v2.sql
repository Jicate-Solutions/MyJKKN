-- Fix get_approved_leave_for_attendance function - column name mismatch
-- Issue: Function references 'subcategory' but table has 'sub_category'
-- Issue: Function expects TEXT[] for selected_periods but table has jsonb
-- Created: 2026-01-31

-- Drop the existing function first
DROP FUNCTION IF EXISTS get_approved_leave_for_attendance(UUID, DATE, TEXT[]);

-- Recreate the function with correct column names and types
CREATE OR REPLACE FUNCTION get_approved_leave_for_attendance(
  p_section_id UUID,
  p_date DATE,
  p_periods TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  learner_id UUID,
  application_id UUID,
  category TEXT,
  subcategory TEXT,
  selected_periods jsonb,
  start_date DATE,
  end_date DATE,
  reason TEXT,
  attachment_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    loa.learner_id,
    loa.id as application_id,
    loa.category::text,
    loa.sub_category as subcategory,  -- FIX: use sub_category not subcategory
    loa.selected_periods,
    loa.start_date,
    loa.end_date,
    loa.reason,
    loa.attachment_url
  FROM leave_onduty_applications loa
  WHERE
    loa.section_id = p_section_id
    AND loa.status = 'approved'
    AND loa.start_date <= p_date
    AND loa.end_date >= p_date
    -- If specific periods are provided, check if any match
    AND (
      p_periods IS NULL
      OR loa.selected_periods @> to_jsonb(p_periods)  -- FIX: Use jsonb containment
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_approved_leave_for_attendance(UUID, DATE, TEXT[]) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_approved_leave_for_attendance IS
  'Returns approved leave/onduty applications for students in a section on a specific date.
   Used when marking attendance to pre-fill status and show indicators.
   Parameters:
   - p_section_id: Section UUID
   - p_date: Date to check (YYYY-MM-DD)
   - p_periods: Optional array of period IDs to filter
   Returns: Table with learner_id and application details';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_leave_onduty_section_date_status
  ON leave_onduty_applications (section_id, start_date, end_date, status)
  WHERE status = 'approved';
