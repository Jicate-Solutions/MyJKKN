# Timetable Slot Versioning Solution

## Overview
This solution allows you to edit timetable slots while preserving all historical attendance records and maintaining the connection between old and new slots.

## Key Features

### 1. Slot Continuity Tracking
- Each slot can have multiple versions over time
- All versions are linked through a `continuity_group_id`
- System tracks which version is current and when each was valid

### 2. Attendance Preservation
- Historical attendance remains intact with original slot IDs
- New attendance uses new slot IDs
- System can retrieve all attendance across all versions of a slot

### 3. Seamless User Experience
- Users see attendance history regardless of slot changes
- Can view attendance by date range across slot versions
- Automatic fallback to historical data

## How It Works

### When You Edit a Slot

1. **Original Slot Preserved**
   - Original slot marked as `is_current_version = false`
   - Sets `valid_until` date to day before change
   - Links to new slot via `replaced_by_slot_id`

2. **New Slot Created**
   - Gets new UUID but same `continuity_group_id`
   - Version number incremented
   - Marked as `is_current = true`
   - Sets `valid_from` date

3. **Continuity Maintained**
   - Both slots linked through `continuity_group_id`
   - System knows they represent the same logical period
   - Can retrieve attendance from either version

### Database Structure

```sql
timetable_slot_continuity
├── continuity_group_id  (links all versions)
├── timetable_slot_id    (specific slot version)
├── version_number       (1, 2, 3...)
├── is_current          (only one true per group)
├── valid_from          (when this version started)
├── valid_until         (when replaced, NULL if current)
├── change_reason       (why it was changed)
└── previous_slot_id    (links to previous version)
```

## Usage Examples

### Scenario 1: Change Course Mid-Semester

**Original Setup:**
- Period: P4 (11:45-12:30)
- Course: Computer Networks
- Started: 2025-07-01

**Change on 2025-09-01:**
- Same period time
- New Course: Database Systems

**Result:**
- Attendance before 2025-09-01 shows "Computer Networks"
- Attendance after 2025-09-01 shows "Database Systems"
- Both linked through continuity group
- Can view all attendance in one query

### Scenario 2: Change Time Slot

**Original Setup:**
- Period: P4 (11:45-12:30)
- Course: Computer Networks

**Change:**
- New time: P4 (12:00-12:45)
- Same course

**Result:**
- System matches by period name "P4"
- Historical attendance preserved with old times
- New attendance uses new times
- Reports show complete history

## API Methods

### 1. Get Attendance with History
```typescript
// Get all attendance for a slot including versions
const history = await AttendanceService.getSlotAttendanceWithHistory(
  slot_id,        // Current slot ID
  section_id,     // Section ID
  start_date,     // Optional: filter by date
  end_date        // Optional: filter by date
);

// Returns:
[
  {
    attendance_date: "2025-08-12",
    slot_id: "old-slot-id",
    period_name: "P4",
    course_name: "Computer Networks",
    student_count: 45,
    marked_by: {...}
  },
  {
    attendance_date: "2025-09-15",
    slot_id: "new-slot-id",
    period_name: "P4",
    course_name: "Database Systems",
    student_count: 45,
    marked_by: {...}
  }
]
```

### 2. Check Existing Attendance (Enhanced)
```typescript
// Automatically checks all slot versions
const existing = await checkExistingAttendance(
  current_slot_id,
  attendance_date
);
// Will find attendance even if marked with old slot ID
```

## Benefits

### 1. **Data Integrity**
- No attendance data lost
- Historical accuracy maintained
- Audit trail preserved

### 2. **Flexibility**
- Edit slots anytime
- Multiple changes supported
- Rollback possible

### 3. **Performance**
- Indexed for fast queries
- Efficient continuity lookups
- Optimized for date ranges

### 4. **User Friendly**
- Transparent to end users
- No manual data migration
- Automatic history tracking

## Implementation Steps

### Step 1: Run Migration
```bash
npx supabase migration up
```

### Step 2: Update Existing Slots (One-time)
```sql
-- Add continuity groups to existing slots
UPDATE timetable_slots 
SET continuity_group_id = id
WHERE continuity_group_id IS NULL;
```

### Step 3: Use New Methods
```typescript
// When editing a slot
const newSlotId = await TimetableService.updateSlotWithVersioning(
  oldSlotId,
  newSlotData,
  changeReason,
  userId,
  effectiveDate
);
```

## Edge Cases Handled

### 1. **Multiple Changes**
- Slot can be changed multiple times
- Each change creates new version
- All versions tracked

### 2. **Partial Period Attendance**
- If slot changed mid-period
- Both versions can have attendance
- System combines when querying

### 3. **Deleted Slots**
- Soft delete recommended
- Mark as inactive instead
- Attendance still accessible

### 4. **Bulk Changes**
- Can update multiple slots
- Each gets version tracking
- Continuity maintained

## Best Practices

### 1. **Planning Changes**
- Set effective date in future
- Communicate to staff/students
- Document change reason

### 2. **Making Changes**
- Use versioning API
- Don't delete old slots
- Preserve continuity group

### 3. **Viewing History**
- Use history methods
- Filter by date range
- Show version info to users

## Query Examples

### Get All Attendance for a Period (Across Versions)
```sql
WITH slot_versions AS (
  SELECT timetable_slot_id
  FROM timetable_slot_continuity
  WHERE continuity_group_id = (
    SELECT continuity_group_id 
    FROM timetable_slot_continuity 
    WHERE timetable_slot_id = 'current-slot-id'
  )
)
SELECT *
FROM student_attendance sa
WHERE EXISTS (
  SELECT 1 
  FROM slot_versions sv
  WHERE sa.attendance_data ? sv.timetable_slot_id::text
);
```

### Get Slot Change History
```sql
SELECT 
  tsc.*,
  ts_old.period_id as old_period,
  ts_new.period_id as new_period,
  c_old.course_name as old_course,
  c_new.course_name as new_course
FROM timetable_slot_continuity tsc
JOIN timetable_slots ts_old ON tsc.previous_slot_id = ts_old.id
JOIN timetable_slots ts_new ON tsc.timetable_slot_id = ts_new.id
LEFT JOIN courses c_old ON ts_old.course_id = c_old.id
LEFT JOIN courses c_new ON ts_new.course_id = c_new.id
WHERE tsc.continuity_group_id = 'group-id'
ORDER BY tsc.version_number;
```

## Summary

This versioning system provides:
- ✅ Complete attendance history preservation
- ✅ Seamless slot editing capability
- ✅ Automatic version tracking
- ✅ Performance optimized queries
- ✅ User-friendly experience
- ✅ Data integrity guarantee

You can now edit timetable slots freely while maintaining perfect attendance history!