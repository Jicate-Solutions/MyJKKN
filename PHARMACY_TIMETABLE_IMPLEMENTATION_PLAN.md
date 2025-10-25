# 📋 Pharmacy College Timetable & Attendance - Implementation Plan

**Created:** 2025-10-25
**Updated:** 2025-10-25 (CRITICAL REVISION)
**Project:** MyJKKN Academic Management System
**Module:** Academic Timetables & Attendance
**Type:** Enhancement (Not a separate module)

---

## ⚠️ CRITICAL UPDATE - Dual-Mode Period System

**REVISION REASON:** Initial plan incorrectly assumed batches could be pre-assigned to labs in timetable. After user feedback, discovered that pharmacy practical labs have **ROTATING batches** that cannot be fixed in advance.

### 🔴 The Critical Distinction

**Theory Classes (STANDARD MODE):**
- ✅ Sections are FIXED in timetable
- ✅ Same students attend same course at same time always
- ✅ Original plan works perfectly for these

**Practical Labs (PRACTICAL MODE):**
- ❌ Batches ROTATE between different labs on different days
- ❌ Cannot pre-assign "Batch A always goes to Lab AG-1"
- ✅ Faculty MUST manually select which batch/lab during attendance marking
- ✅ Example: Monday → Batch A in Lab AG-1, Wednesday → Batch A in Lab BG-3

### 🎯 Revised Solution: **Dual-Mode Period Enhancement**

**Why This Approach:**
- ✅ **Zero database schema changes required** - All fields already exist
- ✅ **Backward compatible** - Existing institutions completely unaffected
- ✅ **Supports BOTH flows** - Theory (fixed) AND practical (rotating)
- ✅ **Quick implementation** - ~1-2 weeks for production-ready solution
- ✅ **Flexible** - Works for all institution types
- ✅ **Future-proof** - Extensible for other use cases

---

## 📊 Current System Analysis

### Existing Capabilities (Already Built)

| Feature | Status | Location |
|---------|--------|----------|
| Semester-level timetables | ✅ Implemented | `timetables.timetable_type = 'semester'` |
| Section-level timetables | ✅ Implemented | `timetables.timetable_type = 'section'` |
| Multiple sections support | ✅ Implemented | `student_attendance.section_ids ARRAY` |
| Sub-slots for divisions | ✅ Implemented | `timetable_data.sub_slots[]` |
| Batch/group subdivisions | ✅ Implemented | `sub_slots[].student_ids[]` |
| Multiple staff per period | ✅ Implemented | `sub_slots[].staff_ids[]` |

### Database Schema (No Changes Needed!)

```sql
-- Timetables table - ALREADY supports semester-level
timetables (
  id uuid PRIMARY KEY,
  section_id uuid NULL,  -- ✅ Nullable - allows semester-level
  timetable_type varchar,  -- ✅ 'section' or 'semester'
  timetable_data jsonb,  -- ✅ Flexible JSON structure
  periods jsonb,  -- ✅ Period configuration
  ...
)

-- Student Attendance - ALREADY supports multiple sections
student_attendance (
  id uuid PRIMARY KEY,
  timetable_id uuid,
  section_id uuid,  -- Single section (legacy)
  section_ids uuid[],  -- ✅ ARRAY - supports multiple sections!
  attendance_data jsonb,  -- ✅ Flexible attendance storage
  ...
)
```

**CRITICAL DISCOVERY:** The database schema is already 100% ready for pharmacy college requirements!

---

## 🔍 Pharmacy College Requirements

### Observed Patterns from Timetable PDFs

**Pharm.D & B.Pharm Unique Characteristics:**

1. **Batch-Based Practicals**
   - Students divided into batches (A, B, C, D) for practical sessions
   - Each batch does DIFFERENT subject at same time
   - Example: Monday 1:20 PM - 4:30 PM
     - Batch A: Pharmaceutical Organic Chemistry (AG-1) - Mrs. KKP
     - Batch B: Communication Skills (BT-8) - Mrs. SM
     - Batch C: Pharmaceutical Analysis (BS-5) - Ms. NM
     - Batch D: Pharmaceutical Inorganic Chemistry (BG-3) - Mr. RK

2. **Semester-Level Timetables**
   - Not section-specific
   - Applies to entire semester (e.g., "I Pharm.D", "II B.Pharm Sem-III")
   - Sections selected during attendance marking

3. **Lab Rotation**
   - Different batches use different labs simultaneously
   - Lab codes: AG-1, BF-12, BG-3, BS-5, BT-8, etc.

4. **Hospital Duty / Practice School**
   - Spans entire days
   - Different batches rotate through different practice areas
   - Multiple courses running in parallel

