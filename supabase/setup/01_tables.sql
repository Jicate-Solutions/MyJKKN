-- =====================================================
-- MYJKKN DATABASE TABLES - COMPLETE STRUCTURE
-- =====================================================
-- Purpose: All 56 table definitions matching actual database
-- Created: 2025-01-16
-- Last Updated: 2025-01-18 - Added unified learners_profiles table
--
-- IMPORTANT: This file now matches the EXACT database structure
-- All column names, types, and constraints match production DB
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types if not exists
DO $$ BEGIN
    CREATE TYPE student_status AS ENUM ('active', 'inactive', 'graduated', 'dropped', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create lifecycle_status ENUM for unified learner management
-- Created: 2025-01-18 - Supports complete learner lifecycle from enquiry to alumni
DO $$ BEGIN
    CREATE TYPE lifecycle_status AS ENUM (
        'enquiry',      -- Initial contact/enquiry stage
        'pending',      -- Application submitted, pending review
        'approved',     -- Application approved, ready for enrollment
        'account',      -- Sent to accounts team for billing
        'rejected',     -- Application rejected
        'waitlisted',   -- Application waitlisted
        'active',       -- Currently enrolled and active student
        'inactive',     -- Temporarily inactive (leave, suspension, etc.)
        'exited',       -- Left institution (dropout, transfer)
        'graduated',    -- Successfully completed program
        'alumni'        -- Post-graduation status
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- SECTION 1: USER AND AUTHENTICATION TABLES
-- =====================================================

-- Profiles table (extends Supabase auth.users)
-- Updated: 2026-04-14 - Added chk_role_not_guest to enforce invite-only policy
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT,
    full_name TEXT,
    phone_number TEXT,
    role TEXT NOT NULL DEFAULT 'student'::text,
    bio TEXT,
    gender TEXT,
    designation TEXT,
    avatar_url TEXT,
    profile_completed BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_login TIMESTAMPTZ,
    is_super_admin BOOLEAN,
    institution_id UUID,
    department_id UUID,
    learner_id UUID,
    CONSTRAINT chk_role_not_guest CHECK (role <> 'guest')
);

-- User Institution Access (Multi-tenancy)
CREATE TABLE IF NOT EXISTS public.user_institution_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    institution_id UUID NOT NULL,
    access_type VARCHAR(50) NOT NULL DEFAULT 'full'::character varying,
    granted_by UUID,
    granted_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- API Keys
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    key_value VARCHAR(255) NOT NULL,
    created_by UUID,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    permissions JSONB DEFAULT '{"read": true, "write": false}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- =====================================================
-- SECTION 2: ORGANIZATION STRUCTURE
-- =====================================================

-- Institutions table
CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    counselling_code VARCHAR(50),
    category VARCHAR(20),
    accredited_by VARCHAR(255),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    address_line3 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    logo_url TEXT,
    transportation_dept JSONB,
    administration_dept JSONB,
    accounts_dept JSONB,
    admission_dept JSONB,
    placement_dept JSONB,
    anti_ragging_dept JSONB,
    institution_type VARCHAR(20),
    pin_code VARCHAR(20),
    -- Updated: 2026-04-14 - Added entity_type to distinguish institutions from admin offices and companies
    entity_type VARCHAR(20) NOT NULL DEFAULT 'institution'
    CONSTRAINT chk_entity_type CHECK (entity_type IN ('institution', 'admin_office', 'company'))
);

-- Institution Departments (Contact Information)
CREATE TABLE IF NOT EXISTS public.institution_departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID,
    department_type VARCHAR(50) NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    designation VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    mobile VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Degrees table (Critical for hierarchy)
-- Updated: 2025-10-24 - Added display_name and degree_order columns for enhanced degree management
CREATE TABLE IF NOT EXISTS public.degrees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    degree_id VARCHAR(20) NOT NULL,
    degree_name VARCHAR(100) NOT NULL,
    degree_type VARCHAR(10) NOT NULL,
    display_name VARCHAR(100), -- Optional alternative display name
    degree_order INTEGER NOT NULL DEFAULT 0, -- Sort order for displaying degrees
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Departments table
-- Updated: 2025-10-24 - Added display_name and department_order columns for enhanced department management
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    degree_id UUID NOT NULL,
    department_code VARCHAR(20) NOT NULL,
    department_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255), -- Optional alternative display name
    department_order INTEGER NOT NULL DEFAULT 0, -- Sort order for displaying departments
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Programs table
-- Updated: 2025-12-29 - Added enhanced program fields (program_type, display_name, program_order, program_duration_yrs, pattern_type, is_part_time)
CREATE TABLE IF NOT EXISTS public.programs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID,
    degree_id UUID,
    department_id UUID,
    program_id TEXT NOT NULL,
    program_name TEXT NOT NULL,
    -- Enhanced program fields (added 2025-12-29)
    program_type VARCHAR(10) CHECK (program_type IN ('UG', 'PG', 'Ph.D')),
    display_name TEXT,
    program_order INTEGER DEFAULT 0,
    program_duration_yrs NUMERIC(3,1) CHECK (program_duration_yrs IS NULL OR program_duration_yrs > 0),
    pattern_type VARCHAR(10) CHECK (pattern_type IN ('Year', 'Semester')),
    is_part_time BOOLEAN DEFAULT false,
    -- Intake Capacity Fields (Added: 2025-01-31)
    sanctioned_intake INTEGER DEFAULT 0,
    actual_intake INTEGER DEFAULT 0,
    academic_year_id UUID,
    -- Standard fields
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- =====================================================
-- SECTION 3: ACADEMIC STRUCTURE
-- =====================================================

-- Academic Years
CREATE TABLE IF NOT EXISTS public.academic_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    academic_year_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Semesters
-- Updated: 2025-12-29 - Added enhanced semester fields (semester_order, initial_semester, terminal_semester, semester_group)
CREATE TABLE IF NOT EXISTS public.semesters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    degree_id UUID NOT NULL,
    department_id UUID NOT NULL,
    program_id UUID NOT NULL,
    semester_code VARCHAR(20) NOT NULL,
    semester_name VARCHAR(255) NOT NULL,
    semester_type VARCHAR(50) NOT NULL,
    -- Enhanced semester fields (added 2025-12-29)
    semester_order INTEGER DEFAULT 1,
    initial_semester BOOLEAN DEFAULT false,
    terminal_semester BOOLEAN DEFAULT false,
    semester_group VARCHAR(50),
    -- Standard fields
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Sections
CREATE TABLE IF NOT EXISTS public.sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    institution_id UUID NOT NULL,
    degree_id UUID,
    department_id UUID,
    program_id UUID,
    semester_id UUID
);

-- Courses
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID,
    course_code TEXT NOT NULL,
    course_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Course Mappings
CREATE TABLE IF NOT EXISTS public.course_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    degree_id UUID NOT NULL,
    department_id UUID NOT NULL,
    program_id UUID NOT NULL,
    semester_id UUID NOT NULL,
    course_id UUID NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Regulations (Academic Regulations)
-- Created: 2025-12-12 - Academic regulations management
CREATE TABLE IF NOT EXISTS public.regulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    regulation_year VARCHAR(10) NOT NULL,
    regulation_code VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT regulations_institution_code_unique UNIQUE (institution_id, regulation_code)
);
CREATE INDEX IF NOT EXISTS idx_regulations_institution_id ON regulations(institution_id);
CREATE INDEX IF NOT EXISTS idx_regulations_is_active ON regulations(is_active);

-- Batches (Academic Batches/Cohorts)
-- Created: 2025-12-12 - Academic batch/cohort management
CREATE TABLE IF NOT EXISTS public.batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL,
    batch_year VARCHAR(20) NOT NULL,
    batch_code VARCHAR(50) NOT NULL,
    batch_name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT batches_institution_code_unique UNIQUE (institution_id, batch_code),
    CONSTRAINT batches_date_check CHECK (end_date > start_date)
);
CREATE INDEX IF NOT EXISTS idx_batches_institution_id ON batches(institution_id);
CREATE INDEX IF NOT EXISTS idx_batches_is_active ON batches(is_active);

-- =====================================================
-- SECTION 4: LEARNER MANAGEMENT (UNIFIED)
-- Updated: 2025-01-18 - Unified admissions + students into learners_profiles
-- Legacy tables (students, admissions) maintained for backward compatibility
-- =====================================================

-- Learners Profiles table (Unified admissions + students)
-- Created: 2025-01-18 - Phase 1: Foundation of unified learner lifecycle management
-- Purpose: Single source of truth for all learner data from enquiry to alumni
-- Migration: Combines admissions (535 records) + students (2,971 records) = 3,506 total
CREATE TABLE IF NOT EXISTS public.learners_profiles (
    -- Primary identifiers
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id TEXT UNIQUE, -- Auto-generated JKKN-YYYY-####

    -- Migration lineage (for audit trail and rollback capability)
    original_admission_id UUID,     -- Source admission.id if migrated from admissions
    original_student_id UUID,       -- Source student.id if migrated from students
    migrated_at TIMESTAMPTZ,        -- When record was migrated
    migration_source TEXT,          -- 'admission', 'student', 'merged', or 'direct'

    -- Unified lifecycle status (replaces admission.status + student.status)
    lifecycle_status lifecycle_status NOT NULL DEFAULT 'enquiry',

    -- Personal Information (required from admission)
    first_name TEXT NOT NULL,
    last_name TEXT DEFAULT '',
    date_of_birth TEXT NOT NULL,
    gender TEXT NOT NULL,
    religion TEXT NOT NULL,
    community TEXT NOT NULL,
    caste TEXT,

    -- Parent/Guardian Information
    father_name TEXT NOT NULL,
    father_occupation TEXT,
    father_mobile TEXT NOT NULL,
    mother_name TEXT NOT NULL,
    mother_occupation TEXT,
    mother_mobile TEXT NOT NULL,
    annual_income TEXT,

    -- Previous Education
    last_school TEXT NOT NULL,
    board_of_study TEXT NOT NULL,
    tenth_marks JSONB NOT NULL,
    twelfth_marks JSONB NOT NULL,
    medical_cutoff_marks TEXT,
    engineering_cutoff_marks TEXT,
    neet_roll_number TEXT,
    neet_score TEXT,

    -- Advanced Analytics Fields (Added: 2025-01-31)
    school_type TEXT CHECK (school_type IN ('government', 'aided', 'private', 'cbse', 'icse', 'state_board')),
    school_district TEXT,
    school_taluk TEXT,
    medium_of_instruction TEXT CHECK (medium_of_instruction IN ('english', 'tamil', 'both')),
    location_type TEXT CHECK (location_type IN ('urban', 'semi_urban', 'rural')),

    -- Learner Classification (Added: 2026-03-18)
    learner_type TEXT, -- 'regular', 'irregular', 'intern'

    -- Admission/Counseling Information
    counseling_applied BOOLEAN DEFAULT false,
    counseling_number TEXT,
    first_graduate BOOLEAN DEFAULT false,
    quota TEXT,
    category TEXT,
    entry_type TEXT NOT NULL,

    -- Contact Information
    student_mobile TEXT NOT NULL,
    student_email TEXT NOT NULL,

    -- Address Information
    permanent_address_street TEXT NOT NULL,
    permanent_address_taluk TEXT,
    permanent_address_district TEXT NOT NULL,
    permanent_address_pin_code TEXT NOT NULL,
    permanent_address_state TEXT NOT NULL,

    -- Campus Life
    accommodation_type TEXT NOT NULL,
    hostel_type TEXT,
    food_type TEXT,
    -- Reference Information
    reference_type TEXT,
    reference_name TEXT,
    reference_contact TEXT,

    -- Finance/Fee Details (Added: 2026-03-04, Updated: 2026-03-13 - 5 fee structure types)
    application_fee NUMERIC(15,2) DEFAULT NULL,
    university_reg_fee NUMERIC(15,2) DEFAULT NULL,
    fee_structure_type TEXT DEFAULT NULL CHECK (fee_structure_type IN ('tuition_hostel', 'tuition_uniform_hospital', 'tuition_instruments_hospital', 'tuition_instruments', 'tuition_only')),
    tuition_fee NUMERIC(15,2) DEFAULT NULL,
    hostel_fee NUMERIC(15,2) DEFAULT NULL,
    dayscholar_fee NUMERIC(15,2) DEFAULT NULL, -- DEPRECATED: retained for backward compatibility
    uniform_fee NUMERIC(15,2) DEFAULT NULL,
    hospital_training_fee NUMERIC(15,2) DEFAULT NULL,
    placement_fee NUMERIC(15,2) DEFAULT NULL,
    transport_fee NUMERIC(15,2) DEFAULT NULL,

    -- Updated: 2026-04-15 - Dynamic fee line items (replaces preset fee_structure_type flow).
    -- Shape: [{ category_id, category_name, amount }] referencing billing_categories.
    fee_items JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Academic Assignment (unlocked after approval/enrollment)
    institution_id UUID,
    degree_id UUID,
    department_id UUID,
    program_id UUID,
    semester_id UUID,
    section_id UUID,
    academic_year_id UUID,
    regulation_id UUID,
    batch_id UUID,

    -- Student-specific fields (unlocked after enrollment)
    roll_number TEXT,
    register_number TEXT,
    college_email TEXT,
    student_photo_url TEXT,
    -- Updated: 2026-02-09 - Added NOT NULL constraint to prevent NULL values causing filter issues
    is_profile_complete BOOLEAN NOT NULL DEFAULT false,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by UUID,
    updated_by UUID
);

-- Intake History Table (Added: 2025-01-31)
-- Purpose: Track historical intake data for 3-year stability index and capacity analytics
CREATE TABLE IF NOT EXISTS public.intake_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    program_id UUID NOT NULL,
    academic_year_id UUID NOT NULL,
    sanctioned_intake INTEGER DEFAULT 0,
    actual_intake INTEGER DEFAULT 0,
    waitlist_count INTEGER DEFAULT 0,
    dropout_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(program_id, academic_year_id)
);

-- Indexes for intake_history analytics queries
CREATE INDEX IF NOT EXISTS idx_intake_history_program ON intake_history(program_id);
CREATE INDEX IF NOT EXISTS idx_intake_history_year ON intake_history(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_intake_history_institution ON intake_history(institution_id);

-- Indexes for learners_profiles analytics fields
CREATE INDEX IF NOT EXISTS idx_learners_profiles_school_type ON learners_profiles(school_type);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_location_type ON learners_profiles(location_type);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_medium_instruction ON learners_profiles(medium_of_instruction);

-- Index for programs academic year
CREATE INDEX IF NOT EXISTS idx_programs_academic_year ON programs(academic_year_id);

-- =====================================================
-- LEGACY TABLES (To be converted to VIEWs in Phase 2)
-- =====================================================

-- Students table (LEGACY - will become VIEW in Phase 2)
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_id UUID,
    father_name TEXT NOT NULL,
    father_occupation TEXT,
    father_mobile TEXT,
    mother_name TEXT NOT NULL,
    mother_occupation TEXT,
    mother_mobile TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    gender TEXT NOT NULL,
    religion TEXT NOT NULL,
    community TEXT NOT NULL,
    caste TEXT,
    annual_income TEXT,
    last_school TEXT NOT NULL,
    board_of_study TEXT NOT NULL,
    tenth_marks JSONB NOT NULL,
    twelfth_marks JSONB NOT NULL,
    medical_cutoff_marks TEXT,
    engineering_cutoff_marks TEXT,
    neet_roll_number TEXT,
    counseling_applied BOOLEAN DEFAULT false,
    counseling_number TEXT,
    first_graduate BOOLEAN DEFAULT false,
    quota TEXT,
    category TEXT,
    institution_id UUID,
    degree_id UUID,
    department_id UUID,
    program_id UUID,
    entry_type TEXT NOT NULL,
    permanent_address_street TEXT,
    permanent_address_taluk TEXT,
    permanent_address_district TEXT,
    permanent_address_pin_code TEXT,
    permanent_address_state TEXT,
    student_mobile TEXT,
    student_email TEXT,
    accommodation_type TEXT,
    hostel_type TEXT,
    reference_type TEXT,
    reference_name TEXT,
    reference_contact TEXT,
    roll_number TEXT,
    student_photo_url TEXT,
    college_email TEXT,
    -- Updated: 2026-02-09 - Added NOT NULL constraint to prevent NULL values causing filter issues
    is_profile_complete BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    status student_status DEFAULT 'active'::student_status,
    semester_id UUID,
    section_id UUID,
    academic_year_id UUID,
    first_name TEXT NOT NULL,
    last_name TEXT,
    application_id TEXT
);

