-- Function to validate student email changes before they happen
CREATE OR REPLACE FUNCTION validate_student_email_change()
RETURNS TRIGGER AS $$
DECLARE
  other_student_exists BOOLEAN;
  profile_role TEXT;
BEGIN
  -- Only validate if college_email is being changed
  IF NEW.college_email IS DISTINCT FROM OLD.college_email AND NEW.college_email IS NOT NULL THEN
    
    -- Check if another student already has this email
    SELECT EXISTS(
      SELECT 1 FROM students 
      WHERE college_email = NEW.college_email 
        AND id != NEW.id
    ) INTO other_student_exists;
    
    IF other_student_exists THEN
      RAISE EXCEPTION 'Email % is already assigned to another student', NEW.college_email;
    END IF;
    
    -- Check if a profile exists with this email and it's not a student role
    SELECT role INTO profile_role
    FROM profiles
    WHERE email = NEW.college_email
    LIMIT 1;
    
    IF profile_role IS NOT NULL AND profile_role != 'student' THEN
      RAISE EXCEPTION 'Email % is already assigned to a user with role: %', NEW.college_email, profile_role;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for validation (runs BEFORE update)
DROP TRIGGER IF EXISTS validate_student_email_trigger ON students;
CREATE TRIGGER validate_student_email_trigger
  BEFORE UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION validate_student_email_change();

-- Add index for better performance on email lookups
CREATE INDEX IF NOT EXISTS idx_students_college_email ON students(college_email);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

COMMENT ON FUNCTION validate_student_email_change() IS 'Validates student email changes to prevent conflicts with existing records';