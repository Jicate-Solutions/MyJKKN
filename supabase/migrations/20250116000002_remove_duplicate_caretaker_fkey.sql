-- Migration: Remove duplicate foreign key constraints
-- Date: 2025-01-16
-- Issue: Two FK constraints on resources.caretaker_user_id causing PostgREST errors
-- Error: PGRST200 - Could not find relationship in schema cache

-- Drop BOTH existing constraints to start fresh
ALTER TABLE resources
  DROP CONSTRAINT IF EXISTS resources_caretaker_user_id_fkey;

ALTER TABLE resources
  DROP CONSTRAINT IF EXISTS fk_resources_caretaker;

-- Recreate with the correct name pointing to staff table
-- Using the original constraint name that PostgREST expects
ALTER TABLE resources
  ADD CONSTRAINT resources_caretaker_user_id_fkey
  FOREIGN KEY (caretaker_user_id)
  REFERENCES staff(id)
  ON DELETE SET NULL;

-- Add comment explaining the relationship
COMMENT ON COLUMN resources.caretaker_user_id IS 'References staff.id - the staff member responsible for this resource';

-- Reload PostgREST schema cache to pick up changes
NOTIFY pgrst, 'reload schema';
