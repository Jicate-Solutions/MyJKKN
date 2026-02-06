-- Migration: Create Competency Catalog Tables
-- Date: 2026-02-06
-- Description: Creates 4 tables for the Competency Catalog module:
--   1. competency_catalog - Master competency definitions (Fink's Taxonomy-based)
--   2. competency_program_mapping - Program-level competency requirements
--   3. course_competency_mapping - Course-to-competency links
--   4. learner_competencies - Individual learner competency tracking

-- ============================================================
-- 1. Master Competency Catalog (Fink's Taxonomy-based)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competency_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id),
    competency_code VARCHAR(50) NOT NULL,
    competency_name VARCHAR(255) NOT NULL,
    competency_type VARCHAR(50) NOT NULL CHECK (competency_type IN ('technical', 'behavioral', 'domain', 'soft_skill', 'metacognitive')),
    description TEXT,
    proficiency_levels JSONB NOT NULL DEFAULT '[
      {"level": "novice", "description": "Basic awareness", "criteria": []},
      {"level": "beginner", "description": "Can perform with guidance", "criteria": []},
      {"level": "intermediate", "description": "Can perform independently", "criteria": []},
      {"level": "advanced", "description": "Can teach others", "criteria": []},
      {"level": "expert", "description": "Industry-recognized mastery", "criteria": []}
    ]'::jsonb,
    evidence_requirements JSONB DEFAULT '[]'::jsonb,
    industry_tags TEXT[] DEFAULT '{}',
    finks_dimensions JSONB NOT NULL DEFAULT '{
      "foundational_knowledge": 0,
      "application": 0,
      "integration": 0,
      "human_dimension": 0,
      "caring": 0,
      "learning_to_learn": 0
    }'::jsonb,
    ai_resistance_score INTEGER DEFAULT 0 CHECK (ai_resistance_score >= 0 AND ai_resistance_score <= 100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(institution_id, competency_code)
);

COMMENT ON TABLE public.competency_catalog IS 'Master catalog of competencies based on Fink''s Taxonomy of Significant Learning';
COMMENT ON COLUMN public.competency_catalog.finks_dimensions IS 'Scores (0-100) for each of Fink''s 6 dimensions of significant learning';
COMMENT ON COLUMN public.competency_catalog.ai_resistance_score IS 'Score 0-100 indicating how resistant this competency is to AI automation';
COMMENT ON COLUMN public.competency_catalog.proficiency_levels IS 'Array of proficiency levels with criteria for assessment';

-- ============================================================
-- 2. Program Competency Requirements
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competency_program_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competency_id UUID NOT NULL REFERENCES public.competency_catalog(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
    required_level VARCHAR(50) NOT NULL DEFAULT 'intermediate',
    weight_percentage NUMERIC(5,2) DEFAULT 0,
    semester_expected UUID REFERENCES public.semesters(id),
    is_mandatory BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(competency_id, program_id)
);

COMMENT ON TABLE public.competency_program_mapping IS 'Maps which competencies are required for each academic program';

-- ============================================================
-- 3. Course Competency Links (Fink's-aligned)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.course_competency_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    competency_id UUID NOT NULL REFERENCES public.competency_catalog(id) ON DELETE CASCADE,
    contribution_level VARCHAR(50) DEFAULT 'moderate' CHECK (contribution_level IN ('minor', 'moderate', 'major', 'primary')),
    learning_hours INTEGER DEFAULT 0,
    finks_assessment_methods JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(course_id, competency_id)
);

COMMENT ON TABLE public.course_competency_mapping IS 'Links courses to competencies with contribution levels and Fink''s assessment methods';

-- ============================================================
-- 4. Learner Competency Tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.learner_competencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    competency_id UUID NOT NULL REFERENCES public.competency_catalog(id) ON DELETE CASCADE,
    current_level VARCHAR(50) NOT NULL DEFAULT 'novice',
    evidence JSONB DEFAULT '[]'::jsonb,
    assessments JSONB DEFAULT '[]'::jsonb,
    verified_by UUID REFERENCES public.staff(id),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(learner_id, competency_id)
);

