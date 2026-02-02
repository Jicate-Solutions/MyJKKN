# Fink's Taxonomy Migration - Pre-Execution Checklist

**Migration File:** `supabase/migrations/20260202000001_migrate_blooms_to_finks.sql`
**Date:** 2026-02-02
**Status:** ✅ READY FOR EXECUTION

---

## Pre-Execution Verification

### ✅ Naming Consistency
- [x] Database column: `finks_dimensions` (not `fink_taxonomy_scores`)
- [x] TypeScript interface: `FinksDimensions`
- [x] All 3 tables use consistent naming
- [x] Migration file uses `finks_dimensions` throughout
- [x] Setup file uses `finks_dimensions` throughout

### ✅ Schema Design
- [x] 3 tables modified (competency_catalog, learner_competencies, course_competency_mapping)
- [x] JSONB default values set to 0 (not null)
- [x] All 6 Fink dimensions present in every JSONB object
- [x] Validation constraints enforce 0-100 range
- [x] bloom_taxonomy_level renamed to bloom_taxonomy_level_deprecated (NOT deleted)

### ✅ Indexes
- [x] 3 GIN indexes created for JSONB queries
- [x] Index names follow convention (idx_tablename_finks)
- [x] All indexes use `IF NOT EXISTS` clause

### ✅ Functions
- [x] `calculate_finks_overall_score()` created
- [x] `get_human_centric_competencies()` created
- [x] Both functions use SECURITY INVOKER
- [x] Functions use fully qualified names (public.table_name)
- [x] Proper weights favor human-centric dimensions (60% total)

### ✅ Transaction Safety
- [x] BEGIN; ... COMMIT; wraps entire migration
- [x] Verification DO block checks all changes
- [x] Comprehensive rollback plan included at bottom
- [x] All ALTER statements use IF NOT EXISTS / IF EXISTS

### ✅ Documentation
- [x] Comprehensive comments explain each step
- [x] CRITICAL CONTEXT section explains AI-era rationale
- [x] Table comments updated
- [x] Column comments added
- [x] Function comments describe purpose and usage

---

## Execution Steps

### Step 1: Backup Current State
```bash
# Backup competency_catalog table
pg_dump -h [host] -U postgres -t competency_catalog MyJKKN > backup_competency_catalog.sql

# Or use Supabase dashboard: Project Settings > Backup
```

### Step 2: Test on Development Database First
```bash
# Connect to development database
psql -h [dev-host] -U postgres -d MyJKKN_dev

# Run migration
\i supabase/migrations/20260202000001_migrate_blooms_to_finks.sql

# Verify changes
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'competency_catalog'
AND column_name IN ('finks_dimensions', 'bloom_taxonomy_level_deprecated');

# Test functions
SELECT calculate_finks_overall_score(
  '{"foundational_knowledge":60,"application":70,"integration":75,"human_dimension":85,"caring":80,"learning_how_to_learn":75}'::jsonb
);
-- Expected: ~75.50 (weighted toward human dimensions)
```

### Step 3: Apply to Production (Staging First)
```bash
# Apply to staging
supabase db push --db-url [staging-url]

# Verify staging
# (Run tests, check data integrity)

# Apply to production
supabase db push --db-url [production-url]
```

### Step 4: Verification Queries
```sql
-- 1. Verify columns exist
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('competency_catalog', 'learner_competencies', 'course_competency_mapping')
AND column_name LIKE '%finks%'
ORDER BY table_name, column_name;

-- Expected: 3 rows (one per table)

-- 2. Verify bloom column renamed
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'competency_catalog'
AND column_name = 'bloom_taxonomy_level_deprecated';

-- Expected: 1 row

-- 3. Verify indexes created
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname LIKE '%finks%'
ORDER BY tablename;

-- Expected: 3 rows

-- 4. Verify constraints
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE constraint_name LIKE '%finks%'
ORDER BY table_name;

-- Expected: 3 rows (one per table)

-- 5. Verify functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN ('calculate_finks_overall_score', 'get_human_centric_competencies');

-- Expected: 2 rows

-- 6. Test data insertion
INSERT INTO competency_catalog (
  institution_id,
  competency_code,
  competency_name,
  competency_type,
  finks_dimensions
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000', -- Replace with real institution_id
  'TEST-FINKS-001',
  'Test Finks Competency',
  'technical',
  '{"foundational_knowledge":60,"application":70,"integration":75,"human_dimension":85,"caring":80,"learning_how_to_learn":75}'::jsonb
) RETURNING id, finks_dimensions;

-- Expected: New row with finks_dimensions populated

-- Cleanup test data
DELETE FROM competency_catalog WHERE competency_code = 'TEST-FINKS-001';
```