-- Admissions table (LEGACY - will become VIEW in Phase 2)
CREATE TABLE IF NOT EXISTS public.admissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    father_name TEXT NOT NULL,
    father_occupation TEXT,
    father_mobile TEXT NOT NULL,
    mother_name TEXT NOT NULL,
    mother_occupation TEXT,
    mother_mobile TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    gender TEXT NOT NULL,
    religion TEXT NOT NULL,
    community TEXT NOT NULL,
    caste TEXT,
    annual_income TEXT,
    last_school TEXT NOT NULL,
    board_of_study TEXT NOT NULL,
    tenth_marks JSONB NOT NULL,
    twelfth_marks JSONB NOT NULL,
    medical_cutoff_marks TEXT,
    engineering_cutoff_marks TEXT,
    neet_roll_number TEXT,
    counseling_applied BOOLEAN DEFAULT false,
    counseling_number TEXT,
    first_graduate BOOLEAN DEFAULT false,
    quota TEXT,
    category TEXT,
    entry_type TEXT NOT NULL,
    permanent_address_street TEXT NOT NULL,
    permanent_address_taluk TEXT,
    permanent_address_district TEXT NOT NULL,
    permanent_address_pin_code TEXT NOT NULL,
    permanent_address_state TEXT NOT NULL,
    student_mobile TEXT NOT NULL,
    student_email TEXT NOT NULL,
    accommodation_type TEXT NOT NULL,
    hostel_type TEXT,
    reference_type TEXT,
    reference_name TEXT,
    reference_contact TEXT,
    status TEXT NOT NULL DEFAULT 'pending'::text,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by UUID,
    updated_by UUID,
    degree_id UUID,
    department_id UUID,
    program_id UUID,
    institution_id UUID,
    first_name TEXT NOT NULL,
    last_name TEXT DEFAULT ''::text,
    application_id TEXT
);

-- =====================================================
-- SECTION 5: STAFF MANAGEMENT
-- =====================================================

-- Staff table
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    marital_status TEXT NOT NULL,
    blood_group TEXT,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    staff_id TEXT,
    profile_picture TEXT,
    address TEXT,
    state TEXT,
    district TEXT,
    pincode TEXT,
    date_of_joining DATE NOT NULL,
    designation TEXT NOT NULL,
    category_id UUID NOT NULL,
    institution_id UUID NOT NULL,
    -- Updated: 2026-04-14 - Made nullable; department_id is only required for teaching staff.
    -- Conditional requirement enforced by trigger validate_staff_department_scope().
    department_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by UUID,
    updated_by UUID,
    institution_email TEXT NOT NULL,
    -- Updated: 2026-04-14 - role_key FK to custom_roles.role_key; drives dynamic role assignment on profile sync.
    role_key VARCHAR(50) NOT NULL DEFAULT 'faculty' REFERENCES public.custom_roles(role_key) ON UPDATE CASCADE
);

-- Employment Categories
-- Updated: 2026-04-14 - Added is_teaching flag to discriminate teaching vs non-teaching staff
CREATE TABLE IF NOT EXISTS public.employment_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_teaching BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by UUID,
    updated_by UUID
);

-- Staff Plans
CREATE TABLE IF NOT EXISTS public.staff_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    staff_id UUID NOT NULL,
    academic_year_id UUID NOT NULL,
    semester_id UUID NOT NULL,
    total_hours INTEGER,
    weekly_hours INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Staff Plan Courses
CREATE TABLE IF NOT EXISTS public.staff_plan_courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_plan_id UUID NOT NULL,
    course_id UUID NOT NULL,
    section_id UUID NOT NULL,
    hours_per_week INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Class Incharges
-- Added: 2026-03-08 - Assigns one or more staff as class incharges per section
CREATE TABLE IF NOT EXISTS public.class_incharges (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID        NOT NULL REFERENCES public.institutions(id),
    section_id     UUID        NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
    staff_id       UUID        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    is_active      BOOLEAN     NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID        REFERENCES public.profiles(id),
    updated_by     UUID        REFERENCES public.profiles(id),
    CONSTRAINT class_incharges_unique_assignment UNIQUE (section_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_class_incharges_institution_id ON public.class_incharges(institution_id);
CREATE INDEX IF NOT EXISTS idx_class_incharges_section_id     ON public.class_incharges(section_id);
CREATE INDEX IF NOT EXISTS idx_class_incharges_staff_id       ON public.class_incharges(staff_id);

ALTER TABLE public.class_incharges ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECTION 6: ATTENDANCE MANAGEMENT
-- =====================================================

-- Student Attendance
-- Updated: 2025-10-08 - Added period_slot_id for multi-section attendance tracking
CREATE TABLE IF NOT EXISTS public.student_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendance_date DATE NOT NULL,
    marked_by UUID NOT NULL,
    institution_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    timetable_id UUID NOT NULL,
    section_id UUID NOT NULL,
    attendance_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    period_slot_id TEXT
);

-- Periods
CREATE TABLE IF NOT EXISTS public.periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_break BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    institution_id UUID
);

-- =====================================================
-- SECTION 7: TIMETABLE MANAGEMENT
-- =====================================================

-- Timetables
-- Updated: 2025-10-08 - Added timetable_type for semester-level timetables support
-- Changed semester/section from TEXT to UUID (semester_id/section_id)
CREATE TABLE IF NOT EXISTS public.timetables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID,
    academic_year_id UUID,
    degree_id UUID,
    program_id UUID,
    department_id UUID,
    timetable_name TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    is_template BOOLEAN DEFAULT false,
    template_name TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    start_date DATE,
    end_date DATE,
    selected_days JSONB DEFAULT '["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]'::jsonb,
    timetable_format TEXT NOT NULL DEFAULT 'regular'::text,
    selected_dates JSONB,
    timetable_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    periods JSONB NOT NULL DEFAULT '[]'::jsonb,
    migrated_from_old_structure BOOLEAN DEFAULT true,
    migration_timestamp TIMESTAMPTZ DEFAULT now(),
    semester_id UUID,
    section_id UUID,
    timetable_type VARCHAR(20) DEFAULT 'section',
    template_description TEXT,
    template_category TEXT,
    template_tags JSONB DEFAULT '[]'::jsonb,
    usage_count INTEGER DEFAULT 0,
    created_from_template_id UUID,
    -- Updated: 2026-03-22 - Added cycle-based timetable support
    num_cycles INTEGER DEFAULT NULL CHECK (num_cycles IS NULL OR (num_cycles >= 1 AND num_cycles <= 52))
);

-- Timetable Slot Continuity
CREATE TABLE IF NOT EXISTS public.timetable_slot_continuity (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timetable_id UUID NOT NULL,
    day_of_week TEXT NOT NULL,
    period_id UUID NOT NULL,
    course_id UUID NOT NULL,
    staff_id UUID NOT NULL,
    slot_type VARCHAR(20) NOT NULL,
    group_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- SECTION 8: BILLING AND FINANCE
-- =====================================================

-- Billing Categories (flat, dynamic)
-- Updated: 2026-04-15 - Consolidated 3-tier (parent/sub/item) hierarchy into a single flat table.
CREATE TABLE IF NOT EXISTS public.billing_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    category_name VARCHAR(150) NOT NULL,
    amount NUMERIC(15,2),
    frequency VARCHAR(20) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    CONSTRAINT uq_billing_categories_name_per_institution UNIQUE (institution_id, category_name)
);

-- Billing Student Bills
CREATE TABLE IF NOT EXISTS public.billing_student_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL,
    institution_id UUID NOT NULL,
    category_id UUID,  -- Renamed 2026-04-15 from item_category_id (flat billing_categories)
    bill_description TEXT NOT NULL,
    due_date DATE NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_amount NUMERIC(15,2) NOT NULL,
    total_amount NUMERIC(15,2) NOT NULL,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    final_amount NUMERIC(15,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'unpaid'::character varying,
    payment_date TIMESTAMPTZ,
    balance_amount NUMERIC(15,2) DEFAULT 0,
    remarks TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern VARCHAR(20),
    number_of_recurrences INTEGER,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Billing Invoices
CREATE TABLE IF NOT EXISTS public.billing_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(50) NOT NULL,
    invoice_type VARCHAR(20) NOT NULL,
    invoice_date DATE NOT NULL,
    student_id UUID NOT NULL,
    institution_id UUID NOT NULL,
    billing_period_from DATE,
    billing_period_to DATE,
    invoice_description TEXT,
    tax_summary JSONB,
    payment_terms TEXT,
    due_date DATE,
    additional_charges NUMERIC(15,2) DEFAULT 0,
    discount_applied NUMERIC(15,2) DEFAULT 0,
    grand_total NUMERIC(15,2) NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Billing Invoice Items
CREATE TABLE IF NOT EXISTS public.billing_invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL,
    receipt_id UUID NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Billing Receipts
CREATE TABLE IF NOT EXISTS public.billing_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_number VARCHAR(50) NOT NULL,
    receipt_date DATE NOT NULL,
    student_id UUID NOT NULL,
    institution_id UUID NOT NULL,
    payment_mode VARCHAR(20) NOT NULL,
    payment_reference_number VARCHAR(100),
    payment_amount NUMERIC(15,2) NOT NULL,
    payment_paid_date DATE NOT NULL,
    payer_name VARCHAR(255) NOT NULL,
    payer_contact VARCHAR(20),
    accountant_id UUID,
    payment_remarks TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Billing Receipt Items
CREATE TABLE IF NOT EXISTS public.billing_receipt_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id UUID NOT NULL,
    bill_id UUID NOT NULL,
    amount_paid NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Billing Discounts
CREATE TABLE IF NOT EXISTS public.billing_discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_id UUID NOT NULL,
    discount_category VARCHAR(50) NOT NULL,
    discount_type VARCHAR(20) NOT NULL,
    discount_value NUMERIC(15,2) NOT NULL,
    discount_amount NUMERIC(15,2) NOT NULL,
    discount_reason TEXT NOT NULL,
    supporting_documents JSONB,
    authorizer_id UUID,
    approval_date DATE,
    approval_status VARCHAR(20) DEFAULT 'pending'::character varying,
    effective_date DATE NOT NULL,
    expiry_date DATE,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Billing Refunds
CREATE TABLE IF NOT EXISTS public.billing_refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id UUID NOT NULL,
    refund_category VARCHAR(50) NOT NULL,
    refund_amount NUMERIC(15,2) NOT NULL,
    refund_date DATE NOT NULL,
    refund_method VARCHAR(20) NOT NULL,
    bank_details JSONB,
    refund_reason TEXT NOT NULL,
    supporting_documents JSONB,
    authorizer_id UUID,
    processing_fee NUMERIC(15,2) DEFAULT 0,
    net_refund_amount NUMERIC(15,2) NOT NULL,
    approval_status VARCHAR(20) DEFAULT 'pending'::character varying,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    approved_by UUID
);

-- =====================================================
-- SECTION 9: APPLICATION MANAGEMENT
-- =====================================================

-- Categories
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID
);

-- Subcategories
CREATE TABLE IF NOT EXISTS public.subcategories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id UUID NOT NULL,
    created_by UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_by UUID
);

-- Applications
-- Updated: 2025-01-17 - Added parent authentication support fields
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    url VARCHAR(255) NOT NULL,
    description TEXT,
    roles_access VARCHAR[] NOT NULL DEFAULT '{}'::character varying[],
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    integration_type VARCHAR(255) NOT NULL,
    auth_method VARCHAR(255) NOT NULL,
    tags VARCHAR[] DEFAULT '{}'::character varying[],
    support_contact JSONB,
    supported_platforms VARCHAR(255) NOT NULL,
    api_endpoints JSONB DEFAULT '[]'::jsonb,
    application_type VARCHAR(255) NOT NULL,
    data_sensitivity VARCHAR(255) NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    category_id UUID NOT NULL,
    subcategory_id UUID,
    icon_path TEXT,
    screenshots TEXT[],
    -- Parent authentication fields (optional)
    -- Note: Uses existing roles_access field for role-based permissions
    uses_parent_auth BOOLEAN DEFAULT false,
    app_id VARCHAR(100) UNIQUE,
    api_key_hash VARCHAR(255),
    allowed_redirect_uris TEXT[],
    allowed_scopes VARCHAR(50)[] DEFAULT '{read,write,profile}'::character varying[],
    rate_limit_requests INTEGER DEFAULT 1000,
    rate_limit_window_minutes INTEGER DEFAULT 60,
    last_auth_activity TIMESTAMPTZ,
    auth_enabled_at TIMESTAMPTZ,
    auth_enabled_by UUID REFERENCES profiles(id) -- Updated: 2025-01-27 - Use profiles table instead of auth.users
);

-- =====================================================
-- SECTION 10: NOTIFICATIONS
-- =====================================================

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT,
    icon TEXT,
    created_by UUID NOT NULL,
    targeting JSONB NOT NULL,
    priority TEXT DEFAULT 'normal'::text,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    category TEXT DEFAULT 'general'::text,
    sent_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ
);

-- User Notifications
CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID NOT NULL,
    user_id UUID NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Push Subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    subscription JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- SECTION 11: RESOURCE MANAGEMENT
-- =====================================================

-- Resource Parent Categories
CREATE TABLE IF NOT EXISTS public.resource_parent_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_name VARCHAR(50),
    color_code VARCHAR(7),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Resource Sub Categories
CREATE TABLE IF NOT EXISTS public.resource_sub_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    parent_category_id UUID NOT NULL,
    sub_category_name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_name VARCHAR(50),
    color_code VARCHAR(7),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Resource Attribute Definitions
CREATE TABLE IF NOT EXISTS public.resource_attribute_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    sub_category_id UUID NOT NULL,
    attribute_name VARCHAR(100) NOT NULL,
    attribute_type VARCHAR(20) NOT NULL,
    is_required BOOLEAN DEFAULT false,
    default_value TEXT,
    validation_rules JSONB,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Resources
CREATE TABLE IF NOT EXISTS public.resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    parent_category_id UUID NOT NULL,
    sub_category_id UUID NOT NULL,
    resource_code VARCHAR(50) NOT NULL,
    resource_name VARCHAR(200) NOT NULL,
    description TEXT,
    location VARCHAR(200),
    capacity INTEGER,
    resource_type VARCHAR(50),
    purchase_date DATE,
    purchase_cost NUMERIC(15,2),
    current_value NUMERIC(15,2),
    depreciation_rate NUMERIC(5,2),
    warranty_expiry_date DATE,
    maintenance_schedule JSONB,
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    condition_status VARCHAR(20),
    availability_status VARCHAR(20) DEFAULT 'available',
    booking_required BOOLEAN DEFAULT false,
    advance_booking_days INTEGER DEFAULT 0,
    usage_instructions TEXT,
    safety_guidelines TEXT,
    responsible_person_id UUID,
    department_id UUID,
    custom_attributes JSONB,
    images TEXT[],
    documents JSONB,
    qr_code TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Resource Reservations
CREATE TABLE IF NOT EXISTS public.resource_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    resource_id UUID NOT NULL,
    reserved_by UUID NOT NULL,
    reservation_type VARCHAR(20) NOT NULL,
    purpose TEXT NOT NULL,
    start_datetime TIMESTAMPTZ NOT NULL,
    end_datetime TIMESTAMPTZ NOT NULL,
    attendees_count INTEGER,
    attendees_list JSONB,
    recurring_pattern VARCHAR(20),
    recurring_end_date DATE,
    status VARCHAR(20) DEFAULT 'pending',
    approved_by UUID,
    approval_date TIMESTAMPTZ,
    rejection_reason TEXT,
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    actual_usage_hours NUMERIC(5,2),
    usage_notes TEXT,
    damage_reported BOOLEAN DEFAULT false,
    damage_description TEXT,
    additional_requirements TEXT,
    cancellation_reason TEXT,
    cancelled_by UUID,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Resource Usage Logs
CREATE TABLE IF NOT EXISTS public.resource_usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    resource_id UUID NOT NULL,
    reservation_id UUID,
    user_id UUID NOT NULL,
    usage_type VARCHAR(20) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration_hours NUMERIC(5,2),
    usage_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Resource Approvals
CREATE TABLE IF NOT EXISTS public.resource_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    reservation_id UUID NOT NULL,
    approver_id UUID NOT NULL,
    approval_level INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    comments TEXT,
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    escalated_to UUID,
    escalated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Resource Maintenance Logs
-- Updated: 2025-10-06 - Added maintenance tracking tables for resource management
CREATE TABLE IF NOT EXISTS public.resource_maintenance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_id UUID NOT NULL,
    maintenance_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    scheduled_date DATE NOT NULL,
    completed_date DATE,
    status VARCHAR(50) DEFAULT 'scheduled'::character varying,
    priority INTEGER DEFAULT 2 CHECK (priority BETWEEN 1 AND 4),
    assigned_to_user_id UUID,
    cost NUMERIC(10,2),
    notes TEXT,
    attachments JSONB DEFAULT '[]'::jsonb,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Resource Maintenance Schedules
CREATE TABLE IF NOT EXISTS public.resource_maintenance_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource_id UUID NOT NULL,
    maintenance_type VARCHAR(50) NOT NULL,
    frequency_days INTEGER NOT NULL CHECK (frequency_days > 0),
    last_maintenance_date DATE,
    next_maintenance_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    reminder_days_before INTEGER DEFAULT 7,
    assigned_to_user_id UUID,
    description TEXT,
    estimated_cost NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- =====================================================
-- SECTION 12: BUG REPORTING
-- =====================================================

