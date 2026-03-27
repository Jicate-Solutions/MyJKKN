# Admission CRM Advanced Features — Implementation Plan

**Created:** 2026-03-27
**Status:** 🚧 IN PROGRESS
**Branch:** `main` (feature branches per module)
**Handoff Reference:** `docs/features/admission/Admission CRM Handoff/`
**Last Updated:** 2026-03-27 — Phase 0.4 + Phase 2.1 complete

---

## Executive Summary

Comprehensive implementation plan for advancing the Admission CRM module from its current state (27/42 modules) to full feature coverage. Based on deep analysis of the existing codebase (122 files, 38 services, 54 hooks, 34 DB tables) and the omm-dev team's handoff documentation (42 sub-modules, 35 missing tables, B2A migration spec).

### Current vs Target State

| Metric | Current | Target | Delta |
|--------|---------|--------|-------|
| Implemented Modules | 27 (partial-full) | 42 | +15 new modules |
| Database Tables | 34 | 69 | +35 new tables |
| API Routes | 57 (mixed auth) | 120+ (all withAuth) | +63 new/migrated |
| UX Score | 5.3/10 | 8.0/10 | UX overhaul |
| Permission Patterns | 12+ inconsistent | 1 standardized | Unified model |

---

## Implementation Phases

### Legend
- ⬜ Not Started
- 🔄 In Progress
- ✅ Complete
- ⏸️ Blocked
- 🔍 Under Review

---

## Phase 0: Foundation & Prerequisites
> **Priority:** CRITICAL — Must complete before any feature work
> **Estimated Effort:** 3-5 days
> **Status:** ⬜ Not Started

### 0.1 Permission Model Standardization ⬜
**Problem:** 12+ inconsistent permission patterns across admission pages
- Applications: `module="admission" action="view"`
- Leads: `module="admission" action="leads.view"`
- Consultants: `module="admission.consultants" action="view"`

**Solution:**
- Define standardized permission keys in `lib/constants/admission-permissions.ts`
- Pattern: `admission.<module>.<action>` (e.g., `admission.leads.view`, `admission.leads.create`)
- Update all PermissionGuard wrappers across 62 pages
- Update sidebar menu permission checks

**Files to modify:**
- `lib/constants/admission-permissions.ts` (new)
- All `page.tsx` files under `app/(routes)/admission/`
- `lib/sidebarMenuLink.ts`

**Verification:** All pages render correctly for admin, counselor, and restricted roles

---

### 0.2 Database Schema Creation (35 Missing Tables) ⬜
**Problem:** Services reference 35 tables that don't exist in the staging database

**Tables to create (grouped by module):**

#### Selection Module Tables (5)
```
admission_gdpi_sessions        — GD/PI session scheduling
admission_gdpi_candidates      — Candidate assignments to sessions
admission_gdpi_evaluators      — Evaluator assignments
admission_gdpi_scores          — Score records per candidate
admission_screening_exams      — Exam definitions and scheduling
```

#### Enrollment Module Tables (7)
```
admission_merit_lists          — Generated merit lists
admission_offer_letters        — Offer letter records
admission_seat_confirmations   — Seat confirmation + payment tracking
admission_lateral_entry_apps   — Lateral entry applications
admission_lateral_entry_rules  — Eligibility rules per program
admission_application_documents — Document upload tracking
admission_feedback             — Post-enrollment feedback
```

#### Financial Module Tables (6)
```
admission_scholarships         — Scholarship scheme definitions
admission_scholarship_apps     — Scholarship applications
admission_loan_partners        — NBFC/bank partner configs
admission_loan_applications    — Loan application tracking
admission_hostels              — Hostel room inventory
admission_hostel_allocations   — Room allocation records
```

#### Workflow/Campaign Tables (3)
```
admission_workflow_executions   — Workflow execution audit trail
admission_campaign_step_queue  — Campaign step-level queue
admission_whatsapp_campaign_logs — WhatsApp campaign delivery logs
```

#### Consultant Tables (2)
```
consultant_institutions        — Consultant-institution junction (if missing)
communication_cost_log         — Communication billing records
```

#### Infrastructure Tables (4)
```
admission_scoring_rules        — Scoring weight configuration
admission_query_history        — AI query audit log
admission_action_executions    — Insight action tracking
admission_payments             — Payment transaction records
```

#### Data Quality Tables (3)
```
admission_phone_index          — Normalized phone dedup index
communication_rate_limits      — SMS/WA rate limiting
webhook_delivery_logs          — External webhook audit
```

#### Missing Indexes (4)
```sql
idx_workflows_trigger ON admission_workflows(institution_id, trigger_type)
idx_commission_structures_consultant ON consultant_commission_structures(consultant_id, institution_id, is_active)
idx_commission_transactions_status ON consultant_commission_transactions(institution_id, status, created_at DESC)
idx_drip_sequences_workflow ON admission_drip_sequences(workflow_id, status, created_at DESC)
```

**Approach:** Create via Supabase migration files in `supabase/migrations/admission/`
**Verification:** All tables queryable; RLS policies active; FK constraints valid

---

