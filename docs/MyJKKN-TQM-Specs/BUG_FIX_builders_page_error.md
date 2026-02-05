# Bug Fix: "Failed to load builders" Error

**Date**: 2026-02-05
**Status**: Root cause identified, fix ready to apply
**Affected URL**: https://myjkkn-omm-dev.vercel.app/solutions/software/builders
**Severity**: P0 - Critical (blocks entire Solutions Hub builder functionality)

---

## Problem Summary

The Solutions Hub Builders page displays error: **"Failed to load builders. Please try refreshing the page."**

---

## Root Cause Analysis

### Error Chain:
1. **Frontend**: `BuildersList` component renders error alert when `useBuilders` hook's `error` state is truthy
2. **Hook**: `useBuilders` calls `buildersService.getBuilders(filters)` via React Query
3. **Service**: `BuildersService.getBuilders()` queries `sh_builders` table
4. **Database**: RLS policy on `sh_builders` calls **missing function** `sh_is_staff()`
5. **Failure**: Query fails because `sh_is_staff()` doesn't exist, blocking access

### RLS Policy (from `supabase/setup/03_policies.sql`):
```sql
CREATE POLICY "sh_builders_select" ON public.sh_builders
    FOR SELECT TO authenticated
    USING (
        sh_is_admin()
        OR (sh_is_hod() AND department_id = sh_user_department_id())
        OR (sh_is_staff() AND department_id = sh_user_department_id())  -- ❌ FUNCTION MISSING
        OR user_id = auth.uid()
        OR (sh_is_builder() AND id IN (...))
    );
```

### Functions Status:
| Function | Exists? | Purpose |
|----------|---------|---------|
| `sh_is_admin()` | ✅ Yes | Check if user is admin/jicate_staff |
| `sh_is_hod()` | ✅ Yes | Check if user is HOD |
| `sh_user_department_id()` | ✅ Yes | Get user's department |
| `sh_is_builder()` | ✅ Yes | Check if user is active builder |
| **`sh_is_staff()`** | ❌ **NO** | **Check if user is staff - MISSING!** |

---

## Impact Assessment

### Who is affected:
- **All users** trying to access `/solutions/software/builders`
- Test superadmin (`test-superadmin@jkkn.local`) - even with `super_admin` role

### Why superadmin is blocked:
The `sh_is_admin()` function checks:
```sql
role IN ('super_admin', 'admin', 'jicate_staff')
```

But test user might have:
- `role = 'super_admin'` ✅ (should work)
- **OR** missing `role` field ❌
- **OR** `is_super_admin = true` without correct role string ❌

Need to verify test user's actual role value.

---

## Solution

### Fix: Create missing `sh_is_staff()` function

```sql
-- Create sh_is_staff() function
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
```

### Application Steps:

#### Option A: Via Supabase Dashboard SQL Editor (RECOMMENDED)
1. Go to: https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/sql
2. Copy SQL from `/Users/omm/PROJECTS/MyJKKN/QUICK_FIX_sh_is_staff.sql`
3. Click "Run"
4. Verify: Function appears in SQL editor autocomplete
5. Test: Refresh builders page

#### Option B: Via Supabase CLI (requires migration repair)
```bash
cd /Users/omm/PROJECTS/MyJKKN

# Apply the migration
~/bin/supabase db push --linked
```

**Note**: CLI push currently fails due to migration history mismatch. Dashboard method recommended.

---

## Files Modified

### 1. Migration Created:
**File**: `/Users/omm/PROJECTS/MyJKKN/supabase/migrations/20260205000001_add_sh_is_staff_function.sql`
- Adds missing `sh_is_staff()` function
- Includes DROP IF EXISTS for idempotency
- Includes verification query

### 2. Setup File Updated:
**File**: `/Users/omm/PROJECTS/MyJKKN/supabase/setup/02_functions.sql` (line ~4120)
- Added `sh_is_staff()` function after `sh_user_institution_id()`
- Maintains consistency with other permission functions

