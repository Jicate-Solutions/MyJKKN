# Section Subdivision Testing Checklist

**Date:** 2025-10-11
**Feature:** Practical Class Section Subdivision
**Status:** Ready for Testing

---

## 📋 Testing Checklist

Use this checklist to verify the subdivision feature works correctly across all scenarios.

---

## 🎯 Prerequisites

- [ ] Have a test institution set up in the database
- [ ] Have a test section with at least 50-100 students
- [ ] Have a test course (practical/lab type)
- [ ] Have multiple test staff members assigned to the section
- [ ] Have a timetable created for the section

---

## 1. Creating Subdivided Slots

### 1.1 Basic Creation
- [ ] **Test Case**: Create a new slot with section subdivision enabled
  - Navigate to timetable editor
  - Click "+ Add Slot" or click empty period
  - Enable "Section Subdivision" checkbox
  - Select course and staff
  - Select subdivision type: "Practical"
  - Select subdivision mode: "Auto"
  - Click "Save"
  - **Expected**: Subdivision config dialog opens automatically
  - **Expected**: Default 2 groups created with students auto-distributed

### 1.2 Group Configuration
- [ ] **Test Case**: Adjust group count to 3
  - Click "+" to add a group
  - **Expected**: Third group appears with students redistributed
  - **Expected**: Distribution is roughly even
  - **Expected**: No student appears in multiple groups

- [ ] **Test Case**: Adjust group count to 10 (maximum)
  - Click "+" multiple times to reach 10 groups
  - **Expected**: Can add up to 10 groups
  - **Expected**: "+" button disabled at 10 groups
  - **Expected**: Students distributed across all groups

- [ ] **Test Case**: Reduce group count from 10 to 2
  - Click "-" multiple times
  - **Expected**: Groups removed starting from highest order
  - **Expected**: Students from removed groups redistributed
  - **Expected**: Cannot go below 2 groups

### 1.3 Manual Assignment Mode
- [ ] **Test Case**: Switch from Auto to Manual mode
  - Change "Student Assignment Mode" to "Manual"
  - **Expected**: "Rebalance Groups" button appears
  - **Expected**: Can now manually assign students
  - **Expected**: Validation shows if students are missing or duplicated

- [ ] **Test Case**: Manually assign students
  - Expand a group card
  - Click "Show All Students"
  - Check/uncheck students
  - **Expected**: Students can be moved between groups
  - **Expected**: Validation updates in real-time

- [ ] **Test Case**: Create assignment conflicts
  - Assign same student to multiple groups
  - **Expected**: Red warning banner appears
  - **Expected**: Shows list of conflicting students
  - **Expected**: Cannot save until conflicts resolved

- [ ] **Test Case**: Leave students unassigned
  - Uncheck some students from all groups
  - **Expected**: Warning shows "X students not assigned"
  - **Expected**: Lists unassigned students
  - **Expected**: Can still save (warning, not error)

- [ ] **Test Case**: Use "Rebalance Groups" button
  - Create uneven distribution
  - Click "Rebalance Groups"
  - **Expected**: Students redistributed evenly
  - **Expected**: Distribution stats show "Balanced"

### 1.4 Staff Assignment
- [ ] **Test Case**: Assign staff to groups
  - For each group, check staff checkboxes
  - **Expected**: Can assign multiple staff to one group
  - **Expected**: Can assign same staff to multiple groups
  - **Expected**: Red warning if no staff assigned to a group

- [ ] **Test Case**: Save with missing staff
  - Leave one group without staff
  - Try to save
  - **Expected**: Warning shows "At least one staff member required"
  - **Expected**: Can still save (validation allows it)

### 1.5 Group Metadata
- [ ] **Test Case**: Add lab room names
  - Edit "Lab/Room" field for each group
  - Enter values like "Lab Room 1", "Lab Room 2"
  - **Expected**: Values saved and displayed

- [ ] **Test Case**: Set max capacity
  - Edit "Max Capacity" field
  - Enter value less than current student count
  - **Expected**: Warning shows "Group exceeds maximum capacity"
  - **Expected**: Warning is visual only, doesn't block save

- [ ] **Test Case**: Edit group names
  - Change group names to custom values
  - Example: "Morning Batch - Lab A", "Afternoon Batch - Lab B"
  - **Expected**: Custom names saved and displayed

### 1.6 Subdivision Types
- [ ] **Test Case**: Create slot with type "Lab"
  - Select subdivision type: "Lab"
  - Complete configuration
  - **Expected**: Type reflected in timetable grid
  - **Expected**: Type shown in attendance marking

