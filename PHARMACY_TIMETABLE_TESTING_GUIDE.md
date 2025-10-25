# Pharmacy Timetable Enhancement - Formal Testing Guide

**Date Created:** 2025-10-25
**Feature:** Dual-Mode Period System (Standard vs Practical)
**Version:** 1.0
**Status:** Ready for Execution

---

## 📋 Table of Contents

1. [Pre-Testing Setup](#pre-testing-setup)
2. [Test Suite 1: Standard Mode (Regression)](#test-suite-1-standard-mode-regression)
3. [Test Suite 2: Practical Mode (New Feature)](#test-suite-2-practical-mode-new-feature)
4. [Test Suite 3: Conflict Detection](#test-suite-3-conflict-detection)
5. [Test Suite 4: Edge Cases](#test-suite-4-edge-cases)
6. [Test Suite 5: Performance](#test-suite-5-performance)
7. [Test Results Summary](#test-results-summary)

---

## 🔧 Pre-Testing Setup

### Prerequisites

- [x] Development server running (`npm run dev`)
- [x] Access to test institution/academic year
- [x] Multiple test sections created
- [x] Multiple test courses created
- [x] Test students enrolled in sections
- [x] Test staff accounts created
- [x] Lab/room resources configured

### Test Data Requirements

**Required Test Data:**
- Institution: 1 test institution
- Academic Year: 1 active academic year
- Degree/Program: 1 test program
- Department: 1 test department
- Semester: 1 test semester
- Sections: Minimum 4 sections (Section A, B, C, D)
- Courses: Minimum 5 courses (3 theory + 2 practical)
- Students: Minimum 60 students (15 per section)
- Staff: Minimum 4 staff members
- Labs: Minimum 4 labs (AG-1, BG-3, BS-5, BT-8)

### Browser & DevTools

- **Browser:** Chrome/Edge (latest version)
- **DevTools:** Open Console tab to monitor errors
- **Network Tab:** Monitor API calls
- **React DevTools:** (Optional) For component inspection

---

## Test Suite 1: Standard Mode (Regression)

**Objective:** Ensure existing timetable functionality works without regression

### Test 1.1: Create Standard Timetable

**Test ID:** STD-001
**Priority:** Critical
**Type:** Regression

**Steps:**
1. Navigate to Academic → Timetables
2. Click "Create New Timetable"
3. Select:
   - Type: "Section-Level"
   - Section: "Section A"
   - Fill other required fields
4. Click "Create Timetable"

**Expected Results:**
- ✅ Timetable created successfully
- ✅ Redirected to timetable details page
- ✅ No console errors
- ✅ Success toast notification shown

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 1.2: Add Standard Period Slot

**Test ID:** STD-002
**Priority:** Critical
**Type:** Regression

**Steps:**
1. Open created timetable from Test 1.1
2. Click "Add Slot" or click on empty grid cell
3. **Verify Default Mode:**
   - Period Mode should default to "Standard"
   - Standard configuration form should be visible
4. Configure slot:
   - Day: Monday
   - Period: Period 1
   - **Period Mode:** Standard (should be pre-selected)
   - Course: Select a theory course
   - Staff: Select a staff member
   - Section: Pre-filled (Section A)
5. Click "Save"

**Expected Results:**
- ✅ Default mode is "Standard"
- ✅ Standard mode form displays correctly
- ✅ Slot saved successfully
- ✅ Slot appears in grid with correct course/staff
- ✅ No console errors
- ✅ Course badge shown correctly

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 1.3: Mark Attendance (Standard Mode)

**Test ID:** STD-003
**Priority:** Critical
**Type:** Regression

**Steps:**
1. Navigate to Academic → Attendance → Mark Attendance
2. Select:
   - Timetable: Created in Test 1.1
   - Date: Today's date
   - Period: Period with standard slot
3. **Verify Standard Flow:**
   - Students should load immediately
   - No batch/lab selector should appear
   - All Section A students should be listed
4. Mark attendance for 10 students as Present, 5 as Absent
5. Click "Save Attendance"

**Expected Results:**
- ✅ Students load automatically (no manual selection needed)
- ✅ No practical period selector shown
- ✅ All expected students appear
- ✅ Attendance saves successfully
- ✅ Success notification shown
- ✅ Redirects to attendance report/list
- ✅ No console errors

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 1.4: Verify Attendance Data Structure (Standard)

**Test ID:** STD-004
**Priority:** High
**Type:** Data Validation

**Steps:**
1. Open Supabase dashboard
2. Navigate to `student_attendance` table
3. Find the attendance record created in Test 1.3
4. Examine `attendance_data` JSONB field

**Expected Data Structure:**
```json
{
  "[period_slot_id]": {
    "period_mode": "standard",
    "course_id": "[course-uuid]",
    "students": [
      { "id": "[student-uuid]", "status": "Present", "marked_at": "[timestamp]" },
      { "id": "[student-uuid]", "status": "Absent" }
    ]
  }
}
```

**Expected Results:**
- ✅ `period_mode` field exists and equals "standard"
- ✅ `course_id` field exists
- ✅ `students` array has correct count
- ✅ Each student has `id` and `status`
- ✅ No `batch_selected` or `lab_selected` fields (practical-only fields)

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

## Test Suite 2: Practical Mode (New Feature)

**Objective:** Verify practical period functionality works correctly

### Test 2.1: Create Semester-Level Timetable

**Test ID:** PRAC-001
**Priority:** Critical
**Type:** New Feature

**Steps:**
1. Navigate to Academic → Timetables
2. Click "Create New Timetable"
3. Select:
   - Type: "Semester-Level"
   - Semester: Test Semester
   - **DO NOT select a specific section**
   - Fill other required fields
4. Click "Create Timetable"

**Expected Results:**
- ✅ Timetable created successfully
- ✅ `section_id` field is NULL in database
- ✅ `timetable_type` is "semester"
- ✅ Redirected to timetable details
- ✅ No console errors

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 2.2: Configure Practical Period

**Test ID:** PRAC-002
**Priority:** Critical
**Type:** New Feature

**Steps:**
1. Open semester-level timetable from Test 2.1
2. Click to add a new slot (e.g., Monday, Period 2)
3. **Select Period Mode:**
   - Click "Practical" mode radio button
   - Verify UI changes to practical configuration
4. **Configure Batches:**
   - Click "Add Batch" 4 times to create Batches A, B, C, D
   - For **Batch A:**
     - Batch Name: "Batch A"
     - Assignment Type: "Students from sections"
     - Sections: Select "Section A" and "Section B"
     - Estimated Count: 30
   - For **Batch B:**
     - Batch Name: "Batch B"
     - Assignment Type: "Students from sections"
     - Sections: Select "Section C"
     - Estimated Count: 15
   - For **Batch C:**
     - Batch Name: "Batch C"
     - Assignment Type: "Students from sections"
     - Sections: Select "Section D"
     - Estimated Count: 15
   - For **Batch D:**
     - Batch Name: "Batch D"
     - Assignment Type: "Manual student selection"
     - Estimated Count: 10
5. **Select Available Labs:**
   - Check: AG-1, BG-3, BS-5, BT-8 (4 labs)
6. **Select Available Courses:**
   - Check 3 practical courses
7. **Rotation Type:** Manual
8. Click "Save"

**Expected Results:**
- ✅ Practical mode selector works
- ✅ UI switches to practical configuration form
- ✅ Can add/remove batches dynamically
- ✅ Section multi-select works for batches
- ✅ Lab multi-select works
- ✅ Course multi-select works
- ✅ Summary shows: "4 batches, 4 labs, 3 courses"
- ✅ Slot saves successfully
- ✅ 🔬 Practical Period indicator shown in grid
- ✅ No console errors

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 2.3: Mark Attendance - Batch A (First Batch)

**Test ID:** PRAC-003
**Priority:** Critical
**Type:** New Feature

**Steps:**
1. Navigate to Academic → Attendance → Mark Attendance
2. Select:
   - Timetable: Semester-level timetable from Test 2.1
   - Date: Today's date
   - Period: Practical period from Test 2.2
3. **Verify Practical Period Selector Appears:**
   - Should see 🔬 "Practical Period - Select Batch & Lab" card
   - Should see three dropdowns: Batch, Lab, Course
   - Students should NOT load yet
4. **Make Selections:**
   - Batch: "Batch A"
   - Wait for conflict check (should show ✓ Available)
   - Lab: "AG-1"
   - Course: "Pharmaceutical Organic Chemistry"
5. Click "Load Students & Mark Attendance"
6. **Verify Students Load:**
   - Should load students from Section A + Section B (Batch A sections)
   - Count should be ~30 students
7. Mark 25 Present, 5 Absent
8. Click "Save Attendance"

**Expected Results:**
- ✅ Practical selector card appears
- ✅ Students do NOT auto-load (wait for batch selection)
- ✅ Batch dropdown shows all 4 batches with student counts
- ✅ Conflict check shows "✓ Available - No attendance marked yet"
- ✅ Lab dropdown shows 4 labs with capacities
- ✅ Course dropdown shows 3 courses
- ✅ "Load Students" button enabled after all selections
- ✅ Correct students load (Section A + B only)
- ✅ Attendance saves successfully
- ✅ Success notification shown
- ✅ No console errors

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 2.4: Verify Practical Attendance Data Structure

**Test ID:** PRAC-004
**Priority:** High
**Type:** Data Validation

**Steps:**
1. Open Supabase dashboard
2. Navigate to `student_attendance` table
3. Find the attendance record created in Test 2.3
4. Examine `attendance_data` JSONB field

**Expected Data Structure:**
```json
{
  "[period_slot_id]": {
    "period_mode": "practical",
    "batch_selected": {
      "batch_id": "batch_a",
      "batch_name": "Batch A"
    },
    "lab_selected": "AG-1",
    "course_selected": "[course-uuid]",
    "students": [
      { "id": "[student-uuid]", "status": "Present", "marked_at": "[timestamp]" },
      { "id": "[student-uuid]", "status": "Absent" }
    ],
    "marked_by": "[staff-uuid]",
    "marked_at": "[timestamp]"
  }
}
```

**Expected Results:**
- ✅ `period_mode` equals "practical"
- ✅ `batch_selected` object exists with batch_id and batch_name
- ✅ `lab_selected` contains lab ID
- ✅ `course_selected` contains course UUID
- ✅ `students` array has correct count (Section A + B students)
- ✅ `marked_by` contains staff UUID
- ✅ `marked_at` timestamp present
- ✅ `section_ids` array contains Section A and B UUIDs

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 2.5: Mark Attendance - Batch B (Different Lab)

**Test ID:** PRAC-005
**Priority:** High
**Type:** New Feature

**Steps:**
1. Navigate to Academic → Attendance → Mark Attendance
2. Select same timetable, date, period as Test 2.3
3. **Make Different Selections:**
   - Batch: "Batch B"
   - Wait for conflict check (should show ✓ Available)
   - Lab: "BG-3" (different lab than Batch A)
   - Course: "Pharmaceutical Analysis" (different course)
4. Click "Load Students"
5. **Verify Students:**
   - Should load students from Section C only (Batch B sections)
   - Count should be ~15 students
   - Should be DIFFERENT students than Batch A
6. Mark attendance
7. Click "Save"

**Expected Results:**
- ✅ Batch B conflict check passes (different batch allowed)
- ✅ Can select different lab than Batch A
- ✅ Can select different course
- ✅ Correct students load (Section C only)
- ✅ Attendance saves successfully
- ✅ No interference with Batch A attendance
- ✅ No console errors

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

## Test Suite 3: Conflict Detection

**Objective:** Verify conflict detection prevents duplicate batch attendance

### Test 3.1: Duplicate Batch - Same Period, Same Date (SHOULD BLOCK)

**Test ID:** CONF-001
**Priority:** Critical
**Type:** Validation

**Steps:**
1. Navigate to Academic → Attendance → Mark Attendance
2. Select same timetable, date, period as Test 2.3
3. **Attempt to Select Batch A Again:**
   - Batch: "Batch A" (already marked in Test 2.3)
   - Wait for conflict check to complete

**Expected Results:**
- ✅ Conflict check detects existing record
- ✅ Red alert appears: "⚠️ This batch already has attendance marked..."
- ✅ Alert shows which lab was used: "...in Lab AG-1..."
- ✅ Alert shows time: "...at [time]"
- ✅ "Load Students" button is DISABLED
- ✅ Cannot proceed with marking duplicate attendance
- ✅ No console errors

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 3.2: Same Batch - Different Period (SHOULD ALLOW)

**Test ID:** CONF-002
**Priority:** High
**Type:** Validation

**Steps:**
1. Add another practical period slot to the timetable (e.g., Period 3)
2. Configure it with same batches/labs as Test 2.2
3. Navigate to Mark Attendance
4. Select same timetable, same date, but **Period 3** (different period)
5. Select:
   - Batch: "Batch A"
   - Lab: Any lab
   - Course: Any course
6. Wait for conflict check

**Expected Results:**
- ✅ Conflict check shows "✓ Available"
- ✅ Green success alert appears
- ✅ "Load Students" button is ENABLED
- ✅ Can mark attendance successfully
- ✅ No conflict error (different period allowed)

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 3.3: Same Batch - Different Date (SHOULD ALLOW)

**Test ID:** CONF-003
**Priority:** High
**Type:** Validation

**Steps:**
1. Navigate to Mark Attendance
2. Select same timetable, same period as Test 2.3
3. **Select Different Date:** Tomorrow's date
4. Select:
   - Batch: "Batch A"
   - Lab: Any lab
   - Course: Any course
5. Wait for conflict check

**Expected Results:**
- ✅ Conflict check shows "✓ Available"
- ✅ No conflict error (different date allowed)
- ✅ Can mark attendance for different date
- ✅ Same batch can use different lab on different day (rotation)

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 3.4: Different Batch - Same Lab, Same Period (SHOULD ALLOW)

**Test ID:** CONF-004
**Priority:** High
**Type:** Validation

**Steps:**
1. This was already tested in Test 2.5 (Batch B with different lab)
2. **Additional Test:** Try using SAME lab for different batch:
   - Navigate to Mark Attendance
   - Select same timetable, date, period as Test 2.3
   - Batch: "Batch C" (different batch)
   - Lab: "AG-1" (SAME lab as Batch A used)
   - Course: Any course

**Expected Results:**
- ✅ Conflict check shows "✓ Available"
- ✅ Allows different batch to use same lab simultaneously
- ✅ This is correct behavior (different batches can use different areas of same lab)
- ✅ OR: Block if strict lab resource management is desired (design decision)

**Note:** Current implementation ALLOWS this. If strict lab resource management is needed, this would require enhancement to check lab availability across all batches for same period.

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

## Test Suite 4: Edge Cases

**Objective:** Test boundary conditions and error scenarios

### Test 4.1: No Batches Configured

**Test ID:** EDGE-001
**Priority:** Medium
**Type:** Error Handling

**Steps:**
1. Create practical period slot
2. Do NOT add any batches
3. Select labs and courses only
4. Attempt to save

**Expected Results:**
- ✅ Validation warning: "⚠️ At least one batch should be configured"
- ✅ OR: Prevents saving
- ✅ Clear error message shown
- ✅ No crash or console errors

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 4.2: No Labs Selected

**Test ID:** EDGE-002
**Priority:** Medium
**Type:** Error Handling

**Steps:**
1. Create practical period with batches
2. Do NOT select any labs
3. Select courses
4. Attempt to save

**Expected Results:**
- ✅ Validation warning: "⚠️ At least one lab should be selected"
- ✅ Clear visual indicator (red border or warning text)
- ✅ Can still save (labs are optional) OR prevents saving (design decision)

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 4.3: No Courses Selected

**Test ID:** EDGE-003
**Priority:** Medium
**Type:** Error Handling

**Steps:**
1. Create practical period with batches and labs
2. Do NOT select any courses
3. Attempt to save

**Expected Results:**
- ✅ Validation warning: "⚠️ At least one course should be selected"
- ✅ Clear visual indicator
- ✅ Prevents incomplete configuration

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 4.4: Incomplete Attendance Selection

**Test ID:** EDGE-004
**Priority:** High
**Type:** Error Handling

**Steps:**
1. Navigate to practical period attendance marking
2. Select only Batch (do not select Lab or Course)
3. Attempt to click "Load Students"

**Expected Results:**
- ✅ "Load Students" button is DISABLED
- ✅ Button text shows: "Complete selections to load students"
- ✅ No students load
- ✅ No crash or error

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 4.5: Empty Batch (No Sections/Students)

**Test ID:** EDGE-005
**Priority:** Medium
**Type:** Error Handling

**Steps:**
1. Create batch with Assignment Type: "Students from sections"
2. Do NOT select any sections
3. Save and mark attendance using this batch

**Expected Results:**
- ✅ Warning shown: "No sections selected for this batch"
- ✅ OR: Loads 0 students gracefully
- ✅ Shows message: "No students found for this batch"
- ✅ Does not crash

**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 4.6: Manual Selection Batch (Future Feature)

**Test ID:** EDGE-006
**Priority:** Low
**Type:** Future Enhancement

**Steps:**
1. Create batch with Assignment Type: "Manual student selection"
2. Mark attendance using this batch

**Expected Results:**
- ✅ Currently: Loads 0 students OR shows placeholder
- ✅ Future: Should show student selector UI
- ✅ Does not crash

**Status:** ☐ Pass ☐ Fail ☐ Not Implemented
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

## Test Suite 5: Performance

**Objective:** Verify acceptable performance

### Test 5.1: Large Batch Loading

**Test ID:** PERF-001
**Priority:** Medium
**Type:** Performance

**Steps:**
1. Create batch with 2-3 sections (~50-60 students)
2. Mark attendance
3. Measure time from "Load Students" click to students appearing

**Expected Results:**
- ✅ Load time: < 2 seconds for 60 students
- ✅ No UI freeze or lag
- ✅ Smooth loading animation

**Actual Load Time:** __________ seconds
**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 5.2: Conflict Check Speed

**Test ID:** PERF-002
**Priority:** Medium
**Type:** Performance

**Steps:**
1. Mark attendance for 3-4 batches
2. Go back to mark attendance again
3. Select already-marked batch
4. Measure conflict check time

**Expected Results:**
- ✅ Conflict check: < 1 second
- ✅ Clear loading indicator shown
- ✅ No UI freeze

**Actual Check Time:** __________ seconds
**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

### Test 5.3: Practical Config Save Performance

**Test ID:** PERF-003
**Priority:** Low
**Type:** Performance

**Steps:**
1. Create practical period with 4 batches, 4 labs, 3 courses
2. Measure save time

**Expected Results:**
- ✅ Save time: < 2 seconds
- ✅ No timeout errors
- ✅ Success notification appears promptly

**Actual Save Time:** __________ seconds
**Status:** ☐ Pass ☐ Fail
**Execution Date:** __________
**Tester:** __________
**Notes:** ____________________________________________

---

## Test Results Summary

### Overall Test Statistics

| Category | Total Tests | Passed | Failed | Skipped | Pass Rate |
|----------|-------------|--------|--------|---------|-----------|
| Standard Mode (Regression) | 4 | ___ | ___ | ___ | ___% |
| Practical Mode (New Feature) | 5 | ___ | ___ | ___ | ___% |
| Conflict Detection | 4 | ___ | ___ | ___ | ___% |
| Edge Cases | 6 | ___ | ___ | ___ | ___% |
| Performance | 3 | ___ | ___ | ___ | ___% |
| **TOTAL** | **22** | ___ | ___ | ___ | ___% |

### Critical Issues Found

| Issue ID | Severity | Description | Test ID | Status |
|----------|----------|-------------|---------|--------|
| | | | | |
| | | | | |

### Minor Issues Found

| Issue ID | Severity | Description | Test ID | Status |
|----------|----------|-------------|---------|--------|
| | | | | |
| | | | | |

### Performance Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Student Load Time (60 students) | < 2s | ___s | ☐ Pass ☐ Fail |
| Conflict Check Time | < 1s | ___s | ☐ Pass ☐ Fail |
| Practical Config Save | < 2s | ___s | ☐ Pass ☐ Fail |

### Browser Compatibility

| Browser | Version | Status | Notes |
|---------|---------|--------|-------|
| Chrome | _____ | ☐ Pass ☐ Fail | |
| Edge | _____ | ☐ Pass ☐ Fail | |
| Firefox | _____ | ☐ Pass ☐ Fail | |
| Safari | _____ | ☐ Pass ☐ Fail | |

### Sign-Off

**Tested By:** __________________________________
**Date:** __________
**Overall Status:** ☐ Ready for Production ☐ Needs Fixes ☐ Major Issues

**Recommendation:**
```
[ ] APPROVE for production deployment
[ ] APPROVE with minor fixes
[ ] REJECT - critical issues must be resolved
```

**Comments:**
________________________________________________________________
________________________________________________________________
________________________________________________________________

---

## Appendix A: Test Data Cleanup

After testing, clean up test data:

```sql
-- Delete test attendance records
DELETE FROM student_attendance
WHERE timetable_id IN (SELECT id FROM timetables WHERE timetable_name LIKE '%TEST%');

-- Delete test timetables
DELETE FROM timetables WHERE timetable_name LIKE '%TEST%';

-- Or keep for future testing reference
```

---

## Appendix B: Quick Test Execution Checklist

**Pre-Flight:**
- [ ] Server running
- [ ] Test data created
- [ ] DevTools open
- [ ] Document ready

**Execution:**
- [ ] Suite 1: Standard Mode (4 tests) - ~10 minutes
- [ ] Suite 2: Practical Mode (5 tests) - ~20 minutes
- [ ] Suite 3: Conflict Detection (4 tests) - ~15 minutes
- [ ] Suite 4: Edge Cases (6 tests) - ~20 minutes
- [ ] Suite 5: Performance (3 tests) - ~10 minutes

**Total Estimated Time:** ~75 minutes (1 hour 15 minutes)

---

**Document Status:** ✅ Ready for Execution
**Last Updated:** 2025-10-25
**Version:** 1.0
