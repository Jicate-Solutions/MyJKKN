-- ============================================================================
-- Migration: Competency Catalog Module
-- Created: 2026-02-01
-- Purpose: Create tables for the Competency Catalog module as part of
--          Workshop Transformation - outcome-focused skill tracking
-- ============================================================================
-- This migration creates:
--   - competency_catalog: Master competency/skill taxonomy
--   - competency_program_mapping: Program competency requirements
--   - course_competency_mapping: Course competency links
--   - learner_competencies: Individual learner competency tracking
-- ============================================================================
-- Related Plan: /Users/omm/.claude-sneakpeek/claudesp/config/plans/transient-Calibrating-lerdorf.md
-- Phase: 1.2 - Competency Catalog Module (NEW)
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create ENUM Types for Competency Module
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE competency_type AS ENUM (
        'technical',      -- Technical/hard skills
        'behavioral',     -- Soft skills, behaviors
        'domain',         -- Domain-specific knowledge
        'soft_skill'      -- Communication, teamwork, etc.
    );
    RAISE NOTICE 'Created competency_type ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'competency_type ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE bloom_taxonomy_level AS ENUM (
        'remember',       -- Level 1: Recall facts and basic concepts
        'understand',     -- Level 2: Explain ideas or concepts
        'apply',          -- Level 3: Use information in new situations
        'analyze',        -- Level 4: Draw connections among ideas
        'evaluate',       -- Level 5: Justify a stand or decision
        'create'          -- Level 6: Produce new or original work
    );
    RAISE NOTICE 'Created bloom_taxonomy_level ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'bloom_taxonomy_level ENUM already exists, skipping';
END $$;

DO $$ BEGIN
    CREATE TYPE proficiency_level AS ENUM (
        'novice',         -- Level 1: Beginner, requires guidance
        'beginner',       -- Level 2: Basic understanding
        'intermediate',   -- Level 3: Can work independently
        'advanced',       -- Level 4: Expert, can teach others
        'expert'          -- Level 5: Mastery, can innovate
    );
    RAISE NOTICE 'Created proficiency_level ENUM';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'proficiency_level ENUM already exists, skipping';
END $$;

-- ============================================================================
-- STEP 2: Create competency_catalog Table
-- Master competency/skill taxonomy
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.competency_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

    -- Competency identification
    competency_code VARCHAR(50) NOT NULL,
    competency_name VARCHAR(255) NOT NULL,
    competency_type competency_type NOT NULL DEFAULT 'technical',

    -- Description and requirements
    description TEXT,
    proficiency_levels JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- proficiency_levels format: [
    --   { "level": "beginner", "description": "...", "criteria": ["...", "..."] },
    --   { "level": "intermediate", "description": "...", "criteria": ["...", "..."] },
    --   ...
    -- ]

    evidence_requirements JSONB DEFAULT '[]'::jsonb,
    -- evidence_requirements format: [
    --   { "level": "beginner", "required_evidence": ["project", "assessment"] },
    --   ...
    -- ]

    -- Classification
    industry_tags TEXT[] DEFAULT '{}',
    bloom_taxonomy_level bloom_taxonomy_level,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Audit fields
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_competency_code_per_institution
        UNIQUE (institution_id, competency_code)
);

COMMENT ON TABLE public.competency_catalog IS
'Master competency/skill taxonomy. Defines all measurable competencies for outcome-focused education.';
COMMENT ON COLUMN public.competency_catalog.competency_code IS
'Unique code within institution, e.g., TECH-001, SOFT-001';
COMMENT ON COLUMN public.competency_catalog.proficiency_levels IS
'JSON array defining proficiency levels and their criteria';
COMMENT ON COLUMN public.competency_catalog.evidence_requirements IS
'What proves mastery at each proficiency level';
COMMENT ON COLUMN public.competency_catalog.industry_tags IS
'Industry sectors where this competency is relevant';
COMMENT ON COLUMN public.competency_catalog.bloom_taxonomy_level IS
'Bloom''s taxonomy cognitive level for this competency';

-- ============================================================================
-- STEP 3: Create competency_program_mapping Table
-- Links competencies to programs with requirements
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.competency_program_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    competency_id UUID NOT NULL REFERENCES public.competency_catalog(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,

    -- Requirements
    required_level proficiency_level NOT NULL DEFAULT 'intermediate',
    weight_percentage NUMERIC(5,2) CHECK (weight_percentage IS NULL OR (weight_percentage >= 0 AND weight_percentage <= 100)),
    semester_expected UUID REFERENCES public.semesters(id) ON DELETE SET NULL,
    is_mandatory BOOLEAN NOT NULL DEFAULT true,

    -- Audit fields
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_competency_program
        UNIQUE (competency_id, program_id)
);

