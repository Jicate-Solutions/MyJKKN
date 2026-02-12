# Admission CRM - Master Specification & Implementation Guide

> **Last Updated:** 2026-02-12
> **Module:** Admission CRM (`/admission/*`)
> **Services:** 43 files | **Routes:** 49 pages | **Hooks:** 35 files | **Tables:** 50+ | **Workflows:** 61
> **Status:** Phase 0 COMPLETE (Supabase wiring) | Phase 1 IN PROGRESS (Verification & Repair)

---

## HOW TO USE THIS FILE

This is the **single source of truth** for the Admission CRM module. When resuming work after a context clear:

1. Read THIS file first (sections P0-P1 for current status)
2. Check which phase you're on and what's next
3. The workflow documentation (sections 1-13) is the complete spec
4. Database schema is in its own top-level section [DATABASE SCHEMA REFERENCE](#database-schema-reference)
5. Test plan with 30 test cases is in section P1

---

## Table of Contents

**IMPLEMENTATION PHASES:**
- [P0: Foundation & Supabase Wiring](#p0-foundation--supabase-wiring-complete) (COMPLETE)
- [P1: Module Verification & Repair](#p1-module-verification--repair-in-progress) (IN PROGRESS - 2/30)
- [P2: UI Polish & Missing Features](#p2-ui-polish--missing-features-pending) (PENDING)
- [P3: Integration & External APIs](#p3-integration--external-apis-pending) (PENDING)
- [P4: Production Hardening](#p4-production-hardening-pending) (PENDING)

**DATABASE & ARCHITECTURE:**
- [Database Schema Reference](#database-schema-reference)
- [Known Schema Mismatches](#known-schema-mismatches-critical)
- [Complete File Inventory](#complete-file-inventory)

**SOURCE DOCUMENTS & COMPETITIVE INTELLIGENCE:**
- [Source Document Registry](#source-document-registry)
- [Strategic Context (FST Analysis)](#strategic-context-from-fst-analysis)
- [Competitive Gap Analysis](#competitive-gap-analysis-myjkkn-vs-merittoextraaedgeleadsquared)
- [Financial Impact of Gaps](#financial-impact-of-gaps-from-gap-analysis)
- [Build vs Buy Decisions](#build-vs-buy-decisions-decided)
- [30 Planned Features NOT YET BUILT](#30-planned-features-not-yet-built)
- [90-Day Roadmap](#90-day-roadmap-from-gap-analysis)
- [Meritto Feature Catalog (143 Features)](#meritto-feature-catalog-143-features-from-pdfs)

**WORKFLOW SPECIFICATIONS (61 workflows):**
1. [Master Lifecycle Workflow](#1-master-lifecycle-workflow)
2. [Lead Management Workflows](#2-lead-management-workflows) (7 workflows)
3. [Application Processing Workflows](#3-application-processing-workflows) (9 workflows)
4. [Communication & Campaign Workflows](#4-communication--campaign-workflows) (7 workflows)
5. [AI & Intelligence Workflows](#5-ai--intelligence-workflows) (6 workflows)
6. [Consultant Management Workflows](#6-consultant-management-workflows) (8 workflows)
7. [Post-Decision Workflows](#7-post-decision-workflows) (3 workflows)
8. [Automation, Rules & Configuration Workflows](#8-automation-rules--configuration-workflows) (10 workflows)
9. [Data Quality & Compliance Workflows](#9-data-quality--compliance-workflows) (6 workflows)
10. [Administrative & Configuration Workflows](#10-administrative--configuration-workflows) (2 workflows)
11. [Cross-Cutting Workflows](#11-cross-cutting-workflows) (3 workflows)
12. [Service-to-Table Mapping](#12-service-to-table-mapping)
13. [External API Dependencies](#13-external-api-dependencies)

---

# IMPLEMENTATION PHASES

## P0: Foundation & Supabase Wiring (COMPLETE)

**Status:** DONE (2026-02-10)
**Method:** 7 parallel fullstack-developer agents ("admission-blitz" team)

All ~50 admission CRM pages wired from mock/placeholder data to real Supabase queries.

### What Was Built

| Agent | Scope | Status |
|-------|-------|--------|
| hook-wirer | 23 TODO stubs in hooks (8 in index.ts, 15 in use-consultants.ts) | DONE |
| selection-flow | GD-PI, Screening Exam, Merit List, Interviews pages | DONE |
| offer-enrollment | Offer Letter, Seat Confirmation, Lateral Entry pages | DONE |
| analytics-config | Analytics, Insights, Settings, Scoring/Assignment/Workflow configs | DONE |
| consultant-portal | Consultant CRUD, Commissions, Rewards, Analytics + CSV export | DONE |
| comms-daily-ops | Communication, Templates, Campaigns, Reminders, Status Tracking | DONE |
| data-quality-finance | Phone Validation, Data Profiling, Dedup, Scholarships, Loans, Hostels, Documents, Sources, Publishers, Feedback, Re-engagement | DONE |

**17 new service files created.** Build passes (650 pages). Tests: 655/655 PASS.

### Migrations Applied

| Migration | Purpose |
|-----------|---------|
| `20250131_update_learner_admission_fields.sql` | Learner profile admission fields |
| `20260203000002_create_admission_crm_tables.sql` | Core admission tables |
| `20260204100000_add_admission_crm_tables.sql` | Additional admission tables |
| `20260204115310_create_admission_sms_logs.sql` | SMS communication logging |
| `20260204130019_create_admission_lead_scores_table.sql` | Lead scoring table |
| `20260204130025_create_admission_daily_briefings.sql` | Daily briefing tables |

---

## P1: Module Verification & Repair (IN PROGRESS)

**Status:** 2/30 test cases done (1 more in progress)
**Goal:** Every page loads, every button works, every service hits real DB correctly

### Test Environment

| Item | Value |
|------|-------|
| Staging DB | `hhprjbgknupaplivtoib` |
| Test user | `test-superadmin@jkkn.local` / `SuperAdmin@123` |
| Institution ID | `a1111111-1111-1111-1111-111111111111` |
| Live URL | `https://myjkkn-omm-dev.vercel.app` |

### Test Cases (30 total)

| ID | Test | Route | Priority | Status |
|----|------|-------|----------|--------|
| P1-001 | Dashboard loads with real data | `/admission/dashboard` | P0 | FIXED |
| P1-002 | Create a new lead | `/admission/leads/new` | P0 | IN PROGRESS |
| P1-003 | View lead list with filters | `/admission/leads` | P0 | FIXED |
| P1-004 | View lead detail | `/admission/leads/[id]` | P0 | PENDING |
| P1-005 | Update lead stage | `/admission/leads/[id]` | P0 | PENDING |
| P1-006 | Assign counselor to lead | `/admission/leads/[id]` | P0 | PENDING |
| P1-007 | Log activity on lead | `/admission/leads/[id]` | P0 | PENDING |
| P1-008 | Schedule follow-up | `/admission/leads/[id]` | P0 | PENDING |
| P1-009 | Mark lead as hot/priority | `/admission/leads` | P0 | PENDING |
| P1-010 | Create application from lead | `/admission/applications` | P0 | PENDING |
| P1-011 | Funnel visualization accuracy | `/admission/dashboard` | P1 | PENDING |
| P1-012 | Lead scoring calculates | `/admission/leads/[id]` | P1 | PENDING |
| P1-013 | Counselor list loads | `/admission/counselors` | P1 | PENDING |
| P1-014 | Analytics dashboard | `/admission/analytics` | P1 | PENDING |
| P1-015 | Communication templates list | `/admission/templates` | P1 | PENDING |
| P1-016 | Interview scheduling | `/admission/interviews` | P1 | PENDING |
| P1-017 | Offer letter generation | `/admission/offer-letter` | P1 | PENDING |
| P1-018 | Seat confirmation flow | `/admission/seat-confirmation` | P1 | PENDING |
| P1-019 | Document upload & verification | `/admission/documents` | P1 | PENDING |
| P1-020 | GD-PI session management | `/admission/gd-pi` | P1 | PENDING |
| P1-021 | Scoring rules CRUD | `/admission/scoring-rules` | P2 | PENDING |
| P1-022 | Assignment rules CRUD | `/admission/assignment-rules` | P2 | PENDING |
| P1-023 | Workflow builder | `/admission/workflows` | P2 | PENDING |
| P1-024 | Campaign monitoring | `/admission/campaigns/monitoring` | P2 | PENDING |
| P1-025 | AI insights generation | `/admission/insights` | P2 | PENDING |
| P1-026 | Daily briefing | `/admission/briefing` | P2 | PENDING |
| P1-027 | Consultant management | `/admission/consultants` | P2 | PENDING |
| P1-028 | Publisher management | `/admission/publishers` | P2 | PENDING |
| P1-029 | Deduplication detection | `/admission/deduplication` | P2 | PENDING |
| P1-030 | Phone validation | `/admission/phone-validation` | P2 | PENDING |

### Detailed Test Steps

**P1-001: Dashboard loads with real data** (FIXED)
1. Navigate to `/admission/dashboard` → Page loads without errors
2. Check KPI cards → Total Active Leads shows actual count (not 0)
3. Check Hot Leads card → Shows count of `is_hot_lead=true` leads
4. Check funnel visualization → Bar widths match actual stage distribution
5. Check console → No errors in browser console

**P1-002: Create a new lead** (IN PROGRESS)
1. Navigate to `/admission/leads/new` → Form renders with all fields
2. Fill required fields: name, phone, source → No validation errors
3. Click Create Lead → Toast shows success, redirect to lead detail
4. Verify lead in DB → Record exists in `admission_leads` with correct data
5. Check stage_history → Initial stage entry logged in `admission_lead_stage_history`

**P1-003: View lead list with filters** (FIXED)
1. Navigate to `/admission/leads` → Lead list loads with data
2. Test search by name → Filters leads by `full_name` match
3. Test stage filter → Shows only leads in selected `funnel_stage`
4. Test hot lead filter → Shows only `is_hot_lead=true` leads
5. Test pagination → Pages through results correctly

**P1-004 through P1-010: Core Lead Operations** (ALL PENDING)
- Lead detail view, stage updates, counselor assignment, activity logging, follow-up scheduling, hot/priority toggling, application creation
- See `docs/MyJKKN-TQM-Specs/features.json` → `admission_crm_phase1.items` for full step details

**P1-011 through P1-020: Module Pages** (ALL PENDING)
- Funnel accuracy, scoring, counselors, analytics, templates, interviews, offers, seat confirmation, documents, GD-PI

**P1-021 through P1-030: Configuration & Advanced** (ALL PENDING)
- Scoring rules CRUD, assignment rules, workflows, campaigns, AI insights, briefing, consultants, publishers, dedup, phone validation

---

## P2: UI Polish & Missing Features (PENDING)

Pages identified as PARTIAL that need completion:

| Page | What's Missing |
|------|---------------|
| `/admission/applications` | Full application list with filters |
| `/admission/status` | Application pipeline dashboard polish |
| `/admission/scholarships` | Full scholarship management UI |
| `/admission/hostels` | Complete hostel allocation flow |
| `/admission/loans` | Entire module (currently mock data, no service) |
| `/admission/lateral-entry` | Polish lateral entry processing |
| `/admission/templates` | Template create/edit forms |
| `/admission/campaigns` | Campaign creation and management |
| `/admission/campaigns/monitoring` | Campaign monitoring dashboard |
| `/admission/reminders` | Reminder management dashboard |
| `/admission/chatbot` | Chatbot interface and FAQ management |
| `/admission/counselors` | Counselor management page |
| `/admission/publishers` | Publisher management page |
| `/admission/sources` | Lead source tracking page |
| `/admission/scoring-rules` | Scoring rules configuration UI |
| `/admission/assignment-rules` | Assignment rules configuration UI |
| `/admission/insights` | AI insights dashboard |
| `/admission/briefing` | Daily briefing view |
| `/admission/data-profiling` | Data quality analysis UI |
| `/admission/deduplication` | Duplicate detection and merge UI |
| `/admission/phone-validation` | Phone validation dashboard |
| `/admission/documents` | Document verification queue |

---

## P3: Integration & External APIs (PENDING)

| Integration | Status | Notes |
|-------------|--------|-------|
| MSG91/Twilio SMS | NOT CONNECTED | SmsCampaignService ready, needs API keys |
| WhatsApp Business API | NOT CONNECTED | WhatsAppCampaignService ready, currently simulated |
| Anthropic Claude AI | NOT CONNECTED | AIResponseService, AgenticQueryService ready, needs API key in env |
| Supabase Realtime | WIRED | CampaignMonitoringService uses subscriptions |
| Supabase Storage | WIRED | InsightActionsService uses for CSV exports |

---

## P4: Production Hardening (PENDING)

- [ ] RLS policies on all admission tables
- [ ] Role-based access (counselor vs admin vs manager)
- [ ] Input validation at all form boundaries
- [ ] Error handling for all service calls
- [ ] Loading states for all async operations
- [ ] Empty states for all list pages
- [ ] Pagination for all list queries
- [ ] Rate limiting on public application form
- [ ] Audit logging for sensitive operations
- [ ] Performance optimization for large datasets

---

# DATABASE SCHEMA REFERENCE

## `admission_leads` Table (58 columns)

The central table. Every service touches this.

```
id                    UUID PRIMARY KEY
learner_profile_id    UUID (FK to learner_profiles)
institution_id        UUID (FK to institutions) -- multi-tenant key
full_name             TEXT
email                 TEXT
phone                 TEXT
source                TEXT (website/referral/social_media/walk_in/consultant/etc.)
alternate_phone       TEXT
date_of_birth         TEXT
gender                TEXT
address_line1         TEXT
city                  TEXT
state                 TEXT
district              TEXT
pincode               TEXT
notes                 TEXT
entry_date            TIMESTAMPTZ
funnel_stage          TEXT (new/contacted/engaged/qualified/application_started/application_submitted/under_review/interview_scheduled/offered/accepted/enrolled/lost/dormant)
stage                 ENUM `admission_lead_stage` (19 values: new/contacted/engaged/qualified/applied/application_started/application_submitted/documents_pending/documents_verified/interview_scheduled/interview_completed/interviewed/offered/offer_sent/offer_accepted/token_paid/enrolled/lost/dormant)
stage_changed_at      TIMESTAMPTZ
previous_stage        TEXT
counselor_id          UUID (FK)
assigned_counselor_id UUID (FK)
assigned_at           TIMESTAMPTZ
ownership_mode        TEXT
engagement_score      NUMERIC
quality_score         NUMERIC
combined_score        NUMERIC
score                 NUMERIC
score_category        TEXT (hot/warm/cold)
score_breakdown       JSONB
score_updated_at      TIMESTAMPTZ
next_followup_at      TIMESTAMPTZ
conversion_probability NUMERIC
last_activity_at      TIMESTAMPTZ
last_contact_at       TIMESTAMPTZ
total_messages_sent   INTEGER
messages_this_week    INTEGER
last_message_at       TIMESTAMPTZ
preferred_channel     TEXT
tags                  TEXT[]
is_hot_lead           BOOLEAN
is_priority           BOOLEAN
is_active             BOOLEAN
is_dormant            BOOLEAN
dormant_at            TIMESTAMPTZ
is_lost               BOOLEAN
lost_reason           TEXT
lost_at               TIMESTAMPTZ
interested_programs   TEXT[]
preferred_campus      TEXT
parent_name           TEXT
parent_phone          TEXT
parent_email          TEXT
parent_opted_in       BOOLEAN
created_at            TIMESTAMPTZ
updated_at            TIMESTAMPTZ
created_by            UUID
```

## Known Schema Mismatches (CRITICAL)

These were discovered during P1 verification. Services may still reference wrong column names:

| What Code Says | What DB Actually Has | Fix |
|----------------|---------------------|-----|
| `priority` (enum) | `is_hot_lead` (bool) + `is_priority` (bool) | Use two booleans |
| `program_interest` | `interested_programs` (text[]) | Use correct name |
| `funnel_stage` (text, 13 vals) | `stage` (enum, 19 vals) also exists | Clarify which to use — enum has more granular stages (documents_pending, token_paid, etc.) |
| `is_duplicate` | DOES NOT EXIST | Not in schema |
| `duplicate_of` | DOES NOT EXIST | Not in schema |
| `type` (on templates) | `channel` (sms/email/whatsapp) | Use `channel` |

**Pattern:** All services may reference non-existent columns. Every service must be audited against actual DB schema during P1.

## Other Key Tables

| Table | Key Info |
|-------|----------|
| `admission_counselors` | Simple: id, name, email, institution_id, created_at (5 cols only) |
| `education_consultants` | Separate from counselors. ConsultantService uses this table |
| `admission_communication_templates` | Uses `channel` column (NOT `type`) for sms/email/whatsapp |
| `admission_scoring_rules` | Has flat columns (field, operator, value, points) AND `criteria` JSONB |

---

# COMPLETE FILE INVENTORY

## Route Pages (49 total)

### Fully Complete (20 pages)
```
/admission/counselor-view/page.tsx     - Counselor daily dashboard
/admission/dashboard/page.tsx          - Main dashboard
/admission/group-dashboard/page.tsx    - Multi-institution comparison
/admission/leads/page.tsx              - Lead list
/admission/leads/[id]/page.tsx         - Lead detail (1481 lines)
/admission/leads/new/page.tsx          - Create lead (766 lines)
/admission/interviews/page.tsx         - Interview scheduling (873 lines)
/admission/screening-exam/page.tsx     - Exam management (1156 lines)
/admission/gd-pi/page.tsx             - Group Discussion & PI (1017 lines)
/admission/merit-list/page.tsx         - Merit list (1096 lines)
/admission/offer-letter/page.tsx       - Offer letters (1197 lines)
/admission/seat-confirmation/page.tsx  - Seat confirmation (858 lines)
/admission/apply/page.tsx              - Public application form (1333 lines)
/admission/parent-communication/page.tsx - Parent engagement (762 lines)
/admission/feedback/page.tsx           - Feedback collection (808 lines)
/admission/re-engagement/page.tsx      - Re-engage lost leads (789 lines)
/admission/analytics/page.tsx          - Analytics dashboard (841 lines)
/admission/workflow-config/page.tsx    - Workflow config
/admission/workflows/page.tsx          - Workflow management (842 lines)
/admission/settings/page.tsx           - Module settings (791 lines)
```

### Consultant Portal (7 pages - COMPLETE)
```
/admission/consultants/page.tsx            - Consultant list
/admission/consultants/new/page.tsx        - Add consultant
/admission/consultants/[id]/page.tsx       - Consultant detail (765 lines)
/admission/consultants/[id]/edit/page.tsx  - Edit consultant (784 lines)
/admission/consultants/analytics/page.tsx  - Performance analytics (818 lines)
/admission/consultants/commissions/page.tsx - Commission tracking (828 lines)
/admission/consultants/rewards/page.tsx    - Rewards management (1338 lines)
```

### Partial / Need Polish (22 pages)
```
/admission/applications/page.tsx       - Application list
/admission/status/page.tsx             - Status tracking
/admission/scholarships/page.tsx       - Scholarship management
/admission/hostels/page.tsx            - Hostel allocation
/admission/loans/page.tsx              - Education loans (MOCK DATA)
/admission/lateral-entry/page.tsx      - Lateral entry
/admission/templates/page.tsx          - Communication templates
/admission/campaigns/page.tsx          - Campaign management
/admission/campaigns/monitoring/page.tsx - Campaign monitoring
/admission/reminders/page.tsx          - Reminders
/admission/chatbot/page.tsx            - AI chatbot
/admission/counselors/page.tsx         - Counselor management
/admission/publishers/page.tsx         - Publisher management
/admission/sources/page.tsx            - Source tracking
/admission/scoring-rules/page.tsx      - Scoring rules config
/admission/assignment-rules/page.tsx   - Assignment rules config
/admission/insights/page.tsx           - AI insights
/admission/briefing/page.tsx           - Daily briefing
/admission/data-profiling/page.tsx     - Data quality
/admission/deduplication/page.tsx      - Duplicate detection
/admission/phone-validation/page.tsx   - Phone validation
/admission/documents/page.tsx          - Document verification
```

## Service Files (43 total)

All in `lib/services/admission/`:

| Service | Lines | Purpose |
|---------|-------|---------|
| lead-service.ts | 718 | Lead CRUD, filtering, search |
| lead-scoring-engine-service.ts | 741 | Score calculation engine |
| admission-service.ts | 1398 | Legacy admissions operations |
| consultant-service.ts | 2219 | Consultant CRUD, import, commissions |
| insight-actions-service.ts | 985 | 11 actionable insight types |
| sms-campaign-service.ts | 854 | SMS campaign execution |
| drip-executor-service.ts | 784 | Drip sequence engine |
| agentic-query-service.ts | 771 | NL query → DB query pipeline |
| ai-insights-service.ts | 740 | AI analysis & recommendations |
| daily-briefing-service.ts | 726 | Morning briefing generation |
| campaign-processor-service.ts | 635 | Campaign queue processing |
| campaign-monitoring-service.ts | 618 | Delivery tracking |
| whatsapp-campaign-service.ts | 574 | WhatsApp campaigns |
| admission-ai-service.ts | 560 | AI dashboard insights |
| briefing-delivery-service.ts | 495 | Briefing notifications |
| workflows-service.ts | 483 | Workflow execution engine |
| ai-response-service.ts | 482 | AI response suggestions |
| data-quality-service.ts | 457 | Data profiling & issues |
| communication-templates-service.ts | 401 | Template management |
| scoring-rules-service.ts | - | Scoring rules CRUD |
| assignment-rules-service.ts | - | Assignment rules CRUD |
| workflow-config-service.ts | - | Workflow config CRUD |
| interview-service.ts | - | Interview scheduling |
| screening-exam-service.ts | - | Exam management |
| merit-list-service.ts | - | Merit list generation |
| offer-letter-service.ts | - | Offer management |
| seat-confirmation-service.ts | - | Seat confirmation |
| lateral-entry-service.ts | - | Lateral entry |
| hostel-service.ts | - | Hostel allocation |
| scholarship-service.ts | - | Scholarships |
| source-tracking-service.ts | - | Source attribution |
| document-service.ts | - | Document verification |
| feedback-service.ts | - | Feedback collection |
| re-engagement-service.ts | - | Re-engagement campaigns |
| status-tracking-service.ts | - | Status tracking |
| activity-service.ts | - | Activity logging |
| counselor-daily-view-service.ts | - | Counselor KPIs |
| parent-communication-service.ts | - | Parent engagement |
| group-dashboard-service.ts | - | Multi-institution analytics |
| naac-report-service.ts | - | NAAC compliance reporting |
| admission-tqm-metrics-service.ts | - | Quality metrics |

## Type Definitions

| File | Lines | Content |
|------|-------|---------|
| `types/admission.ts` | 1413 | All admission types (leads, apps, interviews, offers, etc.) |
| `types/admission-workflow-config.ts` | 144 | Workflow config types, stage constants |

## Hook Files (35)

All in `hooks/admission/`:

| Hook | Lines | Purpose |
|------|-------|---------|
| use-consultants.ts | 20,098 | Full consultant portal hooks |
| use-data-quality.ts | 12,509 | Data quality + publishers + hostels + scholarships |
| use-agentic-query.ts | 12,790 | Conversational AI query hooks |
| use-lead-scoring.ts | 10,107 | Lead scoring visualization |
| use-ai-responses.ts | 6,618 | AI response generation hooks |
| index.ts | - | 12 consolidated hooks |
| Plus 25+ individual hook files for each feature area |

## Component Files (23)

All in `components/admission/`:
- Lead scoring: badge, card, factors list
- AI: suggested responses, personalizer, insight cards, anomaly alerts, recommendations, trends
- Campaign: stats cards, delivery chart, drip progress, execution log, drip status
- Actions: button, confirm dialog, bulk panel
- Agentic query: input, progress, result
- Briefing: notification banner, popup

## API Routes (2)

```
/api/admission/consultants/template/route.ts  - CSV template download
/api/admission/consultants/import/route.ts     - Bulk consultant import
```

---

# SOURCE DOCUMENTS & COMPETITIVE INTELLIGENCE

> **These documents were the original basis for the CRM design. Cross-reference here when planning new features.**

## Source Document Registry

| # | Document | Location | What It Contains |
|---|----------|----------|-----------------|
| 1 | FST-Admission-CRM.md | `/Users/omm/Vaults/Claude Setup/Capture/FST-Admission-CRM.md` | First-principles strategic analysis of what to build |
| 2 | Gap-Analysis-2026.md | `/Users/omm/Vaults/JKKNKB/MyJKKN/Admissions/Gap-Analysis-2026.md` | Competitive gap analysis vs ExtraaEdge, LeadSquared, Meritto |
| 3 | SR-Group Analysis | `/Users/omm/Vaults/JKKNKB/JICATE-Solutions/Clients/Sri-Ramakrishna-Institutions/Archive/SR-Group-JKKN-vs-Meritto-FSU-Analysis.md` | JKKN vs Meritto competitive positioning for SR Group deal |
| 4 | Meritto PDFs (8 files) | `/Users/omm/Downloads/` (Publisher, Campaign, Lead Mgmt, Lead Nurturing, Mobile App, Marketing Automation, User Mgmt, WhatsApp) | 143 competitor features extracted |
| 5 | Meritto Analysis (saved) | `/Users/omm/PROJECTS/MyJKKN/docs/research/meritto-competitor-analysis.md` | Consolidated extraction from all 8 PDFs |

## Strategic Context (From FST Analysis)

**Core Insight:** JKKN doesn't need to BUILD an Admission CRM from scratch — it already HAS one (35+ routes, 24 tables). The challenge is **activation, adoption, and integration.**

**The Single Most Important Question:** "Are JKKN counselors using the admission module today?" — the answer determines the entire strategy.

### Leverage Points (Ranked by Impact)

| # | Leverage Point | Impact | Effort | Status |
|---|---------------|--------|--------|--------|
| 1 | Counselor Daily View (one-page dashboard) | MASSIVE | Low | Page exists, needs polish |
| 2 | WhatsApp-first stage notifications | HIGH | Medium | NOT BUILT (external API) |
| 3 | Cross-campus dedup at capture | HIGH | Low | Service exists, needs verification |
| 4 | Auto-assignment with capacity limits | HIGH | Low | Assignment rules exist, needs verification |
| 5 | NAAC Criteria 2 report generator | STRATEGIC | Medium | Service stub exists |

### TQM Integration Points

| CRM Metric | TQM Module | How It Feeds |
|------------|------------|-------------|
| Stage conversion rates | Process Excellence | Value-add ratio per stage |
| Lead response time | Process Excellence | SLA compliance |
| Funnel drop-off rate | COPQ | Cost of lost leads |
| Counselor time on cold leads | COPQ | Hidden waste cost |
| Student satisfaction | Stakeholder NPS | Post-admission survey |
| Admission cycle time | Process Excellence | Speed metric |

### NAAC Criteria 2 Data Points

| Criterion | Data Required | Source in CRM |
|-----------|--------------|---------------|
| 2.1.1 Average Enrollment % | Enrollment count vs sanctioned intake | admission_leads (enrolled stage) |
| 2.1.2 Reserved Category Seats | Category-wise admission data | Lead category fields |
| Student Demand Ratio | Total leads/applications vs seats | Lead + application counts |
| Transparency Evidence | Complete audit trail | admission_lead_activities |
| ICT Integration | CRM + online portal | The module itself |

## Competitive Gap Analysis (MyJKKN vs Meritto/ExtraaEdge/LeadSquared)

### Maturity Assessment

| Dimension | Competitors | MyJKKN | Gap |
|-----------|-------------|--------|-----|
| Lead Philosophy | Living, scored entities with lifecycle | Database records | **CRITICAL** |
| Communication | Omni-channel conversation | Notification push | **CRITICAL** |
| Automation | Event-driven workflows | Manual triggers | **SEVERE** |
| Intelligence | Predictive insights | Reports only | **SEVERE** |
| Student Experience | Self-service journey | Admin portal | **MODERATE** |

### Feature Comparison Matrix

#### Lead Management

| Feature | Competitors | MyJKKN | Gap Level |
|---------|------------|--------|-----------|
| Multi-channel capture (web, WhatsApp, FB, IG, Google) | Full | Basic (manual entry) | CRITICAL |
| Lead scoring (engagement signals) | Full | Service exists, needs wiring | HIGH |
| Lead scoring (AI-predicted conversion) | Full | AI service stub exists | HIGH |
| Multi-touch source attribution with UTM | Full | Basic text field | SEVERE |
| Fuzzy deduplication (name/phone/email variations) | Smart/Auto | Basic exact-match | HIGH |
| Automated distribution (round-robin, capacity, skill) | Full | Assignment rules exist, unverified | HIGH |
| Speed-to-lead optimization (<5 min) | Full | No SLA tracking | SEVERE |
| Lead strength scoring | Full | Service exists | HIGH |
| 360-degree lead profile | Full | Lead detail page exists | MODERATE |
| Geographic benchmarking | Meritto only | Not built | LOW |
| Lead masking (for publishers) | Meritto only | Not built | LOW |

#### Communication

| Feature | Competitors | MyJKKN | Gap Level |
|---------|------------|--------|-----------|
| WhatsApp Business API | Full (Meta partner) | NOT BUILT | **CRITICAL** |
| SMS bulk + automated triggers | Full | Service exists, no gateway | **CRITICAL** |
| Email campaign builder | Full | Templates exist, no builder | SEVERE |
| Cloud telephony (click-to-call, recording) | Full | NOT BUILT | SEVERE |
| AI chatbot (24/7, NLP, course recommendations) | Full (Meritto "Niaa") | Chatbot page exists, AI stub | HIGH |
| Push notifications | Full | NOT BUILT | MODERATE |
| Video calls | ExtraaEdge only | NOT BUILT | LOW |

#### Automation

| Feature | Competitors | MyJKKN | Gap Level |
|---------|------------|--------|-----------|
| Workflow builder (event-driven triggers) | Full | Workflow service exists, basic | HIGH |
| Rule engine (IF/THEN logic) | Full | Scoring/assignment rules exist | HIGH |
| Auto follow-ups with escalation | Full | NOT BUILT | SEVERE |
| Auto task creation | Full | NOT BUILT | SEVERE |
| Document verification with OCR | Full | Document service exists, no OCR | HIGH |
| Interview scheduling (self-booking, calendar sync) | Full | Interview page exists, basic | HIGH |

#### Analytics

| Feature | Competitors | MyJKKN | Gap Level |
|---------|------------|--------|-----------|
| Funnel analytics with drop-off diagnostics | Full | Dashboard exists, basic | HIGH |
| Counselor performance dashboards | Full | Analytics page exists | HIGH |
| Marketing ROI analytics (cost per lead/enrollment) | Full | NOT BUILT | SEVERE |
| Campaign ROI by channel | Full | NOT BUILT | SEVERE |
| Real-time dashboards | Full | AI insights service exists | MODERATE |

#### Student Experience

| Feature | Competitors | MyJKKN | Gap Level |
|---------|------------|--------|-----------|
| Student admission portal (self-service) | Full | `/admission/apply` exists, basic | HIGH |
| Online application (multi-step, save & resume) | Full | Application page exists | HIGH |
| Document upload (drag-drop, mobile camera) | Full | Document page exists, basic | HIGH |
| Multiple payment options | Full | NOT BUILT (separate billing module) | MODERATE |
| Real-time status tracking | Full | Status page exists | MODERATE |
| Interview self-booking | Full | NOT BUILT | HIGH |
| Mobile app / offline mode | Full | NOT BUILT | MODERATE |

## Financial Impact of Gaps (From Gap Analysis)

**Assumptions:** 10,000 annual enquiries | 15% current conversion | Avg fee ₹1,50,000 | 10 counselors

| Gap | Annual Impact (₹) | Priority |
|-----|-------------------|----------|
| No lead scoring | 6.75 - 11.25 Crore | CRITICAL |
| Manual follow-ups | 7.65 Crore | CRITICAL |
| No WhatsApp integration | 5.85 Crore per cycle | CRITICAL |
| No counselor analytics | 7.5 Crore | HIGH |
| No source attribution | 3 Crore | HIGH |
| Document delays | 2.25 Crore | HIGH |
| **Estimated Total** | **25-35 Crore/year** | |

## Build vs Buy Decisions (DECIDED)

| Component | Decision | Rationale |
|-----------|----------|-----------|
| WhatsApp | **BUY** (Wati/Interakt) | Simple, data stays with JKKN |
| Lead Scoring | **BUILD** | Competitive advantage, already have service stubs |
| Document Portal | **BUILD** | Core experience |
| Email Campaigns | **BUY** (SendGrid) | Commodity service |
| Cloud Telephony | **BUY** (Exotel) | Specialized infrastructure |
| Analytics | **BUILD** | Proprietary data |
| Automation Engine | **BUILD** | Core workflow |
| AI Chatbot | **BUILD** | Already have AI infrastructure |
| Student Portal | **BUILD** | Core experience |

## 30 Planned Features NOT YET BUILT

These features were identified across all source documents as needed but have no working implementation:

| # | Feature | Source Doc | Priority | Build/Buy |
|---|---------|-----------|----------|-----------|
| 1 | Lead scoring (engagement-based) | Gap Analysis | CRITICAL | BUILD |
| 2 | WhatsApp Business API integration | Gap Analysis | CRITICAL | BUY |
| 3 | SMS gateway integration | Gap Analysis | CRITICAL | BUY |
| 4 | Automated lead assignment (round-robin + capacity) | FST + Gap | CRITICAL | BUILD |
| 5 | Auto follow-ups with escalation | Gap Analysis | CRITICAL | BUILD |
| 6 | Cloud telephony (click-to-call, recording, IVR) | Gap Analysis | HIGH | BUY |
| 7 | AI chatbot 24/7 (NLP, course recs, qualification) | Gap + Meritto | HIGH | BUILD |
| 8 | Workflow automation engine (event-driven triggers) | Gap Analysis | HIGH | BUILD |
| 9 | Email campaign builder | Gap Analysis | HIGH | BUY |
| 10 | Student self-service admission portal | Gap Analysis | HIGH | BUILD |
| 11 | Online application form (multi-step, save & resume) | Gap Analysis | HIGH | BUILD |
| 12 | Document upload portal with verification + OCR | Gap Analysis | HIGH | BUILD |
| 13 | Interview self-scheduling with calendar sync | Gap Analysis | HIGH | BUILD |
| 14 | Funnel analytics with drop-off diagnostics | Gap Analysis | HIGH | BUILD |
| 15 | Counselor performance dashboard (calls, conversion, SLA) | Gap Analysis | HIGH | BUILD |
| 16 | Marketing ROI analytics (cost per lead/enrollment) | Gap Analysis | HIGH | BUILD |
| 17 | Source attribution with UTM tracking | Gap Analysis | HIGH | BUILD |
| 18 | Fuzzy deduplication (name/phone/email variations) | Gap + Meritto | HIGH | BUILD |
| 19 | Lead scoring (AI-predicted conversion probability) | Gap Analysis | HIGH | BUILD |
| 20 | "Suggest Another Course" automation | Gap Analysis | MEDIUM | BUILD |
| 21 | Token fee seat release automation | Gap Analysis | MEDIUM | BUILD |
| 22 | Rejection feedback collection workflow | Gap Analysis | MEDIUM | BUILD |
| 23 | Parent communication portal | Gap Analysis | MEDIUM | BUILD |
| 24 | Alumni activation for admissions | Gap Analysis | MEDIUM | BUILD |
| 25 | NAAC Criteria 2 report generator | FST | MEDIUM | BUILD |
| 26 | TQM integration (Process Excellence + COPQ) | FST | MEDIUM | BUILD |
| 27 | Counselor Daily View (adoption dashboard) | FST | HIGH | BUILD |
| 28 | Screening exam management (new DB table) | Gap Analysis | MEDIUM | BUILD |
| 29 | Payment tracking (application fee, token fee, full fee) | Gap Analysis | MEDIUM | BUILD |
| 30 | Compliance/audit automation (UGC, AICTE, DPDP) | Gap Analysis | LOW | BUILD |

## 90-Day Roadmap (From Gap Analysis)

### Phase A: Foundation (Days 1-30)

**Week 1-2: Quick Wins**
- Days 1-3: WhatsApp Business API setup (BUY)
- Days 4-5: Auto-responder for enquiries
- Days 6-7: Call tracking setup
- Days 8-10: Source attribution standardization
- Days 11-14: Basic lead scoring activation

**Week 3-4: Core Systems**
- Days 15-17: Document upload portal
- Days 18-20: Student status tracking polish
- Days 21-23: Counselor assignment automation
- Days 24-26: Email campaign connection (BUY)
- Days 27-30: Leads dashboard polish

### Phase B: Intelligence (Days 31-60)
- Days 31-33: Funnel analytics
- Days 34-36: Source ROI tracking
- Days 37-40: Counselor performance dashboard
- Days 41-44: Lead engagement scoring
- Days 45-47: Workflow engine enhancement
- Days 48-50: Auto follow-up reminders
- Days 51-58: SLA tracking + escalation

### Phase C: Experience (Days 61-90)
- Days 61-66: Student application portal
- Days 67-74: Document verification + interview scheduling
- Days 75-84: Mobile optimization + training
- Days 85-90: Soft launch + full rollout

### Success Metrics by Day 90

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Response time | ~6 hours | < 30 min | 12x |
| WhatsApp reach | 0% | 80% | From zero |
| Application completion | 35% | 65% | 1.9x |
| Counselor calls/day | 30 | 60 | 2x |
| Source attribution | 10% | 90% | 9x |
| Conversion rate | 15% | 22% | 1.5x |

## Meritto Feature Catalog (143 Features from PDFs)

### Publisher Panel (14 features)
- 3-level source attribution (source → sub-source → campaign)
- Geographic benchmarking across publishers
- Publisher lead masking (privacy)
- Real-time publisher performance dashboards
- Publisher-specific conversion funnels
- Commission tracking & automated payouts
- Lead quality scoring per publisher
- Publisher portal with self-service
- Campaign-level ROI per publisher
- Geographic lead distribution maps
- Publisher tier management
- Automated publisher reports
- Lead response time tracking per publisher
- Publisher onboarding workflow

### Campaign Management (18 features)
- MEI (Mutually Exclusive Impact) attribution
- Non-editable source attribution
- Dynamic Lead Flow Algorithm
- Multi-channel campaign execution (email + SMS + WhatsApp)
- Campaign ROI tracking
- A/B testing for campaigns
- Drip campaign sequences
- Campaign scheduling & automation
- Audience segmentation
- Campaign templates library
- Real-time delivery tracking
- Click/open rate analytics
- Campaign budget tracking
- Geographic campaign targeting
- Campaign cloning/templating
- Dynamic content personalization
- Triggered campaigns (event-based)
- Campaign approval workflows

### Lead Management (28 features)
- Lead Strength scoring (engagement-based)
- Smart lead distribution (capacity + skill)
- Cross-platform deduplication
- 360-degree lead profile
- Lead timeline/activity feed
- Bulk lead import (CSV/Excel)
- Lead transfer between counselors
- Lead merge with field selection
- Custom lead fields
- Lead stages (customizable)
- Lead tags & segments
- Lead source tracking
- Speed-to-lead alerts
- Lead priority flags
- Lead ownership rules
- Dead lead reactivation
- Lead export with filters
- Lead notes & attachments
- Lead qualification criteria
- Lead conversion tracking
- Lead status automation
- Bulk lead operations
- Lead field validation
- Lead API for external capture
- Multi-campus lead routing
- Lead capacity management per counselor
- Lead SLA monitoring
- Lead activity scoring

### Lead Nurturing (25 features)
- Multi-channel nurturing (Email/SMS/WhatsApp/Push)
- Dynamic content based on lead attributes
- Journey builder (visual workflow)
- A/B testing for nurture sequences
- Nurture track assignment rules
- Engagement scoring during nurture
- Exit criteria per nurture track
- Conditional branching in nurture
- Time-delay actions
- Lead re-engagement sequences
- Personalized content recommendations
- Behavioral trigger actions
- Nurture analytics dashboard
- Best-time-to-send optimization
- Nurture template library
- Multi-language nurture content
- Nurture goal tracking
- Nurture attribution
- Cross-channel nurture orchestration
- Nurture A/B winner auto-selection
- Lead warming sequences
- Event-based nurture triggers
- Custom nurture KPIs
- Nurture fatigue management
- Progressive profiling during nurture

### Mobile App (22 features)
- Offline mode with sync
- Biometric attendance tracking
- GPS tracking for field counselors
- Lead capture at education fairs
- Push notification for new leads
- In-app calling with recording
- Photo upload for documents
- QR code lead capture
- Walk-in registration kiosk mode
- Mobile dashboard
- Task management on mobile
- Calendar view
- Quick lead entry
- Lead follow-up reminders (mobile)
- Voice notes on leads
- Location check-in
- Mobile reports
- Team chat
- Document scanner
- Offline form filling
- Mobile approval workflows
- Event check-in mode

### Marketing Automation (12 features)
- Drip campaign builder
- Behavioral triggers
- Cross-channel orchestration
- Dynamic list segmentation
- Marketing analytics
- Landing page builder
- Form builder
- UTM parameter tracking
- Marketing attribution models
- Lead scoring from marketing engagement
- Marketing budget tracking
- Marketing ROI dashboard

### User Management (8 features)
- Role-based access control
- Activity audit logs
- Team hierarchy management
- User permissions (granular)
- User groups
- Login session management
- User performance tracking
- Multi-campus user management

### WhatsApp Business API (16 features)
- Official Meta Technology Partner
- Template message management
- Quick reply buttons
- Interactive list messages
- Document sharing via WhatsApp
- WhatsApp chatbot flows
- Green tick verification
- WhatsApp broadcast lists
- Read receipt tracking
- WhatsApp analytics dashboard
- Auto-reply outside business hours
- WhatsApp lead capture
- WhatsApp payment links
- Media sharing (images, PDFs)
- WhatsApp catalog sharing
- Conversation tagging

---

# WORKFLOW SPECIFICATIONS

---

## 1. Master Lifecycle Workflow

The complete admission journey from first contact to enrolled student:

```
LEAD GENERATION          LEAD NURTURING           CONVERSION
    |                        |                        |
    v                        v                        v
[Source Capture]  -->  [Score & Assign]  -->  [Application]
    |                        |                        |
    |  Sources:              |  Auto-scoring           |  Form submission
    |  - Website form        |  Auto-assignment        |  Document upload
    |  - Consultant referral |  Counselor contact      |  Fee payment
    |  - Walk-in             |  Drip campaigns         |
    |  - Social media        |  WhatsApp/SMS/Email     |
    |  - Publisher ads        |  Re-engagement          |
    |  - Chatbot             |                        |
    v                        v                        v

EVALUATION               DECISION                 ENROLLMENT
    |                        |                        |
    v                        v                        v
[Screening/Interview] --> [Merit List]  -->  [Offer Letter]
    |                        |                        |
    |  Screening exams       |  Score ranking          |  Generate & send
    |  GD/PI rounds          |  Category-wise lists    |  Accept/Decline
    |  Interview booking     |  Publish/unpublish      |  Deadline tracking
    |  Score recording       |  Waitlist management    |  Reminders
    v                        v                        v

SEAT CONFIRMATION        POST-ADMISSION
    |                        |
    v                        v
[Payment & Seat]  -->  [Student Record]
    |                        |
    |  Fee collection        |  Auto-create student
    |  Receipt generation    |  Hostel allocation
    |  Scholarship apply     |  Lateral entry handling
    |  Loan coordination     |  Parent communication
    |  Refund processing     |  Feedback collection
```

### Funnel Stages (in order)

| Stage | DB Value | Description |
|-------|----------|-------------|
| 1 | `new` | Lead just captured |
| 2 | `contacted` | First contact made |
| 3 | `engaged` | Showing interest, responding |
| 4 | `qualified` | Meets admission criteria |
| 5 | `application_started` | Application form begun |
| 6 | `application_submitted` | Application complete |
| 7 | `under_review` | Being evaluated |
| 8 | `interview_scheduled` | Interview/GD-PI booked |
| 9 | `offered` | Offer letter sent |
| 10 | `accepted` | Offer accepted |
| 11 | `enrolled` | Seat confirmed, fees paid |
| X | `lost` | Dropped out at any stage |
| X | `dormant` | Inactive for extended period |

---

## 2. Lead Management Workflows

### 2.1 Lead Capture Workflow

**Route:** `/admission/leads/new`
**Service:** `LeadService.createLead()`
**Table:** `admission_leads`

```
Trigger: Manual entry / Bulk import / Chatbot / Consultant referral / Website form
    |
    v
[Create Lead Record]
    |-- name, email, phone, source, interested_programs
    |-- institution_id (multi-tenant)
    |-- funnel_stage = 'new'
    |
    v
[Optional: Auto-Assign Counselor]  <-- AssignmentRulesService
    |-- Based on active assignment rules
    |-- Criteria: source, program, location, round-robin
    |
    v
[Optional: Auto-Score Lead]  <-- LeadScoringEngineService
    |-- Calculate engagement + quality score
    |-- Assign category (hot/warm/cold)
    |
    v
[Lead appears in pipeline]  --> /admission/leads
```

### 2.2 Lead Stage Progression Workflow

**Service:** `LeadService.updateLeadStage()`
**Tables:** `admission_leads`, `admission_lead_stage_history`, `admission_lead_activities`

```
[Current Stage] --> User clicks "Advance Stage"
    |
    v
[Update lead.funnel_stage]
    |
    v
[Create stage history record]
    |-- lead_id, from_stage, to_stage, changed_at, changed_by
    |
    v
[Create activity record]
    |-- type: 'stage_change'
    |-- description: "Stage changed from X to Y"
    |
    v
[Trigger any active workflows]  <-- WorkflowsService
    |-- If workflow trigger matches stage change
    |-- Execute workflow actions (send email, assign, etc.)
```

### 2.3 Counselor Daily View Workflow

**Route:** `/admission/counselor-view`
**Service:** `CounselorDailyViewService`
**RPC:** `get_counselor_daily_view`

```
[Counselor logs in] --> Dashboard shows "My Day"
    |
    |--> [Today's KPIs]
    |      |-- New leads assigned today
    |      |-- Follow-ups due today
    |      |-- Conversions this week
    |
    |--> [Follow-up Queue]
    |      |-- Leads with follow-ups due today (uses `next_followup_at` column)
    |      |-- Click to call / message / reschedule
    |
    |--> [Mini Pipeline]
    |      |-- My leads by stage
    |      |-- Quick stage advancement
    |
    |--> [Activity Log]
    |      |-- Recent activities across my leads
    |
    |--> [Unassigned Leads]  (if admin/manager)
           |-- New leads without counselor
           |-- Quick assign action
```

**Quick Actions available:**
- `logCall(leadId, notes)` - Log a phone call, updates `last_contact_at`
- `addQuickNote(leadId, note)` - Add note activity
- `rescheduleFollowup(leadId, newDate)` - Move follow-up date (updates `next_followup_at`)
- `advanceStage(leadId, newStage)` - Progress lead in funnel
- `assignLeads(leadIds[], counselorId)` - Bulk assign

### 2.4 Lead Scoring Workflow

**Route:** `/admission/scoring-rules`
**Services:** `ScoringRulesService`, `LeadScoringEngineService`
**Tables:** `admission_scoring_rules`, `admission_lead_scores`, `admission_leads`

```
CONFIGURATION:
[Admin creates scoring rule]
    |-- engagement_criteria: { website_visits, email_opens, calls_answered, ... }
    |-- quality_criteria: { academic_score, entrance_exam, location_match, ... }
    |-- score_ranges: [hot: 80-100, warm: 50-79, cold: 0-49]
    |-- Only ONE rule can be active at a time
    |
    v
[Toggle rule active]  --> Deactivates all others

EXECUTION:
[Trigger: Manual / Bulk / On lead update]
    |
    v
[LeadScoringEngineService.calculateLeadScore(leadId)]
    |
    |--> Fetch lead data
    |--> Fetch active scoring rule
    |--> Calculate engagement score (0-50)
    |--> Calculate quality score (0-50)
    |--> Total = engagement + quality (0-100)
    |--> Determine category (hot/warm/cold)
    |
    v
[Save to admission_lead_scores]
    |-- lead_id, total_score, engagement_score, quality_score, category
    |
    v
[Update lead.score on admission_leads] (⚠️ Column is `score`, also updates `score_category` and `score_updated_at`)

BULK:
[calculateBulkScores(leadIds[])] --> Parallel batches of 10
[recalculateAllScores(institutionId)] --> All non-lost leads
```

### 2.5 Lead Assignment Workflow

**Route:** `/admission/assignment-rules`
**Service:** `AssignmentRulesService`
**Table:** `admission_assignment_rules`

```
[Admin defines assignment rule]
    |-- name, conditions (source, program, location)
    |-- assign_to: counselor_id
    |-- is_active: boolean
    |
    v
[New lead arrives matching conditions]
    |
    v
[Auto-assign counselor_id on lead record]
    |
    v
[Lead appears in counselor's queue]
```

### 2.6 Re-Engagement Workflow

**Route:** `/admission/re-engagement`
**Service:** `ReEngagementService`
**Tables:** `admission_leads`, `admission_drip_sequences`

```
[System identifies cold leads]
    |-- 14+ days since last activity
    |-- OR is_dormant = true
    |
    v
[Display cold leads dashboard]
    |-- Cold (14-30 days)
    |-- Very Cold (30-60 days)
    |-- Dormant (60+ days)
    |
    v
[User selects re-engagement action]
    |
    |--> [Mark as Hot]
    |      |-- is_hot_lead = true, is_dormant = false
    |      |-- Lead re-enters active pipeline
    |
    |--> [Start Drip Campaign]
           |-- Attach to re-engagement workflow
           |-- Automated message sequence begins
```

### 2.7 Feedback Collection Workflow (Lost Leads)

**Route:** `/admission/feedback`
**Service:** `FeedbackService`
**Table:** `admission_leads`

```
[Lead marked as lost/declined/withdrew]
    |-- is_lost = true, lost_at = timestamp
    |
    v
[Appears in feedback candidates list]
    |-- Filter by reason, date, stage lost at
    |
    v
[Counselor records feedback]
    |-- lost_reason: "fees too high" / "chose competitor" / etc.
    |-- Additional notes
    |
    v
[Stats aggregate for analysis]
    |-- Top lost reasons with percentages
    |-- Helps improve conversion strategy
```

---

## 3. Application Processing Workflows

### 3.1 Application Creation Workflow

**Route:** `/admission/applications`
**Service:** `ApplicationService.createApplicationFromLead()`
**Tables:** `admission_applications`, `admission_leads`, `admission_lead_stage_history`, `admission_lead_activities`

```
[Lead reaches qualification stage]
    |
    v
[Create Application from Lead]
    |
    |--> Generate application number (APP-YYYY-XXXXXX)
    |--> Create admission_applications record
    |      |-- lead_id, institution_id, application_number
    |      |-- status = 'draft'
    |
    |--> Advance lead stage to 'application_started'
    |--> Log stage history record
    |--> Log activity: "Application created"
    |
    v
[Application form available for completion]
```

### 3.2 Application Status Workflow

**Service:** `ApplicationService.updateStatus()`

```
Application Status Flow:

    draft --> submitted --> under_review --> [approved | rejected]
                |                              |
                |-- sets submitted_at          |-- approved leads to offer letter
                                               |-- rejected ends flow

    Additional statuses:
    - waitlisted (from under_review)
    - withdrawn (from any active status)
```

### 3.3 Document Verification Workflow

**Route:** `/admission/documents`
**Service:** `DocumentService`
**Tables:** `document_types`, `application_documents`

```
[Application submitted]
    |
    v
[System checks required documents per document_types]
    |
    v
[Student uploads documents]
    |-- Linked to application via application_id
    |-- Status = 'pending'
    |
    v
[Verification queue for admin]
    |-- getPendingDocuments() shows unverified docs
    |
    v
[Admin verifies each document]
    |
    |--> [Verified] --> status = 'verified'
    |
    |--> [Rejected] --> status = 'rejected', rejection_reason recorded
    |         |
    |         v
    |    [Student re-uploads]
    |
    v
[Document stats dashboard]
    |-- Pending / Verified / Rejected counts
    |-- Recent verifications list
```

### 3.4 Screening Exam Workflow

**Route:** `/admission/screening-exam`
**Service:** `ScreeningExamService`
**Table:** `screening_exams`

```
[Admin creates screening exam]
    |-- exam_name, exam_type, date, cutoff_score
    |-- Linked to application_id
    |-- status = 'scheduled'
    |
    v
[Exam conducted]
    |
    v
[Admin records scores]
    |-- score, status = 'completed'
    |-- qualified = score >= cutoff
    |
    v
[Stats: total, completed, qualified, avg score]
```

### 3.5 Interview & GD-PI Workflow

**Route:** `/admission/interviews`, `/admission/gd-pi`
**Service:** `InterviewService`
**Tables:** `interview_slots`, `interview_bookings`

```
[Admin creates interview slots]
    |-- date, time, type (personal/group/technical/panel)
    |-- program_id, mode (online/offline)
    |-- max_bookings capacity
    |
    v
[Candidates book interview slots]
    |-- interview_bookings record created
    |-- Linked to application_id and slot_id
    |
    v
[Interview conducted]
    |
    v
[Interviewer updates booking]
    |-- score, feedback, outcome (selected/rejected/waitlisted)
    |-- completed = true
    |
    v
[Stats: slots, capacity, booked, completed, avg score]
```

### 3.6 Merit List Workflow

**Route:** `/admission/merit-list`
**Service:** `MeritListService`
**Table:** `merit_lists`

```
[Admin creates merit list]
    |-- program_id, academic_year, category (general/SC/ST/OBC/etc.)
    |-- entries: [{candidate, score, rank, status}]
    |-- is_published = false
    |
    v
[Admin reviews and finalizes]
    |-- Update entries, adjust ranks
    |-- Status per entry: shortlisted / waitlisted / not_selected
    |
    v
[Publish merit list]
    |-- publishMeritList(id) --> is_published = true, published_at = now
    |-- Visible to candidates
    |
    v
[Stats: total candidates, shortlisted, waitlisted, avg score]
```

### 3.7 Offer Letter Workflow

**Route:** `/admission/offer-letter`
**Service:** `OfferLetterService`
**Table:** `offer_letters`

```
[Application approved + Merit list published]
    |
    v
[Create Offer Letter]
    |-- application_id, program, conditions
    |-- valid_until (deadline)
    |-- response = 'pending'
    |
    v
[Send to candidate]
    |
    v
[Candidate responds]
    |
    |--> [Accepted] --> response = 'accepted'
    |      |
    |      v
    |    [Proceed to seat confirmation]
    |
    |--> [Declined] --> response = 'declined', decline notes
    |
    |--> [No response by deadline]
           |
           |--> [Send reminder] --> recordReminder() increments count
           |
           |--> [Extend deadline] --> extendDeadline(id, newDate)
           |
           |--> [Expire] --> response = 'expired'

[Stats: total, pending, accepted, declined, expired, acceptance_rate]
```

### 3.8 Scholarship Workflow

**Route:** `/admission/scholarships`
**Service:** `ScholarshipService`
**Tables:** `scholarships`, `scholarship_applications`

```
[Admin creates scholarship]
    |-- name, criteria, amount, quota
    |-- institution_id
    |
    v
[Students apply for scholarship]
    |-- scholarship_application record
    |-- status = 'pending'
    |
    v
[Admin reviews applications]
    |
    |--> [Approve] --> status = 'approved', reviewed_by, scholarship_amount
    |
    |--> [Reject] --> status = 'rejected', reviewed_by

[Stats: total scholarships, applications count, awarded count]
```

### 3.9 Lateral Entry / Branch Transfer Workflow

**Route:** `/admission/lateral-entry`
**Service:** `LateralEntryService`
**Tables:** `lateral_entry_applications`, `lateral_entry_documents`, `lateral_entry_eligibility_rules`, `lateral_entry_vacancies`

```
[Admin configures eligibility rules + vacancies]
    |
    v
[Student applies for lateral entry / branch transfer]
    |-- Auto-generates LE-XXXXXX (lateral) or BT-XXXXXX (branch transfer)
    |-- status = 'pending'
    |
    v
[Student uploads required documents]
    |-- lateral_entry_documents table
    |
    v
[Admin reviews application]
    |
    |--> [Approve] --> status = 'approved', approved_at
    |      |
    |      v
    |    [Check vacancy availability]
    |
    |--> [Reject] --> status = 'rejected', rejection reason
    |
    |--> [Request more info] --> status = 'under_review'

[Stats: total, lateral count, branch transfer count, approved, pending]
```

---

## 4. Communication & Campaign Workflows

### 4.1 Communication Templates Workflow

**Route:** `/admission/templates`
**Service:** `CommunicationTemplatesService`
**Table:** `admission_communication_templates`

```
[Admin creates template]
    |-- channel: sms / email / whatsapp
    |-- subject, content (with {{variable}} placeholders)
    |-- is_active: boolean
    |
    v
[Template available for campaigns and manual sends]
    |-- Variables: {{first_name}}, {{program}}, {{institution}}, etc.
    |-- Toggle active/inactive
    |-- Filter by channel
```

### 4.2 SMS Campaign Workflow

**Service:** `SmsCampaignService`
**Table:** `admission_sms_logs`
**External:** MSG91 / Twilio APIs

```
[Select leads + Choose SMS template]
    |
    v
[sendSms(input)] or [sendBulkSms(messages[])]
    |
    |--> Resolve template variables with lead data
    |--> Send via MSG91/Twilio API
    |--> Log to admission_sms_logs
    |      |-- lead_id, phone, content, status, sent_at
    |
    v
[Campaign stats]
    |-- Total sent, delivered, failed
    |-- Date range filtering
```

### 4.3 WhatsApp Campaign Workflow

**Service:** `WhatsAppCampaignService`
**Table:** `admission_whatsapp_logs`

```
[Select leads + Choose WhatsApp template]
    |
    v
[sendCampaignMessage(input)]
    |
    |--> Format phone number (clean, add country code)
    |--> Resolve template variables
    |--> Create log record (status = 'pending')
    |--> Send message (currently simulated)
    |--> Update status to 'sent'
    |
    v
[Webhook handler for delivery status]
    |-- handleWebhook(payload) updates status
    |-- delivered / read / failed
    |
    v
[Bulk: sendBulkMessages()]
    |-- Sequential with 100ms delay between messages
    |
    v
[Campaign stats: sent, delivered, read, failed rates]
```

### 4.4 Drip Sequence Workflow

**Service:** `DripExecutorService`
**Tables:** `admission_drip_sequences`, `admission_drip_schedule`, `admission_drip_execution_logs`, `admission_workflows`

```
[Admin creates workflow with multiple steps]
    |-- Step 1: Send welcome SMS (Day 0)
    |-- Step 2: Send program info email (Day 3)
    |-- Step 3: Follow-up WhatsApp (Day 7)
    |-- Step 4: Final reminder (Day 14)
    |
    v
[Start drip for a lead]
    |
    v
[startDripSequence(input)]
    |-- Create admission_drip_sequences record (status = 'active')
    |-- Schedule ALL steps in admission_drip_schedule
    |-- Each step has scheduled_at = start + delay
    |
    v
[Background processor polls for pending steps]
    |-- getPendingSteps() via RPC
    |
    v
[For each pending step:]
    |
    |--> [Check conditions] --> checkConditions(leadId, conditions[])
    |      |-- Supports: equals, not_equals, contains, gt, lt, in
    |      |-- If conditions not met --> skip step
    |
    |--> [Execute step action]
    |      |-- Send SMS/WhatsApp/Email based on step type
    |
    |--> [Mark step executed via RPC]
    |--> [Log to admission_drip_execution_logs]
    |
    v
[Sequence lifecycle controls:]
    |
    |--> [Pause] --> pauseDrip(seqId)
    |      |-- sequence status = 'paused'
    |      |-- Pending steps reverted
    |
    |--> [Resume] --> resumeDrip(seqId)
    |      |-- Adjust schedules by pause duration
    |      |-- sequence status = 'active'
    |
    |--> [Skip Step] --> skipStep(seqId)
    |      |-- Mark current step 'skipped'
    |      |-- Advance to next or complete
    |
    |--> [Cancel] --> cancelDrip(seqId)
           |-- sequence status = 'cancelled'
           |-- Cancel all remaining scheduled steps
```

### 4.5 Campaign Monitoring Workflow

**Route:** `/admission/campaigns/monitoring`
**Service:** `CampaignMonitoringService`
**Tables:** `re_engagement_campaigns`, `admission_workflow_executions`
**Realtime:** Supabase subscriptions

```
[Dashboard displays real-time campaign metrics]
    |
    |--> [Campaign Stats]
    |      |-- Active, completed, paused campaign counts
    |      |-- Total messages sent, success rate
    |
    |--> [Delivery Metrics]
    |      |-- Sent, delivered, opened, clicked
    |      |-- Simulated read rate (60% of delivered)
    |
    |--> [Active Sequences Progress]
    |      |-- Per-sequence: steps completed / total
    |      |-- Progress percentage
    |
    |--> [Execution Logs]
    |      |-- Recent workflow executions with lead info
    |      |-- Status, timestamps
    |
    v
[Real-time updates via Supabase subscriptions]
    |-- Subscribes to re_engagement_campaigns changes
    |-- Subscribes to admission_workflow_executions changes
    |-- Auto-refreshes dashboard on changes
    |-- Returns cleanup function for unsubscribe
```

### 4.6 Campaign Step Processing Workflow

**Service:** `CampaignProcessorService`
**Tables:** `admission_campaign_step_queue`, `admission_campaign_logs`
**RPCs:** `get_pending_campaign_steps`, `mark_campaign_step_processed`

```
[Background job runs periodically]
    |
    v
[getPendingSteps(limit)]
    |-- Via RPC: fetch steps where status = 'pending'
    |
    v
[For each step:]
    |--> Execute action (send message, update lead, etc.)
    |--> markStepProcessed(stepId, result, error?)
    |      |-- Updates step status to 'processed' or 'failed'
    |--> Log to admission_campaign_logs
    |
    v
[Queue status monitoring]
    |-- getQueueStatus(institutionId)
    |-- Counts: pending, processing, completed, failed
```

### 4.7 Parent Communication Workflow

**Route:** `/admission/parent-communication`
**Service:** `ParentCommunicationService`
**Tables:** `admission_leads`, `admission_sms_logs`, `admission_whatsapp_logs`

```
[View leads with parent contact info]
    |-- parent_name, parent_phone, parent_email fields on leads
    |
    v
[Filter leads with/without parent info]
    |
    v
[Update parent info on lead]
    |-- updateParentInfo(leadId, parentData)
    |
    v
[View merged communication logs]
    |-- SMS + WhatsApp logs combined, sorted by date
    |
    v
[Stats: leads with parent info, recent communications count]
```

---

## 5. AI & Intelligence Workflows

### 5.1 AI Insights Generation Workflow

**Route:** `/admission/insights`
**Service:** `AIInsightsService`
**Table:** `admission_ai_insights`

```
[Trigger: Manual or scheduled]
    |
    v
[generateInsights(institutionId)]
    |
    |--> Fetch all leads for institution
    |--> Analyze patterns across leads
    |--> Generate 8 insight types:
    |      1. conversion_opportunity
    |      2. risk_alert
    |      3. trend_analysis
    |      4. performance_insight
    |      5. engagement_pattern
    |      6. source_effectiveness
    |      7. counselor_performance
    |      8. follow_up_recommendation
    |
    |--> Save insights to admission_ai_insights
    |
    v
[Dashboard displays:]
    |--> Recommendations (actionable next steps)
    |--> Trends (directional patterns)
    |--> Anomalies (unusual patterns)
    |
    v
[User can dismiss insights]
    |-- dismissInsight(insightId) with user tracking
```

### 5.2 AI Response Suggestions Workflow

**Service:** `AIResponseService`
**External:** Anthropic Claude API (claude-3-5-haiku)

```
[Counselor viewing lead, wants to send message]
    |
    v
[getSuggestedReplies(leadId, channel, leadContext)]
    |
    |--> Determine intent from lead stage
    |      |-- new/contacted: initial outreach
    |      |-- engaged: information sharing
    |      |-- qualified: application encouragement
    |      |-- offered: acceptance encouragement
    |
    |--> Call Claude API with context
    |--> Generate 3 response suggestions
    |      |-- Each has: tone, content, intent
    |
    v
[Counselor selects/edits suggestion]
    |
    v
[personalizeTemplate(input)]
    |-- Replace {{variables}} with actual lead data
    |
    v
[Send via SMS/WhatsApp/Email]
```

### 5.3 Daily Briefing Workflow

**Route:** `/admission/briefing`
**Services:** `DailyBriefingService`, `BriefingDeliveryService`
**Tables:** `admission_daily_briefings`, `admission_briefings`, `admission_briefing_notifications`

```
GENERATION:
[Trigger: Daily schedule or manual]
    |
    v
[generateBriefing(userId, institutionId, role, date)]
    |
    |--> Analyze yesterday's activities
    |--> Count new leads, stage changes
    |--> Identify top-performing counselors
    |--> Summarize follow-up due today
    |--> Generate personalized briefing content
    |
    v
[Save to admission_daily_briefings]

DELIVERY:
[createBriefing(input)]
    |-- status = 'published'
    |
    v
[deliverBriefing(briefingId, userIds)]   OR
[deliverBriefingToTeam(briefingId, institutionId)]
    |
    |--> Create notification for each recipient
    |--> admission_briefing_notifications record per user
    |
    v
[User sees notification banner]
    |-- briefing-notification-banner.tsx
    |-- briefing-popup.tsx for full content
    |
    v
[User interactions:]
    |--> markNotificationRead(notificationId)
    |--> markAllNotificationsRead(userId)
    |--> dismissNotification(notificationId)
    |
    v
[Unread count badge in UI]
    |-- getUnreadBriefingCount(userId)
```

### 5.4 Agentic Query Workflow (Natural Language)

**Route:** `/admission/insights` (query panel)
**Service:** `AgenticQueryService`
**External:** Anthropic Claude API
**Table:** `admission_query_history`

```
[User types natural language question]
    |-- e.g., "How many leads converted last week?"
    |
    v
[processQuery(query, institutionId, onProgress)]  -- 5-step pipeline
    |
    |--> Step 1: parseQueryIntent(query)
    |      |-- AI extracts: entity, filters, aggregation, sort, limit
    |      |-- e.g., {entity: 'leads', filters: [{field: 'funnel_stage', op: 'eq', value: 'enrolled'}]}
    |
    |--> Step 2: buildDatabaseQuery(intent, institutionId)
    |      |-- Convert intent to Supabase query object
    |
    |--> Step 3: executeQuery(dbQuery)
    |      |-- Run actual database query
    |
    |--> Step 4: formatResponse(data, query, intent)
    |      |-- AI generates natural language summary
    |      |-- Includes data table + explanation
    |
    |--> Step 5: Save to query history
    |
    v
[Display formatted response with data]
    |
    v
[Query history available for review]
    |-- getQueryHistory(userId, institutionId, limit)
    |-- Suggested queries provided
```

### 5.5 Admission AI Dashboard Insights Workflow

**Service:** `AdmissionAIService`
**External:** Anthropic Claude API

```
[Dashboard loads with analytics data]
    |
    v
[generateInsights(analyticsData)]
    |
    |--> Send dashboard metrics to Claude
    |--> AI analyzes: conversion rates, trends, bottlenecks
    |--> Returns comprehensive AI insights
    |      |-- Key observations
    |      |-- Recommendations
    |      |-- Risk areas
    |
    v
[Display AI insights panel on dashboard]
```

### 5.6 Insight-Driven Actions Workflow

**Service:** `InsightActionsService`
**Tables:** `admission_action_executions`, multiple action-specific tables

```
[AI Insight generated with recommendation]
    |
    v
[11 available action types:]
    1. send_email       - Send email to lead(s)
    2. send_sms         - Send SMS to lead(s)
    3. send_whatsapp    - Send WhatsApp message
    4. assign_counselor - Assign/reassign counselor
    5. update_stage     - Move lead to new stage
    6. schedule_followup - Set follow-up date
    7. add_tag          - Tag leads for segmentation
    8. start_drip       - Enroll in drip sequence
    9. export_list      - Export leads to CSV (Supabase storage)
    10. create_task     - Create follow-up task
    11. bulk_update     - Mass update lead fields
    |
    v
[executeAction(actionType, leadId, params, context)]
    |
    |--> Create execution record (status = 'executing')
    |--> Execute the specific action
    |--> Track result (success/failure)
    |--> Update execution record
    |
    v
[executeBulkAction(actionType, leadIds[], params)]
    |-- Process each lead with tracking
    |-- Returns: {total, successful, failed, results[]}
    |
    v
[Action history: getActionHistory(filters)]
    |-- View past executions with status
    |-- Cancel pending executions
```

---

## 6. Consultant Management Workflows

### 6.1 Consultant Lifecycle Workflow

**Route:** `/admission/consultants`
**Service:** `ConsultantService`
**Table:** `education_consultants`

```
[Create Consultant]
    |-- name, email, phone, type (individual/agency)
    |-- commission_rate, region, specialization
    |
    v
[Consultant refers leads]
    |-- Leads created with source = consultant
    |-- Linked via consultant_id
    |
    v
[Track performance]
    |-- Referred leads count
    |-- Conversion rate
    |-- Revenue generated
```

### 6.2 Commission Workflow

**Route:** `/admission/consultants/commissions`
**Service:** `ConsultantService.getCommissions() / createCommission()`
**Table:** `consultant_commissions`

```
[Lead referred by consultant converts]
    |
    v
[Create commission record]
    |-- consultant_id, lead_id, amount, status
    |
    v
[Commission appears in consultant's ledger]
    |
    v
[Process payout]
    |-- createPayout(input)
    |-- consultant_payouts record
    |-- Links to commission records
```

### 6.3 Consultant Portal Access Workflow

**Service:** `ConsultantService.getPortalAccess() / updatePortalAccess()`
**Table:** `consultant_portal_access`

```
[Admin configures portal access]
    |-- consultant_id
    |-- is_active, permissions, access_level
    |
    v
[Consultant logs into portal]
    |-- Views referred leads status
    |-- Sees commission summary
    |-- Dashboard stats via getDashboardStats()
```

### 6.4 Consultant Commission Transaction Workflow

**Service:** `ConsultantService.getCommissionTransactions() / createCommissionTransaction() / updateCommissionTransactionStatus()`
**Table:** `consultant_commission_transactions`

```
[Lead referred by consultant converts to enrolled]
    |
    v
[Create commission transaction]
    |-- consultant_id, lead_id, institution_id
    |-- commission_amount, commission_rate
    |-- transaction_type: 'referral' / 'bonus' / 'adjustment'
    |-- status = 'pending'
    |
    v
[Admin reviews transaction]
    |
    |--> [Approve] --> status = 'approved'
    |      |-- Sets approved_by, approved_at
    |      |-- Marks for payout
    |
    |--> [Reject] --> status = 'rejected'
    |      |-- reason recorded
    |
    |--> [Paid] --> status = 'paid'
    |      |-- Payment processed
    |
    v
[Clawback (if lead cancels enrollment)]
    |-- processClawback(id, processedBy, reason)
    |-- status = 'clawed_back'
    |-- clawback_reason, clawback_at recorded
    |-- Consultant totals recalculated
```

### 6.5 Consultant Referral Rewards Workflow

**Route:** `/admission/consultants/rewards`
**Service:** `ConsultantService` (reward methods)
**Tables:** `referral_reward_configs`, `referral_rewards`

```
CONFIGURATION:
[Admin creates reward config]
    |-- name, reward_type, reward_value, description
    |-- eligibility criteria, milestones
    |-- is_active: boolean
    |
    v
[Toggle active/inactive]
    |-- toggleRewardConfigActive()
    |-- Multiple configs can be active simultaneously

REWARD LIFECYCLE:
[Lead reaches milestone (e.g., enrolled)]
    |
    v
[createReward()]
    |-- consultant_id, reward_config_id, lead_id
    |-- reward_type, reward_value
    |-- status = 'pending'
    |
    v
[Admin reviews reward]
    |
    |--> [Approve] --> approveReward(id, approvedBy)
    |      |-- status = 'approved'
    |      |-- approved_by, approved_at
    |
    |--> [Reject] --> rejectReward(id, rejectedBy, reason)
    |      |-- status = 'rejected'
    |      |-- rejection_reason
    |
    v
[Consultant redeems approved reward]
    |-- redeemReward(id, redeemedBy)
    |-- status = 'redeemed'
    |-- redeemed_at
    |
    v
[Auto-expire unclaimed rewards]
    |-- expireReward(id)
    |-- status = 'expired'

[Stats: totalRewards, pending, approved, redeemed, totalValuePending, totalValueRedeemed]
```

### 6.6 Consultant Portal Lead Submission Workflow

**Service:** `ConsultantService.submitLeadFromPortal()`
**Tables:** `admission_leads`, `consultant_lead_attributions`

```
[Consultant logs into portal]
    |
    v
[Submits new lead referral]
    |-- full_name, phone, email, interested_programs (⚠️ DB column is `interested_programs`, NOT `program_interest`)
    |-- referral_code
    |
    v
[submitLeadFromPortal(input)]
    |
    |--> Create lead in admission_leads
    |      |-- source = 'referral'
    |      |-- funnel_stage = 'new'
    |      |-- is_priority = true
    |
    |--> Create attribution record
    |      |-- consultant_lead_attributions
    |      |-- attribution_type = 'primary'
    |      |-- attribution_percentage = 100%
    |
    |--> Increment consultant lead count (RPC)
    |
    v
[Lead enters admission pipeline]
    |-- Linked to consultant for commission tracking
    |-- Duplicate phone check (error if exists)
```

### 6.7 Lead Attribution & Source Performance Workflow

**Service:** `ConsultantService` (attribution methods) + hooks: `useLeadAttributions`, `useSourcePerformance`
**Table:** `consultant_lead_attributions`

```
[Track which consultant referred which lead]
    |
    v
[Attribution records link:]
    |-- consultant_id <-> lead_id
    |-- attribution_type: primary / secondary
    |-- attribution_percentage: 0-100%
    |
    v
[Source Performance Dashboard]
    |-- useSourcePerformance(institutionId)
    |-- Conversion rates per consultant
    |-- Revenue attribution
    |-- ROI analysis per consultant
```

### 6.8 Bulk Consultant Import Workflow

**API:** `/api/admission/consultants/import`

```
[Admin downloads template]
    |-- /api/admission/consultants/template
    |
    v
[Admin fills CSV/Excel with consultant data]
    |
    v
[Upload to /api/admission/consultants/import]
    |-- Parse file
    |-- Validate records
    |-- Bulk create consultants
    |-- Return success/error report
```

---

## 7. Post-Decision Workflows

### 7.1 Seat Confirmation & Payment Workflow

**Route:** `/admission/seat-confirmation`
**Service:** `SeatConfirmationService`
**Table:** `admission_payments`

```
[Offer accepted by candidate]
    |
    v
[Record payment]
    |-- recordPayment(input)
    |-- Auto-generate receipt number
    |-- payment_method: cash/cheque/dd/online/upi
    |-- amount, transaction_reference
    |-- status = 'completed'
    |
    v
[Payment appears in seat confirmation dashboard]
    |
    v
[Stats: collected, pending, refund amounts, method breakdown]

REFUND:
[Student withdraws after payment]
    |
    v
[processRefund(input)]
    |-- status = 'refund_pending'
    |-- refund_amount, refund_reason
    |
    v
[Admin processes actual refund]
```

### 7.2 Hostel Allocation Workflow

**Route:** `/admission/hostels`
**Service:** `HostelService`
**Tables:** `hostels`, `hostel_rooms`, `hostel_beds`, `hostel_allocations`, `hostel_allocation_requests`
**Views:** `hostel_occupancy_summary`, `hostel_room_availability`

```
[Student requests hostel accommodation]
    |
    v
[Create allocation request]
    |-- hostel_allocation_requests (status = 'pending')
    |
    v
[Admin checks availability]
    |-- getRoomAvailability(institutionId, hostelId)
    |-- Uses hostel_room_availability view
    |
    v
[Admin allocates room]
    |
    |--> [Room available]
    |      |-- allocateRoom(params) --> hostel_allocations
    |      |-- status = 'allocated'
    |      |-- Updates occupancy counts
    |
    |--> [Room not available]
           |-- updateWaitlistStatus(id, 'waitlisted')
           |-- Student enters waitlist queue
    |
    v
[Hostel dashboard]
    |-- Occupancy summary per hostel
    |-- Room availability grid
    |-- Waitlist management
```

### 7.3 Admission-to-Student Conversion Workflow

**Service:** `AdmissionService.updateAdmissionStatus()` --> `createStudentFromAdmission()`
**Tables:** `admissions`, `students`, `profiles`

```
[Admission status updated to 'approved']
    |
    v
[Auto-trigger: createStudentFromAdmission(admissionId)]
    |
    |--> Fetch admission record
    |--> Create student record in students table
    |--> Link to profile in profiles table
    |--> Student now appears in student management module
    |
    v
[Student lifecycle begins in other modules]
    |-- Academic enrollment
    |-- Billing setup
    |-- Attendance tracking
```

---

## 8. Automation, Rules & Configuration Workflows

### 8.1 Workflow Automation Engine

**Route:** `/admission/workflows`
**Service:** `WorkflowsService`
**Tables:** `admission_workflows`, `admission_workflow_executions`

```
[Admin creates workflow]
    |-- name, trigger_type, trigger_conditions
    |-- actions: [{type, config}]
    |-- is_active: boolean
    |
    v
[Trigger types:]
    |-- stage_change: When lead moves to specific stage
    |-- lead_created: When new lead arrives
    |-- score_threshold: When score crosses threshold
    |-- inactivity: When lead inactive for X days
    |-- custom: Custom trigger conditions
    |
    v
[Action types:]
    |-- send_email, send_sms, send_whatsapp
    |-- assign_counselor
    |-- update_stage
    |-- start_drip_sequence
    |-- create_task
    |-- add_tag
    |
    v
[When trigger fires:]
    |--> Create workflow execution record
    |--> Execute each action in sequence
    |--> Log execution status and result
    |
    v
[Execution history: getExecutions(workflowId)]
    |-- Filter by status, date range
```

### 8.2 Workflow Configuration Workflow

**Route:** `/admission/workflow-config`
**Service:** `WorkflowConfigService`
**Table:** `admission_workflow_configs`

```
[Admin configures admission workflow for academic year]
    |-- institution_id, academic_year
    |-- Configuration: stages, required documents, deadlines
    |-- Only one active config per institution+year
    |
    v
[upsertConfig(config)]
    |-- Creates new or updates existing
    |
    v
[Active config determines admission process]
    |-- Which stages are required
    |-- Document requirements
    |-- Deadline settings
```

### 8.3 Follow-Up Reminders Workflow

**Route:** `/admission/reminders`
**Data:** Lead follow-up dates, system-generated reminders

```
[Reminder types:]
    |-- scheduled: Manual follow-up date set by counselor
    |-- no_response: Auto-generated when lead doesn't respond
    |-- stage_based: Triggered by stage duration thresholds
    |-- manual: Ad-hoc reminder created by user
    |
    v
[Reminder states:]
    |-- pending: Due for action
    |-- completed: Action taken
    |-- snoozed: Postponed to later
    |-- dismissed: Ignored/cancelled
    |
    v
[Dashboard shows:]
    |-- Overdue reminders (past due date)
    |-- Today's reminders
    |-- Tomorrow's reminders
    |-- Upcoming (next 7 days)
    |
    v
[Actions per reminder:]
    |-- Call lead (logs call activity)
    |-- Send WhatsApp message
    |-- Send email
    |-- Snooze (postpone to specific date)
    |-- Complete (mark as done)
    |-- Dismiss (cancel reminder)
    |
    v
[Priority levels: high / medium / low]
    |-- Based on lead score, stage, and time overdue
```

### 8.4 Communication Frequency Settings Workflow

**Route:** `/admission/settings`
**Table:** `admission_communication_settings` (via Supabase)

```
[Admin configures per-channel frequency limits]
    |
    |--> [WhatsApp Settings]
    |      |-- enabled: boolean
    |      |-- maxPerDay: 5 (default)
    |      |-- maxPerWeek: 20
    |      |-- cooldownMinutes: 60 (min time between messages)
    |      |-- allowedHoursStart: 9
    |      |-- allowedHoursEnd: 18
    |      |-- weekendEnabled: false
    |
    |--> [SMS Settings]
    |      |-- Same structure as WhatsApp
    |
    |--> [Email Settings]
    |      |-- Same structure as WhatsApp
    |
    |--> [Global Limits]
    |      |-- globalDailyLimit: max across all channels
    |      |-- globalWeeklyLimit: max across all channels
    |      |-- enforceQuietHours: boolean
    |      |-- quietHoursStart/End: DND times
    |      |-- blockDuplicateContent: prevent same message twice
    |      |-- minContentInterval: min hours between same content
    |
    v
[System enforces limits before sending any communication]
    |-- Checks per-channel limits
    |-- Checks global limits
    |-- Checks quiet hours
    |-- Blocks duplicate content within interval
```

### 8.5 AI Chatbot & FAQ Management Workflow

**Route:** `/admission/chatbot`
**Features:** FAQ management, live conversation monitoring, bot training, escalation handling

```
CHATBOT OVERVIEW:
[24/7 automated lead engagement]
    |
    |--> [Channels: WhatsApp, Website Widget, Email]
    |
    |--> [Metrics:]
    |      |-- Total conversations
    |      |-- Auto-resolved rate (without human)
    |      |-- Average response time (< 5 sec)
    |      |-- Satisfaction rate
    |      |-- Escalation rate
    |
    v
FAQ MANAGEMENT:
[Admin creates FAQ entries]
    |-- question, answer, category
    |-- Categories: admissions, fees, facilities, scholarships, placements
    |-- Track: views, helpfulness rating
    |-- Status: active / inactive
    |
    v
[CRUD operations: Add, Edit, Delete FAQs]
[Search across FAQ library]

LIVE CONVERSATIONS:
[Monitor active bot conversations]
    |
    |--> [Active] -- Bot handling, no issue
    |
    |--> [Escalated] -- Bot failed, needs human
    |      |-- Assigned to specific counselor
    |      |-- "Take Over" button for manual intervention
    |
    |--> [Resolved] -- Conversation completed
    |
    v
[Sentiment analysis per conversation]
    |-- Positive / Negative / Neutral
    |-- Helps prioritize escalations

BOT TRAINING:
[Improve bot responses]
    |
    |--> [Upload Training Data]
    |      |-- CSV with question-answer pairs
    |
    |--> [Review Conversation Logs]
    |      |-- Identify where bot failed
    |      |-- Add missing Q&A pairs
    |
    |--> [Bot Personality Config]
    |      |-- Bot name, greeting message
    |      |-- Escalation trigger threshold
    |      |-- (e.g., escalate after 3 failed responses)
```

### 8.6 Publishers Management Workflow

**Route:** `/admission/publishers`
**Hook:** `usePublishers()` (from use-data-quality.ts)
**Data:** Publishers are stored as consultants with type='publisher'

```
[Admin adds publisher/advertising partner]
    |-- name, contact person, email, phone
    |-- Stored as education_consultant with type indicator
    |
    v
[Publisher generates leads via tracking links]
    |-- Each publisher has unique tracking link/API key
    |-- Leads arrive with source attribution
    |
    v
[Dashboard tracks per publisher:]
    |-- Total leads referred
    |-- Conversion rate
    |-- Performance rating (excellent/good/average/poor)
    |-- Pending commission amount
    |
    v
[Commission payouts]
    |-- Track pending vs paid commissions
    |-- Batch process payouts
    |
    v
[Stats: total leads, total conversions, avg conversion rate, pending payouts]
```

### 8.7 Education Loan Coordination Workflow

**Route:** `/admission/loans`
**Data:** Mock/planned feature (uses local state, no service yet)

```
[Loan management dashboard - PLANNED]
    |
    |--> [Bank Partner Management]
    |      |-- Partner banks with loan products
    |      |-- Interest rates, max amounts, terms
    |
    |--> [Loan Applications]
    |      |-- Status: applied, docs_pending, under_review,
    |      |          sanctioned, disbursed, rejected
    |      |-- Linked to admission application
    |
    |--> [EMI Calculator]
    |      |-- Loan amount, tenure, interest rate
    |      |-- Monthly EMI calculation
    |
    |--> [Loan Statistics]
           |-- Total applications, sanctioned amount
           |-- Bank-wise distribution
           |-- Average loan amount
```

### 8.8 Public Application Form Workflow

**Route:** `/admission/apply`
**Multi-step form** (public-facing, no auth required)

```
[Candidate accesses application URL]
    |
    v
Step 1: PERSONAL INFORMATION
    |-- firstName, lastName, dateOfBirth, gender
    |-- email, phone, alternatePhone
    |-- address, city, state, pincode, nationality
    |-- category (general/SC/ST/OBC), religion
    |-- Parent/Guardian details:
    |      |-- Father: name, occupation, phone
    |      |-- Mother: name, occupation, phone
    |      |-- Guardian: name, phone, relation
    |      |-- Annual income
    |
    v
Step 2: ACADEMIC HISTORY
    |-- 10th, 12th, UG details
    |-- Marks, board/university, year
    |-- Entrance exam scores
    |
    v
Step 3: PROGRAM SELECTION
    |-- Choose institution
    |-- Choose program
    |-- Choose batch/semester
    |
    v
Step 4: DOCUMENT UPLOAD
    |-- Photo, 10th marksheet, 12th marksheet
    |-- Transfer certificate, community certificate
    |-- Aadhar card, other certificates
    |
    v
Step 5: REVIEW & SUBMIT
    |-- Review all entered data
    |-- Declaration checkbox
    |-- Submit application
    |
    v
[Application created with status 'submitted']
[Application number generated: APP-YYYY-XXXXXX]
[Lead stage advanced to 'application_submitted']
```

### 8.9 GD-PI (Group Discussion & Personal Interview) Workflow

**Route:** `/admission/gd-pi`
**Service:** Uses `InterviewService` (shared with interviews)
**Tables:** `interview_slots`, `interview_bookings`

```
GROUP DISCUSSION:
[Admin creates GD session]
    |-- topic, date, time, duration, venue
    |-- program, max participants
    |-- evaluators assigned
    |-- status = 'scheduled'
    |
    v
[Participants assigned to session]
    |
    v
[GD conducted]
    |-- status = 'in-progress'
    |
    v
[Evaluators score each participant]
    |-- Criteria scoring:
    |      |-- Communication (0-10)
    |      |-- Content & Knowledge (0-10)
    |      |-- Leadership (0-10)
    |      |-- Body Language (0-10)
    |      |-- Teamwork (0-10)
    |-- Total score + remarks
    |
    v
[Session completed]
    |-- status = 'completed'
    |-- All participants scored

PERSONAL INTERVIEW (PI):
[Follows same interview slot/booking workflow as section 3.5]
    |-- Type = 'personal' instead of 'group'
    |-- One-on-one evaluation
    |-- Score + feedback + outcome

COMBINED GD-PI FLOW:
[GD round] --> Pass --> [PI round] --> Pass --> [Merit List consideration]
                |                        |
                v                        v
            [Eliminated]            [Eliminated]
```

### 8.10 Analytics Dashboard Workflow

**Route:** `/admission/analytics`
**Hooks:** `useAdmissionDashboard`, `useFunnelHistory`, `useCounselorPerformance`, `useSourcePerformance`, `useFunnelAnalyticsDashboard`

```
[Comprehensive analytics dashboard]
    |
    |--> Tab 1: FUNNEL ANALYTICS
    |      |-- Stage-wise lead counts
    |      |-- Conversion rates between stages
    |      |-- Drop-off points visualization
    |      |-- Historical funnel comparison
    |
    |--> Tab 2: COUNSELOR PERFORMANCE
    |      |-- Per-counselor metrics:
    |      |      |-- Leads assigned, contacted, converted
    |      |      |-- Response time, follow-up adherence
    |      |      |-- Conversion rate ranking
    |      |-- Date range filtering
    |
    |--> Tab 3: SOURCE PERFORMANCE
    |      |-- Per-source: leads, conversions, cost
    |      |-- ROI analysis (useSourceROI hook)
    |      |-- Channel effectiveness comparison
    |
    |--> Tab 4: TRENDS
           |-- Week-over-week comparisons
           |-- Seasonal patterns
           |-- Target vs actual tracking
```

---

## 9. Data Quality & Compliance Workflows

### 9.1 Data Quality Profiling Workflow

**Route:** `/admission/data-profiling`
**Service:** `DataQualityService`
**Table:** `admission_leads`

```
[Dashboard displays data health metrics]
    |
    |--> [Overall Completeness]
    |      |-- getDataProfilingMetrics()
    |      |-- Checks 10 fields: name, email, phone, source,
    |      |-- interested_programs, location, gender, dob, address, parent_info
    |      |-- Returns: completeness %, validity %, overall score
    |
    |--> [Field-by-Field Analysis]
    |      |-- getFieldAnalysis()
    |      |-- Per field: filled count, valid count, status (good/warning/critical)
    |
    |--> [Data Issues List]
    |      |-- getDataIssues()
    |      |-- Categories: missing_data, invalid_data, outdated_data
    |      |-- Severity: critical, warning, info
    |
    |--> [Deduplication Stats]
           |-- getDeduplicationStats()
           |-- Groups by email (95% confidence) then phone (90%)
           |-- Returns duplicate group counts
```

### 9.2 Phone Validation Workflow

**Route:** `/admission/phone-validation`
**Service:** `DataQualityService`

```
[Dashboard shows phone data health]
    |
    |--> [Validation Stats]
    |      |-- getPhoneValidationStats()
    |      |-- Valid / Invalid / Missing counts
    |
    |--> [Invalid Phone Records]
    |      |-- getInvalidPhones()
    |      |-- Issues: too_short, too_long, invalid_chars, missing
    |
    |--> [Issue Breakdown]
           |-- getPhoneIssueBreakdown()
           |-- Distribution of issue types
```

### 9.3 Deduplication Workflow

**Route:** `/admission/deduplication`
**Service:** `DataQualityService.findDuplicates()`

```
[System scans for duplicates]
    |
    |--> Match by email (95% confidence)
    |--> Match by phone (90% confidence)
    |
    v
[Display duplicate groups]
    |-- Each group: list of matching leads
    |-- Confidence level
    |
    v
[Admin merges duplicates]
    |-- Select primary record
    |-- Merge data from secondary records
    |-- Delete duplicates
```

### 9.4 Source Tracking Workflow

**Route:** `/admission/sources`
**Service:** `SourceTrackingService`
**Table:** `admission_leads`

```
[Analyze lead sources]
    |
    v
[getSourceBreakdown(institutionId)]
    |-- Per source: lead count, conversion rate
    |-- Sources: website, referral, social_media, walk_in, consultant, etc.
    |
    v
[getSourceStats()]
    |-- Total leads, unique sources
    |-- Attribution rate (leads with known source / total)
    |-- Top performing source
    |
    v
[Informs marketing spend decisions]
```

### 9.5 TQM Metrics Workflow

**Service:** `AdmissionTQMMetricsService`
**View:** `admission_process_metrics`
**RPC:** `get_admission_stage_durations`

```
[Quality metrics dashboard]
    |
    |--> [Current vs Previous Month]
    |      |-- Application processing time
    |      |-- Lead response time
    |      |-- Conversion rate
    |      |-- Dropout rate
    |
    |--> [Stage Duration Analysis]
    |      |-- Average time spent at each funnel stage
    |      |-- Bottleneck identification
    |
    |--> [Cost of Poor Quality (COPQ)]
           |-- From billing_copq_incidents table
           |-- Quality failures in admission process
```

### 9.6 NAAC Report Generation Workflow

**Service:** `NAACReportService`
**Tables:** `institutions`, `institution_seat_config`, `admission_leads`

```
[NAAC accreditation requirement: Criteria 2.1.1]
    |
    v
[generateEnrollmentReport(institutionId, years)]
    |
    |--> Fetch institution(s)
    |--> Get seat configuration per program
    |--> Count admissions per year from leads (enrolled stage)
    |--> Calculate fill rates
    |
    v
[Output: Structured NAAC report]
    |-- Per program per year: seats sanctioned, students admitted, fill %
    |-- Institution averages
    |-- Multi-year trends
```

---

## 10. Administrative & Configuration Workflows

### 10.1 Status Tracking Dashboard Workflow

**Route:** `/admission/status`
**Service:** `StatusTrackingService`
**Tables:** `admission_applications`, `admission_campaign_logs`

```
[Application pipeline dashboard]
    |
    |--> [Pipeline Stats]
    |      |-- Count by status: draft, submitted, under_review,
    |      |-- approved, rejected, enrolled
    |
    |--> [Application List with Lead Info]
    |      |-- Filter by status, search by name
    |      |-- Each entry shows lead details
    |
    |--> [Recent Activity Log]
           |-- Recent campaign logs
           |-- Shows what's happening across applications
```

### 10.2 Group Dashboard Workflow (Multi-Campus)

**Route:** `/admission/group-dashboard`
**Service:** `GroupDashboardService`
**Tables:** `institutions`, `admission_leads`, `institution_seat_config`
**RPC:** `find_cross_campus_duplicates`

```
[Group-level overview across all institutions]
    |
    |--> [Per-Institution Metrics]
    |      |-- Leads, applications, enrolled counts
    |      |-- Seat utilization vs capacity
    |
    |--> [Cross-Campus Totals]
    |      |-- Aggregate KPIs
    |
    |--> [Cross-Campus Duplicate Detection]
           |-- findCrossCampusDuplicates()
           |-- Leads appearing in multiple institutions
           |-- Via RPC with fallback to manual query
```

---

## 11. Cross-Cutting Workflows

### 11.1 Activity Logging Workflow (Pervasive)

**Service:** `ActivityService`
**Tables:** `admission_lead_activities`, `admission_lead_stage_history`

Every significant action logs an activity:

```
Activity Types:
    |-- note: Manual note added
    |-- call: Phone call logged
    |-- email: Email sent
    |-- sms: SMS sent
    |-- whatsapp: WhatsApp message sent
    |-- meeting: Meeting scheduled/completed
    |-- stage_change: Funnel stage transition
    |-- document: Document uploaded/verified
    |-- payment: Payment recorded
    |-- system: Automated system action
    |
    v
[Each activity record contains:]
    |-- lead_id, type, description
    |-- created_by, created_at
    |-- metadata (JSON for extra context)
    |
    v
[Stage history is separate table:]
    |-- lead_id, from_stage, to_stage
    |-- changed_by, changed_at
    |-- duration_in_stage (calculated)
```

### 11.2 Enrollment Analytics Workflow

**Service:** `AdmissionService.getEnrollmentAnalytics()`
**RPC:** `get_combined_enrollment_analytics`

```
[Dashboard analytics panel]
    |
    v
[RPC call combines multiple data sources]
    |-- Total applications
    |-- Conversion funnel
    |-- Stage-wise distribution
    |-- Time-series trends
    |-- Source attribution
    |
    v
[Visualized on admission dashboard]
```

### 11.3 Real-Time Notification Workflow

Multiple services use Supabase Realtime subscriptions:

```
[Campaign Monitoring] -- subscribes to re_engagement_campaigns
[Campaign Monitoring] -- subscribes to admission_workflow_executions
    |
    v
[On database change event]
    |-- INSERT / UPDATE / DELETE
    |
    v
[Callback fires with new data]
    |-- UI auto-refreshes relevant dashboard
    |
    v
[Cleanup on component unmount]
    |-- Unsubscribe from channels
```

---

## 12. Service-to-Table Mapping

### Core Tables

| Table | Primary Services | Purpose |
|-------|-----------------|---------|
| `admission_leads` | LeadService, CounselorDailyView, ReEngagement, Feedback, DataQuality, SourceTracking, AIInsights, DailyBriefing, LeadScoringEngine, AgenticQuery, InsightActions, ParentComm, GroupDashboard, NAAC | Central lead record |
| `admission_applications` | ApplicationService, StatusTracking, OfferLetter, SeatConfirmation, Interview, ScreeningExam, DocumentService | Application processing |
| `admissions` | AdmissionService, AgenticQuery | Final admission records |
| `admission_lead_activities` | ActivityService, CounselorDailyView, DailyBriefing, InsightActions | Activity timeline |
| `admission_lead_stage_history` | ActivityService, ApplicationService, CounselorDailyView, DailyBriefing, InsightActions | Stage change audit trail |

### Scoring & Rules

| Table | Service | Purpose |
|-------|---------|---------|
| `admission_lead_scores` | LeadScoringEngine | Calculated lead scores |
| `admission_scoring_rules` | ScoringRulesService | Score calculation config |
| `admission_assignment_rules` | AssignmentRulesService | Auto-assignment config |

### Communication

| Table | Service | Purpose |
|-------|---------|---------|
| `admission_communication_templates` | CommunicationTemplatesService | Message templates |
| `admission_sms_logs` | SmsCampaignService, ParentComm | SMS delivery records |
| `admission_whatsapp_logs` | WhatsAppCampaignService, ParentComm | WhatsApp delivery records |

### Campaigns & Automation

| Table | Service | Purpose |
|-------|---------|---------|
| `admission_workflows` | WorkflowsService, DripExecutor, CampaignMonitoring | Workflow definitions |
| `admission_workflow_executions` | WorkflowsService, CampaignMonitoring | Execution records |
| `admission_workflow_configs` | WorkflowConfigService | Process configuration |
| `admission_drip_sequences` | DripExecutor, ReEngagement, InsightActions | Drip campaign instances |
| `admission_drip_schedule` | DripExecutor | Scheduled drip steps |
| `admission_drip_execution_logs` | DripExecutor | Drip execution audit |
| `admission_campaign_step_queue` | CampaignProcessor, InsightActions | Campaign step queue |
| `admission_campaign_logs` | CampaignProcessor, StatusTracking | Campaign execution logs |
| `re_engagement_campaigns` | CampaignMonitoring | Re-engagement campaigns |

### AI & Intelligence

| Table | Service | Purpose |
|-------|---------|---------|
| `admission_ai_insights` | AIInsightsService | AI-generated insights |
| `admission_action_executions` | InsightActionsService | Action execution tracking |
| `admission_query_history` | AgenticQueryService | NLP query history |
| `admission_daily_briefings` | DailyBriefingService | Daily briefing content |
| `admission_briefings` | BriefingDeliveryService | Published briefings |
| `admission_briefing_notifications` | BriefingDeliveryService | Per-user notifications |

### Consultants

| Table | Service | Purpose |
|-------|---------|---------|
| `education_consultants` | ConsultantService | Consultant/publisher profiles |
| `consultant_commission_transactions` | ConsultantService | Commission transaction ledger |
| `consultant_lead_attributions` | ConsultantService | Lead-to-consultant attribution tracking |
| `consultant_commissions` | ConsultantService | Legacy commission records |
| `consultant_payouts` | ConsultantService | Payout records |
| `consultant_portal_access` | ConsultantService | Portal access config |
| `referral_reward_configs` | ConsultantService | Reward program definitions |
| `referral_rewards` | ConsultantService | Individual reward instances |

### Post-Decision

| Table | Service | Purpose |
|-------|---------|---------|
| `offer_letters` | OfferLetterService | Offer letter records |
| `admission_payments` | SeatConfirmationService | Payment records |
| `scholarships` | ScholarshipService | Scholarship definitions |
| `scholarship_applications` | ScholarshipService | Scholarship applications |
| `lateral_entry_applications` | LateralEntryService | Lateral entry applications |
| `lateral_entry_documents` | LateralEntryService | Supporting documents |
| `lateral_entry_eligibility_rules` | LateralEntryService | Eligibility criteria |
| `lateral_entry_vacancies` | LateralEntryService | Available seats |

### Hostel

| Table | Service | Purpose |
|-------|---------|---------|
| `hostels` | HostelService | Hostel definitions |
| `hostel_rooms` | HostelService | Room definitions |
| `hostel_beds` | HostelService | Bed definitions |
| `hostel_allocations` | HostelService | Room assignments |
| `hostel_allocation_requests` | HostelService | Accommodation requests |

### Evaluation

| Table | Service | Purpose |
|-------|---------|---------|
| `interview_slots` | InterviewService | Interview time slots |
| `interview_bookings` | InterviewService | Interview appointments |
| `screening_exams` | ScreeningExamService | Entrance exam records |
| `merit_lists` | MeritListService | Merit ranking lists |
| `document_types` | DocumentService | Required document definitions |
| `application_documents` | DocumentService | Uploaded documents |

### RPCs (Complete)

| RPC Name | Service | Purpose |
|----------|---------|---------|
| `get_combined_enrollment_analytics` | AdmissionService | Dashboard enrollment metrics |
| `get_pending_campaign_steps` | CampaignProcessorService | Fetch pending campaign steps |
| `mark_campaign_step_processed` | CampaignProcessorService | Mark step as processed |
| `get_pending_drip_steps` | DripExecutorService | Fetch pending drip steps |
| `mark_drip_step_executed` | DripExecutorService | Mark drip step as executed |
| `get_counselor_daily_view` | CounselorDailyViewService | All-in-one counselor dashboard data |
| `find_cross_campus_duplicates` | GroupDashboardService | Cross-institution duplicate detection |
| `get_admission_stage_durations` | AdmissionTQMMetricsService | Time-per-stage analysis |
| `increment_consultant_lead_count` | ConsultantService | Update consultant referral count |

---

## 13. External API Dependencies

| API | Service | Purpose |
|-----|---------|---------|
| **Anthropic Claude** (claude-3-5-haiku-20241022) | AIResponseService, AgenticQueryService, AdmissionAIService | Response suggestions, NLP queries, dashboard insights |
| **MSG91 / Twilio** | SmsCampaignService | SMS delivery |
| **Supabase Realtime** | CampaignMonitoringService | Live dashboard updates |
| **Supabase Storage** | InsightActionsService | CSV export storage |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Service files | 43 |
| Database tables | 50+ |
| Database views | 3 |
| Database RPCs | 9 |
| UI routes/pages | 49 |
| React hooks | 35+ (in dedicated files) + 12 (in index.ts) |
| Service methods | 250+ |
| **Workflows documented** | **61** |
| External API integrations | 3 |
| Communication channels | 3 (SMS, WhatsApp, Email) |
| AI-powered features | 6 |
| Consultant sub-workflows | 8 |
| Public-facing pages | 1 (application form) |

### Workflow Count Breakdown

| Section | Workflows |
|---------|-----------|
| Lead Management | 7 |
| Application Processing | 9 |
| Communication & Campaigns | 7 |
| AI & Intelligence | 6 |
| Consultant Management | 8 |
| Post-Decision | 3 |
| Automation, Rules & Config | 10 |
| Data Quality & Compliance | 6 |
| Administrative | 2 |
| Cross-Cutting | 3 |
| **Total** | **61** |
