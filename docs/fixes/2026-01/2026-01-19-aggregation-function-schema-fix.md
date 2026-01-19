# Aggregation Function Schema Fix - Email Join & Auth Validation

**Date**: 2026-01-19
**Category**: Analytics / Database Functions
**Status**: ✅ Fixed
**Priority**: CRITICAL
**Severity**: **Aggregation functions completely broken - no engagement data generated**

## Problem

The `compute_student_engagement_scores()` function was failing to process any students, returning `0 rows_inserted` despite having 2,110+ active students in the database.

### User Report

After fixing the session tracking issues, the dashboard still showed no data even though sessions were being created successfully.

### Error Messages

**Error 1: Role Mismatch**
```sql
-- Function filtered for:
WHERE p.role = 'learner'

-- But profiles.role values are:
'student', 'faculty', 'admin', etc. (NOT 'learner')
```

**Error 2: ID Join Failure**
```sql
-- Function tried to join:
JOIN profiles p ON p.id = lp.id

-- But these IDs NEVER match:
profiles.id ≠ learners_profiles.id (0 matches out of 4,477 students)
```

**Error 3: Foreign Key Violation**
```
ERROR: 23503: insert or update on table "student_engagement_scores"
violates foreign key constraint "student_engagement_scores_user_id_fkey"
DETAIL: Key (user_id)=(de628b6b-69df-4380-b0c7-f776c21c05c8) is not present in table "users".
```

## Root Causes

### 1. Incorrect Role Filter

**Function Code (WRONG)**:
```sql
WHERE p.role = 'learner'  -- ❌ This value doesn't exist
```

**Actual Data**:
```sql
SELECT DISTINCT role FROM profiles;
-- Result: 'student', 'faculty', 'admin', 'guest', 'driver'
-- NO 'learner' role exists!
```

### 2. Impossible ID Join

**Function Code (WRONG)**:
```sql
FROM learners_profiles lp
JOIN profiles p ON p.id = lp.id  -- ❌ These IDs are completely different
```

**Data Model Reality**:
```
profiles table:
- id: Supabase Auth user UUID (e.g., f2362481-2473-4d3b-9689-7f8387aa1255)
- email: user@jkkn.ac.in
- role: 'student'

learners_profiles table:
- id: Academic record UUID (e.g., de628b6b-69df-4380-b0c7-f776c21c05c8)
- student_email: user@jkkn.ac.in
- college_email: user@jkkn.ac.in
- roll_number: MBA23002
```

**Relationship**: These tables are linked ONLY by email matching:
- `profiles.email = learners_profiles.student_email`
- OR `profiles.email = learners_profiles.college_email`

**Verification Query**:
```sql
-- Check how many profiles.id match learners_profiles.id
SELECT COUNT(*)
FROM profiles p
JOIN learners_profiles lp ON p.id = lp.id;
-- Result: 0 matches (out of 4,477 students)

-- Check how many match by email
SELECT COUNT(*)
FROM profiles p
JOIN learners_profiles lp ON (
    p.email = lp.student_email
    OR p.email = lp.college_email
);
-- Result: 2,110 matches
```

### 3. Orphaned Profile Records

Some profiles exist without corresponding auth.users entries (pre-registered or deleted accounts), causing FK violations when inserting engagement scores.

## Solution

### Migration 1: Fix Role Filter

**File**: `20260119_fix_compute_student_engagement_scores_role.sql`

```sql
-- Changed from:
WHERE p.role = 'learner'

-- To:
WHERE p.role = 'student'  -- ✅ Actual role value
```

### Migration 2: Fix Email Join + Auth Validation

**File**: `20260119_fix_compute_student_engagement_scores_email_join.sql`

**Key Changes**:

1. **Email-based Join**:
```sql
-- BEFORE (BROKEN):
FROM learners_profiles lp
JOIN profiles p ON p.id = lp.id  -- Never matches

-- AFTER (FIXED):
FROM learners_profiles lp
JOIN profiles p ON (
    p.email = lp.student_email
    OR p.email = lp.college_email
)
```

