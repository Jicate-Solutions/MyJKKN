-- =====================================================
-- ADMISSION AND STUDENT TABLES FUNCTIONS AND POLICIES
-- =====================================================

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS safe_update_admission_status(uuid, text);
DROP FUNCTION IF EXISTS auto_populate_admission_institution();
DROP FUNCTION IF EXISTS auto_populate_student_institution();
DROP FUNCTION IF EXISTS generate_institution_application_id(uuid);
DROP FUNCTION IF EXISTS regenerate_application_id(uuid);
DROP FUNCTION IF EXISTS handle_student_date_insertion();
DROP FUNCTION IF EXISTS update_students_updated_at();
DROP FUNCTION IF EXISTS validate_student_semester_consistency();

-- =====================================================
-- 1. MAIN FUNCTION: safe_update_admission_status
-- This function updates admission status and creates student record when approved
-- =====================================================
CREATE OR REPLACE FUNCTION safe_update_admission_status(p_admission_id uuid, p_new_status text)
RETURNS SETOF admissions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_admission admissions;
  v_admission RECORD;
  current_user_id UUID;
  student_exists BOOLEAN;
  new_student_id UUID;
  v_date_of_birth DATE := NULL;
BEGIN
  -- Get current user
  current_user_id := auth.uid();

  -- Update the admission status
  UPDATE admissions
  SET 
    status = p_new_status,
    updated_by = current_user_id,
    updated_at = NOW()
  WHERE id = p_admission_id
  RETURNING * INTO updated_admission;

  -- Check if student already exists
  SELECT EXISTS(
    SELECT 1 FROM students WHERE admission_id = p_admission_id
  ) INTO student_exists;

  -- If status is approved and student doesn't exist, create a student record
  IF p_new_status = 'approved' AND NOT student_exists THEN
    -- Get the full admission record to access its fields
    SELECT * INTO v_admission FROM admissions WHERE id = p_admission_id;

    -- Insert student record *without* date_of_birth initially
    INSERT INTO students (
      admission_id, student_name, father_name, father_occupation, father_mobile,
      mother_name, mother_occupation, mother_mobile, gender, religion,
      community, caste, annual_income, last_school, board_of_study,
      tenth_marks, twelfth_marks, medical_cutoff_marks, engineering_cutoff_marks,
      neet_roll_number, counseling_applied, counseling_number, first_graduate,
      quota, category, institution_id, degree_id, department_id, program_id,
      entry_type, permanent_address_street, permanent_address_taluk,
      permanent_address_district, permanent_address_pin_code, permanent_address_state,
      student_mobile, student_email, accommodation_type, hostel_type,
      bus_required, bus_route, bus_pickup_location, reference_type,
      reference_name, reference_contact, status, created_by, updated_by
    )
    VALUES (
      v_admission.id, v_admission.student_name, v_admission.father_name, v_admission.father_occupation, v_admission.father_mobile,
      v_admission.mother_name, v_admission.mother_occupation, v_admission.mother_mobile, v_admission.gender, v_admission.religion,
      v_admission.community, v_admission.caste, v_admission.annual_income, v_admission.last_school, v_admission.board_of_study,
      v_admission.tenth_marks, v_admission.twelfth_marks, v_admission.medical_cutoff_marks, v_admission.engineering_cutoff_marks,
      v_admission.neet_roll_number, v_admission.counseling_applied, v_admission.counseling_number, v_admission.first_graduate,
      v_admission.quota, v_admission.category, v_admission.institution_id, v_admission.degree_id, v_admission.department_id, v_admission.program_id,
      v_admission.entry_type, v_admission.permanent_address_street, v_admission.permanent_address_taluk,
      v_admission.permanent_address_district, v_admission.permanent_address_pin_code, v_admission.permanent_address_state,
      v_admission.student_mobile, v_admission.student_email, v_admission.accommodation_type, v_admission.hostel_type,
      v_admission.bus_required, v_admission.bus_route, v_admission.bus_pickup_location, v_admission.reference_type,
      v_admission.reference_name, v_admission.reference_contact, 'pending', current_user_id, current_user_id
    )
    RETURNING id INTO new_student_id; -- Get the ID of the newly created student

    -- Now, safely update the date_of_birth for the new student
    IF v_admission.date_of_birth IS NOT NULL AND new_student_id IS NOT NULL THEN
      BEGIN
        -- Try to cast the text date to DATE format
        v_date_of_birth := v_admission.date_of_birth::DATE;

        -- Update the student record with the converted date
        UPDATE students
        SET date_of_birth = v_date_of_birth
        WHERE id = new_student_id;

      EXCEPTION WHEN OTHERS THEN
        -- If casting fails, log a warning or handle as needed, leave date_of_birth as NULL
        RAISE WARNING 'Could not convert date_of_birth text "%%" to DATE for student_id % (admission_id %)', 
          v_admission.date_of_birth, new_student_id, p_admission_id;
        -- date_of_birth remains NULL in the students table
      END;
    END IF;
  END IF;

  -- Return the updated admission record
  RETURN QUERY SELECT * FROM admissions WHERE id = p_admission_id;
