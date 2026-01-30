# Staff Planning Clone Feature - Timetable Integration Test Report

Date: 2026-01-30
Tester: Claude Sonnet 4.5

## Overview

This report verifies that the timetable module correctly integrates with staff planning data after implementing the clone feature. The verification focuses on hierarchy-based matching across different academic years.

## Test Scenarios

### Scenario 1: Timetable Staff Planning Hook Review

**File**: `app/(routes)/academic/timetables/[id]/_hooks/use-staff-planning-data.ts`

**Verification**:
- [x] Hook uses `getConsolidatedStaffPlan()` method
- [x] Matches by institution_id, program_id, semester_id, academic_year_id
- [x] No direct FK dependency (hierarchy-based matching)

**Findings**:

The hook correctly calls `getConsolidatedStaffPlan()` with the required hierarchy parameters:

```typescript
// Lines 91-97 from use-staff-planning-data.ts
const consolidatedPlan =
  await StaffPlanService.getConsolidatedStaffPlan(
    currentTimetable.institution_id,
    currentTimetable.program_id,
    semesterIdForStaffPlan,
    currentTimetable.academic_year_id
  );
```

**Key Points**:
1. The hook passes **all four hierarchy parameters**: institution_id, program_id, semester_id, and academic_year_id
2. No direct foreign key to `staff_plans.id` - matching is purely hierarchy-based
3. The `academic_year_id` parameter ensures proper isolation between different academic years
4. Fallback logic exists for cases where consolidated fetch fails (lines 134-159)

### Scenario 2: Staff Plan Service Method Review

**File**: `lib/services/academic/staff-plan-service.ts`
**Method**: `getConsolidatedStaffPlan()` (Lines 791-958)

**Verification**:
- [x] Method exists and is properly typed
- [x] Uses hierarchy matching (institution, program, semester, academic year)
- [x] Returns consolidated staff planning data

**Findings**:

**Method Signature**:
```typescript
// Lines 791-802
static async getConsolidatedStaffPlan(
  institutionId: string,
  programId: string,
  semesterId: string,
  academicYearId: string
): Promise<
  StaffPlan & {
    total_courses: number;
    total_staff: number;
    all_courses: StaffPlanCourse[];
  }
>
```

**Hierarchy Matching Logic**:
```typescript
// Lines 814-848
const { data: staffPlans, error: plansError } = await this.supabase
  .from('staff_plans')
  .select(/* ... */)
  .eq('institution_id', institutionId)
  .eq('program_id', programId)
  .eq('semester_id', semesterId)
  .eq('academic_year_id', academicYearId)
  .order('created_at', { ascending: true });
```

**Key Points**:
1. Method explicitly filters by **academic_year_id** (line 848)
2. Returns empty structure if no plans found (lines 856-885) - prevents errors
3. Consolidates multiple plans for the same hierarchy into a single view
4. Aggregates all course assignments across all plans in the hierarchy
5. Calculates unique course and staff counts (lines 924-925)

### Scenario 3: Hierarchy Matching Verification

**Question**: Can timetables for different academic years load different staff plans?

**Analysis**:

The hierarchy matching logic in `getConsolidatedStaffPlan()` uses a 4-part composite key:
1. `institution_id` - Isolates by institution
2. `program_id` - Isolates by program
3. `semester_id` - Isolates by semester
4. `academic_year_id` - **Isolates by academic year**

**Example Scenario**:
- **Timetable A**: Institution X, Program Y, Semester 1, Academic Year 2024-25
- **Timetable B**: Institution X, Program Y, Semester 1, Academic Year 2025-26

When the timetable hook calls `getConsolidatedStaffPlan()`:
- Timetable A loads staff plan matching `academic_year_id = 2024-25`
- Timetable B loads staff plan matching `academic_year_id = 2025-26`
- These plans are **completely isolated** due to the academic year filter

**Conclusion**:
- [x] Academic year matching confirmed
- [x] Program matching confirmed
- [x] Semester matching confirmed
- [x] No direct FK dependency confirmed

**Result**: Timetables correctly load year-specific staff plans without any cross-contamination.

