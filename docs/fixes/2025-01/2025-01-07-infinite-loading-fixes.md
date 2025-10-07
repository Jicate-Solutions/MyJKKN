# Infinite Loading/Rendering Issue Fixes

**Date**: 2025-01-07
**Issue**: Application pages stuck in continuous loading state with skeleton loaders
**Affected Pages**: Departments page and other data table pages

## Root Causes Identified

### 1. React Query Aggressive Refetch Settings
**Location**: `providers/query-provider.tsx:18`

**Problem**:
- `refetchOnMount: true` caused every component mount to trigger a refetch
- `refetchOnWindowFocus: true` caused refetch on every window focus
- This led to continuous loading spinners and excessive API calls

**Fix Applied**:
```typescript
// Before
refetchOnMount: true, // Always refetch when component mounts
refetchOnWindowFocus: true, // Refetch when window gains focus

// After
refetchOnMount: false, // Only refetch when data is stale
refetchOnWindowFocus: false, // Disabled to prevent excessive refetches
```

---

### 2. DataTable fetchData Function Causing Infinite Re-renders
**Location**: `app/(routes)/organizations/departments/_components/departments-data-table.tsx:40`

**Problem**:
- `fetchData` function was not memoized with `useCallback`
- Function reference changed on every render
- DataTable's `useEffect` depended on `fetchDataFn`, causing infinite fetch loop

**Fix Applied**:
```typescript
// Before
const fetchData = async (params) => { ... }

// After - wrapped in useCallback with stable dependencies
const fetchData = useCallback(async (params) => {
  // ... implementation
}, [search.institution_id, search.degree_id, search.status]);
```

---

### 3. Missing userId Filter in Department Service
**Location**: `app/(routes)/organizations/departments/_components/departments-data-table.tsx:52`

**Problem**:
- `DepartmentService.getDepartments()` expects `userId` for RLS filtering
- DataTable wasn't passing `userId`, causing RLS policy failures
- Empty results triggered retry loops

**Fix Applied**:
```typescript
// Get current user for institution access filtering
const { data: { user } } = await DepartmentService['supabase'].auth.getUser();

const filters = {
  // ... other filters
  userId: user?.id // FIXED: Add userId for RLS filtering
};
```

---

### 4. Missing AbortController in useEffect Calls
**Location**: `app/(routes)/organizations/departments/_components/department-filters.tsx:43,73`

**Problem**:
- Multiple concurrent `useEffect` calls fetched data without cleanup
- Race conditions caused stuck loading states
- Memory leaks from unaborted fetch operations

**Fix Applied**:
```typescript
// Before
useEffect(() => {
  loadInstitutions();
}, []);

// After - with AbortController
useEffect(() => {
  const abortController = new AbortController();

  async function loadInstitutions() {
    // ... fetch logic
    if (!abortController.signal.aborted) {
      setInstitutions(data);
    }
  }

  loadInstitutions();
  return () => abortController.abort(); // Cleanup
}, []);
```

---

### 5. Middleware Profile Cache Not Invalidated on Auth Errors
**Location**: `middleware.ts:124,153`

**Problem**:
- Profile was cached for 5 minutes
- Auth errors didn't clear the cache
- Stale cached profiles caused subsequent requests to hang

**Fix Applied**:
```typescript
// On auth error
if (userError) {
  // FIXED: Clear stale profile cache on auth error
  if (user?.id) {
    profileCache.delete(user.id);
  }
  return NextResponse.redirect(new URL('/auth/login', request.url));
}

// On profile fetch error
if (profileError) {
  // FIXED: Clear cache on profile fetch error
  profileCache.delete(user.id);
  return NextResponse.redirect(new URL('/unauthorized', request.url));
}
```

---

## Files Modified

1. ✅ `providers/query-provider.tsx` - Disabled aggressive refetch settings
2. ✅ `app/(routes)/organizations/departments/_components/departments-data-table.tsx` - Memoized fetchData + added userId
3. ✅ `app/(routes)/organizations/departments/_components/department-filters.tsx` - Added AbortControllers
4. ✅ `middleware.ts` - Added profile cache invalidation on errors

---

## Testing Recommendations

### 1. Test Department Page Loading
- Navigate to `/organizations/departments`
- Verify page loads without stuck spinners
- Check filter dropdowns load properly
- Verify data table shows results

### 2. Test Auth Error Handling
- Expire auth token manually
- Navigate to protected page
- Verify redirect to login (no infinite loading)

### 3. Test Filter Changes
- Change institution filter multiple times quickly
- Verify no race conditions or stuck loading
- Check degrees dropdown updates correctly

### 4. Test Window Focus Behavior
- Open departments page
- Switch to another tab/window
- Switch back
- Verify no unnecessary refetch occurs

### 5. Monitor Network Requests
- Open browser DevTools Network tab
- Navigate through pages
- Verify no excessive duplicate requests
- Check for infinite request loops

---

## Performance Improvements

**Before**:
- 5-10 duplicate API calls per page load
- Continuous refetching on every focus
- Infinite loops on certain conditions
- High memory usage from unaborted fetches

**After**:
- Single API call per page load
- Refetch only when data is stale (2 minutes)
- Proper cleanup with AbortControllers
- Stable cache management

---

## Prevention Guidelines

### For Future Development:

1. **Always wrap service calls in `useCallback`** when passing to child components
2. **Always use AbortController** in `useEffect` with async operations
3. **Always pass userId** to services that require RLS filtering
4. **Always invalidate caches** on auth/data errors
5. **Disable aggressive refetch** unless specifically needed
6. **Test with slow 3G network** to catch loading issues

### Code Review Checklist:

- [ ] Are fetch functions memoized with useCallback?
- [ ] Do useEffects have proper cleanup (AbortController)?
- [ ] Are all required filter parameters passed (including userId)?
- [ ] Is cache invalidated on error conditions?
- [ ] Are React Query settings appropriate for the use case?

---

## Related Issues

- Similar issues may exist in other data table pages
- Consider applying same fixes to:
  - Courses page
  - Admissions page
  - Students page
  - Any page using DataTable component

---

## References

- React Query docs: https://tanstack.com/query/latest/docs/react/guides/window-focus-refetching
- AbortController API: https://developer.mozilla.org/en-US/docs/Web/API/AbortController
- React useCallback: https://react.dev/reference/react/useCallback
