-- Migration: Add Advanced Analytics Columns
-- Date: 2026-02-02
-- Purpose: Add columns required for advanced analytics features

-- ==================================================
-- 1. Add intake capacity fields to programs table
-- ==================================================

ALTER TABLE public.programs
ADD COLUMN IF NOT EXISTS sanctioned_intake INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_intake INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS academic_year_id UUID;

COMMENT ON COLUMN programs.sanctioned_intake IS 'Government approved intake capacity';
COMMENT ON COLUMN programs.actual_intake IS 'Actual students admitted';
COMMENT ON COLUMN programs.academic_year_id IS 'Reference to academic year for intake tracking';

-- ==================================================
-- 2. Add advanced analytics fields to learners_profiles
-- ==================================================

ALTER TABLE public.learners_profiles
ADD COLUMN IF NOT EXISTS school_type TEXT CHECK (school_type IN ('government', 'aided', 'private', 'cbse', 'icse', 'state_board')),
ADD COLUMN IF NOT EXISTS school_district TEXT,
ADD COLUMN IF NOT EXISTS school_taluk TEXT,
ADD COLUMN IF NOT EXISTS medium_of_instruction TEXT CHECK (medium_of_instruction IN ('english', 'tamil', 'both')),
ADD COLUMN IF NOT EXISTS location_type TEXT CHECK (location_type IN ('urban', 'semi_urban', 'rural')),
ADD COLUMN IF NOT EXISTS first_graduate BOOLEAN DEFAULT false;

COMMENT ON COLUMN learners_profiles.school_type IS 'Type of school student came from';
COMMENT ON COLUMN learners_profiles.school_district IS 'District of previous school';
COMMENT ON COLUMN learners_profiles.school_taluk IS 'Taluk of previous school';
COMMENT ON COLUMN learners_profiles.medium_of_instruction IS 'Medium of instruction in previous school';
COMMENT ON COLUMN learners_profiles.location_type IS 'Location classification of student residence';
COMMENT ON COLUMN learners_profiles.first_graduate IS 'Is this student first generation graduate in family';

-- ==================================================
-- 3. Create intake_history table for trend analytics
-- ==================================================

CREATE TABLE IF NOT EXISTS public.intake_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    sanctioned_intake INTEGER DEFAULT 0,
    actual_intake INTEGER DEFAULT 0,
    waitlist_count INTEGER DEFAULT 0,
    dropout_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(program_id, academic_year_id)
);

COMMENT ON TABLE intake_history IS 'Historical intake data for 3-year stability index and capacity analytics';

-- ==================================================
-- 4. Add indexes for performance optimization
-- ==================================================

-- Intake history indexes
CREATE INDEX IF NOT EXISTS idx_intake_history_program ON intake_history(program_id);
CREATE INDEX IF NOT EXISTS idx_intake_history_year ON intake_history(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_intake_history_institution ON intake_history(institution_id);

-- Learners profiles analytics indexes
CREATE INDEX IF NOT EXISTS idx_learners_profiles_school_type ON learners_profiles(school_type);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_location_type ON learners_profiles(location_type);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_medium_instruction ON learners_profiles(medium_of_instruction);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_first_graduate ON learners_profiles(first_graduate);

-- Programs academic year index
CREATE INDEX IF NOT EXISTS idx_programs_academic_year ON programs(academic_year_id);

-- ==================================================
-- 5. Grant necessary permissions
-- ==================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON intake_history TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ==================================================
-- Migration Complete
-- ==================================================