### 0.3 Dual Stage Field Cleanup ⬜
**Problem:** `admission_leads` has both `funnel_stage` (text) and `stage` (enum) — NOT synced

**Solution:**
- Create migration to sync `stage` from `funnel_stage` for all existing records
- Update all service methods to use `stage` (enum) as single source of truth
- Keep `funnel_stage` as deprecated alias with trigger to auto-sync
- Update all UI components to read from `stage`

**Files to modify:**
- `lib/services/admission/lead-service.ts`
- `hooks/admission/use-admission-leads.ts`
- `types/admission.ts`
- Migration file for data sync

**Verification:** Both fields always in sync; no stale reads

---

### 0.4 B2A API Pattern Setup ⬜
**Problem:** Most modules call Supabase directly from client via service classes

**Solution:**
- Establish `withAuth` wrapper in `lib/api/auth-middleware.ts` (if not exists)
- Create response helpers: `paginatedResponse()`, `createdResponse()`, `errorResponse()`
- Set up `apiClient` in `lib/api/client.ts` for hook-to-route communication
- Document pattern for all future modules

**Files:**
- `lib/api/auth-middleware.ts` — withAuth HOF
- `lib/api/response.ts` — Response envelope helpers
- `lib/api/client.ts` — Frontend API client

**Verification:** Sample endpoint (e.g., GET /api/admission/test) works with both session and API key auth

---

## Phase 1: UX Foundation Improvements
> **Priority:** HIGH — Critical for CRM usability before adding modules
> **Estimated Effort:** 5-7 days
> **Status:** ⬜ Not Started

### 1.1 Visual Funnel/Pipeline View ⬜
**Problem:** 21 funnel stages exist but only shown in tables — no visual representation

**Design:**
- Add Kanban board view to Leads page (toggle between Table/Kanban)
- Group 21 stages into 7 macro stages for visualization:
  - **New** (new)
  - **Contacted** (contacted, not_reachable, follow_up_scheduled)
  - **Engaged** (interested, engaged, qualified)
  - **Applied** (application_started, application_submitted, documents_pending, documents_verified)
  - **Selection** (interview_scheduled, interview_completed, offer_sent)
  - **Confirmed** (offer_accepted, token_paid, enrolled, confirmed)
  - **Lost** (lost, dormant, declined, withdrew, expired)
- Drag-and-drop between columns to change stage
- Count badges on each column header
- Color-coded by macro stage (green → red gradient)

**Technical approach:**
- Use `@dnd-kit/core` for drag-and-drop (already in deps or add)
- Create `leads/_components/leads-kanban-view.tsx`
- Add view toggle button to leads page header
- Optimistic stage update on drop with rollback on error

**Files to create:**
- `app/(routes)/admission/leads/_components/leads-kanban-view.tsx`
- `app/(routes)/admission/leads/_components/kanban-column.tsx`
- `app/(routes)/admission/leads/_components/kanban-card.tsx`

**Files to modify:**
- `app/(routes)/admission/leads/page.tsx` (add view toggle)
- `hooks/admission/use-admission-leads.ts` (add stage mutation)

**Verification:** Drag lead from "New" to "Contacted" → stage updates in DB → card moves → undo on error

---

### 1.2 Counselor Unified Work Queue ⬜
**Problem:** Counselors switch between Daily View, Calls, Reminders, Briefing — scattered tools

**Design:**
- New page: `/admission/my-work` (default landing for counselors)
- Layout: 3-column responsive
  - **Left:** Today's assigned leads (sorted by priority/follow-up time)
  - **Center:** Current lead detail (inline, no navigation)
  - **Right:** Upcoming tasks (reminders, calls, follow-ups)
- Top strip: KPI cards (leads contacted today, pending follow-ups, conversion rate)
- Quick actions: Call, WhatsApp, Change Stage, Add Note — all inline

**Technical approach:**
- Combine data from: `useCounselorDailyView`, `useReminders`, `useCallLogs`
- Single page with responsive panels
- Lead detail renders inline (no page navigation)
- Action buttons trigger mutations directly

**Files to create:**
- `app/(routes)/admission/my-work/page.tsx`
- `app/(routes)/admission/my-work/_components/work-queue-panel.tsx`
- `app/(routes)/admission/my-work/_components/lead-detail-panel.tsx`
- `app/(routes)/admission/my-work/_components/upcoming-tasks-panel.tsx`
- `app/(routes)/admission/my-work/_components/kpi-strip.tsx`

**Verification:** Counselor sees all assigned leads, can take actions without navigating away

---

### 1.3 Mobile CRM Optimization ⬜
**Problem:** Bottom navbar doesn't surface admission-specific actions

**Design:**
- Add admission items to mobile bottom nav: "My Work", "Leads", "Calls"
- Make data tables responsive: Collapsible columns, card view on mobile
- Lead detail: Full-screen modal on mobile with swipe navigation

**Files to modify:**
- Mobile bottom navbar config (admission-specific items)
- Data table components (responsive card view variant)

**Verification:** Counselor on phone can access work queue, view leads, make calls

---

