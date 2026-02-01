-- ============================================================================
-- Migration: Deprecate Learner OKR Tables
-- Created: 2026-02-01
-- Purpose: Soft-deprecate learner-specific OKR tables as part of Workshop
--          Transformation. Learner OKRs are being replaced by the Competency
--          module for outcome-focused tracking.
-- ============================================================================
-- This migration:
--   1. Adds deprecated_at column to learner OKR tables (all existing data preserved)
--   2. Creates RLS policies to block NEW inserts (existing data remains accessible)
--   3. Adds deprecation comments to tables
--   4. Does NOT delete any data - all historical learner OKR data preserved
-- ============================================================================
-- Related Plan: /Users/omm/.claude-sneakpeek/claudesp/config/plans/transient-Calibrating-lerdorf.md
-- Phase: 1.1 - OKR Module Restrictions
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Add deprecated_at columns to learner OKR tables
-- ============================================================================

-- Add deprecated_at to learner_core_okrs (institution-defined core OKRs)
ALTER TABLE public.learner_core_okrs
ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ DEFAULT NOW();

-- Add deprecated_at to learner_okr_assignments (learner assignments to core OKRs)
ALTER TABLE public.learner_okr_assignments
ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ DEFAULT NOW();

-- Add deprecated_at to learner_elective_okrs (learner self-defined OKRs)
ALTER TABLE public.learner_elective_okrs
ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ DEFAULT NOW();

RAISE NOTICE 'Added deprecated_at columns to learner OKR tables';

-- ============================================================================
-- STEP 2: Update table comments with deprecation notices
-- ============================================================================

COMMENT ON TABLE public.learner_core_okrs IS
'DEPRECATED 2026-02-01: Replaced by Competency module (competency_catalog, learner_competencies tables).
Institution-defined KRs that applied to all learners (attendance, grades, etc.).
Data preserved for historical reference. New inserts blocked via RLS policy.';

COMMENT ON TABLE public.learner_okr_assignments IS
'DEPRECATED 2026-02-01: Replaced by learner_competencies table.
Links between learners and their assigned core OKRs.
Data preserved for historical reference. New inserts blocked via RLS policy.';

COMMENT ON TABLE public.learner_elective_okrs IS
'DEPRECATED 2026-02-01: Personal goals now tracked via Learning Path module.
Self-defined personal goals by learners.
Data preserved for historical reference. New inserts blocked via RLS policy.';

COMMENT ON COLUMN public.learner_core_okrs.deprecated_at IS 'Timestamp when this table was deprecated. All records have this set.';
COMMENT ON COLUMN public.learner_okr_assignments.deprecated_at IS 'Timestamp when this table was deprecated. All records have this set.';
COMMENT ON COLUMN public.learner_elective_okrs.deprecated_at IS 'Timestamp when this table was deprecated. All records have this set.';

RAISE NOTICE 'Updated table comments with deprecation notices';

-- ============================================================================
-- STEP 3: Create RLS policies to block NEW inserts
-- Note: Existing data remains accessible for SELECT/UPDATE operations
-- ============================================================================

-- Drop existing insert policies first (if they exist)
DROP POLICY IF EXISTS "learner_core_okrs_insert" ON public.learner_core_okrs;
DROP POLICY IF EXISTS "learner_okr_assignments_insert" ON public.learner_okr_assignments;
DROP POLICY IF EXISTS "learner_elective_okrs_insert" ON public.learner_elective_okrs;

-- Block new inserts on learner_core_okrs
-- The WITH CHECK (false) ensures no new rows can be inserted
CREATE POLICY "block_new_learner_core_okrs" ON public.learner_core_okrs
    FOR INSERT TO authenticated
    WITH CHECK (false);

-- Block new inserts on learner_okr_assignments
CREATE POLICY "block_new_learner_okr_assignments" ON public.learner_okr_assignments
    FOR INSERT TO authenticated
    WITH CHECK (false);

-- Block new inserts on learner_elective_okrs
CREATE POLICY "block_new_learner_elective_okrs" ON public.learner_elective_okrs
    FOR INSERT TO authenticated
    WITH CHECK (false);

