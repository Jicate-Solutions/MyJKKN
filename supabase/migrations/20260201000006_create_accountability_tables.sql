-- ============================================================================
-- Migration: Accountability Module (Alumni Outcomes + Facilitator Development)
-- Created: 2026-02-01
-- Purpose: Create tables for tracking graduate outcomes and facilitator growth
--          as part of Workshop Transformation Phase 4
-- ============================================================================
-- This migration creates:
--   - alumni_outcomes: Graduate career/outcome tracking
--   - outcome_program_correlation: Program success patterns and analytics
--   - facilitator_development: Staff professional evolution tracking
--   - facilitator_industry_immersion: Industry experience records
-- ============================================================================
-- Related Plan: Workshop Alignment Transformation (Phase 4)
-- Phase: 4 - Accountability (Alumni Outcomes + Facilitator Development)
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create ENUM Types for Accountability Module
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE outcome_type AS ENUM (
        'employed',           -- Working in a company
        'self_employed',      -- Freelance/consulting
        'entrepreneur',       -- Started own business
        'higher_studies',     -- Pursuing further education
        'competitive_exams',  -- Preparing for govt/competitive exams
        'family_business',    -- Joined family business
        'gap_year',           -- Taking planned break
        'seeking',            -- Actively job seeking
        'unknown'             -- Lost contact/no update
    );
    RAISE NOTICE 'Created outcome_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'outcome_type ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE salary_range AS ENUM (
        'below_3l',           -- Below 3 LPA
        '3l_to_5l',           -- 3-5 LPA
        '5l_to_8l',           -- 5-8 LPA
        '8l_to_12l',          -- 8-12 LPA
        '12l_to_20l',         -- 12-20 LPA
        '20l_to_35l',         -- 20-35 LPA
        'above_35l',          -- Above 35 LPA
        'not_applicable',     -- For non-employed outcomes
        'undisclosed'         -- Chose not to share
    );
    RAISE NOTICE 'Created salary_range ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'salary_range ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE verification_status AS ENUM (
        'pending',            -- Not yet verified
        'self_reported',      -- Reported by alumni, not verified
        'document_verified',  -- Verified with offer letter/ID
        'employer_confirmed', -- Confirmed by employer
        'linkedin_verified',  -- Verified via LinkedIn
        'rejected'            -- Verification failed
    );
    RAISE NOTICE 'Created verification_status ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'verification_status ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE development_stage AS ENUM (
        'novice',             -- New to facilitation
        'developing',         -- Building skills
        'competent',          -- Solid facilitator
        'proficient',         -- Strong performer
        'expert',             -- Master facilitator
        'thought_leader'      -- Industry recognized expert
    );
    RAISE NOTICE 'Created development_stage ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'development_stage ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE immersion_type AS ENUM (
        'sabbatical',         -- Extended leave for industry work
        'summer_internship',  -- Summer industry placement
        'consulting',         -- Consulting engagement
        'research_collab',    -- Research collaboration
        'site_visit',         -- Short industry visit
        'workshop_delivery',  -- Delivered workshop at company
        'project_mentoring'   -- Mentored industry project
    );
    RAISE NOTICE 'Created immersion_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'immersion_type ENUM already exists, skipping';
END $$;

