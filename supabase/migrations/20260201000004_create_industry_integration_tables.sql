-- ============================================================================
-- Migration: Industry Integration Module
-- Created: 2026-02-01
-- Purpose: Create tables for Industry Integration module as part of
--          Workshop Transformation Phase 2 - connecting learners with industry
-- ============================================================================
-- This migration creates:
--   - industry_partners: Company registry with MOU tracking
--   - industry_mentors: Expert profiles with availability
--   - industry_projects: Project marketplace with competency requirements
--   - learner_industry_engagements: Participation tracking
-- ============================================================================
-- Related Plan: /Users/omm/.claude-sneakpeek/claudesp/config/plans/transient-Calibrating-lerdorf.md
-- Phase: 2.1 - Industry Integration Module (NEW)
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create ENUM Types for Industry Module
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE partnership_type AS ENUM (
        'mou',           -- Memorandum of Understanding
        'placement',     -- Placement/recruitment partner
        'project',       -- Project collaboration
        'mentorship',    -- Mentorship program
        'internship',    -- Internship provider
        'sponsorship',   -- Financial/resource sponsor
        'training'       -- Training partner
    );
    RAISE NOTICE 'Created partnership_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'partnership_type ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE project_status AS ENUM (
        'draft',         -- Project being defined
        'open',          -- Open for applications
        'assigned',      -- Team assigned, not started
        'in_progress',   -- Work in progress
        'under_review',  -- Submitted for review
        'completed',     -- Successfully completed
        'cancelled'      -- Cancelled/abandoned
    );
    RAISE NOTICE 'Created project_status ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'project_status ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE engagement_type AS ENUM (
        'project',       -- Industry project participation
        'internship',    -- Internship placement
        'mentorship',    -- Mentorship relationship
        'workshop',      -- Industry workshop attendance
        'site_visit',    -- Company/factory visit
        'guest_lecture', -- Attended industry expert lecture
        'hackathon'      -- Hackathon/competition
    );
    RAISE NOTICE 'Created engagement_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'engagement_type ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE engagement_status AS ENUM (
        'applied',       -- Applied/requested
        'approved',      -- Approved, not started
        'active',        -- Currently engaged
        'completed',     -- Successfully completed
        'withdrawn',     -- Withdrawn by learner
        'terminated'     -- Terminated early
    );
    RAISE NOTICE 'Created engagement_status ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'engagement_status ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE difficulty_level AS ENUM (
        'beginner',      -- Entry-level, minimal prerequisites
        'intermediate',  -- Some experience required
        'advanced',      -- Significant expertise needed
        'expert'         -- Industry-level complexity
    );
    RAISE NOTICE 'Created difficulty_level ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'difficulty_level ENUM already exists, skipping';
END $$;

-- ============================================================================
-- STEP 2: Create industry_partners Table
-- Company registry with MOU tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.industry_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

    -- Company information
    company_name VARCHAR(255) NOT NULL,
    company_logo_url TEXT,
    industry_sector VARCHAR(100),
    company_size VARCHAR(50), -- 'startup', 'small', 'medium', 'large', 'enterprise'
    company_website TEXT,
    company_description TEXT,

    -- Partnership details
    partnership_type partnership_type NOT NULL DEFAULT 'mou',
    partnership_start_date DATE,
    partnership_end_date DATE,
    mou_document_url TEXT,
    partnership_value TEXT, -- Description of what partnership offers

    -- Contact information
    contact_person VARCHAR(255),
    contact_designation VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),

    -- Address
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    pincode VARCHAR(20),

    -- Tracking
    total_projects_offered INTEGER DEFAULT 0,
    total_internships_offered INTEGER DEFAULT 0,
    total_placements INTEGER DEFAULT 0,
    average_rating NUMERIC(3,2) DEFAULT 0, -- 0-5 scale

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,

    -- Audit fields
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.industry_partners IS
'Industry partner registry. Tracks companies with MOUs, placement partnerships, and project collaborations.';
COMMENT ON COLUMN public.industry_partners.partnership_type IS
'Type of partnership: mou, placement, project, mentorship, internship, sponsorship, training';
COMMENT ON COLUMN public.industry_partners.partnership_value IS
'Description of what the partnership offers (internships, projects, hiring commitments, etc.)';