2. **Auth Validation**:
```sql
-- Added auth.users check to skip orphaned profiles:
JOIN auth.users au ON au.id = p.id  -- ✅ Only process users with valid auth
```

3. **Use profiles.id for user_id**:
```sql
-- SELECT profiles.id (auth user ID) as the user_id for engagement scores:
SELECT DISTINCT
    p.id as user_id,  -- ✅ Use auth user ID from profiles
    lp.institution_id,
    lp.department_id,
    lp.program_id,
    lp.semester_id,
    lp.section_id
FROM learners_profiles lp
JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
JOIN auth.users au ON au.id = p.id
```

### Migration 3: Fix Materialized View Refresh

**Issue**: Function used `REFRESH MATERIALIZED VIEW CONCURRENTLY` but view lacked unique index

**Fix**: Changed to non-concurrent refresh (concurrent requires unique index which is complex with NULLable hierarchy columns)

```sql
-- BEFORE:
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_engagement_overview;

-- AFTER:
REFRESH MATERIALIZED VIEW mv_engagement_overview;  -- Non-concurrent
```

## Testing & Verification

### Test 1: Check Student Count
```sql
-- Students with complete data (email-matched):
SELECT COUNT(DISTINCT p.id)
FROM learners_profiles lp
JOIN profiles p ON (p.email = lp.student_email OR p.email = lp.college_email)
JOIN auth.users au ON au.id = p.id
WHERE p.role = 'student'
AND lp.lifecycle_status = 'active'
AND lp.section_id IS NOT NULL;
-- Result: 2,110 students eligible for analytics
```

### Test 2: Run Aggregation
```sql
SELECT compute_student_engagement_scores('2026-01-19'::DATE) as rows_inserted;
-- Result: 2110 ✅
```

### Test 3: Verify Data Created
```sql
SELECT COUNT(*) FROM student_engagement_scores;
-- Result: 2,110 ✅

SELECT COUNT(*) FROM mv_engagement_overview;
-- Result: 101 sections ✅

-- Check specific student:
SELECT
    user_id,
    logins_last_7_days,
    engagement_level,
    is_at_risk
FROM student_engagement_scores
WHERE user_id = (SELECT id FROM profiles WHERE email = 'student@jkkn.ac.in');
-- Result: user_id found, logins_last_7_days=0, is_at_risk=true ✅
```

### Test 4: Verify Materialized View
```sql
SELECT
    institution_id,
    section_id,
    total_students,
    active_last_7d,
    at_risk_count
FROM mv_engagement_overview
LIMIT 5;
-- Result: 101 sections with aggregated metrics ✅
```

## Impact Assessment

**Severity**: **CRITICAL**
**Affected Feature**: Entire engagement analytics system
**Duration**: Since initial deployment (~2026-01-16 to 2026-01-19)

### What Was Broken
- ❌ `compute_student_engagement_scores()` processed 0 students
- ❌ `student_engagement_scores` table remained empty
- ❌ `mv_engagement_overview` remained empty
- ❌ Dashboard showed "No data available"
- ❌ At-risk student identification non-functional
- ❌ All analytics APIs returned empty arrays

### What Now Works
- ✅ Aggregation processes all 2,110 students with valid auth accounts
- ✅ `student_engagement_scores` populated with current engagement metrics
- ✅ `mv_engagement_overview` provides section-level summaries
- ✅ Dashboard displays engagement data
- ✅ At-risk student identification functional (all students currently at-risk due to no recent logins)