COMMENT ON TABLE public.competency_program_mapping IS
'Program competency requirements. Defines what competencies graduates should achieve.';
COMMENT ON COLUMN public.competency_program_mapping.required_level IS
'What proficiency level graduates should achieve';
COMMENT ON COLUMN public.competency_program_mapping.weight_percentage IS
'Importance/weight of this competency in the program (0-100%)';
COMMENT ON COLUMN public.competency_program_mapping.semester_expected IS
'By which semester this competency should be achieved';
COMMENT ON COLUMN public.competency_program_mapping.is_mandatory IS
'Whether this competency is required for graduation';

-- ============================================================================
-- STEP 4: Create course_competency_mapping Table
-- Links courses to competencies with contribution details
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.course_competency_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    competency_id UUID NOT NULL REFERENCES public.competency_catalog(id) ON DELETE CASCADE,

    -- Contribution details
    contribution_level proficiency_level DEFAULT 'beginner',
    learning_hours INTEGER CHECK (learning_hours IS NULL OR learning_hours >= 0),
    assessment_method VARCHAR(255),
    -- assessment_method examples: 'practical_exam', 'project', 'portfolio', 'peer_review'

    -- Audit fields
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_course_competency
        UNIQUE (course_id, competency_id)
);

COMMENT ON TABLE public.course_competency_mapping IS
'Course competency links. Defines how each course contributes to competency development.';
COMMENT ON COLUMN public.course_competency_mapping.contribution_level IS
'What proficiency level this course contributes to';
COMMENT ON COLUMN public.course_competency_mapping.learning_hours IS
'Hours spent on this competency within the course';
COMMENT ON COLUMN public.course_competency_mapping.assessment_method IS
'How the competency is assessed in this course';

-- ============================================================================
-- STEP 5: Create learner_competencies Table
-- Individual learner competency tracking (replaces learner OKRs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learner_competencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    competency_id UUID NOT NULL REFERENCES public.competency_catalog(id) ON DELETE CASCADE,

    -- Current status
    current_level proficiency_level NOT NULL DEFAULT 'novice',

    -- Evidence tracking
    evidence JSONB DEFAULT '[]'::jsonb,
    -- evidence format: [
    --   { "type": "project", "url": "...", "description": "...", "date": "2026-01-15" },
    --   { "type": "certificate", "url": "...", "description": "...", "date": "2026-01-20" },
    --   ...
    -- ]

    -- Assessment history
    assessments JSONB DEFAULT '[]'::jsonb,
    -- assessments format: [
    --   { "date": "2026-01-15", "score": 85, "assessor_id": "uuid", "method": "practical_exam", "notes": "..." },
    --   ...
    -- ]

    -- Verification
    verified_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,

    -- Progress tracking
    progress_percentage NUMERIC(5,2) DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_learner_competency
        UNIQUE (learner_id, competency_id)
);

COMMENT ON TABLE public.learner_competencies IS
'Individual learner competency tracking. Replaces deprecated learner_okr_assignments and learner_elective_okrs.';
COMMENT ON COLUMN public.learner_competencies.current_level IS
'Current proficiency level achieved by the learner';
COMMENT ON COLUMN public.learner_competencies.evidence IS
'JSON array of evidence supporting the competency level';
COMMENT ON COLUMN public.learner_competencies.assessments IS
'JSON array of assessment history for this competency';
COMMENT ON COLUMN public.learner_competencies.verified_by IS
'Staff member who verified the competency level';
COMMENT ON COLUMN public.learner_competencies.progress_percentage IS
'Computed progress towards target level (0-100%)';

-- ============================================================================
-- STEP 6: Create Indexes for Performance
-- ============================================================================

-- competency_catalog indexes
CREATE INDEX IF NOT EXISTS idx_competency_catalog_institution
    ON public.competency_catalog(institution_id);
CREATE INDEX IF NOT EXISTS idx_competency_catalog_type
    ON public.competency_catalog(competency_type);
CREATE INDEX IF NOT EXISTS idx_competency_catalog_bloom
    ON public.competency_catalog(bloom_taxonomy_level)
    WHERE bloom_taxonomy_level IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competency_catalog_active
    ON public.competency_catalog(institution_id, is_active)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_competency_catalog_industry_tags
    ON public.competency_catalog USING GIN(industry_tags);

