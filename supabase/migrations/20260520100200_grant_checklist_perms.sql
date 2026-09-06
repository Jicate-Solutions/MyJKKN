-- ============================================================================
-- Grant Programme Checklist permissions to admission-side roles.
-- ----------------------------------------------------------------------------
-- Created: 2026-05-19
-- Purpose:
--   Four new permission keys declared in lib/constants/permissions.ts must
--   be paired with explicit JSONB grants (per feedback_reserved_perm_keys_
--   need_role_grants) or no role except super_admin can use them.
--
-- Granted:
--   admission         — all four keys (full module owner)
--   admission_staff   — view + mark only (cannot author templates)
--   super_admin bypasses unconditionally — no grant needed.
-- ============================================================================

-- Admission Officer: full control
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'admission.settings.checklists.view',   true,
  'admission.settings.checklists.manage', true,
  'admission.enquiries.checklist.view',   true,
  'admission.enquiries.checklist.mark',   true
)
WHERE role_key = 'admission'
  AND is_active = true;

-- Admission Staff: view + mark only (template authoring stays with admission officer)
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'admission.enquiries.checklist.view', true,
  'admission.enquiries.checklist.mark', true
)
WHERE role_key = 'admission_staff'
  AND is_active = true;
