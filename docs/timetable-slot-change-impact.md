# Impact of Timetable Slot Changes on Attendance System

## Current Behavior

### How Attendance is Stored
- Attendance records are linked to `timetable_id` and store slot data in JSONB
- The slot ID is used as the key in the attendance_data JSONB field
- Period details (name, time, course) are duplicated in the attendance record

## Scenarios and Their Impact

### 1. **Changing Slot Time (e.g., P4 from 11:45-12:30 to 12:00-12:45)**

**What Happens:**
- New timetable slot gets a new UUID
- Old attendance records still have the old slot ID and old time
- When checking attendance for the new time slot, it won't find the old records

**Current Fix Applied:**
- The system now matches by period name OR time slot
- If period name stays the same (e.g., "CET P4"), attendance will still be found

**Remaining Issues:**
- Reports might show incorrect timing for historical data
- Confusion if same period has different times on different days

### 2. **Changing Course for a Slot**

**What Happens:**
- New slot ID is generated
- Old attendance shows old course name
- Historical records remain unchanged

**Impact:**
- Historical attendance shows the course that was actually taught
- This is actually GOOD for audit purposes
- New attendance will be marked for the new course

### 3. **Changing Staff Assignment**

**What Happens:**
- Slot ID might change (depends on implementation)
- Old attendance still shows who originally marked it
- New staff can mark future attendance

**Impact:**
- Historical accuracy is maintained
- No data loss

### 4. **Deleting a Slot Entirely**

**What Happens:**
- Timetable slot is removed
- Old attendance records remain in database
- Cannot view attendance through normal UI for deleted slots

**Impact:**
- Historical data is preserved but becomes "orphaned"
- Need special queries to retrieve this data

### 5. **Moving Slot to Different Day**

**What Happens:**
- New slot created for new day
- Old slot removed or modified
- Attendance records remain on original dates

**Impact:**
- Historical accuracy maintained
- Future attendance on new day

## Potential Problems

### 1. **Slot ID Mismatch**
- **Problem**: When slot is edited, new UUID is generated
- **Current Solution**: Matching by period name/time as fallback
- **Limitation**: Won't work if period name AND time both change

### 2. **Orphaned Attendance Records**
- **Problem**: If timetable deleted, attendance has no parent
- **Solution Needed**: Archive system or soft-delete for timetables

### 3. **Reporting Inconsistencies**
- **Problem**: Reports might show different period structures for different dates
- **Solution Needed**: Versioning system for timetables

### 4. **Multiple Attendance for Same Period**
- **Problem**: If slot edited mid-day, could mark attendance twice
- **Solution Needed**: Validation to prevent duplicate attendance

## Recommended Solutions

### Short-term (Already Implemented)
1. ✅ Flexible matching by period name or time
2. ✅ Fallback to search by section and date only
3. ✅ Handle single-period attendance gracefully

### Medium-term (Should Implement)
1. **Timetable Versioning**
   ```sql
   ALTER TABLE timetables ADD COLUMN version INTEGER DEFAULT 1;
   ALTER TABLE timetables ADD COLUMN parent_timetable_id UUID;
   ALTER TABLE timetables ADD COLUMN valid_from DATE;
   ALTER TABLE timetables ADD COLUMN valid_until DATE;
   ```

2. **Slot Change Tracking**
   ```sql
   CREATE TABLE timetable_slot_history (
     id UUID PRIMARY KEY,
     original_slot_id UUID,
     changed_at TIMESTAMP,
     changed_by UUID,
     change_type TEXT, -- 'time_change', 'course_change', 'staff_change'
     old_data JSONB,
     new_data JSONB
   );
   ```

3. **Attendance Validation**
   ```typescript
   // Before marking attendance
   const existingAttendance = await checkDuplicateAttendance(
     section_id,
     attendance_date,
     period_name
   );
   if (existingAttendance) {
     return "Attendance already marked for this period today";
   }
   ```

### Long-term (Best Practice)
1. **Immutable Timetables**
   - Once attendance is marked, lock that timetable version
   - Create new version for changes
   - Link attendance to specific timetable version

2. **Period Master Table**
   ```sql
   CREATE TABLE period_definitions (
     id UUID PRIMARY KEY,
     institution_id UUID,
     period_code TEXT, -- 'P1', 'P2', etc.
     period_name TEXT, -- 'CET P1'
     standard_start_time TIME,
     standard_end_time TIME,
     is_active BOOLEAN
   );
   ```
   - Reference periods by definition ID
   - Slot changes don't affect period identity

3. **Attendance Reconciliation**
   - Tool to merge/split attendance records after timetable changes
   - Audit trail for all modifications

## Best Practices for Users

### Before Changing Timetable Slots:
1. **Check if attendance exists** for affected dates
2. **Export attendance reports** for record keeping
3. **Communicate changes** to staff/students
4. **Plan transition date** (when to switch to new timetable)

### When Changing Slots:
1. **Create new timetable version** rather than editing existing
2. **Set clear start/end dates** for each timetable version
3. **Document the reason** for changes

### After Changing Slots:
1. **Verify attendance marking** works correctly
2. **Check reports** for consistency
3. **Monitor for duplicate attendance** issues

## Current System Behavior Summary

✅ **What Works:**
- Historical attendance is preserved
- Attendance can be found even with different slot IDs
- Period name/time matching provides flexibility

⚠️ **Limitations:**
- Cannot handle complete period restructuring
- No versioning system
- Potential for duplicate attendance
- Orphaned records if timetable deleted

🎯 **Recommendation:**
Implement timetable versioning with clear validity periods to maintain data integrity while allowing flexibility for changes.