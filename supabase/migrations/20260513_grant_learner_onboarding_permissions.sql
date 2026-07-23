-- Migration: Grant `learners.onboarding.*` permissions to roles that already
-- manage learner profiles, so the new /learners/onboarding page is usable.
-- Date: 2026-05-13
-- Reason: Permission keys `learners.onboarding.view/edit/delete/bulk_update*`
--         were declared in `lib/constants/permissions.ts:273-278` but never
--         granted on most roles. New page launching today; without this grant
--         the page renders empty for everyone except admission_staff/principal/
--         hod/registrar/ceo/coo/executive_admin_officer who happened to already
--         have onboarding.view set somewhere along the way.
--
-- Pattern: jsonb `||` concatenation overwrites only the listed keys, preserving
-- every other permission already on the role. Same pattern used in
-- 20260513_grant_administrator_full_staff_access.sql.

-- 1. View + edit access for every role that currently manages learner profiles.
--    Includes counselor and faculty roles who need to read the table.
UPDATE public.custom_roles
SET
  permissions = COALESCE(permissions, '{}'::jsonb)
    || jsonb_build_object(
         'learners.onboarding.view', true,
         'learners.onboarding.edit', true
       ),
  updated_at = NOW()
WHERE role_key IN (
  'accountant_assistant',
  'accounts',
  'admission',
  'admission_staff',
  'administrator',
  'ceo',
  'coo',
  'executive_admin_officer',
  'expo_counselor',
  'faculty',
  'health_counselor',
  'hod',
  'learner_counselor',
  'principal',
  'registrar',
  'staff_counselor'
);

-- 2. Bulk-update + delete + export/import privileges only for admin-level roles.
UPDATE public.custom_roles
SET
  permissions = COALESCE(permissions, '{}'::jsonb)
    || jsonb_build_object(
         'learners.onboarding.delete', true,
         'learners.onboarding.bulk_update', true,
         'learners.onboarding.bulk_update.export', true,
         'learners.onboarding.bulk_update.import', true
       ),
  updated_at = NOW()
WHERE role_key IN (
  'administrator',
  'ceo',
  'coo',
  'executive_admin_officer',
  'principal',
  'hod',
  'registrar'
);

-- Refresh PostgREST schema cache so cached role rows are evicted
NOTIFY pgrst, 'reload schema';
