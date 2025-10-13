# Subdivided Attendance Integration Implementation Plan

**Date:** 2025-10-11
**Feature:** Integrate SubdividedAttendanceGrid into Attendance Mark Page
**Status:** Implementation Ready

---

## Overview

This document outlines the implementation steps to integrate the newly created `SubdividedAttendanceGrid` component into the attendance marking page (`app/(routes)/academic/attendance/mark/page.tsx`).

## Current State

- ✅ SubdividedAttendanceGrid component created
- ✅ Timetable service saves subdivision data to `timetable_data` JSONB
- ✅ Attendance service supports fetching students (no changes needed)
- ❌ Attendance mark page doesn't detect subdivided slots
- ❌ Attendance mark page doesn't use SubdividedAttendanceGrid

## Implementation Steps

### Step 1: Add Imports

**Location:** Top of `app/(routes)/academic/attendance/mark/page.tsx`

Add these imports:
```typescript
import { SubdividedAttendanceGrid } from './components/subdivided-attendance-grid';
import type { SubdivisionGroupData } from '@/types/academics';
```

### Step 2: Add State Variables

**Location:** After existing state variables (around line 95)

Add these state variables:
```typescript
// State for subdivided slot detection (Updated: 2025-10-11)
const [isSubdividedSlot, setIsSubdividedSlot] = useState(false);
const [subdivisionGroups, setSubdivisionGroups] = useState<SubdivisionGroupData[]>([]);
const [subdivisionType, setSubdivisionType] = useState<string>('practical');
```

### Step 3: Detect Subdivided Slots in Context Loading

**Location:** Inside `loadContextData` effect (around lines 382-451)

After fetching timetable slot data (where we already search for the slot), add subdivision detection:

```typescript
// After finding the slot (around line 395):
if (slot && slot.slot_id === periodId) {
  console.log(`🔍 Found slot for period ${periodId} on ${day}:`, slot);

  // NEW: Check if this is a subdivided slot (Updated: 2025-10-11)
  if (slot.is_subdivided && slot.sub_slots && slot.sub_slots.length > 0) {
    console.log('🎯 Detected subdivided slot:', {
      subdivision_type: slot.subdivision_type,
      subdivision_mode: slot.subdivision_mode,
      group_count: slot.sub_slots.length
    });

    // Extract subdivision groups from sub_slots
    const groups: SubdivisionGroupData[] = slot.sub_slots.map((subSlot: any) => ({
      group_order: subSlot.sub_slot_order || 1,
      group_name: subSlot.group_name || `Group ${subSlot.sub_slot_order}`,
      student_ids: subSlot.student_ids || [],
      staff_ids: subSlot.staff_ids || [],
      lab_room: subSlot.lab_room,
      max_capacity: subSlot.max_capacity
    }));

    setIsSubdividedSlot(true);
    setSubdivisionGroups(groups);
    setSubdivisionType(slot.subdivision_type || 'practical');

    console.log('✅ Subdivision groups loaded:', groups.length, 'groups');
  } else {
    setIsSubdividedSlot(false);
    setSubdivisionGroups([]);
  }

  // Continue with existing section_ids extraction...
  if (slot.section_ids && Array.isArray(slot.section_ids) && slot.section_ids.length > 0) {
    // ... existing code ...
  }
}
```

### Step 4: Replace Student Grid with Conditional Rendering

**Location:** In the JSX render section (around lines 1667-1776)

Replace the existing student grid section with conditional rendering:

