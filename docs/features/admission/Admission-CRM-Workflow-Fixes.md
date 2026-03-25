# Admission CRM — Developer Handoff Report

**Date:** 2026-02-27
**Prepared by:** Claude (analysis only — no code changes made)
**Scope:** Every workflow in the Admission CRM module, with specific fix recommendations

---

## Executive Summary

The Admission CRM has **120+ pages, 48 services, and 60+ hooks** — a comprehensive feature set. However, the core lead→enrollment pipeline has **manual gaps at every transition point**. The system stores configuration (assignment rules, workflows, scoring rules) but doesn't auto-execute them.

**Top 3 fixes (highest impact, lowest effort):**
1. Auto-assign leads on creation (~20 lines)
2. Add duplicate phone check on lead creation (~10 lines)
3. Add stage transition validation (~30 lines)

---

## Fix #1: Auto-Execute Assignment Rules on Lead Creation

**Priority:** Critical
**Effort:** Small (< 1hr)
**File:** `lib/services/admission/lead-service.ts` — `createLead()` method, line ~282

**Problem:** When a lead is created, it sits with `counselor_id = null` until someone manually assigns it. Assignment rules exist in `admission_assignment_rules` but are never executed.

**What to change:**
After the lead is inserted (line 282), add a call to run assignment rules:

```
// After: return this.normalizeLead(data);
// Add before return:
// 1. Fetch active assignment rules
// 2. Evaluate criteria against the new lead
// 3. Execute the matched rule's action (round_robin, specific_counselor, etc.)
// 4. Update lead.counselor_id
```

**Specifically:**
1. Import `AssignmentRulesService` from `./assignment-rules-service`
2. After lead insert, call `AssignmentRulesService.getActiveAssignmentRules(leadData.institution_id)`
3. Loop through rules (ordered by priority), check if lead matches criteria
4. On first match, execute the action (assign counselor)
5. Update the lead's `counselor_id` and `assigned_at`

**Why this matters:** In education admissions, leads contacted within 5 minutes have 10x higher conversion than leads contacted after 1 hour.

---

## Fix #2: Duplicate Phone Detection on Lead Creation

**Priority:** High
**Effort:** Small (< 1hr)
**File:** `lib/services/admission/lead-service.ts` — `createLead()` method, around line 211

**Problem:** No duplicate check. Same phone number can create unlimited lead records. The deduplication page exists (`/admission/deduplication`) but is reactive — finds duplicates AFTER they're created.

**What to change:**
Before the insert (line 270), add:

```
// Check for existing lead with same phone in same institution
const { data: existing } = await supabase
  .from('admission_leads')
  .select('id, full_name, funnel_stage')
  .eq('institution_id', leadData.institution_id)
  .eq('phone', leadData.phone.trim())
  .limit(1);

if (existing && existing.length > 0) {
  throw new Error(`Lead already exists: ${existing[0].full_name} (${existing[0].funnel_stage})`);
}
```

**Edge case to handle:** Allow creating a new lead if the existing one is in `lost` stage (re-engagement scenario). Add: `.not('funnel_stage', 'eq', 'lost')` to the check.

---

## Fix #3: Stage Transition Validation

**Priority:** High
**Effort:** Medium (1-4hr)
**File:** `lib/services/admission/lead-service.ts` — `updateStage()` method, line 370

**Problem:** Any stage can transition to any other stage. A lead can go from `new` directly to `enrolled` — no validation.

**What to change:**
Add a transition map defining allowed moves:

```typescript
const ALLOWED_TRANSITIONS: Record<FunnelStage, FunnelStage[]> = {
  new: ['contacted', 'not_reachable', 'lost'],
  contacted: ['interested', 'not_reachable', 'follow_up_scheduled', 'lost'],
  not_reachable: ['contacted', 'lost', 'dormant'],
  interested: ['qualified', 'engaged', 'follow_up_scheduled', 'lost'],
  // ... define for all 26 stages
  // Always allow: current → lost, current → dormant
};
```

Before updating, check: `if (!ALLOWED_TRANSITIONS[currentStage]?.includes(newStage)) throw new Error(...)`.

**Exception:** Super admins should be able to override (pass a `force` flag).

---

## Fix #4: Phone Number Format Validation

**Priority:** High
**Effort:** Small (< 1hr)
**File:** `lib/services/admission/lead-service.ts` — `createLead()` method
**Also:** `app/(routes)/admission/leads/new/page.tsx` — client-side validation

**Problem:** Phone field accepts any string — "abc", "123", incomplete numbers all pass.