### Current System Gaps

❌ **UI Level Only:**
1. Section selection is currently mandatory in timetable creation form
2. Slot dialog doesn't support multiple courses per period
3. Attendance marking requires sectionId parameter
4. No section selector in attendance UI

✅ **Database & Service Layer:** Fully supports all requirements!

---

## 💡 Proposed Solution: "Dual-Mode Period Enhancement"

### Solution Overview

Enhance the existing period system to support **TWO distinct modes**:

#### Mode 1: **STANDARD Period** (Theory Classes - Fixed Assignment)
- Section/course/staff are FIXED in timetable
- Same configuration every time this period occurs
- Attendance simply loads pre-assigned students
- **Use for:** Theory classes, tutorials, lectures

#### Mode 2: **PRACTICAL Period** (Lab Rotations - Runtime Selection)
- Define AVAILABLE batches, labs, and courses in timetable
- Faculty SELECTS batch/lab combination at attendance time
- Different batch/lab combinations can be used each occurrence
- System tracks which combinations were used and prevents duplicates
- **Use for:** Practical labs, hospital duty, rotating sessions

### How It Works

#### For Timetable Creation - STANDARD MODE:

```
1. Create Timetable
   ├─ Select: "Semester-Level" or "Section-Level"
   └─ Applies to specified scope

2. Add Period Slot
   ├─ Period Mode: "Standard" (default)
   └─ Configuration: Fixed assignment

3. Configure Period
   ├─ Course: Fixed course
   ├─ Staff: Assigned faculty
   ├─ Sections: Pre-assigned sections
   └─ Students: Auto-loaded from sections
```

#### For Timetable Creation - PRACTICAL MODE:

```
1. Create Timetable
   ├─ Select: "Semester-Level" (typically)
   └─ Applies to entire semester

2. Add Period Slot
   ├─ Period Mode: "Practical" ⭐ NEW
   └─ Configuration: Available options (not fixed)

3. Configure Practical Period
   ├─ Define AVAILABLE Batches:
   │  ├─ Batch A (Section A + B students)
   │  ├─ Batch B (Section C students)
   │  └─ Batch C (Section D + E students)
   │
   ├─ Available Labs: AG-1, BG-3, BS-5, BT-8
   │
   ├─ Available Courses:
   │  ├─ Pharmaceutical Organic Chemistry
   │  ├─ Pharmaceutical Analysis
   │  └─ Communication Skills
   │
   └─ Rotation Type: Manual (faculty selects at runtime)
```

#### For Attendance Marking - STANDARD MODE:

```
1. Select Period → Auto-loads configuration
2. Students appear (from pre-assigned sections)
3. Mark attendance → Save
```

#### For Attendance Marking - PRACTICAL MODE:

```
1. Select Period → Shows "Practical Period" indicator
2. ⭐ BATCH/LAB SELECTOR appears (BEFORE students load)
   ├─ Select Batch: [Dropdown: Batch A, B, C, D]
   ├─ Select Lab: [Dropdown: AG-1, BG-3, BS-5, BT-8]
   ├─ Select Course: [Dropdown: Available courses]
   └─ [Conflict Check: ✓ Batch A not yet marked today]
3. Click "Load Students" → Students appear from selected batch
4. Mark attendance → Save with batch/lab/course metadata
5. System records: Batch A used Lab AG-1 for this occurrence
```

### Data Structure

#### Standard Period (Theory Classes):

```typescript
{
  timetable_type: 'semester',  // ✅ Already exists
  section_id: null,  // ✅ Already nullable
  timetable_data: {
    "MONDAY": {
      "period_123": {
        period_mode: 'standard',  // ⭐ NEW FIELD
        course_id: "course-theory-101",
        staff_ids: ["staff-id-1"],
        section_ids: ["section-a", "section-b"],  // Fixed sections
        room: "Room 301"
        // No sub_slots needed for standard periods
      }
    }
  }
}
```

#### Practical Period (Lab Rotations):

