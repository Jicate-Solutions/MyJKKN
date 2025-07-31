-- =====================================================================
-- STAFF MODULE - COMPLETE SUPABASE BACKEND SETUP
-- =====================================================================
-- This file contains all the database components for the Staff Module
-- including tables, types, functions, triggers, RLS policies, and storage
-- =====================================================================

-- =====================================================================
-- 1. EXTENSIONS (if needed)
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "http";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- =====================================================================
-- 2. CUSTOM TYPES AND ENUMS
-- =====================================================================

-- Gender enum
CREATE TYPE gender_enum AS ENUM (
    'male',
    'female',
    'bigender'
);

-- Marital status enum
CREATE TYPE marital_status_enum AS ENUM (
    'single',
    'married',
    'divorced',
    'widow'
);

-- Blood group enum
CREATE TYPE blood_group_enum AS ENUM (
    'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'A1+', 'A1B'
);

-- =d===================================================================
-- 3. STORAGE BUCKETS
-- =====================================================================

-- Create storage bucket for staff images
INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
VALUES ('staff-images', 'staff-images', true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 4. TABLES
-- =====================================================================

-- =============================
-- 4.1 STAFF TABLE
-- =============================
CREATE TABLE IF NOT EXISTS staff (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name text NOT NULL,
    last_name text NOT NULL,
    gender text NOT NULL CHECK (gender = ANY (ARRAY['male'::text, 'female'::text, 'bigender'::text])),
    date_of_birth date NOT NULL,
    marital_status text NOT NULL CHECK (marital_status = ANY (ARRAY['single'::text, 'married'::text, 'divorced'::text, 'widow'::text])),
    blood_group text CHECK (blood_group = ANY (ARRAY['A+'::text, 'A-'::text, 'B+'::text, 'B-'::text, 'AB+'::text, 'AB-'::text, 'O+'::text, 'O-'::text, 'A1+'::text, 'A1B'::text])),
    email text NOT NULL UNIQUE,
    phone text NOT NULL,
    staff_id text UNIQUE,
    profile_picture text,
    address text,
    state text,
    district text,
    pincode text,
    date_of_joining date NOT NULL,
    designation text NOT NULL,
    category_id uuid NOT NULL,
    institution_id uuid NOT NULL,
    department_id uuid NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    institution_email text NOT NULL UNIQUE
);

-- =============================
-- 4.2 STAFF PLANS TABLE
-- =============================
CREATE TABLE IF NOT EXISTS staff_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL,
    degree_id uuid NOT NULL,
    department_id uuid NOT NULL,
    program_id uuid NOT NULL,
    semester_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz DEFAULT timezone('utc'::text, now())
);

-- =============================
-- 4.3 STAFF PLAN COURSES TABLE
-- =============================
CREATE TABLE IF NOT EXISTS staff_plan_courses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_plan_id uuid NOT NULL,
    course_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    staff_type varchar(50) NOT NULL,
    created_at timestamptz DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz DEFAULT timezone('utc'::text, now()),
    is_combined boolean DEFAULT false,
    
    CONSTRAINT unique_staff_course_plan UNIQUE (staff_id, course_id, staff_plan_id)
);

-- =============================
-- 4.4 TIMETABLE SLOT STAFF TABLE
-- =============================
CREATE TABLE IF NOT EXISTS timetable_slot_staff (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_slot_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    CONSTRAINT timetable_slot_staff_timetable_slot_id_staff_id_key UNIQUE (timetable_slot_id, staff_id)
);

-- =============================
-- 4.5 TIMETABLE SUB SLOT STAFF TABLE
-- =============================
CREATE TABLE IF NOT EXISTS timetable_sub_slot_staff (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_slot_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    created_at timestamptz DEFAULT now(),
    
    CONSTRAINT unique_sub_slot_staff UNIQUE (sub_slot_id, staff_id)
);

-- =====================================================================
-- 5. HELPER FUNCTIONS
-- =====================================================================

-- =============================
-- 5.1 TIMESTAMP UPDATE FUNCTIONS
-- =============================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_timetable_slot_staff_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================
-- 5.2 STAFF MANAGEMENT FUNCTIONS
-- =============================
CREATE OR REPLACE FUNCTION generate_temp_password()
RETURNS text AS $$
BEGIN
    RETURN 'Staff_' || SUBSTR(MD5(RANDOM()::TEXT), 1, 8) || '!';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_staff_auth_profile(
    staff_email text,
    staff_full_name text,
    staff_phone text,
    staff_institution_id uuid
)
RETURNS json AS $$
DECLARE
    temp_password TEXT;
    new_user_id UUID;
    result JSON;
BEGIN
    temp_password := generate_temp_password();
    
    INSERT INTO auth.users (
        id, email, encrypted_password, email_confirmed_at,
        created_at, updated_at, raw_user_meta_data, raw_app_meta_data,
        is_super_admin, role
    ) VALUES (
        gen_random_uuid(), staff_email, crypt(temp_password, gen_salt('bf')), NOW(),
        NOW(), NOW(), jsonb_build_object(
            'full_name', staff_full_name, 'role', 'faculty',
            'phone_number', staff_phone, 'institution_id', staff_institution_id
        ), '{}', false, 'authenticated'
    )
    RETURNING id INTO new_user_id;
    
    INSERT INTO profiles (
        id, email, full_name, role, phone_number, institution_id,
        is_active, profile_completed, created_at, updated_at
    ) VALUES (
        new_user_id, staff_email, staff_full_name, 'faculty',
        staff_phone, staff_institution_id, true, 'false',
        NOW(), NOW()
    );
    
    result := json_build_object(
        'success', true, 'user_id', new_user_id,
        'email', staff_email, 'temp_password', temp_password
    );
    
    RETURN result;
    
EXCEPTION WHEN OTHERS THEN
    result := json_build_object('success', false, 'error', SQLERRM, 'email', staff_email);
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sync_staff_to_profiles()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.institution_email IS NOT NULL AND NEW.institution_email != '' THEN
    UPDATE public.profiles 
    SET institution_id = NEW.institution_id, updated_at = NOW()
    WHERE email = NEW.institution_email;
    
    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM auth.users WHERE email = NEW.institution_email) THEN
        INSERT INTO public.profiles (
          id, email, full_name, role, institution_id, is_active,
          profile_completed, created_at, updated_at
        )
        SELECT 
          au.id, NEW.institution_email, CONCAT(NEW.first_name, ' ', NEW.last_name),
          'faculty', NEW.institution_id, true, false, NOW(), NOW()
        FROM auth.users au 
        WHERE au.email = NEW.institution_email
        ON CONFLICT (email) DO UPDATE SET
          institution_id = EXCLUDED.institution_id,
          full_name = EXCLUDED.full_name,
          updated_at = NOW();
          
        RAISE NOTICE 'Created/updated profile for institution_email: %', NEW.institution_email;
      ELSE
        RAISE NOTICE 'No auth user found for institution_email: %, skipping profile creation', NEW.institution_email;
      END IF;
    ELSE
      RAISE NOTICE 'Updated existing profile for institution_email: %', NEW.institution_email;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION lowercase_institution_email()
RETURNS TRIGGER AS $$
BEGIN
    NEW.institution_email = LOWER(NEW.institution_email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================
-- 5.3 TIMETABLE CONFLICT CHECK
-- =============================
CREATE OR REPLACE FUNCTION check_staff_timetable_conflicts(
    p_staff_id uuid,
    p_day_of_week text,
    p_period_id uuid,
    p_exclude_timetable_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM timetable_slots
  WHERE
    staff_id = p_staff_id AND
    day_of_week = p_day_of_week AND
    period_id = p_period_id AND
    (p_exclude_timetable_id IS NULL OR timetable_id != p_exclude_timetable_id);
    
  RETURN conflict_count > 0;
END;
$$ LANGUAGE plpgsql;

-- =============================
-- 5.4 STORAGE & EDGE FUNCTION TRIGGERS
-- =============================
CREATE OR REPLACE FUNCTION on_storage_object_deleted()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://kvizhngldtiuufknvehv.supabase.co/functions/v1/update-staff-on-image-delete',
    body := jsonb_build_object('type', TG_OP, 'record', OLD)::jsonb,
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2aXpobmdsZHRpdXVma252ZWh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk5MTk4MTQsImV4cCI6MjA0NTQ5NTgxNH0.ZJeXSLnkgYwvudeeKb2o2067CJ9an24FZLJVqAAreZg'
    )
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 6. TRIGGERS
-- =====================================================================

-- =============================
-- 6.1 STAFF TABLE TRIGGERS
-- =============================
CREATE TRIGGER trg_sync_staff_to_profiles_insert
    AFTER INSERT ON staff
    FOR EACH ROW EXECUTE FUNCTION sync_staff_to_profiles();

CREATE TRIGGER trg_sync_staff_to_profiles_update
    AFTER UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION sync_staff_to_profiles();

CREATE TRIGGER trigger_lowercase_institution_email_insert
    BEFORE INSERT ON staff
    FOR EACH ROW EXECUTE FUNCTION lowercase_institution_email();

CREATE TRIGGER trigger_lowercase_institution_email_update
    BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION lowercase_institution_email();

CREATE TRIGGER update_staff_updated_at
    BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================
-- 6.2 STAFF PLANS TRIGGERS
-- =============================
CREATE TRIGGER trigger_auto_populate_staff_plan_institution
    BEFORE INSERT ON staff_plans
    FOR EACH ROW EXECUTE FUNCTION auto_populate_staff_plan_institution();

CREATE TRIGGER update_staff_plans_updated_at
    BEFORE UPDATE ON staff_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================
-- 6.3 STAFF PLAN COURSES TRIGGER
-- =============================
CREATE TRIGGER update_staff_plan_courses_updated_at
    BEFORE UPDATE ON staff_plan_courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================
-- 6.4 TIMETABLE SLOT STAFF TRIGGER
-- =============================
CREATE TRIGGER update_timetable_slot_staff_updated_at
    BEFORE UPDATE ON timetable_slot_staff
    FOR EACH ROW EXECUTE FUNCTION update_timetable_slot_staff_updated_at();
    
-- =====================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

-- =============================
-- 7.1 ENABLE RLS ON TABLES
-- =============================
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_plan_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slot_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_sub_slot_staff ENABLE ROW LEVEL SECURITY;

-- =============================
-- 7.2 STAFF TABLE POLICIES
-- =============================
CREATE POLICY "Staff comprehensive access policy" ON staff FOR SELECT TO public
USING (is_super_admin() OR api_key_has_permission('read') OR 
  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'principal' AND profiles.institution_id = staff.institution_id)) OR 
  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'administrator' AND profiles.institution_id = staff.institution_id)) OR 
  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'faculty' AND profiles.institution_id = staff.institution_id)) OR 
  ((EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'faculty')) AND (id = get_staff_id_by_email(auth.email())))
);

CREATE POLICY "Staff delete policy" ON staff FOR DELETE TO public
USING (is_super_admin() OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['principal', 'administrator']))));

CREATE POLICY "Staff insert policy" ON staff FOR INSERT TO public
WITH CHECK (is_super_admin() OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['principal', 'administrator']))));

CREATE POLICY "Staff update policy" ON staff FOR UPDATE TO public
USING (is_super_admin() OR 
  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'principal' AND profiles.institution_id = staff.institution_id)) OR 
  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'administrator' AND profiles.institution_id = staff.institution_id)) OR 
  ((EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'faculty')) AND (id = get_staff_id_by_email(auth.email())))
)
WITH CHECK (is_super_admin() OR 
  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'principal' AND profiles.institution_id = staff.institution_id)) OR 
  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'administrator' AND profiles.institution_id = staff.institution_id)) OR 
  ((EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'faculty')) AND (id = get_staff_id_by_email(auth.email())))
);

-- =============================
-- 7.3 STAFF PLANS POLICIES
-- =============================
CREATE POLICY "Admin users can manage staff plans" ON staff_plans FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['administrator', 'super_admin'])))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['administrator', 'super_admin'])));

CREATE POLICY "Faculty users can manage their institution's staff plans" ON staff_plans FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'faculty' AND profiles.institution_id = staff_plans.institution_id))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'faculty' AND profiles.institution_id = staff_plans.institution_id));

CREATE POLICY "Users can view staff_plans from accessible institutions" ON staff_plans FOR SELECT TO authenticated
USING ((SELECT profiles.is_super_admin FROM profiles WHERE profiles.id = auth.uid()) = true OR user_has_institution_access(auth.uid(), institution_id));

