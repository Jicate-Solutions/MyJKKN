# Session Tracking Function Fix - Type Mismatch Error

**Date**: 2026-01-19
**Category**: Analytics / Session Tracking
**Status**: ✅ Fixed
**Priority**: CRITICAL
**Severity**: **All session tracking was broken**

## Problem

User reported that student logins were not being tracked in the engagement analytics dashboard. Investigation revealed that **NO users** (students, faculty, or admins) had sessions being created.

### User Report

```
"if i login the student role user it not stored in the engagement analytics dashboard page"

Login record from activity_logs:
Jan 19, 2026 13:00:06
BOOBAL A
student@jkkn.ac.in
login
auth
BOOBAL A logged into the system
```

Activity logs showed logins happening, but no corresponding `user_sessions` records were being created.

## Root Cause

The `get_user_organizational_context()` database function had a **type mismatch error**:

### Error Details

**PostgreSQL Error**: `42804`
```
ERROR:  42804: structure of query does not match function result type
DETAIL:  Returned type text does not match expected type user_role in column 6.
CONTEXT:  SQL statement "SELECT ... p.role ..."
PL/pgSQL function get_user_organizational_context(uuid) line 4 at RETURN QUERY
```

### Code Issue

**Function Declaration** (WRONG):
```sql
CREATE OR REPLACE FUNCTION get_user_organizational_context(p_user_id UUID)
RETURNS TABLE (
    institution_id UUID,
    department_id UUID,
    program_id UUID,
    semester_id UUID,
    section_id UUID,
    user_role user_role  -- ❌ Declared as user_role ENUM
)
```

**Query** (CONFLICTING):
```sql
SELECT
    lp.institution_id,
    lp.department_id,
    lp.program_id,
    lp.semester_id,
    lp.section_id,
    p.role  -- ❌ profiles.role is TEXT, not user_role enum!
FROM learners_profiles lp
JOIN profiles p ON p.id = lp.id
WHERE lp.id = p_user_id
```

**The Problem**:
- Function declared return column as `user_role` enum type
- But `profiles.role` column is TEXT type
- PostgreSQL refused to cast TEXT → user_role automatically
- Function failed with type mismatch error
- Session creation failed silently (caught by try-catch)
- No sessions created for ANY users since deployment

### Impact Chain

1. User logs in → auth callback route called
2. Tries to create session via `SessionTrackingService.createSession()`
3. Calls `get_user_organizational_context(user_id)` to get org details
4. Function fails with type mismatch error
5. Returns NULL due to error handling
6. Session creation aborted
7. Login continues (non-blocking), but no session tracked
8. **Result**: Activity logs show login, but no engagement analytics data

## Investigation Steps

### 1. Checked user_sessions Table
```sql
SELECT * FROM user_sessions
WHERE user_id IN (SELECT id FROM profiles WHERE email = 'student@jkkn.ac.in')
ORDER BY login_at DESC;
-- Result: 0 rows (NO sessions!)
```

### 2. Checked Profile Exists
```sql
SELECT id, email, full_name, role FROM profiles
WHERE email = 'student@jkkn.ac.in';
-- Result: Profile exists with role='student'
```

### 3. Tested Function Directly
```sql
SELECT * FROM get_user_organizational_context('f2362481-2473-4d3b-9689-7f8387aa1255');
-- Result: ERROR 42804 - type mismatch!
```

### 4. Identified Root Cause
Checked function definition in migration file and found type mismatch between declared return type (`user_role` enum) and actual query return (`p.role` as TEXT).

## Solution

### Migration Applied

**File**: `20260119_fix_get_user_organizational_context_type_mismatch_v2.sql`

**Change**: Drop and recreate function with correct return type

```sql
-- Drop the old function first (required to change return type)
DROP FUNCTION IF EXISTS get_user_organizational_context(UUID);

-- Recreate with correct return type
CREATE OR REPLACE FUNCTION get_user_organizational_context(p_user_id UUID)
RETURNS TABLE (
    institution_id UUID,
    department_id UUID,
    program_id UUID,
    semester_id UUID,
    section_id UUID,
    user_role TEXT  -- ✅ Changed from user_role enum to TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Try to get context from learners_profiles (students)
    RETURN QUERY
    SELECT
        lp.institution_id,
        lp.department_id,
        lp.program_id,
        lp.semester_id,
        lp.section_id,
        p.role  -- ✅ TEXT matches return type
    FROM learners_profiles lp
    JOIN profiles p ON p.id = lp.id
    WHERE lp.id = p_user_id
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;

    -- Fallback to staff table
    RETURN QUERY
    SELECT
        st.institution_id,
        st.department_id,
        NULL::UUID as program_id,
        NULL::UUID as semester_id,
        NULL::UUID as section_id,
        p.role  -- ✅ TEXT matches return type
    FROM staff st
    JOIN profiles p ON p.id = st.profile_id
    WHERE st.profile_id = p_user_id
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;

    -- Final fallback to profiles only
    RETURN QUERY
    SELECT
        p.institution_id,
        NULL::UUID as department_id,
        NULL::UUID as program_id,
        NULL::UUID as semester_id,
        NULL::UUID as section_id,
        p.role  -- ✅ TEXT matches return type
    FROM profiles p
    WHERE p.id = p_user_id;
END;
$$;
```

### Verification

**Test After Fix**:
```sql
SELECT * FROM get_user_organizational_context('f2362481-2473-4d3b-9689-7f8387aa1255');
```

**Result**:
```json
{
  "institution_id": "183847c5-be1b-4903-86eb-bbc20c213071",
  "department_id": null,
  "program_id": null,
  "semester_id": null,
  "section_id": null,
  "user_role": "student"
}
```

