-- ============================================
-- LEARNER ADMISSION FIELDS UPDATE MIGRATION
-- ============================================
-- Created: 2025-01-31
-- Purpose: Update entry type, scholarship type, and quota fields
-- Impact: ~2,300 learner_profiles records
-- ============================================

-- CRITICAL: This migration performs:
-- 1. Adds scholarship_type column (replaces first_graduate boolean)
-- 2. Migrates data: TRUE → 'FIRST GRADUATE', FALSE → 'NOT APPLICABLE'
-- 3. Adds CHECK constraints for data integrity
-- 4. Creates indexes for performance
-- 5. Drops old first_graduate column

-- ============================================
-- STEP 1: Add new scholarship_type column
-- ============================================
ALTER TABLE learners_profiles ADD COLUMN scholarship_type TEXT;

-- ============================================
-- STEP 2: Migrate existing data
-- ============================================
-- Convert boolean first_graduate to scholarship_type
UPDATE learners_profiles
SET scholarship_type = CASE
  WHEN first_graduate = true THEN 'FIRST GRADUATE'
  ELSE 'NOT APPLICABLE'
END;

-- ============================================
-- STEP 3: Add CHECK constraints for data integrity
-- ============================================

-- Scholarship Type constraint (4 valid values)
ALTER TABLE learners_profiles
ADD CONSTRAINT scholarship_type_check CHECK (
  scholarship_type IN (
    'FIRST GRADUATE',
    'PMS SCHOLARSHIP',
    '7.5% SCHOLARSHIP',
    'NOT APPLICABLE'
  )
);

-- Entry Type constraint (4 valid values - standardized on UI values)
ALTER TABLE learners_profiles
ADD CONSTRAINT entry_type_check CHECK (
  entry_type IN (
    'FIRST YEAR',
    'LATERAL ENTRY',
    'RE-ADMISSION',
    'COLLEGE TRANSFER'
  )
);

-- Quota constraint (3 valid values - removed NRI, added GOVERNMENT 7.5%)
ALTER TABLE learners_profiles
ADD CONSTRAINT quota_check CHECK (
  quota IN (
    'GOVERNMENT',
    'GOVERNMENT 7.5%',
    'MANAGEMENT'
  ) OR quota IS NULL  -- Quota is optional
);

-- ============================================
-- STEP 4: Make scholarship_type NOT NULL
-- ============================================
-- All records should have a value after migration
ALTER TABLE learners_profiles
ALTER COLUMN scholarship_type SET NOT NULL;

-- ============================================
-- STEP 5: Drop old first_graduate column
-- ============================================
-- No longer needed after migration to scholarship_type
ALTER TABLE learners_profiles
DROP COLUMN first_graduate;

-- ============================================
-- STEP 6: Create indexes for performance
-- ============================================

-- Index for scholarship_type filtering and grouping
CREATE INDEX idx_learners_profiles_scholarship_type
ON learners_profiles(scholarship_type);

-- Index for entry_type filtering and grouping
CREATE INDEX idx_learners_profiles_entry_type
ON learners_profiles(entry_type);

-- Partial index for quota (only where NOT NULL for efficiency)
CREATE INDEX idx_learners_profiles_quota
ON learners_profiles(quota)
WHERE quota IS NOT NULL;

-- ============================================
-- VALIDATION QUERIES (Run after migration)
-- ============================================
-- Uncomment these to verify migration success:

-- Should return 0 - no NULL values
-- SELECT COUNT(*) FROM learners_profiles WHERE scholarship_type IS NULL;

-- Should show distribution of scholarship types
-- SELECT scholarship_type, COUNT(*)
-- FROM learners_profiles
-- GROUP BY scholarship_type
-- ORDER BY COUNT(*) DESC;

-- Should show entry type distribution
-- SELECT entry_type, COUNT(*)
-- FROM learners_profiles
-- WHERE entry_type IS NOT NULL
-- GROUP BY entry_type
-- ORDER BY COUNT(*) DESC;

-- Should show quota distribution
-- SELECT quota, COUNT(*)
-- FROM learners_profiles
-- WHERE quota IS NOT NULL
-- GROUP BY quota
-- ORDER BY COUNT(*) DESC;

-- ============================================
-- ROLLBACK PLAN (Emergency only)
-- ============================================
-- If migration fails, restore from backup:
-- pg_dump -h <host> -U <user> -d <database> > backup_YYYYMMDD.sql
-- Then restore: psql -h <host> -U <user> -d <database> < backup_YYYYMMDD.sql
