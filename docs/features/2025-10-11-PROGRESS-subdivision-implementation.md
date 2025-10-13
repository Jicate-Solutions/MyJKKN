# Section Subdivision Implementation Progress
**Date:** 2025-10-11
**Feature:** Practical Class Section Subdivision for Pharmacy Colleges
**Status:** Phase 1 & 2 Complete, Phase 3 & 4 Pending

---

## Overview
Implementation of section subdivision feature that allows splitting a section (e.g., 100 students) into multiple groups for practical/lab sessions. Students' permanent `section_id` remains unchanged - grouping is temporary for specific periods only.

### Use Case Example
- **Section A**: 100 students
- **Regular Periods (1-4)**: All 100 students attend together
- **Period 5 (Practical)**: Split into 3 groups:
  - Group A: 30 students + Staff A in Lab 1
  - Group B: 30 students + Staff B in Lab 2
  - Group C: 40 students + Staff C in Lab 3

---

## ✅ COMPLETED PHASES

### Phase 1: Type Definitions & Utilities (COMPLETE)

#### 1.1 TypeScript Types (`types/academics.ts`)
**Location:** `types/academics.ts:305-444`

**Added Types:**
```typescript
// Core subdivision types
export type SubdivisionType = 'practical' | 'lab' | 'tutorial' | 'workshop';
export type SubdivisionMode = 'manual' | 'auto';

// Extended SubSlot interface with subdivision support
export interface SubSlot {
  // ... existing fields ...

  // NEW: Section Subdivision fields
  group_name?: string;           // e.g., "Group A - Lab 1"
  student_ids?: string[];         // Array of specific student UUIDs
  lab_room?: string;              // Optional room/location
  max_capacity?: number;          // Optional maximum capacity
}

// Enhanced TimetableSlot interface
export interface TimetableSlot {
  // ... existing fields ...

  // NEW: Section subdivision flags
  is_subdivided?: boolean;
  subdivision_type?: SubdivisionType;
  subdivision_mode?: SubdivisionMode;
}

// Helper interfaces for UI components
export interface SubdivisionGroup { ... }
export interface SubdivisionConfig { ... }
export interface SubdivisionValidationResult { ... }
```

#### 1.2 Validation Utilities (`lib/utils/subdivision-validation.ts`)
**Location:** `lib/utils/subdivision-validation.ts`

**Core Functions:**
- `validateSubdivisionAssignments()` - Ensures all students assigned to exactly one group
- `autoDistributeStudents()` - Round-robin even distribution
- `createDefaultSubdivisionGroups()` - Creates complete group structure
- `validateGroup()` / `validateAllGroups()` - Individual and bulk validation
- `findConflictingStudents()` / `resolveStudentConflict()` - Conflict resolution
- `calculateDistributionStats()` - Analytics (avg, range, balance)
- `rebalanceGroups()` - Redistributes students to achieve even balance

---

### Phase 2: UI Components (COMPLETE)

#### 2.1 Slot Dialog Updates (`slot-dialog.tsx`)
**Location:** `app/(routes)/academic/timetables/[id]/_components/slot-dialog.tsx`

**Changes Made:**
1. **Imports**: Added `SubdivisionType`, `SubdivisionMode` imports
2. **State Management**: Added subdivision state variables:
   ```typescript
   const [isSubdivided, setIsSubdivided] = useState(false);
   const [subdivisionType, setSubdivisionType] = useState<SubdivisionType>('practical');
   const [subdivisionMode, setSubdivisionMode] = useState<SubdivisionMode>('auto');
   ```
3. **UI Elements**:
   - "Section Subdivision" checkbox (only shown for section-level timetables)
   - Subdivision type selector (practical/lab/tutorial/workshop)
   - Student assignment mode radio buttons (auto/manual)
   - Mutual exclusion with "Combined Class" feature
4. **Save Logic**: Includes `is_subdivided`, `subdivision_type`, `subdivision_mode` in slot data
5. **Edit Logic**: Populates subdivision state when editing existing subdivided slots

#### 2.2 Subdivision Config Dialog (`subdivision-config-dialog.tsx`)
**Location:** `app/(routes)/academic/timetables/[id]/_components/subdivision-config-dialog.tsx`

**Features:**
- **Group Count Management**: Adjustable 2-10 groups with +/- buttons
- **Real-time Validation**: Uses validation utilities to check assignments
- **Distribution Statistics**: Shows avg per group, range, balance status
- **Rebalance Function**: Auto-redistribute students evenly (manual mode)
- **Validation Alerts**: Shows duplicate assignments, missing students, warnings
- **Group Cards**: Renders individual `SubdivisionGroupCard` components