```tsx
{/* Student Grid - Conditional Rendering for Subdivided Slots (Updated: 2025-10-11) */}
{loadingStudents ? (
  // Loading state (keep existing)
  <Card className='border-0 shadow-lg'>
    {/* ... existing loading UI ... */}
  </Card>
) : isSubdividedSlot && subdivisionGroups.length > 0 ? (
  // NEW: Subdivided Attendance Grid
  <div className='space-y-4'>
    <div className='flex items-center justify-between'>
      <h2 className='text-xl font-semibold flex items-center gap-2'>
        <Users className='h-5 w-5 text-purple-600' />
        Subdivided {subdivisionType.charAt(0).toUpperCase() + subdivisionType.slice(1)} Groups
        <Badge variant='secondary' className='ml-2 bg-purple-100 text-purple-800'>
          {subdivisionGroups.length} Groups
        </Badge>
      </h2>
    </div>

    <SubdividedAttendanceGrid
      groups={subdivisionGroups}
      allStudents={students}
      availableStaff={assignedStaff}
      attendanceData={attendanceData}
      onAttendanceChange={(studentId, status) => {
        setAttendanceData((prev) => ({
          ...prev,
          [studentId]: status
        }));
      }}
      onMarkAllGroupPresent={(groupOrder) => {
        const group = subdivisionGroups.find((g) => g.group_order === groupOrder);
        if (group) {
          const newData = { ...attendanceData };
          group.student_ids.forEach((studentId) => {
            newData[studentId] = 'Present';
          });
          setAttendanceData(newData);
        }
      }}
      onMarkAllGroupAbsent={(groupOrder) => {
        const group = subdivisionGroups.find((g) => g.group_order === groupOrder);
        if (group) {
          const newData = { ...attendanceData };
          group.student_ids.forEach((studentId) => {
            newData[studentId] = 'Absent';
          });
          setAttendanceData(newData);
        }
      }}
      readOnly={existingAttendance && !isEditMode}
      searchTerm={searchTerm}
      subdivisionType={subdivisionType}
    />
  </div>
) : filteredStudents.length === 0 ? (
  // No students found (keep existing)
  <Card className='border-0 shadow-lg border-l-4 border-l-amber-500'>
    {/* ... existing no students UI ... */}
  </Card>
) : (
  // Regular student grid (keep existing)
  <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
    {/* ... existing student cards ... */}
  </div>
)}
```

### Step 5: Update Save Attendance Logic

**Location:** In `performSaveAttendance` function (around lines 700-957)

Modify the attendance payload to preserve group structure for subdivided slots:

```typescript
// Around line 853, when preparing attendance data:
const attendancePayload = {
  [periodId || 'default']: {
    period_id: periodId || 'default',
    period_name: periodName || 'Unknown Period',
    course_id: correctCourseInfo.course_id,
    course_name: correctCourseInfo.course_name,
    course_code: correctCourseInfo.course_code,
    start_time: startTime || '',
    end_time: endTime || '',

    // NEW: Add subdivision metadata if applicable (Updated: 2025-10-11)
    ...(isSubdividedSlot && {
      is_subdivided: true,
      subdivision_type: subdivisionType,
      groups: subdivisionGroups.map((group) => ({
        group_order: group.group_order,
        group_name: group.group_name,
        lab_room: group.lab_room,
        max_capacity: group.max_capacity,
        staff_ids: group.staff_ids,
        students: students
          .filter((student) => group.student_ids.includes(student.id))
          .map((student) => ({
            student_id: student.id,
            section_id: student.section_id || contextData?.section_id || effectiveSectionId || '',
            status: attendanceData[student.id] || 'Present',
            marked_at: new Date().toISOString()
          }))
      }))
    }),

    // For non-subdivided or fallback, keep original structure
    assigned_faculty: assignedFacultyData,
    marked_by_details: { /* ... existing code ... */ },
    students: isSubdividedSlot
      ? [] // Empty for subdivided (data is in groups)
      : students.map((student) => ({ /* ... existing code ... */ }))
  }
};
```

### Step 6: Update Stats Display for Subdivided Slots

**Location:** In stats cards section (around lines 1481-1572)

The existing stats cards should work fine since they calculate from `attendanceData`. But we can add a note for subdivided slots:

```tsx
{/* Add after stats cards, before actions bar */}
{isSubdividedSlot && (
  <Alert className='border-purple-200 bg-purple-50 dark:bg-purple-900/20'>
    <Users className='h-4 w-4 text-purple-600 dark:text-purple-500' />
    <AlertDescription className='text-purple-800 dark:text-purple-200'>
      ℹ️ This is a subdivided {subdivisionType} session with {subdivisionGroups.length} groups.
      Students are organized by their assigned groups below.
    </AlertDescription>
  </Alert>
)}
```

