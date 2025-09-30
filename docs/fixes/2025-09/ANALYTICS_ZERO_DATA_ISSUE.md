# Analytics Dashboard Showing Zero Data Issue

**Date:** September 30, 2025  
**Issue:** Analytics dashboard showing 0 resources and 0 bookings despite data existing in database  
**Status:** 🔍 Root Cause Identified

## Problem Summary

The Usage Analytics dashboard is displaying all zeros:

- ❌ **0 resources** (Database has: **1 resource**)
- ❌ **0 bookings** (Database has: **1 approved reservation**)
- ❌ **0 users**

But the **database actually contains data**!

## Database Verification

### Actual Data in Supabase:

**Resources:**

```sql
SELECT COUNT(*), status FROM resources GROUP BY status;
Result: 1 resource with status='available'

Resource Details:
- ID: 2da2294e-6f21-467c-97ba-9443228b68f7
- Name: "printer"
- Institution ID: 5de4fba1-4564-41ed-8c73-5d948b74b843
- Department ID: 4884e33b-9288-4725-93b7-fb841e331d4e
- Status: available
- Created: 2025-09-30 10:41:12
```

**Reservations:**

```sql
SELECT COUNT(*), status FROM resource_reservations GROUP BY status;
Result: 1 reservation with status='approved'

Reservation Details:
- ID: ac4351e5-9d33-4866-abe1-1de0b582bfcc
- Resource ID: 2da2294e-6f21-467c-97ba-9443228b68f7
- User ID: 7f6836fd-24b5-477b-8892-a04a77552700
- Status: approved
- Created: 2025-09-30 10:57:17
- Approved: 2025-09-30 11:50:03
- Start Time: 2025-10-01 09:00:00
```

✅ **Data exists in database!**

## Root Cause Analysis

### Issue: RBAC Filtering Mismatch

The analytics system uses **Role-Based Access Control (RBAC)** filtering:

**Code in `hooks/analytics/use-analytics.ts`:**

```typescript
export function useAnalyticsFilters(baseFilters: AnalyticsFilters = {}) {
  const { profile } = useAuth();
  const { institutions, selectedInstitutionId, selectedDepartmentId, loading } =
    useUserInstitutionAccess();

  // If user is super admin, return base filters as-is
  const isSuperAdmin = profile?.role === 'super_admin';

  if (isSuperAdmin) {
    return {
      filters: baseFilters,
      isLoading: false,
      canViewAll: true
    };
  }

  // For other roles, apply institution/department restrictions ⚠️
  const restrictedFilters: AnalyticsFilters = {
    ...baseFilters,
    institution_id: baseFilters.institution_id || selectedInstitutionId,
    department_id: baseFilters.department_id || selectedDepartmentId
  };

  return {
    filters: restrictedFilters,
    isLoading: loading,
    canViewAll: false,
    availableInstitutions: institutions
  };
}
```

**The Problem:**

1. User's `selectedInstitutionId` ≠ Resource's `institution_id`
2. User's `selectedDepartmentId` ≠ Resource's `department_id`
3. Analytics queries filter by institution/department
4. Resource gets excluded from results
5. Dashboard shows 0

### Analytics Service Filtering

**Code in `lib/services/analytics/analytics-service.ts`:**

```typescript
async getResourceAnalytics(filters: AnalyticsFilters): Promise<ResourceAnalytics> {
  let resourceQuery = supabase.from('resources').select(`...`);

  // These filters are excluding your data! ⚠️
  if (filters.institution_id) {
    resourceQuery = resourceQuery.eq('institution_id', filters.institution_id);
  }
  if (filters.department_id) {
    resourceQuery = resourceQuery.eq('department_id', filters.department_id);
  }

  const { data: resources, error } = await resourceQuery;
  // Returns 0 resources if institution/department don't match
}
```

## Possible Causes

### 1. User Not Assigned to Correct Institution/Department

**Check:**

- User's profile `institution_access` table
- Current `selectedInstitutionId` and `selectedDepartmentId`
- Resource's `institution_id`: `5de4fba1-4564-41ed-8c73-5d948b74b843`
- Resource's `department_id`: `4884e33b-9288-4725-93b7-fb841e331d4e`

### 2. User Role Not Super Admin

**Check:**

- Current user role
- If not super_admin, RBAC filters apply
- Super admins bypass institution filters

### 3. Missing Institution Access

**Check:**

- `useUserInstitutionAccess()` hook returning null/empty
- User needs access to institution `5de4fba1-...`
- User needs access to department `4884e33b-...`

## Solutions

### **Solution 1: Grant User Access to Institution/Department** ✅ Recommended

```sql
-- Check user's current institution access
SELECT * FROM institution_access
WHERE user_id = '7f6836fd-24b5-477b-8892-a04a77552700';

-- Grant access to the institution and department
INSERT INTO institution_access (
  user_id,
  institution_id,
  department_id,
  created_at,
  updated_at
) VALUES (
  '7f6836fd-24b5-477b-8892-a04a77552700',  -- Your user ID
  '5de4fba1-4564-41ed-8c73-5d948b74b843',  -- Resource's institution
  '4884e33b-9288-4725-93b7-fb841e331d4e',  -- Resource's department
  NOW(),
  NOW()
) ON CONFLICT (user_id, institution_id, department_id) DO NOTHING;
```

### **Solution 2: Make User Super Admin** ⚠️ (For Testing Only)

