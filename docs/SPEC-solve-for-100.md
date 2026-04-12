# SPEC: Solve for 100 — Weekly Tracking System

> **Status:** READY FOR BUILD
> **Priority:** HIGH — program already running (started April 1, 2026)
> **Location:** Inside Startup Studio module (`/startup-studio/events/[id]/`)
> **Replaces:** External AI Forms at `ai-forms.jicate.solutions`

---

## Problem

The Solve for 100 program is running on disconnected Google-style forms (AI Forms platform). Each week someone creates a new form, collects responses, and gets a spreadsheet. Nobody can answer: *"Which teams went from 0 to 5 paid users between Week 1 and Week 4?"* because the data isn't linked to teams, progression levels, or mentor assignments.

## Solution

Build the weekly tracking system **natively inside MyJKKN Startup Studio**, where data links to existing team registrations, progression levels, and mentor assignments. 4 external forms become 4 native pages.

---

## What the 4 AI Forms Captured (73 responses, April 1)

### Form 1: Team Lock-In (28 responses)
Individual registration: name, roll number, college, department, team name, leader status, member list, team change tracking, phone number.
**Maps to:** Already exists as `event_registrations` + `event_team_members`. No new table needed — this is a process push, not a feature.

### Form 2: Ideal Customer Profile Builder (0 responses, 22 fields)
Deep customer discovery: ONE real person's demographics, problem description, frequency, cost, current solutions, elevator pitch, pricing, objections, market size, outreach plan, validation status.
**Maps to:** NEW table `solve100_icp_profiles`

### Form 3: Weekly Commitment (19 responses, 4 fields)
Team name, leader name, specific weekly commitment ("By next Thursday we will ___"), current verified paid users (0/1-5/6-10/11-25/26+).
**Maps to:** NEW table `solve100_weekly_checkins`

### Form 4: First Customer Plan (26 responses, 9 fields)
Problem description, ONE target customer (name + location), pricing, this week's acquisition plan, app status (live/needs fixes/building), app link, biggest blocker.
**Maps to:** Same `solve100_weekly_checkins` table (merged — weekly commitment and customer plan are one weekly submission)

---

## Database Schema

### Table 1: `solve100_weekly_checkins`
The core weekly tracking table. One row per team per week.

```sql
CREATE TABLE IF NOT EXISTS public.solve100_weekly_checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL CHECK (week_number >= 1 AND week_number <= 44),
    
    -- Weekly Commitment (what they'll DO this week)
    commitment TEXT NOT NULL,  -- "By next Thursday we will ___"
    commitment_result TEXT,    -- What actually happened (filled NEXT week)
    commitment_met BOOLEAN,    -- Did they deliver? (filled NEXT week)
    
    -- Customer Metrics (self-reported)
    verified_paid_users INTEGER DEFAULT 0,
    total_users INTEGER DEFAULT 0,
    active_users INTEGER DEFAULT 0,
    
    -- First Customer Plan
    target_customer_name TEXT,        -- ONE real person
    target_customer_location TEXT,    -- Where they are
    problem_description TEXT,         -- 2-3 sentences
    pricing TEXT,                     -- e.g., "Rs.299/month"
    acquisition_plan TEXT,            -- What conversation this week
    
    -- App Status
    app_status TEXT CHECK (app_status IN ('live', 'needs_fixes', 'building', 'pivoting')),
    app_url TEXT,
    
    -- Blockers
    biggest_blocker TEXT,
    blocker_resolved BOOLEAN DEFAULT false,
    
    -- Mentor Review
    mentor_reviewed BOOLEAN DEFAULT false,
    mentor_notes TEXT,
    mentor_reviewed_by UUID REFERENCES profiles(id),
    mentor_reviewed_at TIMESTAMPTZ,
    
    -- Meta
    submitted_by UUID NOT NULL REFERENCES profiles(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(event_id, team_id, week_number)
);

CREATE INDEX idx_solve100_checkins_event ON solve100_weekly_checkins(event_id);
CREATE INDEX idx_solve100_checkins_team ON solve100_weekly_checkins(team_id);
CREATE INDEX idx_solve100_checkins_week ON solve100_weekly_checkins(event_id, week_number);
```

### Table 2: `solve100_icp_profiles`
One ICP per team. Updated as teams learn more about their customer.