```typescript
{
  timetable_type: 'semester',
  section_id: null,
  timetable_data: {
    "MONDAY": {
      "period_456": {
        period_mode: 'practical',  // ⭐ NEW FIELD - triggers runtime selection

        practical_config: {  // ⭐ NEW STRUCTURE
          // Define AVAILABLE batches (not assigned to specific labs)
          batches: [
            {
              batch_id: "batch_a",
              batch_name: "Batch A",
              assignment_type: "section",  // Students from specific sections
              section_ids: ["section-a", "section-b"],  // Which sections form this batch
              estimated_count: 15
            },
            {
              batch_id: "batch_b",
              batch_name: "Batch B",
              assignment_type: "section",
              section_ids: ["section-c"],
              estimated_count: 12
            },
            {
              batch_id: "batch_c",
              batch_name: "Batch C",
              assignment_type: "manual",  // Faculty manually selects students
              estimated_count: 10
            }
          ],

          // Available labs (faculty selects at runtime)
          available_labs: [
            { lab_id: "AG-1", lab_name: "Analytical Chemistry Lab - AG-1", capacity: 15 },
            { lab_id: "BG-3", lab_name: "Biochemistry Lab - BG-3", capacity: 12 },
            { lab_id: "BS-5", lab_name: "Biology Lab - BS-5", capacity: 18 }
          ],

          // Available courses (faculty selects at runtime)
          available_courses: [
            { course_id: "course-1", course_name: "Pharmaceutical Organic Chemistry" },
            { course_id: "course-2", course_name: "Pharmaceutical Analysis" },
            { course_id: "course-3", course_name: "Communication Skills" }
          ],

          rotation_type: "manual",  // Faculty selects, not auto-rotated

          // Optional: Staff assignment (can be per-lab or per-course)
          staff_mapping: {
            "AG-1": ["staff-id-1"],
            "BG-3": ["staff-id-2"]
          }
        }
      }
    }
  }
}
```

#### Attendance Data - Standard Period:

```typescript
{
  timetable_id: "timetable-xxx",
  attendance_date: "2025-01-27",
  period_slot_id: "period_123",
  section_id: "section-a",
  section_ids: ["section-a", "section-b"],
  attendance_data: {
    "period_123": {
      period_mode: "standard",
      course_id: "course-theory-101",
      students: [
        { id: "s1", status: "Present", marked_at: "2025-01-27T10:30:00Z" },
        { id: "s2", status: "Absent" }
      ]
    }
  }
}
```

#### Attendance Data - Practical Period:

```typescript
{
  timetable_id: "timetable-xxx",
  attendance_date: "2025-01-27",
  period_slot_id: "period_456",
  section_id: "section-a",  // Primary section from selected batch
  section_ids: ["section-a", "section-b"],  // All sections in selected batch
  attendance_data: {
    "period_456": {
      period_mode: "practical",  // ⭐ Indicates this is practical period

      // Runtime selections made by faculty
      batch_selected: {
        batch_id: "batch_a",
        batch_name: "Batch A"
      },
      lab_selected: "AG-1",  // ⭐ Faculty selected this lab today
      course_selected: "course-1",  // ⭐ Faculty selected this course

      // Attendance records
      students: [
        { id: "s1", status: "Present", marked_at: "2025-01-27T13:20:00Z" },
        { id: "s2", status: "Absent" }
      ],

      // Metadata for validation
      marked_by: "staff-id-1",
      marked_at: "2025-01-27T13:20:00Z"
    }
  }
}
```

**Key Differences:**
- ✅ **Standard mode**: Fixed assignments in timetable, direct student loading
- ✅ **Practical mode**: Available options in timetable, runtime selection in attendance
- ✅ **JSONB fields** handle both structures with zero schema changes
- ✅ **Conflict detection**: Query attendance_data for same batch_id + date + period_slot_id

---

## 🚀 Implementation Plan

### Phase 1: Core Dual-Mode Infrastructure (4-5 days)

#### Day 1-2: Period Mode System

**Files to Modify:**

1. **`app/(routes)/academic/timetables/[id]/_components/slot-dialog.tsx`**
   - Add "Period Mode" selector: Standard | Practical
   - Show different configuration forms based on mode
   - **Standard mode**: Existing form (course, staff, sections - fixed)
   - **Practical mode**: NEW form (available batches, labs, courses)

**New Components:**

```typescript
// _components/period-mode-selector.tsx
interface PeriodModeProps {
  value: 'standard' | 'practical';
  onChange: (mode: 'standard' | 'practical') => void;
}

// _components/practical-period-config.tsx
interface PracticalConfigProps {
  batches: BatchDefinition[];
  availableLabs: LabOption[];
  availableCourses: CourseOption[];
  onUpdate: (config: PracticalConfig) => void;
}

interface BatchDefinition {
  batch_id: string;
  batch_name: string;
  assignment_type: 'section' | 'manual';
  section_ids?: string[];
  estimated_count: number;
}
```

2. **`lib/types/academic.ts`**
   - Add type definitions for dual-mode periods
   ```typescript
   type PeriodMode = 'standard' | 'practical';

   interface StandardPeriodConfig {
     period_mode: 'standard';
     course_id: string;
     staff_ids: string[];
     section_ids: string[];
     room?: string;
   }

   interface PracticalPeriodConfig {
     period_mode: 'practical';
     practical_config: {
       batches: BatchDefinition[];
       available_labs: LabOption[];
       available_courses: CourseOption[];
       rotation_type: 'manual' | 'automatic';
       staff_mapping?: Record<string, string[]>;
     };
   }

   type PeriodConfig = StandardPeriodConfig | PracticalPeriodConfig;
   ```

