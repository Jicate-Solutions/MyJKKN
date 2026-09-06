# Phase 1 Schools Implementation — Integration Testing Guide

**Date:** 2026-05-26  
**Purpose:** Manual integration test scenarios for entity_type differentiation and label application

---

## Pre-Test Setup

### Database Preparation

1. **Ensure migration is applied:**
   ```sql
   -- Verify institutions.entity_type constraint includes 'school'
   SELECT constraint_definition FROM information_schema.check_constraints 
   WHERE constraint_name = 'chk_entity_type';
   ```
   Expected output: `entity_type IN ('institution', 'admin_office', 'company', 'school')`

2. **Create test institutions:**
   ```sql
   -- College (existing or new)
   INSERT INTO institutions (id, name, entity_type, category, institution_type, website, email, phone, city, state, country)
   VALUES ('college-001', 'Test College', 'institution', 'Autonomous', 'Autonomous', 'https://college.edu', 'contact@college.edu', '+91-9999999999', 'Bangalore', 'KA', 'India')
   ON CONFLICT DO NOTHING;
   
   -- School (new)
   INSERT INTO institutions (id, name, entity_type, category, institution_type, website, email, phone, city, state, country)
   VALUES ('school-001', 'Test School', 'school', 'K-12', 'School', 'https://school.edu', 'contact@school.edu', '+91-8888888888', 'Bangalore', 'KA', 'India')
   ON CONFLICT DO NOTHING;
   ```

3. **Assign test users to institutions:**
   - Create/assign one user to the college with role 'administrator'
   - Create/assign another user to the school with role 'administrator'

---

## Test Scenario 1: Label Translation in Programs Module

### College Instance

**Steps:**
1. Log in as college admin
2. Navigate to `/organizations/programs`
3. Click "+ Add Program" button

**Expected Results:**
- ✅ Button text reads **"Add Program"** (not "Add Class")
- ✅ Page heading shows **"Programs"** (not "Classes")
- ✅ Form displays correctly

### School Instance

**Steps:**
1. Log in as school admin
2. Navigate to `/organizations/programs`
3. Observe button and heading

**Expected Results:**
- ✅ Button text reads **"Add Class"** (not "Add Program")
- ✅ Page heading shows **"Classes"** (not "Programs")
- ✅ Form displays correctly
- ✅ Delete confirmation dialogs use "Class/Classes" terminology

---

## Test Scenario 2: Label Translation in Semesters Module

### College Instance

**Steps:**
1. Log in as college admin
2. Navigate to `/organizations/semesters`
3. Click "+ Add Semester" button
4. Select multiple semesters and click delete

**Expected Results:**
- ✅ Add button reads **"Add Semester"**
- ✅ Delete dialog says **"Delete Semester"** (singular) or **"Delete X Semesters"** (plural)
- ✅ Confirm button says **"Delete Semester"** or **"Delete X Semesters"**

### School Instance

**Steps:**
1. Log in as school admin
2. Navigate to `/organizations/semesters`
3. Click "+ Add Term" button
4. Select multiple terms and click delete

**Expected Results:**
- ✅ Add button reads **"Add Term"** (not "Add Semester")
- ✅ Delete dialog says **"Delete Term"** (singular) or **"Delete X Terms"** (plural)
- ✅ Confirm button says **"Delete Term"** or **"Delete X Terms"**

---

## Test Scenario 3: Label Translation in Courses Module

### College Instance

**Steps:**
1. Log in as college admin
2. Navigate to `/organizations/courses`
3. Click "+ Add Course" button
4. Select multiple courses and click delete

**Expected Results:**
- ✅ Add button reads **"Add Course"**
- ✅ Delete dialog says **"Delete Course"** (singular) or **"Delete X Courses"** (plural)

### School Instance

**Steps:**
1. Log in as school admin
2. Navigate to `/organizations/courses`
3. Click "+ Add Subject" button
4. Select multiple subjects and click delete

**Expected Results:**
- ✅ Add button reads **"Add Subject"** (not "Add Course")
- ✅ Delete dialog says **"Delete Subject"** (singular) or **"Delete X Subjects"** (plural)

---

## Test Scenario 4: Sidebar Filtering

### College Instance

**Steps:**
1. Log in as college admin
2. Navigate to sidebar (left navigation)
3. Scroll to Organizations section

