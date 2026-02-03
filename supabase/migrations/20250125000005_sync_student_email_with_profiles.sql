-- Function to sync student email changes with profiles table
CREATE OR REPLACE FUNCTION sync_student_email_with_profile()
RETURNS TRIGGER AS $$
DECLARE
  existing_profile_id UUID;
  old_profile_id UUID;
  student_name TEXT;
BEGIN
  -- Only proceed if college_email has changed
  IF NEW.college_email IS DISTINCT FROM OLD.college_email THEN
    
    -- Build the student's full name
    student_name := TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
    
    -- Check if a profile exists with the new email
    SELECT id INTO existing_profile_id
    FROM profiles
    WHERE email = NEW.college_email
    LIMIT 1;
    
    -- Check if a profile exists with the old email
    IF OLD.college_email IS NOT NULL THEN
      SELECT id INTO old_profile_id
      FROM profiles
      WHERE email = OLD.college_email
      LIMIT 1;
    END IF;
    
    -- Case 1: Profile exists with new email - just update its details
    IF existing_profile_id IS NOT NULL THEN
      UPDATE profiles
      SET 
        institution_id = COALESCE(institution_id, NEW.institution_id),
        full_name = COALESCE(student_name, full_name),
        updated_at = NOW()
      WHERE id = existing_profile_id;
      
      RAISE NOTICE 'Updated existing profile % with student details', existing_profile_id;
      
    -- Case 2: Profile exists with old email and no profile with new email - update the email
    ELSIF old_profile_id IS NOT NULL THEN
      UPDATE profiles
      SET 
        email = NEW.college_email,
        full_name = student_name,
        institution_id = COALESCE(institution_id, NEW.institution_id),
        updated_at = NOW()
      WHERE id = old_profile_id;
      
      RAISE NOTICE 'Updated profile % email from % to %', old_profile_id, OLD.college_email, NEW.college_email;
    END IF;
    
    -- Note: We don't create new profiles here - that's handled by the complete-onboarding process
  END IF;
  
  -- Also sync name changes even if email hasn't changed
  IF (NEW.first_name IS DISTINCT FROM OLD.first_name OR 
      NEW.last_name IS DISTINCT FROM OLD.last_name) AND 
      NEW.college_email IS NOT NULL THEN
    
    student_name := TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
    
    UPDATE profiles
    SET 
      full_name = student_name,
      updated_at = NOW()
    WHERE email = NEW.college_email;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for student email sync
DROP TRIGGER IF EXISTS sync_student_email_trigger ON students;
CREATE TRIGGER sync_student_email_trigger
  AFTER UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION sync_student_email_with_profile();

-- Also create a function to fix existing mismatches
CREATE OR REPLACE FUNCTION fix_student_profile_mismatches()
RETURNS TABLE(
  students_fixed INTEGER,
  profiles_updated INTEGER
) AS $$
DECLARE
  fixed_count INTEGER := 0;
  profile_count INTEGER := 0;
BEGIN
  -- Fix profiles with null institution_id where student has institution_id
  UPDATE profiles p
  SET 
    institution_id = s.institution_id,
    updated_at = NOW()
  FROM students s
  WHERE p.email = s.college_email
    AND p.role = 'student'
    AND p.institution_id IS NULL
    AND s.institution_id IS NOT NULL;
  
  GET DIAGNOSTICS profile_count = ROW_COUNT;
  
  -- Fix name mismatches
  UPDATE profiles p
  SET 
    full_name = TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')),
    updated_at = NOW()
  FROM students s
  WHERE p.email = s.college_email
    AND p.role = 'student'
    AND p.full_name IS DISTINCT FROM TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, ''));
  
  GET DIAGNOSTICS fixed_count = ROW_COUNT;
  
  RETURN QUERY SELECT fixed_count, profile_count;
END;
$$ LANGUAGE plpgsql;

-- Run the fix function immediately
SELECT * FROM fix_student_profile_mismatches();

-- Add helpful comments
COMMENT ON FUNCTION sync_student_email_with_profile() IS 'Automatically syncs student email and name changes with the profiles table';
COMMENT ON FUNCTION fix_student_profile_mismatches() IS 'Fixes existing mismatches between students and profiles tables';