# Fix: No Students Found in Attendance Mark Page

**Date:** 2026-01-29
**Module:** Academic Attendance
**Severity:** High
**Status:** Investigation Complete - Fix Needed

## Problem Description

When faculty clicks "Mark Attendance" for a period, the attendance mark page shows "0 Total Students" even though students exist in the database for that section.

### Affected URL
```
/academic/attendance/mark?periodid=10f7cd02-7ab3-42a9-bf97-2693d4a878f8&timetableid=21de1869-c9a6-4e61-afc7-b28bda2d3ebf&date=2026-01-29
```

**Notice:** The URL is missing the `sectionId` parameter.

## Investigation Results

### Database Verification ✅
Confirmed via SQL queries:
- **Timetable exists:** ID `21de1869-c9a6-4e61-afc7-b28bda2d3ebf`
  - `timetable_type`: `'section'`
  - `section_id`: `'f52e55a5-ef33-477b-9989-2ae679e9fe2c'`
  - `is_active`: `true`
- **Section exists:** ID `f52e55a5-ef33-477b-9989-2ae679e9fe2c`
  - Section A, CSE, Semester 1, Undergraduate
- **Students exist:** 5 active students in this section:
  1. BOOBALAN A (Roll: 147852)
  2. BOOBALAN A (Roll: 87596328)
  3. RANJITH K (Roll: 968574)
  4. KUMARAN AAS (Roll: 24MBA60)
  5. TEST S (Roll: 123654789)

### Root Cause Analysis

#### Issue 1: Missing `sectionId` in URL Parameter
**File:** `app/(routes)/academic/attendance/page.tsx:157-178`

When user clicks "Mark Attendance", the code path:
1. Checks if period is multi-section (lines 159-161):
   ```typescript
   const isMultiSection =
     (period.sections && period.sections.length > 1) ||
     (period.section_ids && period.section_ids.length > 1);
   ```

2. If detected as multi-section, navigates WITHOUT sectionId (lines 163-167):
   ```typescript
   if (isMultiSection) {
     navigateToMarkAttendance(period, undefined); // <-- sectionId is undefined
     return;
   }
   ```

**Problem:** Period is being incorrectly detected as multi-section, or the period object doesn't have section information populated.

#### Issue 2: Fallback Logic Not Working
**File:** `app/(routes)/academic/attendance/mark/page.tsx:278-304`

The fallback to use `timetable.section_id` exists but may not be working:
```typescript
if (
  !sectionData &&
  timetable.section_id &&
  timetable.timetable_type === 'section'
) {
  resolvedSectionId = timetable.section_id;
  sectionData = sectionFromDb;
}
```

**Possible causes:**
- `sectionData` is already set (but incorrectly)
- `timetable.section_id` is null (but DB shows it exists)
- `timetable.timetable_type` is not `'section'` (but DB shows it is)

#### Issue 3: Query Execution
**File:** `lib/services/academic/attendance-service.ts:1576-1698`

The `getStudentsForAttendance()` function builds the query with:
```typescript
let query = this.supabase
  .from('learners_profiles')
  .select('...')
  .eq('lifecycle_status', 'active')
  .eq('institution_id', filters.institution_id);

// ... optional filters ...

if (filters.section_id) {
  query = query.eq('section_id', filters.section_id);
}
```

**Issue:** If `contextData.section_id` is `null` or `undefined`, the section filter is never applied, and the query returns students from ALL sections in that institution/program/department.

But the page shows **0 students**, which suggests the query is returning an empty result set. This could be due to:
1. RLS policy blocking the query
2. Wrong `institution_id` being passed
3. Some other filter eliminating all results

### RLS Policy Check ✅
The `learners_profiles_select_policy` requires:
```sql
is_super_admin() OR user_has_institution_access(auth.uid(), institution_id)
```

Faculty member should have institution access if their profile's `institution_id` matches the section's `institution_id`.

## Fix Strategy

### Option 1: Ensure `sectionId` is Always Passed in URL (Recommended)
**Location:** `app/(routes)/academic/attendance/page.tsx`

Modify `handlePeriodSelection` to always resolve section ID before navigation:

