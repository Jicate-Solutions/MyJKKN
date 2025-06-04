# Staff Planning Module - Section ID Error Fix

## Problem Analysis

The staff planning module was experiencing a database error when trying to create a staff plan:

```
Error creating staff plan:
Object
code: "PGRST204"
details: null
hint: null
message: "Could not find the 'section_id' column of 'staff_plans' in the schema cache"
```

## Root Cause

The error was caused by a **schema mismatch** between the form data structure and the database schema:

1. **Form Schema**: Used `section_id` (expecting a UUID reference to sections table)
2. **Database Schema**: Has `section VARCHAR(50) NOT NULL` (expecting a string value)
3. **API Payload**: Was sending `section_id` instead of `section`

### Database Schema (staff_plans table)

```sql
CREATE TABLE IF NOT EXISTS public.staff_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    institution_id UUID NOT NULL REFERENCES public.institutions(id),
    degree_id UUID NOT NULL REFERENCES public.degrees(id),
    department_id UUID NOT NULL REFERENCES public.departments(id),
    program_id UUID NOT NULL REFERENCES public.programs(id),
    semester_id UUID NOT NULL REFERENCES public.semesters(id),
    section VARCHAR(50) NOT NULL,  -- This expects a string, not UUID
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);
```

## Solution Implemented

### 1. Fixed Form Submission Logic

**File**: `app/(routes)/academic/staff-planning/_components/staff-plan-form.tsx`

**Before**:

```typescript
const formattedValues = {
  ...values,
  section: values.section_id, // Inconsistent mapping
  // ...
};

// Inconsistent payload structure for create vs update
```

**After**:

```typescript
const onSubmit = async (values: FormValues) => {
  try {
    setIsSubmitting(true);

    // Find the selected section to get its name
    const selectedSection = sections.find(s => s.id === values.section_id);
    const sectionName = selectedSection?.section_name || values.section_id;

    // Consistent API payload structure
    const apiPayload = {
      institution_id: values.institution_id,
      degree_id: values.degree_id,
      program_id: values.program_id,
      department_id: values.department_id,
      semester_id: values.semester_id,
      section: sectionName, // Use section name (string)
      academic_year_id: values.academic_year_id,
      start_date: values.start_date.toISOString(),
      end_date: values.end_date.toISOString(),
      courses: values.courses,
      is_active: values.is_active
    };

    // Same payload structure for both create and update
    if (isEditing && staffPlan) {
      await StaffPlanService.updateStaffPlan(staffPlan.id, apiPayload);
    } else {
      await StaffPlanService.createStaffPlan(apiPayload);
    }
  } catch (error) {
    // Error handling...
  }
};
```

### 2. Fixed Form Loading for Edit Mode

**Before**:

```typescript
section_id: staffPlan.section, // Direct assignment might not work
```

**After**:

```typescript
section_id: sectionsData.find(s => s.section_name === staffPlan.section)?.id || staffPlan.section,
```

This properly maps the stored section name back to the section ID for the form dropdown.

### 3. Fixed Section Display in Details Component

**File**: `app/(routes)/academic/staff-planning/_components/staff-plan-details.tsx`

**Before**:

```typescript
interface Section {
  id: string;
  section_code: string; // This field doesn't exist in the main Section type
  section_name: string;
}

const matchingSection = sections.find(
  (s) => s.section_code === planData.section // Using non-existent field
);
```

**After**:

```typescript
interface Section {
  id: string;
  section_name: string; // Removed non-existent section_code field
}

const matchingSection = sections.find(
  (s) => s.section_name === planData.section // Using correct field
);
```

## Data Flow Summary

1. **Form Input**: User selects section by ID from dropdown
2. **Form Submission**: Convert section ID → section name
3. **Database Storage**: Store section name as VARCHAR(50)
4. **Form Loading (Edit)**: Convert section name → section ID for dropdown
5. **Display**: Show section name in details view

## Files Modified

1. `app/(routes)/academic/staff-planning/_components/staff-plan-form.tsx`

   - Fixed form submission logic
   - Fixed form loading for edit mode

2. `app/(routes)/academic/staff-planning/_components/staff-plan-details.tsx`
   - Fixed section matching logic
   - Removed invalid section_code field

## Testing

After implementing these fixes:

1. ✅ Staff plan creation should work without database errors
2. ✅ Staff plan editing should properly load section values
3. ✅ Section display in details view should work correctly
4. ✅ Consistent data handling between create/update operations

## Future Considerations

1. **Database Normalization**: Consider whether the section field should be a foreign key reference to a sections table instead of a string field
2. **Section Service**: The `getSectionsBySemester` method doesn't actually filter by semester - this might need fixing
3. **Type Consistency**: Ensure all Section interfaces across the codebase are consistent
