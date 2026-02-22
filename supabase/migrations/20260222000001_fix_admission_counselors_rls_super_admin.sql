-- Migration: Fix admission_counselors RLS policy to allow super_admin bypass
-- Date: 2026-02-22
--
-- Problem: The "Institution users can manage counselors" FOR ALL policy lacked a
-- super_admin bypass and had no explicit WITH CHECK clause. Since super_admin profiles
-- have institution_id = null, the implicit USING-as-WITH_CHECK check failed for
-- super admins attempting to INSERT bridge rows via resolveOrCreateCounselor().
--
-- Fix: Restore the super_admin OR clause in both USING and WITH CHECK.

DROP POLICY IF EXISTS "Institution users can manage counselors" ON admission_counselors;

CREATE POLICY "Institution users can manage counselors"
  ON admission_counselors FOR ALL
  USING (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );
