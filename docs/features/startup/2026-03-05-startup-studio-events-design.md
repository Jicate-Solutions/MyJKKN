# Startup Studio — Events Module Design
*Date: 2026-03-05 | Status: Approved | First event: JKKN Appathon 2.0*

---

## Overview

Startup Studio is a **generic event platform** built into MyJKKN. It can host hackathons, competitions, and buildathons across all 6 JKKN colleges. Appathon 2.0 is the first event.

**Roles:**
- `Admin` — Event coordinator, manages everything
- `Student` (team leader + members) — Registers team, submits project
- `Staff/Faculty` (mentors + judges) — Assigned to venues via existing staff table
- `Evaluator` — Subset of staff assigned to Demo Day; sees submissions list

---

## Key Design Decisions (from interview)

| Decision | Choice | Reason |
|----------|--------|--------|
| Deadline model | Two separate deadlines | `submission_deadline` (Sunday 6PM) locks GitHub/app/description. `metrics_deadline` (Monday 9AM) locks MRR/users/proof URLs. |
| Mentor identity | Staff/faculty profiles | Mentors are found via the existing `staff` table, not learner profiles. |
| Cross-college teams | Allowed; leader's institution decides venue | All members can come from different colleges; auto-allocate uses team leader's `institution_id`. |
| Leaderboard visibility | Hidden until admin publishes | Admin always sees live. Evaluators see submissions list (no rank). Students see "Results coming soon" until `is_results_published = true`. |
| Checklist system | Multi-role | Admin (pre/post-event), Mentor (on-day), Team (on-day). Each role sees only their checklists. |
| Venue source | Both: RM picker + manual entry | `resource_id` is nullable on `event_venue_assignments`; manual name/building/room used as fallback. |
| MRR verification | Batch — Level 4/5 only | Admin verification queue shows only teams claiming revenue, sorted descending by MRR. |
| Lovable verification | Simple admin checkbox | At Build Day check-in, admin toggles `lovable_verified` per team row. |
| Team membership | Instant — no confirmation | Leader adds member by email or student_id; member appears on team immediately. Leader can remove. |
| Phase 3 gap UX | Show "Venue coming soon" | My Team page shows registration confirmed + pending venue/mentor placeholder cards. |
| Navigation | Top-level Startup Studio sidebar | New sidebar group with role-filtered submenus. |
| Capacity overflow | Partial allocation + unallocated list | Auto-allocate fills up to capacity; remaining teams shown in a separate "Unallocated" list. |
| Module scope | Generic platform | `startup_events.config` JSONB holds scoring rules, categories, tools — reusable across future events. |

---

## Database Schema

### Core Tables

