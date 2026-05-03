-- Migration: Add 'store_admin' to profiles.role CHECK constraint
-- Date: 2026-02-25
-- Reason: 'store_admin' was missing from the CHECK constraint list.
--   The sync_primary_role_trigger tried to UPDATE profiles SET role = 'store_admin'
--   when the store_admin role was assigned via role management UI, but the
--   constraint violation caused the trigger to fail silently.
--   This left profiles.role stuck at 'student', breaking sidebar menu detection.

-- Step 1: Drop the old constraint
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 2: Re-add with 'store_admin' included
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'student', 'staff', 'admin', 'super_admin', 'administrator',
    'faculty', 'hod', 'guest', 'driver', 'store_admin'
  ));

-- Step 3: Backfill existing users whose profiles.role is stale (still 'student')
--   but who have store_admin as their primary role in user_roles.
UPDATE public.profiles p
SET role = cr.role_key
FROM public.user_roles ur
JOIN public.custom_roles cr ON cr.id = ur.role_id
WHERE p.id = ur.user_id
  AND ur.is_primary = true
  AND cr.role_key = 'store_admin'
  AND p.role != 'store_admin';
