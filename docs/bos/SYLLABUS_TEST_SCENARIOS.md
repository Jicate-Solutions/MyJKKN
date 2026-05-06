# Course Syllabus Management - Test Scenarios

This document guides testing of both core Board of Studies syllabus scenarios.

---

## Scenario 1: New Regulation Duplication (R-2024 → R-2025)

**Goal**: Test batch duplication of courses across regulations with code mapping.

**Prerequisites**:
- R-2024 regulation exists in the system with at least 3-4 courses
- R-2025 regulation exists (empty)
- User has "Chairman" role with edit permissions

**Test Steps**:

### Step 1.1: Navigate to Syllabus Dashboard
1. Go to `/bos/syllabi`
2. Expected: Dashboard loads with syllabus list

### Step 1.2: Filter for R-2024 Courses
1. Select "Regulation" filter → R-2024
2. Expected: List shows only R-2024 courses (e.g., 24UGTA01, 24UGTA02, 24UGTA03)

### Step 1.3: Open First Syllabus
1. Click on 24UGTA01 course → "View"
2. Verify all 7 tabs have content:
   - ✓ Basic Info (course code, name, credits, stream)
   - ✓ Course Objectives (list of 3-5 objectives)
   - ✓ Learning Outcomes (4-6 CLOs with K-values)
   - ✓ Course Content (2-3 units with chapters)
   - ✓ Resources (textbooks and web links)
   - ✓ Pedagogy (teaching methods selected)
   - ✓ PO Mappings (course outcomes mapped to POs)
3. Expected: All fields populated from earlier data entry

### Step 1.4: Open Duplication Dialog
1. Click "..." menu → "Duplicate to Regulation"
2. Select "R-2025" as target regulation
3. Verify course code mapping:
   - Source: `24UGTA01`
   - Target: `25UGTA01` (auto-generated)
4. Expected: Auto-fill works by incrementing year prefix

### Step 1.5: Confirm Duplication
1. Click "Duplicate Courses"
2. Wait for success message
3. Expected: "Courses duplicated successfully"

### Step 1.6: Verify Duplication
1. Go back to syllabus list
2. Filter by R-2025
3. Expected: New courses appear (25UGTA01, 25UGTA02, 25UGTA03)
4. Click on 25UGTA01
5. Verify:
   - Version number is 1 (fresh start)
   - All content copied from 24UGTA01
   - Status: "Active" (is_latest=true)

### Step 1.7: Verify Course History
1. From 25UGTA01 edit page, click "View History"
2. Expected: Single version (v1) shown since it's new
3. Go back to 24UGTA01 history
4. Expected: Original R-2024 course still has its history intact

**Success Criteria**:
- ✅ All 4 courses duplicated from R-2024 to R-2025
- ✅ Course codes updated (24→25 prefix)
- ✅ All content preserved (objectives, CLOs, units, mappings)
- ✅ New courses marked as v1 and is_latest=true
- ✅ Original R-2024 courses unchanged

---

## Scenario 2: Same-Regulation Revision (24UGTA01 v1 → v2)

**Goal**: Test course revision workflow where a course is updated post-approval.

**Prerequisites**:
- A course exists: 24UGTA01 with complete syllabus content
- User has "Chairman" role with edit permissions

**Test Steps**:

### Step 2.1: Navigate to Course Edit Page
1. Go to `/bos/syllabi`
2. Find 24UGTA01 → Click "..." → "View Full Details"
3. Expected: Course detail page loads

### Step 2.2: Verify Current State
1. Scroll to "Information" section at bottom
2. Verify:
   - Version: v1
   - Status: Active (is_latest=true)
   - Current version marked with badge

### Step 2.3: Create Revision
1. Click "..." → "Create Revision"
2. "Revise Syllabus" dialog opens
3. Select which sections changed:
   - ✓ Learning Outcomes (updated CLOs)
   - ✓ Course Content (added new unit)
4. Add revision notes:
   - "Updated CLOs per board feedback on learning assessment metrics"
5. Click "Create Revision"
6. Expected: Success notification

### Step 2.4: Verify New Version Created
1. Automatic redirect to v2 edit page
2. URL: `/bos/syllabi/[v2-id]/edit`
3. Information panel shows:
   - Version: v2
   - Status: Active (is_latest=true)
4. Content shows updated sections

### Step 2.5: Verify Old Version Archived
1. Click "View History"
2. Expected timeline shows:
   - **v2** (Latest) - Just created
     - Status: Active, is_latest=true
   - **v1** (Previous)
     - Status: Previous, is_latest=false
     - Shows original creation date

### Step 2.6: Compare Versions
1. In History page, under v2, select "Compare with..." → v1
2. Comparison card appears showing:
   - Changed fields: `course_learning_outcomes`, `course_content`
   - Before/After diffs for each changed field
3. Expected: Clear visualization of what changed

### Step 2.7: Edit v2 Content
1. Go back to v2 edit
2. Update "Learning Outcomes" tab:
   - Edit one CLO description
   - Save changes
3. Expected: "Syllabus saved successfully" message

### Step 2.8: Verify History Remains Clean
1. Click "View History" again
2. Still see v1 and v2 (no accidental v3)
3. v2 shows latest modification time

