-- Migration to remove degree_id from staff table
-- This removes the degree hierarchy requirement from staff

-- Drop the validation trigger first
DROP TRIGGER IF EXISTS staff_hierarchy_validation ON staff;
DROP FUNCTION IF EXISTS validate_staff_hierarchy();

-- Drop the foreign key constraint
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_degree_id_fkey;

-- Drop the index
DROP INDEX IF EXISTS idx_staff_degree_id;

-- Drop the degree_id column
ALTER TABLE staff DROP COLUMN IF EXISTS degree_id;

-- Update the comment to reflect the change
COMMENT ON TABLE staff IS 'Staff table without degree hierarchy - staff belong directly to departments'; 