```sql
-- 1. Events (generic, reusable across future events)
startup_events (
  id UUID PK,
  name TEXT,
  description TEXT,
  host_institution_id UUID FK institutions (nullable — cross-institution events),
  status TEXT CHECK IN ('draft','registration_open','registration_closed','build_day','demo_day','closed'),
  start_date TIMESTAMPTZ,         -- Build Day start
  end_date TIMESTAMPTZ,           -- Build Day end (used for submission_deadline calc)
  demo_date TIMESTAMPTZ,          -- Demo Day
  registration_deadline TIMESTAMPTZ,
  submission_deadline TIMESTAMPTZ, -- Locks: github_url, live_app_url, description, category
  metrics_deadline TIMESTAMPTZ,    -- Locks: mrr_amount, paying_users, proof_urls
  is_results_published BOOLEAN DEFAULT false,
  config JSONB,                   -- { team_max_size, categories[], tools[], scoring_type, tier_points, mrr_bonus_brackets }
  created_by UUID FK profiles,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- 2. Team registrations
event_registrations (
  id UUID PK,
  event_id UUID FK startup_events,
  team_name TEXT,
  problem_idea TEXT,              -- min 20 chars
  owner_id UUID FK profiles,      -- team leader (who registered)
  institution_id UUID FK institutions, -- from owner's profile; used for venue auto-allocate
  lovable_verified BOOLEAN DEFAULT false,
  lovable_verified_at TIMESTAMPTZ,
  lovable_verified_by UUID FK profiles,
  checked_in BOOLEAN DEFAULT false,
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID FK profiles,
  status TEXT CHECK IN ('registered','checked_in','disqualified'),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(event_id, owner_id)      -- leader can't register two teams for same event
)

-- 3. Team members (instant, no confirmation)
event_team_members (
  id UUID PK,
  registration_id UUID FK event_registrations,
  profile_id UUID FK profiles (nullable), -- null if student not in system
  email TEXT NOT NULL,
  full_name TEXT,
  student_id TEXT,               -- for display
  has_laptop BOOLEAN DEFAULT false,
  added_at TIMESTAMPTZ,
  UNIQUE(registration_id, email)  -- no duplicate members per team
)

-- 4. Venues (link events to rooms/labs from resource management OR manual entry)
event_venue_assignments (
  id UUID PK,
  event_id UUID FK startup_events,
  resource_id UUID FK resources (nullable), -- if picked from RM
  manual_name TEXT,              -- if manually entered
  manual_building TEXT,
  manual_room TEXT,
  capacity_override INT,         -- overrides resource.capacity if set
  day_type TEXT CHECK IN ('build_day','demo_day'),
  institution_id UUID FK institutions, -- which college this venue belongs to
  created_at TIMESTAMPTZ
)

-- 5. Team-to-venue allocation
event_team_venue_allocations (
  id UUID PK,
  event_id UUID FK startup_events,
  registration_id UUID FK event_registrations,
  venue_assignment_id UUID FK event_venue_assignments,
  day_type TEXT CHECK IN ('build_day','demo_day'),
  allocated_at TIMESTAMPTZ,
  allocated_by UUID FK profiles,
  UNIQUE(event_id, registration_id, day_type) -- one venue per team per day type
)

-- 6. Staff assignments (mentors/judges at venues)
event_staff_assignments (
  id UUID PK,
  event_id UUID FK startup_events,
  venue_assignment_id UUID FK event_venue_assignments,
  staff_id UUID FK staff,         -- from existing staff table
  role TEXT CHECK IN ('mentor','lead_mentor','judge','panel_chair','evaluator'),
  day_type TEXT CHECK IN ('build_day','demo_day'),
  created_at TIMESTAMPTZ,
  UNIQUE(event_id, staff_id, venue_assignment_id, day_type)
)

-- 7. Demo Day presentation slots
event_demo_slots (
  id UUID PK,
  event_id UUID FK startup_events,
  venue_assignment_id UUID FK event_venue_assignments,
  registration_id UUID FK event_registrations (nullable), -- assigned team
  start_time TIMESTAMPTZ,
  duration_minutes INT DEFAULT 5,
  room_label TEXT,
  slot_order INT,
  created_at TIMESTAMPTZ
)

-- 8. Project submissions (two-phase deadline)
event_submissions (
  id UUID PK,
  event_id UUID FK startup_events,
  registration_id UUID FK event_registrations,
  UNIQUE(event_id, registration_id),

  -- Phase 1 fields: locked at submission_deadline
  app_name TEXT,
  github_url TEXT,               -- must start with https://github.com/
  live_app_url TEXT,
  description TEXT,
  category TEXT,                 -- from event.config.categories

  -- Phase 2 fields: locked at metrics_deadline
  mrr_amount DECIMAL(10,2) DEFAULT 0,
  paying_users_count INT DEFAULT 0,
  user_count INT DEFAULT 0,      -- for Level 2/3 tier calculation
  proof_urls TEXT[] DEFAULT '{}',

  -- Verification (batch — only Level 4/5 teams)
  mrr_verified BOOLEAN DEFAULT false,
  mrr_verified_at TIMESTAMPTZ,
  mrr_verified_by UUID FK profiles,
  mrr_rejected_reason TEXT,

  -- Denormalized scoring (recalculated on metrics save)
  tier_level INT DEFAULT 0,      -- 0-5
  tier_points INT DEFAULT 0,
  mrr_bonus_points INT DEFAULT 0,
  total_score INT DEFAULT 0,

  submitted_at TIMESTAMPTZ,
  submitted_by UUID FK profiles,
  metrics_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- 9. Checklists (multi-role)
event_checklists (
  id UUID PK,
  event_id UUID FK startup_events,
  title TEXT,
  phase TEXT CHECK IN ('pre_event','on_day','post_event'),
  target_role TEXT CHECK IN ('admin','mentor','team'),
  order_index INT
)

event_checklist_items (
  id UUID PK,
  checklist_id UUID FK event_checklists,
  title TEXT,
  description TEXT,
  order_index INT,
  is_required BOOLEAN DEFAULT false
)

event_checklist_completions (
  id UUID PK,
  checklist_item_id UUID FK event_checklist_items,
  completed_by UUID FK profiles,
  registration_id UUID FK event_registrations (nullable), -- for team checklists
  staff_assignment_id UUID FK event_staff_assignments (nullable), -- for mentor checklists
  completed_at TIMESTAMPTZ
)
```

### Scoring Logic (service layer, not DB trigger)

Scoring is **calculated in TypeScript** and stored denormalized on `event_submissions`:

```
Tier calculation (uses event.config.tier_points):
  L0: app not deployed          → 0 pts
  L1: live URL works            → 10 pts
  L2: 5+ users signed up        → 20 pts  (user_count >= 5)
  L3: 10+ active users          → 30 pts  (user_count >= 10)
  L4: any revenue               → 40 pts  (mrr_amount > 0)
  L5: ₹100+ MRR or 5+ paying   → 50 pts  (mrr_amount >= 100 OR paying_users_count >= 5)

MRR Bonus (only if tier >= 4, mrr_verified = true):
  ₹1–₹99     → +5 pts
  ₹100–₹499  → +10 pts
  ₹500–₹999  → +15 pts
  ₹1000+     → +20 pts

total_score = tier_points + mrr_bonus_points
Tiebreaker: higher mrr_amount wins. Secondary: earlier submitted_at.
```