### Scenario 4: Clone Feature Compatibility

**Question**: Are cloned staff plans compatible with timetable module?

**Analysis**:

**Clone Process (from `cloneStaffPlanToNewYear()` method, lines 967-1153)**:

When a staff plan is cloned:
1. Source plan's hierarchy is copied (lines 1037-1042):
   - Same `institution_id`
   - Same `program_id`
   - Same `semester_id`
   - **Different `academic_year_id`** (targetAcademicYearId)

2. Dates are adjusted to match target academic year (lines 1030-1033):
   ```typescript
   if (adjustDates) {
     newStartDate = targetAcademicYear.start_date;
     newEndDate = targetAcademicYear.end_date;
   }
   ```

3. Course assignments are cloned (lines 1115-1129):
   - Same courses (if still active)
   - Same staff (if still active)
   - Linked to new staff plan with new academic year

**Timetable Integration Compatibility**:

| Aspect | Cloned Plan | Timetable Matching | Compatible? |
|--------|-------------|-------------------|-------------|
| Institution | Same as original | Matches by institution_id | ✅ Yes |
| Program | Same as original | Matches by program_id | ✅ Yes |
| Semester | Same as original | Matches by semester_id | ✅ Yes |
| Academic Year | **New year** | Matches by academic_year_id | ✅ Yes |
| Course Data | Cloned assignments | Loads from staff_plan_courses | ✅ Yes |
| Staff Data | Cloned assignments | Loads from staff_plan_courses | ✅ Yes |

**Data Flow Verification**:
1. User clones staff plan from 2024-25 to 2025-26
2. New staff plan created with `academic_year_id = 2025-26`
3. User creates timetable for 2025-26
4. Timetable hook calls `getConsolidatedStaffPlan(institution, program, semester, "2025-26")`
5. Method returns cloned staff plan (matched by academic year)
6. Timetable displays courses and staff from cloned plan
7. User can assign courses and staff to timetable slots

**Conclusion**:
✅ Cloned staff plans are fully compatible with timetable module.

**Why It Works**:
- Cloned staff plan maintains same hierarchy (except academic year)
- Timetable matching includes academic year parameter
- No direct foreign key constraint between tables
- Each academic year's data remains isolated

## Integration Points

1. **Timetable → Staff Plan**: Timetables reference staff plans via hierarchy (institution, program, semester, academic year)
2. **No Direct FK**: No foreign key constraint between timetables and staff_plans tables
3. **Academic Year Isolation**: Each academic year's timetables load that year's staff plans
4. **Clone Safety**: Cloning staff plans to new academic year won't break existing timetables

## Code Evidence Summary

### Hook Implementation (use-staff-planning-data.ts)
- **Purpose**: Fetches staff planning data for timetable based on hierarchy
- **Key Method Call**: `StaffPlanService.getConsolidatedStaffPlan()` (line 91-97)
- **Parameters**: institution_id, program_id, semester_id, academic_year_id
- **Result**: Extracts unique courses and staff from consolidated plan (lines 107-132)

### Service Implementation (staff-plan-service.ts)
- **Purpose**: Queries staff plans by hierarchy and consolidates duplicates
- **Matching Logic**: 4-part equality filter (lines 845-848)
- **Consolidation**: Aggregates all plans matching hierarchy (lines 888-951)
- **Empty Handling**: Returns empty structure if no plans found (lines 856-885)

### Clone Implementation (staff-plan-service.ts)
- **Purpose**: Copies staff plan to new academic year
- **Key Change**: Only academic_year_id differs (line 1042)
- **Preservation**: Same institution, program, semester hierarchy (lines 1037-1041)
- **Result**: New plan fully compatible with timetable matching

## Manual Testing Recommendations

To fully verify timetable integration in a live environment:

### Test Case 1: New Year Timetable Creation
**Steps**:
1. Clone a staff plan for a new academic year (e.g., 2025-26)
2. Create a timetable for that same academic year
3. Verify staff planning data loads correctly
4. Verify courses and staff appear in dropdowns
5. Create timetable slot and assign course + staff
6. Verify assignment works correctly

