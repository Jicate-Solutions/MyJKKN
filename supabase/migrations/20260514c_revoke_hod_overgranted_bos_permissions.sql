-- Migration: 20260514c_revoke_hod_overgranted_bos_permissions.sql
--
-- Problem: Prior migrations over-granted three BOS permissions to the HOD role
-- in public.custom_roles.permissions:
--
--   1. academic.bos-syllabus.delete
--        Added by 20260511_rename_bos_syllabi_permissions_to_syllabus.sql:36
--        Contradicts:
--          - hooks/bos/use-bos-permissions.ts:60-69 (HOD canDelete: false)
--          - lib/services/bos/bos-role-permissions.ts:55-65 (no 'delete' on SYLLABI)
--          - __tests__/hooks/use-bos-permissions.test.ts:190 (asserts canDelete=false)
--
--   2. academic.bos-compositions.delete
--        Added by 20260512_grant_bos_compositions_dotformat_to_roles.sql:16
--        Contradicts:
--          - lib/services/bos/bos-role-permissions.ts:59 (only [view, create, edit])
--
--   3. academic.bos-taxonomy.edit
--        Added by 20260512_grant_bos_taxonomy_edit_to_roles.sql:14-25
--        Contradicts hook semantics: useBosPermissions() maps taxonomy edit to
--        canManageTaxonomy which is documented as HOD: false.
--
-- Fix: remove just these three keys from HOD's permissions JSONB. Uses the
-- jsonb '-' operator, which is a no-op when the key is absent (idempotent).
-- All other HOD BOS keys (syllabus create/edit/revise/duplicate/export,
-- compositions create/edit, meetings create/edit, courses, scheme, taxonomy.view)
-- are preserved.
--
-- Reversible via:
--   UPDATE public.custom_roles
--   SET permissions = permissions || jsonb_build_object(
--     'academic.bos-syllabus.delete', true,
--     'academic.bos-compositions.delete', true,
--     'academic.bos-taxonomy.edit', true
--   )
--   WHERE role_key = 'hod';

-- Note: the running DB carries legacy UNDERSCORE-format BOS permission keys
-- (academic.bos-syllabus_delete) alongside (or instead of) the canonical DOT
-- format (academic.bos-syllabus.delete). Both authorize, so we must strip both
-- variants — otherwise the underscore-format key continues granting the
-- permission we are trying to revoke.

BEGIN;

UPDATE public.custom_roles
SET
  permissions = permissions
    -- DOT-format (canonical, added by 20260511/20260512 dot-format migrations)
    - 'academic.bos-syllabus.delete'
    - 'academic.bos-compositions.delete'
    - 'academic.bos-taxonomy.edit'
    -- UNDERSCORE-format (legacy variant present in the live DB)
    - 'academic.bos-syllabus_delete'
    - 'academic.bos-compositions_delete'
    - 'academic.bos-taxonomy_edit',
  updated_at = NOW()
WHERE role_key = 'hod';

COMMIT;