COMMENT ON TABLE public.learner_competencies IS 'Tracks individual learner progress across competencies with evidence and verification';

-- ============================================================
-- INDEXES
-- ============================================================

-- competency_catalog indexes
CREATE INDEX IF NOT EXISTS idx_competency_catalog_institution ON public.competency_catalog(institution_id);
CREATE INDEX IF NOT EXISTS idx_competency_catalog_type ON public.competency_catalog(competency_type);
CREATE INDEX IF NOT EXISTS idx_competency_catalog_active ON public.competency_catalog(is_active);
CREATE INDEX IF NOT EXISTS idx_competency_catalog_institution_active ON public.competency_catalog(institution_id, is_active);

-- competency_program_mapping indexes
CREATE INDEX IF NOT EXISTS idx_competency_program_competency ON public.competency_program_mapping(competency_id);
CREATE INDEX IF NOT EXISTS idx_competency_program_program ON public.competency_program_mapping(program_id);

-- course_competency_mapping indexes
CREATE INDEX IF NOT EXISTS idx_course_competency_course ON public.course_competency_mapping(course_id);
CREATE INDEX IF NOT EXISTS idx_course_competency_competency ON public.course_competency_mapping(competency_id);

-- learner_competencies indexes
CREATE INDEX IF NOT EXISTS idx_learner_competencies_learner ON public.learner_competencies(learner_id);
CREATE INDEX IF NOT EXISTS idx_learner_competencies_competency ON public.learner_competencies(competency_id);
CREATE INDEX IF NOT EXISTS idx_learner_competencies_learner_level ON public.learner_competencies(learner_id, current_level);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.competency_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_program_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_competency_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_competencies ENABLE ROW LEVEL SECURITY;

-- competency_catalog policies
CREATE POLICY "competency_catalog_select_authenticated"
    ON public.competency_catalog FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "competency_catalog_insert_authenticated"
    ON public.competency_catalog FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "competency_catalog_update_authenticated"
    ON public.competency_catalog FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "competency_catalog_delete_authenticated"
    ON public.competency_catalog FOR DELETE
    TO authenticated
    USING (true);

-- competency_program_mapping policies
CREATE POLICY "competency_program_mapping_select_authenticated"
    ON public.competency_program_mapping FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "competency_program_mapping_insert_authenticated"
    ON public.competency_program_mapping FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "competency_program_mapping_update_authenticated"
    ON public.competency_program_mapping FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "competency_program_mapping_delete_authenticated"
    ON public.competency_program_mapping FOR DELETE
    TO authenticated
    USING (true);

-- course_competency_mapping policies
CREATE POLICY "course_competency_mapping_select_authenticated"
    ON public.course_competency_mapping FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "course_competency_mapping_insert_authenticated"
    ON public.course_competency_mapping FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "course_competency_mapping_update_authenticated"
    ON public.course_competency_mapping FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "course_competency_mapping_delete_authenticated"
    ON public.course_competency_mapping FOR DELETE
    TO authenticated
    USING (true);

-- learner_competencies policies
CREATE POLICY "learner_competencies_select_authenticated"
    ON public.learner_competencies FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "learner_competencies_insert_authenticated"
    ON public.learner_competencies FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "learner_competencies_update_authenticated"
    ON public.learner_competencies FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "learner_competencies_delete_authenticated"
    ON public.learner_competencies FOR DELETE
    TO authenticated
    USING (true);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION (reuse if exists)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to tables with updated_at column
CREATE TRIGGER update_competency_catalog_updated_at
    BEFORE UPDATE ON public.competency_catalog
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_learner_competencies_updated_at
    BEFORE UPDATE ON public.learner_competencies
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