**Props:**
```typescript
interface SubdivisionConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: SubdivisionConfig) => void;
  sectionId: string;
  courseId: string;
  subdivisionType: SubdivisionType;
  subdivisionMode: SubdivisionMode;
  allStudents: Array<{ id, first_name, last_name, roll_number }>;
  availableStaff: Array<{ id, first_name, last_name, staff_id }>;
  existingConfig?: SubdivisionConfig;
}
```

#### 2.3 Subdivision Group Card (`subdivision-group-card.tsx`)
**Location:** `app/(routes)/academic/timetables/[id]/_components/subdivision-group-card.tsx`

**Features:**
- **Editable Group Details**: Group name, lab room, max capacity
- **Staff Assignment**: Multi-select checkboxes for staff members
- **Student List**: Collapsible student roster with assign/unassign
- **Auto vs Manual Mode**: Read-only in auto mode, editable in manual
- **Capacity Warnings**: Shows alert when group exceeds max capacity
- **Student Search**: Filter assigned vs unassigned students

**UI Elements:**
- Group name input
- Lab room & capacity inputs
- Staff selection checkboxes
- Collapsible student list with badges
- "Select All" / "Clear All" / "Show All Students" buttons

#### 2.4 Timetable Grid Display (`timetable-grid.tsx`)
**Location:** `app/(routes)/academic/timetables/[id]/_components/timetable-grid.tsx`

**Changes Made:**
1. **Imports**: Added `Users` icon from lucide-react
2. **New Renderer**: Created `renderSubdividedSlot()` function:
   ```typescript
   const renderSubdividedSlot = (slot: any) => (
     <div className='text-purple-700 min-h-[60px] flex flex-col text-center'>
       <div className='flex items-center justify-center gap-1 mb-1'>
         <Users className='h-3 w-3' />
         <div className='font-semibold text-xs'>{subdivisionTypeLabel}</div>
       </div>
       <Badge>{groupCount} Groups</Badge>
       <div>{slot.course?.course_code}</div>
       <div>{slot.staff_members.length} staff</div>
     </div>
   );
   ```
3. **Visual Styling**: Purple background/border for subdivided slots (similar to combined)
4. **Rendering Logic**: Added check for `slot.is_subdivided` in rendering chain

**Display Format:**
```
┌────────────────────┐
│  👥 Practical      │
│  3 Groups          │
│  PHM301            │
│  3 staff           │
└────────────────────┘
```

---

## 🔄 PENDING PHASES

### Phase 3: Attendance Integration (✅ COMPLETE)

#### 3.1 Update Attendance Marking Grid (✅ COMPLETE)
**File Modified:** `app/(routes)/academic/attendance/mark/page.tsx`

**Changes Completed (2025-10-11):**
1. ✅ **Added Imports** (Lines 47-51): SubdividedAttendanceGrid and SubdivisionGroup type
2. ✅ **State Variables** (Lines 98-101): isSubdividedSlot, subdivisionGroups, subdivisionType
3. ✅ **Subdivision Detection** (Lines 408-435): Detects subdivided slots in context loading
4. ✅ **Conditional Rendering** (Lines 2007-2087): Shows SubdividedAttendanceGrid for subdivided slots
5. ✅ **Save Logic** (Lines 1248-1305): Preserves group structure in attendance data
6. ✅ **Info Alert** (Lines 1875-1884): Shows subdivision info when marking attendance

**Approach Taken:**
- Option B: Created separate `SubdividedAttendanceGrid` component ✅

#### 3.2 Create Subdivided Attendance Grid Component (✅ COMPLETE)
**File:** `app/(routes)/academic/attendance/mark/_components/subdivided-attendance-grid.tsx`

**Features Implemented:**
- ✅ Display students grouped by subdivision groups
- ✅ Show group details (name, lab room, staff, capacity)
- ✅ Allow marking attendance per group with visual indicators
- ✅ Support bulk actions per group (Mark All Present/Absent)
- ✅ Show statistics per group and overall with percentage
- ✅ Group-wise and overall attendance summary cards
- ✅ Search filtering within groups
- ✅ Read-only mode support
- ✅ Capacity warnings for groups exceeding max capacity
- ✅ Responsive grid layout with color-coded status

**Component Props:**
```tsx
interface SubdividedAttendanceGridProps {
  groups: SubdivisionGroupData[];
  allStudents: SubdividedStudent[];
  availableStaff: StaffMember[];
  attendanceData: Record<string, 'Present' | 'Absent'>;
  onAttendanceChange: (studentId: string, status: 'Present' | 'Absent') => void;
  onMarkAllGroupPresent: (groupOrder: number) => void;
  onMarkAllGroupAbsent: (groupOrder: number) => void;
  readOnly?: boolean;
  searchTerm?: string;
  subdivisionType?: string;
}
```