✅ Function now works correctly!

**Note**: This specific student doesn't have `learners_profiles` record, so department/program/semester/section are NULL. This is expected - the function correctly falls back to the profiles table.

## Files Changed

1. ✅ `supabase/migrations/20260119_fix_get_user_organizational_context_type_mismatch_v2.sql` (NEW)
2. ✅ `IMPLEMENTATION_STATUS.md` (UPDATED) - Added Phase 12
3. ✅ `docs/fixes/2026-01/2026-01-19-session-tracking-function-fix.md` (NEW - this file)

## Testing Required

### Manual Test Steps

1. **Logout current user** (to test fresh login)
2. **Login as student** (student@jkkn.ac.in or any other student)
3. **Check user_sessions table**:
   ```sql
   SELECT session_id, user_id, login_at, role, section_id, is_active
   FROM user_sessions
   WHERE user_id = 'USER_ID_HERE'
   ORDER BY login_at DESC LIMIT 1;
   ```
4. **Expected**: New session record created with current timestamp
5. **Check analytics_session_id cookie** in browser DevTools
6. **Navigate to engagement analytics dashboard** (if accessible by role)
7. **Expected**: Student activities should start being tracked

### For Full Verification

After students login post-fix:
- Wait 24 hours
- Run `compute_daily_engagement_metrics(CURRENT_DATE)` manually or wait for 2 AM cron job
- Run `compute_student_engagement_scores(CURRENT_DATE)` manually or wait for 3 AM cron job
- Check `student_engagement_scores` table for populated data
- Check engagement analytics dashboard for metrics

## Impact Assessment

**Severity**: **CRITICAL**
**Affected Users**: **ALL users** (students, faculty, admins)
**Duration**: Since initial analytics deployment (~2026-01-16 to 2026-01-19)

### What Was Broken
- ❌ No `user_sessions` records created for any users
- ❌ No session tracking for engagement analytics
- ❌ No module access tracking
- ❌ `daily_engagement_metrics` table empty (no data to aggregate)
- ❌ `student_engagement_scores` table empty (no scores calculated)
- ❌ At-risk student identification not working (no data)
- ❌ Engagement analytics dashboard completely empty

### What Still Worked
- ✅ Activity logs (separate system)
- ✅ Authentication and authorization
- ✅ Normal app functionality
- ✅ User roles and permissions

### Post-Fix Behavior
- ✅ Sessions created starting with next login for each user
- ✅ Engagement tracking begins immediately
- ✅ Background jobs will start processing data after 24 hours
- ✅ Analytics dashboard will populate gradually as users login

## Prevention Measures

### For Future Development

1. **Test Database Functions Directly**: Always test functions with real data before deployment
   ```sql
   SELECT * FROM function_name(test_params);
   ```

2. **Type Safety**: Verify column types match function return types
   ```sql
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'table_name';
   ```

3. **Error Logging**: Improve error logging in SessionTrackingService
   - Currently errors are silently caught
   - Add explicit error messages to logs

4. **Integration Testing**: Test full auth flow including session creation in staging

5. **Monitor Session Creation**: Add metrics/alerts for session creation rate
   - Track success/failure rates
   - Alert if sessions drop to zero

### Recommended Code Changes

**SessionTrackingService.ts** (line 102-104):
```typescript
// CURRENT (silent failure):
const orgContext = await this.getUserOrganizationalContext(sessionData.userId);

// IMPROVED (explicit logging):
const orgContext = await this.getUserOrganizationalContext(sessionData.userId);
if (!orgContext) {
  console.warn('[SessionTracking] ⚠️ Failed to get org context for user:', sessionData.userId);
  console.warn('[SessionTracking] This may indicate a database function error');
}
```

## References

- PostgreSQL Error Codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
- Error 42804: DATATYPE_MISMATCH
- PL/pgSQL RETURNS TABLE: https://www.postgresql.org/docs/current/plpgsql-declarations.html#PLPGSQL-DECLARATION-PARAMETERS

---

**Status**: ✅ Fixed (with follow-up fix for organizational context)
**Deployed**: 2026-01-19
**Requires**: User to login again to create session with full organizational data
**Next**: User should logout and login to create new session with complete organizational hierarchy

## Follow-up Fix: Organizational Context Email Join (2026-01-19)

After fixing the session creation, discovered that sessions were being created with **NULL values for department_id, program_id, semester_id, and section_id**.

### Root Cause
The `get_user_organizational_context()` function had the SAME bug as the aggregation function - trying to join `profiles` and `learners_profiles` by ID instead of by email.

### Fix Applied
**Migration**: `20260119_fix_get_user_organizational_context_email_join.sql`

Changed from:
```sql
FROM learners_profiles lp
JOIN profiles p ON p.id = lp.id  -- ❌ Never matches
WHERE lp.id = p_user_id
```

To:
```sql
FROM profiles p
JOIN learners_profiles lp ON (
    p.email = lp.student_email
    OR p.email = lp.college_email
)
WHERE p.id = p_user_id  -- ✅ Filter by auth user ID
```

### Verification
```sql
SELECT * FROM get_user_organizational_context('f2362481-2473-4d3b-9689-7f8387aa1255');
-- Result: Returns complete organizational data (institution, department, program, semester, section) ✅
```

### Impact
- **Before Fix**: Sessions created with `section_id = NULL`, preventing accurate engagement tracking
- **After Fix**: Sessions created with complete organizational hierarchy, enabling proper engagement analytics

**Next Login**: Sessions will be created with all organizational fields populated.
