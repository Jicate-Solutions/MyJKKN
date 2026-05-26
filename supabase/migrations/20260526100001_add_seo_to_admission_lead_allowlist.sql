-- Add 'seo' role to the admission leads allowlist so SEO Specialist
-- users can view leads when they have admission.leads.view permission.

CREATE OR REPLACE FUNCTION public._user_in_admission_lead_allowlist(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
     WHERE ur.user_id = p_uid
       AND cr.role_key IN (
         'admission', 'admission_staff',
         'administrator',
         'ceo', 'coo', 'cbo', 'registrar',
         'admission_counselor', 'expo_counselor',
         'learner_counselor',   'staff_counselor',
         'seo'
       )
  );
$$;

COMMENT ON FUNCTION public._user_in_admission_lead_allowlist(uuid) IS
  'Defense-in-depth allowlist for admission.leads.view. Returns TRUE iff user holds one of: admission, admission_staff, administrator, ceo, coo, cbo, registrar, any of 4 counselor role_keys, or seo. Updated 2026-05-26 to include seo role.';