---

### Phase 4: Service Layer Integration (✅ COMPLETE)

#### 4.1 Update Timetable Service (COMPLETE)
**File:** `lib/services/academic/timetable-service.ts`

**Changes Completed:**
1. ✅ **Added Helper Method** (Lines 1419-1462): `formatSubdivisionDataForSlot()`
   - Converts subdivision config to sub_slots format
   - Adds `student_ids`, `group_name`, `lab_room`, `max_capacity` fields
   - Sets `is_subdivided: true` and preserves subdivision metadata
2. ✅ **Updated `updateTimetableSlot`**: Added logging for subdivision data
3. ✅ **Integrated into Timetable Page** (`app/(routes)/academic/timetables/[id]/page.tsx`):
   - Added state for subdivision config dialog
   - Modified `saveSlot` function to detect subdivided slots
   - Fetches students from section using StudentService
   - Shows SubdivisionConfigDialog after slot dialog
   - Created `handleSubdivisionConfigSave` to format and save subdivision data
   - Renders SubdivisionConfigDialog component in JSX
4. ✅ **Edit Existing Subdivided Slots**:
   - Modified `openSlotDialog` to detect existing subdivided slots
   - Automatically opens subdivision config dialog for editing
   - Reconstructs `SubdivisionConfig` from existing `sub_slots` data
   - Fetches students and pre-populates all group information
   - Handles both creating new and editing existing subdivisions

**Data Structure in Timetable:**
```json
{
  "MONDAY": {
    "period-uuid-1": {
      "slot_id": "slot-uuid-1",
      "course_id": "course-uuid",
      "staff_ids": ["staff-1", "staff-2", "staff-3"],
      "section_ids": ["section-A-uuid"],
      "is_combined": false,
      "is_subdivided": true,
      "subdivision_type": "practical",
      "subdivision_mode": "auto",
      "sub_slots": [
        {
          "sub_slot_order": 1,
          "group_name": "Group A - Lab 1",
          "course_id": "course-uuid",
          "staff_ids": ["staff-1"],
          "section_ids": ["section-A-uuid"],
          "student_ids": ["student-1", "student-2", ..., "student-30"],
          "lab_room": "Laboratory Room 1",
          "max_capacity": 30,
          "is_break_slot": false
        },
        {
          "sub_slot_order": 2,
          "group_name": "Group B - Lab 2",
          "course_id": "course-uuid",
          "staff_ids": ["staff-2"],
          "section_ids": ["section-A-uuid"],
          "student_ids": ["student-31", ..., "student-60"],
          "lab_room": "Laboratory Room 2",
          "max_capacity": 30,
          "is_break_slot": false
        },
        {
          "sub_slot_order": 3,
          "group_name": "Group C - Lab 3",
          "course_id": "course-uuid",
          "staff_ids": ["staff-3"],
          "section_ids": ["section-A-uuid"],
          "student_ids": ["student-61", ..., "student-100"],
          "lab_room": "Laboratory Room 3",
          "max_capacity": 40,
          "is_break_slot": false
        }
      ]
    }
  }
}
```

#### 4.2 Attendance Service (✅ NO CHANGES NEEDED)
**File:** `lib/services/academic/attendance-service.ts`

**Status:** The existing AttendanceService already supports all needed functionality:
- ✅ Saves attendance data as JSONB (supports any structure including groups)
- ✅ Loads attendance data and returns full JSONB payload
- ✅ No service layer changes required for subdivision support

**Implementation:**
- All subdivision logic handled at the UI layer (attendance mark page)
- Attendance data structure extended to include `is_subdivided` and `groups` fields
- Service layer remains agnostic to data structure (JSONB flexibility)

**Attendance Data Structure:**
```json
{
  "period-uuid-1": {
    "period_id": "period-uuid-1",
    "period_name": "Period 5",
    "course_id": "course-uuid",
    "is_subdivided": true,
    "subdivision_type": "practical",
    "groups": [
      {
        "group_name": "Group A - Lab 1",
        "staff_ids": ["staff-1"],
        "lab_room": "Laboratory Room 1",
        "students": [
          {
            "student_id": "student-1",
            "section_id": "section-A-uuid",
            "status": "Present",
            "marked_at": "2025-10-11T10:30:00Z"
          },
          // ... 29 more students
        ]
      },
      // Groups B and C...
    ]
  }
}
```

---

## 📋 INTEGRATION CHECKLIST