## Phase 2: Selection Module (NEW)
> **Priority:** HIGH — Core admission workflow gap
> **Estimated Effort:** 8-10 days
> **Status:** ⬜ Not Started
> **Depends on:** Phase 0 (DB tables, permissions)

### 2.1 GD-PI Management ⬜
**Purpose:** Group Discussion & Personal Interview scheduling, scoring, and results

**Database tables:** `admission_gdpi_sessions`, `admission_gdpi_candidates`, `admission_gdpi_evaluators`, `admission_gdpi_scores`

**Pages:**
- `/admission/gd-pi` — Session list with filters (date, program, status)
- `/admission/gd-pi/new` — Create session form
- `/admission/gd-pi/[id]` — Session detail: candidates, evaluators, scores
- `/admission/gd-pi/[id]/evaluate` — Evaluator scoring interface

**Service:** `lib/services/admission/gdpi-service.ts`
```
Methods:
- getSessions(filters) → paginated session list
- getSessionDetail(id) → session + candidates + scores
- createSession(data) → new session with candidates
- addCandidates(sessionId, leadIds[]) → bulk add from leads
- assignEvaluators(sessionId, profileIds[]) → assign staff
- submitScore(candidateId, evaluatorId, scores) → record evaluation
- publishResults(sessionId) → calculate final scores, update lead stages
```

**Hook:** `hooks/admission/use-gdpi.ts`
**API Routes:**
- `GET/POST /api/admission/gd-pi` (list/create sessions)
- `GET/PUT/DELETE /api/admission/gd-pi/[id]` (session CRUD)
- `POST /api/admission/gd-pi/[id]/candidates` (add candidates)
- `POST /api/admission/gd-pi/[id]/evaluators` (assign evaluators)
- `POST /api/admission/gd-pi/[id]/scores` (submit scores)
- `POST /api/admission/gd-pi/[id]/publish` (publish results)

**UI Components:**
- Session form (date, venue, program, capacity)
- Candidate picker (search leads by program/stage)
- Evaluator assignment panel
- Scoring rubric form (customizable criteria: communication, knowledge, leadership, etc.)
- Results table with rank calculation

**Business Rules:**
- Only leads in `qualified` or `application_submitted` stage can be added as candidates
- Evaluators must be staff profiles (role: faculty, admin, or external)
- Score submission locks after session is published
- Publishing auto-updates lead stage to `interview_completed`

**Verification:** Create session → Add 10 candidates → Assign 3 evaluators → Each submits scores → Publish → Leads updated

---

### 2.2 Screening Exam ⬜
**Purpose:** Online/offline entrance exam management

**Database tables:** `admission_screening_exams` (+ reuse `admission_gdpi_candidates` pattern for exam registrations)

**Pages:**
- `/admission/screening-exam` — Exam list
- `/admission/screening-exam/new` — Create exam
- `/admission/screening-exam/[id]` — Exam detail + registered candidates + results

**Service:** `lib/services/admission/screening-exam-service.ts`
```
Methods:
- getExams(filters) → exam list
- createExam(data) → new exam (name, date, duration, total_marks, passing_marks, program_ids)
- registerCandidates(examId, leadIds[]) → bulk registration
- uploadResults(examId, results[]) → bulk score upload (CSV/manual)
- publishResults(examId) → make results visible, update lead scores
```

**Hook:** `hooks/admission/use-screening-exam.ts`
**API Routes:** Standard CRUD + `/register`, `/results`, `/publish`

**UI Components:**
- Exam creation form (date, venue, marks, duration, programs)
- Candidate registration (multi-select from leads)
- Results upload (CSV import or manual entry table)
- Results dashboard (pass/fail distribution, score histogram)

**Business Rules:**
- Exam score feeds into lead scoring engine (quality_score component)
- Publishing updates leads to `qualified` or `lost` based on passing_marks threshold
- Results can be downloaded as PDF certificate

**Verification:** Create exam → Register 20 candidates → Upload CSV results → Publish → Leads scored

---

### 2.3 Merit List Generation ⬜
**Purpose:** Auto-generate ranked merit lists based on configurable criteria

**Database tables:** `admission_merit_lists`

**Pages:**
- `/admission/merit-list` — Generated merit lists
- `/admission/merit-list/generate` — Configuration + generation form

**Service:** `lib/services/admission/merit-list-service.ts`
```
Methods:
- getMeritLists(filters) → list of generated merit lists
- generateMeritList(config) → create ranked list based on:
  - Weights: 12th marks (40%), entrance exam (30%), GD-PI (20%), extracurricular (10%)
  - Configurable per institution via admission_workflow_configs.merit_criteria
- publishMeritList(id) → make visible to candidates
- sendOfferLetters(meritListId, cutoffRank) → trigger offer generation for top N
```

**Hook:** `hooks/admission/use-merit-list.ts`
**API Routes:** CRUD + `/generate`, `/publish`

**Business Rules:**
- Weightage configured in `admission_workflow_configs.merit_criteria`
- Merit list can be regenerated (overwrites previous)
- Publishing locks the list and triggers offer letter workflow
- Supports multiple quota types: government, management, NRI, merit, sports, lateral