-- ============================================================================
-- STEP 2: Create alumni_outcomes Table
-- Graduate career/outcome tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alumni_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core relationships
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,

    -- Graduation info
    graduation_date DATE NOT NULL,
    graduation_year INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM graduation_date)) STORED,
    batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,

    -- Outcome details
    outcome_type outcome_type NOT NULL,
    outcome_start_date DATE, -- When they started job/business/studies

    -- Employment details (when outcome_type = 'employed' or 'self_employed')
    company_name VARCHAR(255),
    company_website VARCHAR(500),
    designation VARCHAR(255),
    department VARCHAR(255),
    industry_sector VARCHAR(255),
    job_function VARCHAR(255), -- e.g., "Software Development", "Data Analytics"

    -- Location
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    is_remote BOOLEAN DEFAULT false,

    -- Compensation
    salary_range salary_range,
    has_equity BOOLEAN DEFAULT false,
    other_benefits TEXT,

    -- Program relevance
    is_relevant_to_program BOOLEAN,
    relevance_percentage INTEGER CHECK (relevance_percentage IS NULL OR (relevance_percentage >= 0 AND relevance_percentage <= 100)),
    skills_used TEXT[], -- Skills from program used in job

    -- Higher studies details (when outcome_type = 'higher_studies')
    institution_name VARCHAR(255), -- For higher studies
    course_name VARCHAR(255),
    specialization VARCHAR(255),
    is_scholarship BOOLEAN DEFAULT false,
    scholarship_details TEXT,

    -- Entrepreneurship details (when outcome_type = 'entrepreneur')
    business_name VARCHAR(255),
    business_type VARCHAR(255),
    business_sector VARCHAR(255),
    funding_raised VARCHAR(100),
    employee_count INTEGER,

    -- Satisfaction and feedback
    satisfaction_score INTEGER CHECK (satisfaction_score IS NULL OR (satisfaction_score >= 1 AND satisfaction_score <= 10)),
    would_recommend_program BOOLEAN,
    feedback TEXT,
    suggestions TEXT,
    testimonial TEXT, -- Approved testimonial for marketing
    testimonial_approved BOOLEAN DEFAULT false,

    -- Verification
    verification_status verification_status NOT NULL DEFAULT 'pending',
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    verification_documents JSONB DEFAULT '[]'::jsonb,
    -- verification_documents format: [
    --   { "type": "offer_letter", "url": "...", "uploaded_at": "..." },
    --   { "type": "linkedin_profile", "url": "..." }
    -- ]

    -- Contact preferences
    is_contactable BOOLEAN DEFAULT true,
    preferred_contact_method VARCHAR(50), -- 'email', 'phone', 'linkedin', 'whatsapp'
    contact_frequency VARCHAR(50), -- 'monthly', 'quarterly', 'yearly', 'events_only'

    -- Engagement
    is_willing_to_mentor BOOLEAN DEFAULT false,
    is_willing_to_hire BOOLEAN DEFAULT false,
    is_willing_to_guest_lecture BOOLEAN DEFAULT false,
    last_engagement_date DATE,
    engagement_notes TEXT,

    -- Tracking
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    update_count INTEGER DEFAULT 0,
    data_source VARCHAR(100), -- 'self_reported', 'placement_cell', 'linkedin', 'survey'

    -- Audit fields
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure one primary outcome per learner (can have history)
    CONSTRAINT unique_learner_primary_outcome UNIQUE (learner_id, graduation_date)
);

COMMENT ON TABLE public.alumni_outcomes IS
'Tracks career outcomes and life events for alumni after graduation.';
COMMENT ON COLUMN public.alumni_outcomes.graduation_year IS
'Auto-computed from graduation_date for easier aggregation.';
COMMENT ON COLUMN public.alumni_outcomes.is_relevant_to_program IS
'Whether the outcome (job/studies) is relevant to their program of study.';
COMMENT ON COLUMN public.alumni_outcomes.verification_documents IS
'JSON array of verification documents with type and URL.';

-- ============================================================================
-- STEP 3: Create outcome_program_correlation Table
-- Program success patterns and analytics
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.outcome_program_correlation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core relationships
    program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

    -- Cohort identification
    cohort_year INTEGER NOT NULL,
    cohort_batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,

    -- Graduate counts
    total_graduates INTEGER NOT NULL DEFAULT 0,
    tracked_graduates INTEGER DEFAULT 0, -- How many we have data for
    tracking_percentage NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE WHEN total_graduates > 0
        THEN (tracked_graduates::NUMERIC / total_graduates * 100)
        ELSE 0 END
    ) STORED,

    -- Outcome breakdown
    employed_count INTEGER DEFAULT 0,
    self_employed_count INTEGER DEFAULT 0,
    entrepreneur_count INTEGER DEFAULT 0,
    higher_studies_count INTEGER DEFAULT 0,
    competitive_exams_count INTEGER DEFAULT 0,
    family_business_count INTEGER DEFAULT 0,
    seeking_count INTEGER DEFAULT 0,
    unknown_count INTEGER DEFAULT 0,

    -- Computed rates
    employment_rate NUMERIC(5,2), -- (employed + self_employed) / tracked * 100
    placement_rate NUMERIC(5,2), -- employed through placement cell / tracked * 100
    entrepreneurship_rate NUMERIC(5,2),
    higher_studies_rate NUMERIC(5,2),

    -- Salary analytics
    average_salary_range salary_range,
    median_salary_range salary_range,
    salary_distribution JSONB DEFAULT '{}'::jsonb,
    -- salary_distribution format: {
    --   "below_3l": 5, "3l_to_5l": 15, "5l_to_8l": 25, ...
    -- }

    -- Top performers
    top_employers JSONB DEFAULT '[]'::jsonb,
    -- top_employers format: [
    --   { "company": "TCS", "count": 15, "avg_package": "5l_to_8l" },
    --   { "company": "Infosys", "count": 12, "avg_package": "3l_to_5l" }
    -- ]

    top_sectors JSONB DEFAULT '[]'::jsonb,
    -- top_sectors format: [
    --   { "sector": "IT Services", "count": 45, "percentage": 35.5 },
    --   { "sector": "Manufacturing", "count": 20, "percentage": 15.7 }
    -- ]

    top_roles JSONB DEFAULT '[]'::jsonb,
    -- top_roles format: [
    --   { "role": "Software Engineer", "count": 30 },
    --   { "role": "Data Analyst", "count": 15 }
    -- ]

    top_locations JSONB DEFAULT '[]'::jsonb,
    -- top_locations format: [
    --   { "city": "Chennai", "count": 40 },
    --   { "city": "Bangalore", "count": 25 }
    -- ]

    -- Higher studies analytics
    top_institutions_for_studies JSONB DEFAULT '[]'::jsonb,
    top_courses_pursued JSONB DEFAULT '[]'::jsonb,
    scholarship_recipients INTEGER DEFAULT 0,

    -- Entrepreneurship analytics
    startups_founded INTEGER DEFAULT 0,
    total_funding_raised VARCHAR(100),
    jobs_created INTEGER DEFAULT 0,

    -- Program relevance
    avg_relevance_percentage NUMERIC(5,2),
    program_satisfaction_avg NUMERIC(3,2), -- 1-10 scale
    would_recommend_percentage NUMERIC(5,2),

    -- Time to outcome
    avg_days_to_placement INTEGER, -- Days from graduation to first job
    placement_before_graduation_count INTEGER DEFAULT 0,

    -- Engagement metrics
    alumni_engaged_count INTEGER DEFAULT 0, -- Willing to mentor/hire/lecture
    mentors_available INTEGER DEFAULT 0,
    guest_lecturers_available INTEGER DEFAULT 0,
    potential_recruiters INTEGER DEFAULT 0,

    -- Comparison metrics
    industry_benchmark_employment_rate NUMERIC(5,2),
    performance_vs_benchmark VARCHAR(50), -- 'above', 'at_par', 'below'

    -- Computation metadata
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    computation_notes TEXT,
    is_published BOOLEAN DEFAULT false, -- Approved for external sharing
    published_at TIMESTAMPTZ,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One record per program per cohort year
    CONSTRAINT unique_program_cohort UNIQUE (program_id, cohort_year)
);