```sql
CREATE TABLE IF NOT EXISTS public.solve100_icp_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES startup_events(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
    
    -- SECTION 1: THE PERSON
    customer_name TEXT NOT NULL,       -- Real person's name
    customer_age_gender TEXT,          -- "25, Male"
    customer_role TEXT,                -- Job/position
    customer_location TEXT,            -- Where they work
    customer_income TEXT,              -- Income bracket
    customer_phone_type TEXT,          -- Device type
    
    -- SECTION 2: THE PROBLEM
    problem_in_their_words TEXT NOT NULL,  -- Customer's own language
    problem_frequency TEXT,                -- Daily/weekly/monthly/rarely
    problem_cost TEXT,                     -- Money/time/both
    current_solution TEXT,                 -- How they handle it today
    current_spend TEXT,                    -- What they pay now
    
    -- SECTION 3: THE SALE
    elevator_pitch TEXT,              -- 2 sentences
    proposed_price TEXT,              -- What you'll charge
    value_justification TEXT,         -- Why they'd pay
    top_objection TEXT,               -- #1 reason they say NO
    objection_response TEXT,          -- How you counter
    
    -- SECTION 4: THE MARKET
    market_size_50km TEXT,            -- How many similar customers
    where_they_gather TEXT,           -- Physical/online gathering spots
    plan_to_reach_10 TEXT,            -- Specific names, places, dates
    has_talked_to_customer TEXT CHECK (has_talked_to_customer IN (
        'yes_in_person', 'yes_phone', 'no_watched', 'no_guessing'
    )),
    talk_date TEXT,                   -- When they'll talk (if not yet)
    
    -- Meta
    submitted_by UUID NOT NULL REFERENCES profiles(id),
    version INTEGER DEFAULT 1,        -- Track ICP revisions
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(event_id, team_id)
);
```

### RLS Policies (both tables)

```sql
-- Team members can see their own team's data
-- Super admins see all
-- Mentors see assigned teams
-- INSERT: team leader or member
-- UPDATE: team leader + mentor (review fields)
```

---

## Pages to Build

### Page 1: `/startup-studio/events/[id]/solve-for-100`
**The hub page.** Shows all Solve for 100 teams, their current week, metrics, and progression.

| Element | Content |
|---------|---------|
| Summary Cards | Total teams, Average paid users, Teams at each level (L1-L5), % with blockers |
| Team Table | Team name, Current week, Paid users, Active users, App status, Blocker, Level badge, Last check-in |
| Filters | By institution, by level, by blocker status, by app status |
| Sort | By paid users (desc), by last check-in, by team name |

### Page 2: `/startup-studio/events/[id]/solve-for-100/weekly`
**Weekly check-in form.** Team leader fills this every Thursday.

| Section | Fields |
|---------|--------|
| This Week's Results | Did you meet last week's commitment? (Yes/No + what happened) |
| Next Week's Commitment | "By next Thursday we will ___" (specific, measurable) |
| Customer Metrics | Verified paid users, Total users, Active users |
| First Customer Plan | Target customer (name + location), Problem, Pricing, Acquisition plan |
| App Status | Live / Needs fixes / Building / Pivoting + App URL |
| Blockers | Biggest blocker + Is last week's resolved? |

**Behavior:**
- Pre-fills team name from registration
- Shows previous week's commitment for accountability
- Draft auto-save (sessionStorage)
- Locked after Thursday 11:59 PM (configurable deadline)
- One submission per team per week (UNIQUE constraint)

### Page 3: `/startup-studio/events/[id]/solve-for-100/icp`
**ICP Builder form.** Team fills once, can update as they learn.

| Section | Fields |
|---------|--------|
| The Person | Name, Age/Gender, Role, Location, Income, Phone type |
| The Problem | In their words, Frequency, Cost, Current solution, Current spend |
| The Sale | Elevator pitch (2 sentences), Price, Value justification, Top objection + response |
| The Market | Market size within 50km, Where they gather, Plan to reach first 10, Validation status |

**Behavior:**
- One ICP per team (can edit/version)
- Shows version history
- Draft auto-save
- Validation status prominently displayed ("Have you TALKED to this person?")

### Page 4: `/startup-studio/events/[id]/solve-for-100/mentor`
**Mentor review dashboard.** Mentors see their assigned teams.

| Element | Content |
|---------|---------|
| Team Cards | Each assigned team: latest check-in summary, metrics trend, blocker alert |
| Review Action | Add notes, mark as reviewed |
| Alerts | Teams with 0 progress for 2+ weeks, unresolved blockers, commitment missed |
| Timeline | Week-by-week history for each team |

---

## Services to Build

### `Solve100WeeklyCheckinService` (`lib/services/startup-studio/solve100-weekly-checkin-service.ts`)

