# Department-Level Access Control for Course Mappings

**Date**: 2025-01-16
**Type**: FEATURE
**Module**: Organizations - Course Mappings
**Status**: Implemented

## Overview

Implemented department-level access control to restrict users (especially HOD role) to only view and manage course mappings for their assigned department, similar to existing institution-level filtering.

## Problem Statement

### Before

- ✅ Institution-level filtering was working correctly
- ❌ Department-level filtering was **NOT implemented**
- **Issue**: HOD users with `department_id` set in their profile could see **all departments** within their institution
- **Impact**: HOD users had access to other departments' course mappings, violating department-level data isolation

### Example Scenario

```
HOD User Profile:
- institution_id: "jkkn_engineering"
- department_id: "computer_science"
- role: "hod"

Before Fix:
✅ Could only see courses for "jkkn_engineering" (institution filter working)
❌ Could see ALL departments: CS, Mechanical, Electrical, Civil, etc. (no department filter)

After Fix:
✅ Can only see "jkkn_engineering" institution
✅ Can only see "computer_science" department
```

## Solution Architecture

### 1. Created Department Access Hook

**File**: `hooks/use-user-department-access.ts`

Similar to `useUserInstitutionAccess`, this hook provides:
- `departmentId`: User's assigned department from profile
- `hasDepartmentRestriction`: Whether user is restricted to a specific department
- `canAccessAllDepartments`: Super admins or users without department_id
- `hasAccessToDepartment(id)`: Check if user can access specific department
- `createDepartmentFilter()`: Filter arrays by department
- `getDepartmentFilterClause()`: Generate SQL WHERE clause

```typescript
// Usage
const { departmentId, hasDepartmentRestriction, canAccessAllDepartments } = useUserDepartmentAccess();
```

### 2. Updated Type Definitions

**File**: `types/organizations.ts`

Added `bypassDepartmentFilter` to `CourseMappingFilters`:

```typescript
export interface CourseMappingFilters {
  // ... existing fields
  userId?: string; // For applying user-based institution and department filtering
  bypassInstitutionFilter?: boolean; // To bypass institution filtering when needed
  bypassDepartmentFilter?: boolean; // To bypass department filtering when needed ← NEW
}
```

### 3. Updated Course Mapping Service

**File**: `lib/services/organization/course-mapping-service.ts`

#### Added Helper Method

```typescript
private static async getUserDepartmentId(userId: string): Promise<string | null> {
  const { data, error } = await this.supabase
    .from('profiles')
    .select('department_id')
    .eq('id', userId)
    .single();

  return data?.department_id || null;
}
```

#### Updated `getCourseMappings` Method

```typescript
// Apply department filtering based on user's department if userId is provided
if (filters.userId && !filters.bypassDepartmentFilter) {
  const userDepartmentId = await this.getUserDepartmentId(filters.userId);
  // Only apply department filter if user has a department_id (HOD, department-specific roles)
  if (userDepartmentId) {
    query = query.eq('department_id', userDepartmentId);
  }
}
```

### 4. Updated Data Table Component

**File**: `app/(routes)/organizations/courses/mappings/_components/course-mappings-data-table.tsx`

- Added `useAuth` hook import
- Added `profile` from `useAuth()`
- Updated `fetchData` to include `userId: profile?.id` in filters

```typescript
const { profile } = useAuth();

const filters = {
  // ... other filters
  userId: profile?.id // ← NEW: Enable institution and department filtering
};
```

## How It Works

### Data Flow

```
1. User logs in → Profile loaded with institution_id and department_id
2. Data table calls fetchData() → Passes userId to service
3. Service checks:
   a. If bypassInstitutionFilter = false → Filter by accessible institutions
   b. If bypassDepartmentFilter = false → Filter by user's department_id
4. Query executed with both filters applied
5. Only matching course mappings returned
```

### Filter Logic

```typescript
// Super Admin
if (isSuperAdmin) {
  // See everything - no filters applied
}

// User with institution_id and department_id (e.g., HOD)
if (userId && departmentId) {
  query
    .in('institution_id', accessibleInstitutionIds) // Institution filter
    .eq('department_id', userDepartmentId);         // Department filter ← NEW
}

// User with only institution_id (e.g., Principal)
if (userId && !departmentId) {
  query.in('institution_id', accessibleInstitutionIds); // Only institution filter
}
```

## Testing Scenarios

### Test Case 1: HOD User

```
Profile:
- role: "hod"
- institution_id: "inst_123"
- department_id: "dept_cs"

Expected Results:
✅ Can view only course mappings for dept_cs
✅ Cannot view course mappings for other departments
✅ Can create course mappings only for dept_cs
✅ Can edit/delete only dept_cs course mappings
```

### Test Case 2: Principal User

```
Profile:
- role: "principal"
- institution_id: "inst_123"
- department_id: null

Expected Results:
✅ Can view ALL departments in inst_123
✅ Can create course mappings for any department
✅ Can edit/delete any course mapping in inst_123
```

### Test Case 3: Super Admin

```
Profile:
- role: "super_admin"
- is_super_admin: true

Expected Results:
✅ Can view ALL institutions and departments
✅ No filters applied
```

## Files Modified

1. ✅ `hooks/use-user-department-access.ts` - **NEW FILE** - Department access control hook
2. ✅ `types/organizations.ts` - Added `bypassDepartmentFilter` to CourseMappingFilters
3. ✅ `lib/services/organization/course-mapping-service.ts` - Added department filtering logic
4. ✅ `app/(routes)/organizations/courses/mappings/_components/course-mappings-data-table.tsx` - Pass userId to service & fixed permission bug
5. ✅ `app/(routes)/organizations/courses/mappings/_components/course-mapping-filters.tsx` - **UPDATED** - Filter dropdowns for department-restricted users

