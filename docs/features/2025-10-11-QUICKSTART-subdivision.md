# Section Subdivision Quick Start Guide

**Date:** 2025-10-11
**Audience:** Developers
**Time to Read:** 5 minutes

---

## 🚀 What is Section Subdivision?

Section Subdivision allows pharmacy colleges to split large sections into smaller groups for practical/lab sessions while maintaining students' permanent section assignments.

**Example:**
- Section A has 100 students
- Period 5 (Pharmaceutical Chemistry Practical) splits into:
  - Group A: 30 students in Lab 1 with Dr. Smith
  - Group B: 30 students in Lab 2 with Dr. Johnson
  - Group C: 40 students in Lab 3 with Dr. Williams

---

## 📁 Key Files

### Type Definitions
```
types/academics.ts
├── SubdivisionType: 'practical' | 'lab' | 'tutorial' | 'workshop'
├── SubdivisionMode: 'auto' | 'manual'
├── SubdivisionGroup interface
└── SubdivisionConfig interface
```

### Utilities
```
lib/utils/subdivision-validation.ts
└── Validation and distribution functions
```

### UI Components
```
app/(routes)/academic/timetables/[id]/_components/
├── slot-dialog.tsx (subdivision checkbox + type selector)
├── subdivision-config-dialog.tsx (main config dialog)
└── subdivision-group-card.tsx (individual group card)

app/(routes)/academic/attendance/mark/
├── page.tsx (integrated subdivision detection)
└── _components/subdivided-attendance-grid.tsx (group-based attendance)
```

### Services
```
lib/services/academic/
├── timetable-service.ts (formatSubdivisionDataForSlot helper)
└── attendance-service.ts (no changes needed - JSONB agnostic)
```

---

## 🔄 Data Flow

### 1. Creating Subdivided Slot

```typescript
// User enables subdivision in slot-dialog.tsx
const slotData = {
  ...basicSlotInfo,
  is_subdivided: true,
  subdivision_type: 'practical',
  subdivision_mode: 'auto'
};

// After saving slot, SubdivisionConfigDialog opens
// User configures groups, assigns staff, reviews students

// Formatted by formatSubdivisionDataForSlot() in timetable-service.ts
const formattedData = {
  ...slotData,
  sub_slots: [
    {
      sub_slot_order: 1,
      group_name: 'Group A - Lab 1',
      student_ids: ['uuid1', 'uuid2', ...],
      staff_ids: ['staff-uuid1'],
      lab_room: 'Laboratory Room 1',
      max_capacity: 30
    },
    // ... more groups
  ]
};

// Saved to timetables table -> timetable_data JSONB
```

### 2. Marking Attendance

```typescript
// In app/(routes)/academic/attendance/mark/page.tsx

// Step 1: Detect subdivision
useEffect(() => {
  if (slot.is_subdivided && slot.sub_slots) {
    const groups = slot.sub_slots.map(subSlot => ({
      group_order: subSlot.sub_slot_order,
      group_name: subSlot.group_name,
      student_ids: subSlot.student_ids,
      // ...
    }));
    setIsSubdividedSlot(true);
    setSubdivisionGroups(groups);
  }
}, [contextData]);

// Step 2: Render appropriate grid
{isSubdividedSlot ? (
  <SubdividedAttendanceGrid
    groups={subdivisionGroups}
    allStudents={students}
    attendanceData={attendanceData}
    onAttendanceChange={...}
  />
) : (
  <RegularStudentGrid ... />
)}

// Step 3: Save with group structure
const attendancePayload = {
  [periodId]: {
    ...basicPeriodInfo,
    ...(isSubdividedSlot && {
      is_subdivided: true,
      subdivision_type: subdivisionType,
      groups: subdivisionGroups.map(group => ({
        group_order: group.group_order,
        group_name: group.group_name,
        students: students
          .filter(s => group.student_ids.includes(s.id))
          .map(s => ({
            student_id: s.id,
            status: attendanceData[s.id],
            marked_at: new Date().toISOString()
          }))
      }))
    })
  }
};

// Saved to daily_attendance table -> attendance_data JSONB
```