### Backend/Service Layer
- [x] Timetable service: Save subdivision config to `timetable_data` JSONB
- [x] Timetable service: Load and populate subdivision data
- [x] Timetable service: Update existing subdivided slots
- [x] Attendance service: Detect subdivided slots (handled in UI layer)
- [x] Attendance service: Group students by subdivision groups (handled in UI layer)
- [x] Attendance service: Save group-wise attendance data (JSONB supports it)
- [x] Attendance service: Load and reconstruct group structure (handled in UI layer)
- [ ] Server-side validation for subdivision assignments (future enhancement)

### Frontend Integration
- [x] Connect subdivision config dialog to timetable page
- [x] Show config dialog automatically after enabling subdivision
- [x] Load existing subdivision config when editing
- [x] Create subdivided attendance grid component
- [x] Update attendance marking page to detect subdivided slots
- [x] Show subdivided attendance grid for subdivided periods
- [x] Handle group-wise attendance marking
- [x] Handle attendance submission for subdivided slots with group data
- [ ] Update attendance reports to show group-wise data (future enhancement)

### Testing
- [ ] Test auto-distribution with various student counts
- [ ] Test manual assignment and conflict resolution
- [ ] Test saving and loading subdivided timetables
- [ ] Test marking attendance for subdivided slots
- [ ] Test editing existing subdivision configs
- [ ] Test attendance reports with group data
- [ ] Test with different subdivision types (practical/lab/tutorial/workshop)
- [ ] Test capacity warnings and validation
- [ ] Test with extreme cases (2 groups, 10 groups, uneven distributions)

### Documentation
- [ ] User guide for creating subdivided slots
- [ ] User guide for marking attendance with groups
- [ ] API documentation for subdivision data structures
- [ ] Database schema documentation (JSONB structure)
- [ ] Migration guide for existing institutions

---

## 🎯 IMPLEMENTATION STATUS: ✅ COMPLETE

### ✅ All Core Features Implemented (2025-10-11)
- ✅ Phase 1: Type Definitions & Utilities
- ✅ Phase 2: UI Components
- ✅ Phase 3: Attendance Integration
- ✅ Phase 4: Service Layer Integration

### 🧪 NEXT STEPS: Testing & Enhancements

#### Immediate Priority
1. **End-to-End Testing**: Test the complete workflow from timetable creation to attendance marking
2. **Data Verification**: Verify subdivision data structure in database
3. **Edge Cases**: Test with 2 groups, 10 groups, and uneven distributions
4. **Loading Existing**: Test loading and editing existing subdivided attendance

### Workflow
1. User enables "Section Subdivision" in slot dialog
2. User clicks "Save" → Show subdivision config dialog
3. User configures groups (auto or manual)
4. User saves → Timetable service stores subdivision data
5. Slot appears in grid with purple badge showing "N Groups"
6. When marking attendance → Detect subdivision → Show group-based grid
7. Mark attendance per group → Save with group structure
8. Reports show attendance breakdown by group

---

## 📊 IMPLEMENTATION EFFORT

- **Total Implementation Time**: ~12-16 hours
  - Phase 1: 2-3 hours (types + utilities) ✅
  - Phase 2: 4-6 hours (UI components) ✅
  - Phase 3: 3-4 hours (attendance integration) ✅
  - Phase 4: 2-3 hours (service layer) ✅
  - Documentation: 1 hour ✅
- **Remaining Work**: Testing & Future Enhancements
  - Manual testing: 2-3 hours
  - Attendance reports integration: 2-3 hours (future)

---

## 🔑 KEY DESIGN DECISIONS

1. **No Database Schema Changes**: All subdivision data stored in existing JSONB fields
2. **Permanent Section Unchanged**: Students' `section_id` in `students` table never modified
3. **Reuse Sub-slots Structure**: Extend existing combined classes infrastructure
4. **Auto vs Manual**: Two modes for different institution needs
5. **Validation First**: Comprehensive validation before saving
6. **Backward Compatible**: Non-subdivided slots continue to work as before
7. **Optional Feature**: Only shown for section-level timetables
8. **Per-Period Grouping**: Temporary grouping for specific periods only

---

## 📝 NOTES

- All code changes include "Updated: 2025-10-11" comments for traceability
- Purple theme used consistently for subdivision UI (vs blue for regular, orange for breaks)
- Maximum 10 groups allowed (can be adjusted if needed)
- Subdivision only available for section-level timetables (not semester-level)
- Staff can be assigned to multiple groups simultaneously
- Attendance data structure preserves group information for reporting

---

**Last Updated:** 2025-10-11
**Implementation Status:** ✅ COMPLETE - Ready for Testing
**Next Review:** After integration testing
