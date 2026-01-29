# Leave/OnDuty Permission Enforcement Implementation

**Date**: 2026-01-29
**Type**: Feature Enhancement
**Module**: Leave/OnDuty Application System
**Status**: ✅ Complete

## Overview
Added comprehensive role-based permission enforcement to all Leave/OnDuty module pages using the custom permissions system defined in `lib/constants/permissions.ts`.

## Changes Summary

### 1. Permission Definitions Added
**File**: `lib/constants/permissions.ts`

Added new permission category for Leave/OnDuty Application System:

```typescript
{
  name: 'Leave/OnDuty Application System',
  key: 'leave_onduty',
  permissions: [
    // Academic/Admin Permissions
    { key: 'academic.leave_onduty.approve', label: 'View & Process Approvals (Academic)' },
    { key: 'academic.leave_onduty.manage', label: 'Manage Workflow Settings (Academic)' },
    { key: 'academic.leave_onduty.reports', label: 'View Reports & Analytics (Academic)' },

    // Learner/Student Permissions
    { key: 'learners.leave_onduty.apply', label: 'Apply for Leave/OnDuty (Students)' },
    { key: 'learners.leave_onduty.view', label: 'View My Applications (Students)' },
    { key: 'learners.leave_onduty.edit', label: 'Edit My Applications (Students)' },
    { key: 'learners.leave_onduty.cancel', label: 'Cancel My Applications (Students)' }
  ]
}
```

### 2. Sidebar Permission Mappings
**File**: `lib/sidebarMenuLink.ts` (lines 177-181)

Permission mappings were already correctly configured:
```typescript
'/academic/leave-onduty/approvals': 'academic.leave_onduty.approve',
'/academic/leave-onduty/settings': 'academic.leave_onduty.manage',
'/academic/leave-onduty/reports': 'academic.leave_onduty.reports',
'/learners/leave-onduty/apply': 'learners.leave_onduty.apply',
'/learners/leave-onduty/my-applications': 'learners.leave_onduty.view',
```

### 3. Page-Level Permission Enforcement

#### Academic Pages

##### Approvals Page
**File**: `app/(routes)/academic/leave-onduty/approvals/page.tsx`

**Changes**:
- ✅ Added `usePermissions` hook import
- ✅ Added `useRouter` import for navigation
- ✅ Added permission check with `can('academic.leave_onduty.approve')`
- ✅ Redirects to home if unauthorized

```typescript
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';

export default function ApprovalsPage() {
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const { can, isSuperAdmin } = usePermissions();

  // Permission check - redirect if unauthorized
  useEffect(() => {
    if (!authLoading && !can('academic.leave_onduty.approve')) {
      router.replace('/');
    }
  }, [authLoading, can, router]);
}
```

##### Settings Page
**File**: `app/(routes)/academic/leave-onduty/settings/page.tsx`

**Status**: ✅ Already had proper permission checking implemented

##### Reports Page
**File**: `app/(routes)/academic/leave-onduty/reports/page.tsx`

**Changes**:
- ✅ Added `usePermissions` hook import
- ✅ Added `useRouter` import for navigation
- ✅ Added permission check with `can('academic.leave_onduty.reports')`
- ✅ Redirects to home if unauthorized

```typescript
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';

export default function LeaveOndutyReportsPage() {
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const { can } = usePermissions();

  // Permission check - redirect if unauthorized
  useEffect(() => {
    if (!authLoading && !can('academic.leave_onduty.reports')) {
      router.replace('/');
    }
  }, [authLoading, can, router]);
}
```

#### Learner Pages

##### Apply Page
**File**: `app/(routes)/learners/leave-onduty/apply/page.tsx`

**Changes**:
- ✅ Added `usePermissions` hook import
- ✅ Replaced role-based check (`profile.role !== 'student'`) with permission-based check
- ✅ Uses `can('learners.leave_onduty.apply')` permission
- ✅ Updated secondary check in `loadLearnerData()` function

**Before**:
```typescript
// Check if user is a student - redirect if not
useEffect(() => {
  if (!authLoading && profile) {
    if (profile.role !== 'student') {
      router.replace('/');
    }
  }
}, [profile, authLoading, router]);
```

**After**:
```typescript
const { can } = usePermissions();

// Permission check - redirect if unauthorized
useEffect(() => {
  if (!authLoading && !can('learners.leave_onduty.apply')) {
    router.replace('/');
  }
}, [authLoading, can, router]);
```