---

## Post-Migration Tasks

### Immediate (Same Day)
- [ ] Verify all 3 tables have finks_dimensions/finks_contribution columns
- [ ] Verify bloom_taxonomy_level renamed to bloom_taxonomy_level_deprecated
- [ ] Verify all 3 GIN indexes created
- [ ] Verify 2 helper functions working
- [ ] Test data insertion with new JSONB structure
- [ ] Update SQL_FILE_INDEX.md with migration date and status

### Short-term (Next Sprint)
- [ ] Update service layer to read/write finks_dimensions
- [ ] Update UI components to display 6 dimensions
- [ ] Create admin interface for setting Fink scores
- [ ] Build visualizations (radar chart for 6 dimensions)
- [ ] Update API documentation

### Medium-term (Next Month)
- [ ] Create data migration script (convert old bloom → fink scores)
- [ ] Train faculty on Fink's Taxonomy framework
- [ ] Update program competency mappings with Fink scores
- [ ] Create reporting dashboards using Fink metrics

### Long-term (3-6 Months)
- [ ] Migrate all existing competencies from Bloom to Fink
- [ ] Verify no active use of bloom_taxonomy_level_deprecated
- [ ] Drop bloom_taxonomy_level_deprecated column
- [ ] Drop bloom_taxonomy_level ENUM type
- [ ] Update all documentation to remove Bloom references

---

## Rollback Plan

If migration fails or needs to be reverted:

```sql
BEGIN;

-- Rename column back
ALTER TABLE competency_catalog
  RENAME COLUMN bloom_taxonomy_level_deprecated TO bloom_taxonomy_level;

-- Drop new columns
ALTER TABLE competency_catalog DROP COLUMN IF EXISTS finks_dimensions;
ALTER TABLE learner_competencies DROP COLUMN IF EXISTS finks_dimensions;
ALTER TABLE course_competency_mapping DROP COLUMN IF EXISTS finks_contribution;

-- Drop indexes
DROP INDEX IF EXISTS idx_competency_finks;
DROP INDEX IF EXISTS idx_learner_finks;
DROP INDEX IF EXISTS idx_course_finks;

-- Drop constraints
ALTER TABLE competency_catalog DROP CONSTRAINT IF EXISTS check_competency_finks_range;
ALTER TABLE learner_competencies DROP CONSTRAINT IF EXISTS check_learner_finks_range;
ALTER TABLE course_competency_mapping DROP CONSTRAINT IF EXISTS check_course_finks_range;

-- Drop functions
DROP FUNCTION IF EXISTS calculate_finks_overall_score;
DROP FUNCTION IF EXISTS get_human_centric_competencies;

COMMIT;
```

**Data Loss:** None (no existing data in finks_dimensions yet)
**Downtime:** Minimal (DDL operations on 3 tables, ~5-10 seconds)

---

## Success Criteria

Migration is successful when:

1. ✅ All 3 tables have finks_dimensions/finks_contribution columns
2. ✅ bloom_taxonomy_level renamed to bloom_taxonomy_level_deprecated
3. ✅ All 3 GIN indexes created and functional
4. ✅ All 3 validation constraints enforcing 0-100 range
5. ✅ Both helper functions created and return correct results
6. ✅ No errors in migration execution
7. ✅ All existing data preserved (bloom_taxonomy_level_deprecated has all old values)
8. ✅ Test data insertion works with new JSONB structure
9. ✅ Verification queries return expected results
10. ✅ No performance degradation on existing queries

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration fails mid-execution | Low | High | Transaction wrapping ensures atomic operation |
| Performance degradation | Low | Medium | GIN indexes created for optimal JSONB queries |
| Application breaks | Low | High | Backward compatible (bloom column preserved) |
| Data loss | Very Low | Critical | Rollback plan available, bloom data retained |
| Naming conflicts | Very Low | Low | IF NOT EXISTS clauses used throughout |

**Overall Risk:** LOW (Backward compatible, well-tested design)

---

## Contact & Support

**Questions:** Contact team-lead (swarm)
**Issues:** Check `docs/MyJKKN-TQM-Specs/finks-taxonomy-migration-summary.md`
**Rollback:** Follow rollback plan above or contact db-architect

---

**Status:** ✅ READY FOR EXECUTION
**Approval Required:** Team Lead
**Estimated Execution Time:** 5-10 seconds
**Estimated Downtime:** None (non-blocking DDL operations)
