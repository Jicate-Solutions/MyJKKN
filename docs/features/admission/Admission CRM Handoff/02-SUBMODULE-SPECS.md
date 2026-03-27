# Admission CRM — Sub-Module Specifications

> 42 sub-modules. Each entry: business purpose, user flow, current files, status, and exactly what to build.

---

## Priority 0 — Core CRM (Build First)

### 1. Dashboard

| Field | Value |
|-------|-------|
| **Purpose** | Central overview: KPI cards, funnel chart, hot leads, daily briefing, counselor summary |
| **Route** | `/admission/dashboard` |
| **Status** | Working (Direct Service) |
| **Page** | `app/(routes)/admission/dashboard/page.tsx` |
| **Hook** | `hooks/admission/index.ts` → `useAdmissionDashboard`, `useDashboardSummary`, `useFunnelSummary`, `useFunnelAnalyticsDashboard` |
| **Service** | `lib/services/admission/lead-service.ts` → `getDashboardSummary`, `getFunnelSummary` |
| **API Routes** | None dedicated |
| **Tables** | `admission_leads`, `admission_counselors`, `admission_lead_stage_history`, `admission_daily_briefings` |

**User Flow:** Open `/admission/dashboard` → KPI cards (total, new, converted, pending follow-ups) → funnel chart (leads by stage) → hot leads table → daily briefing popup → filter by institution (super_admin).

**What to Build:**
1. Create `app/api/admission/dashboard/route.ts` — GET with withAuth, calls `LeadService.getDashboardSummary()` and `getFunnelSummary()`
2. Update hooks in `index.ts` to use `fetch('/api/admission/dashboard')` instead of `LeadService.getDashboardSummary()`
3. Add OPTIONS handler

---

### 2. Leads Management

| Field | Value |
|-------|-------|
| **Purpose** | Core CRM: CRUD for 61-column leads, pipeline/Kanban, detail tabs, stage tracking, scoring, counselor assignment |
| **Route** | `/admission/leads`, `/admission/leads/[id]`, `/admission/leads/new` |
| **Status** | Working (Direct Service) |
| **Page** | `app/(routes)/admission/leads/page.tsx`, `/[id]/page.tsx`, `/new/page.tsx` |
| **Hook** | `hooks/admission/index.ts` → `useAdmissionLeads`, `useAdmissionLead`, `useLeadMutations`, `useLeadTimeline`, `useLeadCommunicationHistory`, `useFunnelHistory` + `use-activities.ts`, `use-lead-scoring.ts` |
| **Service** | `lib/services/admission/lead-service.ts`, `activity-service.ts`, `lead-scoring-engine-service.ts` |
| **API Routes** | `app/api/admission/leads/route.ts` (basic), `app/api/b2a/admission/route.ts` |
| **Tables** | `admission_leads` (61 cols), `admission_lead_activities` (9 cols), `admission_lead_stage_history`, `admission_lead_scores`, `admission_counselors` |

**User Flow:** `/admission/leads` → lead list with filters → Kanban board view → click lead → `/leads/[id]` → tabs: Overview, Activities, Communication, Documents → change stage, assign counselor, schedule follow-up, mark hot/priority → create from `/leads/new`.

**What to Build:**
1. Expand `app/api/admission/leads/route.ts` — currently basic, needs full CRUD
2. Create `app/api/admission/leads/[id]/route.ts` — GET (single lead), PUT (update), DELETE
3. Create `app/api/admission/leads/[id]/stage/route.ts` — PATCH (update stage)
4. Create `app/api/admission/leads/[id]/assign/route.ts` — PATCH (assign counselor)
5. Create `app/api/admission/leads/[id]/hot/route.ts` — PATCH (toggle hot lead)
6. Create `app/api/admission/leads/[id]/followup/route.ts` — POST (schedule follow-up)
7. Create `app/api/admission/leads/[id]/tags/route.ts` — POST/DELETE (add/remove tags)
8. Update ALL lead hooks to use fetch() via `lib/api/client.ts`
9. All routes use `withAuth` with appropriate permissions

---

### 3. Applications

| Field | Value |
|-------|-------|
| **Purpose** | Student application tracking: draft→submitted→review→approved/rejected→offer→enrolled |
| **Route** | `/admission/applications`, `/admission/applications/[id]` |
| **Status** | Working (Direct Service) |
| **Page** | `app/(routes)/admission/applications/page.tsx`, `/[id]/page.tsx` |
| **Hook** | `hooks/admission/index.ts` → `useAdmissionApplications`, `useAdmissionApplication`, `useApplicationMutations` |
| **Service** | `lib/services/admission/application-service.ts` |
| **API Routes** | None dedicated (uses b2a routes) |
| **Tables** | `admission_applications` (37 cols), `admission_leads` |

**What to Build:**
1. Create `app/api/admission/applications/route.ts` — GET (list), POST (create)
2. Create `app/api/admission/applications/[id]/route.ts` — GET, PUT, DELETE
3. Create `app/api/admission/applications/[id]/status/route.ts` — PATCH (status transitions)
4. Update hooks to use fetch()
5. All with withAuth

---

### 4. Counselors

| Field | Value |
|-------|-------|
| **Purpose** | Counselor management with sub-pages: daily-view, calls, reminders, alerts, briefing, performance |
| **Route** | `/admission/counselors`, `/counselors/daily-view`, `/counselors/calls`, `/counselors/reminders`, `/counselors/alerts`, `/counselors/briefing` |
| **Status** | Working (Mixed: calls have API routes, others Direct Service) |
| **Pages** | 6 pages under `app/(routes)/admission/counselors/` |
| **Hooks** | `use-counselor-daily-view.ts`, `use-counselor-performance.ts`, `use-call-logs.ts`, `use-call-mutations.ts`, `use-call-stats.ts`, `use-reminders.ts`, `use-activity-alerts.ts`, `use-briefing-notifications.ts`, `use-daily-briefing.ts` |
| **Services** | `counselor-daily-view-service.ts`, `daily-briefing-service.ts`, `briefing-delivery-service.ts`, `activity-alert-service.ts`, `reminders-service.ts` |
| **Existing API Routes** | `app/api/admission/calls/*` (4 routes), `app/api/admission/alerts/route.ts` |
| **Tables** | `admission_counselors`, `admission_leads`, `admission_lead_activities`, `admission_daily_briefings`, `admission_call_logs` |

**What to Build:**
1. Create `app/api/admission/counselors/route.ts` — GET (list), POST (create)
2. Create `app/api/admission/counselors/[id]/route.ts` — GET, PUT, DELETE
3. Create `app/api/admission/counselors/daily-view/route.ts` — GET
4. Create `app/api/admission/counselors/briefing/route.ts` — GET, POST
5. Migrate existing calls/alerts routes from `getAuthUser` to `withAuth`
6. Update hooks to use fetch()

---

## Priority 1 — Settings & Analytics

### 5. Workflows (Settings)

| Field | Value |
|-------|-------|
| **Purpose** | Automated workflows: triggers, conditions, actions, execution tracking |
| **Route** | `/admission/settings/workflows` |
| **Status** | Working (Direct Service) |
| **Hook** | `hooks/admission/use-workflows.ts` |
| **Service** | `lib/services/admission/workflows-service.ts` |
| **API Routes** | None |
| **Tables** | `admission_workflows`, `admission_campaign_logs` |

**What to Build:**
1. Create `app/api/admission/settings/workflows/route.ts` — GET, POST
2. Create `app/api/admission/settings/workflows/[id]/route.ts` — GET, PUT, DELETE
3. Update hooks

---

### 6. Assignment Rules (Settings)

| Field | Value |
|-------|-------|
| **Purpose** | Auto lead-to-counselor assignment: criteria, round-robin, weighted, load-balanced |
| **Route** | `/admission/settings/assignment-rules` |
| **Status** | Working (Direct Service) |
| **Hook** | `hooks/admission/use-assignment-rules.ts` |
| **Service** | `lib/services/admission/assignment-rules-service.ts` |
| **API Routes** | None |
| **Tables** | `admission_assignment_rules` |