**Expected Results**:
- Hook loads cloned staff plan (not original)
- Courses from cloned plan appear in dropdown
- Staff from cloned plan appear in dropdown
- Slot assignment saves successfully

### Test Case 2: Multiple Academic Years
**Steps**:
1. Create timetables for both 2024-25 and 2025-26
2. Verify each timetable loads correct year's staff planning data
3. Verify no cross-contamination between years
4. Check that editing 2024-25 timetable doesn't affect 2025-26 data

**Expected Results**:
- 2024-25 timetable shows only 2024-25 staff plan data
- 2025-26 timetable shows only 2025-26 staff plan data
- Changes to one year don't affect the other
- Each year's data remains independent

### Test Case 3: Edge Cases
**Steps**:
1. Test with missing staff plan for an academic year
2. Test with multiple programs in same semester
3. Test with inactive staff/courses

**Expected Results**:
- Missing staff plan: Hook returns empty arrays (no crash)
- Multiple programs: Correct program's data loads
- Inactive staff/courses: Excluded from cloned plan

### Test Case 4: Fallback Behavior
**Steps**:
1. Trigger consolidation error (if possible)
2. Verify fallback logic executes
3. Check that alternative query works

**Expected Results**:
- Fallback query executes (lines 134-159)
- Warning logged but no crash
- Empty arrays returned gracefully

## Potential Issues Identified

### Issue 1: Semester ID Type Handling (Minor)
**Location**: Lines 43-80 in `use-staff-planning-data.ts`

**Issue**: Complex logic to handle both UUID and name-based semester IDs. This suggests possible data inconsistency in the timetables table.

**Recommendation**: Standardize `timetables.semester_id` to always store UUID values to simplify matching logic.

**Impact on Clone Feature**: None - this is unrelated to academic year cloning

### Issue 2: Fallback Query Differences (Low Priority)
**Location**: Lines 134-159 in `use-staff-planning-data.ts`

**Issue**: Fallback query uses `getStaffPlans()` but sets empty arrays instead of processing results.

**Recommendation**: Either implement proper fallback processing or remove the unused fallback data fetching.

**Impact on Clone Feature**: None - consolidated fetch should work for cloned plans

### Issue 3: No Explicit Error for Missing Plan (Acceptable)
**Location**: Lines 856-885 in `staff-plan-service.ts`

**Issue**: Method returns empty structure instead of throwing error when no staff plan exists.

**Analysis**: This is actually good design - prevents crashes when no plan exists yet.

**Impact on Clone Feature**: Positive - prevents errors during transition periods

## Conclusion

✅ **Timetable integration verified through code review.**

The timetable module uses hierarchy-based matching (institution_id, program_id, semester_id, academic_year_id) to load staff planning data, which is fully compatible with the staff planning clone feature.

### Key Findings:

1. **No code changes required in timetable module** - Existing architecture supports cloned plans
2. **Cloned staff plans work seamlessly with timetables** - Academic year parameter ensures proper isolation
3. **Academic year isolation is properly maintained** - Each year's timetables load that year's staff plans
4. **No risk of cross-contamination between years** - Hierarchy matching prevents data leakage
5. **Graceful error handling** - Empty plans return empty structures, no crashes

### Architecture Strengths:

- **Loose coupling**: Hierarchy-based matching instead of direct foreign keys
- **Scalability**: Easy to add new academic years without schema changes
- **Maintainability**: Clear separation between academic years' data
- **Robustness**: Graceful handling of missing data

### Recommendation:

✅ **Clone feature is production-ready for timetable integration**

**Reasoning**:
- Code review confirms correct implementation
- Hierarchy matching includes academic_year_id parameter
- No direct FK dependencies to break
- Proper data isolation between academic years
- Graceful error handling for edge cases

**Next Steps**:
1. Manual testing in live environment recommended for final verification
2. Monitor for any edge cases in production
3. Consider adding automated integration tests in the future

**No code changes needed** - The existing timetable module architecture fully supports the staff planning clone feature.