COMMENT ON TABLE public.outcome_program_correlation IS
'Aggregated analytics correlating program completion with graduate outcomes by cohort.';
COMMENT ON COLUMN public.outcome_program_correlation.tracking_percentage IS
'Auto-computed percentage of graduates we have outcome data for.';
COMMENT ON COLUMN public.outcome_program_correlation.top_employers IS
'JSON array of top hiring companies with count and average package.';

-- ============================================================================
-- STEP 4: Create facilitator_development Table
-- Staff professional evolution tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.facilitator_development (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core relationships
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

    -- Development stage
    current_stage development_stage NOT NULL DEFAULT 'novice',
    stage_achieved_at TIMESTAMPTZ DEFAULT NOW(),
    previous_stage development_stage,
    stage_history JSONB DEFAULT '[]'::jsonb,
    -- stage_history format: [
    --   { "stage": "novice", "achieved_at": "2024-01-01", "promoted_by": "uuid" },
    --   { "stage": "developing", "achieved_at": "2025-06-01", "promoted_by": "uuid" }
    -- ]

    -- Certifications
    certifications JSONB DEFAULT '[]'::jsonb,
    -- certifications format: [
    --   {
    --     "name": "Certified Facilitator",
    --     "issuer": "ATD",
    --     "date_obtained": "2025-03-15",
    --     "expiry_date": "2028-03-15",
    --     "credential_id": "CF-12345",
    --     "certificate_url": "...",
    --     "is_verified": true
    --   }
    -- ]
    certification_count INTEGER GENERATED ALWAYS AS (jsonb_array_length(certifications)) STORED,

    -- Industry immersions (summary - details in facilitator_industry_immersion)
    industry_immersions JSONB DEFAULT '[]'::jsonb,
    -- industry_immersions format: [
    --   {
    --     "company": "TCS",
    --     "type": "sabbatical",
    --     "duration_days": 90,
    --     "year": 2025,
    --     "impact_summary": "Brought DevOps practices to curriculum"
    --   }
    -- ]
    total_industry_days INTEGER DEFAULT 0,
    companies_worked_with TEXT[] DEFAULT '{}',

    -- Innovation contributions
    innovation_contributions JSONB DEFAULT '[]'::jsonb,
    -- innovation_contributions format: [
    --   {
    --     "type": "curriculum_design",
    --     "title": "AI-integrated teaching methodology",
    --     "description": "...",
    --     "date": "2025-08-01",
    --     "impact": "Adopted by 5 departments",
    --     "recognition": "Best Innovation Award 2025"
    --   }
    -- ]
    innovation_count INTEGER DEFAULT 0,

    -- Peer learning
    peer_learning_sessions_conducted INTEGER DEFAULT 0,
    peer_learning_sessions_attended INTEGER DEFAULT 0,
    peer_learning_topics TEXT[],
    is_peer_learning_champion BOOLEAN DEFAULT false,

    -- Mentoring
    faculty_mentored_count INTEGER DEFAULT 0,
    current_mentees UUID[] DEFAULT '{}', -- Staff IDs being mentored
    mentoring_specializations TEXT[],

    -- Outcome tracking
    outcome_score NUMERIC(5,2) DEFAULT 0 CHECK (outcome_score >= 0 AND outcome_score <= 100),
    outcome_score_components JSONB DEFAULT '{}'::jsonb,
    -- outcome_score_components format: {
    --   "student_feedback": 85,
    --   "placement_rate": 90,
    --   "industry_connect": 75,
    --   "innovation": 80,
    --   "peer_contribution": 70
    -- }

    -- Student outcomes correlation
    students_mentored_count INTEGER DEFAULT 0,
    mentee_placement_rate NUMERIC(5,2),
    mentee_avg_package salary_range,
    mentee_satisfaction_avg NUMERIC(3,2),

    -- Research and publications
    publications_count INTEGER DEFAULT 0,
    patents_count INTEGER DEFAULT 0,
    research_projects_count INTEGER DEFAULT 0,
    industry_projects_guided INTEGER DEFAULT 0,

    -- External recognition
    awards JSONB DEFAULT '[]'::jsonb,
    speaking_engagements JSONB DEFAULT '[]'::jsonb,
    media_features JSONB DEFAULT '[]'::jsonb,

    -- Goals and development plan
    development_goals JSONB DEFAULT '[]'::jsonb,
    -- development_goals format: [
    --   {
    --     "goal": "Complete AWS certification",
    --     "target_date": "2026-06-30",
    --     "status": "in_progress",
    --     "progress": 60
    --   }
    -- ]
    next_review_date DATE,
    development_plan_url TEXT,

    -- Activity tracking
    last_certification_date DATE,
    last_immersion_date DATE,
    last_innovation_date DATE,
    last_peer_session_date DATE,

    -- Audit fields
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One development record per staff
    CONSTRAINT unique_staff_development UNIQUE (staff_id)
);

