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
    learner_id UUID
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
    pin_code VARCHAR(20)
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
-- Updated: 2026-02-01 - Added learning hours and competency coverage fields (Workshop Transformation Phase 1.5)
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID,
    course_code TEXT NOT NULL,
    course_name TEXT NOT NULL,
    -- Learning hours breakdown (added 2026-02-01)
    learning_hours_target INTEGER DEFAULT 0,
    self_study_hours INTEGER DEFAULT 0,
    practical_hours INTEGER DEFAULT 0,
    theory_hours INTEGER DEFAULT 0,
    competency_coverage JSONB DEFAULT '[]'::jsonb,
    -- Standard fields
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
    bus_required BOOLEAN DEFAULT false,
    bus_route TEXT,
    bus_pickup_location TEXT,

    -- Reference Information
    reference_type TEXT,
    reference_name TEXT,
    reference_contact TEXT,

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
    is_profile_complete BOOLEAN DEFAULT false,

    -- Capabilities and career tracking (added 2026-02-01 - Workshop Transformation Phase 1.5)
    capabilities JSONB DEFAULT '{}'::jsonb,
    career_aspirations JSONB DEFAULT '{}'::jsonb,
    industry_readiness_score NUMERIC(5,2) DEFAULT 0,
    portfolio_url TEXT,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by UUID,
    updated_by UUID
);

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
    bus_required BOOLEAN DEFAULT false,
    bus_route TEXT,
    bus_pickup_location TEXT,
    reference_type TEXT,
    reference_name TEXT,
    reference_contact TEXT,
    roll_number TEXT,
    student_photo_url TEXT,
    college_email TEXT,
    is_profile_complete BOOLEAN DEFAULT false,
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
    bus_required BOOLEAN DEFAULT false,
    bus_route TEXT,
    bus_pickup_location TEXT,
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
    department_id UUID NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by UUID,
    updated_by UUID,
    institution_email TEXT NOT NULL,
    -- Facilitator role fields (added 2026-02-01 - Workshop Transformation Phase 1.5)
    role_type VARCHAR(50) DEFAULT 'teacher',
    facilitator_certification JSONB DEFAULT '[]'::jsonb,
    outcome_metrics JSONB DEFAULT '{}'::jsonb
);

-- Employment Categories
CREATE TABLE IF NOT EXISTS public.employment_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name TEXT NOT NULL,
    description TEXT,
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
    created_from_template_id UUID
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

-- Billing Parent Categories
CREATE TABLE IF NOT EXISTS public.billing_parent_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    parent_category_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID
);

-- Billing Sub Categories
CREATE TABLE IF NOT EXISTS public.billing_sub_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    parent_category_id UUID NOT NULL,
    sub_category_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID
);

-- Billing Item Categories
CREATE TABLE IF NOT EXISTS public.billing_item_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    parent_category_id UUID NOT NULL,
    sub_category_id UUID NOT NULL,
    item_category_name VARCHAR(150) NOT NULL,
    amount NUMERIC(15,2),
    frequency VARCHAR(20) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    updated_by UUID
);

-- Billing Student Bills
CREATE TABLE IF NOT EXISTS public.billing_student_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL,
    institution_id UUID NOT NULL,
    item_category_id UUID NOT NULL,
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
-- Updated: 2026-02-01 - Added outcome-based discount fields (Workshop Transformation Phase 1.5)
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
    -- Outcome-based discount fields (added 2026-02-01)
    is_outcome_based BOOLEAN DEFAULT false,
    outcome_criteria JSONB,
    outcome_verification JSONB,
    -- Standard fields
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
CREATE TABLE IF NOT EXISTS public.bug_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'open',
    priority VARCHAR(20) DEFAULT 'medium',
    category VARCHAR(50),
    created_by UUID NOT NULL,
    assigned_to UUID,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

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
CREATE TABLE IF NOT EXISTS public.custom_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    role_name VARCHAR(50) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

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
-- SECTION 12: COMPETENCY CATALOG MODULE (NEW)
-- Created: 2026-02-01 - Workshop Transformation Phase 1.2
-- Purpose: Outcome-focused skill tracking to replace learner OKRs
-- =====================================================