-- Bug Reports
-- Updated: 2026-03-23 - Added module_name generated column for module-wise grouping
CREATE TABLE IF NOT EXISTS public.bug_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'open',
    priority VARCHAR(20) DEFAULT 'medium',
    category VARCHAR(50),
    page_url TEXT,
    -- Updated: 2026-03-23 - Added module_name generated column for module-wise grouping
    -- NULL page_url → 'unknown'; unrecognized path → 'other'
    module_name VARCHAR(100) GENERATED ALWAYS AS (
      CASE
        WHEN page_url IS NULL THEN 'unknown'
        WHEN page_url ~ '/academic/' THEN 'academic'
        WHEN page_url ~ '/billing/' THEN 'billing'
        WHEN page_url ~ '/organizations?/' THEN 'organization'
        WHEN page_url ~ '/learners/' THEN 'learners'
        WHEN page_url ~ '/staff/' THEN 'staff'
        WHEN page_url ~ '/admission/' THEN 'admission'   -- must come before /admin/
        WHEN page_url ~ '/admin/'     THEN 'admin'
        WHEN page_url ~ '/resource-management/' THEN 'resource-management'
        WHEN page_url ~ '/startup-studio/' THEN 'startup-studio'
        WHEN page_url ~ '/settings/' THEN 'settings'
        ELSE 'other'
      END
    ) STORED,
    -- Updated: 2026-03-23 - Added sub_module_name generated column for sub-module grouping
    -- Extracts the path segment immediately after the top-level module prefix.
    -- e.g. /academic/leave-calendar → 'leave-calendar', /academic/attendance/mark → 'attendance'
    -- NULL when no sub-path exists beyond the module root.
    sub_module_name VARCHAR(100) GENERATED ALWAYS AS (
      CASE
        WHEN page_url IS NULL THEN NULL
        WHEN page_url ~ '/academic/'
          THEN substring(page_url FROM '/academic/([^/?#]+)')
        WHEN page_url ~ '/billing/'
          THEN substring(page_url FROM '/billing/([^/?#]+)')
        WHEN page_url ~ '/organizations?/'
          THEN substring(page_url FROM '/organizations?/([^/?#]+)')
        WHEN page_url ~ '/learners/'
          THEN substring(page_url FROM '/learners/([^/?#]+)')
        WHEN page_url ~ '/staff/'
          THEN substring(page_url FROM '/staff/([^/?#]+)')
        WHEN page_url ~ '/admission/'
          THEN substring(page_url FROM '/admission/([^/?#]+)')
        WHEN page_url ~ '/admin/'
          THEN substring(page_url FROM '/admin/([^/?#]+)')
        WHEN page_url ~ '/resource-management/'
          THEN substring(page_url FROM '/resource-management/([^/?#]+)')
        WHEN page_url ~ '/startup-studio/'
          THEN substring(page_url FROM '/startup-studio/([^/?#]+)')
        WHEN page_url ~ '/settings/'
          THEN substring(page_url FROM '/settings/([^/?#]+)')
        WHEN page_url ~ '/service-requests/'
          THEN substring(page_url FROM '/service-requests/([^/?#]+)')
        ELSE NULL
      END
    ) STORED,
    created_by UUID NOT NULL,
    assigned_to UUID,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Updated: 2026-03-23
CREATE INDEX IF NOT EXISTS idx_bug_reports_module_name ON public.bug_reports(module_name);
-- Composite index for module + sub-module queries (added 2026-03-23)
CREATE INDEX IF NOT EXISTS idx_bug_reports_sub_module_name ON public.bug_reports(module_name, sub_module_name);

-- Bug Report Messages
CREATE TABLE IF NOT EXISTS public.bug_report_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bug_report_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    message TEXT NOT NULL,
    attachments JSONB,
    is_internal BOOLEAN DEFAULT false,
    is_edited BOOLEAN DEFAULT false,
    edited_at TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Bug Report Participants
-- Updated: 2025-12-15 - Fixed role default and added check constraint
CREATE TABLE IF NOT EXISTS public.bug_report_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bug_report_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(20) DEFAULT 'participant' CHECK (role IN ('reporter', 'admin', 'participant')),
    last_viewed_at TIMESTAMPTZ,
    is_subscribed BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Bug Report Email Logs
-- Added: 2026-03-23 - Track resolution email notifications sent to reporters
CREATE TABLE IF NOT EXISTS public.bug_report_email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bug_report_id UUID NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    email_type VARCHAR(50) NOT NULL DEFAULT 'resolved_notification',
    status VARCHAR(20) NOT NULL DEFAULT 'sent',  -- 'sent', 'failed', 'skipped'
    resend_id TEXT,          -- Resend message ID for delivery tracking
    error_message TEXT,
    sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bug_report_email_logs_bug_report_id
    ON public.bug_report_email_logs(bug_report_id);

-- =====================================================
-- SECTION 13: AUDIT AND LOGGING (Previously SECTION 14)
-- =====================================================

-- User Activity Logs
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    resource_name TEXT,
    description TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    request_url TEXT,
    request_method VARCHAR(10),
    status_code INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    session_id TEXT,
    institution_id UUID,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Migration Log
CREATE TABLE IF NOT EXISTS public.migration_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    migration_name VARCHAR(255) NOT NULL,
    executed_at TIMESTAMPTZ DEFAULT now(),
    execution_time_ms INTEGER,
    success BOOLEAN NOT NULL,
    error_message TEXT
);

-- Custom Roles
-- Updated: 2026-02-06 - Added role_key, is_system_role columns; made institution_id nullable for system roles
CREATE TABLE IF NOT EXISTS public.custom_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID,
    role_key VARCHAR(50) NOT NULL UNIQUE,
    role_name VARCHAR(50) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_system_role BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    -- Updated: 2026-04-15 - Per-module access scope override. Shape:
    --   {"<module_key>": "own_records"|"own_institution"|"all_institutions"}
    -- Missing keys fall back to custom_roles.institution_scope.
    module_scopes JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Idempotent column add for existing databases
ALTER TABLE public.custom_roles
  ADD COLUMN IF NOT EXISTS module_scopes JSONB NOT NULL DEFAULT '{}'::jsonb;

-- =====================================================
-- CHILD APP AUTHENTICATION MODULE
-- Updated: 2025-01-17 - Added child app authentication tables
-- Purpose: Support parent-child app authentication bridge
-- =====================================================

-- Table for registered child applications
CREATE TABLE IF NOT EXISTS public.registered_child_apps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_id VARCHAR(50) UNIQUE NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    app_description TEXT,
    app_url VARCHAR(255) NOT NULL,
    app_logo_url VARCHAR(255),
    api_key_hash VARCHAR(255) NOT NULL,
    allowed_redirect_uris TEXT[] NOT NULL,
    allowed_scopes TEXT[] DEFAULT ARRAY['read'],
    allowed_roles TEXT[] DEFAULT ARRAY['student', 'staff', 'admin'],
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT false,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table for child app sessions
CREATE TABLE IF NOT EXISTS public.child_app_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    child_app_id VARCHAR(50) NOT NULL REFERENCES registered_child_apps(app_id),
    access_token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255) NOT NULL,
    token_version INTEGER DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL,
    refresh_expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES profiles(id),
    revoke_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table for child app access logs
CREATE TABLE IF NOT EXISTS public.child_app_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_app_id VARCHAR(50) NOT NULL REFERENCES registered_child_apps(app_id),
    user_id UUID REFERENCES profiles(id),
    session_id UUID REFERENCES child_app_sessions(id),
    action VARCHAR(50) NOT NULL, -- login, logout, token_refresh, validate, revoke
    status VARCHAR(20) NOT NULL, -- success, failed, error
    ip_address INET,
    user_agent TEXT,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table for child app permissions
CREATE TABLE IF NOT EXISTS public.child_app_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_app_id VARCHAR(50) NOT NULL REFERENCES registered_child_apps(app_id),
    permission_name VARCHAR(100) NOT NULL,
    permission_description TEXT,
    resource_type VARCHAR(50), -- data, api, feature
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(child_app_id, permission_name)
);

-- Table for user-specific child app permissions
CREATE TABLE IF NOT EXISTS public.user_child_app_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    child_app_id VARCHAR(50) NOT NULL REFERENCES registered_child_apps(app_id),
    permissions JSONB NOT NULL DEFAULT '{}',
    granted_by UUID REFERENCES profiles(id),
    granted_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, child_app_id)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_institution_id ON public.profiles(institution_id);

-- Learners Profiles indexes
-- Created: 2025-01-18 - Indexes for unified learners_profiles table
CREATE INDEX IF NOT EXISTS idx_learners_profiles_institution_id ON public.learners_profiles(institution_id);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_application_id ON public.learners_profiles(application_id);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_roll_number ON public.learners_profiles(roll_number);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_college_email ON public.learners_profiles(college_email);
-- Composite index for institutional queries (most common pattern)
CREATE INDEX IF NOT EXISTS idx_learners_profiles_institution_department ON public.learners_profiles(institution_id, department_id);
-- Foreign key indexes for join performance
CREATE INDEX IF NOT EXISTS idx_learners_profiles_degree_id ON public.learners_profiles(degree_id);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_department_id ON public.learners_profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_program_id ON public.learners_profiles(program_id);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_semester_id ON public.learners_profiles(semester_id);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_section_id ON public.learners_profiles(section_id);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_academic_year_id ON public.learners_profiles(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_regulation_id ON public.learners_profiles(regulation_id);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_batch_id ON public.learners_profiles(batch_id);
-- Lifecycle status index (commonly used for filtering)
CREATE INDEX IF NOT EXISTS idx_learners_profiles_lifecycle_status ON public.learners_profiles(lifecycle_status);
-- Profile completion index
CREATE INDEX IF NOT EXISTS idx_learners_profiles_profile_complete ON public.learners_profiles(is_profile_complete);
-- Migration lineage indexes (for audit queries and verification)
CREATE INDEX IF NOT EXISTS idx_learners_profiles_original_admission ON public.learners_profiles(original_admission_id) WHERE original_admission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learners_profiles_original_student ON public.learners_profiles(original_student_id) WHERE original_student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learners_profiles_migration_source ON public.learners_profiles(migration_source);

-- Students indexes (LEGACY - for backward compatibility during migration)
-- Updated: 2025-10-15 - Added indexes for HOD queries and foreign key joins
CREATE INDEX IF NOT EXISTS idx_students_institution_id ON public.students(institution_id);
CREATE INDEX IF NOT EXISTS idx_students_roll_number ON public.students(roll_number);
CREATE INDEX IF NOT EXISTS idx_students_application_id ON public.students(application_id);
-- Composite index for HOD queries (institution + department filtering)
CREATE INDEX IF NOT EXISTS idx_students_institution_department ON public.students(institution_id, department_id);
-- Foreign key indexes for join performance
CREATE INDEX IF NOT EXISTS idx_students_degree_id ON public.students(degree_id);
CREATE INDEX IF NOT EXISTS idx_students_department_id ON public.students(department_id);
CREATE INDEX IF NOT EXISTS idx_students_program_id ON public.students(program_id);
CREATE INDEX IF NOT EXISTS idx_students_semester_id ON public.students(semester_id);
CREATE INDEX IF NOT EXISTS idx_students_section_id ON public.students(section_id);
CREATE INDEX IF NOT EXISTS idx_students_academic_year_id ON public.students(academic_year_id);
-- Index for status filtering (commonly used in queries)
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);
-- Index for profile completion filtering
CREATE INDEX IF NOT EXISTS idx_students_profile_complete ON public.students(is_profile_complete);

-- Staff indexes
CREATE INDEX IF NOT EXISTS idx_staff_institution_id ON public.staff(institution_id);
CREATE INDEX IF NOT EXISTS idx_staff_staff_id ON public.staff(staff_id);

-- Billing indexes
CREATE INDEX IF NOT EXISTS idx_billing_invoices_student_id ON public.billing_invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_billing_receipts_student_id ON public.billing_receipts(student_id);
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_student_id ON public.billing_student_bills(student_id);

