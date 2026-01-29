# HOD Leave/OnDuty Permission Format Fix

**Date**: 2026-01-29
**Type**: Bug Fix
**Severity**: High
**Status**: ✅ Fixed

## Problem

HOD users with academic leave/onduty permissions enabled were unable to see the Leave/OnDuty menu items or access the pages, despite having the permissions assigned.

## Root Cause

The HOD role in the `custom_roles` table had permissions stored with an **incorrect format**:

**Incorrect Format** (stored in database):
```json
{
  "academic.leave.onduty.approve": true,    // ❌ Has dot after "leave"
  "academic.leave.onduty.manage": true,     // ❌ Has dot after "leave"
  "academic.leave.onduty.reports": true     // ❌ Has dot after "leave"
}
```

**Correct Format** (expected by code):
```json
{
  "academic.leave_onduty.approve": true,    // ✅ Has underscore
  "academic.leave_onduty.manage": true,     // ✅ Has underscore
  "academic.leave_onduty.reports": true     // ✅ Has underscore
}
```

## Impact

- HOD users could not access any Leave/OnDuty pages
- Menu items for Leave/OnDuty were hidden from HOD users
- Permission checks returned `false` even though permissions were assigned
- Affected routes:
  - `/academic/leave-onduty/approvals`
  - `/academic/leave-onduty/settings`
  - `/academic/leave-onduty/reports`

## Solution

Applied database migration to fix the permission keys in the HOD role:

**Migration**: `20260129150000_fix_hod_leave_onduty_permissions.sql`

**Changes**:
1. Removed old permission keys with dots (`.onduty.`)
2. Added new permission keys with underscores (`_onduty.`)
3. Updated the `updated_at` timestamp

## Verification

### Before Fix
```sql
SELECT permissions->'academic.leave.onduty.approve' FROM custom_roles WHERE role_key = 'hod';
-- Result: true ❌ (wrong key format)
```

### After Fix
```sql
SELECT permissions->'academic.leave_onduty.approve' FROM custom_roles WHERE role_key = 'hod';
-- Result: true ✅ (correct key format)

SELECT permissions->'academic.leave.onduty.approve' FROM custom_roles WHERE role_key = 'hod';
-- Result: null ✅ (old key removed)
```

## Why This Happened

This was likely a typo when the HOD permissions were initially set up. The permission keys should have used underscores (`_`) instead of dots (`.`) for the compound word "leave_onduty".

The permission definitions in `lib/constants/permissions.ts` correctly use underscores:
```typescript
{ key: 'academic.leave_onduty.approve', label: '...' }  // ✅ Correct
```

But the HOD role in the database had dots:
```json
"academic.leave.onduty.approve": true  // ❌ Incorrect
```

## Testing Steps

1. **Clear Browser Cache**: HOD users should clear cache or hard refresh (Ctrl+Shift+R)
2. **Re-login**: Users should log out and log back in to refresh permissions
3. **Verify Menu Items**: Check that Leave/OnDuty menu items now appear under "Academic"
4. **Test Access**: Try accessing each route:
   - `/academic/leave-onduty/approvals` - Should load approval dashboard
   - `/academic/leave-onduty/settings` - Should load workflow settings
   - `/academic/leave-onduty/reports` - Should load reports page

## Prevention

To prevent this issue in the future:

1. **Use Constants**: Always reference permission keys from `lib/constants/permissions.ts`
2. **Validation Script**: Create a script to validate permission keys match the definitions
3. **Type Safety**: Consider creating TypeScript types for permission keys
4. **Documentation**: Document the naming convention (use underscores for compound words)

## Related Files

- `supabase/migrations/20260129150000_fix_hod_leave_onduty_permissions.sql` - Migration file
- `lib/constants/permissions.ts` - Permission definitions (correct format)
- `lib/sidebarMenuLink.ts` - Menu permission mappings
- `hooks/use-permissions.ts` - Permission checking logic

## Other Roles Checked

Verified that **only the HOD role** had this issue. Other system roles do not have Leave/OnDuty permissions or have them in the correct format.

## Migration Applied

```sql
-- Applied to database
UPDATE custom_roles
SET
  permissions =
    permissions
    - 'academic.leave.onduty.approve'
    - 'academic.leave.onduty.manage'
    - 'academic.leave.onduty.reports'
    - 'learners.leave.onduty.apply'
    - 'learners.leave.onduty.view'
    - 'learners.leave.onduty.edit'
    - 'learners.leave.onduty.cancel'
    ||
    jsonb_build_object(
      'academic.leave_onduty.approve', true,
      'academic.leave_onduty.manage', true,
      'academic.leave_onduty.reports', true,
      'learners.leave_onduty.apply', false,
      'learners.leave_onduty.view', false,
      'learners.leave_onduty.edit', false,
      'learners.leave_onduty.cancel', false
    ),
  updated_at = now()
WHERE role_key = 'hod';
```

## Conclusion

✅ **Issue Resolved**: HOD users now have properly formatted permissions and can access Leave/OnDuty pages.

**Action Required**: HOD users should log out and log back in to see the changes take effect.