-- Create competency ENUMs
DO $$ BEGIN
    CREATE TYPE competency_type AS ENUM ('technical', 'behavioral', 'domain', 'soft_skill');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE bloom_taxonomy_level AS ENUM ('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE proficiency_level AS ENUM ('novice', 'beginner', 'intermediate', 'advanced', 'expert');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- competency_catalog: Master competency/skill taxonomy
-- Updated: 2026-02-02 - Migrated from Bloom's to Fink's Taxonomy
-- bloom_taxonomy_level_deprecated: DEPRECATED (cognitive-only, AI can do this)
-- finks_dimensions: NEW STANDARD (holistic learning for AI era)
CREATE TABLE IF NOT EXISTS public.competency_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    competency_code VARCHAR(50) NOT NULL,
    competency_name VARCHAR(255) NOT NULL,
    competency_type competency_type NOT NULL DEFAULT 'technical',
    description TEXT,
    proficiency_levels JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence_requirements JSONB DEFAULT '[]'::jsonb,
    industry_tags TEXT[] DEFAULT '{}',
    bloom_taxonomy_level_deprecated bloom_taxonomy_level, -- DEPRECATED (2026-02-02): Use finks_dimensions
    finks_dimensions JSONB DEFAULT '{"foundational_knowledge":0,"application":0,"integration":0,"human_dimension":0,"caring":0,"learning_how_to_learn":0}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_competency_code_per_institution UNIQUE (institution_id, competency_code),
    CONSTRAINT check_competency_finks_range CHECK (
        (finks_dimensions->>'foundational_knowledge')::int BETWEEN 0 AND 100 AND
        (finks_dimensions->>'application')::int BETWEEN 0 AND 100 AND
        (finks_dimensions->>'integration')::int BETWEEN 0 AND 100 AND
        (finks_dimensions->>'human_dimension')::int BETWEEN 0 AND 100 AND
        (finks_dimensions->>'caring')::int BETWEEN 0 AND 100 AND
        (finks_dimensions->>'learning_how_to_learn')::int BETWEEN 0 AND 100
    )
);

-- competency_program_mapping: Links competencies to programs
CREATE TABLE IF NOT EXISTS public.competency_program_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competency_id UUID NOT NULL REFERENCES public.competency_catalog(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    required_level proficiency_level NOT NULL DEFAULT 'intermediate',
    weight_percentage NUMERIC(5,2) CHECK (weight_percentage IS NULL OR (weight_percentage >= 0 AND weight_percentage <= 100)),
    semester_expected UUID REFERENCES public.semesters(id) ON DELETE SET NULL,
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_competency_program UNIQUE (competency_id, program_id)
);

-- course_competency_mapping: Links courses to competencies
-- Updated: 2026-02-02 - Added finks_contribution for holistic assessment
CREATE TABLE IF NOT EXISTS public.course_competency_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    competency_id UUID NOT NULL REFERENCES public.competency_catalog(id) ON DELETE CASCADE,
    contribution_level proficiency_level DEFAULT 'beginner',
    learning_hours INTEGER CHECK (learning_hours IS NULL OR learning_hours >= 0),
    assessment_method VARCHAR(255),
    finks_contribution JSONB DEFAULT '{"foundational_knowledge":0,"application":0,"integration":0,"human_dimension":0,"caring":0,"learning_how_to_learn":0}'::jsonb,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_course_competency UNIQUE (course_id, competency_id),
    CONSTRAINT check_course_finks_range CHECK (
        (finks_contribution->>'foundational_knowledge')::int BETWEEN 0 AND 100 AND
        (finks_contribution->>'application')::int BETWEEN 0 AND 100 AND
        (finks_contribution->>'integration')::int BETWEEN 0 AND 100 AND
        (finks_contribution->>'human_dimension')::int BETWEEN 0 AND 100 AND
        (finks_contribution->>'caring')::int BETWEEN 0 AND 100 AND
        (finks_contribution->>'learning_how_to_learn')::int BETWEEN 0 AND 100
    )
);

-- learner_competencies: Individual learner competency tracking
-- Updated: 2026-02-02 - Added finks_dimensions for holistic progress tracking
CREATE TABLE IF NOT EXISTS public.learner_competencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    competency_id UUID NOT NULL REFERENCES public.competency_catalog(id) ON DELETE CASCADE,
    current_level proficiency_level NOT NULL DEFAULT 'novice',
    evidence JSONB DEFAULT '[]'::jsonb,
    assessments JSONB DEFAULT '[]'::jsonb,
    finks_dimensions JSONB DEFAULT '{"foundational_knowledge":0,"application":0,"integration":0,"human_dimension":0,"caring":0,"learning_how_to_learn":0}'::jsonb,
    verified_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    progress_percentage NUMERIC(5,2) DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_learner_competency UNIQUE (learner_id, competency_id),
    CONSTRAINT check_learner_finks_range CHECK (
        (finks_dimensions->>'foundational_knowledge')::int BETWEEN 0 AND 100 AND
        (finks_dimensions->>'application')::int BETWEEN 0 AND 100 AND
        (finks_dimensions->>'integration')::int BETWEEN 0 AND 100 AND
        (finks_dimensions->>'human_dimension')::int BETWEEN 0 AND 100 AND
        (finks_dimensions->>'caring')::int BETWEEN 0 AND 100 AND
        (finks_dimensions->>'learning_how_to_learn')::int BETWEEN 0 AND 100
    )
);

