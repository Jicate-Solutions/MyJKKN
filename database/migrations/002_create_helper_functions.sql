-- Helper Functions for MyJKKN Application

-- Function to handle updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$function$;

-- Function to check user institution access
CREATE OR REPLACE FUNCTION public.user_has_institution_access(user_id uuid, institution_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
  user_profile RECORD;
BEGIN
  -- Get user profile
  SELECT * INTO user_profile FROM profiles WHERE profiles.id = user_id;
  
  -- If user doesn't exist, deny access
  IF user_profile IS NULL THEN
    RETURN false;
  END IF;
  
  -- Super admin has access to all institutions
  IF user_profile.is_super_admin = true OR user_profile.role = 'super_admin' THEN
    RETURN true;
  END IF;
  
  -- Check if user's primary institution matches
  IF user_profile.institution_id = institution_id THEN
    RETURN true;
  END IF;
  
  -- Check explicit institution access (properly qualified column references)
  IF EXISTS (
    SELECT 1 FROM user_institution_access 
    WHERE user_institution_access.user_id = user_has_institution_access.user_id 
    AND user_institution_access.institution_id = user_has_institution_access.institution_id 
    AND user_institution_access.is_active = true
  ) THEN
    RETURN true;
  END IF;
  
  -- Default deny
  RETURN false;
END;
$function$;

-- Function to generate institution application ID
CREATE OR REPLACE FUNCTION public.generate_institution_application_id(institution_id_param uuid)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    counselling_code TEXT;
    next_number INTEGER;
    new_application_id TEXT;
BEGIN
    -- Get the counselling code for the institution
    SELECT i.counselling_code INTO counselling_code
    FROM institutions i
    WHERE i.id = institution_id_param;
    
    -- If no counselling code found, use 'GEN' as fallback
    IF counselling_code IS NULL OR counselling_code = '' THEN
        counselling_code := 'GEN';
    END IF;
    
    -- Find the next number for this institution (without year filtering)
    SELECT COALESCE(MAX(
        CASE 
            WHEN application_id ~ ('^JKKN-' || counselling_code || '-[0-9]+$')
            THEN (regexp_split_to_array(application_id, '-'))[3]::INTEGER
            ELSE 0
        END
    ), 0) + 1 INTO next_number
    FROM admissions
    WHERE institution_id = institution_id_param;
    
    -- Generate the new application ID (without year)
    new_application_id := 'JKKN-' || counselling_code || '-' || LPAD(next_number::TEXT, 3, '0');
    
    RETURN new_application_id;
END;
$function$;

-- Function to set institution application ID
CREATE OR REPLACE FUNCTION public.set_institution_application_id()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    -- Only generate if application_id is NULL and institution_id is provided
    IF NEW.application_id IS NULL AND NEW.institution_id IS NOT NULL THEN
        NEW.application_id := generate_institution_application_id(NEW.institution_id);
    END IF;
    RETURN NEW;
END;
$function$;

-- Function to auto-populate admission institution
CREATE OR REPLACE FUNCTION public.auto_populate_admission_institution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- If institution_id is not set and user is faculty, auto-populate from profile
  IF NEW.institution_id IS NULL THEN
    SELECT profiles.institution_id INTO NEW.institution_id
    FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'faculty';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Function to auto-populate student institution
CREATE OR REPLACE FUNCTION public.auto_populate_student_institution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- If institution_id is not set and user is faculty, auto-populate from profile
  IF NEW.institution_id IS NULL THEN
    SELECT profiles.institution_id INTO NEW.institution_id
    FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'faculty';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Function to validate student semester consistency
CREATE OR REPLACE FUNCTION public.validate_student_semester_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    -- Skip validation if semester_id is NULL (allowed)
    IF NEW.semester_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Check if the semester belongs to the same program as the student
    IF NOT EXISTS (
        SELECT 1 
        FROM semesters s 
        WHERE s.id = NEW.semester_id 
        AND s.program_id = NEW.program_id
        AND s.institution_id = NEW.institution_id
    ) THEN
        RAISE EXCEPTION 'Semester hierarchy violation: Semester (%) does not belong to student program (%) in institution (%)', 
            NEW.semester_id, NEW.program_id, NEW.institution_id
            USING ERRCODE = 'foreign_key_violation',
                  HINT = 'Student can only be assigned to semesters within their program';
    END IF;
    
    RETURN NEW;
END;
$function$;

-- Function to validate program changes
CREATE OR REPLACE FUNCTION public.validate_program_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    -- If changing critical program fields, check student impact
    IF TG_OP = 'UPDATE' AND (
        OLD.institution_id != NEW.institution_id OR 
        OLD.department_id != NEW.department_id
    ) THEN
        -- Check if students or semesters would be affected
        IF EXISTS (
            SELECT 1 FROM students WHERE program_id = NEW.id
        ) OR EXISTS (
            SELECT 1 FROM semesters WHERE program_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Cannot modify program hierarchy: Students or semesters are linked to this program'
                USING ERRCODE = 'foreign_key_violation',
                      HINT = 'Remove student and semester associations before modifying program hierarchy';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$;

-- Function to validate semester program hierarchy
CREATE OR REPLACE FUNCTION public.validate_semester_program_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    -- If we're changing program_id of a semester, check if students are affected
    IF TG_OP = 'UPDATE' AND OLD.program_id != NEW.program_id THEN
        -- Check if any students would be affected by this change
        IF EXISTS (
            SELECT 1 
            FROM students s 
            WHERE s.semester_id = NEW.id 
            AND s.program_id != NEW.program_id
        ) THEN
            RAISE EXCEPTION 'Cannot change semester program_id: % students are assigned to this semester with different programs', 
                (SELECT COUNT(*) FROM students WHERE semester_id = NEW.id AND program_id != NEW.program_id)
                USING ERRCODE = 'foreign_key_violation',
                      HINT = 'Move students to appropriate semesters before changing semester program assignment';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$;

-- Auto-populate functions for academic entities
CREATE OR REPLACE FUNCTION public.auto_populate_academic_year_institution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- If institution_id is not set and user is faculty, auto-populate from profile
  IF NEW.institution_id IS NULL THEN
    SELECT profiles.institution_id INTO NEW.institution_id
    FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'faculty';
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_degree_institution_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- If institution_id is not provided, get it from the user's profile
  IF NEW.institution_id IS NULL THEN
    SELECT institution_id INTO NEW.institution_id
    FROM public.profiles 
    WHERE id = auth.uid() 
      AND institution_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_department_institution_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- If institution_id is not provided, get it from the user's profile
  IF NEW.institution_id IS NULL THEN
    SELECT institution_id INTO NEW.institution_id
    FROM public.profiles 
    WHERE id = auth.uid() 
      AND institution_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_program_institution_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- If institution_id is not provided, get it from the user's profile
  IF NEW.institution_id IS NULL THEN
    SELECT institution_id INTO NEW.institution_id
    FROM public.profiles 
    WHERE id = auth.uid() 
      AND institution_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_semester_institution_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- If institution_id is not provided, get it from the user's profile
  IF NEW.institution_id IS NULL THEN
    SELECT institution_id INTO NEW.institution_id
    FROM public.profiles 
    WHERE id = auth.uid() 
      AND institution_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_section_institution_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- If institution_id is not provided, get it from the user's profile
  IF NEW.institution_id IS NULL THEN
    SELECT institution_id INTO NEW.institution_id
    FROM public.profiles 
    WHERE id = auth.uid() 
      AND institution_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_course_institution_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- If institution_id is not provided, get it from the user's profile
  IF NEW.institution_id IS NULL THEN
    SELECT institution_id INTO NEW.institution_id
    FROM public.profiles 
    WHERE id = auth.uid() 
      AND institution_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$;