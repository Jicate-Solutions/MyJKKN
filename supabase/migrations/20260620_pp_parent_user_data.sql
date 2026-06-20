-- =====================================================================
-- Parent Portal — Parent User Data tool                         2026-06-20
--
-- 1. reset_password: plaintext of the password a staff admin LAST set via the
--    Parent User Data subtab, kept only so the credential export can show it.
--    NULL = never admin-reset (export falls back to the seed default JKKN@100).
--    Parent-chosen passwords are NEVER captured here. This surface is gated to
--    super_admin + principal only.
-- 2. Grant the gating permission to those two roles (declaring the key in
--    lib/constants/permissions.ts only populates Role Management; runtime reads
--    custom_roles.permissions).
-- Idempotent / re-runnable.
-- =====================================================================
ALTER TABLE public.pp_parent_accounts
  ADD COLUMN IF NOT EXISTS reset_password TEXT NULL;

COMMENT ON COLUMN public.pp_parent_accounts.reset_password IS
  'Plaintext of the password last set by a staff admin via the Parent User Data tool (credential export only). NULL = never admin-reset. Read surface gated to super_admin/principal.';

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('academic.parent_portal.user_data.manage', true),
       updated_at = now()
 WHERE role_key IN ('super_admin', 'principal')
   AND COALESCE((permissions->>'academic.parent_portal.user_data.manage')::boolean, false) = false;