#### Day 3-5: Practical Attendance Selector

**Files to Modify:**

1. **`app/(routes)/academic/attendance/mark/page.tsx`**
   - Detect period mode from timetable data
   - For practical mode: Show batch/lab selector BEFORE loading students
   - Add conflict detection (prevent duplicate batch attendance)
   - Load students based on runtime selections

**New Components:**

```typescript
// _components/practical-attendance-selector.tsx
interface PracticalSelectorProps {
  practicalConfig: PracticalConfig;
  periodId: string;
  date: string;
  timetableId: string;
  onSelectionComplete: (selection: {
    batch_id: string;
    lab_id: string;
    course_id: string;
    section_ids: string[];
  }) => void;
}

// Features:
// - Dropdown for batch selection
// - Dropdown for lab selection
// - Dropdown for course selection
// - Conflict check warning (if batch already marked today)
// - "Load Students" button (enabled after all selections made)
```

2. **`lib/services/academic/attendance-service.ts`**
   - Add `checkPracticalConflict()` method
   ```typescript
   static async checkPracticalConflict(params: {
     timetable_id: string;
     period_slot_id: string;
     batch_id: string;
     date: string;
   }): Promise<{
     hasConflict: boolean;
     existingRecord?: AttendanceRecord;
   }>;
   ```

   - Update `validateStaffAssignment()` to handle practical periods
   - Add `loadStudentsByBatch()` method for runtime batch loading

### Phase 2: UX Polish & Validation (2-3 days)

#### Day 6-7: Enhanced UI/UX

1. **Visual Indicators**
   - **Standard periods**: Show course/section badges (existing behavior)
   - **Practical periods**: Show "🔬 Practical Period" badge with available options count
   - Color-coded mode indicators in timetable grid

2. **Attendance Page Enhancements**
   - Clear mode indicator: "Standard Period" vs "Practical Period"
   - For practical mode:
     - Prominent batch/lab selector card
     - Live conflict checking (shows green checkmark if available, red warning if already marked)
     - Rotation history: "Batch A - Last marked in Lab BG-3 on Jan 25"
     - Quick stats: "2 of 4 batches marked for this period today"

3. **Validation & Error Handling**
   - Prevent saving practical attendance without batch/lab/course selection
   - Block duplicate batch attendance for same period/date
   - Warn if lab capacity exceeded
   - Validate at least one batch configured for practical periods

#### Day 8: Testing & Conflict Detection

1. **Testing Scenarios**

   **Standard Mode (Existing Flow):**
   - [x] Create timetable with standard periods
   - [x] Mark attendance normally
   - [x] Verify no regression

   **Practical Mode (New Flow):**
   - [ ] Create timetable with practical periods
   - [ ] Configure 4 batches with available labs
   - [ ] Mark attendance for Batch A in Lab AG-1
   - [ ] Try marking Batch A again (should block with conflict warning)
   - [ ] Mark Batch B in different lab (should succeed)
   - [ ] Verify attendance data structure
   - [ ] Check rotation history display

2. **Conflict Detection Tests**
   - Same batch, same period, same date → BLOCK
   - Same batch, different period, same date → ALLOW
   - Same batch, same period, different date → ALLOW
   - Different batch, same lab, same period → ALLOW (multiple batches can use different labs simultaneously)

### Phase 3: Documentation & Rollout (1 day)

#### Day 9: Documentation

1. **Technical Documentation**
   - Update database schema documentation with period_mode field
   - Document practical_config structure
   - Add TypeScript type definitions to docs

2. **User Guide**
   - "How to create practical period timetables" guide
   - "Marking attendance for lab rotations" tutorial
   - Screenshots and examples from pharmacy college

3. **Migration Guide**
   - How existing institutions continue unchanged
   - How to enable practical mode for new institutions
   - FAQ section

### Phase 4: Future Enhancements (Optional)

- **Automatic rotation**: System suggests next lab based on rotation history
- **Lab resource management**: Full conflict detection across all timetables
- **Advanced analytics**: Batch-wise attendance trends, lab utilization reports
- **Mobile optimization**: Native batch/lab selector for mobile app
- **Integration**: Link to lab equipment management, resource booking

---

## 📝 Detailed File Changes

### 1. Slot Dialog - Period Mode Selector

**File:** `app/(routes)/academic/timetables/[id]/_components/slot-dialog.tsx`