**Success Criteria**:
- ✅ v1 marked as is_latest=false when v2 created
- ✅ v2 created with version_number=2, is_latest=true
- ✅ History shows clean lineage: v2 → v1
- ✅ Comparison accurately shows what changed
- ✅ Old and new versions have complete independent content
- ✅ Can update v2 without affecting history

---

## Scenario 3: PDF Export (All Three Formats)

**Goal**: Test PDF generation for three export formats.

**Prerequisites**:
- Course 24UGTA01 fully populated
- Browser has html2pdf capability (or print to PDF)

**Test Steps**:

### Step 3.1: Open Syllabus Export
1. Go to `/bos/syllabi/24UGTA01/edit`
2. Click "Export PDF" button
3. Select format: "Official" (full syllabus)
4. Click "Export"
5. Expected: HTML opens in new tab for printing

### Step 3.2: Verify Official Format
1. New tab shows complete syllabus:
   - Course header: 24UGTA01 - Course Name
   - All 7 sections: Objectives, CLOs, Content, Textbooks, Resources, Pedagogy, Mappings
   - Print to PDF from browser
2. Expected: Comprehensive PDF generated

### Step 3.3: Export Meeting Summary Format
1. Go back to edit page
2. Export → "Meeting Summary"
3. New tab shows:
   - Course header + version
   - Only: CLOs and meeting notes
   - No textbooks/resources/mappings (reduced scope)
4. Expected: Focused 1-2 page document

### Step 3.4: Export OBE Format
1. Go back, Export → "OBE Format"
2. New tab shows:
   - Learning outcomes mapped to lesson planning
   - PO mappings table (CLO → PO → Level)
   - Content delivery plan (units/topics/hours)
   - No pedagogy details
3. Expected: Lesson planning focused format

**Success Criteria**:
- ✅ All three formats generate without errors
- ✅ Official includes all 7 sections
- ✅ Meeting summary focuses on outcomes + notes
- ✅ OBE format emphasizes mappings + delivery plan
- ✅ PDFs print cleanly from browser

---

## Testing Checklist

### Data Entry Phase
- [ ] Taxonomy set up for R-2024 and R-2025 (K-values, POs, PSOs)
- [ ] At least 4 complete courses in R-2024 with:
  - [ ] 3-5 objectives each
  - [ ] 4-6 CLOs with K-value mappings
  - [ ] 2-3 content units with chapters
  - [ ] 3-4 textbooks (primary)
  - [ ] 2-3 web resources
  - [ ] 4-5 pedagogy methods selected
  - [ ] PO mappings for all CLOs (H/M/L ratings)

### Scenario 1 Testing
- [ ] Duplication from R-2024 to R-2025 works
- [ ] Course codes auto-map (24→25)
- [ ] All content copied to new courses
- [ ] New courses are v1, is_latest=true
- [ ] Original courses unchanged

### Scenario 2 Testing
- [ ] Revision creates v2 from v1
- [ ] v1 marked is_latest=false
- [ ] v2 marked is_latest=true
- [ ] History shows both versions
- [ ] Comparison works between v1 and v2
- [ ] Can edit v2 without affecting v1

### Scenario 3 Testing
- [ ] Official PDF includes all content
- [ ] Meeting summary focused on outcomes
- [ ] OBE format emphasizes mappings
- [ ] All three formats print properly

### UI/UX Testing
- [ ] Dashboard filtering works (board, regulation, stream, search)
- [ ] Pagination works (page navigation)
- [ ] Links navigate correctly
- [ ] Error messages appear for edge cases
- [ ] Loading states show during async operations
- [ ] Success notifications appear after actions

### Edge Cases
- [ ] Attempt to duplicate with invalid target regulation → Error message
- [ ] Attempt to revise non-latest version → Error shown
- [ ] Try to export syllabus without content → PDF still generates
- [ ] View history of course with only 1 version → Shows single entry
- [ ] Compare course with itself → Appropriate message

---

## Debugging Guide

### Common Issues

**PDF Export Opens Blank**
- Solution: Ensure html2pdf library is installed (`npm install html2pdf`)
- Fallback: Use browser's print-to-PDF feature (Ctrl+P)

**Duplication Fails with "Course Already Exists"**
- Solution: Target course code already exists in target regulation
- Action: Manually adjust the target course code mapping before duplicating

**Revision Shows "Cannot Revise Non-Latest"**
- This is expected behavior
- Solution: Always revise from the latest (v1, v2, etc.) version

**History Page Shows Empty**
- Solution: Check that the course exists and fetching is enabled
- Verify in browser console for fetch errors

---

## Performance Baselines

- Syllabus list load (50 items): < 2 seconds
- Single syllabus edit: < 1 second
- PDF export: < 3 seconds
- Duplication of 4 courses: < 5 seconds
- History page load: < 2 seconds

---

## Rollback Instructions

If testing introduces bad data:

```sql
-- Delete duplicated R-2025 courses
DELETE FROM bos_course_syllabi
WHERE regulation_id = (SELECT id FROM regulations WHERE name = 'R-2025')
AND created_at > '2026-05-06'::timestamptz;

-- Delete revisions
DELETE FROM bos_course_syllabi
WHERE version_number > 1
AND revised_from_syllabus_id IS NOT NULL
AND created_at > '2026-05-06'::timestamptz;
```

---

## Sign-Off

- **Tested By**: _________________
- **Date**: _________________
- **All Tests Passed**: ☐ Yes ☐ No
- **Issues Found**: _______________
- **Notes**: ____________________
