# Activity Intelligence — Full Specification

> **Status:** Draft — Ready for Review
> **Created:** 2026-02-25
> **Origin:** FST Analysis Chain (#1 Orgs-as-Workflows → #2 100%-Automation → #3 Activity-Logging)
> **Module Name:** Activity Intelligence
> **Route:** `/activity-intelligence`
> **Effort Estimate:** 6-8 weeks (4 phases)

---

## Executive Summary

**The Problem:**
JKKN wants to automate 100% of institutional operations using AI + digital transformation. But:
1. **Nobody knows what people actually do all day** — research shows self-reports differ from actual behavior by 40-60%
2. **Most work happens OUTSIDE MyJKKN** — on WhatsApp, phone calls, paper, Excel, in-person. MyJKKN covers only a fraction of institutional operations today.
3. **MyJKKN's module roadmap is based on assumptions** about what people need, not data about what they actually do

**The Real Goal:**
Activity Intelligence is a **Module Discovery Engine** — it discovers what the institution ACTUALLY does, shows where that work happens today, identifies the biggest gaps, and generates a **data-driven product roadmap** for which MyJKKN modules to build next.

**The Solution:**
Build an "Activity Intelligence" module into MyJKKN that:
1. **Discovers** the real organization through a 2-week Activity Census (the PRIMARY data source — captures ALL work, including everything outside MyJKKN)
2. **Maps** where work actually happens (WhatsApp? Paper? Excel? Phone? MyJKKN?) — the `tool_used` field is the most important data point
3. **Identifies module gaps** — every cluster of activities happening OUTSIDE MyJKKN = a potential new module to build
4. **Prioritizes** what to build next with a data-driven Module Priority Matrix: (Hours × People × Frequency) ÷ Complexity
5. **Tracks** digital transformation progress — re-run the census quarterly to measure how much work has moved INTO MyJKKN
6. **Mirrors** individual activity back to each person (self-awareness, not surveillance)
7. **Observes** ongoing operations through passive logging for work that IS already in MyJKKN

**The Strategic Loop:**
```
Census discovers WHERE work happens (mostly outside MyJKKN)
    → Analysis clusters activities into MODULE GAPS
    → Priority scoring tells you WHAT TO BUILD NEXT
    → New module brings that activity INTO MyJKKN
    → Passive tracking improves as more is digital
    → Next census shows progress + reveals NEW gaps
    → Repeat until 100% digitally orchestrated
```

**Key Insight from Codebase Exploration:**
MyJKKN already tracks activities across **5 separate tables** (`audit_logs`, `user_activity_logs`, `user_sessions`, `admission_lead_activities`, `lead_activity_log`). None are connected. The Activity Intelligence module UNIFIES these existing data sources, adds the census for work happening OUTSIDE the system, and layers AI analysis on top. But the census is the star — passive tracking only covers what's already digital, which is a small fraction today.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ACTIVITY INTELLIGENCE MODULE                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   CENSUS      │  │   PASSIVE    │  │   EXISTING   │              │
│  │   (Phase 1)   │  │   TRACKER    │  │   DATA       │              │
│  │               │  │   (Phase 2)  │  │   (Already   │              │
│  │ 2-week daily  │  │              │  │    built!)   │              │
│  │ form entries  │  │ Page views   │  │              │              │
│  │               │  │ Time on page │  │ audit_logs   │              │
│  │               │  │ Click events │  │ user_activity │              │
│  │               │  │ Module usage │  │ user_sessions│              │
│  │               │  │              │  │ lead_activity│              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                  │                  │                      │
│         └──────────────────┼──────────────────┘                      │
│                            ▼                                         │
│                 ┌──────────────────────┐                             │
│                 │   UNIFIED EVENT      │                             │
│                 │   STREAM             │                             │
│                 │   (SQL View)         │                             │
│                 └──────────┬───────────┘                             │
│                            │                                         │
│              ┌─────────────┼─────────────┐                          │
│              ▼             ▼             ▼                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  ACTIVITY    │  │  PROCESS     │  │  AUTOMATION   │              │
│  │  GENOME      │  │  MINING      │  │  MATRIX       │              │
│  │  (Phase 3)   │  │  (Phase 3)   │  │  (Phase 4)    │              │
│  │              │  │              │  │               │              │
│  │ Time alloc   │  │ Actual       │  │ Priority      │              │
│  │ Role patterns│  │ workflows    │  │ scores        │              │
│  │ Tool usage   │  │ Bottlenecks  │  │ ROI estimates │              │
│  │ Duplications │  │ Deviations   │  │ Recommendations│             │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │  DASHBOARDS                                               │       │
│  │                                                           │       │
│  │  • Individual Mirror (each person sees OWN data)         │       │
│  │  • Department View (aggregated, no individual comparison)│       │
│  │  • Institutional Genome (leadership view)                │       │
│  │  • Automation Roadmap (prioritized opportunities)        │       │
│  └──────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Activity Census (Week 1-2)

### What It Is
A temporary 2-week data collection campaign. Every staff member fills a simple daily form (30 seconds) describing what they did. Runs once, produces the baseline "Activity Genome."

### Why 2 Weeks Only
Research shows active logging quality degrades sharply after 2-3 weeks (logging fatigue). The census is designed as a SPRINT — high effort, clearly bounded, maximum data quality.

### Database Schema

#### Table: `ai_census_campaigns`
Campaign configuration — one campaign per institution per census period.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `institution_id` | uuid (FK → institutions) | |
| `name` | text | e.g., "February 2026 Activity Census" |
| `description` | text | Shown to staff |
| `start_date` | date | Census start |
| `end_date` | date | Census end (start + 14 days) |
| `status` | text | `draft`, `active`, `completed`, `cancelled` |
| `target_roles` | text[] | Which roles participate (null = all) |
| `created_by` | uuid (FK → profiles) | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `settings` | jsonb | Notification frequency, reminder times, etc. |

#### Table: `ai_census_entries`
Individual daily activity entries — the core census data.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `campaign_id` | uuid (FK → ai_census_campaigns) | |
| `institution_id` | uuid (FK → institutions) | For RLS |
| `user_id` | uuid (FK → profiles) | Who logged this |
| `entry_date` | date | Which day this entry is for |
| `activity_description` | text | Free text: "What did you do?" |
| `duration_minutes` | int | How long (in minutes) |
| `tool_used` | text | `myjkkn`, `whatsapp`, `phone`, `email`, `paper`, `excel`, `in_person`, `other` |
| `tool_other` | text | If tool_used = 'other' |
| `people_involved` | text[] | Free text names/roles |
| `category` | text | `teaching`, `admin`, `communication`, `data_entry`, `meeting`, `travel`, `break`, `planning`, `student_interaction`, `other` |
| `is_routine` | boolean | "Do you do this regularly?" |
| `could_ai_help` | text | `yes`, `no`, `maybe` |
| `ai_help_description` | text | If yes/maybe: "How could AI help?" |
| `created_at` | timestamptz | |
| `metadata` | jsonb | {} — extensible |

#### Table: `ai_census_categories`
Configurable categories per institution (pre-seeded with defaults above, editable by admin).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `institution_id` | uuid (FK) | |
| `name` | text | Category label |
| `slug` | text | Machine-readable |
| `icon` | text | Lucide icon name |
| `sort_order` | int | Display order |
| `is_active` | boolean | default true |

### RLS Policies

```sql
-- ai_census_campaigns: admins manage, all authenticated can read active campaigns
CREATE POLICY "census_campaigns_read" ON ai_census_campaigns
  FOR SELECT USING (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "census_campaigns_manage" ON ai_census_campaigns
  FOR ALL USING (
    (institution_id = auth_institution_id() AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'institution_admin')
    ))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ai_census_entries: users can CRUD own entries, admins see all in institution
CREATE POLICY "census_entries_own" ON ai_census_entries
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "census_entries_admin_read" ON ai_census_entries
  FOR SELECT USING (
    (institution_id = auth_institution_id() AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'institution_admin')
    ))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
```

### UI Screens

#### 1. Census Admin Dashboard (`/activity-intelligence/census`)
- **Who sees it:** admin, super_admin, institution_admin
- **Shows:**
  - Campaign status (active/draft/completed)
  - Participation rate: X/Y staff have logged today
  - Daily completion heatmap (14-day grid, colored by participation %)
  - "Nudge" button to send reminder notification to non-loggers
  - "Create Campaign" button (if no active campaign)

#### 2. Activity Log — Bug Reporter Style (CRITICAL UX REQUIREMENT)

> **Design standard: Match the bug reporter.**
> The bug reporter succeeds because: 1 tap to open, auto-capture context, 3-5 taps to submit.
> The census form MUST be equally effortless or participation dies by day 3.

**Entry point: Floating Action Button (FAB)**
- Fixed position bottom-right (mobile: `bottom-24 right-2` like bug reporter)
- Pulsing icon during active census campaign (draws attention)
- Available on EVERY page in MyJKKN during census period
- Label: "Log Activity" with a clipboard/pencil icon
- 1 TAP to open

**Form: Bottom Sheet on mobile, compact modal on desktop**
- NOT a full page — a quick overlay, log and dismiss
- `max-h-[70vh]` with smooth slide-up animation on mobile

**ONLY 3 REQUIRED INPUTS (like bug reporter has 3):**

```
┌──────────────────────────────────────────┐
│  📝 What are you doing?                  │
│  ┌──────────────────────────────────┐    │
│  │ [Free text OR 🎤 voice input]    │    │
│  └──────────────────────────────────┘    │
│                                          │
│  ⏱️ How long?  (tap one)                 │
│  ┌─────┐┌─────┐┌──────┐┌────┐┌─────┐   │
│  │ 5m  ││ 15m ││ 30m  ││ 1h ││ 2h+ │   │
│  └─────┘└─────┘└──────┘└────┘└─────┘   │
│                                          │
│  🔧 Where?  (tap one)                   │
│  ┌────────┐┌─────────┐┌───────┐         │
│  │💬 WhApp ││📱MyJKKN ││📞 Phone│        │
│  └────────┘└─────────┘└───────┘         │
│  ┌────────┐┌─────────┐┌───────┐         │
│  │📊 Excel ││📄 Paper  ││🤝Person│        │
│  └────────┘└─────────┘└───────┘         │
│                                          │
│  ▸ More details (optional, collapsed)    │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │          ✅ Log It                │    │
│  └──────────────────────────────────┘    │
│                                          │
│  Today: 4.5 hrs logged (█████████░ 56%) │
└──────────────────────────────────────────┘
```

**Total taps to submit: 4** — Open FAB (1) + Duration (1) + Tool (1) + Submit (1) + typing
**With voice: 3 taps** — Open FAB (1) + hold mic + Submit (1) — AI extracts duration and tool from speech

**"More details" collapsed section (optional, never required):**
- Category (visual icon buttons like bug reporter categories)
- People involved (free text)
- Routine? (toggle)
- Could AI help? (yes/no/maybe)
- These are BONUS data. Never block submission on them.

**Auto-captured context (ZERO user effort, like bug reporter's auto-screenshot):**
- Timestamp
- Current MyJKKN page (if they're in the app)
- User role, department, institution
- Device type (mobile/desktop)
- Session ID (links to user_sessions)

**Smart behaviors (after day 3):**
- "Quick log" suggestions based on previous entries: "Did you do [Follow up with parents] again today?" — tap yes/no
- Running total with progress bar nudges toward 8 hours
- Voice input: "I spent 30 minutes calling parents on WhatsApp" → AI auto-fills: duration=30m, tool=whatsapp, description="calling parents"
- End-of-day prompt at 5:30 PM if <4 hours logged

**Gamification (mirror bug reporter's incentive structure):**
- "Activity Champion" leaderboard — most consistent logger (NOT most hours — consistency)
- Daily streak counter: "🔥 5 day streak!"
- Institutional participation meter: "JKKN Dental: 87% logged today"
- No prizes needed initially — the streak + team participation creates social pressure

#### 2b. External Stakeholder Census (Parents / Alumni / Students)

> **These stakeholders DON'T use MyJKKN daily — they need a different channel.**

**Channel options (pick per stakeholder group):**

| Channel | Best For | How It Works |
|---------|----------|-------------|
| **WhatsApp** | Parents, Alumni | Daily WhatsApp message: "What did you do related to JKKN today? Reply in 1 line." AI extracts structured data from reply. |
| **SMS** | Parents without WhatsApp | Same as WhatsApp but via SMS |
| **PWA micro-form** | Students, Tech-savvy parents | Shareable link → opens 3-field form (no login required, token-based auth) |
| **Google Form** | Bulk one-time census | Simple form shared via WhatsApp group or email |

**WhatsApp Census Flow (for parents):**
```
DAY 1:
Bot: "Hi [Parent Name]! JKKN is improving our services.
      For 2 weeks, we'll ask 1 question daily.
      Just reply in your own words — takes 10 seconds.

      Today: What did you do related to your child's
      education at JKKN today?"

Parent: "Called the office about fee payment, waited 20 min"

AI extracts:
  activity: "Fee payment inquiry"
  tool: phone
  duration: 20min
  category: billing
  sentiment: frustrated (waited)
  gap_signal: "fee payment process needs improvement"
```

**This is where it connects to Jicate Solutions:**
- Parent logs "called office about fees, waited 20 min" → gap signal
- 50 parents log similar fee-related frustrations → cluster
- Module Gap Dashboard shows: "Parent Fee Portal — 50 parents, 120 hours/month of phone calls"
- Gap feeds into **Intent Interview Platform** for detailed requirements
- **Jicate Solutions** builds the Parent Fee Portal
- Next census: phone calls about fees drop 70%

**New table: `ai_census_external_responses`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `campaign_id` | uuid (FK) | |
| `institution_id` | uuid (FK) | |
| `stakeholder_type` | text | `parent`, `alumni`, `student`, `vendor`, `visitor` |
| `stakeholder_name` | text | |
| `stakeholder_phone` | text | For WhatsApp/SMS channel |
| `stakeholder_email` | text | Optional |
| `channel` | text | `whatsapp`, `sms`, `pwa_form`, `google_form` |
| `raw_response` | text | Exact text they sent |
| `ai_extracted_activity` | text | AI-parsed activity description |
| `ai_extracted_tool` | text | AI-parsed tool used |
| `ai_extracted_duration` | int | AI-estimated minutes |
| `ai_extracted_category` | text | AI-parsed category |
| `ai_extracted_sentiment` | text | `positive`, `neutral`, `frustrated`, `angry` |
| `ai_gap_signal` | text | AI-identified improvement opportunity |
| `response_date` | date | |
| `created_at` | timestamptz | |
| `metadata` | jsonb | {} |

#### 3. My Activity Mirror (`/activity-intelligence/mirror`)
- **Who sees it:** Each person sees ONLY their own data
- **Shows:**
  - Pie chart: time allocation by category this week
  - Bar chart: tool usage breakdown (MyJKKN vs WhatsApp vs Phone vs Paper vs Excel)
  - "Your Top 5 Activities" ranked by total hours
  - "Routine work: X hours/week" — the automation opportunity
  - Trend: how your pattern changed over the 2 weeks
  - Comparison to ROLE AVERAGE (not named individuals) — "Counselors average 2.1 hours on data entry; you spend 3.4 hours"
- **Key design principle:** This is a MIRROR, not a report card. No judgments, no red/green indicators. Just "here's what your data shows."

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/activity-intelligence/census/campaigns` | GET, POST | List/create campaigns |
| `/api/activity-intelligence/census/campaigns/[id]` | GET, PATCH | Get/update campaign |
| `/api/activity-intelligence/census/campaigns/[id]/activate` | POST | Start campaign |
| `/api/activity-intelligence/census/entries` | GET, POST | List/create entries for current user |
| `/api/activity-intelligence/census/entries/[id]` | PATCH, DELETE | Update/delete own entry |
| `/api/activity-intelligence/census/participation` | GET | Participation stats (admin only) |
| `/api/activity-intelligence/census/nudge` | POST | Send reminder to non-loggers (admin only) |
| `/api/activity-intelligence/mirror` | GET | My personal activity summary |

### Service Layer

```
lib/services/activity-intelligence/
├── census-service.ts          — Campaign CRUD, entry CRUD
├── census-analytics-service.ts — Participation stats, completion rates
├── mirror-service.ts          — Personal activity summaries
└── index.ts
```

**Pattern:** Static class methods (follows existing MyJKKN convention), Supabase client from `createClientSupabaseClient()`.

### Hooks

```
hooks/activity-intelligence/
├── use-census-campaigns.ts    — Campaign CRUD hooks
├── use-census-entries.ts      — Entry CRUD hooks (user's own)
├── use-census-participation.ts — Admin participation stats
├── use-activity-mirror.ts     — Personal activity mirror data
└── index.ts                   — Re-exports
```

### Notifications
- Daily reminder at configurable time (default 5:30 PM) if user hasn't logged today
- "Census starts tomorrow!" notification day before start_date
- "Last day of census!" notification on end_date
- "Census complete — see your Activity Mirror!" after campaign ends

---

## Phase 2: Passive Activity Tracking (Week 3-4)

### What It Is
Automatic, zero-friction logging of everything people do WITHIN MyJKKN. No manual input needed — using the system IS the log.

### What Already Exists (DO NOT rebuild)

| Table | What It Tracks | Service |
|-------|---------------|---------|
| `audit_logs` | CREATE/UPDATE/DELETE on entities, LOGIN/LOGOUT | `AuditService` (502 lines) |
| `user_activity_logs` | Lightweight action log with URLs | Inline logging |
| `user_sessions` | Login/logout times, device, modules accessed | `SessionTrackingService` (264 lines) |
| `admission_lead_activities` | CRM activities (calls, emails, meetings) | `ActivityService` |
| `admission_lead_stage_history` | Stage transitions (process events) | Inline logging |
| `lead_activity_log` | Another activity log (⚠️ no institution_id) | Inline logging |

### What's NEW (Build This)

#### Table: `ai_page_views`
Passive page/action tracking — captured by a React hook on every page.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `institution_id` | uuid | From session context |
| `user_id` | uuid | |
| `session_id` | uuid | Links to user_sessions |
| `page_path` | text | e.g., `/admission/leads` |
| `page_module` | text | Extracted module name: `admission`, `billing`, etc. |
| `action_type` | text | `page_view`, `button_click`, `form_submit`, `dialog_open`, `export`, `search` |
| `action_detail` | text | e.g., "clicked Add Lead button", "submitted filter form" |
| `duration_seconds` | int | Time spent on page (captured on navigation away) |
| `referrer_path` | text | Previous page |
| `created_at` | timestamptz | |
| `metadata` | jsonb | {} — device, viewport, etc. |

**Volume estimate:** ~50-200 rows per user per day. With 200 active users = 10,000-40,000 rows/day = ~1M rows/month. Needs partition by month and auto-archive after 6 months.

#### Implementation: `usePageTracking` Hook
A React hook added to the root layout that passively logs page views and time-on-page.

```typescript
// hooks/activity-intelligence/use-page-tracking.ts
// This hook runs in the root layout — captures ALL page navigations

// On mount: record page_view event with current path
// On unmount/navigation: calculate duration, update the record
// On specific actions (form submit, button click): record action events
// Debounced writes — batches events and sends every 30 seconds
// NO user interaction required — completely invisible
```

**Key design decisions:**
- **Batched writes:** Don't fire a Supabase insert on every click. Collect events in memory, flush every 30 seconds or on navigation.
- **Lightweight:** Only path, action, duration. No screenshots, no keylogging, no content capture.
- **Opt-out respected:** If a user or institution disables tracking, the hook returns early.
- **Performance:** Events queued in localStorage as fallback if network is slow.

#### RLS Policy
```sql
-- Users can only see their own page views
CREATE POLICY "page_views_own" ON ai_page_views
  FOR SELECT USING (user_id = auth.uid());

-- Admins see aggregated data via RPC functions (not direct table access)
-- Super admin bypass
CREATE POLICY "page_views_admin" ON ai_page_views
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Insert: users insert their own tracking data
CREATE POLICY "page_views_insert" ON ai_page_views
  FOR INSERT WITH CHECK (user_id = auth.uid());
```

#### Unified Event View
SQL view that joins ALL activity sources into a single stream.

```sql
CREATE OR REPLACE VIEW ai_unified_events AS

-- Source 1: Audit logs (existing)
SELECT
  id,
  user_id,
  created_at AS event_time,
  'audit' AS source,
  module AS event_module,
  action AS event_type,
  entity_type || ': ' || COALESCE(changes->>'summary', action) AS event_description,
  metadata,
  institution_id
FROM audit_logs

UNION ALL

-- Source 2: User activity logs (existing)
SELECT
  id,
  user_id,
  created_at AS event_time,
  'user_activity' AS source,
  resource_type AS event_module,
  action_type AS event_type,
  description AS event_description,
  metadata,
  NULL AS institution_id  -- ⚠️ needs backfill
FROM user_activity_logs

UNION ALL

-- Source 3: Page views (new)
SELECT
  id,
  user_id,
  created_at AS event_time,
  'page_view' AS source,
  page_module AS event_module,
  action_type AS event_type,
  COALESCE(action_detail, page_path) AS event_description,
  metadata,
  institution_id
FROM ai_page_views

UNION ALL

-- Source 4: Census entries (Phase 1)
SELECT
  id,
  user_id,
  created_at AS event_time,
  'census' AS source,
  category AS event_module,
  'self_report' AS event_type,
  activity_description AS event_description,
  jsonb_build_object(
    'duration_minutes', duration_minutes,
    'tool', tool_used,
    'is_routine', is_routine,
    'could_ai_help', could_ai_help
  ) AS metadata,
  institution_id
FROM ai_census_entries

UNION ALL

-- Source 5: Session data (existing)
SELECT
  session_id AS id,
  user_id,
  login_at AS event_time,
  'session' AS source,
  'system' AS event_module,
  'login' AS event_type,
  'User session: ' || COALESCE(device_type, 'unknown') AS event_description,
  jsonb_build_object('device', device_type, 'modules', modules_accessed) AS metadata,
  institution_id
FROM user_sessions;
```

### API Routes (Phase 2 additions)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/activity-intelligence/track` | POST | Batch insert page view events |
| `/api/activity-intelligence/events` | GET | Unified event stream (paginated, filtered) |
| `/api/activity-intelligence/events/export` | GET | Export events as CSV |

---

## Phase 3: Activity Genome + Process Mining (Week 5-6)

### What It Is
AI-powered analysis of all collected data (census + passive + existing) to discover the ACTUAL organization — real workflows, time allocation, bottlenecks, duplicated effort, and automation opportunities.

### Analysis Engine (SQL-First, AI-Enhanced)

Most patterns are discoverable with SQL aggregations. AI (Claude API) is used for unstructured analysis of census free-text and for generating human-readable insights.

#### Analysis 1: Time Allocation by Role

```sql
-- RPC Function: ai_get_time_allocation
-- Input: institution_id, date_range, group_by (role/department/individual)
-- Output: category → avg_hours_per_day, % of total, person_count

-- From census data:
SELECT
  p.role,
  ce.category,
  AVG(ce.duration_minutes) / 60.0 AS avg_hours_per_entry,
  SUM(ce.duration_minutes) / 60.0 AS total_hours,
  COUNT(DISTINCT ce.user_id) AS people_count
FROM ai_census_entries ce
JOIN profiles p ON p.id = ce.user_id
WHERE ce.institution_id = $1
  AND ce.entry_date BETWEEN $2 AND $3
GROUP BY p.role, ce.category
ORDER BY total_hours DESC;
```

**Output example:**
| Role | Category | Avg Hours/Day | % of Total | People |
|------|----------|---------------|-----------|--------|
| Admission Counselor | data_entry | 3.4 | 42% | 12 |
| Admission Counselor | communication | 1.8 | 22% | 12 |
| Admission Counselor | student_interaction | 1.2 | 15% | 12 |
| Admin Staff | data_entry | 4.1 | 51% | 8 |
| Faculty | teaching | 4.5 | 56% | 30 |

#### Analysis 2: Tool Usage Patterns

```sql
-- RPC Function: ai_get_tool_usage
-- Shows which tools people ACTUALLY use (vs what the org assumes)

SELECT
  p.role,
  ce.tool_used,
  COUNT(*) AS usage_count,
  SUM(ce.duration_minutes) / 60.0 AS total_hours,
  ROUND(100.0 * SUM(ce.duration_minutes) /
    SUM(SUM(ce.duration_minutes)) OVER (PARTITION BY p.role), 1) AS pct_of_role_time
FROM ai_census_entries ce
JOIN profiles p ON p.id = ce.user_id
WHERE ce.institution_id = $1
GROUP BY p.role, ce.tool_used
ORDER BY p.role, total_hours DESC;
```

**Output example:**
| Role | Tool | Hours | % of Role Time |
|------|------|-------|----------------|
| Counselor | WhatsApp | 2.8 | 35% |
| Counselor | MyJKKN | 1.9 | 24% |
| Counselor | Phone | 1.6 | 20% |
| Counselor | Excel | 0.8 | 10% |
| Admin | Excel | 3.2 | 40% |
| Admin | Paper | 1.5 | 19% |
| Admin | MyJKKN | 1.2 | 15% |

**Insight this reveals:** "Counselors spend 35% of their time on WhatsApp but only 24% on MyJKKN — the CRM isn't where the actual work happens."

#### Analysis 3: Routine vs One-Off Work

```sql
-- What percentage of work is routine (automatable) vs unique?
SELECT
  p.role,
  ce.is_routine,
  COUNT(*) AS entry_count,
  SUM(ce.duration_minutes) / 60.0 AS total_hours,
  ROUND(100.0 * SUM(ce.duration_minutes) /
    SUM(SUM(ce.duration_minutes)) OVER (PARTITION BY p.role), 1) AS pct
FROM ai_census_entries ce
JOIN profiles p ON p.id = ce.user_id
WHERE ce.institution_id = $1
GROUP BY p.role, ce.is_routine;
```

#### Analysis 4: "Could AI Help?" Self-Assessment

```sql
-- Staff's own assessment of automation potential
SELECT
  ce.category,
  ce.could_ai_help,
  COUNT(*) AS count,
  SUM(ce.duration_minutes) / 60.0 AS total_hours,
  STRING_AGG(DISTINCT ce.ai_help_description, ' | ') AS suggestions
FROM ai_census_entries ce
WHERE ce.institution_id = $1
  AND ce.could_ai_help IN ('yes', 'maybe')
GROUP BY ce.category, ce.could_ai_help
ORDER BY total_hours DESC;
```

#### Analysis 5: Process Mining (from passive data)

```sql
-- Discover actual page navigation sequences (what workflows REALLY look like)
-- Uses the ai_page_views table to find common navigation patterns

WITH sequences AS (
  SELECT
    user_id,
    session_id,
    page_module,
    page_path,
    created_at,
    LEAD(page_module) OVER (PARTITION BY user_id, session_id ORDER BY created_at) AS next_module,
    LEAD(page_path) OVER (PARTITION BY user_id, session_id ORDER BY created_at) AS next_path
  FROM ai_page_views
  WHERE institution_id = $1
    AND created_at BETWEEN $2 AND $3
)
SELECT
  page_module AS from_module,
  next_module AS to_module,
  COUNT(*) AS transition_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct_of_all_transitions
FROM sequences
WHERE next_module IS NOT NULL
GROUP BY page_module, next_module
ORDER BY transition_count DESC
LIMIT 20;
```

**Output example:**
| From Module | To Module | Count | % |
|-------------|-----------|-------|---|
| admission | admission | 1,240 | 31% |
| dashboard | admission | 480 | 12% |
| admission | billing | 320 | 8% |
| billing | admission | 280 | 7% |

**Insight:** "Admission and billing are tightly coupled — people constantly switch between them. Consider a unified view."

#### Analysis 6: Bottleneck Detection (from existing stage history)

```sql
-- Average time leads spend in each stage (using existing admission_lead_stage_history)
SELECT
  from_stage,
  to_stage,
  COUNT(*) AS transitions,
  AVG(EXTRACT(EPOCH FROM (created_at -
    LAG(created_at) OVER (PARTITION BY lead_id ORDER BY created_at)
  )) / 3600) AS avg_hours_in_stage,
  PERCENTILE_CONT(0.9) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (created_at -
      LAG(created_at) OVER (PARTITION BY lead_id ORDER BY created_at)
    )) / 3600
  ) AS p90_hours_in_stage
FROM admission_lead_stage_history
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY from_stage, to_stage
ORDER BY avg_hours_in_stage DESC;
```

### AI-Enhanced Analysis (Claude API)

For unstructured census data, call Claude API to:

1. **Cluster free-text activities** into discovered workflow categories
   - Input: All `activity_description` values from census
   - Output: Grouped activities with suggested workflow names
   - Example: "Called parent about fee", "Sent WhatsApp to parent", "Replied to parent email" → Cluster: "Parent Communication"

2. **Generate the Activity Genome Report**
   - Input: All SQL analysis results + census data
   - Output: Natural language report with sections: Key Findings, Surprising Patterns, Top Automation Opportunities, Recommended Actions
   - Stored as markdown in a `ai_genome_reports` table

3. **Suggest automation implementations**
   - Input: High-frequency routine activities with "could_ai_help = yes"
   - Output: Specific MyJKKN feature descriptions that would automate each activity

#### Table: `ai_genome_reports`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `institution_id` | uuid (FK) | |
| `campaign_id` | uuid (FK → ai_census_campaigns) | Which census produced this |
| `report_type` | text | `genome`, `process_map`, `automation_matrix` |
| `title` | text | |
| `content_md` | text | Markdown report content |
| `data` | jsonb | Structured data behind the report |
| `generated_by` | text | `sql_analysis`, `claude_api`, `hybrid` |
| `created_at` | timestamptz | |

### Database Functions (RPCs)

| Function | Purpose | Called By |
|----------|---------|----------|
| `ai_get_time_allocation(institution_id, start, end, group_by)` | Time by role/category | Genome Dashboard |
| `ai_get_tool_usage(institution_id, start, end)` | Tool usage patterns | Genome Dashboard |
| `ai_get_routine_ratio(institution_id, start, end)` | % routine vs one-off | Genome Dashboard |
| `ai_get_ai_potential(institution_id)` | Self-assessed AI help potential | Automation Matrix |
| `ai_get_navigation_sequences(institution_id, start, end)` | Page flow patterns | Process Mining |
| `ai_get_module_time(institution_id, start, end)` | Time per module from passive data | Module Usage |
| `ai_get_bottlenecks(institution_id, module)` | Stage duration analysis | Process Mining |
| `ai_get_user_activity_summary(user_id, start, end)` | Personal mirror data | Activity Mirror |

### UI Screens

#### 4. Activity Genome Dashboard (`/activity-intelligence/genome`)
- **Who sees it:** admin, super_admin, institution_admin, principal
- **Sections:**
  - **Time Allocation Sunburst** — Interactive: Role → Category → Activity (drill-down)
  - **Tool Usage Radar** — Which tools are actually used (MyJKKN vs WhatsApp vs Excel vs Paper)
  - **Routine Work Calculator** — "X,XXX hours/month are routine across the institution. If automated, Y people could focus on [higher-value work]."
  - **AI Potential Meter** — Based on staff's own "could AI help?" responses: "Staff believe AI could help with 67% of their routine work"
  - **Surprising Findings** — AI-generated callouts: "Admin staff spend 40% of time in Excel, not MyJKKN"

#### 5. Process Mining View (`/activity-intelligence/processes`)
- **Who sees it:** admin, super_admin
- **Sections:**
  - **Navigation Flow Diagram** — Sankey/flow chart showing how users move between modules
  - **Actual vs Designed Workflows** — Side-by-side: what the manual says vs what data shows
  - **Bottleneck Heatmap** — Where things sit waiting (from stage history)
  - **Module Usage Over Time** — When do people use which modules? (time-of-day heatmap)

#### 6. Automation Matrix (`/activity-intelligence/automation`)
- **Who sees it:** admin, super_admin
- **The Priority Formula:**

```
Automation Priority Score =
  (Total Hours/Month × Number of People Doing It × Frequency Score)
  ÷ Estimated Complexity

Where:
  Frequency Score: Daily=5, Weekly=3, Monthly=1
  Estimated Complexity: Trivial=1, Simple=2, Medium=5, Complex=10, Requires AI=8
```

- **Table columns:** Activity, Category, Hours/Month, People, Frequency, Complexity, Priority Score, Suggested Solution, Status
- **Status workflow:** `discovered` → `evaluated` → `planned` → `in_progress` → `automated` → `verified`
- **Each row links to:** the census entries that evidence this activity (proof)

#### Table: `ai_automation_candidates`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `institution_id` | uuid (FK) | |
| `campaign_id` | uuid (FK) | Source census |
| `activity_name` | text | Discovered activity cluster name |
| `category` | text | |
| `hours_per_month` | numeric | Calculated from census |
| `people_count` | int | How many people do this |
| `frequency` | text | `daily`, `weekly`, `monthly`, `occasional` |
| `frequency_score` | int | 5/3/1/0.5 |
| `complexity` | text | `trivial`, `simple`, `medium`, `complex`, `requires_ai` |
| `complexity_score` | int | 1/2/5/10/8 |
| `priority_score` | numeric | Computed: (hours × people × freq) ÷ complexity |
| `suggested_solution` | text | AI-generated suggestion |
| `evidence_entries` | uuid[] | Census entry IDs that support this |
| `status` | text | `discovered`, `evaluated`, `planned`, `in_progress`, `automated`, `verified` |
| `assigned_to` | uuid (FK → profiles) | Who's responsible for automating |
| `notes` | text | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

## Phase 4: Dashboard + Continuous Intelligence (Week 7-8)

### What It Is
The permanent layer — after the census ends, passive tracking continues and dashboards show evolving institutional intelligence.

### UI Screens

#### 7. Institutional Overview (`/activity-intelligence`)
- **The landing page — single-screen institutional health**
- **Key metrics (cards):**
  - Active users today / this week
  - Top module by usage
  - Hours of routine work this week (automation opportunity)
  - Automation coverage: X% of discovered routine tasks now automated
- **Charts:**
  - Activity volume over time (is digital adoption increasing?)
  - Module usage distribution (which parts of MyJKKN are actually used?)
  - Time-of-day usage heatmap (when is the institution most active?)

#### 8. Automation Roadmap (`/activity-intelligence/roadmap`)
- **Visual timeline** of automation candidates sorted by priority score
- **Progress tracker:** How many hours/month have been automated vs total discovered
- **ROI calculator:** "Automating the top 10 tasks would save X person-hours/month = ₹Y/month"

### Continuous Passive Metrics

These run automatically from passive data (no census needed):

| Metric | Source | Refresh |
|--------|--------|---------|
| Daily active users | ai_page_views | Real-time |
| Module usage distribution | ai_page_views | Every hour |
| Session duration | user_sessions | Every hour |
| Feature adoption | ai_page_views (action_type = form_submit) | Daily |
| Navigation patterns | ai_page_views sequences | Weekly |
| Bottleneck detection | admission_lead_stage_history + process excellence | Daily |

### Database: Metrics Cache Table

```sql
-- Pre-computed metrics for fast dashboard loading
CREATE TABLE ai_metrics_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),
  metric_name text NOT NULL,
  metric_value jsonb NOT NULL,
  period_start timestamptz,
  period_end timestamptz,
  computed_at timestamptz DEFAULT now(),
  UNIQUE(institution_id, metric_name, period_start)
);
```

Populated by a Supabase cron job or edge function that runs hourly.

---

## Privacy & Trust Model

### The Cardinal Rule
> **This is a MIRROR, not a surveillance camera.**
> Individual data is visible ONLY to the individual.
> Leadership sees AGGREGATED data only.

### Access Levels

| Role | Can See |
|------|---------|
| Staff member | Own activity data (mirror) |
| Department head | Department aggregates (no individual drill-down) |
| Principal | Institution aggregates + department aggregates |
| Super admin | Cross-institution aggregates + department aggregates |
| Nobody | Individual-to-individual comparison ("Person A vs Person B") |

### Privacy Safeguards

1. **No individual comparison views** — The UI literally does not have a screen that compares named individuals.
2. **Minimum aggregation threshold** — Aggregated views require 5+ people in the group. If a department has <5 people, it rolls up to institution level.
3. **Opt-out for census** — Staff can skip days. Low participation is visible to admins (they can nudge) but missing entries are not punished.
4. **Passive tracking consent** — First login after deployment shows a one-time notice: "MyJKKN now tracks page usage to help us improve. Your individual data is private to you."
5. **Data retention** — Census data: retained permanently (it's a snapshot). Passive page views: 6 months rolling, then aggregated and raw data purged.
6. **No screenshots, keylogging, or content capture** — Only structural data (which page, how long, what action). Never the CONTENT of what was typed.

### Institutional Settings

| Setting | Default | Options |
|---------|---------|---------|
| `passive_tracking_enabled` | true | true/false |
| `census_reminder_time` | "17:30" | any time |
| `metrics_retention_months` | 6 | 3/6/12 |
| `min_aggregation_group` | 5 | 3/5/10 |
| `show_role_comparison_in_mirror` | true | true/false |

---

## File Structure

```
app/(routes)/activity-intelligence/
├── page.tsx                            — Institutional Overview (Phase 4)
├── census/
│   ├── page.tsx                        — Census Admin Dashboard (Phase 1)
│   └── log/
│       └── page.tsx                    — Daily Census Form (Phase 1)
├── mirror/
│   └── page.tsx                        — Personal Activity Mirror (Phase 1)
├── genome/
│   └── page.tsx                        — Activity Genome Dashboard (Phase 3)
├── processes/
│   └── page.tsx                        — Process Mining View (Phase 3)
├── automation/
│   └── page.tsx                        — Automation Matrix (Phase 3)
├── roadmap/
│   └── page.tsx                        — Automation Roadmap (Phase 4)
├── _components/
│   ├── census-form.tsx                 — Daily entry form component
│   ├── census-entry-card.tsx           — Single entry display
│   ├── participation-heatmap.tsx       — 14-day grid
│   ├── time-allocation-sunburst.tsx    — Interactive sunburst chart
│   ├── tool-usage-radar.tsx            — Radar chart
│   ├── navigation-flow.tsx             — Sankey diagram
│   ├── bottleneck-heatmap.tsx          — Stage duration heatmap
│   ├── automation-priority-table.tsx   — Sortable priority matrix
│   ├── automation-roadmap-timeline.tsx — Visual timeline
│   ├── mirror-summary.tsx              — Personal stats cards
│   └── activity-entry-form.tsx         — Reusable entry form
└── _utils/
    └── priority-calculator.ts          — Priority score formula

hooks/activity-intelligence/
├── use-census-campaigns.ts
├── use-census-entries.ts
├── use-census-participation.ts
├── use-activity-mirror.ts
├── use-page-tracking.ts                — Passive tracking hook (root layout)
├── use-time-allocation.ts
├── use-tool-usage.ts
├── use-process-mining.ts
├── use-automation-candidates.ts
├── use-genome-reports.ts
└── index.ts

lib/services/activity-intelligence/
├── census-service.ts
├── census-analytics-service.ts
├── mirror-service.ts
├── page-tracking-service.ts
├── genome-service.ts                   — AI analysis orchestration
├── process-mining-service.ts
├── automation-service.ts
└── index.ts

types/activity-intelligence.ts          — All types for this module

app/api/activity-intelligence/
├── census/
│   ├── campaigns/
│   │   ├── route.ts                    — GET (list), POST (create)
│   │   └── [id]/
│   │       ├── route.ts               — GET, PATCH
│   │       └── activate/route.ts      — POST
│   ├── entries/
│   │   ├── route.ts                   — GET (own), POST (create)
│   │   └── [id]/route.ts             — PATCH, DELETE
│   ├── participation/route.ts         — GET (admin stats)
│   └── nudge/route.ts                — POST (send reminders)
├── track/route.ts                     — POST (batch page views)
├── events/
│   ├── route.ts                       — GET (unified stream)
│   └── export/route.ts               — GET (CSV export)
├── genome/
│   ├── route.ts                       — GET (reports list)
│   ├── generate/route.ts             — POST (trigger AI analysis)
│   └── [id]/route.ts                 — GET (specific report)
├── processes/
│   ├── navigation/route.ts           — GET (nav flow data)
│   └── bottlenecks/route.ts          — GET (bottleneck analysis)
├── automation/
│   ├── candidates/
│   │   ├── route.ts                  — GET, POST
│   │   └── [id]/route.ts            — GET, PATCH
│   └── roadmap/route.ts             — GET (roadmap view)
├── mirror/route.ts                    — GET (personal summary)
└── metrics/route.ts                   — GET (dashboard metrics)
```

---

## Database Migration Summary

### Phase 1 (Census)
```sql
-- 3 new tables
CREATE TABLE ai_census_campaigns (...);
CREATE TABLE ai_census_entries (...);
CREATE TABLE ai_census_categories (...);
-- RLS policies for all 3
-- Seed default categories
```

### Phase 2 (Passive Tracking)
```sql
-- 1 new table + 1 view
CREATE TABLE ai_page_views (...);
-- Partition by month for performance
-- RLS policies
CREATE VIEW ai_unified_events AS (...);
```

### Phase 3 (Genome + Analysis)
```sql
-- 2 new tables + 8 RPC functions
CREATE TABLE ai_genome_reports (...);
CREATE TABLE ai_automation_candidates (...);
-- RLS policies
-- RPC functions for each analysis type
```

### Phase 4 (Continuous Metrics)
```sql
-- 1 new table + cron setup
CREATE TABLE ai_metrics_cache (...);
-- Supabase cron for hourly metric computation
```

**Total new tables: 7**
**Total new views: 1**
**Total new RPC functions: 8**
**Total API routes: ~20**

---

## Phased Delivery Plan

| Phase | Duration | Deliverables | Value |
|-------|----------|-------------|-------|
| **Phase 1** | Week 1-2 | Census form, campaign management, Activity Mirror, notifications | First data collected, staff see their own patterns |
| **Phase 2** | Week 3-4 | Passive page tracking, unified event view, event stream API | Zero-friction continuous data collection begins |
| **Phase 3** | Week 5-6 | Genome dashboard, process mining, automation matrix, AI reports | Leadership sees the REAL organization for the first time |
| **Phase 4** | Week 7-8 | Institutional overview, automation roadmap, continuous metrics, cron jobs | Permanent intelligence layer, ongoing ROI tracking |

### Phase 1 Ship Criteria
- [ ] Admin can create and activate a census campaign
- [ ] Staff see the daily log form and can submit entries
- [ ] Activity Mirror shows personal time allocation after 3+ days of data
- [ ] Participation stats visible to admins
- [ ] Reminder notifications fire at configured time

### Phase 2 Ship Criteria
- [ ] Page tracking hook captures all page views passively
- [ ] Unified event view returns data from all 5 sources
- [ ] Events API supports pagination and date filtering
- [ ] No measurable performance impact from tracking (< 50ms overhead)

### Phase 3 Ship Criteria
- [ ] Genome dashboard shows time allocation, tool usage, routine ratio
- [ ] Process mining shows actual navigation patterns
- [ ] Automation matrix lists candidates with priority scores
- [ ] At least 1 AI-generated genome report works end-to-end

### Phase 4 Ship Criteria
- [ ] Institutional overview loads in < 2 seconds (cached metrics)
- [ ] Automation roadmap shows progress against discovered opportunities
- [ ] Continuous metrics update automatically (cron working)
- [ ] Privacy safeguards verified (no individual comparison possible)

---

## Dependencies

| Dependency | Required For | Notes |
|-----------|-------------|-------|
| Supabase cron extension (`pg_cron`) | Phase 4 metrics cache | Likely already enabled |
| Claude API access | Phase 3 AI analysis | For text clustering + report generation |
| Chart library (recharts or similar) | Phase 3 dashboards | May already be in project |
| Notification system | Phase 1 reminders | MyJKKN already has push notification system |

---

## The Module Discovery Engine (CRITICAL — Core Purpose)

> **This is the PRIMARY output of Activity Intelligence.**
> The census doesn't just tell you what people do — it tells you **what MyJKKN modules to build next.**

### How It Works

Most JKKN work today happens OUTSIDE MyJKKN — on WhatsApp, phone, paper, Excel, in-person. The census captures ALL of this. AI then clusters the outside-MyJKKN activities into **Module Gaps**.

```
Census Data (tool_used ≠ 'myjkkn')
    ↓
AI clusters similar activities
    ↓
Each cluster = potential MyJKKN module
    ↓
Priority scoring ranks them
    ↓
OUTPUT: "Build this module next"
```

### Module Gap Analysis (SQL + AI)

```sql
-- RPC Function: ai_get_module_gaps
-- Finds clusters of work happening OUTSIDE MyJKKN

SELECT
  ce.category,
  ce.tool_used,
  COUNT(*) AS activity_count,
  COUNT(DISTINCT ce.user_id) AS people_count,
  SUM(ce.duration_minutes) / 60.0 AS total_hours,
  ROUND(AVG(ce.duration_minutes), 0) AS avg_duration_min,
  SUM(CASE WHEN ce.is_routine THEN 1 ELSE 0 END)::float / COUNT(*)::float * 100 AS routine_pct,
  SUM(CASE WHEN ce.could_ai_help IN ('yes', 'maybe') THEN 1 ELSE 0 END)::float / COUNT(*)::float * 100 AS ai_potential_pct,
  ARRAY_AGG(DISTINCT ce.activity_description) AS sample_activities
FROM ai_census_entries ce
WHERE ce.institution_id = $1
  AND ce.tool_used != 'myjkkn'  -- KEY: only work happening OUTSIDE
GROUP BY ce.category, ce.tool_used
ORDER BY total_hours DESC;
```

**Example output — this IS the product roadmap:**

| Category | Tool Today | Hours/2wk | People | Routine% | AI Potential% | Sample Activities |
|----------|-----------|-----------|--------|----------|---------------|-------------------|
| communication | whatsapp | 280 hrs | 45 | 72% | 85% | "Send fee reminder to parents", "Share exam schedule", "Reply to student query" |
| data_entry | excel | 180 hrs | 22 | 91% | 90% | "Enter monthly attendance", "Compile placement data", "Track faculty leave" |
| admin | paper | 120 hrs | 18 | 68% | 55% | "Fill AICTE proforma", "Process leave application", "Sign documents" |
| communication | phone | 95 hrs | 30 | 45% | 30% | "Call parents about attendance", "Coordinate with department", "Vendor follow-up" |
| planning | in_person | 85 hrs | 15 | 25% | 20% | "Department meeting", "Curriculum review", "Event planning" |
| data_entry | paper | 70 hrs | 12 | 95% | 95% | "Student registration form", "Library issue register", "Visitor log" |

**Reading this table tells you:**
1. **Build WhatsApp integration next** — 280 hours, 45 people, 85% could be automated
2. **Build Excel import/replacement** — 180 hours of data entry could be eliminated
3. **Build digital forms** — 70 hours of paper data entry is 95% automatable
4. **Don't rush phone replacement** — only 30% AI potential (calls need human touch)
5. **Don't automate meetings** — only 20% AI potential (planning needs human judgment)

### Module Priority Score

```
Module Priority Score =
  (Total Hours/Month × People Count × Routine% × AI Potential%)
  ÷ Estimated Build Complexity

Where:
  Build Complexity: Simple form/CRUD=1, Integration=3, AI-powered=5, Complex workflow=8
```

### New Table: `ai_module_gaps`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `institution_id` | uuid (FK) | |
| `campaign_id` | uuid (FK → ai_census_campaigns) | |
| `gap_name` | text | AI-generated name: "Parent Communication Hub" |
| `category` | text | Census category |
| `current_tools` | text[] | Where this work happens today |
| `total_hours_per_month` | numeric | Extrapolated from 2-week census |
| `people_count` | int | |
| `routine_percentage` | numeric | |
| `ai_potential_percentage` | numeric | |
| `priority_score` | numeric | Computed |
| `suggested_module_name` | text | AI-generated: "parent-communication" |
| `suggested_features` | jsonb | AI-generated feature list |
| `sample_activities` | text[] | Representative census entries |
| `build_complexity` | text | `simple`, `integration`, `ai_powered`, `complex` |
| `estimated_weeks` | int | Rough build estimate |
| `status` | text | `discovered`, `validated`, `planned`, `building`, `shipped`, `measuring` |
| `myjkkn_module_path` | text | Once built: `/parent-communication` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### New UI: Module Gap Dashboard (`/activity-intelligence/gaps`)

**The most important screen in this entire module.**

- **Who sees it:** admin, super_admin, institution_admin, principal
- **Shows:**
  - **"Where Work Lives Today" — Pie Chart** — MyJKKN: X%, WhatsApp: Y%, Excel: Z%, Paper: W%, Phone: V%, In-person: U%
  - **Module Gap Table** — Sorted by priority score, showing: Gap Name, Current Tool, Hours/Month, People, Priority, Status
  - **Digital Transformation Progress** — "32% of institutional work is in MyJKKN. Target: 100%."
  - **"If We Build This Next" Calculator** — Select a gap → shows estimated hours saved/month, people affected, ROI
  - **Quarterly Comparison** — If census has been run 2+ times: "WhatsApp work decreased from 35% to 22% as communication moved to MyJKKN"

### Quarterly Re-Census

The census is designed to be RE-RUN quarterly (every 3 months) to measure progress:

| Census | Expected Outcome |
|--------|-----------------|
| **Census 1** (baseline) | "72% of work is outside MyJKKN" — generates initial module roadmap |
| **Census 2** (3 months later) | "58% outside" — validates that built modules are absorbing work |
| **Census 3** (6 months) | "40% outside" — reveals second-tier gaps |
| **Census 4** (9 months) | "25% outside" — approaching critical mass |
| **Census 5** (12 months) | "15% outside" — remaining gaps are human-anchored (meetings, mentoring) |

Each re-census produces a DELTA report: "Since last census: +12% work moved to digital, top new module built: Parent Communication, biggest remaining gap: Faculty Leave Management"

### API Routes (Module Gaps)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/activity-intelligence/gaps` | GET | List all module gaps with priority scores |
| `/api/activity-intelligence/gaps/[id]` | GET, PATCH | Get/update gap status |
| `/api/activity-intelligence/gaps/generate` | POST | Trigger AI analysis to discover gaps from census |
| `/api/activity-intelligence/gaps/compare` | GET | Compare across census campaigns (delta) |

---

## The Discovery-to-Delivery Pipeline (JKKN + Intent Platform + Jicate Solutions)

> **This is the complete closed loop — from "we don't know what people do" to "we built the solution and measured the impact."**

### The Three Systems

| System | Role | What It Does |
|--------|------|-------------|
| **Activity Intelligence** (MyJKKN) | DISCOVER | Census captures what all stakeholders do. AI finds gaps. |
| **Intent Interview Platform** | SPECIFY | For each discovered gap, runs deep 11-territory interview to capture complete requirements. |
| **Jicate Solutions** | BUILD | Takes the PRD from Intent Platform and builds the module/product. |

### The Closed Loop

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   1. DISCOVER (Activity Intelligence)                                │
│   Staff, students, parents, alumni log activities                    │
│   AI identifies MODULE GAPS                                          │
│        │                                                             │
│        ▼                                                             │
│   2. SPECIFY (Intent Interview Platform)                             │
│   Top-priority gap → create project in Intent Platform               │
│   Stakeholders answer 11-territory AI interview                      │
│   Output: Complete PRD with coverage %                               │
│        │                                                             │
│        ▼                                                             │
│   3. BUILD (Jicate Solutions)                                        │
│   Jicate team builds from PRD                                        │
│   Deploys as MyJKKN module or standalone                             │
│        │                                                             │
│        ▼                                                             │
│   4. DEPLOY (MyJKKN)                                                 │
│   New module goes live                                               │
│   Passive tracking begins immediately                                │
│        │                                                             │
│        ▼                                                             │
│   5. MEASURE (Re-Census)                                             │
│   Next quarterly census shows:                                       │
│   "Phone calls about fees dropped 70% after Parent Fee Portal"      │
│   New gaps discovered → cycle repeats                                │
│        │                                                             │
│        └──────────────── back to step 1 ─────────────────────────   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### How the Handoff Works

**Step 1→2: Gap becomes Intent Interview project**

When a Module Gap reaches status `validated`:
- Admin clicks "Investigate This Gap" on the Automation Matrix
- System creates a new project in the Intent Interview Platform (API call)
- Pre-populates with: gap name, stakeholder type, sample activities from census, tool currently used
- Intent Platform runs its 11-territory interview with the ACTUAL stakeholders who reported the gap
- Output: Full PRD with territory coverage

**Step 2→3: PRD becomes Jicate project**

- Intent Platform generates complete spec
- Jicate Solutions team picks it up (manual handoff or automated)
- Builds the module per spec

**Step 4→5: Deployment triggers measurement**

- New module deployed in MyJKKN
- Passive tracking auto-activates (ai_page_views captures usage)
- Next census specifically asks: "Do you still do [X] on [old tool]?"
- Delta report shows impact: hours saved, tool migration, satisfaction

### Stakeholder Map

| Stakeholder | Census Channel | What Gaps They Reveal | Who Builds Solutions |
|-------------|---------------|----------------------|---------------------|
| **Staff** (counselors, admin, faculty) | MyJKKN FAB form | Internal operational gaps | Jicate + MyJKKN team |
| **Students** | MyJKKN form or PWA | Learning experience gaps, service gaps | Jicate Solutions |
| **Parents** | WhatsApp daily question | Communication gaps, transparency gaps, payment friction | Jicate Solutions |
| **Alumni** | WhatsApp / email survey | Engagement gaps, placement support gaps | Jicate Solutions |
| **Vendors** | PWA micro-form | Procurement/payment friction | Jicate Solutions |
| **Visitors/Applicants** | Google Form / WhatsApp | First-impression gaps, admission process friction | MyJKKN admission team |

### The Big Picture

JKKN becomes a **self-improving institution**:
- Every person who interacts with JKKN (staff, student, parent, alumni, vendor, visitor) feeds the intelligence
- The intelligence tells you exactly what to build, for whom, and in what order
- Jicate Solutions has a **data-driven product pipeline** — no more guessing what clients need
- Every quarter, you can measure: "Are we closer to 100% digital?" with hard numbers

This is not just a module. This is **institutional intelligence infrastructure**.

---

## Connection to the Bigger Vision

This module is Step 1 of the JKKN 100% Digital Transformation roadmap from FST #2:

```
CENSUS discovers where work lives today (mostly outside MyJKKN)
    ↓
GENOME maps the actual organization
    ↓
MODULE GAPS identify what to build next (← THIS IS THE CORE OUTPUT)
    ↓
PRIORITY MATRIX ranks what to build first
    ↓
BUILD the highest-priority module
    ↓
PASSIVE TRACKING measures adoption
    ↓
RE-CENSUS quarterly to measure progress + find new gaps
    ↓
REPEAT until 100% digitally orchestrated
```

**Activity Intelligence is not just a module — it's the META-MODULE.**
It doesn't do institutional work. It tells you which institutional work to bring into MyJKKN next. It's the compass for the entire product roadmap.

The goal isn't to optimize what's already in MyJKKN. The goal is to **discover everything that ISN'T in MyJKKN yet** and bring it in, one data-driven module at a time.

---

*Spec generated from FST Analysis Chain: Organizations-as-Workflows → 100%-Automation → Activity-Logging-Discovery → Module-Discovery-Engine*
