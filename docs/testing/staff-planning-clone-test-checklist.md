# Staff Planning Clone Feature - Test Checklist

**Date:** 2026-01-30
**Feature:** Staff Planning Clone
**Status:** Ready for Testing

## Test Categories

### Database Layer

- [ ] Unique constraint prevents duplicate plans
- [ ] Can insert plan for new academic year
- [ ] Cannot insert duplicate for same year
- [ ] Constraint includes all hierarchy fields (institution, program, semester, academic_year, department)

### Service Layer - Single Clone

- [ ] Clone creates new plan with correct academic_year_id
- [ ] All course assignments copied correctly
- [ ] Inactive staff excluded when excludeInactiveAssignments=true
- [ ] Inactive staff included when preserveInactive=true
- [ ] Dates adjusted when adjustDates=true
- [ ] Original dates kept when adjustDates=false
- [ ] Error when target plan already exists
- [ ] Error when source plan not found
- [ ] Exclusion counts returned correctly (inactive staff and courses)

### Service Layer - Bulk Clone

- [ ] Clones all plans for semester across multiple programs
- [ ] Handles partial failures gracefully
- [ ] Returns results array with success/failure for each plan
- [ ] Logs appropriate messages for errors
- [ ] Returns empty results when semester has no plans
- [ ] Aggregates exclusion counts across all programs

### UI - Clone Dialog (Single)

- [ ] Dialog opens from row actions menu ("Clone to New Year")
- [ ] Shows source plan details correctly
- [ ] Academic year dropdown populated
- [ ] Source year excluded from target dropdown
- [ ] Active year badge shown on current year
- [ ] Switch controls work correctly (adjust dates, preserve inactive)
- [ ] Form validation works (requires target academic year)
- [ ] Success toast shown on clone
- [ ] Info toast shown for excluded items
- [ ] Error toast shown on failure
- [ ] Dialog closes on success
- [ ] Redirects to new plan on success
- [ ] Form resets when dialog closes (via backdrop or ESC)
- [ ] No double submission possible

### UI - Bulk Clone Dialog

- [ ] Dialog opens from "Bulk Clone" button
- [ ] Semester dropdown populated
- [ ] Academic year dropdowns populated (source and target)
- [ ] Source and target cannot be same year
- [ ] Progress indicator shown during clone operation
- [ ] Progress updates as programs are cloned
- [ ] Results list shows all outcomes (success/failure per program)
- [ ] Success/failure icons display correctly (CheckCircle2/XCircle)
- [ ] Success and failure count toasts shown
- [ ] Page refreshes on success (query cache invalidated)
- [ ] Form and results reset when dialog closes
- [ ] No memory leaks during long operations

### UI - Smart Filtering

- [ ] Default shows current academic year (auto-detected)
- [ ] Academic year dropdown works
- [ ] "Current" badge shown on active year
- [ ] Filter updates table correctly
- [ ] URL params update on filter change
- [ ] URL params persist on page reload
- [ ] Empty state shown when no plans for year
- [ ] Filter cleanup on component unmount (no memory leaks)

### Integration - Timetable Module

- [ ] Timetable for 2024-25 loads 2024-25 staff plans
- [ ] Timetable for 2025-26 loads 2025-26 staff plans
- [ ] No cross-contamination between years
- [ ] Course dropdowns show correct data for selected year
- [ ] Staff dropdowns show correct data for selected year
- [ ] Timetable slot assignment works with cloned plans
- [ ] Hierarchy matching works without FK dependency
- [ ] `getConsolidatedStaffPlan()` uses academic_year_id parameter

### Edge Cases

- [ ] Clone when no staff assignments exist (empty plan)
- [ ] Clone with all inactive staff (all excluded)
- [ ] Clone with all inactive courses (all excluded)
- [ ] Clone with missing academic year dates (fallback behavior)
- [ ] Multiple concurrent clones (no race conditions)
- [ ] Clone very large staff plan (100+ assignments)
- [ ] Network error during clone (proper error handling)
- [ ] Database error during clone (rollback behavior)
- [ ] User closes dialog during operation (cleanup occurs)