RAISE NOTICE 'Created RLS policies to block new inserts on deprecated learner OKR tables';

-- ============================================================================
-- STEP 4: Create indexes for deprecated_at column (for cleanup queries if needed)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_learner_core_okrs_deprecated_at
ON public.learner_core_okrs(deprecated_at);

CREATE INDEX IF NOT EXISTS idx_learner_okr_assignments_deprecated_at
ON public.learner_okr_assignments(deprecated_at);

CREATE INDEX IF NOT EXISTS idx_learner_elective_okrs_deprecated_at
ON public.learner_elective_okrs(deprecated_at);

RAISE NOTICE 'Created indexes on deprecated_at columns';

-- ============================================================================
-- STEP 5: Add audit comment tracking the deprecation
-- ============================================================================

DO $$
BEGIN
    -- Create migration_log entry if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migration_log') THEN
        INSERT INTO migration_log (migration_name, description, applied_at)
        VALUES (
            '20260201_deprecate_learner_okr_tables',
            'Soft-deprecated learner OKR tables (learner_core_okrs, learner_okr_assignments, learner_elective_okrs) as part of Workshop Transformation. Data preserved, new inserts blocked.',
            NOW()
        );
        RAISE NOTICE 'Added migration to migration_log';
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- Summary of Changes
-- ============================================================================
-- Tables Affected:
--   - learner_core_okrs: Added deprecated_at, blocked inserts
--   - learner_okr_assignments: Added deprecated_at, blocked inserts
--   - learner_elective_okrs: Added deprecated_at, blocked inserts
--
-- What Still Works:
--   - SELECT: All existing data remains accessible
--   - UPDATE: Existing records can still be updated
--   - DELETE: Existing records can still be deleted (by owners)
--
-- What's Blocked:
--   - INSERT: No new records can be created in these tables
--
-- Data Preserved:
--   - All existing learner OKR data is preserved
--   - Historical reference available via deprecated_at timestamp
--
-- Replacement:
--   - Core OKRs -> competency_catalog + learner_competencies
--   - Elective OKRs -> learning_paths + learning_path_steps
-- ============================================================================

-- ============================================================================
-- DOWN MIGRATION (ROLLBACK) - Uncomment to run
-- ============================================================================
/*
BEGIN;

-- Remove blocking policies
DROP POLICY IF EXISTS "block_new_learner_core_okrs" ON public.learner_core_okrs;
DROP POLICY IF EXISTS "block_new_learner_okr_assignments" ON public.learner_okr_assignments;
DROP POLICY IF EXISTS "block_new_learner_elective_okrs" ON public.learner_elective_okrs;

-- Restore original insert policies
CREATE POLICY "learner_core_okrs_insert" ON public.learner_core_okrs
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'manager')
            AND institution_id = learner_core_okrs.institution_id
        )
    );

CREATE POLICY "learner_okr_assignments_insert" ON public.learner_okr_assignments
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'system')
        )
    );

CREATE POLICY "learner_elective_okrs_insert" ON public.learner_elective_okrs
    FOR INSERT TO authenticated
    WITH CHECK (learner_id = auth.uid());

-- Remove deprecated_at columns
ALTER TABLE public.learner_core_okrs DROP COLUMN IF EXISTS deprecated_at;
ALTER TABLE public.learner_okr_assignments DROP COLUMN IF EXISTS deprecated_at;
ALTER TABLE public.learner_elective_okrs DROP COLUMN IF EXISTS deprecated_at;

-- Drop indexes
DROP INDEX IF EXISTS idx_learner_core_okrs_deprecated_at;
DROP INDEX IF EXISTS idx_learner_okr_assignments_deprecated_at;
DROP INDEX IF EXISTS idx_learner_elective_okrs_deprecated_at;

-- Restore original comments
COMMENT ON TABLE public.learner_core_okrs IS 'Institution-defined KRs that apply to all learners (attendance, grades, etc.)';
COMMENT ON TABLE public.learner_okr_assignments IS 'Links learners to their assigned core OKRs';
COMMENT ON TABLE public.learner_elective_okrs IS 'Self-defined personal goals by learners';

COMMIT;
*/
