-- Migration: Fix resources caretaker foreign key
-- Date: 2025-01-16
-- Description: Change caretaker_user_id foreign key from profiles to staff table
--              since caretakers are selected from staff table, not profiles table

-- Drop the existing constraint
ALTER TABLE resources
  DROP CONSTRAINT IF EXISTS fk_resources_caretaker;

-- Add the correct constraint pointing to staff table
ALTER TABLE resources
  ADD CONSTRAINT fk_resources_caretaker
  FOREIGN KEY (caretaker_user_id)
  REFERENCES staff(id)
  ON DELETE SET NULL;

-- Add comment explaining the relationship
COMMENT ON COLUMN resources.caretaker_user_id IS 'References staff.id - the staff member responsible for this resource';