```typescript
// Add at the top of slot configuration
<div className="space-y-4">
  <FormField
    name="period_mode"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Period Mode</FormLabel>
        <RadioGroup
          value={field.value || 'standard'}
          onValueChange={field.onChange}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="standard" id="mode-standard" />
            <Label htmlFor="mode-standard" className="cursor-pointer">
              <div>
                <div className="font-medium">Standard Period</div>
                <div className="text-xs text-muted-foreground">
                  Fixed course, staff, and sections (theory classes, tutorials)
                </div>
              </div>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="practical" id="mode-practical" />
            <Label htmlFor="mode-practical" className="cursor-pointer">
              <div>
                <div className="font-medium">🔬 Practical Period</div>
                <div className="text-xs text-muted-foreground">
                  Rotating batches/labs - faculty selects at attendance time
                </div>
              </div>
            </Label>
          </div>
        </RadioGroup>
      </FormItem>
    )}
  />

  {/* STANDARD MODE: Existing fixed assignment form */}
  {periodMode === 'standard' && (
    <div className="space-y-4">
      <FormField
        name="course_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Course *</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              {/* Course dropdown */}
            </Select>
          </FormItem>
        )}
      />

      <FormField
        name="staff_ids"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Staff *</FormLabel>
            <MultiSelect
              options={staffOptions}
              value={field.value}
              onChange={field.onChange}
            />
          </FormItem>
        )}
      />

      <FormField
        name="section_ids"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Sections *</FormLabel>
            <MultiSelect
              options={sectionOptions}
              value={field.value}
              onChange={field.onChange}
            />
          </FormItem>
        )}
      />
    </div>
  )}

  {/* PRACTICAL MODE: New practical configuration form */}
  {periodMode === 'practical' && (
    <PracticalPeriodConfigForm
      value={practicalConfig}
      onChange={setPracticalConfig}
      semesterId={semesterId}
    />
  )}
</div>
```

### 2. Practical Period Configuration Component

**File:** `app/(routes)/academic/timetables/[id]/_components/practical-period-config-form.tsx`

```typescript
export function PracticalPeriodConfigForm({
  value,
  onChange,
  semesterId
}: PracticalConfigFormProps) {
  const [batches, setBatches] = useState<BatchDefinition[]>(value?.batches || []);
  const [availableLabs, setAvailableLabs] = useState<LabOption[]>(value?.available_labs || []);
  const [availableCourses, setAvailableCourses] = useState<CourseOption[]>(value?.available_courses || []);

  return (
    <div className="space-y-6">
      {/* Batch Definition Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Define Available Batches</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addBatch}
          >
            + Add Batch
          </Button>
        </div>

        {batches.map((batch, index) => (
          <Card key={batch.batch_id}>
            <CardContent className="pt-4 space-y-3">
              <Input
                placeholder="Batch name (e.g., Batch A)"
                value={batch.batch_name}
                onChange={(e) => updateBatch(index, 'batch_name', e.target.value)}
              />

              <Select
                value={batch.assignment_type}
                onValueChange={(val) => updateBatch(index, 'assignment_type', val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="section">
                    Students from sections
                  </SelectItem>
                  <SelectItem value="manual">
                    Manual student selection
                  </SelectItem>
                </SelectContent>
              </Select>

              {batch.assignment_type === 'section' && (
                <MultiSelect
                  placeholder="Select sections for this batch"
                  options={sectionOptions}
                  value={batch.section_ids || []}
                  onChange={(sections) => updateBatch(index, 'section_ids', sections)}
                />
              )}

              <Input
                type="number"
                placeholder="Estimated student count"
                value={batch.estimated_count}
                onChange={(e) => updateBatch(index, 'estimated_count', parseInt(e.target.value))}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Available Labs Section */}
      <div className="space-y-3">
        <Label>Available Labs/Rooms</Label>
        <MultiSelect
          placeholder="Select labs that can be used for this period"
          options={labOptions}  // Fetch from database
          value={availableLabs.map(l => l.lab_id)}
          onChange={setSelectedLabs}
        />
        <p className="text-xs text-muted-foreground">
          Faculty will select which lab to use at attendance time
        </p>
      </div>

      {/* Available Courses Section */}
      <div className="space-y-3">
        <Label>Available Courses</Label>
        <MultiSelect
          placeholder="Select courses that can be taught in this period"
          options={courseOptions}
          value={availableCourses.map(c => c.course_id)}
          onChange={setSelectedCourses}
        />
        <p className="text-xs text-muted-foreground">
          Faculty will select which course to teach at attendance time
        </p>
      </div>
    </div>
  );
}
```

### 3. Attendance Marking Enhancement

**File:** `app/(routes)/academic/attendance/mark/page.tsx`

