# Leave/OnDuty Permission Check Race Condition Fix

**Date**: 2026-01-29
**Type**: Bug Fix
**Severity**: High
**Status**: ✅ Fixed

## Problem

After fixing the HOD permission format issue, HOD users were **still being redirected** to the dashboard when trying to access Leave/OnDuty pages, even though they had the correct permissions assigned.

## Root Cause

**Race Condition in Permission Loading**

The permission check was executing before permissions finished loading:

```typescript
// ❌ BEFORE (Buggy Code)
const { can } = usePermissions();

useEffect(() => {
  if (!authLoading && !can('academic.leave_onduty.approve')) {
    router.replace('/');  // Redirect immediately if permission check fails
  }
}, [authLoading, can, router]);
```

**Timeline of the bug:**
1. Page loads → `authLoading` becomes `false`
2. Permission check runs immediately
3. Permissions are **still loading** from the database
4. `can('academic.leave_onduty.approve')` returns `false` (no permission loaded yet)
5. User gets redirected to home page ❌
6. Permissions finish loading (too late - user already redirected)

## Impact

- **All HOD users** were unable to access Leave/OnDuty pages
- **All users with custom roles** experienced the same issue
- Only **Super Admin** was unaffected (super admin bypasses permission checks)
- Affected routes:
  - `/academic/leave-onduty/approvals`
  - `/academic/leave-onduty/settings` (already had proper fix)
  - `/academic/leave-onduty/reports`
  - `/learners/leave-onduty/apply`
  - `/learners/leave-onduty/my-applications`

## Solution

Added `permissionsLoading` check to wait for permissions to finish loading before checking access:

```typescript
// ✅ AFTER (Fixed Code)
const { can, isLoading: permissionsLoading } = usePermissions();

useEffect(() => {
  // CRITICAL: Wait for both auth AND permissions to finish loading
  if (!authLoading && !permissionsLoading && !can('academic.leave_onduty.approve')) {
    router.replace('/');  // Only redirect after permissions are fully loaded
  }
}, [authLoading, permissionsLoading, can, router]);
```

**Timeline with fix:**
1. Page loads → `authLoading` becomes `false`
2. Permission check waits because `permissionsLoading` is `true`
3. Permissions load from database
4. `permissionsLoading` becomes `false`
5. `can('academic.leave_onduty.approve')` returns `true` ✅
6. User stays on the page (no redirect)

## Files Modified

1. ✅ `app/(routes)/academic/leave-onduty/approvals/page.tsx`
2. ✅ `app/(routes)/academic/leave-onduty/reports/page.tsx`
3. ✅ `app/(routes)/learners/leave-onduty/apply/page.tsx`
4. ✅ `app/(routes)/learners/leave-onduty/my-applications/page.tsx`

**Note**: `settings/page.tsx` already had proper permission handling and didn't need updating.

## Code Changes

### Before (Buggy)
```typescript
const { can } = usePermissions();

useEffect(() => {
  if (!authLoading && !can('permission.key')) {
    router.replace('/');
  }
}, [authLoading, can, router]);
```

### After (Fixed)
```typescript
const { can, isLoading: permissionsLoading } = usePermissions();

useEffect(() => {
  // CRITICAL: Wait for both auth AND permissions to finish loading before checking
  if (!authLoading && !permissionsLoading && !can('permission.key')) {
    router.replace('/');
  }
}, [authLoading, permissionsLoading, can, router]);
```

## Why This Happened

The `usePermissions` hook returns:
- `can` - function to check permissions
- `isLoading` - boolean indicating if permissions are still loading

The original implementation only checked `authLoading` but **ignored** `isLoading` from `usePermissions`. This caused premature permission checks during the loading phase.

### Comparison with canAccess

The `canAccess` function in `usePermissions` hook has built-in loading state handling:

```typescript
// From hooks/use-permissions.ts (lines 276-300)
const canAccess = useCallback(
  (module: string, action: string) => {
    if (isSuperAdmin) {
      return true;
    }

    // ✅ Built-in loading check
    if (isLoading) {
      if (isStudent) {
        return false;
      }
      // For staff/admin, allow temporary access during loading
      return true;
    }

    const permKey = `${module}.${action}`;
    return enhancedPermissions[permKey] || false;
  },
  [enhancedPermissions, isSuperAdmin, isLoading, isStudent]
);
```

However, the simpler `can` function does NOT have loading state handling:

```typescript
// From hooks/use-permissions.ts (lines 368-369)
can: (permission: string) =>
  isSuperAdmin ? true : enhancedPermissions[permission] || false,
  // ❌ No loading check!
```

## Prevention

To prevent this issue in the future:

### 1. Always Check Both Loading States

When using `usePermissions` with redirects, **always** check both:
```typescript
const { can, isLoading: permissionsLoading } = usePermissions();
const { isLoading: authLoading } = useAuth();

useEffect(() => {
  if (!authLoading && !permissionsLoading && !can('permission.key')) {
    // Safe to redirect - both auth and permissions are loaded
    router.replace('/');
  }
}, [authLoading, permissionsLoading, can, router]);
```

### 2. Alternative: Use canAccess Instead

The `canAccess` function has built-in loading handling:
```typescript
const { canAccess } = usePermissions();

useEffect(() => {
  if (!authLoading && !canAccess('academic.leave_onduty', 'approve')) {
    router.replace('/');
  }
}, [authLoading, canAccess, router]);
```

### 3. Code Review Checklist

When reviewing permission checks, verify:
- [ ] Both `authLoading` AND `permissionsLoading` are checked
- [ ] Dependencies array includes both loading states
- [ ] No premature redirects during loading phase

## Testing Steps

1. **Clear browser cache** and **log out**
2. **Log in as HOD user**
3. **Navigate to** `/academic/leave-onduty/approvals`
4. **Verify**: Page loads successfully (no redirect)
5. **Check console**: No permission-related errors
6. **Test other routes**: Verify reports, settings also work

## Related Issues

- **Initial Issue**: HOD permission format bug (fixed in `20260129150000_fix_hod_leave_onduty_permissions.sql`)
- **This Issue**: Race condition in permission checking

Both issues needed to be fixed for HOD users to access Leave/OnDuty pages.

## Conclusion

✅ **Issue Resolved**: HOD users can now access Leave/OnDuty pages without being redirected.

**Root Causes Fixed**:
1. ✅ Permission format corrected (underscore instead of dot)
2. ✅ Race condition fixed (wait for permissions to load)

**Action Required**: Users should refresh their browser (hard refresh: Ctrl+Shift+R) to load the updated code.