END;
$$;

-- =====================================================
-- 2. AUTO-POPULATE INSTITUTION FUNCTIONS
-- =====================================================

-- Function to auto-populate institution_id for admissions
CREATE OR REPLACE FUNCTION auto_populate_admission_institution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
$$;

-- Function to auto-populate institution_id for students
CREATE OR REPLACE FUNCTION auto_populate_student_institution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
$$;

-- =====================================================
-- 3. APPLICATION ID GENERATION FUNCTIONS
-- =====================================================

-- Generate application ID based on institution
CREATE OR REPLACE FUNCTION generate_institution_application_id(institution_id_param uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
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
$$;

-- Regenerate application ID for existing admission
CREATE OR REPLACE FUNCTION regenerate_application_id(admission_id_param uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    institution_id_val UUID;
    new_app_id TEXT;
BEGIN
    -- Get the institution_id for this admission
    SELECT institution_id INTO institution_id_val
    FROM admissions
    WHERE id = admission_id_param;
    
    IF institution_id_val IS NULL THEN
        RAISE EXCEPTION 'Admission not found or has no institution assigned';
    END IF;
    
    -- Generate new application ID
    new_app_id := generate_institution_application_id(institution_id_val);
    
    -- Update the admission record
    UPDATE admissions 
    SET application_id = new_app_id
    WHERE id = admission_id_param;
    
    RETURN new_app_id;
END;
$$;

-- =====================================================
-- 4. STUDENT HELPER FUNCTIONS
-- =====================================================

-- Handle student date insertion
CREATE OR REPLACE FUNCTION handle_student_date_insertion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If date_of_birth is provided as text, try to convert it
  IF NEW.date_of_birth IS NOT NULL AND NEW.date_of_birth != '' THEN
    NEW.date_of_birth := convert_to_date(NEW.date_of_birth::text);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update students updated_at timestamp
CREATE OR REPLACE FUNCTION update_students_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Validate student semester consistency
CREATE OR REPLACE FUNCTION validate_student_semester_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
$$;

-- =====================================================
-- 5. CREATE TRIGGERS (IF NEEDED)
-- =====================================================

-- Trigger for auto-populating admission institution
CREATE TRIGGER auto_populate_admission_institution_trigger
    BEFORE INSERT ON admissions
    FOR EACH ROW
    EXECUTE FUNCTION auto_populate_admission_institution();

-- Trigger for auto-populating student institution
CREATE TRIGGER auto_populate_student_institution_trigger
    BEFORE INSERT ON students
    FOR EACH ROW
    EXECUTE FUNCTION auto_populate_student_institution();

-- Trigger for updating students updated_at
CREATE TRIGGER update_students_updated_at_trigger
    BEFORE UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION update_students_updated_at();

-- Trigger for validating student semester consistency
CREATE TRIGGER validate_student_semester_consistency_trigger
    BEFORE INSERT OR UPDATE OF semester_id, program_id ON students
    FOR EACH ROW
    EXECUTE FUNCTION validate_student_semester_consistency();

-- =====================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on tables
ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admin users can view all admissions" ON admissions;
DROP POLICY IF EXISTS "Admin users can insert admissions" ON admissions;
DROP POLICY IF EXISTS "Admin users can update admissions" ON admissions;
DROP POLICY IF EXISTS "Admin users can delete admissions" ON admissions;
DROP POLICY IF EXISTS "Faculty users can view institution admissions" ON admissions;
DROP POLICY IF EXISTS "Faculty users can insert institution admissions" ON admissions;
DROP POLICY IF EXISTS "Faculty users can update institution admissions" ON admissions;
DROP POLICY IF EXISTS "Faculty users can delete institution admissions" ON admissions;
DROP POLICY IF EXISTS "Admins can manage students in their institutions" ON students;
DROP POLICY IF EXISTS "Users can view students from accessible institutions" ON students;

-- =====================================================
-- ADMISSIONS TABLE POLICIES
-- =====================================================

-- Admin policies for admissions
CREATE POLICY "Admin users can view all admissions"
    ON admissions FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = ANY(ARRAY['administrator', 'super_admin'])
    ));

