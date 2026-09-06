-- ============================================================================
-- Grant the new Enquiry Activities permissions to admission-side roles.
-- ============================================================================
-- Created: 2026-05-19
-- Purpose:
--   Two new permission keys added to lib/constants/permissions.ts:
--     - admission.enquiries.activities.view
--     - admission.enquiries.activities.create
--
--   Per project rule (feedback_reserved_perm_keys_need_role_grants), catalog
--   keys must be paired with explicit JSONB grants — otherwise no role
--   except super_admin has the key and the feature stays invisible.
--
-- Granted to:
--   - admission (Admission Officer) — primary user of this feature
--   - admission_staff (Admission Staff)
--
-- super_admin bypasses unconditionally so no explicit grant needed.
-- Counselor roles deliberately do NOT receive these — matches the established
-- pattern (counselors prep leads but admission officers manage the post-
-- conversion enquiry journey).
-- ============================================================================

UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'admission.enquiries.activities.view', true,
  'admission.enquiries.activities.create', true
)
WHERE role_key IN ('admission', 'admission_staff')
  AND is_active = true;