---

## Testing Checklist

After implementation, test the following:

- [ ] Navigate to attendance marking page with a subdivided slot
- [ ] Verify subdivision detection and group loading
- [ ] Verify SubdividedAttendanceGrid renders correctly
- [ ] Test marking individual students present/absent
- [ ] Test "Mark All Present/Absent" for individual groups
- [ ] Test search functionality within subdivided grid
- [ ] Test save attendance with group structure
- [ ] Verify saved attendance data contains group information
- [ ] Test loading existing subdivided attendance
- [ ] Test edit mode for subdivided attendance
- [ ] Verify read-only mode works correctly
- [ ] Test with 2 groups (minimum)
- [ ] Test with 10 groups (maximum)
- [ ] Test with uneven group sizes

---

## Data Flow

### Timetable → Attendance Mark Page

```
1. User clicks "Mark Attendance" from timetable
2. URL contains: timetableId, periodId, date, sectionId, etc.
3. Page loads timetable_data JSONB from database
4. Detects slot.is_subdivided === true
5. Extracts slot.sub_slots array
6. Maps sub_slots to SubdivisionGroupData[]
7. Passes to SubdividedAttendanceGrid component
```

### Marking Attendance

```
1. User marks students present/absent per group
2. attendanceData state updates: { studentId: 'Present'|'Absent' }
3. User clicks "Save Attendance"
4. performSaveAttendance() creates payload with groups structure
5. Each group contains its students with attendance status
6. Data saved to daily_attendance table (attendance_data JSONB)
```

### Loading Existing Attendance

```
1. checkExistingAttendance() runs after context loads
2. Fetches from daily_attendance table
3. Checks if attendance_data contains is_subdivided flag
4. If subdivided, reconstructs groups from saved data
5. Pre-populates attendanceData state
6. Renders SubdividedAttendanceGrid in read-only or edit mode
```

---

## Attendance Data Structure (Saved to DB)

```json
{
  "period-uuid-1": {
    "period_id": "period-uuid-1",
    "period_name": "Period 5",
    "course_id": "course-uuid",
    "course_name": "Pharmaceutical Chemistry Practical",
    "course_code": "PHM301P",
    "start_time": "10:00 AM",
    "end_time": "12:00 PM",

    "is_subdivided": true,
    "subdivision_type": "practical",

    "groups": [
      {
        "group_order": 1,
        "group_name": "Group A - Lab 1",
        "lab_room": "Laboratory Room 1",
        "max_capacity": 30,
        "staff_ids": ["staff-uuid-1"],
        "students": [
          {
            "student_id": "student-uuid-1",
            "section_id": "section-uuid",
            "status": "Present",
            "marked_at": "2025-10-11T10:30:00Z"
          },
          // ... 29 more students
        ]
      },
      {
        "group_order": 2,
        "group_name": "Group B - Lab 2",
        "lab_room": "Laboratory Room 2",
        "max_capacity": 30,
        "staff_ids": ["staff-uuid-2"],
        "students": [
          // ... students for group B
        ]
      },
      {
        "group_order": 3,
        "group_name": "Group C - Lab 3",
        "lab_room": "Laboratory Room 3",
        "max_capacity": 40,
        "staff_ids": ["staff-uuid-3"],
        "students": [
          // ... students for group C
        ]
      }
    ],

    "assigned_faculty": [/* ... */],
    "marked_by_details": {/* ... */},
    "students": [] // Empty for subdivided (data is in groups)
  }
}
```

---

## Notes

- **Backward Compatibility**: Non-subdivided slots continue to work as before
- **No DB Schema Changes**: All data stored in existing `attendance_data` JSONB column
- **Service Layer**: AttendanceService requires no changes - it already supports needed operations
- **Visual Theme**: Purple color scheme used consistently for subdivision UI
- **Staff Assignment**: Each group can have different staff members assigned
- **Group Validation**: Component shows warnings if groups exceed max capacity

---

**Implementation Status:** Ready to implement
**Estimated Time:** 2-3 hours
**Next Step:** Begin with Step 1 (Add Imports)
