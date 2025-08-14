# How to Edit Timetable Slots While Preserving Attendance

## Quick Start Guide

### 1. Run the Migration
```sql
-- Run the simplified migration file:
20250814_timetable_slot_versioning_simple.sql
```

### 2. When You Edit a Slot

#### Option A: Simple Edit (Without Versioning)
If you don't need history tracking, just edit normally. The enhanced attendance checking will still find the records.

#### Option B: With Versioning (Recommended)
```sql
-- Step 1: Create continuity entry for old slot (if first edit)
INSERT INTO timetable_slot_continuity (
    continuity_group_id,
    timetable_slot_id,
    version_number,
    is_current,
    valid_from,
    valid_until
) VALUES (
    'old-slot-id',  -- Use slot ID as group ID for first version
    'old-slot-id',  -- The slot being replaced
    1,              -- First version
    false,          -- No longer current
    '2025-07-01',   -- When it was valid from
    '2025-08-31'    -- Valid until today
);

-- Step 2: Create new slot (your normal process)
-- ... create new timetable_slot record ...

-- Step 3: Add continuity entry for new slot
INSERT INTO timetable_slot_continuity (
    continuity_group_id,
    timetable_slot_id,
    version_number,
    is_current,
    valid_from,
    previous_slot_id,
    change_reason
) VALUES (
    'old-slot-id',      -- Same group as old slot
    'new-slot-id',      -- The new slot
    2,                  -- Next version
    true,               -- Current version
    '2025-09-01',       -- Valid from tomorrow
    'old-slot-id',      -- Links to previous
    'Course changed to Database Systems'
);
```

### 3. Viewing Attendance History

#### In the Application
The attendance page will automatically:
- Find attendance marked with old slot IDs
- Match by period name if slot ID doesn't match
- Show complete history

#### Via SQL Query
```sql
-- Get all attendance for a slot (including versions)
SELECT * FROM get_attendance_for_slot_versions(
    'current-slot-id',  -- Current slot
    'section-id',       -- Section
    '2025-01-01',      -- Start date (optional)
    '2025-12-31'       -- End date (optional)
);
```

## Common Scenarios

### Scenario 1: Change Course Mid-Semester

**Situation**: Need to change "Computer Networks" to "Database Systems" from Sept 1

**Steps**:
1. Keep old slot for historical records
2. Create new slot with new course
3. Link them via continuity_group_id
4. Old attendance stays with old slot
5. New attendance uses new slot

**Result**: 
- August attendance shows "Computer Networks"
- September attendance shows "Database Systems"
- Both visible when viewing attendance history

### Scenario 2: Change Time Slot

**Situation**: Move P4 from 11:45-12:30 to 12:00-12:45

**Steps**:
1. Create new slot with new time
2. Link to old slot via continuity
3. System matches by period name "P4"

**Result**:
- Historical attendance shows old time
- New attendance uses new time
- No data loss

### Scenario 3: Emergency Same-Day Change

**Situation**: Need to change slot immediately

**Without Versioning**:
- Just edit the slot
- The enhanced matching (by period name/time) will find attendance

**With Versioning**:
- Create version with today as valid_from
- Old attendance remains intact
- New attendance from today uses new slot

## How the System Works

### Attendance Checking Flow
```
1. User selects date and period
2. System checks:
   a. Exact slot ID match
   b. Period name match (if slot changed)
   c. Time slot match
   d. Any attendance for section/date
3. Shows attendance if found by any method
```

### Data Structure
```
Slot Versions:
┌─────────────┐
│ Slot v1     │ ← Attendance Aug 1-31
│ ID: abc-123 │
└─────────────┘
      ↓ continuity_group_id
┌─────────────┐
│ Slot v2     │ ← Attendance Sep 1-30
│ ID: xyz-789 │
└─────────────┘
```

## Benefits

✅ **No Attendance Loss**: All historical data preserved
✅ **Flexible Editing**: Change slots anytime
✅ **Automatic Tracking**: System handles versioning
✅ **Transparent**: Users don't need to know about versions
✅ **Audit Trail**: Track all changes

## Important Notes

1. **Don't Delete Old Slots**: Mark as inactive instead
2. **Use Continuity Groups**: Link related slots
3. **Document Changes**: Add change_reason
4. **Test First**: Try on one slot before bulk changes

## Troubleshooting

### Issue: Attendance Not Showing
**Check**:
1. Section ID matches
2. Date is correct
3. Period name hasn't changed completely

**Fix**: The enhanced matching should find it. If not, check the attendance_data JSONB.

### Issue: Duplicate Attendance
**Check**: 
1. Multiple slots for same period
2. Overlapping valid dates

**Fix**: Ensure valid_from/valid_until don't overlap

### Issue: Wrong Course Showing
**Check**:
1. Which slot version was used
2. Attendance date vs valid dates

**Fix**: Attendance shows course at time of marking (correct behavior)

## SQL Helper Queries

### Find All Versions of a Slot
```sql
SELECT * FROM timetable_slot_continuity
WHERE continuity_group_id = (
    SELECT continuity_group_id 
    FROM timetable_slot_continuity 
    WHERE timetable_slot_id = 'current-slot-id'
)
ORDER BY version_number;
```

### Check Attendance Across Versions
```sql
SELECT 
    attendance_date,
    jsonb_object_keys(attendance_data) as slot_ids
FROM student_attendance
WHERE section_id = 'section-id'
ORDER BY attendance_date DESC;
```

### Initialize Existing Slots
```sql
-- One-time setup for existing slots
UPDATE timetable_slots 
SET continuity_group_id = id 
WHERE continuity_group_id IS NULL;
```

## Summary

The system now supports:
1. **Editing slots** without losing attendance
2. **Version tracking** for audit trails
3. **Automatic linking** of related attendance
4. **Flexible matching** by ID, name, or time
5. **Complete history** across all versions

You can now confidently edit timetable slots knowing that all attendance data is preserved and accessible!