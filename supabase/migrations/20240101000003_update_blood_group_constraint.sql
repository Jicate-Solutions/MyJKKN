-- Migration to add new blood group types: A1+ and A1B
-- Drop the existing constraint
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_blood_group_check;

-- Add the updated constraint with new blood groups
ALTER TABLE staff ADD CONSTRAINT staff_blood_group_check 
CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'A1+', 'A1B')); 