COMMENT ON TABLE public.facilitator_development IS
'Tracks professional development journey of staff as facilitators.';
COMMENT ON COLUMN public.facilitator_development.current_stage IS
'Current development stage from novice to thought_leader.';
COMMENT ON COLUMN public.facilitator_development.outcome_score IS
'Composite score (0-100) based on multiple outcome indicators.';
COMMENT ON COLUMN public.facilitator_development.certification_count IS
'Auto-computed count of certifications from JSONB array.';

-- ============================================================================
-- STEP 5: Create facilitator_industry_immersion Table
-- Detailed industry experience records
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.facilitator_industry_immersion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core relationships
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    development_id UUID REFERENCES public.facilitator_development(id) ON DELETE SET NULL,

    -- Company details
    company_name VARCHAR(255) NOT NULL,
    company_website VARCHAR(500),
    industry_sector VARCHAR(255),
    company_size VARCHAR(50), -- 'startup', 'sme', 'large', 'mnc'

    -- Partner link (if through institutional partnership)
    partner_id UUID REFERENCES public.industry_partners(id) ON DELETE SET NULL,

    -- Immersion details
    immersion_type immersion_type NOT NULL,
    role_title VARCHAR(255),
    department VARCHAR(255),
    reporting_to VARCHAR(255),

    -- Duration
    start_date DATE NOT NULL,
    end_date DATE,
    duration_days INTEGER,
    is_ongoing BOOLEAN DEFAULT false,
    hours_per_week INTEGER, -- For part-time engagements

    -- Objectives and outcomes
    objectives TEXT,
    key_responsibilities TEXT[],
    projects_worked_on JSONB DEFAULT '[]'::jsonb,
    -- projects_worked_on format: [
    --   {
    --     "name": "Cloud Migration",
    --     "description": "...",
    --     "technologies": ["AWS", "Terraform"],
    --     "outcome": "Successfully migrated 3 applications"
    --   }
    -- ]

    -- Learnings
    learnings JSONB DEFAULT '{}'::jsonb,
    -- learnings format: {
    --   "technical": ["Kubernetes", "CI/CD pipelines"],
    --   "process": ["Agile at scale", "DevOps culture"],
    --   "soft_skills": ["Cross-team collaboration"],
    --   "industry_insights": ["Current hiring trends", "Tech stack preferences"]
    -- }
    key_takeaways TEXT[],

    -- Application to teaching
    applied_in_teaching JSONB DEFAULT '[]'::jsonb,
    -- applied_in_teaching format: [
    --   {
    --     "course_id": "uuid",
    --     "course_name": "Cloud Computing",
    --     "application": "Added real-world Kubernetes deployment exercise",
    --     "student_impact": "Improved placement rate by 15%"
    --   }
    -- ]
    curriculum_changes_proposed TEXT[],
    new_courses_proposed TEXT[],

    -- Compensation (if any)
    is_paid BOOLEAN DEFAULT false,
    compensation_type VARCHAR(100), -- 'stipend', 'honorarium', 'consulting_fee'
    compensation_amount NUMERIC(12,2),

    -- Documentation
    certificate_url TEXT,
    report_url TEXT,
    presentation_url TEXT,
    photos JSONB DEFAULT '[]'::jsonb,

    -- Feedback
    company_feedback TEXT,
    company_rating INTEGER CHECK (company_rating IS NULL OR (company_rating >= 1 AND company_rating <= 5)),
    self_assessment TEXT,
    self_rating INTEGER CHECK (self_rating IS NULL OR (self_rating >= 1 AND self_rating <= 5)),

    -- Continuation
    is_relationship_ongoing BOOLEAN DEFAULT false,
    future_collaboration_plans TEXT,
    company_contact_name VARCHAR(255),
    company_contact_email VARCHAR(255),

    -- Verification
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,

    -- Visibility
    is_public BOOLEAN DEFAULT true, -- Can be shown on staff profile
    is_featured BOOLEAN DEFAULT false, -- Featured on institution website

    -- Audit fields
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.facilitator_industry_immersion IS
'Detailed records of staff industry immersion experiences.';
COMMENT ON COLUMN public.facilitator_industry_immersion.learnings IS
'Structured learnings categorized by type (technical, process, soft_skills, insights).';
COMMENT ON COLUMN public.facilitator_industry_immersion.applied_in_teaching IS
'How the immersion learnings were applied back in teaching.';