- [ ] **Test Case**: Create slot with type "Tutorial"
  - Select subdivision type: "Tutorial"
  - **Expected**: Works same as Practical/Lab

- [ ] **Test Case**: Create slot with type "Workshop"
  - Select subdivision type: "Workshop"
  - **Expected**: Works same as Practical/Lab

### 1.7 Saving and Verification
- [ ] **Test Case**: Save subdivision configuration
  - Complete all group setup
  - Click "Save Groups"
  - **Expected**: Dialog closes
  - **Expected**: Success message appears
  - **Expected**: Slot appears in timetable grid with purple background
  - **Expected**: Badge shows "X Groups"
  - **Expected**: Shows subdivision type icon (👥)

- [ ] **Test Case**: Verify in timetable grid
  - Look at the saved slot in grid
  - **Expected**: Purple background/border
  - **Expected**: Shows "👥 Practical" (or selected type)
  - **Expected**: Shows "X Groups" badge
  - **Expected**: Shows course code
  - **Expected**: Shows number of staff

---

## 2. Editing Subdivided Slots

### 2.1 Edit Basic Slot Details
- [ ] **Test Case**: Edit course or staff
  - Click on existing subdivided slot
  - Change course or add/remove staff
  - Click "Save"
  - **Expected**: Subdivision config dialog opens with existing groups
  - **Expected**: All previous group data intact

### 2.2 Edit Group Configuration
- [ ] **Test Case**: Change group count
  - Open existing subdivided slot
  - Increase group count
  - **Expected**: New groups created with students redistributed
  - **Expected**: Existing group names/staff preserved where possible

- [ ] **Test Case**: Change assignment mode
  - Switch from Auto to Manual or vice versa
  - **Expected**: Mode changes
  - **Expected**: Student assignments preserved
  - **Expected**: In Manual mode, can now modify assignments

- [ ] **Test Case**: Reassign students
  - Move students between groups
  - Save
  - Reopen slot
  - **Expected**: New assignments persisted

### 2.3 Edit Staff Assignments
- [ ] **Test Case**: Change group staff
  - Uncheck staff from one group
  - Check different staff
  - Save and reopen
  - **Expected**: New staff assignments saved

---

## 3. Attendance Marking for Subdivided Slots

### 3.1 Accessing Attendance
- [ ] **Test Case**: Navigate to attendance marking
  - From timetable view, click "Mark Attendance" on subdivided slot
  - **Expected**: Redirects to attendance mark page
  - **Expected**: URL contains all required parameters

### 3.2 Subdivision Detection
- [ ] **Test Case**: Verify subdivision detected
  - Wait for page to load
  - **Expected**: Info alert appears: "This is a subdivided [type] session with X groups"
  - **Expected**: SubdividedAttendanceGrid renders
  - **Expected**: No regular student grid shown

### 3.3 Grid Display
- [ ] **Test Case**: Overall summary card
  - Check top summary card
  - **Expected**: Shows total group count
  - **Expected**: Shows total student count
  - **Expected**: Shows overall Present/Absent/Percentage stats

- [ ] **Test Case**: Individual group cards
  - Check each group card
  - **Expected**: Shows group order and name
  - **Expected**: Shows lab room if configured
  - **Expected**: Shows student count and capacity
  - **Expected**: Shows assigned staff with badges
  - **Expected**: Shows group stats (Present/Absent/%)

### 3.4 Marking Attendance
- [ ] **Test Case**: Mark individual student present
  - Click on a student card (showing Absent/red)
  - **Expected**: Changes to Present (green)
  - **Expected**: Group stats update
  - **Expected**: Overall stats update

- [ ] **Test Case**: Mark individual student absent
  - Click on a student card (showing Present/green)
  - **Expected**: Changes to Absent (red)
  - **Expected**: Stats update

- [ ] **Test Case**: Use "Mark All Present" for group
  - Click "Mark All Present" button on a group
  - **Expected**: All students in that group marked Present
  - **Expected**: Student cards turn green
  - **Expected**: Group percentage shows 100%

- [ ] **Test Case**: Use "Mark All Absent" for group
  - Click "Mark All Absent" button on a group
  - **Expected**: All students in that group marked Absent
  - **Expected**: Student cards turn red
  - **Expected**: Group percentage shows 0%