-- Attendance indexes
-- Updated: 2025-12-29 - Added indexes for student self-service attendance queries
CREATE INDEX IF NOT EXISTS idx_student_attendance_date ON public.student_attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_student_attendance_section_id ON public.student_attendance(section_id);
CREATE INDEX IF NOT EXISTS idx_attendance_period_slot ON public.student_attendance(period_slot_id) WHERE period_slot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_timetable_section_date ON public.student_attendance(timetable_id, section_id, attendance_date);
-- Optimize student queries by section and date (for student portal attendance view)
CREATE INDEX IF NOT EXISTS idx_student_attendance_section_date ON public.student_attendance(section_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_student_attendance_timetable_date ON public.student_attendance(timetable_id, attendance_date DESC);

-- Timetable indexes
CREATE INDEX IF NOT EXISTS idx_timetables_type_semester ON public.timetables(timetable_type, semester_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_timetables_semester_active ON public.timetables(semester_id, is_active) WHERE timetable_type = 'semester' AND is_active = true;

-- Activity logs index
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON public.user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON public.user_activity_logs(created_at);

-- Child app authentication indexes
CREATE INDEX IF NOT EXISTS idx_child_app_sessions_user_id ON public.child_app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_child_app_sessions_child_app_id ON public.child_app_sessions(child_app_id);
CREATE INDEX IF NOT EXISTS idx_child_app_sessions_expires_at ON public.child_app_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_child_app_sessions_is_active ON public.child_app_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_child_app_access_logs_child_app_id ON public.child_app_access_logs(child_app_id);
CREATE INDEX IF NOT EXISTS idx_child_app_access_logs_user_id ON public.child_app_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_child_app_access_logs_created_at ON public.child_app_access_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_user_child_app_permissions_user_id ON public.user_child_app_permissions(user_id);

-- =================================
-- LEARNER APP FAVORITES MODULE
-- Updated: 2025-01-17 - Added app favorites functionality
-- Purpose: Allow students to favorite and bookmark applications
-- =================================

-- Table for user app favorites
CREATE TABLE IF NOT EXISTS public.user_app_favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- Updated: 2025-01-27 - Use profiles table instead of auth.users
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE(user_id, application_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_app_favorites_user_id ON user_app_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_app_favorites_application_id ON user_app_favorites(application_id);
CREATE INDEX IF NOT EXISTS idx_user_app_favorites_created_at ON user_app_favorites(created_at DESC);

-- Maintenance tables indexes
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_resource ON resource_maintenance_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_status ON resource_maintenance_logs(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_scheduled ON resource_maintenance_logs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_assigned_to ON resource_maintenance_logs(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_created_by ON resource_maintenance_logs(created_by);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_resource ON resource_maintenance_schedules(resource_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_next_date ON resource_maintenance_schedules(next_maintenance_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_active ON resource_maintenance_schedules(is_active);

-- Enable RLS
ALTER TABLE user_app_favorites ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- LIFECYCLE ANALYTICS TABLES
-- Updated: 2026-02-06 - Added usage_events, module_usage_daily,
--   institution_health_scores, feature_usage_summary, usage_events_archive
-- =====================================================

-- usage_events: Lightweight event table for tracking all platform actions
-- Partitioned by month for fast time-range queries
CREATE TABLE IF NOT EXISTS public.usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    session_id TEXT,
    event_type TEXT NOT NULL,           -- page_visit, view, create, update, delete, export, login, logout
    module TEXT NOT NULL,                -- matches MODULE_NAMES: 'academic/timetables', 'billing/invoices'
    feature TEXT,                        -- sub-feature: 'mark_attendance', 'generate_invoice'
    resource_type TEXT,
    weight INTEGER NOT NULL DEFAULT 1,  -- page_visit=1, view=2, crud=5, export=3
    institution_id UUID,
    department_id UUID,
    role TEXT,                           -- user's role at time of action
    request_method TEXT,
    source TEXT NOT NULL DEFAULT 'middleware',  -- 'middleware', 'explicit', 'backfill'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for usage_events
CREATE INDEX IF NOT EXISTS idx_usage_events_institution_created
    ON usage_events(institution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_module_created
    ON usage_events(module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_created
    ON usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_event_type
    ON usage_events(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_source
    ON usage_events(source);

-- Enable RLS
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;


-- module_usage_daily: Pre-aggregated daily rollup consumed by dashboard
CREATE TABLE IF NOT EXISTS public.module_usage_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    institution_id UUID NOT NULL,
    module TEXT NOT NULL,
    event_count INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    weighted_score BIGINT DEFAULT 0,
    by_role JSONB DEFAULT '{}',         -- {"student": 120, "faculty": 45, "admin": 12}
    by_event_type JSONB DEFAULT '{}',   -- {"view": 100, "create": 30, "export": 5}
    UNIQUE(metric_date, institution_id, module)
);

-- Indexes for module_usage_daily
CREATE INDEX IF NOT EXISTS idx_module_usage_daily_date
    ON module_usage_daily(metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_module_usage_daily_institution
    ON module_usage_daily(institution_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_module_usage_daily_module
    ON module_usage_daily(module, metric_date DESC);

-- Enable RLS
ALTER TABLE module_usage_daily ENABLE ROW LEVEL SECURITY;


-- institution_health_scores: Composite health scores computed daily
CREATE TABLE IF NOT EXISTS public.institution_health_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    score_date DATE NOT NULL,
    institution_id UUID NOT NULL,
    active_user_pct NUMERIC(5,2),       -- % users logged in last 7d
    module_breadth_score NUMERIC(5,2),  -- % of modules accessed
    action_depth_score NUMERIC(5,2),    -- weighted actions per active user
    consistency_score NUMERIC(5,2),     -- inverse of daily active user variance
    feature_maturity_score NUMERIC(5,2),-- CRUD ratio vs total actions
    health_score NUMERIC(5,2),          -- composite (0-100)
    health_grade TEXT,                   -- A/B/C/D/F
    metadata JSONB DEFAULT '{}',
    UNIQUE(score_date, institution_id)
);

-- Indexes for institution_health_scores
CREATE INDEX IF NOT EXISTS idx_health_scores_institution
    ON institution_health_scores(institution_id, score_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_scores_date
    ON institution_health_scores(score_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_scores_grade
    ON institution_health_scores(health_grade);

-- Enable RLS
ALTER TABLE institution_health_scores ENABLE ROW LEVEL SECURITY;


-- feature_usage_summary: Sub-feature level aggregation (Phase 3)
CREATE TABLE IF NOT EXISTS public.feature_usage_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary_date DATE NOT NULL,
    institution_id UUID NOT NULL,
    module TEXT NOT NULL,
    feature TEXT NOT NULL,
    usage_count INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    UNIQUE(summary_date, institution_id, module, feature)
);

-- Indexes for feature_usage_summary
CREATE INDEX IF NOT EXISTS idx_feature_usage_summary_date
    ON feature_usage_summary(summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_feature_usage_summary_module
    ON feature_usage_summary(module, summary_date DESC);

-- Enable RLS
ALTER TABLE feature_usage_summary ENABLE ROW LEVEL SECURITY;


-- usage_events_archive: Archive table for old events (Phase 3)
CREATE TABLE IF NOT EXISTS public.usage_events_archive (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    session_id TEXT,
    event_type TEXT NOT NULL,
    module TEXT NOT NULL,
    feature TEXT,
    resource_type TEXT,
    weight INTEGER NOT NULL DEFAULT 1,
    institution_id UUID,
    department_id UUID,
    role TEXT,
    request_method TEXT,
    source TEXT NOT NULL DEFAULT 'middleware',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_archive_created
    ON usage_events_archive(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_archive_institution
    ON usage_events_archive(institution_id, created_at DESC);

-- Enable RLS
ALTER TABLE usage_events_archive ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- SERVICE REQUEST MODULE
-- Updated: 2026-02-09 - Service Request Module (7 tables, 5 enums)
-- =====================================================

-- Service request status enum
CREATE TYPE service_request_status AS ENUM (
    'draft', 'submitted', 'in_review', 'approved', 'rejected',
    'returned', 'fulfilled', 'closed', 'cancelled'
);

CREATE TYPE service_field_type AS ENUM (
    'text', 'select', 'date', 'number', 'boolean', 'textarea', 'file'
);

CREATE TYPE service_request_priority AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TYPE service_approval_action AS ENUM ('pending', 'approved', 'rejected', 'returned');

CREATE TYPE service_timeline_event_type AS ENUM (
    'status_change', 'comment', 'internal_note', 'edit', 'attachment_added', 'system'
);

-- Service Types: Defines available service request types (Super Admin manages)
CREATE TABLE service_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'FileText',
    color VARCHAR(20) DEFAULT '#3B82F6',
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_system_default BOOLEAN NOT NULL DEFAULT false,
    allowed_roles TEXT[] NOT NULL DEFAULT '{}',
    max_active_requests INTEGER NOT NULL DEFAULT 1,
    auto_fulfill_on_approval BOOLEAN NOT NULL DEFAULT false,
    enable_priority BOOLEAN NOT NULL DEFAULT false,
    enable_attachments BOOLEAN NOT NULL DEFAULT false,
    enable_email_notifications BOOLEAN NOT NULL DEFAULT true,
    approval_workflow_type TEXT NOT NULL DEFAULT 'sequential' CHECK (approval_workflow_type IN ('sequential', 'parallel')),
    attachment_config JSONB DEFAULT '{"max_files": 3, "max_size_mb": 10, "allowed_types": ["pdf", "jpg", "png", "doc", "docx"]}'::jsonb,
    validity_period_days INTEGER,
    -- Scope: controls visibility of this service type (common = all, or scoped to specific org entities)
    -- Updated: 2026-03-19 - Added scope columns for institution/degree/department/program-level service types
    scope_level TEXT NOT NULL DEFAULT 'common' CHECK (scope_level IN ('common', 'institution', 'degree', 'department', 'program')),
    institution_ids UUID[] DEFAULT NULL,
    degree_ids UUID[] DEFAULT NULL,
    department_ids UUID[] DEFAULT NULL,
    program_ids UUID[] DEFAULT NULL,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_types_slug ON service_types(slug);
CREATE INDEX idx_service_types_is_active ON service_types(is_active);
CREATE INDEX idx_service_types_is_system_default ON service_types(is_system_default);
CREATE INDEX idx_service_types_scope_level ON service_types(scope_level);

-- Service Type Fields: Dynamic form fields per service type
CREATE TABLE service_type_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type_id UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,
    field_label VARCHAR(255) NOT NULL,
    field_type service_field_type NOT NULL,
    field_options JSONB,
    is_required BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    placeholder VARCHAR(255),
    help_text TEXT,
    default_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(service_type_id, field_key)
);

CREATE INDEX idx_service_type_fields_type_id ON service_type_fields(service_type_id);
CREATE INDEX idx_service_type_fields_order ON service_type_fields(service_type_id, display_order);

-- Service Request Approval Steps
CREATE TABLE service_request_approval_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type_id UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    step_name VARCHAR(255) NOT NULL,
    approver_role VARCHAR(50) NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT true,
    on_return_restart_from_step INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(service_type_id, step_order)
);

CREATE INDEX idx_sr_approval_steps_type_id ON service_request_approval_steps(service_type_id);
CREATE INDEX idx_sr_approval_steps_order ON service_request_approval_steps(service_type_id, step_order);
CREATE INDEX idx_sr_approval_steps_role ON service_request_approval_steps(approver_role);

-- Service Requests: Actual request submissions
CREATE TABLE service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number VARCHAR(20) NOT NULL UNIQUE,
    service_type_id UUID NOT NULL REFERENCES service_types(id),
    requester_id UUID NOT NULL REFERENCES profiles(id),
    institution_id UUID REFERENCES institutions(id),
    status service_request_status NOT NULL DEFAULT 'draft',
    priority service_request_priority DEFAULT 'normal',
    current_approval_step INTEGER DEFAULT 0,
    form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    requester_context JSONB DEFAULT '{}'::jsonb,
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    fulfilled_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    validity_expires_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_service_requests_number ON service_requests(request_number);
CREATE INDEX idx_service_requests_type_id ON service_requests(service_type_id);
CREATE INDEX idx_service_requests_requester ON service_requests(requester_id);
CREATE INDEX idx_service_requests_institution ON service_requests(institution_id);
CREATE INDEX idx_service_requests_status ON service_requests(status);
CREATE INDEX idx_service_requests_priority ON service_requests(priority);
CREATE INDEX idx_service_requests_submitted_at ON service_requests(submitted_at DESC);
CREATE INDEX idx_service_requests_created_at ON service_requests(created_at DESC);
CREATE INDEX idx_service_requests_requester_type ON service_requests(requester_id, service_type_id);
CREATE INDEX idx_service_requests_status_type ON service_requests(status, service_type_id);
CREATE INDEX idx_service_requests_institution_status ON service_requests(institution_id, status);
CREATE INDEX idx_service_requests_active ON service_requests(requester_id, service_type_id)
    WHERE status NOT IN ('closed', 'cancelled', 'rejected');

-- Service Request Approvals
CREATE TABLE service_request_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    approval_step_id UUID REFERENCES service_request_approval_steps(id),
    step_order INTEGER NOT NULL,
    approver_id UUID NOT NULL REFERENCES profiles(id),
    action service_approval_action NOT NULL DEFAULT 'pending',
    comments TEXT,
    acted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sr_approvals_request ON service_request_approvals(service_request_id);
CREATE INDEX idx_sr_approvals_approver ON service_request_approvals(approver_id);
CREATE INDEX idx_sr_approvals_action ON service_request_approvals(action);
CREATE INDEX idx_sr_approvals_pending ON service_request_approvals(approver_id, action)
    WHERE action = 'pending';

-- Service Request Timeline
CREATE TABLE service_request_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id),
    event_type service_timeline_event_type NOT NULL,
    old_status service_request_status,
    new_status service_request_status,
    content TEXT,
    is_internal BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sr_timeline_request ON service_request_timeline(service_request_id);
CREATE INDEX idx_sr_timeline_created ON service_request_timeline(service_request_id, created_at DESC);
CREATE INDEX idx_sr_timeline_internal ON service_request_timeline(service_request_id, is_internal);

-- Service Request Attachments
CREATE TABLE service_request_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    file_type VARCHAR(50),
    uploaded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sr_attachments_request ON service_request_attachments(service_request_id);

-- Enable RLS on all service request tables
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_type_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_approval_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_attachments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECTION: STARTUP STUDIO MODULE
-- Created: 2026-03-05 - Startup Studio events platform
-- Purpose: Generic event platform for hackathons, competitions, buildathons
-- =====================================================

-- Startup Events (generic, reusable across future events)
CREATE TABLE IF NOT EXISTS public.startup_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    host_institution_id UUID REFERENCES institutions(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','registration_open','registration_closed','build_day','demo_day','closed')),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    demo_date TIMESTAMPTZ,
    registration_deadline TIMESTAMPTZ,
    submission_deadline TIMESTAMPTZ,
    metrics_deadline TIMESTAMPTZ,
    is_results_published BOOLEAN DEFAULT false,
    metrics_frozen_at TIMESTAMPTZ,          -- When admin froze team metrics (added 2026-03-08)
    results_published_at TIMESTAMPTZ,       -- When results were published (added 2026-03-08)
    config JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Registrations (team registrations)
CREATE TABLE IF NOT EXISTS public.event_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    problem_idea TEXT, -- nullable: optional field in registration form (updated 2026-03-07)
    owner_id UUID NOT NULL REFERENCES profiles(id),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    checked_in BOOLEAN DEFAULT false,
    checked_in_at TIMESTAMPTZ,
    checked_in_by UUID REFERENCES profiles(id),
    status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','checked_in','disqualified')),
    team_code           TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(event_id, owner_id)
);

-- Event Team Members (instant add, no confirmation)
CREATE TABLE IF NOT EXISTS public.event_team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES profiles(id),
    email TEXT NOT NULL,
    full_name TEXT,
    student_id TEXT,
    has_laptop BOOLEAN DEFAULT false,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    learner_id          UUID REFERENCES learners_profiles(id) ON DELETE SET NULL,
    status              TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted', 'declined', 'removed')),
    is_leader           BOOLEAN NOT NULL DEFAULT false,
    responded_at        TIMESTAMPTZ,
    UNIQUE(registration_id, email)
);

-- Event Venue Assignments (link events to rooms/labs)
CREATE TABLE IF NOT EXISTS public.event_venue_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    resource_id UUID REFERENCES resources(id),
    manual_name TEXT,
    manual_building TEXT,
    manual_room TEXT,
    capacity_override INT,
    day_type TEXT NOT NULL CHECK (day_type IN ('build_day','demo_day')),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Team Venue Allocations (team-to-venue mapping)
CREATE TABLE IF NOT EXISTS public.event_team_venue_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
    venue_assignment_id UUID NOT NULL REFERENCES event_venue_assignments(id) ON DELETE CASCADE,
    day_type TEXT NOT NULL CHECK (day_type IN ('build_day','demo_day')),
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    allocated_by UUID REFERENCES profiles(id),
    UNIQUE(event_id, registration_id, day_type)
);

-- Event Staff Assignments (mentors/judges at venues)
CREATE TABLE IF NOT EXISTS public.event_staff_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    venue_assignment_id UUID NOT NULL REFERENCES event_venue_assignments(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff(id),
    role TEXT NOT NULL CHECK (role IN ('mentor','lead_mentor','judge','panel_chair','evaluator')),
    day_type TEXT NOT NULL CHECK (day_type IN ('build_day','demo_day')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(event_id, staff_id, venue_assignment_id, day_type)
);

-- Event Demo Slots (presentation schedule)
CREATE TABLE IF NOT EXISTS public.event_demo_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    venue_assignment_id UUID NOT NULL REFERENCES event_venue_assignments(id) ON DELETE CASCADE,
    registration_id UUID REFERENCES event_registrations(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ,
    duration_minutes INT DEFAULT 5,
    room_label TEXT,
    slot_order INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Submissions (two-phase deadline)
CREATE TABLE IF NOT EXISTS public.event_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
    UNIQUE(event_id, registration_id),

    -- Phase 1 fields: locked at submission_deadline
    app_name TEXT,
    github_url TEXT,
    live_app_url TEXT,
    description TEXT,
    category TEXT,

    -- Phase 2 fields: locked at metrics_deadline
    -- Updated: 2026-03-08 - Added active_users_count for Demo Day tier verification
    mrr_amount DECIMAL(10,2) DEFAULT 0,
    paying_users_count INT DEFAULT 0,
    user_count INT DEFAULT 0,
    active_users_count INT DEFAULT 0,         -- Active users (separate from total signups; added 2026-03-08)
    proof_urls TEXT[] DEFAULT '{}',

    -- Verification (batch - only Level 4/5 teams)
    mrr_verified BOOLEAN DEFAULT false,
    mrr_verified_at TIMESTAMPTZ,
    mrr_verified_by UUID REFERENCES profiles(id),
    mrr_rejected_reason TEXT,

    -- Denormalized scoring
    tier_level INT DEFAULT 0,
    tier_points INT DEFAULT 0,
    mrr_bonus_points INT DEFAULT 0,
    total_score INT DEFAULT 0,

    submitted_at TIMESTAMPTZ,
    submitted_by UUID REFERENCES profiles(id),
    metrics_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Checklists (multi-role)
CREATE TABLE IF NOT EXISTS public.event_checklists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('pre_event','on_day','build_day','demo_day','post_event')),
    target_role TEXT NOT NULL CHECK (target_role IN ('admin','mentor','team')),
    order_index INT DEFAULT 0
);

-- Event Checklist Items
CREATE TABLE IF NOT EXISTS public.event_checklist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    checklist_id UUID NOT NULL REFERENCES event_checklists(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    order_index INT DEFAULT 0,
    is_required BOOLEAN DEFAULT false
);

-- Event Checklist Completions
CREATE TABLE IF NOT EXISTS public.event_checklist_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    checklist_item_id UUID NOT NULL REFERENCES event_checklist_items(id) ON DELETE CASCADE,
    completed_by UUID NOT NULL REFERENCES profiles(id),
    registration_id UUID REFERENCES event_registrations(id) ON DELETE CASCADE,
    staff_assignment_id UUID REFERENCES event_staff_assignments(id),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated: 2026-03-07 - Partial unique index for per-team checklist completions
CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_completions_item_reg
  ON event_checklist_completions(checklist_item_id, registration_id)
  WHERE registration_id IS NOT NULL;

-- Indexes for Startup Studio
CREATE INDEX idx_startup_events_status ON startup_events(status);
CREATE INDEX idx_event_registrations_event ON event_registrations(event_id);
CREATE INDEX idx_event_registrations_owner ON event_registrations(owner_id);
CREATE INDEX idx_event_team_members_registration ON event_team_members(registration_id);
CREATE INDEX idx_event_team_members_email ON event_team_members(email);
CREATE INDEX idx_event_venue_assignments_event ON event_venue_assignments(event_id);
CREATE INDEX idx_event_submissions_event ON event_submissions(event_id);
CREATE INDEX idx_event_submissions_score ON event_submissions(event_id, total_score DESC, mrr_amount DESC);
CREATE INDEX idx_event_staff_assignments_event ON event_staff_assignments(event_id);
CREATE INDEX idx_event_demo_slots_event ON event_demo_slots(event_id);

-- Enable RLS on all startup studio tables
ALTER TABLE startup_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_venue_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_team_venue_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_demo_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_checklist_completions ENABLE ROW LEVEL SECURITY;

-- Updated: 2026-03-06 - Team invitation workflow columns
-- event_registrations: added team_code TEXT (institution-wise auto-generated, unique per event+institution)
-- event_team_members: added learner_id UUID (→ learners_profiles), status TEXT (pending/accepted/declined/removed),
--                     is_leader BOOLEAN, responded_at TIMESTAMPTZ

-- ── event_team_attendance (startup studio attendance) — Added 2026-03-07 ──────
CREATE TABLE IF NOT EXISTS public.event_team_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
    venue_assignment_id UUID NOT NULL REFERENCES event_venue_assignments(id) ON DELETE CASCADE,
    day_type TEXT NOT NULL CHECK (day_type IN ('build_day', 'demo_day')),
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late')),
    marked_by UUID NOT NULL REFERENCES profiles(id),
    marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes TEXT,
    UNIQUE(event_id, registration_id, day_type)
);

CREATE INDEX IF NOT EXISTS idx_event_team_attendance_event ON event_team_attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_event_team_attendance_venue ON event_team_attendance(venue_assignment_id);
CREATE INDEX IF NOT EXISTS idx_event_team_attendance_registration ON event_team_attendance(registration_id);

ALTER TABLE public.event_team_attendance ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════
-- APPATHON ROLE CARDS (Added: 2026-03-08 — Skill Bank Phase 1)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS appathon_role_cards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES event_submissions(id) ON DELETE CASCADE,
  team_id      UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  learner_id   UUID REFERENCES learners_profiles(id) ON DELETE SET NULL,
  self_roles   TEXT[] NOT NULL,
  proud_of     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, profile_id)
);

CREATE TABLE IF NOT EXISTS appathon_peer_tags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_card_id     UUID NOT NULL REFERENCES appathon_role_cards(id) ON DELETE CASCADE,
  tagger_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tagged_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tagged_role      TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_card_id, tagged_profile_id)
);

-- Indexes for Skill Bank queries
CREATE INDEX IF NOT EXISTS idx_appathon_role_cards_submission  ON appathon_role_cards(submission_id);
CREATE INDEX IF NOT EXISTS idx_appathon_role_cards_team        ON appathon_role_cards(team_id);
CREATE INDEX IF NOT EXISTS idx_appathon_role_cards_profile     ON appathon_role_cards(profile_id);
CREATE INDEX IF NOT EXISTS idx_appathon_role_cards_learner     ON appathon_role_cards(learner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_appathon_role_cards_learner_unique
  ON appathon_role_cards(submission_id, learner_id) WHERE learner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appathon_peer_tags_role_card    ON appathon_peer_tags(role_card_id);
CREATE INDEX IF NOT EXISTS idx_appathon_peer_tags_tagged       ON appathon_peer_tags(tagged_profile_id);
CREATE INDEX IF NOT EXISTS idx_appathon_peer_tags_tagged_role  ON appathon_peer_tags(tagged_role);

-- ─── Appathon Verifications (Demo Day Evaluation System) ──────────────────
-- Added: 2026-03-08 - One row per evaluator per team. Evaluators verify
-- team claims (live URL, user counts, revenue) during Demo Day presentations.
-- Uses T1-T4 user-based tier scoring + revenue bonus (separate from T0-T5 self-reported).
CREATE TABLE IF NOT EXISTS public.appathon_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Core relationships
    submission_id UUID NOT NULL REFERENCES event_submissions(id) ON DELETE CASCADE,
    evaluator_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    venue_id      UUID NOT NULL REFERENCES event_venue_assignments(id) ON DELETE CASCADE,

    -- Team presence
    presented          BOOLEAN DEFAULT false,
    presentation_slot  INT,

    -- App verification
    app_live BOOLEAN DEFAULT false,

    -- Claimed values (copied from event_submissions at freeze time)
    claimed_users        INT           DEFAULT 0,
    claimed_active_users INT           DEFAULT 0,
    claimed_revenue      NUMERIC(10,2) DEFAULT 0,

    -- Verified values (evaluator-confirmed)
    verified_users        INT           DEFAULT 0,
    verified_active_users INT           DEFAULT 0,
    verified_revenue      NUMERIC(10,2) DEFAULT 0,

    -- Calculated scores (server-recomputed, do not trust client)
    verified_tier  INT DEFAULT 0,
    revenue_bonus  INT DEFAULT 0,
    total_score    INT DEFAULT 0,

    -- Verification outcome
    verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'verified', 'flagged', 'disqualified')),
    flag_reason TEXT,
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(submission_id, evaluator_id)
);

CREATE INDEX IF NOT EXISTS idx_appathon_verifications_submission
    ON appathon_verifications(submission_id);
CREATE INDEX IF NOT EXISTS idx_appathon_verifications_evaluator
    ON appathon_verifications(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_appathon_verifications_venue
    ON appathon_verifications(venue_id);
CREATE INDEX IF NOT EXISTS idx_appathon_verifications_status
    ON appathon_verifications(verification_status);

-- ─── Audience Votes (Demo Day Live Voting) ────────────────────────────────
-- Updated: 2026-03-08 - Added audience_votes table for Demo Day live voting
-- Audience members rate each startup team (1–5 stars) during the live event.
-- One vote per audience member per submission (UNIQUE constraint).
-- voting_opened_at / voting_closed_at on startup_events control the window.
CREATE TABLE IF NOT EXISTS audience_votes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
  submission_id    UUID NOT NULL REFERENCES event_submissions(id) ON DELETE CASCADE,
  voter_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  voted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, voter_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_audience_votes_event      ON audience_votes(event_id);
CREATE INDEX IF NOT EXISTS idx_audience_votes_submission ON audience_votes(submission_id);
CREATE INDEX IF NOT EXISTS idx_audience_votes_voter      ON audience_votes(voter_profile_id);

-- Voting window columns on startup_events
-- NULL means voting has not been opened/closed yet.
ALTER TABLE startup_events
  ADD COLUMN IF NOT EXISTS voting_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voting_closed_at TIMESTAMPTZ;

-- ============================================================
-- POST DEMO DAY PIPELINE TABLES
-- Added: 2026-03-09 — Spec: Spec-Post-Demo-Day-Pipeline.md
-- ============================================================

-- Track Declarations: Teams declare which path they want after Demo Day
CREATE TABLE IF NOT EXISTS track_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  track TEXT NOT NULL,
  reason TEXT,
  declared_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mentor_approved BOOLEAN DEFAULT NULL,
  mentor_notes TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, team_id),
  CHECK (track IN ('solve_for_100', 'jicate_solutions', 'solve_for_industry', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_track_declarations_event ON track_declarations(event_id);
CREATE INDEX IF NOT EXISTS idx_track_declarations_team ON track_declarations(team_id);
CREATE INDEX IF NOT EXISTS idx_track_declarations_track ON track_declarations(track);
CREATE INDEX IF NOT EXISTS idx_track_declarations_declared_by ON track_declarations(declared_by);

-- Progression Levels: Individual learner progression across 5-stage identity ladder
CREATE TABLE IF NOT EXISTS progression_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
  team_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
  level INTEGER NOT NULL,
  level_name TEXT NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  awarded_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, event_id, level),
  CHECK (level BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_progression_levels_profile ON progression_levels(profile_id);
CREATE INDEX IF NOT EXISTS idx_progression_levels_event ON progression_levels(event_id);
CREATE INDEX IF NOT EXISTS idx_progression_levels_team ON progression_levels(team_id);

-- Case Studies: Structured narratives for solve_for_industry and jicate_solutions tracks
CREATE TABLE IF NOT EXISTS case_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  track TEXT NOT NULL,
  problem TEXT NOT NULL,
  solution TEXT NOT NULL,
  proof TEXT NOT NULL,
  who_else TEXT,
  demo_url TEXT,
  app_name TEXT,
  app_url TEXT,
  score INTEGER CHECK (score IS NULL OR score BETWEEN 0 AND 500),
  featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, team_id),
  CHECK (track IN ('solve_for_industry', 'jicate_solutions'))
);

CREATE INDEX IF NOT EXISTS idx_case_studies_event ON case_studies(event_id);
CREATE INDEX IF NOT EXISTS idx_case_studies_team ON case_studies(team_id);
CREATE INDEX IF NOT EXISTS idx_case_studies_track ON case_studies(track);
CREATE INDEX IF NOT EXISTS idx_case_studies_featured ON case_studies(featured);

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPO MODULE (Education Fairs & Exhibitions)
-- Updated: 2026-03-14 - Made institution_id nullable (expos are global, not institution-scoped)
-- ═══════════════════════════════════════════════════════════════════════════

-- Expo Masters (Reusable Event Catalog — shared across all institutions)
CREATE TABLE IF NOT EXISTS expo_masters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  organizer_name TEXT,
  city TEXT,
  venue_name TEXT,
  description TEXT,
  frequency TEXT CHECK (frequency IN ('annual', 'biannual', 'quarterly', 'one_time')),
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_expo_masters_institution ON expo_masters(institution_id) WHERE institution_id IS NOT NULL;
CREATE INDEX idx_expo_masters_active ON expo_masters(is_active);

-- Expo Events (Specific Instances — shared across all institutions)
CREATE TABLE IF NOT EXISTS expo_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  expo_master_id UUID REFERENCES expo_masters(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  organizer_name TEXT,
  city TEXT NOT NULL,
  venue_name TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  travel_mode TEXT CHECK (travel_mode IN ('bus', 'train', 'flight', 'own_vehicle', 'other')),
  accommodation_details TEXT,
  team_leader_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_status TEXT NOT NULL DEFAULT 'planned' CHECK (event_status IN ('planned', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  total_team_members INT DEFAULT 0,
  total_expenses NUMERIC(12,2) DEFAULT 0,
  total_leads_collected INT DEFAULT 0,
  -- WhatsApp channel preference for auto-welcome messages (Added: 2026-04-02)
  wa_channel_preference TEXT NOT NULL DEFAULT 'meta_waba'
      CHECK (wa_channel_preference IN ('personal', 'meta_waba', 'both', 'none')),
  wa_personal_template_id UUID,  -- custom template for personal WA (FK added after table creation)
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT expo_events_date_check CHECK (end_date >= start_date)
);

CREATE INDEX idx_expo_events_institution ON expo_events(institution_id) WHERE institution_id IS NOT NULL;
CREATE INDEX idx_expo_events_status ON expo_events(event_status);
CREATE INDEX idx_expo_events_dates ON expo_events(start_date, end_date);
CREATE INDEX idx_expo_events_master ON expo_events(expo_master_id);

-- Expo Event Team Members (Staff + Student Volunteers)
CREATE TABLE IF NOT EXISTS expo_event_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_event_id UUID NOT NULL REFERENCES expo_events(id) ON DELETE CASCADE,
  member_type TEXT NOT NULL CHECK (member_type IN ('staff', 'student', 'external')),
  staff_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  student_id UUID REFERENCES learners_profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'volunteer' CHECK (role IN ('team_leader', 'counselor', 'volunteer', 'support')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_expo_team_event ON expo_event_team_members(expo_event_id);
CREATE INDEX idx_expo_team_staff ON expo_event_team_members(staff_id) WHERE staff_id IS NOT NULL;

-- Expo Daily Reports (Daily Data Collection)
CREATE TABLE IF NOT EXISTS expo_daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_event_id UUID NOT NULL REFERENCES expo_events(id) ON DELETE CASCADE,
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  report_date DATE NOT NULL,
  stall_fee NUMERIC(10,2) DEFAULT 0,
  travel_expense NUMERIC(10,2) DEFAULT 0,
  accommodation_expense NUMERIC(10,2) DEFAULT 0,
  food_expense NUMERIC(10,2) DEFAULT 0,
  printing_materials NUMERIC(10,2) DEFAULT 0,
  miscellaneous_expense NUMERIC(10,2) DEFAULT 0,
  total_expense NUMERIC(12,2) GENERATED ALWAYS AS (
    COALESCE(stall_fee, 0) + COALESCE(travel_expense, 0) + COALESCE(accommodation_expense, 0) +
    COALESCE(food_expense, 0) + COALESCE(printing_materials, 0) + COALESCE(miscellaneous_expense, 0)
  ) STORED,
  total_visitors INT DEFAULT 0,
  counselling_done INT DEFAULT 0,
  brochures_distributed INT DEFAULT 0,
  interested_students INT DEFAULT 0,
  leads_collected INT DEFAULT 0,
  stall_photos TEXT[] DEFAULT '{}',
  event_photos TEXT[] DEFAULT '{}',
  visitor_photos TEXT[] DEFAULT '{}',
  notes TEXT,
  submitted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(expo_event_id, report_date)
);

CREATE INDEX idx_expo_reports_event ON expo_daily_reports(expo_event_id);
CREATE INDEX idx_expo_reports_date ON expo_daily_reports(report_date);
CREATE INDEX idx_expo_reports_institution ON expo_daily_reports(institution_id) WHERE institution_id IS NOT NULL;

-- Add expo_event_id to admission_leads for lead-to-expo tracking
ALTER TABLE admission_leads ADD COLUMN IF NOT EXISTS expo_event_id UUID REFERENCES expo_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_admission_leads_expo ON admission_leads(expo_event_id) WHERE expo_event_id IS NOT NULL;

-- Add captured_by to admission_leads for team member attribution at expos
-- Updated: 2026-03-28 - Tracks which team member captured the lead at a booth
ALTER TABLE admission_leads ADD COLUMN IF NOT EXISTS captured_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_admission_leads_captured_by ON admission_leads(captured_by) WHERE captured_by IS NOT NULL;

-- Enable RLS on all expo tables
ALTER TABLE expo_masters ENABLE ROW LEVEL SECURITY;
ALTER TABLE expo_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE expo_event_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expo_daily_reports ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- BYOW WhatsApp Personal Connections
-- Tracks department-level personal WhatsApp connections (via QR scan)
-- Added: 2026-03-16
-- Updated: 2026-03-18 - Changed from institution_id to department_id, added client_id
-- =============================================================================

CREATE TABLE IF NOT EXISTS wa_personal_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'disconnected'
        CHECK (status IN ('disconnected', 'connecting', 'qr_ready', 'authenticated', 'ready')),
    phone_number TEXT,
    push_name TEXT,
    connected_by UUID REFERENCES auth.users(id),
    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    service_url TEXT,
    client_id TEXT,  -- Railway client ID for multi-client routing (format: dept-{uuid})
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(department_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_personal_connections_department
    ON wa_personal_connections(department_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_connections_status
    ON wa_personal_connections(status);

-- =============================================================================
-- BYOW WhatsApp Personal Message Logs
-- Audit trail for messages sent via personal WhatsApp
-- Added: 2026-03-16
-- Updated: 2026-03-18 - Changed from institution_id to department_id
-- =============================================================================

CREATE TABLE IF NOT EXISTS wa_personal_message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES wa_personal_connections(id) ON DELETE CASCADE,
    direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
    recipient_type TEXT NOT NULL CHECK (recipient_type IN ('individual', 'group', 'bulk')),
    recipient_phone TEXT NOT NULL,
    recipient_name TEXT,
    sender_phone TEXT,
    sender_name TEXT,
    message_content TEXT NOT NULL,
    message_preview TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    whatsapp_message_id TEXT,
    error_message TEXT,
    lead_id UUID,
    sent_by UUID NOT NULL REFERENCES auth.users(id),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_personal_msg_logs_department
    ON wa_personal_message_logs(department_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_msg_logs_connection
    ON wa_personal_message_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_msg_logs_lead
    ON wa_personal_message_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_msg_logs_sent_at
    ON wa_personal_message_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_personal_msg_logs_status
    ON wa_personal_message_logs(status);

-- =============================================================================
-- Expo WhatsApp Message Queue
-- Tracks WhatsApp welcome messages sent to expo leads with retry support
-- Added: 2026-03-31
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.expo_wa_message_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expo_event_id UUID NOT NULL REFERENCES expo_events(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    template_name TEXT NOT NULL DEFAULT 'exhibition_thankyou',
    template_params JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'permanently_failed', 'skipped')),
    wa_message_id TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expo_wa_queue_event
    ON expo_wa_message_queue(expo_event_id);
CREATE INDEX IF NOT EXISTS idx_expo_wa_queue_lead
    ON expo_wa_message_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_expo_wa_queue_status
    ON expo_wa_message_queue(status);
CREATE INDEX IF NOT EXISTS idx_expo_wa_queue_retry
    ON expo_wa_message_queue(status, next_retry_at)
    WHERE status IN ('queued', 'failed');
CREATE INDEX IF NOT EXISTS idx_expo_wa_queue_created
    ON expo_wa_message_queue(created_at DESC);

-- =============================================================================
-- Personal WhatsApp Message Templates
-- Customizable message templates for personal WhatsApp with variable substitution
-- Added: 2026-04-02
-- =============================================================================

CREATE TABLE IF NOT EXISTS wa_personal_message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'expo_welcome'
        CHECK (category IN ('expo_welcome', 'followup', 'reminder', 'general')),
    content TEXT NOT NULL,  -- Supports {{lead_name}}, {{parent_name}}, {{event_name}}, etc.
    variables TEXT[] DEFAULT '{}',  -- Extracted from content for validation
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_personal_templates_institution
    ON wa_personal_message_templates(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_templates_category
    ON wa_personal_message_templates(institution_id, category);
CREATE INDEX IF NOT EXISTS idx_wa_personal_templates_default
    ON wa_personal_message_templates(institution_id, is_default)
    WHERE is_default = true;

ALTER TABLE wa_personal_message_templates ENABLE ROW LEVEL SECURITY;

-- FK from expo_events to templates (deferred because template table defined after expo_events)
ALTER TABLE expo_events
    ADD CONSTRAINT fk_expo_events_wa_template
    FOREIGN KEY (wa_personal_template_id) REFERENCES wa_personal_message_templates(id) ON DELETE SET NULL;

-- =============================================================================
-- WhatsApp Auto-Trigger Rules
-- Event-driven rules that fire personal WhatsApp messages on lead events
-- Added: 2026-04-02
-- =============================================================================

CREATE TABLE IF NOT EXISTS wa_auto_trigger_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    event_type TEXT NOT NULL
        CHECK (event_type IN ('lead_created', 'stage_changed', 'followup_due', 'expo_lead_captured')),
    conditions JSONB DEFAULT '{}'::jsonb,  -- {source: [...], funnel_stage: [...], expo_event_id: ...}
    channel_priority TEXT[] DEFAULT ARRAY['personal', 'meta_waba'],
        -- Ordered preference: try first channel, fallback to next
    template_id UUID REFERENCES wa_personal_message_templates(id) ON DELETE SET NULL,
    delay_seconds INT NOT NULL DEFAULT 0,  -- 0 = immediate, >0 = delayed send
    is_active BOOLEAN DEFAULT true,
    daily_limit INT NOT NULL DEFAULT 500,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_auto_trigger_institution
    ON wa_auto_trigger_rules(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_auto_trigger_event
    ON wa_auto_trigger_rules(institution_id, event_type)
    WHERE is_active = true;

ALTER TABLE wa_auto_trigger_rules ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Personal WhatsApp Message Queue
-- Queue for auto-triggered personal WhatsApp messages with retry support
-- Added: 2026-04-02
-- =============================================================================

CREATE TABLE IF NOT EXISTS wa_personal_message_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    message_content TEXT NOT NULL,  -- Already substituted with variables
    trigger_rule_id UUID REFERENCES wa_auto_trigger_rules(id) ON DELETE SET NULL,
    channel TEXT NOT NULL DEFAULT 'personal'
        CHECK (channel IN ('personal', 'meta_waba')),
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'sent', 'failed', 'permanently_failed', 'skipped')),
    retry_count INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    error_message TEXT,
    wa_message_id TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_personal_queue_institution
    ON wa_personal_message_queue(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_queue_lead
    ON wa_personal_message_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_personal_queue_status
    ON wa_personal_message_queue(status);
CREATE INDEX IF NOT EXISTS idx_wa_personal_queue_retry
    ON wa_personal_message_queue(status, next_retry_at)
    WHERE status IN ('queued', 'failed');
CREATE INDEX IF NOT EXISTS idx_wa_personal_queue_created
    ON wa_personal_message_queue(created_at DESC);

ALTER TABLE wa_personal_message_queue ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Marketing Leads Database
-- Bulk-uploaded lead data for admission marketing campaigns
-- Added: 2026-03-17
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.marketing_leads_database (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

    -- Lead data fields
    district TEXT,
    sub_district TEXT,
    student_name TEXT NOT NULL,
    father_name TEXT,
    gender TEXT CHECK (gender IN ('Male', 'Female', 'Other')),
    community TEXT,
    mobile_number TEXT,
    group_detail TEXT,
    address TEXT,
    pincode TEXT,
    school_name TEXT,

    -- Upload tracking
    upload_batch_id UUID NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id),
    upload_file_name TEXT,

    -- Standard audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_by UUID,
    updated_by UUID
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_db_institution
    ON marketing_leads_database(institution_id);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_db_batch
    ON marketing_leads_database(upload_batch_id);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_db_district
    ON marketing_leads_database(district);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_db_mobile
    ON marketing_leads_database(mobile_number);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_db_created
    ON marketing_leads_database(created_at DESC);

ALTER TABLE marketing_leads_database ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SARVAM GALATTA EVENT REGISTRATIONS
-- Purpose: Specialized registration extension for Sarvam Galatta event.
--          Extends event_registrations with project URLs, API keys, and
--          a snapshot of the student's learner profile at registration time.
-- Added: 2026-03-19
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sarvam_galatta_registrations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Links to startup_events (for direct querying without joining event_registrations)
  event_id              UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,

  -- 1:1 extension of event_registrations (base record holds owner_id, institution_id, team_name, team_code)
  registration_id       UUID NOT NULL UNIQUE REFERENCES event_registrations(id) ON DELETE CASCADE,

  -- Learner reference
  learner_id            UUID NOT NULL REFERENCES learners_profiles(id) ON DELETE CASCADE,

  -- Snapshot of academic assignment at time of registration (nullable — partial profiles allowed)
  snap_first_name       TEXT NOT NULL,
  snap_last_name        TEXT,
  snap_institution_id   UUID REFERENCES institutions(id),
  snap_degree_id        UUID,
  snap_department_id    UUID REFERENCES departments(id),
  snap_program_id       UUID REFERENCES programs(id),
  snap_semester_id      UUID REFERENCES semesters(id),
  snap_section_id       UUID REFERENCES sections(id),

  -- Project links (all nullable on save — required enforced at app layer)
  project_url           TEXT,
  github_url            TEXT,
  supabase_project_url  TEXT,

  -- API usage page URLs — students enter which page in their app uses each API
  -- Added: 2026-03-19 via ALTER TABLE sarvam_galatta_registrations ADD COLUMN
  gemini_page_url       TEXT,
  maps_page_url         TEXT,

  -- Admin approval workflow
  -- Added: 2026-03-19 via ALTER TABLE sarvam_galatta_registrations ADD COLUMN
  -- 'waitlisted' (default) → admin reviews → 'shortlisted' or 'rejected'
  approval_status       TEXT NOT NULL DEFAULT 'waitlisted'
                          CHECK (approval_status IN ('waitlisted', 'shortlisted', 'rejected')),

  -- Edit tracking
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_edited_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Standard audit columns
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sgr_event_id        ON sarvam_galatta_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_sgr_learner_id      ON sarvam_galatta_registrations(learner_id);
CREATE INDEX IF NOT EXISTS idx_sgr_registration_id ON sarvam_galatta_registrations(registration_id);
CREATE INDEX IF NOT EXISTS idx_sgr_institution_id  ON sarvam_galatta_registrations(snap_institution_id);
CREATE INDEX IF NOT EXISTS idx_sgr_submitted_at    ON sarvam_galatta_registrations(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_sgr_approval_status ON sarvam_galatta_registrations(approval_status);

ALTER TABLE sarvam_galatta_registrations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- attendance_audit_log
-- Added: 2026-03-20 — Tracks all edits to student attendance status.
-- Append-only (no UPDATE/DELETE policies). Super admin SELECT only.
-- ON DELETE RESTRICT prevents deleting a student_attendance record
-- that has been edited, preserving the accountability chain.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.attendance_audit_log (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendance_id   UUID        REFERENCES student_attendance(id) ON DELETE RESTRICT,
    period_id       TEXT        NOT NULL,
    student_id      UUID        NOT NULL,
    old_status      TEXT        NOT NULL CHECK (old_status IN ('Present', 'Absent', 'OnDuty')),
    new_status      TEXT        NOT NULL CHECK (new_status IN ('Present', 'Absent', 'OnDuty')),
    edited_by       UUID        NOT NULL REFERENCES profiles(id),
    edited_by_name  TEXT        NOT NULL,
    edited_by_role  TEXT        NOT NULL,
    edited_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    institution_id  UUID        NOT NULL REFERENCES institutions(id),
    attendance_date DATE        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_attendance_id
    ON attendance_audit_log(attendance_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_edited_at
    ON attendance_audit_log(edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_student_id
    ON attendance_audit_log(student_id, edited_at DESC);

-- Updated: 2026-03-20 — Added institution_off_days for pending attendance filtering
CREATE TABLE IF NOT EXISTS institution_off_days (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  off_date        DATE NOT NULL,
  reason          TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(institution_id, off_date)
);

CREATE INDEX IF NOT EXISTS idx_institution_off_days
  ON institution_off_days(institution_id, off_date);

-- =====================================================
-- VAC (Value-Added Courses) + CASE Graduation Tracker
-- Added: 2026-04-02
-- =====================================================

-- Add programme_id to profiles if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS programme_id UUID REFERENCES programs(id);
CREATE INDEX IF NOT EXISTS idx_profiles_programme ON profiles(programme_id);

-- 1. vac_courses — Core course definitions
CREATE TABLE IF NOT EXISTS vac_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  institution VARCHAR(100),
  track VARCHAR(50) DEFAULT 'general',
  duration_hours INTEGER DEFAULT 30,
  weeks INTEGER DEFAULT 3,
  fee NUMERIC(10,2) DEFAULT 500.00,
  is_active BOOLEAN DEFAULT true,
  overall_finks_profile JSONB,
  ai_era_strategic_value INTEGER,
  programme_id UUID REFERENCES programs(id),
  institution_id UUID REFERENCES institutions(id),
  faculty_eligible BOOLEAN DEFAULT false,
  course_category TEXT DEFAULT 'add_on' CHECK (course_category IN ('add_on', 'value_add')),
  nsqf_level INTEGER CHECK (nsqf_level BETWEEN 1 AND 10),
  nheqf_level INTEGER CHECK (nheqf_level BETWEEN 4 AND 10),
  ncrf_credits NUMERIC(4,1),
  ncrf_credit_hours INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vac_courses_institution_text ON vac_courses(institution);
CREATE INDEX IF NOT EXISTS idx_vac_courses_track ON vac_courses(track);
CREATE INDEX IF NOT EXISTS idx_vac_courses_active ON vac_courses(is_active);
CREATE INDEX IF NOT EXISTS idx_vac_courses_programme ON vac_courses(programme_id);
CREATE INDEX IF NOT EXISTS idx_vac_courses_institution ON vac_courses(institution_id);
CREATE INDEX IF NOT EXISTS idx_vac_courses_category ON vac_courses(course_category);

-- 2. vac_lessons — Individual lesson content (30 per course)
CREATE TABLE IF NOT EXISTS vac_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  hour INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  prerequisites TEXT,
  toolboxes TEXT,
  learning_outcomes JSONB DEFAULT '[]'::jsonb,
  faculty_script JSONB DEFAULT '[]'::jsonb,
  student_content JSONB DEFAULT '[]'::jsonb,
  exercises JSONB DEFAULT '[]'::jsonb,
  gemini_prompts JSONB DEFAULT '[]'::jsonb,
  error_troubleshooting JSONB DEFAULT '[]'::jsonb,
  interview_questions JSONB DEFAULT '[]'::jsonb,
  resources JSONB DEFAULT '[]'::jsonb,
  self_check JSONB DEFAULT '[]'::jsonb,
  ltl_phase TEXT DEFAULT 'learn' CHECK (ltl_phase IN ('learn', 'leverage', 'both')),
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, hour)
);

CREATE INDEX IF NOT EXISTS idx_vac_lessons_course ON vac_lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_vac_lessons_course_week ON vac_lessons(course_id, week, hour);

-- 3. vac_enrollments — Learner-to-course enrollment
CREATE TABLE IF NOT EXISTS vac_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'waived', 'refunded')),
  payment_amount NUMERIC(10,2),
  payment_date TIMESTAMPTZ,
  payment_reference VARCHAR(100),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_vac_enrollments_user ON vac_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_vac_enrollments_course ON vac_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_vac_enrollments_status ON vac_enrollments(status);

-- 4. vac_learner_progress — Per-lesson progress tracking
CREATE TABLE IF NOT EXISTS vac_learner_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES vac_lessons(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'tested_out')),
  completed_at TIMESTAMPTZ,
  score NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_vac_progress_user_course ON vac_learner_progress(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_vac_progress_lesson ON vac_learner_progress(lesson_id);

-- 5. vac_course_programmes — Junction: course-to-programme mapping
CREATE TABLE IF NOT EXISTS vac_course_programmes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  programme_id UUID NOT NULL REFERENCES programs(id),
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(course_id, programme_id)
);

CREATE INDEX IF NOT EXISTS idx_vac_cp_course ON vac_course_programmes(course_id);
CREATE INDEX IF NOT EXISTS idx_vac_cp_programme ON vac_course_programmes(programme_id);

-- 6. case_tracks — 6 CASE graduation tracks (4 AI + 2 Human)
CREATE TABLE IF NOT EXISTS case_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_code TEXT UNIQUE NOT NULL,
  track_name TEXT NOT NULL,
  track_type TEXT NOT NULL CHECK (track_type IN ('ai_mastery', 'human_excellence')),
  sequence_order INTEGER NOT NULL,
  prerequisite_track_id UUID REFERENCES case_tracks(id),
  duration_hours INTEGER DEFAULT 30,
  description TEXT,
  completion_attendance_threshold NUMERIC DEFAULT 0.75,
  completion_grader_threshold NUMERIC DEFAULT 0.80,
  completion_project_required BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. case_track_courses — Links tracks to VAC courses per programme/institution
CREATE TABLE IF NOT EXISTS case_track_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES case_tracks(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES vac_courses(id) ON DELETE CASCADE,
  programme_id UUID REFERENCES programs(id),
  institution_id UUID REFERENCES institutions(id),
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_tc_track ON case_track_courses(track_id);
CREATE INDEX IF NOT EXISTS idx_case_tc_course ON case_track_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_case_tc_programme ON case_track_courses(programme_id);
CREATE INDEX IF NOT EXISTS idx_case_tc_institution ON case_track_courses(institution_id);

-- 8. case_track_enrollments — Learner enrollment in a CASE track
CREATE TABLE IF NOT EXISTS case_track_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  track_id UUID NOT NULL REFERENCES case_tracks(id),
  course_id UUID REFERENCES vac_courses(id),
  batch_id UUID,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'in_progress', 'completed', 'incomplete', 'retry')),
  attendance_percentage NUMERIC DEFAULT 0,
  grader_score_average NUMERIC DEFAULT 0,
  project_submitted BOOLEAN DEFAULT false,
  project_score NUMERIC,
  completion_gate_attendance BOOLEAN DEFAULT false,
  completion_gate_grader BOOLEAN DEFAULT false,
  completion_gate_project BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  previous_enrollment_id UUID REFERENCES case_track_enrollments(id),
  placement_score NUMERIC,
  placement_start_week INTEGER DEFAULT 1,
  placement_taken_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_te_user ON case_track_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_case_te_track ON case_track_enrollments(track_id);
CREATE INDEX IF NOT EXISTS idx_case_te_status ON case_track_enrollments(status);

-- 9. case_batches — Scheduled delivery batches per track
CREATE TABLE IF NOT EXISTS case_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES case_tracks(id),
  institution_id UUID REFERENCES institutions(id),
  batch_code TEXT,
  delivery_format TEXT DEFAULT 'moderate' CHECK (delivery_format IN ('spread', 'moderate', 'intensive')),
  start_date DATE,
  end_date DATE,
  schedule_json JSONB,
  max_capacity INTEGER DEFAULT 60,
  current_enrollment INTEGER DEFAULT 0,
  facilitator_id UUID,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'open', 'in_progress', 'completed', 'cancelled')),
  is_auto_suggested BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_batches_track ON case_batches(track_id);
CREATE INDEX IF NOT EXISTS idx_case_batches_institution ON case_batches(institution_id);
CREATE INDEX IF NOT EXISTS idx_case_batches_status ON case_batches(status);

-- 10. case_learner_progress — Overall CASE graduation progress per learner
CREATE TABLE IF NOT EXISTS case_learner_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  programme_id UUID NOT NULL REFERENCES programs(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  admission_semester INTEGER DEFAULT 1,
  current_semester INTEGER DEFAULT 1,
  tracks_completed INTEGER DEFAULT 0,
  total_hours_completed NUMERIC DEFAULT 0,
  graduation_ready BOOLEAN DEFAULT false,
  estimated_exam_date DATE,
  risk_level TEXT DEFAULT 'on_track' CHECK (risk_level IN ('on_track', 'at_risk', 'critical', 'overdue', 'completed')),
  last_alert_sent_at TIMESTAMPTZ,
  agency_index NUMERIC(3,1) DEFAULT 0.0 CHECK (agency_index BETWEEN 0 AND 10),
  agency_dimensions JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, programme_id)
);

CREATE INDEX IF NOT EXISTS idx_case_lp_user ON case_learner_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_case_lp_programme ON case_learner_progress(programme_id);
CREATE INDEX IF NOT EXISTS idx_case_lp_institution ON case_learner_progress(institution_id);
CREATE INDEX IF NOT EXISTS idx_case_lp_risk ON case_learner_progress(risk_level);

-- 11. case_alerts — CASE risk and deadline alerts
CREATE TABLE IF NOT EXISTS case_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  alert_type TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_via TEXT[] DEFAULT '{push}',
  sent_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ,
  coordinator_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_alerts_user ON case_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_case_alerts_type ON case_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_case_alerts_read ON case_alerts(user_id, read_at) WHERE read_at IS NULL;

-- 12. case_graduation_requirements — Per-programme graduation config
CREATE TABLE IF NOT EXISTS case_graduation_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID NOT NULL REFERENCES programs(id),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  total_tracks_required INTEGER DEFAULT 6,
  total_hours_required INTEGER DEFAULT 180,
  programme_duration_semesters INTEGER NOT NULL,
  enforcement_days_before_exam INTEGER DEFAULT 25,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_gr_programme ON case_graduation_requirements(programme_id);
CREATE INDEX IF NOT EXISTS idx_case_gr_institution ON case_graduation_requirements(institution_id);

-- ============================================================================
-- EVENTS MODULE — Core Tables (shared by all event types)
-- Created: 2026-04-07
-- Note: Tables use "events_" prefix where collision exists with Startup Studio
--       (Startup Studio already owns "event_registrations")
-- ============================================================================

-- Base event table — holds common fields for all event types
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id),
  event_type TEXT NOT NULL,  -- 'marathon', 'cultural_fest', 'seminar', 'workshop', 'sports_day', 'conference'
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- for public URLs: /public/events/kbm-marathon-2026
  description TEXT,
  theme TEXT,
  tagline TEXT,

  -- Dates
  event_date DATE,
  start_time TIME,
  end_time TIME,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  registration_open_date TIMESTAMPTZ,
  registration_close_date TIMESTAMPTZ,

  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','planning','preparation','execution','live','post_event','archived','cancelled')),

  -- Configuration (JSONB for type-specific settings)
  config JSONB NOT NULL DEFAULT '{}',
  registration_config JSONB NOT NULL DEFAULT '{}',
  route_config JSONB NOT NULL DEFAULT '{}',
  branding_config JSONB NOT NULL DEFAULT '{}',

  -- Capacity
  target_registrations INT,
  max_registrations INT,

  -- Visibility & Access
  is_public BOOLEAN NOT NULL DEFAULT true,
  allow_external_registration BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Recurrence
  previous_event_id UUID REFERENCES public.events(id),
  year INT,
  edition_number INT,

  -- Media
  hero_image_url TEXT,
  hero_video_url TEXT,
  venue TEXT,
  venue_address TEXT,
  venue_coordinates JSONB,  -- {lat, lng}

  -- Audit
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_institution ON public.events(institution_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON public.events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_slug ON public.events(slug);
CREATE INDEX IF NOT EXISTS idx_events_date ON public.events(event_date);

-- Event categories (race categories for marathon, competition categories for cultural fest, etc.)
CREATE TABLE IF NOT EXISTS public.event_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,                 -- short code: '10K', '5K', '3K'
  description TEXT,
  distance_km NUMERIC(8,2), -- for marathon categories
  max_participants INT,
  min_age INT,
  max_age INT,
  fee_amount NUMERIC(10,2) DEFAULT 0,
  early_bird_fee NUMERIC(10,2),
  early_bird_deadline TIMESTAMPTZ,
  config JSONB DEFAULT '{}',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_categories_event ON public.event_categories(event_id);

-- External participants who don't have JKKN accounts
CREATE TABLE IF NOT EXISTS public.event_external_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  age INT,
  gender TEXT,
  date_of_birth DATE,
  blood_group TEXT,
  organization TEXT,         -- their school/college/company
  city TEXT,
  state TEXT,
  id_proof_type TEXT,
  id_proof_number TEXT,
  photo_url TEXT,
  linked_profile_id UUID REFERENCES public.profiles(id),  -- if they later become JKKN user
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(phone)
);

CREATE INDEX IF NOT EXISTS idx_event_ext_participants_phone ON public.event_external_participants(phone);

-- Unified registration table for the Events module
-- NOTE: Named "events_registrations" (with 's') to avoid collision with
--       Startup Studio's "event_registrations" table
CREATE TABLE IF NOT EXISTS public.events_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.event_categories(id),

  -- Participant identity (one of these will be set)
  profile_id UUID REFERENCES public.profiles(id),
  learner_id UUID,  -- references learners_profiles(id) but no FK for flexibility
  external_participant_id UUID REFERENCES public.event_external_participants(id),

  -- Participant type
  participant_type TEXT NOT NULL DEFAULT 'internal'
    CHECK (participant_type IN ('internal', 'external')),

  -- Denormalized participant info (for quick display without joins)
  participant_name TEXT NOT NULL,
  participant_phone TEXT,
  participant_email TEXT,
  participant_age INT,
  participant_gender TEXT,
  institution_id UUID REFERENCES public.institutions(id),
  institution_name TEXT,
  department TEXT,

  -- Registration identifiers
  bib_number TEXT UNIQUE,
  registration_number TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('pending','registered','confirmed','checked_in','cancelled','disqualified','no_show','waitlisted')),
  checked_in BOOLEAN DEFAULT false,
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID REFERENCES public.profiles(id),

  -- Payment
  payment_status TEXT DEFAULT 'not_required'
    CHECK (payment_status IN ('not_required','pending','paid','refunded','waived','failed')),
  payment_amount NUMERIC(10,2) DEFAULT 0,
  payment_method TEXT,
  payment_reference TEXT,
  discount_code TEXT,
  discount_amount NUMERIC(10,2) DEFAULT 0,

  -- Event-specific custom data
  custom_data JSONB DEFAULT '{}',  -- tshirt_size, emergency_contact, dietary_pref, etc.

  -- Source tracking
  source TEXT DEFAULT 'internal',  -- 'internal', 'external_app', 'bulk_upload', 'admin'
  referral_source TEXT,

  -- Audit
  registered_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_registrations_event ON public.events_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_events_registrations_category ON public.events_registrations(category_id);