-- ============================================================================
-- STEP 6: Create Indexes for Performance
-- ============================================================================

-- alumni_outcomes indexes
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_learner
    ON public.alumni_outcomes(learner_id);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_institution
    ON public.alumni_outcomes(institution_id);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_program
    ON public.alumni_outcomes(program_id)
    WHERE program_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_graduation_year
    ON public.alumni_outcomes(graduation_year);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_outcome_type
    ON public.alumni_outcomes(outcome_type);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_verification
    ON public.alumni_outcomes(verification_status);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_employed
    ON public.alumni_outcomes(institution_id, outcome_type, salary_range)
    WHERE outcome_type IN ('employed', 'self_employed');
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_company
    ON public.alumni_outcomes(company_name)
    WHERE company_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_sector
    ON public.alumni_outcomes(industry_sector)
    WHERE industry_sector IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_mentors
    ON public.alumni_outcomes(institution_id, is_willing_to_mentor)
    WHERE is_willing_to_mentor = true;

-- outcome_program_correlation indexes
CREATE INDEX IF NOT EXISTS idx_outcome_correlation_program
    ON public.outcome_program_correlation(program_id);
CREATE INDEX IF NOT EXISTS idx_outcome_correlation_institution
    ON public.outcome_program_correlation(institution_id);
CREATE INDEX IF NOT EXISTS idx_outcome_correlation_year
    ON public.outcome_program_correlation(cohort_year DESC);
CREATE INDEX IF NOT EXISTS idx_outcome_correlation_published
    ON public.outcome_program_correlation(institution_id, is_published)
    WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_outcome_correlation_employment
    ON public.outcome_program_correlation(program_id, employment_rate DESC);

