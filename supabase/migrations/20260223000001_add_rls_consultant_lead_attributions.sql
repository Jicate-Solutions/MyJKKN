-- Fix: add super_admin bypass to consultant_lead_attributions RLS policy.
-- The existing policy omits super_admin, causing INSERT to fail for super_admin users
-- because auth_institution_id() returns NULL for them.

ALTER TABLE consultant_lead_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consultant_lead_attributions_institution_access" ON consultant_lead_attributions;

CREATE POLICY "consultant_lead_attributions_institution_access"
  ON consultant_lead_attributions
  FOR ALL
  USING (
    -- Institution-scoped users
    institution_id = auth_institution_id()
    -- Super admin bypass (CRITICAL: super_admin has no institution_id)
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
    -- Active consultant can see/manage their own attributions
    OR EXISTS (
      SELECT 1 FROM education_consultants ec
      WHERE ec.referrer_user_id = auth.uid()
        AND ec.institution_id = consultant_lead_attributions.institution_id
        AND ec.id = consultant_lead_attributions.consultant_id
        AND ec.status = 'active'
    )
  )
  WITH CHECK (
    institution_id = auth_institution_id()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM education_consultants ec
      WHERE ec.referrer_user_id = auth.uid()
        AND ec.institution_id = consultant_lead_attributions.institution_id
        AND ec.id = consultant_lead_attributions.consultant_id
        AND ec.status = 'active'
    )
  );