**What to Build:**
1. Create `app/api/admission/settings/assignment-rules/route.ts` — GET, POST
2. Create `app/api/admission/settings/assignment-rules/[id]/route.ts` — GET, PUT, DELETE
3. Update hooks

---

### 7. Scoring Rules (Settings)

| Field | Value |
|-------|-------|
| **Purpose** | Lead scoring criteria: demographics, engagement, qualification, weighted scoring |
| **Route** | `/admission/scoring-rules` |
| **Status** | Working (Direct Service) |
| **Hook** | `hooks/admission/use-scoring-rules.ts`, `use-lead-scoring.ts` |
| **Service** | `lib/services/admission/scoring-rules-service.ts`, `lead-scoring-engine-service.ts` |
| **API Routes** | None |
| **Tables** | `admission_lead_scores` |

**What to Build:**
1. Create `app/api/admission/settings/scoring-rules/route.ts` — GET, POST
2. Create `app/api/admission/settings/scoring-rules/[id]/route.ts` — GET, PUT, DELETE
3. Update hooks

---

### 8. Communication Templates (Settings)

| Field | Value |
|-------|-------|
| **Purpose** | SMS/Email/WhatsApp templates with variables, analytics, email builder |
| **Route** | `/admission/settings/templates`, `/analytics`, `/email-builder`, `/documents` |
| **Status** | Working (Direct Service, WA-specific analytics routes exist) |
| **Hook** | `hooks/admission/use-communication-templates.ts`, `use-template-analytics.ts` |
| **Service** | `lib/services/admission/communication-templates-service.ts` |
| **Existing Routes** | `chat/templates/analytics`, `chat/templates/refresh-quality` (WA-only) |
| **Tables** | `admission_communication_templates` |

**What to Build:**
1. Create `app/api/admission/settings/templates/route.ts` — GET, POST
2. Create `app/api/admission/settings/templates/[id]/route.ts` — GET, PUT, DELETE
3. Update hooks

---

### 9. Analytics

| Field | Value |
|-------|-------|
| **Purpose** | Enhanced funnel, source ROI, counselor benchmarking, WoW trends, drop-off analysis |
| **Route** | `/admission/analytics` |
| **Status** | Working (Direct Service with ~100 lines inline aggregation in hooks) |
| **Hook** | `hooks/admission/index.ts` → `useFunnelAnalyticsDashboard`, `useCounselorPerformance`, `useSourceROI` |
| **Service** | `lib/services/admission/lead-service.ts` |
| **Tables** | `admission_leads`, `admission_lead_stage_history`, `admission_counselors` |

**What to Build:**
1. Create `app/api/admission/analytics/route.ts` — GET (funnel, source ROI, counselor benchmarking)
2. Move inline aggregation from hooks into the API route or a dedicated analytics service
3. Update hooks

---

### 10. Apply (Public Form)

| Field | Value |
|-------|-------|
| **Purpose** | Public application form: students apply directly, auto-creates lead + application |
| **Route** | `/admission/apply` |
| **Status** | omm-dev only |
| **Page** | `app/(routes)/admission/apply/page.tsx` |
| **Hook** | `hooks/admission/index.ts` → `useApplicationMutations` |
| **Service** | `lib/services/admission/application-service.ts` |
| **Tables** | `admission_leads`, `admission_applications` |

**What to Build:**
1. Create `app/api/admission/apply/route.ts` — POST (NO auth — public route)
2. Add CSRF protection, rate limiting, captcha
3. Auto-create lead + application records
4. Merge page from omm-dev to main when ready

---

### 11. Marketing > Campaigns

