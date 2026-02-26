-- Migration: Add is_pre_registered column to profiles table
-- Date: 2026-02-26
-- Reason: Column was referenced in create_preregistered_profile() RPC function
--         and profiles_insert_preregistered RLS policy but was missing from the
--         profiles table schema definition, causing pre-registration to fail on
--         fresh deployments / environments where the column was not previously added.
-- Impact: Without this column, users added via the admin portal (Add User flow)
--         would not appear in the Users management page because pre-registration
--         silently failed, leaving no profile row for those users.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_pre_registered BOOLEAN DEFAULT false;

-- Backfill: existing rows get false (already the expected default)
UPDATE public.profiles SET is_pre_registered = false WHERE is_pre_registered IS NULL;