**Verification:** Configure weights → Generate list from 50 qualified leads → Verify ranking → Publish → Top 20 get offers

---

### 2.4 Interview Management ⬜
**Purpose:** One-on-one interview scheduling, slot management, feedback collection

**Database tables:** `interview_slots`, `interview_bookings`

**Pages:**
- `/admission/interviews` — Interview schedule calendar view
- `/admission/interviews/slots` — Manage available slots
- `/admission/interviews/[id]` — Interview detail + feedback form

**Service:** `lib/services/admission/interview-service.ts`
```
Methods:
- getSlots(filters) → available interview slots
- createSlots(data) → bulk slot creation (date range, time slots, interviewer)
- bookInterview(slotId, leadId) → book candidate into slot
- submitFeedback(bookingId, feedback) → interviewer feedback + recommendation
- getInterviewCalendar(dateRange) → calendar view data
```

**Hook:** `hooks/admission/use-interviews.ts`
**API Routes:** Slots CRUD + booking + feedback

**UI Components:**
- Calendar view (week/day) showing booked slots
- Slot creation wizard (date range picker, time grid, interviewer selection)
- Booking interface (drag lead to slot or search & assign)
- Feedback form (rating scales, notes, recommendation: accept/reject/waitlist)

**Business Rules:**
- One lead per slot (no double-booking)
- Interviewer can only see their own slots
- Feedback submission updates lead stage to `interview_completed`
- Recommendation feeds into merit list or direct offer decision

**Verification:** Create 20 slots → Book 15 candidates → 3 interviewers submit feedback → Recommendations visible

---

## Phase 3: Enrollment Module (NEW)
> **Priority:** HIGH — Completes the lead-to-student journey
> **Estimated Effort:** 10-12 days
> **Status:** ⬜ Not Started
> **Depends on:** Phase 0, Phase 2 (for merit list → offer flow)

### 3.1 Offer Letter Management ⬜
**Purpose:** Generate, send, track, and manage admission offer letters

**Database tables:** `admission_offer_letters`

**Pages:**
- `/admission/offer-letters` — Offer list with status filters
- `/admission/offer-letters/[id]` — Offer detail + acceptance tracking

**Service:** `lib/services/admission/offer-letter-service.ts`
```
Methods:
- getOfferLetters(filters) → paginated list
- generateOffer(leadId, programId, scholarshipId?) → create offer with PDF
- sendOffer(offerId) → email/WhatsApp delivery
- trackAcceptance(offerId, status) → accepted/declined/expired
- rescindOffer(offerId, reason) → cancel offer
- extendDeadline(offerId, newDate) → extend acceptance window
- bulkGenerate(meritListId, cutoffRank) → generate for all qualifying candidates
```

**Hook:** `hooks/admission/use-offer-letters.ts`
**API Routes:** CRUD + `/send`, `/accept`, `/decline`, `/rescind`, `/extend`, `/bulk-generate`

**UI Components:**
- Offer letter template editor (WYSIWYG with variable placeholders)
- PDF preview modal
- Status timeline (generated → sent → viewed → accepted/declined/expired)
- Bulk generation wizard (select merit list → set cutoff → preview → generate)

**Business Rules:**
- Offer has `expires_at` (default: from SLA config `offer_validity_days`)
- Auto-mark as `expired` when deadline passes (cron job or trigger)
- Acceptance triggers stage change to `offer_accepted`
- Declining triggers re-engagement workflow opportunity
- Scholarship amount (if any) shown on offer letter

**Verification:** Generate offer for merit list top 10 → Send via email → Track 5 acceptances, 3 declines → Verify stage updates

---

### 3.2 Seat Confirmation & Payment ⬜
**Purpose:** Token fee/registration fee collection to confirm admission seat

**Database tables:** `admission_seat_confirmations`, `admission_payments`

**Pages:**
- `/admission/seat-confirmation` — Confirmation status dashboard
- `/admission/seat-confirmation/[id]` — Individual confirmation detail

**Service:** `lib/services/admission/seat-confirmation-service.ts`
```
Methods:
- getConfirmations(filters) → paginated list
- initiateConfirmation(leadId) → create confirmation record with payment deadline
- recordPayment(confirmationId, paymentData) → record fee payment
- confirmSeat(confirmationId) → finalize seat allocation
- cancelConfirmation(confirmationId, reason) → cancel with refund eligibility
- getSeatAvailability(programId) → remaining seats per program
- generateAdmissionReport(filters) → consolidated report
```

**Hook:** `hooks/admission/use-seat-confirmation.ts`
**API Routes:** CRUD + `/pay`, `/confirm`, `/cancel`, `/availability`, `/report`

**UI Components:**
- Seat availability dashboard (program-wise capacity vs filled)
- Payment recording form (amount, mode, reference, receipt upload)
- Confirmation timeline (offer accepted → payment pending → paid → confirmed)
- Seat matrix view (visual seat fill tracker per program)

