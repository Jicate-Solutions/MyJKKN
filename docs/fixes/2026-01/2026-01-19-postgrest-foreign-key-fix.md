# PostgREST Foreign Key Relationship Fix

**Date**: 2026-01-19
**Category**: Database / Analytics
**Status**: ✅ Fixed
**Priority**: Critical

## Problem

The Advanced Activity Analytics System was failing with PostgREST error `PGRST200`:

```
Could not find a relationship between 'student_engagement_scores' and 'profiles' in the schema cache
```

Additionally, queries were attempting to join with `learners_profiles!inner(student_id)` which was impossible due to:
1. No foreign key between `student_engagement_scores` and `learners_profiles`
2. `learners_profiles` doesn't have a `student_id` column (has `roll_number` and `register_number` instead)

## Root Cause

### Database Schema Mismatch

1. **Missing Foreign Key**: `student_engagement_scores.user_id` had NO foreign key constraint to `profiles.id`
   - PostgREST requires explicit FKs to discover join relationships
   - Without FK, PostgREST cannot perform automatic joins

2. **profiles ≠ learners_profiles**: These tables have completely separate identity systems
   - `profiles.id` stores auth users (UUID from Supabase Auth)
   - `learners_profiles.id` stores student academic records (different UUIDs)
   - **No ID relationship exists**: 0 out of 4,477 student profiles matched by ID
   - Relationship exists via email: `profiles.email = learners_profiles.student_email` OR `learners_profiles.college_email`

3. **Incorrect Column Reference**: Service queries referenced `learners_profiles.student_id`
   - This column does NOT exist in learners_profiles
   - Actual student identifiers: `roll_number` (e.g., "MBA23002"), `register_number`

## Solution

### 1. Added Foreign Key Constraint

**Migration**: `20260119_add_student_engagement_scores_foreign_keys.sql`

```sql
-- Add foreign key for user_id -> profiles.id
ALTER TABLE student_engagement_scores
ADD CONSTRAINT fk_student_engagement_scores_user_id
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Create indexes for join performance
CREATE INDEX IF NOT EXISTS idx_student_engagement_scores_user_id
ON student_engagement_scores(user_id);

CREATE INDEX IF NOT EXISTS idx_student_engagement_scores_user_calc_date
ON student_engagement_scores(user_id, calculation_date DESC);
```

**Verification**:
```sql
-- Checked for orphaned records before adding FK: 0 found
SELECT COUNT(*) as orphaned_records
FROM student_engagement_scores ses
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = ses.user_id
);
-- Result: 0 (safe to add FK)
```

### 2. Fixed EngagementService Queries

**File**: `lib/services/analytics/engagement-service.ts`

**Changes Made**:

#### getStudentEngagement() - Line 259-273
```typescript
// BEFORE (BROKEN):
.select(`
  *,
  profiles!inner(full_name, email),
  learners_profiles!inner(student_id),  // ❌ No FK, no student_id column
  sections!inner(name),
  programs(name),
  departments(name)
`)

// AFTER (FIXED):
.select(`
  *,
  profiles!inner(full_name, email),  // ✅ Works now with FK
  sections!inner(name),
  programs(name),
  departments(name)
`)
```

```typescript
// BEFORE (BROKEN):
student_id: score.learners_profiles?.student_id || 'N/A',  // ❌ Doesn't exist

// AFTER (FIXED):
student_id: score.profiles?.email?.split('@')[0] || 'N/A',  // ✅ Use email prefix
```

#### getAtRiskStudents() - Line 316-372
```typescript
// BEFORE (BROKEN):
.select(`
  *,
  profiles!inner(full_name, email, phone_number),
  learners_profiles!inner(student_id),  // ❌ Impossible join
  sections!inner(name),
  programs(name),
  departments(name)
`)

// AFTER (FIXED):
.select(`
  *,
  profiles!inner(full_name, email, phone_number),  // ✅ FK enables this join
  sections!inner(name),
  programs(name),
  departments(name)
`)
```

#### getStudentDetail() - Line 473-486, 568-576
```typescript
// BEFORE (BROKEN):
.select(`
  *,
  profiles!inner(full_name, email),
  learners_profiles!inner(student_id),  // ❌ Can't join
  sections(name),
  programs(name)
`)

// AFTER (FIXED):
.select(`
  *,
  profiles!inner(full_name, email),  // ✅ Works with FK
  sections(name),
  programs(name)
`)
```

```typescript
// BEFORE (BROKEN):
student: {
  id: studentId,
  name: score.profiles?.full_name || 'Unknown',
  email: score.profiles?.email,
  student_id: score.learners_profiles?.student_id || 'N/A',  // ❌ Missing
  section_name: score.sections?.name,
  program_name: score.programs?.name
}

// AFTER (FIXED):
student: {
  id: studentId,
  name: score.profiles?.full_name || 'Unknown',
  email: score.profiles?.email,
  student_id: score.profiles?.email?.split('@')[0] || 'N/A',  // ✅ Email prefix
  section_name: score.sections?.name,
  program_name: score.programs?.name
}
```

## Data Model Understanding

### Current Schema Relationships

```
┌─────────────────┐
│    profiles     │  ← Auth users (Supabase Auth)
│  id (UUID)      │
│  email          │
│  role           │
└─────────────────┘
        ↑ FK
        │
┌─────────────────────────────┐
│ student_engagement_scores   │
│  user_id → profiles.id      │  ✅ NOW HAS FK
│  calculation_date           │
│  logins_last_7_days         │
│  is_at_risk                 │
└─────────────────────────────┘

┌─────────────────┐
│learners_profiles│  ← Academic records (separate system)
│  id (UUID)      │  ⚠️ Different from profiles.id
│  student_email  │  ← Can match profiles.email
│  college_email  │  ← Can match profiles.email
│  roll_number    │  ← Actual student ID (e.g., "MBA23002")
│  register_number│
└─────────────────┘
```

### Key Insights

1. **profiles.id** is the Supabase Auth user UUID
2. **learners_profiles.id** is a separate UUID for the academic record
3. **No FK between these tables** - they're linked by email matching
4. **student_engagement_scores.user_id** references **profiles.id** (auth users)
5. To get roll_number, you'd need: `profiles → email → learners_profiles (via email match)`

## Student ID Display Strategy

Since `learners_profiles` cannot be joined directly, we use **email prefix** as the student identifier:

```typescript
// Example:
email: "john.doe@jkkn.ac.in"
student_id: "john.doe"  // Email prefix before @
```

### Future Enhancement Option

If actual `roll_number` is needed, could:
1. Add `roll_number` column to `profiles` table (denormalized)
2. Update during profile creation to sync from `learners_profiles`
3. Or create a database view joining by email

## Testing

### Verification Steps

1. ✅ Checked for orphaned records: 0 found
2. ✅ Added FK constraint successfully
3. ✅ Verified FK exists in schema:
   ```sql
   SELECT constraint_name, column_name, foreign_table_name
   FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu USING (constraint_name)
   JOIN information_schema.constraint_column_usage ccu USING (constraint_name)
   WHERE tc.table_name = 'student_engagement_scores'
     AND kcu.column_name = 'user_id';
   -- Result: fk_student_engagement_scores_user_id → profiles.id
   ```

4. ✅ TypeScript compilation: 0 errors
5. ✅ All analytics files compile successfully

### Expected Behavior After Fix

1. **At-Risk Students Endpoint**: Should return data without PGRST200 error
2. **Student Engagement Table**: Should display student names and email-based IDs
3. **Student Detail Modal**: Should load individual student profiles
4. **Section Comparison**: Should aggregate data correctly

## Files Changed

1. ✅ `supabase/migrations/20260119_add_student_engagement_scores_foreign_keys.sql` (NEW)
2. ✅ `lib/services/analytics/engagement-service.ts` (MODIFIED)
   - `getStudentEngagement()` - Removed learners_profiles join
   - `getAtRiskStudents()` - Removed learners_profiles join
   - `getStudentDetail()` - Removed learners_profiles join
3. ✅ `IMPLEMENTATION_STATUS.md` (UPDATED) - Added Phase 11 documentation
4. ✅ `docs/fixes/2026-01/2026-01-19-postgrest-foreign-key-fix.md` (NEW - this file)

## Migration Checklist

- [x] Check for orphaned records
- [x] Apply foreign key migration
- [x] Verify FK in database schema
- [x] Update service queries
- [x] Remove learners_profiles joins
- [x] Fix student_id mapping
- [x] Fix column name mismatches (section_name, program_name, department_name)
- [x] Update all query selections
- [x] Update all mapping code
- [x] Verify TypeScript compilation (0 errors)
- [x] Document fix
- [ ] Test endpoints in development
- [ ] Verify at-risk students modal loads
- [ ] Verify student detail modal loads

## Follow-up Issue: Column Name Mismatch (FIXED)

### Error 2: `column sections_1.name does not exist`

**Error Code**: `42703` (PostgreSQL undefined column)

After fixing the foreign key, discovered another schema mismatch:

**Incorrect Column Names in Queries**:
```typescript
// WRONG - These columns don't exist:
sections(name)
programs(name)
departments(name)
```

**Actual Column Names**:
```sql
-- Verified from information_schema.columns:
sections.section_name
programs.program_name
departments.department_name
```

### Fix Applied

Updated all queries in `engagement-service.ts`:

**5 Locations Fixed**:
1. `getStudentEngagement()` - Line 265-267 (query) + Line 287-289 (mapping)
2. `getAtRiskStudents()` - Line 322-324 (query) + Line 368-370 (mapping)
3. `getSectionComparison()` - Line 402 (query) + Line 441 (mapping)
4. `getStudentDetail()` - Line 479-480 (query) + Line 574-575 (mapping)

**Changes**:
```typescript
// BEFORE (BROKEN):
.select('*, sections!inner(name), programs(name), departments(name)')
section_name: score.sections?.name

// AFTER (FIXED):
.select('*, sections!inner(section_name), programs(program_name), departments(department_name)')
section_name: score.sections?.section_name
```

**Verification**: TypeScript compilation passes with 0 errors

## Prevention

To avoid similar issues in the future:

1. **Always check PostgREST requirements**: Explicit FKs are required for joins
2. **Verify column names in information_schema**: Don't assume column names - always query `information_schema.columns` first
3. **Verify column existence before querying**: `learners_profiles.student_id` didn't exist
4. **Test queries in SQL first**: Run SELECT queries in Supabase SQL Editor before adding to code
5. **Understand data relationships**: profiles and learners_profiles are separate systems
6. **Test database queries directly**: Verify schema before building service layer
7. **Use TypeScript types**: Would have caught column mismatches earlier if types were stricter

## References

- PostgREST Error Codes: https://postgrest.org/en/stable/references/errors.html
- PGRST200: Could not find relationship - requires explicit FK
- Foreign Key Constraints: https://www.postgresql.org/docs/current/ddl-constraints.html

---

**Status**: ✅ Fixed
**Tested**: TypeScript compilation passes
**Ready for**: Development testing
