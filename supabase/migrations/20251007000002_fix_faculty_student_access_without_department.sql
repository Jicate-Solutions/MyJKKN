-- ================================================================================
-- Fix Faculty Student Access Without Department ID
-- Created: 2025-10-07
-- Description: Allows faculty users to access students even when their department_id is NULL
--
-- Issue: Faculty users with NULL department_id cannot see students due to strict RLS policy
-- Solution: Update policy to check institution_id only for faculty, OR both institution and department
-- ================================================================================

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "student_select_access_policy" ON students;

-- Create new flexible policy for faculty and HOD roles
CREATE POLICY "student_select_access_policy" ON students
FOR SELECT
USING (
  -- Super admins can see all students
  (
    SELECT is_super_admin
    FROM profiles
    WHERE id = auth.uid()
  ) = true

  OR

  -- Admission role can see all students in their institution
  (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admission'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND institution_id = students.institution_id
    )
  )

  OR

  -- Administrator role can see all students in their institution
  (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'administrator'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND institution_id = students.institution_id
    )
  )

  OR

  -- HOD role: Check institution match, and department match if HOD has department_id
  (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'hod'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.institution_id = students.institution_id
      AND (
        -- If HOD has no department_id, allow access to all students in institution
        p.department_id IS NULL
        OR
        -- If HOD has department_id, must match student's department
        p.department_id = students.department_id
      )
    )
  )

  OR

  -- Faculty role: Check institution match, and department match if faculty has department_id
  (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'faculty'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.institution_id = students.institution_id
      AND (
        -- If faculty has no department_id, allow access to all students in institution
        p.department_id IS NULL
        OR
        -- If faculty has department_id, must match student's department
        p.department_id = students.department_id
      )
    )
  )

  OR

  -- Student role: Can only see their own record (matched by email)
  (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'student'
    AND students.college_email = (SELECT email FROM profiles WHERE id = auth.uid())
  )

  OR

  -- Other roles: Institution-based access only
  (
    (SELECT role FROM profiles WHERE id = auth.uid()) NOT IN (
      'super_admin', 'admission', 'administrator', 'hod', 'faculty', 'student'
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND institution_id = students.institution_id
    )
  )
);

-- Add comment explaining the policy
COMMENT ON POLICY "student_select_access_policy" ON students IS
'Allows faculty and HOD to access students in their institution. If they have a department_id, it must match. If department_id is NULL, they can access all students in their institution.';
