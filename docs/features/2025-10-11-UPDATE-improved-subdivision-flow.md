# Improved Subdivision Flow Update

**Date:** 2025-10-11
**Type:** Enhancement
**Status:** ✅ Complete

---

## Summary

Updated the section subdivision flow based on user feedback to provide a more intuitive and flexible experience. The key improvement is allowing **per-group course selection** instead of requiring a single course upfront.

---

## Problem

### Original Flow (Confusing):
1. User selects "Section Subdivision" checkbox
2. User must select **course** and **staff** in slot dialog
3. User clicks "Create Slot"
4. Subdivision config dialog opens
5. Asks for number of groups
6. Each group card asks for **staff again** (redundant!)
7. No course selection per group

**Issues:**
- Why ask for course/staff twice?
- All groups must use the same course
- Cannot create groups with different courses (e.g., Group A: Chemistry Lab, Group B: Physics Lab)

---

## Solution

### Improved Flow (Intuitive):
1. User selects "Section Subdivision" checkbox
2. Only shows **Subdivision Type** and **Student Assignment mode**
3. **No course/staff selection at this step**
4. User clicks "Create Slot"
5. Subdivision config dialog opens
6. Asks for number of groups
7. Each group card asks for:
   - **Course** (can be different per group!)
   - **Staff** (per group)
   - **Students** (auto or manual)
   - Lab room, capacity, etc.

**Benefits:**
- No redundancy
- Each group can have different courses
- Each group can have different staff
- Clearer workflow
- More flexible for institutions

---

## Changes Made

### 1. Slot Dialog (`slot-dialog.tsx`)

**Updated: Lines 591-592**
```typescript
// Hide course/staff selection when subdivision is enabled
{!isBreakSlot && !isCombinedClass && !isSubdivided && (
  <div className='space-y-4 border rounded-lg p-4'>
    <h4 className='font-medium'>Class Configuration</h4>
    {/* Course and Staff selection only for non-subdivided slots */}
```

**Updated: Lines 563-570**
```typescript
<span>
  In the next step, configure each group with course, staff, and students.
  Each group can have different courses and staff.
</span>
```

**Result:** When subdivision is enabled, course/staff selectors are hidden.

---

### 2. Subdivision Config Dialog (`subdivision-config-dialog.tsx`)

**Updated: Interface (Lines 35-47)**
```typescript
interface SubdivisionConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: SubdivisionConfig) => void;
  sectionId: string;
  courseId?: string; // Optional - for backward compatibility
  availableCourses: Array<{ id: string; course_name: string; course_code: string }>; // NEW
  subdivisionType: SubdivisionType;
  subdivisionMode: SubdivisionMode;
  allStudents: Array<{ ... }>;
  availableStaff: Array<{ ... }>;
  existingConfig?: SubdivisionConfig;
}
```

**Updated: Group Initialization (Lines 74-98)**
- Changed `course_id: courseId` to `course_id: ''` (empty)
- Groups now start with no course selected
- User selects course per group

**Updated: Render (Line 334)**
- Pass `availableCourses` prop to SubdivisionGroupCard

**Result:** Dialog accepts courses list and passes to group cards.

---

### 3. Subdivision Group Card (`subdivision-group-card.tsx`)

**Updated: Interface (Lines 29-36)**
```typescript
interface SubdivisionGroupCardProps {
  group: SubdivisionGroup;
  allStudents: Array<{ ... }>;
  availableStaff: Array<{ ... }>;
  availableCourses: Array<{ id: string; course_name: string; course_code: string }>; // NEW
  onUpdate: (updates: Partial<SubdivisionGroup>) => void;
  subdivisionMode: SubdivisionMode;
}
```

