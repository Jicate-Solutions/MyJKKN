# Fink's Taxonomy Migration - Summary Report

**Date:** 2026-02-02
**Migration File:** `supabase/migrations/20260202000001_migrate_to_finks_taxonomy.sql`
**Status:** ✅ READY FOR REVIEW
**Impact:** HIGH - Shifts competency model from cognitive-only to holistic learning

---

## Executive Summary

This migration replaces Bloom's Taxonomy (1956, cognitive-focused) with Fink's Taxonomy (2003, holistic learning) in the MyJKKN competency catalog. This is **CRITICAL for AI-era education** where AI can perform all cognitive tasks (Bloom's domain) but humans must develop caring, relationships, and transformational capabilities (Fink's unique human dimensions).

---

## Why This Migration Matters

### The Problem with Bloom's Taxonomy in 2026

**Bloom's Taxonomy (1956)** defines 6 cognitive levels:
1. Remember - Recall facts and basic concepts
2. Understand - Explain ideas or concepts
3. Apply - Use information in new situations
4. Analyze - Draw connections among ideas
5. Evaluate - Justify a stand or decision
6. Create - Produce new or original work

**Critical Issue:** AI/LLMs can now perform ALL these cognitive tasks at expert level:
- ChatGPT/Claude can remember infinite facts
- AI can understand and explain complex concepts
- AI can apply knowledge to novel situations
- AI can analyze patterns across vast data
- AI can evaluate and make judgments
- AI can create original work (code, art, writing)

**Result:** A purely cognitive taxonomy no longer differentiates human value.

### The Solution: Fink's Taxonomy for Significant Learning

**Fink's Taxonomy (2003)** defines 6 dimensions of transformational learning:

| Dimension | Description | AI Era Relevance |
|-----------|-------------|------------------|
| **Foundational Knowledge** | Facts, terms, formulas, concepts | ⚠️ LOW - AI has perfect recall |
| **Application** | Critical thinking, practical skills, managing projects | 🟡 MEDIUM - AI applies, humans direct |
| **Integration** | Connecting ideas, people, realms of life | 🟢 HIGH - Requires human context |
| **Human Dimension** | Learning about oneself and others | 🔴 CRITICAL - AI lacks self-awareness |
| **Caring** | Developing feelings, interests, values | 🔴 CRITICAL - AI is amoral |
| **Learning How to Learn** | Becoming self-directed learner | 🔴 CRITICAL - Adapting to AI evolution |

**Key Insight:** The last three dimensions (Human Dimension, Caring, Learning to Learn) are **UNIQUELY HUMAN** and become MORE valuable as AI capabilities expand.

---

## Database Changes

### New Column: `fink_taxonomy_scores`

```sql
ALTER TABLE public.competency_catalog
ADD COLUMN fink_taxonomy_scores JSONB DEFAULT '{
  "foundational_knowledge": null,
  "application": null,
  "integration": null,
  "human_dimension": null,
  "caring": null,
  "learning_how_to_learn": null
}'::jsonb;
```

**Structure:**
- **Type:** JSONB
- **Scores:** 0-100 for each dimension (nullable)
- **Defaults:** All dimensions null (to be populated)
- **Interpretation:**
  - 0-20: Novice
  - 21-40: Beginner
  - 41-60: Intermediate
  - 61-80: Advanced
  - 81-100: Expert

### Deprecated Column: `bloom_taxonomy_level`

```sql
COMMENT ON COLUMN public.competency_catalog.bloom_taxonomy_level IS
'DEPRECATED (2026-02-02): Bloom''s Taxonomy level (cognitive-only).
Kept for backward compatibility. New entries should use fink_taxonomy_scores.
Will be removed in future version after data migration.';
```

**Status:**
- ❌ NOT deleted (backward compatibility)
- ⚠️ Marked as DEPRECATED
- 🔜 Will be removed after full data migration

### New Constraint: Score Validation

