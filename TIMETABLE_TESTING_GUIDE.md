# Timetable Details Page - Testing Guide

**Date:** 2025-10-25
**Version:** Refactored (Phase 4 Complete)
**Tester:** _______________

---

## 🔧 Pre-Testing Setup

1. **Start the development server:**
   ```bash
   cd "D:\Projects\JKKN\MYJKKN Portal\MyJKKN"
   npm run dev
   ```
   Server should be running on `http://localhost:3000` or `http://localhost:3001`

2. **Login to the application** with appropriate credentials

3. **Navigate to:** Academic → Timetables → Click on any existing timetable

---

## ✅ Test Cases

### **Test 1: Initial Page Load**

**Objective:** Verify the page loads correctly with all data

**Steps:**
1. Navigate to a timetable details page
2. Observe the loading state
3. Check that all data loads correctly

**Expected Results:**
- ✅ Page shows loading spinner initially
- ✅ Timetable header displays correct name and details
- ✅ Action buttons render (Configure Periods, Format Selector, etc.)
- ✅ Timetable grid displays correctly
- ✅ No console errors in browser DevTools
- ✅ Page load time: <1 second (after initial compilation)

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 2: Period Configuration**

**Objective:** Test adding, removing, and reordering periods

**Steps:**
1. Click "Configure Periods" button
2. Click "Add Period" and select a period
3. Try drag-and-drop to reorder periods
4. Click the lock icon on a period
5. Try to remove a period
6. Click "Save" button

**Expected Results:**
- ✅ Period Configuration dialog opens (lazy-loaded, should show loading briefly)
- ✅ Can add new periods from available list
- ✅ Can drag-and-drop to reorder
- ✅ Lock icon toggles correctly
- ✅ Cannot remove locked periods
- ✅ Save button persists changes
- ✅ Dialog closes after save
- ✅ Main grid updates with new period order

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 3: Slot Creation (Regular Slot)**

**Objective:** Test creating a regular timetable slot

**Steps:**
1. Click on an empty cell in the timetable grid
2. Select a course from dropdown
3. Select staff member(s)
4. Select section(s)
5. Click "Save"

**Expected Results:**
- ✅ Slot Dialog opens (lazy-loaded)
- ✅ Course dropdown populated (from staff planning data if available)
- ✅ Staff dropdown populated
- ✅ Section dropdown populated (filtered by semester)
- ✅ Can select multiple staff if needed
- ✅ Validation works (error if required fields empty)
- ✅ Slot saves successfully
- ✅ Grid updates immediately
- ✅ Success toast message displays

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 4: Slot Editing**

**Objective:** Test editing an existing slot

**Steps:**
1. Click on an existing slot in the grid
2. Modify the course or staff
3. Click "Save"

**Expected Results:**
- ✅ Slot Dialog opens with pre-filled data
- ✅ All existing selections displayed correctly
- ✅ Can modify selections
- ✅ Save updates the slot
- ✅ Grid reflects changes immediately

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 5: Subdivided Slots (Lab Groups)**

**Objective:** Test creating and editing subdivided slots

**Steps:**
1. Create a new slot
2. Check "Configure Subdivision" option
3. Click "Save" in slot dialog
4. In Subdivision Config Dialog:
   - Select subdivision type (Practical/Tutorial)
   - Choose number of groups
   - Assign students to each group
   - Assign staff to each group
5. Save subdivision config
6. Click on the subdivided slot to edit

**Expected Results:**
- ✅ Subdivision Config Dialog opens (lazy-loaded)
- ✅ Students load correctly for selected section
- ✅ Can configure multiple groups
- ✅ Student assignment works (auto or manual)
- ✅ Can assign different staff to different groups
- ✅ Saves successfully
- ✅ Grid shows subdivided slot indicator
- ✅ Editing reopens subdivision config (not regular slot dialog)
- ✅ Existing configuration loads correctly

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 6: Slot Deletion**