**Business Rules:**
- Payment deadline from SLA config `token_payment_days`
- Auto-cancel if not paid within deadline
- Seat count decremented on confirmation (use `institution_seat_config` table)
- Cancelled seats return to pool
- Supports multiple quota types (government, management, etc.)
- Confirmation triggers learner profile creation bridge

**Verification:** 10 accepted offers → Initiate confirmations → Record 7 payments → Confirm 7 seats → Verify seat count decreased

---

### 3.3 Document Verification ⬜
**Purpose:** Upload, verify, and track required documents for enrollment

**Database tables:** `admission_application_documents`

**Pages:**
- `/admission/documents` — Document verification queue
- `/admission/documents/[leadId]` — Document checklist for specific lead

**Service:** `lib/services/admission/document-service.ts`
```
Methods:
- getDocumentQueue(filters) → leads with pending documents
- getLeadDocuments(leadId) → checklist with upload status
- uploadDocument(leadId, documentType, file) → upload to Supabase Storage
- verifyDocument(documentId, status, feedback?) → approve/reject/request-reupload
- getRequiredDocuments(programId) → required doc list from workflow config
- bulkVerify(documentIds[], status) → batch verification
```

**Hook:** `hooks/admission/use-documents.ts`
**API Routes:** CRUD + `/upload`, `/verify`, `/bulk-verify`

**UI Components:**
- Verification queue (sortable by lead, document type, uploaded date)
- Document viewer (inline PDF/image preview)
- Verification form (approve/reject/request reupload with feedback)
- Checklist view (per lead: required vs uploaded vs verified)
- Upload widget (drag-and-drop with file type validation)

**Business Rules:**
- Required documents configured per program in `admission_workflow_configs.required_documents`
- Document types from `types/admission.ts`: photo, id_proof, 10th_marksheet, 12th_marksheet, tc, migration, aadhar, community, income, medical, other
- All docs verified → stage auto-updates to `documents_verified`
- Rejection sends notification to lead with feedback

**Verification:** Upload 5 documents for a lead → Verify 4, reject 1 → Lead gets reupload notification → Reupload → All verified → Stage updates

---

### 3.4 Lateral Entry ⬜
**Purpose:** Manage direct admission to 2nd/3rd year based on diploma/degree

**Database tables:** `admission_lateral_entry_apps`, `admission_lateral_entry_rules`

**Pages:**
- `/admission/lateral-entry` — Lateral entry applications
- `/admission/lateral-entry/rules` — Eligibility configuration

**Service:** `lib/services/admission/lateral-entry-service.ts`
```
Methods:
- getApplications(filters) → lateral entry application list
- createApplication(leadId, data) → create lateral entry application
- checkEligibility(leadId, programId) → verify CGPA/percentage against rules
- getEligibilityRules(programId) → configured rules
- configureRules(programId, rules) → set eligibility criteria
- getVacancies(programId, year) → available lateral entry seats
```

**Hook:** `hooks/admission/use-lateral-entry.ts`
**API Routes:** CRUD + `/eligibility`, `/rules`, `/vacancies`

**Business Rules:**
- Eligibility: Minimum CGPA/percentage per program (configurable)
- Separate seat count from regular admission
- Supports: Diploma → Engineering Year 2, B.Sc → B.Tech Year 2, etc.
- Application goes through same document verification workflow

**Verification:** Configure rules → Create lateral app for diploma holder → Check eligibility → Process through document verification

---

### 3.5 Feedback Collection ⬜
**Purpose:** Collect post-enrollment satisfaction feedback

**Database tables:** `admission_feedback`

**Pages:**
- `/admission/feedback` — Feedback dashboard + analytics
- `/admission/feedback/form` — Public feedback form (or embed)

**Service:** `lib/services/admission/feedback-collection-service.ts`
```
Methods:
- getFeedback(filters) → feedback records with analytics
- submitFeedback(leadId, responses) → record feedback
- getFeedbackAnalytics(institutionId) → satisfaction scores, trends
- triggerFeedbackSurvey(leadIds[]) → send feedback request via WhatsApp/email
```

**Hook:** `hooks/admission/use-feedback-collection.ts`
**API Routes:** CRUD + `/analytics`, `/trigger`

**Verification:** Trigger survey for 20 enrolled students → 12 respond → View analytics dashboard

---

## Phase 4: Financial Module (NEW)
> **Priority:** MEDIUM — Important for complete enrollment flow
> **Estimated Effort:** 7-9 days
> **Status:** ⬜ Not Started
> **Depends on:** Phase 0, Phase 3 (for seat confirmation → scholarship/loan flow)

### 4.1 Scholarship Management ⬜
**Purpose:** Define scholarship schemes, process applications, track awards

**Database tables:** `admission_scholarships`, `admission_scholarship_apps`

**Pages:**
- `/admission/scholarships` — Scheme list + application tracking
- `/admission/scholarships/[id]` — Scheme detail + applicants

**Service:** `lib/services/admission/scholarship-service.ts`
```
Methods:
- getSchemes(filters) → scholarship scheme list
- createScheme(data) → new scheme (name, type, amount, eligibility criteria)
- getApplications(schemeId, filters) → applicant list
- applyForScholarship(leadId, schemeId) → submit application
- evaluateApplication(applicationId, decision) → approve/reject with amount
- getScholarshipAnalytics() → total awarded, by type, by program
```