CREATE INDEX IF NOT EXISTS idx_events_registrations_profile ON public.events_registrations(profile_id);
CREATE INDEX IF NOT EXISTS idx_events_registrations_phone ON public.events_registrations(participant_phone);
CREATE INDEX IF NOT EXISTS idx_events_registrations_bib ON public.events_registrations(bib_number);
CREATE INDEX IF NOT EXISTS idx_events_registrations_status ON public.events_registrations(status);
CREATE INDEX IF NOT EXISTS idx_events_registrations_institution ON public.events_registrations(institution_id);

-- Payment transactions for events (separate from billing payment_transactions)
CREATE TABLE IF NOT EXISTS public.event_payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id),
  registration_id UUID REFERENCES public.events_registrations(id),
  transaction_ref TEXT UNIQUE NOT NULL,  -- unique reference for HDFC

  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated','processing','success','failed','cancelled','expired','refunded')),

  payment_method TEXT,
  gateway_session_id TEXT UNIQUE,
  gateway_transaction_id TEXT,
  gateway_response JSONB,

  payer_name TEXT,
  payer_phone TEXT,
  payer_email TEXT,

  discount_code TEXT,
  discount_amount NUMERIC(10,2) DEFAULT 0,

  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refund_amount NUMERIC(10,2),
  refund_reason TEXT,

  institution_id UUID REFERENCES public.institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_payments_event ON public.event_payment_transactions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_payments_registration ON public.event_payment_transactions(registration_id);
