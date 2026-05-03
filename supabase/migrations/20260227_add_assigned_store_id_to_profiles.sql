-- Migration: 2026-02-27
-- Add assigned_store_id to profiles table
--
-- Purpose:
--   Enables persistent store assignment during role allocation.
--   When an admin assigns the store_admin role to a user, they can now
--   also choose which IMS store that user manages. This value is written
--   to profiles.assigned_store_id and consumed by useImsStoreContext as
--   priority-2 auto-resolution (over the institution first-match fallback).
--
-- Resolution priority in useImsStoreContext after this migration:
--   1. Zustand / localStorage (persisted choice)
--   2. profiles.assigned_store_id  ← NEW
--   3. First active store for user's institution (existing fallback)
--   4. Manual selection required (Gate D)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS assigned_store_id UUID
    REFERENCES ims_stores(id)
    ON DELETE SET NULL;

-- Fast lookup when resolving store context on every IMS page load
CREATE INDEX IF NOT EXISTS idx_profiles_assigned_store_id
  ON profiles(assigned_store_id)
  WHERE assigned_store_id IS NOT NULL;

COMMENT ON COLUMN profiles.assigned_store_id IS
  'Pre-assigned IMS store for store_admin users. Set during role assignment. '
  'Takes priority over institution-based auto-resolution in useImsStoreContext. '
  'NULL means no explicit assignment — fall back to institution first-match or Gate D.';
