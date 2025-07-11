-- Migration to add degree_id to staff table for proper hierarchy
-- Institution → Degree → Department hierarchy

-- Add degree_id column to staff table
ALTER TABLE staff ADD COLUMN degree_id UUID REFERENCES degrees(id);

-- Add index for better query performance
CREATE INDEX idx_staff_degree_id ON staff(degree_id);

-- Update the staff table to ensure proper hierarchy constraint
-- We'll make degree_id required for new entries but allow existing entries to be NULL temporarily
-- This allows for gradual migration of existing data

-- Add a check constraint to ensure departments belong to the correct degree
-- (This will be enforced at the application level initially)

-- Update RLS policies to include degree filtering if needed
-- The existing policies should continue to work

-- Add a trigger to validate hierarchy consistency (optional)
CREATE OR REPLACE FUNCTION validate_staff_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if department belongs to the specified degree
    IF NEW.degree_id IS NOT NULL AND NEW.department_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM departments 
            WHERE id = NEW.department_id 
            AND degree_id = NEW.degree_id
        ) THEN
            RAISE EXCEPTION 'Department does not belong to the specified degree';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for hierarchy validation
CREATE TRIGGER staff_hierarchy_validation
    BEFORE INSERT OR UPDATE ON staff
    FOR EACH ROW
    EXECUTE FUNCTION validate_staff_hierarchy(); 