**Scholarship types:** merit-based, income-based, category-based (SC/ST/OBC), sports, institutional

**Business Rules:**
- Eligibility auto-checked against lead's academic scores and profile data
- Approved scholarship amount reflected in offer letter
- Multiple scholarships can stack (with configurable max cap)
- Budget tracking per scheme per academic year

**Verification:** Create 3 schemes → 15 students apply → Evaluate → 8 awarded → Verify amounts in offer letters

---

### 4.2 Education Loan Integration ⬜
**Purpose:** Partner with NBFCs/banks for student education loan facilitation

**Database tables:** `admission_loan_partners`, `admission_loan_applications`

**Pages:**
- `/admission/loans` — Loan application dashboard
- `/admission/loans/partners` — Loan partner management

**Service:** `lib/services/admission/loan-service.ts`
```
Methods:
- getLoanPartners() → configured loan providers
- createLoanApplication(leadId, partnerId, amount) → initiate loan
- updateLoanStatus(applicationId, status) → track progress
- getLoanAnalytics() → disbursement rates, partner performance
```

**Loan statuses:** applied, documents_submitted, under_review, sanctioned, disbursed, rejected

**Business Rules:**
- Loan amount linked to program fees minus scholarships
- Partner API integration (future: webhook for status updates)
- Loan status visible in lead detail page

**Verification:** Add 2 loan partners → Create 5 loan applications → Track through status changes → View analytics

---

### 4.3 Hostel Allocation ⬜
**Purpose:** Room assignment, waitlist management, amenity selection

**Database tables:** `admission_hostels`, `admission_hostel_allocations`

**Pages:**
- `/admission/hostels` — Room inventory + allocation dashboard
- `/admission/hostels/allocate` — Allocation wizard

**Service:** `lib/services/admission/hostel-service.ts`
```
Methods:
- getRoomInventory(filters) → rooms by hostel, floor, type, availability
- allocateRoom(leadId, roomId) → assign room
- getWaitlist(hostelId) → waitlisted students
- addToWaitlist(leadId, preferences) → join waitlist
- deallocate(allocationId, reason) → free up room
- getAllocationReport() → occupancy rates, revenue
```

**Room types:** single, double, triple, dormitory
**Amenities:** AC, non-AC, attached bathroom, WiFi, meal plan

**Business Rules:**
- Allocation only for confirmed seats (post-payment)
- Waitlist auto-promotes when room freed
- Meal plan selection during allocation
- Room changes allowed within first 2 weeks

**Verification:** Setup 50 rooms → Allocate 40 → Waitlist 10 → Deallocate 2 → Waitlist auto-promoted

---

## Phase 5: Public-Facing & Settings
> **Priority:** MEDIUM — Enables self-service and completes settings
> **Estimated Effort:** 5-7 days
> **Status:** ⬜ Not Started

### 5.1 Public Application Form ⬜
**Purpose:** Public-facing multi-step application form (no auth required)

**Pages:**
- `/admission/apply` — Public form (no layout wrapper)

**Service:** Reuse `ApplicationService` + `LeadService`

**Form steps:**
1. Personal Information (name, DOB, gender, phone, email)
2. Education Details (10th/12th marks, college, degree)
3. Program Selection (campus, degree, department, program)
4. Document Upload (required documents per program)
5. Review & Submit

**Security:** Rate limiting, CAPTCHA (hCaptcha/reCAPTCHA), CSRF token, honeypot field

**Business Rules:**
- Auto-creates lead + application on submit
- Sends confirmation email/SMS
- Triggers `lead.created` workflow for assignment
- Deduplication check on phone/email before creating new lead

**Verification:** Submit form as new applicant → Lead created → Application created → Confirmation sent → Counselor notified

---

### 5.2 Student Status Portal ⬜
**Purpose:** Student-facing portal to check application status

**Pages:**
- `/admission/status` — Public status check (phone/email + OTP verification)

**Features:**
- Enter application number or phone → OTP verification → View status
- Shows: Application stage, pending actions, next steps
- Document upload capability (if documents_pending)
- Offer letter download (if offer_sent)

**Verification:** Check status with valid application number → See correct stage → Download offer letter

---

### 5.3 Scoring Rules Configuration ⬜
**Purpose:** Admin UI for configuring lead scoring weights

**Pages:**
- `/admission/settings/scoring-rules` — Scoring weight editor

**Service:** `lib/services/admission/scoring-rules-service.ts`

**Configurable factors:**
- Demographics: age, education_level, location proximity (weight: 0-100)
- Engagement: call_duration, response_time, message_opens (weight: 0-100)
- Qualification: exam_score, GPA, previous_education (weight: 0-100)
- Interest: page_visits, form_completions, repeat_contacts (weight: 0-100)

**UI:** Slider-based weight configuration with live preview of score recalculation

**Verification:** Adjust weights → Save → Trigger recalculation → Verify lead scores changed

---

