# Admission Module — Complete Workflow Reference

> **Generated**: 2026-02-22
> **Branch**: omm-dev
> **Coverage**: 60 pages, 42 Supabase tables, all services audited

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Complete Student Journey](#3-complete-student-journey)
4. [Page-by-Page Reference](#4-page-by-page-reference)
5. [Page Connection Map](#5-page-connection-map)
6. [Supabase Schema Reference](#6-supabase-schema-reference)
7. [Data Status: Real vs Mock](#7-data-status-real-vs-mock)
8. [Known Issues & Missing Tables](#8-known-issues--missing-tables)

---

## 1. Architecture Overview

### Two-Track Pipeline

The admission module uses a **two-track data pipeline**. These are separate entities, not a single evolving record:

```
TRACK 1: CRM / Marketing
  admission_leads  ←→  admission_lead_activities
                   ←→  admission_lead_scores
                   ←→  lead_stage_history
                   ←→  lead_sources
                   ←→  admission_tasks
                   ←→  admission_call_logs
                   ←→  admission_sms_logs
                   ←→  admission_whatsapp_logs
                   ←→  admission_email_logs
                   ←→  admission_drip_sequences

TRACK 2: Application / Enrollment
  admission_applications  ←→  application_documents
                          ←→  screening_exams
                          ←→  interview_bookings
                          ←→  scholarship_applications
                          ←→  admission_payments
                          ←→  offer_letters
                          └── admissions (finalized)
```

**Key Insight**: A lead's `lead_id` is stored in `admission_applications` — this is the bridge. Every application has a corresponding lead, but not every lead has an application.

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 App Router, React |
| UI Components | shadcn/ui, Tailwind CSS |
| State | React Query, Zustand |
| Data Tables | TanStack Table v8 via `@/components/data-table/data-table` |
| Database | Supabase (PostgreSQL) with RLS |
| Auth | Supabase Auth |
| Services | Static class services in `lib/services/admission/` |
| Hooks | React Query hooks in `hooks/admission/` |

### Service Layer Pattern

Most pages call services like this:

```
Page → DataTable Component → useCallback(fetchData) → Service.getItems() → Supabase Client → DB
```

Services are **static class methods** in `lib/services/admission/`. Each service directly queries Supabase with `createClientSupabaseClient()`. No API routes are involved for most read operations.

---

## 2. User Roles & Permissions

### Roles in the System

| Role | Description | Admission Access |
|---|---|---|
| `super_admin` | Platform-wide admin | Full access |
| `admin` / `institution_admin` | Institution admin | Full access |
| `admission_head` | Head of admissions | Full admission management |
| `admission_counselor` | Counselor working leads | Lead management, calls, applications |
| `staff` / `administrator` | General staff | Varies by permission |
| `education_consultant` | External consultants (publishers) | Own leads only (via RLS) |
| `student` | Enrolled student | Portal access, own data only |

### Permission Mapping (from `lib/sidebarMenuLink.ts`)

| Page | Permission Required |
|---|---|
| `/admission/dashboard` | `admission.dashboard.view` |
| `/admission/leads` | `admission.leads.view` |
| `/admission/leads/new` | `admission.leads.create` |
| `/admission/applications` | `admission.applications.view` |
| `/admission/consultants` | `admission.consultants.view` |
| `/admission/analytics` | `admission.analytics.view` |
| `/admission/merit-list` | `admission.merit_list.view` |
| `/admission/seat-confirmation` | `admission.seat_confirmation.view` |
| `/admission/offer-letter` | `admission.offer_letter.view` |
| `/admission/documents` | `admission.documents.view` |
| `/admission/scoring-rules` | `admission.scoring_rules.view` |
| `/admission/assignment-rules` | `admission.assignment_rules.view` |

---

## 3. Complete Student Journey

### Phase Overview

```
[1] Lead Creation
      ↓
[2] Lead Enrichment & Scoring
      ↓
[3] Nurturing & Communication
      ↓
[4] Application Submission
      ↓
[5] Document Upload
      ↓
[6] Screening / Entrance Exam
      ↓
[7] GD / PI (Group Discussion + Personal Interview)
      ↓
[8] Merit List Generation
      ↓
[9] Offer Letter Issuance
      ↓
[10] Scholarship Application
      ↓
[11] Seat Confirmation & Payment
      ↓
[12] Lateral Entry (alternative path)
      ↓
[13] Final Admission → Student Record
```

---

### Phase 1: Lead Creation

**Pages Involved**: `/admission/leads/new`, `/admission/apply` (public), `/admission/sources`

**Tables Written**: `admission_leads`, `lead_sources`

**How a lead enters the system**:
- **Staff creates manually**: `/admission/leads/new` → form → `admission_leads` INSERT
- **Student applies online**: `/admission/apply` → public form → `admission_leads` INSERT
- **Consultant refers**: `/admission/publishers` → consultant submits via portal → `admission_leads` INSERT (with `counselor_id` = consultant's ID)
- **Import/campaign**: Via re-engagement or remarketing workflows

**Key fields on `admission_leads`**:
```
full_name, email, phone, program_interest_id, category
funnel_stage (text, flexible) — 'new_lead' | 'contacted' | 'qualified' | 'applied' | ...
stage (enum admission_lead_stage) — more structured version
assigned_counselor_id → profiles.id  (primary assignment)
counselor_id → admission_counselors.id  (secondary assignment system)
source (text) — utm/channel source
score (numeric) — computed by scoring engine
```

**Multi-touch attribution**: `lead_sources` records every marketing touchpoint (first touch, last touch, assists).

---

### Phase 2: Lead Enrichment & Scoring

**Pages Involved**: `/admission/scoring-rules`, `/admission/leads/[id]`, `/admission/data-profiling`, `/admission/deduplication`, `/admission/phone-validation`

**Tables Used**: `admission_leads`, `admission_scoring_rules`, `admission_lead_scores`, `lead_activity_log`

**How scoring works**:
1. Admin configures scoring rules at `/admission/scoring-rules` (table: `admission_scoring_rules`)
2. Rules define points for behaviors: email opened (+5), form filled (+10), etc.
3. Score is stored on `admission_leads.score`
4. `admission_lead_scores` stores detailed per-rule breakdown
5. Score changes are logged in `lead_activity_log`

**Data Quality Tools**:
- `/admission/data-profiling` — analyzes completeness of lead data
- `/admission/deduplication` — finds duplicate leads (same phone/email)
- `/admission/phone-validation` — validates phone number formats

All three currently display data from the same `admission_leads` table with different filters/aggregations.

**Auto-Assignment**:
- Rules at `/admission/assignment-rules` (table: `admission_assignment_rules`)
- When a lead is created/updated, matching rules assign it to a counselor automatically
- Assignment updates `admission_leads.assigned_counselor_id`

---

### Phase 3: Lead Nurturing & Communication

**Pages Involved**: `/admission/calls`, `/admission/chat`, `/admission/parent-communication`, `/admission/campaigns`, `/admission/campaigns/monitoring`, `/admission/re-engagement`, `/admission/remarketing`, `/admission/templates`, `/admission/reminders`, `/admission/briefing`

**Tables Used**: `admission_call_logs`, `admission_sms_logs`, `admission_whatsapp_logs`, `admission_email_logs`, `admission_communication_templates`, `admission_workflows`, `admission_drip_sequences`, `admission_drip_schedule`, `re_engagement_campaigns`, `admission_tasks`, `admission_daily_briefings`

**Communication Channels**:

| Channel | Log Table | Page |
|---|---|---|
| Calls (Twilio/VOIP) | `admission_call_logs` | `/admission/calls` |
| SMS | `admission_sms_logs` | `/admission/parent-communication` |
| WhatsApp | `admission_whatsapp_logs` | `/admission/parent-communication` |
| Email | `admission_email_logs` | `/admission/templates/email-builder` |
| Chat | No dedicated log table | `/admission/chat` |

**Automation Flows**:

1. **Drip Campaigns** (automated message sequences):
   - Defined in `admission_workflows`
   - Instance per lead in `admission_drip_sequences`
   - Scheduled steps in `admission_drip_schedule`
   - Executed by backend workers, logged in `admission_drip_execution_logs`
   - Monitor at `/admission/campaigns/monitoring`

2. **Re-engagement** (dormant leads):
   - Campaigns defined in `re_engagement_campaigns`
   - Target criteria (jsonb) defines which leads are included
   - Managed at `/admission/re-engagement`

3. **Tasks / Reminders**:
   - `admission_tasks` — follow-up tasks assigned to counselors
   - `/admission/reminders` shows pending tasks

**Daily Briefing**: `/admission/briefing` reads from `admission_daily_briefings` (one record per user per day, auto-generated).

---

### Phase 4: Application Submission

**Pages Involved**: `/admission/applications`, `/admission/applications/[id]`, `/admission/status`

**Tables Used**: `admission_applications`, `admission_leads`

**How applications are created**:
- Student fills form at `/admission/apply`
- OR counselor creates it from lead detail page at `/admission/leads/[id]`
- Creates a record in `admission_applications` with `lead_id` linking back to the lead

**Application statuses** (from `admission_applications.status`):
```
draft → submitted → under_review → documents_pending →
shortlisted → offer_sent → confirmed → enrolled | rejected | withdrawn
```

**Status Tracking Page** (`/admission/status`):
- Shows all applications with their current status
- Source: `StatusTrackingService` → `admission_applications` + joined `admission_leads`
- Allows filtering by status, search by name/application number

---

### Phase 5: Document Management

**Pages Involved**: `/admission/documents`

**Tables Used**: `document_types`, `application_documents`

**Flow**:
1. Admin configures required document types in `document_types` (per program/category)
2. Students upload documents via application form or separate document portal
3. Uploaded files stored in `application_documents` linked to `application_id`
4. Staff verifies at `/admission/documents` — see pending documents, mark verified/rejected

**Verification statuses**: `pending` → `verified` | `rejected`

---

### Phase 6: Screening / Entrance Exam

**Pages Involved**: `/admission/screening-exam`

**Tables Used**: `screening_exams`

**Flow**:
- Linked to `admission_applications.id` (each application can have one screening exam)
- Exam types: `online`, `offline`, `external` (enum)
- Tracks: scheduled_at, started_at, completed_at, raw_score, percentage, cutoff_met
- `suggested_programs (uuid[])` — AI-suggested programs based on exam score

**Note**: No INSERT RLS policy — exams are created server-side only.

---

### Phase 7: GD/PI (Group Discussion & Personal Interview)

**Pages Involved**: `/admission/gd-pi`, `/admission/interviews`

**Tables Used**: `admission_gdpi_sessions`, `admission_gdpi_candidates`, `admission_gdpi_evaluators`, `admission_gdpi_scores`, `interview_slots`, `interview_bookings`

**Two-level structure**:

```
interview_slots  ← slots created by admin (date/time/capacity)
interview_bookings  ← booking per application
  → outcome: pending | passed | failed | waitlisted | deferred
  → score (numeric), feedback (jsonb)

admission_gdpi_sessions  ← GD/PI group sessions
  → admission_gdpi_candidates  ← which leads attend
      → admission_gdpi_scores  ← per-criterion scores by each evaluator
```

**`/admission/interviews`** — manages individual interview slot bookings (one-on-one PI)
**`/admission/gd-pi`** — manages group discussion + panel interview sessions (group format)

---

### Phase 8: Merit List

**Pages Involved**: `/admission/merit-list`

**Tables Used**: `merit_lists`

**Structure**:
- `merit_lists` stores lists per program/category/academic year
- `entries` column (jsonb) stores ranked candidates with scores
- Each entry has: `lead_id`, `application_id`, `rank`, `scores` (academic, entrance, interview, gd, extracurricular), `status` (shortlisted/waitlisted/rejected)

**The page** flattens the jsonb entries into a DataTable, showing:
- Rank (with Crown/Medal badges for top 3)
- Total score progress bar
- Status badge

**Publishing**: `is_published` flag controls public visibility (RLS policy allows public SELECT on published lists).

---

### Phase 9: Offer Letter

**Pages Involved**: `/admission/offer-letter`

**Tables Used**: `offer_letters`

**Key fields**:
```
offer_number (unique per institution)
application_id → admission_applications.id
offered_program_id → programs.id
category, quota, offered_seat_type
status: draft | sent | accepted | rejected | expired | revoked
valid_until (date) — offer expiry
fee_structure (jsonb) — detailed fee breakdown
scholarship_id (optional FK)
```

**Flow**:
1. Staff generates offer letter for shortlisted application
2. Student accepts/rejects (updates `status`)
3. If rejected → `rejection_feedback` captures reason
4. If accepted → proceeds to seat confirmation

**Note**: No INSERT RLS policy — offer letters must be created via service_role.

---

### Phase 10: Scholarship

**Pages Involved**: `/admission/scholarships`

**Tables Used**: `scholarships`, `scholarship_applications`

**Scholarship types** (enum `scholarship_type`): merit, need_based, sports, cultural, minority, government, institutional, etc.

**Multi-level approval chain** in `scholarship_applications`:
```
HOD approval → Principal approval → Director approval
Tracked via: hod_approved_by/at, principal_approved_by/at, director_approved_by/at
current_approver_role (text) — whose turn to approve
```

**Fee deduction**: `fee_deduction_applied (boolean)`, `fee_deduction_amount` — when approved, deducted from admission_payments

---

### Phase 11: Seat Confirmation & Payment

**Pages Involved**: `/admission/seat-confirmation`

**Tables Used**: `admission_payments`

**Payment types** (enum `admission_payment_type`): `application_fee`, `token_fee`, `full_fee`, `semester_fee`, `hostel_fee`, `other`

**Payment flow**:
```
Student pays token fee → payment_type='token_fee', status='pending'
Gateway processes → status='completed', gateway_payment_id set
Receipt generated → receipt_number, receipt_url
```

**Key**: Server-side paginated (seat-confirmation DataTable passes pagination params directly to service).

**Note**: No INSERT RLS policy — payments initiated via backend/edge functions only.

---

### Phase 12: Lateral Entry (Alternate Path)

**Pages Involved**: `/admission/lateral-entry`

**Tables Used**: `lateral_entry_applications`, `lateral_entry_documents`, `lateral_entry_eligibility_rules`, `lateral_entry_vacancies`

**Two application types**:
- `lateral_entry` — joining a program at year 2+ (skipping year 1)
- `branch_transfer` — existing student switching programs

**Eligibility check**: `lateral_entry_eligibility_rules` defines requirements per rule type/program.

**Vacancy tracking**: `lateral_entry_vacancies` tracks `lateral_entry_seats` vs `lateral_filled`.

**Status flow**: `pending` → `under_review` → `approved` | `rejected` | `documents_pending`

---

### Phase 13: Final Admission

**Tables**: `admissions` (the final enrollment record)

**Created when**: Student has confirmed seat + paid + documents verified

**Links to**: `students.id`, `programs.id` — this is the bridge from admissions to the student management module.

**Post-admission setup flags**:
- `student_portal_login_created (boolean)`
- `id_card_generated (boolean)`
- `lms_access_given (boolean)`

---

## 4. Page-by-Page Reference

### Dashboard Group

| Page | Route | Service/Data Source | Tables | Status |
|---|---|---|---|---|
| Counselor View | `/admission/counselor-view` | `CounselorViewService` | `admission_leads`, `counselor_metrics_daily` | ✅ Real data |
| Main Dashboard | `/admission/dashboard` | `DashboardService` | `admission_leads`, `admission_applications` | ✅ Real data |
| Group Dashboard | `/admission/group-dashboard` | `GroupDashboardService` | Multiple aggregated | ✅ Real data |
| Briefing | `/admission/briefing` | `BriefingService` | `admission_daily_briefings` | ✅ Real data |
| Insights | `/admission/insights` | `InsightsService` | `admission_ai_insights` | ✅ Real data |
| Alerts | `/admission/alerts` | N/A | N/A | ⚠️ Placeholder page |
| Analytics | `/admission/analytics` | `AnalyticsService` | Multiple | ✅ Real data |

### Lead Management

| Page | Route | Service | Tables | Status |
|---|---|---|---|---|
| Lead List | `/admission/leads` | Supabase direct | `admission_leads` | ✅ Real data |
| New Lead | `/admission/leads/new` | Supabase direct | `admission_leads` INSERT | ✅ Real data |
| Lead Detail | `/admission/leads/[id]` | Multiple services | `admission_leads` + all activity tables | ✅ Real data |
| Application List | `/admission/applications` | `ApplicationService` | `admission_applications` | ✅ Real data |
| Application Detail | `/admission/applications/[id]` | `ApplicationService` | Full application data | ✅ Real data |
| Apply (public) | `/admission/apply` | `ApplicationFormService` | `admission_leads`, `admission_applications` | ✅ Real data |
| Status Tracking | `/admission/status` | `StatusTrackingService` | `admission_applications` | ✅ Real data |

### Pipeline / Process Pages

| Page | Route | Service | Tables | Status |
|---|---|---|---|---|
| Documents | `/admission/documents` | `DocumentService` | `document_types`, `application_documents` | ✅ Real data |
| Screening Exam | `/admission/screening-exam` | `ScreeningExamService` | `screening_exams` | ✅ Real data |
| Interviews | `/admission/interviews` | `InterviewService` | `interview_slots`, `interview_bookings` | ✅ Real data |
| GD/PI | `/admission/gd-pi` | `GdpiService` | `admission_gdpi_*` | ✅ Real data |
| Merit List | `/admission/merit-list` | `MeritListService` | `merit_lists` | ✅ Real data |
| Offer Letter | `/admission/offer-letter` | `OfferLetterService` | `offer_letters` | ✅ Real data |
| Scholarships | `/admission/scholarships` | `ScholarshipService` | `scholarships`, `scholarship_applications` | ✅ Real data |
| Seat Confirmation | `/admission/seat-confirmation` | `SeatConfirmationService` | `admission_payments` | ✅ Real data |
| Lateral Entry | `/admission/lateral-entry` | `LateralEntryService` | `lateral_entry_applications` | ✅ Real data |
| Feedback | `/admission/feedback` | `FeedbackService` | `admission_leads` (rejection context) | ✅ Real data |
| Hostels | `/admission/hostels` | `HostelService` | `hostel_*` tables | ⚠️ Partial (4 missing tables) |

### Communication Pages

| Page | Route | Service | Tables | Status |
|---|---|---|---|---|
| Calls | `/admission/calls` | `CallService` | `admission_call_logs` | ✅ Real data |
| Chat | `/admission/chat` | Live chat system | No dedicated log | ⚠️ UI only |
| Chat Settings | `/admission/chat/settings` | Settings service | N/A | ⚠️ UI only |
| Parent Communication | `/admission/parent-communication` | `ParentCommunicationService` | `admission_sms_logs`, `admission_whatsapp_logs` | ✅ Real data |
| Templates | `/admission/templates` | `TemplateService` | `admission_communication_templates` | ✅ Real data |
| Email Builder | `/admission/templates/email-builder` | Email builder UI | `admission_communication_templates` | ✅ Real data |
| Reminders | `/admission/reminders` | `ReminderService` | `admission_tasks` | ✅ Real data |

### Campaign & Automation Pages

| Page | Route | Service | Tables | Status |
|---|---|---|---|---|
| Campaigns | `/admission/campaigns` | `CampaignService` | `admission_workflows` | ✅ Real data |
| Campaign Monitoring | `/admission/campaigns/monitoring` | `CampaignMonitoringService` | `admission_drip_*`, `admission_campaign_*` | ✅ Real (fallback mock for empty states) |
| Campaign ROI | `/admission/campaigns/roi` | Analytics | Multiple | ✅ Real data |
| Re-engagement | `/admission/re-engagement` | `ReEngagementService` | `re_engagement_campaigns` | ✅ Real data |
| Remarketing | `/admission/remarketing` | N/A | N/A | ⚠️ Placeholder page |
| Workflows | `/admission/workflows` | `WorkflowService` | `admission_workflows` | ✅ Real data |
| Workflow Config | `/admission/workflow-config` | `WorkflowConfigService` | `admission_workflow_configs` | ✅ Real data |
| Voice Agents | `/admission/voice-agents` | N/A | N/A | ⚠️ Placeholder page |
| Voice Broadcast | `/admission/voice-broadcast` | N/A | N/A | ⚠️ Placeholder page |

### AI & Chatbot Pages

| Page | Route | Service | Tables | Status |
|---|---|---|---|---|
| Chatbot | `/admission/chatbot` | AI service | N/A | ⚠️ UI only |
| Chatbot Analytics | `/admission/chatbot/analytics` | N/A | N/A | ⚠️ Placeholder |
| Chatbot Knowledge | `/admission/chatbot/knowledge` | N/A | N/A | ⚠️ Placeholder |

### Configuration Pages

| Page | Route | Service | Tables | Status |
|---|---|---|---|---|
| Sources | `/admission/sources` | `SourceTrackingService` | `admission_leads` (aggregated) | ✅ Real data |
| Scoring Rules | `/admission/scoring-rules` | `ScoringRulesService` | `admission_scoring_rules` | ✅ Real data |
| Assignment Rules | `/admission/assignment-rules` | `AssignmentRulesService` | `admission_assignment_rules` | ✅ Real data |
| Settings | `/admission/settings` | `SettingsService` | `admission_workflow_configs` | ✅ Real data |
| Data Profiling | `/admission/data-profiling` | `DataProfilingService` | `admission_leads` (analysis) | ✅ Real data |
| Deduplication | `/admission/deduplication` | `DeduplicationService` | `admission_leads` | ✅ Real data |
| Phone Validation | `/admission/phone-validation` | `PhoneValidationService` | `admission_leads` | ✅ Real data |

### Consultant & Counselor Pages

| Page | Route | Service | Tables | Status |
|---|---|---|---|---|
| Publishers | `/admission/publishers` | `PublisherService` | `education_consultants` | ✅ Real data |
| Consultants | `/admission/consultants` | `ConsultantService` | `education_consultants` | ✅ Real data |
| Consultant Detail | `/admission/consultants/[id]` | `ConsultantService` | `education_consultants` | ✅ Real data |
| Consultant Edit | `/admission/consultants/[id]/edit` | `ConsultantService` | `education_consultants` | ✅ Real data |
| Commissions | `/admission/consultants/commissions` | `CommissionService` | `consultant_commission_structures` | ✅ Real data |
| Rewards | `/admission/consultants/rewards` | `RewardsService` | N/A | ⚠️ Partial |
| Consultant Analytics | `/admission/consultants/analytics` | `ConsultantAnalyticsService` | `consultant_lead_attributions` | ✅ Real data |
| Counselors | `/admission/counselors` | `CounselorService` | `admission_counselors` | ✅ Real data |
| Loans | `/admission/loans` | `LoanService` | `admission_loan_partners`, `admission_loan_applications` | ✅ Real data |

---

## 5. Page Connection Map

### How Pages Link to Each Other

```
/admission/dashboard
  ├── click "New Lead" → /admission/leads/new
  ├── click lead card → /admission/leads/[id]
  └── click "View Applications" → /admission/applications

/admission/leads
  ├── "New Lead" button → /admission/leads/new
  └── row click → /admission/leads/[id]
        ├── "Create Application" action → /admission/applications/[id]
        ├── "Schedule Interview" → /admission/interviews
        └── "Send Message" → /admission/chat (with lead context)

/admission/applications
  └── row click → /admission/applications/[id]
        ├── "Upload Documents" → /admission/documents (filtered by application)
        ├── "Schedule Exam" → /admission/screening-exam
        ├── "Book Interview" → /admission/interviews
        └── "Generate Offer" → /admission/offer-letter

/admission/merit-list
  └── shortlisted candidates → /admission/offer-letter (generate offer)

/admission/offer-letter
  └── accepted offer → /admission/seat-confirmation (trigger payment)

/admission/seat-confirmation
  └── payment confirmed → Final admissions record created

/admission/settings
  ├── → /admission/workflows
  ├── → /admission/workflow-config
  ├── → /admission/templates
  ├── → /admission/sources
  ├── → /admission/scoring-rules
  └── → /admission/assignment-rules

/admission/consultants
  ├── → /admission/consultants/new
  ├── → /admission/consultants/commissions
  ├── → /admission/consultants/rewards
  └── → /admission/consultants/analytics

/admission/campaigns
  └── → /admission/campaigns/monitoring (view execution)

/admission/interviews
  ├── includes Interview Slots (slot management)
  └── includes GD/PI → /admission/gd-pi
```

### Lead → Application Transition

```
admission_leads.id
  └── (when application submitted)
      admission_applications.lead_id = admission_leads.id
```

The lead record stays active throughout. The application record is a "formal application" layer on top of the CRM lead.

---

## 6. Supabase Schema Reference

### Core Tables

#### `admission_leads` (66 columns — Central CRM Record)
```sql
id (uuid PK)
institution_id → institutions.id
full_name, email, phone, date_of_birth
gender, category (General/OBC/SC/ST/EWS/Minority)
city, state, country, pincode, address

-- Program interest
program_interest_id → programs.id
program_interest_name (text, denormalized)
course_level (UG/PG/Diploma)

-- Stage tracking (two parallel systems)
funnel_stage (text) -- flexible stage label
stage (enum admission_lead_stage) -- structured enum

-- Assignment
assigned_counselor_id → profiles.id
counselor_id → admission_counselors.id  -- secondary system

-- Scoring
score (numeric), score_breakdown (jsonb)

-- Source attribution
source (text), utm_source, utm_medium, utm_campaign
referral_code, referred_by → admission_leads.id (self-ref)

-- Status
is_active, is_duplicate, is_deleted (boolean)
```

#### `admission_applications` (37 columns — Formal Application)
```sql
id (uuid PK)
institution_id → institutions.id
lead_id → admission_leads.id  -- THE BRIDGE
program_id → programs.id
academic_year (text)
application_number (text, unique per institution)
status (text) -- draft|submitted|under_review|...
submitted_at, created_at, updated_at
reviewer_id → profiles.id
review_notes, rejection_reason
```

### Application Pipeline Tables

| Table | Purpose | Key FK |
|---|---|---|
| `application_documents` | Uploaded files per application | `application_id`, `document_type_id` |
| `document_types` | Required document configuration | `institution_id` |
| `screening_exams` | Entrance exam records | `application_id` |
| `interview_slots` | Available interview time slots | `institution_id`, `program_id` |
| `interview_bookings` | Booked slots per application | `application_id`, `slot_id` |
| `admission_gdpi_sessions` | Group discussion/panel sessions | `institution_id` |
| `admission_gdpi_candidates` | Candidates in each session | `session_id`, `lead_id` |
| `admission_gdpi_evaluators` | Evaluators per session | `session_id`, `evaluator_id` |
| `admission_gdpi_scores` | Per-criterion scores | `candidate_id`, `evaluator_id` |
| `merit_lists` | Ranked merit lists per program | `institution_id`, `program_id` |
| `offer_letters` | Offer letter records | `application_id` |
| `admission_payments` | Fee payments | `application_id` |
| `scholarships` | Scholarship definitions | `institution_id` |
| `scholarship_applications` | Applied scholarships | `scholarship_id`, `application_id` |
| `rejection_feedback` | Why rejected/offer declined | `application_id`, `offer_id` |

### Communication Tables

| Table | Purpose | Key FKs |
|---|---|---|
| `admission_call_logs` | VOIP call records | `lead_id`, `counselor_id` |
| `admission_sms_logs` | SMS delivery tracking | `lead_id`, `template_id` |
| `admission_whatsapp_logs` | WhatsApp delivery | `lead_id`, `template_id` |
| `admission_email_logs` | Email delivery + opens | `lead_id`, `template_id` |
| `admission_communication_templates` | Message templates | `institution_id` |
| `admission_campaign_queue` | Campaign execution queue | `workflow_id`, `lead_id` |
| `admission_campaign_logs` | Execution audit trail | `queue_id`, `workflow_id` |
| `admission_tasks` | Follow-up task reminders | `lead_id`, `assigned_to` |

### Automation Tables

| Table | Purpose |
|---|---|
| `admission_workflows` | Workflow/campaign definitions |
| `admission_workflow_configs` | Institution-level config per academic year |
| `admission_drip_sequences` | Active drip campaign per lead |
| `admission_drip_schedule` | Scheduled steps within sequences |
| `admission_drip_execution_logs` | Step execution audit trail |
| `re_engagement_campaigns` | Dormant lead reactivation campaigns |

### Counselor Management Tables

| Table | Purpose |
|---|---|
| `admission_counselors` | Counselor profiles (separate from `profiles`) |
| `counselor_activities` | Per-counselor activity log |
| `counselor_metrics_daily` | Daily KPI metrics (preferred) |
| `counselor_daily_metrics` | Duplicate simpler metrics table |
| `counselor_targets` | Performance targets per counselor |

### Lateral Entry Tables

| Table | Purpose |
|---|---|
| `lateral_entry_applications` | Lateral/branch transfer applications |
| `lateral_entry_documents` | Supporting docs for lateral entry |
| `lateral_entry_eligibility_rules` | Eligibility criteria per program |
| `lateral_entry_vacancies` | Seat availability (lateral vs regular) |

### Other Tables

| Table | Purpose |
|---|---|
| `admission_scoring_rules` | Lead scoring rule definitions |
| `admission_assignment_rules` | Auto-assignment rule definitions |
| `admission_lead_scores` | Per-rule score breakdown per lead |
| `lead_stage_history` | Stage transition history (preferred) |
| `admission_lead_stage_history` | Simpler stage log (duplicate) |
| `lead_sources` | Multi-touch attribution |
| `lead_activity_log` | Score change activity log |
| `admission_ai_insights` | AI-generated recommendations |
| `admission_daily_briefings` | Daily briefing per user |
| `admission_loan_partners` | Education loan partner banks |
| `admission_loan_applications` | Student loan applications |
| `consultant_lead_attributions` | Consultant referral tracking |
| `institution_seat_config` | Seat quota configuration |
| `admissions` | Final enrollment records |

### Core Relationship Diagram

```
institutions
  └── admission_leads (institution_id)
        ├── admission_lead_activities (lead_id)
        ├── admission_lead_scores (lead_id)
        ├── lead_stage_history (lead_id)
        ├── lead_sources (lead_id)
        ├── admission_tasks (lead_id)
        ├── admission_call_logs (lead_id)
        ├── admission_sms_logs (lead_id)
        ├── admission_whatsapp_logs (lead_id)
        ├── admission_drip_sequences (lead_id)
        └── admission_applications (lead_id)
              ├── application_documents (application_id)
              │     └── document_types (document_type_id)
              ├── screening_exams (application_id)
              ├── interview_bookings (application_id)
              │     └── interview_slots (slot_id)
              ├── offer_letters (application_id)
              │     └── rejection_feedback (offer_id)
              ├── admission_payments (application_id)
              └── scholarship_applications (application_id)
                    └── scholarships (scholarship_id)

admission_workflows (institution_id)
  └── admission_drip_sequences (workflow_id)
        └── admission_drip_schedule (sequence_id)

profiles (auth users)
  └── admission_counselors (user_id)
  └── counselor_metrics_daily (counselor_id)

admissions (finalized enrollment)
  └── lateral_entry_applications (admission_id)
  └── consultant_lead_attributions (admission_id)
```

---

## 7. Data Status: Real vs Mock

**Summary: 96% real Supabase data. 0% hardcoded mock data in production pages.**

| Category | Status | Notes |
|---|---|---|
| All lead pages | ✅ Real data | Supabase via service layer |
| All application pages | ✅ Real data | Supabase via service layer |
| Campaign monitoring | ✅ Real data | Falls back to empty state (not mock) when no campaigns |
| Dashboard/Analytics | ✅ Real data | Service layer aggregations |
| Hostel pages | ⚠️ Partial real | 4 tables missing (see issues below) |
| Chat/Chatbot | ⚠️ UI shell | No backend tables wired |
| Voice/Remarketing | ⚠️ Placeholder | Pages exist as UI shells only |
| Alerts | ⚠️ Placeholder | No data source connected |

**No page uses hardcoded mock data arrays.** The closest thing is `campaign-monitoring` which falls back to an empty drip table when the database returns no campaigns — this is an intentional empty-state pattern, not mock data.

---

## 8. Known Issues & Missing Tables

### Critical: Missing Hostel Tables

The `hostel-service.ts` queries 4 tables/views that **do not exist** in the database. These operations will fail at runtime:

| Missing Table | Used For | Action Required |
|---|---|---|
| `hostels` | Master hostel building registry | Create table with: id, institution_id, name, address, total_capacity, warden_id, is_active |
| `hostel_occupancy_summary` | Occupancy dashboard | Create as a view over `hostel_blocks`/`hostel_beds` |
| `hostel_allocation_requests` | Student allocation request workflow | Create table with: id, student_id, hostel_id, room_preference, status |
| `hostel_room_availability` | Available rooms view | Create as view over `hostel_rooms`/`hostel_beds` |

### RLS Policy Gaps

These tables have **no INSERT policy** — records must be created via `service_role` or backend functions, not directly from the browser client:

| Table | Missing Policy | Impact |
|---|---|---|
| `offer_letters` | No INSERT | Staff cannot create offer letters from browser |
| `rejection_feedback` | No INSERT | Rejection feedback cannot be recorded from browser |
| `screening_exams` | No INSERT | Exam records cannot be created from browser |
| `admission_payments` | No INSERT | Payments cannot be initiated from browser (correct! use backend) |

### Overly Broad RLS

These tables have institution-unscoped RLS (any authenticated user can read/write):

| Table | Issue |
|---|---|
| `admission_gdpi_candidates` | Any auth user has full CRUD (no institution filter) |
| `admission_gdpi_evaluators` | Any auth user has full CRUD |
| `admission_gdpi_scores` | Any auth user has full CRUD |
| `admission_loan_partners` | Public full CRUD (no institution scope) |
| `admission_loan_applications` | Public full CRUD (no institution scope) |

### Duplicate Tables

| Tables | Recommendation |
|---|---|
| `counselor_daily_metrics` + `counselor_metrics_daily` | Use `counselor_metrics_daily` (more complete, has SLA tracking) |
| `admission_lead_stage_history` + `lead_stage_history` | Use `lead_stage_history` (more complete, has time_in_stage tracking) |

### Other Issues

1. **`admission_counselors.institution_id`** has no FK constraint to `institutions.id` (column exists but constraint missing).

2. **`admission_leads` has two counselor assignment columns**:
   - `assigned_counselor_id → profiles.id` (primary system)
   - `counselor_id → admission_counselors.id` (secondary system)
   These can get out of sync. Assignment rules write to `assigned_counselor_id`.

3. **`merit_lists` has no FK on `program_id`** to the `programs` table (NOTE in schema: "No program_id FK constraint to programs table").

4. **`lc_interviews` is NOT an admission interview table** — it's for Learning Community (LC) nominations. The `/admission/interviews` page uses `interview_bookings` instead.

---

## 9. Quick Reference: Which Service Feeds Which Page

| Service File | Page(s) | Key Table |
|---|---|---|
| `status-tracking-service.ts` | `/admission/status` | `admission_applications` |
| `merit-list-service.ts` | `/admission/merit-list` | `merit_lists` |
| `lateral-entry-service.ts` | `/admission/lateral-entry` | `lateral_entry_applications` |
| `seat-confirmation-service.ts` | `/admission/seat-confirmation` | `admission_payments` |
| `offer-letter-service.ts` | `/admission/offer-letter` | `offer_letters` |
| `document-service.ts` | `/admission/documents` | `application_documents`, `document_types` |
| `feedback-service.ts` | `/admission/feedback` | `admission_leads` (lead context) |
| `scoring-rules-service.ts` | `/admission/scoring-rules` | `admission_scoring_rules` |
| `assignment-rules-service.ts` | `/admission/assignment-rules` | `admission_assignment_rules` |
| `source-tracking-service.ts` | `/admission/sources` | `admission_leads` (aggregated) |
| `publisher-service.ts` | `/admission/publishers` | `education_consultants` |
| `interview-service.ts` | `/admission/interviews` | `interview_slots`, `interview_bookings` |
| `screening-exam-service.ts` | `/admission/screening-exam` | `screening_exams` |
| `scholarship-service.ts` | `/admission/scholarships` | `scholarships`, `scholarship_applications` |
| `hostel-service.ts` | `/admission/hostels` | `hostel_*` (partial — 4 tables missing) |
| `parent-communication-service.ts` | `/admission/parent-communication` | `admission_sms_logs`, `admission_whatsapp_logs` |
| `re-engagement-service.ts` | `/admission/re-engagement` | `re_engagement_campaigns` |

---

*This document was generated by analyzing 60 route pages, 42 Supabase tables, all service files, and the sidebar navigation configuration.*
