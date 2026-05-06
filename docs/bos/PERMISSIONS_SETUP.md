# BOS Syllabi Permissions Setup Guide

## Overview

The Board of Studies syllabi feature implements role-based access control (RBAC) at two levels:
1. **System-level roles** — default permissions based on predefined system roles
2. **Custom roles** — fine-grained permissions via the custom_roles table

## Permission Keys

All BOS syllabi permissions use the `bos.syllabi.*` namespace:

| Permission Key | Description | Default Roles |
|---|---|---|
| `bos.syllabi.view` | View syllabi list and details | All roles (except guest) |
| `bos.syllabi.create` | Create new syllabi | Admin, HOD, Faculty |
| `bos.syllabi.edit` | Edit existing syllabi | Admin, HOD, Faculty |
| `bos.syllabi.delete` | Delete syllabi permanently | Admin only |
| `bos.syllabi.revise` | Create new revisions | Admin, HOD, Faculty |
| `bos.syllabi.duplicate` | Duplicate to other regulations | Admin, HOD, Faculty |
| `bos.syllabi.export` | Export syllabi as PDF | All roles (except guest) |
| `bos.syllabi.manage_taxonomy` | Manage boards and regulations | Admin only |

## Default Role Permissions

### Super Admin & Administrator
- Full access to all BOS operations
- Can view, create, edit, delete, revise, duplicate, export, and manage taxonomy

### Principal
- View-only access to syllabi
- Can export syllabi
- Cannot create, edit, delete, or manage taxonomy

### Head of Department (HOD)
- Can create and edit syllabi for their institution
- Can revise and duplicate syllabi
- Can export syllabi
- Cannot delete or manage taxonomy

### Faculty
- Same as HOD
- Can create, edit, revise, duplicate, and export syllabi
- Cannot delete or manage taxonomy

### Other Roles (Student, Staff, Parent, Guest)
- View-only or no access depending on role
- Cannot perform any administrative actions

## How Permission Checking Works

The `useBosPermissions()` hook checks permissions in this order:

```
1. Is user authenticated?
   └─ No → All permissions = false
   └─ Yes → Continue to step 2

2. Is user super admin?
   └─ Yes → All permissions = true (bypass other checks)
   └─ No → Continue to step 3

3. Does user have custom role with merged_permissions?
   └─ Yes → Use merged_permissions (custom role overrides defaults)
   └─ No → Continue to step 4

4. Use default permissions for user's system role
```

## Setting Up Custom Role Permissions

To create a custom role with specific permissions:

```sql
INSERT INTO custom_roles (
  institution_id,
  role_key,
  role_name,
  description,
  is_system_role,
  institution_scope,
  permissions
) VALUES (
  'inst-123',
  'bos_coordinator',
  'BoS Coordinator',
  'Board of Studies coordinator with limited edit rights',
  false,
  'own_institution',
  json_build_object(
    'bos.syllabi.view', true,
    'bos.syllabi.create', true,
    'bos.syllabi.edit', true,
    'bos.syllabi.delete', false,
    'bos.syllabi.revise', true,
    'bos.syllabi.duplicate', true,
    'bos.syllabi.export', true,
    'bos.syllabi.manage_taxonomy', false
  )
);
```

Then assign users to this role via the `user_roles` table.

## UI Permission Enforcement

The syllabi page enforces permissions by:

1. **Header buttons** — Disabled if user lacks create/manage_taxonomy permissions
2. **Table actions** — Hidden if user lacks edit/delete/revise/duplicate permissions
3. **Permission alerts** — Shows warning if user has view-only access
4. **Page visibility** — Hides entire table if user lacks view permission

### Permission Alert Examples

**No Access:**
```
"You do not have permission to view course syllabi. 
Please contact your administrator."
```

**View Only:**
```
"You have view-only access to course syllabi. 
To create, edit, or manage syllabi, contact your administrator."
```

## Granting Permissions to Users

### Option 1: Change System Role
```sql
UPDATE profiles
SET role = 'hod'
WHERE id = 'user-id';
```

### Option 2: Create Custom Role and Assign
```sql
-- 1. Create custom role
INSERT INTO custom_roles (...) VALUES (...) RETURNING id;

-- 2. Assign to user
INSERT INTO user_roles (user_id, role_id, is_primary)
VALUES ('user-id', 'role-id', true);
```

### Option 3: Bulk Update via Supabase Dashboard
1. Go to Supabase Dashboard → SQL Editor
2. Run update query targeting specific users/institutions
3. Changes take effect immediately (profile cache expires)

## Testing Permissions

### In Development
1. Create test users with different roles
2. Use `useBosPermissions()` hook to verify returned permissions
3. Check that UI buttons are disabled appropriately
4. Verify permission alerts display for restricted users

### Quick Permission Check Hook
```typescript
const permissions = useBosPermissions();
console.log('Can create syllabi:', permissions.canCreate);
console.log('Can delete syllabi:', permissions.canDelete);
```

### Browser DevTools Check
```javascript
// In any BOS page, open browser console:
// This will show all current user permissions
```

## Audit Trail

All permission checks are logged in the page lifecycle:
- Permission checks happen during component render
- Button disabling is visible in React DevTools
- API calls include permission validation on backend

## Best Practices

1. **Principle of Least Privilege** — Grant only required permissions
2. **Institution Scope** — Use `institution_scope: 'own'` for HOD/Faculty roles
3. **Regular Audits** — Review user permissions quarterly
4. **Documentation** — Document custom roles in your institution wiki
5. **Test After Changes** — Verify permissions work after role updates

## Troubleshooting

### "You do not have permission" message appears
- Check user's role: `SELECT role FROM profiles WHERE id = 'user-id'`
- Check custom roles: `SELECT * FROM user_roles WHERE user_id = 'user-id'`
- Check merged_permissions: `SELECT merged_permissions FROM profiles WHERE id = 'user-id'`

### Permissions not updating after role change
- Permissions cache expires after 5 minutes (see `use-auth-provider.tsx`)
- User can refresh page to clear cache immediately
- Check auth state change listeners in browser console

### Super admin cannot see edit buttons
- Clear browser localStorage: `localStorage.clear()`
- Reload page to refresh auth context
- Check `is_super_admin` field in profiles table

## Related Files

- `hooks/bos/use-bos-permissions.ts` — Permission hook implementation
- `app/bos/syllabi/page.tsx` — Syllabi page with permission checks
- `components/bos/syllabus-list-table.tsx` — Table with permission-based actions
- `types/auth.ts` — Permission interfaces and role definitions

## See Also

- [OPTIONAL_ENHANCEMENTS_SUMMARY.md](./OPTIONAL_ENHANCEMENTS_SUMMARY.md) — Email notifications and admin dashboard
- [SKILL_COMPLIANCE_AUDIT.md](./SKILL_COMPLIANCE_AUDIT.md) — 7-layer architecture compliance