## Permission Bug Fix

While implementing department filtering, also fixed a **permission bug**:

**File**: `course-mappings-data-table.tsx:39-40`

```typescript
// BEFORE (Wrong permission)
const canCreate = isSuperAdmin || canAccess('organizations.institutions', 'create');

// AFTER (Correct permission)
const canCreate = isSuperAdmin || canAccess('organizations.course.mappings', 'create');
```

**Impact**: HOD users with `organizations.course.mappings.create` permission can now see the "Map Course" button.

## Benefits

1. ✅ **Enhanced Security**: Department-level data isolation
2. ✅ **Proper RBAC**: HOD users restricted to their department
3. ✅ **Consistent Pattern**: Follows same pattern as institution filtering
4. ✅ **Flexible**: Can be bypassed when needed via `bypassDepartmentFilter` flag
5. ✅ **Scalable**: Easy to apply to other modules (programs, semesters, sections, etc.)

## Future Enhancements

### 1. Apply to Other Modules

The same department filtering pattern can be applied to:
- Programs
- Semesters
- Sections
- Academic planning
- Timetables
- Attendance

### 2. UI Enhancements ✅ COMPLETED

**Implemented** in `course-mapping-filters.tsx`:
- ✅ Auto-select institution for users with `institution_id`
- ✅ Auto-select degree containing user's department
- ✅ Auto-select department for HOD users
- ✅ Disable institution/degree/department dropdowns for restricted users
- ✅ Show only user's department in department dropdown
- ✅ Hide "All Institutions/Degrees/Departments" option for restricted users

**Behavior for HOD Users**:
```typescript
// On page load:
1. Auto-select user's institution (disabled, can't change)
2. Auto-load degrees for that institution
3. Auto-select degree containing their department (disabled)
4. Auto-load their department (only their dept shown, disabled)
5. Enable program and semester dropdowns (can select freely)
```

## Filter Component Changes

### What Was Updated

**File**: `app/(routes)/organizations/courses/mappings/_components/course-mapping-filters.tsx`

#### 1. Added Imports
```typescript
import { useAuth } from '@/hooks/use-auth';
import { useUserDepartmentAccess } from '@/hooks/use-user-department-access';
```

#### 2. Added State Variables
```typescript
const { profile } = useAuth();
const { departmentId, hasDepartmentRestriction } = useUserDepartmentAccess();
```

#### 3. Auto-Select Logic

**Institution Auto-Select**:
```typescript
useEffect(() => {
  if (profile?.institution_id && !searchParams.institution_id) {
    onFilterChange('institution_id', profile.institution_id);
  }
}, [profile?.institution_id]);
```

**Degree Auto-Select** (finds degree containing user's department):
```typescript
if (hasDepartmentRestriction && departmentId && !searchParams.degree_id) {
  const { data: deptData } = await DepartmentService.getDepartments({
    institution_id: searchParams.institution_id,
    isActive: true
  });
  const userDept = deptData.find(d => d.id === departmentId);
  if (userDept?.degree_id) {
    onFilterChange('degree_id', userDept.degree_id);
  }
}
```

**Department Filtering & Auto-Select**:
```typescript
// Filter to show only user's department
let filteredDepartments = data;
if (hasDepartmentRestriction && departmentId) {
  filteredDepartments = data.filter(dept => dept.id === departmentId);

  // Auto-select if not already selected
  if (filteredDepartments.length > 0 && !searchParams.department_id) {
    onFilterChange('department_id', departmentId);
  }
}
setDepartments(filteredDepartments);
```

#### 4. Dropdown Disabled States

**Institution Dropdown**:
```typescript
disabled={loading || (hasDepartmentRestriction && !!profile?.institution_id)}
```

**Degree Dropdown**:
```typescript
disabled={!searchParams.institution_id || loading || hasDepartmentRestriction}
```

**Department Dropdown**:
```typescript
disabled={!searchParams.degree_id || loading || hasDepartmentRestriction}
```

#### 5. Conditional "All" Options

All dropdowns now conditionally show "All" option:
```typescript
{!hasDepartmentRestriction && <SelectItem value='all'>All Institutions</SelectItem>}
{!hasDepartmentRestriction && <SelectItem value='all'>All Degrees</SelectItem>}
{!hasDepartmentRestriction && <SelectItem value='all'>All Departments</SelectItem>}
```

### 3. Service Layer Enhancement

Create a centralized access control service:

```typescript
// Proposed: lib/services/access-control-service.ts
export class AccessControlService {
  static async applyUserAccessFilters(query, userId) {
    // Apply both institution and department filters
    // Reusable across all services
  }
}
```

## Migration Notes

### For Existing Deployments

No database migrations needed. The implementation:
- ✅ Uses existing `department_id` field in `profiles` table
- ✅ Uses existing `department_id` field in `course_mappings` table
- ✅ Backward compatible - if `department_id` is null, no filtering applied

### Rollout Strategy

1. Deploy code changes
2. Verify HOD users have `department_id` set in profiles
3. Test with HOD user account
4. Monitor for any access issues
5. Apply same pattern to other modules gradually

## Related Documentation

- `hooks/use-user-institution-access.ts` - Institution-level filtering
- `lib/services/users/user-institution-access-service.ts` - Institution access service
- `lib/constants/permissions.ts` - Permission definitions
- `CLAUDE.md` - Architecture guidelines

## Notes

- Super admins (`is_super_admin: true`) bypass ALL filters
- Users without `department_id` can access all departments (e.g., Principal, Administrator)
- Users with `department_id` are restricted to that department only
- Bypass flags allow flexibility for special cases (reports, analytics, etc.)