**What to change:**
Add validation in `createLead()`:
```typescript
// Indian phone number: 10 digits, optionally prefixed with +91 or 0
const phoneRegex = /^(\+91|0)?[6-9]\d{9}$/;
const cleanPhone = leadData.phone.replace(/[\s-]/g, '');
if (!phoneRegex.test(cleanPhone)) {
  throw new Error('Invalid phone number format');
}
```

Also add client-side validation in the new lead form (line ~200 of new/page.tsx).

---

## Fix #5: Counselor Notification on Assignment

**Priority:** High
**Effort:** Medium (1-4hr)
**File:** `lib/services/admission/lead-service.ts` — `assignCounselor()` method, line 577

**Problem:** When a lead is assigned to a counselor, there's no notification. The counselor won't know until they check their queue.

**What to change:**
After assignment succeeds, trigger a notification:
1. Insert into existing `notifications` table (if one exists in the app)
2. Or use Supabase realtime to push to the counselor's client
3. Or send a push notification via the PWA service worker

---

## Fix #6: Inbound Lead Capture API Endpoint

**Priority:** Critical
**Effort:** Medium (1-4hr)
**Files:** Create new `app/api/admission/leads/webhook/route.ts`

**Problem:** No public API endpoint for website forms, Google Ads, Facebook Ads to push leads into the CRM. Currently someone must manually create every lead.

**What to build:**
```
POST /api/admission/leads/webhook
Headers: X-API-Key: <institution-specific key>
Body: { full_name, phone, email?, source, interested_programs?, utm_source?, utm_campaign? }
```

