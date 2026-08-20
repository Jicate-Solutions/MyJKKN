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
        'alumni',       -- Post-graduation status
        'withdrawal_pending' -- Refund initiated for withdrawal; seat released, awaiting refund completion
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- SECTION 1: USER AND AUTHENTICATION TABLES
-- =====================================================

-- Profiles table (extends Supabase auth.users)
-- Updated: 2026-04-14 - Added chk_role_not_guest to enforce invite-only policy
-- Updated: 2026-08-13 - Added is_external_participant (Course Events).
-- Mirrors migration 20260813100600_course_permissions_and_role.sql.
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
    -- TRUE for a person provisioned solely to take a paid course. They have
    -- institution_id NULL, hold only courses.participant.self, and are
    -- confined to the /my-courses portal.
    is_external_participant BOOLEAN NOT NULL DEFAULT false,
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
    -- Updated: 2026-04-24 - Added 'school' entity type
    entity_type VARCHAR(20) NOT NULL DEFAULT 'institution'
    CONSTRAINT chk_entity_type CHECK (entity_type IN ('institution', 'admin_office', 'company', 'school'))
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
    -- Seat analytics: set once when lifecycle_status first transitions to 'active', never updated
    activated_at TIMESTAMPTZ,

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

    -- Admission Year — REMOVED 2026-08-24. There is no `admission_year` integer
    -- column on learners_profiles in production; information_schema returns zero
    -- for it. This file declared one anyway, which made the canonical source lie:
    -- rebuilding from it would CREATE a column production has never had, and a
    -- function written against this file would resolve it at runtime and fail on
    -- every call (the #3055 class of bug).
    --
    -- The note this replaces said the integer was "kept for B2A endpoint
    -- back-compat (6 endpoints expose it)". Those endpoints do still expose the
    -- field, but they DERIVE it from the admission_years FK join — see
    -- app/api/b2a/learners/route.ts ("Derive legacy admission_year integer from
    -- FK join for back-compat") and api-management/learners/profiles (Phase C-8,
    -- 2026-05-02). Not one of them reads a physical column, so nothing depends on
    -- this declaration and no endpoint changes with its removal.
    --
    -- The FK below is the real, and only, admission-year anchor.
    -- Added: 2026-04-23 — shadow FK to admission_years (institution + program scoped cohorts).
    -- Migration: supabase/migrations/learners_profiles_admission_year_id_shadow_fk.sql
    -- Backfill: only lifecycle_status='admitted' rows get latest active cohort;
    --          'active'/'graduated'/etc. left NULL for manual director cleanup.
    -- Scope: validated by trg_validate_learner_admission_year_scope (04_triggers.sql)
    --        — rejects FK row whose institution/program does not match the learner.
    admission_year_id UUID REFERENCES public.admission_years(id) ON DELETE SET NULL,

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

-- Pending (staged) hostel category for in-flight upgrades (20260616010000): set on confirm,
-- promoted to hostel_category_id on payment + threshold, cleared on hold expiry.
ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS pending_hostel_category_id uuid
    REFERENCES public.hostel_categories(id) ON DELETE SET NULL;

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
    -- Updated: 2026-06-09 - Made nullable. institution_email is OPTIONAL for all
    -- staff (BUG-003989/3980/3962): non-teaching/labour employees have no
    -- @jkkn.ac.in address. UNIQUE index allows multiple NULLs; the
    -- sync_staff_to_profiles trigger skips profile-link when it is NULL.
    institution_email TEXT,
    -- Updated: 2026-04-14 - role_key FK to custom_roles.role_key; drives dynamic role assignment on profile sync.
    role_key VARCHAR(50) NOT NULL DEFAULT 'faculty' REFERENCES public.custom_roles(role_key) ON UPDATE CASCADE,
    -- Added: 2026-06-22 - Optional free-form labels for fetching staff subsets via
    -- the external API (GET /api/api-management/staff?tags=a,b → overlap/any-of).
    -- Native text[] (GIN-indexed below) so PostgREST array operators work cleanly.
    tags TEXT[] NOT NULL DEFAULT '{}'
);

-- GIN index powers ?tags= overlap/contains filtering on the external staff API.
CREATE INDEX IF NOT EXISTS idx_staff_tags ON public.staff USING GIN (tags);

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
-- Updated: 2026-04-28 - Dropped institution_id; categories are now GLOBAL across all institutions
--                       (uniqueness is on category_name alone).
-- Updated: 2026-06-22 - Added `kind` (fee head) — drives Razorpay account routing.
-- Updated: 2026-08-01 - Added visible_to_learners + collection_type.
CREATE TABLE IF NOT EXISTS public.billing_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(150) NOT NULL,
    amount NUMERIC(15,2),
    frequency VARCHAR(20) NOT NULL,
    -- Fee head. payment-gateway-service matches this against razorpay_accounts.fee_head,
    -- so every category sharing a kind settles into the same institution MID.
    kind billing_category_kind NOT NULL DEFAULT 'other',
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- FALSE = bills/receipt lines in this category are hidden from /learners/my-bills
    -- and the parent portal. Management side is unaffected (still billable + payable).
    visible_to_learners BOOLEAN NOT NULL DEFAULT true,
    -- 'government' = collected on behalf of a government body; excluded from
    -- management collection totals on the billing dashboards.
    collection_type TEXT NOT NULL DEFAULT 'management',
    -- TRUE = a learner may hold at most ONE live bill in this category, ever.
    -- Enforced by trg_billing_bills_once_per_learner (04_triggers.sql), not in
    -- application code: bills are written from ten paths, six of them RPCs.
    -- Deliberately NOT the existing `frequency` column, which is already
    -- 'one-time' on 22 of 23 categories and has never been enforced — flipping
    -- that to a rule would block Transport Fee's legitimate Term 2 instalment
    -- for 1,011 learners. Defaults false so enabling is always deliberate.
    once_per_learner BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID,
    CONSTRAINT uq_billing_categories_name UNIQUE (category_name),
    CONSTRAINT chk_billing_categories_frequency
        CHECK (frequency IN ('monthly', 'quarterly', 'yearly', 'one-time')),
    CONSTRAINT billing_categories_collection_type_chk
        CHECK (collection_type IN ('management', 'government'))
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
    updated_at TIMESTAMPTZ DEFAULT now(),
    academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL
);

