# Admission CRM — Module Connections & Dependencies

## Entity Relationship Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        institutions                          │
│  (All tables have institution_id FK → institutions.id)       │
└────────────────────────────┬─────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────────┐
│ admission_    │  │ admission_      │  │ education_       │
│ counselors    │  │ leads (61 cols) │  │ consultants      │
│ (9 cols)      │  │ CENTRAL TABLE   │  │ (57 cols)        │
└───────┬───────┘  └────────┬────────┘  └──────────────────┘
        │                   │
        │    ┌──────────────┼──────────────┬────────────────┐
        │    │              │              │                │
        ▼    ▼              ▼              ▼                ▼
┌────────────────┐ ┌───────────────┐ ┌──────────────┐ ┌──────────────┐
│ admission_     │ │ admission_    │ │ admission_   │ │ admission_   │
│ lead_          │ │ applications  │ │ lead_scores  │ │ lead_stage_  │
│ activities     │ │ (37 cols)     │ │              │ │ history      │
│ (9 cols)       │ └───────────────┘ └──────────────┘ └──────────────┘
└────────────────┘
        │
        ├──────────────────────────────────────────────┐
        │                                              │
        ▼                                              ▼
┌───────────────────┐                    ┌──────────────────────┐
│ COMMUNICATION     │                    │ CAMPAIGN ENGINE      │
│ admission_sms_logs│                    │ admission_workflows  │
│ admission_wa_logs │                    │ admission_campaign_  │
│ admission_email_  │                    │   queue / logs       │
│   logs            │                    │ admission_drip_*     │
│ admission_comm_   │                    └──────────────────────┘
│   templates       │
└───────────────────┘
```

## Central Table: `admission_leads`

**61 columns** — the core entity. Almost every module references it.

### Modules That Read/Write admission_leads

| Module | How It Uses Leads |
|--------|-------------------|
| Dashboard | Aggregates: count by stage, new today, hot leads |
| Leads Management | Full CRUD, stage changes, tagging |
| Applications | Creates application FROM lead (lead_id FK) |
| Counselors | Assigned leads, follow-up tracking |
| Analytics | Funnel analysis, drop-off, stage duration |
| Group Dashboard | Cross-institution lead aggregation |
| Campaigns | Target leads for SMS/WA/Email |
| Re-engagement | Find dormant leads (last_activity_at comparison) |
| Data Quality | Phone validation, deduplication, profiling on lead fields |
| Scoring | Calculate scores from lead demographics/engagement |
| GD-PI | Candidates sourced from leads |
| Screening Exam | Exam candidates from leads |
| Merit List | Ranking based on lead scores |
| Scholarships | Scholarship applications from leads |
| Loans | Loan applications linked to leads |
| Hostels | Room allocation for admitted leads |
| Documents | Document verification for leads |
| Parent Communication | Parent contact info from leads |
| WhatsApp Chat | Conversations with leads |
| Source Tracking | Lead source analysis |
| AI Insights | Pattern detection across leads |

## Foreign Key Map (73 relationships)

### admission_leads (outgoing)
```
admission_leads.institution_id → institutions.id
admission_leads.counselor_id → admission_counselors.id
```

### Tables that reference admission_leads
```
admission_applications.lead_id → admission_leads.id
admission_lead_activities.lead_id → admission_leads.id
admission_lead_scores.lead_id → admission_leads.id
admission_lead_stage_history.lead_id → admission_leads.id
admission_call_logs.lead_id → admission_leads.id
admission_campaign_logs.lead_id → admission_leads.id
admission_campaign_queue.lead_id → admission_leads.id
admission_sms_logs.lead_id → admission_leads.id
admission_whatsapp_logs.lead_id → admission_leads.id
admission_email_logs.lead_id → admission_leads.id
```

### admission_applications (outgoing)
```
admission_applications.lead_id → admission_leads.id
admission_applications.institution_id → institutions.id
admission_applications.learner_profile_id → learners_profiles.id
admission_applications.reviewer_id → profiles.id
```

### Campaign chain
```
admission_workflows.institution_id → institutions.id
admission_campaign_queue.workflow_id → admission_workflows.id
admission_campaign_queue.lead_id → admission_leads.id
admission_campaign_queue.application_id → admission_applications.id
admission_campaign_queue.parent_queue_id → admission_campaign_queue.id (self-ref)
admission_campaign_logs.queue_id → admission_campaign_queue.id
admission_campaign_logs.workflow_id → admission_workflows.id
admission_campaign_logs.lead_id → admission_leads.id
```

### Chatbot chain
```
chatbot_sessions.institution_id → institutions.id
chatbot_messages.session_id → chatbot_sessions.id
chatbot_knowledge_base.institution_id → institutions.id
chatbot_configs.institution_id → institutions.id
```

## Shared Services

These services are used by multiple sub-modules:

| Service | Used By |
|---------|---------|
| `lead-service.ts` | Dashboard, Leads, Analytics, Group Dashboard |
| `data-quality-service.ts` | Phone Validation, Deduplication, Data Profiling, Source Tracking |
| `consultant-service.ts` | Consultants AND Publishers (shared) |
| `activity-service.ts` | Leads detail, Counselor daily-view |
| `communication-templates-service.ts` | Templates settings, Chat, Campaigns |

**⚠️ When modifying shared services, test ALL consuming modules.**

## Shared Hooks

| Hook File | Used By |
|-----------|---------|
| `hooks/admission/index.ts` | Dashboard, Leads, Applications, Analytics (barrel exports) |
| `hooks/admission/use-data-quality.ts` | Phone Validation, Deduplication, Data Profiling, Source Tracking, **Scholarships** (misplaced), **Hostels** (misplaced) |
| `hooks/admission/use-consultants.ts` | Consultants, Publishers, Source Performance |

## Cross-Module Dependencies

### If you modify `admission_leads` schema:
- **Impact**: ALL 21 modules listed above
- **Action**: Update `types/admission.ts`, verify all services compile

### If you modify `LeadService`:
- **Impact**: Dashboard, Leads, Analytics, Group Dashboard
- **Action**: Test all 4 pages

### If you modify `withAuth`:
- **Impact**: ALL API routes across ALL modules (not just admission)
- **Action**: Run full build, test at least one route per module

### If you modify `lib/api/response.ts`:
- **Impact**: All Solutions Hub routes (111) + all new admission routes
- **Action**: Verify response shape hasn't broken existing consumers

### If you modify `lib/api/client.ts`:
- **Impact**: All hooks that use fetch (after B2A migration)
- **Action**: Test any migrated hook

## Dependencies on Non-Admission Modules

| Admission Feature | External Dependency |
|-------------------|-------------------|
| Applications | `learners_profiles` table (learner_profile_id FK) |
| Applications | `profiles` table (reviewer_id FK) |
| Call Logs | `profiles` table (counselor_id FK) |
| All tables | `institutions` table (institution_id FK) |
| Auth | `profiles` table (role, institution_id for session auth) |
| Auth | `api_keys` table (for API key auth) |

## Known Issues

| Issue | Location | Impact |
|-------|----------|--------|
| `lead_activity_log` has NO `institution_id` | DB table | Security gap: cross-institution data leak |
| Scholarship hooks misplaced | `use-data-quality.ts` | Confusing, should be `use-scholarships.ts` |
| Hostel hooks misplaced | `use-data-quality.ts` | Confusing, should be `use-hostels.ts` |
| Merit List has no hook layer | Components call service directly | Breaks B2A pattern |
| Documents has no hook layer | Components call service directly | Breaks B2A pattern |
| Analytics has ~100 lines inline aggregation | Hook in `index.ts` | Should be in service or API route |
| `lead_stage_history` duplicate | Both `admission_lead_stage_history` and `lead_stage_history` exist | Clarify which is canonical |
| Some pages exist in BOTH flat and nested routes | e.g., `/admission/chatbot` AND `/admission/marketing/chatbot` | Consolidate or redirect |

## Page Route Duplication

Several pages exist at both a flat path and nested path:

| Flat Path | Nested Path | Canonical? |
|-----------|-------------|------------|
| `/admission/chatbot/*` | `/admission/marketing/chatbot/*` | Nested (marketing) |
| `/admission/chat/*` | `/admission/marketing/chat/*` | Nested (marketing) |
| `/admission/campaigns/*` | `/admission/marketing/campaigns/*` | Nested (marketing) |
| `/admission/parent-communication` | `/admission/marketing/parent-communication` | Nested (marketing) |
| `/admission/publishers` | `/admission/marketing/publishers` | Nested (marketing) |
| `/admission/re-engagement` | `/admission/marketing/re-engagement` | Nested (marketing) |
| `/admission/remarketing` | `/admission/marketing/remarketing` | Nested (marketing) |
| `/admission/voice-agents` | `/admission/marketing/voice-agents` | Nested (marketing) |
| `/admission/voice-broadcast` | `/admission/marketing/voice-broadcast` | Nested (marketing) |
| `/admission/phone-validation` | `/admission/data-quality/phone-validation` | Nested (data-quality) |
| `/admission/deduplication` | `/admission/data-quality/deduplication` | Nested (data-quality) |
| `/admission/data-profiling` | `/admission/data-quality/data-profiling` | Nested (data-quality) |
| `/admission/assignment-rules` | `/admission/settings/assignment-rules` | Nested (settings) |
| `/admission/scoring-rules` | `/admission/settings/scoring-rules` | Nested (settings) (not confirmed) |
| `/admission/workflows` | `/admission/settings/workflows` | Nested (settings) |
| `/admission/workflow-config` | `/admission/settings/workflow-config` | Nested (settings) |
| `/admission/sources` | `/admission/settings/sources` | Nested (settings) |
| `/admission/templates/*` | `/admission/settings/templates/*` | Nested (settings) |

**Recommendation**: Keep nested paths as canonical, redirect flat paths or remove them.
