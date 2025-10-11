# Practical Class Subdivision Feature - Implementation Plan

**Date**: 2025-10-11
**Feature**: Section Subdivision for Practical Classes
**Status**: Planning
**Priority**: High
**Requested By**: Pharmacy College Use Case

## Table of Contents
1. [Problem Statement](#problem-statement)
2. [Current System Analysis](#current-system-analysis)
3. [Proposed Solution](#proposed-solution)
4. [Implementation Plan](#implementation-plan)
5. [Database Schema](#database-schema)
6. [UI/UX Changes](#uiux-changes)
7. [Testing Strategy](#testing-strategy)
8. [Migration Strategy](#migration-strategy)

---

## Problem Statement

### Use Case: Pharmacy College Practical Classes

**Scenario**:
- Section A has 100 students
- Periods 1-4: Regular theory classes for all 100 students together
- Period 5: Practical session that needs to be split into multiple groups

**Requirement**:
- Split 100 students into 3 groups for Period 5 only:
  - **Group 1**: 30 students → Practical Class 1 with Staff A
  - **Group 2**: 30 students → Practical Class 2 with Staff B
  - **Group 3**: 40 students → Practical Class 3 with Staff C

**Constraints**:
1. Students' main `section_id` in the `students` table should NOT change (it's permanent)
2. Grouping is temporary - only for this specific period
3. Attendance must be tracked separately for each group
4. Each group can have different staff assigned
5. This feature should be optional - institutions can enable it if needed

---

## Current System Analysis

### Current Timetable Structure

The system uses a JSONB-based timetable structure:

```typescript
// timetables.timetable_data
{
  "MONDAY": {
    "period_id": {
      "slot_id": "uuid",
      "course_id": "uuid",
      "staff_ids": ["uuid1", "uuid2"],
      "section_ids": ["uuid1"],  // Currently ONE section
      "is_combined": false,
      "sub_slots": []  // For time-based splitting
    }
  }
}
```

### Current "Combined Classes" Feature

The existing `sub_slots` feature splits a PERIOD into TIME segments:
- Sub-slot 1: First 30 minutes (different course/staff/sections)
- Sub-slot 2: Next 30 minutes (different course/staff/sections)

**This is DIFFERENT from the requirement**, which needs to split STUDENTS, not TIME.

### Current Attendance Structure

```typescript
// student_attendance.attendance_data
{
  "period_id": {
    "students": [
      {
        "student_id": "uuid",
        "section_id": "uuid",  // Student's permanent section
        "status": "Present/Absent",
        "marked_at": "timestamp"
      }
    ],
    "course_id": "uuid",
    "assigned_faculty": {...}
  }
}
```

### Key Observations

1. ✅ `student_attendance` table already has `section_ids` (ARRAY) - might support multiple sections
2. ✅ Each student attendance record has `section_id` field
3. ✅ `sub_slots` structure exists but serves a different purpose
4. ✅ No database schema changes needed - can use existing JSONB fields

---

## Proposed Solution

### Solution: Extend `sub_slots` for Student Subdivision

Instead of creating new tables, we'll extend the existing `sub_slots` structure to support **student subdivision** mode.

### Key Differentiators

| Feature | Combined Classes (Current) | Section Subdivision (New) |
|---------|---------------------------|---------------------------|
| **Splits** | TIME (period duration) | STUDENTS (section members) |
| **Course** | Can be different per sub-slot | SAME course for all groups |
| **Purpose** | Different activities in same period | Same activity, different groups |
| **Example** | Theory class + Lab class | Lab Group A, B, C |
| **Staff** | Different per sub-slot | Different per group |
| **Sections** | Can combine multiple sections | Splits ONE section |

### New Data Structure

```typescript
// Enhanced slot structure
{
  "MONDAY": {
    "period_5_id": {
      "slot_id": "uuid",
      "course_id": "PRACTICAL_LAB_101", // SAME for all groups
      "section_ids": ["section_a_id"], // Parent section

      // NEW FLAGS
      "is_combined": false,
      "is_subdivided": true,  // NEW: Indicates student subdivision
      "subdivision_type": "practical",  // NEW: Type (practical/lab/tutorial)
      "subdivision_mode": "manual",  // NEW: "manual" or "auto"

      // NEW: Sub-slots now support student subdivision
      "sub_slots": [
        {
          "sub_slot_order": 1,
          "group_name": "Group A - Lab 1",  // NEW: Group identifier
          "course_id": "PRACTICAL_LAB_101",  // SAME as parent
          "staff_ids": ["staff_a_id"],
          "student_ids": ["stud1", "stud2", ... "stud30"],  // NEW: Specific students
          "lab_room": "Laboratory Room 1",  // NEW: Optional location
          "max_capacity": 30,  // NEW: Optional capacity limit
          "is_break_slot": false
        },
        {
          "sub_slot_order": 2,
          "group_name": "Group B - Lab 2",
          "course_id": "PRACTICAL_LAB_101",
          "staff_ids": ["staff_b_id"],
          "student_ids": ["stud31", "stud32", ... "stud60"],  // Different 30 students
          "lab_room": "Laboratory Room 2",
          "max_capacity": 30,
          "is_break_slot": false
        },
        {
          "sub_slot_order": 3,
          "group_name": "Group C - Lab 3",
          "course_id": "PRACTICAL_LAB_101",
          "staff_ids": ["staff_c_id"],
          "student_ids": ["stud61", "stud62", ... "stud100"],  // Remaining 40 students
          "lab_room": "Laboratory Room 3",
          "max_capacity": 40,
          "is_break_slot": false
        }
      ]
    }
  }
}
```

### Enhanced Attendance Structure

```typescript
// student_attendance.attendance_data for subdivided period
{
  "period_5_id": {
    "course_id": "PRACTICAL_LAB_101",
    "is_subdivided": true,  // NEW: Indicates grouped attendance
    "section_ids": ["section_a_id"],

    // NEW: Group-based attendance
    "sub_groups": [
      {
        "sub_slot_order": 1,
        "group_name": "Group A - Lab 1",
        "staff_ids": ["staff_a_id"],
        "lab_room": "Laboratory Room 1",
        "students": [
          {
            "student_id": "stud1",
            "section_id": "section_a_id",  // Permanent section unchanged
            "subdivision_group": 1,  // NEW: Indicates which group
            "status": "Present",
            "marked_at": "2025-10-11T10:30:00Z",
            "marked_by": "staff_a_id"
          },
          // ... other students in Group A
        ]
      },
      {
        "sub_slot_order": 2,
        "group_name": "Group B - Lab 2",
        "staff_ids": ["staff_b_id"],
        "lab_room": "Laboratory Room 2",
        "students": [
          {
            "student_id": "stud31",
            "section_id": "section_a_id",
            "subdivision_group": 2,  // Group 2
            "status": "Present",
            "marked_at": "2025-10-11T10:30:00Z",
            "marked_by": "staff_b_id"
          },
          // ... other students in Group B
        ]
      },
      {
        "sub_slot_order": 3,
        "group_name": "Group C - Lab 3",
        "staff_ids": ["staff_c_id"],
        "lab_room": "Laboratory Room 3",
        "students": [
          // ... students in Group C
        ]
      }
    ],

    // Metadata
    "marked_by_details": {
      "marker_ids": ["staff_a_id", "staff_b_id", "staff_c_id"],
      "marked_at": "2025-10-11T10:30:00Z"
    }
  }
}
```

---

## Implementation Plan

### Phase 1: Type Definitions & Validation (Week 1)

#### 1.1 Update TypeScript Types

**File**: `types/academics.ts`

```typescript
// Add new fields to TimetableSlot type
export interface TimetableSlot {
  // ... existing fields

  // NEW: Section subdivision fields
  is_subdivided?: boolean;
  subdivision_type?: 'practical' | 'lab' | 'tutorial' | 'workshop';
  subdivision_mode?: 'manual' | 'auto';  // How students were assigned
}

// Add new fields to SubSlot type
export interface SubSlot {
  // ... existing fields

  // NEW: Student subdivision fields
  group_name?: string;
  student_ids?: string[];  // Array of student UUIDs
  lab_room?: string;
  max_capacity?: number;
}
```

**File**: `types/attendance.ts`

```typescript
// Add new fields to attendance types
export interface AttendanceStudent {
  // ... existing fields
  subdivision_group?: number;  // Which group (1, 2, 3, etc.)
}

export interface AttendanceData {
  // ... existing fields
  is_subdivided?: boolean;
  sub_groups?: AttendanceSubGroup[];
}

export interface AttendanceSubGroup {
  sub_slot_order: number;
  group_name: string;
  staff_ids: string[];
  lab_room?: string;
  students: AttendanceStudent[];
}
```

#### 1.2 Create Validation Utilities

**File**: `lib/utils/subdivision-validation.ts`

```typescript
export class SubdivisionValidator {
  /**
   * Validates that all section students are assigned to exactly one group
   */
  static validateStudentAssignment(
    sectionId: string,
    sectionStudents: string[],
    subSlots: SubSlot[]
  ): ValidationResult {
    const assignedStudents = new Set<string>();
    const duplicates: string[] = [];
    const missing: string[] = [];

    // Check each sub-slot
    subSlots.forEach(subSlot => {
      subSlot.student_ids?.forEach(studentId => {
        if (assignedStudents.has(studentId)) {
          duplicates.push(studentId);
        } else {
          assignedStudents.add(studentId);
        }
      });
    });

    // Find students not assigned to any group
    sectionStudents.forEach(studentId => {
      if (!assignedStudents.has(studentId)) {
        missing.push(studentId);
      }
    });

    return {
      isValid: duplicates.length === 0 && missing.length === 0,
      duplicates,
      missing,
      message: this.getValidationMessage(duplicates, missing)
    };
  }

  /**
   * Auto-distribute students into groups evenly
   */
  static autoDistributeStudents(
    students: string[],
    groupCount: number
  ): string[][] {
    const groups: string[][] = Array.from({ length: groupCount }, () => []);
    const studentsPerGroup = Math.floor(students.length / groupCount);
    const remainder = students.length % groupCount;

    let index = 0;
    for (let i = 0; i < groupCount; i++) {
      const groupSize = studentsPerGroup + (i < remainder ? 1 : 0);
      groups[i] = students.slice(index, index + groupSize);
      index += groupSize;
    }

    return groups;
  }
}
```

### Phase 2: UI Components (Week 2)

#### 2.1 Update Slot Dialog

**File**: `app/(routes)/academic/timetables/[id]/_components/slot-dialog.tsx`

Add new option alongside "Combined Class":

```tsx
// Add state for subdivision
const [isSubdivided, setIsSubdivided] = useState(false);
const [subdivisionGroups, setSubdivisionGroups] = useState<SubdivisionGroup[]>([]);
const [groupCount, setGroupCount] = useState(2);

// UI Structure
<div className='space-y-3'>
  <div className='flex items-center space-x-2'>
    <Checkbox
      id='sectionSubdivision'
      checked={isSubdivided}
      onCheckedChange={(checked) => setIsSubdivided(checked === true)}
    />
    <Label htmlFor='sectionSubdivision'>
      Section Subdivision (Practical Classes)
    </Label>
    <Badge variant='secondary' className='text-xs ml-2'>
      Split students into groups
    </Badge>
  </div>

  {isSubdivided && (
    <Alert className='bg-blue-50 border-blue-200'>
      <Info className='h-4 w-4 text-blue-600' />
      <AlertDescription className='text-sm text-blue-800'>
        Divide section students into multiple groups for practical sessions.
        Each group can have different staff and lab rooms.
      </AlertDescription>
    </Alert>
  )}
</div>

{/* Subdivision Configuration UI */}
{isSubdivided && (
  <SubdivisionConfigUI
    sectionId={timetable.section_id}
    courseId={selectedCourse}
    groupCount={groupCount}
    onGroupCountChange={setGroupCount}
    groups={subdivisionGroups}
    onGroupsChange={setSubdivisionGroups}
    availableStaff={staff}
  />
)}
```

#### 2.2 Create Subdivision Config Component

**File**: `app/(routes)/academic/timetables/[id]/_components/subdivision-config.tsx`

```tsx
export function SubdivisionConfigUI({
  sectionId,
  courseId,
  groupCount,
  onGroupCountChange,
  groups,
  onGroupsChange,
  availableStaff
}: SubdivisionConfigProps) {
  const { data: sectionStudents } = useQuery({
    queryKey: ['section-students', sectionId],
    queryFn: () => fetchSectionStudents(sectionId),
    enabled: !!sectionId
  });

  const handleAutoDistribute = () => {
    const distributed = SubdivisionValidator.autoDistributeStudents(
      sectionStudents.map(s => s.id),
      groupCount
    );
    // Update groups with distributed students
    onGroupsChange(createGroupsFromDistribution(distributed));
  };

  return (
    <div className='space-y-4 border rounded-lg p-4'>
      <div className='flex items-center justify-between'>
        <h4 className='font-medium'>Subdivision Configuration</h4>
        <Badge variant='outline'>
          {sectionStudents?.length || 0} Students Total
        </Badge>
      </div>

      {/* Number of Groups */}
      <div className='space-y-2'>
        <Label>Number of Groups</Label>
        <Select value={groupCount.toString()} onValueChange={(v) => onGroupCountChange(parseInt(v))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='2'>2 Groups</SelectItem>
            <SelectItem value='3'>3 Groups</SelectItem>
            <SelectItem value='4'>4 Groups</SelectItem>
            <SelectItem value='5'>5 Groups</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Auto Distribute Button */}
      <Button
        variant='outline'
        onClick={handleAutoDistribute}
        className='w-full'
      >
        <Shuffle className='h-4 w-4 mr-2' />
        Auto-Distribute Students Evenly
      </Button>

      {/* Groups Configuration */}
      <div className='space-y-4'>
        {groups.map((group, index) => (
          <SubdivisionGroupCard
            key={index}
            groupNumber={index + 1}
            group={group}
            availableStaff={availableStaff}
            availableStudents={sectionStudents}
            onGroupChange={(updated) => updateGroup(index, updated)}
          />
        ))}
      </div>

      {/* Validation Messages */}
      <SubdivisionValidationDisplay
        sectionStudents={sectionStudents}
        groups={groups}
      />
    </div>
  );
}
```

#### 2.3 Create Subdivision Group Card

**File**: `app/(routes)/academic/timetables/[id]/_components/subdivision-group-card.tsx`

```tsx
export function SubdivisionGroupCard({
  groupNumber,
  group,
  availableStaff,
  availableStudents,
  onGroupChange
}: SubdivisionGroupCardProps) {
  return (
    <Card className='border-l-4 border-l-blue-500'>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-base'>
            Group {groupNumber}
          </CardTitle>
          <Badge variant='secondary'>
            {group.student_ids?.length || 0} Students
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        {/* Group Name */}
        <div className='space-y-2'>
          <Label>Group Name</Label>
          <Input
            value={group.group_name || ''}
            onChange={(e) => onGroupChange({ ...group, group_name: e.target.value })}
            placeholder={`e.g., Group ${groupNumber} - Lab ${groupNumber}`}
          />
        </div>

        {/* Staff Assignment */}
        <div className='space-y-2'>
          <Label>Assigned Staff</Label>
          <MultiSelect
            options={availableStaff}
            selected={group.staff_ids || []}
            onChange={(staffIds) => onGroupChange({ ...group, staff_ids: staffIds })}
            placeholder='Select staff for this group'
          />
        </div>

        {/* Lab Room (Optional) */}
        <div className='space-y-2'>
          <Label>Lab/Room (Optional)</Label>
          <Input
            value={group.lab_room || ''}
            onChange={(e) => onGroupChange({ ...group, lab_room: e.target.value })}
            placeholder='e.g., Laboratory Room 1'
          />
        </div>

        {/* Student Assignment */}
        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <Label>Students</Label>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => openStudentSelector(groupNumber)}
            >
              <Users className='h-4 w-4 mr-1' />
              Manage Students
            </Button>
          </div>
          <div className='text-sm text-gray-600'>
            {group.student_ids?.length || 0} students assigned
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

#### 2.4 Update Timetable Grid Display

**File**: `app/(routes)/academic/timetables/[id]/_components/timetable-grid.tsx`

Add visual indicator for subdivided slots:

```tsx
// Helper function to render subdivided slot content
const renderSubdividedSlot = (slot: any) => (
  <div className='text-green-700 min-h-[70px] flex flex-col text-center'>
    <div className='font-semibold text-xs mb-1 leading-tight flex items-center justify-center gap-1'>
      <Users className='h-3 w-3' />
      {slot.course?.course_code || 'Course'}
    </div>
    <Badge variant='outline' className='text-xs bg-green-50 text-green-700 border-green-200 mb-1'>
      {slot.sub_slots?.length || 0} Groups
    </Badge>
    {slot.sub_slots && slot.sub_slots.length > 0 && (
      <div className='flex-1 flex flex-col space-y-1 text-xs'>
        {slot.sub_slots.map((subSlot: any, idx: number) => (
          <div
            key={`subSlot-${subSlot.sub_slot_order || idx}`}
            className='flex items-center justify-center gap-1 text-xs'
          >
            <Badge variant='outline' className='text-xs'>
              {subSlot.group_name || `Group ${idx + 1}`}
            </Badge>
            <span className='text-gray-500'>
              ({subSlot.student_ids?.length || 0})
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
);

// In the slot rendering logic
{slot.is_subdivided
  ? renderSubdividedSlot(slot)
  : slot.is_combined
  ? renderCombinedSlot(slot)
  : renderRegularSlot(slot)}
```

### Phase 3: Attendance Module Updates (Week 3)

#### 3.1 Update Attendance Marking Page

**File**: `app/(routes)/academic/attendance/_components/attendance-marking-grid.tsx`

Detect subdivided slots and show group-based attendance:

```tsx
export function AttendanceMarkingGrid({
  timetableSlot,
  students,
  onAttendanceChange
}: AttendanceMarkingGridProps) {
  const isSubdivided = timetableSlot.is_subdivided;

  if (isSubdivided && timetableSlot.sub_slots) {
    return (
      <SubdividedAttendanceGrid
        slot={timetableSlot}
        onAttendanceChange={onAttendanceChange}
      />
    );
  }

  // Regular attendance grid
  return <RegularAttendanceGrid ... />;
}
```

#### 3.2 Create Subdivided Attendance Grid

**File**: `app/(routes)/academic/attendance/_components/subdivided-attendance-grid.tsx`

```tsx
export function SubdividedAttendanceGrid({
  slot,
  onAttendanceChange
}: SubdividedAttendanceGridProps) {
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const groups = slot.sub_slots || [];
  const activeGroup = groups[activeGroupIndex];

  return (
    <div className='space-y-4'>
      {/* Group Tabs */}
      <div className='flex items-center gap-2 border-b'>
        {groups.map((group, index) => (
          <Button
            key={index}
            variant={activeGroupIndex === index ? 'default' : 'ghost'}
            onClick={() => setActiveGroupIndex(index)}
            className='rounded-b-none'
          >
            <Users className='h-4 w-4 mr-2' />
            {group.group_name || `Group ${index + 1}`}
            <Badge variant='secondary' className='ml-2'>
              {group.student_ids?.length || 0}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Active Group Info */}
      <Alert className='bg-blue-50 border-blue-200'>
        <Info className='h-4 w-4 text-blue-600' />
        <AlertDescription className='text-sm'>
          <div className='font-medium mb-1'>
            {activeGroup.group_name || `Group ${activeGroupIndex + 1}`}
          </div>
          <div className='text-xs text-gray-600'>
            Staff: {activeGroup.staff_names || 'Not assigned'}
            {activeGroup.lab_room && ` • Room: ${activeGroup.lab_room}`}
          </div>
        </AlertDescription>
      </Alert>

      {/* Attendance Grid for Active Group */}
      <GroupAttendanceTable
        groupIndex={activeGroupIndex}
        group={activeGroup}
        onAttendanceChange={(studentId, status) =>
          onAttendanceChange(activeGroupIndex, studentId, status)
        }
      />

      {/* Quick Actions for Active Group */}
      <div className='flex gap-2'>
        <Button
          variant='outline'
          onClick={() => markAllForGroup(activeGroupIndex, 'Present')}
          className='flex-1'
        >
          <Check className='h-4 w-4 mr-2' />
          Mark All Present
        </Button>
        <Button
          variant='outline'
          onClick={() => markAllForGroup(activeGroupIndex, 'Absent')}
          className='flex-1'
        >
          <X className='h-4 w-4 mr-2' />
          Mark All Absent
        </Button>
      </div>
    </div>
  );
}
```

### Phase 4: Service Layer Updates (Week 3)

#### 4.1 Update Timetable Service

**File**: `lib/services/academic/timetable-service.ts`

Add validation for subdivided slots:

```typescript
static async updateTimetableSlot(
  timetableId: string,
  day: string,
  periodId: string,
  slotData: any,
  isBatch: boolean = false,
  suppressToast: boolean = false
): Promise<any> {
  try {
    // NEW: Validate subdivision if present
    if (slotData.is_subdivided && slotData.sub_slots) {
      const validation = await this.validateSubdivisionSlot(
        timetableId,
        slotData
      );

      if (!validation.isValid) {
        throw new Error(validation.message);
      }
    }

    // ... rest of the update logic
  } catch (error) {
    console.error('Error in updateTimetableSlot:', error);
    throw error;
  }
}

static async validateSubdivisionSlot(
  timetableId: string,
  slotData: any
): Promise<ValidationResult> {
  // Get section students
  const { data: timetable } = await this.supabase
    .from('timetables')
    .select('section_id, sections(id)')
    .eq('id', timetableId)
    .single();

  if (!timetable?.section_id) {
    return {
      isValid: false,
      message: 'Section-level timetable required for subdivision'
    };
  }

  // Get all students in the section
  const { data: students } = await this.supabase
    .from('students')
    .select('id')
    .eq('section_id', timetable.section_id)
    .eq('status', 'active');

  const sectionStudents = students?.map(s => s.id) || [];

  // Validate student assignment
  return SubdivisionValidator.validateStudentAssignment(
    timetable.section_id,
    sectionStudents,
    slotData.sub_slots
  );
}
```

#### 4.2 Update Attendance Service

**File**: `lib/services/academic/attendance-service.ts`

Add methods for subdivided attendance:

```typescript
static async markSubdividedAttendance(
  timetableId: string,
  periodId: string,
  date: string,
  groupAttendance: GroupAttendanceData[]
): Promise<void> {
  try {
    // Structure attendance data for subdivided slot
    const attendanceData = {
      [periodId]: {
        is_subdivided: true,
        course_id: groupAttendance[0].course_id,
        section_ids: [groupAttendance[0].section_id],
        sub_groups: groupAttendance.map(group => ({
          sub_slot_order: group.groupIndex + 1,
          group_name: group.groupName,
          staff_ids: group.staffIds,
          lab_room: group.labRoom,
          students: group.students.map(student => ({
            student_id: student.student_id,
            section_id: group.section_id,
            subdivision_group: group.groupIndex + 1,
            status: student.status,
            marked_at: new Date().toISOString(),
            marked_by: group.markedBy
          }))
        })),
        marked_by_details: {
          marker_ids: [...new Set(groupAttendance.map(g => g.markedBy))],
          marked_at: new Date().toISOString()
        }
      }
    };

    // Save to student_attendance table
    await this.upsertAttendance({
      timetable_id: timetableId,
      attendance_date: date,
      attendance_data: attendanceData,
      section_id: groupAttendance[0].section_id,
      section_ids: [groupAttendance[0].section_id]
    });
  } catch (error) {
    console.error('Error marking subdivided attendance:', error);
    throw error;
  }
}
```

### Phase 5: Testing & Validation (Week 4)

#### 5.1 Unit Tests

Create test files:
- `__tests__/subdivision-validator.test.ts`
- `__tests__/subdivided-attendance.test.ts`

#### 5.2 Integration Tests

Test scenarios:
1. Create subdivided slot with 3 groups
2. Auto-distribute 100 students into 3 groups (30, 30, 40)
3. Manually assign students to groups
4. Mark attendance for each group separately
5. Verify attendance report shows correct group information
6. Test locking behavior after attendance is marked
7. Test with combined class (ensure no conflicts)

#### 5.3 UI/UX Testing

- Mobile responsiveness
- Group tab navigation
- Student assignment interface
- Validation error messages
- Loading states

---

## Database Schema

### No Schema Changes Required

The current JSONB structure in `timetables.timetable_data` and `student_attendance.attendance_data` can accommodate all new fields without schema migrations.

### Optional: Add Indexes for Performance

If subdivision becomes heavily used:

```sql
-- Index for faster subdivision queries
CREATE INDEX idx_timetable_data_subdivided
ON timetables ((timetable_data->>'is_subdivided'))
WHERE (timetable_data->>'is_subdivided')::boolean = true;

-- Index for attendance subdivision queries
CREATE INDEX idx_attendance_data_subdivided
ON student_attendance ((attendance_data->>'is_subdivided'))
WHERE (attendance_data->>'is_subdivided')::boolean = true;
```

---

## UI/UX Changes

### Slot Dialog Enhancements

**Before**:
```
[ ] Combined Class (Split period into 2 sub-slots)
```

**After**:
```
[ ] Combined Class (Split period into 2 sub-slots)
[ ] Section Subdivision (Split students into groups) 🆕
```

### Timetable Grid Visual Updates

**Regular Slot**:
```
┌─────────────────┐
│  COURSE_CODE    │
│  Staff Name     │
│  Section A      │
└─────────────────┘
```

**Subdivided Slot**:
```
┌─────────────────┐
│ 👥 COURSE_CODE  │
│   [3 Groups]    │
│ Group A (30)    │
│ Group B (30)    │
│ Group C (40)    │
└─────────────────┘
```

### Attendance Marking Interface

**Regular Attendance**:
- Single table with all students
- Mark all present/absent buttons

**Subdivided Attendance**:
- Tab-based interface for each group
- Separate "Mark All" buttons per group
- Group information displayed prominently
- Visual indicators for which group is active

---

## Testing Strategy

### Manual Testing Checklist

- [ ] Create new subdivided slot
- [ ] Auto-distribute students (2, 3, 4, 5 groups)
- [ ] Manually assign students to groups
- [ ] Validation: Duplicate student assignment
- [ ] Validation: Missing student assignment
- [ ] Validation: Empty groups
- [ ] Edit existing subdivided slot
- [ ] Delete subdivided slot
- [ ] Mark attendance for Group 1
- [ ] Mark attendance for Group 2
- [ ] Mark attendance for Group 3
- [ ] View attendance report with groups
- [ ] Export attendance with group info
- [ ] Locking after attendance marked
- [ ] Permission checks (only assigned staff can mark)
- [ ] Mobile responsiveness

### Automated Testing

```typescript
describe('Subdivision Feature', () => {
  it('should auto-distribute students evenly', () => {
    const students = Array.from({ length: 100 }, (_, i) => `student-${i}`);
    const groups = SubdivisionValidator.autoDistributeStudents(students, 3);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveLength(34);  // 100 / 3 = 33.33, so 34, 33, 33
    expect(groups[1]).toHaveLength(33);
    expect(groups[2]).toHaveLength(33);
  });

  it('should detect duplicate student assignments', () => {
    const validation = SubdivisionValidator.validateStudentAssignment(
      'section-1',
      ['s1', 's2', 's3'],
      [
        { student_ids: ['s1', 's2'] },
        { student_ids: ['s2', 's3'] }  // s2 is duplicate
      ]
    );

    expect(validation.isValid).toBe(false);
    expect(validation.duplicates).toContain('s2');
  });

  it('should detect missing student assignments', () => {
    const validation = SubdivisionValidator.validateStudentAssignment(
      'section-1',
      ['s1', 's2', 's3'],
      [
        { student_ids: ['s1'] },
        { student_ids: ['s2'] }
        // s3 is missing
      ]
    );

    expect(validation.isValid).toBe(false);
    expect(validation.missing).toContain('s3');
  });
});
```

---

## Migration Strategy

### Phase 1: Feature Flag (Optional)

Add institution-level feature flag:

```sql
-- Add feature flag to institutions table
ALTER TABLE institutions
ADD COLUMN IF NOT EXISTS enable_section_subdivision BOOLEAN DEFAULT false;

-- Enable for specific institutions
UPDATE institutions
SET enable_section_subdivision = true
WHERE id = 'pharmacy-college-id';
```

### Phase 2: Gradual Rollout

1. **Week 1-2**: Deploy to staging environment
2. **Week 3**: Beta test with pharmacy college
3. **Week 4**: Collect feedback and iterate
4. **Week 5**: Production rollout with feature flag disabled by default
5. **Week 6+**: Enable for institutions that request it

### Phase 3: Documentation

Create user documentation:
- How to create subdivided slots
- Best practices for student grouping
- Attendance marking workflow
- Reporting with subdivided data

---

## Future Enhancements

### Phase 6: Advanced Features (Future)

1. **Template-Based Grouping**
   - Save subdivision configurations as templates
   - Reuse groupings across multiple periods/days
   - Example: "Lab Group Configuration 1" can be applied to all lab periods

2. **Drag-and-Drop Student Assignment**
   - Visual interface to drag students between groups
   - Real-time validation and capacity indicators
   - Bulk move operations

3. **Smart Auto-Distribution**
   - Distribute based on student performance
   - Balance groups by gender/category
   - Consider student preferences

4. **Rotation Scheduling**
   - Automatically rotate students between groups over weeks
   - Example: Week 1 - Group A, Week 2 - Group B, Week 3 - Group C

5. **Resource Management**
   - Link lab equipment/resources to groups
   - Track resource availability
   - Prevent over-allocation

6. **Advanced Reporting**
   - Group-wise performance analytics
   - Staff workload distribution
   - Lab utilization reports

---

## Conclusion

This implementation plan provides a comprehensive solution for the practical class subdivision requirement while:

1. ✅ Maintaining backward compatibility
2. ✅ Reusing existing infrastructure (sub_slots)
3. ✅ Requiring minimal database changes
4. ✅ Providing clear separation from "Combined Classes" feature
5. ✅ Supporting flexible group configurations
6. ✅ Enabling separate attendance tracking
7. ✅ Preserving students' permanent section assignments

The phased approach allows for iterative development and testing, ensuring a stable rollout to production.

---

**Next Steps**: Review this plan with stakeholders and begin Phase 1 implementation.