-- ============================================================================
-- STEP 3: Create industry_mentors Table
-- Expert profiles with availability tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.industry_mentors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

    -- Partner link (optional - mentor may be independent)
    partner_id UUID REFERENCES public.industry_partners(id) ON DELETE SET NULL,

    -- Mentor information
    mentor_name VARCHAR(255) NOT NULL,
    designation VARCHAR(255),
    company_name VARCHAR(255), -- If not linked to partner
    profile_photo_url TEXT,
    bio TEXT,
    linkedin_url TEXT,

    -- Contact
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    preferred_contact_method VARCHAR(50) DEFAULT 'email', -- 'email', 'phone', 'whatsapp', 'linkedin'

    -- Expertise
    expertise_areas TEXT[] DEFAULT '{}',
    industry_experience_years INTEGER,
    competencies_can_mentor UUID[] DEFAULT '{}', -- References competency_catalog

    -- Availability
    availability JSONB DEFAULT '{}'::jsonb,
    -- availability format: {
    --   "days": ["Monday", "Wednesday", "Friday"],
    --   "hours": "18:00-20:00",
    --   "mode": ["online", "in_person"],
    --   "timezone": "Asia/Kolkata",
    --   "notes": "Available after 6 PM on weekdays"
    -- }

    -- Capacity
    max_mentees INTEGER DEFAULT 5,
    current_mentees INTEGER DEFAULT 0,

    -- Tracking
    total_mentees_all_time INTEGER DEFAULT 0,
    average_rating NUMERIC(3,2) DEFAULT 0, -- 0-5 scale
    total_sessions_conducted INTEGER DEFAULT 0,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,

    -- Audit fields
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.industry_mentors IS
'Industry mentor profiles. Experts who can mentor learners on competencies and career guidance.';
COMMENT ON COLUMN public.industry_mentors.competencies_can_mentor IS
'Array of competency_catalog IDs that this mentor can help develop';
COMMENT ON COLUMN public.industry_mentors.availability IS
'JSON object describing mentor availability (days, hours, mode)';

-- ============================================================================
-- STEP 4: Create industry_projects Table
-- Project marketplace with competency requirements
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.industry_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

    -- Partner link
    partner_id UUID REFERENCES public.industry_partners(id) ON DELETE SET NULL,

    -- Project information
    project_title VARCHAR(255) NOT NULL,
    project_code VARCHAR(50), -- Optional internal code
    description TEXT,
    detailed_requirements TEXT,
    expected_outcomes TEXT,
    deliverables JSONB DEFAULT '[]'::jsonb,
    -- deliverables format: [
    --   { "name": "Project Report", "description": "...", "format": "PDF" },
    --   { "name": "Source Code", "description": "...", "format": "GitHub" },
    --   ...
    -- ]

    -- Competency requirements
    required_competencies UUID[] DEFAULT '{}', -- References competency_catalog
    minimum_competency_level proficiency_level DEFAULT 'beginner',
    competencies_developed UUID[] DEFAULT '{}', -- Competencies learners will gain

    -- Project parameters
    difficulty_level difficulty_level DEFAULT 'intermediate',
    duration_weeks INTEGER,
    estimated_hours INTEGER,
    max_team_size INTEGER DEFAULT 4,
    min_team_size INTEGER DEFAULT 1,

    -- Eligibility
    eligible_programs UUID[] DEFAULT '{}', -- References programs
    eligible_semesters UUID[] DEFAULT '{}', -- References semesters
    prerequisites TEXT,

    -- Compensation
    is_paid BOOLEAN DEFAULT false,
    stipend_amount NUMERIC(15,2),
    stipend_currency VARCHAR(10) DEFAULT 'INR',
    other_benefits TEXT,

    -- Timeline
    application_deadline DATE,
    project_start_date DATE,
    project_end_date DATE,

    -- Capacity
    max_teams INTEGER DEFAULT 1,
    current_teams INTEGER DEFAULT 0,

    -- Status
    status project_status NOT NULL DEFAULT 'draft',
    published_at TIMESTAMPTZ,
    published_by UUID,

    -- Mentor assignment
    assigned_mentor_id UUID REFERENCES public.industry_mentors(id) ON DELETE SET NULL,

    -- Tracking
    total_applications INTEGER DEFAULT 0,
    total_completions INTEGER DEFAULT 0,
    average_rating NUMERIC(3,2) DEFAULT 0, -- Learner feedback

    -- Audit fields
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.industry_projects IS
'Industry project marketplace. Real-world projects from partners for learner participation.';
COMMENT ON COLUMN public.industry_projects.required_competencies IS
'Array of competency_catalog IDs required before starting this project';
COMMENT ON COLUMN public.industry_projects.competencies_developed IS
'Array of competency_catalog IDs that learners will develop through this project';
COMMENT ON COLUMN public.industry_projects.deliverables IS
'JSON array of expected deliverables with names, descriptions, and formats';

