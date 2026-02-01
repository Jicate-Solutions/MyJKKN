-- ============================================================================
-- Migration: Modify Existing Tables for Workshop Transformation
-- Created: 2026-02-01
-- Purpose: Add new columns to existing tables to support outcome-focused
--          education model as part of Workshop Transformation
-- ============================================================================
-- This migration modifies:
--   - courses: Add learning hours, competency coverage fields
--   - learners_profiles: Add capabilities, career aspirations, readiness score
--   - staff: Add facilitator role, outcome metrics fields
--   - billing_discounts: Add outcome-based discount fields
-- ============================================================================
-- Related Plan: /Users/omm/.claude-sneakpeek/claudesp/config/plans/transient-Calibrating-lerdorf.md
-- Phase: 1.5 - Existing Module Modifications
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Modify courses table
-- Add learning hours breakdown and competency coverage fields
-- ============================================================================

-- Learning hours breakdown
ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS learning_hours_target INTEGER DEFAULT 0;

ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS self_study_hours INTEGER DEFAULT 0;

ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS practical_hours INTEGER DEFAULT 0;

ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS theory_hours INTEGER DEFAULT 0;

-- Competency coverage (links to competency_catalog)
ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS competency_coverage JSONB DEFAULT '[]'::jsonb;
-- competency_coverage format: [
--   { "competency_id": "uuid", "target_level": "intermediate", "weight": 0.3 },
--   { "competency_id": "uuid", "target_level": "advanced", "weight": 0.2 },
--   ...
-- ]

-- Add constraint for non-negative hours
ALTER TABLE public.courses
ADD CONSTRAINT courses_learning_hours_target_non_negative
CHECK (learning_hours_target IS NULL OR learning_hours_target >= 0);

ALTER TABLE public.courses
ADD CONSTRAINT courses_self_study_hours_non_negative
CHECK (self_study_hours IS NULL OR self_study_hours >= 0);

ALTER TABLE public.courses
ADD CONSTRAINT courses_practical_hours_non_negative
CHECK (practical_hours IS NULL OR practical_hours >= 0);

ALTER TABLE public.courses
ADD CONSTRAINT courses_theory_hours_non_negative
CHECK (theory_hours IS NULL OR theory_hours >= 0);

-- Add index for competency_coverage GIN search
CREATE INDEX IF NOT EXISTS idx_courses_competency_coverage
ON public.courses USING GIN(competency_coverage);

COMMENT ON COLUMN public.courses.learning_hours_target IS 'Total learning hours target for this course';
COMMENT ON COLUMN public.courses.self_study_hours IS 'Expected self-study hours per week';
COMMENT ON COLUMN public.courses.practical_hours IS 'Lab/practical hours per week';
COMMENT ON COLUMN public.courses.theory_hours IS 'Lecture/theory hours per week';
COMMENT ON COLUMN public.courses.competency_coverage IS 'JSON array mapping competencies to this course with target levels and weights';

RAISE NOTICE 'Modified courses table - added learning hours and competency coverage fields';

-- ============================================================================
-- STEP 2: Modify learners_profiles table
-- Add capabilities, career aspirations, and industry readiness tracking
-- ============================================================================

-- Capabilities JSONB for competency tracking
ALTER TABLE public.learners_profiles
ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '{}'::jsonb;
-- capabilities format: {
--   "competencies": [
--     {
--       "competency_id": "uuid",
--       "current_level": "intermediate",
--       "evidence": ["project_url", "certificate_url"],
--       "verified_at": "2025-01-20",
--       "verified_by": "staff_uuid"
--     }
--   ],
--   "summary": {
--     "technical_skills": 15,
--     "behavioral_skills": 8,
--     "domain_knowledge": 12
--   }
-- }

-- Career aspirations JSONB
ALTER TABLE public.learners_profiles
ADD COLUMN IF NOT EXISTS career_aspirations JSONB DEFAULT '{}'::jsonb;
-- career_aspirations format: {
--   "target_roles": ["Software Engineer", "Data Analyst"],
--   "preferred_industries": ["IT", "Finance"],
--   "location_preferences": ["Chennai", "Bangalore"],
--   "salary_expectations": "5-8 LPA",
--   "further_studies": false,
--   "entrepreneurship_interest": true,
--   "updated_at": "2026-01-15"
-- }

-- Industry readiness score (computed from competencies)
ALTER TABLE public.learners_profiles
ADD COLUMN IF NOT EXISTS industry_readiness_score NUMERIC(5,2) DEFAULT 0;

-- Add constraint for readiness score range
ALTER TABLE public.learners_profiles
ADD CONSTRAINT learners_profiles_readiness_score_range
CHECK (industry_readiness_score IS NULL OR (industry_readiness_score >= 0 AND industry_readiness_score <= 100));

-- Portfolio URL for showcasing work
ALTER TABLE public.learners_profiles
ADD COLUMN IF NOT EXISTS portfolio_url TEXT;

-- Add indexes for capabilities and career tracking
CREATE INDEX IF NOT EXISTS idx_learners_profiles_capabilities
ON public.learners_profiles USING GIN(capabilities);

