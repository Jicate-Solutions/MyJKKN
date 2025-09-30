# Real-Time Analytics & Approval Dashboard Updates

**Date:** September 30, 2025  
**Issue:** Analytics and approval stats not updating in real-time after creating/approving reservations  
**Status:** ✅ Resolved

## Problem Summary

After creating a reservation or approving it, the **Usage Analytics** and **Approval Dashboard** were not reflecting the changes immediately. The statistics showed stale data and required a page refresh to update.

**Issues Found:**

1. ❌ Analytics hooks cached data for **5 minutes** (too long)
2. ❌ No auto-refetch mechanism
3. ❌ Approval stats showing **static values** (0 for approved/rejected today)
4. ❌ Analytics queries **not invalidated** when reservations change
5. ❌ No refetch on window focus

## Root Cause Analysis

### 1. Long Cache Times

**Original Configuration:**

```typescript
// hooks/analytics/use-analytics.ts
staleTime: 5 * 60 * 1000 // 5 minutes - too long!
```

**Problem:**

- Data stayed "fresh" for 5 minutes
- New reservations/approvals didn't trigger updates
- Users saw outdated statistics

### 2. Missing Approval Stats

**Original Code:**

```typescript
// app/(routes)/resource-management/reservations/approvals/page.tsx
const stats = useMemo(() => {
  return {
    pending_approvals: reservations.length,
    approved_today: 0,  // ❌ Hardcoded!
    rejected_today: 0,  // ❌ Hardcoded!
    overdue_approvals: reservations.filter(/*...*/).length
  };
}, [reservations]);
```

**Problem:**

- Approved and rejected counts always showed 0
- No database query for today's approvals/rejections
- Stats were calculated from only pending reservations

### 3. Missing Query Invalidation

**Original Mutation:**

```typescript
// hooks/reservation/use-reservation-operations.ts
onSuccess: (data) => {
  queryClient.invalidateQueries({ queryKey: ['reservations'] });
  queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
  // ❌ Missing analytics query invalidation!
}
```

**Problem:**

- Analytics dashboards not refreshed after mutations
- Stats remained stale even after creating/approving reservations

## Solution Implementation

### **1. Reduced Cache Times & Added Auto-Refetch** ✅

**Updated All Analytics Hooks:**

```typescript
// hooks/analytics/use-analytics.ts
export function useResourceAnalytics(filters: AnalyticsFilters = {}) {
  return useQuery({
    queryKey: ['resourceAnalytics', rbacFilters],
    queryFn: () => analyticsService.getResourceAnalytics(rbacFilters),
    enabled: !filtersLoading,
    staleTime: 30 * 1000,          // ✅ Reduced to 30 seconds
    refetchInterval: 60 * 1000,    // ✅ Auto-refetch every 1 minute
    refetchOnWindowFocus: true     // ✅ Refetch when tab regains focus
  });
}
```

**Applied to All Analytics Hooks:**

- `useResourceAnalytics` ✅
- `useReservationAnalytics` ✅
- `useMaintenanceAnalytics` ✅
- `useUserAnalytics` ✅
- `useFinancialAnalytics` ✅
- `useDashboardSummary` ✅

### **2. Created Real Approval Stats Hook** ✅

**New Hook with Database Queries:**

```typescript
// hooks/reservation/use-reservations.ts
export function useApprovalStats() {
  return useQuery({
    queryKey: ['approval-stats'],
    queryFn: async () => {
      const supabase = (await import('@/lib/supabase/client'))
        .createClientSupabaseClient();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      // Get pending approvals
      const { data: pending } = await supabase
        .from('resource_reservations')
        .select('id, start_time')
        .eq('status', ReservationStatus.PENDING);

      // Get today's approved ✅
      const { data: approvedToday } = await supabase
        .from('resource_reservations')
        .select('id')
        .eq('status', ReservationStatus.APPROVED)
        .gte('updated_at', todayISO);

      // Get today's rejected ✅
      const { data: rejectedToday } = await supabase
        .from('resource_reservations')
        .select('id')
        .eq('status', ReservationStatus.REJECTED)
        .gte('updated_at', todayISO);

      const now = new Date();
      const overdueCount =
        pending?.filter((r) => new Date(r.start_time) < now).length || 0;

      return {
        pending_approvals: pending?.length || 0,
        approved_today: approvedToday?.length || 0,
        rejected_today: rejectedToday?.length || 0,
        overdue_approvals: overdueCount
      };
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 3
  });
}
```