```sql
ALTER TABLE public.competency_catalog
ADD CONSTRAINT check_fink_scores_range CHECK (
  fink_taxonomy_scores IS NULL OR (
    (fink_taxonomy_scores->>'foundational_knowledge')::numeric BETWEEN 0 AND 100 AND
    (fink_taxonomy_scores->>'application')::numeric BETWEEN 0 AND 100 AND
    (fink_taxonomy_scores->>'integration')::numeric BETWEEN 0 AND 100 AND
    (fink_taxonomy_scores->>'human_dimension')::numeric BETWEEN 0 AND 100 AND
    (fink_taxonomy_scores->>'caring')::numeric BETWEEN 0 AND 100 AND
    (fink_taxonomy_scores->>'learning_how_to_learn')::numeric BETWEEN 0 AND 100
  )
);
```

**Purpose:** Ensures all scores are valid (0-100 or null)

### New Indexes (5 total)

| Index Name | Type | Purpose | Performance Impact |
|------------|------|---------|-------------------|
| `idx_competency_catalog_fink_scores` | GIN | Fast JSONB queries | 🟢 High value for filtering |
| `idx_competency_catalog_fink_foundational` | Partial | Filter by foundational knowledge | 🟡 Medium value |
| `idx_competency_catalog_fink_application` | Partial | Filter by application skills | 🟡 Medium value |
| `idx_competency_catalog_fink_human_dimension` | Partial | Filter by human dimension | 🔴 HIGH value (CRITICAL) |
| `idx_competency_catalog_fink_caring` | Partial | Filter by caring dimension | 🔴 HIGH value (CRITICAL) |

**Rationale:** Partial indexes on human-centric dimensions (human_dimension, caring) prioritized because these are CRITICAL for AI-era competency identification.

---

## New Database Functions

### 1. `calculate_fink_overall_score(fink_scores, weights)`

**Purpose:** Calculate weighted average of Fink's dimensions
**Returns:** NUMERIC(5,2) overall score (0-100)
**Default Weights:**
```json
{
  "foundational_knowledge": 0.15,  // 15% - AI can do this
  "application": 0.20,              // 20% - AI-augmented
  "integration": 0.15,              // 15% - Requires human context
  "human_dimension": 0.20,          // 20% - CRITICAL (highest weight)
  "caring": 0.15,                   // 15% - CRITICAL
  "learning_how_to_learn": 0.15     // 15% - CRITICAL
}
```

**Rationale:** Human-centric dimensions weighted higher (50% combined) because they represent differentiated human value in AI era.

**Example Usage:**
```sql
SELECT
  competency_name,
  calculate_fink_overall_score(fink_taxonomy_scores) as overall_score
FROM competency_catalog
WHERE institution_id = '...'
ORDER BY overall_score DESC;
```

### 2. `get_human_centric_competencies(institution_id, min_score)`

**Purpose:** Find competencies strong in human-centric dimensions
**Returns:** TABLE with competency details + human dimension scores
**Default Min Score:** 70 (advanced level)
**Filters:** Returns competencies where ANY of (human_dimension, caring, learning_how_to_learn) >= min_score

**Example Usage:**
```sql
-- Find competencies emphasizing human dimensions (70+ score)
SELECT * FROM get_human_centric_competencies(
  '550e8400-e29b-41d4-a716-446655440000',
  70
);
```

**Returns:**
- competency_id, code, name
- human_dimension_score
- caring_score
- learning_score
- overall_human_score (average of 3 dimensions)

**Use Case:** Identify which competencies prepare students for AI-era differentiation (empathy, values, self-directed learning).

---

## TypeScript Types Alignment

The TypeScript types (`types/competency.ts`) were already implemented with Fink's Taxonomy. This migration brings the database schema into alignment.

### Type Interface

```typescript
export interface FinksDimensions {
  foundational_knowledge: number;
  application: number;
  integration: number;
  human_dimension: number;
  caring: number;
  learning_how_to_learn: number;
}

export interface Competency {
  // ... other fields
  finks_dimensions: FinksDimensions;
  bloom_taxonomy_level?: BloomTaxonomyLevel | null; // @deprecated
}
```

### Naming Convention Difference

| Layer | Field Name | Format |
|-------|-----------|--------|
| **Database** | `fink_taxonomy_scores` | snake_case (PostgreSQL convention) |
| **TypeScript** | `finks_dimensions` | camelCase (JavaScript convention) |