**Objective:** Test deleting a slot

**Steps:**
1. Click the delete (trash) icon on a slot
2. Confirm deletion in dialog
3. Check that slot is removed from grid

**Expected Results:**
- ✅ Delete confirmation dialog appears
- ✅ Shows slot details (course, period, day)
- ✅ Warning message displayed
- ✅ Slot deletes on confirmation
- ✅ Grid updates immediately
- ✅ Success toast message

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 7: Format Switching (Regular ↔ Batch)**

**Objective:** Test switching between regular and batch mode

**Steps:**
1. Note current timetable format
2. Click the format selector dropdown
3. Select the opposite format
4. Observe the grid change

**Expected Results:**
- ✅ Format selector shows current format
- ✅ Can switch format (if no attendance/slots exist)
- ✅ Warning shown if attendance exists
- ✅ Grid switches between day columns and date columns
- ✅ Unsaved changes dialog appears
- ✅ Selected days reset to all days when switching to regular
- ✅ Selected dates reset when switching to batch

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 8: Day Configuration (Regular Mode)**

**Objective:** Test configuring which days appear in regular mode

**Steps:**
1. Ensure timetable is in Regular mode
2. Click "Configure Days" button
3. Toggle some days on/off
4. Click "Select All" and "Clear All"
5. Click "Save Days"

**Expected Results:**
- ✅ Day Configuration Dialog opens
- ✅ Current selected days shown
- ✅ Can toggle individual days
- ✅ "Select All" selects all 6 days (Mon-Sat)
- ✅ "Clear All" deselects all days
- ✅ Save persists changes
- ✅ Grid updates to show only selected days
- ✅ Unsaved changes tracking works

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 9: Date Range Management (Batch Mode)**

**Objective:** Test adding and removing date ranges in batch mode

**Steps:**
1. Switch timetable to Batch mode
2. Click "Add Date Range" button
3. Select start date and end date
4. Click "Add Date Range"
5. Try adding an overlapping date range
6. Click remove (X) on a date range row

**Expected Results:**
- ✅ Date Range Dialog opens
- ✅ Can select start and end dates
- ✅ Date range adds successfully
- ✅ Grid shows new row for date range
- ✅ Validation prevents overlapping ranges
- ✅ Error toast if overlap detected
- ✅ Can remove date ranges
- ✅ Unsaved changes dialog appears on navigation
- ✅ "Save Configuration" persists date ranges

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 10: Save Configuration**

**Objective:** Test saving period and day/date configuration

**Steps:**
1. Make changes to periods
2. Make changes to days (regular) or dates (batch)
3. Click "Save Configuration" button
4. Reload the page

**Expected Results:**
- ✅ Save button shows loading state
- ✅ Success toast appears
- ✅ Configuration persists after page reload
- ✅ Selected periods maintain order
- ✅ Selected days/dates maintained
- ✅ Unsaved changes flag clears

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 11: PDF Export**

**Objective:** Test exporting timetable to PDF

**Steps:**
1. Ensure timetable has some slots
2. Click "Export PDF" button
3. Wait for PDF generation
4. Check the downloaded PDF

**Expected Results:**
- ✅ Export button triggers PDF generation
- ✅ Loading toast/indicator shown
- ✅ PDF downloads successfully
- ✅ PDF contains timetable name
- ✅ PDF shows all periods and days/dates
- ✅ PDF shows all slots correctly
- ✅ Success toast on completion

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 12: Save as Template**

**Objective:** Test saving timetable as a template

**Steps:**
1. Click header "Save as Template" button
2. Enter a template name
3. Click "Save"

**Expected Results:**
- ✅ Template Dialog opens
- ✅ Can enter template name
- ✅ Validation for empty name
- ✅ Save creates template successfully
- ✅ Success toast message
- ✅ Dialog closes after save

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 13: Unsaved Changes Warning**

**Objective:** Test navigation warning with unsaved changes

