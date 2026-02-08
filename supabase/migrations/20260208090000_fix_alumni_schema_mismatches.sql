-- ============================================================================
-- Fix Alumni Outcomes Schema Mismatches
-- Aligns database schema with TypeScript types in types/alumni.ts
-- Fixes critical field name mismatches and adds missing columns
-- Created: 2026-02-08 09:00:00
-- ============================================================================

-- ============================================================================
-- PART 1: Fix alumni_outcomes table
-- ============================================================================

-- Drop old columns that don't match types
ALTER TABLE alumni_outcomes DROP COLUMN IF EXISTS name;
ALTER TABLE alumni_outcomes DROP COLUMN IF EXISTS job_title;
ALTER TABLE alumni_outcomes DROP COLUMN IF EXISTS industry;
ALTER TABLE alumni_outcomes DROP COLUMN IF EXISTS location;
ALTER TABLE alumni_outcomes DROP COLUMN IF EXISTS is_core_domain;
ALTER TABLE alumni_outcomes DROP COLUMN IF EXISTS higher_study_institution;
ALTER TABLE alumni_outcomes DROP COLUMN IF EXISTS higher_study_program;
ALTER TABLE alumni_outcomes DROP COLUMN IF EXISTS startup_name;
ALTER TABLE alumni_outcomes DROP COLUMN IF EXISTS startup_industry;
ALTER TABLE alumni_outcomes DROP COLUMN IF EXISTS time_to_placement_days;
ALTER TABLE alumni_outcomes DROP COLUMN IF EXISTS competencies_utilized;
ALTER TABLE alumni_outcomes DROP COLUMN IF EXISTS linkedin_url;
ALTER TABLE alumni_outcomes DROP COLUMN IF EXISTS verified;

-- Note: learner_id kept nullable since existing data has NULLs (4 of 8 rows)
-- Future: backfill learner_ids then add NOT NULL constraint

-- Add graduation_date (important field, nullable for existing data)
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS graduation_date DATE;

-- Backfill graduation_date from graduation_year if possible
UPDATE alumni_outcomes
SET graduation_date = make_date(graduation_year, 6, 1)
WHERE graduation_date IS NULL AND graduation_year IS NOT NULL;

-- Add batch tracking
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL;

-- Add outcome timing
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS outcome_start_date DATE;

-- Add employment fields (correct names)
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS company_website TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS industry_sector TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS job_function TEXT;

-- Add location fields (separate city/state/country)
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS is_remote BOOLEAN;

-- Add compensation fields
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS has_equity BOOLEAN;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS other_benefits TEXT;

-- Add program relevance (correct field name)
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS is_relevant_to_program BOOLEAN;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS relevance_percentage INTEGER CHECK (relevance_percentage >= 0 AND relevance_percentage <= 100);
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS skills_used TEXT[];

-- Add higher studies fields (correct names)
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS institution_name TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS course_name TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS specialization TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS is_scholarship BOOLEAN;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS scholarship_details TEXT;

-- Add entrepreneurship fields (correct names)
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS business_sector TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS funding_raised TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS employee_count INTEGER;

-- Add satisfaction and feedback
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS would_recommend_program BOOLEAN;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS suggestions TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS testimonial TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS testimonial_approved BOOLEAN DEFAULT false;

-- Replace verified BOOLEAN with verification_status ENUM
DROP TYPE IF EXISTS verification_status_enum CASCADE;
CREATE TYPE verification_status_enum AS ENUM (
  'pending',
  'self_reported',
  'document_verified',
  'employer_confirmed',
  'linkedin_verified',
  'rejected'
);

ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS verification_status verification_status_enum DEFAULT 'pending';

-- Add verification fields
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS verification_notes TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS verification_documents JSONB;

-- Add contact preferences
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS is_contactable BOOLEAN;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS contact_frequency TEXT;

-- Add engagement tracking
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS is_willing_to_mentor BOOLEAN;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS is_willing_to_hire BOOLEAN;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS is_willing_to_guest_lecture BOOLEAN;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS last_engagement_date DATE;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS engagement_notes TEXT;

-- Add tracking metadata
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS reported_at TIMESTAMPTZ;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ;
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS update_count INTEGER DEFAULT 0;

-- Add created_by field
ALTER TABLE alumni_outcomes ADD COLUMN IF NOT EXISTS created_by UUID;

-- Update outcome_type ENUM to match types
DROP TYPE IF EXISTS outcome_type_enum CASCADE;
CREATE TYPE outcome_type_enum AS ENUM (
  'employed',
  'self_employed',
  'entrepreneur',
  'higher_studies',
  'competitive_exams',
  'family_business',
  'gap_year',
  'seeking',
  'unknown'
);

-- Create temp column with new ENUM
ALTER TABLE alumni_outcomes ADD COLUMN outcome_type_new outcome_type_enum;

-- Migrate data (map old values to new)
UPDATE alumni_outcomes SET outcome_type_new =
  CASE
    WHEN outcome_type = 'freelancer' THEN 'self_employed'::outcome_type_enum
    WHEN outcome_type = 'unemployed' THEN 'seeking'::outcome_type_enum
    WHEN outcome_type = 'higher_education' THEN 'higher_studies'::outcome_type_enum
    WHEN outcome_type IN ('employed', 'entrepreneur', 'higher_studies', 'self_employed', 'competitive_exams', 'family_business', 'gap_year', 'seeking', 'unknown')
      THEN outcome_type::outcome_type_enum
    ELSE 'unknown'::outcome_type_enum
  END;

-- Drop old column and rename new
ALTER TABLE alumni_outcomes DROP COLUMN outcome_type;
ALTER TABLE alumni_outcomes RENAME COLUMN outcome_type_new TO outcome_type;
ALTER TABLE alumni_outcomes ALTER COLUMN outcome_type SET NOT NULL;
ALTER TABLE alumni_outcomes ALTER COLUMN outcome_type SET DEFAULT 'employed';

-- Add salary_range ENUM to match types
DROP TYPE IF EXISTS salary_range_enum CASCADE;
CREATE TYPE salary_range_enum AS ENUM (
  'below_3l',
  '3l_to_5l',
  '5l_to_8l',
  '8l_to_12l',
  '12l_to_20l',
  '20l_to_35l',
  'above_35l',
  'not_applicable',
  'undisclosed'
);

-- Migrate salary_range to ENUM
ALTER TABLE alumni_outcomes ADD COLUMN salary_range_new salary_range_enum;

-- Map old salary_range text to new ENUM (covering all known values)
UPDATE alumni_outcomes SET salary_range_new =
  CASE salary_range
    WHEN '3-5 LPA' THEN '3l_to_5l'::salary_range_enum
    WHEN '4-6 LPA' THEN '3l_to_5l'::salary_range_enum
    WHEN '5-7 LPA' THEN '5l_to_8l'::salary_range_enum
    WHEN '5-8 LPA' THEN '5l_to_8l'::salary_range_enum
    WHEN '6-8 LPA' THEN '5l_to_8l'::salary_range_enum
    WHEN '8-12 LPA' THEN '8l_to_12l'::salary_range_enum
    WHEN '12-20 LPA' THEN '12l_to_20l'::salary_range_enum
    WHEN '12+ LPA' THEN '12l_to_20l'::salary_range_enum
    WHEN '20+ LPA' THEN '20l_to_35l'::salary_range_enum
    ELSE NULL
  END;

ALTER TABLE alumni_outcomes DROP COLUMN salary_range;
ALTER TABLE alumni_outcomes RENAME COLUMN salary_range_new TO salary_range;

-- ============================================================================
-- PART 2: Fix outcome_program_correlation table
-- ============================================================================

-- Drop old columns
ALTER TABLE outcome_program_correlation DROP COLUMN IF EXISTS department_id;
ALTER TABLE outcome_program_correlation DROP COLUMN IF EXISTS academic_year;
ALTER TABLE outcome_program_correlation DROP COLUMN IF EXISTS average_salary_lpa;
ALTER TABLE outcome_program_correlation DROP COLUMN IF EXISTS median_salary_lpa;
ALTER TABLE outcome_program_correlation DROP COLUMN IF EXISTS core_domain_percentage;
ALTER TABLE outcome_program_correlation DROP COLUMN IF EXISTS average_time_to_placement_days;
ALTER TABLE outcome_program_correlation DROP COLUMN IF EXISTS top_recruiters;
ALTER TABLE outcome_program_correlation DROP COLUMN IF EXISTS top_competencies;
ALTER TABLE outcome_program_correlation DROP COLUMN IF EXISTS satisfaction_average;
ALTER TABLE outcome_program_correlation DROP COLUMN IF EXISTS effectiveness_score;

-- Add cohort identification
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS cohort_year INTEGER NOT NULL DEFAULT 2024;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS cohort_batch_id UUID;

-- Add graduate tracking
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS tracked_graduates INTEGER;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS tracking_percentage NUMERIC(5,2);

-- Add outcome counts by type
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS employed_count INTEGER;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS self_employed_count INTEGER;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS higher_studies_count INTEGER;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS competitive_exams_count INTEGER;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS family_business_count INTEGER;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS seeking_count INTEGER;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS unknown_count INTEGER;

