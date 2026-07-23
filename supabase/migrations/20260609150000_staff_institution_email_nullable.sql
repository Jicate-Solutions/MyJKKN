-- Make staff.institution_email nullable.
--
-- WHY (production incident — HOD "UNABLE TO SAVE OR CREATE STAFF"):
--   Postgres rejected staff creation with
--     23502: null value in column "institution_email" of relation "staff"
--            violates not-null constraint
--
--   The application layer was already changed (BUG-003989 / BUG-003980 /
--   BUG-003962) to treat institution_email as OPTIONAL for ALL login-enabled
--   staff — many non-teaching employees (drivers, lab techs, admin assistants)
--   have no @jkkn.ac.in address:
--     - staff-form.tsx normalizes a blank field to undefined.
--     - StaffService.createStaff()/updateStaff() coerce blank -> NULL so the
--       UNIQUE index (staff_institution_email_key) doesn't collide on ''.
--     - The BEFORE trigger sync_staff_to_profiles() is already guarded by
--       `IF NEW.institution_email IS NOT NULL AND NEW.institution_email != ''`
--       and simply skips profile-link when it is NULL.
--
--   Three of the four layers (form, service, trigger) moved together, but the
--   table constraint did not — so the FIRST staff created without an
--   institution email (this HOD) hit the leftover NOT NULL. This migration
--   drops it, completing the optional-email change.
--
--   The UNIQUE index stays: NULLs are distinct in a btree unique index, so an
--   unlimited number of staff may have a NULL institution_email while real
--   addresses remain unique. No data backfill is needed (all existing rows
--   already have a value).
--
-- Idempotent: only drops the constraint if it is still NOT NULL.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'staff'
      AND column_name  = 'institution_email'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.staff
      ALTER COLUMN institution_email DROP NOT NULL;
    RAISE NOTICE 'staff.institution_email is now nullable.';
  ELSE
    RAISE NOTICE 'staff.institution_email already nullable — no change.';
  END IF;
END $$;

COMMENT ON COLUMN public.staff.institution_email IS
  'Institution (@jkkn.ac.in) email. OPTIONAL: NULL for staff without one '
  '(e.g. non-teaching / labour). UNIQUE when present; the sync_staff_to_profiles '
  'trigger skips profile creation/linking when NULL. Made nullable 2026-06-09.';