- [ ] **Test Case**: Mixed attendance across groups
  - Mark Group 1: All present
  - Mark Group 2: Half present, half absent
  - Mark Group 3: All absent
  - **Expected**: Each group shows correct stats
  - **Expected**: Overall percentage is average across all students

### 3.5 Search Functionality
- [ ] **Test Case**: Search by student name
  - Enter student first name in search box
  - **Expected**: Only matching students shown across all groups
  - **Expected**: Groups without matches show "No matching students"

- [ ] **Test Case**: Search by roll number
  - Enter roll number in search box
  - **Expected**: Student with that roll number shown

- [ ] **Test Case**: Clear search
  - Clear search box
  - **Expected**: All students reappear

### 3.6 Capacity Warnings
- [ ] **Test Case**: Group exceeding capacity
  - If a group has more students than max_capacity
  - **Expected**: Red warning alert appears in group header
  - **Expected**: Shows "Group exceeds maximum capacity: X/Y"

### 3.7 Saving Attendance
- [ ] **Test Case**: Save subdivided attendance
  - Mark attendance for all groups
  - Click "Save Attendance"
  - **Expected**: Success message appears
  - **Expected**: Confirmation modal shows group-wise summary
  - **Expected**: Redirects or stays on page in read-only mode

- [ ] **Test Case**: Verify saved data in database
  - Check `daily_attendance` table
  - Check `attendance_data` JSONB column
  - **Expected**: Contains `is_subdivided: true`
  - **Expected**: Contains `subdivision_type`
  - **Expected**: Contains `groups` array with student data per group

### 3.8 Loading Existing Attendance
- [ ] **Test Case**: Reload page with existing attendance
  - Navigate away from page
  - Return to mark attendance for same slot/date
  - **Expected**: Subdivision groups load correctly
  - **Expected**: Previous attendance data pre-populated
  - **Expected**: Shows in read-only mode

- [ ] **Test Case**: Edit existing attendance
  - Click "Edit Attendance" button
  - Change some attendance statuses
  - Save
  - **Expected**: Updates saved
  - **Expected**: Shows updated stats

---

## 4. Edge Cases

### 4.1 Student Count Edge Cases
- [ ] **Test Case**: Section with very few students (10 students, 2 groups)
  - Create subdivision with 2 groups
  - **Expected**: 5 students per group

- [ ] **Test Case**: Uneven distribution (97 students, 3 groups)
  - Create subdivision with 3 groups in Auto mode
  - **Expected**: Groups have 33, 32, 32 or similar distribution
  - **Expected**: No student duplicated or missing

- [ ] **Test Case**: Large section (200 students, 10 groups)
  - Create subdivision with 10 groups
  - **Expected**: 20 students per group
  - **Expected**: Page performance acceptable
  - **Expected**: All students accounted for

### 4.2 Validation Edge Cases
- [ ] **Test Case**: All students in one group (Manual mode)
  - In manual mode, assign all students to Group 1
  - **Expected**: Other groups show "0 students"
  - **Expected**: No validation error (warning only)
  - **Expected**: Can save

- [ ] **Test Case**: Empty group (Manual mode)
  - Remove all students from one group
  - Keep staff assigned
  - **Expected**: Group shows "No students assigned"
  - **Expected**: Can still save

### 4.3 Conflict Prevention
- [ ] **Test Case**: Combined class + subdivision
  - Try to enable both "Combined Class" and "Section Subdivision"
  - **Expected**: Cannot enable both simultaneously
  - **Expected**: Warning message explains mutual exclusion

- [ ] **Test Case**: Semester timetable
  - Open semester-level timetable
  - Try to create slot
  - **Expected**: "Section Subdivision" option not shown
  - **Expected**: Feature only for section-level timetables

### 4.4 Browser/Performance
- [ ] **Test Case**: Large subdivided grid (10 groups, 100 students each)
  - Mark attendance for 1000 students across 10 groups
  - **Expected**: Page loads in reasonable time
  - **Expected**: Scrolling is smooth
  - **Expected**: Search works quickly
  - **Expected**: Bulk actions respond quickly

- [ ] **Test Case**: Mobile responsiveness
  - Test on mobile viewport
  - **Expected**: Groups stack vertically
  - **Expected**: Student cards responsive
  - **Expected**: All actions accessible

---

## 5. Integration Testing

### 5.1 Multi-Staff Scenarios
- [ ] **Test Case**: Staff assigned to multiple groups
  - Assign same staff to Groups 1 and 2
  - Have that staff mark attendance
  - **Expected**: Can mark attendance for both groups