CREATE INDEX IF NOT EXISTS idx_event_payments_status ON public.event_payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_event_payments_session ON public.event_payment_transactions(gateway_session_id);
CREATE INDEX IF NOT EXISTS idx_event_payments_ref ON public.event_payment_transactions(transaction_ref);

-- ============================================================================
-- EVENTS MODULE — Marathon Extension Tables
-- Created: 2026-04-07
-- ============================================================================

-- Sponsors with pipeline tracking (CRM)
CREATE TABLE IF NOT EXISTS public.marathon_sponsors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  logo_url TEXT,
  tier TEXT DEFAULT 'prospect'
    CHECK (tier IN ('prospect','contacted','negotiating','committed','platinum','gold','silver','bronze','in_kind')),
  amount_pledged NUMERIC(10,2) DEFAULT 0,
  amount_received NUMERIC(10,2) DEFAULT 0,
  benefits TEXT,              -- what we offer
  expectations TEXT,          -- what they expect
  notes TEXT,
  pipeline_stage TEXT DEFAULT 'lead'
    CHECK (pipeline_stage IN ('lead','contacted','proposal_sent','negotiating','committed','declined','churned')),
  signed_date DATE,
  institution_id UUID REFERENCES public.institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_sponsors_event ON public.marathon_sponsors(event_id);