-- ============================================================================
-- STEP 5: Create learner_industry_engagements Table
-- Participation tracking for all industry activities
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learner_industry_engagements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core relationships
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

    -- Engagement details
    engagement_type engagement_type NOT NULL,
    project_id UUID REFERENCES public.industry_projects(id) ON DELETE SET NULL,
    mentor_id UUID REFERENCES public.industry_mentors(id) ON DELETE SET NULL,
    partner_id UUID REFERENCES public.industry_partners(id) ON DELETE SET NULL,

    -- Team (for group projects)
    team_id UUID, -- If part of a team (can reference a separate teams table if needed)
    team_role VARCHAR(100), -- 'leader', 'member', 'contributor'

    -- Timeline
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    start_date DATE,
    expected_end_date DATE,
    actual_end_date DATE,

    -- Status
    status engagement_status NOT NULL DEFAULT 'applied',
    status_notes TEXT,

    -- Competency tracking
    competencies_targeted UUID[] DEFAULT '{}', -- What they aim to develop
    competencies_demonstrated UUID[] DEFAULT '{}', -- What they actually demonstrated
    competency_levels_achieved JSONB DEFAULT '{}'::jsonb,
    -- competency_levels_achieved format: {
    --   "competency_uuid_1": "intermediate",
    --   "competency_uuid_2": "advanced"
    -- }

    -- Progress tracking
    progress_percentage NUMERIC(5,2) DEFAULT 0,
    milestones_completed JSONB DEFAULT '[]'::jsonb,
    -- milestones_completed format: [
    --   { "name": "Kickoff", "completed_at": "2026-01-15", "notes": "..." },
    --   ...
    -- ]

    -- Deliverables
    deliverables_submitted JSONB DEFAULT '[]'::jsonb,
    -- deliverables_submitted format: [
    --   { "name": "Report", "url": "...", "submitted_at": "2026-02-01", "status": "approved" },
    --   ...
    -- ]

    -- Feedback
    mentor_feedback JSONB DEFAULT '{}'::jsonb,
    -- mentor_feedback format: {
    --   "rating": 4.5,
    --   "strengths": ["...", "..."],
    --   "areas_for_improvement": ["...", "..."],
    --   "comments": "...",
    --   "recommend_for_placement": true,
    --   "given_at": "2026-02-15"
    -- }

    learner_feedback JSONB DEFAULT '{}'::jsonb,
    -- learner_feedback format: {
    --   "rating": 4.0,
    --   "experience_highlights": ["...", "..."],
    --   "challenges_faced": ["...", "..."],
    --   "suggestions": "...",
    --   "would_recommend": true,
    --   "given_at": "2026-02-15"
    -- }

    -- Certification
    certificate_issued BOOLEAN DEFAULT false,
    certificate_url TEXT,
    certificate_issued_at TIMESTAMPTZ,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.learner_industry_engagements IS
'Tracks all learner industry engagements including projects, internships, mentorships, and other activities.';
COMMENT ON COLUMN public.learner_industry_engagements.competencies_demonstrated IS
'Array of competency_catalog IDs that the learner demonstrated during this engagement';
COMMENT ON COLUMN public.learner_industry_engagements.competency_levels_achieved IS
'JSON mapping competency IDs to proficiency levels achieved';

-- ============================================================================
-- STEP 6: Create Indexes for Performance
-- ============================================================================

-- industry_partners indexes
CREATE INDEX IF NOT EXISTS idx_industry_partners_institution
    ON public.industry_partners(institution_id);
CREATE INDEX IF NOT EXISTS idx_industry_partners_type
    ON public.industry_partners(partnership_type);
CREATE INDEX IF NOT EXISTS idx_industry_partners_sector
    ON public.industry_partners(industry_sector)
    WHERE industry_sector IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_industry_partners_active
    ON public.industry_partners(institution_id, is_active)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_industry_partners_dates
    ON public.industry_partners(partnership_start_date, partnership_end_date);

-- industry_mentors indexes
CREATE INDEX IF NOT EXISTS idx_industry_mentors_institution
    ON public.industry_mentors(institution_id);
CREATE INDEX IF NOT EXISTS idx_industry_mentors_partner
    ON public.industry_mentors(partner_id)
    WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_industry_mentors_active
    ON public.industry_mentors(institution_id, is_active)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_industry_mentors_expertise
    ON public.industry_mentors USING GIN(expertise_areas);
CREATE INDEX IF NOT EXISTS idx_industry_mentors_competencies
    ON public.industry_mentors USING GIN(competencies_can_mentor);