```typescript
// State for practical period selections
const [periodMode, setPeriodMode] = useState<'standard' | 'practical'>('standard');
const [practicalSelection, setPracticalSelection] = useState<{
  batch_id?: string;
  lab_id?: string;
  course_id?: string;
  section_ids?: string[];
} | null>(null);
const [students, setStudents] = useState<Student[]>([]);
const [conflictWarning, setConflictWarning] = useState<string | null>(null);

// Detect period mode from timetable data
useEffect(() => {
  if (contextData?.period_slot) {
    const mode = contextData.period_slot.period_mode || 'standard';
    setPeriodMode(mode);
  }
}, [contextData]);

// STANDARD MODE: Direct student loading (existing behavior)
useEffect(() => {
  if (periodMode === 'standard' && contextData?.section_ids) {
    loadStudentsBySections(contextData.section_ids);
  }
}, [periodMode, contextData]);

// PRACTICAL MODE: Wait for faculty selection
const handlePracticalSelectionComplete = async (selection: {
  batch_id: string;
  lab_id: string;
  course_id: string;
  section_ids: string[];
}) => {
  // Check for conflicts first
  const conflict = await AttendanceService.checkPracticalConflict({
    timetable_id: timetableId,
    period_slot_id: periodSlotId,
    batch_id: selection.batch_id,
    date: date
  });

  if (conflict.hasConflict) {
    setConflictWarning(
      `Batch ${selection.batch_id} already has attendance marked for this period today`
    );
    return;
  }

  // Load students from selected batch
  setPracticalSelection(selection);
  await loadStudentsBySections(selection.section_ids);
};

// Save attendance - handle both modes
const handleSaveAttendance = async () => {
  const basePayload = {
    timetable_id: timetableId,
    attendance_date: date,
    period_slot_id: periodSlotId
  };

  if (periodMode === 'standard') {
    // Standard mode: straightforward save
    await saveConsolidatedAttendance.mutateAsync({
      ...basePayload,
      section_id: contextData.section_ids[0],
      section_ids: contextData.section_ids,
      attendance_data: {
        [periodSlotId]: {
          period_mode: 'standard',
          course_id: contextData.course_id,
          students: buildStudentAttendanceArray()
        }
      }
    });
  } else {
    // Practical mode: include runtime selections
    if (!practicalSelection) {
      toast.error('Please select batch, lab, and course first');
      return;
    }

    await saveConsolidatedAttendance.mutateAsync({
      ...basePayload,
      section_id: practicalSelection.section_ids[0],
      section_ids: practicalSelection.section_ids,
      attendance_data: {
        [periodSlotId]: {
          period_mode: 'practical',
          batch_selected: {
            batch_id: practicalSelection.batch_id,
            batch_name: getBatchName(practicalSelection.batch_id)
          },
          lab_selected: practicalSelection.lab_id,
          course_selected: practicalSelection.course_id,
          students: buildStudentAttendanceArray(),
          marked_by: currentUserId,
          marked_at: new Date().toISOString()
        }
      }
    });
  }
};
```

### 4. Practical Attendance Selector Component

**File:** `app/(routes)/academic/attendance/mark/_components/practical-attendance-selector.tsx`