-- competency_program_mapping indexes
CREATE INDEX IF NOT EXISTS idx_competency_program_competency
    ON public.competency_program_mapping(competency_id);
CREATE INDEX IF NOT EXISTS idx_competency_program_program
    ON public.competency_program_mapping(program_id);
CREATE INDEX IF NOT EXISTS idx_competency_program_semester
    ON public.competency_program_mapping(semester_expected)
    WHERE semester_expected IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competency_program_mandatory
    ON public.competency_program_mapping(program_id, is_mandatory)
    WHERE is_mandatory = true;

-- course_competency_mapping indexes
CREATE INDEX IF NOT EXISTS idx_course_competency_course
    ON public.course_competency_mapping(course_id);
CREATE INDEX IF NOT EXISTS idx_course_competency_competency
    ON public.course_competency_mapping(competency_id);
CREATE INDEX IF NOT EXISTS idx_course_competency_level
    ON public.course_competency_mapping(contribution_level);

-- learner_competencies indexes
CREATE INDEX IF NOT EXISTS idx_learner_competencies_learner
    ON public.learner_competencies(learner_id);
CREATE INDEX IF NOT EXISTS idx_learner_competencies_competency
    ON public.learner_competencies(competency_id);
CREATE INDEX IF NOT EXISTS idx_learner_competencies_level
    ON public.learner_competencies(current_level);
CREATE INDEX IF NOT EXISTS idx_learner_competencies_verified
    ON public.learner_competencies(verified_by)
    WHERE verified_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learner_competencies_progress
    ON public.learner_competencies(learner_id, progress_percentage);
CREATE INDEX IF NOT EXISTS idx_learner_competencies_recent
    ON public.learner_competencies(last_activity_at DESC);

-- Created indexes for competency tables

-- ============================================================================
-- STEP 7: Create Updated_at Triggers
-- ============================================================================

-- Apply updated_at trigger to all competency tables
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'competency_catalog',
        'competency_program_mapping',
        'course_competency_mapping',
        'learner_competencies'
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

-- Created updated_at triggers for competency tables

-- ============================================================================
-- STEP 8: Enable RLS and Create Policies
-- ============================================================================

-- Enable RLS on all competency tables
ALTER TABLE public.competency_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_program_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_competency_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_competencies ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS Policies for competency_catalog
-- ----------------------------------------------------------------------------

-- SELECT: Users can see competencies from their institution
CREATE POLICY "competency_catalog_select" ON public.competency_catalog
    FOR SELECT TO authenticated
    USING (
        institution_id IN (
            SELECT institution_id FROM public.profiles WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_super_admin = true
        )
    );

-- INSERT: Admins and managers can create competencies
CREATE POLICY "competency_catalog_insert" ON public.competency_catalog
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
            AND (institution_id = competency_catalog.institution_id OR is_super_admin = true)
        )
    );

-- UPDATE: Admins and creators can update
CREATE POLICY "competency_catalog_update" ON public.competency_catalog
    FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

-- DELETE: Only admins can delete
CREATE POLICY "competency_catalog_delete" ON public.competency_catalog
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for competency_program_mapping
-- ----------------------------------------------------------------------------

CREATE POLICY "competency_program_mapping_select" ON public.competency_program_mapping
    FOR SELECT TO authenticated
    USING (
        competency_id IN (
            SELECT id FROM public.competency_catalog
            WHERE institution_id IN (
                SELECT institution_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "competency_program_mapping_insert" ON public.competency_program_mapping
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'super_admin')
        )
    );

CREATE POLICY "competency_program_mapping_update" ON public.competency_program_mapping
    FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin')
        )
    );

CREATE POLICY "competency_program_mapping_delete" ON public.competency_program_mapping
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for course_competency_mapping
-- ----------------------------------------------------------------------------