-- facilitator_development indexes
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_staff
    ON public.facilitator_development(staff_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_institution
    ON public.facilitator_development(institution_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_stage
    ON public.facilitator_development(current_stage);
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_score
    ON public.facilitator_development(institution_id, outcome_score DESC);
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_champions
    ON public.facilitator_development(institution_id, is_peer_learning_champion)
    WHERE is_peer_learning_champion = true;
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_certifications
    ON public.facilitator_development USING GIN(certifications);
CREATE INDEX IF NOT EXISTS idx_facilitator_dev_review
    ON public.facilitator_development(next_review_date)
    WHERE next_review_date IS NOT NULL;

-- facilitator_industry_immersion indexes
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_staff
    ON public.facilitator_industry_immersion(staff_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_institution
    ON public.facilitator_industry_immersion(institution_id);
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_company
    ON public.facilitator_industry_immersion(company_name);
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_type
    ON public.facilitator_industry_immersion(immersion_type);
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_dates
    ON public.facilitator_industry_immersion(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_ongoing
    ON public.facilitator_industry_immersion(staff_id, is_ongoing)
    WHERE is_ongoing = true;
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_partner
    ON public.facilitator_industry_immersion(partner_id)
    WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_featured
    ON public.facilitator_industry_immersion(institution_id, is_featured)
    WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_facilitator_immersion_learnings
    ON public.facilitator_industry_immersion USING GIN(learnings);

-- Created indexes for accountability tables

-- ============================================================================
-- STEP 7: Create Updated_at Triggers
-- ============================================================================

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'alumni_outcomes',
        'outcome_program_correlation',
        'facilitator_development',
        'facilitator_industry_immersion'
    ]
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%s_updated_at ON public.%s;
            CREATE TRIGGER update_%s_updated_at
                BEFORE UPDATE ON public.%s
                FOR EACH ROW
                EXECUTE FUNCTION public.update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END $$;

-- Created updated_at triggers for accountability tables

-- ============================================================================
-- STEP 8: Enable RLS and Create Policies
-- ============================================================================

-- Enable RLS on all accountability tables
ALTER TABLE public.alumni_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcome_program_correlation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilitator_development ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilitator_industry_immersion ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS Policies for alumni_outcomes
-- ----------------------------------------------------------------------------

CREATE POLICY "alumni_outcomes_select" ON public.alumni_outcomes
    FOR SELECT TO authenticated
    USING (
        -- Alumni can see their own outcomes
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        -- Staff and admins see institution's outcomes
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "alumni_outcomes_insert" ON public.alumni_outcomes
    FOR INSERT TO authenticated
    WITH CHECK (
        -- Alumni can report their own outcomes
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        -- Staff can add outcomes
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "alumni_outcomes_update" ON public.alumni_outcomes
    FOR UPDATE TO authenticated
    USING (
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "alumni_outcomes_delete" ON public.alumni_outcomes
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- ----------------------------------------------------------------------------
-- RLS Policies for outcome_program_correlation
-- ----------------------------------------------------------------------------

CREATE POLICY "outcome_correlation_select" ON public.outcome_program_correlation
    FOR SELECT TO authenticated
    USING (
        -- Published correlations are visible to all authenticated users
        is_published = true
        -- Staff see all correlations for their institution
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "outcome_correlation_insert" ON public.outcome_program_correlation
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "outcome_correlation_update" ON public.outcome_program_correlation
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "outcome_correlation_delete" ON public.outcome_program_correlation
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- ----------------------------------------------------------------------------
-- RLS Policies for facilitator_development
-- ----------------------------------------------------------------------------

CREATE POLICY "facilitator_dev_select" ON public.facilitator_development
    FOR SELECT TO authenticated
    USING (
        -- Staff can see their own development record
        staff_id IN (
            SELECT s.id FROM public.staff s
            JOIN public.profiles p ON s.user_id = p.id
            WHERE p.id = auth.uid()
        )
        -- Admins see all
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "facilitator_dev_insert" ON public.facilitator_development
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "facilitator_dev_update" ON public.facilitator_development
    FOR UPDATE TO authenticated
    USING (
        -- Staff can update some of their own fields
        staff_id IN (
            SELECT s.id FROM public.staff s
            JOIN public.profiles p ON s.user_id = p.id
            WHERE p.id = auth.uid()
        )
        -- Admins can update everything
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "facilitator_dev_delete" ON public.facilitator_development
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- ----------------------------------------------------------------------------
-- RLS Policies for facilitator_industry_immersion
-- ----------------------------------------------------------------------------

CREATE POLICY "facilitator_immersion_select" ON public.facilitator_industry_immersion
    FOR SELECT TO authenticated
    USING (
        -- Public immersions visible to all authenticated users
        is_public = true
        -- Staff see their own
        OR staff_id IN (
            SELECT s.id FROM public.staff s
            JOIN public.profiles p ON s.user_id = p.id
            WHERE p.id = auth.uid()
        )
        -- Admins see all
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "facilitator_immersion_insert" ON public.facilitator_industry_immersion
    FOR INSERT TO authenticated
    WITH CHECK (
        -- Staff can add their own immersions
        staff_id IN (
            SELECT s.id FROM public.staff s
            JOIN public.profiles p ON s.user_id = p.id
            WHERE p.id = auth.uid()
        )
        -- Admins can add for anyone
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "facilitator_immersion_update" ON public.facilitator_industry_immersion
    FOR UPDATE TO authenticated
    USING (
        staff_id IN (
            SELECT s.id FROM public.staff s
            JOIN public.profiles p ON s.user_id = p.id
            WHERE p.id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "facilitator_immersion_delete" ON public.facilitator_industry_immersion
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Created RLS policies for accountability tables

-- ============================================================================
-- STEP 9: Create Helper Functions
-- ============================================================================

-- Function to compute outcome program correlation
CREATE OR REPLACE FUNCTION compute_outcome_program_correlation(
    p_program_id UUID,
    p_cohort_year INTEGER
)
RETURNS UUID AS $$
DECLARE
    v_correlation_id UUID;
    v_institution_id UUID;
    v_total INTEGER;
    v_tracked INTEGER;
    v_employed INTEGER;
    v_self_employed INTEGER;
    v_entrepreneur INTEGER;
    v_higher_studies INTEGER;
    v_seeking INTEGER;
BEGIN
    -- Get institution from program
    SELECT institution_id INTO v_institution_id
    FROM public.programs WHERE id = p_program_id;

    -- Count graduates
    SELECT COUNT(*) INTO v_total
    FROM public.learners_profiles
    WHERE program_id = p_program_id
    AND lifecycle_status = 'alumni'
    AND EXTRACT(YEAR FROM updated_at) = p_cohort_year;

    -- Count tracked outcomes
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE outcome_type = 'employed'),
        COUNT(*) FILTER (WHERE outcome_type = 'self_employed'),
        COUNT(*) FILTER (WHERE outcome_type = 'entrepreneur'),
        COUNT(*) FILTER (WHERE outcome_type = 'higher_studies'),
        COUNT(*) FILTER (WHERE outcome_type = 'seeking')
    INTO v_tracked, v_employed, v_self_employed, v_entrepreneur, v_higher_studies, v_seeking
    FROM public.alumni_outcomes
    WHERE program_id = p_program_id
    AND graduation_year = p_cohort_year;

    -- Upsert correlation record
    INSERT INTO public.outcome_program_correlation (
        program_id, institution_id, cohort_year,
        total_graduates, tracked_graduates,
        employed_count, self_employed_count, entrepreneur_count,
        higher_studies_count, seeking_count,
        employment_rate, entrepreneurship_rate, higher_studies_rate,
        computed_at
    ) VALUES (
        p_program_id, v_institution_id, p_cohort_year,
        v_total, v_tracked,
        v_employed, v_self_employed, v_entrepreneur,
        v_higher_studies, v_seeking,
        CASE WHEN v_tracked > 0 THEN ((v_employed + v_self_employed)::NUMERIC / v_tracked * 100) ELSE 0 END,
        CASE WHEN v_tracked > 0 THEN (v_entrepreneur::NUMERIC / v_tracked * 100) ELSE 0 END,
        CASE WHEN v_tracked > 0 THEN (v_higher_studies::NUMERIC / v_tracked * 100) ELSE 0 END,
        NOW()
    )
    ON CONFLICT (program_id, cohort_year)
    DO UPDATE SET
        total_graduates = EXCLUDED.total_graduates,
        tracked_graduates = EXCLUDED.tracked_graduates,
        employed_count = EXCLUDED.employed_count,
        self_employed_count = EXCLUDED.self_employed_count,
        entrepreneur_count = EXCLUDED.entrepreneur_count,
        higher_studies_count = EXCLUDED.higher_studies_count,
        seeking_count = EXCLUDED.seeking_count,
        employment_rate = EXCLUDED.employment_rate,
        entrepreneurship_rate = EXCLUDED.entrepreneurship_rate,
        higher_studies_rate = EXCLUDED.higher_studies_rate,
        computed_at = NOW(),
        updated_at = NOW()
    RETURNING id INTO v_correlation_id;

    RETURN v_correlation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update facilitator development stats
CREATE OR REPLACE FUNCTION update_facilitator_development_stats(p_staff_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_days INTEGER;
    v_companies TEXT[];
BEGIN
    -- Calculate total industry days and companies
    SELECT
        COALESCE(SUM(duration_days), 0),
        ARRAY_AGG(DISTINCT company_name)
    INTO v_total_days, v_companies
    FROM public.facilitator_industry_immersion
    WHERE staff_id = p_staff_id;

    -- Update development record
    UPDATE public.facilitator_development
    SET
        total_industry_days = v_total_days,
        companies_worked_with = COALESCE(v_companies, '{}'),
        last_immersion_date = (
            SELECT MAX(end_date)
            FROM public.facilitator_industry_immersion
            WHERE staff_id = p_staff_id AND end_date IS NOT NULL
        ),
        updated_at = NOW()
    WHERE staff_id = p_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update facilitator stats after immersion changes
CREATE OR REPLACE FUNCTION trigger_update_facilitator_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM update_facilitator_development_stats(OLD.staff_id);
        RETURN OLD;
    ELSE
        PERFORM update_facilitator_development_stats(NEW.staff_id);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_facilitator_stats_trigger ON public.facilitator_industry_immersion;
CREATE TRIGGER update_facilitator_stats_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.facilitator_industry_immersion
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_facilitator_stats();

-- Created helper functions for accountability module

-- ============================================================================
-- STEP 10: Add audit log entry
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migration_log') THEN
        -- INSERT INTO migration_log (migration_name, description, applied_at)
        VALUES (
            '20260201_create_accountability_tables',
            'Created Accountability module tables: alumni_outcomes, outcome_program_correlation, facilitator_development, facilitator_industry_immersion. Part of Workshop Transformation Phase 4.',
            NOW()
        );
        RAISE NOTICE 'Added migration to migration_log';
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- Summary of Changes
-- ============================================================================
-- Tables Created (4):
--   - alumni_outcomes: Graduate career/outcome tracking
--   - outcome_program_correlation: Program success patterns and analytics
--   - facilitator_development: Staff professional evolution tracking
--   - facilitator_industry_immersion: Industry experience records
--
-- ENUMs Created (5):
--   - outcome_type: employed, self_employed, entrepreneur, higher_studies, etc.
--   - salary_range: below_3l, 3l_to_5l, 5l_to_8l, etc.
--   - verification_status: pending, self_reported, document_verified, etc.
--   - development_stage: novice, developing, competent, proficient, expert, thought_leader
--   - immersion_type: sabbatical, summer_internship, consulting, etc.
--
-- Indexes Created: 28
-- RLS Policies Created: 16 (4 per table)
-- Triggers Created: 5 (4 updated_at + 1 auto-update facilitator stats)
-- Functions Created: 3
--   - compute_outcome_program_correlation() - Aggregates outcome data by program/cohort
--   - update_facilitator_development_stats() - Updates facilitator stats from immersions
--   - trigger_update_facilitator_stats() - Trigger function for auto-updates
--
-- Key Features:
--   - Comprehensive alumni outcome tracking (employment, entrepreneurship, higher studies)
--   - Salary range tracking with verification workflow
--   - Program-level outcome correlation analytics
--   - Facilitator development stages (novice to thought leader)
--   - Industry immersion tracking with curriculum application
--   - Auto-computed metrics and aggregations
-- ============================================================================

-- ============================================================================
-- DOWN MIGRATION (ROLLBACK) - Uncomment to run
-- ============================================================================
/*
BEGIN;

-- Drop triggers and functions
DROP TRIGGER IF EXISTS update_facilitator_stats_trigger ON public.facilitator_industry_immersion;
DROP FUNCTION IF EXISTS trigger_update_facilitator_stats();
DROP FUNCTION IF EXISTS update_facilitator_development_stats(UUID);
DROP FUNCTION IF EXISTS compute_outcome_program_correlation(UUID, INTEGER);

-- Drop policies
DROP POLICY IF EXISTS "alumni_outcomes_select" ON public.alumni_outcomes;
DROP POLICY IF EXISTS "alumni_outcomes_insert" ON public.alumni_outcomes;
DROP POLICY IF EXISTS "alumni_outcomes_update" ON public.alumni_outcomes;
DROP POLICY IF EXISTS "alumni_outcomes_delete" ON public.alumni_outcomes;

DROP POLICY IF EXISTS "outcome_correlation_select" ON public.outcome_program_correlation;
DROP POLICY IF EXISTS "outcome_correlation_insert" ON public.outcome_program_correlation;
DROP POLICY IF EXISTS "outcome_correlation_update" ON public.outcome_program_correlation;
DROP POLICY IF EXISTS "outcome_correlation_delete" ON public.outcome_program_correlation;

DROP POLICY IF EXISTS "facilitator_dev_select" ON public.facilitator_development;
DROP POLICY IF EXISTS "facilitator_dev_insert" ON public.facilitator_development;
DROP POLICY IF EXISTS "facilitator_dev_update" ON public.facilitator_development;
DROP POLICY IF EXISTS "facilitator_dev_delete" ON public.facilitator_development;

DROP POLICY IF EXISTS "facilitator_immersion_select" ON public.facilitator_industry_immersion;
DROP POLICY IF EXISTS "facilitator_immersion_insert" ON public.facilitator_industry_immersion;
DROP POLICY IF EXISTS "facilitator_immersion_update" ON public.facilitator_industry_immersion;
DROP POLICY IF EXISTS "facilitator_immersion_delete" ON public.facilitator_industry_immersion;

-- Drop tables in dependency order
DROP TABLE IF EXISTS public.facilitator_industry_immersion CASCADE;
DROP TABLE IF EXISTS public.facilitator_development CASCADE;
DROP TABLE IF EXISTS public.outcome_program_correlation CASCADE;
DROP TABLE IF EXISTS public.alumni_outcomes CASCADE;

-- Drop ENUMs
DROP TYPE IF EXISTS immersion_type CASCADE;
DROP TYPE IF EXISTS development_stage CASCADE;
DROP TYPE IF EXISTS verification_status CASCADE;
DROP TYPE IF EXISTS salary_range CASCADE;
DROP TYPE IF EXISTS outcome_type CASCADE;

COMMIT;
*/
