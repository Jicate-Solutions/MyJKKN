# UAT Test Plan - TQM Excellence Suite

**Document Version:** 1.0
**Created:** 2026-02-05
**Test Environment:** https://myjkkn-omm-dev.vercel.app
**Database:** Staging (hhprjbgknupaplivtoib)
**Test Period:** 2026-02-05 to 2026-02-12
**Status:** READY FOR UAT

---

## Table of Contents

1. [Test Environment Setup](#1-test-environment-setup)
2. [Test Roles & Access](#2-test-roles--access)
3. [Module Test Cases](#3-module-test-cases)
   - [F001: Stakeholder NPS](#f001-stakeholder-nps)
   - [F002: Process Excellence](#f002-process-excellence)
   - [F003: Parent Portal](#f003-parent-portal)
   - [F004: Grievance System](#f004-grievance-system)
   - [F005: Maturity Assessment](#f005-maturity-assessment)
   - [F006: OKR ABCD Matrix](#f006-okr-abcd-matrix)
   - [F007: Billing COPQ](#f007-billing-copq)
4. [Test Data Requirements](#4-test-data-requirements)
5. [Critical User Journeys](#5-critical-user-journeys)
6. [Performance Benchmarks](#6-performance-benchmarks)
7. [Security Test Cases](#7-security-test-cases)
8. [Acceptance Criteria](#8-acceptance-criteria)
9. [Test Execution Tracking](#9-test-execution-tracking)
10. [Defect Management](#10-defect-management)

---

## 1. Test Environment Setup

### Environment Details

| Component | Value |
|-----------|-------|
| **Application URL** | https://myjkkn-omm-dev.vercel.app |
| **Database** | Supabase Staging (hhprjbgknupaplivtoib) |
| **Authentication** | Supabase Auth (Google OAuth) |
| **Framework** | Next.js 16.1.1 |
| **Browser Requirements** | Chrome 120+, Safari 17+, Edge 120+ |
| **Mobile Testing** | iOS Safari, Android Chrome |
| **Network** | Min 5 Mbps for optimal performance |

### Pre-Test Setup Checklist

- [ ] All 7 TQM migrations applied to staging database
- [ ] Test data seeded (see Section 4)
- [ ] User accounts created for all test roles
- [ ] Browser cache cleared before testing
- [ ] Screen recording tool ready for critical flows
- [ ] Defect tracking spreadsheet prepared
- [ ] Performance monitoring tools configured

### Database Verification

Run these queries to verify setup:

```sql
-- Verify all TQM tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'nps_surveys', 'nps_responses',
  'process_definitions', 'waste_incidents',
  'parent_profiles', 'parent_learner_links',
  'grievance_tickets', 'grievance_categories',
  'maturity_assessments', 'maturity_frameworks',
  'billing_copq_incidents'
)
ORDER BY table_name;

-- Should return 11 tables
```

---

## 2. Test Roles & Access

### Test User Credentials

| Role | Email | Password | Institution Access | Test Scope |
|------|-------|----------|-------------------|------------|
| **Super Admin** | test-superadmin@jkkn.local | SuperAdmin@123 | All institutions | Full system access, all 7 modules |
| **Institution Admin** | test.admin@jkkn.local | Admin@123 | JKKN College of Engineering | Institution-level access, all modules except Parent Portal |
| **Staff Member** | test.staff@jkkn.local | Staff@123 | Single department | Department-level access, limited NPS/Grievance |
| **Student** | test.student@jkkn.local | Test@123 | Self only | View own data, submit NPS/Grievance |
| **Parent** | test.parent@jkkn.local | OTP via phone | Linked learners only | Parent Portal only (separate auth) |
| **Employer** | test.employer@jkkn.local | Employer@123 | Alumni only | NPS surveys, placement data |

### Role Permission Matrix

| Module | Super Admin | Inst Admin | Staff | Student | Parent | Employer |
|--------|-------------|------------|-------|---------|--------|----------|
| **F001: NPS** | Full CRUD | View/Create | View assigned | Submit only | Submit only | Submit only |
| **F002: Process Excellence** | Full CRUD | View/Report | Report waste | View own | No access | No access |
| **F003: Parent Portal** | View logs | View logs | No access | No access | Full access | No access |
| **F004: Grievance** | Full CRUD | Assign/Resolve | View assigned | Submit/View own | No access | No access |
| **F005: Maturity** | Full CRUD | Submit/View | View only | No access | No access | No access |
| **F006: OKR ABCD** | Full CRUD | View/Create | View assigned | No access | No access | No access |
| **F007: COPQ** | Full CRUD | View/Report | Report only | No access | No access | No access |

### Login URLs

| Role | Login URL | Auth Method |
|------|-----------|-------------|
| Admin/Staff/Student | /auth/login | Google OAuth |
| Parent | /auth/parent/login | Phone OTP |

---

## 3. Module Test Cases

## F001: Stakeholder NPS

**Module URL:** `/stakeholder-nps`
**Test Priority:** HIGH (Foundation module)
**Dependencies:** None
**Estimated Test Time:** 90 minutes

### Test Scenario 1.1: Create NPS Survey

**Preconditions:**
- Logged in as Institution Admin
- Navigate to /stakeholder-nps

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 1.1.1 | Click "New Survey" button | - | Navigate to survey creation form | ⬜ |
| 1.1.2 | Enter survey title | "Q1 2026 Student Satisfaction" | Title field populated | ⬜ |
| 1.1.3 | Select stakeholder type | "Learners" checkbox | Checkbox checked | ⬜ |
| 1.1.4 | Set start date | Today's date | Date picker shows selected date | ⬜ |
| 1.1.5 | Set end date | 30 days from today | Date picker shows selected date | ⬜ |
| 1.1.6 | Verify primary question | - | "How likely are you to recommend..." shown | ⬜ |
| 1.1.7 | Click "Add Question" | - | New question form appears | ⬜ |
| 1.1.8 | Add text question | "What can we improve?" | Question added to list | ⬜ |
| 1.1.9 | Click "Save as Draft" | - | Survey saved with status 'draft' | ⬜ |
| 1.1.10 | Verify survey in list | - | Survey appears in surveys table | ⬜ |

**Success Criteria:**
- Survey created successfully
- Survey visible in list with correct details
- Status badge shows "Draft"
- No console errors

**Test Data Created:**
- Survey ID: (record from test)
- Survey Title: "Q1 2026 Student Satisfaction"
- Status: draft

---

### Test Scenario 1.2: Activate Survey

**Preconditions:**
- Survey from 1.1 exists with status 'draft'

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 1.2.1 | Open survey detail | Click survey row | Survey detail page loads | ⬜ |
| 1.2.2 | Click "Activate" button | - | Confirmation modal appears | ⬜ |
| 1.2.3 | Confirm activation | Click "Confirm" | Status changes to 'active' | ⬜ |
| 1.2.4 | Verify status badge | - | Badge shows "Active" in green | ⬜ |
| 1.2.5 | Check dashboard | Navigate to /stakeholder-nps | Survey appears in "Active Surveys" section | ⬜ |

**Success Criteria:**
- Survey status changes from 'draft' to 'active'
- Survey becomes available to target stakeholders
- Activation timestamp recorded

---

### Test Scenario 1.3: Submit NPS Response (Promoter)

**Preconditions:**
- Active survey exists for Learners
- Logged in as Student

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 1.3.1 | Navigate to dashboard | /dashboard | NPS survey prompt appears | ⬜ |
| 1.3.2 | Click "Take Survey" | - | Survey modal opens | ⬜ |
| 1.3.3 | Select score | Click "9" on 0-10 scale | Score 9 highlighted | ⬜ |
| 1.3.4 | Enter feedback | "Excellent curriculum and faculty support" | Feedback textarea populated | ⬜ |
| 1.3.5 | Answer additional question | "Better lab equipment" | Answer saved | ⬜ |
| 1.3.6 | Click "Submit" | - | Success message appears | ⬜ |
| 1.3.7 | Verify modal closes | - | Modal dismissed, dashboard visible | ⬜ |
| 1.3.8 | Try submitting again | - | "Already submitted" message shown | ⬜ |

**Success Criteria:**
- Response saved to database
- sentiment = 'promoter' (auto-calculated)
- Duplicate submission prevented
- nps_category computed correctly

**Database Verification:**
```sql
SELECT score, sentiment, feedback
FROM nps_responses
WHERE survey_id = '[TEST_SURVEY_ID]'
AND stakeholder_id = '[TEST_STUDENT_ID]';
```
Expected: score = 9, sentiment = 'promoter'

---

### Test Scenario 1.4: Submit NPS Response (Detractor)

**Preconditions:**
- Same active survey from 1.3
- Logged in as different Student

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 1.4.1 | Navigate to dashboard | /dashboard | NPS survey prompt appears | ⬜ |
| 1.4.2 | Select low score | Click "4" on 0-10 scale | Score 4 highlighted | ⬜ |
| 1.4.3 | Enter critical feedback | "Classes are too theoretical, need more practical work" | Feedback saved | ⬜ |
| 1.4.4 | Submit response | Click "Submit" | Response submitted successfully | ⬜ |

**Success Criteria:**
- sentiment = 'detractor' (auto-calculated for score 0-6)
- Feedback captured for follow-up

---

### Test Scenario 1.5: View NPS Analytics

**Preconditions:**
- Survey has at least 2 responses (1 promoter, 1 detractor)

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 1.5.1 | Navigate to analytics | /stakeholder-nps/analytics | Analytics dashboard loads | ⬜ |
| 1.5.2 | Select survey | Choose test survey from dropdown | Survey analytics displayed | ⬜ |
| 1.5.3 | Verify NPS score | - | NPS score calculated correctly (% Promoters - % Detractors) | ⬜ |
| 1.5.4 | Check response breakdown | - | Promoter/Passive/Detractor counts shown | ⬜ |
| 1.5.5 | View stakeholder breakdown | - | Responses grouped by stakeholder type | ⬜ |
| 1.5.6 | Check top feedback | - | Promoter and Detractor feedback visible | ⬜ |
| 1.5.7 | View trend chart | - | Monthly NPS trend displayed | ⬜ |
| 1.5.8 | Export data | Click "Export CSV" | CSV file downloaded | ⬜ |

**Success Criteria:**
- NPS score = (1 promoter - 1 detractor) / 2 responses = 0
- All charts render without errors
- Export contains all response data

**Expected NPS Calculation:**
```
Promoters (9-10): 1 response = 50%
Passives (7-8): 0 responses = 0%
Detractors (0-6): 1 response = 50%
NPS = 50% - 50% = 0
```

---

### Test Scenario 1.6: Close Survey

**Preconditions:**
- Active survey exists

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 1.6.1 | Navigate to survey detail | - | Survey detail page loads | ⬜ |
| 1.6.2 | Click "Close Survey" | - | Confirmation modal appears | ⬜ |
| 1.6.3 | Confirm closure | Click "Confirm" | Status changes to 'closed' | ⬜ |
| 1.6.4 | Verify no new responses | Try to submit as student | "Survey closed" message shown | ⬜ |
| 1.6.5 | Verify analytics still accessible | Navigate to analytics | Analytics still visible | ⬜ |

**Success Criteria:**
- Survey status = 'closed'
- New responses blocked
- Existing data preserved

---

### Test Scenario 1.7: Multi-Stakeholder Survey

**Preconditions:**
- Logged in as Institution Admin

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 1.7.1 | Create new survey | - | Survey creation form | ⬜ |
| 1.7.2 | Select multiple types | Check "Learners", "Parents", "Staff" | All 3 checkboxes checked | ⬜ |
| 1.7.3 | Activate survey | - | Survey active | ⬜ |
| 1.7.4 | Submit as Student | Score: 8 | Response saved | ⬜ |
| 1.7.5 | Submit as Parent | Score: 9 | Response saved | ⬜ |
| 1.7.6 | Submit as Staff | Score: 7 | Response saved | ⬜ |
| 1.7.7 | View analytics | - | Breakdown by stakeholder type visible | ⬜ |

**Success Criteria:**
- Survey accepts responses from multiple stakeholder types
- Analytics show separate breakdown per type
- NPS calculated correctly across all types

---

### F001 Performance Tests

**Test 1.P1: List Performance**
- **Action:** Load /stakeholder-nps with 100+ surveys
- **Expected:** Page loads < 2 seconds
- **Result:** ⬜

**Test 1.P2: Analytics Performance**
- **Action:** Load analytics with 1000+ responses
- **Expected:** Charts render < 3 seconds
- **Result:** ⬜

**Test 1.P3: Response Submission**
- **Action:** Submit NPS response
- **Expected:** Confirmation < 1 second
- **Result:** ⬜

---

### F001 Security Tests

**Test 1.S1: Institution Isolation**
- **Action:** User from Institution A tries to view Institution B's surveys
- **Expected:** 403 Forbidden or empty list
- **Result:** ⬜

**Test 1.S2: Duplicate Response Prevention**
- **Action:** Same user submits response twice
- **Expected:** Error message, only 1 response saved
- **Result:** ⬜

**Test 1.S3: Unauthorized Survey Activation**
- **Action:** Student tries to activate survey
- **Expected:** 403 Forbidden
- **Result:** ⬜

---

## F002: Process Excellence

**Module URL:** `/process-excellence`
**Test Priority:** HIGH
**Dependencies:** None
**Estimated Test Time:** 120 minutes

### Test Scenario 2.1: Define Process

**Preconditions:**
- Logged in as Institution Admin
- Navigate to /process-excellence/definitions

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 2.1.1 | Click "New Process" | - | Process definition form opens | ⬜ |
| 2.1.2 | Enter process name | "Student Admission Process" | Name field populated | ⬜ |
| 2.1.3 | Enter description | "End-to-end admission workflow from application to enrollment" | Description saved | ⬜ |
| 2.1.4 | Add stage 1 | Name: "Application Received", Duration: 24hrs, Value-add: No | Stage added | ⬜ |
| 2.1.5 | Add stage 2 | Name: "Document Verification", Duration: 48hrs, Value-add: Yes | Stage added | ⬜ |
| 2.1.6 | Add stage 3 | Name: "Approval Pending", Duration: 72hrs, Value-add: No | Stage added | ⬜ |
| 2.1.7 | Add stage 4 | Name: "Fee Payment", Duration: 24hrs, Value-add: Yes | Stage added | ⬜ |
| 2.1.8 | Add stage 5 | Name: "Enrollment Complete", Duration: 12hrs, Value-add: Yes | Stage added | ⬜ |
| 2.1.9 | Set target cycle time | 720 hours (30 days) | Target saved | ⬜ |
| 2.1.10 | Set SLA threshold | 504 hours (21 days) | SLA saved | ⬜ |
| 2.1.11 | Save process definition | Click "Create Process" | Process created successfully | ⬜ |

**Success Criteria:**
- Process definition saved with 5 stages
- stages stored as JSONB array
- Target cycle time = 720 hours
- SLA threshold = 504 hours
- Value-add ratio calculated: 3/5 = 60%

**Database Verification:**
```sql
SELECT name, stages, target_cycle_time_hours, sla_threshold_hours
FROM process_definitions
WHERE name = 'Student Admission Process';
```

---

### Test Scenario 2.2: Start Process Instance

**Preconditions:**
- Process definition exists from 2.1

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 2.2.1 | Navigate to instances | /process-excellence/audits | Instances list page | ⬜ |
| 2.2.2 | Click "Start Instance" | - | Modal with process selector | ⬜ |
| 2.2.3 | Select process | "Student Admission Process" | Process selected | ⬜ |
| 2.2.4 | Link to entity | Admission ID: ADM-2026-001 | Entity linked | ⬜ |
| 2.2.5 | Confirm start | Click "Start" | Instance created with status 'in_progress' | ⬜ |
| 2.2.6 | Verify initial stage | - | Current stage = "Application Received" | ⬜ |
| 2.2.7 | Check started_at | - | Timestamp recorded | ⬜ |

**Success Criteria:**
- Process instance created
- current_stage_index = 0
- started_at timestamp set
- sla_status = 'on_track'

---

### Test Scenario 2.3: Advance Process Stages

**Preconditions:**
- Process instance from 2.2 exists

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 2.3.1 | Open instance detail | Click instance row | Detail page loads | ⬜ |
| 2.3.2 | Advance to stage 2 | Click "Next Stage" | Stage updates to "Document Verification" | ⬜ |
| 2.3.3 | Verify duration logged | - | Stage 1 duration calculated | ⬜ |
| 2.3.4 | Wait 1 minute | - | - | ⬜ |
| 2.3.5 | Advance to stage 3 | Click "Next Stage" | Stage updates to "Approval Pending" | ⬜ |
| 2.3.6 | Add stage note | "Waiting for HOD approval" | Note saved | ⬜ |
| 2.3.7 | Advance to stage 4 | Click "Next Stage" | Stage updates to "Fee Payment" | ⬜ |
| 2.3.8 | Advance to stage 5 | Click "Next Stage" | Stage updates to "Enrollment Complete" | ⬜ |
| 2.3.9 | Complete process | Click "Complete" | Instance status = 'completed' | ⬜ |

**Success Criteria:**
- All 5 stages recorded in stage_history
- Each stage has start_time and duration
- completed_at timestamp set
- Total cycle time calculated

---

### Test Scenario 2.4: Report TIMWOOD Waste

**Preconditions:**
- Process instance in progress

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 2.4.1 | Open waste reporting | Click "Report Waste" button | Waste incident form opens | ⬜ |
| 2.4.2 | Select waste category | "W - Waiting" | Category selected | ⬜ |
| 2.4.3 | Enter description | "Approval delayed 48 hours due to HOD unavailability" | Description saved | ⬜ |
| 2.4.4 | Estimate duration | 48 hours | Duration entered | ⬜ |
| 2.4.5 | Add root cause | "No backup approver defined" | Root cause saved | ⬜ |
| 2.4.6 | Link to process | Select process instance | Link created | ⬜ |
| 2.4.7 | Submit report | Click "Submit" | Waste incident created | ⬜ |

**Success Criteria:**
- Waste incident saved
- waste_category = 'W'
- estimated_duration_hours = 48
- Linked to process instance

---

### Test Scenario 2.5: View TIMWOOD Breakdown

**Preconditions:**
- At least 3 waste incidents reported across different categories

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 2.5.1 | Navigate to waste tab | /process-excellence/waste | Waste dashboard loads | ⬜ |
| 2.5.2 | View summary cards | - | Total waste incidents count shown | ⬜ |
| 2.5.3 | View pie chart | - | TIMWOOD distribution visible | ⬜ |
| 2.5.4 | Check category labels | - | All 8 categories labeled (T,I,M,W,O1,O2,D,T) | ⬜ |
| 2.5.5 | View incident list | - | Recent waste incidents listed | ⬜ |
| 2.5.6 | Filter by category | Select "W - Waiting" | Only waiting incidents shown | ⬜ |
| 2.5.7 | View total duration | - | Sum of all waste durations displayed | ⬜ |

**Success Criteria:**
- Pie chart shows correct distribution
- Filtering works correctly
- Total duration accurate

---

### Test Scenario 2.6: Calculate Value-Add Ratio

**Preconditions:**
- Process completed from 2.3

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 2.6.1 | View completed process | Open process instance | Detail page loads | ⬜ |
| 2.6.2 | Check value-add ratio | - | Ratio displayed (value-add time / total time) | ⬜ |
| 2.6.3 | Verify calculation | - | Only stages marked value-add counted | ⬜ |
| 2.6.4 | Compare to target | - | Target ratio = 10% shown | ⬜ |
| 2.6.5 | Check color coding | - | Green if > target, Red if < target | ⬜ |

**Success Criteria:**
- Value-add ratio calculated correctly
- Formula: (Stage2 + Stage4 + Stage5 duration) / Total duration
- Target ratio = 10% (industry benchmark)

---

### Test Scenario 2.7: SLA Status Tracking

**Preconditions:**
- Process instance exists

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 2.7.1 | View process instances | - | Instances list loads | ⬜ |
| 2.7.2 | Check SLA badges | - | Each instance shows SLA status | ⬜ |
| 2.7.3 | Verify on_track | Process within 50% of SLA | Badge = green "On Track" | ⬜ |
| 2.7.4 | Verify at_risk | Process at 75% of SLA | Badge = yellow "At Risk" | ⬜ |
| 2.7.5 | Verify breached | Process exceeded SLA | Badge = red "Breached" | ⬜ |
| 2.7.6 | Filter by SLA status | Select "Breached" filter | Only breached instances shown | ⬜ |

**Success Criteria:**
- SLA status calculated correctly
- Auto-updates as time progresses
- Filtering accurate

---

### Test Scenario 2.8: Generate Process Audit

**Preconditions:**
- Multiple completed processes exist

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 2.8.1 | Navigate to audits tab | /process-excellence/audits | Audits page loads | ⬜ |
| 2.8.2 | Click "New Audit" | - | Audit creation form opens | ⬜ |
| 2.8.3 | Select period | January 2026 | Period selected | ⬜ |
| 2.8.4 | Select process | "Student Admission Process" | Process selected | ⬜ |
| 2.8.5 | Click "Generate" | - | Audit generated with findings | ⬜ |
| 2.8.6 | View audit findings | - | Key metrics displayed | ⬜ |
| 2.8.7 | Check A/B/C/D rating | - | Overall rating assigned | ⬜ |
| 2.8.8 | View recommendations | - | Improvement suggestions shown | ⬜ |
| 2.8.9 | Export audit report | Click "Export PDF" | PDF downloaded | ⬜ |

**Success Criteria:**
- Audit captures all process instances in period
- Findings include: avg cycle time, SLA compliance %, waste incidents
- A/B/C/D rating logic applied
- PDF export contains all data

---

### F002 Performance Tests

**Test 2.P1: Process List Load**
- **Action:** Load /process-excellence/definitions with 50+ processes
- **Expected:** < 2 seconds
- **Result:** ⬜

**Test 2.P2: Instance Timeline Render**
- **Action:** View process instance with 20+ stages
- **Expected:** Timeline renders < 1 second
- **Result:** ⬜

**Test 2.P3: Waste Dashboard**
- **Action:** Load waste dashboard with 500+ incidents
- **Expected:** Charts render < 3 seconds
- **Result:** ⬜

---

### F002 Security Tests

**Test 2.S1: Department Access Control**
- **Action:** Staff from Dept A tries to view Dept B's processes
- **Expected:** Filtered list shows only Dept A processes
- **Result:** ⬜

**Test 2.S2: Process Definition Edit**
- **Action:** Non-admin tries to edit process definition
- **Expected:** 403 Forbidden
- **Result:** ⬜

---

## F003: Parent Portal

**Module URL:** `/parent-portal` (Separate Auth: `/auth/parent/login`)
**Test Priority:** HIGH
**Dependencies:** F001 (NPS integration)
**Estimated Test Time:** 90 minutes

### Test Scenario 3.1: Parent Registration

**Preconditions:**
- Learner record exists with phone number

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 3.1.1 | Navigate to parent auth | /auth/parent/login | Parent login page loads | ⬜ |
| 3.1.2 | Click "Register" | - | Registration form appears | ⬜ |
| 3.1.3 | Enter phone number | +91 9876543210 | Phone input validated | ⬜ |
| 3.1.4 | Enter parent name | "Rajesh Kumar" | Name field populated | ⬜ |
| 3.1.5 | Enter email (optional) | rajesh@example.com | Email saved | ⬜ |
| 3.1.6 | Link to learner | Select learner from dropdown | Learner linked | ⬜ |
| 3.1.7 | Submit registration | Click "Register" | OTP sent to phone | ⬜ |
| 3.1.8 | Enter OTP | 6-digit code | OTP validated | ⬜ |
| 3.1.9 | Verify account created | - | Parent profile created with status 'pending' | ⬜ |

**Success Criteria:**
- parent_profiles record created
- parent_learner_links record created with verified_at = NULL
- Status = 'pending_verification'

---

### Test Scenario 3.2: Admin Verification of Parent Link

**Preconditions:**
- Parent registration from 3.1 exists

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 3.2.1 | Login as Institution Admin | - | Admin dashboard | ⬜ |
| 3.2.2 | Navigate to pending links | /admin/parent-verifications | Pending links list | ⬜ |
| 3.2.3 | View link details | Click on "Rajesh Kumar" | Shows parent and learner details | ⬜ |
| 3.2.4 | Verify documents | Check uploaded ID | Documents visible | ⬜ |
| 3.2.5 | Approve link | Click "Approve" | Status changes to 'verified' | ⬜ |
| 3.2.6 | Check verified_at | - | Timestamp recorded | ⬜ |

**Success Criteria:**
- verified_at timestamp set
- Parent can now access learner data
- Email notification sent to parent (if configured)

---

### Test Scenario 3.3: Parent Login via OTP

**Preconditions:**
- Parent account verified from 3.2

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 3.3.1 | Navigate to parent login | /auth/parent/login | Login page loads | ⬜ |
| 3.3.2 | Enter phone number | +91 9876543210 | Phone validated | ⬜ |
| 3.3.3 | Click "Send OTP" | - | OTP sent, timer starts | ⬜ |
| 3.3.4 | Enter OTP | 6-digit code | OTP validated | ⬜ |
| 3.3.5 | Verify redirect | - | Redirected to /parent-portal/dashboard | ⬜ |
| 3.3.6 | Check session | - | httpOnly cookie set | ⬜ |

**Success Criteria:**
- JWT token issued
- parent_sessions record created
- Session expires after 7 days (configurable)

---

### Test Scenario 3.4: View Parent Dashboard

**Preconditions:**
- Logged in as Parent
- At least 1 verified learner link

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 3.4.1 | View dashboard | /parent-portal/dashboard | Dashboard loads | ⬜ |
| 3.4.2 | Check learner cards | - | All linked learners shown | ⬜ |
| 3.4.3 | View attendance summary | - | 30-day attendance % displayed | ⬜ |
| 3.4.4 | View upcoming events | - | Next 5 events listed | ⬜ |
| 3.4.5 | View pending fees | - | Outstanding invoices shown | ⬜ |
| 3.4.6 | View recent communications | - | Last 10 announcements listed | ⬜ |

**Success Criteria:**
- All learner data visible
- Attendance calculated correctly
- Only institution-specific data shown
- RLS policies enforced

---

### Test Scenario 3.5: View Learner Detail

**Preconditions:**
- Logged in as Parent

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 3.5.1 | Click learner card | - | Navigate to /parent-portal/learner/[id] | ⬜ |
| 3.5.2 | View academic info | - | Program, semester, section displayed | ⬜ |
| 3.5.3 | View attendance tab | - | Monthly attendance breakdown | ⬜ |
| 3.5.4 | View grades tab | - | Course-wise grades | ⬜ |
| 3.5.5 | View attendance chart | - | Line chart of daily attendance | ⬜ |
| 3.5.6 | View leave requests | - | Approved/pending leaves listed | ⬜ |

**Success Criteria:**
- All learner data accessible
- Charts render correctly
- Navigation between tabs smooth

---

### Test Scenario 3.6: View Fee Status

**Preconditions:**
- Learner has pending invoices

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 3.6.1 | Navigate to fees | /parent-portal/fees | Fees page loads | ⬜ |
| 3.6.2 | View invoice list | - | All invoices displayed | ⬜ |
| 3.6.3 | Check pending bills | - | Highlighted in red | ⬜ |
| 3.6.4 | View invoice detail | Click invoice row | Detail modal opens | ⬜ |
| 3.6.5 | View payment history | - | Past payments listed | ⬜ |
| 3.6.6 | Download invoice | Click "Download" | PDF downloaded | ⬜ |

**Success Criteria:**
- Only linked learner's invoices shown
- Total pending amount accurate
- Payment history complete

---

### Test Scenario 3.7: Read Communications

**Preconditions:**
- Institution has sent announcements

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 3.7.1 | Navigate to communications | /parent-portal/communication | Communications list | ⬜ |
| 3.7.2 | View unread count | - | Badge shows unread count | ⬜ |
| 3.7.3 | Click communication | - | Content displayed | ⬜ |
| 3.7.4 | Verify marked as read | - | read_at timestamp set | ⬜ |
| 3.7.5 | View attachments | - | Downloadable files shown | ⬜ |
| 3.7.6 | Filter by category | Select "Announcements" | Only announcements shown | ⬜ |

**Success Criteria:**
- Unread count accurate
- read_at updates correctly
- Attachments downloadable

---

### Test Scenario 3.8: Submit NPS from Parent Portal

**Preconditions:**
- Active NPS survey for Parents exists
- Logged in as Parent

**Test Steps:**

| Step | Action | Input | Expected Result | Pass/Fail |
|------|--------|-------|-----------------|-----------|
| 3.8.1 | View dashboard | /parent-portal/dashboard | NPS prompt visible | ⬜ |
| 3.8.2 | Click "Take Survey" | - | Survey modal opens | ⬜ |
| 3.8.3 | Select score | Score: 8 | Score selected | ⬜ |
| 3.8.4 | Enter feedback | "Good communication, would like more updates" | Feedback saved | ⬜ |
| 3.8.5 | Submit survey | Click "Submit" | Response submitted | ⬜ |
| 3.8.6 | Verify prompt hidden | - | NPS prompt no longer shown | ⬜ |

**Success Criteria:**
- Response linked to parent_id
- stakeholder_type = 'parent'
- sentiment = 'passive' (score 7-8)
- Integration with F001 NPS module works

---

### F003 Performance Tests

**Test 3.P1: Dashboard Load**
- **Action:** Parent with 3 learners loads dashboard
- **Expected:** < 2 seconds
- **Result:** ⬜

**Test 3.P2: OTP Delivery**
- **Action:** Request OTP
- **Expected:** OTP received within 30 seconds
- **Result:** ⬜

**Test 3.P3: Learner Data Load**
- **Action:** View learner detail page
- **Expected:** < 1.5 seconds
- **Result:** ⬜

---

### F003 Security Tests

**Test 3.S1: Cross-Parent Data Access**
- **Action:** Parent A tries to access Parent B's learner
- **Expected:** 403 Forbidden
- **Result:** ⬜

**Test 3.S2: Unverified Link Access**
- **Action:** Parent tries to access learner before admin verification
- **Expected:** "Verification pending" message
- **Result:** ⬜

**Test 3.S3: Session Expiry**
- **Action:** Wait 7 days, try to access dashboard
- **Expected:** Redirect to login
- **Result:** ⬜

---

## 4. Test Data Requirements

### Minimum Test Data

| Entity | Quantity | Details |
|--------|----------|---------|
| **Institutions** | 2 | JKKN College of Engineering, JKKN Polytechnic |
| **Departments** | 4 | CSE, ECE, Mech, Civil |
| **Programs** | 6 | B.E. CSE, B.E. ECE, B.Tech Mech, Diploma CSE, etc. |
| **Semesters** | 2 | Semester 3, Semester 5 |
| **Sections** | 8 | 4 sections per semester |
| **Students** | 50 | 25 per institution |
| **Parents** | 30 | 15 per institution (some students share parents) |
| **Staff** | 15 | 7-8 per institution |
| **Admissions** | 10 | For process excellence testing |
| **Bills/Invoices** | 40 | Mix of pending/paid |

### Test Data Creation Script

Create file: `/Users/omm/PROJECTS/MyJKKN/scripts/seed-uat-data.sql`

```sql
-- Run this script on staging database (hhprjbgknupaplivtoib)

-- 1. NPS Test Data
INSERT INTO nps_surveys (id, institution_id, title, stakeholder_types, start_date, end_date, status, created_by)
VALUES
  (gen_random_uuid(), '[INSTITUTION_ID]', 'Q1 2026 Student Satisfaction', ARRAY['student'], NOW(), NOW() + INTERVAL '30 days', 'active', '[ADMIN_USER_ID]'),
  (gen_random_uuid(), '[INSTITUTION_ID]', 'Parent Feedback Survey', ARRAY['parent'], NOW(), NOW() + INTERVAL '30 days', 'active', '[ADMIN_USER_ID]');

-- 2. Process Definitions
INSERT INTO process_definitions (id, institution_id, name, description, stages, target_cycle_time_hours, sla_threshold_hours, created_by)
VALUES (
  gen_random_uuid(),
  '[INSTITUTION_ID]',
  'Student Admission Process',
  'End-to-end admission workflow',
  '[
    {"name": "Application Received", "duration_hours": 24, "value_add": false},
    {"name": "Document Verification", "duration_hours": 48, "value_add": true},
    {"name": "Approval Pending", "duration_hours": 72, "value_add": false},
    {"name": "Fee Payment", "duration_hours": 24, "value_add": true},
    {"name": "Enrollment Complete", "duration_hours": 12, "value_add": true}
  ]'::jsonb,
  720,
  504,
  '[ADMIN_USER_ID]'
);

-- 3. Parent Profiles (pre-verified for testing)
INSERT INTO parent_profiles (id, phone_number, email, full_name, institution_id)
VALUES
  (gen_random_uuid(), '+919876543210', 'parent1@example.com', 'Rajesh Kumar', '[INSTITUTION_ID]'),
  (gen_random_uuid(), '+919876543211', 'parent2@example.com', 'Priya Sharma', '[INSTITUTION_ID]');

-- 4. Parent-Learner Links (verified)
INSERT INTO parent_learner_links (parent_id, learner_id, relationship, verified_at, verified_by)
SELECT
  p.id,
  s.id,
  'father',
  NOW(),
  '[ADMIN_USER_ID]'
FROM parent_profiles p
CROSS JOIN students s
WHERE s.email LIKE 'test-student%'
LIMIT 2;

-- 5. Grievance Categories
INSERT INTO grievance_categories (institution_id, name, description, default_sla_hours, created_by)
VALUES
  ('[INSTITUTION_ID]', 'Academic', 'Grade disputes, course issues', 48, '[ADMIN_USER_ID]'),
  ('[INSTITUTION_ID]', 'Administrative', 'Fee, certificates, records', 72, '[ADMIN_USER_ID]'),
  ('[INSTITUTION_ID]', 'Infrastructure', 'Facilities, equipment issues', 96, '[ADMIN_USER_ID]');

-- 6. Maturity Framework (default 6 dimensions)
INSERT INTO maturity_frameworks (institution_id, name, dimensions, created_by)
VALUES (
  '[INSTITUTION_ID]',
  'TQM Excellence Framework',
  '[
    {"name": "Student Learning", "description": "CLO attainment and competency development"},
    {"name": "Faculty Development", "description": "Training and skill enhancement"},
    {"name": "Process Excellence", "description": "Waste reduction and value-add"},
    {"name": "Stakeholder Satisfaction", "description": "NPS across all stakeholders"},
    {"name": "Infrastructure", "description": "Facilities and resources"},
    {"name": "Innovation", "description": "Research and continuous improvement"}
  ]'::jsonb,
  '[ADMIN_USER_ID]'
);

-- 7. Billing COPQ Categories (if not exist)
-- Categories: invoice_error, payment_delay, refund_processing, manual_correction, system_downtime
```

---

## 5. Critical User Journeys

### Journey 1: End-to-End NPS Workflow

**Actor:** Institution Admin
**Duration:** 15 minutes
**Steps:**
1. Login as admin
2. Navigate to /stakeholder-nps
3. Create new survey for "Students"
4. Add 2 custom questions
5. Activate survey
6. Logout
7. Login as Student
8. Submit NPS response (score 9)
9. Logout
10. Login as different Student
11. Submit NPS response (score 5)
12. Logout
13. Login as admin
14. View analytics dashboard
15. Export CSV report
16. Close survey

**Success Criteria:**
- Survey created and activated
- 2 responses submitted
- NPS score = (50% - 50%) = 0
- CSV export contains both responses
- Survey closed, no new responses accepted

---

### Journey 2: Process Excellence - Waste Reporting

**Actor:** Staff Member
**Duration:** 10 minutes
**Steps:**
1. Login as staff
2. Navigate to /process-excellence
3. View ongoing admission processes
4. Identify process with delay
5. Click "Report Waste"
6. Select "W - Waiting"
7. Describe delay issue
8. Submit waste report
9. View TIMWOOD breakdown
10. Verify waste incident appears in chart

**Success Criteria:**
- Waste incident created
- Linked to process instance
- Appears in analytics dashboard
- TIMWOOD pie chart updates

---

### Journey 3: Parent Portal - Full Session

**Actor:** Parent
**Duration:** 20 minutes
**Steps:**
1. Navigate to /auth/parent/login
2. Enter phone number
3. Receive and enter OTP
4. View dashboard with 2 linked learners
5. Click on first learner
6. View attendance (should show 30-day %)
7. Navigate to fees section
8. Check pending invoice
9. Download invoice PDF
10. Navigate to communications
11. Read unread announcement
12. Return to dashboard
13. Submit NPS survey (score 8)
14. Logout

**Success Criteria:**
- OTP authentication works
- All learner data visible
- Attendance calculated correctly
- Invoice download successful
- Communication marked as read
- NPS response saved
- Session ends cleanly

---

### Journey 4: Grievance Ticket Lifecycle

**Actor:** Student & Staff
**Duration:** 15 minutes
**Steps:**
1. Login as Student
2. Navigate to /grievance
3. Click "Raise Grievance"
4. Select "Academic" category
5. Enter subject: "Grade dispute - Assignment 2"
6. Describe issue
7. Submit ticket
8. Note ticket number (GRV-YYYYMMDD-XXXX)
9. Logout
10. Login as Staff
11. View grievance dashboard
12. Find ticket in "Open" tab
13. Assign to self
14. Add internal note
15. Add public comment for student
16. Mark as "Resolved"
17. Logout
18. Login as Student
19. View resolved ticket
20. Rate satisfaction (4/5 stars)

**Success Criteria:**
- Ticket created with unique number
- SLA deadline = 48 hours from creation
- Staff can assign and comment
- Student sees public comments only
- Satisfaction rating closes ticket
- SLA compliance tracked

---

### Journey 5: Maturity Assessment Submission

**Actor:** Institution Admin
**Duration:** 12 minutes
**Steps:**
1. Login as admin
2. Navigate to /maturity-assessment
3. Click "New Assessment"
4. Select department: CSE
5. Rate 6 dimensions (scores 1-4 each)
6. Add evidence for low-scoring dimensions
7. Set improvement target: Stage 3
8. Set target date: 2026-12-31
9. Submit assessment
10. View radar chart
11. Create 3 improvement actions
12. Assign actions to staff members

**Success Criteria:**
- Assessment created
- overall_stage = average of dimension scores (floored)
- Radar chart shows 6 axes
- Improvement actions linked
- Email notifications sent to assignees (if configured)

---

### Journey 6: OKR ABCD Categorization

**Actor:** Institution Admin
**Duration:** 8 minutes
**Steps:**
1. Login as admin
2. Navigate to /okr
3. View existing Key Results
4. Open KR: "Improve placement rate to 85%"
5. Current progress: 78%
6. Add process rating: 5/5
7. Add process notes: "Strong industry partnerships, systematic training"
8. View auto-calculated ABCD category (should be "C" - good process, poor result so far)
9. Navigate to /okr/abcd
10. View 2x2 matrix
11. Verify KR plotted correctly

**Success Criteria:**
- process_rating saved
- abcd_category = calculated based on progress + process rating
- Matrix visualization shows correct quadrant
- Category logic:
  - A: Good process (4-5) + Good result (80%+)
  - B: Good process (4-5) + Poor result (<80%)
  - C: Poor process (1-3) + Poor result (<80%)
  - D: Poor process (1-3) + Good result (80%+) [FALSE SECURITY!]

---

### Journey 7: Billing COPQ Incident Tracking

**Actor:** Billing Staff
**Duration:** 10 minutes
**Steps:**
1. Login as billing staff
2. Navigate to /billing/copq
3. Click "Log Incident"
4. Select category: "invoice_error"
5. Visible cost: ₹5,000 (refund amount)
6. Hidden cost estimate: ₹20,000 (staff time 40hrs @ ₹500/hr)
7. Root cause: "Manual data entry mistake"
8. Link to invoice: INV-2026-001
9. Add preventive action: "Implement data validation"
10. Submit incident
11. View iceberg chart
12. Verify total COPQ updated

**Success Criteria:**
- Incident created
- total_cost = visible + hidden = ₹25,000
- Iceberg chart shows 20% visible, 80% hidden
- Linked to specific invoice
- YTD COPQ total updated

---

## 6. Performance Benchmarks

### Page Load Targets

| Page | Target (3G) | Target (4G/WiFi) | Acceptable | Fail |
|------|-------------|------------------|------------|------|
| Dashboard | < 3s | < 2s | < 5s | > 5s |
| List Pages | < 2.5s | < 1.5s | < 4s | > 4s |
| Detail Pages | < 2s | < 1s | < 3s | > 3s |
| Form Pages | < 1.5s | < 1s | < 2s | > 2s |
| Analytics/Charts | < 4s | < 3s | < 6s | > 6s |

### API Response Targets

| Endpoint Type | Target | Acceptable | Fail |
|---------------|--------|------------|------|
| GET single record | < 200ms | < 500ms | > 1s |
| GET list (paginated) | < 500ms | < 1s | > 2s |
| POST/PUT | < 300ms | < 800ms | > 1.5s |
| DELETE | < 200ms | < 500ms | > 1s |
| Analytics queries | < 1s | < 2s | > 3s |

### Concurrent User Targets

| User Count | Response Time | Success Rate | Server CPU | Memory |
|------------|---------------|--------------|------------|--------|
| 10 | < 1s | > 99% | < 30% | < 512MB |
| 50 | < 2s | > 98% | < 50% | < 1GB |
| 100 | < 3s | > 95% | < 70% | < 2GB |
| 500 | < 5s | > 90% | < 85% | < 4GB |

### Performance Test Scripts

Create file: `/Users/omm/PROJECTS/MyJKKN/tests/uat/performance-tests.sh`

```bash
#!/bin/bash
# UAT Performance Testing Script

BASE_URL="https://myjkkn-omm-dev.vercel.app"
AUTH_TOKEN="[BEARER_TOKEN]"

echo "=== MyJKKN TQM Performance Tests ==="
echo "Environment: Staging"
echo "Date: $(date)"
echo ""

# Test 1: NPS Dashboard Load
echo "Test 1: NPS Dashboard Load Time"
curl -w "@curl-format.txt" -o /dev/null -s "$BASE_URL/stakeholder-nps"
echo ""

# Test 2: Grievance List API
echo "Test 2: Grievance List API Response"
curl -w "@curl-format.txt" -o /dev/null -s \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  "$BASE_URL/api/grievance/tickets?page=1&limit=20"
echo ""

# Test 3: Process Excellence Metrics
echo "Test 3: Process Excellence Metrics"
curl -w "@curl-format.txt" -o /dev/null -s \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  "$BASE_URL/api/process-excellence/metrics"
echo ""

# Test 4: Parent Portal Dashboard
echo "Test 4: Parent Portal Dashboard"
curl -w "@curl-format.txt" -o /dev/null -s \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  "$BASE_URL/api/parent-portal/dashboard"
echo ""

echo "=== Test Complete ==="
```

Create file: `curl-format.txt`
```
   time_namelookup:  %{time_namelookup}s\n
      time_connect:  %{time_connect}s\n
   time_appconnect:  %{time_appconnect}s\n
  time_pretransfer:  %{time_pretransfer}s\n
     time_redirect:  %{time_redirect}s\n
time_starttransfer:  %{time_starttransfer}s\n
                   ----------\n
        time_total:  %{time_total}s\n
```

---

## 7. Security Test Cases

### S1: Authentication & Authorization

| Test ID | Test Case | Expected Result | Pass/Fail |
|---------|-----------|-----------------|-----------|
| S1.1 | Unauthenticated access to /stakeholder-nps | Redirect to /auth/login | ⬜ |
| S1.2 | Expired JWT token | 401 Unauthorized, redirect to login | ⬜ |
| S1.3 | Token from another institution | 403 Forbidden or empty data | ⬜ |
| S1.4 | Parent OTP expiry (10 min) | "OTP expired, request new" | ⬜ |
| S1.5 | Invalid OTP (3 attempts) | Account locked for 15 minutes | ⬜ |

### S2: Data Isolation (Multi-Tenancy)

| Test ID | Test Case | Expected Result | Pass/Fail |
|---------|-----------|-----------------|-----------|
| S2.1 | User from Inst A views Inst B's NPS surveys | Empty list or 403 | ⬜ |
| S2.2 | API call with manipulated institution_id | RLS blocks, returns 0 rows | ⬜ |
| S2.3 | Parent from Inst A tries to view Inst B learner | 403 Forbidden | ⬜ |
| S2.4 | Staff from Dept A views Dept B's grievances | Filtered list (only Dept A) | ⬜ |
| S2.5 | Maturity assessment cross-institution access | RLS blocks | ⬜ |

### S3: Input Validation

| Test ID | Test Case | Expected Result | Pass/Fail |
|---------|-----------|-----------------|-----------|
| S3.1 | XSS in NPS feedback field | Input sanitized, script not executed | ⬜ |
| S3.2 | SQL injection in search query | Query sanitized, no error | ⬜ |
| S3.3 | Invalid phone format (parent portal) | "Invalid phone number" error | ⬜ |
| S3.4 | Negative numbers in COPQ visible cost | Validation error | ⬜ |
| S3.5 | Future date in maturity assessment submission | Validation error | ⬜ |

### S4: Session Management

| Test ID | Test Case | Expected Result | Pass/Fail |
|---------|-----------|-----------------|-----------|
| S4.1 | Session expiry after 7 days (parent) | Redirect to login | ⬜ |
| S4.2 | Concurrent sessions from different devices | Both sessions valid | ⬜ |
| S4.3 | Logout from one device | Session invalidated | ⬜ |
| S4.4 | Session hijacking attempt | Token validation fails | ⬜ |
| S4.5 | CSRF token validation | Request rejected without valid token | ⬜ |

### S5: Data Privacy (GDPR/Privacy)

| Test ID | Test Case | Expected Result | Pass/Fail |
|---------|-----------|-----------------|-----------|
| S5.1 | Student data visible to unauthorized parent | 403 Forbidden | ⬜ |
| S5.2 | Internal grievance comments visible to raiser | Hidden from student view | ⬜ |
| S5.3 | Personal data in logs | No PII in server logs | ⬜ |
| S5.4 | Parent data deletion request | Cascade delete or anonymize | ⬜ |
| S5.5 | NPS response anonymization option | No stakeholder_id stored if anonymous | ⬜ |

### S6: API Security

| Test ID | Test Case | Expected Result | Pass/Fail |
|---------|-----------|-----------------|-----------|
| S6.1 | Rate limiting (100 req/min per user) | 429 Too Many Requests | ⬜ |
| S6.2 | Large payload attack (>5MB) | 413 Payload Too Large | ⬜ |
| S6.3 | API endpoint without auth header | 401 Unauthorized | ⬜ |
| S6.4 | Manipulated request parameters | Validation error | ⬜ |
| S6.5 | CORS policy violation | Request blocked | ⬜ |

---

## 8. Acceptance Criteria

### Module-Level Acceptance

Each module must meet ALL criteria before production deployment:

#### F001: Stakeholder NPS

- [ ] Survey creation workflow complete (draft → active → closed)
- [ ] All 5 stakeholder types supported
- [ ] NPS calculation accurate (% Promoters - % Detractors)
- [ ] Sentiment auto-calculated correctly (0-6: Detractor, 7-8: Passive, 9-10: Promoter)
- [ ] Duplicate response prevention working
- [ ] Analytics dashboard displays trends correctly
- [ ] CSV export contains all response data
- [ ] RLS policies enforce institution isolation
- [ ] No console errors during full workflow
- [ ] Mobile responsive (tested on iOS/Android)

#### F002: Process Excellence

- [ ] Process definition creation with JSONB stages
- [ ] Process instance tracking with stage progression
- [ ] TIMWOOD waste tracking (all 8 categories)
- [ ] Value-add ratio calculation accurate
- [ ] SLA status auto-updates (on_track/at_risk/breached)
- [ ] Audit report generation with A/B/C/D rating
- [ ] Waste analytics dashboard with pie chart
- [ ] Department-level access control working
- [ ] No performance issues with 50+ processes
- [ ] PDF export functional

#### F003: Parent Portal

- [ ] OTP-based phone authentication working
- [ ] Parent-learner link verification workflow complete
- [ ] Dashboard shows all linked learners
- [ ] 30-day attendance calculation accurate
- [ ] Fee status displays pending invoices correctly
- [ ] Communications marked as read properly
- [ ] NPS survey integration functional
- [ ] Session management (7-day expiry) working
- [ ] RLS policies prevent cross-parent data access
- [ ] Mobile-first design implemented

#### F004: Grievance System

- [ ] Ticket creation with auto-generated ticket number (GRV-YYYYMMDD-XXXX)
- [ ] 48-hour SLA tracking from GIIS benchmark
- [ ] Category management with configurable SLA
- [ ] Assignment and escalation workflow
- [ ] Internal/external comment threading
- [ ] Satisfaction rating (1-5 stars) on resolution
- [ ] SLA dashboard with compliance metrics
- [ ] Status workflow complete (open → in_progress → resolved → closed)
- [ ] Email notifications functional (if configured)
- [ ] Search and filtering working

#### F005: Maturity Assessment

- [ ] 4-stage maturity model implemented (Reactive → Managed → Proactive → Excellence)
- [ ] 6-dimension framework (Student Learning, Faculty Dev, Process, Stakeholder, Infrastructure, Innovation)
- [ ] Self-assessment submission workflow
- [ ] overall_stage calculation accurate (average of dimensions)
- [ ] Radar chart visualization renders correctly
- [ ] Improvement action tracking
- [ ] Progress monitoring dashboard
- [ ] Department-level assessments
- [ ] Evidence attachment support
- [ ] Target setting and tracking

#### F006: OKR ABCD Matrix

- [ ] process_rating field added to okr_key_results table
- [ ] ABCD category auto-calculation logic correct:
  - A: Good process (4-5) + Good result (80%+)
  - B: Good process (4-5) + Poor result (<80%)
  - C: Poor process (1-3) + Poor result (<80%)
  - D: Poor process (1-3) + Good result (80%+)
- [ ] 2x2 matrix visualization working
- [ ] Distribution chart shows A/B/C/D percentages
- [ ] Filtering by category functional
- [ ] Quarterly review prompt appears
- [ ] Integration with existing OKR module seamless
- [ ] No breaking changes to existing OKR functionality

#### F007: Billing COPQ

- [ ] COPQ incident logging with visible + hidden costs
- [ ] Category management (invoice_error, payment_delay, refund_processing, etc.)
- [ ] Iceberg visualization (20% visible, 80% hidden)
- [ ] Root cause analysis field
- [ ] Link to specific invoices
- [ ] Preventive action tracking
- [ ] YTD total COPQ calculation
- [ ] Trend analysis (monthly)
- [ ] Category breakdown chart
- [ ] Export functionality (PDF/Excel)

---

### System-Level Acceptance

- [ ] **Build**: `npm run build` completes without errors
- [ ] **Lint**: `npm run lint` passes with 0 warnings
- [ ] **Type Check**: `npx tsc --noEmit` passes
- [ ] **Migrations**: All 7 TQM migrations applied successfully
- [ ] **Database**: All tables, views, functions, triggers created
- [ ] **RLS**: All RLS policies active and tested
- [ ] **Performance**: All pages load within targets (see Section 6)
- [ ] **Security**: All security tests passed (see Section 7)
- [ ] **Mobile**: Tested on iOS Safari and Android Chrome
- [ ] **Browser**: Tested on Chrome, Safari, Edge (latest versions)
- [ ] **Accessibility**: WCAG 2.1 AA compliance for key flows
- [ ] **Error Handling**: Graceful error messages for all failure scenarios
- [ ] **Loading States**: Skeletons/spinners for async operations
- [ ] **Empty States**: Clear messaging when no data exists
- [ ] **Documentation**: All 7 modules documented in /docs
- [ ] **Changelog**: Deployment notes prepared

---

### Production Readiness Checklist

Before deploying to production (main branch):

- [ ] **Code Review**: All code reviewed by senior developer
- [ ] **UAT Sign-Off**: This test plan completed with 100% pass rate
- [ ] **Performance Test**: Load testing completed (50 concurrent users)
- [ ] **Security Audit**: Vulnerability scan completed
- [ ] **Data Migration**: Production data migration plan ready
- [ ] **Rollback Plan**: Documented rollback procedure
- [ ] **Monitoring**: Error tracking configured (e.g., Sentry)
- [ ] **Backup**: Database backup taken before deployment
- [ ] **Feature Flags**: Critical features behind flags (if applicable)
- [ ] **Training**: User training materials prepared
- [ ] **Support**: Support team briefed on new features
- [ ] **Deployment Window**: Scheduled during low-traffic period

---

## 9. Test Execution Tracking

### Test Execution Summary Sheet

Use this template to track test execution:

| Module | Total Tests | Passed | Failed | Blocked | Not Run | Pass Rate | Status |
|--------|-------------|--------|--------|---------|---------|-----------|--------|
| F001: NPS | 17 | - | - | - | - | - | ⬜ |
| F002: Process Excellence | 18 | - | - | - | - | - | ⬜ |
| F003: Parent Portal | 18 | - | - | - | - | - | ⬜ |
| F004: Grievance | 19 | - | - | - | - | - | ⬜ |
| F005: Maturity | 15 | - | - | - | - | - | ⬜ |
| F006: OKR ABCD | 8 | - | - | - | - | - | ⬜ |
| F007: COPQ | 10 | - | - | - | - | - | ⬜ |
| **Performance** | 21 | - | - | - | - | - | ⬜ |
| **Security** | 30 | - | - | - | - | - | ⬜ |
| **Total** | **156** | **-** | **-** | **-** | **-** | **-%** | **⬜** |

### Daily Test Log

Date: __________
Tester: __________
Environment: https://myjkkn-omm-dev.vercel.app

| Time | Module | Test ID | Result | Notes |
|------|--------|---------|--------|-------|
| 09:00 | F001 | 1.1.1 - 1.1.10 | ✅ | Survey created successfully |
| 09:15 | F001 | 1.2.1 - 1.2.5 | ✅ | Activation workflow smooth |
| 09:30 | F001 | 1.3.1 - 1.3.8 | ❌ | Duplicate submission not blocked |
| ... | ... | ... | ... | ... |

### Defect Summary

| Severity | Count | % of Total |
|----------|-------|------------|
| Critical | - | - |
| High | - | - |
| Medium | - | - |
| Low | - | - |
| **Total** | **-** | **100%** |

---

## 10. Defect Management

### Defect Reporting Template

**Defect ID:** DEF-001
**Module:** [F001-F007]
**Test Scenario:** [e.g., 1.3]
**Severity:** [Critical / High / Medium / Low]
**Status:** [Open / In Progress / Fixed / Closed / Won't Fix]

**Summary:**
[One-line description]

**Steps to Reproduce:**
1. Step 1
2. Step 2
3. Step 3

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happened]

**Evidence:**
- Screenshot: [filename]
- Video: [filename]
- Console log: [paste error]

**Environment:**
- URL: https://myjkkn-omm-dev.vercel.app
- Browser: Chrome 120.0
- OS: macOS 14.2
- User Role: Institution Admin
- Test Data: Survey ID = [UUID]

**Additional Notes:**
[Any other relevant information]

---

### Severity Definitions

| Severity | Description | Examples | Resolution SLA |
|----------|-------------|----------|----------------|
| **Critical** | System crash, data loss, security breach | Authentication broken, database corruption, RLS bypass | 4 hours |
| **High** | Major feature broken, workaround exists | Survey creation fails, NPS calculation wrong, parent portal inaccessible | 24 hours |
| **Medium** | Feature works but with issues | UI glitch, slow performance, missing validation | 3 days |
| **Low** | Cosmetic, typos, minor enhancements | Color mismatch, label typo, tooltip missing | 1 week |

---

### Defect Workflow

```
[New] → [Open] → [In Progress] → [Fixed] → [Ready for Retest] → [Closed]
                                      ↓
                                [Won't Fix] (if not a bug or out of scope)
```

---

### Sample Defect Log

| ID | Module | Severity | Summary | Status | Assigned To | Reported Date | Fixed Date |
|----|--------|----------|---------|--------|-------------|---------------|------------|
| DEF-001 | F001 | High | Duplicate NPS response not blocked | Fixed | Dev Team | 2026-02-06 | 2026-02-07 |
| DEF-002 | F003 | Medium | Parent dashboard load slow (4s) | In Progress | Dev Team | 2026-02-06 | - |
| DEF-003 | F004 | Low | Ticket number format inconsistent | Open | Dev Team | 2026-02-06 | - |
| ... | ... | ... | ... | ... | ... | ... | ... |

---

## Final Sign-Off

### UAT Completion Criteria

UAT is complete when:
- [ ] All 156 test cases executed
- [ ] Pass rate ≥ 95% (≤ 8 failures allowed)
- [ ] All Critical and High severity defects fixed
- [ ] All performance benchmarks met
- [ ] All security tests passed
- [ ] All critical user journeys successful
- [ ] All module acceptance criteria met
- [ ] Production readiness checklist complete

### Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **UAT Lead** | __________ | __________ | __________ |
| **Product Owner** | __________ | __________ | __________ |
| **Technical Lead** | __________ | __________ | __________ |
| **QA Manager** | __________ | __________ | __________ |

---

**Document Status:** READY FOR UAT
**Version:** 1.0
**Last Updated:** 2026-02-05
**Next Review:** Post-UAT Completion

---

*End of UAT Test Plan*