**Steps:**
1. Make changes to periods or days/dates without saving
2. Try to navigate away (click breadcrumb or back button)
3. In the dialog:
   - Test "Cancel"
   - Test "Discard Changes"
   - Test "Save & Continue"

**Expected Results:**
- ✅ Unsaved changes dialog appears
- ✅ Lists what changes are unsaved
- ✅ "Cancel" keeps you on page
- ✅ "Discard" navigates away without saving
- ✅ "Save & Continue" saves then navigates
- ✅ Browser beforeunload warning on page refresh

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 14: Permission-Based Access**

**Objective:** Test role-based access control

**Steps:**
1. Login as user with view-only permission
2. Try to create/edit slots
3. Login as user with edit permission
4. Try all operations
5. Login as super admin
6. Try modifying locked periods

**Expected Results:**
- ✅ View-only users cannot create/edit slots
- ✅ Edit permission allows slot operations
- ✅ Super admin can override locked periods
- ✅ Appropriate error messages for denied actions
- ✅ UI hides/disables buttons based on permissions

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 15: Attendance Locking**

**Objective:** Test that periods with attendance cannot be modified

**Steps:**
1. Mark attendance for a period (through attendance module)
2. Return to timetable
3. Try to edit a slot in the marked period
4. Try to delete a slot in the marked period

**Expected Results:**
- ✅ Locked periods show lock icon
- ✅ Cannot edit slots in locked periods (non-super admin)
- ✅ Cannot delete slots in locked periods (non-super admin)
- ✅ Error toast explains why action is blocked
- ✅ Super admin can override (with warning)

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 16: Staff Planning Integration**

**Objective:** Test that staff planning data is used when available

**Steps:**
1. Create a staff plan for the timetable's semester
2. Return to timetable
3. Create a new slot
4. Check the course dropdown

**Expected Results:**
- ✅ Courses from staff planning appear in dropdown
- ✅ "Using data from staff planning" indicator shown
- ✅ Only relevant courses for this semester/program shown
- ✅ Staff associated with courses in planning shown
- ✅ Falls back to all courses if no staff planning

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 17: Performance Testing**

**Objective:** Measure performance improvements

**Steps:**
1. Open browser DevTools
2. Go to Network tab
3. Navigate to timetable details page
4. Note:
   - Initial bundle size
   - Time to interactive
   - Number of network requests
5. Open a dialog (slot/subdivision/period config)
6. Check if lazy loading works

**Expected Results:**
- ✅ Initial bundle <60KB (excluding vendor chunks)
- ✅ Page interactive in <1 second
- ✅ Lazy-loaded dialogs: separate chunks loaded on demand
- ✅ No unnecessary re-renders (check React DevTools Profiler)
- ✅ Smooth interactions, no lag
- ✅ Memory usage reasonable (<100MB for this page)

**Measurements:**
- Initial Bundle Size: _______ KB
- Time to Interactive: _______ ms
- Lazy Chunks Loaded: ☐ SlotDialog ☐ SubdivisionConfig ☐ PeriodConfig
- Total Requests: _______

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 18: Large Dataset Testing**

**Objective:** Test with realistic large datasets

**Steps:**
1. Create a timetable with 10+ periods
2. Add 50+ slots across all days
3. Test all operations (scroll, edit, delete)
4. Test PDF export with large dataset

**Expected Results:**
- ✅ Grid renders smoothly with many slots
- ✅ No performance degradation
- ✅ Scrolling is smooth
- ✅ Edit/delete operations remain fast
- ✅ PDF generates correctly with all data

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 19: Error Handling**

**Objective:** Test error scenarios and user feedback

**Steps:**
1. Try to save a slot without required fields
2. Try to create conflicting slots
3. Simulate network error (disable internet briefly)
4. Try invalid date ranges

