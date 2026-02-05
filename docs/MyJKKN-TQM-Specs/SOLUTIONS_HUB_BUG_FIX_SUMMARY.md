# Solutions Hub Builders Page Bug Fix - Summary

**Date**: 2026-02-05
**Bug Report**: "Failed to load builders" error at `/solutions/software/builders`
**Status**: ✅ Root cause identified, fix prepared and committed, awaiting database application
**Time to Complete**: 2 minutes (manual SQL execution required)

---

## Executive Summary

The Solutions Hub Builders page displays a critical error preventing all users from accessing the builder management functionality. The root cause is a **missing database function** (`sh_is_staff()`) that is referenced in the Row Level Security (RLS) policy for the `sh_builders` table.

**Impact**: Complete blockage of Solutions Hub builder functionality for all users, including superadmins.

**Fix Status**: Code changes committed to `omm-dev` branch. Database migration ready but requires manual application due to CLI migration history mismatch.

---

## What Happened

### Error Chain
1. **User Action**: Navigate to https://myjkkn-omm-dev.vercel.app/solutions/software/builders
2. **Frontend**: `BuildersList` component loads, calls `useBuilders()` React Query hook
3. **Service Layer**: `buildersService.getBuilders()` executes Supabase query on `sh_builders` table
4. **Database**: RLS policy evaluates access permissions
5. **Failure Point**: Policy calls `sh_is_staff()` function which **does not exist**
6. **Result**: Query fails, React Query sets `error` state, error alert displays to user

### Root Cause Analysis

**Problem**: The RLS policy on `sh_builders` table references a permission function that was never created.

**Policy Code** (from `supabase/setup/03_policies.sql`):
```sql
CREATE POLICY "sh_builders_select" ON public.sh_builders
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod() AND department_id = sh_user_department_id())
        OR (sh_is_staff() AND department_id = sh_user_department_id())  -- ❌ MISSING
        OR user_id = auth.uid()
        OR (sh_is_builder() AND ...)
    );
```

**Function Inventory**:
| Function | Exists? | Purpose |
|----------|---------|---------|
| `sh_is_admin()` | ✅ | Check if user is admin/jicate_staff |
| `sh_is_hod()` | ✅ | Check if user is HOD |
| `sh_user_department_id()` | ✅ | Get user's department |
| `sh_is_builder()` | ✅ | Check if user is active builder |
| **`sh_is_staff()`** | ❌ | **MISSING - causes all queries to fail** |

---

## Fix Implemented

### Files Created/Modified

#### 1. Migration File
**File**: `supabase/migrations/20260205000001_add_sh_is_staff_function.sql`

Creates the missing function with proper security:
```sql
CREATE OR REPLACE FUNCTION public.sh_is_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('staff', 'faculty', 'teaching_staff', 'non_teaching_staff')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Features**:
- Security definer (runs with creator's privileges)
- Checks multiple staff role types
- Returns boolean for RLS policy evaluation

#### 2. Setup File Updated
**File**: `supabase/setup/02_functions.sql` (line ~4120)

Added function to main setup file for consistency with other Solutions Hub permission functions.

#### 3. Quick Fix SQL
**File**: `QUICK_FIX_sh_is_staff.sql`

Ready-to-run SQL for manual application via Supabase Dashboard, including verification query.

#### 4. Comprehensive Documentation
**File**: `docs/MyJKKN-TQM-Specs/BUG_FIX_builders_page_error.md`

Complete bug analysis with:
- Root cause explanation
- Impact assessment
- Solution implementation
- Verification steps
- Related files reference
- Prevention recommendations

#### 5. Python Application Script
**File**: `apply_fix.py`

Automated Python script to apply fix via psycopg2 (requires package installation, connection params configured).

---

## Git Commit

**Branch**: `omm-dev`
**Commit**: `5d1eaf14`
**Status**: ✅ Pushed to remote

**Commit Message**:
```
fix: Add missing sh_is_staff() function for Solutions Hub RLS

Root Cause:
- Builders page error: "Failed to load builders"
- RLS policy on sh_builders calls sh_is_staff() function
- Function was never created, causing all queries to fail

Changes:
- Created migration 20260205000001_add_sh_is_staff_function.sql
- Added sh_is_staff() to supabase/setup/02_functions.sql
- Function checks if user has staff-related roles
- Includes QUICK_FIX_sh_is_staff.sql for dashboard application
- Created comprehensive BUG_FIX_builders_page_error.md