### 3. Quick Fix SQL:
**File**: `/Users/omm/PROJECTS/MyJKKN/QUICK_FIX_sh_is_staff.sql`
- Ready-to-run SQL for dashboard application
- Includes verification query

---

## Verification Steps

After applying the fix:

### 1. Verify Function Exists:
```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'sh_is_staff';
```
**Expected**: 1 row with `routine_type = 'FUNCTION'`

### 2. Test Function:
```sql
SELECT
    auth.uid() as current_user_id,
    sh_is_admin() as is_admin,
    sh_is_staff() as is_staff,
    sh_is_hod() as is_hod,
    sh_is_builder() as is_builder;
```
**Expected**: At least one permission should be `true` for test user

### 3. Test Query:
```sql
SELECT id, name, email, department_id, is_active
FROM sh_builders
LIMIT 5;
```
**Expected**: Returns rows (or empty set if no builders exist)

### 4. Browser Test:
- Open: https://myjkkn-omm-dev.vercel.app/solutions/software/builders
- Login as: `test-superadmin@jkkn.local` / `SuperAdmin@123`
- **Expected**: Builders page loads (even if empty)

---

## Additional Investigation Needed

### 1. Check Test User Role:
```sql
SELECT id, email, role, is_super_admin, department_id
FROM profiles
WHERE email = 'test-superadmin@jkkn.local';
```

### 2. Check if Builders Exist:
```sql
SELECT COUNT(*) as builder_count
FROM sh_builders;
```

If count = 0, the page will load but show "No builders found" (which is correct).

### 3. Check Other Solutions Hub Pages:
Test these URLs after fix:
- `/solutions/software/clients` - Client list
- `/solutions/software/solutions` - Solutions list
- `/solutions/software/phases` - Phase management

All may have similar RLS issues if `sh_is_staff()` is referenced elsewhere.

---

## Related Files for Reference

### Frontend:
- `/Users/omm/PROJECTS/MyJKKN/app/(routes)/solutions/software/builders/page.tsx` - Server component
- `/Users/omm/PROJECTS/MyJKKN/app/(routes)/solutions/software/builders/_components/builders-list.tsx` - Client component (error display)
- `/Users/omm/PROJECTS/MyJKKN/hooks/solutions/use-builders.ts` - React Query hooks

### Backend:
- `/Users/omm/PROJECTS/MyJKKN/lib/services/solutions/builders-service.ts` - Service layer
- `/Users/omm/PROJECTS/MyJKKN/lib/services/solutions/types.ts` - TypeScript types

### Database:
- `/Users/omm/PROJECTS/MyJKKN/supabase/setup/01_tables.sql` (line 2785) - `sh_builders` table definition
- `/Users/omm/PROJECTS/MyJKKN/supabase/setup/02_functions.sql` (line 4063+) - Solutions Hub permission functions
- `/Users/omm/PROJECTS/MyJKKN/supabase/setup/03_policies.sql` - RLS policies including `sh_builders_select`

---

## Next Steps

1. **Apply the fix** via Supabase Dashboard SQL Editor
2. **Verify** function creation and RLS policy works
3. **Test** builders page loads without error
4. **Check** if builders table has data (may need test data)
5. **Test** other Solutions Hub pages for similar issues
6. **Commit** all fix files to git

---

## Lessons Learned

### How This Bug Happened:
1. RLS policy was written referencing `sh_is_staff()`
2. Function was never created (oversight during Solutions Hub development)
3. No error until someone tried to access the builders page
4. Function calls in RLS policies fail silently, blocking access

### Prevention:
- Run this SQL to find all missing functions referenced in policies:
```sql
SELECT DISTINCT unnest(regexp_matches(definition, 'sh_\w+\(\)', 'g')) as function_call
FROM pg_policies
WHERE schemaname = 'public'
AND tablename LIKE 'sh_%'
ORDER BY function_call;
```
- Verify each function exists in `information_schema.routines`

---

**Status**: ✅ Fix ready to apply
**Estimated Time**: 2 minutes
**Risk Level**: Low (creating missing function, no data changes)
