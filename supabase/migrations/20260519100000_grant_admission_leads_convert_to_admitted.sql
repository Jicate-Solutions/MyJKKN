-- ============================================================================
-- Grant admission.leads.convert_to_admitted permission to admin-side roles
-- ============================================================================
-- Created: 2026-05-19
-- Purpose:
--   Introduce a granular permission for the "Convert to Admitted" button on
--   /admission/leads/[id], which converts an admission_leads row into a
--   learners_profiles draft. Until today this action had NO permission gate
--   on either the UI or the API — any user with admission.leads.view could
--   trigger it, including all 5 counselor roles.
--
--   The catalog entry was added to lib/constants/permissions.ts so the
--   Role Management UI surfaces this key. Per the documented project rule
--   (see memory/feedback_reserved_perm_keys_need_role_grants.md), declaring
--   the key alone leaves every role's permissions JSONB untouched, so we
--   must also explicitly grant it to the roles that should keep the button.
--
-- Granted to (decided 2026-05-19):
--   - admission                  (Admission Officer)
--   - admission_staff            (Admission Staff)
--   - registrar                  (Group Registrar)
--   - ceo                        (Chief Executive Officer)
--   - coo                        (Chief Operating Officer)
--   - executive_admin_officer    (Executive Administrative Officer)
--
--   super_admin bypasses user_has_permission() unconditionally, so it does
--   not need an explicit grant.
--
-- NOT granted (intentional):
--   - admission_counselor, expo_counselor, health_counselor,
--     learner_counselor, staff_counselor — counselors prepare leads but
--     do not admit; that action is reserved for admission officers.
-- ============================================================================

UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'admission.leads.convert_to_admitted', true
)
WHERE role_key IN (
  'admission',
  'admission_staff',
  'registrar',
  'ceo',
  'coo',
  'executive_admin_officer'
)
  AND is_active = true;