**Resolution:** Service layer will handle mapping:
```typescript
// Database → TypeScript
const competency: Competency = {
  ...dbRow,
  finks_dimensions: dbRow.fink_taxonomy_scores
};

// TypeScript → Database
const dbData = {
  ...dto,
  fink_taxonomy_scores: dto.finks_dimensions
};
```

---

## Backward Compatibility

### ✅ Zero Breaking Changes

1. **Column Preserved:** `bloom_taxonomy_level` NOT deleted
2. **Queries Work:** Existing SELECT queries continue functioning
3. **Defaults Applied:** New column has sensible JSONB default
4. **Nullable Design:** All Fink scores nullable for gradual migration

### Migration Path

**Phase 1 (This Migration):**
- ✅ Add `fink_taxonomy_scores` column
- ✅ Add indexes and constraints
- ✅ Create helper functions
- ✅ Mark `bloom_taxonomy_level` as deprecated

**Phase 2 (Next Sprint):**
- ⏳ Update service layer to read/write fink_taxonomy_scores
- ⏳ Update UI components to display 6 dimensions
- ⏳ Create data migration script (bloom → fink conversion)

**Phase 3 (Future):**
- ⏳ Migrate all existing competencies
- ⏳ Verify no active use of bloom_taxonomy_level
- ⏳ Drop bloom_taxonomy_level column

**Phase 4 (Long-term):**
- ⏳ Drop bloom_taxonomy_level ENUM type
- ⏳ Update documentation to remove Bloom references

---

## Impact on MyJKKN

### For Institution Administrators