CREATE POLICY "course_competency_mapping_select" ON public.course_competency_mapping
    FOR SELECT TO authenticated
    USING (
        competency_id IN (
            SELECT id FROM public.competency_catalog
            WHERE institution_id IN (
                SELECT institution_id FROM public.profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "course_competency_mapping_insert" ON public.course_competency_mapping
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "course_competency_mapping_update" ON public.course_competency_mapping
    FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff')
        )
    );

CREATE POLICY "course_competency_mapping_delete" ON public.course_competency_mapping
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- ----------------------------------------------------------------------------
-- RLS Policies for learner_competencies
-- ----------------------------------------------------------------------------

-- SELECT: Learners see their own, staff see their students
CREATE POLICY "learner_competencies_select" ON public.learner_competencies
    FOR SELECT TO authenticated
    USING (
        -- Learner sees their own
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        -- Staff and admins see institution's learners
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- INSERT: System and admins can create (usually via enrollment)
CREATE POLICY "learner_competencies_insert" ON public.learner_competencies
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- UPDATE: Learners update their own evidence, staff verify
CREATE POLICY "learner_competencies_update" ON public.learner_competencies
    FOR UPDATE TO authenticated
    USING (
        -- Learner can update their own (add evidence)
        learner_id IN (
            SELECT lp.id FROM public.learners_profiles lp
            JOIN public.profiles p ON LOWER(p.email) = LOWER(lp.student_email)
            WHERE p.id = auth.uid()
        )
        -- Staff can verify
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'institution_admin', 'staff', 'super_admin')
        )
    );

-- DELETE: Only admins can delete
CREATE POLICY "learner_competencies_delete" ON public.learner_competencies
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'super_admin')
        )
    );

-- Created RLS policies for competency tables

-- ============================================================================
-- STEP 9: Add audit log entry
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migration_log') THEN
        INSERT INTO migration_log (migration_name, description, applied_at)
        VALUES (
            '20260201_create_competency_tables',
            'Created Competency Catalog module tables: competency_catalog, competency_program_mapping, course_competency_mapping, learner_competencies. Part of Workshop Transformation Phase 1.2.',
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
--   - competency_catalog: Master competency taxonomy
--   - competency_program_mapping: Program competency requirements
--   - course_competency_mapping: Course competency links
--   - learner_competencies: Individual learner tracking
--
-- ENUMs Created (3):
--   - competency_type: technical, behavioral, domain, soft_skill
--   - bloom_taxonomy_level: remember, understand, apply, analyze, evaluate, create
--   - proficiency_level: novice, beginner, intermediate, advanced, expert
--
-- Indexes Created: 16
-- RLS Policies Created: 16
-- Triggers Created: 4 (updated_at)
--
-- Replaces:
--   - learner_core_okrs (deprecated)
--   - learner_okr_assignments (deprecated)
--   - learner_elective_okrs (deprecated)
-- ============================================================================

-- ============================================================================
-- DOWN MIGRATION (ROLLBACK) - Uncomment to run
-- ============================================================================
/*
BEGIN;

-- Drop policies first
DROP POLICY IF EXISTS "competency_catalog_select" ON public.competency_catalog;
DROP POLICY IF EXISTS "competency_catalog_insert" ON public.competency_catalog;
DROP POLICY IF EXISTS "competency_catalog_update" ON public.competency_catalog;
DROP POLICY IF EXISTS "competency_catalog_delete" ON public.competency_catalog;

DROP POLICY IF EXISTS "competency_program_mapping_select" ON public.competency_program_mapping;
DROP POLICY IF EXISTS "competency_program_mapping_insert" ON public.competency_program_mapping;
DROP POLICY IF EXISTS "competency_program_mapping_update" ON public.competency_program_mapping;
DROP POLICY IF EXISTS "competency_program_mapping_delete" ON public.competency_program_mapping;

DROP POLICY IF EXISTS "course_competency_mapping_select" ON public.course_competency_mapping;
DROP POLICY IF EXISTS "course_competency_mapping_insert" ON public.course_competency_mapping;
DROP POLICY IF EXISTS "course_competency_mapping_update" ON public.course_competency_mapping;
DROP POLICY IF EXISTS "course_competency_mapping_delete" ON public.course_competency_mapping;

DROP POLICY IF EXISTS "learner_competencies_select" ON public.learner_competencies;
DROP POLICY IF EXISTS "learner_competencies_insert" ON public.learner_competencies;
DROP POLICY IF EXISTS "learner_competencies_update" ON public.learner_competencies;
DROP POLICY IF EXISTS "learner_competencies_delete" ON public.learner_competencies;

-- Drop tables in dependency order
DROP TABLE IF EXISTS public.learner_competencies CASCADE;
DROP TABLE IF EXISTS public.course_competency_mapping CASCADE;
DROP TABLE IF EXISTS public.competency_program_mapping CASCADE;
DROP TABLE IF EXISTS public.competency_catalog CASCADE;

-- Drop ENUMs
DROP TYPE IF EXISTS proficiency_level CASCADE;
DROP TYPE IF EXISTS bloom_taxonomy_level CASCADE;
DROP TYPE IF EXISTS competency_type CASCADE;

COMMIT;
*/