CREATE POLICY "Admin users can insert admissions"
    ON admissions FOR INSERT
    TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = ANY(ARRAY['administrator', 'super_admin'])
    ));

CREATE POLICY "Admin users can update admissions"
    ON admissions FOR UPDATE
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = ANY(ARRAY['administrator', 'super_admin'])
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = ANY(ARRAY['administrator', 'super_admin'])
    ));

CREATE POLICY "Admin users can delete admissions"
    ON admissions FOR DELETE
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = ANY(ARRAY['administrator', 'super_admin'])
    ));

-- Faculty policies for admissions
CREATE POLICY "Faculty users can view institution admissions"
    ON admissions FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'faculty'
        AND profiles.institution_id = admissions.institution_id
    ));

CREATE POLICY "Faculty users can insert institution admissions"
    ON admissions FOR INSERT
    TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'faculty'
        AND profiles.institution_id = admissions.institution_id
    ));

CREATE POLICY "Faculty users can update institution admissions"
    ON admissions FOR UPDATE
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'faculty'
        AND profiles.institution_id = admissions.institution_id
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'faculty'
        AND profiles.institution_id = admissions.institution_id
    ));

CREATE POLICY "Faculty users can delete institution admissions"
    ON admissions FOR DELETE
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'faculty'
        AND profiles.institution_id = admissions.institution_id
    ));

-- =====================================================
-- STUDENTS TABLE POLICIES
-- =====================================================

-- Admin policy for students (ALL operations)
CREATE POLICY "Admins can manage students in their institutions"
    ON students FOR ALL
    TO authenticated
    USING (
        (SELECT profiles.is_super_admin FROM profiles WHERE profiles.id = auth.uid()) = true
        OR (
            (SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = 'administrator'
            AND user_has_institution_access(auth.uid(), institution_id)
        )
    )
    WITH CHECK (
        (SELECT profiles.is_super_admin FROM profiles WHERE profiles.id = auth.uid()) = true
        OR (
            (SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = 'administrator'
            AND user_has_institution_access(auth.uid(), institution_id)
        )
    );

-- View policy for students
CREATE POLICY "Users can view students from accessible institutions"
    ON students FOR SELECT
    TO authenticated
    USING (
        (SELECT profiles.is_super_admin FROM profiles WHERE profiles.id = auth.uid()) = true
        OR user_has_institution_access(auth.uid(), institution_id)
    );

-- =====================================================
-- USAGE INSTRUCTIONS
-- =====================================================
-- 1. Make sure you have the required tables (admissions, students, profiles, institutions)
-- 2. Make sure you have the helper functions (convert_to_date, user_has_institution_access)
-- 3. Run this script in your Supabase SQL editor
-- 4. Test the safe_update_admission_status function by updating an admission status to 'approved'
-- 5. Verify that a student record is automatically created