This should:
1. Validate API key against institution
2. Check for duplicates
3. Create lead via `LeadService.createLead()`
4. Auto-assign via assignment rules (Fix #1)
5. Return lead ID

---

## Fix #7: Score Expiration and Re-scoring

**Priority:** Medium
**Effort:** Medium (1-4hr)
**File:** `lib/services/admission/lead-scoring-engine-service.ts`

**Problem:** Scores expire after 7 days (line 691: `expiresAt.setDate(expiresAt.getDate() + 7)`) but there's no cron to re-calculate. Scores silently become stale.

**What to change:**
1. Create a Supabase Edge Function or Vercel Cron job that runs daily
2. Query `admission_lead_scores` where `expires_at < now()`
3. Re-calculate using `calculateLeadScore()` for each expired score
4. OR: Remove the expiration concept entirely (scores update on activity, not on time)

---

## Fix #8: Three Data Models Should Be One

**Priority:** Medium
**Effort:** Large (4hr+)
**Files:** Multiple services and pages

**Problem:** Three parallel tables for what should be one pipeline:
- `admissions` (AdmissionService — legacy)
- `admission_leads` (LeadService — CRM)
- `admission_applications` (ApplicationService — formal applications)

The connection is loose: `admission_applications.lead_id` → `admission_leads.id`, and `admissions` seems separate from both.

**What to change:**
1. Audit which features use `admissions` vs `admission_applications`
2. Migrate to a single table or ensure clean foreign key relationships
3. Consider: `admission_leads` IS the pipeline, `admission_applications` is a CHILD record (not a parallel track)

---

## Fix #9: Stage Consolidation (26 → 8)

**Priority:** Medium
**Effort:** Large (4hr+)
**File:** `types/admission.ts` — `FunnelStage` type, line 21

**Problem:** 26 stages overwhelm counselors. Most CRMs succeed with 5-8 stages.

**Recommended canonical stages (8):**
| Stage | Maps from |
|-------|-----------|
| `new` | new |
| `contacted` | contacted, not_reachable, follow_up_scheduled |
| `interested` | interested, engaged, qualified |
| `applied` | application_started, application_submitted, documents_pending, documents_verified |
| `evaluated` | interview_scheduled, interview_completed, offer_sent |
| `confirmed` | offer_accepted, token_paid, confirmed |
| `enrolled` | enrolled |
| `lost` | declined, withdrew, expired, lost, dormant |

The intermediate statuses (not_reachable, follow_up_scheduled, etc.) become **sub-statuses** stored in a separate field, not the primary funnel stage.

---

## Complete Workflow Reference

### All Pages in Admission CRM (120+)

**Core Pipeline:**
- `/admission/dashboard` — Summary stats
- `/admission/leads` — Lead list + filters
- `/admission/leads/new` — Create lead
- `/admission/leads/[id]` — Lead detail
- `/admission/applications` — Application list
- `/admission/applications/[id]` — Application detail
- `/admission/apply` — Application form (public?)

**Counselor Tools:**
- `/admission/counselors` — Counselor list
- `/admission/counselors/daily-view` — Daily dashboard
- `/admission/counselors/briefing` — Daily briefing
- `/admission/counselors/calls` — Call log
- `/admission/counselors/alerts` — Activity alerts
- `/admission/counselors/reminders` — Reminder management

**Pipeline Stages:**
- `/admission/screening-exam` — Screening exams
- `/admission/interviews` — Interview scheduling
- `/admission/gd-pi` — Group Discussion & Personal Interview
- `/admission/merit-list` — Merit list generation
- `/admission/offer-letter` — Offer letter management
- `/admission/seat-confirmation` — Seat confirmation & payment

**Communication:**
- `/admission/chat` — WhatsApp chat inbox
- `/admission/chat/performance` — Chat performance metrics
- `/admission/chat/settings` — Chat settings
- `/admission/chatbot` — AI chatbot config
- `/admission/chatbot/analytics` — Chatbot analytics
- `/admission/chatbot/knowledge` — Knowledge base
- `/admission/templates` — Message templates
- `/admission/templates/email-builder` — Email template builder
- `/admission/templates/analytics` — Template performance
- `/admission/templates/documents` — Document templates
- `/admission/voice-agents` — Voice AI agents
- `/admission/voice-broadcast` — Voice broadcast

**Campaigns:**
- `/admission/campaigns` — Campaign management
- `/admission/campaigns/monitoring` — Campaign monitoring
- `/admission/campaigns/roi` — ROI tracking
- `/admission/campaigns/segments` — Audience segments

**Lead Management:**
- `/admission/scoring-rules` — Lead scoring configuration
- `/admission/assignment-rules` — Assignment rules
- `/admission/sources` — Lead source tracking
- `/admission/re-engagement` — Dormant lead re-engagement
- `/admission/remarketing` — Remarketing
- `/admission/parent-communication` — Parent communication
- `/admission/feedback` — Feedback collection

**Data Quality:**
- `/admission/deduplication` — Duplicate detection
- `/admission/phone-validation` — Phone validation
- `/admission/data-profiling` — Data quality scoring

**External Partners:**
- `/admission/consultants` — Education consultant management
- `/admission/consultants/new` — Add consultant
- `/admission/consultants/[id]` — Consultant detail
- `/admission/consultants/commissions` — Commission tracking
- `/admission/consultants/referrals` — Referral tracking
- `/admission/consultants/rewards` — Reward configuration
- `/admission/publishers` — Publisher management

**Supporting:**
- `/admission/scholarships` — Scholarship management
- `/admission/hostels` — Hostel requests
- `/admission/loans` — Education loan tracking
- `/admission/lateral-entry` — Lateral entry management
- `/admission/documents` — Document management

**Configuration:**
- `/admission/workflows` — Workflow automation
- `/admission/workflow-config` — Institution workflow setup
- `/admission/settings` — General settings
- `/admission/settings/whatsapp-numbers` — WhatsApp number config
- `/admission/status` — Application status tracking

**Analytics:**
- `/admission/analytics` — Overall analytics
- `/admission/insights` — AI-powered insights
- `/admission/group-dashboard` — Multi-institution dashboard

### Database Tables Referenced

| Table | Purpose |
|-------|---------|
| `admission_leads` | Core leads (CRM) |
| `admission_lead_stage_history` | Stage change audit trail |
| `admission_lead_activities` | Activity log per lead |
| `admission_lead_scores` | Calculated lead scores |
| `admission_applications` | Formal applications |
| `admission_counselors` | Counselor profiles |
| `admission_assignment_rules` | Auto-assignment rules |
| `admission_workflow_configs` | Institution workflow settings |
| `admission_campaign_logs` | Campaign execution logs |
| `admissions` | Legacy admissions table |

### Access Control Model

**Single module:** `admission`
**Actions:** `view`, `create`, `edit`, `delete`
**Super admin:** Full access to everything

**No field-level or stage-level permissions.** A user with `admission:edit` can edit ANY lead in ANY stage. There's no concept of "counselors can only edit their own leads."

---

## Summary: Priority Matrix

| Fix | Priority | Effort | Impact |
|-----|----------|--------|--------|
| #1 Auto-assignment | Critical | Small | Closes biggest conversion gap |
| #6 Webhook API | Critical | Medium | Enables inbound automation |
| #2 Duplicate detection | High | Small | Prevents data quality issues |
| #3 Stage validation | High | Medium | Prevents data integrity issues |
| #4 Phone validation | High | Small | Prevents garbage data |
| #5 Counselor notifications | High | Medium | Ensures timely response |
| #7 Score re-calculation | Medium | Medium | Keeps scoring accurate |
| #9 Stage consolidation | Medium | Large | Reduces counselor friction |
| #8 Data model merge | Medium | Large | Reduces architectural debt |
