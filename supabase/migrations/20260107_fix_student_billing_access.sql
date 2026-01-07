-- Migration: Fix Student Billing Access
-- Date: 2026-01-07
-- Issue: Student role users cannot view their own bills, receipts, or invoices
-- Solution: Add RLS policies that allow students to view their own billing data
--
-- Connection: profiles.email matches learners_profiles.student_email OR college_email
-- Billing tables have student_id that references learners_profiles.id

-- ============================================================================
-- BILLING STUDENT BILLS - Student Access
-- ============================================================================

-- Policy: Students can view their own bills
CREATE POLICY "Students can view their own bills"
ON billing_student_bills
FOR SELECT
TO authenticated
USING (
  -- Match student_id to learner record linked via email
  student_id IN (
    SELECT lp.id
    FROM learners_profiles lp
    JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
    WHERE p.id = auth.uid()
      AND p.role = 'student'
  )
);

-- ============================================================================
-- BILLING RECEIPTS - Student Access
-- ============================================================================

-- Policy: Students can view their own receipts
CREATE POLICY "Students can view their own receipts"
ON billing_receipts
FOR SELECT
TO authenticated
USING (
  -- Match student_id to learner record linked via email
  student_id IN (
    SELECT lp.id
    FROM learners_profiles lp
    JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
    WHERE p.id = auth.uid()
      AND p.role = 'student'
  )
);

-- ============================================================================
-- BILLING INVOICES - Student Access
-- ============================================================================

-- Policy: Students can view their own invoices
CREATE POLICY "Students can view their own invoices"
ON billing_invoices
FOR SELECT
TO authenticated
USING (
  -- Match student_id to learner record linked via email
  student_id IN (
    SELECT lp.id
    FROM learners_profiles lp
    JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
    WHERE p.id = auth.uid()
      AND p.role = 'student'
  )
);

-- ============================================================================
-- VERIFICATION QUERIES (Run these to test the policies)
-- ============================================================================

-- Test 1: Check if a student can see their bills
-- Replace 'student@jkkn.ac.in' with actual student email
/*
SELECT COUNT(*) as student_bills_count
FROM billing_student_bills
WHERE student_id IN (
  SELECT lp.id
  FROM learners_profiles lp
  JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
  WHERE p.email = 'student@jkkn.ac.in'
);
*/

-- Test 2: Verify the email linkage works
/*
SELECT
  p.id as profile_id,
  p.email,
  p.role,
  lp.id as learner_id,
  lp.student_email,
  lp.college_email,
  COUNT(b.id) as bill_count
FROM profiles p
LEFT JOIN learners_profiles lp ON (p.email = lp.student_email OR p.email = lp.college_email)
LEFT JOIN billing_student_bills b ON b.student_id = lp.id
WHERE p.role = 'student'
  AND p.email = 'student@jkkn.ac.in'
GROUP BY p.id, p.email, p.role, lp.id, lp.student_email, lp.college_email;
*/

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- To rollback these changes, run:
/*
DROP POLICY IF EXISTS "Students can view their own bills" ON billing_student_bills;
DROP POLICY IF EXISTS "Students can view their own receipts" ON billing_receipts;
DROP POLICY IF EXISTS "Students can view their own invoices" ON billing_invoices;
*/