| Field | Value |
|-------|-------|
| **Purpose** | SMS/WhatsApp campaign monitoring, delivery metrics, ROI, audience segments |
| **Route** | `/admission/campaigns/monitoring`, `/campaigns/roi`, `/campaigns/segments` |
| **Status** | Working (Mixed: ROI + segments have API routes) |
| **Hooks** | `use-campaign-monitoring.ts`, `use-campaign-processor.ts`, `use-campaign-roi.ts`, `use-sms-campaign.ts`, `use-whatsapp-campaign.ts`, `use-drip-executor.ts`, `use-communication-costs.ts` |
| **Services** | `campaign-monitoring-service.ts`, `campaign-processor-service.ts`, `campaign-roi-service.ts`, `sms-campaign-service.ts`, `whatsapp-campaign-service.ts`, `drip-executor-service.ts`, `communication-cost-service.ts` |
| **Existing Routes** | `campaigns/roi/route.ts`, `campaigns/segments/*` (4 routes), `costs/route.ts` |
| **Tables** | `admission_campaign_logs`, `admission_campaign_queue`, `admission_sms_logs`, `admission_whatsapp_logs`, `admission_drip_sequences`, `admission_drip_schedule` |

**What to Build:**
1. Create `app/api/admission/campaigns/monitoring/route.ts` — GET (dashboard data)
2. Migrate existing ROI/segments/costs routes from getAuthUser to withAuth
3. Update hooks

---

### 12. Consultants (Education Agents)

| Field | Value |
|-------|-------|
| **Purpose** | Education consultant/agent management: commissions, referrals, payouts, rewards, analytics, CSV import |
| **Route** | `/admission/consultants`, `/[id]`, `/[id]/edit`, `/new`, sub-pages |
| **Status** | Working (Direct Service, import/template routes exist) |
| **Hook** | `hooks/admission/use-consultants.ts` |
| **Service** | `lib/services/admission/consultant-service.ts` |
| **Existing Routes** | `consultants/import/route.ts`, `consultants/template/route.ts` |
| **Tables** | `education_consultants` (57 cols), `admission_leads` |

**What to Build:**
1. Create `app/api/admission/consultants/route.ts` — GET (list), POST (create)
2. Create `app/api/admission/consultants/[id]/route.ts` — GET, PUT, DELETE
3. Migrate import/template routes to withAuth
4. Update hooks

---

## Priority 2 — Data Quality, Enrollment, Selection, Settings

### 13. Sources (Settings)

| **Route** | `/admission/settings/sources` |
| **Hook** | `use-data-quality.ts` (useSourceTracking), `use-consultants.ts` (useSourcePerformance) |
| **Service** | `source-tracking-service.ts` |
| **What to Build** | Create `app/api/admission/settings/sources/route.ts`, update hooks |

### 14. Workflow Config (Settings)

| **Route** | `/admission/settings/workflow-config` |
| **Hook** | `use-workflow-config.ts` |
| **Service** | `workflow-config-service.ts` |
| **What to Build** | Create `app/api/admission/settings/workflow-config/route.ts`, update hooks |

### 15. Group Dashboard

| **Route** | `/admission/group-dashboard` |
| **Hook** | `use-group-dashboard.ts` |
| **Service** | `group-dashboard-service.ts` |
| **What to Build** | Create `app/api/admission/group-dashboard/route.ts` (needs super_admin check), update hooks |

### 16. Phone Validation (Data Quality)

| **Route** | `/admission/data-quality/phone-validation` |
| **Hook** | `use-data-quality.ts` → `usePhoneValidationStats`, `useInvalidPhones`, `usePhoneIssueBreakdown` |
| **Service** | `data-quality-service.ts` |
| **What to Build** | Create `app/api/admission/data-quality/phone-validation/route.ts`, update hooks |

### 17. Deduplication (Data Quality)

| **Route** | `/admission/data-quality/deduplication` |
| **Hook** | `use-data-quality.ts` → `useDuplicateGroups`, `useMergeMutations` |
| **Service** | `data-quality-service.ts` |
| **What to Build** | Create `app/api/admission/data-quality/deduplication/route.ts` (scan, groups, merge — merge MUST be transactional), update hooks |

### 18. Data Profiling (Data Quality)

| **Route** | `/admission/data-quality/data-profiling` |
| **Hook** | `use-data-quality.ts` → `useDataProfilingMetrics`, `useFieldAnalysis`, `useDataIssues` |
| **Service** | `data-quality-service.ts` |
| **What to Build** | Create `app/api/admission/data-quality/data-profiling/route.ts`, update hooks |

