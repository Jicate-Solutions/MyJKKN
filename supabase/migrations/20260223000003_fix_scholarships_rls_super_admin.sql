-- Fix scholarships RLS: super_admin bypass
-- The original "Admins can manage scholarships" policy checked:
--   profiles.institution_id = scholarships.institution_id AND role IN (super_admin, admin)
-- For super_admin whose institution_id IS NULL, NULL = institution_id is always false,
-- so INSERT/UPDATE/DELETE were blocked. Split into two separate EXISTS checks.

DROP POLICY IF EXISTS "Admins can manage scholarships" ON scholarships;

CREATE POLICY "Admins can manage scholarships"
  ON scholarships FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.institution_id = scholarships.institution_id
        AND profiles.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.institution_id = scholarships.institution_id
        AND profiles.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );
