-- =====================================================================
-- ORGANIZATION MODULE - COMPLETE SUPABASE BACKEND SETUP
-- =====================================================================
-- This file contains all the database components for the Organization Module
-- including tables, types, functions, triggers, RLS policies, and storage
-- =====================================================================

-- =====================================================================
-- 1. EXTENSIONS (if needed)
-- =====================================================================
-- UUID extension for primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 2. CUSTOM TYPES AND ENUMS
-- =====================================================================

-- Department type enum
CREATE TYPE department AS ENUM (
    'engineering',
    'science',
    'arts',
    'medical'
);

-- Department status enum
CREATE TYPE department_status AS ENUM (
    'active',
    'inactive',
    'archived'
);

-- =====================================================================
-- 3. STORAGE BUCKETS
-- =====================================================================

-- Create storage bucket for institution logos
INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
VALUES ('institution-logos', 'institution-logos', true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 4. TABLES
-- =====================================================================

-- =============================
-- 4.1 INSTITUTIONS TABLE
-- =============================
CREATE TABLE IF NOT EXISTS institutions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name varchar(255) NOT NULL,
    phone varchar(20),
    email varchar(255),
    website varchar(255),
    is_active boolean DEFAULT true,
    created_by uuid REFERENCES users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    counselling_code varchar(50),
    category varchar(20),
    accredited_by varchar(255),
    address_line1 varchar(255),
    address_line2 varchar(255),
    address_line3 varchar(255),
    city varchar(100),
    state varchar(100),
    country varchar(100),
    pin_code varchar(20),
    logo_url text,
    transportation_dept jsonb,
    administration_dept jsonb,
    accounts_dept jsonb,
    admission_dept jsonb,
    placement_dept jsonb,
    anti_ragging_dept jsonb,
    institution_type varchar(20),
    
    -- Add constraints
    CONSTRAINT institutions_category_check CHECK (category IN ('government', 'private', 'aided', 'autonomous'))
);

-- =============================
-- 4.2 DEPARTMENTS TABLE
-- =============================
CREATE TABLE IF NOT EXISTS departments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id uuid NOT NULL REFERENCES institutions(id),
    degree_id uuid NOT NULL REFERENCES degrees(id),
    department_code varchar(20) NOT NULL,
    department_name varchar(255) NOT NULL,
    is_active boolean DEFAULT true,
    created_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    
    -- Add unique constraint for department code per institution
    CONSTRAINT departments_institution_code_unique UNIQUE (institution_id, department_code)
);

-- =============================
-- 4.3 INSTITUTION DEPARTMENTS TABLE
-- =============================
CREATE TABLE IF NOT EXISTS institution_departments (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id uuid REFERENCES institutions(id),
    department_type varchar(50) NOT NULL,
    contact_name varchar(255) NOT NULL,
    designation varchar(100) NOT NULL,
    email varchar(255) NOT NULL,
    mobile varchar(20) NOT NULL,
    created_at timestamptz DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz DEFAULT timezone('utc'::text, now())
);

-- =============================
-- 4.4 USER INSTITUTION ACCESS TABLE
-- =============================
CREATE TABLE IF NOT EXISTS user_institution_access (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    institution_id uuid NOT NULL REFERENCES institutions(id),
    access_type varchar(50) NOT NULL DEFAULT 'full',
    granted_by uuid,
    granted_at timestamptz DEFAULT now(),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Foreign key constraints
    CONSTRAINT user_institution_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id),
    CONSTRAINT user_institution_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES profiles(id),
    CONSTRAINT fk_user_institution_access_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_user_institution_access_institution FOREIGN KEY (institution_id) REFERENCES institutions(id),
    CONSTRAINT fk_user_institution_access_granted_by FOREIGN KEY (granted_by) REFERENCES users(id),
    
    -- Unique constraints
    CONSTRAINT uk_user_institution_access_user_institution UNIQUE (user_id, institution_id),
    CONSTRAINT unique_user_institution_access UNIQUE (user_id, institution_id)
);

-- =====================================================================
-- 5. HELPER FUNCTIONS
-- =====================================================================

-- =============================
-- 5.1 TIMESTAMP UPDATE FUNCTIONS
-- =============================

-- Generic updated_at handler
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Institutions updated_at handler
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- User institution access updated_at handler
CREATE OR REPLACE FUNCTION update_user_institution_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================
-- 5.2 INSTITUTION ACCESS FUNCTIONS
-- =============================

-- Check if user has access to institution
CREATE OR REPLACE FUNCTION user_has_institution_access(user_id uuid, institution_id uuid)
RETURNS boolean AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant user access to institution
CREATE OR REPLACE FUNCTION grant_user_institution_access(
  target_user_id uuid,
  target_institution_id uuid,
  access_type_param varchar DEFAULT 'full',
  granted_by_param uuid DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Insert or update the access record
  INSERT INTO user_institution_access (
    user_id,
    institution_id,
    access_type,
    granted_by,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    target_user_id,
    target_institution_id,
    access_type_param,
    COALESCE(granted_by_param, auth.uid()),
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, institution_id)
  DO UPDATE SET
    access_type = access_type_param,
    granted_by = COALESCE(granted_by_param, auth.uid()),
    is_active = true,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke user access to institution
CREATE OR REPLACE FUNCTION revoke_user_institution_access(
  target_user_id uuid,
  target_institution_id uuid
)
RETURNS void AS $$
BEGIN
  -- Deactivate the access record instead of deleting
  UPDATE user_institution_access
  SET 
    is_active = false,
    updated_at = NOW()
  WHERE user_id = target_user_id 
    AND institution_id = target_institution_id;
    
  -- If no record was found, that's ok - the access didn't exist anyway
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user accessible institutions
CREATE OR REPLACE FUNCTION get_user_accessible_institutions(target_user_id uuid)
RETURNS TABLE (
  institution_id uuid,
  institution_name varchar(255),
  counselling_code varchar(50),
  access_type varchar(50),
  is_primary_institution boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id as institution_id,
    i.name as institution_name,
    i.counselling_code,
    CASE 
      WHEN p.is_super_admin = true THEN 'inherited'::varchar(50)
      WHEN p.institution_id = i.id THEN 'inherited'::varchar(50)
      ELSE uia.access_type
    END as access_type,
    CASE 
      WHEN p.institution_id = i.id THEN true 
      ELSE false 
    END as is_primary_institution
  FROM institutions i
  CROSS JOIN profiles p
  LEFT JOIN user_institution_access uia ON (uia.user_id = p.id AND uia.institution_id = i.id AND uia.is_active = true)
  WHERE p.id = target_user_id
  AND (
    p.is_super_admin = true
    OR p.institution_id = i.id
    OR (uia.institution_id = i.id AND uia.is_active = true)
  )
  ORDER BY is_primary_institution DESC, i.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current user's institution ID
CREATE OR REPLACE FUNCTION get_my_institution_id()
RETURNS uuid AS $$
DECLARE
    inst_id UUID;
BEGIN
    -- Try to get institution_id from auth.users metadata
    SELECT raw_user_meta_data->>'institution_id' INTO inst_id
    FROM auth.users
    WHERE id = auth.uid();

    -- Fallback: get from profiles table if metadata is null
    IF inst_id IS NULL THEN
        SELECT institution_id INTO inst_id
        FROM public.profiles
        WHERE id = auth.uid();
    END IF;

    RETURN inst_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================
-- 5.3 DEPARTMENT HELPER FUNCTIONS
-- =============================

-- Auto-populate department institution_id
CREATE OR REPLACE FUNCTION set_department_institution_id()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get courses by department count
CREATE OR REPLACE FUNCTION get_courses_by_department_count(inst_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  name varchar(255),
  count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.department_name AS name,
    COUNT(DISTINCT cm.course_id)::BIGINT AS count
  FROM
    departments d
  JOIN
    course_mappings cm ON d.id = cm.department_id
  WHERE
    (inst_ids IS NULL OR d.institution_id = ANY(inst_ids))
    AND d.is_active = TRUE
    AND cm.is_active = TRUE
  GROUP BY
    d.department_name
  ORDER BY
    count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================
-- 5.4 APPLICATION ID GENERATOR
-- =============================

-- Generate institution-specific application ID
CREATE OR REPLACE FUNCTION generate_institution_application_id(institution_id_param uuid)
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set institution application ID trigger function
CREATE OR REPLACE FUNCTION set_institution_application_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Only generate if application_id is NULL and institution_id is provided
    IF NEW.application_id IS NULL AND NEW.institution_id IS NOT NULL THEN
        NEW.application_id := generate_institution_application_id(NEW.institution_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get institution courses
CREATE OR REPLACE FUNCTION get_institution_courses(
  p_institution_id uuid,
  p_search_term text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  course_name varchar(255),
  course_code varchar(50)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.course_name,
    c.course_code
  FROM
    courses c
  WHERE
    c.institution_id = p_institution_id
    AND (c.is_active = TRUE OR c.is_active IS NULL)
    AND (
      p_search_term IS NULL
      OR p_search_term = ''
      OR c.course_name ILIKE '%' || p_search_term || '%'
      OR c.course_code ILIKE '%' || p_search_term || '%'
    )
  ORDER BY
    c.course_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 6. TRIGGERS
-- =====================================================================

-- =============================
-- 6.1 UPDATED_AT TRIGGERS
-- =============================

-- Institutions updated_at trigger
CREATE TRIGGER update_institutions_updated_at
    BEFORE UPDATE ON institutions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Departments updated_at trigger
CREATE TRIGGER set_departments_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

-- User institution access updated_at trigger
CREATE TRIGGER trigger_update_user_institution_access_updated_at
    BEFORE UPDATE ON user_institution_access
    FOR EACH ROW
    EXECUTE FUNCTION update_user_institution_access_updated_at();

-- =============================
-- 6.2 AUTO-POPULATION TRIGGERS
-- =============================

-- Auto-populate department institution_id on insert
CREATE TRIGGER trg_departments_set_institution_id
    BEFORE INSERT ON departments
    FOR EACH ROW
    EXECUTE FUNCTION set_department_institution_id();

-- =====================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

-- =============================
-- 7.1 ENABLE RLS ON TABLES
-- =============================
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_institution_access ENABLE ROW LEVEL SECURITY;

-- =============================
-- 7.2 INSTITUTIONS POLICIES
-- =============================

-- API keys can access institutions
CREATE POLICY "API keys can access institutions" ON institutions
FOR SELECT TO public
USING (
    EXISTS (
        SELECT 1
        FROM api_keys
        WHERE ((api_keys.key_value)::text = current_setting('request.header.apikey'::text, true))
        AND (api_keys.is_active = true)
        AND ((api_keys.expires_at IS NULL) OR (api_keys.expires_at > now()))
        AND (((api_keys.permissions ->> 'read'::text))::boolean = true)
    )
);

-- Enable read access for API keys (duplicate for compatibility)
CREATE POLICY "Enable read access for API keys" ON institutions
FOR SELECT TO public
USING (
    EXISTS (
        SELECT 1
        FROM api_keys
        WHERE ((api_keys.key_value)::text = current_setting('request.header.apikey'::text, true))
        AND (api_keys.is_active = true)
        AND ((api_keys.expires_at IS NULL) OR (api_keys.expires_at > now()))
        AND (((api_keys.permissions ->> 'read'::text))::boolean = true)
    )
);

-- Users can view accessible institutions
CREATE POLICY "Users can view accessible institutions" ON institutions
FOR SELECT TO authenticated
USING (
    user_has_institution_access(auth.uid(), id) 
    OR EXISTS (
        SELECT 1
        FROM profiles
        WHERE (profiles.id = auth.uid()) 
        AND (profiles.role = 'super_admin'::text)
    )
);

-- Admins can manage institutions
CREATE POLICY "Admins can manage institutions" ON institutions
FOR ALL TO authenticated
USING (
    (EXISTS (
        SELECT 1
        FROM profiles
        WHERE (profiles.id = auth.uid()) 
        AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['super_admin'::text, 'administrator'::text])))
    )) 
    AND (
        (EXISTS (
            SELECT 1
            FROM profiles
            WHERE (profiles.id = auth.uid()) 
            AND ((profiles.is_super_admin = true) OR (profiles.role = 'super_admin'::text))
        )) 
        OR user_has_institution_access(auth.uid(), id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE (profiles.id = auth.uid()) 
        AND ((profiles.is_super_admin = true) OR (profiles.role = ANY (ARRAY['super_admin'::text, 'administrator'::text])))
    )
);

-- =============================
-- 7.3 DEPARTMENTS POLICIES
-- =============================

-- Enable read access for API keys
CREATE POLICY "Enable read access for API keys" ON departments
FOR SELECT TO public
USING (
    EXISTS (
        SELECT 1
        FROM api_keys
        WHERE ((api_keys.key_value)::text = current_setting('request.header.apikey'::text, true))
        AND (api_keys.is_active = true)
        AND ((api_keys.expires_at IS NULL) OR (api_keys.expires_at > now()))
        AND (((api_keys.permissions ->> 'read'::text))::boolean = true)
    )
);

-- Users can view accessible departments
CREATE POLICY "Users can view accessible departments" ON departments
FOR SELECT TO authenticated
USING (
    user_has_institution_access(auth.uid(), institution_id) 
    OR EXISTS (
        SELECT 1
        FROM profiles
        WHERE (profiles.id = auth.uid()) 
        AND (profiles.role = 'super_admin'::text)
    )
);

-- Admins can manage departments
CREATE POLICY "departments_admin_all" ON departments
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE (profiles.id = auth.uid()) 
        AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text]))
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE (profiles.id = auth.uid()) 
        AND (profiles.role = ANY (ARRAY['administrator'::text, 'super_admin'::text]))
    )
);

-- Faculty can access departments in their institution
CREATE POLICY "departments_faculty_own_institution" ON departments
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE (profiles.id = auth.uid()) 
        AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = departments.institution_id) 
        AND (profiles.institution_id IS NOT NULL)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE (profiles.id = auth.uid()) 
        AND (profiles.role = 'faculty'::text) 
        AND (profiles.institution_id = departments.institution_id) 
        AND (profiles.institution_id IS NOT NULL)
    )
);

-- =============================
-- 7.4 STORAGE POLICIES
-- =============================

-- Allow public read access to institution logos
CREATE POLICY "Public can view institution logos" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'institution-logos');

-- Allow authenticated users to upload institution logos
CREATE POLICY "Authenticated users can upload institution logos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'institution-logos');

-- Allow users to update institution logos they have access to
CREATE POLICY "Users can update accessible institution logos" ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'institution-logos'
    AND (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = ANY (ARRAY['super_admin', 'administrator'])
        )
        OR
        EXISTS (
            SELECT 1 FROM institutions i
            WHERE i.logo_url LIKE '%' || name || '%'
            AND user_has_institution_access(auth.uid(), i.id)
        )
    )
);

-- Allow users to delete institution logos they have access to
CREATE POLICY "Users can delete accessible institution logos" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'institution-logos'
    AND (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = ANY (ARRAY['super_admin', 'administrator'])
        )
        OR
        EXISTS (
            SELECT 1 FROM institutions i
            WHERE i.logo_url LIKE '%' || name || '%'
            AND user_has_institution_access(auth.uid(), i.id)
        )
    )
);

-- =====================================================================
-- 8. INDEXES FOR PERFORMANCE
-- =====================================================================

-- Institutions indexes
CREATE INDEX IF NOT EXISTS idx_institutions_is_active ON institutions(is_active);
CREATE INDEX IF NOT EXISTS idx_institutions_counselling_code ON institutions(counselling_code);
CREATE INDEX IF NOT EXISTS idx_institutions_category ON institutions(category);
CREATE INDEX IF NOT EXISTS idx_institutions_created_by ON institutions(created_by);

-- Departments indexes
CREATE INDEX IF NOT EXISTS idx_departments_institution_id ON departments(institution_id);
CREATE INDEX IF NOT EXISTS idx_departments_degree_id ON departments(degree_id);
CREATE INDEX IF NOT EXISTS idx_departments_is_active ON departments(is_active);
CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(department_code);

-- User institution access indexes
CREATE INDEX IF NOT EXISTS idx_user_institution_access_user_id ON user_institution_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_institution_access_institution_id ON user_institution_access(institution_id);
CREATE INDEX IF NOT EXISTS idx_user_institution_access_is_active ON user_institution_access(is_active);
CREATE INDEX IF NOT EXISTS idx_user_institution_access_granted_by ON user_institution_access(granted_by);

-- Institution departments indexes
CREATE INDEX IF NOT EXISTS idx_institution_departments_institution_id ON institution_departments(institution_id);
CREATE INDEX IF NOT EXISTS idx_institution_departments_type ON institution_departments(department_type);

-- =====================================================================
-- 9. SAMPLE DATA (OPTIONAL - UNCOMMENT IF NEEDED)
-- =====================================================================

/*
-- Sample institution
INSERT INTO institutions (id, name, counselling_code, category, institution_type, address_line1, city, state, country, is_active)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Sample Engineering College',
    'SEC',
    'private',
    'engineering',
    '123 Education Street',
    'Chennai',
    'Tamil Nadu',
    'India',
    true
);

-- Sample departments
INSERT INTO departments (institution_id, degree_id, department_code, department_name, is_active)
VALUES 
    ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'CSE', 'Computer Science and Engineering', true),
    ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'ECE', 'Electronics and Communication Engineering', true),
    ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'MECH', 'Mechanical Engineering', true);

-- Sample institution departments (administrative)
INSERT INTO institution_departments (institution_id, department_type, contact_name, designation, email, mobile)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'administration', 'John Admin', 'Principal', 'principal@sample.edu', '+91-9876543210'),
    ('11111111-1111-1111-1111-111111111111', 'admission', 'Jane Admissions', 'Admission Officer', 'admissions@sample.edu', '+91-9876543211'),
    ('11111111-1111-1111-1111-111111111111', 'accounts', 'Bob Accounts', 'Chief Accountant', 'accounts@sample.edu', '+91-9876543212');
*/

-- =====================================================================
-- 10. COMMENTS AND DOCUMENTATION
-- =====================================================================

COMMENT ON TABLE institutions IS 'Main institutions/organizations table storing college/university information';
COMMENT ON TABLE departments IS 'Academic departments within institutions';
COMMENT ON TABLE institution_departments IS 'Administrative departments and their contact information';
COMMENT ON TABLE user_institution_access IS 'User access control for institutions';

COMMENT ON FUNCTION user_has_institution_access(uuid, uuid) IS 'Check if user has access to specific institution';
COMMENT ON FUNCTION grant_user_institution_access(uuid, uuid, varchar, uuid) IS 'Grant user access to institution';
COMMENT ON FUNCTION revoke_user_institution_access(uuid, uuid) IS 'Revoke user access from institution';
COMMENT ON FUNCTION get_user_accessible_institutions(uuid) IS 'Get list of institutions accessible to user';
COMMENT ON FUNCTION generate_institution_application_id(uuid) IS 'Generate unique application ID for institution';

-- =====================================================================
-- END OF ORGANIZATION MODULE SETUP
-- =====================================================================

-- Completion message
DO $$
BEGIN
    RAISE NOTICE 'Organization Module setup completed successfully!';
    RAISE NOTICE 'Tables created: institutions, departments, institution_departments, user_institution_access';
    RAISE NOTICE 'Storage bucket created: institution-logos';
    RAISE NOTICE 'Functions, triggers, and RLS policies applied';
END $$;