-- Sponsor deliverables checklist
CREATE TABLE IF NOT EXISTS public.marathon_sponsor_deliverables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sponsor_id UUID NOT NULL REFERENCES public.marathon_sponsors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,              -- 'branding', 'logistics', 'media', 'activation'
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','cancelled')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sponsor interaction history
CREATE TABLE IF NOT EXISTS public.marathon_sponsor_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sponsor_id UUID NOT NULL REFERENCES public.marathon_sponsors(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, -- 'call', 'email', 'meeting', 'payment', 'note'
  description TEXT NOT NULL,
  performed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Committees for event organization
CREATE TABLE IF NOT EXISTS public.marathon_committees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,          -- 'Logistics', 'Medical', 'Marketing', 'Tech'
  description TEXT,
  lead_id UUID REFERENCES public.profiles(id),
  lead_name TEXT,
  member_ids UUID[] DEFAULT '{}',
  member_names TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_committees_event ON public.marathon_committees(event_id);

-- Tasks assigned to committees
CREATE TABLE IF NOT EXISTS public.marathon_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  committee_id UUID NOT NULL REFERENCES public.marathon_committees(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','cancelled','blocked')),
  priority TEXT DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','critical')),
  assigned_to UUID REFERENCES public.profiles(id),
  assigned_to_name TEXT,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_tasks_committee ON public.marathon_tasks(committee_id);
CREATE INDEX IF NOT EXISTS idx_marathon_tasks_event ON public.marathon_tasks(event_id);

-- Budget line items
CREATE TABLE IF NOT EXISTS public.marathon_budget_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  category TEXT NOT NULL,     -- 'venue', 'logistics', 'marketing', 'prizes', 'food', 'medical', 'misc'
  description TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense'
    CHECK (type IN ('income','expense')),
  estimated_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'planned'
    CHECK (status IN ('planned','approved','spent','cancelled')),
  approved_by UUID REFERENCES public.profiles(id),
  vendor TEXT,
  receipt_url TEXT,
  notes TEXT,
  institution_id UUID REFERENCES public.institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_budget_event ON public.marathon_budget_items(event_id);

-- Route checkpoints
CREATE TABLE IF NOT EXISTS public.marathon_checkpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,          -- 'Water Station 1', 'Medical Post 2', 'KM 5 Marker'
  type TEXT DEFAULT 'waypoint'
    CHECK (type IN ('start','finish','water','medical','waypoint','km_marker')),
  distance_from_start_km NUMERIC(8,3),
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  qr_code_data TEXT,           -- QR code content for scanning
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_checkpoints_event ON public.marathon_checkpoints(event_id);

-- QR scan records at checkpoints
CREATE TABLE IF NOT EXISTS public.marathon_checkpoint_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checkpoint_id UUID NOT NULL REFERENCES public.marathon_checkpoints(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id),
  registration_id UUID REFERENCES public.events_registrations(id),
  bib_number TEXT NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  scanned_by TEXT,             -- volunteer name or 'self'
  lat NUMERIC(10,7),
  lng NUMERIC(10,7)
);

CREATE INDEX IF NOT EXISTS idx_marathon_scans_checkpoint ON public.marathon_checkpoint_scans(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_marathon_scans_event ON public.marathon_checkpoint_scans(event_id);
CREATE INDEX IF NOT EXISTS idx_marathon_scans_bib ON public.marathon_checkpoint_scans(bib_number);

-- Race results and rankings
CREATE TABLE IF NOT EXISTS public.marathon_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID UNIQUE NOT NULL REFERENCES public.events_registrations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id),
  bib_number TEXT NOT NULL,
  finish_time TEXT,            -- formatted: "01:42:15"
  finish_time_seconds INT,    -- total seconds for sorting
  pace_per_km_seconds INT,    -- seconds per km
  rank_overall INT,
  rank_category INT,
  rank_gender INT,
  rank_institution INT,
  certificate_id TEXT UNIQUE,
  certificate_url TEXT,
  certificate_generated_at TIMESTAMPTZ,
  is_dnf BOOLEAN DEFAULT false,        -- Did Not Finish
  is_disqualified BOOLEAN DEFAULT false,
  disqualification_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_results_event ON public.marathon_results(event_id);
CREATE INDEX IF NOT EXISTS idx_marathon_results_bib ON public.marathon_results(bib_number);
CREATE INDEX IF NOT EXISTS idx_marathon_results_cert ON public.marathon_results(certificate_id);

-- Race day incidents
CREATE TABLE IF NOT EXISTS public.marathon_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK (type IN ('medical','logistics','security','weather','technical','other')),
  severity TEXT NOT NULL DEFAULT 'low'
    CHECK (severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  lat NUMERIC(10,7),
  lng NUMERIC(10,7),
  reported_by UUID REFERENCES public.profiles(id),
  reported_by_name TEXT,
  status TEXT DEFAULT 'reported'
    CHECK (status IN ('reported','acknowledged','in_progress','resolved','closed')),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  bib_number TEXT,             -- affected runner (if applicable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_incidents_event ON public.marathon_incidents(event_id);

-- Volunteer station check-ins
CREATE TABLE IF NOT EXISTS public.marathon_volunteer_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  checkpoint_id UUID REFERENCES public.marathon_checkpoints(id),
  volunteer_name TEXT NOT NULL,
  volunteer_phone TEXT,
  station TEXT NOT NULL,       -- 'Water Station 1', 'Medical Post A'
  role TEXT,                   -- 'water_distributor', 'medic', 'marshal', 'photographer'
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_out_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_marathon_volunteers_event ON public.marathon_volunteer_checkins(event_id);

-- GPS position — latest per runner (UPSERT pattern)
CREATE TABLE IF NOT EXISTS public.marathon_race_tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id),
  bib TEXT NOT NULL,
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  distance_km NUMERIC(8,3) DEFAULT 0,
  pace_per_km NUMERIC(8,2) DEFAULT 0,
  elapsed_seconds INT DEFAULT 0,
  altitude NUMERIC(8,2),
  heading NUMERIC(6,2),
  speed NUMERIC(6,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, bib)
);

CREATE INDEX IF NOT EXISTS idx_marathon_race_tracks_event ON public.marathon_race_tracks(event_id);
CREATE INDEX IF NOT EXISTS idx_marathon_race_tracks_bib ON public.marathon_race_tracks(bib);

-- GPS breadcrumb trail (append-only for race replay)
CREATE TABLE IF NOT EXISTS public.marathon_race_track_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL,
  bib TEXT NOT NULL,
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  speed NUMERIC(6,2),
  accuracy NUMERIC(6,2),
  altitude NUMERIC(8,2),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marathon_track_points_event_bib ON public.marathon_race_track_points(event_id, bib);

-- ============================================================
-- EVENT STALLS (Marathon kit distribution stations)
-- Updated: 2026-04-11 - Created for marathon ops system
-- ============================================================
CREATE TABLE IF NOT EXISTS events_stalls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  stall_name TEXT NOT NULL,
  stall_code TEXT NOT NULL,
  capacity INT NOT NULL DEFAULT 100,
  location_note TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, stall_code)
);

CREATE INDEX IF NOT EXISTS idx_events_stalls_event ON events_stalls(event_id);

-- Ops tracking columns on events_registrations
-- stall_id, tshirt_collected, certificate_issued
-- (Added via ALTER TABLE - columns already exist in live DB)
CREATE INDEX IF NOT EXISTS idx_marathon_track_points_timestamp ON public.marathon_race_track_points(timestamp);

-- ═══════════════════════════════════════════════════════════════════════════
-- ADMISSION FORM BUILDER TABLES
-- Added: 2026-04-08 — Dynamic public admission forms
-- ═══════════════════════════════════════════════════════════════════════════

-- Pre-built form templates (system + user-created)
CREATE TABLE IF NOT EXISTS admission_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  form_type text NOT NULL DEFAULT 'admission',
  template_data jsonb NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Main form configuration
CREATE TABLE IF NOT EXISTS admission_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  form_type text NOT NULL DEFAULT 'admission',
  institution_ids uuid[] DEFAULT '{}',
  program_ids uuid[] DEFAULT '{}',
  logo_url text,
  banner_url text,
  primary_color text DEFAULT '#1a73e8',
  thank_you_title text DEFAULT 'Application Received!',
  thank_you_message text DEFAULT 'Thank you for your interest. Our team will contact you shortly.',
  is_active boolean NOT NULL DEFAULT true,
  allow_duplicate boolean NOT NULL DEFAULT false,
  auto_whatsapp boolean NOT NULL DEFAULT true,
  wa_template_id uuid,
  max_submissions integer,
  starts_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Form sections (group fields visually)
CREATE TABLE IF NOT EXISTS admission_form_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES admission_forms(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_collapsible boolean NOT NULL DEFAULT false,
  condition jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Individual form fields
CREATE TABLE IF NOT EXISTS admission_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES admission_forms(id) ON DELETE CASCADE,
  section_id uuid REFERENCES admission_form_sections(id) ON DELETE SET NULL,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN (
    'text', 'number', 'phone', 'email', 'select', 'multi_select',
    'date', 'textarea', 'file', 'checkbox', 'radio',
    'institution_program_selector'
  )),
  placeholder text,
  help_text text,
  is_required boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  min_length integer,
  max_length integer,
  min_value numeric,
  max_value numeric,
  pattern text,
  options jsonb DEFAULT '[]',
  condition jsonb,
  lead_field_map text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Raw form submissions
CREATE TABLE IF NOT EXISTS admission_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES admission_forms(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES admission_leads(id) ON DELETE SET NULL,
  institution_id uuid REFERENCES institutions(id),
  submission_data jsonb NOT NULL DEFAULT '{}',
  ip_address text,
  user_agent text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer_url text,
  device_type text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

-- Analytics events
CREATE TABLE IF NOT EXISTS admission_form_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES admission_forms(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'form_viewed', 'form_started', 'field_focused', 'field_completed',
    'form_submitted', 'form_abandoned'
  )),
  field_key text,
  session_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_admission_forms_institution ON admission_forms(institution_id);
