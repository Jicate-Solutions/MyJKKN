-- Test migration to add a single foreign key and see actual errors
-- This will help diagnose why foreign keys aren't being created

-- Try to add just ONE foreign key to see the actual error
ALTER TABLE students 
ADD CONSTRAINT fk_students_institution_test
FOREIGN KEY (institution_id) 
REFERENCES institutions(id) 
ON DELETE CASCADE;