### Current State
- **2,110 students** have engagement scores
- **101 sections** in materialized view
- **All students classified as at-risk** because their `user_sessions.section_id = NULL` (doesn't match `learners_profiles.section_id`)
- This is expected - sessions need to be recreated with proper organizational context

## Files Changed

1. ✅ `supabase/migrations/20260119_fix_compute_student_engagement_scores_role.sql` (CREATED)
2. ✅ `supabase/migrations/20260119_fix_compute_student_engagement_scores_email_join.sql` (CREATED)
3. ✅ `IMPLEMENTATION_STATUS.md` (UPDATED) - Added Phase 13
4. ✅ `docs/fixes/2026-01/2026-01-19-aggregation-function-schema-fix.md` (NEW - this file)

## Data Model Clarification

### The profiles ⟷ learners_profiles Relationship

```
┌─────────────────────┐          ┌──────────────────────┐
│      profiles       │          │  learners_profiles   │
│─────────────────────│          │──────────────────────│
│ id (UUID)           │◄────┐    │ id (UUID)            │
│   f2362481-...      │     │    │   de628b6b-...       │
│ email               │     │    │ student_email        │
│   user@jkkn.ac.in   │◄────┼────│   user@jkkn.ac.in    │
│ role: 'student'     │     │    │ college_email        │
└─────────────────────┘     │    │   user@jkkn.ac.in    │
                            │    │ roll_number          │
                            │    │   MBA23002           │
                            │    │ section_id           │
                            │    │ lifecycle_status     │
                            │    └──────────────────────┘
                            │
                            └── LINKED BY EMAIL, NOT BY ID!
```

**Key Insights**:
1. `profiles.id` = Supabase Auth user UUID
2. `learners_profiles.id` = Academic record UUID (different system)
3. NO FK relationship between these tables
4. Linked ONLY via email matching
5. `student_engagement_scores.user_id` references `profiles.id` (auth user)

## Prevention Measures

### For Future Development

1. **Document Data Relationships**: Always check actual data, don't assume ID relationships
2. **Test Queries with Real Data**: Run SELECT queries before creating functions
3. **Verify Enum/Role Values**: Check `SELECT DISTINCT column` before filtering
4. **Use Email for Cross-System Joins**: profiles ↔ learners_profiles must join by email
5. **Add Auth Validation**: Always join auth.users when processing user data
6. **Test with Sample Users**: Create test data and verify functions work end-to-end

### Verification Checklist

Before deploying aggregation functions:
- [ ] Verify role filter values exist in data
- [ ] Test join relationships with COUNT queries
- [ ] Check for orphaned records (profiles without auth.users)
- [ ] Run function manually with LIMIT 10
- [ ] Verify FK constraints won't fail
- [ ] Test materialized view refresh

## Next Steps

### For Complete System Operation

1. **Users Need to Re-login**: Current sessions have `section_id = NULL`
   - Sessions created before organizational context fix don't have section data
   - New logins will create sessions with proper section_id

2. **Run Daily Jobs**: Set up cron jobs for automated aggregation
   ```sql
   -- Daily at 2 AM: Aggregate daily metrics
   SELECT cron.schedule(
       'compute_daily_engagement_metrics',
       '0 2 * * *',
       $$SELECT compute_daily_engagement_metrics(CURRENT_DATE - INTERVAL '1 day')$$
   );

   -- Daily at 3 AM: Compute student scores
   SELECT cron.schedule(
       'compute_student_engagement_scores',
       '0 3 * * *',
       $$SELECT compute_student_engagement_scores(CURRENT_DATE)$$
   );

   -- Every 15 minutes: Refresh dashboard view
   SELECT cron.schedule(
       'refresh_engagement_overview',
       '*/15 * * * *',
       $$REFRESH MATERIALIZED VIEW mv_engagement_overview$$
   );
   ```

3. **Monitor Data Growth**: As users login with proper organizational context, engagement metrics will become more accurate

## References

- Related Fix: `docs/fixes/2026-01/2026-01-19-session-tracking-function-fix.md` (Type mismatch in get_user_organizational_context)
- Related Fix: `docs/fixes/2026-01/2026-01-19-postgrest-foreign-key-fix.md` (Missing FK for PostgREST)
- PostgreSQL Email Matching: Use OR conditions for multiple email columns
- Supabase Auth Schema: auth.users table for auth account validation

---

**Status**: ✅ Fixed
**Deployed**: 2026-01-19
**Data Generated**: 2,110 student engagement scores across 101 sections
**Dashboard**: Now showing engagement analytics data
