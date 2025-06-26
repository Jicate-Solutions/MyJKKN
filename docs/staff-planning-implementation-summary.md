# Staff Planning - Staff Member Fetching Implementation

## Overview

The Staff Planning module has been updated to fetch staff members based on institution and department selection, ensuring that only relevant staff from the selected department and institution are available for course assignments.

## Current Implementation

### 1. Staff Fetching Function (`fetchStaffMembers`)

```typescript
const fetchStaffMembers = useCallback(
  async (institutionId?: string, departmentId?: string) => {
    try {
      // Only fetch staff if both institution and department are selected
      if (!institutionId || !departmentId) {
        setStaffMembers([]);
        return;
      }

      const staffResult = await StaffService.getStaff({
        isActive: true,
        institution_id: institutionId,
        department_id: departmentId,
        limit: 1000 // High limit to get all staff for this institution/department
      });

      const uniqueStaff = Array.from(
        new Map(staffResult.data.map((item: any) => [item.id, item])).values()
      );
      setStaffMembers(uniqueStaff);
    } catch (error) {
      console.error('Error fetching staff members:', error);
      setStaffMembers([]);
    }
  },
  []
);
```

### 2. Staff Loading Behavior

#### For New Staff Plans:

- **Initial State**: No staff members are loaded initially
- **Trigger**: Staff are fetched only when both institution AND department are selected
- **Auto-clear**: Staff list is cleared when institution or department selection changes

#### For Editing Existing Staff Plans:

- **Initial Load**: Staff are fetched based on the existing staff plan's institution and department
- **Context Maintained**: All form data including institution/department is loaded first, then staff are fetched

### 3. Reactive Updates

```typescript
// Fetch staff when institution or department changes (for new forms)
useEffect(() => {
  if (!isEditing && watchedInstitutionId && watchedDepartmentId) {
    fetchStaffMembers(watchedInstitutionId, watchedDepartmentId);
  } else if (!isEditing && (!watchedInstitutionId || !watchedDepartmentId)) {
    // Clear staff when institution or department is not selected
    setStaffMembers([]);
  }
}, [watchedInstitutionId, watchedDepartmentId, isEditing, fetchStaffMembers]);
```

### 4. StaffService Capabilities

The `StaffService.getStaff()` method supports filtering by:

- `institution_id` - Filters staff by institution
- `department_id` - Filters staff by department
- `isActive` - Only shows active staff members
- `limit` - Controls number of results returned

## Benefits

1. **Performance**: Only loads relevant staff members, reducing data transfer and memory usage
2. **User Experience**: Staff dropdown only shows applicable staff for the selected department
3. **Data Integrity**: Prevents assignment of staff from wrong departments or institutions
4. **Scalability**: Works efficiently even with large numbers of staff across multiple institutions

## Usage Flow

### Creating New Staff Plan:

1. User selects Institution → No staff loaded yet
2. User selects Degree → No staff loaded yet
3. User selects Department → **Staff members fetched** for selected institution + department
4. User can now assign staff to courses from the filtered list

### Editing Existing Staff Plan:

1. Form loads with existing institution/department selected
2. **Staff members fetched immediately** based on existing selections
3. Course assignments display with correct staff context
4. If user changes institution/department, staff list updates accordingly

## Technical Details

- **Service**: `StaffService.getStaff()` with filtering parameters
- **Component**: `staff-plan-form.tsx` with reactive staff fetching
- **Trigger**: `useEffect` hooks watching `institution_id` and `department_id` changes
- **Error Handling**: Graceful fallback to empty staff list on fetch errors
- **Memory Management**: Proper cleanup and deduplication of staff data

This implementation ensures that staff planning is contextually relevant and maintains data integrity while providing an optimal user experience.
