# HOD Institution Data Visibility Fix

**Date**: 2026-01-29
**Type**: Bug Fix
**Severity**: High
**Status**: ✅ Fixed

## Problem

HOD users could access the Leave/OnDuty approval page but saw **empty data** even though their institution had applications. The page was not fetching and displaying institution-specific data.

## Root Cause

**Missing Institution-Based Query Function**

The approval page had two query modes:
1. **Super Admin**: `getAllApplicationsForSuperAdminByStatus` - Shows ALL applications across ALL institutions
2. **Regular Approver**: `getPendingApprovals` - Shows only applications where user is assigned as approver

The problem was:
- HOD users are **not super admins** (so mode #1 didn't apply)
- HOD users are **not always assigned as approvers** in the flow (so mode #2 returned empty)
- There was **NO function** to fetch applications filtered by institution/department

This meant HOD users saw empty data because the system was looking for applications where they were explicitly assigned as approvers, but there was no mechanism to fetch all applications from their institution.

## Impact

- **HOD users** couldn't see applications from their department/institution
- **Principal users** couldn't see applications from their institution
- **Any institutional role** (non-super admin) had the same issue
- Only **Super Admin** could see data (across all institutions)

## Solution

Created a new query function and hook for institution-based data access:

### 1. New Service Function

**File**: `lib/services/academic/leave-onduty-approval-service.ts`

```typescript
/**
 * Get applications by status filtered by institution and department
 * Used for HOD, Principal, and other institutional roles
 */
static async getApplicationsByStatusForInstitution(
  status: string = 'pending',
  institutionId: string,
  departmentId?: string
): Promise<any[]> {
  let query = supabase
    .from('leave_onduty_applications')
    .select(/* full query with joins */)
    .eq('institution_id', institutionId);

  // Filter by department if provided (for HOD)
  if (departmentId) {
    query = query.eq('department_id', departmentId);
  }

  // Filter by status if not 'all'
  if (status !== 'all') {
    query = query.eq('status', status);
  }

  return data || [];
}
```

### 2. New React Query Hook

**File**: `hooks/academic/use-leave-onduty.ts`

```typescript
/**
 * Get applications by status filtered by institution and department
 * Used for HOD, Principal, and other institutional roles
 */
export function useApplicationsByStatusForInstitution(
  status: string = 'pending',
  institutionId: string | null,
  departmentId?: string | null,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: [...KEYS.approvals.all, 'institution', institutionId, departmentId, status],
    queryFn: () => {
      if (!institutionId) {
        throw new Error('Institution ID is required');
      }
      return LeaveOndutyApprovalService.getApplicationsByStatusForInstitution(
        status,
        institutionId,
        departmentId || undefined
      );
    },
    enabled: enabled && !!institutionId,
    refetchInterval: 30000,
  });
}
```

### 3. Updated Approvals Page Logic

**File**: `app/(routes)/academic/leave-onduty/approvals/page.tsx`

**Before** (Buggy):
```typescript
// Only fetched where user was assigned as approver
const { data: pendingApprovals } = usePendingApprovals(
  profile?.id,
  !isSuperAdmin && statusFilter === 'pending'
);

// For non-pending tabs, returned empty array
const normalizedApprovals = useMemo(() => {
  if (isSuperAdmin) return superAdminApps;
  if (statusFilter === 'pending') {
    return pendingApprovals?.map(a => a.application);
  }
  return []; // ❌ Empty for approved/rejected/all tabs
}, [isSuperAdmin, superAdminApps, pendingApprovals, statusFilter]);
```

**After** (Fixed):
```typescript
// Fetch based on institution and department
const { data: institutionApps } = useApplicationsByStatusForInstitution(
  statusFilter,
  profile?.institution_id,
  profile?.department_id,
  !isSuperAdmin
);

// Returns data for all status filters
const normalizedApprovals = useMemo(() => {
  if (isSuperAdmin) return superAdminApps || [];
  return institutionApps || []; // ✅ Shows institution data for all tabs
}, [isSuperAdmin, superAdminApps, institutionApps]);
```

## Data Filtering Logic

The new function filters applications based on:

| Role | Institution Filter | Department Filter | Status Filter |
|------|-------------------|-------------------|---------------|
| Super Admin | ❌ None (all institutions) | ❌ None | ✅ Yes |
| Principal | ✅ User's institution | ❌ None | ✅ Yes |
| HOD | ✅ User's institution | ✅ User's department | ✅ Yes |
| Faculty | ✅ User's institution | ✅ User's department | ✅ Yes |

## Benefits

1. **HOD users** now see all applications from their department
2. **Principal users** can see all applications from their institution
3. **Status filtering works** for all tabs (Pending, Approved, Rejected, All)
4. **No dependency on approval flow** - shows all relevant applications
5. **Department-scoped access** for department heads
6. **Institution-scoped access** for principals

## Testing

### Test Data
- HOD user: `hod@jkkn.ac.in`
- Institution: "JKKN Testing Institution" (ID: `183847c5-be1b-4903-86eb-bbc20c213071`)
- Department: "Computer Science Engineering" (ID: `b86dc032-6fee-40a4-8783-f2d5b0611d89`)
- Test application: 1 approved application in the institution

### Expected Results
✅ HOD can see the approved application in the "Approved" tab
✅ HOD can see all department applications in the "All" tab
✅ HOD sees empty "Pending" tab (no pending applications currently)
✅ Data is filtered by HOD's department only

## Files Modified

1. ✅ `lib/services/academic/leave-onduty-approval-service.ts`
   - Added `getApplicationsByStatusForInstitution()` function

2. ✅ `hooks/academic/use-leave-onduty.ts`
   - Added `useApplicationsByStatusForInstitution()` hook

3. ✅ `app/(routes)/academic/leave-onduty/approvals/page.tsx`
   - Replaced `usePendingApprovals` with `useApplicationsByStatusForInstitution`
   - Updated data normalization logic
   - Simplified state management

## Related Issues Fixed

This fix resolves a series of issues:
1. ✅ **Permission format** - Fixed underscore vs dot mismatch
2. ✅ **Race condition** - Fixed permission loading timing
3. ✅ **Data visibility** - THIS FIX - Now shows institution data

All three issues needed to be resolved for HOD users to fully access Leave/OnDuty features.

## Future Enhancements

Potential improvements:
1. Add section-level filtering for class advisors
2. Add role-based statistics (department-level stats for HOD)
3. Create a unified permission + data access system
4. Add caching for frequently accessed institution data

## Conclusion

✅ **Issue Resolved**: HOD and other institutional roles can now see applications from their institution/department.

**Action Required**: Users should refresh the page (F5) to load the updated code.