Impact:
- Fixes builders page access for all authenticated users
- Enables proper Solutions Hub permission checking

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

---

## Next Steps Required

### STEP 1: Apply SQL to Database (MANUAL - 2 minutes)

**Option A: Via Supabase Dashboard (Recommended)**

1. Open SQL Editor: https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/sql

2. Login with:
   - Email: `aiengineering@jkkn.ac.in`
   - Password: `67ndxehcKmKXQrvc@`

3. Paste and run:
   ```sql
   CREATE OR REPLACE FUNCTION public.sh_is_staff()
   RETURNS BOOLEAN AS $$
   BEGIN
       RETURN EXISTS (
           SELECT 1 FROM profiles
           WHERE id = auth.uid()
           AND role IN ('staff', 'faculty', 'teaching_staff', 'non_teaching_staff')
       );
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER;

   COMMENT ON FUNCTION sh_is_staff IS
   'Checks if current user is a staff member (any staff-related role).';

   -- Verify
   SELECT routine_name, routine_type
   FROM information_schema.routines
   WHERE routine_schema = 'public'
   AND routine_name = 'sh_is_staff';
   ```

4. Expected result: `sh_is_staff | FUNCTION`

**Option B: Via CLI (if migration history resolved)**

```bash
cd /Users/omm/PROJECTS/MyJKKN
~/bin/supabase db push --linked
```

**Option C: Via Python Script**

```bash
cd /Users/omm/PROJECTS/MyJKKN
python3 apply_fix.py
```

**Option D: Use Quick Fix File**

SQL is in `QUICK_FIX_sh_is_staff.sql` for copy/paste.

### STEP 2: Verify Fix

1. **Check function exists**:
   ```sql
   SELECT routine_name, routine_type
   FROM information_schema.routines
   WHERE routine_schema = 'public'
   AND routine_name = 'sh_is_staff';
   ```

   Expected: 1 row with `FUNCTION` type