CREATE INDEX IF NOT EXISTS idx_learners_profiles_career_aspirations
ON public.learners_profiles USING GIN(career_aspirations);

CREATE INDEX IF NOT EXISTS idx_learners_profiles_readiness_score
ON public.learners_profiles(industry_readiness_score DESC)
WHERE lifecycle_status = 'active';

COMMENT ON COLUMN public.learners_profiles.capabilities IS 'JSON object tracking competency achievements with evidence';
COMMENT ON COLUMN public.learners_profiles.career_aspirations IS 'JSON object for career goals, preferences, and aspirations';
COMMENT ON COLUMN public.learners_profiles.industry_readiness_score IS 'Computed score (0-100) indicating readiness for industry placement';
COMMENT ON COLUMN public.learners_profiles.portfolio_url IS 'URL to learner portfolio showcasing projects and achievements';

RAISE NOTICE 'Modified learners_profiles table - added capabilities, career tracking, and readiness score';

-- ============================================================================
-- STEP 3: Modify staff table
-- Add facilitator role and outcome metrics fields
-- ============================================================================

-- Role type to distinguish traditional teachers from facilitators
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS role_type VARCHAR(50) DEFAULT 'teacher';
-- role_type values: 'teacher', 'facilitator', 'trainer', 'industry_mentor', 'hybrid'

-- Facilitator certifications
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS facilitator_certification JSONB DEFAULT '[]'::jsonb;
-- facilitator_certification format: [
--   {
--     "certification_name": "Certified Industry Trainer",
--     "issuing_body": "NSDC",
--     "issue_date": "2025-06-15",
--     "expiry_date": "2028-06-15",
--     "certificate_url": "https://..."
--   },
--   ...
-- ]

-- Outcome metrics tracking
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS outcome_metrics JSONB DEFAULT '{}'::jsonb;
-- outcome_metrics format: {
--   "learners_mentored": 45,
--   "average_competency_improvement": 23.5,
--   "courses_with_competency_mapping": 8,
--   "industry_projects_facilitated": 3,
--   "placement_success_rate": 85.5,
--   "student_satisfaction_score": 4.2,
--   "last_computed": "2026-01-31"
-- }

-- Add index for role_type filtering
CREATE INDEX IF NOT EXISTS idx_staff_role_type
ON public.staff(role_type);

-- Add GIN indexes for JSONB fields
CREATE INDEX IF NOT EXISTS idx_staff_facilitator_certification
ON public.staff USING GIN(facilitator_certification);

CREATE INDEX IF NOT EXISTS idx_staff_outcome_metrics
ON public.staff USING GIN(outcome_metrics);

-- Add constraint for valid role types
ALTER TABLE public.staff
ADD CONSTRAINT staff_role_type_valid
CHECK (role_type IS NULL OR role_type IN ('teacher', 'facilitator', 'trainer', 'industry_mentor', 'hybrid'));

COMMENT ON COLUMN public.staff.role_type IS 'Staff role: teacher (traditional), facilitator (outcome-focused), trainer, industry_mentor, or hybrid';
COMMENT ON COLUMN public.staff.facilitator_certification IS 'JSON array of certifications relevant to facilitator role';
COMMENT ON COLUMN public.staff.outcome_metrics IS 'JSON object tracking outcome-based performance metrics';

RAISE NOTICE 'Modified staff table - added facilitator role and outcome metrics fields';

-- ============================================================================
-- STEP 4: Modify billing_discounts table
-- Add outcome-based discount support
-- ============================================================================

-- Flag to indicate outcome-based discount
ALTER TABLE public.billing_discounts
ADD COLUMN IF NOT EXISTS is_outcome_based BOOLEAN DEFAULT false;

-- Outcome criteria for automatic discount qualification
ALTER TABLE public.billing_discounts
ADD COLUMN IF NOT EXISTS outcome_criteria JSONB;
-- outcome_criteria format: {
--   "type": "competency_achievement",
--   "required_competencies": ["uuid1", "uuid2"],
--   "minimum_level": "intermediate",
--   "industry_readiness_threshold": 75,
--   "or_conditions": [
--     { "type": "attendance", "minimum_percentage": 90 },
--     { "type": "cgpa", "minimum_value": 8.5 }
--   ]
-- }

-- Verification details for outcome-based discounts
ALTER TABLE public.billing_discounts
ADD COLUMN IF NOT EXISTS outcome_verification JSONB;
-- outcome_verification format: {
--   "verified": true,
--   "verified_at": "2026-01-15",
--   "verified_by": "staff_uuid",
--   "competencies_verified": ["uuid1", "uuid2"],
--   "readiness_score_at_verification": 82.5,
--   "notes": "Met all competency requirements"
-- }

-- Add index for outcome-based discounts
CREATE INDEX IF NOT EXISTS idx_billing_discounts_outcome_based
ON public.billing_discounts(is_outcome_based)
WHERE is_outcome_based = true;

-- Add GIN indexes for JSONB criteria and verification
CREATE INDEX IF NOT EXISTS idx_billing_discounts_outcome_criteria
ON public.billing_discounts USING GIN(outcome_criteria)
WHERE outcome_criteria IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_discounts_outcome_verification
ON public.billing_discounts USING GIN(outcome_verification)
WHERE outcome_verification IS NOT NULL;

COMMENT ON COLUMN public.billing_discounts.is_outcome_based IS 'True if this discount is based on learner outcome achievements';
COMMENT ON COLUMN public.billing_discounts.outcome_criteria IS 'JSON defining competency/outcome criteria for automatic qualification';
COMMENT ON COLUMN public.billing_discounts.outcome_verification IS 'JSON tracking verification of outcome criteria fulfillment';

RAISE NOTICE 'Modified billing_discounts table - added outcome-based discount support';

-- ============================================================================
-- STEP 5: Add audit log entry
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migration_log') THEN
        INSERT INTO migration_log (migration_name, description, applied_at)
        VALUES (
            '20260201_modify_existing_tables_workshop',
            'Modified courses (learning hours, competency coverage), learners_profiles (capabilities, career, readiness), staff (facilitator role, metrics), billing_discounts (outcome-based). Part of Workshop Transformation Phase 1.5.',
            NOW()
        );
        RAISE NOTICE 'Added migration to migration_log';
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- Summary of Changes
-- ============================================================================
-- Tables Modified (4):
--
-- 1. courses:
--    - learning_hours_target INTEGER
--    - self_study_hours INTEGER
--    - practical_hours INTEGER
--    - theory_hours INTEGER
--    - competency_coverage JSONB
--    + 1 GIN index, 4 constraints
--
-- 2. learners_profiles:
--    - capabilities JSONB
--    - career_aspirations JSONB
--    - industry_readiness_score NUMERIC(5,2)
--    - portfolio_url TEXT
--    + 3 indexes, 1 constraint
--
-- 3. staff:
--    - role_type VARCHAR(50)
--    - facilitator_certification JSONB
--    - outcome_metrics JSONB
--    + 3 indexes, 1 constraint
--
-- 4. billing_discounts:
--    - is_outcome_based BOOLEAN
--    - outcome_criteria JSONB
--    - outcome_verification JSONB
--    + 3 indexes
--
-- Total New Columns: 15
-- Total New Indexes: 10
-- Total New Constraints: 6
-- ============================================================================

-- ============================================================================
-- DOWN MIGRATION (ROLLBACK) - Uncomment to run
-- ============================================================================
/*
BEGIN;

-- Rollback courses changes
DROP INDEX IF EXISTS idx_courses_competency_coverage;
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_theory_hours_non_negative;
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_practical_hours_non_negative;
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_self_study_hours_non_negative;
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_learning_hours_target_non_negative;
ALTER TABLE public.courses DROP COLUMN IF EXISTS competency_coverage;
ALTER TABLE public.courses DROP COLUMN IF EXISTS theory_hours;
ALTER TABLE public.courses DROP COLUMN IF EXISTS practical_hours;
ALTER TABLE public.courses DROP COLUMN IF EXISTS self_study_hours;
ALTER TABLE public.courses DROP COLUMN IF EXISTS learning_hours_target;

-- Rollback learners_profiles changes
DROP INDEX IF EXISTS idx_learners_profiles_readiness_score;
DROP INDEX IF EXISTS idx_learners_profiles_career_aspirations;
DROP INDEX IF EXISTS idx_learners_profiles_capabilities;
ALTER TABLE public.learners_profiles DROP CONSTRAINT IF EXISTS learners_profiles_readiness_score_range;
ALTER TABLE public.learners_profiles DROP COLUMN IF EXISTS portfolio_url;
ALTER TABLE public.learners_profiles DROP COLUMN IF EXISTS industry_readiness_score;
ALTER TABLE public.learners_profiles DROP COLUMN IF EXISTS career_aspirations;
ALTER TABLE public.learners_profiles DROP COLUMN IF EXISTS capabilities;

-- Rollback staff changes
DROP INDEX IF EXISTS idx_staff_outcome_metrics;
DROP INDEX IF EXISTS idx_staff_facilitator_certification;
DROP INDEX IF EXISTS idx_staff_role_type;
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_role_type_valid;
ALTER TABLE public.staff DROP COLUMN IF EXISTS outcome_metrics;
ALTER TABLE public.staff DROP COLUMN IF EXISTS facilitator_certification;
ALTER TABLE public.staff DROP COLUMN IF EXISTS role_type;

-- Rollback billing_discounts changes
DROP INDEX IF EXISTS idx_billing_discounts_outcome_verification;
DROP INDEX IF EXISTS idx_billing_discounts_outcome_criteria;
DROP INDEX IF EXISTS idx_billing_discounts_outcome_based;
ALTER TABLE public.billing_discounts DROP COLUMN IF EXISTS outcome_verification;
ALTER TABLE public.billing_discounts DROP COLUMN IF EXISTS outcome_criteria;
ALTER TABLE public.billing_discounts DROP COLUMN IF EXISTS is_outcome_based;

COMMIT;
*/