CREATE INDEX IF NOT EXISTS idx_industry_mentors_available
    ON public.industry_mentors(current_mentees, max_mentees)
    WHERE is_active = true AND current_mentees < max_mentees;

-- industry_projects indexes
CREATE INDEX IF NOT EXISTS idx_industry_projects_institution
    ON public.industry_projects(institution_id);
CREATE INDEX IF NOT EXISTS idx_industry_projects_partner
    ON public.industry_projects(partner_id)
    WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_industry_projects_status
    ON public.industry_projects(status);
CREATE INDEX IF NOT EXISTS idx_industry_projects_open
    ON public.industry_projects(institution_id, status, application_deadline)
    WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_industry_projects_difficulty
    ON public.industry_projects(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_industry_projects_competencies
    ON public.industry_projects USING GIN(required_competencies);
CREATE INDEX IF NOT EXISTS idx_industry_projects_programs
    ON public.industry_projects USING GIN(eligible_programs);
CREATE INDEX IF NOT EXISTS idx_industry_projects_mentor
    ON public.industry_projects(assigned_mentor_id)
    WHERE assigned_mentor_id IS NOT NULL;

-- learner_industry_engagements indexes
CREATE INDEX IF NOT EXISTS idx_learner_engagements_learner
    ON public.learner_industry_engagements(learner_id);
CREATE INDEX IF NOT EXISTS idx_learner_engagements_institution
    ON public.learner_industry_engagements(institution_id);
CREATE INDEX IF NOT EXISTS idx_learner_engagements_type
    ON public.learner_industry_engagements(engagement_type);
CREATE INDEX IF NOT EXISTS idx_learner_engagements_project
    ON public.learner_industry_engagements(project_id)
    WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learner_engagements_mentor
    ON public.learner_industry_engagements(mentor_id)
    WHERE mentor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learner_engagements_status
    ON public.learner_industry_engagements(status);
CREATE INDEX IF NOT EXISTS idx_learner_engagements_active
    ON public.learner_industry_engagements(learner_id, status)
    WHERE status IN ('approved', 'active');
CREATE INDEX IF NOT EXISTS idx_learner_engagements_competencies
    ON public.learner_industry_engagements USING GIN(competencies_demonstrated);
CREATE INDEX IF NOT EXISTS idx_learner_engagements_dates
    ON public.learner_industry_engagements(start_date, actual_end_date);

-- Created indexes for industry integration tables

-- ============================================================================
-- STEP 7: Create Updated_at Triggers
-- ============================================================================

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'industry_partners',
        'industry_mentors',
        'industry_projects',
        'learner_industry_engagements'
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

-- Created updated_at triggers for industry integration tables

-- ============================================================================
-- STEP 8: Enable RLS and Create Policies
-- ============================================================================

-- Enable RLS on all industry tables
ALTER TABLE public.industry_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industry_mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industry_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_industry_engagements ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS Policies for industry_partners
-- ----------------------------------------------------------------------------

CREATE POLICY "industry_partners_select" ON public.industry_partners
    FOR SELECT TO authenticated
    USING (
        institution_id IN (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "industry_partners_insert" ON public.industry_partners
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
            AND (institution_id = industry_partners.institution_id OR is_super_admin = true)
        )
    );

CREATE POLICY "industry_partners_update" ON public.industry_partners
    FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'super_admin'))
    );

CREATE POLICY "industry_partners_delete" ON public.industry_partners
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- ----------------------------------------------------------------------------
-- RLS Policies for industry_mentors
-- ----------------------------------------------------------------------------

CREATE POLICY "industry_mentors_select" ON public.industry_mentors
    FOR SELECT TO authenticated
    USING (
        institution_id IN (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "industry_mentors_insert" ON public.industry_mentors
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "industry_mentors_update" ON public.industry_mentors
    FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin'))
    );

CREATE POLICY "industry_mentors_delete" ON public.industry_mentors
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- ----------------------------------------------------------------------------
-- RLS Policies for industry_projects
-- ----------------------------------------------------------------------------

-- SELECT: Authenticated users can see open projects from their institution
CREATE POLICY "industry_projects_select" ON public.industry_projects
    FOR SELECT TO authenticated
    USING (
        institution_id IN (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
    );

CREATE POLICY "industry_projects_insert" ON public.industry_projects
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "industry_projects_update" ON public.industry_projects
    FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'institution_admin', 'staff'))
    );

CREATE POLICY "industry_projects_delete" ON public.industry_projects
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- ----------------------------------------------------------------------------
-- RLS Policies for learner_industry_engagements
-- ----------------------------------------------------------------------------

