# Fix: Role-Based Access Control - Create Button Permissions

**Date**: 2026-01-23
**Type**: Bug Fix
**Severity**: High
**Category**: Authentication & Authorization

## Summary

Fixed incorrect permission checks for "Create" buttons across 5 organization modules. The modules were checking for `organizations.institutions` create permission instead of their own resource-specific permissions, preventing users with proper role-based permissions (e.g., HOD role) from accessing create functionality.

## Root Cause

Copy-paste error during module development. All affected modules were likely copied from the institutions module template, and the permission check was not updated to match the specific resource being managed.

## Affected Modules

1. **Sections** (`app/(routes)/organizations/sections/_components/sections-data-table.tsx:47-48`)
2. **Semesters** (`app/(routes)/organizations/semesters/_components/semesters-data-table.tsx:57-58`)
3. **Degrees** (`app/(routes)/organizations/degrees/_components/degrees-data-table.tsx:47-48`)
4. **Programs** (`app/(routes)/organizations/programs/_components/programs-data-table.tsx:47-48`)
5. **Departments** (`app/(routes)/organizations/departments/_components/departments-data-table.tsx:47-48`)

## Symptoms

- HOD role with section create permission could not see "Add Section" button
- Users with specific module create permissions (sections, semesters, degrees, programs, departments) were denied access
- Only Super Admins and users with institution create permission could create records
- Row actions (view, edit, delete) worked correctly because they had proper permission checks

## Investigation Process

### Phase 1: Root Cause Investigation

1. **Read Error Pattern**: User reported HOD role not working for section creation
2. **Examined Permission Check**: Found line 47-48 in `sections-data-table.tsx`:
   ```typescript
   const canCreate =
     isSuperAdmin || canAccess('organizations.institutions', 'create');
   ```
3. **Verified Permission System**: Checked `use-permissions.ts` hook - working correctly
4. **Compared Row Actions**: Found row actions used correct permission:
   ```typescript
   const canView = isSuperAdmin || canAccess('organizations.sections', 'view');
   const canEdit = isSuperAdmin || canAccess('organizations.sections', 'edit');
   ```

### Phase 2: Pattern Analysis

1. **Searched Organization Modules**: Found similar bugs in 4 other modules
2. **Identified Pattern**: All modules checking `organizations.institutions` instead of their own resource
3. **Verified Working Examples**: Courses, Institutions modules had correct permission checks

### Phase 3: Hypothesis

**Hypothesis**: Copy-paste error from institutions module template

**Evidence**:
- All 5 modules had identical incorrect permission check
- Row actions in same files used correct permissions
- Similar pattern across all affected modules

## Changes Made

### 1. Sections Module
```typescript
// Before
const canCreate =
  isSuperAdmin || canAccess('organizations.institutions', 'create');

// After
const canCreate =
  isSuperAdmin || canAccess('organizations.sections', 'create');
```

### 2. Semesters Module
```typescript
// Before
const canCreate =
  isSuperAdmin || canAccess('organizations.institutions', 'create');

// After
const canCreate =
  isSuperAdmin || canAccess('organizations.semesters', 'create');
```

### 3. Degrees Module
```typescript
// Before
const canCreate =
  isSuperAdmin || canAccess('organizations.institutions', 'create');

// After
const canCreate =
  isSuperAdmin || canAccess('organizations.degrees', 'create');
```

### 4. Programs Module
```typescript
// Before
const canCreate =
  isSuperAdmin || canAccess('organizations.institutions', 'create');

// After
const canCreate =
  isSuperAdmin || canAccess('organizations.programs', 'create');
```

### 5. Departments Module
```typescript
// Before
const canCreate =
  isSuperAdmin || canAccess('organizations.institutions', 'create');

// After
const canCreate =
  isSuperAdmin || canAccess('organizations.departments', 'create');
```

## Files Modified

- `app/(routes)/organizations/sections/_components/sections-data-table.tsx`
- `app/(routes)/organizations/semesters/_components/semesters-data-table.tsx`
- `app/(routes)/organizations/degrees/_components/degrees-data-table.tsx`
- `app/(routes)/organizations/programs/_components/programs-data-table.tsx`
- `app/(routes)/organizations/departments/_components/departments-data-table.tsx`

## Testing Recommendations

### Manual Testing

