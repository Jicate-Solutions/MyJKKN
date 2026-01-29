-- Fix Leave/OnDuty Approval Flows RLS policies for HOD and Academic Roles
-- Issue: HOD users couldn't see/manage flows because:
--   1. Their role wasn't in the allowed roles list
--   2. Policy checked user_institution_access table, but HOD has no entry there
-- Solution: Use profiles.institution_id instead and add HOD/Principal/Faculty roles
-- Created: 2026-01-29

-- Drop existing policies
DROP POLICY IF EXISTS "admins_manage_flows" ON leave_onduty_approval_flows;
DROP POLICY IF EXISTS "staff_view_flows" ON leave_onduty_approval_flows;

-- Policy 1: Admins and HOD/Principal can manage flows for their institution
CREATE POLICY "admins_and_hod_manage_flows" ON leave_onduty_approval_flows
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        -- Super admins can manage all flows
        p.role = 'super_admin'
        OR
        -- Admins can manage flows for institutions they have access to
        (
          p.role IN ('admin', 'institution_admin')
          AND institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
          )
        )
        OR
        -- HOD and Principal can manage flows for their own institution
        (
          p.role IN ('hod', 'principal')
          AND institution_id = p.institution_id
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role = 'super_admin'
        OR
        (
          p.role IN ('admin', 'institution_admin')
          AND institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
          )
        )
        OR
        (
          p.role IN ('hod', 'principal')
          AND institution_id = p.institution_id
        )
      )
    )
  );

-- Policy 2: Academic staff can view flows for their institution
CREATE POLICY "academic_staff_view_flows" ON leave_onduty_approval_flows
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        -- Super admin sees all
        p.role = 'super_admin'
        OR
        -- Admins see flows for institutions they have access to
        (
          p.role IN ('admin', 'institution_admin')
          AND institution_id IN (
            SELECT institution_id FROM user_institution_access
            WHERE user_id = auth.uid()
          )
        )
        OR
        -- Academic roles see flows for their institution
        (
          p.role IN ('hod', 'principal', 'faculty', 'staff')
          AND institution_id = p.institution_id
        )
      )
    )
  );

-- Verify the policies were created
SELECT
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE tablename = 'leave_onduty_approval_flows'
ORDER BY policyname;