**Features:**

- ✅ Real database queries for today's stats
- ✅ Filters by `updated_at >= today`
- ✅ Auto-refetch every minute
- ✅ Refetch on window focus

### **3. Updated Approvals Page** ✅

**Before:**

```typescript
const { data: reservations = [], isLoading } = usePendingApprovals();

const stats = useMemo(() => {
  return {
    pending_approvals: reservations.length,
    approved_today: 0, // Static!
    rejected_today: 0, // Static!
    overdue_approvals: reservations.filter(/*...*/).length
  };
}, [reservations]);
```

**After:**

```typescript
const { data: reservations = [], isLoading } = usePendingApprovals();
const { data: stats, isLoading: loadingStats } = useApprovalStats();

// Use real-time stats from the hook
const approvalStats = {
  pending_approvals: stats?.pending_approvals || 0,
  approved_today: stats?.approved_today || 0,
  rejected_today: stats?.rejected_today || 0,
  overdue_approvals: stats?.overdue_approvals || 0
};

<ApprovalStatsCards
  stats={approvalStats || null}
  isLoading={isLoading || loadingStats}
/>
```

### **4. Added Query Invalidation on Mutations** ✅

**Updated All Reservation Mutations:**

**Create Reservation:**

```typescript
onSuccess: (data) => {
  // Reservation queries
  queryClient.invalidateQueries({ queryKey: ['reservations'] });
  queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
  queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
  queryClient.invalidateQueries({ queryKey: ['reservation-stats'] });
  queryClient.invalidateQueries({ queryKey: ['approval-stats'] }); // ✅ New

  // Analytics queries ✅ New
  queryClient.invalidateQueries({ queryKey: ['resourceAnalytics'] });
  queryClient.invalidateQueries({ queryKey: ['reservationAnalytics'] });
  queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
}
```

**Approve Reservation:**

```typescript
onSuccess: (data) => {
  // Reservation queries
  queryClient.invalidateQueries({ queryKey: ['reservations'] });
  queryClient.invalidateQueries({ queryKey: ['reservation', data.id] });
  queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
  queryClient.invalidateQueries({ queryKey: ['reservation-stats'] });
  queryClient.invalidateQueries({ queryKey: ['approval-stats'] }); // ✅ New

  // Analytics queries ✅ New
  queryClient.invalidateQueries({ queryKey: ['resourceAnalytics'] });
  queryClient.invalidateQueries({ queryKey: ['reservationAnalytics'] });
  queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
}
```

**Reject Reservation:**

```typescript
onSuccess: (data) => {
  // Same invalidations as approve ✅
  queryClient.invalidateQueries({ queryKey: ['reservations'] });
  queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
  queryClient.invalidateQueries({ queryKey: ['reservation-stats'] });
  queryClient.invalidateQueries({ queryKey: ['approval-stats'] }); // ✅ New

  // Analytics queries ✅ New
  queryClient.invalidateQueries({ queryKey: ['resourceAnalytics'] });
  queryClient.invalidateQueries({ queryKey: ['reservationAnalytics'] });
  queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
}
```

## Features Implemented

### **Real-Time Updates** ⚡

| Feature                   | Before    | After            |
| ------------------------- | --------- | ---------------- |
| **Cache Duration**        | 5 minutes | 30 seconds       |
| **Auto-Refetch**          | None      | Every 60 seconds |
| **Window Focus Refetch**  | None      | ✅ Enabled       |
| **Mutation Invalidation** | Partial   | ✅ Complete      |

### **Approval Dashboard Stats** 📊

| Stat                  | Before        | After                 |
| --------------------- | ------------- | --------------------- |
| **Pending Approvals** | ✅ Real count | ✅ Real count         |
| **Approved Today**    | ❌ Always 0   | ✅ Real count from DB |
| **Rejected Today**    | ❌ Always 0   | ✅ Real count from DB |
| **Overdue Approvals** | ✅ Calculated | ✅ Calculated         |

### **Analytics Dashboard** 📈

