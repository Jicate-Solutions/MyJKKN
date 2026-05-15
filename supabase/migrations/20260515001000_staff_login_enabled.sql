-- Staff Bulk-Upload Support for Labour / View-Only Employees
-- Spec: docs/superpowers/specs/2026-05-15-staff-bulk-upload-labour-employees-design.md
-- Adds per-row login_enabled, per-category allows_login default, and
-- per-profile is_login_disabled explicit flag.

BEGIN;

-- 1. Per-row flag on staff. Default true preserves existing behaviour.
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS login_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.staff.login_enabled IS
  'When false, this staff row is "view-only" — used for HR/payroll/attendance only. '
  'Linked profile is deactivated and synthetic @nolog.jkkn.local emails are used. '
  'Spec: 2026-05-15-staff-bulk-upload-labour-employees-design.md';

-- 2. Per-category default. UI lets user toggle per category; no rows seeded.
ALTER TABLE public.employment_categories
  ADD COLUMN IF NOT EXISTS allows_login BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.employment_categories.allows_login IS
  'When false, new staff added to this category default to login_enabled=false '
  '(view-only). Per-row override on staff still wins.';

-- 3. Explicit profile flag (additional fence beyond is_active).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_login_disabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_login_disabled IS
  'Set true by sync_staff_to_profiles trigger when the linked staff row has '
  'login_enabled=false. Independent of is_active for audit clarity.';

COMMIT;