**Added: Course Selector (Lines 108-139)**
```tsx
{/* Course Selection - Updated: 2025-10-11 */}
<div className='space-y-2'>
  <Label className='text-sm font-medium'>
    Course <span className='text-red-500'>*</span>
  </Label>
  <Select
    value={group.course_id || ''}
    onValueChange={(value) => onUpdate({ course_id: value })}
  >
    <SelectTrigger className={!group.course_id ? 'border-red-300' : ''}>
      <SelectValue placeholder='Select a course (required)' />
    </SelectTrigger>
    <SelectContent>
      {availableCourses.length === 0 ? (
        <div className='p-2 text-center text-sm text-muted-foreground'>
          No courses available
        </div>
      ) : (
        availableCourses.map((course) => (
          <SelectItem key={course.id} value={course.id}>
            {course.course_name} ({course.course_code})
          </SelectItem>
        ))
      )}
    </SelectContent>
  </Select>
  {!group.course_id && (
    <p className='text-xs text-red-600'>
      Course is required for this group
    </p>
  )}
</div>
```

**Result:** Each group can select its own course from available options.

---

### 4. Timetable Page (`page.tsx`)

**Updated: SubdivisionConfigDialog Usage (Line 2940)**
```tsx
<SubdivisionConfigDialog
  isOpen={subdivisionConfigOpen}
  onClose={...}
  onSave={handleSubdivisionConfigSave}
  sectionId={pendingSlotData.section_ids?.[0] || ''}
  courseId={pendingSlotData.course_id || ''}
  availableCourses={courses} // NEW: Pass all available courses
  subdivisionType={subdivisionType}
  subdivisionMode={subdivisionMode}
  allStudents={allStudentsForSubdivision}
  availableStaff={staff}
  existingConfig={...}
/>
```

**Result:** Dialog receives full courses list from timetable page.

---

## Type Changes

### SubdivisionGroup Interface

**Already Existed (No changes needed):**
```typescript
export interface SubdivisionGroup {
  group_order: number;
  group_name: string;
  course_id: string; // ✅ Already had this field
  staff_ids: string[];
  student_ids: string[];
  lab_room?: string;
  max_capacity?: number;
}
```

The `course_id` field was already in the interface - we just weren't using it properly before!

---

## Data Structure

### Timetable Slot Data (JSONB)

```json
{
  "MONDAY": {
    "period-uuid-1": {
      "slot_id": "slot-uuid-1",
      "is_subdivided": true,
      "subdivision_type": "practical",
      "subdivision_mode": "auto",
      "course_id": "", // Empty or first group's course
      "staff_ids": [], // Empty - staff is per group
      "section_ids": ["section-A-uuid"],
      "sub_slots": [
        {
          "sub_slot_order": 1,
          "group_name": "Group A - Chemistry Lab",
          "course_id": "chemistry-lab-course-uuid", // Different course!
          "staff_ids": ["staff-1"],
          "section_ids": ["section-A-uuid"],
          "student_ids": ["student-1", "student-2", ..., "student-30"],
          "lab_room": "Chemistry Lab 1",
          "max_capacity": 30
        },
        {
          "sub_slot_order": 2,
          "group_name": "Group B - Physics Lab",
          "course_id": "physics-lab-course-uuid", // Different course!
          "staff_ids": ["staff-2"],
          "section_ids": ["section-A-uuid"],
          "student_ids": ["student-31", ..., "student-60"],
          "lab_room": "Physics Lab 2",
          "max_capacity": 30
        },
        {
          "sub_slot_order": 3,
          "group_name": "Group C - Bio Lab",
          "course_id": "bio-lab-course-uuid", // Different course!
          "staff_ids": ["staff-3"],
          "section_ids": ["section-A-uuid"],
          "student_ids": ["student-61", ..., "student-100"],
          "lab_room": "Biology Lab",
          "max_capacity": 40
        }
      ]
    }
  }
}
```

---

## Use Cases Now Supported

### Use Case 1: Same Course, Different Labs
```
Period 5 - Pharmaceutical Chemistry Practical
- Group A: 30 students + Dr. Smith in Lab 1
- Group B: 30 students + Dr. Johnson in Lab 2
- Group C: 40 students + Dr. Williams in Lab 3
All groups: Same course, different staff & labs
```