```typescript
const handlePeriodSelection = async (period: AttendancePeriodOption) => {
  // Always try to get a section ID
  let sectionId = getSingleSectionId(period);

  // If period doesn't have section info, fetch from timetable
  if (!sectionId && period.timetable_id) {
    const timetable = await getTimetableData(period.timetable_id);
    if (timetable?.section_id) {
      sectionId = timetable.section_id;
    }
  }

  // For multi-section, still pass first section or require selection
  const isMultiSection =
    (period.sections && period.sections.length > 1) ||
    (period.section_ids && period.section_ids.length > 1);

  if (isMultiSection && !sectionId) {
    // Show section selection modal
    setSelectedPeriodForModal(period);
    setShowSectionModal(true);
    return;
  }

  navigateToMarkAttendance(period, sectionId);
};
```

### Option 2: Improve Fallback Logic
**Location:** `app/(routes)/academic/attendance/mark/page.tsx`

Make the fallback more robust:

```typescript
// After loading timetable, ALWAYS ensure resolvedSectionId is set
if (!resolvedSectionId && timetable.section_id) {
  resolvedSectionId = timetable.section_id;

  // Fetch section data
  const { data: sectionFromDb } = await supabase
    .from('sections')
    .select('id, section_name, degree_id, program_id, department_id, semester_id')
    .eq('id', timetable.section_id)
    .single();

  if (sectionFromDb) {
    sectionData = sectionFromDb;
  }
}

// Add validation before setting context
if (!resolvedSectionId && timetable.timetable_type === 'section') {
  logger.error('academic/attendance/mark', 'Section-level timetable missing section_id', {
    timetableId,
    timetable
  });
  toast.error('Unable to load section information. Please contact support.');
  return;
}
```

### Option 3: Add Debug Logging
**Location:** `lib/services/academic/attendance-service.ts`

Add comprehensive logging to understand what's happening:

```typescript
static async getStudentsForAttendance(filters: {...}) {
  logger.info('academic/attendance', 'getStudentsForAttendance called', { filters });

  // ... build query ...

  logger.info('academic/attendance', 'Query filters applied', {
    hasInstitutionId: !!filters.institution_id,
    hasSectionId: !!filters.section_id,
    hasSectionIds: !!(filters.section_ids?.length),
    institution_id: filters.institution_id,
    section_id: filters.section_id
  });

  const { data, error } = await query;

  logger.info('academic/attendance', 'Query result', {
    resultCount: data?.length || 0,
    hasError: !!error,
    error: error?.message
  });

  return transformedData;
}
```

## Immediate Debugging Steps

1. **Check browser console** for warnings logged at line 1682 in attendance-service.ts:
   ```typescript
   logger.warn('academic/attendance', 'No students found for attendance', { filters });
   ```

2. **Verify contextData** on mark page:
   ```typescript
   console.log('Context Data:', contextData);
   console.log('Section ID:', contextData?.section_id);
   console.log('Timetable Data:', contextData?.timetable_data);
   ```

3. **Check faculty profile** in database:
   ```sql
   SELECT id, role, institution_id, department_id, is_super_admin
   FROM profiles
   WHERE email = '<faculty_email>';
   ```

4. **Verify institution_id match**:
   ```sql
   -- Check if faculty institution matches section institution
   SELECT
     p.id as profile_id,
     p.institution_id as faculty_institution,
     s.institution_id as section_institution,
     p.institution_id = s.institution_id as has_access
   FROM profiles p,
        sections s
   WHERE p.email = '<faculty_email>'
     AND s.id = 'f52e55a5-ef33-477b-9989-2ae679e9fe2c';
   ```

## Test Plan

After implementing fix:

1. ✅ Navigate to attendance page
2. ✅ Select date (2026-01-29)
3. ✅ Click "Mark Attendance" for JavaScript Programming, Period JEI P1
4. ✅ Verify URL includes `sectionId` parameter
5. ✅ Verify students load correctly (should see 5 students)
6. ✅ Verify faculty can mark attendance
7. ✅ Test with different sections and timetables

## Files to Modify

1. `app/(routes)/academic/attendance/page.tsx` - Fix navigation logic
2. `app/(routes)/academic/attendance/mark/page.tsx` - Improve fallback logic
3. `lib/services/academic/attendance-service.ts` - Add debug logging

## Related Issues

- Multi-section support may need refinement
- Period selection logic may need to fetch timetable data earlier
- Consider caching timetable data to avoid redundant queries

---

**Next Steps:**
1. Implement Option 1 (ensure sectionId in URL)
2. Add debug logging (Option 3)
3. Test thoroughly with various scenarios
4. Document the fix in release notes
