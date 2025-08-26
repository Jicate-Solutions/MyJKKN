-- Fix missing institution_id in student profiles
-- This ensures student profiles have the same institution_id as their student records

-- Fix specific case for boobal@jkkn.ac.in
UPDATE profiles 
SET institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843',
    updated_at = NOW()
WHERE email = 'boobal@jkkn.ac.in' 
  AND institution_id IS NULL;

-- Fix all student profiles with null institution_id by matching with their student records
UPDATE profiles p
SET institution_id = s.institution_id,
    updated_at = NOW()
FROM students s
WHERE p.role = 'student'
  AND p.institution_id IS NULL
  AND s.college_email = p.email
  AND s.institution_id IS NOT NULL;

-- Also check for profiles where email is in student_email field
UPDATE profiles p
SET institution_id = s.institution_id,
    updated_at = NOW()
FROM students s
WHERE p.role = 'student'
  AND p.institution_id IS NULL
  AND s.student_email = p.email
  AND s.institution_id IS NOT NULL;

-- Log the profiles that still don't have institution_id after this fix
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM profiles
  WHERE role = 'student' AND institution_id IS NULL;
  
  IF orphan_count > 0 THEN
    RAISE NOTICE '% student profiles still have NULL institution_id and may need manual review', orphan_count;
  END IF;
END $$;