-- Billing Late Charges (platform-wide late-payment charge ledger)
-- Added: 2026-08-07 (migration 20260815010000_late_charge_mechanism.sql —
-- FILE ONLY, apply is Director-gated). One row per (bill, monthly period) of
-- accrued late charge; UNIQUE (bill_id, period_start) is the idempotency
-- contract. The mechanism is OFF by default (billing.late_charge.enabled =
-- false in platform_policies). billing_categories.kind gained the 'penalty'
-- enum value in companion migration 20260815009000.
CREATE TABLE IF NOT EXISTS public.billing_late_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES public.billing_student_bills(id),
    student_id UUID NOT NULL,
    institution_id UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    base_amount NUMERIC(15,2) NOT NULL,
    charge_amount NUMERIC(15,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','charged','waived')),
    penalty_bill_id UUID REFERENCES public.billing_student_bills(id),
    waived_by UUID,
    waived_at TIMESTAMPTZ,
    waiver_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_billing_late_charges_bill_period UNIQUE (bill_id, period_start)
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
    payment_mode VARCHAR(20) NOT NULL
        CHECK (payment_mode IN ('cash', 'online', 'bank_transfer', 'dd', 'cheque', 'combined')),
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
-- BILLING REFUND WORKFLOW (2026-07-11)
-- =====================================================
-- Refund approval workflow: config + request + bills + actions tables,
-- billing_student_bills refund columns, withdrawal_pending learner status.
-- Writes happen ONLY via SECURITY DEFINER RPCs; RLS grants SELECT only.

CREATE TABLE IF NOT EXISTS public.billing_refund_flow_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NULL REFERENCES institutions(id),  -- NULL = global default
    name TEXT NOT NULL,
    initiator_roles UUID[] NOT NULL DEFAULT '{}',
    initiator_users UUID[] NOT NULL DEFAULT '{}',
    stages JSONB NOT NULL DEFAULT '[]',  -- [{key,name,assignee_roles:[],assignee_users:[]}]
    disburser_roles UUID[] NOT NULL DEFAULT '{}',
    disburser_users UUID[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_flow_global_active
    ON billing_refund_flow_configs ((1)) WHERE institution_id IS NULL AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_flow_institution_active
    ON billing_refund_flow_configs (institution_id) WHERE institution_id IS NOT NULL AND is_active;

CREATE SEQUENCE IF NOT EXISTS billing_refund_request_number_seq;

CREATE TABLE IF NOT EXISTS public.billing_refund_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_number TEXT NOT NULL UNIQUE,
    institution_id UUID NOT NULL REFERENCES institutions(id),
    student_id UUID NOT NULL REFERENCES learners_profiles(id),
    refund_type TEXT NOT NULL CHECK (refund_type IN ('withdrawal','adjustment')),
    status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review','pending_disbursement','disbursed','declined')),
    current_stage_index INT NOT NULL DEFAULT 0,
    flow_snapshot JSONB NOT NULL,
    total_refund_amount NUMERIC(15,2) NOT NULL,
    previous_lifecycle_status TEXT NULL,
    initiated_by UUID NOT NULL REFERENCES profiles(id),
    initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    declined_by UUID NULL REFERENCES profiles(id),
    declined_at TIMESTAMPTZ NULL,
    decline_reason TEXT NULL,
    declined_stage_name TEXT NULL,
    payment_mode TEXT NULL CHECK (payment_mode IS NULL OR payment_mode IN ('cash','online','bank_transfer','dd','cheque')),
    payment_details JSONB NULL,
    disbursed_by UUID NULL REFERENCES profiles(id),
    disbursed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refund_requests_student ON billing_refund_requests (student_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_institution_status ON billing_refund_requests (institution_id, status);

CREATE TABLE IF NOT EXISTS public.billing_refund_request_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES billing_refund_requests(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES billing_student_bills(id),
    paid_amount_snapshot NUMERIC(15,2) NOT NULL,
    refund_amount NUMERIC(15,2) NOT NULL,
    CONSTRAINT chk_refund_amount CHECK (refund_amount > 0 AND refund_amount <= paid_amount_snapshot),
    CONSTRAINT uq_request_bill UNIQUE (request_id, bill_id)
);
CREATE INDEX IF NOT EXISTS idx_refund_request_bills_bill ON billing_refund_request_bills (bill_id);

CREATE TABLE IF NOT EXISTS public.billing_refund_request_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES billing_refund_requests(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN ('initiated','approved','declined','disbursed')),
    stage_index INT NULL,
    stage_name TEXT NOT NULL,
    actor_id UUID NOT NULL REFERENCES profiles(id),
    actor_role_name TEXT NULL,
    notes TEXT NULL,
    attachments JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refund_actions_request ON billing_refund_request_actions (request_id, created_at);

ALTER TABLE billing_student_bills
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_status TEXT NULL
      CHECK (refund_status IS NULL OR refund_status IN ('partially_refunded','refunded'));

-- withdrawal_pending learner status: frees the seat (not in any seat-RPC counted
-- list), non-terminal, does not gate login. Idempotent insert.
INSERT INTO admission_statuses (scope, code, label, description, color, sort_order,
       is_active, is_terminal, is_seat_filled, gates_login, auto_promote_when_universal_paid)
SELECT 'learner', 'withdrawal_pending', 'Withdrawal Pending',
       'Refund initiated for withdrawal; seat released, awaiting refund completion',
       '#f97316', 11, true, false, false, false, false
WHERE NOT EXISTS (SELECT 1 FROM admission_statuses WHERE scope='learner' AND code='withdrawal_pending');

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
    -- Updated: 2026-08-21 - Restored the 34-module CASE that migration
    --   20260505000000_extend_bug_module_classifier.sql applied to production on
    --   2026-05-05. Commit 2f399d271c ("fix: bos issue", 2026-05-25) merged a
    --   pre-#719 copy of this file and silently reverted this CASE to its old
    --   11-branch form. Production kept the 34-branch column; only this file
    --   regressed. That is why check-bug-module-classifier.mjs has reported ~29
    --   "missing" slugs ever since — 22 of them were phantom, an artifact of the
    --   clobber rather than real classifier drift.
    module_name VARCHAR(100) GENERATED ALWAYS AS (
      CASE
        WHEN page_url IS NULL THEN 'unknown'
        WHEN page_url ~ '/academic/' THEN 'academic'
        WHEN page_url ~ '/admission/' THEN 'admission'                 -- before /admin/
        WHEN page_url ~ '/admin/' THEN 'admin'
        WHEN page_url ~ '/ai-query/' THEN 'ai-query'
        WHEN page_url ~ '/application-hub/' THEN 'application-hub'     -- before /applications/
        WHEN page_url ~ '/applications/' THEN 'applications'
        WHEN page_url ~ '/audit-trail/' THEN 'audit-trail'             -- before /audit/
        WHEN page_url ~ '/audit/' THEN 'audit'
        WHEN page_url ~ '/accreditation/' THEN 'accreditation'
        WHEN page_url ~ '/billing/' THEN 'billing'
        WHEN page_url ~ '/bug-leaderboard/' THEN 'bug-leaderboard'
        WHEN page_url ~ '/campus-living/' THEN 'campus-living'
        WHEN page_url ~ '/dashboard/' THEN 'dashboard'
        WHEN page_url ~ '/events/' THEN 'events'
        WHEN page_url ~ '/faculty/' THEN 'faculty'
        WHEN page_url ~ '/health/' THEN 'health'
        WHEN page_url ~ '/hr/' THEN 'hr'
        WHEN page_url ~ '/learners-council/' THEN 'learners-council'   -- before /learners/
        WHEN page_url ~ '/learners/' THEN 'learners'
        WHEN page_url ~ '/learn/' THEN 'learn'
        WHEN page_url ~ '/moments/' THEN 'moments'  -- Added: 2026-06-12 Family Moments
        WHEN page_url ~ '/my-bug-reports/' THEN 'my-bug-reports'
        WHEN page_url ~ '/notifications/' THEN 'notifications'
        WHEN page_url ~ '/okr/' THEN 'okr'
        WHEN page_url ~ '/organizations?/' THEN 'organizations'
        WHEN page_url ~ '/profile/' THEN 'profile'
        WHEN page_url ~ '/resource-management/' THEN 'resource-management'
        WHEN page_url ~ '/service-requests/' THEN 'service-requests'
        WHEN page_url ~ '/settings/' THEN 'settings'
        WHEN page_url ~ '/solutions/' THEN 'solutions'
        WHEN page_url ~ '/staff/' THEN 'staff'
        WHEN page_url ~ '/startup-studio/' THEN 'startup-studio'
        WHEN page_url ~ '/system/' THEN 'system'
        WHEN page_url ~ '/users/' THEN 'users'
        WHEN page_url ~ '/vac/' THEN 'vac'
        WHEN page_url ~ '/work-pulse/' THEN 'work-pulse'
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
        -- IMPORTANT: ordering matches the module_name CASE above — longer
        -- prefixes first so /admission/ wins over /admin/, etc.
        WHEN page_url ~ '/academic/' THEN substring(page_url FROM '/academic/([^/?#]+)')
        WHEN page_url ~ '/admission/' THEN substring(page_url FROM '/admission/([^/?#]+)')
        WHEN page_url ~ '/admin/' THEN substring(page_url FROM '/admin/([^/?#]+)')
        WHEN page_url ~ '/ai-query/' THEN substring(page_url FROM '/ai-query/([^/?#]+)')
        WHEN page_url ~ '/application-hub/' THEN substring(page_url FROM '/application-hub/([^/?#]+)')
        WHEN page_url ~ '/applications/' THEN substring(page_url FROM '/applications/([^/?#]+)')
        WHEN page_url ~ '/audit-trail/' THEN substring(page_url FROM '/audit-trail/([^/?#]+)')
        WHEN page_url ~ '/audit/' THEN substring(page_url FROM '/audit/([^/?#]+)')
        WHEN page_url ~ '/accreditation/' THEN substring(page_url FROM '/accreditation/([^/?#]+)')
        WHEN page_url ~ '/billing/' THEN substring(page_url FROM '/billing/([^/?#]+)')
        WHEN page_url ~ '/bug-leaderboard/' THEN substring(page_url FROM '/bug-leaderboard/([^/?#]+)')
        WHEN page_url ~ '/campus-living/' THEN substring(page_url FROM '/campus-living/([^/?#]+)')
        WHEN page_url ~ '/dashboard/' THEN substring(page_url FROM '/dashboard/([^/?#]+)')
        WHEN page_url ~ '/events/' THEN substring(page_url FROM '/events/([^/?#]+)')
        WHEN page_url ~ '/faculty/' THEN substring(page_url FROM '/faculty/([^/?#]+)')
        WHEN page_url ~ '/health/' THEN substring(page_url FROM '/health/([^/?#]+)')
        WHEN page_url ~ '/hr/' THEN substring(page_url FROM '/hr/([^/?#]+)')
        WHEN page_url ~ '/learners-council/' THEN substring(page_url FROM '/learners-council/([^/?#]+)')
        WHEN page_url ~ '/learners/' THEN substring(page_url FROM '/learners/([^/?#]+)')
        WHEN page_url ~ '/learn/' THEN substring(page_url FROM '/learn/([^/?#]+)')
        WHEN page_url ~ '/moments/' THEN substring(page_url FROM '/moments/([^/?#]+)')  -- Added: 2026-06-12 Family Moments
        WHEN page_url ~ '/my-bug-reports/' THEN substring(page_url FROM '/my-bug-reports/([^/?#]+)')
        WHEN page_url ~ '/notifications/' THEN substring(page_url FROM '/notifications/([^/?#]+)')
        WHEN page_url ~ '/okr/' THEN substring(page_url FROM '/okr/([^/?#]+)')
        WHEN page_url ~ '/organizations?/' THEN substring(page_url FROM '/organizations?/([^/?#]+)')
        WHEN page_url ~ '/profile/' THEN substring(page_url FROM '/profile/([^/?#]+)')
        WHEN page_url ~ '/resource-management/' THEN substring(page_url FROM '/resource-management/([^/?#]+)')
        WHEN page_url ~ '/service-requests/' THEN substring(page_url FROM '/service-requests/([^/?#]+)')
        WHEN page_url ~ '/settings/' THEN substring(page_url FROM '/settings/([^/?#]+)')
        WHEN page_url ~ '/solutions/' THEN substring(page_url FROM '/solutions/([^/?#]+)')
        WHEN page_url ~ '/staff/' THEN substring(page_url FROM '/staff/([^/?#]+)')
        WHEN page_url ~ '/startup-studio/' THEN substring(page_url FROM '/startup-studio/([^/?#]+)')
        WHEN page_url ~ '/system/' THEN substring(page_url FROM '/system/([^/?#]+)')
        WHEN page_url ~ '/users/' THEN substring(page_url FROM '/users/([^/?#]+)')
        WHEN page_url ~ '/vac/' THEN substring(page_url FROM '/vac/([^/?#]+)')
        WHEN page_url ~ '/work-pulse/' THEN substring(page_url FROM '/work-pulse/([^/?#]+)')
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

-- Updated: 2026-06-30 - Added metadata JSONB for module-specific routing payloads
-- (e.g. social/instagram bug reports populate metadata.ig_user_id at submission
-- time; the daily ig-accounts-sync cron rewrites metadata.routed_owner_user_id
-- on ownership flip — see lib/instagram/auto-route-on-ownership-flip.ts).
ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_bug_reports_metadata_ig_user_id
  ON public.bug_reports ((metadata->>'ig_user_id'))
  WHERE metadata ? 'ig_user_id';

-- Updated: 2026-07-17 - Duplicate machinery (PR 1 of bug-triage epic).
-- duplicate_of = canonical bug this report duplicates (set with status='duplicate').
-- Resolving the canonical cascades resolution to all duplicates + emails reporters.
-- Status CHECK widened with 'duplicate'. Applied live via migration
-- 20260717061500_bug_reports_duplicate_machinery.sql.
ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS duplicate_of UUID NULL REFERENCES public.bug_reports(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bug_reports_duplicate_of
  ON public.bug_reports (duplicate_of) WHERE duplicate_of IS NOT NULL;

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
-- Added 2026-08-13 (Course Events). Partial index — only external
-- participants set this flag, so the index stays small.
CREATE INDEX IF NOT EXISTS idx_profiles_external_participant
  ON public.profiles (is_external_participant)
  WHERE is_external_participant;

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
-- Seat analytics composite index: program fill queries hit all 4 columns together
CREATE INDEX IF NOT EXISTS idx_lp_seat_analytics
  ON public.learners_profiles(institution_id, program_id, academic_year_id, lifecycle_status)
  WHERE lifecycle_status = 'active';
-- Source analytics index: source breakdown for enrolled leads
CREATE INDEX IF NOT EXISTS idx_admission_leads_source_enrolled
  ON public.admission_leads(institution_id, source, referral_type)
  WHERE funnel_stage = 'enrolled';
-- Geography analytics index: district/taluk grouping for active learners
CREATE INDEX IF NOT EXISTS idx_lp_geography
  ON public.learners_profiles(institution_id, permanent_address_district, permanent_address_taluk)
  WHERE lifecycle_status = 'active';
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
-- One receipt per gateway payment reference for AUTOMATED online receipts
-- (gateway flows write with the service-role client, so created_by IS NULL).
-- Backstop against the webhook/callback double-receipting race (2026-08-27,
-- pay_TUh0Qpmo3jktV8). Manual accountant receipts are excluded: one UTR
-- legitimately settles bills of two different learners as two hand-entered
-- receipts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_receipts_gateway_payment_ref
  ON public.billing_receipts (payment_reference_number)
  WHERE payment_mode = 'online'
    AND created_by IS NULL
    AND payment_reference_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_student_id ON public.billing_student_bills(student_id);
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_academic_year
  ON public.billing_student_bills (academic_year_id);
CREATE INDEX IF NOT EXISTS idx_billing_student_bills_student_academic_year
  ON public.billing_student_bills (student_id, academic_year_id);

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
    -- Updated 2026-04-22 — multi-approver support. Non-empty = only these
    -- users can approve (OR logic, first to act wins). Empty array = falls
    -- back to role-based matching via approver_role.
    approver_user_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
    is_required BOOLEAN NOT NULL DEFAULT true,
    on_return_restart_from_step INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(service_type_id, step_order)
);

CREATE INDEX idx_sr_approval_steps_type_id ON service_request_approval_steps(service_type_id);
CREATE INDEX idx_sr_approval_steps_order ON service_request_approval_steps(service_type_id, step_order);
CREATE INDEX idx_sr_approval_steps_role ON service_request_approval_steps(approver_role);
CREATE INDEX idx_sr_approval_steps_approver_user_ids
    ON service_request_approval_steps USING GIN (approver_user_ids);

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
-- SECTION: ADMISSION SETTINGS - ADMISSION YEARS
-- Added: 2026-04-21 - Per-program admission year tracking
-- Updated: 2026-06-05 - Institution-wide admission year (program scope dropped); one row per (institution, year)
-- Updated: 2026-07-25 - is_current flag (migration 20260725_admission_years_is_current_flag.sql)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.admission_years (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    admission_year_name VARCHAR(150) NOT NULL,
    year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Added 2026-07-25. The cohort new leads/enquiries default to — exactly one
    -- per institution. Distinct from is_active, which only controls dropdown
    -- visibility and stays true for historical cohorts (every one of the 47 rows
    -- was is_active=true, including 2002-2003) so legacy imports still resolve
    -- them. Enforced by admission_years_one_current_per_institution (below) plus
    -- trg_admission_years_single_current (04_triggers.sql).
    is_current BOOLEAN NOT NULL DEFAULT false,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT admission_years_institution_year_unique UNIQUE (institution_id, year)
);

CREATE INDEX IF NOT EXISTS idx_admission_years_institution ON admission_years(institution_id);
CREATE INDEX IF NOT EXISTS idx_admission_years_name ON admission_years(admission_year_name);
CREATE UNIQUE INDEX IF NOT EXISTS admission_years_one_current_per_institution
    ON public.admission_years (institution_id)
    WHERE is_current;

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
  -- created_by is also the OWNER: the only non-super-admin who may edit the row
  -- (events_auth_update). The default is what makes that model work — there are
  -- four insert paths (wizard, tournament, marathon, induction) and none of them
  -- set it explicitly. NULL on pre-2026-08-06 rows and on service-role inserts,
  -- both of which fall back to the old same-institution rule.
  created_by UUID REFERENCES public.profiles(id) DEFAULT auth.uid(),
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
  custom_fields JSONB,  -- tournament dynamic registration form answers, keyed by field_key (event_registration_form_fields.is_required validated server-side)

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

-- ── Tournament dynamic registration form builder (2026-07-14, event_registration_form_builder) ──
-- Per-tournament custom fields layered on top of the fixed core registration
-- fields above. event_id is denormalized onto every table (not just
-- event_registration_forms) so RLS policies stay single-join, mirroring
-- tournament_divisions' pattern rather than requiring a 3-way join through
-- form_id/section_id on every check. Submitted answers land in
-- events_registrations.custom_fields, keyed by field_key.
-- An event holds MANY registration forms — typically one per run of a recurring
-- event. Each is addressed publicly by (event_id, slug) so a month's link
-- resolves to its own form and an old link keeps pointing at the month it
-- belonged to. There is deliberately NO unique on event_id.
CREATE TABLE IF NOT EXISTS event_registration_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Registration Form',
  slug text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  -- Registration fee for THIS form: an event holds many forms and each monthly
  -- run can charge a different amount. A fee is collected only when
  -- fee_enabled AND fee_amount > 0 — the switch is separate from the price so a
  -- fee can be turned off without destroying the amount.
  -- No fee_head column on purpose — event fees resolve the HOST institution's
  -- 'tuition' account, exactly as tournament entry fees do.
  fee_enabled boolean NOT NULL DEFAULT false,
  fee_amount numeric(10,2) NOT NULL DEFAULT 0,
  fee_label text,
  -- Active window. Openness is DERIVED at read time
  -- (is_enabled AND now within [starts_at, ends_at]) rather than a job flipping
  -- is_enabled when ends_at passes: a stored flag would leave an expired form
  -- collecting registrations whenever the job failed, would not reopen when the
  -- end date is extended, and would make "closed by hand" and "closed by time"
  -- indistinguishable. See formRegistrationState() in types/tournament.ts.
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, slug),
  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT event_registration_forms_fee_amount_check CHECK (fee_amount >= 0),
  CONSTRAINT event_registration_forms_window_check
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS event_registration_form_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES event_registration_forms(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_registration_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES event_registration_form_sections(id) ON DELETE CASCADE,
  -- Owning form. An event holds MANY forms (one per monthly run), so field_key
  -- is unique per form, not per event.
  form_id uuid NOT NULL REFERENCES event_registration_forms(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  -- 'file' and 'image' answers are stored in events_registrations.custom_fields
  -- as an EventFormUpload OBJECT ({path,name,size,mime}), not a scalar — the
  -- object lives in the PRIVATE `event-registration-uploads` bucket and is read
  -- through short-lived signed URLs. 'image' differs from 'file' only in that
  -- the UI previews it and the upload route refuses non-image MIME types.
  field_type text NOT NULL CHECK (field_type IN (
    'text','number','phone','email','select','multi_select','date','textarea','file','image','checkbox','radio'
  )),
  is_required boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  placeholder text,
  help_text text,
  min_length int,
  max_length int,
  min_value numeric,
  max_value numeric,
  pattern text,
  options jsonb,
  condition jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_event_registration_form_sections_form ON event_registration_form_sections(form_id);
CREATE INDEX IF NOT EXISTS idx_event_registration_form_fields_section ON event_registration_form_fields(section_id);
CREATE INDEX IF NOT EXISTS idx_event_registration_form_fields_form_id ON event_registration_form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_event_registration_forms_event_id ON event_registration_forms(event_id);

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

  return_url TEXT,

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
  proposed_monthly_salary           numeric,                              -- the monthly salary being proposed (optional — may be decided later)
  proposed_monthly_salary_breakdown jsonb,                                -- optional: basic/HRA/DA/PF structure
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

-- Updated: 2026-04-28 — Dashboard v2 columns referenced by RPCs but never authored
-- (fn_dashboard_queue_list, fn_dashboard_morning_brief, fn_dashboard_metrics, fn_create_dashboard_work_item).
-- Spec at specs/myjkkn-dashboard-v2-spec.md §3.1 assumed these existed; missing DDL caused
-- 42703 errors at runtime against any DB cloned from setup/. See plan
-- ~/.claude/plans/ps-c-users-admin-documents-github-myjkkn-radiant-dijkstra.md
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS action_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS action_config JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS acknowledgment_deadline_hours INT,
  ADD COLUMN IF NOT EXISTS requires_acknowledgment BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_notifications
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_level INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_user_notifications_unack
  ON user_notifications(user_id) WHERE acknowledged_at IS NULL;

-- Updated: 2026-04-24 - Split notifications into announcement vs work_item
-- Context: /admin/notifications page was being buried under operational cron-
-- generated work items (1,595 dashboard:* rows / 30d vs 11 real announcements).
-- 'announcement' = user-composed, meant to be READ (General/Alert/Announcement/
-- Action Required). 'work_item' = cron-generated operational task, meant to be
-- ACTED on (dashboard:escalation/rescue/approval/anomaly). Admin notifications
-- page filters to kind='announcement'; work items surface via dashboard widgets.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS kind TEXT;

-- Backfill existing rows based on category prefix (dashboard:* => work_item).
-- Runs once on deploy; subsequent inserts set kind explicitly.
UPDATE notifications
  SET kind = CASE
    WHEN category LIKE 'dashboard:%' THEN 'work_item'
    ELSE 'announcement'
  END
  WHERE kind IS NULL;

-- Lock the domain after backfill (NOT NULL + CHECK).
ALTER TABLE notifications
  ALTER COLUMN kind SET DEFAULT 'announcement',
  ALTER COLUMN kind SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'notifications_kind_check' AND table_name = 'notifications') THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
      CHECK (kind IN ('announcement', 'work_item'));
  END IF;
END $$;

-- Covering index so the common admin-page query
-- (WHERE kind='announcement' ORDER BY sent_at DESC) doesn't full-scan.
CREATE INDEX IF NOT EXISTS idx_notifications_kind_sent_at
  ON notifications(kind, sent_at DESC);

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

-- Updated: 2026-04-15 — Dashboard v2 Week-2 Counselor view: daily call target for hero tile
ALTER TABLE dashboard_config
  ADD COLUMN IF NOT EXISTS counselor_daily_call_target INT NOT NULL DEFAULT 25;

-- END Dashboard v2 tables

-- =====================================================================
-- 2026-04-16 — HR Recruitment Phase 3: Jobs + Interviews + Scorecards
-- Spec: specs/hr-recruitment-module-spec.md (Cvviz-sunset scope)
-- Adds job-posting records, interview scheduling, and scorecard feedback.
-- Stricter RLS on scorecards per Learning #8 (one scorecard per interviewer per interview).
-- =====================================================================

-- ---- hr_recruitment_jobs ---------------------------------------------
-- Job postings -- feed the public careers page via is_public flag and
-- drive the internal pipeline. role_category matches candidates CHECK set
-- so downstream analytics can join cleanly on the same taxonomy.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.hr_recruitment_jobs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id      uuid NOT NULL,                                  -- shadow-tenant FK
  institution_id          uuid REFERENCES public.institutions(id),        -- for role_has_institution_access()
  title                   text NOT NULL,
  role_category           text NOT NULL CHECK (role_category IN (
                            'teaching_faculty',
                            'medical',
                            'non_teaching',
                            'senior_leadership',
                            'contract'
                          )),
  description             text,                                           -- long-form posting body
  requirements            jsonb NOT NULL DEFAULT '{}',                    -- {qualifications, experience, skills}
  min_monthly_salary      numeric,                                        -- range offered (monthly)
  max_monthly_salary      numeric,
  positions_open          int NOT NULL DEFAULT 1 CHECK (positions_open >= 0),
  positions_filled        int NOT NULL DEFAULT 0 CHECK (positions_filled >= 0),
  department_id           uuid REFERENCES public.departments(id),         -- FK if departments exist
  -- Extended fields (2026-06-27): location + specification + salary display
  job_code                text UNIQUE,                                    -- e.g. JOB-XYZ1234; NULLs exempt from UNIQUE
  job_type                text CHECK (job_type IN (
                            'full_time','part_time','contract','internship','freelance'
                          )),
  industry                text,
  employer_type           text CHECK (employer_type IN (
                            'government','private','public_sector','non_profit','educational'
                          )),
  country                 text DEFAULT 'India',
  state                   text,
  city                    text,
  zip_code                text,
  education_level         text CHECK (education_level IN (
                            'high_school','diploma','bachelors','masters','phd','any'
                          )),
  min_experience_years    integer CHECK (min_experience_years >= 0),
  max_experience_years    integer CHECK (max_experience_years >= 0),
  salary_currency         text NOT NULL DEFAULT 'INR',
  salary_duration         text NOT NULL DEFAULT 'per_month' CHECK (salary_duration IN (
                            'per_hour','per_day','per_month','per_year'
                          )),
  display_salary          boolean NOT NULL DEFAULT false,
  CONSTRAINT hr_recruitment_jobs_experience_range_chk CHECK (
    min_experience_years IS NULL
    OR max_experience_years IS NULL
    OR min_experience_years <= max_experience_years
  ),
  status                  text NOT NULL DEFAULT 'draft' CHECK (status IN (
                            'draft',
                            'open',
                            'on_hold',
                            'closed',
                            'filled'
                          )),
  is_public               boolean NOT NULL DEFAULT false,                 -- controls /careers visibility
  posted_at               timestamptz,
  closes_at               timestamptz,
  created_by              uuid REFERENCES public.profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_hr_org
  ON public.hr_recruitment_jobs(hr_organization_id);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_institution
  ON public.hr_recruitment_jobs(institution_id);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_status
  ON public.hr_recruitment_jobs(status);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_is_public
  ON public.hr_recruitment_jobs(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_role_category
  ON public.hr_recruitment_jobs(role_category);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_department
  ON public.hr_recruitment_jobs(department_id);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_posted_at
  ON public.hr_recruitment_jobs(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_job_type
  ON public.hr_recruitment_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_industry
  ON public.hr_recruitment_jobs(industry);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_jobs_city
  ON public.hr_recruitment_jobs(city);

-- ---- hr_recruitment_interviews ---------------------------------------
-- Interview scheduling. panel_member_ids is a uuid[] of profiles.id;
-- one row per scheduled sitting (reschedules create a NEW row referencing
-- the old via rescheduled_from_id so we keep the full audit trail).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.hr_recruitment_interviews (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id            uuid NOT NULL REFERENCES public.hr_recruitment_candidates(id) ON DELETE CASCADE,
  job_id                  uuid REFERENCES public.hr_recruitment_jobs(id),  -- nullable: interview may predate job record
  round_number            int NOT NULL DEFAULT 1 CHECK (round_number >= 1),
  round_name              text,                                           -- display: "Screening", "Technical Panel", "Director Sign-off"
  scheduled_at            timestamptz NOT NULL,
  duration_minutes        int NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  mode                    text NOT NULL CHECK (mode IN (
                            'in_person',
                            'phone',
                            'video',
                            'walk_in'
                          )),
  location_or_link        text,                                           -- room name OR meet URL
  panel_member_ids        uuid[] NOT NULL DEFAULT '{}',                   -- profiles.id[] of interviewers
  status                  text NOT NULL DEFAULT 'scheduled' CHECK (status IN (
                            'scheduled',
                            'completed',
                            'cancelled',
                            'no_show',
                            'rescheduled'
                          )),
  rescheduled_from_id     uuid REFERENCES public.hr_recruitment_interviews(id),
  outcome_summary         text,                                           -- brief after-interview note
  created_by              uuid REFERENCES public.profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_candidate
  ON public.hr_recruitment_interviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_job
  ON public.hr_recruitment_interviews(job_id);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_status
  ON public.hr_recruitment_interviews(status);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_scheduled_at
  ON public.hr_recruitment_interviews(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_panel
  ON public.hr_recruitment_interviews USING GIN (panel_member_ids);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_rescheduled_from
  ON public.hr_recruitment_interviews(rescheduled_from_id);

-- ---- hr_recruitment_scorecards ---------------------------------------
-- Panel feedback per interview per interviewer. Stricter RLS per
-- Learning #8: only the submitting interviewer, the approval chain
-- members for the candidate, and super_admin can read scorecard CONTENT.
-- Submit-once per interviewer per interview (no updated_at, submit is final).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.hr_recruitment_scorecards (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id            uuid NOT NULL REFERENCES public.hr_recruitment_interviews(id) ON DELETE CASCADE,
  interviewer_id          uuid NOT NULL REFERENCES public.profiles(id),
  rating_overall          int NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
  rating_technical        int CHECK (rating_technical IS NULL OR rating_technical BETWEEN 1 AND 5),
  rating_communication    int CHECK (rating_communication IS NULL OR rating_communication BETWEEN 1 AND 5),
  rating_culture_fit      int CHECK (rating_culture_fit IS NULL OR rating_culture_fit BETWEEN 1 AND 5),
  strengths               text,
  concerns                text,
  recommendation          text NOT NULL CHECK (recommendation IN (
                            'strong_hire',
                            'hire',
                            'neutral',
                            'no_hire',
                            'strong_no_hire'
                          )),
  submitted_at            timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  -- One scorecard per interviewer per interview (submit-once principle, R4.4)
  CONSTRAINT uniq_scorecard_per_interviewer
    UNIQUE (interview_id, interviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_scorecards_interview
  ON public.hr_recruitment_scorecards(interview_id);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_scorecards_interviewer
  ON public.hr_recruitment_scorecards(interviewer_id);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_scorecards_recommendation
  ON public.hr_recruitment_scorecards(recommendation);

-- END HR Recruitment Phase 3 tables

-- =====================================================================
-- 20260721120000_hr_leave_types_split.sql — HR Leave Types (staff catalog)
-- Was a compat VIEW over leave_types (scope='staff'); split back out into
-- its own real table so HR-only fields (carry-forward, encashment, accrual,
-- eligibility) don't leak onto the shared academic/learner leave catalog.
-- NOTE: references public.hr_organizations(id), which is not itself mirrored
-- into this file — a fresh install from supabase/setup/ needs that table
-- created first (pre-existing gap, not introduced by this table).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.hr_leave_types (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id        uuid NOT NULL REFERENCES public.hr_organizations(id) ON DELETE CASCADE,
  leave_type_code           varchar NOT NULL,
  leave_type_name           varchar NOT NULL,
  description               text,
  color_code                varchar NOT NULL DEFAULT '#6B7280',
  display_order             integer NOT NULL DEFAULT 0,
  is_active                 boolean NOT NULL DEFAULT true,

  duration_type             varchar NOT NULL DEFAULT 'full'
                              CHECK (duration_type IN ('full','first_half','second_half','hourly')),
  allow_half_day            boolean NOT NULL DEFAULT false,
  allow_hourly              boolean NOT NULL DEFAULT false,

  skip_weekends             boolean NOT NULL DEFAULT true,
  skip_holidays             boolean NOT NULL DEFAULT true,

  requires_approval         boolean NOT NULL DEFAULT true,
  is_paid                   boolean NOT NULL DEFAULT true,
  min_advance_notice_days   integer NOT NULL DEFAULT 0,
  max_continuous_days       integer,
  requires_documents        boolean NOT NULL DEFAULT false,
  document_required_after_days integer,
  default_entitled_days     numeric NOT NULL DEFAULT 0,

  valid_from                timestamptz NOT NULL DEFAULT now(),
  valid_until               timestamptz,
  superseded_by             uuid REFERENCES public.hr_leave_types(id),

  -- HR-specific (design D3)
  allow_carry_forward       boolean NOT NULL DEFAULT false,
  max_carry_forward_days    numeric,
  is_encashable             boolean NOT NULL DEFAULT false,
  max_encashable_days       numeric,
  accrual_type              varchar NOT NULL DEFAULT 'none'
                              CHECK (accrual_type IN ('none','annual','monthly')),
  accrual_rate              numeric NOT NULL DEFAULT 0,
  applicable_gender         varchar NOT NULL DEFAULT 'all'
                              CHECK (applicable_gender IN ('all','male','female')),
  applicable_cadre_ids      uuid[],

  created_by                uuid,
  updated_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_leave_types_org_code_unique UNIQUE (hr_organization_id, leave_type_code)
);

CREATE INDEX IF NOT EXISTS idx_hlt_org_active ON public.hr_leave_types(hr_organization_id, is_active);

-- Updated: 2026-07-31 - WHO PAYS each staff member (HR only)
-- staff.institution_id means WHERE SOMEONE WORKS. The paying organisation is a
-- separate, narrower fact that only HR may see, so it lives here rather than as
-- a column on staff: Supabase RLS is row-level, so a column would be readable by
-- everyone who can read the staff row (StaffService, /api/api-management/staff
-- and the MCP server all select('*')).
-- NO ROW = payer not yet recorded — a work queue for HR, never a silent default.
-- is_payroll_entity is always true and exists only to carry the composite FK
-- that stops a work-location-only organisation (JKKN Main Office) being a payer.
CREATE TABLE IF NOT EXISTS public.hr_staff_payroll (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id           uuid NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  hr_organization_id uuid NOT NULL REFERENCES public.hr_organizations(id),
  is_payroll_entity  boolean NOT NULL DEFAULT true CHECK (is_payroll_entity),
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at         timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT hr_staff_payroll_org_must_run_payroll
    FOREIGN KEY (hr_organization_id, is_payroll_entity)
    REFERENCES public.hr_organizations (id, is_payroll_entity)
);

CREATE INDEX IF NOT EXISTS idx_hr_staff_payroll_organization
  ON public.hr_staff_payroll (hr_organization_id);

-- Which organisations actually run a payroll. A flag rather than a hardcoded
-- name check, so a future non-paying entity is a data edit and not a patch.
ALTER TABLE public.hr_organizations
  ADD COLUMN IF NOT EXISTS is_payroll_entity boolean NOT NULL DEFAULT true;
ALTER TABLE public.hr_organizations
  DROP CONSTRAINT IF EXISTS hr_organizations_id_payroll_entity_key;
ALTER TABLE public.hr_organizations
  ADD CONSTRAINT hr_organizations_id_payroll_entity_key UNIQUE (id, is_payroll_entity);

-- Updated: 2026-04-18 - Call Notes dialog enrichment
-- Adds prospect_sentiment, primary_objection, and follow_up_at (timestamptz)
-- to admission_call_logs so counselors can record richer context when
-- wrapping a call (sentiment + objection taxonomy + date+time follow-up).
-- The legacy follow_up_date (DATE) column is kept for backward compatibility.
ALTER TABLE admission_call_logs
  ADD COLUMN IF NOT EXISTS prospect_sentiment TEXT,
  ADD COLUMN IF NOT EXISTS primary_objection TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ;

-- Backfill follow_up_at from follow_up_date for historical rows (9:00 AM local)
UPDATE admission_call_logs
SET follow_up_at = follow_up_date::timestamp AT TIME ZONE 'UTC' + INTERVAL '9 hours'
WHERE follow_up_at IS NULL AND follow_up_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admission_call_logs_follow_up_at
  ON admission_call_logs(follow_up_at) WHERE follow_up_at IS NOT NULL;

-- ============================================================================
-- Updated: 2026-04-21 — Persona Design PR-1 of 4: scope-extension helper tables
--
-- Reason: MyJKKN's custom_roles.institution_scope supports only 'all' | 'own'.
-- Three common scope shapes cannot be expressed today:
--   • block_scope         — warden, gate_security, housekeeping_staff
--   • relationship_scope  — parent (sees only their child)
--   • contract_scope      — mess_caterer, maintenance_vendor (sees only their contract)
--
-- These 3 junction tables back the corresponding role_has_*_access() helpers
-- in 02_functions.sql. They are INERT infrastructure in PR-1 — no code calls
-- the helpers yet. PR-2 adds roles; PR-3 adds permission keys; PR-4 retrofits
-- RLS on hostel_*/mess_* tables to use these.
--
-- See: docs/persona-design/scope-extension-pr1.md for background + examples.
-- ============================================================================

-- 1. user_block_access — which users (wardens, gate security, housekeeping)
-- have access to which hostel blocks. Primary use: block-scoped RLS on all
-- 39 hostel_* tables.
CREATE TABLE IF NOT EXISTS public.user_block_access (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  block_id UUID NOT NULL REFERENCES public.hostel_blocks(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  notes TEXT,
  PRIMARY KEY (user_id, block_id)
);

CREATE INDEX IF NOT EXISTS idx_user_block_access_block
  ON public.user_block_access(block_id);
CREATE INDEX IF NOT EXISTS idx_user_block_access_user_active
  ON public.user_block_access(user_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.user_block_access IS
  'Per-user grants to specific hostel blocks. Used by role_has_block_access(). '
  'A user with this grant sees hostel_* records where block_id matches. '
  'revoked_at nullable — set instead of DELETE to preserve audit trail.';

-- 2. user_learner_relationship — which parent/guardian users can see
-- which learner. Primary use: parent portal (read-only views of their child).
CREATE TABLE IF NOT EXISTS public.user_learner_relationship (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (
    relationship IN ('parent', 'guardian', 'sibling', 'spouse', 'legal_guardian')
  ),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, learner_id)
);

CREATE INDEX IF NOT EXISTS idx_user_learner_relationship_learner
  ON public.user_learner_relationship(learner_id);
CREATE INDEX IF NOT EXISTS idx_user_learner_relationship_user_active
  ON public.user_learner_relationship(user_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.user_learner_relationship IS
  'Parent/guardian/family access to a specific learner. Used by '
  'role_has_relationship_access(). Unverified rows are valid for auth but '
  'should be flagged in UI until verified_at is set. Multi-row supported '
  '(one learner can have both parents as separate users).';

-- 3. user_contract_access — which external vendor/caterer users can see
-- records tied to which contract. Primary use: mess caterer portal + vendor
-- ticket portal where they only see their own contract's data.
CREATE TABLE IF NOT EXISTS public.user_contract_access (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL,
  contract_type TEXT NOT NULL CHECK (
    contract_type IN ('caterer', 'maintenance_vendor', 'laundry_vendor', 'amc', 'other')
  ),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, contract_id, contract_type)
);

CREATE INDEX IF NOT EXISTS idx_user_contract_access_contract
  ON public.user_contract_access(contract_id, contract_type);
CREATE INDEX IF NOT EXISTS idx_user_contract_access_user_active
  ON public.user_contract_access(user_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.user_contract_access IS
  'External vendor/caterer user access to a specific contract. Used by '
  'role_has_contract_access(). contract_id is polymorphic (references '
  'mess_caterers.id OR resource_vendor_contracts.id depending on '
  'contract_type) — FK not enforced at DB level because the target table '
  'varies. Application layer must validate contract existence on INSERT.';

-- END Persona Design PR-1 tables

-- =====================================================================
-- Updated: 2026-04-21 - BUG-003146 per-stall accountability
-- Per-stall accountability + operations + lead attribution on expo events.
-- assigned_staff_id references profiles(id) to match the existing
-- expo_event_team_members pattern (staff_id UUID REFERENCES profiles(id)).
-- =====================================================================

CREATE TABLE IF NOT EXISTS expo_event_stalls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_event_id uuid NOT NULL REFERENCES expo_events(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  stall_name text NOT NULL,
  assigned_staff_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  total_expenses numeric(10,2) DEFAULT 0,
  photos text[] DEFAULT ARRAY[]::text[],
  -- promotional_materials is an array of { name, quantity, notes? }
  promotional_materials jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expo_event_stalls_expo_event_id
  ON expo_event_stalls(expo_event_id);
CREATE INDEX IF NOT EXISTS idx_expo_event_stalls_institution_id
  ON expo_event_stalls(institution_id);
CREATE INDEX IF NOT EXISTS idx_expo_event_stalls_assigned_staff_id
  ON expo_event_stalls(assigned_staff_id)
  WHERE assigned_staff_id IS NOT NULL;

-- BUG-003146: attribute admission leads to a specific stall (optional).
ALTER TABLE admission_leads
  ADD COLUMN IF NOT EXISTS stall_id uuid
  REFERENCES expo_event_stalls(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admission_leads_stall_id
  ON admission_leads(stall_id)
  WHERE stall_id IS NOT NULL;

-- END BUG-003146 per-stall accountability

-- Added: 2026-04-24 — Expo bulk upload visit type (Expo Visit / Stall Visit).
-- Populated by the bulk capture template Remarks dropdown.
ALTER TABLE admission_leads
  ADD COLUMN IF NOT EXISTS visit_type TEXT
  CHECK (visit_type IN ('expo_visit', 'stall_visit'));

-- =====================================================================
-- Updated: 2026-04-25 - decisions-spec.md v1.0 Sprint 0
-- Director's Decision Portfolio (private_to_director by construction).
-- See specs/decisions-spec.md §4 for full schema rationale.
-- RLS policies in 03_policies.sql; updated_at trigger in 04_triggers.sql;
-- updated_at trigger function in 02_functions.sql.
-- =====================================================================
CREATE TABLE IF NOT EXISTS director_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  director_user_id UUID NOT NULL REFERENCES profiles(id),
  -- Framing
  title TEXT NOT NULL,
  context TEXT NOT NULL,
  alternatives JSONB NOT NULL,                -- [{label, summary, predicted_outcome_if_chosen}]
  chosen_alternative_idx INT NOT NULL,
  rejected_summary TEXT,
  -- Prediction
  predicted_outcome TEXT NOT NULL,
  outcome_metric_query JSONB NOT NULL,        -- {metric, scope, window, baseline_window, target_delta_pct, comparison}
  outcome_due_at TIMESTAMPTZ NOT NULL,
  -- State
  status TEXT NOT NULL DEFAULT 'pending_outcome'
    CHECK (status IN ('pending_outcome','outcome_recorded','reversed','superseded')),
  decision_made_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Verdict (filled at 90d by Sprint 1 fn_decision_outcome_check)
  actual_outcome_value NUMERIC,
  actual_outcome_recorded_at TIMESTAMPTZ,
  prediction_correct BOOLEAN,
  verdict_notes TEXT,
  -- Privacy lock
  visibility TEXT NOT NULL DEFAULT 'private_to_director'
    CHECK (visibility IN ('private_to_director')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_director_decisions_pending
  ON director_decisions(outcome_due_at)
  WHERE status = 'pending_outcome';

CREATE INDEX IF NOT EXISTS idx_director_decisions_director
  ON director_decisions(director_user_id, decision_made_at DESC);

ALTER TABLE director_decisions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Updated: 2026-04-26 - Stream C: Events Propose v2 — chat-bypass workflow-gravity
-- Table: event_proposals
-- Purpose: Lightweight proposal intake (3-field mobile-first form) feeding
--          Director approval queue. Separate from `events` (full event record);
--          approved proposals promote to events rows in Phase 1B.
-- =====================================================
CREATE TABLE IF NOT EXISTS event_proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  -- Submitter (pre-filled from auth.uid())
  proposer_id     UUID NOT NULL REFERENCES profiles(id),
  sender_role     VARCHAR(50),
  sender_email    VARCHAR(255),
  contact_phone   VARCHAR(50),
  -- Visible fields (3 shown by default per spec §5)
  title           VARCHAR(80) NOT NULL,
  event_date      DATE,
  venue           VARCHAR(200),
  audience        TEXT[] DEFAULT '{}',  -- subset of {Learners, Staff, Parents, External, Mixed}
  -- Progressive disclosure (only shown when asker taps "Add details")
  expected_attendance INT,
  budget_band     VARCHAR(20),  -- '0','<10K','10K-50K','50K-1L','>1L'
  -- Workflow
  status          VARCHAR(30) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','reviewing','approved','rejected','withdrawn')),
  source          VARCHAR(50) NOT NULL DEFAULT 'form_intake',
  decision_notes  TEXT,
  decided_by      UUID REFERENCES profiles(id),
  decided_at      TIMESTAMPTZ,
  -- Audit
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_proposals_status ON event_proposals(status, created_at);
CREATE INDEX IF NOT EXISTS idx_event_proposals_proposer ON event_proposals(proposer_id);
CREATE INDEX IF NOT EXISTS idx_event_proposals_institution ON event_proposals(institution_id);

-- RLS: standard MyJKKN pattern
ALTER TABLE event_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_proposals_select ON event_proposals FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR proposer_id = auth.uid()
  OR (user_has_permission('events.proposals.view') AND role_has_institution_access(institution_id))
);

CREATE POLICY event_proposals_insert ON event_proposals FOR INSERT WITH CHECK (
  proposer_id = auth.uid()
);

CREATE POLICY event_proposals_update ON event_proposals FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (proposer_id = auth.uid() AND status IN ('submitted','reviewing'))
);

-- Updated: 2026-04-27 - Agent G: counselor mutation guardrails (soft-delete columns)
-- Toggle/Remove become symmetric soft-state changes. Audit trail kept via
-- admission_counselors_audit_log (PR #516).
ALTER TABLE admission_counselors
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN admission_counselors.deactivated_at IS 'Set when counselor row was soft-deleted via DELETE endpoint. NULL = never soft-deleted.';
COMMENT ON COLUMN admission_counselors.deactivated_by IS 'User who triggered soft-delete (super-admin / admin / privileged staff).';

-- =====================================================================
-- IMS Module: this-session additions (Phase A5b + A0.5 + Phase F)
-- Updated: 2026-04-28
--
-- This block restores source-of-truth for the IMS schema additions made
-- during the 2026-04-28 production-readiness session. All changes use
-- IF NOT EXISTS guards so re-applying is a no-op against the live DB.
--
-- The 25 base ims_* tables themselves are NOT defined in this file yet —
-- they exist only in production from the original IMS migration deploy.
-- The full table-level backfill is tracked in plan file:
--   ~/.claude/plans/ps-c-users-admin-documents-github-myjkkn-radiant-dijkstra.md
--
-- Each ALTER below is wrapped in `to_regclass(...) IS NOT NULL` so the
-- block no-ops cleanly on a fresh DB clone (base table missing → skip).
-- Once the base IMS DDL section lands, these ALTERs will apply naturally.
-- =====================================================================

DO $$
BEGIN
  -- Phase A0.5: ims_stores distribution flags (added 2026-04-28).
  IF to_regclass('public.ims_stores') IS NOT NULL THEN
    ALTER TABLE public.ims_stores
      ADD COLUMN IF NOT EXISTS is_central_supply_store BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS requires_local_approval BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- Phase A5b.1: ims_items distribution + identity fields. Types in
  -- types/ims/items.ts referenced these but they were missing in DB.
  IF to_regclass('public.ims_items') IS NOT NULL THEN
    ALTER TABLE public.ims_items
      ADD COLUMN IF NOT EXISTS is_distributable BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_bundle BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS brand TEXT,
      ADD COLUMN IF NOT EXISTS variant_attributes JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS image_url TEXT;
  END IF;

  -- Phase F: indent workflow audit columns. Service layer was setting these
  -- (e.g., approved_at = new Date().toISOString()) but Postgres was silently
  -- dropping the values because the columns didn't exist. requested_at also
  -- backfilled from created_at for existing rows.
  IF to_regclass('public.ims_indent_requests') IS NOT NULL THEN
    ALTER TABLE public.ims_indent_requests
      ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES profiles(id),
      ADD COLUMN IF NOT EXISTS local_approved_at TIMESTAMPTZ;
    UPDATE public.ims_indent_requests
      SET requested_at = COALESCE(requested_at, created_at)
      WHERE requested_at IS NULL;
  END IF;

  -- Phase F: GRN workflow audit columns. Same pattern as indent — service
  -- writes timestamps that were being dropped at the DB layer.
  IF to_regclass('public.ims_goods_received_notes') IS NOT NULL THEN
    ALTER TABLE public.ims_goods_received_notes
      ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
    UPDATE public.ims_goods_received_notes
      SET received_at = COALESCE(received_at, created_at)
      WHERE received_at IS NULL;
  END IF;
END $$;

-- Phase F: append-only audit trail for IMS workflows.
-- Each row = one user action on one entity (indent / GRN / shipment / adjustment / sale).
-- Mirrors MyJKKN's per-module audit pattern (attendance_audit_log).
-- RLS in 03_policies.sql; intentionally no UPDATE/DELETE policies so rows are
-- tamper-resistant via RLS-respecting clients (compliance grade).
CREATE TABLE IF NOT EXISTS public.ims_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('indent','grn','shipment','adjustment','sale')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('raised','approved','rejected','verified','dispatched','received','cancelled','commented','adjusted')),
  actor_id UUID NOT NULL REFERENCES profiles(id),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ims_activity_log_entity
  ON public.ims_activity_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ims_activity_log_actor
  ON public.ims_activity_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_ims_activity_log_inst
  ON public.ims_activity_log(institution_id, created_at DESC);

ALTER TABLE public.ims_activity_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ims_activity_log IS
'Phase F (2026-04-28): per-IMS-entity transition history + comments. Append-only. Mirrors attendance_audit_log pattern. Each row = one user action on one entity (indent/grn/shipment/adjustment/sale).';

-- admission_leads strict-counselor visibility indexes (2026-06-03): make
-- (counselor_id = X OR assigned_counselor_id = Y) AND source <> 'referral'
-- ORDER BY created_at DESC, id sargable via BitmapOr. assigned_counselor_id was
-- previously an unindexed FK, forcing the pagination count(*) to Seq Scan.
CREATE INDEX IF NOT EXISTS idx_admission_leads_assigned_counselor_created
  ON public.admission_leads (assigned_counselor_id, created_at DESC, id)
  WHERE assigned_counselor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admission_leads_counselor_created
  ON public.admission_leads (counselor_id, created_at DESC, id)
  WHERE counselor_id IS NOT NULL;

-- admission_lead_activities per-lead timeline index (2026-06-03): pure index scan
-- for the per-lead, created_at-ordered activity/timeline/stats fetch.
CREATE INDEX IF NOT EXISTS idx_admission_lead_activities_lead_created
  ON public.admission_lead_activities (lead_id, created_at DESC);

-- razorpay_webhook_events (2026-06-04): INBOUND Razorpay webhook audit log,
-- written by dispatchRazorpayWebhook() via the service-role client. Kept separate
-- from public.webhook_logs (the unrelated OUTBOUND user/application sync log).
CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL DEFAULT 'razorpay',
  event_type   text NOT NULL,
  raw_payload  jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_events_received_at
  ON public.razorpay_webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_events_event_type
  ON public.razorpay_webhook_events (event_type);

-- hostel_program_eligibility (2026-06-06): single combined program-eligibility table.
-- One row = (institution, program, quota, fee band) granting both a room category
-- and a mess category. Replaces the former split hostel_program_room_eligibility +
-- hostel_program_mess_eligibility tables (both were empty; dropped in migration
-- 20260606160400_program_eligibility_single_table.sql).
CREATE TABLE IF NOT EXISTS public.hostel_program_eligibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE CASCADE,   -- NULL = institution default
  quota_ids  uuid[],                                                  -- NULL/empty = any quota; one rule can target many quotas. No FK (arrays can't); validated + canonicalised by trg_prog_elig_normalize_quotas
  fee_min numeric(12,2),                                              -- inclusive lower (rupees), NULL = unbounded
  fee_max numeric(12,2),                                              -- exclusive upper (rupees), NULL = unbounded
  room_category_id uuid REFERENCES public.hostel_categories(id) ON DELETE CASCADE,
  mess_category_id uuid REFERENCES public.mess_categories(id)  ON DELETE CASCADE,
  hostel_type text NOT NULL DEFAULT 'both' CHECK (hostel_type IN ('boys','girls','both')), -- which gender(s) the band applies to
  is_monthly_mess_allowed boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  CONSTRAINT chk_prog_elig_fee_range    CHECK (fee_min IS NULL OR fee_max IS NULL OR fee_min < fee_max),
  CONSTRAINT chk_prog_elig_has_category CHECK (room_category_id IS NOT NULL OR mess_category_id IS NOT NULL)
);

-- One row per band PER GENDER (institution, program, quota, fee_min, fee_max, hostel_type).
-- hostel_type is part of the key so a fee tier can hold a boys row AND a girls row;
-- categories are gender-typed and the resolver filters bands by hostel_type.
-- quota_ids is canonicalised (sorted + de-duped) by the trigger so this btree
-- index treats {A,B} and {B,A} as the same key; COALESCE(...,'{}') collapses NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_prog_elig_band ON public.hostel_program_eligibility (
  institution_id,
  COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(quota_ids,  '{}'::uuid[]),
  COALESCE(fee_min, -1),
  COALESCE(fee_max, -1),
  hostel_type
);
CREATE INDEX IF NOT EXISTS idx_prog_elig_resolve
  ON public.hostel_program_eligibility (institution_id, program_id, is_active);
CREATE INDEX IF NOT EXISTS idx_prog_elig_quota_ids
  ON public.hostel_program_eligibility USING gin (quota_ids);

-- hostel_waitlist: waitlist for hostel room allocation and self-service category-upgrade intent.
-- Originally created in migration 20260222000015_campus_living_enums_and_tables.sql.
-- Columns target_hostel_category_id and entry_kind added in 20260609160000_hostel_waitlist_upgrade_columns.sql.
-- Columns held_room_id/held_bed_id/hold_expires_at added in
-- 20260611150000_upgrade_payment_threshold_and_holds.sql: a below-threshold upgrade
-- hard-reserves the chosen bed (bed status 'reserved') until paid or expired.
CREATE TABLE IF NOT EXISTS public.hostel_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id),
    learner_id UUID NOT NULL,
    academic_year_id UUID NOT NULL,
    preferred_block_id UUID REFERENCES public.hostel_blocks(id),
    preferred_room_type room_type_enum,
    preferred_ac_status ac_status_enum,
    priority_score INT DEFAULT 0,
    status waitlist_status_enum NOT NULL DEFAULT 'waiting',
    offered_at TIMESTAMPTZ,
    offer_expires_at TIMESTAMPTZ,
    allocated_allocation_id UUID,
    notes TEXT,
    target_hostel_category_id UUID REFERENCES public.hostel_categories(id),
    entry_kind TEXT NOT NULL DEFAULT 'allocation',
    held_room_id UUID REFERENCES public.hostel_rooms(id) ON DELETE SET NULL,
    held_bed_id UUID REFERENCES public.hostel_beds(id) ON DELETE SET NULL,
    hold_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- hostel_categories upgrade-threshold config (20260611150000): min % of the learner's
-- current-academic-year academic bills paid for an instant upgrade into the category
-- (NULL = no gate), and how many days a below-threshold reservation is held.
ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS upgrade_threshold_pct numeric
    CHECK (upgrade_threshold_pct >= 0 AND upgrade_threshold_pct <= 100),
  ADD COLUMN IF NOT EXISTS upgrade_hold_days integer NOT NULL DEFAULT 5
    CHECK (upgrade_hold_days BETWEEN 1 AND 60);

-- Add-on categories (e.g. "Premium Room + AC", 20260615235500): reachable as an upgrade
-- target ONLY via an explicit hostel_category_upgrade_fees pair from the resident's current
-- category — never through the fee-difference fallback. Keeps it scoped to one source tier.
ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS requires_explicit_upgrade boolean NOT NULL DEFAULT false;

-- 20260807150000: a category may sell access to ANOTHER category's room stock.
-- "Deluxe Plus" owns zero rooms — it is the self-pick tier over the Deluxe pool
-- (pay the add-on, choose your own Deluxe room instead of being auto-allocated).
-- Resolved ONE level via COALESCE(room_source_category_id, id) in fn_my_room_options,
-- fn_my_upgrade_room_options and _cl_room_options. NULL = own rooms (all other
-- categories), so behaviour elsewhere is unchanged. Must point at a category of the
-- SAME type (gender) — not expressible as a CHECK, so seed it carefully.
-- 20260807180000: residents of this category may self-change their room ONCE per
-- academic year (same category, different room). For self-picked tiers where a wrong
-- choice would otherwise need office intervention. The allowance is counted from the
-- allocation audit trail (metadata->>'self_room_change'), not a separate flag.
ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS allow_self_room_change boolean NOT NULL DEFAULT false;

ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS room_source_category_id uuid REFERENCES public.hostel_categories(id);

-- 20260825120000: which entitlement band a room category grants, matching
-- hostel_tier_policy.tier_key. Premium-only features gate on THIS, not on the
-- category name (renaming a category must never change who is entitled) and not on
-- hostel_allocations.tier_id (production never populated it — every row is 'standard',
-- which silently refused every resident of the housekeeping slot-booking feature).
-- Plain text, no FK: adding a tier must never block a category write, and an
-- unmatched key resolves to no entitlement. Read by fn_housekeeping_entitlement_tier.
ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS tier_key text NOT NULL DEFAULT 'standard';

CREATE INDEX IF NOT EXISTS idx_hostel_categories_tier_key
  ON public.hostel_categories (tier_key);
ALTER TABLE public.hostel_categories
  DROP CONSTRAINT IF EXISTS chk_room_source_not_self;
ALTER TABLE public.hostel_categories
  ADD CONSTRAINT chk_room_source_not_self
  CHECK (room_source_category_id IS NULL OR room_source_category_id <> id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hostel_waitlist_active_upgrade
  ON public.hostel_waitlist (learner_id, target_hostel_category_id)
  WHERE entry_kind = 'upgrade' AND status = 'waiting';

ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;

-- accommodation_types: GLOBAL lookup (institution-agnostic).
-- Originally created institution-scoped in 20260505100001; deduped to one row
-- per code and institution_id dropped in 20260610100000_accommodation_types_global.sql.
CREATE TABLE IF NOT EXISTS public.accommodation_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_accommodation_types_active
  ON public.accommodation_types (is_active, sort_order);

-- ============================================================================
-- hostel_category_upgrade_fees (migration 20260610210000;
--   discount columns 20260807120000)
-- Explicit from→to upgrade pricing (room OR mess), per hostel year. Drives the
-- My Hostel upgrade options + flat-fee upgrade billing.
--
-- amount is the GROSS list price; net_amount is the GENERATED payable after any
-- discount. All NINE plpgsql read sites bill/display net_amount — never amount —
-- so the discount cannot drift between what a resident is shown and charged.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hostel_category_upgrade_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_year_id uuid NOT NULL REFERENCES public.hostel_years(id) ON DELETE CASCADE,
  from_hostel_category_id uuid REFERENCES public.hostel_categories(id) ON DELETE CASCADE,
  to_hostel_category_id   uuid REFERENCES public.hostel_categories(id) ON DELETE CASCADE,
  from_mess_category_id   uuid REFERENCES public.mess_categories(id)  ON DELETE CASCADE,
  to_mess_category_id     uuid REFERENCES public.mess_categories(id)  ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  discount_type  text          NOT NULL DEFAULT 'amount',
  discount_value numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) GENERATED ALWAYS AS (
    GREATEST(0::numeric, round(
      CASE WHEN discount_type = 'percent'
           THEN amount - (amount * LEAST(discount_value, 100::numeric) / 100)
           ELSE amount - discount_value
      END, 2))
  ) STORED,
  -- 20260807170000: per-PAIR override — this upgrade ignores the physical-room
  -- eligibility rules (hostel_room_eligibility_rules), so the resident may pick ANY
  -- available room in the target pool. Those rules steer AUTO-ALLOCATION cohorts and
  -- are the wrong constraint for a paid self-service move inside a tier the resident
  -- already occupies (Deluxe -> Deluxe Plus, Premium -> Premium + AC). Institution
  -- scoping, gender and bed availability remain enforced.
  -- Read by fn_my_room_options / fn_my_upgrade_room_options / _cl_room_options —
  -- ALL THREE must agree, or the picker offers rooms the bed validator rejects.
  skip_room_eligibility boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  CONSTRAINT chk_upgrade_one_kind CHECK (
    (from_hostel_category_id IS NOT NULL AND to_hostel_category_id IS NOT NULL
       AND from_mess_category_id IS NULL AND to_mess_category_id IS NULL)
    OR
    (from_mess_category_id IS NOT NULL AND to_mess_category_id IS NOT NULL
       AND from_hostel_category_id IS NULL AND to_hostel_category_id IS NULL)
  ),
  CONSTRAINT chk_upgrade_distinct CHECK (
    (from_hostel_category_id IS NULL OR from_hostel_category_id <> to_hostel_category_id)
    AND (from_mess_category_id IS NULL OR from_mess_category_id <> to_mess_category_id)
  ),
  CONSTRAINT chk_upgrade_discount_type CHECK (discount_type IN ('amount', 'percent')),
  CONSTRAINT chk_upgrade_discount_bounds CHECK (
    discount_value >= 0
    AND CASE WHEN discount_type = 'percent'
             THEN discount_value <= 100
             ELSE discount_value <= amount
        END
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_upgrade_fee_pair ON public.hostel_category_upgrade_fees (
  hostel_year_id,
  COALESCE(from_hostel_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(to_hostel_category_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(from_mess_category_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(to_mess_category_id,     '00000000-0000-0000-0000-000000000000'::uuid)
);
CREATE INDEX IF NOT EXISTS idx_upgrade_fee_room ON public.hostel_category_upgrade_fees
  (hostel_year_id, from_hostel_category_id, to_hostel_category_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_upgrade_fee_mess ON public.hostel_category_upgrade_fees
  (hostel_year_id, from_mess_category_id, to_mess_category_id) WHERE is_active;

-- 20260611180000: idempotency for housekeeping task generation — one task per
-- schedule per day (cron + creation trigger both upsert through this).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cleaning_task_schedule_date
  ON public.hostel_cleaning_tasks (schedule_id, date)
  WHERE schedule_id IS NOT NULL;

-- =====================================================
-- 20260711000000: Family Moments engine (2026-06-12)
-- Campaign-based parent engagement — Father's Day 2026
-- (NV CBSE + Matric HSS). Tokenized public gift cards.
-- Full DDL + RLS + storage bucket in the migration file:
-- supabase/migrations/20260711000000_family_moments_engine.sql
-- =====================================================
-- family_moments_campaigns: one row per occasion per institution
--   (slug UNIQUE, recipient_type father|mother|both, status lifecycle)
-- family_moments: one row per child per campaign
--   (token UNIQUE unguessable, content_type auto|text|image,
--    recipient snapshots, opened/install/push tracking columns)

-- =====================================================
-- 20260616080000: Per-category "allow upgrades" flag
-- Default false = opt-in; no learner sees upgrade options
-- until admin enables it per category.
-- =====================================================
ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS upgrades_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.mess_categories
  ADD COLUMN IF NOT EXISTS upgrades_enabled boolean NOT NULL DEFAULT false;

-- =====================================================================
-- Global Calendar module (Phase 1) — mirror of 20260623100000_calendar_module_tables.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.calendar_categories (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  color_code       TEXT NOT NULL DEFAULT '#6b7280',
  applies_to_kinds TEXT[] NOT NULL DEFAULT ARRAY['holiday','event','meeting'],
  icon             TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calendar_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                  TEXT NOT NULL DEFAULT 'holiday' CHECK (kind IN ('holiday','event','meeting')),
  title                 TEXT NOT NULL,
  description           TEXT,
  category_id           UUID REFERENCES public.calendar_categories(id),
  start_at              TIMESTAMPTZ NOT NULL,
  end_at                TIMESTAMPTZ NOT NULL,
  all_day               BOOLEAN NOT NULL DEFAULT true,
  blocks_attendance     BOOLEAN NOT NULL DEFAULT true,
  scope_institution_ids UUID[],                       -- NULL = common (all institutions)
  visibility            TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','restricted')),
  location              TEXT,
  meeting_url           TEXT,
  is_recurring          BOOLEAN NOT NULL DEFAULT false,
  recurrence_pattern    JSONB,
  color_code            TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by            UUID REFERENCES public.profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calendar_entries_end_after_start CHECK (end_at >= start_at)
);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_active_start ON public.calendar_entries (is_active, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_kind_start   ON public.calendar_entries (kind, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_scope        ON public.calendar_entries USING GIN (scope_institution_ids);

CREATE TABLE IF NOT EXISTS public.calendar_feed_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_key        TEXT NOT NULL,
  institution_id  UUID REFERENCES public.institutions(id),  -- NULL = global default
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_feed_global      ON public.calendar_feed_settings (feed_key) WHERE institution_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_feed_institution ON public.calendar_feed_settings (feed_key, institution_id) WHERE institution_id IS NOT NULL;

-- 2026-06-24 — Social Loop Engine playbook table
-- One row per closed cycle per ig account: the department innovation loop's
-- durable memory (Read → Decide → Act → Learn). Migration:
-- supabase/migrations/20260624031500_social_loop_playbook.sql
CREATE TABLE IF NOT EXISTS public.social_loop_playbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  cycle_no INT NOT NULL,
  week_start DATE NOT NULL DEFAULT (now()::date),
  read_summary JSONB NOT NULL DEFAULT '{}'::jsonb,        -- snapshot of the READ at close time
  decide JSONB NOT NULL DEFAULT '{}'::jsonb,              -- {formatInstruction, barToBeat, nextInstruction, domainHypothesis}
  learning TEXT,                                          -- the one human change written down
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_loop_playbook_account_cycle_key UNIQUE (account_id, cycle_no)
);
CREATE INDEX IF NOT EXISTS idx_social_loop_playbook_account ON public.social_loop_playbook (account_id, cycle_no DESC);

-- ── Induction session polls (2026-06-30) — see migration 20260630210000 ──
CREATE TABLE IF NOT EXISTS public.induction_session_poll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.event_sessions(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
  issued_at timestamptz, auto_close_at timestamptz, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.induction_session_poll_question (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.induction_session_poll(id) ON DELETE CASCADE,
  prompt text NOT NULL, kind text NOT NULL DEFAULT 'single' CHECK (kind IN ('single','multi')),
  position int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.induction_session_poll_option (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.induction_session_poll_question(id) ON DELETE CASCADE,
  label text NOT NULL, position int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.induction_session_poll_vote (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.induction_session_poll(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.induction_session_poll_question(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.induction_session_poll_option(id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, option_id, learner_id)
);

-- ── Induction programs: multi-target columns (2026-06-30) ──
-- Migration: supabase/migrations/20260630220000_induction_program_target_columns.sql
ALTER TABLE public.induction_programs
  ADD COLUMN IF NOT EXISTS target_institution_ids uuid[],
  ADD COLUMN IF NOT EXISTS target_degree_ids      uuid[],
  ADD COLUMN IF NOT EXISTS target_department_ids  uuid[];

COMMENT ON COLUMN public.induction_programs.target_institution_ids IS
  'Institutions whose freshers auto-enroll (>=1 for new rows). NULL = legacy induction (use institution_id + enroll_scope).';
COMMENT ON COLUMN public.induction_programs.target_degree_ids IS
  'Optional degree filter; NULL/empty = all degrees.';
COMMENT ON COLUMN public.induction_programs.target_department_ids IS
  'Optional department filter; NULL/empty = all departments.';
-- =====================================================================
-- 2026-06-30 — Schools Network module (DB substrate, Agent A)
-- Migration: supabase/migrations/20260630120000_schools_network_substrate.sql
-- Spec: /tmp/schools-network-spec.md
-- 5 enum types + 3 master tables (seeded) + 7 core entity tables.
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_ownership') THEN
    CREATE TYPE public.school_ownership AS ENUM ('external', 'internal');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_status') THEN
    CREATE TYPE public.school_status AS ENUM ('active', 'sustaining', 'dormant', 'inactive');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_owner_role') THEN
    CREATE TYPE public.school_owner_role AS ENUM ('outreach_coordinator', 'program_lead');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_contribution_kind') THEN
    CREATE TYPE public.school_contribution_kind AS ENUM (
      'device', 'branding', 'website', 'fund', 'training_kit', 'other'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'program_partner_status') THEN
    CREATE TYPE public.program_partner_status AS ENUM ('active', 'sustaining', 'dormant');
  END IF;
END $$;

-- Master value-list tables
CREATE TABLE IF NOT EXISTS public.school_session_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  description   TEXT,
  is_system     BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 100,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.school_session_types ENABLE ROW LEVEL SECURITY;
INSERT INTO public.school_session_types (code, label, description, is_system, display_order) VALUES
  ('visit',       'School Visit',        'In-person visit by JKKN team',                TRUE, 10),
  ('orientation', 'Orientation Session', 'Career / program orientation for students',   TRUE, 20),
  ('training',    'Teacher Training',    'Capacity-building session for school staff',  TRUE, 30),
  ('event',       'Event / Workshop',    'On-campus or partner-led event',              TRUE, 40),
  ('drop_by',     'Drop-by / Informal',  'Quick informal contact',                      TRUE, 50)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.program_partner_types (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  description   TEXT,
  is_system     BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 100,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.program_partner_types ENABLE ROW LEVEL SECURITY;
INSERT INTO public.program_partner_types (code, label, description, is_system, display_order) VALUES
  ('csr',             'CSR Partner',        'Corporate CSR arm (HP, NIIT, etc.)', TRUE, 10),
  ('grant',           'Grant / Foundation', 'Philanthropic foundation grant',     TRUE, 20),
  ('corporate',       'Corporate Sponsor',  'Direct corporate sponsorship',       TRUE, 30),
  ('govt_foundation', 'Govt. Foundation',   'Government / quasi-govt foundation', TRUE, 40)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.school_contact_roles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT NOT NULL UNIQUE,
  label               TEXT NOT NULL,
  description         TEXT,
  is_system           BOOLEAN NOT NULL DEFAULT FALSE,
  display_order       INTEGER NOT NULL DEFAULT 100,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  can_login_to_portal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.school_contact_roles ENABLE ROW LEVEL SECURITY;
INSERT INTO public.school_contact_roles
  (code, label, description, is_system, display_order, can_login_to_portal) VALUES
  ('hm',        'Headmaster',      'Headmaster / school head',        TRUE, 10, TRUE),
  ('principal', 'Principal',       'Principal (if distinct from HM)', TRUE, 20, TRUE),
  ('teacher',   'Teacher / Staff', 'Subject teacher or coordinator',  TRUE, 30, FALSE),
  ('alt',       'Alternate',       'Alternate point-of-contact',      TRUE, 40, FALSE)
ON CONFLICT (code) DO NOTHING;

-- program_partners FIRST (school_jkkn_owners FKs to it)
CREATE TABLE IF NOT EXISTS public.program_partners (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  type_id        UUID NOT NULL REFERENCES public.program_partner_types(id) ON DELETE RESTRICT,
  contact_email  TEXT,
  contact_phone  TEXT,
  contact_person TEXT,
  website_url    TEXT,
  status         program_partner_status NOT NULL DEFAULT 'active',
  notes          TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS program_partners_type_idx   ON public.program_partners (type_id);
CREATE INDEX IF NOT EXISTS program_partners_status_idx ON public.program_partners (status);
ALTER TABLE public.program_partners ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.schools (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  ownership         school_ownership NOT NULL,
  institution_id    UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
  district          TEXT,
  state             TEXT,
  pincode           TEXT,
  address           TEXT,
  latitude          NUMERIC(10, 7),
  longitude         NUMERIC(10, 7),
  intake_year       INTEGER,
  status            school_status NOT NULL DEFAULT 'active',
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT schools_internal_requires_institution CHECK (
    (ownership = 'external' AND institution_id IS NULL) OR
    (ownership = 'internal' AND institution_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS schools_ownership_idx      ON public.schools (ownership);
CREATE INDEX IF NOT EXISTS schools_status_idx         ON public.schools (status);
CREATE INDEX IF NOT EXISTS schools_district_state_idx ON public.schools (state, district);
CREATE INDEX IF NOT EXISTS schools_institution_id_idx ON public.schools (institution_id) WHERE institution_id IS NOT NULL;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.school_contacts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES public.school_contact_roles(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT school_contacts_email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS school_contacts_one_primary_per_school
  ON public.school_contacts (school_id) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS school_contacts_school_id_idx ON public.school_contacts (school_id);
CREATE INDEX IF NOT EXISTS school_contacts_email_idx     ON public.school_contacts (lower(email)) WHERE email IS NOT NULL;
ALTER TABLE public.school_contacts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.school_jkkn_owners (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  jkkn_user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role               school_owner_role NOT NULL,
  program_partner_id UUID REFERENCES public.program_partners(id) ON DELETE SET NULL,
  assigned_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT school_jkkn_owners_program_lead_has_partner CHECK (
    role <> 'program_lead' OR program_partner_id IS NOT NULL
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS school_jkkn_owners_unique_active
  ON public.school_jkkn_owners (school_id, jkkn_user_id, role, COALESCE(program_partner_id::text, ''))
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS school_jkkn_owners_user_idx    ON public.school_jkkn_owners (jkkn_user_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS school_jkkn_owners_school_idx  ON public.school_jkkn_owners (school_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS school_jkkn_owners_partner_idx ON public.school_jkkn_owners (program_partner_id) WHERE program_partner_id IS NOT NULL;
ALTER TABLE public.school_jkkn_owners ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.school_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_type_id      UUID NOT NULL REFERENCES public.school_session_types(id) ON DELETE RESTRICT,
  conducted_at         TIMESTAMPTZ NOT NULL,
  conducted_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  program_partner_id   UUID REFERENCES public.program_partners(id) ON DELETE SET NULL,
  attendee_count       INTEGER NOT NULL DEFAULT 0 CHECK (attendee_count >= 0),
  topic                TEXT,
  notes                TEXT,
  attachments          JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS school_sessions_school_id_idx    ON public.school_sessions (school_id, conducted_at DESC);
CREATE INDEX IF NOT EXISTS school_sessions_type_idx         ON public.school_sessions (session_type_id);
CREATE INDEX IF NOT EXISTS school_sessions_partner_idx      ON public.school_sessions (program_partner_id) WHERE program_partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS school_sessions_conducted_by_idx ON public.school_sessions (conducted_by_user_id);
ALTER TABLE public.school_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.school_contributions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind               school_contribution_kind NOT NULL,
  description        TEXT NOT NULL,
  value_inr          NUMERIC(14, 2) CHECK (value_inr IS NULL OR value_inr >= 0),
  delivered_at       DATE,
  program_partner_id UUID REFERENCES public.program_partners(id) ON DELETE SET NULL,
  evidence_url       TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS school_contributions_school_idx  ON public.school_contributions (school_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS school_contributions_kind_idx    ON public.school_contributions (kind);
CREATE INDEX IF NOT EXISTS school_contributions_partner_idx ON public.school_contributions (program_partner_id) WHERE program_partner_id IS NOT NULL;
ALTER TABLE public.school_contributions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.program_partner_grants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_partner_id UUID NOT NULL REFERENCES public.program_partners(id) ON DELETE CASCADE,
  amount_inr         NUMERIC(14, 2) NOT NULL CHECK (amount_inr > 0),
  received_at        DATE NOT NULL,
  designated_for     TEXT NOT NULL,
  invoice_url        TEXT,
  receipt_no         TEXT,
  notes              TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS program_partner_grants_partner_idx
  ON public.program_partner_grants (program_partner_id, received_at DESC);
ALTER TABLE public.program_partner_grants ENABLE ROW LEVEL SECURITY;

-- ── Induction programs: day/program feedback toggle columns (2026-07-30) ──
-- Migration: supabase/migrations/20260730110000_induction_day_program_feedback.sql
ALTER TABLE public.induction_programs
  ADD COLUMN IF NOT EXISTS feedback_day_enabled     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feedback_program_enabled BOOLEAN NOT NULL DEFAULT false;

-- ── event_day_feedback (2026-07-30) — per-day fresher feedback, mirrors event_session_feedback ──
CREATE TABLE IF NOT EXISTS public.event_day_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  day_number      INTEGER NOT NULL,
  learner_id      UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id  UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_day_feedback_event_day_learner_uniq UNIQUE (event_id, day_number, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_edf_event   ON public.event_day_feedback(event_id);
CREATE INDEX IF NOT EXISTS idx_edf_learner ON public.event_day_feedback(learner_id);
ALTER TABLE public.event_day_feedback ENABLE ROW LEVEL SECURITY;

-- ── event_program_feedback (2026-07-30) — whole-induction fresher feedback ──
CREATE TABLE IF NOT EXISTS public.event_program_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id  UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_program_feedback_event_learner_uniq UNIQUE (event_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_epf_event   ON public.event_program_feedback(event_id);
CREATE INDEX IF NOT EXISTS idx_epf_learner ON public.event_program_feedback(learner_id);
ALTER TABLE public.event_program_feedback ENABLE ROW LEVEL SECURITY;

-- ── induction_event_coordinators (2026-07-30) — per-event coordinators, additive to institution-wide roles ──
-- Migration: supabase/migrations/20260730120000_induction_event_coordinators.sql
CREATE TABLE IF NOT EXISTS public.induction_event_coordinators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by   UUID REFERENCES public.profiles(id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT induction_event_coordinators_event_user_uniq UNIQUE (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_iec_event ON public.induction_event_coordinators(event_id);
CREATE INDEX IF NOT EXISTS idx_iec_user  ON public.induction_event_coordinators(user_id);

ALTER TABLE public.induction_event_coordinators ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- social_monthly_cadence — Department Instagram Monthly Cadence ledger
-- Added: 2026-07-04 — mirror of migration 20260704120000_social_monthly_cadence.sql
-- Per-department, calendar-month reach loop (objective -> baseline -> feedback
-- -> action -> re-measure -> close). Reach snapshots come ONLY from
-- ig_monthly_audit; feedback ONLY from feedback_events. project_id is REQUIRED
-- and points at a real projects row (is_okr=true, project_type='okr_objective',
-- owner=HOD) — OKR was absorbed into the Projects module (locked 2026-05-31).
-- RLS policies live in 03_policies.sql; reader/writer RPCs in 02_functions.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.social_monthly_cadence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  department_id UUID NULL REFERENCES public.departments(id) ON DELETE SET NULL,
  cadence_month DATE NOT NULL,
  objective TEXT NOT NULL,
  baseline_reach BIGINT NULL,
  baseline_month DATE NULL,
  baseline_metrics_source TEXT NULL,
  feedback_read_summary JSONB NULL,
  action_taken TEXT NULL,
  remeasure_reach BIGINT NULL,
  remeasure_month DATE NULL,
  remeasure_metrics_source TEXT NULL,
  reach_delta BIGINT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','awaiting_close','closed','unmeasurable')),
  -- ON DELETE RESTRICT (not CASCADE): preserve the reach-loop audit history.
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  learning TEXT NULL,
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_monthly_cadence_account_month_uniq UNIQUE (account_id, cadence_month)
);

CREATE INDEX IF NOT EXISTS idx_social_monthly_cadence_account
  ON public.social_monthly_cadence (account_id, cadence_month DESC);
CREATE INDEX IF NOT EXISTS idx_social_monthly_cadence_institution
  ON public.social_monthly_cadence (institution_id);
CREATE INDEX IF NOT EXISTS idx_social_monthly_cadence_department
  ON public.social_monthly_cadence (department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_monthly_cadence_open
  ON public.social_monthly_cadence (status) WHERE status IN ('open','awaiting_close');
CREATE INDEX IF NOT EXISTS idx_social_monthly_cadence_project
  ON public.social_monthly_cadence (project_id);

-- Idempotent FK converge: fix a stale ON DELETE CASCADE from an earlier apply.
ALTER TABLE public.social_monthly_cadence
  DROP CONSTRAINT IF EXISTS social_monthly_cadence_project_id_fkey;
ALTER TABLE public.social_monthly_cadence
  ADD CONSTRAINT social_monthly_cadence_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS trg_social_monthly_cadence_updated_at ON public.social_monthly_cadence;
CREATE TRIGGER trg_social_monthly_cadence_updated_at
  BEFORE UPDATE ON public.social_monthly_cadence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- project_id is IMMUTABLE post-insert (blocks raw-PostgREST tampering that would
-- repoint the teeth at another project). RPC state machine never changes it.
CREATE OR REPLACE FUNCTION public.fn_social_cadence_guard_project_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'social_monthly_cadence.project_id is immutable once set'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_monthly_cadence_project_immutable ON public.social_monthly_cadence;
CREATE TRIGGER trg_social_monthly_cadence_project_immutable
  BEFORE UPDATE ON public.social_monthly_cadence
  FOR EACH ROW EXECUTE FUNCTION public.fn_social_cadence_guard_project_id();

ALTER TABLE public.social_monthly_cadence ENABLE ROW LEVEL SECURITY;
-- RPC-WRITE-ONLY (round-3 HIGH root fix): authenticated may READ but NEVER
-- directly DML — all writes flow through the DEFINER writer RPCs (which carry
-- the ownership / is_okr / DARK-gate / immutability guards). A raw PostgREST
-- INSERT/UPDATE would bypass every guard (e.g. point project_id at a victim
-- project to weaponise close/cron's RAG write). Neither REVOKE touches
-- service_role, so the cron dispatcher's service-role writes keep working.
REVOKE ALL ON public.social_monthly_cadence FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.social_monthly_cadence FROM authenticated;
GRANT SELECT ON public.social_monthly_cadence TO authenticated;

-- =====================================================================================
-- hr_recruitment_candidate_comments — discussion thread on recruitment candidates
-- (migration 20260703130200). Decision comments stay in approval_chain JSONB;
-- this is the free-form thread. RLS inherits candidate visibility via EXISTS.
-- =====================================================================================
CREATE TABLE IF NOT EXISTS hr_recruitment_candidate_comments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id       uuid NOT NULL REFERENCES hr_recruitment_candidates(id) ON DELETE CASCADE,
  hr_organization_id uuid NOT NULL REFERENCES hr_organizations(id),
  commenter_id       uuid NOT NULL REFERENCES profiles(id),
  comment            text NOT NULL,
  parent_comment_id  uuid REFERENCES hr_recruitment_candidate_comments(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_rec_cand_comments_candidate
  ON hr_recruitment_candidate_comments(candidate_id, created_at);

-- hr_job_applications promotion bridge (migration 20260703130000):
--   promoted_candidate_id uuid REFERENCES hr_recruitment_candidates(id)
--   status CHECK extended with 'promoted'
-- (Base table created in migration 20260627_hr_job_applications.sql — not yet
--  mirrored here; see that migration for the full definition.)

-- =====================================================================================
-- Cohort Core — shared cohort spine (migration 20260731040000_cohort_core_spine.sql).
-- Domain-agnostic engine registered into by SF100 / Foundations / CDC / Trainer.
-- Statuses enforced via CHECK (repo convention, not pg ENUM). institution_id is
-- NOT NULL on cohorts to close the role_has_institution_access(NULL)=TRUE tenant hole.
-- RLS → 03_policies.sql; updated_at triggers → 04_triggers.sql. Added 2026-07-05.
-- =====================================================================================
CREATE TABLE IF NOT EXISTS public.cohorts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL
                    CHECK (kind IN ('sf100','foundations','cdc','trainer')),
  name            text NOT NULL,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  owner_id        uuid,
  academic_year   text,
  opens_at        timestamptz,
  closes_at       timestamptz,
  hard_deadline   timestamptz,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','enrolling','active','completed','archived')),
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at     timestamptz,
  archived_by     uuid,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cohorts_institution_id ON public.cohorts (institution_id);
CREATE INDEX IF NOT EXISTS idx_cohorts_kind_status     ON public.cohorts (kind, status);

CREATE TABLE IF NOT EXISTS public.cohort_memberships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id    uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  member_type  text NOT NULL
                 CHECK (member_type IN ('team','student','learner','staff')),
  member_ref   uuid NOT NULL,
  status       text NOT NULL DEFAULT 'invited'
                 CHECK (status IN ('invited','enrolled','active','graduated','removed','paused')),
  role         text,
  joined_at    timestamptz,
  joined_by    uuid,
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cohort_memberships_cohort_member_uidx UNIQUE (cohort_id, member_type, member_ref)
);
CREATE INDEX IF NOT EXISTS idx_cohort_memberships_cohort_id ON public.cohort_memberships (cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_memberships_member    ON public.cohort_memberships (member_type, member_ref);

CREATE TABLE IF NOT EXISTS public.cohort_status_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id      uuid REFERENCES public.cohorts(id) ON DELETE CASCADE,
  membership_id  uuid REFERENCES public.cohort_memberships(id) ON DELETE CASCADE,
  event_type     text NOT NULL,
  from_status    text,
  to_status      text,
  actor_id       uuid,
  reason         text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cohort_status_events_target_chk
    CHECK (cohort_id IS NOT NULL OR membership_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_cohort_status_events_cohort_id     ON public.cohort_status_events (cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_status_events_membership_id ON public.cohort_status_events (membership_id);

-- SF100 demote link (migration 20260731060000_sf100_demote_to_extension.sql, 2026-07-05).
-- cohorts/cohort_memberships are canonical; sf100_enrollments is demoted to an SF100
-- per-team EXTENSION linked to its team membership by this one nullable FK. NULLABLE
-- (NOT NULL deferred) + ON DELETE SET NULL (a LINK, not identity — never cascade-delete
-- the live extension row). sf100_enrollments' own CREATE TABLE lives in
-- supabase/migrations/20260331000002_sf100_solve_for_100.sql (SF100 DDL is migration-only,
-- like CDC), so this is mirrored here as a guarded ALTER rather than folded into a column list.
ALTER TABLE public.sf100_enrollments
  ADD COLUMN IF NOT EXISTS cohort_membership_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'sf100_enrollments_cohort_membership_id_fkey'
      AND conrelid = 'public.sf100_enrollments'::regclass
  ) THEN
    ALTER TABLE public.sf100_enrollments
      ADD CONSTRAINT sf100_enrollments_cohort_membership_id_fkey
      FOREIGN KEY (cohort_membership_id)
      REFERENCES public.cohort_memberships(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_sf100_enrollments_cohort_membership
  ON public.sf100_enrollments (cohort_membership_id);

-- Cohort Core — D9: SF100 roster members must be profile-linked
-- (migration 20260731070000_sf100_roster_profile_required.sql).
-- Every roster member resolves to a real MyJKKN identity — profile_id (profiles)
-- OR learner_id (learners_profiles); free-text-only members are disallowed.
-- sf100_roster_changes' own CREATE TABLE lives in
-- supabase/migrations/20260331000002_sf100_solve_for_100.sql (SF100 DDL is
-- migration-only, like CDC), so this is mirrored here as a guarded ALTER.
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS → guard on pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'sf100_roster_changes_identity_required'
      AND conrelid = 'public.sf100_roster_changes'::regclass
  ) THEN
    ALTER TABLE public.sf100_roster_changes
      ADD CONSTRAINT sf100_roster_changes_identity_required
      CHECK (profile_id IS NOT NULL OR learner_id IS NOT NULL);
  END IF;
END $$;

-- Cohort Core — Foundations demote to cohort core
-- (migration 20260731080000_foundations_demote_to_cohort_core.sql, 2026-07-06).
-- cohorts (kind='foundations') + cohort_memberships (member_type='student') are the
-- canonical spine roster/lifecycle; ss_foundations_enrollments is demoted to a
-- per-student EXTENSION linked to its membership by this one nullable FK. NULLABLE
-- (NOT NULL deferred) + ON DELETE SET NULL (a LINK, not identity — never
-- cascade-delete the live extension row that owns responses via student_id).
-- ss_foundations_enrollments' own CREATE TABLE lives in
-- supabase/migrations/20260602000001_ss_foundations_substrate.sql, so this is
-- mirrored here as a guarded ALTER rather than folded into a column list.
ALTER TABLE public.ss_foundations_enrollments
  ADD COLUMN IF NOT EXISTS cohort_membership_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'ss_foundations_enrollments_cohort_membership_id_fkey'
      AND conrelid = 'public.ss_foundations_enrollments'::regclass
  ) THEN
    ALTER TABLE public.ss_foundations_enrollments
      ADD CONSTRAINT ss_foundations_enrollments_cohort_membership_id_fkey
      FOREIGN KEY (cohort_membership_id)
      REFERENCES public.cohort_memberships(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_ssf_enroll_cohort_membership
  ON public.ss_foundations_enrollments (cohort_membership_id);
-- D9: the per-student member must link a real student profile. member_ref ==
-- student_id (a real profiles(id)) is service-enforced (member_ref is polymorphic);
-- this explicit CHECK is the audit-trail signal that the identity column is non-null.
-- Safe: student_id is already NOT NULL and the table has 0 rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'ss_foundations_enrollments_student_required'
      AND conrelid = 'public.ss_foundations_enrollments'::regclass
  ) THEN
    ALTER TABLE public.ss_foundations_enrollments
      ADD CONSTRAINT ss_foundations_enrollments_student_required
      CHECK (student_id IS NOT NULL);
  END IF;
END $$;
-- Cohort Core — dedupe guard for the Foundations spine mirror (migration 20260731080000).
-- Makes the ss_foundations_cohort → cohorts(kind='foundations') mirror 1:1 at the DB level,
-- so a concurrent-enrol race can never leak duplicate mirror cohorts. Partial so it never
-- constrains other cohort kinds.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cohorts_foundations_ss_id
  ON public.cohorts ((config->>'ss_foundations_cohort_id'))
  WHERE kind = 'foundations';

-- 2026-07-06 — PDE pilot scoping (interview-driven; applied to prod same day).
-- Lets a quest be limited to one institution's students, and labels each
-- enrollment as pilot vs stray. See app/api/pde/quests/route.ts (visibility),
-- app/api/pde/quests/[id]/enroll/route.ts (label),
-- app/api/pde/admin/quests/[id]/reset/route.ts (clean reset).
ALTER TABLE public.pde_quests
  ADD COLUMN IF NOT EXISTS target_institution_id uuid REFERENCES public.institutions(id);
-- NULL = visible to all institutions; set = only that institution's students see it in the catalog.

ALTER TABLE public.pde_quest_enrollments
  ADD COLUMN IF NOT EXISTS is_pilot boolean NOT NULL DEFAULT false;
-- TRUE when the learner belongs to the quest's target_institution_id at enroll time.


-- CDC Training demote link (migration 20260731090000_cdc_training_demote_to_cohort_core.sql,
-- 2026-07-06). cohorts/cohort_memberships are canonical; cdc_training_enrollments is
-- demoted to a per-learner EXTENSION (attendance + certificate + semester-schedule stay
-- authoritative on it) linked to its cohort membership by this one nullable FK. NULLABLE
-- (populated best-effort forward by TrainingService.addEnrollment) + ON DELETE SET NULL
-- (a LINK, not identity — never cascade-delete the live extension row). CDC DDL is
-- migration-only (zero cdc_* tables in setup/*), so this is mirrored here as a guarded
-- ALTER rather than folded into a column list.
ALTER TABLE public.cdc_training_enrollments
  ADD COLUMN IF NOT EXISTS cohort_membership_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'cdc_training_enrollments_cohort_membership_id_fkey'
      AND conrelid = 'public.cdc_training_enrollments'::regclass
  ) THEN
    ALTER TABLE public.cdc_training_enrollments
      ADD CONSTRAINT cdc_training_enrollments_cohort_membership_id_fkey
      FOREIGN KEY (cohort_membership_id)
      REFERENCES public.cohort_memberships(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_cdc_training_enrollments_cohort_membership
  ON public.cdc_training_enrollments (cohort_membership_id);
-- L3 race guard: one cohorts mirror per CDC programme (kind='cdc'), keyed on
-- config->>'cdc_training_programme_id'. Partial so it never collides with the
-- sf100/foundations/trainer mirrors sharing public.cohorts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cohorts_cdc_training_programme
  ON public.cohorts ((config->>'cdc_training_programme_id'))
  WHERE kind = 'cdc';


-- ── Cohort Core — M2: outcome-capture-at-close (Phase 7 · THE MOAT) ───────────
-- Migration: supabase/migrations/20260731091000_cohort_outcome_capture.sql (2026-07-05).
-- The captured OUTCOME BASELINE of a cohort member at the moment its membership
-- closes (transitions into graduated | removed). Written by a DATABASE TRIGGER
-- (see 04_triggers.sql: fn_capture_cohort_outcome / trg_cohort_capture_outcome)
-- so the moat's fuel cannot be bypassed by any service that forgets. RLS +
-- policies in 03_policies.sql. institution_id is NOT NULL (copied from the parent
-- cohort by the trigger) to close the role_has_institution_access(NULL)=TRUE hole.
CREATE TABLE IF NOT EXISTS public.cohort_outcomes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id        uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  membership_id    uuid REFERENCES public.cohort_memberships(id) ON DELETE SET NULL,
  member_ref       uuid NOT NULL,
  member_type      text NOT NULL
                     CHECK (member_type IN ('team','student','learner','staff')),
  kind             text NOT NULL
                     CHECK (kind IN ('sf100','foundations','cdc','trainer')),
  captured_at      timestamptz NOT NULL DEFAULT now(),
  outcome_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  source           text NOT NULL DEFAULT 'trigger'
                     CHECK (source IN ('trigger','service','backfill','manual')),
  institution_id   uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cohort_outcomes_cohort_id      ON public.cohort_outcomes (cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_outcomes_institution_id ON public.cohort_outcomes (institution_id);
CREATE INDEX IF NOT EXISTS idx_cohort_outcomes_member         ON public.cohort_outcomes (member_type, member_ref);
CREATE INDEX IF NOT EXISTS idx_cohort_outcomes_kind           ON public.cohort_outcomes (kind);
-- One captured baseline per membership (a membership closes exactly once).
CREATE UNIQUE INDEX IF NOT EXISTS uidx_cohort_outcomes_membership
  ON public.cohort_outcomes (membership_id)
  WHERE membership_id IS NOT NULL;
-- hr_recruitment_job_notes — job-level discussion thread for the approvals
-- workspace (migration 20260706110000). RLS inherits job visibility via EXISTS.
-- =====================================================================================
CREATE TABLE IF NOT EXISTS hr_recruitment_job_notes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid NOT NULL REFERENCES hr_recruitment_jobs(id) ON DELETE CASCADE,
  hr_organization_id uuid NOT NULL REFERENCES hr_organizations(id),
  author_id          uuid NOT NULL REFERENCES profiles(id),
  note               text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_rec_job_notes_job
  ON hr_recruitment_job_notes(job_id, created_at);

-- =====================================================================================
-- hr_recruitment_purge_log — PII-free tombstone for super-admin purges of a REJECTED
-- applicant (migration 20260810170000). Deliberately stores NO name/email/phone/
-- qualification/resume URL: the whole point of the purge is that those are gone.
--
-- No FKs — every id it holds points at a row that has been deleted by design.
--
-- drive_file_id is operational, not identifying (an opaque Drive handle that resolves
-- only for the service account). It is kept ONLY until the resume is confirmed deleted,
-- then nulled by fn_clear_recruitment_purge_drive_ref. A row still carrying one
-- therefore means "orphaned resume, needs a Drive sweep".
-- =====================================================================================
CREATE TABLE IF NOT EXISTS hr_recruitment_purge_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id     uuid,
  candidate_id       uuid,
  job_id             uuid,
  institution_id     uuid,
  hr_organization_id uuid,
  stage              text NOT NULL
                       CHECK (stage IN ('screening_rejected', 'pipeline_rejected')),
  had_resume         boolean NOT NULL DEFAULT false,
  drive_file_id      text,
  drive_cleared_at   timestamptz,
  purged_by          uuid NOT NULL,
  purged_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_purge_log_purged_at
  ON hr_recruitment_purge_log (purged_at DESC);
-- Orphan-resume sweep: purges whose Drive file was never confirmed gone.
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_purge_log_pending_drive
  ON hr_recruitment_purge_log (purged_at DESC)
  WHERE drive_file_id IS NOT NULL;

-- ── Cohort Core — M7.2 experiments + M7.3 proposals (Phase 7 · THE MOAT) ─────
-- Migrations: 20260731093000_cohort_experiments.sql, 20260731094000_cohort_feedforward.sql (2026-07-06)
-- cohort_experiments: one causal-lift result per cohort (control-group A/B).
-- cohort_adjustment_proposals: feed-forward program changes, human-approved.
CREATE TABLE IF NOT EXISTS public.cohort_experiments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id           uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  kind                text NOT NULL CHECK (kind IN ('sf100','foundations','cdc','trainer')),
  n_treatment         int  NOT NULL DEFAULT 0,
  n_control           int  NOT NULL DEFAULT 0,
  treatment_mean_lift numeric,
  control_mean_lift   numeric,
  -- CAUSAL lift = treatment_mean − control_mean (NULL if either arm is empty:
  -- a causal claim needs both arms). This is the number the feed-forward loop
  -- (7.3) is allowed to act on.
  causal_lift         numeric,
  -- NAIVE lift = mean lift across ALL scored members (ignores arms). This is the
  -- CONFOUNDED number kept only for contrast — the loop must NOT act on it.
  naive_lift          numeric,
  n_scored            int  NOT NULL DEFAULT 0,
  estimator_version   text,
  computed_at         timestamptz NOT NULL DEFAULT now(),
  institution_id      uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- one experiment result per cohort; fn_compute upserts on this.
  CONSTRAINT cohort_experiments_cohort_uidx UNIQUE (cohort_id)
);

CREATE INDEX IF NOT EXISTS idx_cohort_experiments_institution
  ON public.cohort_experiments (institution_id);
CREATE INDEX IF NOT EXISTS idx_cohort_experiments_kind

CREATE TABLE IF NOT EXISTS public.cohort_adjustment_proposals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  based_on_cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('sf100','foundations','cdc','trainer')),
  target_scope       text NOT NULL DEFAULT 'program' CHECK (target_scope IN ('program')),
  target_id          uuid NOT NULL,             -- sf100_programs.id to adjust
  causal_lift        numeric,
  decision           text NOT NULL CHECK (decision IN ('adopt','revert','inconclusive')),
  proposed_changes   jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale          text,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','approved','rejected','applied')),
  reviewed_by        uuid,
  reviewed_at        timestamptz,
  applied_at         timestamptz,
  applied_by         uuid,
  institution_id     uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cohort_proposals_institution ON public.cohort_adjustment_proposals (institution_id);
CREATE INDEX IF NOT EXISTS idx_cohort_proposals_target ON public.cohort_adjustment_proposals (target_scope, target_id);
CREATE INDEX IF NOT EXISTS idx_cohort_proposals_status ON public.cohort_adjustment_proposals (status);
-- At most ONE open (pending OR applied) proposal per source cohort → idempotent
-- proposer AND prevents the additive program delta from being applied twice.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_cohort_proposals_one_open_per_cohort
  ON public.cohort_adjustment_proposals (based_on_cohort_id)
  WHERE status IN ('pending','applied');

-- ============================================================================
-- School Master (Last School dropdown lookup — board+district-wise)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.school_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name text NOT NULL,
  board text NOT NULL DEFAULT 'state_board',
  district text NOT NULL,
  state text NOT NULL DEFAULT 'Tamil Nadu',
  pincode text,
  udise_code text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS school_master_board_district_name_uq
  ON public.school_master (board, district, lower(school_name));
CREATE INDEX IF NOT EXISTS school_master_board_district_idx
  ON public.school_master (board, district);
CREATE INDEX IF NOT EXISTS school_master_name_trgm_idx
  ON public.school_master USING gin (school_name extensions.gin_trgm_ops);

-- learners_profiles: additive nullable FK to school_master
ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS last_school_id uuid REFERENCES public.school_master(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS learners_profiles_last_school_id_idx
  ON public.learners_profiles (last_school_id)
  WHERE last_school_id IS NOT NULL;

-- ============================================================================
-- Postal Codes (TN post offices — pincode → district + lat/long lookup)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.postal_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pincode text NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  office_name text NOT NULL,
  division text,
  district text NOT NULL,
  district_id text NOT NULL,
  state text NOT NULL DEFAULT 'Tamil Nadu',
  latitude numeric(10,7),
  longitude numeric(10,7),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS postal_codes_pin_office_uq
  ON public.postal_codes (pincode, lower(office_name));
CREATE INDEX IF NOT EXISTS postal_codes_pincode_idx
  ON public.postal_codes (pincode);

-- learners_profiles: additive nullable FK to postal_codes
ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS post_office_id uuid REFERENCES public.postal_codes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS learners_profiles_post_office_id_idx
  ON public.learners_profiles (post_office_id)
  WHERE post_office_id IS NOT NULL;

-- ── event_volunteer_checkins: MyJKKN volunteer link (2026-07-10) ─────────────
-- member_id = staff.profile_id (auth uid) or learners_profiles.id; NULL for guests.
ALTER TABLE public.event_volunteer_checkins
  ADD COLUMN IF NOT EXISTS member_id    uuid,
  ADD COLUMN IF NOT EXISTS member_role  text,
  ADD COLUMN IF NOT EXISTS member_email text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_volunteer_checkins_member_role_check') THEN
    ALTER TABLE public.event_volunteer_checkins
      ADD CONSTRAINT event_volunteer_checkins_member_role_check
      CHECK (member_role IS NULL OR member_role IN ('staff', 'student'));
  END IF;
END $$;

-- One active (not checked-out) check-in per JKKN person per event.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_volunteers_member_active
  ON public.event_volunteer_checkins (event_id, member_id)
  WHERE member_id IS NOT NULL AND checked_out_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_volunteers_member
  ON public.event_volunteer_checkins (member_id)
  WHERE member_id IS NOT NULL;

-- Updated: 2026-07-17 - Bug duplicate-cluster proposals (PR 3 of bug-triage epic).
-- Nightly trigram scan groups similar open bug_reports; admin confirms via the
-- Groups tab, which stamps duplicate_of (PR-1 machinery then owns the group).
-- RLS-enabled with NO policies: SECURITY DEFINER fns + service role only.
-- Applied live via migration 20260717150000_bug_clusters_scan_loop.sql.
CREATE TABLE IF NOT EXISTS public.bug_clusters (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seed_bug_id        UUID NOT NULL UNIQUE REFERENCES public.bug_reports(id) ON DELETE CASCADE,
    member_ids         UUID[] NOT NULL,
    member_count       INT NOT NULL,
    sample_description TEXT,
    module_names       TEXT[] NOT NULL DEFAULT '{}',
    status             TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','dismissed')),
    decided_by         UUID NULL,
    decided_at         TIMESTAMPTZ NULL,
    first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_scan_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated: 2026-07-24 - ID Card bridge heartbeat (migration
-- 20260724045622_id_card_agent_status.sql). Singleton row (id=1) recording the
-- last time the on-prem ID-card print bridge polled GET /api/id-cards/jobs
-- with a valid agent token; read by the print-queue UI "Print bridge online /
-- silent" chip. Written via the service-role client only.
CREATE TABLE IF NOT EXISTS public.id_card_agent_status (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_poll_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.id_card_agent_status IS
  'Singleton heartbeat (id=1): last time the on-prem ID-card print bridge polled GET /api/id-cards/jobs. Updated via the service-role client; read by the print-queue UI bridge-status chip.';

-- ---------------------------------------------------------------------------
-- Payment security audit trail.
-- Replaces the old (silently broken) use of user_activity_logs, whose user_id
-- is NOT NULL FK -> profiles(id) while every payment event identifies the payer
-- by learners_profiles.id — so every audit insert failed with 23503 and was
-- swallowed. Payment events also originate from contexts with no user at all
-- (Razorpay webhooks, the razorpay-late-auth cron), so this table deliberately
-- carries NO foreign keys: an audit write must never be rejected.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        TEXT NOT NULL,
  transaction_id    TEXT NOT NULL,
  student_id        UUID,
  institution_id    UUID,
  expected_amount   NUMERIC,
  actual_amount     NUMERIC,
  client_status     TEXT,
  server_status     TEXT,
  description       TEXT,
  ip_address        TEXT,
  user_agent        TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_audit_logs_transaction_id_idx ON public.payment_audit_logs(transaction_id);
CREATE INDEX IF NOT EXISTS payment_audit_logs_created_at_idx ON public.payment_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS payment_audit_logs_event_type_idx ON public.payment_audit_logs(event_type, created_at DESC);

ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_audit_logs FROM anon, authenticated;

COMMENT ON TABLE public.payment_audit_logs IS
  'Payment security audit trail (verification, manipulation, replay, webhook, receipt). No FKs by design: an audit write must never fail.';

-- Archive of voided billing receipts (mig 20260729_billing_receipt_void).
-- A void MOVES the row here rather than flagging it in place: 26 functions read
-- billing_receipts and ~20 sum payment_amount directly, so a `voided_at` flag
-- would need filtering in every one of them and a single miss overstates
-- collections. Safe only because generate_receipt_number() uses a sequence, not
-- MAX(receipt_number), so a number can never be reused.
CREATE TABLE IF NOT EXISTS public.billing_receipts_voided (
  id                       uuid PRIMARY KEY,
  receipt_number           text NOT NULL,
  receipt_date             date,
  student_id               uuid,
  institution_id           uuid,
  payment_mode             text,
  payment_reference_number text,
  payment_amount           numeric,
  payment_paid_date        date,
  payer_name               text,
  payer_contact            text,
  accountant_id            uuid,
  payment_remarks          text,
  created_by               uuid,
  created_at               timestamptz,
  updated_at               timestamptz,
  items_snapshot           jsonb NOT NULL DEFAULT '[]'::jsonb,
  voided_at                timestamptz NOT NULL DEFAULT now(),
  voided_by                uuid,
  void_reason              text NOT NULL
);
-- Supabase default-grants new public tables to anon; RLS is not a substitute.
REVOKE ALL ON TABLE public.billing_receipts_voided FROM anon, PUBLIC;

-- Receipt cancellation approval (mig 20260729_receipt_cancellation_approval).
-- NOTE receipt_id has NO foreign key on purpose: approving a request DELETEs
-- that receipt, and an FK (this repo defaults to NO ACTION) would make approval
-- fail with 23503. receipt_snapshot preserves the receipt's identity instead.
CREATE SEQUENCE IF NOT EXISTS public.billing_receipt_cancel_number_seq;

CREATE TABLE IF NOT EXISTS public.billing_receipt_cancel_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number   text NOT NULL UNIQUE,
  receipt_id       uuid NOT NULL,
  institution_id   uuid,
  student_id       uuid,
  receipt_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason           text NOT NULL,
  status           text NOT NULL DEFAULT 'pending_approval'
                   CHECK (status IN ('pending_approval','approved','declined','withdrawn','failed')),
  requested_by     uuid,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  decided_by       uuid,
  decided_at       timestamptz,
  decision_notes   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- At most ONE open request per receipt, so two people noticing the same
-- duplicate cannot get it approved twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_receipt_cancel_open_per_receipt
  ON public.billing_receipt_cancel_requests (receipt_id)
  WHERE status = 'pending_approval';

CREATE TABLE IF NOT EXISTS public.billing_receipt_cancel_request_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL
                  REFERENCES public.billing_receipt_cancel_requests(id) ON DELETE CASCADE,
  action_type     text NOT NULL
                  CHECK (action_type IN ('requested','approved','declined','withdrawn','failed')),
  actor_id        uuid,
  actor_role_name text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_receipts_voided
  ADD COLUMN IF NOT EXISTS cancel_request_id uuid;

REVOKE ALL ON TABLE public.billing_receipt_cancel_requests FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.billing_receipt_cancel_request_actions FROM anon, PUBLIC;
REVOKE ALL ON SEQUENCE public.billing_receipt_cancel_number_seq FROM anon, PUBLIC;

-- Identity SNAPSHOTS for receipt cancellation (mig 20260729_receipt_cancellation_
-- super_admin_only). decided_by/requested_by are uuids, and a profile can be
-- renamed, re-emailed or deactivated long after the decision -- so name / email /
-- role / super-admin flag are captured AT DECISION TIME and never updated.
ALTER TABLE public.billing_receipt_cancel_requests
  ADD COLUMN IF NOT EXISTS requested_by_name       text,
  ADD COLUMN IF NOT EXISTS requested_by_email      text,
  ADD COLUMN IF NOT EXISTS requested_by_role       text,
  ADD COLUMN IF NOT EXISTS decided_by_name         text,
  ADD COLUMN IF NOT EXISTS decided_by_email        text,
  ADD COLUMN IF NOT EXISTS decided_by_role         text,
  ADD COLUMN IF NOT EXISTS decided_by_designation  text,
  ADD COLUMN IF NOT EXISTS decided_by_is_super_admin boolean;

ALTER TABLE public.billing_receipt_cancel_request_actions
  ADD COLUMN IF NOT EXISTS actor_name           text,
  ADD COLUMN IF NOT EXISTS actor_email          text,
  ADD COLUMN IF NOT EXISTS actor_is_super_admin boolean;

-- ── session_feedback: case-insensitive faculty-email expression index (2026-07-31) ──
-- Migration: supabase/migrations/20260731220000_add_session_feedback_faculty_email_lower_index.sql
-- ALREADY APPLIED TO PROD 2026-07-31 ~07:55 IST via the Management API as a
-- single-statement CREATE INDEX CONCURRENTLY (outside any transaction); verified
-- indisvalid=true and the lower(faculty_email) filter plan flipped Seq Scan → Bitmap
-- Index Scan. Sits beside sibling idx_session_feedback_faculty (exact-case), which —
-- like the session_feedback table itself — is declared in
-- 20260615233000_session_feedback_substrate.sql, not in this file.
CREATE INDEX IF NOT EXISTS idx_session_feedback_faculty_email_lower
  ON public.session_feedback (lower(faculty_email), attendance_date);


-- =====================================================================
-- hr_shift_timings — table, constraints and indexes
-- Added 2026-08-06. Source of truth:
--   supabase/migrations/20260806090000_create_hr_shift_timings.sql
--   supabase/migrations/20260806090100_hr_shift_timings_functions.sql
--   supabase/migrations/20260806090400_hr_shift_timings_save_week.sql
-- Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md
--
-- Replaced the legacy hr_shift_templates / hr_shift_assignments /
-- hr_shift_swap_requests module, dropped 2026-08-06 (all three were empty).
-- Those tables were never mirrored into supabase/setup, so there is nothing
-- to remove here.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.hr_shift_timings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

  -- Most specific wins at resolution:
  --   'category'     -> exact employment_category_id
  --   'teaching'     -> employment_categories.is_teaching = true
  --   'non_teaching' -> employment_categories.is_teaching = false
  staff_scope text NOT NULL CHECK (staff_scope IN ('teaching','non_teaching','category','work_pattern')),
  employment_category_id uuid NULL REFERENCES public.employment_categories(id) ON DELETE CASCADE,
  -- Added 2026-09-04 (20260904120000_hr_work_patterns.sql): staff_scope='work_pattern'
  -- rows carry their own weekly grid, keyed to a hr_work_patterns row instead of an
  -- employment category.
  work_pattern_id uuid NULL REFERENCES public.hr_work_patterns(id) ON DELETE RESTRICT,
  -- Added 2026-08-30 (20260830100000_hr_shift_timings_applicable_gender.sql), mirrored
  -- here 2026-09-04: 'all' matches everyone; an exact match beats 'all' for that person.
  applicable_gender text NOT NULL DEFAULT 'all'
    CONSTRAINT hr_shift_timings_applicable_gender_chk CHECK (applicable_gender IN ('all','male','female','bigender')),

  -- ISO-8601: 1=Mon .. 7=Sun. Matches EXTRACT(ISODOW FROM date) exactly.
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),

  is_working_day boolean NOT NULL DEFAULT true,

  -- The two half-day session windows. They MAY overlap (09:00-13:00 / 12:30-16:30)
  -- — that is the real JKKN pattern, and the reason lunch_start/lunch_end on
  -- hr_work_schedules could not be reused: a lunch gap and a session overlap
  -- are opposites.
  first_half_start  time NULL,
  first_half_end    time NULL,
  second_half_start time NULL,
  second_half_end   time NULL,

  -- Applies to first_half_start ONLY. Confirmed requirement: morning punch only.
  grace_minutes integer NOT NULL DEFAULT 0 CHECK (grace_minutes BETWEEN 0 AND 240),

  -- 2nd Saturday of the month is non-working. Only meaningful when day_of_week = 6.
  second_saturday_holiday boolean NOT NULL DEFAULT false,

  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date NULL,

  notes text NULL,
  is_active boolean NOT NULL DEFAULT true,

  created_by uuid NULL REFERENCES public.profiles(id),
  updated_by uuid NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Added 2026-09-04: one scope, one target. Was a two-way category check;
  -- now three-way with staff_scope='work_pattern'.
  CONSTRAINT hr_shift_timings_scope_target_chk CHECK (
       (staff_scope = 'category'     AND employment_category_id IS NOT NULL AND work_pattern_id IS NULL)
    OR (staff_scope = 'work_pattern' AND work_pattern_id IS NOT NULL AND employment_category_id IS NULL)
    OR (staff_scope IN ('teaching', 'non_teaching') AND employment_category_id IS NULL AND work_pattern_id IS NULL)
  ),

  -- A working day has ONE half or both, each all-or-nothing (2026-09-04,
  -- 20260904170000_hr_shift_timings_single_half.sql): a 09:00-14:00 Saturday
  -- with no afternoon is a real row now. A non-working day has none.
  CONSTRAINT hr_shift_timings_times_present_chk CHECK (
       (is_working_day = false
        AND first_half_start IS NULL AND first_half_end IS NULL
        AND second_half_start IS NULL AND second_half_end IS NULL)
    OR (is_working_day = true
        AND (first_half_start  IS NULL) = (first_half_end  IS NULL)
        AND (second_half_start IS NULL) = (second_half_end IS NULL)
        AND (first_half_start IS NOT NULL OR second_half_start IS NOT NULL))
  ),

  -- Overlap between the halves is ALLOWED; inversion is not. Ordering applies
  -- within a half, and between the halves only when both exist.
  CONSTRAINT hr_shift_timings_order_chk CHECK (
       is_working_day = false
    OR (
          (first_half_start  IS NULL OR first_half_end  > first_half_start)
      AND (second_half_start IS NULL OR second_half_end > second_half_start)
      AND (first_half_start IS NULL OR second_half_start IS NULL
           OR (second_half_start >= first_half_start AND second_half_end >= first_half_end))
    )
  ),

  CONSTRAINT hr_shift_timings_second_saturday_chk CHECK (
    second_saturday_holiday = false OR day_of_week = 6
  ),

  CONSTRAINT hr_shift_timings_effective_chk CHECK (
    effective_until IS NULL OR effective_until > effective_from
  ),

  -- Added 2026-09-04 (20260904120000_hr_work_patterns.sql): a pattern is
  -- already per person, so a gender split on top of it has no meaning.
  -- NOTE: references applicable_gender, which the live table has (added by
  -- 20260830100000_hr_shift_timings_applicable_gender.sql) but which was
  -- never mirrored into this CREATE TABLE block -- a pre-existing gap in
  -- this file, not introduced by this migration.
  CONSTRAINT hr_shift_timings_pattern_gender_chk CHECK (
    staff_scope <> 'work_pattern' OR applicable_gender = 'all'
  )
);

COMMENT ON TABLE public.hr_shift_timings IS
  'Institution-wise shift timing config, grained on (institution, staff scope, weekday) and effective-dated. Two half-day session windows that may overlap; grace_minutes applies to first_half_start ONLY. Resolution is most-specific-wins: a staff_scope=category row beats teaching/non_teaching. Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md';

COMMENT ON COLUMN public.hr_shift_timings.day_of_week IS 'ISO-8601 weekday: 1=Mon .. 7=Sun. Matches EXTRACT(ISODOW FROM date).';
COMMENT ON COLUMN public.hr_shift_timings.grace_minutes IS 'Late allowance on first_half_start ONLY. Punching within grace is on time; beyond it is flagged late but the day still counts full.';
COMMENT ON COLUMN public.hr_shift_timings.second_saturday_holiday IS 'When true and day_of_week=6, the 2nd Saturday of each month resolves as non-working.';

-- One live row per (institution, scope, category, weekday).
-- COALESCE is load-bearing: Postgres treats NULLs as DISTINCT in a plain UNIQUE
-- index, which would allow unlimited duplicate 'teaching' rows through.
-- Note none of hr_shift_templates / hr_shift_assignments / hr_work_schedules /
-- hr_biometric_punches has any unique constraint at all — do not repeat that.
CREATE UNIQUE INDEX IF NOT EXISTS hr_shift_timings_current_uq
  ON public.hr_shift_timings (
    institution_id,
    staff_scope,
    COALESCE(employment_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(work_pattern_id, '00000000-0000-0000-0000-000000000000'::uuid),
    applicable_gender,
    day_of_week
  )
  WHERE effective_until IS NULL AND is_active;

CREATE INDEX IF NOT EXISTS hr_shift_timings_lookup
  ON public.hr_shift_timings (institution_id, day_of_week, effective_from DESC)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS hr_shift_timings_category
  ON public.hr_shift_timings (employment_category_id)
  WHERE employment_category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hr_shift_timings_work_pattern_idx
  ON public.hr_shift_timings (work_pattern_id)
  WHERE work_pattern_id IS NOT NULL;

-- =====================================================================
-- hr_work_patterns, hr_staff_work_pattern_assignments,
-- hr_work_pattern_leave_entitlements (2026-09-04)
-- Source: 20260904120000_hr_work_patterns.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.hr_work_patterns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES public.profiles(id),
  updated_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_work_patterns_name_chk CHECK (length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_work_patterns_name_uq
  ON public.hr_work_patterns (institution_id, lower(btrim(name)))
  WHERE is_active;
CREATE INDEX IF NOT EXISTS hr_work_patterns_institution_idx
  ON public.hr_work_patterns (institution_id);

ALTER TABLE public.hr_work_patterns ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.hr_work_patterns IS
  'A named working week for one institution (e.g. "3-day Tue/Wed/Thu"). Its hours are the hr_shift_timings rows with staff_scope=work_pattern; its leave figures are hr_work_pattern_leave_entitlements; who is on it is hr_staff_work_pattern_assignments.';

-- Who is on which pattern, from when. effective_until is EXCLUSIVE, like
-- hr_shift_timings. One pattern per person per day is a constraint, not a
-- convention, because the resolver has to give one answer.
CREATE TABLE IF NOT EXISTS public.hr_staff_work_pattern_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id         uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  work_pattern_id  uuid NOT NULL REFERENCES public.hr_work_patterns(id) ON DELETE RESTRICT,
  -- Denormalised from the pattern by t10_wpa_stamp_institution so RLS can
  -- scope on it without a join. The trigger also refuses a pattern from
  -- another institution than the staff member's.
  institution_id   uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  effective_from   date NOT NULL,
  effective_until  date,
  notes            text,
  created_by       uuid REFERENCES public.profiles(id),
  updated_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_swpa_effective_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
  CONSTRAINT hr_swpa_no_overlap EXCLUDE USING gist (
    staff_id WITH =,
    daterange(effective_from, effective_until, '[)') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS hr_swpa_staff_idx
  ON public.hr_staff_work_pattern_assignments (staff_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS hr_swpa_pattern_idx
  ON public.hr_staff_work_pattern_assignments (work_pattern_id);
CREATE INDEX IF NOT EXISTS hr_swpa_institution_idx
  ON public.hr_staff_work_pattern_assignments (institution_id);

ALTER TABLE public.hr_staff_work_pattern_assignments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.hr_staff_work_pattern_assignments IS
  'Effective-dated membership of a staff member in a work pattern. Written ONLY by fn_hr_assign_work_pattern, which also resyncs open leave balances. effective_until is exclusive.';

-- Days per leave type for a pattern. Only request_category=leave types belong
-- here: short time off is minute-backed and comp-off is credit-backed, and a
-- day figure on either would be a lie nothing reads (see
-- 20260828190000_hr_sto_entitled_days_uncapped.sql).
CREATE TABLE IF NOT EXISTS public.hr_work_pattern_leave_entitlements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_pattern_id  uuid NOT NULL REFERENCES public.hr_work_patterns(id) ON DELETE CASCADE,
  leave_type_id    uuid NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE CASCADE,
  entitled_days    numeric(6,2) NOT NULL CHECK (entitled_days >= 0),
  created_by       uuid REFERENCES public.profiles(id),
  updated_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_wple_pattern_type_uq UNIQUE (work_pattern_id, leave_type_id)
);

CREATE INDEX IF NOT EXISTS hr_wple_leave_type_idx
  ON public.hr_work_pattern_leave_entitlements (leave_type_id);

ALTER TABLE public.hr_work_pattern_leave_entitlements ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.hr_work_pattern_leave_entitlements IS
  'Entitled days per (work pattern, leave type). Read by generate_hr_leave_balances (between a staff-level assignment and department/organization ones) and by fn_hr_assign_work_pattern when it resyncs open balances.';

-- Campus Living — Settle Then Bill (Director 2026-08-09)
-- Added: 2026-08-09 (migration 20260815060000_hostel_settle_then_bill.sql —
-- FILE ONLY, apply is Director-gated). A hostel room is NOT billed at
-- move-in: a settle window lets the room fill (5 days, restarting on each
-- joiner, capped 20 days from first open, short-circuited when the room is
-- full), then every resident is billed at the occupancy that exists at that
-- moment. A later joiner produces CREDITS, never a refund or a bill rewrite.
-- The whole mechanism is OFF by default (hostel.settle_bill.enabled = false
-- in platform_policies).

CREATE TABLE IF NOT EXISTS public.hostel_room_settle_windows (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id              uuid NOT NULL REFERENCES public.hostel_rooms(id),
    hostel_year_id       uuid REFERENCES public.hostel_years(id),
    opened_at            timestamptz NOT NULL DEFAULT now(),
    restart_count        int NOT NULL DEFAULT 0,
    current_deadline     timestamptz NOT NULL,
    hard_deadline        timestamptz NOT NULL,
    status               text NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','billed','cancelled')),
    billed_at            timestamptz,
    occupants_at_billing int,
    -- Joiner allocation ids whose late-join credit round has been PROCESSED.
    -- Marked whether or not any credit row was written, so a round that credits
    -- nobody (rounds to 0, co-residents unbilled) is still never re-processed.
    credited_allocation_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Re-apply safety: the column was added after the table's first draft.
ALTER TABLE public.hostel_room_settle_windows
  ADD COLUMN IF NOT EXISTS credited_allocation_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- One OPEN window per room per hostel year.
-- COALESCE is load-bearing: Postgres treats NULLs as DISTINCT in a plain unique
-- index, so a bare (room_id, hostel_year_id) would allow unlimited open windows
-- on any room whose year is not yet set.
CREATE UNIQUE INDEX IF NOT EXISTS hostel_room_settle_windows_open_uq
    ON public.hostel_room_settle_windows (
        room_id,
        COALESCE(hostel_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE status = 'open';

-- The due-sweep predicate.
CREATE INDEX IF NOT EXISTS hostel_room_settle_windows_due
    ON public.hostel_room_settle_windows (current_deadline, hard_deadline)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS hostel_room_settle_windows_room
    ON public.hostel_room_settle_windows (room_id, status);

DROP TRIGGER IF EXISTS trg_hostel_room_settle_windows_touch
    ON public.hostel_room_settle_windows;
CREATE TRIGGER trg_hostel_room_settle_windows_touch
    BEFORE UPDATE ON public.hostel_room_settle_windows
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

COMMENT ON TABLE public.hostel_room_settle_windows IS
  'Settle-then-bill window per hostel room per hostel year (Director 2026-08-09). '
  'A room is NOT billed at move-in; the window lets the room fill, restarts on '
  'each new joiner up to hard_deadline, then bills everyone at the occupancy '
  'that exists at close. Gated by platform policy hostel.settle_bill.enabled.';

COMMENT ON COLUMN public.hostel_room_settle_windows.hard_deadline IS
  'opened_at + hostel.settle_bill.outer_limit_days. Restarts may never push '
  'current_deadline past this instant.';

COMMENT ON COLUMN public.hostel_room_settle_windows.occupants_at_billing IS
  'Active occupants at the moment the window closed. The denominator every '
  'later late-join credit is measured against.';

-- Updated: 2026-08-09 - Empty-bed intimation send ledger (Director interview 2026-08-09).
-- One row per room per learner per IST calendar day, so a reminder about the
-- same under-filled room cannot reach the same learner twice in one day.
-- Written ONLY by the service-role cron (/api/cron/campus-living/empty-bed-notices);
-- there is deliberately no INSERT/UPDATE/DELETE policy. See migration
-- supabase/migrations/20260815060001_empty_bed_intimation.sql — FILE ONLY, NOT APPLIED.
--
-- sent_on exists because a UNIQUE constraint cannot span an expression and only
-- a constraint (not a bare unique index) works as an ON CONFLICT target from
-- PostgREST. It is pinned to Asia/Kolkata: a UTC cron run between 00:00 and
-- 05:30 IST would otherwise bank the notice on yesterday and allow a second one
-- the same Indian morning.
CREATE TABLE IF NOT EXISTS public.hostel_empty_bed_notices (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id           UUID        NOT NULL REFERENCES public.hostel_rooms(id) ON DELETE CASCADE,
    learner_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_on           DATE        NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
    occupants_at_send INTEGER     NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT hostel_empty_bed_notices_one_per_day
        UNIQUE (room_id, learner_id, sent_on)
);

CREATE INDEX IF NOT EXISTS hostel_empty_bed_notices_recent
    ON public.hostel_empty_bed_notices (learner_id, room_id, sent_at DESC);

-- =====================================================
-- HR ACADEMIC YEARS (2026-08-10)
-- =====================================================
-- The leave/payroll calendar HR owns. Deliberately NOT academic_years:
--   * academic_years is scoped per institution, so '2026-2027' exists 11 times
--     with 11 ids. HR is keyed on hr_organization_id and needed a dimension it
--     could compare across institutions -- hr_leave_balance_analytics used to
--     match on the trimmed NAME because no id was comparable.
--   * academic_years runs Jun 1 -> Mar 31 (10 months), leaving April and May
--     outside every year. hr_academic_years runs the financial year,
--     Apr 1 -> Mar 31.
-- One row per year for all of JKKN HR; tenancy stays on the referencing rows
-- (hr_leave_balances.hr_organization_id).
CREATE TABLE IF NOT EXISTS public.hr_academic_years (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    year_name   TEXT        NOT NULL,
    start_date  DATE        NOT NULL,
    end_date    DATE        NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    notes       TEXT,
    created_by  UUID        REFERENCES public.profiles(id),
    updated_by  UUID        REFERENCES public.profiles(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT hr_academic_years_name_uq  UNIQUE (year_name),
    CONSTRAINT hr_academic_years_dates_ck CHECK (end_date > start_date),

    -- The constraint academic_years lacks: two active years must never contain
    -- the same day, because resolution is by date bracket. Its absence on
    -- academic_years is how 'JKKN Dental 2026-2027 Additional 2' and three more
    -- shadow rows came to exist there.
    CONSTRAINT hr_academic_years_no_overlap
        EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
        WHERE (is_active)
);

CREATE INDEX IF NOT EXISTS hr_academic_years_dates_idx
    ON public.hr_academic_years (start_date, end_date) WHERE is_active;


-- =====================================================================
-- Added: 2026-08-06 - admission_leads source/referral audit trail
-- Mirror of migration 20260818020000_admission_lead_source_audit.sql
-- (ALREADY APPLIED TO PROD 2026-08-06 via hand-run SQL; this records it so
--  the repo is not amnesiac and survives a DB rebuild).
-- Records who/when/old->new for every change to source, source_detail,
-- referral_type, referred_by_id, referred_by_name on admission_leads.
-- RLS policy -> setup/03_policies.sql; audit fn -> setup/02_functions.sql;
-- trigger -> setup/04_triggers.sql.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.admission_lead_source_audit (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            uuid NOT NULL,
  learner_profile_id uuid,
  changed_field      text NOT NULL,   -- source | source_detail | referral_type | referred_by_id | referred_by_name
  old_value          text,
  new_value          text,
  changed_by         uuid,            -- auth.uid() of the editor (NULL for system/service-role writes)
  changed_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alsa_lead       ON public.admission_lead_source_audit(lead_id);
CREATE INDEX IF NOT EXISTS idx_alsa_changed_at ON public.admission_lead_source_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_alsa_changed_by ON public.admission_lead_source_audit(changed_by);

ALTER TABLE public.admission_lead_source_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL   ON public.admission_lead_source_audit FROM anon, PUBLIC;
GRANT  SELECT ON public.admission_lead_source_audit TO authenticated;

-- Updated: 2026-08-10 - Referral attribution + quota audit trail on the LEARNER
-- record (referral_attribution_audit). Companion to admission_lead_source_audit,
-- which watches the same kind of change on the lead; a credit attached directly
-- on learners_profiles was invisible to that trigger because it is bound to a
-- different table. Also covers quota_id + counseling_applied — the
-- Direct-versus-Counselling distinction that decides whether a referral is
-- payable at all.
--
-- The companion is live on production (hand-applied via the Management API on
-- 2026-08-06, and it has already captured a real change) but is NOT yet in this
-- repository — PR #2889 back-fills it, so grepping for it here returns nothing.
-- Rebuilt from the repo alone today, neither trail would exist until #2889
-- merges and both are applied.
--
-- One row per FIELD that actually changed, never one per UPDATE statement.
-- learner_profile_id carries NO foreign key on purpose: ON DELETE CASCADE would
-- erase the trail exactly when it matters and ON DELETE RESTRICT would let the
-- trail block a legitimate deletion — an audit row must be able to outlive its
-- subject. old_value/new_value are text for every field because uuid and boolean
-- both render losslessly, so one pair of columns beats five typed pairs that are
-- NULL four times in five.
--
-- Written ONLY by trg_audit_learner_referral_attribution (SECURITY DEFINER);
-- no client holds INSERT, UPDATE or DELETE, and there is deliberately no policy
-- for them. The anon lock and the narrow authenticated re-grant live with the
-- policies in 03_policies.sql. See migration
-- supabase/migrations/20260818030000_extend_referral_source_audit.sql
-- — FILE ONLY, NOT APPLIED.
CREATE TABLE IF NOT EXISTS public.referral_attribution_audit (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_profile_id UUID        NOT NULL,
    changed_field      TEXT        NOT NULL,
    old_value          TEXT,
    new_value          TEXT,
    changed_by         UUID,
    changed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Three read shapes, three indexes: one learner's history, the recent-activity
-- feed, and "what has this person been changing". The changed_by index is
-- partial because system/cron writes are NULL by design and expected to be the
-- bulk of the table.
CREATE INDEX IF NOT EXISTS referral_attribution_audit_learner_idx
    ON public.referral_attribution_audit (learner_profile_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS referral_attribution_audit_changed_at_idx
    ON public.referral_attribution_audit (changed_at DESC);

CREATE INDEX IF NOT EXISTS referral_attribution_audit_changed_by_idx
    ON public.referral_attribution_audit (changed_by, changed_at DESC)
    WHERE changed_by IS NOT NULL;

-- Updated: 2026-08-10 - Referral integrity: Registrar reconciliation + pair scoring.
-- The Registrar (a different office from the admission desk) enters an agency's
-- OWN list of learners; the platform compares it against the credits it already
-- holds and surfaces the disagreements. referral_pair_scores is keyed on the
-- (team member, agency) PAIR because one person spreading fabricated credits
-- across several agencies looks clean on every individual agency row.
-- See migration supabase/migrations/20260818040000_referral_reconciliation_and_pair_scoring.sql
-- — FILE ONLY, NOT APPLIED. Nothing here pays, generates or approves anything.

CREATE TABLE IF NOT EXISTS public.referral_reconciliation_sessions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    consultant_id UUID        NOT NULL REFERENCES public.education_consultants(id),
    academic_year INTEGER     NOT NULL,               -- 2025 = the "2025-26" intake
    conducted_by  UUID        REFERENCES public.profiles(id),
    conducted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes         TEXT,
    status        TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'submitted')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- source: 'agency' rows are typed in from the agency's list; 'system' rows are
-- added by fn_reconcile_referral_session to represent learners the platform
-- credits but the agency never claimed — without them the three buckets would
-- not be a complete partition. Re-running reconcile replaces only 'system' rows.
CREATE TABLE IF NOT EXISTS public.referral_reconciliation_claims (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id         UUID        NOT NULL REFERENCES public.referral_reconciliation_sessions(id) ON DELETE CASCADE,
    claimed_name       TEXT,
    claimed_phone      TEXT,
    matched_learner_id UUID        REFERENCES public.learners_profiles(id),
    match_confidence   TEXT,       -- 'phone' | 'name' | 'none'
    bucket             TEXT        CHECK (bucket IN ('agreed', 'credited_not_claimed', 'claimed_not_credited')),
    evidence_note      TEXT,
    has_dated_proof    BOOLEAN     NOT NULL DEFAULT false,
    evidence_status    TEXT        CHECK (evidence_status IN
                                   ('agency_confirmed', 'agency_does_not_recognise', 'agency_has_dated_proof')),
    source             TEXT        NOT NULL DEFAULT 'agency' CHECK (source IN ('agency', 'system')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_pair_scores (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    team_member_id    UUID        NOT NULL REFERENCES public.profiles(id),
    consultant_id     UUID        NOT NULL REFERENCES public.education_consultants(id),
    credits_total     INTEGER     NOT NULL DEFAULT 0,
    credits_confirmed INTEGER     NOT NULL DEFAULT 0,
    credits_disputed  INTEGER     NOT NULL DEFAULT 0,
    risk_level        TEXT        NOT NULL DEFAULT 'normal'
                                  CHECK (risk_level IN ('normal', 'watch', 'red')),
    frozen            BOOLEAN     NOT NULL DEFAULT false,
    frozen_at         TIMESTAMPTZ,
    frozen_by         UUID        REFERENCES public.profiles(id),
    frozen_reason     TEXT,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT referral_pair_scores_pair_unique UNIQUE (team_member_id, consultant_id)
);

-- =====================================================================
-- Updated: 2026-08-10 - JKKN permanent identity register
-- Migration: supabase/migrations/20260817040000_jkkn_permanent_identity_schema.sql
-- FILE ONLY / NOT APPLIED to production as of 2026-08-10.
-- =====================================================================
-- One permanent number per person, for life: six digits + a Damm check
-- digit, written 348295-7. Learners and team members share ONE pool, so a
-- learner who returns as a Senior Learner keeps the same number. Nothing
-- that can change is encoded in it — no college code, no year, no course.
-- The width is char(8), not char(7): seven DIGITS, eight CHARACTERS once
-- the dash is stored.
--
-- WHY THE TWO CHECK-DIGIT FUNCTIONS ARE DECLARED HERE AND NOT IN
-- 02_functions.sql: jkkn_identities has a CHECK constraint that calls
-- fn_jkkn_id_validate, and 00_master_setup runs 01_tables BEFORE
-- 02_functions — so declaring them there would make a clean setup run fail
-- on this table. They are pure and IMMUTABLE with no dependencies, so they
-- are safe to declare this early. 02_functions carries the three SECURITY
-- DEFINER RPCs, which have no such ordering constraint.
-- ---------------------------------------------------------------------
-- Damm, not Luhn. Luhn misses the 09 <-> 90 transposition, which is
-- exactly the error a human makes reading a number off an ID card.
-- Damm's totally anti-symmetric quasigroup catches 100% of single-digit
-- errors AND 100% of adjacent transpositions with a single check digit.
--
-- Proven exhaustively over the whole issuing range before this migration
-- was written: all 900,000 six-digit numbers, every one of their 48.6M
-- single-digit mutations and 4.1M adjacent transpositions — zero
-- undetected. The table below is Damm's standard 10x10 operation table;
-- its rows and columns are each a permutation of 0-9 and its diagonal is
-- all zeros, which is what makes the scheme work. Do not "tidy" it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_jkkn_id_check_digit(p_six_digits text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $fn$
DECLARE
  -- Damm quasigroup, flattened row-major. Index = interim*10 + digit + 1
  -- (PostgreSQL arrays are 1-based).
  k_damm CONSTANT int[] := ARRAY[
    0,3,1,7,5,9,8,6,4,2,
    7,0,9,2,1,5,4,8,6,3,
    4,2,0,6,8,7,1,3,5,9,
    1,7,5,0,9,8,3,4,2,6,
    6,1,2,3,0,4,5,9,7,8,
    3,6,7,4,2,0,9,5,8,1,
    5,8,6,9,7,2,0,1,3,4,
    8,9,4,5,3,6,2,0,1,7,
    9,4,3,8,6,1,7,2,0,5,
    2,5,8,1,4,3,6,7,9,0
  ];
  v_interim int := 0;
  i         int;
BEGIN
  -- Anything that is not exactly six digits has no check digit. Return
  -- NULL rather than guessing, so a caller that forgets to check gets a
  -- NULL comparison (false) instead of a plausible wrong answer.
  IF p_six_digits IS NULL OR p_six_digits !~ '^[0-9]{6}$' THEN
    RETURN NULL;
  END IF;

  FOR i IN 1..6 LOOP
    v_interim := k_damm[v_interim * 10 + substr(p_six_digits, i, 1)::int + 1];
  END LOOP;

  RETURN v_interim::text;
END;
$fn$;

COMMENT ON FUNCTION public.fn_jkkn_id_check_digit(text) IS
  'Damm check digit for the six-digit body of a JKKN ID. Returns NULL unless the input is exactly six digits. Catches every single-digit error and every adjacent transposition — including 09 <-> 90, which Luhn misses. Verified exhaustively over all 900,000 six-digit values.';

REVOKE EXECUTE ON FUNCTION public.fn_jkkn_id_check_digit(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_jkkn_id_check_digit(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Whole-ID validation
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_jkkn_id_validate(p_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT CASE
    WHEN p_id IS NULL                       THEN false
    WHEN btrim(p_id) !~ '^[0-9]{6}-[0-9]$'  THEN false
    ELSE public.fn_jkkn_id_check_digit(left(btrim(p_id), 6)) = right(btrim(p_id), 1)
  END;
$fn$;

COMMENT ON FUNCTION public.fn_jkkn_id_validate(text) IS
  'True only for a well-formed JKKN ID whose check digit is correct, e.g. 348295-7. A mistyped digit or a swapped pair returns false — this is what lets the resolver reject a bad number before it searches.';

REVOKE EXECUTE ON FUNCTION public.fn_jkkn_id_validate(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_jkkn_id_validate(text) TO authenticated;
-- ---------------------------------------------------------------------
-- 3. jkkn_identities — the permanent register
-- ---------------------------------------------------------------------
-- One row per PERSON, for life. A number is never reused, not even after
-- retirement: retired rows stay here and keep holding their number, so
-- the UNIQUE constraint below is what enforces "never reused". Deleting
-- a row would release the number back into the pool — do not do it.
-- ---------------------------------------------------------------------
-- Corrected 2026-08-13: added a third person_kind, 'external_participant',
-- and a profile_id link for a person who is neither a learner nor staff.
-- Course Events issues permanent IDs to external participants; extending
-- this register keeps one pool and one format instead of minting a second.
-- Mirrors migration 20260813100500_jkkn_identity_external_participant.sql.
-- Widened 2026-08-27: a fifth person_kind, 'associate' — a profile-only
-- internal user (admin/management account holding a custom role who is
-- neither a learner nor a team member), anchored on profile_id like
-- external_participant. Mirrors migration
-- 20260827110000_jkkn_id_associate_kind_and_auto_issue.sql.
CREATE TABLE IF NOT EXISTS public.jkkn_identities (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jkkn_id             char(8) NOT NULL UNIQUE,
    person_kind         text NOT NULL,
    learner_profile_id  uuid REFERENCES public.learners_profiles(id) ON DELETE SET NULL,
    team_member_id      uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    -- Added 2026-08-13: link for an external participant, who has a
    -- profile but is neither a learner nor staff. Deliberately left
    -- unconstrained for the other kinds so that an external participant
    -- who later enrols keeps this row, this number, and both links.
    profile_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    issued_at           timestamptz NOT NULL DEFAULT now(),
    issued_by           uuid,
    retired_at          timestamptz,
    retired_reason      text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT jkkn_identities_person_kind_chk
      CHECK (person_kind IN ('learner', 'team_member', 'both', 'external_participant', 'associate')),

    -- Format is pinned here, not by the column width alone.
    CONSTRAINT jkkn_identities_format_chk
      CHECK (jkkn_id ~ '^[0-9]{6}-[0-9]$'),

    -- A stored ID whose check digit is wrong is a corrupt row, not a
    -- typo to be tolerated. fn_jkkn_id_validate is IMMUTABLE, so it is
    -- legal in a CHECK.
    CONSTRAINT jkkn_identities_check_digit_chk
      CHECK (public.fn_jkkn_id_validate(jkkn_id)),

    -- person_kind constrains WHICH link column may be filled. It does
    -- not demand that one IS filled: an ON DELETE SET NULL above can
    -- orphan a link years later, and the number must survive that. The
    -- "must actually point at a real person" rule belongs to issuance
    -- (fn_issue_jkkn_id), which verifies the target exists.
    -- Widened 2026-08-13: the fourth clause is new, the first three are
    -- preserved VERBATIM from the original migration.
    -- Widened 2026-08-27: the fifth clause ('associate') is new.
    CONSTRAINT jkkn_identities_link_shape_chk CHECK (
         (person_kind = 'learner'              AND team_member_id     IS NULL)
      OR (person_kind = 'team_member'          AND learner_profile_id IS NULL)
      OR (person_kind = 'both')
      OR (person_kind = 'external_participant' AND learner_profile_id IS NULL
                                               AND team_member_id     IS NULL)
      OR (person_kind = 'associate'            AND learner_profile_id IS NULL
                                               AND team_member_id     IS NULL)
    ),

    CONSTRAINT jkkn_identities_retirement_chk
      CHECK (retired_at IS NULL OR retired_reason IS NOT NULL)
);

COMMENT ON TABLE public.jkkn_identities IS
  'The permanent JKKN ID register. One row per person for life, shared by learners and team members — someone who studies here and later joins the team keeps the same number. Numbers are never reused; retired rows stay to hold their number.';
COMMENT ON COLUMN public.jkkn_identities.jkkn_id IS
  'The identifier in its one canonical written form: six digits, a dash, then the Damm check digit — 348295-7. Eight characters for seven digits.';
COMMENT ON COLUMN public.jkkn_identities.person_kind IS
  'learner | team_member | both | external_participant. "both" is a person who is currently on the register in both capacities; it is a fact about them, not a second number.';
COMMENT ON COLUMN public.jkkn_identities.retired_at IS
  'Set when an identity is withdrawn (issued in error, duplicate found). The number stays parked on this row forever and is never handed to anyone else.';
COMMENT ON COLUMN public.jkkn_identities.profile_id IS
  'Link for an external participant, who has a profile but is neither a learner nor staff. Deliberately left unconstrained for the other kinds so that an external participant who later enrols keeps this row, this number, and both links.';

-- One person, one number — enforced structurally, not only in the issuer.
CREATE UNIQUE INDEX IF NOT EXISTS ux_jkkn_identities_learner
  ON public.jkkn_identities (learner_profile_id)
  WHERE learner_profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_jkkn_identities_team_member
  ON public.jkkn_identities (team_member_id)
  WHERE team_member_id IS NOT NULL;
-- Added 2026-08-13.
CREATE UNIQUE INDEX IF NOT EXISTS ux_jkkn_identities_profile
  ON public.jkkn_identities (profile_id)
  WHERE profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jkkn_identities_active
  ON public.jkkn_identities (person_kind)
  WHERE retired_at IS NULL;

-- ---------------------------------------------------------------------
-- 4. jkkn_identity_aliases — every other number the world uses
-- ---------------------------------------------------------------------
-- Rows are CLOSED, never deleted: set valid_to and is_current = false.
-- A roll number issued in 2026 must still resolve to the right person in
-- 2040, long after the person has stopped using it.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jkkn_identity_aliases (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    jkkn_identity_id   uuid NOT NULL REFERENCES public.jkkn_identities(id) ON DELETE CASCADE,
    alias_type         text NOT NULL,
    alias_value        text NOT NULL,
    institution_id     uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
    academic_year      int,
    valid_from         date,
    valid_to           date,
    is_current         boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT jkkn_identity_aliases_type_chk
      CHECK (alias_type IN (
        'roll_number', 'team_code', 'register_number',
        'application_number', 'neet_roll', 'abc_id', 'legacy'
      )),

    CONSTRAINT jkkn_identity_aliases_value_chk
      CHECK (btrim(alias_value) <> ''),

    CONSTRAINT jkkn_identity_aliases_window_chk
      CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from),

    -- A closed row is not current. Enforcing it here means a reader can
    -- trust is_current without also re-deriving it from the dates.
    CONSTRAINT jkkn_identity_aliases_current_chk
      CHECK (valid_to IS NULL OR is_current = false)
);

COMMENT ON TABLE public.jkkn_identity_aliases IS
  'Every other number a person is known by — roll number, Team Code, university register number, application number, NEET roll, ABC ID, legacy. The JKKN ID does not replace these; externally mandated numbers such as Anna University register numbers are owned by the awarding body and only ever mirrored here.';
COMMENT ON COLUMN public.jkkn_identity_aliases.alias_type IS
  'roll_number | team_code | register_number | application_number | neet_roll | abc_id | legacy. "team_code" is the identifier for a team member (the term "Staff ID" is not used).';
COMMENT ON COLUMN public.jkkn_identity_aliases.is_current IS
  'False once the alias has been closed. Rows are never deleted, so a 2026 roll number still resolves in 2040.';

-- The spec's UNIQUE(alias_type, alias_value, academic_year, institution_id)
-- would NOT hold: in a plain UNIQUE constraint two NULLs are distinct, so
-- two identical roll numbers with no year recorded would both be accepted
-- — which is the exact collision the constraint exists to stop. COALESCE
-- sentinels make it enforceable on every PostgreSQL version (no reliance
-- on 15+ NULLS NOT DISTINCT), and folding case/whitespace means 24ubac12
-- and ' 24UBAC12 ' cannot both be issued.
CREATE UNIQUE INDEX IF NOT EXISTS ux_jkkn_identity_aliases_natural
  ON public.jkkn_identity_aliases (
    alias_type,
    lower(btrim(alias_value)),
    COALESCE(academic_year, -1),
    COALESCE(institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_jkkn_identity_aliases_identity
  ON public.jkkn_identity_aliases (jkkn_identity_id);
CREATE INDEX IF NOT EXISTS idx_jkkn_identity_aliases_lookup
  ON public.jkkn_identity_aliases (lower(btrim(alias_value)));

-- =====================================================================
-- Added: 2026-08-11 - Derived leave entitlement (hr_leave_entitlement_overrides)
-- Mirror of migration 20260811180000_hr_leave_entitlement_overrides.sql
-- Spec: docs/superpowers/specs/2026-08-11-hr-leave-balance-derived-entitlement-design.md
-- entitled becomes nullable (NULL = derive from hr_leave_types at read
-- time); hr_academic_years gains frozen_at (non-NULL = year archived,
-- balances served from stored rows, not derived). RLS policies ->
-- setup/03_policies.sql.
-- =====================================================================
ALTER TABLE public.hr_leave_balances
  ALTER COLUMN entitled DROP NOT NULL;

COMMENT ON COLUMN public.hr_leave_balances.entitled IS
  'NULL = derive from hr_leave_types.default_entitled_days at read time. '
  'Non-NULL = frozen historical value, set by fn_hr_freeze_leave_year when the year ended.';

CREATE TABLE public.hr_leave_entitlement_overrides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES public.staff(id)             ON DELETE CASCADE,
  leave_type_id       uuid NOT NULL REFERENCES public.hr_leave_types(id)    ON DELETE CASCADE,
  hr_academic_year_id uuid NOT NULL REFERENCES public.hr_academic_years(id) ON DELETE CASCADE,
  hr_organization_id  uuid NOT NULL REFERENCES public.hr_organizations(id),
  entitled_days       numeric NOT NULL CHECK (entitled_days >= 0),
  reason              text    NOT NULL CHECK (btrim(reason) <> ''),
  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- hr_academic_year_id is NOT NULL on purpose. A nullable "every year"
  -- value would be invisible to this constraint (Postgres treats NULLs as
  -- distinct) and duplicates would accumulate silently.
  UNIQUE (employee_id, leave_type_id, hr_academic_year_id)
);

CREATE INDEX idx_hleo_lookup
  ON public.hr_leave_entitlement_overrides (employee_id, leave_type_id, hr_academic_year_id);
CREATE INDEX idx_hleo_org
  ON public.hr_leave_entitlement_overrides (hr_organization_id);

ALTER TABLE public.hr_leave_entitlement_overrides ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hr_leave_entitlement_overrides FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_leave_entitlement_overrides TO authenticated;

ALTER TABLE public.hr_academic_years
  ADD COLUMN frozen_at timestamptz;

COMMENT ON COLUMN public.hr_academic_years.frozen_at IS
  'Non-NULL = this year is archived; balances are served from stored rows, not derived.';

-- =====================================================================
-- Added: 2026-08-13 - Course Events core (course_events, course_packages,
-- course_package_installments)
-- Mirror of migration 20260813100000_course_events_core.sql
-- Phase 1 of docs/superpowers/specs/2026-08-13-course-events-design.md
-- RLS policies -> setup/03_policies.sql. Trigger functions and touch
-- function -> setup/02_functions.sql. Triggers -> setup/04_triggers.sql.
-- =====================================================================

-- `status` deliberately has NO 'closed' value. Whether applications are
-- accepted is decided solely by the application_opens_at/closes_at
-- window. Two independent switches governing one behaviour is how intake
-- states drift apart.
CREATE TABLE IF NOT EXISTS public.course_events (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id           uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  title                    text NOT NULL,
  slug                     text NOT NULL,
  code                     text,
  description              text,
  mode                     text NOT NULL DEFAULT 'offline'
                             CHECK (mode IN ('offline','online','hybrid')),
  status                   text NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft','published','completed','cancelled')),
  start_date               date,
  end_date                 date,
  application_opens_at     timestamptz,
  application_closes_at    timestamptz,
  total_seats              int CHECK (total_seats IS NULL OR total_seats > 0),
  venue_text               text,
  cover_image_url          text,
  year                     int,
  edition_number           int,
  previous_course_event_id uuid REFERENCES public.course_events(id) ON DELETE SET NULL,
  created_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_events_slug_format_chk
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT course_events_date_order_chk
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT course_events_application_window_chk
    CHECK (application_closes_at IS NULL OR application_opens_at IS NULL
           OR application_closes_at >= application_opens_at),
  CONSTRAINT course_events_slug_uniq UNIQUE (institution_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_course_events_institution
  ON public.course_events (institution_id, status);
CREATE INDEX IF NOT EXISTS idx_course_events_previous
  ON public.course_events (previous_course_event_id)
  WHERE previous_course_event_id IS NOT NULL;

COMMENT ON TABLE public.course_events IS
  'A paid, multi-session learning course conducted by an institution. Open to learners, staff and external participants.';
COMMENT ON COLUMN public.course_events.previous_course_event_id IS
  'Lineage for a course repeated yearly. Set by fn_clone_course_event (Phase 7).';

-- course_packages — priced tiers
CREATE TABLE IF NOT EXISTS public.course_packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id uuid NOT NULL REFERENCES public.course_events(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  total_amount    numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  currency        text NOT NULL DEFAULT 'INR',
  seat_cap        int CHECK (seat_cap IS NULL OR seat_cap > 0),
  sale_opens_at   timestamptz,
  sale_closes_at  timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  display_order   int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_packages_name_uniq UNIQUE (course_event_id, name),
  CONSTRAINT course_packages_sale_window_chk
    CHECK (sale_closes_at IS NULL OR sale_opens_at IS NULL
           OR sale_closes_at >= sale_opens_at)
);

CREATE INDEX IF NOT EXISTS idx_course_packages_event
  ON public.course_packages (course_event_id) WHERE is_active;

COMMENT ON COLUMN public.course_packages.seat_cap IS
  'NULL means unlimited. Waitlisting when a cap is reached is out of scope for v1.';

-- course_package_installments — the schedule template. Due dates are
-- ABSOLUTE. A cohort course has one schedule everybody pays to;
-- enrollment-relative offsets are explicitly out of scope.
CREATE TABLE IF NOT EXISTS public.course_package_installments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id     uuid NOT NULL REFERENCES public.course_packages(id) ON DELETE CASCADE,
  installment_no smallint NOT NULL CHECK (installment_no >= 1),
  label          text,
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  due_date       date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_package_installments_no_uniq UNIQUE (package_id, installment_no)
);

CREATE INDEX IF NOT EXISTS idx_course_package_installments_package
  ON public.course_package_installments (package_id, installment_no);

-- =====================================================================
-- Added: 2026-08-13 - Course Sessions and the resource_reservations
-- venue-booking seam
-- Mirror of migration 20260813100100_course_sessions_and_reservations.sql
-- RLS policies -> setup/03_policies.sql. Triggers -> setup/04_triggers.sql.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.course_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id   uuid NOT NULL REFERENCES public.course_events(id) ON DELETE CASCADE,
  institution_id    uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  session_no        int,
  title             text,
  session_date      date NOT NULL,
  start_time        time NOT NULL,
  end_time          time NOT NULL,
  trainer_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  trainer_name      text,
  venue_resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL,
  venue_text        text,
  reservation_id    uuid REFERENCES public.resource_reservations(id) ON DELETE SET NULL,
  is_cancelled      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_sessions_time_order_chk CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_course_sessions_event
  ON public.course_sessions (course_event_id, session_date);
CREATE INDEX IF NOT EXISTS idx_course_sessions_date
  ON public.course_sessions (session_date) WHERE NOT is_cancelled;

COMMENT ON TABLE public.course_sessions IS
  'One scheduled sitting of a course. Each session holds its OWN venue reservation, so a weekend bootcamp books only the Saturdays it uses rather than blocking a hall for months.';
COMMENT ON COLUMN public.course_sessions.trainer_name IS
  'Free text for an external trainer who has no profile. Use trainer_profile_id for internal staff.';

-- resource_reservations: a third owner kind. This FK targets a
-- DIFFERENT table than the existing event_id/session_id links, so it
-- does not create a second FK to one table and does not disturb any
-- PostgREST embed on this table. The old two-way CHECK is replaced by
-- a num_nonnulls(...) <= 1 "at most one owner" rule across all three.
ALTER TABLE public.resource_reservations
  ADD COLUMN IF NOT EXISTS course_session_id uuid
  REFERENCES public.course_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.resource_reservations
  DROP CONSTRAINT IF EXISTS resource_reservations_event_or_session_check;

ALTER TABLE public.resource_reservations
  ADD CONSTRAINT resource_reservations_single_owner_check
  CHECK (num_nonnulls(event_id, session_id, course_session_id) <= 1);

CREATE INDEX IF NOT EXISTS idx_resource_reservations_course_session
  ON public.resource_reservations (course_session_id)
  WHERE course_session_id IS NOT NULL;

COMMENT ON COLUMN public.resource_reservations.course_session_id IS
  'Set when this reservation was raised to hold a venue for one course session. Mutually exclusive with event_id and session_id.';

-- =====================================================================
-- Added: 2026-08-13 - Registration form builder (course_registration_forms,
-- course_registration_form_sections, course_registration_form_fields)
-- Mirror of migration 20260813100200_course_registration_forms.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.course_registration_forms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id uuid NOT NULL REFERENCES public.course_events(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name            text NOT NULL,
  slug            text NOT NULL,
  description     text,
  display_order   int NOT NULL DEFAULT 0,
  is_enabled      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_registration_forms_slug_uniq UNIQUE (course_event_id, slug),
  CONSTRAINT course_registration_forms_slug_format_chk
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

COMMENT ON COLUMN public.course_registration_forms.is_enabled IS
  'Defaults to FALSE. A new or cloned form must never silently open a second live intake on a running course.';

CREATE TABLE IF NOT EXISTS public.course_registration_form_sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       uuid NOT NULL REFERENCES public.course_registration_forms(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.course_registration_form_fields (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       uuid NOT NULL REFERENCES public.course_registration_forms(id) ON DELETE CASCADE,
  section_id    uuid REFERENCES public.course_registration_form_sections(id) ON DELETE CASCADE,
  field_key     text NOT NULL,
  label         text NOT NULL,
  field_type    text NOT NULL
                  CHECK (field_type IN ('text','textarea','number','email','phone',
                                        'date','select','multiselect','checkbox',
                                        'radio','file')),
  is_required   boolean NOT NULL DEFAULT false,
  options       jsonb NOT NULL DEFAULT '[]'::jsonb,
  placeholder   text,
  help_text     text,
  validation    jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_registration_form_fields_key_uniq UNIQUE (form_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_course_reg_forms_event
  ON public.course_registration_forms (course_event_id, display_order);
CREATE INDEX IF NOT EXISTS idx_course_reg_sections_form
  ON public.course_registration_form_sections (form_id, display_order);
CREATE INDEX IF NOT EXISTS idx_course_reg_fields_form
  ON public.course_registration_form_fields (form_id, display_order);

-- =====================================================================
-- Added: 2026-08-13 - Applications (screening gate) and enrollments
-- (course_applications, course_enrollments)
-- Mirror of migration 20260813100300_course_applications_enrollments.sql
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.course_applications (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id         uuid NOT NULL REFERENCES public.course_events(id) ON DELETE CASCADE,
  institution_id          uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  form_id                 uuid REFERENCES public.course_registration_forms(id) ON DELETE SET NULL,
  package_id              uuid REFERENCES public.course_packages(id) ON DELETE SET NULL,
  applicant_type          text NOT NULL CHECK (applicant_type IN ('learner','staff','external')),
  -- Corrected 2026-08-18: SET NULL -> RESTRICT (migration 20260818010000).
  -- The identity CHECK requires this column NOT NULL for its governing
  -- applicant_type ('staff'), so SET NULL could never actually execute
  -- for rows of its own type — it aborted with a confusing 23514 instead
  -- of a 23503.
  profile_id              uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- Corrected 2026-08-13: SET NULL -> RESTRICT (migration 20260813100450).
  -- Same reasoning, for applicant_type = 'learner'.
  learner_id              uuid REFERENCES public.learners_profiles(id) ON DELETE RESTRICT,
  external_participant_id uuid REFERENCES public.event_external_participants(id) ON DELETE RESTRICT,
  applicant_name          text NOT NULL,
  applicant_email         text,
  applicant_phone         text NOT NULL,
  custom_fields           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','shortlisted','approved','rejected','withdrawn')),
  decided_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at              timestamptz,
  decision_note           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- The identity anchor must match the declared type. Written per type
  -- rather than as a blanket num_nonnulls(...) >= 1, because a STAFF
  -- applicant has neither a learner record nor an external-participant
  -- record — only a profile.
  CONSTRAINT course_applications_identity_chk CHECK (
       (applicant_type = 'learner'  AND learner_id              IS NOT NULL)
    OR (applicant_type = 'staff'    AND profile_id              IS NOT NULL)
    OR (applicant_type = 'external' AND external_participant_id IS NOT NULL)
  ),
  CONSTRAINT course_applications_decision_chk
    CHECK (status NOT IN ('approved','rejected') OR decided_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_course_applications_event_status
  ON public.course_applications (course_event_id, status);
CREATE INDEX IF NOT EXISTS idx_course_applications_phone
  ON public.course_applications (applicant_phone);

CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id         uuid NOT NULL REFERENCES public.course_events(id) ON DELETE RESTRICT,
  institution_id          uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  application_id          uuid UNIQUE REFERENCES public.course_applications(id) ON DELETE SET NULL,
  package_id              uuid NOT NULL REFERENCES public.course_packages(id) ON DELETE RESTRICT,
  participant_type        text NOT NULL CHECK (participant_type IN ('learner','staff','external')),
  -- NOT NULL: identity provisioning runs BEFORE the enrollment insert, in
  -- the same transaction. With a nullable column Postgres treats every
  -- NULL as distinct, so the UNIQUE below would enforce nothing.
  profile_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- Corrected 2026-08-13: SET NULL -> RESTRICT (migration 20260813100450).
  -- Same reasoning as course_applications above.
  learner_id              uuid REFERENCES public.learners_profiles(id) ON DELETE RESTRICT,
  external_participant_id uuid REFERENCES public.event_external_participants(id) ON DELETE RESTRICT,
  enrollment_number       text UNIQUE,
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','confirmed','payment_overdue',
                                              'withdrawn','completed','cancelled')),
  total_payable           numeric(12,2) NOT NULL CHECK (total_payable >= 0),
  total_paid              numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
  balance                 numeric(12,2) NOT NULL,
  refundable_amount       numeric(12,2) NOT NULL DEFAULT 0 CHECK (refundable_amount >= 0),
  refund_status           text CHECK (refund_status IS NULL
                                      OR refund_status IN ('pending_offline','recorded')),
  withdrawn_at            timestamptz,
  withdrawal_reason       text,
  enrolled_at             timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_enrollments_identity_chk CHECK (
       (participant_type = 'learner'  AND learner_id IS NOT NULL)
    OR (participant_type = 'staff'    AND learner_id IS NULL
                                      AND external_participant_id IS NULL)
    OR (participant_type = 'external' AND external_participant_id IS NOT NULL)
  ),
  CONSTRAINT course_enrollments_withdrawal_chk
    CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL),
  CONSTRAINT course_enrollments_person_uniq UNIQUE (course_event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_event_status
  ON public.course_enrollments (course_event_id, status);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_profile
  ON public.course_enrollments (profile_id);

COMMENT ON COLUMN public.course_enrollments.total_payable IS
  'A SNAPSHOT of course_packages.total_amount taken at enrollment. Repricing a package later must never silently re-price people already enrolled.';

-- =====================================================================
-- Course Events — bills, payments, and derived balances
-- Mirror of migration 20260813100400_course_billing.sql
-- =====================================================================
-- billing_student_bills is NOT reused: its student_id is a NOT NULL FK
-- to learners_profiles and an external participant is not a learner.
-- These tables are keyed to an ENROLLMENT, which may belong to a learner,
-- a staff member or an external person. billing_student_bills is
-- untouched by this module.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.course_bills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   uuid NOT NULL REFERENCES public.course_enrollments(id) ON DELETE RESTRICT,
  course_event_id uuid NOT NULL REFERENCES public.course_events(id) ON DELETE RESTRICT,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  bill_number     text NOT NULL UNIQUE,
  installment_no  smallint NOT NULL CHECK (installment_no >= 1),
  label           text,
  total_amount    numeric(12,2) NOT NULL CHECK (total_amount > 0),
  paid_amount     numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance_amount  numeric(12,2) NOT NULL,
  due_date        date NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','partially_paid','paid','overdue','voided')),
  voided_at       timestamptz,
  void_reason     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_bills_installment_uniq UNIQUE (enrollment_id, installment_no),
  CONSTRAINT course_bills_void_chk
    CHECK (status <> 'voided' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_course_bills_enrollment
  ON public.course_bills (enrollment_id, installment_no);
CREATE INDEX IF NOT EXISTS idx_course_bills_overdue
  ON public.course_bills (due_date)
  WHERE status IN ('pending','partially_paid');

CREATE TABLE IF NOT EXISTS public.course_bill_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id             uuid NOT NULL REFERENCES public.course_bills(id) ON DELETE RESTRICT,
  enrollment_id       uuid NOT NULL REFERENCES public.course_enrollments(id) ON DELETE RESTRICT,
  institution_id      uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  receipt_number      text UNIQUE,
  amount_paid         numeric(12,2) NOT NULL CHECK (amount_paid > 0),
  payment_mode        text NOT NULL
                        CHECK (payment_mode IN ('razorpay','cash','neft','cheque','dd')),
  payment_date        date NOT NULL DEFAULT CURRENT_DATE,
  razorpay_order_id   text,
  razorpay_payment_id text,
  razorpay_signature  text,
  razorpay_account_id uuid REFERENCES public.razorpay_accounts(id) ON DELETE SET NULL,
  transaction_ref     text UNIQUE,
  gateway_response    jsonb,
  status              text NOT NULL DEFAULT 'initiated'
                        CHECK (status IN ('initiated','success','failed','refunded')),
  captured_at         timestamptz,
  -- Corrected 2026-08-18: SET NULL -> RESTRICT (migration 20260818010000).
  -- course_bill_payments_offline_chk requires this column NOT NULL for
  -- every non-razorpay payment mode, so SET NULL could never actually
  -- execute for those rows — it aborted with a confusing 23514 instead
  -- of a 23503.
  recorded_by         uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- An offline payment is somebody's assertion; record whose.
  CONSTRAINT course_bill_payments_offline_chk
    CHECK (payment_mode = 'razorpay' OR recorded_by IS NOT NULL)
);

-- Idempotency. Razorpay settles through TWO paths — the browser callback
-- and the server webhook — and both fire for the same payment. This index
-- makes a duplicate settlement a constraint violation the caller can
-- swallow, rather than a second credit.
CREATE UNIQUE INDEX IF NOT EXISTS course_bill_payments_rzp_payment_uniq
  ON public.course_bill_payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_course_bill_payments_bill
  ON public.course_bill_payments (bill_id) WHERE status = 'success';


-- ============================================================================
-- Empty-bed settlement + room buyout (2026-08-13)
-- Source: supabase/migrations/2026081903*.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hostel_room_buyouts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id                 uuid NOT NULL REFERENCES public.hostel_rooms(id) ON DELETE CASCADE,
  hostel_year_id          uuid NOT NULL REFERENCES public.hostel_years(id),
  institution_id          uuid,
  requested_by_learner_id uuid NOT NULL,   -- profiles.id (= auth.uid())
  capacity_at_request     int  NOT NULL,
  occupants_at_request    int  NOT NULL,
  empty_beds              int  NOT NULL,
  -- What EACH consenting resident is billed: settled share minus the one bed
  -- she already pays for. Re-derived at activation; this is the quoted figure.
  amount_per_resident     numeric NOT NULL,
  status                  text NOT NULL DEFAULT 'pending_consent',
  consent_deadline        timestamptz NOT NULL,
  activated_at            timestamptz,
  cancelled_reason        text,
  released_at             timestamptz,
  released_by             uuid,
  release_reason          text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hostel_room_buyouts_status_chk CHECK (
    status IN ('pending_consent','active','declined','expired','cancelled','released')
  )
)

CREATE TABLE IF NOT EXISTS public.hostel_room_buyout_consents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyout_id     uuid NOT NULL REFERENCES public.hostel_room_buyouts(id) ON DELETE CASCADE,
  allocation_id uuid NOT NULL REFERENCES public.hostel_allocations(id) ON DELETE CASCADE,
  learner_id    uuid NOT NULL,          -- profiles.id
  decision      text NOT NULL DEFAULT 'pending',
  decided_at    timestamptz,
  bill_id       uuid,                   -- billing_student_bills.id, set at activation
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hostel_room_buyout_consents_decision_chk CHECK (
    decision IN ('pending','agreed','declined')
  ),
  CONSTRAINT hostel_room_buyout_consents_unique UNIQUE (buyout_id, allocation_id)
)

ALTER TABLE public.hostel_categories
  ADD COLUMN IF NOT EXISTS settle_billing_enabled boolean NOT NULL DEFAULT false;

-- Gender domain lock for the two learner-facing tables (20260820160000).
-- learners_profiles.gender is NOT NULL and uses '' as its "not captured" sentinel;
-- profiles.gender is nullable and uses NULL for the same thing.
ALTER TABLE public.learners_profiles
  DROP CONSTRAINT IF EXISTS learners_profiles_gender_check;
ALTER TABLE public.learners_profiles
  ADD CONSTRAINT learners_profiles_gender_check
  CHECK (gender IN ('Male', 'Female', 'Other', ''));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_gender_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check
  CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Other'));

-- Staff name canonicalisation constraints (migration 20260910120000).
-- Belt-and-braces: trg_normalize_staff_names normalises on write, so these are
-- unreachable in normal operation, but they make the invariant impossible to
-- bypass and self-document the rule.
ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_first_name_canonical,
  DROP CONSTRAINT IF EXISTS staff_last_name_canonical;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_first_name_canonical
    CHECK (first_name IS NULL OR first_name = public.fn_canonical_staff_name(first_name)),
  ADD CONSTRAINT staff_last_name_canonical
    CHECK (last_name IS NULL OR last_name = public.fn_canonical_staff_name(last_name));

-- ============================================================================
-- 2026-08-21 — Fee structure per-item due dates, splits and status rules
-- Applied by: 20260821180000_fee_structure_item_schedules.sql
--             20260821190000_fee_schedule_generation_engine.sql (promotes_to_status_code)
-- ============================================================================
-- Before this, a generated bill's due date was the literal `now() + 30 days`,
-- hardcoded in BOTH generation paths, and the account -> reserved -> admitted
-- ladder was one pooled percentage over the learner's whole bill book. Every
-- default below reproduces the old behaviour exactly, so nothing changes until
-- a schedule is configured.

ALTER TABLE public.admission_fee_structures
  ADD COLUMN IF NOT EXISTS default_due_offset_days integer NOT NULL DEFAULT 30
    CONSTRAINT chk_afs_default_due_offset CHECK (default_due_offset_days >= 0);

ALTER TABLE public.admission_fee_structure_items
  ADD COLUMN IF NOT EXISTS schedule_mode   text NOT NULL DEFAULT 'single'
    CONSTRAINT chk_afsi_schedule_mode CHECK (schedule_mode IN ('single','split')),
  ADD COLUMN IF NOT EXISTS due_anchor      text NOT NULL DEFAULT 'generation_date'
    CONSTRAINT chk_afsi_due_anchor
    CHECK (due_anchor IN ('generation_date','academic_year_start','fixed_date')),
  ADD COLUMN IF NOT EXISTS due_offset_days integer
    CONSTRAINT chk_afsi_due_offset CHECK (due_offset_days >= 0),
  ADD COLUMN IF NOT EXISTS due_date        date,
  -- Status rule for an UNSPLIT item; ignored when schedule_mode = 'split'
  -- (the schedule lines carry their own targets).
  ADD COLUMN IF NOT EXISTS promotes_to_status_code text;

ALTER TABLE public.admission_fee_structure_items
  ADD CONSTRAINT chk_afsi_fixed_date_present
  CHECK (due_anchor <> 'fixed_date' OR schedule_mode = 'split' OR due_date IS NOT NULL);

-- Ordered instalments of ONE fee item. Mirrors billing_instalment_plan_lines
-- column for column so both feed the same split engine.
CREATE TABLE IF NOT EXISTS public.admission_fee_structure_item_schedules (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_structure_item_id   uuid NOT NULL
    REFERENCES public.admission_fee_structure_items(id) ON DELETE CASCADE,
  sequence_no             integer NOT NULL CHECK (sequence_no >= 1),
  share_percent           numeric(7,4) CHECK (share_percent > 0 AND share_percent <= 100),
  fixed_amount            numeric(12,2) CHECK (fixed_amount > 0),
  due_offset_days         integer CHECK (due_offset_days >= 0),
  due_date                date,
  -- admission_statuses.code (scope='learner'). Validated by
  -- afsis_validate_status_target(), not an FK: admission_statuses has no
  -- unique constraint on `code` to point at.
  promotes_to_status_code text,
  label                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_afsis_amount_exactly_one
    CHECK ((share_percent IS NULL) <> (fixed_amount IS NULL)),
  CONSTRAINT chk_afsis_due_exactly_one
    CHECK ((due_offset_days IS NULL) <> (due_date IS NULL)),
  CONSTRAINT uq_afsis_item_sequence UNIQUE (fee_structure_item_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS ix_afsis_item
  ON public.admission_fee_structure_item_schedules (fee_structure_item_id, sequence_no);

-- Instalment identity on the bill. instalment_group_id is what lets
-- billing_enforce_once_per_learner treat N instalments of ONE fee as one
-- logical bill — without it, splitting Tuition / Application Fee / University
-- Fee / Uniform Fee is impossible, since all four are once_per_learner.
ALTER TABLE public.billing_student_bills
  ADD COLUMN IF NOT EXISTS instalment_group_id   uuid,
  ADD COLUMN IF NOT EXISTS instalment_no         smallint
    CONSTRAINT chk_bsb_instalment_no CHECK (instalment_no IS NULL OR instalment_no >= 1),
  ADD COLUMN IF NOT EXISTS instalment_count      smallint
    CONSTRAINT chk_bsb_instalment_count CHECK (instalment_count IS NULL OR instalment_count >= 2),
  ADD COLUMN IF NOT EXISTS fee_structure_item_id uuid
    REFERENCES public.admission_fee_structure_items(id) ON DELETE SET NULL;

ALTER TABLE public.billing_student_bills
  ADD CONSTRAINT chk_bsb_instalment_triplet
  CHECK (
    (instalment_group_id IS NULL AND instalment_no IS NULL AND instalment_count IS NULL)
    OR
    (instalment_group_id IS NOT NULL AND instalment_no IS NOT NULL
     AND instalment_count IS NOT NULL AND instalment_no <= instalment_count)
  );

CREATE INDEX IF NOT EXISTS ix_bsb_instalment_group
  ON public.billing_student_bills (instalment_group_id, instalment_no)
  WHERE instalment_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_bsb_fee_structure_item
  ON public.billing_student_bills (student_id, fee_structure_item_id)
  WHERE fee_structure_item_id IS NOT NULL;

-- ===========================================================================
-- HR Payroll — per-employee salary (2026-08-21)
-- Source: 20260821191000_hr_staff_salaries.sql
--         20260821211000_hr_staff_salaries_superseded_by_deferrable.sql
-- ===========================================================================
-- Flat monthly figure, NOT split into hr_pay_components and NOT stored on
-- hr_pay_scales: that table is keyed on designation/cadre and answers "what
-- does an Assistant Professor Grade I earn", while this answers "what does
-- NOT100 earn". See the migration header for the full reasoning.

CREATE TABLE IF NOT EXISTS public.hr_staff_salaries (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id               uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  hr_organization_id     uuid NOT NULL REFERENCES public.hr_organizations(id),
  salary_structure       text NOT NULL DEFAULT 'Monthly'
                           CHECK (salary_structure IN ('Monthly','Weekly','Daily','Hourly')),
  monthly_gross          numeric(12,2) NOT NULL CHECK (monthly_gross > 0),
  annual_gross           numeric(14,2) GENERATED ALWAYS AS (monthly_gross * 12) STORED,
  overtime_level         text NOT NULL DEFAULT 'No overtime'
                           CHECK (overtime_level IN ('No overtime','Grade','Employee')),
  overtime_amount        numeric(12,2) NOT NULL DEFAULT 0 CHECK (overtime_amount >= 0),
  eligible_for_pf        boolean NOT NULL DEFAULT false,
  exempt_edli            boolean NOT NULL DEFAULT false,
  eligible_for_insurance boolean NOT NULL DEFAULT false,
  eligible_for_gratuity  boolean NOT NULL DEFAULT false,
  eligible_for_etf       boolean NOT NULL DEFAULT false,
  -- Statutory contributions as a FLAT MONTHLY RUPEE FIGURE per person, added
  -- 2026-09-01. Not a rate and not an employee/employer split: the register
  -- deducts exactly what is stored, in full, even in a month with unpaid days.
  -- eligible_for_pf is labelled "EPF" in the UI — same scheme, one flag.
  epf_amount             numeric(12,2) NOT NULL DEFAULT 0 CHECK (epf_amount >= 0),
  eligible_for_esi       boolean NOT NULL DEFAULT false,
  esi_amount             numeric(12,2) NOT NULL DEFAULT 0 CHECK (esi_amount >= 0),
  -- Paid on top of the gross (2026-09-02). Counts toward earnings and is
  -- pro-rated with them, but is NEVER part of the TDS base.
  allowance_amount       numeric(12,2) NOT NULL DEFAULT 0 CHECK (allowance_amount >= 0),
  allowance_label        text,
  effective_from         date NOT NULL,
  -- DEFERRABLE is load-bearing, not stylistic: fn_hr_set_staff_salary points
  -- the incumbent at a row it inserts one statement later, and that order is
  -- forced by the partial unique index below, which cannot be deferred.
  superseded_by          uuid REFERENCES public.hr_staff_salaries(id)
                           DEFERRABLE INITIALLY DEFERRED,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid,
  updated_by             uuid
);

-- One CURRENT salary per person. Partial, so superseded history is unbounded
-- while "what does this person earn" stays answerable.
CREATE UNIQUE INDEX IF NOT EXISTS hr_staff_salaries_one_current
  ON public.hr_staff_salaries (staff_id)
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS hr_staff_salaries_org_idx
  ON public.hr_staff_salaries (hr_organization_id);
CREATE INDEX IF NOT EXISTS hr_staff_salaries_effective_idx
  ON public.hr_staff_salaries (staff_id, effective_from DESC);

-- ===========================================================================
-- hr_tds_slabs (2026-09-02)
-- Source: 20260902100000_hr_tds_slabs_and_allowance.sql
--
-- Monthly-gross bands with a FLAT rate: a salary inside a band is taxed at that
-- band's percentage of its WHOLE monthly gross, and a salary outside every band
-- is not taxed at all. Not the statutory progressive calculation -- that lives
-- (dead) in deduction-engine.ts against platform_policies 'hr.payroll.tds_slabs'.
--
-- NO institution_id, on purpose. Income tax is national, and leaving it out
-- keeps the EXCLUDE below a pure range overlap, which plain GiST handles -- an
-- equality column would need btree_gist, which is not installed.
--
-- BOUNDS ARE [min, max). Bands written the way people say them ("1,06,250 to
-- 2,00,000", next starting at 2,00,001) leave 2,00,000.50 matching nothing.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.hr_tds_slabs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_monthly_gross numeric(12,2) NOT NULL CHECK (min_monthly_gross >= 0),
  -- NULL = open-ended top band. Exactly one row must be, whenever any exist.
  max_monthly_gross numeric(12,2),
  rate_pct          numeric(5,2)  NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 100),
  label             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,
  CONSTRAINT hr_tds_slabs_max_above_min
    CHECK (max_monthly_gross IS NULL OR max_monthly_gross > min_monthly_gross),
  -- Two bands may not both claim the same rupee; without this the band that wins
  -- a lookup is whichever the planner returns first.
  CONSTRAINT hr_tds_slabs_no_overlap EXCLUDE USING gist (
    numrange(min_monthly_gross, max_monthly_gross, '[)') WITH &&
  )
);

-- Set-level rules a per-row CHECK cannot express (exactly one open-ended band,
-- no gaps) live in hr_tds_slabs_validate_set() -- see 02_functions.sql -- fired
-- by a DEFERRABLE INITIALLY DEFERRED constraint trigger so a multi-row edit is
-- judged once, at COMMIT.

DROP TRIGGER IF EXISTS trg_hr_staff_salaries_updated_at ON public.hr_staff_salaries;
CREATE TRIGGER trg_hr_staff_salaries_updated_at
  BEFORE UPDATE ON public.hr_staff_salaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===========================================================================
-- hr_staff_bank_accounts (2026-08-21)
-- Source: 20260821240000_hr_staff_bank_accounts.sql
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.hr_staff_bank_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id            uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,

  -- As printed by the BANK, which is frequently not the name HR holds
  -- (initials expanded, married name, order reversed). A transfer is rejected
  -- on a name mismatch, so this is captured rather than derived from staff.
  account_holder_name text NOT NULL CHECK (length(trim(account_holder_name)) > 0),

  -- Digits only. Stored as text: an account number is an identifier, not a
  -- quantity -- numeric would eat leading zeros and overflow on longer numbers.
  account_number      text NOT NULL CHECK (account_number ~ '^[0-9]{6,20}$'),

  -- Indian IFSC: 4 letters, then a literal 0, then 6 alphanumerics.
  -- OPTIONAL since 2026-09-02 (20261020000000): the account number alone is
  -- enough to record a row, because salary registers arrive with nothing else.
  -- A PRESENT value is still format-checked -- absent means "not known yet",
  -- malformed means "confidently wrong", and only the latter pays a wrong branch.
  -- A row with no IFSC is RECORDED BUT NOT PAYABLE; any payout or bank-file
  -- query must filter on ifsc_code IS NOT NULL.
  ifsc_code           text CONSTRAINT hr_staff_bank_accounts_ifsc_format
                        CHECK (ifsc_code IS NULL OR ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),

  bank_name           text CONSTRAINT hr_staff_bank_accounts_bank_name_nonblank
                        CHECK (bank_name IS NULL OR length(trim(bank_name)) > 0),
  branch_name         text,
  account_type        text NOT NULL DEFAULT 'savings'
                        CHECK (account_type IN ('savings', 'current')),

  -- "Somebody checked this against a passbook or cancelled cheque."
  -- A wrong IFSC or account number does not raise an error -- it silently pays
  -- the wrong person -- so the distinction between entered and verified is the
  -- only thing standing between a typo and a misdirected salary.
  verified_at         timestamptz,
  verified_by         uuid,

  effective_from      date NOT NULL DEFAULT CURRENT_DATE,
  -- Set when a later row replaces this one. NULL = the account in use.
  superseded_by       uuid REFERENCES public.hr_staff_bank_accounts(id)
                        DEFERRABLE INITIALLY DEFERRED,
  notes               text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  updated_by          uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_staff_bank_accounts_one_current
  ON public.hr_staff_bank_accounts (staff_id)
  WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS hr_staff_bank_accounts_staff_idx
  ON public.hr_staff_bank_accounts (staff_id, effective_from DESC);

DROP TRIGGER IF EXISTS trg_hr_staff_bank_accounts_updated_at ON public.hr_staff_bank_accounts;
CREATE TRIGGER trg_hr_staff_bank_accounts_updated_at
  BEFORE UPDATE ON public.hr_staff_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- 2026-08-22 — One bill per fee, with an instalment schedule inside it
-- Applied by: 20260822090000_billing_bill_instalments.sql
-- ============================================================================
-- SUPERSEDES the split-into-N-bills behaviour of 20260821190000. A fee split
-- 30/40/30 is ONE debt collectable in three tranches, not three debts — the old
-- model turned three fee items into five bills and made the cashier choose
-- which instalment a payment was for, when 1,735 bills were already being paid
-- partially.
--
-- Allocation of money to tranches is DERIVED, never stored: see
-- billing_bill_instalment_state() and vw_bill_instalment_state.

CREATE TABLE IF NOT EXISTS public.billing_bill_instalments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     uuid NOT NULL
    REFERENCES public.billing_student_bills(id) ON DELETE CASCADE,
  sequence_no smallint NOT NULL CHECK (sequence_no >= 1),
  amount      numeric(15,2) NOT NULL CHECK (amount > 0),
  due_date    date NOT NULL,
  -- Lifecycle status reaching this tranche promotes the learner to.
  promotes_to_status_code text,
  -- Provenance: which fee-structure schedule line produced this tranche.
  -- ON DELETE SET NULL — deleting a structure line must never delete history.
  fee_structure_item_schedule_id uuid
    REFERENCES public.admission_fee_structure_item_schedules(id) ON DELETE SET NULL,
  label      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_bbi_bill_sequence UNIQUE (bill_id, sequence_no)
);

-- The waterfall orders by (due_date, sequence_no) — money settles the oldest
-- debt first, so allocation follows the calendar and not the sequence number.
CREATE INDEX IF NOT EXISTS ix_bbi_bill_due
  ON public.billing_bill_instalments (bill_id, due_date, sequence_no);

-- ===========================================================================
-- hr_attendance_periods + hr_attendance_period_summaries (2026-08-22)
-- Source: 20260822010000_hr_attendance_periods_and_summaries.sql
-- ===========================================================================
-- CLOSING THE ATTENDANCE MONTH. One row per (institution, year, month).
--
-- WHY NOT hr_payroll_periods
-- --------------------------
-- That table already has a `locked` status, and reusing it was the obvious
-- move. It is the wrong shape for two reasons:
--
--   1. ITS LOCK IS AT THE WRONG END OF THE PIPELINE. `locked` is the FINAL
--      stage, reached only after `distributed` -- payslips are generated and
--      handed out, THEN the month locks. Freezing attendance has to happen
--      BEFORE payroll reads the day counts, not after.
--   2. IT CARRIES A FIVE-SIGNATURE CHAIN (CAO, Accounts, Chairperson,
--      Director) because it authorises MONEY. Closing attendance is one HR
--      Head action. Putting it behind the payroll chain would mean nobody can
--      close a month until the Chairperson has signed something unrelated.
--
-- hr_payroll_periods is also scoped by hr_organization_id and engine_type. An
-- attendance month is neither -- it is simply an institution and a month.
--
-- TWO STATES, NOT MORE. open -> locked. A 'processing' state was considered
-- and dropped: computing the summaries and locking are one action, and a
-- transient state that nothing can be done in is just a way to get stuck.

CREATE TABLE IF NOT EXISTS public.hr_attendance_periods (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id     uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  period_year        integer NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  period_month       integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),

  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked')),

  locked_at          timestamptz,
  locked_by          uuid,
  -- Set when the lock was taken with pending requests still outstanding. Those
  -- requests are auto-rejected with a stamped reason rather than left in limbo,
  -- so this flag marks a month whose close involved a judgement call.
  forced             boolean NOT NULL DEFAULT false,
  force_reason       text,

  reopened_at        timestamptz,
  reopened_by        uuid,
  reopen_reason      text,

  -- Frozen at lock time. NOT recomputed on read: the whole point is that a
  -- payslip generated against this month can be reconciled later even after
  -- shift timings or holidays are edited.
  working_days_count integer,
  staff_count        integer,

  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid,
  updated_by         uuid,

  CONSTRAINT hr_attendance_periods_unique UNIQUE (institution_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS hr_attendance_periods_lookup_idx
  ON public.hr_attendance_periods (period_year, period_month, status);

DROP TRIGGER IF EXISTS trg_hr_attendance_periods_updated_at ON public.hr_attendance_periods;
CREATE TRIGGER trg_hr_attendance_periods_updated_at
  BEFORE UPDATE ON public.hr_attendance_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- The frozen day counts, one row per (period, staff member).
--
-- DERIVED FROM hr_attendance_records, NOT FROM A CALENDAR RULE. The evaluator
-- already writes WEEKLY_OFF from hr_shift_timings, so working days are simply
-- "days that are neither a weekly off nor a holiday". Recomputing them from
-- "calendar minus Sundays" -- which is what fn_prepare_payroll_period does --
-- would be a THIRD independent definition of a working day, and it is already
-- wrong: Saturday is a working day at all 14 institutions, and that same
-- assumption left every Saturday uncharged in the leave engine until it was
-- fixed on 2026-08-20.
CREATE TABLE IF NOT EXISTS public.hr_attendance_period_summaries (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id              uuid NOT NULL REFERENCES public.hr_attendance_periods(id) ON DELETE CASCADE,
  staff_id               uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,

  -- numeric(5,1) throughout: a half day is 0.5, and an integer column would
  -- silently round it into a full day of pay.
  working_days           numeric(5,1) NOT NULL DEFAULT 0,
  present_days           numeric(5,1) NOT NULL DEFAULT 0,
  half_days              integer      NOT NULL DEFAULT 0,
  absent_days            numeric(5,1) NOT NULL DEFAULT 0,
  weekly_off_days        integer      NOT NULL DEFAULT 0,
  holiday_days           integer      NOT NULL DEFAULT 0,
  leave_days             numeric(5,1) NOT NULL DEFAULT 0,
  on_duty_days           numeric(5,1) NOT NULL DEFAULT 0,
  comp_off_days          numeric(5,1) NOT NULL DEFAULT 0,

  -- Loss of pay: working days neither attended nor covered by an approved
  -- absence. This is the number payroll prorates on.
  lop_days               numeric(5,1) NOT NULL DEFAULT 0,
  payable_days           numeric(5,1) NOT NULL DEFAULT 0,

  -- {"CL": 2, "ML": 1} -- per leave-type code, so a payslip can print "CL 2"
  -- rather than a pooled "leave 3" that cannot distinguish paid from unpaid.
  leave_by_type          jsonb        NOT NULL DEFAULT '{}'::jsonb,

  short_time_off_minutes integer      NOT NULL DEFAULT 0,
  late_minutes           integer      NOT NULL DEFAULT 0,
  excused_minutes        integer      NOT NULL DEFAULT 0,

  -- Days the evaluator could not judge at lock time. Kept because a payslip
  -- built on top of unresolved days should say so.
  unprocessed_days       integer      NOT NULL DEFAULT 0,

  computed_at            timestamptz  NOT NULL DEFAULT now(),

  -- Added 2026-09-04 (20260904120000_hr_work_patterns.sql).
  scheduled_days         numeric(5,1),
  work_pattern_id        uuid REFERENCES public.hr_work_patterns(id) ON DELETE SET NULL,

  CONSTRAINT hr_attendance_period_summaries_unique UNIQUE (period_id, staff_id)
);

COMMENT ON COLUMN public.hr_attendance_period_summaries.scheduled_days IS
  'Days the shift-timing resolver expected this person to work in the month (pattern-aware, full month, holidays removed). NULL on periods closed before 2026-09.';
COMMENT ON COLUMN public.hr_attendance_period_summaries.work_pattern_id IS
  'The work pattern held on any day of the month (most recent if several). When set, the salary register divides by scheduled_days instead of the period standard.';

CREATE INDEX IF NOT EXISTS hr_attendance_period_summaries_staff_idx
  ON public.hr_attendance_period_summaries (staff_id);


-- ===========================================================================
-- hr_attendance_periods: force override removed (2026-08-22)
-- Source: 20260822070000_hr_attendance_close_remove_force_override.sql
-- ===========================================================================
-- Resolving every request before closing is compulsory, so nothing can set
-- these two any more. Dropped rather than left unwritable.
ALTER TABLE public.hr_attendance_periods
  DROP COLUMN IF EXISTS forced,
  DROP COLUMN IF EXISTS force_reason;


-- ── Receipt cancellation approval flows (20260825160000) ──────────────────
-- Who decides a receipt-cancellation request. institution_id NULL = the
-- group-wide default; a row for a specific institution overrides it. No
-- active flow at all means super-admin-only, the pre-2026-08-25 behaviour.
CREATE TABLE IF NOT EXISTS public.billing_receipt_cancel_approval_flows (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = group-wide default. A row for a specific institution wins over it.
  institution_id    uuid REFERENCES public.institutions(id) ON DELETE CASCADE,
  flow_name         text NOT NULL,
  -- role_key, not custom_roles.id: it is unique, it is what profiles.role
  -- stores, and it keeps the row readable. ON UPDATE CASCADE so renaming a
  -- role cannot silently orphan a flow.
  approver_role_key text REFERENCES public.custom_roles(role_key)
                         ON UPDATE CASCADE ON DELETE RESTRICT,
  approver_user_id  uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.profiles(id),
  updated_by        uuid REFERENCES public.profiles(id),
  CONSTRAINT billing_receipt_cancel_flow_one_approver CHECK (
    (approver_role_key IS NOT NULL)::int + (approver_user_id IS NOT NULL)::int = 1
  )
);

COMMENT ON TABLE public.billing_receipt_cancel_approval_flows IS
  'Who may decide a receipt-cancellation request. One active flow per institution, plus an optional group-wide default. No flow = super admin only.';

-- At most one active flow per institution, and at most one active group-wide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_receipt_cancel_flow_active_institution
  ON public.billing_receipt_cancel_approval_flows (institution_id)
  WHERE is_active AND institution_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_receipt_cancel_flow_active_global
  ON public.billing_receipt_cancel_approval_flows ((institution_id IS NULL))
  WHERE is_active AND institution_id IS NULL;

-- =====================================================
-- 20260827100000: Housekeeping booking assignment
-- (Base table hostel_cleaning_bookings + its 5 RPCs were created in
--  migrations 20260610190000 / 20260825120000 and were never mirrored
--  here — see those files for the full DDL. This block is the
--  assignment-flow delta.)
-- =====================================================

ALTER TABLE public.hostel_cleaning_bookings
  ADD COLUMN IF NOT EXISTS assigned_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_staff_name text,
  ADD COLUMN IF NOT EXISTS assigned_at         timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_by         uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_bookings_assigned_profile
  ON public.hostel_cleaning_bookings (assigned_profile_id);
CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_bookings_assigned_by
  ON public.hostel_cleaning_bookings (assigned_by);

-- status gains 'assigned' (booked → assigned → completed/no_show)
ALTER TABLE public.hostel_cleaning_bookings
  DROP CONSTRAINT IF EXISTS hostel_cleaning_bookings_status_check;
ALTER TABLE public.hostel_cleaning_bookings
  ADD CONSTRAINT hostel_cleaning_bookings_status_check
  CHECK (status IN ('booked','assigned','completed','cancelled','no_show'));

-- 'assigned' is still a LIVE booking for the room+slot
DROP INDEX IF EXISTS public.hostel_cleaning_bookings_room_slot_uq;
CREATE UNIQUE INDEX hostel_cleaning_bookings_room_slot_uq
  ON public.hostel_cleaning_bookings (room_id, booking_date, slot_start)
  WHERE status IN ('booked','assigned');

-- =============================================================================
-- Mirrored from supabase/migrations/20260827160000_hr_comp_off_claim_documents.sql
-- =============================================================================

ALTER TABLE public.hr_comp_off_credits
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.hr_comp_off_credits.documents IS
  'Supporting documents (LeaveDocument[] shape, Google Drive-backed) attached when the credit was claimed. Empty array for hr_grant/attendance sources.';

-- =============================================================================
-- Mirrored from supabase/migrations/20260827170000_hr_attendance_regularizations_staff_rewire.sql
-- (FK half; the SELECT/INSERT policies are mirrored in 03_policies.sql)
-- =============================================================================

ALTER TABLE public.hr_attendance_regularizations
  DROP CONSTRAINT IF EXISTS hr_attendance_regularizations_employee_id_fkey;
ALTER TABLE public.hr_attendance_regularizations
  ADD CONSTRAINT hr_attendance_regularizations_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.staff(id);

-- =============================================================================
-- Mirrored from supabase/migrations/20260827210000_employment_categories_included_in_hr.sql (column)
-- =============================================================================

ALTER TABLE public.employment_categories
  ADD COLUMN IF NOT EXISTS included_in_hr boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.employment_categories.included_in_hr IS
  'Staff in this category participate in the HR module (attendance, leave, comp off, payroll, biometric import). Off = they never appear in HR and cannot raise HR requests; existing records are kept, not deleted.';

-- =============================================================================
-- Mirrored from supabase/migrations/20260828120000_staff_id_standardisation_primitives.sql
-- and 20260828130000_staff_id_backfill.sql (tables and columns)
-- =============================================================================

-- Institution code that staff IDs are generated from. Unique: two institutions
-- sharing a prefix would interleave into one number line.
ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS staff_code_prefix text;

ALTER TABLE public.institutions
  ADD CONSTRAINT institutions_staff_code_prefix_chk
  CHECK (staff_code_prefix ~ '^[A-Z]{2,8}$');

CREATE UNIQUE INDEX IF NOT EXISTS institutions_staff_code_prefix_uq
  ON public.institutions (staff_code_prefix)
  WHERE staff_code_prefix IS NOT NULL;

COMMENT ON COLUMN public.institutions.staff_code_prefix IS
  'Institution code used to generate staff IDs (DCH -> DCH001 teaching, NOTDCH001 non-teaching). Changing it does NOT rewrite codes already issued - those are permanent - so a later edit only affects staff created afterwards.';

-- The hand-entered code each person held before the 2026-08-28 renumbering.
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS legacy_staff_id text;

CREATE INDEX IF NOT EXISTS idx_staff_legacy_staff_id
  ON public.staff (legacy_staff_id)
  WHERE legacy_staff_id IS NOT NULL;

COMMENT ON COLUMN public.staff.legacy_staff_id IS
  'The hand-entered staff_id this person held before the 2026-08-28 standardisation. Searchable so an old code still finds the right person. Never written by the app.';

CREATE TABLE IF NOT EXISTS public.staff_id_counters (
  institution_id uuid        NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  is_teaching    boolean     NOT NULL,
  next_seq       integer     NOT NULL DEFAULT 1 CHECK (next_seq > 0),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_id, is_teaching)
);

COMMENT ON TABLE public.staff_id_counters IS
  'Next sequence number per institution x teaching bucket for staff ID generation. Written only by fn_next_staff_code (SECURITY DEFINER); there is no policy granting any user a direct write.';

-- Deliberately no FK to staff: deleting a staff row must not erase the record
-- of what their code used to be.
CREATE TABLE IF NOT EXISTS public.staff_id_crosswalk (
  staff_uuid       uuid PRIMARY KEY,
  full_name        text,
  institution_name text,
  is_teaching      boolean,
  is_active        boolean,
  old_staff_id     text,
  new_staff_id     text,
  migrated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.staff_id_crosswalk IS
  'Old -> new staff ID mapping from the 2026-08-28 standardisation. Read via v_staff_id_crosswalk.';

-- =============================================================================
-- Mirrored from supabase/migrations/20260828140000_staff_address_standardisation.sql
-- and 20260828150000_custom_roles_is_privileged.sql
-- =============================================================================

-- Pre-image of staff.state / staff.district before they were standardised onto
-- the lib/data/locations.ts vocabulary.
CREATE TABLE IF NOT EXISTS public.staff_address_backfill_20260828 AS
SELECT id, staff_id, first_name, last_name, state AS old_state, district AS old_district, address
FROM public.staff;

-- Which roles only a super admin may assign to a staff member. A new flag is
-- needed because is_system_role is true for nearly every role (driver, guest
-- and mess_caterer included) and so discriminates nothing.
ALTER TABLE public.custom_roles
  ADD COLUMN IF NOT EXISTS is_privileged boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.custom_roles.is_privileged IS
  'Role can grant/alter permissions or administer the platform. Only super admins may assign it to a staff member (enforced by trg_staff_guard_role_key). Maintained in Role Management.';

-- =============================================================================
-- Mirrored from supabase/migrations/20260830150000_hr_salary_register.sql
-- and 20260830150001_hr_salary_register_superseded_at.sql
-- =============================================================================

-- The FROZEN monthly salary register, per PAYER organisation. Computed from a
-- closed attendance month (hr_attendance_period_summaries) plus the recorded
-- salary (hr_staff_salaries.monthly_gross), and exported as the register HR
-- keeps by hand.
--
-- NOT hr_payroll_periods / hr_payslips. That pair carries a five-signature
-- approval chain plus a pay-scale matrix and PF/ESI/TDS policies that this
-- register does not use; it has never been run (0 rows) because its generator
-- still stubs LOP at 0 and reads hr_pay_scales, which is empty.
--
-- The roster follows hr_staff_payroll (WHO PAYS), not staff.institution_id
-- (WHERE SOMEONE WORKS) — they differ for 36 active staff — so one register can
-- depend on several closed months, hence the array of source period ids.
CREATE TABLE IF NOT EXISTS public.hr_salary_register_runs (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_organization_id           uuid NOT NULL REFERENCES public.hr_organizations(id) ON DELETE RESTRICT,
  institution_id               uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  period_year                  integer NOT NULL,
  period_month                 integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  working_days_basis           numeric(5,1) NOT NULL CHECK (working_days_basis > 0),
  source_attendance_period_ids uuid[] NOT NULL DEFAULT '{}',
  staff_total                  integer NOT NULL DEFAULT 0,
  included_count               integer NOT NULL DEFAULT 0,
  excluded_count               integer NOT NULL DEFAULT 0,
  total_gross                  numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions             numeric(14,2) NOT NULL DEFAULT 0,
  total_net                    numeric(14,2) NOT NULL DEFAULT 0,
  generated_at                 timestamptz NOT NULL DEFAULT now(),
  generated_by                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Liveness is superseded_at, NOT superseded_by. The forward pointer is an FK
  -- to the successor, which cannot exist yet when the previous run has to give
  -- up the unique slot; superseded_at needs no FK and so can be set first.
  superseded_at                timestamptz,
  superseded_by                uuid REFERENCES public.hr_salary_register_runs(id) ON DELETE SET NULL,
  notes                        text,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_salary_register_runs_live
  ON public.hr_salary_register_runs (hr_organization_id, period_year, period_month)
  WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_salary_register_runs_institution
  ON public.hr_salary_register_runs (institution_id);
CREATE INDEX IF NOT EXISTS idx_hr_salary_register_runs_org
  ON public.hr_salary_register_runs (hr_organization_id);
CREATE INDEX IF NOT EXISTS idx_hr_salary_register_runs_period
  ON public.hr_salary_register_runs (period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_hr_salary_register_runs_superseded_by
  ON public.hr_salary_register_runs (superseded_by);

-- One row per roster member, INCLUDED OR NOT. Excluded people stay on the
-- register so "who did we not pay, and why" is answerable; dropping them would
-- make the gap invisible. Identity and figures are snapshotted so a later
-- transfer or rename cannot rewrite an issued register.
CREATE TABLE IF NOT EXISTS public.hr_salary_register_lines (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                 uuid NOT NULL REFERENCES public.hr_salary_register_runs(id) ON DELETE CASCADE,
  staff_id               uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  serial_no              integer NOT NULL,
  employee_code          text,
  staff_name             text NOT NULL,
  designation            text,
  department_name        text,
  date_of_joining        date,
  bank_account_number    text,
  -- unpaid_leave_days is the month MINUS paid days, not the summary's lop_days:
  -- a mid-month joiner has no records before their start date, so lop_days is 0
  -- and paying on it would hand them a full month's gross for half a month.
  business_working_days  numeric(5,1) NOT NULL DEFAULT 0,
  paid_leave_days        numeric(5,1) NOT NULL DEFAULT 0,
  unpaid_leave_days      numeric(5,1) NOT NULL DEFAULT 0,
  on_duty_days           numeric(5,1) NOT NULL DEFAULT 0,
  worked_days            numeric(5,1) NOT NULL DEFAULT 0,
  paid_days              numeric(5,1) NOT NULL DEFAULT 0,
  actual_gross           numeric(12,2) NOT NULL DEFAULT 0,
  basic_pay              numeric(12,2) NOT NULL DEFAULT 0,
  allowance              numeric(12,2) NOT NULL DEFAULT 0,
  unpaid_leave_deduction numeric(12,2) NOT NULL DEFAULT 0,
  -- Broken out of total_deductions (which still carries them) so a PF/ESI
  -- return can be read straight off the register. Added 2026-09-01.
  epf_deduction          numeric(12,2) NOT NULL DEFAULT 0,
  esi_deduction          numeric(12,2) NOT NULL DEFAULT 0,
  -- Resolved from hr_tds_slabs against the monthly gross ALONE and
  -- snapshotted, so an issued register stays explicable after a band is
  -- edited -- which is why the bands need no effective-dating.
  tds_deduction          numeric(12,2) NOT NULL DEFAULT 0,
  total_earnings         numeric(12,2) NOT NULL DEFAULT 0,
  total_deductions       numeric(12,2) NOT NULL DEFAULT 0,
  -- A prior-month recovery the formula cannot produce. SUBTRACTED from net pay.
  adjustment_amount      numeric(12,2) NOT NULL DEFAULT 0,
  net_pay                numeric(12,2) NOT NULL DEFAULT 0,
  remarks                text,
  is_included            boolean NOT NULL DEFAULT true,
  exclusion_reason       text,
  attendance_period_id   uuid REFERENCES public.hr_attendance_periods(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_hr_salary_register_lines_run_staff UNIQUE (run_id, staff_id),
  CONSTRAINT ck_hr_salary_register_lines_exclusion
    CHECK ((is_included AND exclusion_reason IS NULL)
        OR (NOT is_included AND exclusion_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_hr_salary_register_lines_run
  ON public.hr_salary_register_lines (run_id);
CREATE INDEX IF NOT EXISTS idx_hr_salary_register_lines_staff
  ON public.hr_salary_register_lines (staff_id);
CREATE INDEX IF NOT EXISTS idx_hr_salary_register_lines_period
  ON public.hr_salary_register_lines (attendance_period_id);

-- =============================================================================
-- Mirrored from supabase/migrations/20260830160000_hr_salary_register_work_institution_scope.sql
-- =============================================================================

-- The register is grouped by WORK LOCATION (staff.institution_id), not by payer.
-- Payer scoping shipped first and failed on contact: Main Office is a real
-- workplace with 121 staff that pays NOBODY (is_payroll_entity = false, zero
-- rows in hr_staff_payroll), so it could never have a register, and 105 active
-- staff have no payer recorded and so landed on no register at all.
--
-- WHO PAYS is now an attribute of the row, plus per-payer subtotals in the
-- export — so one Main Office register answers "what does each institution owe
-- for the people working here", which could not be asked while the roster
-- itself was split five ways.
ALTER TABLE public.hr_salary_register_lines
  ADD COLUMN IF NOT EXISTS paid_by_organization_id uuid REFERENCES public.hr_organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_by_name text;

CREATE INDEX IF NOT EXISTS idx_hr_salary_register_lines_paid_by
  ON public.hr_salary_register_lines (paid_by_organization_id);

-- A run is unique per WORK INSTITUTION and month. hr_organization_id is kept
-- (NOT NULL, 1:1 with institution) but is no longer the identity.
DROP INDEX IF EXISTS public.uq_hr_salary_register_runs_live;
CREATE UNIQUE INDEX uq_hr_salary_register_runs_live
  ON public.hr_salary_register_runs (institution_id, period_year, period_month)
  WHERE superseded_at IS NULL;

-- ============================================================================
-- 2026-08-31 — leave approval flows: parallel/sequential, ladder
-- Migration: 20260831120000_hr_leave_approval_flow_parallel_ladder.sql
-- Applied AFTER the hr_approval_flows definition above; defaults reproduce the
-- pre-existing behaviour for all 63 rows (23 leave + 40 recruitment).
-- ============================================================================
ALTER TABLE public.hr_approval_flows
  ADD COLUMN IF NOT EXISTS step_source text NOT NULL DEFAULT 'explicit',
  ADD COLUMN IF NOT EXISTS run_mode text NOT NULL DEFAULT 'sequential',
  ADD COLUMN IF NOT EXISTS role_ladder jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fallback_approver jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_approval_flows_step_source_check') THEN
    ALTER TABLE public.hr_approval_flows ADD CONSTRAINT hr_approval_flows_step_source_check
      CHECK (step_source IN ('explicit', 'role_ladder'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_approval_flows_run_mode_check') THEN
    ALTER TABLE public.hr_approval_flows ADD CONSTRAINT hr_approval_flows_run_mode_check
      CHECK (run_mode IN ('sequential', 'parallel'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_approval_flows_ladder_check') THEN
    ALTER TABLE public.hr_approval_flows ADD CONSTRAINT hr_approval_flows_ladder_check
      CHECK (step_source <> 'role_ladder'
             OR (jsonb_typeof(role_ladder) = 'array' AND jsonb_array_length(role_ladder) > 0));
  END IF;
END $$;

-- ============================================================================
-- Bill cancellation audit (mig 20260901010000_billing_bill_cancellations).
-- One row per cancelled bill, holding the reason, the reason code, the
-- supporting documents and a frozen snapshot of the bill. Written ONLY by
-- fn_cancel_student_bill; RLS below is SELECT-only so the trail cannot be
-- edited by whoever it incriminates.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.billing_bill_cancellations (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id                     uuid NOT NULL
                              REFERENCES public.billing_student_bills(id) ON DELETE CASCADE,
  institution_id              uuid NOT NULL,
  student_id                  uuid NOT NULL,
  reason_code                 text NOT NULL
                              CHECK (reason_code IN ('duplicate_bill','raised_in_error','fee_waived',
                                                     'learner_withdrawn','structure_corrected','other')),
  reason                      text NOT NULL,
  attachments                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  bill_snapshot               jsonb NOT NULL DEFAULT '{}'::jsonb,
  amount_cancelled            numeric NOT NULL,
  cancelled_by                uuid,
  cancelled_by_name           text,
  cancelled_by_email          text,
  cancelled_by_role           text,
  cancelled_by_is_super_admin boolean,
  cancelled_at                timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_cancellation_per_bill
  ON public.billing_bill_cancellations (bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_cancellations_student
  ON public.billing_bill_cancellations (student_id, cancelled_at DESC);
CREATE INDEX IF NOT EXISTS idx_bill_cancellations_institution
  ON public.billing_bill_cancellations (institution_id, cancelled_at DESC);

REVOKE ALL ON TABLE public.billing_bill_cancellations FROM anon, PUBLIC;
ALTER TABLE public.billing_bill_cancellations ENABLE ROW LEVEL SECURITY;


-- ── Event feedback forms (coordinator-editable questions per event) ──
-- Migration: supabase/migrations/event_feedback_forms.sql
-- ============================================================================
-- Event Feedback Forms — coordinator-editable feedback questions per event
-- ============================================================================
-- Every event (general, tournament, marathon, induction) may carry one or more
-- FEEDBACK forms whose questions the event coordinator writes and rewrites at
-- will. Structurally this is the registration form builder again
-- (form -> sections -> questions, answers in jsonb keyed by a stable key), and
-- it deliberately copies that pattern rather than sharing its tables.
--
-- WHY NOT reuse event_registration_form* with a `purpose` discriminator:
--   listForms(), the /p/event/[id]/register public route, the fee columns
--   (fee_enabled/fee_amount) and the responses viewer all read those tables
--   UNFILTERED. A feedback row added there surfaces as a registration form on
--   the event console and inherits a payment model that makes no sense for a
--   survey. Independent tables also match the precedent already recorded in
--   event-registration-form-service.ts ("independent tables, not shared with
--   Admission — design decision #6").
--
-- WHO MAY ANSWER: registered participants only. A response therefore keys on
-- events_registrations.id, NOT on a profile: events_registrations holds
-- participant_type='external' rows (marathon runners, outside guests) that have
-- no auth.users account at all, so the registration row is the only identity
-- that exists for every respondent across all four event types. It doubles as
-- the dedup key — UNIQUE (form_id, registration_id) is one response per
-- participant per form, enforced by the database rather than by the UI.
--
-- WHO MAY EDIT: super admin / admin / fn_is_event_incharge(event_id) — the
-- existing "event coordinator" primitive that reads events.config->'incharges'
-- — or events.view holders with institution access. Same OR-chain the
-- event_registration_form*_manage policies already use, reused verbatim so the
-- two builders can never drift apart on who is allowed to touch them.
-- ============================================================================

-- ── event_feedback_forms ────────────────────────────────────────────────────
-- An event holds MANY feedback forms on purpose (a 3-day conference wants one
-- per day; a recurring event wants one per run). Each is addressed by
-- (event_id, slug) so an old link keeps resolving to the run it belonged to.
-- There is deliberately NO unique on event_id alone.
CREATE TABLE IF NOT EXISTS public.event_feedback_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Event Feedback',
  slug text NOT NULL,
  description text,
  -- The coordinator's manual open/closed switch. A new form starts CLOSED so
  -- creating one never begins collecting by surprise.
  is_enabled boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  -- Hides respondent identity in the coordinator's responses viewer. The
  -- registration_id is STILL stored — it has to be, or one-response-per-person
  -- cannot be enforced — so this is a presentation promise, not cryptographic
  -- anonymity. The UI says exactly that where the switch is shown, because a
  -- coordinator who believes otherwise would promise their attendees more than
  -- the system delivers.
  is_anonymous boolean NOT NULL DEFAULT false,
  -- Active window. Openness is DERIVED at read time
  -- (is_enabled AND now() within [starts_at, ends_at]) rather than by a job
  -- flipping is_enabled: a stored flag leaves an expired form collecting
  -- whenever the job fails, never reopens when the end date is extended, and
  -- makes "closed by hand" indistinguishable from "closed by time".
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, slug),
  CONSTRAINT event_feedback_forms_slug_format_check
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT event_feedback_forms_window_check
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at)
);

-- ── event_feedback_sections ─────────────────────────────────────────────────
-- event_id is denormalized onto sections and questions (not just the form) so
-- every RLS policy stays a single-join EXISTS instead of a 3-way join through
-- form_id/section_id. Same reason event_registration_form_sections does it.
CREATE TABLE IF NOT EXISTS public.event_feedback_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.event_feedback_forms(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── event_feedback_questions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_feedback_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.event_feedback_sections(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.event_feedback_forms(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- Stable answer key. Assigned from the label when a question is first saved
  -- and then NEVER changed, because event_feedback_responses.answers is keyed
  -- by it — rewording a question must not orphan the answers already given to
  -- it. Unique per FORM, not per event (an event holds many forms).
  question_key text NOT NULL,
  question_label text NOT NULL,
  -- 'rating' is the type the registration builder has no equivalent of: a 1..N
  -- star/scale answer stored as a plain integer, which is what makes a mean
  -- score computable without parsing prose. 'section_note' asks nothing and
  -- renders as read-only guidance between questions.
  question_type text NOT NULL CHECK (question_type IN (
    'rating','text','textarea','select','multi_select','radio','checkbox',
    'number','date','section_note'
  )),
  is_required boolean NOT NULL DEFAULT false,
  display_order int NOT NULL DEFAULT 0,
  placeholder text,
  help_text text,
  min_length int,
  max_length int,
  min_value numeric,
  max_value numeric,
  pattern text,
  -- [{label, value}] for select / multi_select / radio.
  options jsonb,
  -- {field, op, value} — show this question only when another question on the
  -- same form answers a certain way. Same shape as the registration builder's.
  condition jsonb,
  -- Top of the scale for a 'rating' question (5 stars, 10-point NPS-ish, …).
  -- NULL for every other type. Constrained rather than free so the responses
  -- viewer can always normalise a score to a percentage.
  rating_scale int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, question_key),
  CONSTRAINT event_feedback_questions_rating_scale_check
    CHECK (rating_scale IS NULL OR rating_scale BETWEEN 2 AND 10),
  -- A question that asks nothing can never be satisfied, so a required one
  -- would make the form permanently unsubmittable.
  CONSTRAINT event_feedback_questions_note_not_required_check
    CHECK (question_type <> 'section_note' OR is_required = false)
);

-- ── event_feedback_responses ────────────────────────────────────────────────
-- One row per (form, registration). answers is keyed by question_key, exactly
-- as events_registrations.custom_fields is keyed by field_key — which is what
-- lets save_event_feedback_form() delete and reinsert question ROWS on every
-- edit without touching a single stored answer.
CREATE TABLE IF NOT EXISTS public.event_feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.event_feedback_forms(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES public.events_registrations(id) ON DELETE CASCADE,
  -- The auth identity that submitted, when there was one. NULL for an external
  -- participant answering through their registration link — they have no
  -- profiles row. Never the dedup key; registration_id is.
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_feedback_responses_form_registration_uniq
    UNIQUE (form_id, registration_id)
);

CREATE INDEX IF NOT EXISTS idx_event_feedback_forms_event
  ON public.event_feedback_forms(event_id);
CREATE INDEX IF NOT EXISTS idx_event_feedback_sections_form
  ON public.event_feedback_sections(form_id);
CREATE INDEX IF NOT EXISTS idx_event_feedback_questions_form
  ON public.event_feedback_questions(form_id);
CREATE INDEX IF NOT EXISTS idx_event_feedback_questions_section
  ON public.event_feedback_questions(section_id);
CREATE INDEX IF NOT EXISTS idx_event_feedback_responses_form
  ON public.event_feedback_responses(form_id);
CREATE INDEX IF NOT EXISTS idx_event_feedback_responses_event
  ON public.event_feedback_responses(event_id);
CREATE INDEX IF NOT EXISTS idx_event_feedback_responses_registration
  ON public.event_feedback_responses(registration_id);



-- Updated: 2026-08-21 - AIU (Accountable AI Use) evidence trail
-- (migration 20260922041500_aiu_prompt_trails.sql — FILE ONLY / NOT APPLIED).
-- One row per AI output delivered to a learner: prompt sent, AI output AS
-- PRODUCED (immutable via trg_aiu_prompt_trails_guard), the learner's version
-- at delivery, and — closed at submission — learner_final + changed flag.
-- learner_id is profiles.id (auth.users.id), NOT learners_profiles.id.
CREATE TABLE IF NOT EXISTS public.aiu_prompt_trails (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id     uuid NOT NULL REFERENCES public.profiles(id),  -- profiles.id
  institution_id uuid,
  surface        text NOT NULL,      -- e.g. 'pde.clinical_reasoning.coach'
  prompt_sent    text NOT NULL,      -- may embed ground_truth; never echo to client
  ai_output      text NOT NULL,      -- immutable
  learner_input  text,               -- learner's version when the AI saw it
  learner_final  text,               -- write-once, closed at submission
  changed        boolean,            -- true=revised after AI, false=kept, NULL=open
  context        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aiu_prompt_trails_surface_chk CHECK (length(trim(surface)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_aiu_trails_learner_created
  ON public.aiu_prompt_trails (learner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aiu_trails_open
  ON public.aiu_prompt_trails (learner_id, surface)
  WHERE learner_final IS NULL;

-- Grants: revoke anon AND PUBLIC AND authenticated, then re-grant without
-- DELETE — an evidence table a client can delete from is not evidence.
REVOKE ALL ON TABLE public.aiu_prompt_trails FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.aiu_prompt_trails TO authenticated;
ALTER TABLE public.aiu_prompt_trails ENABLE ROW LEVEL SECURITY;
