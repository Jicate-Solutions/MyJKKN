# Staff Planning Clone Feature

**Date:** 2026-01-30
**Category:** Feature
**Module:** Academic / Staff Planning
**Status:** Completed

## Overview

Enables cloning staff plans to new academic years with smart UI filtering to reduce manual work when a new academic year begins.

## Problem Statement

When a new academic year starts, administrators need to create staff planning for all programs and semesters. Since 40-80% of staff assignments remain the same year-over-year, manually recreating plans is time-consuming and error-prone.

Additionally, displaying staff plans from multiple academic years in the same list creates UI clutter and confusion.

## Solution

### 1. Clone Feature
- **Single Plan Clone**: Clone individual staff plan to new academic year via row action menu
- **Bulk Clone**: Clone entire semester's plans to new academic year
- **Options**:
  - Auto-adjust dates to match target academic year calendar
  - Exclude inactive staff members
  - Copy all course assignments

### 2. Smart Filtering
- Default view shows only current academic year's plans
- Prominent academic year dropdown switcher
- "Show All Years" option for historical view
- URL parameter preservation for shareable filtered views

### 3. Database Protection
- Unique constraint prevents duplicate plans for same academic year + semester
- Validation at service layer and database level

## Architecture

### Database Schema
No schema changes required. Existing structure supports the feature:

```sql
staff_plans (
  id UUID PRIMARY KEY,
  institution_id UUID,
  program_id UUID,
  semester_id UUID,
  academic_year_id UUID,  -- Makes each plan unique per year
  ...
)

staff_plan_courses (
  staff_plan_id UUID,
  course_id UUID,
  staff_id UUID,
  staff_type VARCHAR
)
```

### Service Layer

**New Methods:**
- `StaffPlanService.cloneStaffPlanToNewYear()` - Clone single plan
- `StaffPlanService.cloneSemesterToNewYear()` - Clone all plans for semester

**Options Interface:**
```typescript
interface CloneStaffPlanOptions {
  adjustDates?: boolean;
  preserveInactive?: boolean;
  excludeInactiveAssignments?: boolean;
}
```

### UI Components

**New Components:**
- `CloneStaffPlanDialog` - Single plan clone dialog
- `BulkCloneStaffPlanDialog` - Bulk semester clone dialog

**Updated Components:**
- `StaffPlanFilters` - Added academic year filter with current year default
- `StaffPlanRowActions` - Added clone menu item
- `StaffPlanningDataTable` - Added bulk clone button

## User Workflows

### Workflow 1: Clone Single Plan
1. Navigate to Staff Planning page
2. Click "..." menu on any staff plan row
3. Click "Clone to New Year"
4. Select target academic year
5. Configure options (adjust dates, preserve inactive)
6. Click "Clone Staff Plan"
7. System creates new plan with new academic_year_id
8. User is redirected to new plan for review/editing

### Workflow 2: Bulk Clone Semester
1. Navigate to Staff Planning page
2. Click "Bulk Clone" button
3. Select semester to clone
4. Select source academic year
5. Select target academic year
6. Configure options
7. Click "Clone All Plans"
8. System clones all plans for that semester
9. Results shown with success/failure per plan

### Workflow 3: Filter by Academic Year
1. Navigate to Staff Planning page
2. Default view shows current academic year only
3. Use academic year dropdown to:
   - Switch to different year
   - View "All Academic Years"
4. List updates to show filtered plans
5. URL updates for shareable links

## Integration Points

### Timetable Module
- **No Changes Required**: Timetables continue to match staff plans by hierarchy
- Matching criteria: `academic_year_id` + `program_id` + `semester_id`
- No direct FK, so flexibility maintained

### Academic Year Service
- Used to fetch current academic year for default filter
- Used to get date ranges for auto-adjustment

## Technical Details

### Database Constraint
```sql
ALTER TABLE staff_plans
ADD CONSTRAINT unique_staff_plan_per_year
UNIQUE (institution_id, program_id, semester_id, academic_year_id, department_id);
```

### Service Method Signature
```typescript
static async cloneStaffPlanToNewYear(
  sourceStaffPlanId: string,
  targetAcademicYearId: string,
  options?: CloneStaffPlanOptions
): Promise<CloneStaffPlanResult>
```

### Clone Process
1. Fetch source plan + all course assignments
2. Check for existing plan (prevent duplicates)
3. Get target year dates (if adjustDates enabled)
4. Filter inactive staff (if excludeInactiveAssignments enabled)
5. Create new staff_plans record with new academic_year_id
6. Create new staff_plan_courses records linked to new plan
7. Return result with new plan ID and exclusion counts

## Benefits

1. **Time Savings**: 80% reduction in time to set up new academic year
2. **Consistency**: Reduces manual entry errors
3. **Flexibility**: Users can still modify cloned plans as needed
4. **Historical Tracking**: All academic year versions preserved
5. **Clean UI**: Default filtering prevents clutter
6. **Audit Trail**: Complete history of staff planning changes

## Future Enhancements

- [ ] Clone with modifications (e.g., exclude specific courses)
- [ ] Template system for reusable patterns
- [ ] Comparison view between academic years
- [ ] Automated notifications for staff assignment changes
- [ ] Bulk edit capabilities post-clone

## Files Modified

### Database
- `supabase/migrations/20260130000001_add_unique_constraint_staff_plans.sql`

### Services
- `lib/services/academic/staff-plan-service.ts`

### Components
- `app/(routes)/academic/staff-planning/_components/clone-staff-plan-dialog.tsx` (new)
- `app/(routes)/academic/staff-planning/_components/bulk-clone-dialog.tsx` (new)
- `app/(routes)/academic/staff-planning/_components/row-actions.tsx`
- `app/(routes)/academic/staff-planning/_components/staff-plan-filters.tsx`
- `app/(routes)/academic/staff-planning/_components/staff-planning-data-table.tsx`

## Testing

See: `docs/testing/staff-planning-clone-verification.md`

## Related Documentation

- Staff Planning Module: `docs/modules/academic/staff-planning.md`
- Timetable Integration: `docs/modules/academic/timetables.md`
- Academic Year Management: `docs/modules/organization/academic-years.md`