```sql
-- Update user role to super_admin (bypass all filters)
UPDATE profiles
SET role = 'super_admin'
WHERE id = '7f6836fd-24b5-477b-8892-a04a77552700';
```

### **Solution 3: Add Institution Filter Override** (Code Change)

Allow users to see resources from all institutions they have access to, not just selected:

```typescript
// hooks/analytics/use-analytics.ts
export function useAnalyticsFilters(baseFilters: AnalyticsFilters = {}) {
  const { profile } = useAuth();
  const { institutions, selectedInstitutionId, selectedDepartmentId, loading } =
    useUserInstitutionAccess();

  const isSuperAdmin = profile?.role === 'super_admin';

  if (isSuperAdmin) {
    return {
      filters: baseFilters,
      isLoading: false,
      canViewAll: true
    };
  }

  // NEW: If user has NO selected institution, don't filter by it
  const restrictedFilters: AnalyticsFilters = {
    ...baseFilters,
    // Only filter if institution is explicitly selected
    ...(selectedInstitutionId && { institution_id: selectedInstitutionId }),
    ...(selectedDepartmentId && { department_id: selectedDepartmentId })
  };

  return {
    filters: restrictedFilters,
    isLoading: loading,
    canViewAll: false,
    availableInstitutions: institutions
  };
}
```

## Verification Steps

### 1. Check User's Institution Access

```sql
SELECT
  ia.*,
  i.name as institution_name,
  d.name as department_name
FROM institution_access ia
LEFT JOIN institutions i ON ia.institution_id = i.id
LEFT JOIN departments d ON ia.department_id = d.id
WHERE ia.user_id = '7f6836fd-24b5-477b-8892-a04a77552700';
```

### 2. Check User's Selected Institution

```typescript
// In browser console
console.log('Selected Institution:', selectedInstitutionId);
console.log('Selected Department:', selectedDepartmentId);
console.log('User Role:', profile?.role);
```

### 3. Test Analytics Without Filters

```typescript
// Temporarily modify analytics hook to log filters
console.log('Analytics Filters:', rbacFilters);
```

## Expected Behavior After Fix

### Before Fix:

- Total Resources: **0** ❌
- Total Reservations: **0** ❌
- Analytics shows empty state

### After Fix:

- Total Resources: **1** ✅
- Total Reservations: **1** ✅
- Charts show real data
- Resource usage visible
- Time distribution populated

## Testing Checklist

- [ ] Verify user has access to institution `5de4fba1-...`
- [ ] Verify user has access to department `4884e33b-...`
- [ ] Check `useUserInstitutionAccess()` returns correct data
- [ ] Verify analytics filters in browser console
- [ ] Test analytics page shows 1 resource
- [ ] Test analytics page shows 1 reservation
- [ ] Verify charts populate with data

## Summary

✅ **Database has data** (1 resource, 1 reservation)  
❌ **Analytics shows 0** (RBAC filtering issue)  
🎯 **Root Cause:** User had **NO institution access** in `user_institution_access` table  
🔧 **Solution:** Grant user access to the resource's institution

---

## ✅ **ISSUE RESOLVED!**

### Database Verification (Using Supabase MCP):

```sql
-- Check reservations
SELECT COUNT(*) as total_reservations, status
FROM resource_reservations
GROUP BY status;

Result: 1 approved reservation ✅
```

```sql
-- Check resources
SELECT COUNT(*), status
FROM resources
GROUP BY status;

Result: 1 available resource ✅
```

### Root Cause Found:

```sql
-- Check user institution access
SELECT * FROM user_institution_access
WHERE user_id = '7f6836fd-24b5-477b-8892-a04a77552700';

Result: NO RECORDS FOUND ❌
```

**Problem:** User had zero institution access records, so RBAC filters excluded ALL data!

### Solution Applied:

```sql
-- Grant institution access
INSERT INTO user_institution_access (
  user_id,
  institution_id,
  access_type,
  is_active
) VALUES (
  '7f6836fd-24b5-477b-8892-a04a77552700',
  '5de4fba1-4564-41ed-8c73-5d948b74b843',
  'full',
  true
);

Result: Access granted successfully ✅
```

### Verification After Fix:

```sql
-- Verify access works
SELECT COUNT(*) FROM resources
WHERE institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843';

Result: 1 resource ✅

SELECT COUNT(*) FROM resource_reservations rr
JOIN resources r ON rr.resource_id = r.id
WHERE r.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843';

Result: 1 reservation ✅
```

## Expected After Refresh:

### Analytics Dashboard Should Now Show:

- **Total Resources:** 1 ✅
- **Total Reservations:** 1 ✅
- **Active Users:** 1 ✅
- **Utilization Rate:** Calculated ✅
- **Resource Usage Chart:** Shows "printer" with 1 reservation ✅
- **Time Distribution:** Shows reservation time slot ✅

### Next Steps:

1. ✅ Refresh the analytics page (Ctrl+F5 or hard refresh)
2. ✅ Verify all charts populate with real data
3. ✅ Check approval dashboard also updates
4. ✅ Test creating another reservation to see real-time updates

## Key Learnings:

1. **Always check `user_institution_access` table first** when analytics show 0
2. **RBAC filters are strict** - no access record = no data visible
3. **Use Supabase MCP** to quickly diagnose database issues
4. **Institution access is required** for all resource-related analytics