-- Add computed rates
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS employment_rate NUMERIC(5,2);
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS placement_rate NUMERIC(5,2);
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS entrepreneurship_rate NUMERIC(5,2);
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS higher_studies_rate NUMERIC(5,2);

-- Add salary analytics (ENUM ranges, not numbers)
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS average_salary_range salary_range_enum;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS median_salary_range salary_range_enum;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS salary_distribution JSONB;

-- Add top performers as JSONB
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS top_employers JSONB;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS top_sectors JSONB;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS top_roles JSONB;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS top_locations JSONB;

-- Add higher studies analytics
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS top_institutions_for_studies JSONB;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS top_courses_pursued JSONB;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS scholarship_recipients INTEGER;

-- Add entrepreneurship analytics
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS startups_founded INTEGER;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS total_funding_raised TEXT;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS jobs_created INTEGER;

-- Add program relevance
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS avg_relevance_percentage NUMERIC(5,2);
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS program_satisfaction_avg NUMERIC(3,1);
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS would_recommend_percentage NUMERIC(5,2);

-- Add time to outcome
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS avg_days_to_placement INTEGER;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS placement_before_graduation_count INTEGER;

-- Add engagement metrics
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS alumni_engaged_count INTEGER;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS mentors_available INTEGER;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS guest_lecturers_available INTEGER;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS potential_recruiters INTEGER;

-- Add comparison metrics
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS industry_benchmark_employment_rate NUMERIC(5,2);
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS performance_vs_benchmark TEXT;

-- Add metadata
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS computation_notes TEXT;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;
ALTER TABLE outcome_program_correlation ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Drop old unique constraint and add new one
ALTER TABLE outcome_program_correlation DROP CONSTRAINT IF EXISTS outcome_program_correlation_program_id_academic_year_key;
ALTER TABLE outcome_program_correlation ADD CONSTRAINT outcome_program_correlation_program_cohort_unique
  UNIQUE(program_id, cohort_year);

-- ============================================================================
-- PART 3: Update indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_batch ON alumni_outcomes(batch_id);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_learner ON alumni_outcomes(learner_id);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_verification_status ON alumni_outcomes(verification_status);
CREATE INDEX IF NOT EXISTS idx_alumni_outcomes_outcome_type ON alumni_outcomes(outcome_type);
CREATE INDEX IF NOT EXISTS idx_outcome_correlation_cohort_year ON outcome_program_correlation(cohort_year);
CREATE INDEX IF NOT EXISTS idx_outcome_correlation_published ON outcome_program_correlation(is_published);

-- ============================================================================
-- PART 4: Add data_source ENUM
-- ============================================================================

DROP TYPE IF EXISTS data_source_enum CASCADE;
CREATE TYPE data_source_enum AS ENUM (
  'self_reported',
  'phone_survey',
  'email_survey',
  'linkedin_scrape',
  'placement_cell',
  'employer_feedback',
  'alumni_meet',
  'manual_entry'
);

-- Migrate data_source to ENUM
ALTER TABLE alumni_outcomes ADD COLUMN data_source_new data_source_enum;

UPDATE alumni_outcomes SET data_source_new =
  CASE data_source
    WHEN 'self_reported' THEN 'self_reported'::data_source_enum
    WHEN 'verified' THEN 'document_verified'::data_source_enum  -- map old 'verified' to closest match
    WHEN 'alumni_survey' THEN 'phone_survey'::data_source_enum
    WHEN 'linkedin' THEN 'linkedin_scrape'::data_source_enum
    ELSE 'manual_entry'::data_source_enum
  END;

ALTER TABLE alumni_outcomes DROP COLUMN data_source;
ALTER TABLE alumni_outcomes RENAME COLUMN data_source_new TO data_source;

-- ============================================================================
-- PART 5: Comments for documentation
-- ============================================================================

COMMENT ON COLUMN alumni_outcomes.graduation_date IS 'CRITICAL: Actual graduation date (NOT NULL)';
COMMENT ON COLUMN alumni_outcomes.graduation_year IS 'Computed from graduation_date, for filtering';
COMMENT ON COLUMN alumni_outcomes.verification_status IS 'ENUM: pending, self_reported, document_verified, employer_confirmed, linkedin_verified, rejected';
COMMENT ON COLUMN alumni_outcomes.outcome_type IS 'ENUM: employed, self_employed, entrepreneur, higher_studies, competitive_exams, family_business, gap_year, seeking, unknown';
COMMENT ON COLUMN alumni_outcomes.salary_range IS 'ENUM salary range (not numeric amount)';
COMMENT ON COLUMN outcome_program_correlation.cohort_year IS 'INTEGER year (not academic_year string)';
COMMENT ON COLUMN outcome_program_correlation.average_salary_range IS 'ENUM salary range (not numeric LPA)';

-- Done