**Before (Bloom's):**
- Competencies classified by cognitive level (remember, understand, apply, etc.)
- All focus on "what students can think/do"
- No differentiation from AI capabilities

**After (Fink's):**
- Competencies scored across 6 holistic dimensions
- Emphasis on human-centric capabilities (caring, relationships, self-awareness)
- Alignment with AI-era value proposition

**Example:**
```json
// Old (Bloom's)
{
  "competency_name": "Data Analysis",
  "bloom_taxonomy_level": "analyze"
}

// New (Fink's)
{
  "competency_name": "Data Analysis",
  "fink_taxonomy_scores": {
    "foundational_knowledge": 60,
    "application": 80,
    "integration": 70,
    "human_dimension": 40,  // Understanding stakeholder impact
    "caring": 50,           // Ethical data use concerns
    "learning_how_to_learn": 65
  }
}
```

### For Program Directors

**New Capabilities:**
1. **Identify AI-resistant competencies:** Filter for high human_dimension/caring scores
2. **Balance curriculum:** Ensure programs develop holistic learners, not just cognitive skills
3. **Measure transformation:** Track not just "what students know" but "who they become"
4. **Industry alignment:** Map competencies to skills AI can't replace

**Strategic Questions Enabled:**
- Which competencies prepare students for uniquely human roles?
- Are we over-indexing on cognitive skills (AI-replaceable)?
- Do our programs develop caring, values, and self-awareness?
- How do our graduates differentiate from AI in the job market?

### For Students/Learners

**Before:**
- Progress tracked by cognitive level mastery
- Focus on knowledge accumulation and skill demonstration

**After:**
- Progress tracked across holistic development dimensions
- Focus includes personal growth, values formation, relationship building
- Clearer understanding of uniquely human capabilities to develop

---

## Verification Queries

### Check Migration Applied Successfully

```sql
-- Verify column exists
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'competency_catalog'
  AND column_name = 'fink_taxonomy_scores';

-- Verify constraint exists
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'competency_catalog'
  AND constraint_name = 'check_fink_scores_range';

-- Verify indexes created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'competency_catalog'
  AND indexname LIKE '%fink%';

-- Verify functions created
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN (
  'calculate_fink_overall_score',
  'get_human_centric_competencies'
);
```

### Test Fink Score Insertion

```sql
-- Insert test competency with Fink scores
INSERT INTO competency_catalog (
  institution_id,
  competency_code,
  competency_name,
  competency_type,
  fink_taxonomy_scores
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'TEST-EMPATHY-001',
  'Empathetic Leadership',
  'behavioral',
  '{
    "foundational_knowledge": 50,
    "application": 60,
    "integration": 75,
    "human_dimension": 90,
    "caring": 85,
    "learning_how_to_learn": 70
  }'::jsonb
);

-- Calculate overall score
SELECT
  competency_name,
  calculate_fink_overall_score(fink_taxonomy_scores) as overall_score
FROM competency_catalog
WHERE competency_code = 'TEST-EMPATHY-001';

-- Expected: ~72.0 (weighted toward human dimensions)
```

---

## Rollback Plan

If this migration needs to be reverted:

```sql
-- 1. Drop functions
DROP FUNCTION IF EXISTS calculate_fink_overall_score;
DROP FUNCTION IF EXISTS get_human_centric_competencies;

-- 2. Drop indexes
DROP INDEX IF EXISTS idx_competency_catalog_fink_scores;
DROP INDEX IF EXISTS idx_competency_catalog_fink_foundational;
DROP INDEX IF EXISTS idx_competency_catalog_fink_application;
DROP INDEX IF EXISTS idx_competency_catalog_fink_human_dimension;
DROP INDEX IF EXISTS idx_competency_catalog_fink_caring;

-- 3. Drop constraint
ALTER TABLE competency_catalog
DROP CONSTRAINT IF EXISTS check_fink_scores_range;

-- 4. Drop column
ALTER TABLE competency_catalog
DROP COLUMN IF EXISTS fink_taxonomy_scores;

-- 5. Remove deprecation comment
COMMENT ON COLUMN public.competency_catalog.bloom_taxonomy_level IS NULL;
```

**Data Loss:** None (no existing data in fink_taxonomy_scores yet)
**Downtime:** Minimal (DDL operations on single table)

---

## Next Steps

### Immediate (This Sprint)
1. ✅ Review this migration file
2. ⏳ Test migration on development database
3. ⏳ Apply to staging environment
4. ⏳ Verify all indexes created successfully
5. ⏳ Run verification queries

### Phase 2 (Next Sprint)
1. ⏳ Update `lib/services/competency-service.ts` to use fink_taxonomy_scores
2. ⏳ Update UI components to display 6 dimensions instead of single Bloom level
3. ⏳ Create admin interface for setting Fink scores
4. ⏳ Build visualizations (radar chart for 6 dimensions)
5. ⏳ Create data migration script to convert existing bloom → fink

### Phase 3 (Future)
1. ⏳ Migrate all existing competencies from Bloom to Fink
2. ⏳ Update analytics dashboards to use Fink metrics
3. ⏳ Train faculty on Fink's Taxonomy framework
4. ⏳ Update program competency mappings with Fink scores
5. ⏳ Drop bloom_taxonomy_level column

---

## References

- **Fink, L. D. (2003).** *Creating Significant Learning Experiences: An Integrated Approach to Designing College Courses*. San Francisco: Jossey-Bass.
- **Bloom, B. S. (1956).** *Taxonomy of Educational Objectives, Handbook I: The Cognitive Domain*. New York: David McKay Co Inc.
- **Migration File:** `supabase/migrations/20260202000001_migrate_to_finks_taxonomy.sql`
- **SQL Index:** `supabase/SQL_FILE_INDEX.md` (entry dated 2026-02-02)
- **TypeScript Types:** `types/competency.ts`

---

## Conclusion

This migration is a **strategic pivot** from measuring purely cognitive capabilities (which AI now dominates) to measuring holistic human development (which AI cannot replicate). By adopting Fink's Taxonomy, MyJKKN positions itself to:

1. **Differentiate graduates** in an AI-saturated job market
2. **Develop uniquely human capabilities** (empathy, values, self-awareness)
3. **Prepare students** for roles AI can't fill
4. **Align education** with 21st-century workforce needs

The migration is designed for **zero disruption** with full backward compatibility, allowing gradual adoption while preserving all existing functionality.

---

**Status:** ✅ READY FOR REVIEW
**Reviewer:** Team Lead
**Priority:** HIGH (Strategic initiative)
**Risk Level:** LOW (Backward compatible, no data loss)