### Performance

- [ ] Single clone completes in < 5 seconds
- [ ] Bulk clone of 10 plans completes in < 30 seconds
- [ ] UI remains responsive during clone operations
- [ ] No memory leaks in long-running sessions
- [ ] Query cache properly invalidated after operations
- [ ] Abort controllers cleanup on unmount

### Security & Permissions

- [ ] Only authorized users can clone (edit permission required)
- [ ] Institution isolation maintained (RLS enforced)
- [ ] RLS policies enforced on all queries
- [ ] No unauthorized data access possible
- [ ] Clone button disabled for users without edit permission

### Code Quality

- [ ] No React Hook exhaustive-deps warnings
- [ ] All useEffect cleanup functions present
- [ ] useCallback used for callback functions passed to effects
- [ ] No stale closure issues
- [ ] Forms reset properly on dialog close
- [ ] Loading states prevent double submission

## Manual Testing Steps

### Test 1: Single Plan Clone
1. Navigate to Academic > Staff Planning
2. Select a staff plan row
3. Click "..." menu, select "Clone to New Year"
4. Verify dialog shows correct source plan details
5. Select different target academic year
6. Configure options (adjust dates: ON, preserve inactive: OFF)
7. Click "Clone Staff Plan"
8. Verify success toast appears
9. Verify redirect to new plan detail page
10. Verify new plan has correct academic year

### Test 2: Bulk Clone
1. Navigate to Academic > Staff Planning
2. Click "Bulk Clone" button
3. Select a semester
4. Select source academic year (e.g., 2024-25)
5. Select target academic year (e.g., 2025-26)
6. Click "Clone All Plans"
7. Verify progress indicator shows
8. Verify results list shows success/failure for each program
9. Verify toast notifications show counts
10. Verify table refreshes with new plans

### Test 3: Smart Filtering
1. Navigate to Academic > Staff Planning
2. Verify default filter shows current academic year
3. Verify "Current" badge on dropdown
4. Change to different academic year
5. Verify table updates
6. Verify URL params update
7. Reload page
8. Verify filter persists from URL

### Test 4: Timetable Integration
1. Clone a staff plan to new academic year
2. Navigate to Timetables
3. Create new timetable for same program/semester/new year
4. Verify staff planning data loads correctly
5. Verify courses and staff appear in dropdowns
6. Create timetable slot with course + staff assignment
7. Verify assignment saves correctly

## Automated Testing Recommendations

The following test categories can be automated:

1. **Service Layer Tests** (Jest/Vitest)
   - Unit tests for `cloneStaffPlanToNewYear()`
   - Unit tests for `cloneSemesterToNewYear()`
   - Mock Supabase client for isolated testing

2. **Component Tests** (React Testing Library)
   - Dialog component behavior
   - Form validation
   - State management
   - Event handlers

3. **Integration Tests** (Playwright/Cypress)
   - Full user workflows
   - End-to-end clone operations
   - Timetable integration verification

## Test Results

### Execution Date: [To be filled during testing]

### Database Layer: [ ] Pass / [ ] Fail
### Service Layer: [ ] Pass / [ ] Fail
### UI Components: [ ] Pass / [ ] Fail
### Integration: [ ] Pass / [ ] Fail
### Edge Cases: [ ] Pass / [ ] Fail
### Performance: [ ] Pass / [ ] Fail
### Security: [ ] Pass / [ ] Fail

### Issues Found:
[Document any issues discovered during testing]

### Notes:
[Additional observations or recommendations]

## Sign-off

- [ ] All critical tests passed
- [ ] Known issues documented
- [ ] Performance acceptable
- [ ] Security verified
- [ ] Ready for deployment

**Tester:** _______________
**Date:** _______________
**Approval:** _______________