### 19. GD-PI (Selection)

| **Route** | `/admission/gd-pi` |
| **Status** | API routes exist but hooks call service directly |
| **Existing Routes** | `gdpi/route.ts`, `gdpi/[id]/route.ts`, `gdpi/[id]/candidates/route.ts`, `gdpi/[id]/scores/route.ts` |
| **What to Build** | Migrate 4 routes from getAuthUser to withAuth, update hooks to use fetch() |

### 20. Screening Exam (Selection)

| **Route** | `/admission/screening-exam` |
| **Hook** | `use-screening-exams.ts` |
| **Service** | `screening-exam-service.ts` |
| **What to Build** | Create `app/api/admission/screening-exam/route.ts` + `/[id]/route.ts`, update hooks |

### 21. Merit List (Selection)

| **Route** | `/admission/merit-list` |
| **Hook** | `use-merit-lists.ts` (exists) |
| **Service** | `merit-list-service.ts` |
| **⚠️ Issue** | Components call MeritListService DIRECTLY — no hook layer used |
| **What to Build** | Create `app/api/admission/merit-list/route.ts`, wire page through hooks → API → service |

### 22. Interviews (Selection)

| **Route** | `/admission/interviews` |
| **Hook** | `use-interviews.ts` |
| **Service** | `interview-service.ts` |
| **What to Build** | Create `app/api/admission/interviews/route.ts` + `/[id]/route.ts`, update hooks |

### 23. Scholarships (Financial)

| **Route** | `/admission/scholarships`, `/[id]`, `/[id]/edit` |
| **Hook** | `use-data-quality.ts` (MISPLACED: `useScholarships`, `useScholarshipApplications`) |
| **Service** | `scholarship-service.ts` |
| **⚠️ Issue** | Hooks MISPLACED in `use-data-quality.ts` — move to `use-scholarships.ts` |
| **What to Build** | Move hooks to `use-scholarships.ts`, create API routes, update hooks |

### 24. Loans (Financial)

| **Route** | `/admission/loans` |
| **Status** | Fully wired with API routes — hooks still call service directly |
| **Existing Routes** | `loans/route.ts`, `loans/[id]/route.ts`, `loans/partners/route.ts`, `loans/partners/[id]/route.ts` |
| **What to Build** | Migrate 4 routes from getAuthUser to withAuth, update hooks to use fetch() |

### 25. Hostels (Financial)

| **Route** | `/admission/hostels` |
| **Hook** | `use-data-quality.ts` (MISPLACED: `useHostels`, `useHostelAllocations`, `useHostelWaitlist`) |
| **Service** | `hostel-service.ts` |
| **⚠️ Issue** | Hooks MISPLACED in `use-data-quality.ts` — move to `use-hostels.ts` |
| **What to Build** | Move hooks to `use-hostels.ts`, create API routes. May need campus-living integration. |

### 26. Offer Letters (Enrollment)

| **Route** | `/admission/offer-letter` |
| **Hook** | `use-offer-letters.ts` (exists but may be unused by page) |
| **Service** | `offer-letter-service.ts` |
| **⚠️ Issue** | Page components call service directly — hook exists but is unused |
| **What to Build** | Create API routes, wire page through hooks → API → service |

### 27. Seat Confirmation (Enrollment)

| **Route** | `/admission/seat-confirmation` |
| **Hook** | `use-seat-confirmation.ts` (exists) |
| **Service** | `seat-confirmation-service.ts` |
| **⚠️ Issue** | Page components call service directly — hook exists but is unused |
| **What to Build** | Create API routes, wire page through hooks → API → service |

### 28. Lateral Entry (Enrollment)

| **Route** | `/admission/lateral-entry` |
| **Hook** | `use-lateral-entry.ts` (exists) |
| **Service** | `lateral-entry-service.ts` |
| **⚠️ Issue** | Page components call service directly — hook exists but is unused |
| **What to Build** | Create API routes, wire page through hooks → API → service |

### 29. Documents (Enrollment)

