# Scholarship Type Migration: Boolean to Text

**Date**: December 30, 2025
**Status**: ✅ **COMPLETED**
**Migration**: `change_first_graduate_to_scholarship_type_text.sql`

---

## Problem

The `learners_profiles` table had a `first_graduate` column with type **boolean**, but:
- ✅ The form dropdown now uses text values: "FIRST GRADUATE", "PMS SCHOLARSHIP", "7.5% SCHOLARSHIP", "NOT APPLICABLE"
- ❌ Backend was converting these text values to boolean (only TRUE/FALSE)
- ❌ Lost granularity - couldn't distinguish between different scholarship types

---

## Solution

### Database Migration

Changed the column from `first_graduate` (boolean) to `scholarship_type` (text).

**Migration File**: `change_first_graduate_to_scholarship_type_text.sql`

```sql
-- STEP 1: Add new scholarship_type column as text
ALTER TABLE public.learners_profiles
ADD COLUMN IF NOT EXISTS scholarship_type TEXT;

-- STEP 2: Migrate existing first_graduate boolean values to scholarship_type text
UPDATE public.learners_profiles
SET scholarship_type = CASE
  WHEN first_graduate = true THEN 'FIRST GRADUATE'
  WHEN first_graduate = false THEN 'NOT APPLICABLE'
  ELSE NULL
END
WHERE scholarship_type IS NULL;

-- STEP 3: Drop the old first_graduate boolean column
ALTER TABLE public.learners_profiles
DROP COLUMN IF EXISTS first_graduate;

-- STEP 4: Add check constraint for valid scholarship types
ALTER TABLE public.learners_profiles
ADD CONSTRAINT valid_scholarship_type CHECK (
  scholarship_type IS NULL OR
  scholarship_type IN ('FIRST GRADUATE', 'PMS SCHOLARSHIP', '7.5% SCHOLARSHIP', 'NOT APPLICABLE')
);

-- STEP 5: Add comment to document the column
COMMENT ON COLUMN public.learners_profiles.scholarship_type IS 'Type of scholarship: FIRST GRADUATE, PMS SCHOLARSHIP, 7.5% SCHOLARSHIP, or NOT APPLICABLE';
```

### Code Changes

#### 1. Bulk Upload Service (`lib/services/bulk-learner-upload-service.ts`)

**Before** (Lines 409-424):
```typescript
// ❌ OLD CODE - Converted to boolean
const learnerData = newLearners.map(row => {
  const { scholarship_type, ...restData } = row.data as any;

  // Convert scholarship_type back to first_graduate (boolean)
  let first_graduate: boolean | null = null;
  if (scholarship_type) {
    const normalized = String(scholarship_type).toUpperCase();
    first_graduate = normalized === 'FIRST GRADUATE';
  }

  return {
    ...restData,
    first_graduate, // ❌ Boolean column
    lifecycle_status: 'active',
    is_profile_complete: isProfileComplete(row.data)
  };
});
```

**After** (Lines 408-416):
```typescript
// ✅ NEW CODE - Keeps as text
const learnerData = newLearners.map(row => {
  // FIX: Keep scholarship_type as text (no longer converting to boolean first_graduate)
  // The database now has scholarship_type column as TEXT
  return {
    ...row.data,
    lifecycle_status: 'active',
    is_profile_complete: isProfileComplete(row.data)
  };
});
```

#### 2. TypeScript Types (Auto-generated from database)

After running `mcp__supabase__generate_typescript_types`, types will show:

**Before**:
```typescript
first_graduate: boolean | null
```

**After**:
```typescript
scholarship_type: string | null
```

---

## Valid Scholarship Type Values

The database now enforces these values via CHECK constraint:

| Value | Description |
|-------|-------------|
| `FIRST GRADUATE` | Student is first in family to attend college |
| `PMS SCHOLARSHIP` | Prime Minister's Scholarship |
| `7.5% SCHOLARSHIP` | 7.5% reservation scholarship |
| `NOT APPLICABLE` | No scholarship |
| `NULL` | Not specified |

---

## Migration Data Conversion

Existing boolean values were converted as follows:

| Old Value (`first_graduate`) | New Value (`scholarship_type`) |
|------------------------------|-------------------------------|
| `true` | `'FIRST GRADUATE'` |
| `false` | `'NOT APPLICABLE'` |
| `null` | `NULL` |

---

## Files Modified

### 1. Database Migration
- ✅ `supabase/migrations/change_first_graduate_to_scholarship_type_text.sql` (NEW)

### 2. Backend Service
- ✅ `lib/services/bulk-learner-upload-service.ts`
  - Removed boolean conversion logic
  - Now stores `scholarship_type` directly as text

