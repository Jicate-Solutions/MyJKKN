-- SECTION 16: SOLUTIONS HUB MODULE
-- Merged from JKKN-Solutions-Hub standalone project
-- Created: 2026-02-03
-- Purpose: Unified tracking for all solutions - software, training, content
-- Vision: "To be a Leading Global Innovative Solutions provider"
-- =====================================================

-- =====================================================
-- SOLUTIONS HUB ENUM TYPES
-- =====================================================

-- Solution type classification
DO $$ BEGIN
    CREATE TYPE sh_solution_type AS ENUM ('software', 'training', 'content');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Solution lifecycle status
DO $$ BEGIN
    CREATE TYPE sh_solution_status AS ENUM ('active', 'on_hold', 'completed', 'cancelled', 'in_amc');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Phase status (detailed workflow states)
DO $$ BEGIN
    CREATE TYPE sh_phase_status AS ENUM (
        'prospecting',        -- Initial client engagement
        'discovery',          -- Site visit and needs assessment
        'prd_writing',        -- Requirements documentation
        'prototype_building', -- Development phase
        'client_demo',        -- Demo to client
        'revisions',          -- Incorporating feedback
        'approved',           -- Client sign-off
        'deploying',          -- Production deployment
        'training',           -- User training
        'live',               -- In production use
        'in_amc',             -- Annual maintenance contract
        'completed',          -- Project finished
        'on_hold',            -- Temporarily paused
        'cancelled'           -- Project cancelled
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Client source tracking
DO $$ BEGIN
    CREATE TYPE sh_source_type AS ENUM (
        'placement',   -- From placement cell
        'alumni',      -- Alumni referral
        'clinical',    -- Clinical/hospital connection
        'referral',    -- External referral
        'direct',      -- Direct approach
        'yi',          -- Young Indians network
        'intent'       -- Intent agency
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Partner discount status
DO $$ BEGIN
    CREATE TYPE sh_partner_status AS ENUM ('standard', 'yi', 'alumni', 'mou', 'referral');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Payment classifications
DO $$ BEGIN
    CREATE TYPE sh_payment_type AS ENUM (
        'advance',        -- Upfront payment
        'milestone',      -- Phase completion payment
        'completion',     -- Final payment
        'amc',            -- Annual maintenance
        'mou_signing',    -- MOU signing amount
        'deployment',     -- Deployment fee
        'acceptance'      -- User acceptance payment
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Payment status tracking
DO $$ BEGIN
    CREATE TYPE sh_payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Earnings recipient types
DO $$ BEGIN
    CREATE TYPE sh_recipient_type AS ENUM (
        'builder',            -- Software builder
        'cohort_member',      -- Training cohort member
        'production_learner', -- Content production learner
        'department',         -- Department share
        'jicate',             -- JICATE facilitation
        'institution',        -- Institutional share
        'council',            -- Council share
        'infrastructure',     -- Infrastructure fund
        'referral_bonus'      -- Referral bonus
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Assignment/claim status
DO $$ BEGIN
    CREATE TYPE sh_assignment_status AS ENUM ('requested', 'approved', 'active', 'completed', 'withdrawn');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Bug severity levels
DO $$ BEGIN
    CREATE TYPE sh_bug_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Bug status tracking
DO $$ BEGIN
    CREATE TYPE sh_bug_status AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'wont_fix');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Training program types
DO $$ BEGIN
    CREATE TYPE sh_program_type AS ENUM (
        'workshop',           -- Single-day workshop
        'bootcamp',           -- Intensive training
        'certification',      -- Certification program
        'custom',             -- Custom training
        'faculty_development', -- FDP
        'corporate',          -- Corporate training
        'academic'            -- Academic program support
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Cohort member progression levels
DO $$ BEGIN
    CREATE TYPE sh_cohort_level AS ENUM ('observer', 'co_lead', 'lead', 'master');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Content order types
DO $$ BEGIN
    CREATE TYPE sh_content_type AS ENUM (
        'video',
        'graphic',
        'document',
        'presentation',
        'animation',
        'social_media',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Content division classification
DO $$ BEGIN
    CREATE TYPE sh_content_division AS ENUM ('video', 'design', 'writing', 'animation', 'social', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Deliverable status tracking
DO $$ BEGIN
    CREATE TYPE sh_deliverable_status AS ENUM (
        'pending',     -- Not started
        'in_progress', -- Being worked on
        'review',      -- Under review
        'revision',    -- Needs revision
        'approved',    -- Client approved
        'delivered'    -- Delivered to client
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Skill proficiency levels
DO $$ BEGIN
    CREATE TYPE sh_skill_level AS ENUM ('beginner', 'intermediate', 'advanced', 'expert');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Communication types
DO $$ BEGIN
    CREATE TYPE sh_communication_type AS ENUM ('email', 'call', 'meeting', 'whatsapp', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Communication direction
DO $$ BEGIN
    CREATE TYPE sh_communication_direction AS ENUM ('inbound', 'outbound');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Publication types
DO $$ BEGIN
    CREATE TYPE sh_paper_type AS ENUM ('journal', 'conference', 'patent', 'book_chapter', 'case_study');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Journal indexing types
DO $$ BEGIN
    CREATE TYPE sh_journal_type AS ENUM ('scopus', 'wos', 'ugc', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Publication status
DO $$ BEGIN
    CREATE TYPE sh_publication_status AS ENUM ('draft', 'submitted', 'under_review', 'accepted', 'published', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- JICATE session outcome
DO $$ BEGIN
    CREATE TYPE sh_session_outcome AS ENUM ('successful', 'needs_followup', 'escalated', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- MOU status
DO $$ BEGIN
    CREATE TYPE sh_mou_status AS ENUM ('draft', 'pending_signatures', 'active', 'expired', 'terminated');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Deployment environment
DO $$ BEGIN
    CREATE TYPE sh_deployment_env AS ENUM ('development', 'staging', 'production');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Training session status
DO $$ BEGIN
    CREATE TYPE sh_session_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- CLIENTS MODULE
-- External companies/organizations we serve
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sh_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    company_code TEXT UNIQUE,  -- Auto-generated JKKN-CLI-YYYY-NNN
    contact_person TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    country TEXT DEFAULT 'India',
    gst_number TEXT,
    pan_number TEXT,
    source_type sh_source_type NOT NULL DEFAULT 'direct',
    source_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    partner_status sh_partner_status NOT NULL DEFAULT 'standard',
    referral_count INTEGER DEFAULT 0,
    intent_agency_id TEXT,  -- For Intent agency tracking
    logo_url TEXT,
    website TEXT,
    linkedin_url TEXT,
    industry_sector TEXT,
    company_size TEXT,  -- startup, sme, enterprise, etc.
    notes TEXT,
    tags TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Client referral tracking
CREATE TABLE IF NOT EXISTS public.sh_client_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.sh_clients(id) ON DELETE CASCADE,
    referring_dept_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    executing_dept_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    referral_type TEXT,  -- internal, alumni, yi, etc.
    bonus_percentage NUMERIC(5,2) DEFAULT 5,
    bonus_amount NUMERIC(12,2),
    bonus_paid BOOLEAN DEFAULT false,
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- SOLUTIONS MODULE
-- Core work tracking for all solution types
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sh_solutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_code TEXT NOT NULL UNIQUE,  -- JKKN-SOL-YYYY-NNN (auto-generated)
    solution_type sh_solution_type NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    client_id UUID REFERENCES public.sh_clients(id) ON DELETE CASCADE,
    lead_department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    status sh_solution_status NOT NULL DEFAULT 'active',
    base_price NUMERIC(12,2),
    final_price NUMERIC(12,2),
    discount_percentage NUMERIC(5,2),
    discount_reason TEXT,
    currency TEXT DEFAULT 'INR',
    start_date DATE,
    target_date DATE,
    completion_date DATE,
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    tags TEXT[],
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Solution phases (workflow stages)
CREATE TABLE IF NOT EXISTS public.sh_solution_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id UUID NOT NULL REFERENCES public.sh_solutions(id) ON DELETE CASCADE,
    phase_number INTEGER NOT NULL,
    phase_code TEXT,  -- Optional phase reference code
    title TEXT NOT NULL,
    description TEXT,
    status sh_phase_status NOT NULL DEFAULT 'prospecting',
    owner_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    owner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    estimated_value NUMERIC(12,2),
    actual_value NUMERIC(12,2),
    estimated_hours INTEGER,
    actual_hours INTEGER,
    start_date DATE,
    due_date DATE,
    completion_date DATE,
    requirements_doc_url TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(solution_id, phase_number)
);

-- MOU/Agreement management
CREATE TABLE IF NOT EXISTS public.sh_solution_mous (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id UUID NOT NULL REFERENCES public.sh_solutions(id) ON DELETE CASCADE,
    mou_number TEXT UNIQUE,  -- JKKN-MOU-YYYY-NNN
    deal_value NUMERIC(12,2) NOT NULL,
    amc_value NUMERIC(12,2),
    amc_start_date DATE,
    amc_duration_months INTEGER DEFAULT 12,
    payment_terms JSONB,  -- {advance: 30, milestone1: 30, completion: 40}
    status sh_mou_status DEFAULT 'draft',
    mou_document_url TEXT,
    signed_date DATE,
    expiry_date DATE,
    signatory_client TEXT,
    signatory_jkkn TEXT,
    witness_1 TEXT,
    witness_2 TEXT,
    terms_and_conditions TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- =====================================================
-- BUILDERS MODULE (Software Talent)
-- Internal talent pool for software development
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sh_builders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    learner_id UUID REFERENCES public.learners_profiles(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    builder_code TEXT UNIQUE,  -- JKKN-BLD-YYYY-NNN
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    trained_date DATE,
    specialization TEXT,
    bio TEXT,
    portfolio_url TEXT,
    github_url TEXT,
    linkedin_url TEXT,
    hourly_rate NUMERIC(8,2),
    total_earnings NUMERIC(12,2) DEFAULT 0,
    projects_completed INTEGER DEFAULT 0,
    average_rating NUMERIC(3,2),
    is_internal BOOLEAN DEFAULT true,  -- True for students/staff
    is_active BOOLEAN DEFAULT true,
    availability_status TEXT DEFAULT 'available',  -- available, busy, on_leave
    tags TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Builder skill inventory
CREATE TABLE IF NOT EXISTS public.sh_builder_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    builder_id UUID NOT NULL REFERENCES public.sh_builders(id) ON DELETE CASCADE,
    skill_name TEXT NOT NULL,
    skill_category TEXT,  -- frontend, backend, database, devops, etc.
    proficiency_level INTEGER CHECK (proficiency_level BETWEEN 1 AND 5),
    years_experience NUMERIC(4,1),
    certifications TEXT[],
    assessed_date DATE,
    assessed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(builder_id, skill_name)
);

-- Builder phase assignments
CREATE TABLE IF NOT EXISTS public.sh_builder_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID NOT NULL REFERENCES public.sh_solution_phases(id) ON DELETE CASCADE,
    builder_id UUID NOT NULL REFERENCES public.sh_builders(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'contributor',  -- lead, contributor, reviewer
    status sh_assignment_status NOT NULL DEFAULT 'requested',
    estimated_hours INTEGER,
    actual_hours INTEGER,
    hourly_rate NUMERIC(8,2),
    total_earnings NUMERIC(10,2),
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    feedback TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(phase_id, builder_id)
);

-- Prototype iterations (for client demos/feedback)
CREATE TABLE IF NOT EXISTS public.sh_prototype_iterations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID NOT NULL REFERENCES public.sh_solution_phases(id) ON DELETE CASCADE,
    iteration_number INTEGER NOT NULL,
    version TEXT,  -- v1.0, v1.1, etc.
    prototype_url TEXT,
    demo_video_url TEXT,
    screenshots TEXT[],
    client_approved BOOLEAN DEFAULT false,
    approved_at TIMESTAMPTZ,
    approved_by TEXT,  -- Client contact name
    changes_requested TEXT,
    changes_made TEXT,
    feedback TEXT,
    demo_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE(phase_id, iteration_number)
);

-- Bug reports for prototypes
CREATE TABLE IF NOT EXISTS public.sh_bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    iteration_id UUID NOT NULL REFERENCES public.sh_prototype_iterations(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES public.sh_solution_phases(id) ON DELETE SET NULL,
    bug_code TEXT UNIQUE,  -- JKKN-BUG-YYYY-NNNNN
    title TEXT NOT NULL,
    description TEXT,
    steps_to_reproduce TEXT,
    expected_behavior TEXT,
    actual_behavior TEXT,
    severity sh_bug_severity NOT NULL DEFAULT 'medium',
    status sh_bug_status NOT NULL DEFAULT 'open',
    browser TEXT,
    device TEXT,
    screenshot_urls TEXT[],
    video_url TEXT,
    resolution_notes TEXT,
    assigned_to UUID REFERENCES public.sh_builders(id) ON DELETE SET NULL,
    reported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reporter_type TEXT,  -- client, internal, tester
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);

-- Deployment tracking
CREATE TABLE IF NOT EXISTS public.sh_phase_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID NOT NULL REFERENCES public.sh_solution_phases(id) ON DELETE CASCADE,
    environment sh_deployment_env NOT NULL,
    deployment_number INTEGER DEFAULT 1,
    vercel_url TEXT,
    vercel_project_id TEXT,
    supabase_project_id TEXT,
    railway_project_id TEXT,
    custom_domain TEXT,
    ssl_enabled BOOLEAN DEFAULT true,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, deploying, live, failed, rolled_back
    deployed_at TIMESTAMPTZ,
    deployed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rollback_at TIMESTAMPTZ,
    rollback_reason TEXT,
    health_check_url TEXT,
    monitoring_url TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- End-user tracking (client's users)
CREATE TABLE IF NOT EXISTS public.sh_implementation_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID NOT NULL REFERENCES public.sh_solution_phases(id) ON DELETE CASCADE,
    solution_id UUID REFERENCES public.sh_solutions(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    user_email TEXT,
    user_phone TEXT,
    user_role TEXT,  -- admin, manager, staff, etc.
    department TEXT,
    trained_date DATE,
    trained_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    training_completed BOOLEAN DEFAULT false,
    usage_status TEXT DEFAULT 'pending',  -- pending, active, inactive, blocked
    last_login_at TIMESTAMPTZ,
    login_count INTEGER DEFAULT 0,
    feedback TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- TRAINING MODULE
-- Training programs and cohort management
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sh_training_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id UUID NOT NULL REFERENCES public.sh_solutions(id) ON DELETE CASCADE,
    program_code TEXT UNIQUE,  -- JKKN-TRN-YYYY-NNN
    title TEXT NOT NULL,
    program_type sh_program_type NOT NULL,
    track TEXT,  -- Track A (internal), Track B (external), etc.
    description TEXT,
    objectives TEXT[],
    prerequisites TEXT[],
    participant_count INTEGER,
    max_participants INTEGER,
    location_preference TEXT,  -- on_site, virtual, hybrid
    venue TEXT,
    start_date DATE,
    end_date DATE,
    total_hours INTEGER,
    total_sessions INTEGER,
    price_per_participant NUMERIC(10,2),
    total_price NUMERIC(12,2),
    materials_included BOOLEAN DEFAULT true,
    certification_included BOOLEAN DEFAULT true,
    status TEXT DEFAULT 'planned',  -- planned, confirmed, in_progress, completed, cancelled
    tags TEXT[],
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Individual training sessions
CREATE TABLE IF NOT EXISTS public.sh_training_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES public.sh_training_programs(id) ON DELETE CASCADE,
    session_number INTEGER NOT NULL,
    title TEXT,
    description TEXT,
    topics TEXT[],
    session_date DATE,
    start_time TIME,
    end_time TIME,
    duration_minutes INTEGER,
    location TEXT,
    room TEXT,
    is_virtual BOOLEAN DEFAULT false,
    meeting_url TEXT,
    status sh_session_status DEFAULT 'scheduled',
    google_calendar_event_id TEXT,
    microsoft_calendar_event_id TEXT,
    attendance_count INTEGER,
    max_attendance INTEGER,
    materials_url TEXT,
    recording_url TEXT,
    feedback_form_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(program_id, session_number)
);

-- Cohort members (internal trainers/facilitators)
CREATE TABLE IF NOT EXISTS public.sh_cohort_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    learner_id UUID REFERENCES public.learners_profiles(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    cohort_code TEXT UNIQUE,  -- JKKN-COH-YYYY-NNN
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    level sh_cohort_level DEFAULT 'observer',
    track TEXT,  -- Track specialty
    specializations TEXT[],
    bio TEXT,
    photo_url TEXT,
    linkedin_url TEXT,
    sessions_observed INTEGER DEFAULT 0,
    sessions_co_led INTEGER DEFAULT 0,
    sessions_led INTEGER DEFAULT 0,
    sessions_master INTEGER DEFAULT 0,
    total_hours_trained INTEGER DEFAULT 0,
    total_participants_trained INTEGER DEFAULT 0,
    total_earnings NUMERIC(12,2) DEFAULT 0,
    average_rating NUMERIC(3,2),
    certifications TEXT[],
    is_active BOOLEAN DEFAULT true,
    availability_status TEXT DEFAULT 'available',
    tags TEXT[],
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cohort session assignments
CREATE TABLE IF NOT EXISTS public.sh_cohort_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sh_training_sessions(id) ON DELETE CASCADE,
    cohort_member_id UUID NOT NULL REFERENCES public.sh_cohort_members(id) ON DELETE CASCADE,
    role TEXT NOT NULL,  -- observer, co_lead, lead, master, support
    status sh_assignment_status DEFAULT 'requested',
    earnings NUMERIC(10,2),
    hours_worked NUMERIC(6,2),
    rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    feedback_from_participants TEXT,
    self_reflection TEXT,
    mentor_feedback TEXT,
    areas_of_improvement TEXT[],
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, cohort_member_id)
);

-- =====================================================
-- CONTENT MODULE
-- Content production tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sh_content_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id UUID NOT NULL REFERENCES public.sh_solutions(id) ON DELETE CASCADE,
    order_code TEXT UNIQUE,  -- JKKN-CNT-YYYY-NNN
    title TEXT NOT NULL,
    order_type sh_content_type NOT NULL,
    division sh_content_division NOT NULL,
    description TEXT,
    requirements TEXT,
    brand_guidelines_url TEXT,
    reference_files TEXT[],
    quantity INTEGER DEFAULT 1,
    duration_minutes INTEGER,  -- For video content
    dimensions TEXT,  -- For graphics
    format TEXT,  -- mp4, pdf, png, etc.
    revision_rounds INTEGER DEFAULT 2,
    revisions_used INTEGER DEFAULT 0,
    due_date DATE,
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    estimated_hours INTEGER,
    actual_hours INTEGER,
    price NUMERIC(10,2),
    status TEXT DEFAULT 'pending',  -- pending, assigned, in_progress, review, completed, cancelled
    tags TEXT[],
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Individual deliverables
CREATE TABLE IF NOT EXISTS public.sh_content_deliverables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.sh_content_orders(id) ON DELETE CASCADE,
    deliverable_number INTEGER DEFAULT 1,
    title TEXT NOT NULL,
    description TEXT,
    file_url TEXT,
    preview_url TEXT,
    thumbnail_url TEXT,
    file_size_kb INTEGER,
    file_format TEXT,
    duration_seconds INTEGER,
    status sh_deliverable_status DEFAULT 'pending',
    revision_count INTEGER DEFAULT 0,
    current_revision_notes TEXT,
    client_feedback TEXT,
    approved_at TIMESTAMPTZ,
    approved_by TEXT,  -- Client contact
    delivered_at TIMESTAMPTZ,
    delivery_method TEXT,  -- download, drive, email, etc.
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Production learners (content creators)
CREATE TABLE IF NOT EXISTS public.sh_production_learners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    learner_id UUID REFERENCES public.learners_profiles(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    learner_code TEXT UNIQUE,  -- JKKN-PRD-YYYY-NNN
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    division sh_content_division NOT NULL,
    skill_level sh_skill_level DEFAULT 'beginner',
    specializations TEXT[],
    software_tools TEXT[],  -- Photoshop, Premiere, etc.
    bio TEXT,
    portfolio_url TEXT,
    behance_url TEXT,
    dribbble_url TEXT,
    orders_completed INTEGER DEFAULT 0,
    total_deliverables INTEGER DEFAULT 0,
    total_earnings NUMERIC(12,2) DEFAULT 0,
    average_rating NUMERIC(3,2),
    is_active BOOLEAN DEFAULT true,
    availability_status TEXT DEFAULT 'available',
    tags TEXT[],
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Production assignments
CREATE TABLE IF NOT EXISTS public.sh_production_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deliverable_id UUID NOT NULL REFERENCES public.sh_content_deliverables(id) ON DELETE CASCADE,
    learner_id UUID NOT NULL REFERENCES public.sh_production_learners(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'creator',  -- creator, reviewer, lead, editor
    status sh_assignment_status DEFAULT 'requested',
    estimated_hours INTEGER,
    actual_hours INTEGER,
    earnings NUMERIC(10,2),
    quality_rating INTEGER CHECK (quality_rating IS NULL OR (quality_rating >= 1 AND quality_rating <= 5)),
    timeliness_rating INTEGER CHECK (timeliness_rating IS NULL OR (timeliness_rating >= 1 AND timeliness_rating <= 5)),
    feedback TEXT,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(deliverable_id, learner_id)
);

-- =====================================================
-- DISCOVERY & COMMUNICATIONS MODULE
-- Client engagement tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sh_discovery_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.sh_clients(id) ON DELETE CASCADE,
    solution_id UUID REFERENCES public.sh_solutions(id) ON DELETE SET NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    visit_code TEXT UNIQUE,  -- JKKN-VIS-YYYY-NNN
    visit_date DATE NOT NULL,
    visit_time TIME,
    duration_hours NUMERIC(4,2),
    location TEXT,
    visit_type TEXT,  -- initial, followup, demo, training, support
    visitors JSONB DEFAULT '[]'::jsonb,  -- [{name, role, email}]
    client_attendees JSONB DEFAULT '[]'::jsonb,
    observations TEXT,
    current_systems TEXT,
    pain_points TEXT,
    opportunities TEXT,
    competitor_info TEXT,
    budget_indication TEXT,
    timeline_indication TEXT,
    decision_makers TEXT[],
    photos_urls TEXT[],
    document_urls TEXT[],
    follow_up_required BOOLEAN DEFAULT false,
    follow_up_date DATE,
    follow_up_notes TEXT,
    outcome TEXT,  -- positive, neutral, negative, proposal_requested
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Communication log
CREATE TABLE IF NOT EXISTS public.sh_client_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.sh_clients(id) ON DELETE CASCADE,
    solution_id UUID REFERENCES public.sh_solutions(id) ON DELETE SET NULL,
    phase_id UUID REFERENCES public.sh_solution_phases(id) ON DELETE SET NULL,
    communication_type sh_communication_type NOT NULL,
    source TEXT DEFAULT 'manual',  -- manual, gmail_sync, whatsapp_sync, calendar
    direction sh_communication_direction NOT NULL,
    subject TEXT,
    content TEXT,
    summary TEXT,
    participants TEXT[],
    attachments TEXT[],
    communication_date TIMESTAMPTZ DEFAULT NOW(),
    duration_minutes INTEGER,
    outcome TEXT,
    follow_up_required BOOLEAN DEFAULT false,
    follow_up_date DATE,
    tags TEXT[],
    external_id TEXT,  -- Gmail/WhatsApp message ID
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- =====================================================
-- FINANCIALS MODULE
-- Revenue tracking and distribution
-- =====================================================

-- Revenue split models
CREATE TABLE IF NOT EXISTS public.sh_revenue_split_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_type sh_solution_type NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    split_config JSONB NOT NULL,  -- {builder: 40, department: 30, jicate: 15, institution: 15}
    is_default BOOLEAN DEFAULT false,
    effective_from DATE,
    effective_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE(solution_type, name)
);

-- Payment records
CREATE TABLE IF NOT EXISTS public.sh_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_code TEXT UNIQUE,  -- JKKN-PAY-YYYY-NNNNN
    solution_id UUID REFERENCES public.sh_solutions(id) ON DELETE SET NULL,
    phase_id UUID REFERENCES public.sh_solution_phases(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.sh_content_orders(id) ON DELETE SET NULL,
    program_id UUID REFERENCES public.sh_training_programs(id) ON DELETE SET NULL,
    mou_id UUID REFERENCES public.sh_solution_mous(id) ON DELETE SET NULL,
    client_id UUID REFERENCES public.sh_clients(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL,
    currency TEXT DEFAULT 'INR',
    payment_type sh_payment_type NOT NULL,
    status sh_payment_status NOT NULL DEFAULT 'pending',
    payment_date DATE,
    due_date DATE,
    payment_method TEXT,  -- bank_transfer, upi, cheque, cash, online
    reference_number TEXT,
    invoice_number TEXT,
    invoice_url TEXT,
    receipt_url TEXT,
    split_model_id UUID REFERENCES public.sh_revenue_split_models(id) ON DELETE SET NULL,
    split_processed BOOLEAN DEFAULT false,
    split_processed_at TIMESTAMPTZ,
    gst_amount NUMERIC(10,2),
    tds_amount NUMERIC(10,2),
    net_amount NUMERIC(12,2),
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Earnings ledger (distributed earnings)
CREATE TABLE IF NOT EXISTS public.sh_earnings_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_code TEXT UNIQUE,  -- JKKN-ERN-YYYY-NNNNN
    payment_id UUID NOT NULL REFERENCES public.sh_payments(id) ON DELETE CASCADE,
    recipient_type sh_recipient_type NOT NULL,
    recipient_id UUID,  -- References builder, cohort_member, production_learner, or NULL for department/institution
    builder_id UUID REFERENCES public.sh_builders(id) ON DELETE SET NULL,
    cohort_member_id UUID REFERENCES public.sh_cohort_members(id) ON DELETE SET NULL,
    production_learner_id UUID REFERENCES public.sh_production_learners(id) ON DELETE SET NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL,
    percentage NUMERIC(5,2),
    status TEXT DEFAULT 'pending',  -- pending, approved, processed, paid, cancelled
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    payment_reference TEXT,
    bank_account TEXT,  -- Last 4 digits for reference
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- ACCREDITATION & PUBLICATIONS MODULE
-- Academic output tracking for NIRF/NAAC
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sh_publications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publication_code TEXT UNIQUE,  -- JKKN-PUB-YYYY-NNN
    solution_id UUID REFERENCES public.sh_solutions(id) ON DELETE SET NULL,
    phase_id UUID REFERENCES public.sh_solution_phases(id) ON DELETE SET NULL,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    paper_type sh_paper_type NOT NULL,
    title TEXT NOT NULL,
    abstract TEXT,
    authors TEXT[] NOT NULL,
    keywords TEXT[],
    journal_name TEXT,
    conference_name TEXT,
    conference_location TEXT,
    conference_date DATE,
    journal_type sh_journal_type,
    issn TEXT,
    isbn TEXT,
    volume TEXT,
    issue TEXT,
    page_numbers TEXT,
    publisher TEXT,
    status sh_publication_status DEFAULT 'draft',
    submission_date DATE,
    acceptance_date DATE,
    publication_date DATE,
    doi TEXT,
    url TEXT,
    pdf_url TEXT,
    impact_factor NUMERIC(6,3),
    citation_count INTEGER DEFAULT 0,
    h_index_contribution INTEGER,
    nirf_category TEXT,  -- Research & Professional Practice
    naac_criterion TEXT,  -- Criterion 3: Research, etc.
    scopus_indexed BOOLEAN DEFAULT false,
    wos_indexed BOOLEAN DEFAULT false,
    ugc_listed BOOLEAN DEFAULT false,
    peer_reviewed BOOLEAN DEFAULT true,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Publication contributor tracking
CREATE TABLE IF NOT EXISTS public.sh_publication_contributors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publication_id UUID NOT NULL REFERENCES public.sh_publications(id) ON DELETE CASCADE,
    builder_id UUID REFERENCES public.sh_builders(id) ON DELETE SET NULL,
    cohort_member_id UUID REFERENCES public.sh_cohort_members(id) ON DELETE SET NULL,
    learner_id UUID REFERENCES public.sh_production_learners(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    external_author_name TEXT,
    external_author_affiliation TEXT,
    author_order INTEGER,
    is_corresponding BOOLEAN DEFAULT false,
    credit_type TEXT DEFAULT 'coauthor',  -- first_author, coauthor, corresponding, acknowledgment
    contribution_description TEXT,
    orcid TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Accreditation metrics reference
CREATE TABLE IF NOT EXISTS public.sh_accreditation_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_type TEXT NOT NULL,  -- nirf, naac, nba, abet
    metric_code TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    category TEXT,
    max_score NUMERIC(5,2),
    weightage NUMERIC(5,2),
    calculation_method TEXT,
    data_sources TEXT[],
    verification_requirements TEXT,
    is_active BOOLEAN DEFAULT true,
    valid_from DATE,
    valid_to DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(metric_type, metric_code)
);

-- =====================================================
-- JICATE & SYSTEM MODULE
-- Facilitation tracking and system notifications
-- =====================================================

-- JICATE facilitation sessions
CREATE TABLE IF NOT EXISTS public.sh_jicate_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_code TEXT UNIQUE,  -- JKKN-JIC-YYYY-NNN
    solution_id UUID REFERENCES public.sh_solutions(id) ON DELETE SET NULL,
    phase_id UUID REFERENCES public.sh_solution_phases(id) ON DELETE SET NULL,
    client_id UUID REFERENCES public.sh_clients(id) ON DELETE SET NULL,
    session_type TEXT,  -- client_meeting, internal_review, demo, training
    session_date DATE NOT NULL,
    session_time TIME,
    duration_minutes INTEGER,
    booked_by_dept_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    booked_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    attendees JSONB DEFAULT '[]'::jsonb,  -- [{name, role, email, department}]
    jicate_facilitator TEXT,
    jicate_facilitator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    agenda TEXT,
    materials_url TEXT,
    presentation_url TEXT,
    outcome sh_session_outcome,
    outcome_notes TEXT,
    action_items JSONB DEFAULT '[]'::jsonb,  -- [{item, assignee, due_date, status}]
    next_session_date DATE,
    google_meet_url TEXT,
    recording_url TEXT,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Solutions Hub notifications
CREATE TABLE IF NOT EXISTS public.sh_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    category TEXT,  -- assignment, payment, deadline, approval, system
    title TEXT NOT NULL,
    message TEXT,
    priority TEXT DEFAULT 'normal',  -- low, normal, high, urgent
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    action_url TEXT,
    action_label TEXT,
    related_entity_type TEXT,  -- solution, phase, payment, etc.
    related_entity_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comprehensive audit log
CREATE TABLE IF NOT EXISTS public.sh_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_email TEXT,
    user_role TEXT,
    action TEXT NOT NULL,  -- create, update, delete, view, export, etc.
    entity_type TEXT NOT NULL,
    entity_id UUID,
    entity_code TEXT,
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    request_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- SOLUTIONS HUB INDEXES
-- Performance optimization for all tables
-- =====================================================

-- Client indexes
CREATE INDEX IF NOT EXISTS idx_sh_clients_source_type ON public.sh_clients(source_type);
CREATE INDEX IF NOT EXISTS idx_sh_clients_partner_status ON public.sh_clients(partner_status);
CREATE INDEX IF NOT EXISTS idx_sh_clients_source_dept ON public.sh_clients(source_department_id) WHERE source_department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_clients_active ON public.sh_clients(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sh_clients_created_by ON public.sh_clients(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_clients_name ON public.sh_clients(name);
CREATE INDEX IF NOT EXISTS idx_sh_clients_code ON public.sh_clients(company_code) WHERE company_code IS NOT NULL;

-- Client referral indexes
CREATE INDEX IF NOT EXISTS idx_sh_client_referrals_client ON public.sh_client_referrals(client_id);
CREATE INDEX IF NOT EXISTS idx_sh_client_referrals_referring ON public.sh_client_referrals(referring_dept_id) WHERE referring_dept_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_client_referrals_executing ON public.sh_client_referrals(executing_dept_id) WHERE executing_dept_id IS NOT NULL;

-- Solution indexes
CREATE INDEX IF NOT EXISTS idx_sh_solutions_type ON public.sh_solutions(solution_type);
CREATE INDEX IF NOT EXISTS idx_sh_solutions_status ON public.sh_solutions(status);
CREATE INDEX IF NOT EXISTS idx_sh_solutions_client ON public.sh_solutions(client_id);
CREATE INDEX IF NOT EXISTS idx_sh_solutions_department ON public.sh_solutions(lead_department_id);
CREATE INDEX IF NOT EXISTS idx_sh_solutions_institution ON public.sh_solutions(institution_id) WHERE institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_solutions_created ON public.sh_solutions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sh_solutions_code ON public.sh_solutions(solution_code);
CREATE INDEX IF NOT EXISTS idx_sh_solutions_active ON public.sh_solutions(status, solution_type) WHERE status = 'active';

-- Phase indexes
CREATE INDEX IF NOT EXISTS idx_sh_phases_solution ON public.sh_solution_phases(solution_id);
CREATE INDEX IF NOT EXISTS idx_sh_phases_status ON public.sh_solution_phases(status);
CREATE INDEX IF NOT EXISTS idx_sh_phases_owner_dept ON public.sh_solution_phases(owner_department_id) WHERE owner_department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_phases_owner_user ON public.sh_solution_phases(owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_phases_due_date ON public.sh_solution_phases(due_date) WHERE due_date IS NOT NULL;

-- MOU indexes
CREATE INDEX IF NOT EXISTS idx_sh_mous_solution ON public.sh_solution_mous(solution_id);
CREATE INDEX IF NOT EXISTS idx_sh_mous_status ON public.sh_solution_mous(status);
CREATE INDEX IF NOT EXISTS idx_sh_mous_expiry ON public.sh_solution_mous(expiry_date) WHERE expiry_date IS NOT NULL;

-- Builder indexes
CREATE INDEX IF NOT EXISTS idx_sh_builders_user ON public.sh_builders(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_builders_learner ON public.sh_builders(learner_id) WHERE learner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_builders_staff ON public.sh_builders(staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_builders_department ON public.sh_builders(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_builders_institution ON public.sh_builders(institution_id) WHERE institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_builders_active ON public.sh_builders(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sh_builders_code ON public.sh_builders(builder_code) WHERE builder_code IS NOT NULL;

-- Builder skills indexes
CREATE INDEX IF NOT EXISTS idx_sh_builder_skills_builder ON public.sh_builder_skills(builder_id);
CREATE INDEX IF NOT EXISTS idx_sh_builder_skills_name ON public.sh_builder_skills(skill_name);
CREATE INDEX IF NOT EXISTS idx_sh_builder_skills_category ON public.sh_builder_skills(skill_category) WHERE skill_category IS NOT NULL;

-- Builder assignment indexes
CREATE INDEX IF NOT EXISTS idx_sh_builder_assignments_phase ON public.sh_builder_assignments(phase_id);
CREATE INDEX IF NOT EXISTS idx_sh_builder_assignments_builder ON public.sh_builder_assignments(builder_id);
CREATE INDEX IF NOT EXISTS idx_sh_builder_assignments_status ON public.sh_builder_assignments(status);

-- Prototype iteration indexes
CREATE INDEX IF NOT EXISTS idx_sh_iterations_phase ON public.sh_prototype_iterations(phase_id);
CREATE INDEX IF NOT EXISTS idx_sh_iterations_approved ON public.sh_prototype_iterations(client_approved) WHERE client_approved = true;

-- Bug report indexes
CREATE INDEX IF NOT EXISTS idx_sh_bugs_iteration ON public.sh_bug_reports(iteration_id);
CREATE INDEX IF NOT EXISTS idx_sh_bugs_phase ON public.sh_bug_reports(phase_id) WHERE phase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_bugs_severity ON public.sh_bug_reports(severity);
CREATE INDEX IF NOT EXISTS idx_sh_bugs_status ON public.sh_bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_sh_bugs_assigned ON public.sh_bug_reports(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_bugs_code ON public.sh_bug_reports(bug_code) WHERE bug_code IS NOT NULL;

-- Deployment indexes
CREATE INDEX IF NOT EXISTS idx_sh_deployments_phase ON public.sh_phase_deployments(phase_id);
CREATE INDEX IF NOT EXISTS idx_sh_deployments_env ON public.sh_phase_deployments(environment);
CREATE INDEX IF NOT EXISTS idx_sh_deployments_status ON public.sh_phase_deployments(status);

-- Implementation user indexes
CREATE INDEX IF NOT EXISTS idx_sh_impl_users_phase ON public.sh_implementation_users(phase_id);
CREATE INDEX IF NOT EXISTS idx_sh_impl_users_solution ON public.sh_implementation_users(solution_id) WHERE solution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_impl_users_status ON public.sh_implementation_users(usage_status);

-- Training program indexes
CREATE INDEX IF NOT EXISTS idx_sh_programs_solution ON public.sh_training_programs(solution_id);
CREATE INDEX IF NOT EXISTS idx_sh_programs_type ON public.sh_training_programs(program_type);
CREATE INDEX IF NOT EXISTS idx_sh_programs_status ON public.sh_training_programs(status);
CREATE INDEX IF NOT EXISTS idx_sh_programs_dates ON public.sh_training_programs(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_sh_programs_code ON public.sh_training_programs(program_code) WHERE program_code IS NOT NULL;

-- Training session indexes
CREATE INDEX IF NOT EXISTS idx_sh_sessions_program ON public.sh_training_sessions(program_id);
CREATE INDEX IF NOT EXISTS idx_sh_sessions_date ON public.sh_training_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_sh_sessions_status ON public.sh_training_sessions(status);

-- Cohort member indexes
CREATE INDEX IF NOT EXISTS idx_sh_cohort_user ON public.sh_cohort_members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_cohort_learner ON public.sh_cohort_members(learner_id) WHERE learner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_cohort_staff ON public.sh_cohort_members(staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_cohort_department ON public.sh_cohort_members(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_cohort_institution ON public.sh_cohort_members(institution_id) WHERE institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_cohort_level ON public.sh_cohort_members(level);
CREATE INDEX IF NOT EXISTS idx_sh_cohort_active ON public.sh_cohort_members(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sh_cohort_code ON public.sh_cohort_members(cohort_code) WHERE cohort_code IS NOT NULL;

-- Cohort assignment indexes
CREATE INDEX IF NOT EXISTS idx_sh_cohort_assignments_session ON public.sh_cohort_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_sh_cohort_assignments_member ON public.sh_cohort_assignments(cohort_member_id);
CREATE INDEX IF NOT EXISTS idx_sh_cohort_assignments_status ON public.sh_cohort_assignments(status);

-- Content order indexes
CREATE INDEX IF NOT EXISTS idx_sh_content_orders_solution ON public.sh_content_orders(solution_id);
CREATE INDEX IF NOT EXISTS idx_sh_content_orders_type ON public.sh_content_orders(order_type);
CREATE INDEX IF NOT EXISTS idx_sh_content_orders_division ON public.sh_content_orders(division);
CREATE INDEX IF NOT EXISTS idx_sh_content_orders_status ON public.sh_content_orders(status);
CREATE INDEX IF NOT EXISTS idx_sh_content_orders_due ON public.sh_content_orders(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_content_orders_code ON public.sh_content_orders(order_code) WHERE order_code IS NOT NULL;

-- Content deliverable indexes
CREATE INDEX IF NOT EXISTS idx_sh_deliverables_order ON public.sh_content_deliverables(order_id);
CREATE INDEX IF NOT EXISTS idx_sh_deliverables_status ON public.sh_content_deliverables(status);

-- Production learner indexes
CREATE INDEX IF NOT EXISTS idx_sh_production_user ON public.sh_production_learners(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_production_learner ON public.sh_production_learners(learner_id) WHERE learner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_production_staff ON public.sh_production_learners(staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_production_department ON public.sh_production_learners(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_production_institution ON public.sh_production_learners(institution_id) WHERE institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_production_division ON public.sh_production_learners(division);
CREATE INDEX IF NOT EXISTS idx_sh_production_active ON public.sh_production_learners(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sh_production_code ON public.sh_production_learners(learner_code) WHERE learner_code IS NOT NULL;

-- Production assignment indexes
CREATE INDEX IF NOT EXISTS idx_sh_prod_assignments_deliverable ON public.sh_production_assignments(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_sh_prod_assignments_learner ON public.sh_production_assignments(learner_id);
CREATE INDEX IF NOT EXISTS idx_sh_prod_assignments_status ON public.sh_production_assignments(status);

-- Discovery visit indexes
CREATE INDEX IF NOT EXISTS idx_sh_visits_client ON public.sh_discovery_visits(client_id);
CREATE INDEX IF NOT EXISTS idx_sh_visits_solution ON public.sh_discovery_visits(solution_id) WHERE solution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_visits_date ON public.sh_discovery_visits(visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_sh_visits_followup ON public.sh_discovery_visits(follow_up_required, follow_up_date) WHERE follow_up_required = true;
CREATE INDEX IF NOT EXISTS idx_sh_visits_code ON public.sh_discovery_visits(visit_code) WHERE visit_code IS NOT NULL;

-- Communication indexes
CREATE INDEX IF NOT EXISTS idx_sh_comms_client ON public.sh_client_communications(client_id);
CREATE INDEX IF NOT EXISTS idx_sh_comms_solution ON public.sh_client_communications(solution_id) WHERE solution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_comms_phase ON public.sh_client_communications(phase_id) WHERE phase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_comms_type ON public.sh_client_communications(communication_type);
CREATE INDEX IF NOT EXISTS idx_sh_comms_date ON public.sh_client_communications(communication_date DESC);

-- Revenue split model indexes
CREATE INDEX IF NOT EXISTS idx_sh_split_models_type ON public.sh_revenue_split_models(solution_type);
CREATE INDEX IF NOT EXISTS idx_sh_split_models_default ON public.sh_revenue_split_models(is_default) WHERE is_default = true;

-- Payment indexes
CREATE INDEX IF NOT EXISTS idx_sh_payments_solution ON public.sh_payments(solution_id) WHERE solution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_payments_phase ON public.sh_payments(phase_id) WHERE phase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_payments_order ON public.sh_payments(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_payments_program ON public.sh_payments(program_id) WHERE program_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_payments_client ON public.sh_payments(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_payments_status ON public.sh_payments(status);
CREATE INDEX IF NOT EXISTS idx_sh_payments_type ON public.sh_payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_sh_payments_date ON public.sh_payments(payment_date) WHERE payment_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_payments_code ON public.sh_payments(payment_code) WHERE payment_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_payments_unprocessed ON public.sh_payments(split_processed, status) WHERE split_processed = false AND status = 'completed';

-- Earnings ledger indexes
CREATE INDEX IF NOT EXISTS idx_sh_earnings_payment ON public.sh_earnings_ledger(payment_id);
CREATE INDEX IF NOT EXISTS idx_sh_earnings_recipient ON public.sh_earnings_ledger(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_sh_earnings_builder ON public.sh_earnings_ledger(builder_id) WHERE builder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_earnings_cohort ON public.sh_earnings_ledger(cohort_member_id) WHERE cohort_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_earnings_production ON public.sh_earnings_ledger(production_learner_id) WHERE production_learner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_earnings_department ON public.sh_earnings_ledger(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_earnings_institution ON public.sh_earnings_ledger(institution_id) WHERE institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_earnings_status ON public.sh_earnings_ledger(status);
CREATE INDEX IF NOT EXISTS idx_sh_earnings_code ON public.sh_earnings_ledger(ledger_code) WHERE ledger_code IS NOT NULL;

-- Publication indexes
CREATE INDEX IF NOT EXISTS idx_sh_publications_solution ON public.sh_publications(solution_id) WHERE solution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_publications_phase ON public.sh_publications(phase_id) WHERE phase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_publications_institution ON public.sh_publications(institution_id) WHERE institution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_publications_department ON public.sh_publications(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_publications_type ON public.sh_publications(paper_type);
CREATE INDEX IF NOT EXISTS idx_sh_publications_status ON public.sh_publications(status);
CREATE INDEX IF NOT EXISTS idx_sh_publications_date ON public.sh_publications(publication_date) WHERE publication_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_publications_journal_type ON public.sh_publications(journal_type) WHERE journal_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_publications_code ON public.sh_publications(publication_code) WHERE publication_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_publications_indexed ON public.sh_publications(scopus_indexed, wos_indexed, ugc_listed);

-- Publication contributor indexes
CREATE INDEX IF NOT EXISTS idx_sh_pub_contributors_pub ON public.sh_publication_contributors(publication_id);
CREATE INDEX IF NOT EXISTS idx_sh_pub_contributors_builder ON public.sh_publication_contributors(builder_id) WHERE builder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_pub_contributors_cohort ON public.sh_publication_contributors(cohort_member_id) WHERE cohort_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_pub_contributors_learner ON public.sh_publication_contributors(learner_id) WHERE learner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_pub_contributors_staff ON public.sh_publication_contributors(staff_id) WHERE staff_id IS NOT NULL;

-- Accreditation metrics indexes
CREATE INDEX IF NOT EXISTS idx_sh_accred_type ON public.sh_accreditation_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_sh_accred_active ON public.sh_accreditation_metrics(is_active) WHERE is_active = true;

-- JICATE session indexes
CREATE INDEX IF NOT EXISTS idx_sh_jicate_solution ON public.sh_jicate_sessions(solution_id) WHERE solution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_jicate_phase ON public.sh_jicate_sessions(phase_id) WHERE phase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_jicate_client ON public.sh_jicate_sessions(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_jicate_date ON public.sh_jicate_sessions(session_date DESC);
CREATE INDEX IF NOT EXISTS idx_sh_jicate_booked_dept ON public.sh_jicate_sessions(booked_by_dept_id) WHERE booked_by_dept_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_jicate_facilitator ON public.sh_jicate_sessions(jicate_facilitator_id) WHERE jicate_facilitator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_jicate_outcome ON public.sh_jicate_sessions(outcome) WHERE outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_jicate_code ON public.sh_jicate_sessions(session_code) WHERE session_code IS NOT NULL;

-- Notification indexes
CREATE INDEX IF NOT EXISTS idx_sh_notifications_user ON public.sh_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_sh_notifications_unread ON public.sh_notifications(user_id, created_at DESC) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_sh_notifications_type ON public.sh_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_sh_notifications_entity ON public.sh_notifications(related_entity_type, related_entity_id) WHERE related_entity_id IS NOT NULL;

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_sh_audit_user ON public.sh_audit_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sh_audit_entity ON public.sh_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sh_audit_action ON public.sh_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_sh_audit_created ON public.sh_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sh_audit_code ON public.sh_audit_logs(entity_code) WHERE entity_code IS NOT NULL;

-- =====================================================
-- ENABLE ROW LEVEL SECURITY ON ALL SOLUTIONS HUB TABLES
-- =====================================================

ALTER TABLE public.sh_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_client_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_solution_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_solution_mous ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_builders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_builder_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_builder_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_prototype_iterations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_phase_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_implementation_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_training_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_cohort_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_cohort_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_content_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_content_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_production_learners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_production_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_discovery_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_client_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_revenue_split_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_earnings_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_publication_contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_accreditation_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_jicate_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sh_audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- END OF TABLE DEFINITIONS