| **Route** | `/admission/documents` |
| **Hook** | None (components call `document-service.ts` directly) |
| **Service** | `document-service.ts` |
| **⚠️ Issue** | NO hook layer at all |
| **What to Build** | CREATE `use-documents.ts`, create API routes, wire full chain |

### 30. Feedback (Enrollment)

| **Route** | `/admission/feedback` |
| **Hook** | `use-feedback.ts` (exists) |
| **Service** | `feedback-service.ts` |
| **⚠️ Issue** | Page components call service directly — hook exists but is unused |
| **What to Build** | Create API routes, wire page through hooks → API → service |

### 31. Parent Communication (Marketing)

| **Route** | `/admission/marketing/parent-communication` |
| **Hook** | `use-parent-communication.ts` |
| **Service** | `parent-communication-service.ts` |
| **What to Build** | Create `app/api/admission/parent-communication/route.ts`, update hooks |

### 32. Re-engagement (Marketing)

| **Route** | `/admission/marketing/re-engagement` |
| **Hook** | `use-re-engagement.ts` |
| **Service** | `re-engagement-service.ts` |
| **What to Build** | Create `app/api/admission/re-engagement/route.ts`, update hooks |

### 33. Publishers (Marketing)

| **Route** | `/admission/marketing/publishers` |
| **Status** | Reuses Consultant infrastructure |
| **Hook** | `use-consultants.ts` (shared) |
| **Service** | `consultant-service.ts` (shared) |
| **What to Build** | Already shares Consultant routes. Consider: add publisher-specific filter field. |

---

## Priority 3 — AI & Advanced Features

### 34. WhatsApp Chat (Marketing)

| **Route** | `/admission/chat`, `/chat/performance`, `/chat/settings` |
| **Status** | **MOST COMPLETE** — 13+ API routes, extensive hooks |
| **What to Build** | Verify withAuth() on all 13+ routes. Test real-time subscriptions. |

### 35. Chatbot (Marketing)

| **Route** | `/admission/chatbot`, `/analytics`, `/knowledge` |
| **Status** | Fully wired with 6 API routes |
| **What to Build** | Verify: knowledge base table exists, AI integration works, handoff workflow. Migrate to withAuth. |

### 36. Voice Agents (Marketing)

| **Route** | `/admission/voice-agents` |
| **Status** | API routes exist |
| **Requires** | External voice provider (Twilio/Bland.ai) credentials |
| **What to Build** | Verify DB tables exist, provider configured. Migrate to withAuth. |

### 37. Voice Broadcast (Marketing)

| **Route** | `/admission/voice-broadcast` |
| **Status** | API route exists |
| **Requires** | Telephony provider credentials |
| **What to Build** | Verify DB tables exist, provider configured. Migrate to withAuth. |

### 38. Remarketing (Marketing)

| **Route** | `/admission/marketing/remarketing` |
| **Status** | API route exists |
| **Requires** | Google Ads / Facebook Ads API keys |
| **What to Build** | Verify DB tables exist, provider configured. Migrate to withAuth. |

### 39. AI Insights

| **Route** | `/admission/insights`, `/insights/status` |
| **Status** | Generation route exists, reading is Direct Service |
| **Hooks** | `use-ai-insights.ts`, `use-insight-actions.ts` |
| **Requires** | OpenAI/Anthropic API key |
| **What to Build** | Create insight list/dismiss routes. Migrate generation route to withAuth. |

### 40. Settings > General

| **Route** | `/admission/settings` |
| **Status** | Navigation hub only — no backend needed |
| **What to Build** | Consider: `admission_settings` table and `/api/admission/settings/route.ts` for module config |

### 41. Settings > WhatsApp Numbers

| **Route** | `/admission/settings/whatsapp-numbers` |
| **Status** | Fully wired — 4 API routes |
| **What to Build** | Verify withAuth() on all routes |

### 42. Status Tracking

| **Route** | `/admission/status` |
| **Hook** | `use-status-tracking.ts` |
| **Service** | `status-tracking-service.ts` |
| **What to Build** | Create API routes, update hooks |