-- =============================
-- 7.4 STAFF PLAN COURSES POLICIES
-- =============================
CREATE POLICY "Admin users can manage staff plan courses" ON staff_plan_courses FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['administrator', 'super_admin'])))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['administrator', 'super_admin'])));

CREATE POLICY "Faculty users can manage their institution's staff plan courses" ON staff_plan_courses FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles JOIN staff_plans ON staff_plans.institution_id = profiles.institution_id WHERE profiles.id = auth.uid() AND profiles.role = 'faculty' AND staff_plans.id = staff_plan_courses.staff_plan_id))
WITH CHECK (EXISTS (SELECT 1 FROM profiles JOIN staff_plans ON staff_plans.institution_id = profiles.institution_id WHERE profiles.id = auth.uid() AND profiles.role = 'faculty' AND staff_plans.id = staff_plan_courses.staff_plan_id));

-- =============================
-- 7.5 TIMETABLE SLOT STAFF POLICIES
-- =============================
CREATE POLICY "Users can manage slot staff for their institution" ON timetable_slot_staff FOR ALL TO public
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.is_super_admin = true OR p.role = 'super_admin' OR (EXISTS (SELECT 1 FROM timetable_slots ts JOIN timetables t ON ts.timetable_id = t.id WHERE ts.id = timetable_slot_staff.timetable_slot_id AND t.institution_id = p.institution_id)))))
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.is_super_admin = true OR p.role = 'super_admin' OR (EXISTS (SELECT 1 FROM timetable_slots ts JOIN timetables t ON ts.timetable_id = t.id WHERE ts.id = timetable_slot_staff.timetable_slot_id AND t.institution_id = p.institution_id)))));

-- =============================
-- 7.6 TIMETABLE SUB SLOT STAFF POLICIES
-- =============================
CREATE POLICY "Users can manage sub slot staff for their institution" ON timetable_sub_slot_staff FOR ALL TO public
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.is_super_admin = true OR p.role = 'super_admin' OR (EXISTS (SELECT 1 FROM timetable_sub_slots tss JOIN timetable_slots ts ON tss.parent_slot_id = ts.id JOIN timetables t ON ts.timetable_id = t.id WHERE tss.id = timetable_sub_slot_staff.sub_slot_id AND t.institution_id = p.institution_id)))))
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (p.is_super_admin = true OR p.role = 'super_admin' OR (EXISTS (SELECT 1 FROM timetable_sub_slots tss JOIN timetable_slots ts ON tss.parent_slot_id = ts.id JOIN timetables t ON ts.timetable_id = t.id WHERE tss.id = timetable_sub_slot_staff.sub_slot_id AND t.institution_id = p.institution_id)))));

-- =============================
-- 7.7 STORAGE POLICIES
-- =============================
CREATE POLICY "Authenticated users can manage staff images" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'staff-images')
WITH CHECK (bucket_id = 'staff-images');

-- =====================================================================
-- 8. INDEXES FOR PERFORMANCE
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_staff_institution_id ON staff(institution_id);
CREATE INDEX IF NOT EXISTS idx_staff_department_id ON staff(department_id);
CREATE INDEX IF NOT EXISTS idx_staff_category_id ON staff(category_id);
CREATE INDEX IF NOT EXISTS idx_staff_email ON staff(email);
CREATE INDEX IF NOT EXISTS idx_staff_institution_email ON staff(institution_email);

CREATE INDEX IF NOT EXISTS idx_staff_plans_institution_id ON staff_plans(institution_id);
CREATE INDEX IF NOT EXISTS idx_staff_plans_academic_year_id ON staff_plans(academic_year_id);

CREATE INDEX IF NOT EXISTS idx_staff_plan_courses_staff_plan_id ON staff_plan_courses(staff_plan_id);
CREATE INDEX IF NOT EXISTS idx_staff_plan_courses_course_id ON staff_plan_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_staff_plan_courses_staff_id ON staff_plan_courses(staff_id);

-- =====================================================================
-- END OF STAFF MODULE SETUP
-- =====================================================================
DO $$
BEGIN
    RAISE NOTICE 'Staff Module setup completed successfully!';
END $$;