### 3. TypeScript Types (Auto-updated)
- ✅ `types/supabase.ts`
- ✅ `types/database.types.ts`

---

## Testing Checklist

### Pre-Test
- [x] Migration applied successfully
- [x] Column type changed from boolean to text
- [x] Existing data migrated correctly
- [x] Check constraint added
- [x] Test data deleted

### Test Scenarios
- [ ] Upload student with "FIRST GRADUATE" → Should store as text
- [ ] Upload student with "PMS SCHOLARSHIP" → Should store as text
- [ ] Upload student with "7.5% SCHOLARSHIP" → Should store as text
- [ ] Upload student with "NOT APPLICABLE" → Should store as text
- [ ] Verify database shows text values (not true/false)

### Verification Queries

```sql
-- Check column type
SELECT
  column_name,
  data_type,
  udt_name,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'learners_profiles'
  AND column_name = 'scholarship_type';
-- Expected: data_type = 'text'

-- Check migrated data
SELECT
  college_email,
  scholarship_type,
  created_at
FROM learners_profiles
ORDER BY created_at DESC
LIMIT 20;
-- Expected: Text values like 'FIRST GRADUATE', 'NOT APPLICABLE'

-- Test constraint
INSERT INTO learners_profiles (
  college_email,
  first_name,
  scholarship_type
) VALUES (
  'test@example.com',
  'TEST',
  'INVALID VALUE'  -- Should FAIL due to CHECK constraint
);
-- Expected: ERROR violates check constraint "valid_scholarship_type"
```

---

## Breaking Changes

### ⚠️ Impact on Existing Code

Any code that references `first_graduate` will need to be updated:

#### 1. Forms/Components
```typescript
// ❌ OLD
<Select name="first_graduate" value={student.first_graduate ? "yes" : "no"}>

// ✅ NEW
<Select name="scholarship_type" value={student.scholarship_type}>
  <option value="FIRST GRADUATE">First Graduate</option>
  <option value="PMS SCHOLARSHIP">PMS Scholarship</option>
  <option value="7.5% SCHOLARSHIP">7.5% Scholarship</option>
  <option value="NOT APPLICABLE">Not Applicable</option>
</Select>
```

#### 2. Queries/Filters
```typescript
// ❌ OLD
.eq('first_graduate', true)

// ✅ NEW
.eq('scholarship_type', 'FIRST GRADUATE')
```

#### 3. Reports/Analytics
```typescript
// ❌ OLD
const firstGradCount = students.filter(s => s.first_graduate).length;

// ✅ NEW
const firstGradCount = students.filter(s => s.scholarship_type === 'FIRST GRADUATE').length;
```

---

## Rollback Plan (If Needed)

If you need to rollback this migration:

```sql
-- Add back first_graduate column
ALTER TABLE public.learners_profiles
ADD COLUMN first_graduate BOOLEAN;

-- Convert scholarship_type back to boolean
UPDATE public.learners_profiles
SET first_graduate = CASE
  WHEN scholarship_type = 'FIRST GRADUATE' THEN true
  ELSE false
END;

-- Drop scholarship_type column
ALTER TABLE public.learners_profiles
DROP COLUMN scholarship_type;

-- Remove constraint
ALTER TABLE public.learners_profiles
DROP CONSTRAINT IF EXISTS valid_scholarship_type;
```

**Note**: Rollback will lose granularity (PMS, 7.5% scholarship data becomes just TRUE).

---

## Benefits of Text-Based Storage

| Benefit | Description |
|---------|-------------|
| **Granularity** | Can distinguish between 4 scholarship types instead of 2 (true/false) |
| **Clarity** | Database values match UI labels exactly |
| **Extensibility** | Easy to add new scholarship types in future |
| **No Conversion** | No need to convert between boolean ↔ text |
| **Type Safety** | CHECK constraint ensures only valid values |

---

## Summary

✅ **Migration**: `first_graduate` (boolean) → `scholarship_type` (text)
✅ **Valid Values**: FIRST GRADUATE, PMS SCHOLARSHIP, 7.5% SCHOLARSHIP, NOT APPLICABLE
✅ **Constraint**: CHECK constraint enforces valid values
✅ **Backward Compatibility**: Existing boolean data migrated to text
✅ **Code Updated**: Removed boolean conversion in bulk upload service
✅ **Types Updated**: TypeScript types auto-generated from new schema

---

**Ready for Testing!** Upload students with different scholarship types and verify the text values are stored correctly.

---

**Implemented by**: Claude Code
**Date**: December 30, 2025
**Status**: ✅ COMPLETED - READY FOR TESTING