CREATE INDEX IF NOT EXISTS idx_admission_forms_slug ON admission_forms(slug);
CREATE INDEX IF NOT EXISTS idx_admission_forms_status ON admission_forms(status);
CREATE INDEX IF NOT EXISTS idx_admission_form_fields_form ON admission_form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_fields_section ON admission_form_fields(section_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_sections_form ON admission_form_sections(form_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_submissions_form ON admission_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_submissions_lead ON admission_form_submissions(lead_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_events_form ON admission_form_events(form_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_events_session ON admission_form_events(session_id);
CREATE INDEX IF NOT EXISTS idx_admission_form_events_type ON admission_form_events(event_type);
CREATE INDEX IF NOT EXISTS idx_admission_form_events_created ON admission_form_events(created_at);

-- =====================================================================
-- 2026-04-15 — HR Recruitment Phase 1A: hr_recruitment_candidates
-- Spec: specs/hr-recruitment-module-spec.md
-- Decisions: R1.1-R1.4, R2.1-R2.4, R3.1-R3.4, R4.1 (shadow-tenant pattern)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.hr_recruitment_candidates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id      uuid NOT NULL,                                  -- shadow-tenant FK (mirrors hr_leave_applications)
  institution_id          uuid REFERENCES public.institutions(id),        -- for role_has_institution_access() scoping
  name                    text NOT NULL,
  email                   text NOT NULL,
  phone                   text,
  cvviz_url               text NOT NULL,                                  -- R3.4: CV link mandatory
  role_category           text NOT NULL CHECK (role_category IN (
                            'teaching_faculty',
                            'medical',
                            'non_teaching',
                            'senior_leadership',
                            'contract'
                          )),
  role_title              text NOT NULL,
  proposed_ctc_band       text CHECK (proposed_ctc_band IN (
                            'under_6L',
                            '6L_to_12L',
                            'over_12L'
                          )),
  role_specific_details   jsonb NOT NULL DEFAULT '{}',                   -- R1.3: flexible per-role data
  status                  text NOT NULL DEFAULT 'submitted' CHECK (status IN (
                            'submitted',
                            'pending_approval',
                            'approved',
                            'package_fixed',
                            'offer_issued',
                            'joined',
                            'rejected',
                            'withdrawn',
                            'offer_rescinded',
                            'no_show'
                          )),
  cancellation_reason     text,                                           -- R2.1
  is_emergency            boolean NOT NULL DEFAULT false,                 -- R3.2
  is_internal_transfer    boolean NOT NULL DEFAULT false,                 -- R4.1
  source_staff_id         uuid REFERENCES public.staff(id),              -- R4.1: FK when internal transfer
  source                  text NOT NULL DEFAULT 'hr_submission' CHECK (source IN (
                            'hr_submission',
                            'principal_submission',
                            'hod_submission',
                            'internal_transfer',
                            'learner_graduate',
                            'public_careers_page',
                            'email_ingest'
                          )),
  approval_chain          jsonb,                                          -- R1.4: frozen snapshot at approval moment
  current_step            int NOT NULL DEFAULT 0,
  final_approver_id       uuid REFERENCES public.profiles(id),
  final_decided_at        timestamptz,
  rejection_reason        text,
  expected_joining_date   date,
  actual_joining_date     date,
  submitted_by            uuid NOT NULL REFERENCES public.profiles(id),
  submitted_at            timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_hr_org
  ON public.hr_recruitment_candidates(hr_organization_id);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_institution
  ON public.hr_recruitment_candidates(institution_id);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_status
  ON public.hr_recruitment_candidates(status);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_role_category
  ON public.hr_recruitment_candidates(role_category);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_submitted_at
  ON public.hr_recruitment_candidates(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_submitted_by
  ON public.hr_recruitment_candidates(submitted_by);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_is_emergency
  ON public.hr_recruitment_candidates(is_emergency);

-- =====================================================================
-- 2026-04-15 — HR Recruitment Phase 1A: hr_recruitment_candidate_packages
-- Spec: specs/hr-recruitment-module-spec.md
-- Decision R2.3 + Learning #8 (CTC on separate table, stricter RLS)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.hr_recruitment_candidate_packages (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id            uuid NOT NULL REFERENCES public.hr_recruitment_candidates(id) ON DELETE CASCADE,
  hr_organization_id      uuid,                                           -- mirrors parent for org-level queries
  proposed_by             uuid NOT NULL REFERENCES public.profiles(id),
  proposed_ctc_amount     numeric NOT NULL,                               -- the CTC being proposed
  proposed_ctc_breakdown  jsonb,                                          -- optional: basic/HRA/DA/PF structure
  currency                text NOT NULL DEFAULT 'INR',
  is_counter_offer        boolean NOT NULL DEFAULT false,                 -- true if Director counter to HR's proposal
  parent_package_id       uuid REFERENCES public.hr_recruitment_candidate_packages(id), -- for negotiation chain
  status                  text NOT NULL DEFAULT 'proposed' CHECK (status IN (
                            'proposed',
                            'approved',
                            'countered',
                            'rejected'
                          )),
  approved_by             uuid REFERENCES public.profiles(id),
  approved_at             timestamptz,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_packages_candidate
  ON public.hr_recruitment_candidate_packages(candidate_id);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_packages_proposed_by
  ON public.hr_recruitment_candidate_packages(proposed_by);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_packages_status
  ON public.hr_recruitment_candidate_packages(status);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_packages_parent
  ON public.hr_recruitment_candidate_packages(parent_package_id);

-- =====================================================================
-- 2026-04-15 — HR Recruitment Phase 1A: Seeds
-- hr_approval_flows rows for recruitment_approval (O2, R3.1, R3.3)
-- hr_onboarding_checklists rows per cadre (O3)
-- NOTE: These are INSERT ... ON CONFLICT DO NOTHING so safe to re-run.
-- The hr_organization_id placeholder '00000000-0000-0000-0000-000000000001'
-- must be replaced with the live JKKN hr_organization id before applying.
-- =====================================================================

-- Seed: hr_approval_flows for recruitment_approval
-- 5 rows covering role_category × ctc_band routing per spec section 4
-- chain_order=1 is the first approver, chain_order=2 is the second, etc.
-- escalate_after_hours=72 per R3.3 (3 days)

INSERT INTO public.hr_approval_flows (
  hr_organization_id,
  flow_for,
  flow_name,
  conditions,
  steps,
  is_active
) VALUES
  -- Teaching faculty < ₹6L → Principal + HOD
  (
    '00000000-0000-0000-0000-000000000001',
    'recruitment_approval',
    'Teaching Faculty — Under 6L',
    '{"role_category": "teaching_faculty", "ctc_band": "under_6L"}',
    '[{"chain_order":1,"approver_role":"principal","escalate_after_hours":72},{"chain_order":2,"approver_role":"hod","escalate_after_hours":72}]',
    true
  ),
  -- Teaching faculty ₹6L–₹12L → Principal + COO
  (
    '00000000-0000-0000-0000-000000000001',
    'recruitment_approval',
    'Teaching Faculty — 6L to 12L',
    '{"role_category": "teaching_faculty", "ctc_band": "6L_to_12L"}',
    '[{"chain_order":1,"approver_role":"principal","escalate_after_hours":72},{"chain_order":2,"approver_role":"coo","escalate_after_hours":72}]',
    true
  ),
  -- Teaching faculty > ₹12L → Director (mandatory per spec §4)
  (
    '00000000-0000-0000-0000-000000000001',
    'recruitment_approval',
    'Teaching Faculty — Over 12L (Director)',
    '{"role_category": "teaching_faculty", "ctc_band": "over_12L"}',
    '[{"chain_order":1,"approver_role":"director","escalate_after_hours":72}]',
    true
  ),
  -- Medical/clinical → Medical Superintendent + Director
  (
    '00000000-0000-0000-0000-000000000001',
    'recruitment_approval',
    'Medical & Clinical Staff',
    '{"role_category": "medical"}',
    '[{"chain_order":1,"approver_role":"medical_superintendent","escalate_after_hours":72},{"chain_order":2,"approver_role":"director","escalate_after_hours":72}]',
    true
  ),
  -- Non-teaching (admin, IT, support) → COO + HR Head
  (
    '00000000-0000-0000-0000-000000000001',
    'recruitment_approval',
    'Non-Teaching Staff',
    '{"role_category": "non_teaching"}',
    '[{"chain_order":1,"approver_role":"coo","escalate_after_hours":72},{"chain_order":2,"approver_role":"hr_head","escalate_after_hours":72}]',
    true
  ),
  -- Senior leadership (Principal-level) → Director + Board
  (
    '00000000-0000-0000-0000-000000000001',
    'recruitment_approval',
    'Senior Leadership',
    '{"role_category": "senior_leadership"}',
    '[{"chain_order":1,"approver_role":"director","escalate_after_hours":72},{"chain_order":2,"approver_role":"board","escalate_after_hours":72}]',
    true
  ),
  -- Contract/temp → HR Head only (Director notified, not approving per spec §4)
  (
    '00000000-0000-0000-0000-000000000001',
    'recruitment_approval',
    'Contract & Temporary Staff',
    '{"role_category": "contract"}',
    '[{"chain_order":1,"approver_role":"hr_head","escalate_after_hours":72}]',
    true
  )
ON CONFLICT DO NOTHING;

-- Seed: hr_onboarding_checklists — one per cadre (O3)
INSERT INTO public.hr_onboarding_checklists (
  hr_organization_id,
  checklist_name,
  steps,
  is_active
) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Teaching Faculty Onboarding',
    '[
      {"step": "Collect and verify original certificates (degree, PG, PhD if applicable)"},
      {"step": "Issue institutional ID card and biometric registration"},
      {"step": "Set up official email account (name@jkkn.ac.in)"},
      {"step": "Complete HR policies acknowledgement form"},
      {"step": "Department introduction and HOD meeting"},
      {"step": "Timetable and Learning Studio assignment briefing"},
      {"step": "Issue offer letter and appointment order"},
      {"step": "Open salary account (JKKN partner bank)"},
      {"step": "Add to MyJKKN attendance and leave management"},
      {"step": "NAAC faculty data entry in academic portal"}
    ]',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Supporting Technical Staff Onboarding',
    '[
      {"step": "Collect identity and address proof documents"},
      {"step": "Issue institutional ID card and biometric registration"},
      {"step": "Set up official email account"},
      {"step": "Complete HR policies acknowledgement form"},
      {"step": "Department introduction and supervisor meeting"},
      {"step": "Lab or facility orientation and safety briefing"},
      {"step": "Issue appointment order"},
      {"step": "Open salary account (JKKN partner bank)"},
      {"step": "Add to MyJKKN attendance and leave management"}
    ]',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Non-Technical Administrative Staff Onboarding',
    '[
      {"step": "Collect identity and address proof documents"},
      {"step": "Issue institutional ID card and biometric registration"},
      {"step": "Set up official email account"},
      {"step": "Complete HR policies acknowledgement form"},
      {"step": "Office orientation and reporting manager introduction"},
      {"step": "System access setup (MyJKKN module permissions)"},
      {"step": "Issue appointment order"},
      {"step": "Open salary account (JKKN partner bank)"},
      {"step": "Add to MyJKKN attendance and leave management"}
    ]',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Administrative Leadership Onboarding',
    '[
      {"step": "Collect and verify all credential documents"},
      {"step": "Issue institutional ID card and biometric registration"},
      {"step": "Set up official email account with elevated access"},
      {"step": "Complete HR policies and governance acknowledgement"},
      {"step": "Board and senior leadership introduction"},
      {"step": "MyJKKN admin module access provisioning"},
      {"step": "Issue appointment letter and joining report"},
      {"step": "Open salary account (JKKN partner bank)"},
      {"step": "Add to payroll and leave management"},
      {"step": "Hand over role-specific SOP documentation"}
    ]',
    true
  )
ON CONFLICT DO NOTHING;

-- =====================================================
-- END OF TABLE DEFINITIONS
-- =====================================================

-- =====================================================
-- Dashboard v2 — Operational Nervous System
-- Added: 2026-04-15 - Day 1 migration per specs/myjkkn-dashboard-v2-spec.md
-- 40 decisions locked via /myjkkn-module (6 rounds) + /assumption-thrash (4 rounds)
-- REUSE POLICY: notifications, user_notifications, push_subscriptions,
-- activity_alert_rules, notification_audiences, user_dashboard_preferences
-- are REUSED from existing infrastructure (confirmed in preflight).
-- =====================================================

-- Column additions to admission_leads (SLA + rescue tracking)
-- Decisions: Round 1.4 (frozen at first_touch_at), Round 2.6 (rescue tracking)
ALTER TABLE admission_leads
  ADD COLUMN IF NOT EXISTS first_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescued_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS rescue_broadcast_id UUID;

CREATE INDEX IF NOT EXISTS idx_admission_leads_first_touch_at
  ON admission_leads(first_touch_at) WHERE first_touch_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admission_leads_rescue_broadcast_id
  ON admission_leads(rescue_broadcast_id) WHERE rescue_broadcast_id IS NOT NULL;

-- Column additions to push_subscriptions (decision Round 3.12 — soft-delete on 410 Gone)
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active
  ON push_subscriptions(user_id, is_active) WHERE is_active = TRUE;

-- Column additions to notifications (idempotency + proxy + supersede)
-- Decisions: Round 4.15 (idempotency key), Round 3.9 (proxy acted_by), Round 2.8 (supersede)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS acted_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS superseded_by UUID;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'notifications_superseded_by_fkey' AND table_name = 'notifications') THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_superseded_by_fkey
      FOREIGN KEY (superseded_by) REFERENCES notifications(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency
  ON notifications(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- =====================================================
-- New table: rescue_broadcasts (Broadcast Rescue claim mutex)
-- Decisions: Round 2.6 (SELECT FOR UPDATE), Round 3.10 (is_emergency), Round 2.7 (ghost claim)
-- =====================================================
CREATE TABLE IF NOT EXISTS rescue_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES profiles(id),
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  message TEXT,
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_by UUID REFERENCES profiles(id),
  claimed_at TIMESTAMPTZ,
  claim_duration_seconds INT,
  ghost_claim_penalty_applied BOOLEAN NOT NULL DEFAULT FALSE,
  auto_returned_at TIMESTAMPTZ,
  institution_id UUID NOT NULL REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rescue_broadcasts_active_per_lead
  ON rescue_broadcasts(lead_id) WHERE claimed_at IS NULL AND auto_returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rescue_broadcasts_institution
  ON rescue_broadcasts(institution_id, initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rescue_broadcasts_claim_deadline
  ON rescue_broadcasts(claimed_at) WHERE claimed_at IS NOT NULL AND auto_returned_at IS NULL;
ALTER TABLE rescue_broadcasts ENABLE ROW LEVEL SECURITY;

-- Back-wire FK on admission_leads.rescue_broadcast_id now that table exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'admission_leads_rescue_broadcast_id_fkey' AND table_name = 'admission_leads') THEN
    ALTER TABLE admission_leads ADD CONSTRAINT admission_leads_rescue_broadcast_id_fkey
      FOREIGN KEY (rescue_broadcast_id) REFERENCES rescue_broadcasts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- New table: counselor_sla_strikes (ghost-claim + CoS-unreachable log)
-- Decisions: Round 2.7 (3-strike rule), Round 3.11 (CoS unreachable)
-- =====================================================
CREATE TABLE IF NOT EXISTS counselor_sla_strikes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counselor_id UUID NOT NULL REFERENCES profiles(id),
  strike_type TEXT NOT NULL CHECK (strike_type IN ('ghost_claim', 'cos_unreachable', 'sla_breach')),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_expires_at TIMESTAMPTZ NOT NULL,
  institution_id UUID NOT NULL REFERENCES institutions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_strikes_counselor_expires
  ON counselor_sla_strikes(counselor_id, auto_expires_at);
CREATE INDEX IF NOT EXISTS idx_strikes_institution
  ON counselor_sla_strikes(institution_id, occurred_at DESC);
ALTER TABLE counselor_sla_strikes ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- New table: dashboard_config (single-row global config, per-institution override in Phase 2)
-- Decisions: Round 1.3 (flat 4h), Round 2.5 (empty window), Round 2.7 (ghost params), Round 4.16 (timezone)
-- =====================================================
CREATE TABLE IF NOT EXISTS dashboard_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL UNIQUE DEFAULT 'global',
  cold_lead_threshold_hours INT NOT NULL DEFAULT 4,
  sla_window_hours INT NOT NULL DEFAULT 24,
  empty_window_behavior TEXT NOT NULL DEFAULT 'green_all_clear',
  quiet_hours_start TIME NOT NULL DEFAULT '22:00',
  quiet_hours_end TIME NOT NULL DEFAULT '07:00',
  ghost_claim_timeout_minutes INT NOT NULL DEFAULT 30,
  ghost_claim_penalty INT NOT NULL DEFAULT -100,
  strike_expiry_days INT NOT NULL DEFAULT 30,
  strike_threshold_for_manager_flag INT NOT NULL DEFAULT 3,
  queue_escalation_hours INT NOT NULL DEFAULT 2,
  ohs_attendance_weight NUMERIC(3,2) NOT NULL DEFAULT 0.25,
  ohs_sla_weight NUMERIC(3,2) NOT NULL DEFAULT 0.25,
  ohs_fees_weight NUMERIC(3,2) NOT NULL DEFAULT 0.25,
  ohs_escalations_weight NUMERIC(3,2) NOT NULL DEFAULT 0.25,
  ohs_red_ceiling INT NOT NULL DEFAULT 60,
  ohs_amber_ceiling INT NOT NULL DEFAULT 80,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO dashboard_config (scope) VALUES ('global') ON CONFLICT (scope) DO NOTHING;
ALTER TABLE dashboard_config ENABLE ROW LEVEL SECURITY;

-- END Dashboard v2 tables