---

## 🎨 UI Components Usage

### SubdivisionConfigDialog

```tsx
import { SubdivisionConfigDialog } from './_components/subdivision-config-dialog';

<SubdivisionConfigDialog
  isOpen={showSubdivisionDialog}
  onClose={() => setShowSubdivisionDialog(false)}
  onSave={(config) => {
    // Handle saving subdivision config
    const formattedData = formatSubdivisionDataForSlot(slotData, config);
    await TimetableService.updateTimetableSlot(timetableId, formattedData);
  }}
  sectionId={sectionId}
  courseId={courseId}
  subdivisionType={subdivisionType}
  subdivisionMode={subdivisionMode}
  allStudents={students}
  availableStaff={staff}
  existingConfig={existingConfig} // Optional, for editing
/>
```

### SubdividedAttendanceGrid

```tsx
import { SubdividedAttendanceGrid } from './_components/subdivided-attendance-grid';

<SubdividedAttendanceGrid
  groups={subdivisionGroups}
  allStudents={students}
  availableStaff={staff}
  attendanceData={attendanceData}
  onAttendanceChange={(studentId, status) => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: status
    }));
  }}
  onMarkAllGroupPresent={(groupOrder) => {
    const group = groups.find(g => g.group_order === groupOrder);
    // Mark all students in group present
  }}
  onMarkAllGroupAbsent={(groupOrder) => {
    // Mark all students in group absent
  }}
  readOnly={false}
  searchTerm={searchTerm}
  subdivisionType={subdivisionType}
/>
```

---

## 🔧 Validation Utilities

```typescript
import {
  validateSubdivisionAssignments,
  autoDistributeStudents,
  createDefaultSubdivisionGroups,
  rebalanceGroups,
  calculateDistributionStats
} from '@/lib/utils/subdivision-validation';

// Validate student assignments
const validation = validateSubdivisionAssignments(
  groups,
  allStudents
);

if (!validation.isValid) {
  console.error('Validation errors:', validation.errors);
  console.warn('Validation warnings:', validation.warnings);
}

// Auto-distribute students evenly
const distributedGroups = autoDistributeStudents(
  students,
  groupCount,
  existingGroups
);

// Calculate distribution statistics
const stats = calculateDistributionStats(groups);
console.log('Average per group:', stats.averagePerGroup);
console.log('Distribution range:', stats.range);
console.log('Is balanced:', stats.isBalanced);

// Rebalance uneven groups
const balancedGroups = rebalanceGroups(groups, allStudents);
```

---

## 💾 Database Schema

### No Schema Changes Required!

All subdivision data stored in existing JSONB columns:

#### Timetables Table
```sql
-- timetable_data JSONB structure (existing column)
{
  "MONDAY": {
    "period-uuid": {
      "is_subdivided": true,
      "subdivision_type": "practical",
      "subdivision_mode": "auto",
      "sub_slots": [
        {
          "sub_slot_order": 1,
          "group_name": "Group A - Lab 1",
          "student_ids": ["uuid1", "uuid2"],
          "staff_ids": ["staff-uuid1"],
          "lab_room": "Laboratory Room 1",
          "max_capacity": 30
        }
      ]
    }
  }
}
```

#### Daily Attendance Table
```sql
-- attendance_data JSONB structure (existing column)
{
  "period-uuid": {
    "is_subdivided": true,
    "subdivision_type": "practical",
    "groups": [
      {
        "group_order": 1,
        "group_name": "Group A - Lab 1",
        "lab_room": "Laboratory Room 1",
        "staff_ids": ["staff-uuid1"],
        "students": [
          {
            "student_id": "uuid1",
            "status": "Present",
            "marked_at": "2025-10-11T10:30:00Z"
          }
        ]
      }
    ]
  }
}
```

---

## 🎯 Common Patterns

### Pattern 1: Detecting Subdivided Slots

