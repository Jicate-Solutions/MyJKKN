# MyJKKN Admission CRM Enhancement Specifications

> **Purpose:** Complete technical specifications for enhancing the existing Admission CRM module with counselor adoption tools, TQM integration, and institution-specific workflow mapping.
>
> **Source:** FST Analysis (First Principles + Systems Thinking) on Admission CRM, Feb 2026
>
> **Context:** MyJKKN already has a 90%-complete Admission CRM (35+ routes, 24 DB tables, 16 services, 18 hooks). This spec focuses on ACTIVATION over new features.
>
> **Target:** Production-ready enhancements following existing MyJKKN patterns

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Phase 1: Module Verification & Repair](#2-phase-1-module-verification--repair)
3. [Phase 2: Counselor Daily View](#3-phase-2-counselor-daily-view)
4. [Phase 3: TQM Integration](#4-phase-3-tqm-integration)
5. [Phase 4: Institution Workflow Mapping](#5-phase-4-institution-workflow-mapping)
6. [Database Migrations](#6-database-migrations)
7. [API Contracts](#7-api-contracts)
8. [Testing Requirements](#8-testing-requirements)
9. [Performance Considerations](#9-performance-considerations)
10. [Implementation Order](#10-implementation-order)

---

## 1. Current State Assessment

### What Already Exists

| Layer | Count | Status |
|-------|-------|--------|
| Page Routes | 45 | All have substantial React code |
| Database Tables | 24 | Fully migrated with RLS, triggers, indexes |
| Services | 16 | Core CRUD + AI + Scoring + Campaigns |
| Hooks | 18+ categories | React Query integrated |
| Shared Components | 28 | Campaign, Scoring, Insights, Actions |
| API Routes | 2 | Consultant template + import |
| Sidebar Menu Items | 38 | Full navigation configured |

### Existing 13-Stage Funnel

```
new → contacted → qualified → application_started → application_submitted
→ documents_pending → documents_verified → interview_scheduled
→ interview_completed → offer_sent → offer_accepted → token_paid
→ enrolled   (exit: lost)
```

### Existing Database Tables (24)

**Core:** admission_leads, admission_lead_stage_history, admission_lead_activities, admission_lead_scores, admission_deduplication_matches

**Applications:** admission_applications, admission_application_documents

**Assessment:** admission_interviews, admission_interview_results, admission_gdpi_sessions, admission_gdpi_participants

**Offers:** admission_offer_letters, admission_seat_confirmations

**Configuration:** admission_counselors, admission_scoring_rules, admission_assignment_rules, admission_communication_templates, admission_workflows, admission_workflow_executions

**Financial:** admission_scholarships, admission_scholarship_applications, admission_loan_applications

**Agents:** admission_publishers, admission_publisher_leads

**Logging:** admission_sms_logs, admission_lead_scores, admission_daily_briefings, admission_ai_insights

### Known Unimplemented Hooks (Stubs)

These hooks exist but return empty/mock data:

| Hook | Status |
|------|--------|
| `useLeadCommunicationHistory` | TODO: Unimplemented |
| `useLeadAttributions` | TODO: Unimplemented |
| `useFunnelAnalyticsDashboard` | TODO: Unimplemented |
| `useSourceROI` | TODO: Unimplemented |
| `useCommunicationChannels` | TODO: Unimplemented |
| `useMessageTemplates` | TODO: Unimplemented |
| `useApplicationMutations` | TODO: Stub |
| `useCommunicationMutations` | TODO: Stub |

### Pages Using Mock Data

| Page | Mock Data Area |
|------|---------------|
| /admission/status | Pipeline flow, activity log, bottleneck analysis |
| /admission/phone-validation | Invalid numbers table, issue breakdown |
| /admission/deduplication | Duplicate matches, confidence scoring |
| /admission/scholarships | Scholarship list, student awards |

---

## 2. Phase 1: Module Verification & Repair

### Objective

Run every admission page, test every interaction, identify what's broken, fix it. No new features until the existing module works end-to-end.

### Verification Checklist

#### 2.1 Critical Path Testing (Must Work)

These represent the core admission workflow a counselor uses daily:

| # | Test | Route | Expected | Priority |
|---|------|-------|----------|----------|
| 1 | Dashboard loads with real data | /admission/dashboard | KPI cards show actual lead counts from DB | P0 |
| 2 | Create a new lead | /admission/leads/new | Lead saved to admission_leads, appears in list | P0 |
| 3 | View lead list with filters | /admission/leads | Leads paginate, search works, stage filter works | P0 |
| 4 | View lead detail | /admission/leads/[id] | All lead fields display, timeline shows | P0 |
| 5 | Update lead stage | /admission/leads/[id] | Stage changes, history logged in stage_history table | P0 |
| 6 | Assign counselor to lead | /admission/leads/[id] | counselor_id set, counselor's current_leads increments | P0 |
| 7 | Log activity on lead | /admission/leads/[id] | Activity saved, appears in timeline | P0 |
| 8 | Schedule follow-up | /admission/leads/[id] | next_followup_at set, appears in dashboard | P0 |
| 9 | Mark lead as hot/warm/cold | /admission/leads | Priority toggles work, icon changes | P0 |
| 10 | Create application from lead | /admission/applications | Application created with APP-number, linked to lead | P0 |

#### 2.2 Secondary Path Testing (Should Work)

| # | Test | Route | Expected | Priority |
|---|------|-------|----------|----------|
| 11 | Funnel visualization accuracy | /admission/dashboard | Bar widths match actual stage counts | P1 |
| 12 | Lead scoring calculates | /admission/leads/[id] | Score computes from engagement + quality data | P1 |
| 13 | Counselor list loads | /admission/counselors | Active counselors with lead counts shown | P1 |
| 14 | Analytics dashboard | /admission/analytics | Charts render with real or empty-state data | P1 |
| 15 | Communication templates list | /admission/templates | Templates load from DB or show empty state | P1 |
| 16 | Interview scheduling | /admission/interviews | Can create interview linked to application | P1 |
| 17 | Offer letter generation | /admission/offer-letter | Offer creates with OFR-number | P1 |
| 18 | Seat confirmation flow | /admission/seat-confirmation | Confirmation creates with CNF-number | P1 |
| 19 | Document upload & verification | /admission/documents | Upload works, status can be changed | P1 |
| 20 | GD-PI session management | /admission/gd-pi | Sessions and participants manageable | P1 |

#### 2.3 Configuration Testing (Nice to Have Working)

| # | Test | Route | Expected | Priority |
|---|------|-------|----------|----------|
| 21 | Scoring rules CRUD | /admission/scoring-rules | Rules save/update/delete | P2 |
| 22 | Assignment rules CRUD | /admission/assignment-rules | Rules save/update/delete | P2 |
| 23 | Workflow builder | /admission/workflows | Workflows save with triggers and actions | P2 |
| 24 | Campaign monitoring | /admission/campaigns/monitoring | Campaign stats display | P2 |
| 25 | AI insights generation | /admission/insights | Insights generate (requires CLAUDE_API_KEY) | P2 |
| 26 | Daily briefing | /admission/briefing | Briefing content loads for user role | P2 |
| 27 | Consultant management | /admission/consultants | CRUD + commission tracking | P2 |
| 28 | Publisher management | /admission/publishers | Publisher list, lead attribution | P2 |
| 29 | Deduplication detection | /admission/deduplication | Duplicate matches found on real data | P2 |
| 30 | Phone validation | /admission/phone-validation | Validation runs on lead phone numbers | P2 |

### Repair Strategy

For each broken item found:

```
1. Identify: What breaks? (console error, empty data, crash)
2. Categorize:
   - DATA issue → Missing test data, wrong institution_id
   - SERVICE issue → Supabase query error, RLS blocking
   - UI issue → Component error, missing import
   - HOOK issue → Wrong query key, missing dependency
3. Fix in order: DATA → SERVICE → HOOK → UI
4. Verify fix: Run the same test again, confirm with screenshot
```

### Test Data Requirements

To verify the module, the staging database needs:

| Entity | Minimum Count | Purpose |
|--------|--------------|---------|
| Leads | 50 | Test pagination, filters, scoring |
| Leads (stage: new) | 10 | Dashboard "new leads today" |
| Leads (stage: contacted) | 8 | Funnel visualization |
| Leads (stage: qualified) | 7 | Stage progression |
| Leads (priority: hot) | 5 | Hot leads list |
| Leads (with counselor_id) | 20 | Counselor workload testing |
| Leads (with next_followup_at = today) | 5 | Follow-up reminders |
| Counselors | 5 | Assignment testing |
| Applications | 10 | Application pipeline |
| Interviews | 3 | Interview scheduling |
| Activities per lead | 5 | Timeline display |
| Stage history entries | 30 | Audit trail testing |
| Scoring rules | 3 | Scoring engine |
| Communication templates | 3 | Template display (1 SMS, 1 email, 1 WhatsApp) |

### SQL for Test Data Seeding

Create file: `supabase/seed/admission-test-data.sql`

This should generate realistic test data for the staging database (hhprjbgknupaplivtoib) with:
- Leads from various sources across multiple programs
- A realistic funnel distribution (many at top, few at bottom)
- Counselor assignments with varying loads
- Activity history showing realistic interaction patterns
- Score values reflecting the scoring algorithm output

---

## 3. Phase 2: Counselor Daily View

### Objective

Build the single most important page for adoption: the **Counselor's Daily Command Center**. One page that answers: "What do I do today?"

### Why This Is the #1 Leverage Point

| Current State | Desired State |
|--------------|--------------|
| Counselor opens /admission/dashboard → sees management metrics | Counselor opens app → sees **their** follow-ups, **their** hot leads, **their** numbers |
| 35+ pages to navigate | 1 page with everything needed for the day |
| No urgency signals | Clear "do this NOW" prioritization |
| No personal accountability | "Your conversion: 67%" visible at all times |

### 3.1 Page Specification

**Route:** `/admission/counselor-view`

**Access:** Any user with role that has admission access. Counselor sees their own data. Managers see a counselor selector dropdown.

**Layout:** Single-page, no tabs, no sub-navigation. Everything visible on scroll.

#### Section 1: Personal KPI Strip (Top Bar)

```
┌────────────┬────────────┬────────────┬────────────┬────────────┐
│ My Leads   │ Follow-ups │ Hot Leads  │ Conversions│ Response   │
│ Today      │ Due Today  │   Active   │ This Month │ Time (avg) │
│   12       │    5 🔴    │    3 🔥    │   67%  ↑   │  2.4 hrs   │
└────────────┴────────────┴────────────┴────────────┴────────────┘
```

| KPI | Source Query | Calculation |
|-----|-------------|-------------|
| My Leads Today | `admission_leads WHERE counselor_id = :me AND created_at >= today` | COUNT |
| Follow-ups Due Today | `admission_leads WHERE counselor_id = :me AND next_followup_at::date = today AND funnel_stage != 'lost'` | COUNT |
| Hot Leads Active | `admission_leads WHERE counselor_id = :me AND priority = 'hot' AND funnel_stage NOT IN ('enrolled', 'lost')` | COUNT |
| Conversions This Month | `admission_leads WHERE counselor_id = :me AND funnel_stage = 'enrolled' AND updated_at >= first_of_month` / total leads this month | PERCENTAGE |
| Avg Response Time | `AVG(first_activity.created_at - lead.created_at) WHERE counselor_id = :me AND created_at >= 30_days_ago` | HOURS |

#### Section 2: Today's Follow-ups (Priority List)

**The core of the page.** Ordered by urgency.

```
┌─────────────────────────────────────────────────────────────────┐
│ 📋 TODAY'S FOLLOW-UPS (5 due)                          Sort ▼  │
├─────────────────────────────────────────────────────────────────┤
│ 🔥 Priya Sharma          B.Pharm    Stage: Qualified          │
│    📞 9876543210          Score: 85  Overdue: 2 days           │
│    Last: "Called, asked about hostel" (Jan 4)                   │
│    [Call Now] [WhatsApp] [Move Stage ▼] [Reschedule]           │
├─────────────────────────────────────────────────────────────────┤
│ ⭐ Rahul Kumar            B.E. CSE   Stage: Contacted          │
│    📞 9876543211          Score: 72  Due: Today                │
│    Last: "Sent brochure via WhatsApp" (Jan 5)                   │
│    [Call Now] [WhatsApp] [Move Stage ▼] [Reschedule]           │
├─────────────────────────────────────────────────────────────────┤
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

**Data source:**

```sql
SELECT
  l.id, l.full_name, l.phone, l.email,
  l.program_interest, l.funnel_stage, l.priority, l.score,
  l.next_followup_at,
  -- Last activity
  (SELECT json_build_object(
    'type', a.activity_type,
    'description', a.description,
    'created_at', a.created_at
  ) FROM admission_lead_activities a
  WHERE a.lead_id = l.id
  ORDER BY a.created_at DESC LIMIT 1) as last_activity,
  -- Overdue calculation
  CASE
    WHEN l.next_followup_at < NOW() THEN 'overdue'
    WHEN l.next_followup_at::date = CURRENT_DATE THEN 'today'
    ELSE 'upcoming'
  END as urgency
FROM admission_leads l
WHERE l.counselor_id = :counselor_id
  AND l.next_followup_at IS NOT NULL
  AND l.next_followup_at::date <= CURRENT_DATE + INTERVAL '1 day'
  AND l.funnel_stage NOT IN ('enrolled', 'lost')
ORDER BY
  CASE WHEN l.next_followup_at < NOW() THEN 0 ELSE 1 END,  -- Overdue first
  l.priority = 'hot' DESC,                                    -- Hot leads first
  l.score DESC,                                                -- High score next
  l.next_followup_at ASC                                       -- Earliest due next
```

**Inline Actions (no page navigation needed):**

| Action | What Happens |
|--------|-------------|
| **Call Now** | Opens `tel:` link on mobile, logs "call" activity automatically |
| **WhatsApp** | Opens `https://wa.me/91{phone}` with pre-filled template, logs "whatsapp" activity |
| **Move Stage** | Dropdown to advance stage (only forward stages shown), auto-logs stage change |
| **Reschedule** | Date picker popup, updates next_followup_at |
| **Quick Note** | Expandable text field, saves as activity with type "note" |

#### Section 3: New Unassigned Leads (For Managers)

Only visible to users with manager/admin role. Shows leads with `counselor_id IS NULL`.

```
┌─────────────────────────────────────────────────────────────────┐
│ 🆕 UNASSIGNED LEADS (8 new)                    Auto-assign ▼  │
├─────────────────────────────────────────────────────────────────┤
│ ☐ Anjali Devi    B.Sc Nursing   Website   Score: 45   2h ago  │
│ ☐ Mohammed Rizwan B.E. Mech     Walk-in   Score: 62   4h ago  │
│ ☐ Kavitha S      B.Pharm        Agent     Score: 78   1d ago  │
│                                                                 │
│ Selected: 2    [Assign to ▼ Counselor]  [Auto-assign All]      │
└─────────────────────────────────────────────────────────────────┘
```

#### Section 4: My Pipeline Summary (Mini Funnel)

Compact horizontal funnel showing only the counselor's leads:

```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 MY PIPELINE                                                  │
│                                                                  │
│ New(3) → Contacted(5) → Qualified(4) → Applied(2) → Offer(1)  │
│ ████████  ██████████████  ████████████  ████████    ██████      │
│                                                                  │
│ Total Active: 15 leads    This Month: +8 new, 3 converted      │
└─────────────────────────────────────────────────────────────────┘
```

#### Section 5: Activity Log (What I Did Today)

```
┌─────────────────────────────────────────────────────────────────┐
│ ✅ TODAY'S ACTIVITY (7 actions)                                  │
├─────────────────────────────────────────────────────────────────┤
│ 2:30 PM  📞 Called Priya Sharma - "Interested, sending docs"   │
│ 2:15 PM  💬 WhatsApp sent to Rahul Kumar - Brochure            │
│ 1:45 PM  📝 Note added on Kavitha S - "Visit scheduled Jan 10" │
│ 11:00 AM 📞 Called Mohammed R - No answer                       │
│ 10:30 AM ➡️ Moved Anjali Devi: new → contacted                 │
│ 10:15 AM 📞 Called Anjali Devi - "Explained B.Sc Nursing"      │
│ 9:30 AM  🔥 Marked Priya Sharma as HOT                         │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Technical Implementation

#### New Files to Create

```
app/(routes)/admission/counselor-view/
├── page.tsx                              # Main page with all sections
├── _components/
│   ├── counselor-kpi-strip.tsx           # Top KPI bar
│   ├── followup-list.tsx                 # Today's follow-ups with inline actions
│   ├── followup-card.tsx                 # Single follow-up card with actions
│   ├── unassigned-leads-panel.tsx        # Manager-only unassigned leads
│   ├── mini-pipeline.tsx                 # Compact funnel visualization
│   ├── today-activity-log.tsx            # Activity feed for today
│   ├── quick-note-input.tsx              # Inline note entry
│   └── stage-advance-dropdown.tsx        # Inline stage advancement

hooks/admission/
├── use-counselor-daily-view.ts           # Composite hook for all daily view data
├── use-todays-followups.ts              # Follow-ups due today with urgency
├── use-counselor-kpis.ts               # Personal KPI calculations
├── use-counselor-pipeline.ts           # Mini funnel for current counselor

lib/services/admission/
├── counselor-daily-view-service.ts      # Optimized queries for daily view
```

#### New Database Query: Counselor Daily View (Optimized)

Create a database function for the daily view to reduce round-trips:

```sql
CREATE OR REPLACE FUNCTION get_counselor_daily_view(
  p_counselor_id UUID,
  p_institution_id UUID
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'kpis', (
      SELECT json_build_object(
        'my_leads_today', COUNT(*) FILTER (
          WHERE created_at >= CURRENT_DATE AND counselor_id = p_counselor_id
        ),
        'followups_due', COUNT(*) FILTER (
          WHERE next_followup_at::date <= CURRENT_DATE
          AND next_followup_at IS NOT NULL
          AND counselor_id = p_counselor_id
          AND funnel_stage NOT IN ('enrolled', 'lost')
        ),
        'hot_leads', COUNT(*) FILTER (
          WHERE priority = 'hot'
          AND counselor_id = p_counselor_id
          AND funnel_stage NOT IN ('enrolled', 'lost')
        ),
        'total_active', COUNT(*) FILTER (
          WHERE counselor_id = p_counselor_id
          AND funnel_stage NOT IN ('enrolled', 'lost')
        ),
        'enrolled_this_month', COUNT(*) FILTER (
          WHERE counselor_id = p_counselor_id
          AND funnel_stage = 'enrolled'
          AND updated_at >= date_trunc('month', CURRENT_DATE)
        ),
        'total_this_month', COUNT(*) FILTER (
          WHERE counselor_id = p_counselor_id
          AND created_at >= date_trunc('month', CURRENT_DATE)
        )
      )
      FROM admission_leads
      WHERE institution_id = p_institution_id
    ),
    'pipeline', (
      SELECT json_agg(
        json_build_object('stage', funnel_stage, 'count', cnt)
      )
      FROM (
        SELECT funnel_stage, COUNT(*) as cnt
        FROM admission_leads
        WHERE counselor_id = p_counselor_id
          AND institution_id = p_institution_id
          AND funnel_stage NOT IN ('lost')
        GROUP BY funnel_stage
      ) s
    ),
    'unassigned_count', (
      SELECT COUNT(*)
      FROM admission_leads
      WHERE institution_id = p_institution_id
        AND counselor_id IS NULL
        AND funnel_stage = 'new'
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Counselor Identification

The system needs to map the logged-in user to their counselor record:

```sql
-- Get counselor record for logged-in user
SELECT c.id as counselor_id, c.name, c.max_leads, c.current_leads
FROM admission_counselors c
WHERE c.user_id = auth.uid()
  AND c.is_active = true
LIMIT 1;
```

If no counselor record exists for the user, show a message: "You are not registered as a counselor. Contact your admin."

For managers/admins: Show a counselor selector dropdown that defaults to "All" and allows filtering by specific counselor.

### 3.3 UX Requirements

| Requirement | Details |
|-------------|---------|
| **Load time** | < 1.5 seconds for all sections (use single DB function call) |
| **Mobile-first** | Counselors use phones at fairs. Stack sections vertically. |
| **Offline indicator** | Show banner when offline. Allow viewing cached data. |
| **Auto-refresh** | Refresh data every 60 seconds silently (React Query refetchInterval) |
| **Click-to-call** | Phone numbers are clickable `tel:` links |
| **WhatsApp deep links** | Open WhatsApp with pre-filled greeting template |
| **Swipe actions (mobile)** | Swipe right = Call, Swipe left = Reschedule |
| **Today badge** | Sidebar "Counselor View" shows badge with follow-up count |
| **Sound notification** | Optional: Play sound when new lead assigned (via briefing system) |

### 3.4 Sidebar Integration

Add to sidebar menu:

```typescript
{
  title: "My Day",
  href: "/admission/counselor-view",
  icon: CalendarCheck,  // from lucide-react
  badge: followupCount, // Dynamic count of today's follow-ups
  position: "top",      // Show at the TOP of admission section
}
```

---

## 4. Phase 3: TQM Integration

### Objective

Connect admission funnel data to TQM modules (Process Excellence, COPQ, Stakeholder NPS) so that admission quality is measurable, trackable, and improvable using TQM methodology.

### 4.1 Admission as a TQM Process Definition

Register the admission funnel as a **process** in the process-excellence module:

#### Process Definition

```json
{
  "process_name": "Student Admission Process",
  "process_code": "ADM-001",
  "owner_role": "admission_head",
  "stages": [
    {
      "stage_id": 1,
      "name": "Lead Capture",
      "funnel_stage": "new",
      "is_value_add": false,
      "target_duration_hours": 0,
      "description": "Lead enters the system from any source"
    },
    {
      "stage_id": 2,
      "name": "First Contact",
      "funnel_stage": "contacted",
      "is_value_add": true,
      "target_duration_hours": 24,
      "sla_hours": 4,
      "description": "Counselor makes first contact with lead"
    },
    {
      "stage_id": 3,
      "name": "Qualification",
      "funnel_stage": "qualified",
      "is_value_add": true,
      "target_duration_hours": 48,
      "description": "Lead eligibility verified for target program"
    },
    {
      "stage_id": 4,
      "name": "Application",
      "funnel_stage": "application_submitted",
      "is_value_add": true,
      "target_duration_hours": 168,
      "description": "Student completes and submits application"
    },
    {
      "stage_id": 5,
      "name": "Document Verification",
      "funnel_stage": "documents_verified",
      "is_value_add": true,
      "target_duration_hours": 72,
      "sla_hours": 48,
      "description": "All documents verified and approved"
    },
    {
      "stage_id": 6,
      "name": "Assessment",
      "funnel_stage": "interview_completed",
      "is_value_add": true,
      "target_duration_hours": 168,
      "description": "Interview/GD-PI/screening completed"
    },
    {
      "stage_id": 7,
      "name": "Offer & Acceptance",
      "funnel_stage": "offer_accepted",
      "is_value_add": true,
      "target_duration_hours": 168,
      "description": "Offer sent and accepted by student"
    },
    {
      "stage_id": 8,
      "name": "Enrollment",
      "funnel_stage": "enrolled",
      "is_value_add": true,
      "target_duration_hours": 336,
      "description": "Fee paid, seat confirmed, student enrolled"
    }
  ],
  "target_cycle_time_hours": 720,
  "sla_hours": 504,
  "value_add_ratio_target": 0.75
}
```

### 4.2 Metrics That Feed Into Process Excellence

Create a view or function that computes these metrics from admission data:

| TQM Metric | Source Tables | Calculation |
|------------|--------------|-------------|
| **Cycle Time** | admission_lead_stage_history | `MAX(created_at) - MIN(created_at)` per lead, from 'new' to 'enrolled' |
| **Stage Duration** | admission_lead_stage_history | Time between consecutive stage changes per lead |
| **Value-Add Ratio** | Mapped from stage definitions | Sum(value-add stage durations) / Total cycle time |
| **SLA Compliance: First Contact** | admission_leads, admission_lead_activities | % of leads contacted within 4 hours of creation |
| **SLA Compliance: Document Verification** | admission_application_documents | % of documents verified within 48 hours of upload |
| **Throughput** | admission_leads | Leads processed per month per counselor |
| **Drop-off Rate per Stage** | admission_lead_stage_history | % of leads that exit at each stage |
| **Bottleneck Stage** | admission_lead_stage_history | Stage with highest average duration |
| **Rework Rate** | admission_lead_stage_history | Leads that move backwards in the funnel |

#### SQL: Admission Process Metrics View

```sql
CREATE OR REPLACE VIEW admission_process_metrics AS
WITH lead_cycle AS (
  SELECT
    l.id as lead_id,
    l.institution_id,
    l.counselor_id,
    l.funnel_stage,
    l.created_at as lead_created_at,
    -- First contact time
    (SELECT MIN(a.created_at)
     FROM admission_lead_activities a
     WHERE a.lead_id = l.id
       AND a.activity_type IN ('call', 'email', 'whatsapp', 'meeting')
    ) as first_contact_at,
    -- Enrollment time
    (SELECT h.created_at
     FROM admission_lead_stage_history h
     WHERE h.lead_id = l.id AND h.to_stage = 'enrolled'
     ORDER BY h.created_at DESC LIMIT 1
    ) as enrolled_at,
    -- Total cycle time in hours
    CASE WHEN l.funnel_stage = 'enrolled' THEN
      EXTRACT(EPOCH FROM (
        (SELECT h.created_at FROM admission_lead_stage_history h
         WHERE h.lead_id = l.id AND h.to_stage = 'enrolled'
         ORDER BY h.created_at DESC LIMIT 1)
        - l.created_at
      )) / 3600
    END as cycle_time_hours,
    -- First response time in hours
    EXTRACT(EPOCH FROM (
      COALESCE(
        (SELECT MIN(a.created_at)
         FROM admission_lead_activities a
         WHERE a.lead_id = l.id
           AND a.activity_type IN ('call', 'email', 'whatsapp', 'meeting')),
        NOW()
      ) - l.created_at
    )) / 3600 as first_response_hours
  FROM admission_leads l
  WHERE l.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '6 months')
)
SELECT
  institution_id,
  date_trunc('month', lead_created_at) as month,
  COUNT(*) as total_leads,
  COUNT(*) FILTER (WHERE funnel_stage = 'enrolled') as enrolled_count,
  ROUND(AVG(cycle_time_hours) FILTER (WHERE cycle_time_hours IS NOT NULL), 1) as avg_cycle_time_hours,
  ROUND(AVG(first_response_hours), 1) as avg_first_response_hours,
  COUNT(*) FILTER (WHERE first_response_hours <= 4)::DECIMAL / NULLIF(COUNT(*), 0) * 100
    as first_contact_sla_pct,
  COUNT(*) FILTER (WHERE funnel_stage = 'lost')::DECIMAL / NULLIF(COUNT(*), 0) * 100
    as lost_rate_pct,
  COUNT(*) FILTER (WHERE funnel_stage = 'enrolled')::DECIMAL / NULLIF(COUNT(*), 0) * 100
    as conversion_rate_pct
FROM lead_cycle
GROUP BY institution_id, date_trunc('month', lead_created_at)
ORDER BY month DESC;
```

### 4.3 COPQ Integration (Cost of Poor Quality in Admissions)

Admission waste feeds directly into the billing-copq module. Define these COPQ categories:

#### Visible Costs (Above the Waterline)

| COPQ Category | How to Calculate | Source |
|---------------|-----------------|--------|
| **Lost hot leads** | Count of leads with priority='hot' that reached stage 'lost' x Average fee for their program_interest | admission_leads WHERE priority='hot' AND funnel_stage='lost' |
| **Expired offers** | Count of offers with status='expired' x token_amount | admission_offer_letters WHERE status='expired' |
| **Refunded seats** | Count of seat confirmations with status='refunded' | admission_seat_confirmations WHERE token_payment_status='refunded' |
| **Wasted ad spend** | Leads from paid sources (google_ads, facebook_ads) that never converted | admission_leads WHERE source IN ('google_ads','facebook_ads') AND funnel_stage='lost' |

#### Hidden Costs (Below the Waterline)

| COPQ Category | Estimation Method |
|---------------|------------------|
| **Counselor time on unqualified leads** | leads with score < 30 that counselor worked on x avg counselor hourly cost x avg time per interaction |
| **Duplicate lead rework** | deduplication_matches count x avg time to identify and merge |
| **Document re-verification** | documents with status='reupload_requested' count x verification time |
| **Interview no-shows** | interviews with status='no_show' x panelist time + venue cost |
| **Reputation cost of slow response** | Leads lost where first_response_hours > 24 x estimated lifetime value |

#### Auto-logging COPQ from Admission Events

Create database triggers that automatically log COPQ incidents:

```sql
-- Trigger: When a hot lead is lost, log COPQ
CREATE OR REPLACE FUNCTION log_admission_copq_on_lead_lost()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.funnel_stage = 'lost' AND OLD.funnel_stage != 'lost' AND OLD.priority = 'hot' THEN
    INSERT INTO billing_copq_incidents (
      institution_id, category, sub_category,
      description, visible_cost, hidden_cost_estimate,
      source_module, source_record_id,
      root_cause, created_at
    ) VALUES (
      NEW.institution_id,
      'lost_revenue',
      'hot_lead_lost',
      format('Hot lead %s (%s) lost at stage %s', NEW.full_name, NEW.program_interest, OLD.funnel_stage),
      0,  -- Will be calculated by COPQ module based on program fee
      0,  -- Estimated by COPQ module
      'admission',
      NEW.id,
      NULL,  -- To be filled by admission head
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: When an offer expires, log COPQ
CREATE OR REPLACE FUNCTION log_admission_copq_on_offer_expired()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'expired' AND OLD.status != 'expired' THEN
    INSERT INTO billing_copq_incidents (
      institution_id, category, sub_category,
      description, visible_cost, hidden_cost_estimate,
      source_module, source_record_id,
      created_at
    ) VALUES (
      (SELECT institution_id FROM admission_applications WHERE id = NEW.application_id),
      'lost_revenue',
      'offer_expired',
      format('Offer %s expired - Net fees: %s', NEW.offer_number, NEW.net_fees),
      NEW.token_amount,  -- Direct lost revenue
      NEW.net_fees * 0.1,  -- 10% of total as hidden cost estimate
      'admission',
      NEW.id,
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 4.4 Stakeholder NPS Integration

Connect admission experience to the NPS module:

| NPS Survey Trigger | Target | Timing |
|-------------------|--------|--------|
| Post-enrollment | Student | 7 days after enrollment |
| Post-enrollment | Parent | 14 days after enrollment |
| Post-rejection | Student (rejected) | 3 days after offer rejection |
| After campus visit | Walk-in leads | Same day |

```sql
-- Trigger: When lead reaches 'enrolled', schedule NPS survey
CREATE OR REPLACE FUNCTION schedule_admission_nps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.funnel_stage = 'enrolled' AND OLD.funnel_stage != 'enrolled' THEN
    -- Schedule student NPS for 7 days later
    INSERT INTO nps_survey_schedule (
      institution_id, survey_type, stakeholder_type,
      target_id, target_contact, scheduled_for,
      context, created_at
    ) VALUES (
      NEW.institution_id,
      'admission_experience',
      'student',
      NEW.id,
      COALESCE(NEW.email, NEW.phone),
      NOW() + INTERVAL '7 days',
      json_build_object('lead_id', NEW.id, 'program', NEW.program_interest, 'source', NEW.source),
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 4.5 TQM Dashboard Widget

Add an "Admission Quality" card to the TQM process-excellence dashboard:

```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 ADMISSION PROCESS QUALITY                    This Month     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Conversion Rate:  12.5%  (↑ 2.1% vs last month)               │
│ Avg Cycle Time:   18 days (Target: 21 days) ✅                  │
│ First Contact SLA: 78%  (Target: 90%) ⚠️                       │
│ Doc Verification:  92%  within 48hrs ✅                          │
│ Value-Add Ratio:   68%  (Target: 75%) ⚠️                       │
│                                                                  │
│ COPQ This Month:  ₹2.4L visible + ₹8.1L hidden                │
│ Top Waste:  Lost hot leads (₹5.2L) | Offer expiry (₹1.8L)     │
│                                                                  │
│ [View Full Process Analysis →]                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.6 New Files for TQM Integration

```
lib/services/admission/
├── admission-tqm-metrics-service.ts    # Computes TQM metrics from admission data

hooks/admission/
├── use-admission-tqm-metrics.ts        # Hook for TQM widget data

app/(routes)/process-excellence/_components/
├── admission-quality-card.tsx           # TQM dashboard widget

supabase/migrations/
├── YYYYMMDD_admission_tqm_integration.sql  # View + triggers for COPQ auto-logging
```

---

## 5. Phase 4: Institution Workflow Mapping

### Objective

JKKN has multiple institution types (engineering, pharmacy, nursing, school, arts & science). Each has a DIFFERENT admission process. Map the actual workflow per type and configure the CRM accordingly.

### 5.1 Institution Types at JKKN

| Institution | Type | Key Admission Differences |
|-------------|------|--------------------------|
| JKKN College of Engineering | Engineering | TNEA counseling, JEE scores, lateral entry |
| JKKN College of Pharmacy | Pharmacy | NEET scores, TNPSC counseling |
| JKKN College of Allied Health Sciences | Allied Health | NEET for some, direct merit for others |
| JKKN College of Arts & Science | Arts & Science | +2 marks-based merit |
| JKKN Dental College | Dental | NEET scores, MCC counseling |
| JKKN School | K-12 | Age verification, parent interaction, observation session |
| JKKN Nursing College | Nursing | NEET for B.Sc, merit for others |
| JKKN College of Education | Education | Degree marks-based |
| JKKN International School | International | Different curriculum (IB/IGCSE), parent interview |

### 5.2 Workflow Configuration Schema

Add a new table to store institution-specific workflow configurations:

```sql
CREATE TABLE admission_workflow_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  config_name TEXT NOT NULL,
  academic_year TEXT NOT NULL, -- e.g., '2026-27'

  -- Stage Configuration
  active_stages TEXT[] NOT NULL DEFAULT ARRAY[
    'new','contacted','qualified','application_started',
    'application_submitted','documents_pending','documents_verified',
    'interview_scheduled','interview_completed','offer_sent',
    'offer_accepted','token_paid','enrolled'
  ],

  -- Stage-specific settings
  stage_configs JSONB NOT NULL DEFAULT '{}',
  -- Example: {
  --   "qualified": { "required_fields": ["percentage", "board"], "min_percentage": 60 },
  --   "interview_scheduled": { "enabled": true, "types": ["in_person", "video"] },
  --   "documents_verified": { "required_documents": ["photo","marksheet_10th","marksheet_12th"] }
  -- }

  -- Assessment configuration
  has_entrance_exam BOOLEAN DEFAULT false,
  entrance_exam_type TEXT, -- 'NEET', 'JEE', 'TNEA', 'internal', null
  has_gd_pi BOOLEAN DEFAULT false,
  has_merit_list BOOLEAN DEFAULT true,
  merit_criteria JSONB DEFAULT '{}',
  -- Example: { "weightage": { "marks_12th": 60, "entrance": 30, "interview": 10 } }

  -- Reservation/Quota
  has_government_quota BOOLEAN DEFAULT false,
  government_quota_percentage DECIMAL(5,2) DEFAULT 0,
  has_management_quota BOOLEAN DEFAULT true,
  has_nri_quota BOOLEAN DEFAULT false,
  quota_config JSONB DEFAULT '{}',
  -- Example: { "government": 65, "management": 30, "nri": 5 }

  -- Document requirements per institution type
  required_documents TEXT[] DEFAULT ARRAY['photo','id_proof','marksheet_10th','marksheet_12th'],

  -- Communication preferences
  default_templates JSONB DEFAULT '{}',
  -- Example: { "welcome_sms": "template_id_1", "application_confirm": "template_id_2" }

  -- SLA configuration
  sla_config JSONB DEFAULT '{}',
  -- Example: {
  --   "first_contact_hours": 4,
  --   "document_verification_hours": 48,
  --   "offer_validity_days": 14,
  --   "token_payment_days": 7
  -- }

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure one active config per institution per year
CREATE UNIQUE INDEX idx_workflow_config_unique
ON admission_workflow_configs(institution_id, academic_year)
WHERE is_active = true;
```

### 5.3 Pre-configured Workflows per Institution Type

#### Engineering College (TNEA + Management Quota)

```json
{
  "config_name": "Engineering Admission 2026-27",
  "active_stages": ["new","contacted","qualified","application_started","application_submitted","documents_pending","documents_verified","merit_list","offer_sent","offer_accepted","token_paid","enrolled"],
  "has_entrance_exam": false,
  "entrance_exam_type": "TNEA",
  "has_gd_pi": false,
  "has_merit_list": true,
  "merit_criteria": {
    "weightage": { "marks_12th": 100 },
    "cutoff": { "general": 60, "obc": 55, "sc_st": 50 }
  },
  "has_government_quota": true,
  "government_quota_percentage": 65,
  "quota_config": { "government": 65, "management": 35 },
  "required_documents": ["photo","id_proof","marksheet_10th","marksheet_12th","transfer_certificate","community_certificate"],
  "sla_config": {
    "first_contact_hours": 4,
    "document_verification_hours": 48,
    "offer_validity_days": 14,
    "token_payment_days": 7
  }
}
```

#### Pharmacy College (NEET-based)

```json
{
  "config_name": "Pharmacy Admission 2026-27",
  "active_stages": ["new","contacted","qualified","application_started","application_submitted","documents_pending","documents_verified","offer_sent","offer_accepted","token_paid","enrolled"],
  "has_entrance_exam": true,
  "entrance_exam_type": "NEET",
  "has_gd_pi": false,
  "has_merit_list": true,
  "merit_criteria": {
    "weightage": { "neet_score": 70, "marks_12th": 30 },
    "cutoff": { "neet_minimum": 130, "general_12th": 50 }
  },
  "has_government_quota": true,
  "government_quota_percentage": 65,
  "required_documents": ["photo","id_proof","marksheet_10th","marksheet_12th","neet_scorecard","transfer_certificate","community_certificate"],
  "sla_config": {
    "first_contact_hours": 2,
    "document_verification_hours": 24,
    "offer_validity_days": 7,
    "token_payment_days": 3
  }
}
```

#### School (K-12)

```json
{
  "config_name": "School Admission 2026-27",
  "active_stages": ["new","contacted","qualified","application_started","application_submitted","interview_scheduled","interview_completed","offer_sent","offer_accepted","token_paid","enrolled"],
  "has_entrance_exam": false,
  "has_gd_pi": false,
  "has_merit_list": false,
  "merit_criteria": {
    "weightage": { "age_verification": 40, "parent_interaction": 30, "observation": 30 }
  },
  "stage_configs": {
    "qualified": { "required_fields": ["date_of_birth"], "age_verification": true },
    "interview_scheduled": { "enabled": true, "types": ["in_person"], "label": "Parent Interaction & Student Observation" }
  },
  "required_documents": ["photo","birth_certificate","previous_report_card","transfer_certificate","address_proof"],
  "sla_config": {
    "first_contact_hours": 2,
    "document_verification_hours": 24,
    "offer_validity_days": 7,
    "token_payment_days": 3
  }
}
```

### 5.4 Adaptive UI Based on Workflow Config

The admission module should read the workflow config for the current institution and adapt:

| UI Element | Adaptation |
|------------|-----------|
| **Funnel visualization** | Only shows stages in `active_stages` |
| **Lead form** | Shows/hides fields based on `stage_configs.qualified.required_fields` |
| **Document checklist** | Uses `required_documents` array |
| **Interview section** | Hidden if `has_gd_pi = false` AND no interview stage |
| **Merit list page** | Hidden if `has_merit_list = false` |
| **Entrance exam field** | Shows NEET/JEE input if `has_entrance_exam = true` |
| **Stage labels** | Can be renamed (e.g., "interview" → "Parent Interaction" for schools) |
| **SLA indicators** | Uses institution-specific SLA from config |

### 5.5 Cross-Institution Features

For JKKN management to see across all institutions:

#### Group Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│ 🏫 JKKN GROUP ADMISSION OVERVIEW         Academic Year 2026-27  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Institution          │ Leads │ Applied │ Enrolled │ Fill %  │   │
│ ─────────────────────┼───────┼─────────┼──────────┼─────────┤   │
│ Engineering          │  450  │   180   │    120   │  80%    │   │
│ Pharmacy             │  320  │   150   │     95   │  75%    │   │
│ Nursing              │  280  │   120   │     88   │  88%    │   │
│ School               │  500  │   380   │    350   │  93%    │   │
│ Arts & Science       │  200  │    90   │     60   │  60%    │   │
│ Dental               │  180  │    80   │     55   │  69%    │   │
│ Allied Health        │  150  │    70   │     45   │  64%    │   │
│ Education            │  100  │    50   │     35   │  70%    │   │
│ International School │   80  │    60   │     50   │  83%    │   │
│ ─────────────────────┼───────┼─────────┼──────────┼─────────┤   │
│ TOTAL                │ 2,260 │  1,180  │    898   │  76%    │   │
│                                                                  │
│ [Export for NAAC →]  [Compare Year-over-Year →]                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Cross-campus Lead Deduplication

```sql
-- Find duplicates ACROSS institutions
SELECT
  l1.id as lead_1_id, l1.institution_id as inst_1,
  l2.id as lead_2_id, l2.institution_id as inst_2,
  l1.full_name, l1.phone,
  CASE
    WHEN l1.phone = l2.phone AND l1.email = l2.email THEN 1.0
    WHEN l1.phone = l2.phone THEN 0.9
    WHEN l1.email = l2.email THEN 0.8
  END as confidence
FROM admission_leads l1
JOIN admission_leads l2 ON (
  (l1.phone = l2.phone OR l1.email = l2.email)
  AND l1.id < l2.id  -- Prevent duplicate pairs
  AND l1.institution_id != l2.institution_id  -- Cross-institution only
)
WHERE l1.funnel_stage NOT IN ('enrolled', 'lost')
  AND l2.funnel_stage NOT IN ('enrolled', 'lost')
ORDER BY confidence DESC;
```

#### NAAC Report Generator

```sql
-- NAAC Criteria 2.1.1: Average Enrollment Percentage (5 years)
SELECT
  i.name as institution_name,
  ay.academic_year,
  sanctioned.total_seats as sanctioned_intake,
  COUNT(l.id) FILTER (WHERE l.funnel_stage = 'enrolled') as students_admitted,
  ROUND(
    COUNT(l.id) FILTER (WHERE l.funnel_stage = 'enrolled')::DECIMAL
    / NULLIF(sanctioned.total_seats, 0) * 100, 2
  ) as enrollment_percentage
FROM institutions i
CROSS JOIN (VALUES ('2021-22'),('2022-23'),('2023-24'),('2024-25'),('2025-26')) AS ay(academic_year)
LEFT JOIN admission_leads l ON l.institution_id = i.id
  AND l.funnel_stage = 'enrolled'
  AND extract(year from l.updated_at) || '-' || (extract(year from l.updated_at)+1)::text = ay.academic_year
LEFT JOIN institution_seat_config sanctioned ON sanctioned.institution_id = i.id
  AND sanctioned.academic_year = ay.academic_year
GROUP BY i.name, ay.academic_year, sanctioned.total_seats
ORDER BY i.name, ay.academic_year;
```

### 5.6 New Files for Workflow Mapping

```
app/(routes)/admission/workflow-config/
├── page.tsx                              # Workflow config management page
├── _components/
│   ├── institution-workflow-form.tsx      # Per-institution config editor
│   ├── stage-configurator.tsx            # Toggle/reorder stages
│   ├── document-requirement-editor.tsx   # Set required docs
│   ├── quota-config-panel.tsx            # Quota percentage editor
│   └── sla-config-panel.tsx              # SLA threshold editor

app/(routes)/admission/group-dashboard/
├── page.tsx                              # Cross-institution overview
├── _components/
│   ├── institution-comparison-table.tsx  # Side-by-side metrics
│   ├── cross-campus-dedup.tsx            # Cross-campus duplicate detection
│   ├── seat-fill-tracker.tsx             # Real-time seat availability
│   └── naac-report-generator.tsx         # NAAC Criteria 2 export

hooks/admission/
├── use-workflow-config.ts                # Institution workflow configuration
├── use-group-dashboard.ts                # Cross-institution metrics
├── use-naac-report.ts                    # NAAC report data

lib/services/admission/
├── workflow-config-service.ts            # Workflow config CRUD
├── group-dashboard-service.ts            # Cross-institution queries
├── naac-report-service.ts                # NAAC data compilation

types/
├── admission-workflow-config.ts          # Workflow config types

supabase/migrations/
├── YYYYMMDD_create_admission_workflow_configs.sql
├── YYYYMMDD_create_institution_seat_config.sql  # Sanctioned seats tracking
```

---

## 6. Database Migrations

### Migration 1: Counselor Daily View Function

```sql
-- Migration: create_counselor_daily_view_function
-- Purpose: Optimized single-query function for counselor's daily command center

CREATE OR REPLACE FUNCTION get_counselor_daily_view(
  p_user_id UUID,
  p_institution_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_counselor_id UUID;
  v_result JSON;
BEGIN
  -- Get counselor record for user
  SELECT id INTO v_counselor_id
  FROM admission_counselors
  WHERE user_id = p_user_id AND is_active = true
  LIMIT 1;

  IF v_counselor_id IS NULL THEN
    RETURN json_build_object('error', 'not_a_counselor');
  END IF;

  SELECT json_build_object(
    'counselor_id', v_counselor_id,
    'kpis', (
      SELECT json_build_object(
        'my_leads_today', COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE AND counselor_id = v_counselor_id),
        'followups_due', COUNT(*) FILTER (
          WHERE next_followup_at IS NOT NULL
            AND next_followup_at::date <= CURRENT_DATE
            AND counselor_id = v_counselor_id
            AND funnel_stage NOT IN ('enrolled', 'lost')
        ),
        'overdue_followups', COUNT(*) FILTER (
          WHERE next_followup_at IS NOT NULL
            AND next_followup_at < CURRENT_DATE::timestamptz
            AND counselor_id = v_counselor_id
            AND funnel_stage NOT IN ('enrolled', 'lost')
        ),
        'hot_leads', COUNT(*) FILTER (
          WHERE priority = 'hot' AND counselor_id = v_counselor_id
            AND funnel_stage NOT IN ('enrolled', 'lost')
        ),
        'total_active', COUNT(*) FILTER (
          WHERE counselor_id = v_counselor_id AND funnel_stage NOT IN ('enrolled', 'lost')
        ),
        'enrolled_this_month', COUNT(*) FILTER (
          WHERE counselor_id = v_counselor_id AND funnel_stage = 'enrolled'
            AND updated_at >= date_trunc('month', CURRENT_DATE)
        ),
        'total_this_month', COUNT(*) FILTER (
          WHERE counselor_id = v_counselor_id AND created_at >= date_trunc('month', CURRENT_DATE)
        )
      )
      FROM admission_leads WHERE institution_id = p_institution_id
    ),
    'followups', (
      SELECT COALESCE(json_agg(row_to_json(f)), '[]'::json)
      FROM (
        SELECT
          l.id, l.full_name, l.phone, l.email,
          l.program_interest, l.funnel_stage, l.priority, l.score,
          l.next_followup_at,
          CASE
            WHEN l.next_followup_at < CURRENT_DATE::timestamptz THEN 'overdue'
            WHEN l.next_followup_at::date = CURRENT_DATE THEN 'today'
            ELSE 'upcoming'
          END as urgency,
          (SELECT json_build_object(
            'type', a.activity_type,
            'description', COALESCE(a.description, a.subject),
            'created_at', a.created_at
          ) FROM admission_lead_activities a
          WHERE a.lead_id = l.id
          ORDER BY a.created_at DESC LIMIT 1) as last_activity
        FROM admission_leads l
        WHERE l.counselor_id = v_counselor_id
          AND l.next_followup_at IS NOT NULL
          AND l.next_followup_at::date <= CURRENT_DATE + 1
          AND l.funnel_stage NOT IN ('enrolled', 'lost')
        ORDER BY
          CASE WHEN l.next_followup_at < CURRENT_DATE::timestamptz THEN 0 ELSE 1 END,
          l.priority = 'hot' DESC,
          l.score DESC,
          l.next_followup_at ASC
        LIMIT 20
      ) f
    ),
    'pipeline', (
      SELECT COALESCE(json_agg(json_build_object('stage', stage, 'count', cnt)), '[]'::json)
      FROM (
        SELECT funnel_stage as stage, COUNT(*) as cnt
        FROM admission_leads
        WHERE counselor_id = v_counselor_id
          AND institution_id = p_institution_id
          AND funnel_stage NOT IN ('lost')
        GROUP BY funnel_stage
        ORDER BY ARRAY_POSITION(
          ARRAY['new','contacted','qualified','application_started','application_submitted',
                'documents_pending','documents_verified','interview_scheduled',
                'interview_completed','offer_sent','offer_accepted','token_paid','enrolled'],
          funnel_stage::text
        )
      ) s
    ),
    'today_activities', (
      SELECT COALESCE(json_agg(row_to_json(ta)), '[]'::json)
      FROM (
        SELECT
          a.activity_type, a.subject, a.description, a.created_at,
          l.full_name as lead_name, l.id as lead_id
        FROM admission_lead_activities a
        JOIN admission_leads l ON a.lead_id = l.id
        WHERE a.created_by = p_user_id
          AND a.created_at >= CURRENT_DATE
        ORDER BY a.created_at DESC
        LIMIT 20
      ) ta
    ),
    'unassigned_count', (
      SELECT COUNT(*)
      FROM admission_leads
      WHERE institution_id = p_institution_id
        AND counselor_id IS NULL
        AND funnel_stage = 'new'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
```

### Migration 2: Admission Workflow Configs

```sql
-- Migration: create_admission_workflow_configs
-- Purpose: Institution-specific admission workflow configuration

CREATE TABLE IF NOT EXISTS admission_workflow_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  config_name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  active_stages TEXT[] NOT NULL DEFAULT ARRAY[
    'new','contacted','qualified','application_started',
    'application_submitted','documents_pending','documents_verified',
    'interview_scheduled','interview_completed','offer_sent',
    'offer_accepted','token_paid','enrolled'
  ],
  stage_configs JSONB NOT NULL DEFAULT '{}',
  has_entrance_exam BOOLEAN DEFAULT false,
  entrance_exam_type TEXT,
  has_gd_pi BOOLEAN DEFAULT false,
  has_merit_list BOOLEAN DEFAULT true,
  merit_criteria JSONB DEFAULT '{}',
  has_government_quota BOOLEAN DEFAULT false,
  government_quota_percentage DECIMAL(5,2) DEFAULT 0,
  has_management_quota BOOLEAN DEFAULT true,
  has_nri_quota BOOLEAN DEFAULT false,
  quota_config JSONB DEFAULT '{}',
  required_documents TEXT[] DEFAULT ARRAY['photo','id_proof','marksheet_10th','marksheet_12th'],
  default_templates JSONB DEFAULT '{}',
  sla_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_workflow_config_unique
  ON admission_workflow_configs(institution_id, academic_year) WHERE is_active = true;
CREATE INDEX idx_workflow_config_institution ON admission_workflow_configs(institution_id);

ALTER TABLE admission_workflow_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their institution config"
  ON admission_workflow_configs FOR SELECT
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage configs"
  ON admission_workflow_configs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'institution_admin')
    )
    AND institution_id IN (
      SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER trigger_update_workflow_configs_updated_at
  BEFORE UPDATE ON admission_workflow_configs
  FOR EACH ROW EXECUTE FUNCTION update_admission_updated_at();
```

### Migration 3: Institution Seat Config (for NAAC reporting)

```sql
-- Migration: create_institution_seat_config
-- Purpose: Track sanctioned intake per institution per year for NAAC

CREATE TABLE IF NOT EXISTS institution_seat_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  program_id UUID REFERENCES programs(id),
  program_name TEXT NOT NULL,
  sanctioned_seats INTEGER NOT NULL,
  government_quota_seats INTEGER DEFAULT 0,
  management_quota_seats INTEGER DEFAULT 0,
  nri_quota_seats INTEGER DEFAULT 0,
  lateral_entry_seats INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(institution_id, academic_year, program_name)
);

CREATE INDEX idx_seat_config_institution ON institution_seat_config(institution_id);
CREATE INDEX idx_seat_config_year ON institution_seat_config(academic_year);

ALTER TABLE institution_seat_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view seat config"
  ON institution_seat_config FOR SELECT
  USING (institution_id IN (
    SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
  ));
```

### Migration 4: Admission Process Metrics View

```sql
-- Migration: create_admission_process_metrics_view
-- Purpose: Pre-computed metrics for TQM integration

CREATE OR REPLACE VIEW admission_process_metrics AS
WITH lead_cycle AS (
  SELECT
    l.id as lead_id,
    l.institution_id,
    l.counselor_id,
    l.funnel_stage,
    l.source,
    l.program_interest,
    l.created_at as lead_created_at,
    (SELECT MIN(a.created_at)
     FROM admission_lead_activities a
     WHERE a.lead_id = l.id
       AND a.activity_type IN ('call', 'email', 'whatsapp', 'meeting')
    ) as first_contact_at,
    CASE WHEN l.funnel_stage = 'enrolled' THEN
      EXTRACT(EPOCH FROM (
        (SELECT MAX(h.created_at) FROM admission_lead_stage_history h
         WHERE h.lead_id = l.id AND h.to_stage = 'enrolled')
        - l.created_at
      )) / 3600
    END as cycle_time_hours,
    EXTRACT(EPOCH FROM (
      COALESCE(
        (SELECT MIN(a.created_at)
         FROM admission_lead_activities a
         WHERE a.lead_id = l.id
           AND a.activity_type IN ('call', 'email', 'whatsapp', 'meeting')),
        NOW()
      ) - l.created_at
    )) / 3600 as first_response_hours
  FROM admission_leads l
  WHERE l.created_at >= date_trunc('year', CURRENT_DATE)
)
SELECT
  institution_id,
  date_trunc('month', lead_created_at)::date as month,
  COUNT(*) as total_leads,
  COUNT(*) FILTER (WHERE funnel_stage = 'enrolled') as enrolled_count,
  COUNT(*) FILTER (WHERE funnel_stage = 'lost') as lost_count,
  ROUND(AVG(cycle_time_hours) FILTER (WHERE cycle_time_hours IS NOT NULL), 1) as avg_cycle_time_hours,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cycle_time_hours)
    FILTER (WHERE cycle_time_hours IS NOT NULL), 1) as median_cycle_time_hours,
  ROUND(AVG(first_response_hours), 1) as avg_first_response_hours,
  ROUND(
    COUNT(*) FILTER (WHERE first_response_hours <= 4)::DECIMAL
    / NULLIF(COUNT(*), 0) * 100, 1
  ) as first_contact_sla_pct,
  ROUND(
    COUNT(*) FILTER (WHERE funnel_stage = 'enrolled')::DECIMAL
    / NULLIF(COUNT(*), 0) * 100, 1
  ) as conversion_rate_pct,
  ROUND(
    COUNT(*) FILTER (WHERE funnel_stage = 'lost')::DECIMAL
    / NULLIF(COUNT(*), 0) * 100, 1
  ) as lost_rate_pct
FROM lead_cycle
GROUP BY institution_id, date_trunc('month', lead_created_at)
ORDER BY month DESC;
```

---

## 7. API Contracts

### 7.1 Counselor Daily View API

**Endpoint:** `GET /api/admission/counselor-view`

**Query params:** None (uses auth context)

**Response:**
```typescript
interface CounselorDailyViewResponse {
  counselor_id: string;
  kpis: {
    my_leads_today: number;
    followups_due: number;
    overdue_followups: number;
    hot_leads: number;
    total_active: number;
    enrolled_this_month: number;
    total_this_month: number;
    conversion_rate: number; // computed: enrolled / total * 100
  };
  followups: Array<{
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    program_interest: string | null;
    funnel_stage: FunnelStage;
    priority: LeadPriority;
    score: number;
    next_followup_at: string;
    urgency: 'overdue' | 'today' | 'upcoming';
    last_activity: {
      type: string;
      description: string;
      created_at: string;
    } | null;
  }>;
  pipeline: Array<{
    stage: FunnelStage;
    count: number;
  }>;
  today_activities: Array<{
    activity_type: string;
    subject: string | null;
    description: string | null;
    created_at: string;
    lead_name: string;
    lead_id: string;
  }>;
  unassigned_count: number; // Only relevant for managers
}
```

### 7.2 TQM Metrics API

**Endpoint:** `GET /api/admission/tqm-metrics`

**Query params:** `institution_id`, `months` (default: 6)

**Response:**
```typescript
interface AdmissionTQMMetrics {
  current_month: {
    total_leads: number;
    enrolled_count: number;
    lost_count: number;
    conversion_rate_pct: number;
    avg_cycle_time_hours: number;
    avg_first_response_hours: number;
    first_contact_sla_pct: number;
  };
  trend: Array<{
    month: string;
    total_leads: number;
    enrolled_count: number;
    conversion_rate_pct: number;
    avg_cycle_time_hours: number;
    first_contact_sla_pct: number;
  }>;
  copq_summary: {
    visible_cost: number;
    hidden_cost_estimate: number;
    top_categories: Array<{
      category: string;
      count: number;
      total_cost: number;
    }>;
  };
  bottleneck_stages: Array<{
    stage: string;
    avg_duration_hours: number;
    drop_off_rate: number;
  }>;
}
```

### 7.3 Workflow Config API

**Endpoint:** `GET /api/admission/workflow-config`

**Query params:** `institution_id`, `academic_year`

**Response:** `AdmissionWorkflowConfig` object

**Endpoint:** `PUT /api/admission/workflow-config`

**Body:** Partial `AdmissionWorkflowConfig`

### 7.4 Group Dashboard API

**Endpoint:** `GET /api/admission/group-dashboard`

**Query params:** `academic_year`

**Response:**
```typescript
interface GroupDashboardResponse {
  institutions: Array<{
    institution_id: string;
    institution_name: string;
    total_leads: number;
    applications: number;
    enrolled: number;
    sanctioned_seats: number;
    fill_percentage: number;
    conversion_rate: number;
  }>;
  totals: {
    total_leads: number;
    total_applications: number;
    total_enrolled: number;
    total_sanctioned: number;
    overall_fill_pct: number;
  };
  cross_campus_duplicates: number;
}
```

### 7.5 NAAC Report API

**Endpoint:** `GET /api/admission/naac-report`

**Query params:** `institution_id`, `from_year`, `to_year`

**Response:**
```typescript
interface NAACReportResponse {
  criteria_2_1_1: {
    years: Array<{
      academic_year: string;
      sanctioned_intake: number;
      students_admitted: number;
      enrollment_percentage: number;
    }>;
    average_enrollment_pct: number;
  };
  criteria_2_1_2: {
    years: Array<{
      academic_year: string;
      sc_seats: number; sc_filled: number;
      st_seats: number; st_filled: number;
      obc_seats: number; obc_filled: number;
      ews_seats: number; ews_filled: number;
    }>;
  };
  student_demand_ratio: {
    years: Array<{
      academic_year: string;
      applications_received: number;
      seats_available: number;
      demand_ratio: number;
    }>;
  };
}
```

---

## 8. Testing Requirements

### Phase 1 Tests (Verification)

See Section 2 — 30-point checklist. Each test produces a screenshot and console log as proof.

### Phase 2 Tests (Counselor Daily View)

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Page loads for counselor | Login as counselor user | KPI strip shows personalized data |
| 2 | Follow-ups ordered correctly | Overdue + hot + high-score leads exist | Overdue leads appear first, then hot, then by score |
| 3 | Click "Call Now" | Click call button on a follow-up | `tel:` link opens, activity logged as "call" |
| 4 | Click "WhatsApp" | Click WhatsApp button | WhatsApp opens with pre-filled text |
| 5 | Move stage inline | Select "qualified" from stage dropdown | Stage updates, card reflects new stage |
| 6 | Reschedule | Pick new date | next_followup_at updates, card reorders |
| 7 | Quick note | Type note, submit | Activity logged, appears in today's log |
| 8 | Manager sees unassigned | Login as manager | Unassigned leads panel visible |
| 9 | Manager assigns lead | Select counselor, assign | Lead's counselor_id set, moved to counselor's view |
| 10 | Empty state | Counselor with no follow-ups | Friendly "all caught up" message |
| 11 | Mobile layout | Open on 375px screen | All sections stack vertically, buttons large enough to tap |
| 12 | Auto-refresh | Wait 60 seconds | Data refreshes without page reload |

### Phase 3 Tests (TQM Integration)

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Process metrics view returns data | Query admission_process_metrics | Monthly aggregates with cycle time, SLA%, conversion% |
| 2 | COPQ auto-logs on hot lead lost | Update hot lead to 'lost' | Row inserted in billing_copq_incidents |
| 3 | COPQ auto-logs on offer expiry | Update offer to 'expired' | Row inserted in billing_copq_incidents |
| 4 | TQM dashboard widget renders | Navigate to process-excellence | Admission quality card shows real metrics |
| 5 | NPS survey scheduled on enrollment | Move lead to 'enrolled' | nps_survey_schedule row created for 7 days later |

### Phase 4 Tests (Workflow Mapping)

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Create workflow config | Save engineering config | Config saved with stages, docs, SLAs |
| 2 | Funnel adapts to config | View engineering admission | Only configured stages shown |
| 3 | School hides entrance exam | View school admission | No entrance exam field, "Parent Interaction" label |
| 4 | Group dashboard loads | Login as super_admin | All institutions shown with metrics |
| 5 | Cross-campus dedup | Same phone at 2 institutions | Duplicate detected and flagged |
| 6 | NAAC report generates | Click export for 5 years | PDF/CSV with Criteria 2.1.1 and 2.1.2 data |

---

## 9. Performance Considerations

| Concern | Solution |
|---------|---------|
| Daily view query speed | Single DB function `get_counselor_daily_view` reduces to 1 round-trip |
| Process metrics calculation | Use `admission_process_metrics` VIEW, consider materializing if slow |
| Group dashboard across 9 institutions | Aggregate query with institution_id GROUP BY, indexed |
| NAAC 5-year report | Cache result, invalidate on new enrollment |
| Cross-campus dedup | Run as background job nightly, not real-time |
| Follow-up list with activities | Pre-join last_activity in the main query using lateral join |
| 50+ counselors querying simultaneously | Connection pooling, read replicas if needed |

### Indexes to Add

```sql
-- Composite index for counselor daily view (most critical query)
CREATE INDEX IF NOT EXISTS idx_leads_counselor_followup
  ON admission_leads(counselor_id, next_followup_at)
  WHERE funnel_stage NOT IN ('enrolled', 'lost');

-- Index for cross-campus dedup
CREATE INDEX IF NOT EXISTS idx_leads_phone_cross_campus
  ON admission_leads(phone)
  WHERE funnel_stage NOT IN ('enrolled', 'lost');

-- Index for process metrics view
CREATE INDEX IF NOT EXISTS idx_leads_stage_history_lead_stage
  ON admission_lead_stage_history(lead_id, to_stage, created_at);
```

---

## 10. Implementation Order

| Phase | Name | Estimated Scope | Dependencies |
|-------|------|----------------|--------------|
| **1** | Module Verification & Repair | Test 30 items, fix what's broken | Test data seeding |
| **2** | Counselor Daily View | 8 new files, 1 DB function, sidebar update | Phase 1 (module must work) |
| **3** | TQM Integration | 3 services, 1 view, 2 triggers, 1 widget | Phase 1 + TQM modules existing |
| **4** | Workflow Mapping | 2 new tables, config UI, group dashboard | Phase 1 + institution data |

### Implementation Sequence Within Each Phase

**Phase 1 (Verify):**
1. Seed test data in staging
2. Run P0 tests (critical path)
3. Fix all P0 failures
4. Run P1 tests (secondary path)
5. Fix P1 failures
6. Document status of P2 items

**Phase 2 (Counselor View):**
1. Create DB function `get_counselor_daily_view`
2. Create service `counselor-daily-view-service.ts`
3. Create hooks `use-counselor-daily-view.ts`, `use-todays-followups.ts`, `use-counselor-kpis.ts`
4. Build UI components (KPI strip → Follow-up list → Pipeline → Activity log)
5. Add inline actions (call, WhatsApp, stage change, reschedule, quick note)
6. Add sidebar entry with badge
7. Test on mobile viewport
8. Browser test all interactions

**Phase 3 (TQM):**
1. Create `admission_process_metrics` view
2. Create COPQ auto-logging triggers
3. Create `admission-tqm-metrics-service.ts`
4. Build TQM dashboard widget
5. Create NPS survey scheduling trigger
6. Test metrics accuracy against manual calculation

**Phase 4 (Workflows):**
1. Create `admission_workflow_configs` table + `institution_seat_config` table
2. Seed default configs for each institution type
3. Build workflow config UI
4. Modify admission pages to read config and adapt
5. Build group dashboard
6. Build cross-campus dedup
7. Build NAAC report generator
8. Test with multi-institution data

---

## Appendix A: Files to Create (Complete List)

### Phase 2: Counselor Daily View
```
app/(routes)/admission/counselor-view/page.tsx
app/(routes)/admission/counselor-view/_components/counselor-kpi-strip.tsx
app/(routes)/admission/counselor-view/_components/followup-list.tsx
app/(routes)/admission/counselor-view/_components/followup-card.tsx
app/(routes)/admission/counselor-view/_components/unassigned-leads-panel.tsx
app/(routes)/admission/counselor-view/_components/mini-pipeline.tsx
app/(routes)/admission/counselor-view/_components/today-activity-log.tsx
app/(routes)/admission/counselor-view/_components/quick-note-input.tsx
app/(routes)/admission/counselor-view/_components/stage-advance-dropdown.tsx
hooks/admission/use-counselor-daily-view.ts
hooks/admission/use-todays-followups.ts
hooks/admission/use-counselor-kpis.ts
hooks/admission/use-counselor-pipeline.ts
lib/services/admission/counselor-daily-view-service.ts
supabase/migrations/YYYYMMDD_create_counselor_daily_view_function.sql
```

### Phase 3: TQM Integration
```
lib/services/admission/admission-tqm-metrics-service.ts
hooks/admission/use-admission-tqm-metrics.ts
app/(routes)/process-excellence/_components/admission-quality-card.tsx
app/api/admission/tqm-metrics/route.ts
supabase/migrations/YYYYMMDD_create_admission_process_metrics_view.sql
supabase/migrations/YYYYMMDD_create_admission_copq_triggers.sql
supabase/migrations/YYYYMMDD_create_admission_nps_trigger.sql
```

### Phase 4: Workflow Mapping
```
app/(routes)/admission/workflow-config/page.tsx
app/(routes)/admission/workflow-config/_components/institution-workflow-form.tsx
app/(routes)/admission/workflow-config/_components/stage-configurator.tsx
app/(routes)/admission/workflow-config/_components/document-requirement-editor.tsx
app/(routes)/admission/workflow-config/_components/quota-config-panel.tsx
app/(routes)/admission/workflow-config/_components/sla-config-panel.tsx
app/(routes)/admission/group-dashboard/page.tsx
app/(routes)/admission/group-dashboard/_components/institution-comparison-table.tsx
app/(routes)/admission/group-dashboard/_components/cross-campus-dedup.tsx
app/(routes)/admission/group-dashboard/_components/seat-fill-tracker.tsx
app/(routes)/admission/group-dashboard/_components/naac-report-generator.tsx
hooks/admission/use-workflow-config.ts
hooks/admission/use-group-dashboard.ts
hooks/admission/use-naac-report.ts
lib/services/admission/workflow-config-service.ts
lib/services/admission/group-dashboard-service.ts
lib/services/admission/naac-report-service.ts
types/admission-workflow-config.ts
app/api/admission/workflow-config/route.ts
app/api/admission/group-dashboard/route.ts
app/api/admission/naac-report/route.ts
supabase/migrations/YYYYMMDD_create_admission_workflow_configs.sql
supabase/migrations/YYYYMMDD_create_institution_seat_config.sql
supabase/seed/admission-test-data.sql
supabase/seed/admission-workflow-defaults.sql
```

---

## Appendix B: Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Counselors don't adopt the daily view | Make it the DEFAULT landing page for admission role. Zero training needed. |
| TQM metrics are inaccurate with small data | Show "Insufficient data" badge when < 20 leads in period |
| Workflow configs get out of sync | Only one active config per institution per year (enforced by unique index) |
| Cross-campus dedup flags false positives | Require manual review, show confidence score, allow "ignore" action |
| NAAC report has gaps in historical data | Allow manual data entry for years before CRM existed |
| Performance degrades with scale | Single DB function for daily view, materialized view for metrics, nightly dedup job |

---

*Generated: 2026-02-06 | Source: FST Analysis on Admission CRM | Session: 65c2a63d*