- [ ] **Test Case**: Different staff per group
  - Group 1: Staff A
  - Group 2: Staff B
  - Have Staff A mark attendance
  - **Expected**: Can mark for their assigned groups

### 5.2 Date/Time Scenarios
- [ ] **Test Case**: Mark attendance on different dates
  - Create subdivided slot for Monday
  - Mark attendance for this Monday
  - Mark attendance for next Monday
  - **Expected**: Separate attendance records
  - **Expected**: Each date loads correct data

- [ ] **Test Case**: Multiple subdivided periods same day
  - Create 2 subdivided slots on same day
  - Mark attendance for both
  - **Expected**: Each period tracked separately
  - **Expected**: Groups can differ between periods

### 5.3 Permission Testing
- [ ] **Test Case**: Admin user
  - Login as admin
  - Mark attendance for subdivided slot
  - **Expected**: Full access to mark all groups

- [ ] **Test Case**: Faculty user (assigned to group)
  - Login as faculty assigned to Group 1
  - **Expected**: Can mark attendance for their group
  - **Expected**: Can see other groups (read-only or full access based on permissions)

---

## 6. Data Integrity

### 6.1 Database Verification
- [ ] **Test Case**: Timetable data structure
  - Query `timetables` table
  - Check `timetable_data` JSONB
  - **Expected**: Contains `is_subdivided: true`
  - **Expected**: Contains `sub_slots` array with student_ids

- [ ] **Test Case**: Attendance data structure
  - Query `daily_attendance` table
  - Check `attendance_data` JSONB
  - **Expected**: Contains `is_subdivided: true`
  - **Expected**: Contains `groups` array with students per group

- [ ] **Test Case**: Student table integrity
  - Check `students` table
  - **Expected**: `section_id` never changed
  - **Expected**: Students remain in original section

### 6.2 Data Migration
- [ ] **Test Case**: Load old non-subdivided attendance
  - Have existing attendance from before subdivision feature
  - Load in attendance mark page
  - **Expected**: Regular grid shown (not subdivided grid)
  - **Expected**: All existing data intact

- [ ] **Test Case**: Backward compatibility
  - Create regular (non-subdivided) slot
  - Mark attendance
  - **Expected**: Works exactly as before
  - **Expected**: No regression in existing functionality

---

## 7. Error Handling

### 7.1 Network Errors
- [ ] **Test Case**: Save with network failure
  - Mark attendance
  - Simulate network disconnection
  - Click Save
  - **Expected**: Error message shown
  - **Expected**: Data not lost (can retry)

### 7.2 Validation Errors
- [ ] **Test Case**: Save without marking attendance
  - Load subdivided attendance page
  - Try to save without marking any attendance
  - **Expected**: Validation message or confirmation dialog

### 7.3 Load Errors
- [ ] **Test Case**: Corrupted subdivision data
  - Manually corrupt `sub_slots` in database
  - Try to load attendance
  - **Expected**: Graceful error message
  - **Expected**: Fallback to regular grid or safe mode

---

## ✅ Testing Summary

### Automated Tests (Future)
- [ ] Unit tests for validation utilities
- [ ] Unit tests for auto-distribution algorithm
- [ ] Component tests for SubdividedAttendanceGrid
- [ ] Component tests for SubdivisionConfigDialog
- [ ] Integration tests for data flow

### Manual Testing Priority
1. **High Priority**:
   - Create subdivided slot (auto mode)
   - Mark attendance for subdivided slot
   - Save and verify data
   - Edit existing subdivided slot
   - Load existing subdivided attendance

2. **Medium Priority**:
   - Manual assignment mode
   - Edge cases (uneven distribution)
   - Multiple subdivision types
   - Staff assignments

3. **Low Priority**:
   - Extreme cases (10 groups, 200 students)
   - Mobile responsiveness
   - Performance testing

---

## 🐛 Bug Report Template

If you find issues, report them with:

```markdown
**Bug Title**: [Brief description]

**Steps to Reproduce**:
1.
2.
3.

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What actually happened]

**Environment**:
- Browser:
- User Role:
- Section Size:
- Group Count:

**Screenshots/Logs**:
[If applicable]

**Database State**:
[Relevant JSONB data if needed]
```

---

**Testing Started:** [DATE]
**Testing Completed:** [DATE]
**Tested By:** [NAME/ROLE]
**Result:** PASS / FAIL / PARTIAL

**Notes:**
[Add any additional observations or recommendations]