Recalculated every time metrics are updated (before metrics_deadline).

---

## RLS Policy Strategy

```
Admin (super_admin / administrator roles):
  - Full access to all startup_studio tables for their institution(s)
  - super_admin sees all institutions

Student (team owner):
  - event_registrations: SELECT/INSERT/UPDATE own rows (owner_id = auth.uid())
  - event_team_members: SELECT/INSERT/DELETE where registration.owner_id = auth.uid()
  - event_submissions: SELECT/INSERT/UPDATE where registration.owner_id = auth.uid()
    AND now() < submission_deadline (for Phase 1 fields)
    AND now() < metrics_deadline (for Phase 2 fields)

Student (team member, not owner):
  - event_registrations: SELECT only (where profile_id in team_members)
  - event_submissions: SELECT only

Staff/Mentor (event_staff_assignments):
  - event_registrations: SELECT (for their assigned venue's teams)
  - event_submissions: SELECT (for their assigned venue's teams)
  - event_demo_slots: SELECT
  - event_checklist_completions: INSERT/UPDATE own completions

Leaderboard:
  - event_submissions: SELECT only if event.is_results_published = true
    OR current user has admin role
```

---

## Service Layer

```
lib/services/startup-studio/
  event-service.ts               -- getEvents, getEvent, createEvent, updateEvent, updateStatus
  event-registration-service.ts  -- registerTeam, addMember, removeMember, lookupMember,
                                 --   validateRegistration (deadline, dup, size checks)
  event-venue-service.ts         -- addVenue, removeVenue, assignStaff, autoAllocate,
                                 --   getUnallocatedTeams, manualAllocate
  event-submission-service.ts    -- createSubmission, updateSubmission, updateMetrics,
                                 --   verifyMrr, rejectMrr, calculateScore
  event-leaderboard-service.ts   -- getLeaderboard, publishResults, getMrrVerificationQueue
  event-checklist-service.ts     -- seedChecklists, getChecklists, completeItem
```

---

## Page Map

### Student Pages
| Route | Purpose |
|-------|---------|
| `/startup-studio` | Event list (upcoming events) |
| `/startup-studio/events/[id]` | Event detail + "Register Your Team" CTA |
| `/startup-studio/events/[id]/register` | Team registration form |
| `/startup-studio/events/[id]/my-team` | Team status, venue (pending→assigned), demo slot |
| `/startup-studio/events/[id]/submit` | Two-phase submission form |

### Mentor/Staff Pages
| Route | Purpose |
|-------|---------|
| `/startup-studio/events/[id]/my-assignment` | Venue details + assigned teams list |

### Admin Pages
| Route | Purpose |
|-------|---------|
| `/startup-studio/events/[id]/registrations` | All teams, check-in, Lovable toggle |
| `/startup-studio/events/[id]/venues` | Venue setup, mentor assignment, auto-allocate |
| `/startup-studio/events/[id]/demo-day` | Slot generation, team assignment |
| `/startup-studio/events/[id]/leaderboard` | Rankings, MRR verification queue, Publish Results |
| `/startup-studio/events/[id]/checklists` | Admin pre/post-event checklists |

---

## Navigation (sidebarMenuLink.ts)

```
Startup Studio (new top-level group, icon: Rocket or Sparkles)
  All roles:
    Events                → /startup-studio
  Student only:
    My Team               → /startup-studio/events/[active-event]/my-team
    Submit Project        → /startup-studio/events/[active-event]/submit
  Staff/Mentor only:
    My Assignment         → /startup-studio/events/[active-event]/my-assignment
  Admin only:
    Registrations         → /startup-studio/events/[id]/registrations
    Venues & Mentors      → /startup-studio/events/[id]/venues
    Demo Day              → /startup-studio/events/[id]/demo-day
    Leaderboard           → /startup-studio/events/[id]/leaderboard
    Checklists            → /startup-studio/events/[id]/checklists
```

Permissions follow pattern: `startup_studio.events.view`, `startup_studio.registrations.manage`, etc.

---

## Implementation Order (8 Phases)

1. **Foundation** — SQL migration (all tables), RLS policies, TypeScript types
2. **Event List + Detail** — event-service.ts, events list page, event detail page
3. **Team Registration + My Team** — registration service, register form, my-team page
4. **Admin Registrations** — registrations data table, check-in toggle, Lovable toggle
5. **Venues & Allocation** — venue service, venues admin page, auto-allocate, mentor assignment
6. **Submission + Metrics** — submission service (two-phase), submit form, my-assignment page
7. **Leaderboard + Demo Day** — scoring, leaderboard page, publish, MRR queue, demo-day page
8. **Checklists + Sidebar** — checklist service, checklists page, sidebarMenuLink.ts update

---

*Design approved: 2026-03-05*