**Expected Results:**
- ✅ "Degrees" link is **visible**
- ✅ "Course Mappings" link is **visible**
- ✅ All organization links are accessible

### School Instance

**Steps:**
1. Log in as school admin
2. Navigate to sidebar (left navigation)
3. Scroll to Organizations section

**Expected Results:**
- ✅ "Degrees" link is **hidden** (not present)
- ✅ "Course Mappings" link is **hidden** (not present)
- ✅ "Programs" (Classes), "Semesters" (Terms), "Courses" (Subjects) links are **visible**

---

## Test Scenario 5: Student Form Auto-Fill Foundation (Phase 1.1 Preparation)

### College Student Creation

**Steps:**
1. Log in as college admin
2. Navigate to `/learners/enquiries/new`
3. Select college institution
4. Scroll to "Course Selection" tab

**Expected Results:**
- ✅ Degree dropdown is **visible and required**
- ✅ Department dropdown is **visible and required**
- ✅ No info banner about auto-population

### School Student Creation

**Steps:**
1. Log in as school admin
2. Navigate to `/learners/enquiries/new`
3. Select school institution
4. Scroll to "Course Selection" tab

**Expected Results:**
- ✅ Green info banner appears: **"School admission — Degree and department are automatically assigned for school students."**
- ✅ Degree dropdown is **hidden**
- ✅ Department dropdown is **hidden**
- ✅ Program and Semester dropdowns are **visible** (for selecting class and term)

---

## Test Scenario 6: Dashboard and Reports (No Changes Expected)

### Both College and School Instances

**Steps:**
1. Log in as admin
2. Navigate to various dashboards and reports
3. Verify data consistency

**Expected Results:**
- ✅ No regressions in existing pages
- ✅ Data displays correctly
- ✅ Links work as expected

---

## Regression Testing Checklist

### General Functionality
- [ ] Login/logout works for both college and school admins
- [ ] Profile displays correct institution type
- [ ] Sidebar navigation is consistent with institution type
- [ ] All forms validate correctly
- [ ] Delete operations with confirmation dialogs work

### Label Consistency
- [ ] All three modules (Programs, Semesters, Courses) use correct labels
- [ ] Delete confirmations use correct terminology
- [ ] Buttons and headings are consistent
- [ ] Error messages (when present) use correct labels

### Permission & Access Control
- [ ] Users can only access institutions they belong to
- [ ] College admins cannot see school data
- [ ] School admins cannot see college data
- [ ] Sidebar filtering respects entity_type
- [ ] Permission checks still work correctly

---

## Test Data Validation

### College Instance Data
- Create a program with name "B.Tech CSE" → should show "Program Name: B.Tech CSE"
- Create a semester with name "Sem I" → should show "Semester Name: Sem I"
- Create a course with name "Programming" → should show "Course Name: Programming"

### School Instance Data
- Create a program (class) with name "10-A" → should show "Class Name: 10-A"
- Create a semester (term) with name "Term 1" → should show "Term Name: Term 1"
- Create a course (subject) with name "Mathematics" → should show "Subject Name: Mathematics"

---

## Known Limitations (Phase 1)

1. **Degree/Department auto-fill not yet active** — form hides the fields but doesn't populate them with defaults
   - Phase 1.1 task: create virtual degree/department records for schools
   - Phase 1.1 task: implement service-layer auto-population logic

2. **BottomNav integration pending** — sidebar filter not yet applied to mobile bottom navbar
   - Phase 1.1 task: integrate `filterMenuByEntityType()` into bottom navbar component

3. **Label application incomplete** — only data table headers applied; form fields, error messages, tooltips still need updates
   - Phase 1.1 task: full sweep across all UI components

---

## Bug Report Template

If you encounter a regression or unexpected behavior:

```markdown
## Bug: [Title]

**Institution Type:** [College / School]  
**Feature:** [Programs / Semesters / Courses / Sidebar / Student Form]  
**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected:** [What should happen]  
**Actual:** [What actually happened]  

**Screenshots/Evidence:**
[Attach if relevant]
```

---

## Sign-Off Criteria

Phase 1 integration testing is complete when:

- ✅ All label translations display correctly for both colleges and schools
- ✅ Sidebar filtering works correctly (degrees/course-mappings hidden for schools)
- ✅ No regressions in existing college functionality
- ✅ Student form correctly hides degree/department for schools
- ✅ All test scenarios pass in both college and school instances