-- Competency module indexes
-- Updated: 2026-02-02 - Added Fink's Taxonomy GIN indexes
CREATE INDEX IF NOT EXISTS idx_competency_catalog_institution ON public.competency_catalog(institution_id);
CREATE INDEX IF NOT EXISTS idx_competency_catalog_type ON public.competency_catalog(competency_type);
CREATE INDEX IF NOT EXISTS idx_competency_catalog_active ON public.competency_catalog(institution_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_competency_catalog_industry_tags ON public.competency_catalog USING GIN(industry_tags);
CREATE INDEX IF NOT EXISTS idx_competency_finks ON public.competency_catalog USING GIN(finks_dimensions);
CREATE INDEX IF NOT EXISTS idx_learner_finks ON public.learner_competencies USING GIN(finks_dimensions);
CREATE INDEX IF NOT EXISTS idx_course_finks ON public.course_competency_mapping USING GIN(finks_contribution);
CREATE INDEX IF NOT EXISTS idx_competency_program_competency ON public.competency_program_mapping(competency_id);
CREATE INDEX IF NOT EXISTS idx_competency_program_program ON public.competency_program_mapping(program_id);
CREATE INDEX IF NOT EXISTS idx_course_competency_course ON public.course_competency_mapping(course_id);
CREATE INDEX IF NOT EXISTS idx_course_competency_competency ON public.course_competency_mapping(competency_id);
CREATE INDEX IF NOT EXISTS idx_learner_competencies_learner ON public.learner_competencies(learner_id);
CREATE INDEX IF NOT EXISTS idx_learner_competencies_competency ON public.learner_competencies(competency_id);
CREATE INDEX IF NOT EXISTS idx_learner_competencies_level ON public.learner_competencies(current_level);
CREATE INDEX IF NOT EXISTS idx_learner_competencies_progress ON public.learner_competencies(learner_id, progress_percentage);

-- Enable RLS on competency tables
ALTER TABLE public.competency_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_program_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_competency_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_competencies ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECTION 13: INDUSTRY INTEGRATION MODULE (NEW)
-- Created: 2026-02-01 - Workshop Transformation Phase 2.1
-- Purpose: Connect learners with industry partners, mentors, and projects
-- =====================================================

-- Create industry ENUMs
DO $$ BEGIN
    CREATE TYPE partnership_type AS ENUM ('mou', 'placement', 'project', 'mentorship', 'internship', 'sponsorship', 'training');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE project_status AS ENUM ('draft', 'open', 'assigned', 'in_progress', 'under_review', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE engagement_type AS ENUM ('project', 'internship', 'mentorship', 'workshop', 'site_visit', 'guest_lecture', 'hackathon');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE engagement_status AS ENUM ('applied', 'approved', 'active', 'completed', 'withdrawn', 'terminated');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE difficulty_level AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- industry_partners: Company registry with MOU tracking
CREATE TABLE IF NOT EXISTS public.industry_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    company_logo_url TEXT,
    industry_sector VARCHAR(100),
    company_size VARCHAR(50),
    company_website TEXT,
    company_description TEXT,
    partnership_type partnership_type NOT NULL DEFAULT 'mou',
    partnership_start_date DATE,
    partnership_end_date DATE,
    mou_document_url TEXT,
    partnership_value TEXT,
    contact_person VARCHAR(255),
    contact_designation VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    address_line1 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    pincode VARCHAR(20),
    total_projects_offered INTEGER DEFAULT 0,
    total_internships_offered INTEGER DEFAULT 0,
    total_placements INTEGER DEFAULT 0,
    average_rating NUMERIC(3,2) DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- industry_mentors: Expert profiles with availability
CREATE TABLE IF NOT EXISTS public.industry_mentors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES public.industry_partners(id) ON DELETE SET NULL,
    mentor_name VARCHAR(255) NOT NULL,
    designation VARCHAR(255),
    company_name VARCHAR(255),
    profile_photo_url TEXT,
    bio TEXT,
    linkedin_url TEXT,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    preferred_contact_method VARCHAR(50) DEFAULT 'email',
    expertise_areas TEXT[] DEFAULT '{}',
    industry_experience_years INTEGER,
    competencies_can_mentor UUID[] DEFAULT '{}',
    availability JSONB DEFAULT '{}'::jsonb,
    max_mentees INTEGER DEFAULT 5,
    current_mentees INTEGER DEFAULT 0,
    total_mentees_all_time INTEGER DEFAULT 0,
    average_rating NUMERIC(3,2) DEFAULT 0,
    total_sessions_conducted INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- industry_projects: Project marketplace
CREATE TABLE IF NOT EXISTS public.industry_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES public.industry_partners(id) ON DELETE SET NULL,
    project_title VARCHAR(255) NOT NULL,
    project_code VARCHAR(50),
    description TEXT,
    detailed_requirements TEXT,
    expected_outcomes TEXT,
    deliverables JSONB DEFAULT '[]'::jsonb,
    required_competencies UUID[] DEFAULT '{}',
    minimum_competency_level proficiency_level DEFAULT 'beginner',
    competencies_developed UUID[] DEFAULT '{}',
    difficulty_level difficulty_level DEFAULT 'intermediate',
    duration_weeks INTEGER,
    estimated_hours INTEGER,
    max_team_size INTEGER DEFAULT 4,
    min_team_size INTEGER DEFAULT 1,
    eligible_programs UUID[] DEFAULT '{}',
    eligible_semesters UUID[] DEFAULT '{}',
    prerequisites TEXT,
    is_paid BOOLEAN DEFAULT false,
    stipend_amount NUMERIC(15,2),
    stipend_currency VARCHAR(10) DEFAULT 'INR',
    other_benefits TEXT,
    application_deadline DATE,
    project_start_date DATE,
    project_end_date DATE,
    max_teams INTEGER DEFAULT 1,
    current_teams INTEGER DEFAULT 0,
    status project_status NOT NULL DEFAULT 'draft',
    published_at TIMESTAMPTZ,
    published_by UUID,
    assigned_mentor_id UUID REFERENCES public.industry_mentors(id) ON DELETE SET NULL,
    total_applications INTEGER DEFAULT 0,
    total_completions INTEGER DEFAULT 0,
    average_rating NUMERIC(3,2) DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- learner_industry_engagements: Participation tracking
CREATE TABLE IF NOT EXISTS public.learner_industry_engagements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    engagement_type engagement_type NOT NULL,
    project_id UUID REFERENCES public.industry_projects(id) ON DELETE SET NULL,
    mentor_id UUID REFERENCES public.industry_mentors(id) ON DELETE SET NULL,
    partner_id UUID REFERENCES public.industry_partners(id) ON DELETE SET NULL,
    team_id UUID,
    team_role VARCHAR(100),
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    approved_by UUID,
    start_date DATE,
    expected_end_date DATE,
    actual_end_date DATE,
    status engagement_status NOT NULL DEFAULT 'applied',
    status_notes TEXT,
    competencies_targeted UUID[] DEFAULT '{}',
    competencies_demonstrated UUID[] DEFAULT '{}',
    competency_levels_achieved JSONB DEFAULT '{}'::jsonb,
    progress_percentage NUMERIC(5,2) DEFAULT 0,
    milestones_completed JSONB DEFAULT '[]'::jsonb,
    deliverables_submitted JSONB DEFAULT '[]'::jsonb,
    mentor_feedback JSONB DEFAULT '{}'::jsonb,
    learner_feedback JSONB DEFAULT '{}'::jsonb,
    certificate_issued BOOLEAN DEFAULT false,
    certificate_url TEXT,
    certificate_issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Industry module indexes
CREATE INDEX IF NOT EXISTS idx_industry_partners_institution ON public.industry_partners(institution_id);
CREATE INDEX IF NOT EXISTS idx_industry_partners_type ON public.industry_partners(partnership_type);
CREATE INDEX IF NOT EXISTS idx_industry_partners_active ON public.industry_partners(institution_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_industry_mentors_institution ON public.industry_mentors(institution_id);
CREATE INDEX IF NOT EXISTS idx_industry_mentors_partner ON public.industry_mentors(partner_id) WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_industry_mentors_active ON public.industry_mentors(institution_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_industry_mentors_expertise ON public.industry_mentors USING GIN(expertise_areas);
CREATE INDEX IF NOT EXISTS idx_industry_projects_institution ON public.industry_projects(institution_id);
CREATE INDEX IF NOT EXISTS idx_industry_projects_partner ON public.industry_projects(partner_id) WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_industry_projects_status ON public.industry_projects(status);
CREATE INDEX IF NOT EXISTS idx_industry_projects_open ON public.industry_projects(institution_id, status, application_deadline) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_industry_projects_competencies ON public.industry_projects USING GIN(required_competencies);
CREATE INDEX IF NOT EXISTS idx_learner_engagements_learner ON public.learner_industry_engagements(learner_id);
CREATE INDEX IF NOT EXISTS idx_learner_engagements_institution ON public.learner_industry_engagements(institution_id);
CREATE INDEX IF NOT EXISTS idx_learner_engagements_type ON public.learner_industry_engagements(engagement_type);
CREATE INDEX IF NOT EXISTS idx_learner_engagements_status ON public.learner_industry_engagements(status);
CREATE INDEX IF NOT EXISTS idx_learner_engagements_active ON public.learner_industry_engagements(learner_id, status) WHERE status IN ('approved', 'active');

-- Enable RLS on industry tables
ALTER TABLE public.industry_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industry_mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industry_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_industry_engagements ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECTION 14: PERSONALIZATION MODULE (Workshop Transformation Phase 3)
-- Added: 2026-02-01
-- Tables: learning_paths, learning_path_steps, parent_portal_access, parent_communications
-- =====================================================

-- ENUMs for personalization module
DO $$ BEGIN
    CREATE TYPE learning_path_status AS ENUM (
        'draft',         -- Path being created/configured
        'active',        -- Learner actively working on path
        'paused',        -- Temporarily paused
        'completed',     -- All steps completed
        'archived'       -- No longer relevant
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE learning_step_type AS ENUM (
        'course',        -- Formal course enrollment
        'project',       -- Industry or academic project
        'mentorship',    -- Mentorship session/program
        'certification', -- External certification
        'workshop',      -- Workshop attendance
        'self_study',    -- Self-paced learning resource
        'assessment',    -- Skill assessment
        'internship',    -- Internship placement
        'competition'    -- Hackathon/competition
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE learning_step_status AS ENUM (
        'pending',       -- Not yet started
        'in_progress',   -- Currently working on
        'completed',     -- Successfully completed
        'skipped',       -- Skipped (optional step)
        'failed'         -- Did not meet requirements
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE parent_access_level AS ENUM (
        'view',          -- Read-only access to learner info
        'interact',      -- Can message and interact
        'full'           -- Full access including approvals
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE communication_type AS ENUM (
        'progress_update',   -- Regular progress reports
        'alert',             -- Important alerts (attendance, grades)
        'feedback_request',  -- Request for parent feedback
        'announcement',      -- General announcements
        'fee_reminder',      -- Fee payment reminders
        'event_invite',      -- Event invitations
        'achievement',       -- Achievement notifications
        'concern'            -- Concern/issue notification
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- learning_paths: Per-learner personalized learning journeys
CREATE TABLE IF NOT EXISTS public.learning_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    path_name VARCHAR(255) NOT NULL,
    path_description TEXT,
    target_role VARCHAR(255),
    target_industry VARCHAR(255),
    target_competencies JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_progress NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (current_progress >= 0 AND current_progress <= 100),
    total_steps INTEGER DEFAULT 0,
    completed_steps INTEGER DEFAULT 0,
    estimated_completion DATE,
    actual_completion DATE,
    started_at TIMESTAMPTZ,
    is_ai_generated BOOLEAN DEFAULT false,
    ai_confidence_score NUMERIC(3,2),
    generation_parameters JSONB DEFAULT '{}'::jsonb,
    status learning_path_status NOT NULL DEFAULT 'draft',
    assigned_mentor_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    mentor_notes TEXT,
    created_by UUID,
    approved_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- learning_path_steps: Sequenced activities within paths
CREATE TABLE IF NOT EXISTS public.learning_path_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id UUID NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    step_name VARCHAR(255) NOT NULL,
    step_description TEXT,
    step_type learning_step_type NOT NULL,
    reference_id UUID,
    reference_table VARCHAR(100),
    external_url TEXT,
    competency_id UUID REFERENCES public.competency_catalog(id) ON DELETE SET NULL,
    target_competency_level proficiency_level,
    expected_duration_hours INTEGER,
    actual_duration_hours INTEGER,
    prerequisite_step_ids UUID[] DEFAULT '{}',
    is_optional BOOLEAN DEFAULT false,
    status learning_step_status NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    evidence_url TEXT,
    evidence_type VARCHAR(100),
    evidence_metadata JSONB DEFAULT '{}'::jsonb,
    learner_notes TEXT,
    mentor_feedback TEXT,
    rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_step_order_per_path UNIQUE (path_id, step_order)
);

-- parent_portal_access: Parent access configuration
CREATE TABLE IF NOT EXISTS public.parent_portal_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    parent_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    parent_email VARCHAR(255),
    parent_phone VARCHAR(50),
    parent_name VARCHAR(255),
    relationship VARCHAR(50),
    access_code VARCHAR(50) UNIQUE,
    access_code_expires_at TIMESTAMPTZ,
    pin_hash VARCHAR(255),
    access_level parent_access_level NOT NULL DEFAULT 'view',
    permissions JSONB DEFAULT '{}'::jsonb,
    notification_preferences JSONB DEFAULT '{}'::jsonb,
    last_access TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,
    last_ip_address VARCHAR(45),
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    deactivated_at TIMESTAMPTZ,
    deactivation_reason TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_parent_learner_relationship
        UNIQUE (learner_id, parent_email, relationship)
);

-- parent_communications: Message history between institution and parents
CREATE TABLE IF NOT EXISTS public.parent_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    parent_access_id UUID REFERENCES public.parent_portal_access(id) ON DELETE SET NULL,
    communication_type communication_type NOT NULL,
    subject VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    attachments JSONB DEFAULT '[]'::jsonb,
    related_entity_type VARCHAR(100),
    related_entity_id UUID,
    context_data JSONB DEFAULT '{}'::jsonb,
    sent_at TIMESTAMPTZ,
    sent_via VARCHAR(50)[],
    delivery_status JSONB DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    read_via VARCHAR(50),
    requires_response BOOLEAN DEFAULT false,
    response_deadline DATE,
    response TEXT,
    response_at TIMESTAMPTZ,
    response_attachment_url TEXT,
    sent_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    sent_by_role VARCHAR(50),
    is_archived BOOLEAN DEFAULT false,
    is_important BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Personalization module indexes
CREATE INDEX IF NOT EXISTS idx_learning_paths_learner ON public.learning_paths(learner_id);
CREATE INDEX IF NOT EXISTS idx_learning_paths_institution ON public.learning_paths(institution_id);
CREATE INDEX IF NOT EXISTS idx_learning_paths_status ON public.learning_paths(status);
CREATE INDEX IF NOT EXISTS idx_learning_paths_active ON public.learning_paths(learner_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_learning_paths_mentor ON public.learning_paths(assigned_mentor_id) WHERE assigned_mentor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_paths_target_competencies ON public.learning_paths USING GIN(target_competencies);
CREATE INDEX IF NOT EXISTS idx_learning_paths_ai_generated ON public.learning_paths(is_ai_generated, ai_confidence_score DESC) WHERE is_ai_generated = true;

CREATE INDEX IF NOT EXISTS idx_learning_path_steps_path ON public.learning_path_steps(path_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_path_order ON public.learning_path_steps(path_id, step_order);
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_status ON public.learning_path_steps(status);
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_type ON public.learning_path_steps(step_type);
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_competency ON public.learning_path_steps(competency_id) WHERE competency_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_reference ON public.learning_path_steps(reference_table, reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_path_steps_pending ON public.learning_path_steps(path_id, status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_parent_portal_learner ON public.parent_portal_access(learner_id);
CREATE INDEX IF NOT EXISTS idx_parent_portal_institution ON public.parent_portal_access(institution_id);
CREATE INDEX IF NOT EXISTS idx_parent_portal_parent_user ON public.parent_portal_access(parent_user_id) WHERE parent_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_portal_access_code ON public.parent_portal_access(access_code) WHERE access_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_portal_email ON public.parent_portal_access(parent_email) WHERE parent_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_portal_active ON public.parent_portal_access(learner_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_parent_comms_learner ON public.parent_communications(learner_id);
CREATE INDEX IF NOT EXISTS idx_parent_comms_institution ON public.parent_communications(institution_id);
CREATE INDEX IF NOT EXISTS idx_parent_comms_parent_access ON public.parent_communications(parent_access_id) WHERE parent_access_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_comms_type ON public.parent_communications(communication_type);
CREATE INDEX IF NOT EXISTS idx_parent_comms_sent_at ON public.parent_communications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_comms_unread ON public.parent_communications(learner_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_parent_comms_requires_response ON public.parent_communications(requires_response, response_deadline) WHERE requires_response = true AND response_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_parent_comms_important ON public.parent_communications(learner_id, is_important) WHERE is_important = true;

-- Enable RLS on personalization tables
ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_path_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_portal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_communications ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECTION 15: ACCOUNTABILITY MODULE (Workshop Transformation Phase 4)
-- Added: 2026-02-01
-- Tables: alumni_outcomes, outcome_program_correlation, facilitator_development, facilitator_industry_immersion
-- =====================================================

-- ENUMs for accountability module
DO $$ BEGIN
    CREATE TYPE outcome_type AS ENUM (
        'employed', 'self_employed', 'entrepreneur', 'higher_studies',
        'competitive_exams', 'family_business', 'gap_year', 'seeking', 'unknown'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE salary_range AS ENUM (
        'below_3l', '3l_to_5l', '5l_to_8l', '8l_to_12l',
        '12l_to_20l', '20l_to_35l', 'above_35l', 'not_applicable', 'undisclosed'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE verification_status AS ENUM (
        'pending', 'self_reported', 'document_verified', 'employer_confirmed', 'linkedin_verified', 'rejected'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE development_stage AS ENUM (
        'novice', 'developing', 'competent', 'proficient', 'expert', 'thought_leader'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE immersion_type AS ENUM (
        'sabbatical', 'summer_internship', 'consulting', 'research_collab',
        'site_visit', 'workshop_delivery', 'project_mentoring'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- alumni_outcomes: Graduate career/outcome tracking
CREATE TABLE IF NOT EXISTS public.alumni_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
    graduation_date DATE NOT NULL,
    graduation_year INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM graduation_date)) STORED,
    batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
    outcome_type outcome_type NOT NULL,
    outcome_start_date DATE,
    company_name VARCHAR(255),
    company_website VARCHAR(500),
    designation VARCHAR(255),
    department VARCHAR(255),
    industry_sector VARCHAR(255),
    job_function VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    is_remote BOOLEAN DEFAULT false,
    salary_range salary_range,
    has_equity BOOLEAN DEFAULT false,
    other_benefits TEXT,
    is_relevant_to_program BOOLEAN,
    relevance_percentage INTEGER CHECK (relevance_percentage IS NULL OR (relevance_percentage >= 0 AND relevance_percentage <= 100)),
    skills_used TEXT[],
    institution_name VARCHAR(255),
    course_name VARCHAR(255),
    specialization VARCHAR(255),
    is_scholarship BOOLEAN DEFAULT false,
    scholarship_details TEXT,
    business_name VARCHAR(255),
    business_type VARCHAR(255),
    business_sector VARCHAR(255),
    funding_raised VARCHAR(100),
    employee_count INTEGER,
    satisfaction_score INTEGER CHECK (satisfaction_score IS NULL OR (satisfaction_score >= 1 AND satisfaction_score <= 10)),
    would_recommend_program BOOLEAN,
    feedback TEXT,
    suggestions TEXT,
    testimonial TEXT,
    testimonial_approved BOOLEAN DEFAULT false,
    verification_status verification_status NOT NULL DEFAULT 'pending',
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    verification_documents JSONB DEFAULT '[]'::jsonb,
    is_contactable BOOLEAN DEFAULT true,
    preferred_contact_method VARCHAR(50),
    contact_frequency VARCHAR(50),
    is_willing_to_mentor BOOLEAN DEFAULT false,
    is_willing_to_hire BOOLEAN DEFAULT false,
    is_willing_to_guest_lecture BOOLEAN DEFAULT false,
    last_engagement_date DATE,
    engagement_notes TEXT,
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    update_count INTEGER DEFAULT 0,
    data_source VARCHAR(100),
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_learner_primary_outcome UNIQUE (learner_id, graduation_date)
);

-- outcome_program_correlation: Program success patterns
CREATE TABLE IF NOT EXISTS public.outcome_program_correlation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    cohort_year INTEGER NOT NULL,
    cohort_batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
    total_graduates INTEGER NOT NULL DEFAULT 0,
    tracked_graduates INTEGER DEFAULT 0,
    tracking_percentage NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE WHEN total_graduates > 0
        THEN (tracked_graduates::NUMERIC / total_graduates * 100)
        ELSE 0 END
    ) STORED,
    employed_count INTEGER DEFAULT 0,
    self_employed_count INTEGER DEFAULT 0,
    entrepreneur_count INTEGER DEFAULT 0,
    higher_studies_count INTEGER DEFAULT 0,
    competitive_exams_count INTEGER DEFAULT 0,
    family_business_count INTEGER DEFAULT 0,
    seeking_count INTEGER DEFAULT 0,
    unknown_count INTEGER DEFAULT 0,
    employment_rate NUMERIC(5,2),
    placement_rate NUMERIC(5,2),
    entrepreneurship_rate NUMERIC(5,2),
    higher_studies_rate NUMERIC(5,2),
    average_salary_range salary_range,
    median_salary_range salary_range,
    salary_distribution JSONB DEFAULT '{}'::jsonb,
    top_employers JSONB DEFAULT '[]'::jsonb,
    top_sectors JSONB DEFAULT '[]'::jsonb,
    top_roles JSONB DEFAULT '[]'::jsonb,
    top_locations JSONB DEFAULT '[]'::jsonb,
    top_institutions_for_studies JSONB DEFAULT '[]'::jsonb,
    top_courses_pursued JSONB DEFAULT '[]'::jsonb,
    scholarship_recipients INTEGER DEFAULT 0,
    startups_founded INTEGER DEFAULT 0,
    total_funding_raised VARCHAR(100),
    jobs_created INTEGER DEFAULT 0,
    avg_relevance_percentage NUMERIC(5,2),
    program_satisfaction_avg NUMERIC(3,2),
    would_recommend_percentage NUMERIC(5,2),
    avg_days_to_placement INTEGER,
    placement_before_graduation_count INTEGER DEFAULT 0,
    alumni_engaged_count INTEGER DEFAULT 0,
    mentors_available INTEGER DEFAULT 0,
    guest_lecturers_available INTEGER DEFAULT 0,
    potential_recruiters INTEGER DEFAULT 0,
    industry_benchmark_employment_rate NUMERIC(5,2),
    performance_vs_benchmark VARCHAR(50),
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    computation_notes TEXT,
    is_published BOOLEAN DEFAULT false,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_program_cohort UNIQUE (program_id, cohort_year)
);

-- facilitator_development: Staff professional evolution
CREATE TABLE IF NOT EXISTS public.facilitator_development (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    current_stage development_stage NOT NULL DEFAULT 'novice',
    stage_achieved_at TIMESTAMPTZ DEFAULT NOW(),
    previous_stage development_stage,
    stage_history JSONB DEFAULT '[]'::jsonb,
    certifications JSONB DEFAULT '[]'::jsonb,
    certification_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(certifications)) STORED,
    industry_immersions JSONB DEFAULT '[]'::jsonb,
    total_industry_days INTEGER DEFAULT 0,
    companies_worked_with TEXT[] DEFAULT '{}',
    innovation_contributions JSONB DEFAULT '[]'::jsonb,
    innovation_count INTEGER DEFAULT 0,
    peer_learning_sessions_conducted INTEGER DEFAULT 0,
    peer_learning_sessions_attended INTEGER DEFAULT 0,
    peer_learning_topics TEXT[],
    is_peer_learning_champion BOOLEAN DEFAULT false,
    faculty_mentored_count INTEGER DEFAULT 0,
    current_mentees UUID[] DEFAULT '{}',
    mentoring_specializations TEXT[],
    outcome_score NUMERIC(5,2) DEFAULT 0 CHECK (outcome_score >= 0 AND outcome_score <= 100),
    outcome_score_components JSONB DEFAULT '{}'::jsonb,
    students_mentored_count INTEGER DEFAULT 0,
    mentee_placement_rate NUMERIC(5,2),
    mentee_avg_package salary_range,
    mentee_satisfaction_avg NUMERIC(3,2),
    publications_count INTEGER DEFAULT 0,
    patents_count INTEGER DEFAULT 0,
    research_projects_count INTEGER DEFAULT 0,
    industry_projects_guided INTEGER DEFAULT 0,
    awards JSONB DEFAULT '[]'::jsonb,
    speaking_engagements JSONB DEFAULT '[]'::jsonb,
    media_features JSONB DEFAULT '[]'::jsonb,
    development_goals JSONB DEFAULT '[]'::jsonb,
    next_review_date DATE,
    development_plan_url TEXT,
    last_certification_date DATE,
    last_immersion_date DATE,
    last_innovation_date DATE,
    last_peer_session_date DATE,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_staff_development UNIQUE (staff_id)
);

-- facilitator_industry_immersion: Industry experience records
CREATE TABLE IF NOT EXISTS public.facilitator_industry_immersion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    development_id UUID REFERENCES public.facilitator_development(id) ON DELETE SET NULL,
    company_name VARCHAR(255) NOT NULL,
    company_website VARCHAR(500),
    industry_sector VARCHAR(255),
    company_size VARCHAR(50),
    partner_id UUID REFERENCES public.industry_partners(id) ON DELETE SET NULL,
    immersion_type immersion_type NOT NULL,
    role_title VARCHAR(255),
    department VARCHAR(255),
    reporting_to VARCHAR(255),
    start_date DATE NOT NULL,
    end_date DATE,
    duration_days INTEGER,
    is_ongoing BOOLEAN DEFAULT false,
    hours_per_week INTEGER,
    objectives TEXT,
    key_responsibilities TEXT[],
    projects_worked_on JSONB DEFAULT '[]'::jsonb,
    learnings JSONB DEFAULT '{}'::jsonb,
    key_takeaways TEXT[],
    applied_in_teaching JSONB DEFAULT '[]'::jsonb,
    curriculum_changes_proposed TEXT[],
    new_courses_proposed TEXT[],
    is_paid BOOLEAN DEFAULT false,
    compensation_type VARCHAR(100),
    compensation_amount NUMERIC(12,2),
    certificate_url TEXT,
    report_url TEXT,
    presentation_url TEXT,
    photos JSONB DEFAULT '[]'::jsonb,
    company_feedback TEXT,
    company_rating INTEGER CHECK (company_rating IS NULL OR (company_rating >= 1 AND company_rating <= 5)),
    self_assessment TEXT,
    self_rating INTEGER CHECK (self_rating IS NULL OR (self_rating >= 1 AND self_rating <= 5)),
    is_relationship_ongoing BOOLEAN DEFAULT false,
    future_collaboration_plans TEXT,
    company_contact_name VARCHAR(255),
    company_contact_email VARCHAR(255),
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    is_public BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Accountability module indexes
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_learner ON public.alumni_outcomes(learner_id);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_institution ON public.alumni_outcomes(institution_id);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_program ON public.alumni_outcomes(program_id) WHERE program_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_graduation_year ON public.alumni_outcomes(graduation_year);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_outcome_type ON public.alumni_outcomes(outcome_type);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_verification ON public.alumni_outcomes(verification_status);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_employed ON public.alumni_outcomes(institution_id, outcome_type, salary_range) WHERE outcome_type IN ('employed', 'self_employed');
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_company ON public.alumni_outcomes(company_name) WHERE company_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_sector ON public.alumni_outcomes(industry_sector) WHERE industry_sector IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_mentors ON public.alumni_outcomes(institution_id, is_willing_to_mentor) WHERE is_willing_to_mentor = true;

CREATE INDEX IF NOT EXISTS idx_outcome_correlation_program ON public.outcome_program_correlation(program_id);
CREATE INDEX IF NOT EXISTS idx_outcome_correlation_institution ON public.outcome_program_correlation(institution_id);
CREATE INDEX IF NOT EXISTS idx_outcome_correlation_year ON public.outcome_program_correlation(cohort_year DESC);
CREATE INDEX IF NOT EXISTS idx_outcome_correlation_published ON public.outcome_program_correlation(institution_id, is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_outcome_correlation_employment ON public.outcome_program_correlation(program_id, employment_rate DESC);

CREATE INDEX IF NOT EXISTS idx_facilitator_dev_staff ON public.facilitator_development(staff_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_institution ON public.facilitator_development(institution_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_stage ON public.facilitator_development(current_stage);
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_score ON public.facilitator_development(institution_id, outcome_score DESC);
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_champions ON public.facilitator_development(institution_id, is_peer_learning_champion) WHERE is_peer_learning_champion = true;
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_certifications ON public.facilitator_development USING GIN(certifications);
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_review ON public.facilitator_development(next_review_date) WHERE next_review_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_staff ON public.facilitator_industry_immersion(staff_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_institution ON public.facilitator_industry_immersion(institution_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_company ON public.facilitator_industry_immersion(company_name);
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_type ON public.facilitator_industry_immersion(immersion_type);
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_dates ON public.facilitator_industry_immersion(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_ongoing ON public.facilitator_industry_immersion(staff_id, is_ongoing) WHERE is_ongoing = true;
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_partner ON public.facilitator_industry_immersion(partner_id) WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_featured ON public.facilitator_industry_immersion(institution_id, is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_learnings ON public.facilitator_industry_immersion USING GIN(learnings);

-- Enable RLS on accountability tables
ALTER TABLE public.alumni_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcome_program_correlation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilitator_development ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilitator_industry_immersion ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- END OF TABLE DEFINITIONS
-- =====================================================