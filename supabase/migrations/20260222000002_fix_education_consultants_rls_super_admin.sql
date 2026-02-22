-- Migration: Fix education_consultants RLS policies to allow super_admin bypass
-- Date: 2026-02-22
--
-- Problem: The INSERT policy "Staff can insert consultants in their institution"
-- uses WITH CHECK that requires profiles.institution_id = education_consultants.institution_id.
-- When institution_id is omitted or null in the payload (e.g. profile not yet loaded),
-- SQL NULL comparison evaluates to NULL (not TRUE), causing the EXISTS to return no rows
-- → RLS violation. Additionally, super_admins should be able to manage consultants
-- across all institutions, not only their own.
--
-- Fix: Add OR role = 'super_admin' bypass to all four policies, consistent with the
-- pattern used in 20260222000001_fix_admission_counselors_rls_super_admin.sql.

-- ─── INSERT ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Staff can insert consultants in their institution" ON education_consultants;

CREATE POLICY "Staff can insert consultants in their institution"
  ON education_consultants FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.institution_id = education_consultants.institution_id
        AND profiles.role = ANY (ARRAY['admin', 'super_admin', 'staff', 'institution_admin', 'administrator'])
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- ─── SELECT ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view consultants in their institution" ON education_consultants;

CREATE POLICY "Users can view consultants in their institution"
  ON education_consultants FOR SELECT
  USING (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles WHERE profiles.id = auth.uid()
    )
    OR referrer_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- ─── UPDATE ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Staff can update consultants in their institution" ON education_consultants;

CREATE POLICY "Staff can update consultants in their institution"
  ON education_consultants FOR UPDATE
  USING (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = ANY (ARRAY['admin', 'super_admin', 'staff', 'institution_admin', 'administrator'])
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = ANY (ARRAY['admin', 'super_admin', 'staff', 'institution_admin', 'administrator'])
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );

-- ─── DELETE ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Staff can delete consultants in their institution" ON education_consultants;

CREATE POLICY "Staff can delete consultants in their institution"
  ON education_consultants FOR DELETE
  USING (
    institution_id IN (
      SELECT profiles.institution_id FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = ANY (ARRAY['admin', 'super_admin', 'staff', 'institution_admin', 'administrator'])
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  );