```typescript
// In any component that needs to know if a slot is subdivided
const isSubdivided = slot?.is_subdivided === true;
const hasGroups = slot?.sub_slots && slot.sub_slots.length > 0;

if (isSubdivided && hasGroups) {
  // Handle subdivided slot
  const groups = slot.sub_slots.map(subSlot => ({
    group_order: subSlot.sub_slot_order,
    group_name: subSlot.group_name,
    student_ids: subSlot.student_ids || [],
    staff_ids: subSlot.staff_ids || [],
    lab_room: subSlot.lab_room,
    max_capacity: subSlot.max_capacity
  }));
}
```

### Pattern 2: Conditional Rendering

```tsx
// Render different UI for subdivided vs regular slots
{isSubdividedSlot ? (
  <SubdividedView
    groups={groups}
    type={subdivisionType}
  />
) : (
  <RegularView
    students={students}
  />
)}
```

### Pattern 3: Saving with Optional Subdivision Data

```typescript
// Use spread operator for conditional inclusion
const payload = {
  ...baseData,
  ...(isSubdivided && {
    is_subdivided: true,
    subdivision_type: type,
    groups: formatGroups(groups)
  })
};
```

---

## 🐛 Debugging Tips

### Check Subdivision Detection
```typescript
console.log('🔍 Slot detection:', {
  is_subdivided: slot?.is_subdivided,
  has_sub_slots: !!slot?.sub_slots,
  sub_slot_count: slot?.sub_slots?.length,
  subdivision_type: slot?.subdivision_type
});
```

### Check Student Distribution
```typescript
console.log('👥 Student distribution:', {
  total_students: allStudents.length,
  group_count: groups.length,
  distribution: groups.map(g => ({
    group: g.group_name,
    student_count: g.student_ids.length
  }))
});
```

### Check Attendance Data
```typescript
console.log('📊 Attendance data:', {
  is_subdivided: isSubdividedSlot,
  group_count: subdivisionGroups.length,
  attendance_records: Object.keys(attendanceData).length,
  sample_group: subdivisionGroups[0]
});
```

---

## ⚠️ Important Notes

### DO:
✅ Use existing JSONB columns for all subdivision data
✅ Check `is_subdivided` flag before accessing `sub_slots`
✅ Validate student assignments before saving
✅ Preserve group structure when saving attendance
✅ Use purple theme (#9333EA) for subdivision UI
✅ Support both auto and manual assignment modes

### DON'T:
❌ Modify students' permanent `section_id` in database
❌ Allow subdivision for semester-level timetables
❌ Allow combined class + subdivision simultaneously
❌ Create SQL migrations for this feature (uses existing JSONB)
❌ Hardcode student assignments (use validation utilities)
❌ Forget to handle backward compatibility with non-subdivided slots

---

## 🔗 Related Documentation

- **Implementation Plan**: `2025-10-11-IMPLEMENTATION-subdivided-attendance-integration.md`
- **Progress Tracking**: `2025-10-11-PROGRESS-subdivision-implementation.md`
- **Summary**: `2025-10-11-IMPLEMENTATION-SUMMARY-subdivision-complete.md`
- **Testing Checklist**: `2025-10-11-TESTING-CHECKLIST-subdivision.md`

---

## 🆘 Need Help?

1. Check implementation plan for detailed steps
2. Look at existing code comments (marked "Updated: 2025-10-11")
3. Review validation utilities for student distribution logic
4. Check SubdividedAttendanceGrid component for UI patterns
5. Test with small groups first (2-3 groups, 20-30 students)

---

## 🚀 Quick Commands

### Check TypeScript
```bash
cd "D:\Projects\JKKN\MYJKKN Portal\MyJKKN"
npx tsc --noEmit --skipLibCheck
```

### Run Dev Server
```bash
npm run dev
```

### Check Lint
```bash
npm run lint
```

---

**Ready to test?** See `2025-10-11-TESTING-CHECKLIST-subdivision.md` for comprehensive testing guide.

**Status:** ✅ All features implemented and ready for testing
