-- ============================================================================
-- 20260813100007 — Register school_fees.* permission keys
-- ============================================================================
-- Design: docs/plans/2026-08-13-school-fee-structure-design.md §8
--
-- Same mechanism as 20260506100003: the project has NO permissions catalogue
-- or role_permissions join table — public.user_has_permission(text) reads the
-- JSONB `permissions` column on public.custom_roles.
--
-- KEY FORMAT WARNING: application code must use these keys BYTE-IDENTICALLY
-- ('school_fees.read', underscore in the namespace, dot before the verb).
-- Mixing 'school-fees.read' or 'school.fees.read' in the client produces a
-- silent permission denial with no error — the same drift class already logged
-- for the BOS module.
--
-- Grants (mirrors how billing roles are scoped elsewhere):
--   school_fees.read       → accounts, accountant_assistant, administrator, super_admin
--   school_fees.manage     → accounts, administrator, super_admin
--   school_fees.activate   → administrator, super_admin
--   school_fees.generate   → accounts, administrator, super_admin
--   school_fees.concession → accounts, administrator, super_admin
--
-- This migration only ADDS keys to custom_roles.permissions via the `||`
-- merge operator. No existing permission key is removed or overwritten, and no
-- college fee or billing permission is affected.
-- ============================================================================

-- school_fees.read — see plans, term calendars, schemes, generation history
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"school_fees.read": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('accounts','accountant_assistant','administrator','super_admin')
   AND COALESCE((permissions->>'school_fees.read')::boolean, false) = false;

-- school_fees.manage — create/edit draft plans, term calendars, clone, import
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"school_fees.manage": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('accounts','administrator','super_admin')
   AND COALESCE((permissions->>'school_fees.manage')::boolean, false) = false;

-- school_fees.activate — draft → active, and creating a v2 of a locked plan.
-- Enforced in the service layer on the status transition (RLS cannot express
-- "may change status but not amounts").
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"school_fees.activate": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('administrator','super_admin')
   AND COALESCE((permissions->>'school_fees.activate')::boolean, false) = false;

-- school_fees.generate — run the year-fee generation commit
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"school_fees.generate": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('accounts','administrator','super_admin')
   AND COALESCE((permissions->>'school_fees.generate')::boolean, false) = false;

-- school_fees.concession — manage concession schemes and learner assignments
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"school_fees.concession": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('accounts','administrator','super_admin')
   AND COALESCE((permissions->>'school_fees.concession')::boolean, false) = false;