## Phase 6: Existing Module Enhancements
> **Priority:** MEDIUM — Improve what already exists
> **Estimated Effort:** 7-10 days
> **Status:** ⬜ Not Started

### 6.1 B2A API Migration (54 Existing Routes) ⬜
**Problem:** Existing API routes use `getAuthUser` instead of `withAuth`

**Approach:**
- Migrate in batches by module
- Each batch: Update route → Update hook → Test both session and API key auth
- Atomic commits per module

**Migration order:**
1. Calls routes (4 routes)
2. Chat routes (13+ routes)
3. Chatbot routes (6 routes)
4. Campaign routes (6 routes)
5. WhatsApp routes (7 routes)
6. Settings routes (6 routes)
7. Voice routes (4 routes)
8. Remaining routes (8 routes)

**Verification:** Each migrated route tested with: session auth, API key auth, super_admin, regular admin

---

### 6.2 Lead Scoring Explainability ⬜
**Problem:** Score displayed but no breakdown shown to counselors

**Solution:**
- Add score breakdown tooltip/panel in lead detail page
- Parse `score_breakdown` JSONB field
- Show: "Score 75/100: Phone verified (+10), Engaged stage (+20), High interest (+15), ..."
- Add trend indicator (↑↓ from last calculation)

**Files to modify:**
- `app/(routes)/admission/leads/[id]/page.tsx`
- Create `leads/[id]/_components/score-breakdown-card.tsx`

**Verification:** View lead with score → See breakdown panel → Verify all factors listed

---

### 6.3 Bulk Operations Enhancement ⬜
**Problem:** Limited bulk actions; no progress feedback

**Solution:**
- Add multi-select checkbox column to all data tables
- Bulk action toolbar: Reassign Counselor, Change Stage, Send Message, Add Tag, Archive
- Progress indicator for batch operations (progress bar with count)
- Undo capability within 10 seconds

**Files to modify:**
- All `_components/*-data-table.tsx` files
- Create shared `components/admission/bulk-action-toolbar.tsx`

**Verification:** Select 20 leads → Bulk reassign → See progress → All 20 updated → Undo within 10s works

---

### 6.4 Enhanced Group Dashboard ⬜
**Problem:** Multi-institution view is basic

**Solution:**
- Add comparison charts: Institution vs Institution KPIs
- Seat fill rate tracker (real-time vs target)
- Cross-campus deduplication report
- NAAC compliance report generator
- Drill-down: Click institution → See detailed metrics

**Files to modify:**
- `app/(routes)/admission/group-dashboard/page.tsx`
- `app/(routes)/admission/group-dashboard/_components/`

**Verification:** Super admin sees all institutions → Compare conversion rates → Drill into specific institution

---

### 6.5 Workflow Execution Fixes ⬜
**Problem:** Workflows are stored but not auto-executed (from handoff gap analysis)

**Fixes needed:**
1. Auto-execute assignment rules on lead creation (add to `LeadService.createLead()`)
2. Duplicate phone detection before insert (normalize + check)
3. Stage transition validation (enforce `ALLOWED_STAGE_TRANSITIONS`)
4. Phone format validation (Indian 10-digit regex)
5. Counselor notification on assignment (insert to `notifications` table)
6. Inbound lead webhook (public API: `POST /api/admission/leads/webhook`)
7. Score expiration handling (daily cron or remove expiration concept)

**Verification:** Create lead → Auto-assigned to counselor → Counselor notified → Try invalid stage transition → Blocked

---

## Phase 7: AI & Advanced Features
> **Priority:** LOW — Nice-to-have, builds on completed phases
> **Estimated Effort:** 5-7 days
> **Status:** ⬜ Not Started

### 7.1 Chatbot Knowledge Base Enhancement ⬜
- Improve knowledge base management UI
- Add FAQ auto-generation from past conversations
- Intent matching improvements
- Analytics dashboard for chatbot performance

### 7.2 Voice Agent Integration ⬜
- Complete Twilio/Bland.ai integration
- IVR menu configuration UI
- Call transcription and sentiment analysis
- Voice broadcast campaign improvements

### 7.3 Remarketing Integration ⬜
- Google Ads audience upload integration
- Facebook Ads custom audience sync
- Dynamic ad targeting based on lead stage
- Retargeting performance analytics

### 7.4 Custom Report Builder ⬜
- Drag-and-drop report field selector
- Pre-built report templates
- Scheduled report delivery (email)
- Export: PDF, Excel, CSV

### 7.5 Predictive Analytics ⬜
- Enrollment prediction model (beyond lead scoring)
- Dropout risk assessment
- Optimal counselor-lead matching algorithm
- Seasonal trend forecasting

---

## Progress Tracker