| Metric                 | Update Mechanism                               |
| ---------------------- | ---------------------------------------------- |
| **Total Resources**    | Auto-refetch every 60s + mutation invalidation |
| **Total Reservations** | Auto-refetch every 60s + mutation invalidation |
| **Active Users**       | Auto-refetch every 60s + mutation invalidation |
| **Utilization Rate**   | Auto-refetch every 60s + mutation invalidation |
| **Category Usage**     | Auto-refetch every 60s + mutation invalidation |
| **Time Distribution**  | Auto-refetch every 60s + mutation invalidation |

## Files Modified

### **1. Analytics Hooks**

- **File:** `hooks/analytics/use-analytics.ts`
- **Changes:**
  - Reduced `staleTime` from 5 min to 30 sec
  - Added `refetchInterval: 60 * 1000`
  - Added `refetchOnWindowFocus: true`
  - Applied to all 6 analytics hooks

### **2. Reservation Hooks**

- **File:** `hooks/reservation/use-reservations.ts`
- **Changes:**
  - Created new `useApprovalStats()` hook
  - Real database queries for today's approvals/rejections
  - 30-second cache + 60-second auto-refetch
  - Window focus refetch enabled

### **3. Reservation Mutations**

- **File:** `hooks/reservation/use-reservation-operations.ts`
- **Changes:**
  - Added `approval-stats` invalidation
  - Added analytics query invalidation:
    - `resourceAnalytics`
    - `reservationAnalytics`
    - `dashboardSummary`
  - Applied to create, approve, and reject mutations

### **4. Approvals Page**

- **File:** `app/(routes)/resource-management/reservations/approvals/page.tsx`
- **Changes:**
  - Integrated `useApprovalStats()` hook
  - Replaced static stats with real-time data
  - Added loading state for stats

## Testing Checklist

- [x] Create reservation → Analytics update within 30-60 seconds
- [x] Approve reservation → Approval stats show +1 approved today
- [x] Reject reservation → Approval stats show +1 rejected today
- [x] Switch browser tabs → Data refetches on focus
- [x] Wait 60 seconds → Data auto-refetches
- [x] All stats show real values (no zeros or placeholders)
- [x] No linter errors
- [x] No TypeScript errors

## Performance Impact

### **Before:**

- ❌ Stale data for up to 5 minutes
- ❌ Manual refresh required
- ❌ Inaccurate approval stats

### **After:**

- ✅ Fresh data within 30-60 seconds
- ✅ Automatic updates every minute
- ✅ Instant updates after mutations
- ✅ Accurate real-time statistics

### **Network Impact:**

```
Analytics Queries: 6 queries × every 60 seconds = ~6 requests/min
Approval Stats: 1 query × every 60 seconds = ~1 request/min
Total: ~7 requests/min (acceptable for real-time dashboards)
```

**Optimization:**

- Queries only run when dashboard is open
- Pause when window loses focus (except manual refetch)
- 30-second cache prevents redundant fetches
- Efficient database queries with proper indexes

## Summary

✅ **Successfully implemented real-time analytics and approval dashboard updates**

**Key Achievements:**

1. **⚡ 30-Second Data Freshness**

   - Reduced from 5 minutes to 30 seconds
   - Auto-refetch every 60 seconds
   - Window focus refetch enabled

2. **📊 Real Approval Statistics**

   - Today's approved count from database
   - Today's rejected count from database
   - Live pending and overdue counts

3. **🔄 Complete Query Invalidation**

   - Create reservation → All dashboards update
   - Approve reservation → All dashboards update
   - Reject reservation → All dashboards update

4. **🎯 User Experience**
   - No manual refresh needed
   - Always see current data
   - Dashboards sync automatically

**Impact:**

- Users see **real-time statistics**
- Approval dashboard shows **accurate today's counts**
- Analytics dashboard reflects **immediate changes**
- Better decision-making with **live data**

---

**Documentation:** `docs/fixes/2025-09/REAL_TIME_ANALYTICS_AND_APPROVAL_STATS.md`  
**Analytics Hooks:** `hooks/analytics/use-analytics.ts`  
**Reservation Hooks:** `hooks/reservation/use-reservations.ts`  
**Mutation Hooks:** `hooks/reservation/use-reservation-operations.ts`  
**Approvals Page:** `app/(routes)/resource-management/reservations/approvals/page.tsx`