| Method | Description |
|--------|-------------|
| `getMyCheckin(eventId, teamId, weekNumber)` | Current week's check-in |
| `submitCheckin(dto)` | Create or update weekly check-in |
| `getTeamHistory(eventId, teamId)` | All check-ins for a team (time series) |
| `getEventWeeklyOverview(eventId, weekNumber)` | All teams for one week |
| `getEventDashboard(eventId)` | Aggregate metrics for Solve for 100 hub |
| `mentorReview(checkinId, notes, mentorId)` | Mentor marks reviewed |
| `getUnreviewedCheckins(eventId, mentorId?)` | Checkins needing review |

### `Solve100ICPService` (`lib/services/startup-studio/solve100-icp-service.ts`)

| Method | Description |
|--------|-------------|
| `getMyICP(eventId, teamId)` | Team's current ICP |
| `createICP(dto)` | Submit ICP |
| `updateICP(id, dto)` | Update ICP (increments version) |
| `getEventICPs(eventId)` | All ICPs for admin view |

---

## Hooks to Build

### `use-solve100-weekly.ts`
- `useMyWeeklyCheckin(eventId, teamId, week)` → query
- `useSubmitWeeklyCheckin()` → mutation
- `useTeamHistory(eventId, teamId)` → query
- `useWeeklyOverview(eventId, week)` → query
- `useSolve100Dashboard(eventId)` → query
- `useMentorReview()` → mutation

### `use-solve100-icp.ts`
- `useMyICP(eventId, teamId)` → query
- `useSubmitICP()` → mutation
- `useUpdateICP()` → mutation

---

## Constants to Add

### `lib/constants/startup-studio/solve100.ts`

```typescript
export const SOLVE100_WEEKS = 44; // 10 months
export const CHECKIN_DEADLINE_DAY = 4; // Thursday (0=Sun)
export const CHECKIN_DEADLINE_HOUR = 23; // 11:59 PM
export const PAID_USER_BRACKETS = ['0', '1-5', '6-10', '11-25', '26-50', '51-100', '100+'];
export const APP_STATUS_OPTIONS = ['live', 'needs_fixes', 'building', 'pivoting'];
export const VALIDATION_STATUS = ['yes_in_person', 'yes_phone', 'no_watched', 'no_guessing'];
```

---

## Sidebar Menu Addition

Under Startup Studio → Events → [event]:
```
├── Solve for 100           ← NEW (hub/dashboard)
│   ├── Weekly Check-in     ← NEW (form)
│   ├── ICP Builder         ← NEW (form)
│   └── Mentor Review       ← NEW (mentor only)
```

---

## Progression Auto-Triggers

Connect weekly check-in metrics to existing progression system:

| Metric | Triggers |
|--------|----------|
| `verified_paid_users >= 25` + `active_users >= 5` organic | Auto-award Level 2 (Traction Builder) |
| `active_users >= 100` + has automation | Auto-award Level 3 (Solution Architect) |
| Revenue covers costs (manual verification) | Admin awards Level 4 (AI Orchestrator) |

---

## Migration from AI Forms

The 73 existing responses on AI Forms inform the data model but do NOT need migration. The program just started (Week 1). Teams will use the MyJKKN forms starting from Week 2 onward.

---

## Build Order

| Phase | What | Files |
|-------|------|-------|
| 1 | Database tables + RLS | `supabase/setup/01_tables.sql`, `03_policies.sql` |
| 2 | Types | `types/startup-studio.ts` |
| 3 | Services | `lib/services/startup-studio/solve100-*.ts` |
| 4 | Hooks | `hooks/startup-studio/use-solve100-*.ts` |
| 5 | Hub page (dashboard) | `app/(routes)/startup-studio/events/[id]/solve-for-100/page.tsx` |
| 6 | Weekly check-in form | `app/(routes)/startup-studio/events/[id]/solve-for-100/weekly/page.tsx` |
| 7 | ICP Builder form | `app/(routes)/startup-studio/events/[id]/solve-for-100/icp/page.tsx` |
| 8 | Mentor review page | `app/(routes)/startup-studio/events/[id]/solve-for-100/mentor/page.tsx` |
| 9 | Sidebar menu | `lib/sidebarMenuLink.ts` |
| 10 | Dashboard tab | Add Solve for 100 tab to existing dashboard |

---

## To Execute

Start a fresh Claude Code session and say:

```
Read docs/SPEC-solve-for-100.md and build it. Follow existing Startup Studio patterns.
Start with Phase 1 (database) and go through all 10 phases.
```

The spec has everything — tables, fields, services, hooks, pages, menu, and build order.
