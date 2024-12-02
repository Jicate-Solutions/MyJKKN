-- Remove institution and department columns from profiles table
ALTER TABLE profiles 
DROP COLUMN IF EXISTS institution,
DROP COLUMN IF EXISTS department; 