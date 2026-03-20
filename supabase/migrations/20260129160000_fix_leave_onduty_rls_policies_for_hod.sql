-- Fix Leave/OnDuty RLS policies to include HOD, Principal, and Faculty roles
-- Issue: HOD users couldn't see applications because their role wasn't in the RLS policies
-- Created: 2026-01-29

-- Drop existing policies
DROP POLICY IF EXISTS "admins_view_all_institution" ON leave_onduty_applications;
DROP POLICY IF EXISTS "approvers_view_assigned" ON leave_onduty_applications;

-- Recreate admins_view_all_institution policy with HOD, Principal, Faculty included
CREATE POLICY "admins_view_all_institution" ON leave_onduty_applications
  FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id
      FROM user_institution_access
      WHERE user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'institution_admin', 'hod', 'principal', 'faculty')
    )
  );

-- Recreate approvers_view_assigned policy with HOD, Principal, Faculty included
CREATE POLICY "approvers_view_assigned" ON leave_onduty_applications
  FOR SELECT
  USING (
    -- User is assigned as approver for this application
    id IN (
      SELECT application_id
      FROM leave_onduty_approvals
      WHERE approver_id = auth.uid()
    )
    OR
    -- OR user has an academic/admin role that can view applications
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'institution_admin', 'hod', 'principal', 'faculty', 'staff')
    )
  );

-- Verify the policies were created
SELECT
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE tablename = 'leave_onduty_applications'
  AND policyname IN ('admins_view_all_institution', 'approvers_view_assigned')
ORDER BY policyname;
