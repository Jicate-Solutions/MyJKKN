-- Migration: Fix applications DELETE RLS policy role mismatch
-- Date: 2026-05-26
--
-- Problem: The API route accepted ['super_admin', 'administrator'] but the
-- RLS DELETE policy only allowed ['super_admin', 'admin']. Since the actual
-- admin users have role='administrator', the RLS silently blocked all deletes
-- (0 rows affected, no error). The client showed a success toast but nothing
-- was deleted.
--
-- Fix: Accept all three variants in RLS to match the API route.

DROP POLICY IF EXISTS "Enable delete for authenticated admins" ON public.applications;
CREATE POLICY "Enable delete for authenticated admins" ON public.applications
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin', 'administrator')
    )
  );