1. **Create HOD Test Role**:
   ```sql
   -- Create HOD role with section create permission
   INSERT INTO roles (role_key, role_name, permissions)
   VALUES ('hod', 'Head of Department', '{
     "organizations.sections.view": true,
     "organizations.sections.create": true,
     "organizations.sections.edit": true,
     "organizations.sections.delete": true
   }');
   ```

2. **Assign HOD Role to Test User**:
   ```sql
   INSERT INTO user_role_assignments (user_id, role_id, is_primary)
   VALUES ('test-user-id', (SELECT id FROM roles WHERE role_key = 'hod'), true);
   ```

3. **Test Each Module**:
   - Log in as HOD user
   - Navigate to each organization module:
     - `/organizations/sections` - Should see "Add Section" button
     - `/organizations/semesters` - Should see "Add Semester" button
     - `/organizations/degrees` - Should see "Add Degree" button
     - `/organizations/programs` - Should see "Add Program" button
     - `/organizations/departments` - Should see "Add Department" button
   - Verify create functionality works

### Automated Testing (Future Enhancement)

```typescript
describe('Organization Module Permissions', () => {
  it('should show create button when user has module create permission', () => {
    // Test for each module: sections, semesters, degrees, programs, departments
    const modules = ['sections', 'semesters', 'degrees', 'programs', 'departments'];

    modules.forEach(module => {
      const mockUser = {
        role: 'hod',
        permissions: {
          [`organizations.${module}.create`]: true
        }
      };

      render(<ModuleDataTable />, { user: mockUser });
      expect(screen.getByText(`Add ${module}`)).toBeInTheDocument();
    });
  });
});
```

## Permission Structure

### Correct Permission Format
```
organizations.{resource}.{action}

Examples:
- organizations.sections.view
- organizations.sections.create
- organizations.sections.edit
- organizations.sections.delete
```

### Resource Names
- `institutions` - Institution management
- `programs` - Program management
- `departments` - Department management
- `degrees` - Degree management
- `semesters` - Semester management
- `sections` - Section management
- `courses` - Course management

## Prevention Guidelines

1. **Code Review Checklist**:
   - Verify permission checks match the resource being managed
   - Check both data table toolbar and row actions
   - Ensure consistency across view, create, edit, delete actions

2. **Template Pattern**:
   ```typescript
   // In [resource]-data-table.tsx
   const canCreate =
     isSuperAdmin || canAccess('organizations.[resource]', 'create');

   // In row-actions.tsx
   const canView = isSuperAdmin || canAccess('organizations.[resource]', 'view');
   const canEdit = isSuperAdmin || canAccess('organizations.[resource]', 'edit');
   const canDelete = isSuperAdmin || canAccess('organizations.[resource]', 'delete');
   ```

3. **Testing**:
   - Test with non-super admin roles
   - Create specific role permissions for each module
   - Verify all CRUD operations respect permissions

## Impact

**Before Fix**:
- Users with role-based permissions couldn't create records
- Only super admins and institution admins had access
- Permission system appeared broken to end users

**After Fix**:
- Proper role-based access control for all organization modules
- HOD and other custom roles can create records based on their permissions
- Consistent permission behavior across all modules

## Related Files

- Permission hook: `hooks/use-permissions.ts`
- Role service: `lib/services/roles/role-service.ts`
- User roles service: `lib/services/users/user-roles-service.ts`
- Types: `types/auth.ts`

## Notes

- Row actions (view, edit, delete) were already using correct permissions
- Only create button permission checks were affected
- The permission system (`use-permissions.ts`) was working correctly
- This was purely a resource name mismatch in permission checks

## Verification

Run the following command to verify no more instances of incorrect permission checks:

```bash
# Should only return institutions-data-table.tsx (which is correct)
grep -r "canAccess('organizations.institutions', 'create')" app/(routes)/organizations --include="*.tsx"
```

Expected output: Only `institutions/_components/institutions-data-table.tsx` should appear.

## Related Issues

- User reported: "HOD role create section permission not working"
- Affects all custom roles with granular permissions
- No impact on super admin users (they bypass permission checks)

---

**Fixed by**: Claude Code (Systematic Debugging Skill)
**Debugging Methodology**: Root Cause Investigation → Pattern Analysis → Hypothesis → Implementation
**Commit**: Pending