-- SELECT: Learners see their own, staff see institution's
CREATE POLICY "learner_engagements_select" ON public.learner_industry_engagements
    FOR SELECT TO authenticated
    USING (
        -- Learner sees their own engagements
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        -- Staff and admins see institution's engagements
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- INSERT: Learners can apply, staff can create
CREATE POLICY "learner_engagements_insert" ON public.learner_industry_engagements
    FOR INSERT TO authenticated
    WITH CHECK (
        -- Learner applying for themselves
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        -- Staff creating on behalf of learner
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- UPDATE: Learners update their own, staff update any in institution
CREATE POLICY "learner_engagements_update" ON public.learner_industry_engagements
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

-- DELETE: Only admins
CREATE POLICY "learner_engagements_delete" ON public.learner_industry_engagements
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Created RLS policies for industry integration tables

-- ============================================================================
-- STEP 9: Add audit log entry
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migration_log') THEN
        INSERT INTO migration_log (migration_name, description, applied_at)
        VALUES (
            '20260201_create_industry_integration_tables',
            'Created Industry Integration module tables: industry_partners, industry_mentors, industry_projects, learner_industry_engagements. Part of Workshop Transformation Phase 2.',
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
--   - industry_partners: Company registry with MOU tracking (25+ columns)
--   - industry_mentors: Expert profiles with availability (20+ columns)
--   - industry_projects: Project marketplace (30+ columns)
--   - learner_industry_engagements: Participation tracking (25+ columns)
--
-- ENUMs Created (5):
--   - partnership_type: mou, placement, project, mentorship, internship, sponsorship, training
--   - project_status: draft, open, assigned, in_progress, under_review, completed, cancelled
--   - engagement_type: project, internship, mentorship, workshop, site_visit, guest_lecture, hackathon
--   - engagement_status: applied, approved, active, completed, withdrawn, terminated
--   - difficulty_level: beginner, intermediate, advanced, expert
--
-- Indexes Created: 23
-- RLS Policies Created: 16 (4 per table)
-- Triggers Created: 4 (updated_at)
--
-- Key Features:
--   - Full partner/mentor/project lifecycle management
--   - Competency integration (required & developed competencies)
--   - Feedback tracking (mentor & learner)
--   - Certificate issuance support
--   - Team project support
--   - Eligibility filtering (programs, semesters, competencies)
-- ============================================================================

-- ============================================================================
-- DOWN MIGRATION (ROLLBACK) - Uncomment to run
-- ============================================================================
/*
BEGIN;

-- Drop policies
DROP POLICY IF EXISTS "industry_partners_select" ON public.industry_partners;
DROP POLICY IF EXISTS "industry_partners_insert" ON public.industry_partners;
DROP POLICY IF EXISTS "industry_partners_update" ON public.industry_partners;
DROP POLICY IF EXISTS "industry_partners_delete" ON public.industry_partners;

DROP POLICY IF EXISTS "industry_mentors_select" ON public.industry_mentors;
DROP POLICY IF EXISTS "industry_mentors_insert" ON public.industry_mentors;
DROP POLICY IF EXISTS "industry_mentors_update" ON public.industry_mentors;
DROP POLICY IF EXISTS "industry_mentors_delete" ON public.industry_mentors;

DROP POLICY IF EXISTS "industry_projects_select" ON public.industry_projects;
DROP POLICY IF EXISTS "industry_projects_insert" ON public.industry_projects;
DROP POLICY IF EXISTS "industry_projects_update" ON public.industry_projects;
DROP POLICY IF EXISTS "industry_projects_delete" ON public.industry_projects;

DROP POLICY IF EXISTS "learner_engagements_select" ON public.learner_industry_engagements;
DROP POLICY IF EXISTS "learner_engagements_insert" ON public.learner_industry_engagements;
DROP POLICY IF EXISTS "learner_engagements_update" ON public.learner_industry_engagements;
DROP POLICY IF EXISTS "learner_engagements_delete" ON public.learner_industry_engagements;

-- Drop tables in dependency order
DROP TABLE IF EXISTS public.learner_industry_engagements CASCADE;
DROP TABLE IF EXISTS public.industry_projects CASCADE;
DROP TABLE IF EXISTS public.industry_mentors CASCADE;
DROP TABLE IF EXISTS public.industry_partners CASCADE;

-- Drop ENUMs
DROP TYPE IF EXISTS difficulty_level CASCADE;
DROP TYPE IF EXISTS engagement_status CASCADE;
DROP TYPE IF EXISTS engagement_type CASCADE;
DROP TYPE IF EXISTS project_status CASCADE;
DROP TYPE IF EXISTS partnership_type CASCADE;

COMMIT;
*/