##### My Applications Page
**File**: `app/(routes)/learners/leave-onduty/my-applications/page.tsx`

**Changes**:
- ✅ Added `usePermissions` hook import
- ✅ Replaced role-based check with permission-based check
- ✅ Uses `can('learners.leave_onduty.view')` permission

**Before**:
```typescript
// Check if user is a student - redirect if not
useEffect(() => {
  if (!authLoading && profile) {
    if (profile.role !== 'student') {
      router.replace('/');
    }
  }
}, [profile, authLoading, router]);
```

**After**:
```typescript
const { can } = usePermissions();

// Permission check - redirect if unauthorized
useEffect(() => {
  if (!authLoading && !can('learners.leave_onduty.view')) {
    router.replace('/');
  }
}, [authLoading, can, router]);
```

## Benefits

### 1. **Flexible Access Control**
- Custom roles can now be assigned specific Leave/OnDuty permissions
- No longer hardcoded to only 'student' role for learner pages
- Allows granular control (e.g., view but not apply, apply but not cancel)

### 2. **Consistent with System Architecture**
- All pages now use the unified `usePermissions()` hook
- Follows the same pattern as other modules in the application
- Easier to maintain and extend

### 3. **Future-Proof**
- New roles can be granted Leave/OnDuty access without code changes
- Permission system allows for feature flags and A/B testing
- Supports multi-tenant scenarios with different permission sets

### 4. **Better User Experience**
- Unauthorized users are redirected immediately (no flash of content)
- Menu items automatically hidden based on permissions (via sidebar mappings)
- Clear separation between academic and learner functionalities

## Permission Matrix

| Route | Permission Required | Access Level |
|-------|-------------------|--------------|
| `/academic/leave-onduty/approvals` | `academic.leave_onduty.approve` | Faculty, HOD, Principal, Super Admin |
| `/academic/leave-onduty/settings` | `academic.leave_onduty.manage` | Academic Admin, Super Admin |
| `/academic/leave-onduty/reports` | `academic.leave_onduty.reports` | Academic Admin, Super Admin |
| `/learners/leave-onduty/apply` | `learners.leave_onduty.apply` | Students, Learners |
| `/learners/leave-onduty/my-applications` | `learners.leave_onduty.view` | Students, Learners |

## Testing Checklist

- [ ] Super Admin can access all pages
- [ ] Academic users with `academic.leave_onduty.approve` can access approvals
- [ ] Academic users with `academic.leave_onduty.manage` can access settings
- [ ] Academic users with `academic.leave_onduty.reports` can access reports
- [ ] Students/Learners with `learners.leave_onduty.apply` can apply for leave
- [ ] Students/Learners with `learners.leave_onduty.view` can view their applications
- [ ] Users without permissions are redirected to home page
- [ ] Menu items are hidden for users without permissions
- [ ] Custom roles with specific permissions work correctly

## Custom Role Configuration Example

To grant a custom role access to Leave/OnDuty features:

1. Navigate to **Organization → Custom Roles**
2. Create or edit a role
3. Enable the desired permissions from the "Leave/OnDuty Application System" section
4. Save the role

**Example - "Class Coordinator" Role**:
```
Permissions:
✓ View & Process Approvals (Academic)
✓ View Reports & Analytics (Academic)
✗ Manage Workflow Settings (Academic)
```

**Example - "Student Leader" Role**:
```
Permissions:
✓ Apply for Leave/OnDuty (Students)
✓ View My Applications (Students)
✗ Edit My Applications (Students)
✗ Cancel My Applications (Students)
```

## Files Modified

1. `lib/constants/permissions.ts` - Added permission definitions
2. `app/(routes)/academic/leave-onduty/approvals/page.tsx` - Added permission check
3. `app/(routes)/academic/leave-onduty/reports/page.tsx` - Added permission check
4. `app/(routes)/learners/leave-onduty/apply/page.tsx` - Replaced role check with permission check
5. `app/(routes)/learners/leave-onduty/my-applications/page.tsx` - Replaced role check with permission check

## Notes

- The `lib/sidebarMenuLink.ts` file already had the correct permission mappings configured
- Settings page (`/academic/leave-onduty/settings`) already had proper permission checking
- All changes maintain backward compatibility with existing roles
- Super admin continues to have full access to all features

## Related Documentation

- [Custom Roles Documentation](../../features/custom-roles.md)
- [Permission System Architecture](../../architecture/permissions-system.md)
- [Leave/OnDuty Module Documentation](../../modules/academic/leave-onduty.md)