```typescript
export function PracticalAttendanceSelector({
  practicalConfig,
  periodId,
  date,
  timetableId,
  onSelectionComplete
}: PracticalSelectorProps) {
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [selectedLab, setSelectedLab] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [conflictCheck, setConflictCheck] = useState<{
    checking: boolean;
    hasConflict: boolean;
    message?: string;
  }>({ checking: false, hasConflict: false });

  // Check for conflicts when batch is selected
  useEffect(() => {
    if (selectedBatch) {
      checkConflict();
    }
  }, [selectedBatch]);

  const checkConflict = async () => {
    setConflictCheck({ checking: true, hasConflict: false });

    const result = await AttendanceService.checkPracticalConflict({
      timetable_id: timetableId,
      period_slot_id: periodId,
      batch_id: selectedBatch,
      date
    });

    setConflictCheck({
      checking: false,
      hasConflict: result.hasConflict,
      message: result.hasConflict
        ? `This batch already has attendance marked in ${result.existingRecord?.lab} at ${result.existingRecord?.time}`
        : '✓ Available'
    });
  };

  const handleLoadStudents = () => {
    const batch = practicalConfig.batches.find(b => b.batch_id === selectedBatch);
    if (!batch || !selectedLab || !selectedCourse) {
      toast.error('Please complete all selections');
      return;
    }

    onSelectionComplete({
      batch_id: selectedBatch,
      lab_id: selectedLab,
      course_id: selectedCourse,
      section_ids: batch.section_ids || []
    });
  };

  const isSelectionComplete = selectedBatch && selectedLab && selectedCourse && !conflictCheck.hasConflict;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🔬 Practical Period - Select Batch & Lab
        </CardTitle>
        <CardDescription>
          Choose which batch and lab to mark attendance for
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Batch Selector */}
        <div>
          <Label>Select Batch *</Label>
          <Select value={selectedBatch} onValueChange={setSelectedBatch}>
            <SelectTrigger>
              <SelectValue placeholder="Choose batch..." />
            </SelectTrigger>
            <SelectContent>
              {practicalConfig.batches.map((batch) => (
                <SelectItem key={batch.batch_id} value={batch.batch_id}>
                  {batch.batch_name} ({batch.estimated_count} students)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {conflictCheck.checking && (
            <p className="text-xs text-muted-foreground mt-1">Checking availability...</p>
          )}
          {conflictCheck.message && (
            <p className={cn(
              "text-xs mt-1",
              conflictCheck.hasConflict ? "text-destructive" : "text-green-600"
            )}>
              {conflictCheck.message}
            </p>
          )}
        </div>

        {/* Lab Selector */}
        <div>
          <Label>Select Lab *</Label>
          <Select value={selectedLab} onValueChange={setSelectedLab}>
            <SelectTrigger>
              <SelectValue placeholder="Choose lab..." />
            </SelectTrigger>
            <SelectContent>
              {practicalConfig.available_labs.map((lab) => (
                <SelectItem key={lab.lab_id} value={lab.lab_id}>
                  {lab.lab_name} (Capacity: {lab.capacity})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Course Selector */}
        <div>
          <Label>Select Course *</Label>
          <Select value={selectedCourse} onValueChange={setSelectedCourse}>
            <SelectTrigger>
              <SelectValue placeholder="Choose course..." />
            </SelectTrigger>
            <SelectContent>
              {practicalConfig.available_courses.map((course) => (
                <SelectItem key={course.course_id} value={course.course_id}>
                  {course.course_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Load Students Button */}
        <Button
          onClick={handleLoadStudents}
          disabled={!isSelectionComplete}
          className="w-full"
        >
          {isSelectionComplete ? '✓ Load Students' : 'Complete selections to load students'}
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## ✅ Backward Compatibility

### Existing Institutions - Zero Impact

**Traditional College Flow (Section-Based):**
1. ✅ Create Timetable → Select "Section-Level" → Works exactly as before
2. ✅ All existing timetables continue to work
3. ✅ No UI changes for existing workflows
4. ✅ No data migration needed

**Pharmacy College Flow (Semester-Based):**
1. 🆕 Create Timetable → Select "Semester-Level" → New option
2. 🆕 Enable "Multi-Course Batch Mode" → New feature
3. 🆕 Mark attendance with section selection → New flow

### Migration Strategy

**No Migration Needed!**
- New feature is opt-in
- Database schema already supports everything
- Existing data remains untouched
- New timetables use new flow

---

## 🧪 Testing Plan

### Test Scenarios

#### Scenario 1: Traditional College (Existing Flow)
- [x] Create section-level timetable
- [x] Add periods with single course
- [x] Mark attendance as before
- [x] Verify no regression

#### Scenario 2: Pharmacy College - Basic
- [ ] Create semester-level timetable
- [ ] Add period with 2 batches (different courses)
- [ ] Pre-assign sections to batches
- [ ] Mark attendance for each batch
- [ ] Verify data structure

#### Scenario 3: Pharmacy College - Manual Selection
- [ ] Create semester-level timetable
- [ ] Add period with 4 batches (no pre-assigned sections)
- [ ] During attendance: Select sections manually
- [ ] Mark attendance
- [ ] Verify section_ids array

#### Scenario 4: Mixed Mode
- [ ] Create semester-level timetable
- [ ] Batch A: Pre-assigned sections
- [ ] Batch B: Manual selection
- [ ] Mark attendance for both
- [ ] Verify correct data storage

### Edge Cases to Test

1. ⚠️ Student in multiple sections? (Shouldn't happen, but validate)
2. ⚠️ Staff assigned to multiple batches simultaneously? (Should be allowed)
3. ⚠️ Lab room conflicts? (Warning only, not blocking)
4. ⚠️ No sections selected during attendance? (Block save, show error)

---

## 📊 Success Metrics

### Definition of Done

- [ ] Pharmacy college can create semester-level timetables
- [ ] Each batch can have different course/staff/lab
- [ ] Sections can be pre-assigned OR selected at attendance time
- [ ] Attendance data stores correctly with section_ids array
- [ ] Existing institutions work without any changes
- [ ] All test scenarios pass
- [ ] Documentation updated

### Performance Targets

- Timetable creation: < 2 seconds
- Student list load: < 1 second for 200 students
- Attendance save: < 3 seconds for 50 students across 4 batches

---

## 🔧 Technical Debt & Future Work

### Known Limitations

1. **Batch rotation automation**: Manual for now, could be automated
2. **Lab resource management**: No conflict detection (future enhancement)
3. **Mobile app**: Batch-wise view not optimized for mobile (Phase 3)
4. **Reporting**: Batch-level analytics not included in Phase 1

### Future Enhancements

1. **Smart batch assignment**: Auto-distribute students to batches
2. **Lab conflict detection**: Real-time availability checking
3. **Batch rotation scheduler**: Automated rotation patterns
4. **Advanced analytics**: Batch-wise attendance trends
5. **Integration with scheduling**: Link to exam schedules

---

## 📞 Questions for Clarification

Before implementation, please confirm:

1. **Period Mode Default:**
   - [ ] Should new periods default to "Standard" mode? (Recommended: Yes - most institutions use this)
   - [ ] Should there be a timetable-level setting to set default mode?

2. **Batch Naming Convention:**
   - [ ] Fixed pattern: Batch A, B, C, D
   - [ ] Custom names: Allow any name (e.g., "Group 1", "Lab Alpha")
   - [ ] Recommended: ✅ Custom names for flexibility

3. **Conflict Handling:**
   - [ ] Block duplicate batch attendance completely (Recommended: Yes)
   - [ ] Allow with warning only
   - [ ] Allow override with admin permission

4. **Rotation History:**
   - [ ] Show in attendance UI: "Last used Lab AG-1 on Jan 25"
   - [ ] Store rotation history for analytics
   - [ ] Recommended: ✅ Both for better UX

5. **Lab/Room Management:**
   - [ ] Phase 1: Simple dropdown selection (no conflict detection across timetables)
   - [ ] Future: Full resource management with real-time availability
   - [ ] Recommended: ✅ Simple for Phase 1, enhance later

---

## 🎯 Recommendation

**PROCEED WITH IMPLEMENTATION** using the Dual-Mode Period Enhancement approach.

**Rationale:**
- ✅ **Solves BOTH use cases**: Theory classes (fixed) AND practical labs (rotating)
- ✅ **Zero database schema changes** - JSONB handles everything
- ✅ **Zero risk to existing institutions** - Standard mode is default
- ✅ **Flexible architecture** - Can extend to other use cases (hospital duty, field work, etc.)
- ✅ **Clean separation** - Mode-specific logic isolated, maintainable
- ✅ **Quick implementation** - ~1-2 weeks for production-ready solution

**Why This Solution is Correct:**

1. **Fixes the critical flaw**: Original plan assumed batches could be pre-assigned to labs, but user clarified that practical labs ROTATE - different batch/lab combinations each occurrence

2. **Dual-mode approach addresses reality**:
   - Theory classes: Fixed sections → Standard mode ✅
   - Practical labs: Rotating batches → Practical mode ✅

3. **Runtime selection is key**: Timetable defines AVAILABLE options (batches, labs, courses), but faculty SELECTS actual combination at attendance time

4. **Prevents conflicts**: System tracks which batch/lab combinations were used and blocks duplicates

**Next Steps:**
1. ✅ Get user approval on this REVISED plan
2. ✅ Clarify the 5 questions above
3. 🚀 Begin Phase 1 implementation (dual-mode infrastructure)
4. 🧪 Test standard mode (verify no regression)
5. 🧪 Test practical mode (with pharmacy college pilot)
6. 📦 Deploy to production

**Implementation Timeline:**
- **Phase 1** (Days 1-5): Core dual-mode infrastructure
- **Phase 2** (Days 6-8): UX polish, validation, testing
- **Phase 3** (Day 9): Documentation and rollout
- **Phase 4**: Future enhancements (automatic rotation, analytics, etc.)

**Total Effort:** 9-11 days for production-ready solution

---

**Document Status:** ✅ REVISED & Ready for Review
**Last Updated:** 2025-10-25 (Critical revision after user feedback)
**Estimated Effort:** 9-11 days for production-ready solution
**Risk Level:** Low (backward compatible, isolated changes)
**Impact:** High value for pharmacy colleges, zero impact on existing users

**Key Changes from Original Plan:**
- ❌ Removed: Pre-assigning batches to labs in timetable (incorrect assumption)
- ✅ Added: Dual-mode period system (standard vs practical)
- ✅ Added: Runtime batch/lab selection for practical periods
- ✅ Added: Conflict detection to prevent duplicate batch attendance
- ✅ Added: Rotation history tracking for faculty reference