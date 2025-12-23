# Learner Profile Sync - Permission Implementation

**Date**: 2025-01-22
**Feature**: Profile Sync Button Permission Controls
**Module**: Learners

## Overview

Implemented comprehensive permission controls for the "Sync Missing Profiles" feature in the learners module. Only super admins and users with specific role-based permissions can access this sensitive bulk operation.

## Permission Key

```
learners.profiles.sync
```

## Access Control

### Who Can Access?

1. **Super Admins** - Always have access (is_super_admin = true)
2. **Custom Roles** - Users with the `learners.profiles.sync` permission enabled

### Where Applied?

#### Frontend (UI Level)
**File**: `app/(routes)/learners/profiles/page.tsx`

```typescript
const { isSuperAdmin, canAccess } = usePermissions();
const canSyncProfiles = isSuperAdmin || canAccess('learners.profiles.sync');

// Conditional rendering
{canSyncProfiles && <CreateMissingProfilesButton />}
```

#### Backend (API Level)

**File 1**: `app/api/learners/check-missing-profiles/route.ts`
- Authenticates user
- Fetches user profile and role
- Checks for permission or super admin status
- Returns 403 if unauthorized

**File 2**: `app/api/learners/create-missing-profiles/route.ts`
- Same permission checks as above
- Prevents unauthorized bulk user creation

## Permission Check Logic

```typescript
// Get role permissions
const permissions = rolePermissions?.permissions || {};

// Check permission
const hasPermission =
  permissions['all'] === true ||                    // Full access
  permissions['learners.profiles.sync'] === true || // Specific permission
  profile.is_super_admin;                           // Super admin

if (!hasPermission) {
  return NextResponse.json(
    {
      success: false,
      error: 'You do not have permission to sync learner profiles'
    },
    { status: 403 }
  );
}
```

## Error Messages

### Frontend Error Handling

- **401 Unauthorized**: "Please log in to continue."
- **403 Forbidden**: "You do not have permission to sync learner profiles. Contact your administrator."
- **Other Errors**: Specific error message from API

### User Experience

1. Button is **hidden** if user lacks permission (frontend)
2. If somehow accessed, API returns **403 Forbidden** (backend)
3. Clear error messages guide users to contact administrators

## Adding Permission to Custom Roles

To grant this permission to a role:

### Option 1: Via Supabase Dashboard

1. Go to `custom_roles` table
2. Find the role you want to update
3. Edit the `permissions` JSONB column
4. Add: `"learners.profiles.sync": true`

Example:
```json
{
  "all": false,
  "learners.view": true,
  "learners.edit": true,
  "learners.profiles.sync": true
}
```

### Option 2: Via SQL

```sql
-- Add permission to a specific role
UPDATE custom_roles
SET permissions = jsonb_set(
  permissions,
  '{learners.profiles.sync}',
  'true'::jsonb
)
WHERE role_key = 'admin_officer';
```

## Security Benefits

1. **Defense in Depth**: Protection at both UI and API levels
2. **Principle of Least Privilege**: Only authorized users can bulk create accounts
3. **Audit Trail**: All API calls are logged with user context
4. **Clear Error Messages**: Users know why they can't access features

## Related Files

- `app/(routes)/learners/profiles/page.tsx` - Frontend permission check
- `app/api/learners/check-missing-profiles/route.ts` - Backend auth for checking
- `app/api/learners/create-missing-profiles/route.ts` - Backend auth for creating
- `app/(routes)/learners/profiles/_components/create-missing-profiles-button.tsx` - Error handling

## Testing Checklist

- [ ] Super admin can see and use the sync button
- [ ] User with `learners.profiles.sync` permission can use the feature
- [ ] User without permission cannot see the button
- [ ] Direct API calls without permission return 403
- [ ] Unauthenticated requests return 401
- [ ] Error messages display correctly in UI

## Notes

This permission should be granted carefully as it allows:
- Viewing all active learners without user accounts
- Bulk creation of user accounts with temporary passwords
- Access to sensitive user data

Only assign to trusted administrative roles.
