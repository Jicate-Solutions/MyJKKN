# Attendance Module Workflow Guide

## Overview

The attendance module allows faculty to mark student attendance for scheduled classes. The system uses a timetable-based approach where attendance is marked for specific periods on specific dates.

## Key Concepts

### 1. Timetable Structure

- **Timetable**: Created for a specific academic period with start and end dates
- **Timetable Slots**: Day-based periods (Monday, Tuesday, etc.) assigned to courses
- **Sections**: Student groups assigned to specific timetable slots via `timetable_slot_sections`
- **Students**: Enrolled in sections with proper hierarchy (institution → degree → program → department → semester → section)

### 2. Attendance Workflow

#### Step 1: Filter Selection

1. Select Institution
2. Select Academic Year
3. Select Degree
4. Select Program
5. Select Department
6. Select Semester
7. Select Section (optional - filters available periods)
8. Select Attendance Date

#### Step 2: Period Validation

The system performs these checks:

- ✅ Date falls within timetable period (start_date ≤ selected_date ≤ end_date)
- ✅ Day of week matches timetable slots
- ✅ Slots have sections assigned
- ✅ Only non-break slots are shown

#### Step 3: Period Selection

Available periods display:

- Period name and timings
- Course information (code and name)
- Assigned sections (e.g., "Sections: BATCH A, BATCH B")

#### Step 4: Student Roster Loading

When a period is selected:

- System fetches students from ALL sections assigned to that slot
- Students are filtered by active status
- Existing attendance records are loaded if any
- Default status is "Present" for new records

#### Step 5: Marking Attendance

- Individual toggle: Click student row to toggle Present/Absent
- Bulk selection: Use checkboxes to select multiple students
- Bulk actions: Mark selected as Present or Absent
- Real-time statistics update

#### Step 6: Saving Attendance

- Records are saved with user ID and institution ID
- Uses upsert to handle existing records
- Unique constraint on (student_id, timetable_slot_id, attendance_date)

## Database Schema

### Key Tables

1. **timetables**

   - Has `start_date` and `end_date` for the period
   - Links to academic hierarchy

2. **timetable_slots**

   - Has `day_of_week` (MONDAY, TUESDAY, etc.)
   - Links to period, course, and staff

3. **timetable_slot_sections**

   - Junction table linking slots to sections
   - Allows multiple sections per slot

4. **students**

   - Has `section_id` linking to sections table
   - Must have matching hierarchy for attendance

5. **student_attendance**
   - Stores attendance records
   - Has unique constraint to prevent duplicates

## Common Issues & Solutions

### Issue: "No classes scheduled for the selected date and criteria"

**Causes:**

1. Selected date is outside timetable period
2. No timetable exists for the selected filters
3. No slots exist for the day of week
4. Slots don't have sections assigned

**Solutions:**

1. Check timetable start/end dates
2. Verify timetable is active
3. Ensure slots are created for the day
4. Assign sections to timetable slots

### Issue: "No students found in roster"

**Causes:**

1. No sections assigned to the slot
2. No students in the assigned sections
3. Students have different hierarchy values

**Solutions:**

1. Assign sections to timetable slots
2. Enroll students in the sections
3. Verify student hierarchy matches filters

## Best Practices

1. **Timetable Setup**

   - Set realistic date ranges for timetables
   - Assign sections to slots during creation
   - Verify all slots have proper course assignments

2. **Student Management**

   - Ensure students are properly enrolled with complete hierarchy
   - Keep student status as 'active'
   - Assign students to sections before marking attendance

3. **Performance**
   - Use section filter to reduce available periods
   - Mark attendance promptly to avoid conflicts

## API Endpoints Used

1. **getTimetableSlotsForDate**

   - Validates date within timetable period
   - Returns slots with section information
   - Filters by day of week

2. **getAttendanceRoster**

   - Fetches students from assigned sections
   - Loads existing attendance records
   - Returns combined roster data

3. **batchUpdateAttendance**
   - Saves multiple attendance records
   - Uses upsert to handle updates
   - Maintains data integrity

## Security Features

1. **Authentication Required**

   - User must be logged in
   - User ID tracked for audit

2. **Institution Context**

   - Records linked to user's institution
   - Cross-institution access prevented

3. **Permission Checks**
   - View permission required to see attendance
   - Create/Edit permission required to mark attendance