| Phase | Module | Status | Started | Completed |
|-------|--------|--------|---------|-----------|
| **Phase 0** | Permission Standardization | ⬜ | - | - |
| | Database Schema (35 tables) | 🔄 | 2026-03-27 | - |
| | Dual Stage Cleanup | ⬜ | - | - |
| | B2A Pattern Setup | ✅ | 2026-03-27 | 2026-03-27 |
| **Phase 1** | Visual Funnel/Pipeline | ⬜ | - | - |
| | Counselor Work Queue | ⬜ | - | - |
| | Mobile CRM Optimization | ⬜ | - | - |
| **Phase 2** | GD-PI Management | ✅ | 2026-03-27 | 2026-03-27 |
| | Screening Exam | ⬜ | - | - |
| | Merit List | ⬜ | - | - |
| | Interview Management | ⬜ | - | - |
| **Phase 3** | Offer Letters | ⬜ | - | - |
| | Seat Confirmation | ⬜ | - | - |
| | Document Verification | ⬜ | - | - |
| | Lateral Entry | ⬜ | - | - |
| | Feedback Collection | ⬜ | - | - |
| **Phase 4** | Scholarships | ⬜ | - | - |
| | Education Loans | ⬜ | - | - |
| | Hostel Allocation | ⬜ | - | - |
| **Phase 5** | Public Apply Form | ⬜ | - | - |
| | Student Status Portal | ⬜ | - | - |
| | Scoring Rules Config | ⬜ | - | - |
| **Phase 6** | B2A API Migration | ⬜ | - | - |
| | Score Explainability | ⬜ | - | - |
| | Bulk Operations | ⬜ | - | - |
| | Group Dashboard | ⬜ | - | - |
| | Workflow Execution Fixes | ⬜ | - | - |
| **Phase 7** | Chatbot Enhancement | ⬜ | - | - |
| | Voice Agent | ⬜ | - | - |
| | Remarketing | ⬜ | - | - |
| | Custom Reports | ⬜ | - | - |
| | Predictive Analytics | ⬜ | - | - |

**Total modules:** 27
**Estimated total effort:** 45-60 days

---

## Technical Patterns Reference

### Standard Module Implementation Pattern

For each new module, follow this order:

```
1. Database   → Migration file in supabase/migrations/admission/
2. Types      → Add interfaces to types/admission.ts
3. Service    → lib/services/admission/{module}-service.ts
4. API Route  → app/api/admission/{module}/route.ts (withAuth)
5. Hook       → hooks/admission/use-{module}.ts (calls API via apiClient)
6. Page       → app/(routes)/admission/{module}/page.tsx
7. Components → app/(routes)/admission/{module}/_components/
8. Sidebar    → Add to lib/sidebarMenuLink.ts with permissions
9. Test       → Build check + API curl + browser test
```

### File Naming Convention
| Layer | Pattern | Example |
|-------|---------|---------|
| Page | `app/(routes)/admission/[module]/page.tsx` | `admission/gd-pi/page.tsx` |
| Component | `_components/[descriptive-name].tsx` | `_components/scoring-rubric-form.tsx` |
| Hook | `hooks/admission/use-[module].ts` | `hooks/admission/use-gdpi.ts` |
| Service | `lib/services/admission/[module]-service.ts` | `lib/services/admission/gdpi-service.ts` |
| API Route | `app/api/admission/[module]/route.ts` | `app/api/admission/gd-pi/route.ts` |

### Response Envelope Pattern
```typescript
// Success
{ data: T }
{ data: T[], metadata: { page, limit, total, totalPages } }

// Error
{ error: string }
```

### withAuth Pattern
```typescript
import { withAuth } from '@/lib/api/auth-middleware';

export const GET = withAuth(async (req, auth) => {
  const { user, supabase, institutionId } = auth;
  // institutionId is null for super_admin — handle accordingly
  const query = supabase.from('table').select('*');
  if (institutionId) query.eq('institution_id', institutionId);
  const { data, error } = await query;
  if (error) return errorResponse(error.message, 500);
  return successApiResponse(data);
});
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 35 new tables overwhelm staging DB | Low | High | Create in batches per phase |
| Permission refactor breaks existing pages | Medium | High | Test all 62 pages after Phase 0 |
| B2A migration breaks existing hooks | Medium | High | Atomic commits (route + hook together) |
| Funnel stage explosion (21 → 30+) | High | Medium | Consolidate into macro stages first |
| Mobile UX regression | Medium | Medium | Test responsive after each phase |
| Consultant commission calc errors | Low | High | Unit tests for commission engine |
| Real-time sync conflicts (multi-counselor) | Medium | Medium | Defer to Phase 7 (WebSocket) |

---

## Dependencies Map

```
Phase 0 (Foundation)
  ↓
Phase 1 (UX) ──────────────┐
  ↓                         │
Phase 2 (Selection) ←───────┤ (can parallelize)
  ↓                         │
Phase 3 (Enrollment) ←──────┘
  ↓
Phase 4 (Financial)
  ↓
Phase 5 (Public + Settings) ←── Phase 6 (Enhancements) [parallel]
  ↓
Phase 7 (AI/Advanced)
```

**Critical Path:** Phase 0 → Phase 2 → Phase 3 → Phase 4 (Selection → Enrollment → Financial)
**Parallel Track:** Phase 1 (UX) + Phase 6 (Enhancements) can run alongside Phase 2-4

---

*This plan will be updated as modules are completed. Each phase completion will be marked with date and commit reference.*