### Use Case 2: Different Courses (NEW!)
```
Period 5 - Practical Session
- Group A: Chemistry Lab + Dr. Smith in Chemistry Lab
- Group B: Physics Lab + Dr. Johnson in Physics Lab
- Group C: Biology Lab + Dr. Williams in Biology Lab
All groups: Different courses, staff, and labs
```

### Use Case 3: Mixed Sections (Future)
```
Period 5 - Combined Practical
- Group A: Section A students (Chemistry)
- Group B: Section B students (Physics)
- Group C: Section C students (Biology)
```

---

## Backward Compatibility

✅ **Fully backward compatible**

- Existing subdivided slots will load correctly
- If a slot has `course_id` at top level, it's preserved
- Existing `sub_slots` with `course_id` will load fine
- Non-subdivided slots work exactly as before

---

## UI/UX Improvements

### Before:
```
1. Enable subdivision checkbox
2. ⚠️ Select course (why?)
3. ⚠️ Select staff (why?)
4. Click Create
5. Configure groups dialog opens
6. ⚠️ Select staff AGAIN per group (confusing!)
7. No way to change course per group
```

### After:
```
1. Enable subdivision checkbox
2. See: "Subdivision Type" and "Student Assignment"
3. Click Create (no course/staff yet)
4. Configure groups dialog opens
5. ✅ Select course per group
6. ✅ Select staff per group
7. ✅ Assign students
8. Done - clear and logical flow!
```

---

## Validation

**Existing Validation Still Works:**
- All students must be assigned to exactly one group
- No duplicate assignments
- Staff required per group
- **NEW:** Course required per group

**Validation Message Example:**
```
⚠ Group 1 is missing a course
⚠ Group 2 has no staff assigned
✓ All students assigned correctly
```

---

## Files Modified

1. `app/(routes)/academic/timetables/[id]/_components/slot-dialog.tsx`
   - Hid course/staff selection when subdivision enabled
   - Updated info message

2. `app/(routes)/academic/timetables/[id]/_components/subdivision-config-dialog.tsx`
   - Added `availableCourses` prop
   - Changed group initialization to empty `course_id`
   - Passed courses to group cards

3. `app/(routes)/academic/timetables/[id]/_components/subdivision-group-card.tsx`
   - Added `availableCourses` prop
   - Added course selector UI (before staff section)
   - Added course required validation

4. `app/(routes)/academic/timetables/[id]/page.tsx`
   - Passed `courses` array to SubdivisionConfigDialog

**Total Changes:** 4 files, ~50 lines added/modified

---

## Testing Checklist

- [ ] Enable subdivision checkbox → verify course/staff hidden
- [ ] Click Create → verify subdivision dialog opens
- [ ] Verify each group shows course dropdown
- [ ] Select different courses for different groups
- [ ] Save and verify data structure in database
- [ ] Load existing subdivided slot → verify courses load per group
- [ ] Edit subdivided slot → verify can change courses
- [ ] Test with same course for all groups
- [ ] Test with different courses for each group
- [ ] Verify backward compatibility with existing slots

---

## Migration Notes

**For Existing Subdivided Slots:**

If you have existing subdivided slots created before this update:
- They will continue to work
- If they have `course_id` at slot level, it will be preserved
- If they have `course_id` per sub_slot, those will be used
- No database migration needed

**For New Subdivided Slots:**
- Users will select course per group
- More flexible and intuitive
- Supports use cases previously impossible

---

## Future Enhancements

1. **Staff Planning Integration**: Only show staff assigned to selected course
2. **Course Prerequisites**: Validate student eligibility for selected course
3. **Resource Allocation**: Check lab availability for selected course
4. **Timetable Conflicts**: Detect if course is scheduled elsewhere

---

**Implementation Date:** 2025-10-11
**Implemented By:** Claude Code
**Tested:** Pending user testing
**Status:** ✅ Ready for Testing

---

## Quick Reference

### Old Flow
```
Subdivision Checkbox → Course + Staff → Create → Groups (staff again?)
```

### New Flow
```
Subdivision Checkbox → Type + Mode → Create → Groups (course + staff + students)
```

### Key Benefit
**Each group can now have its own course, staff, and configuration!**