**Expected Results:**
- ✅ Validation errors show clearly
- ✅ Network errors show user-friendly messages
- ✅ No crashes or white screens
- ✅ Error toast messages are helpful
- ✅ Form validation prevents bad data

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

### **Test 20: Console Error Check**

**Objective:** Ensure no console errors or warnings

**Steps:**
1. Open browser DevTools console
2. Perform all major operations
3. Check for any errors or warnings

**Expected Results:**
- ✅ No console errors
- ✅ No React warnings
- ✅ No hook dependency warnings
- ✅ Only expected debug logs from services
- ✅ No deprecated API warnings

**Console Errors Found:** _________________________________________________

**Status:** ☐ Pass ☐ Fail
**Notes:** _________________________________________________

---

## 📊 Test Summary

| Test Case | Status | Priority | Notes |
|-----------|--------|----------|-------|
| 1. Initial Page Load | ☐ Pass ☐ Fail | High | |
| 2. Period Configuration | ☐ Pass ☐ Fail | High | |
| 3. Slot Creation | ☐ Pass ☐ Fail | High | |
| 4. Slot Editing | ☐ Pass ☐ Fail | High | |
| 5. Subdivided Slots | ☐ Pass ☐ Fail | High | |
| 6. Slot Deletion | ☐ Pass ☐ Fail | Medium | |
| 7. Format Switching | ☐ Pass ☐ Fail | High | |
| 8. Day Configuration | ☐ Pass ☐ Fail | Medium | |
| 9. Date Range Management | ☐ Pass ☐ Fail | High | |
| 10. Save Configuration | ☐ Pass ☐ Fail | High | |
| 11. PDF Export | ☐ Pass ☐ Fail | Medium | |
| 12. Save as Template | ☐ Pass ☐ Fail | Low | |
| 13. Unsaved Changes Warning | ☐ Pass ☐ Fail | Medium | |
| 14. Permission-Based Access | ☐ Pass ☐ Fail | High | |
| 15. Attendance Locking | ☐ Pass ☐ Fail | High | |
| 16. Staff Planning Integration | ☐ Pass ☐ Fail | Medium | |
| 17. Performance Testing | ☐ Pass ☐ Fail | High | |
| 18. Large Dataset Testing | ☐ Pass ☐ Fail | Medium | |
| 19. Error Handling | ☐ Pass ☐ Fail | High | |
| 20. Console Error Check | ☐ Pass ☐ Fail | High | |

**Total Pass:** _____ / 20
**Total Fail:** _____ / 20
**Pass Rate:** _____%

---

## 🐛 Issues Found

### Issue 1:
- **Description:** _________________________________________________
- **Severity:** ☐ Critical ☐ High ☐ Medium ☐ Low
- **Steps to Reproduce:** _________________________________________________
- **Expected:** _________________________________________________
- **Actual:** _________________________________________________

### Issue 2:
- **Description:** _________________________________________________
- **Severity:** ☐ Critical ☐ High ☐ Medium ☐ Low
- **Steps to Reproduce:** _________________________________________________
- **Expected:** _________________________________________________
- **Actual:** _________________________________________________

### Issue 3:
- **Description:** _________________________________________________
- **Severity:** ☐ Critical ☐ High ☐ Medium ☐ Low
- **Steps to Reproduce:** _________________________________________________
- **Expected:** _________________________________________________
- **Actual:** _________________________________________________

---

## ✅ Sign-Off

**Tester Name:** _______________
**Date:** _______________
**Overall Result:** ☐ Approved ☐ Approved with Minor Issues ☐ Rejected
**Comments:** _________________________________________________

---

## 📝 Next Steps

Based on test results:

- **If All Tests Pass:** ✅ Ready for Phase 6 - Dual-Mode Period Implementation
- **If Minor Issues:** 🔄 Fix issues and re-test affected areas
- **If Major Issues:** 🚨 Review refactoring and address critical problems

---

**Testing Guide Version:** 1.0
**Last Updated:** 2025-10-25