2. **Test builders page**:
   - Open: https://myjkkn-omm-dev.vercel.app/solutions/software/builders
   - Login: `test-superadmin@jkkn.local` / `SuperAdmin@123`
   - Expected: Page loads (may show "No builders found" if table empty - that's correct)

3. **Verify other Solutions Hub pages** (may have similar issues):
   - `/solutions/software/clients` - Client list
   - `/solutions/software/solutions` - Solutions list
   - `/solutions/software/phases` - Phase management

### STEP 3: Check for Similar Issues

Run this query to find all Solutions Hub functions referenced in policies:
```sql
SELECT DISTINCT unnest(regexp_matches(definition, 'sh_\w+\(\)', 'g')) as function_call
FROM pg_policies
WHERE schemaname = 'public'
AND tablename LIKE 'sh_%'
ORDER BY function_call;
```

Verify each function exists in `information_schema.routines`.

---

## Why This Happened

### Development Oversight
1. RLS policies were written referencing `sh_is_staff()`
2. Function implementation was skipped (likely copy/paste error from function template)
3. No automated testing caught the missing function
4. Issue only surfaced when a user attempted to access the page

### Why It Wasn't Caught Earlier
- **Silent Failure**: RLS policy failures don't throw obvious errors, they just block access
- **No Integration Tests**: No automated tests verify RLS policies work correctly
- **Limited Manual Testing**: Solutions Hub may not have been fully tested post-deployment

---

## Prevention Measures

### Immediate
1. **Function Verification Script**: Check all policy-referenced functions exist
2. **RLS Policy Tests**: Add integration tests for each table's RLS policies
3. **Solutions Hub Test Suite**: Comprehensive testing of all modules

### Long-term
1. **Pre-deployment Checklist**: Verify all database functions exist before migration
2. **Automated RLS Testing**: CI/CD pipeline to test RLS policies
3. **Function Registry**: Maintain list of all custom functions with their purposes
4. **Policy Linting**: Tool to parse policies and verify referenced functions exist

---

## Impact Assessment

### Who Was Affected
- **All users** attempting to access Solutions Hub Builders page
- **Test users** (even with super_admin role)
- **Developers** trying to test the feature

### System Impact
- **Severity**: P0 - Critical
- **Scope**: Solutions Hub Builders module completely inaccessible
- **Data Loss**: None
- **Security**: No security implications (proper access control, just broken)
- **User Experience**: Complete feature blockage with generic error message

### Business Impact
- **Builder Management**: Cannot view, add, or assign builders
- **Phase Assignments**: Cannot assign builders to solution phases
- **Skill Tracking**: Cannot manage builder skills
- **Revenue Impact**: Blocks builder allocation workflow

---

## Technical Details

### Service Layer Architecture
```
Frontend (BuildersList component)
  └─> React Query Hook (useBuilders)
      └─> Service Layer (buildersService.getBuilders)
          └─> Supabase Client
              └─> Database Query
                  └─> RLS Policy Evaluation
                      └─> sh_is_staff() <- FAILED HERE
```

### Error Flow
```typescript
// hooks/solutions/use-builders.ts
export function useBuilders(filters?: BuilderFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.builders.list(filters),
    queryFn: () => buildersService.getBuilders(filters), // <-- Fails here
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// components/builders-list.tsx
const { data, isLoading, error } = useBuilders({ ... });

// When error is truthy:
{error && (
  <Alert variant="destructive">
    <AlertDescription>
      Failed to load builders. Please try refreshing the page.
    </AlertDescription>
  </Alert>
)}
```

### Database Query
```typescript
// lib/services/solutions/builders-service.ts
static async getBuilders(filters?: BuilderFilters) {
  let query = supabase
    .from('sh_builders')  // <-- RLS applies here
    .select('*, department:departments(...), skills:sh_builder_skills(*)');

  // RLS policy checks sh_is_staff() which doesn't exist
  // Query fails, throws error
}
```

---

## Files Reference

### Frontend
- `/Users/omm/PROJECTS/MyJKKN/app/(routes)/solutions/software/builders/page.tsx`
- `/Users/omm/PROJECTS/MyJKKN/app/(routes)/solutions/software/builders/_components/builders-list.tsx`
- `/Users/omm/PROJECTS/MyJKKN/hooks/solutions/use-builders.ts`

### Backend
- `/Users/omm/PROJECTS/MyJKKN/lib/services/solutions/builders-service.ts`
- `/Users/omm/PROJECTS/MyJKKN/lib/services/solutions/types.ts`

### Database
- `/Users/omm/PROJECTS/MyJKKN/supabase/setup/01_tables.sql` (line 2785) - `sh_builders` table
- `/Users/omm/PROJECTS/MyJKKN/supabase/setup/02_functions.sql` (line 4063+) - Permission functions
- `/Users/omm/PROJECTS/MyJKKN/supabase/setup/03_policies.sql` - RLS policies

### Fix Files
- `/Users/omm/PROJECTS/MyJKKN/supabase/migrations/20260205000001_add_sh_is_staff_function.sql`
- `/Users/omm/PROJECTS/MyJKKN/QUICK_FIX_sh_is_staff.sql`
- `/Users/omm/PROJECTS/MyJKKN/apply_fix.py`
- `/Users/omm/PROJECTS/MyJKKN/docs/MyJKKN-TQM-Specs/BUG_FIX_builders_page_error.md`

---

## Lessons Learned

1. **RLS Policies Are Critical Path**: Function calls in RLS policies must be verified during development
2. **Silent Failures Are Dangerous**: RLS failures don't throw obvious errors, making them hard to debug
3. **Integration Testing Gaps**: Need automated tests for database-level access control
4. **Manual Verification Needed**: Database migrations should include verification queries
5. **Documentation Prevents Repetition**: Comprehensive docs help prevent similar issues

---

## Current Status

| Item | Status |
|------|--------|
| Root cause identified | ✅ Complete |
| Fix developed | ✅ Complete |
| Code committed to git | ✅ Complete |
| Migration file created | ✅ Complete |
| Documentation written | ✅ Complete |
| **SQL applied to database** | ⏳ **PENDING - Manual step required** |
| Fix verified | ⏳ Pending SQL application |
| Deployed to production | ⏳ Pending verification |

---

## Quick Reference

**Fix SQL** (copy/paste ready):
```sql
CREATE OR REPLACE FUNCTION public.sh_is_staff()
RETURNS BOOLEAN AS $$ BEGIN RETURN EXISTS (
SELECT 1 FROM profiles WHERE id = auth.uid()
AND role IN ('staff', 'faculty', 'teaching_staff', 'non_teaching_staff')
); END; $$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Supabase Dashboard**: https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/sql

**Test Page**: https://myjkkn-omm-dev.vercel.app/solutions/software/builders

**Login**: `test-superadmin@jkkn.local` / `SuperAdmin@123`

---

**Estimated Time to Complete**: 2 minutes
**Risk Level**: Low (creating missing function, no data changes)
**Rollback Plan**: Not needed (function creation is idempotent)
