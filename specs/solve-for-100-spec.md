---
title: Solve for 100 — Module Specification
version: 1.0
created: 2026-03-30
session_date: 2026-03-30
session_context: Deep interview with user on Solve for 100 requirements
status: approved
module: startup-studio/solve-for-100
---

# Solve for 100 — Module Specification

> **Module:** Startup Studio / Solve for 100
> **Platform:** MyJKKN (Next.js 16 + Supabase)
> **Parent Module:** Startup Studio (existing)
> **Version:** 1.0
> **Last Updated:** 2026-03-30

---

## 1. Problem Statement

### Why This Module Exists

After Demo Day, teams that choose the "Solve for 100" track enter a 10-month sprint to acquire 100 cumulative paying users. Today there is **no operational infrastructure** for this journey. Teams declare a track via `track_declarations`, receive a progression level badge, and then... nothing. There is no place to log check-ins, no way to track paying user growth, no mentor dashboard for stalled teams, no leaderboard, no stall escalation policy, and no structured pathway from "I declared a track" to "I graduated into NIF."

### The Gap

| What Exists Today | What Is Missing |
|---|---|
| Track declaration (`track_declarations` table) | Program enrollment, cohort management |
| Progression levels 1-5 (individual badges) | Phase-based team journey with entry/exit criteria |
| Appathon submission metrics (MRR, users, etc.) | Ongoing paid-user tracking with verification |
| Mentor tables (`ss_mentors`, `ss_mentor_matches`, `ss_mentor_sessions`) | Mentor view with stalled alerts, check-in reviews |
| NIF pipeline (`ss_nif_candidates`) | Automated graduation flow into NIF |
| Privileges module (`privilege_*` tables) | Integration to display privilege status on team dashboard |

### The Goal

Build a complete operational module that transforms "I declared Solve for 100" into a structured, tracked, mentored, deadline-driven journey to 100 cumulative paid external users — or removal from the program.

---

## 2. Users & Personas

### 2A. Learner (Team Member)

- **Who:** Any JKKN learner on a team that declared `solve_for_100`.
- **Context:** Working on their app alongside regular coursework. Need a dashboard that shows progress, prompts weekly check-ins, and celebrates milestones.
- **Pain:** No visibility into where they stand, no accountability structure, no connection to mentors or institutional support.

### 2B. Team Leader

- **Who:** The `is_leader = true` member from `event_team_members`. Makes decisions for the team.
- **Context:** Submits check-ins, logs paid user metrics, manages team roster (add/remove members with admin approval), declares pivots.
- **Pain:** Currently has no place to report progress after Demo Day.

### 2C. Mentor

- **Who:** Assigned via `ss_mentor_matches`. Existing NIF mentor ecosystem.
- **Context:** Oversees 1-5 teams. Needs to see which teams are active vs stalled, review check-ins, provide feedback, log session notes.
- **Pain:** No mentor-specific view for the Solve for 100 journey. Must manually track via chat/email.

### 2D. Admin (Program Manager)

- **Who:** Staff with `role = 'admin'` or `role = 'super_admin'`.
- **Context:** Manages the overall program. Creates cohorts, enrolls teams, verifies self-reported payments, handles stall escalations, manages deadlines.
- **Pain:** No program-level visibility. Cannot see funnel (how many teams are in each phase), cannot identify stalled teams, no verification queue.

### 2E. Public Visitor (No Login)

- **Who:** Anyone with the leaderboard URL.
- **Context:** Prospective learners, parents, industry partners, media.
- **Pain:** No way to see which JKKN teams are building real businesses.

---

## 3. User Stories

### 3A. Learner / Team Leader Stories

| ID | Story | Acceptance Criteria |
|---|---|---|
| L-01 | As a team leader, I want to enroll my team in Solve for 100 so we can start the structured program | Team with `track = 'solve_for_100'` can enroll. Auto-advances to correct phase based on existing Appathon metrics. |
| L-02 | As a team leader, I want to submit weekly check-ins so mentors and admins can see our progress | Check-in form with: what_did_you_do, blockers, next_steps, wins, metric_snapshot. Saved with timestamp. |
| L-03 | As a team leader, I want to log new paid users with proof so our counter goes up | Can enter transaction details (user identifier, amount, gateway, date) and upload proof (screenshot, transaction ID). |
| L-04 | As a team leader, I want to see our paid user counter (X/100) prominently on our dashboard | Large counter showing cumulative paid users, with active count as secondary metric. |
| L-05 | As a team leader, I want to see which phase we are in and what we need to do to advance | Phase indicator with current phase highlighted, entry/exit criteria visible, progress bar. |
| L-06 | As a team member, I want to see our team's full check-in history | Scrollable list of all check-ins with dates, content, and mentor feedback. |
| L-07 | As a team leader, I want to log customer discovery interviews | Customer name/role, key quote, pain level, follow-up needed. |
| L-08 | As a team leader, I want to record pivots with reasoning | Pivot log: what changed, why, date, evidence. |
| L-09 | As a team leader, I want to see our leaderboard position | Leaderboard link showing our rank within our phase group. |
| L-10 | As a team leader, I want to see our institutional support status | Display privilege status (on-duty, lab access, scholarship, NIF funding) from `privilege_members`. |
| L-11 | As a team member, I want to see other teams' detailed progress | Full transparency: can view any enrolled team's check-ins, interviews, pivots, and metrics. |
| L-12 | As a team leader, I want to submit optional daily micro-updates | Short text field (280 chars max) for quick daily status. |
| L-13 | As a team leader, I want to add or remove team members with admin approval | Request form for roster changes. Admin approves/rejects. Original Appathon team members can be re-invited. |
| L-14 | As a team leader, I want to declare our problem domain, target customer segment, and pricing model | Fields on team profile: problem_domain, target_segment, pricing_model (subscription/one-time/freemium). |

### 3B. Mentor Stories

| ID | Story | Acceptance Criteria |
|---|---|---|
| M-01 | As a mentor, I want to see all my assigned Solve for 100 teams in one dashboard | Card-based view showing each team's phase, paid user count, last check-in date, stall status. |
| M-02 | As a mentor, I want to be alerted when a team is stalling | Visual indicator (yellow/red) on team cards. Yellow = 2 weeks no check-in. Red = 4 weeks. |
| M-03 | As a mentor, I want to review and comment on check-ins | Each check-in has a "Mentor Feedback" text area. Feedback triggers notification to team. |
| M-04 | As a mentor, I want to log mentoring sessions | Reuses `ss_mentor_sessions` table. Session date, duration, topics, action items, next session date. |
| M-05 | As a mentor, I want to see a team's full journey timeline | Chronological view of all events: check-ins, metric updates, pivots, customer interviews, mentor sessions. |

### 3C. Admin Stories

| ID | Story | Acceptance Criteria |
|---|---|---|
| A-01 | As an admin, I want to create a new Solve for 100 program/cohort | Program has: name, source_event_id, enrollment_deadline, hard_deadline, description. |
| A-02 | As an admin, I want to see a phase funnel visualization | Bar chart or funnel showing team count per phase: Setup, PSF, First Users, Growth, 100 Users, Graduated. |
| A-03 | As an admin, I want to see all teams in a filterable/sortable table | Columns: team_name, college, phase, paid_users, last_check_in, stall_status, mentor. Filters by phase, college, stall status. |
| A-04 | As an admin, I want a verification queue for self-reported payments | Queue showing unverified payment claims. Admin can verify or reject with notes. |
| A-05 | As an admin, I want to manage stall escalations | See all teams at warning/probation/removal stages. Bulk actions for escalation. |
| A-06 | As an admin, I want to export program data as CSV | Export all teams with metrics, phases, check-in counts, paid users. |
| A-07 | As an admin, I want to manage enrollment (add/remove teams, approve roster changes) | Enrollment management panel. Can manually enroll teams, approve/reject join/leave requests. |
| A-08 | As an admin, I want to trigger bulk auto-advance for teams that meet phase criteria | Button to run auto-advance check across all enrolled teams. Shows preview before applying. |
| A-09 | As an admin, I want to see JICATE Razorpay transactions auto-verified | Transactions from JICATE Razorpay gateway are marked `auto_verified = true` and skip the queue. |

### 3D. Public Stories

| ID | Story | Acceptance Criteria |
|---|---|---|
| P-01 | As a public visitor, I want to see a leaderboard of Solve for 100 teams | No-login page. Teams grouped by phase. Shows team name, college, paid users, phase. |
| P-02 | As a public visitor, I want to see the program's aggregate stats | Total teams, total paid users across all teams, teams that graduated, average time to first sale. |

---

## 4. Requirements

### 4A. Must-Have (P0)

| # | Requirement | Acceptance Criteria |
|---|---|---|
| R-01 | Program/cohort creation and management | Admin can create programs with deadlines, link to source events. |
| R-02 | Team enrollment with auto-advance | Teams enrolling with existing Appathon metrics skip to the correct phase automatically. |
| R-03 | Phase engine with 6 phases | Setup -> Problem-Solution Fit -> First Users (5) -> Growth (25) -> 100 Users -> Graduated. Entry/exit criteria enforced. |
| R-04 | Paid user tracking (cumulative + active) | Cumulative counter never decreases. Active counter tracks current paying users. Refunds reduce active, not cumulative. |
| R-05 | Weekly check-in system | Structured form: what_did_you_do, blockers, next_steps, wins, metric_snapshot. Minimum weekly frequency. |
| R-06 | Payment verification queue | Self-reported payments queue for admin verification. JICATE Razorpay auto-verifies. |
| R-07 | Stall escalation engine | 2-week warning, 4-week probation, 8-week removal. Automated detection, manual override. |
| R-08 | Mentor dashboard | Assigned teams view with stall indicators, check-in review, session logging (reuse `ss_mentor_sessions`). |
| R-09 | Team dashboard | Phase indicator, paid user counter (0/100), check-in history, milestone timeline. |
| R-10 | Admin overview dashboard | Phase funnel, all-teams table, stalled teams list, verification queue, export. |
| R-11 | Public leaderboard | No-auth page, grouped by phase, shows team name + college + paid users + phase. |
| R-12 | Notifications | Push + in-app for: weekly reminder, milestones (1/10/25/50/100), mentor feedback, stall warnings, deadline warnings. |
| R-13 | Paid user definition enforcement | Minimum Rs.50 per transaction OR recurring subscription. Max 20% JKKN internal users. |
| R-14 | Hard deadline: October 30, 2026 | Configurable per program. Displayed on all dashboards. |
| R-15 | Graduation flow into NIF | When team hits 100 paid users, trigger graduation workflow. Surface NIF equity terms. Insert into `ss_nif_candidates`. |
| R-16 | Full transparency between teams | Any enrolled learner can view any other team's check-ins, interviews, pivots, and metrics. |

### 4B. Nice-to-Have (P1)

| # | Requirement | Acceptance Criteria |
|---|---|---|
| R-17 | Customer discovery log | Structured interview logs with name, role, quote, pain level. |
| R-18 | Pivot tracker | Log pivots with before/after, reasoning, date. |
| R-19 | Daily micro-updates | Optional 280-char quick status updates. |
| R-20 | Team value declaration | Problem domain, target customer segment, pricing model fields. |
| R-21 | Privilege status integration | Display on-duty, lab access, scholarship, NIF funding from `privilege_members` table. |
| R-22 | Program aggregate stats on public page | Total teams, total paid users, graduated count, avg time to first sale. |
| R-23 | Roster change requests | Team leader requests add/remove, admin approves. Re-invite original Appathon members. |

### 4C. Out of Scope (V2)

| # | Item | Reason |
|---|---|---|
| OS-01 | JICATE Razorpay API integration | V1 uses admin manual verification. V2 adds webhook-based auto-verification. |
| OS-02 | In-app payment gateway | Teams use external gateways. We track, not process. |
| OS-03 | Automated revenue share calculation | NIF equity terms are surfaced, not calculated. |
| OS-04 | AI-powered stall prediction | V1 uses simple time-based rules. |
| OS-05 | Multi-program comparison analytics | V1 supports one active program at a time per view. |

---

## 5. Data Model

### 5A. New Tables

#### `sf100_programs` — Program/Cohort Registry

```sql
CREATE TABLE sf100_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                          -- e.g., "Solve for 100 — Batch 1 (Appathon 2026)"
  description TEXT,
  source_event_id UUID REFERENCES startup_events(id) ON DELETE SET NULL,
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- Dates
  enrollment_start DATE,
  enrollment_deadline DATE,
  hard_deadline DATE NOT NULL,                 -- e.g., 2026-10-30
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Config
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'enrollment_open', 'active', 'completed', 'archived'
  )),
  paid_user_target INTEGER NOT NULL DEFAULT 100,
  min_transaction_amount NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  max_internal_user_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  stall_warning_days INTEGER NOT NULL DEFAULT 14,
  stall_probation_days INTEGER NOT NULL DEFAULT 28,
  stall_removal_days INTEGER NOT NULL DEFAULT 56,

  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_programs_institution ON sf100_programs(institution_id);
CREATE INDEX idx_sf100_programs_status ON sf100_programs(status);
CREATE INDEX idx_sf100_programs_source_event ON sf100_programs(source_event_id);
```

#### `sf100_enrollments` — Team Enrollment

```sql
CREATE TYPE sf100_phase AS ENUM (
  'setup',
  'problem_solution_fit',
  'first_users',
  'growth',
  'hundred_users',
  'graduated'
);

CREATE TYPE sf100_enrollment_status AS ENUM (
  'active', 'warning', 'probation', 'removed', 'graduated', 'withdrawn'
);

CREATE TABLE sf100_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES sf100_programs(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,

  -- Phase tracking
  current_phase sf100_phase NOT NULL DEFAULT 'setup',
  phase_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Status
  status sf100_enrollment_status NOT NULL DEFAULT 'active',
  status_changed_at TIMESTAMPTZ DEFAULT NOW(),
  status_reason TEXT,

  -- Metrics (denormalized for fast reads)
  cumulative_paid_users INTEGER NOT NULL DEFAULT 0,
  active_paid_users INTEGER NOT NULL DEFAULT 0,
  internal_paid_users INTEGER NOT NULL DEFAULT 0,     -- subset of cumulative that are JKKN
  total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Value declaration
  problem_domain TEXT,
  target_segment TEXT,
  pricing_model TEXT CHECK (pricing_model IS NULL OR pricing_model IN (
    'subscription', 'one_time', 'freemium', 'usage_based', 'other'
  )),

  -- Stall tracking
  last_check_in_at TIMESTAMPTZ,
  warning_sent_at TIMESTAMPTZ,
  probation_sent_at TIMESTAMPTZ,

  -- Auto-advance seed data (from Appathon)
  seed_paying_users INTEGER DEFAULT 0,
  seed_mrr NUMERIC(12,2) DEFAULT 0,
  seed_active_users INTEGER DEFAULT 0,

  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enrolled_by UUID NOT NULL REFERENCES profiles(id),
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES profiles(id),
  graduated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(program_id, registration_id)
);

CREATE INDEX idx_sf100_enrollments_program ON sf100_enrollments(program_id);
CREATE INDEX idx_sf100_enrollments_registration ON sf100_enrollments(registration_id);
CREATE INDEX idx_sf100_enrollments_phase ON sf100_enrollments(current_phase);
CREATE INDEX idx_sf100_enrollments_status ON sf100_enrollments(status);
CREATE INDEX idx_sf100_enrollments_stall ON sf100_enrollments(last_check_in_at)
  WHERE status IN ('active', 'warning', 'probation');
```

#### `sf100_phase_history` — Phase Transition Log

```sql
CREATE TABLE sf100_phase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,
  from_phase sf100_phase,
  to_phase sf100_phase NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'system' CHECK (triggered_by IN ('system', 'admin', 'auto_advance')),
  triggered_by_user UUID REFERENCES profiles(id),
  evidence JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_phase_history_enrollment ON sf100_phase_history(enrollment_id);
CREATE INDEX idx_sf100_phase_history_to_phase ON sf100_phase_history(to_phase);
```

#### `sf100_check_ins` — Weekly & Micro Check-ins

```sql
CREATE TYPE sf100_check_in_type AS ENUM ('weekly', 'micro');

CREATE TABLE sf100_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  type sf100_check_in_type NOT NULL DEFAULT 'weekly',

  -- Weekly check-in fields (NULL for micro)
  what_did_you_do TEXT,
  blockers TEXT,
  next_steps TEXT,
  wins TEXT,

  -- Micro check-in field (NULL for weekly)
  micro_update TEXT CHECK (micro_update IS NULL OR length(micro_update) <= 280),

  -- Metric snapshot at time of check-in
  metric_snapshot JSONB DEFAULT '{}',
  -- Expected shape: { cumulative_paid_users, active_paid_users, revenue }

  -- Mentor feedback
  mentor_feedback TEXT,
  mentor_feedback_by UUID REFERENCES profiles(id),
  mentor_feedback_at TIMESTAMPTZ,

  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_check_ins_enrollment ON sf100_check_ins(enrollment_id);
CREATE INDEX idx_sf100_check_ins_type ON sf100_check_ins(type);
CREATE INDEX idx_sf100_check_ins_submitted_at ON sf100_check_ins(submitted_at);
CREATE INDEX idx_sf100_check_ins_submitted_by ON sf100_check_ins(submitted_by);
```

#### `sf100_paid_users` — Individual Paid User Records

```sql
CREATE TYPE sf100_payment_status AS ENUM (
  'pending_verification', 'verified', 'rejected', 'auto_verified', 'refunded'
);

CREATE TABLE sf100_paid_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,

  -- User identification
  user_identifier TEXT NOT NULL,               -- email, phone, or unique ID
  user_name TEXT,
  is_internal BOOLEAN NOT NULL DEFAULT false,  -- true if JKKN learner/staff

  -- Transaction details
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  payment_gateway TEXT,                        -- 'razorpay_jicate', 'razorpay_custom', 'upi', 'stripe', 'cash', 'other'
  transaction_id TEXT,
  transaction_date DATE NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  subscription_id TEXT,                        -- for recurring: links recurring payments

  -- Verification
  status sf100_payment_status NOT NULL DEFAULT 'pending_verification',
  proof_url TEXT,
  proof_description TEXT,
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Churn tracking
  is_active BOOLEAN NOT NULL DEFAULT true,     -- false when refunded or churned
  churned_at TIMESTAMPTZ,
  churn_reason TEXT,
  refund_amount NUMERIC(10,2),
  refund_date DATE,

  reported_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_paid_users_enrollment ON sf100_paid_users(enrollment_id);
CREATE INDEX idx_sf100_paid_users_status ON sf100_paid_users(status);
CREATE INDEX idx_sf100_paid_users_active ON sf100_paid_users(enrollment_id, is_active)
  WHERE status IN ('verified', 'auto_verified');
CREATE INDEX idx_sf100_paid_users_verification_queue ON sf100_paid_users(created_at)
  WHERE status = 'pending_verification';
```

#### `sf100_customer_interviews` — Customer Discovery Log (P1)

```sql
CREATE TABLE sf100_customer_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,

  customer_name TEXT NOT NULL,
  customer_role TEXT,
  customer_segment TEXT,
  key_quote TEXT,
  pain_level INTEGER CHECK (pain_level BETWEEN 1 AND 10),
  willingness_to_pay BOOLEAN,
  follow_up_needed BOOLEAN DEFAULT false,
  follow_up_notes TEXT,
  interview_date DATE NOT NULL DEFAULT CURRENT_DATE,

  conducted_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_customer_interviews_enrollment ON sf100_customer_interviews(enrollment_id);
```

#### `sf100_pivots` — Pivot Tracker (P1)

```sql
CREATE TABLE sf100_pivots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,

  pivot_type TEXT NOT NULL CHECK (pivot_type IN (
    'customer_segment', 'pricing', 'solution', 'channel', 'problem', 'full'
  )),
  before_description TEXT NOT NULL,
  after_description TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  evidence TEXT,
  pivot_date DATE NOT NULL DEFAULT CURRENT_DATE,

  logged_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_pivots_enrollment ON sf100_pivots(enrollment_id);
```

#### `sf100_notifications` — Notification Log

```sql
CREATE TYPE sf100_notification_type AS ENUM (
  'weekly_reminder',
  'milestone_first_sale',
  'milestone_10_users',
  'milestone_25_users',
  'milestone_50_users',
  'milestone_100_users',
  'mentor_feedback',
  'stall_warning',
  'stall_probation',
  'stall_removal',
  'deadline_warning',
  'phase_advance',
  'roster_change_approved',
  'roster_change_rejected'
);

CREATE TABLE sf100_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES sf100_enrollments(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id),
  type sf100_notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_notifications_recipient ON sf100_notifications(recipient_id);
CREATE INDEX idx_sf100_notifications_enrollment ON sf100_notifications(enrollment_id);
CREATE INDEX idx_sf100_notifications_unread ON sf100_notifications(recipient_id, read_at)
  WHERE read_at IS NULL;
```

#### `sf100_roster_changes` — Team Roster Change Requests (P1)

```sql
CREATE TYPE sf100_roster_action AS ENUM ('add', 'remove');
CREATE TYPE sf100_roster_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE sf100_roster_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES sf100_enrollments(id) ON DELETE CASCADE,
  action sf100_roster_action NOT NULL,

  -- The member being added or removed
  profile_id UUID REFERENCES profiles(id),
  learner_id UUID REFERENCES learners_profiles(id),
  email TEXT NOT NULL,
  full_name TEXT,
  is_original_member BOOLEAN DEFAULT false,    -- Was on the Appathon team

  -- Approval
  status sf100_roster_status NOT NULL DEFAULT 'pending',
  reason TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  requested_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sf100_roster_changes_enrollment ON sf100_roster_changes(enrollment_id);
CREATE INDEX idx_sf100_roster_changes_pending ON sf100_roster_changes(status)
  WHERE status = 'pending';
```

### 5B. Tables to Reuse (NOT Duplicate)

| Table | What It Provides | How Solve for 100 Uses It |
|---|---|---|
| `event_registrations` | Team identity (team_name, team_code, institution_id, owner_id) | FK from `sf100_enrollments.registration_id`. All team identity comes from here. |
| `event_team_members` | Current team roster (profile_id, learner_id, is_leader, status) | Read members for display. Roster changes create `sf100_roster_changes`, then admin updates `event_team_members`. |
| `event_submissions` | Appathon metrics (paying_users_count, mrr_amount, active_users_count, live_app_url) | Seed data for auto-advance on enrollment. Read-only. |
| `startup_events` | Source event for the program | FK from `sf100_programs.source_event_id`. |
| `track_declarations` | Track choice (`solve_for_100`) | Pre-condition for enrollment. Teams must have `track = 'solve_for_100'` to enroll. |
| `ss_mentors` | Mentor profiles | Display mentor info on team dashboard and mentor view. |
| `ss_mentor_matches` | Mentor-team pairing | Link mentors to teams. Reuse `candidate_id` by linking NIF candidate (created on enrollment). |
| `ss_mentor_sessions` | Session logs | Mentors log sessions against matched teams. Reuse as-is. |
| `ss_nif_candidates` | NIF pipeline entry | Graduation destination. Insert when team reaches 100 users. |
| `privilege_members` | Institutional support status | Read-only display on team dashboard showing active privileges. |
| `profiles` | User identity | FK for all user references. |
| `institutions` | College identity | FK for institution-level grouping and filtering. |
| `progression_levels` | Individual learner badges | Continue to award progression levels alongside phase advances. |

### 5C. Entity Relationship Summary

```
sf100_programs
  ├── 1:N → sf100_enrollments
  │         ├── 1:N → sf100_phase_history
  │         ├── 1:N → sf100_check_ins
  │         ├── 1:N → sf100_paid_users
  │         ├── 1:N → sf100_customer_interviews
  │         ├── 1:N → sf100_pivots
  │         ├── 1:N → sf100_notifications
  │         ├── 1:N → sf100_roster_changes
  │         └── N:1 → event_registrations
  │                    ├── 1:N → event_team_members
  │                    └── 1:1 → event_submissions
  └── N:1 → startup_events
```

---

## 6. API Endpoints

All endpoints are prefixed with `/api/startup-studio/solve-for-100`.
Authentication via `withAuth` middleware. All return JSON.

### 6A. Programs (Admin Only)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/programs` | admin | List all programs. Query: `?status=active&institution_id=X` |
| `POST` | `/programs` | admin | Create new program |
| `GET` | `/programs/[programId]` | admin | Get program details with aggregate stats |
| `PATCH` | `/programs/[programId]` | admin | Update program (status, dates, config) |

**POST /programs — Request Body:**
```json
{
  "name": "Solve for 100 — Batch 1",
  "description": "First cohort from Appathon 2026",
  "source_event_id": "uuid",
  "institution_id": "uuid",
  "enrollment_start": "2026-04-01",
  "enrollment_deadline": "2026-04-15",
  "hard_deadline": "2026-10-30"
}
```

### 6B. Enrollments

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/programs/[programId]/enrollments` | admin, team_leader | Enroll a team. Auto-advances phase based on Appathon data. |
| `GET` | `/programs/[programId]/enrollments` | admin, mentor | List all enrollments. Query: `?phase=X&status=X&institution_id=X&search=X&page=1&limit=20` |
| `GET` | `/enrollments/[enrollmentId]` | authenticated | Get enrollment detail (team dashboard data). Includes latest check-in, paid user count, phase, privilege status. |
| `PATCH` | `/enrollments/[enrollmentId]` | admin | Update enrollment (status, phase override, value declaration) |
| `GET` | `/enrollments/my` | authenticated | Get the current user's enrollment (finds via profile_id → event_team_members → registration_id → sf100_enrollments) |
| `POST` | `/enrollments/[enrollmentId]/withdraw` | team_leader | Voluntarily withdraw from program |

**POST Enrollment — Request Body:**
```json
{
  "registration_id": "uuid"
}
```

**POST Enrollment — Response (auto-advance example):**
```json
{
  "enrollment": { "id": "uuid", "current_phase": "first_users", "cumulative_paid_users": 8, "..." : "..." },
  "auto_advanced": true,
  "seed_data": { "paying_users_count": 8, "mrr_amount": 1200, "active_users_count": 5 },
  "message": "Team auto-advanced to 'First Users' phase based on 8 verified paying users from Appathon."
}
```

### 6C. Check-ins

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/enrollments/[enrollmentId]/check-ins` | team_member | Submit a check-in (weekly or micro) |
| `GET` | `/enrollments/[enrollmentId]/check-ins` | authenticated | List check-ins. Query: `?type=weekly&page=1&limit=20` |
| `PATCH` | `/check-ins/[checkInId]/feedback` | mentor | Add mentor feedback to a check-in |

**POST Check-in — Request Body (weekly):**
```json
{
  "type": "weekly",
  "what_did_you_do": "Released v2.1, onboarded 3 new clinics...",
  "blockers": "Payment gateway integration delayed by 2 days",
  "next_steps": "Complete Razorpay integration, run 5 customer interviews",
  "wins": "First clinic paid for 3-month subscription!",
  "metric_snapshot": {
    "cumulative_paid_users": 12,
    "active_paid_users": 10,
    "revenue": 3600
  }
}
```

**POST Check-in — Request Body (micro):**
```json
{
  "type": "micro",
  "micro_update": "Shipped dark mode. 2 new signups today."
}
```

### 6D. Paid Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/enrollments/[enrollmentId]/paid-users` | team_leader | Log a new paid user |
| `GET` | `/enrollments/[enrollmentId]/paid-users` | authenticated | List paid users. Query: `?status=verified&is_active=true&page=1&limit=50` |
| `PATCH` | `/paid-users/[paidUserId]/verify` | admin | Verify or reject a paid user claim |
| `PATCH` | `/paid-users/[paidUserId]/churn` | team_leader | Mark a paid user as churned/refunded |
| `GET` | `/verification-queue` | admin | List all pending verifications across all teams. Query: `?program_id=X&page=1&limit=20` |

**POST Paid User — Request Body:**
```json
{
  "user_identifier": "clinic@hospital.com",
  "user_name": "Dr. Ramesh — City Hospital",
  "is_internal": false,
  "amount": 299,
  "payment_gateway": "razorpay_custom",
  "transaction_id": "pay_ABC123",
  "transaction_date": "2026-05-15",
  "is_recurring": true,
  "proof_url": "https://drive.google.com/...",
  "proof_description": "Razorpay dashboard screenshot showing payment"
}
```

**PATCH Verify — Request Body:**
```json
{
  "status": "verified",
  "rejection_reason": null
}
```

### 6E. Customer Interviews (P1)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/enrollments/[enrollmentId]/interviews` | team_member | Log a customer interview |
| `GET` | `/enrollments/[enrollmentId]/interviews` | authenticated | List interviews |

### 6F. Pivots (P1)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/enrollments/[enrollmentId]/pivots` | team_leader | Log a pivot |
| `GET` | `/enrollments/[enrollmentId]/pivots` | authenticated | List pivots |

### 6G. Roster Changes (P1)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/enrollments/[enrollmentId]/roster-changes` | team_leader | Request to add or remove a member |
| `GET` | `/roster-changes/pending` | admin | List pending roster change requests |
| `PATCH` | `/roster-changes/[changeId]` | admin | Approve or reject. On approve, update `event_team_members`. |

### 6H. Notifications

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/notifications` | authenticated | Get my unread notifications. Query: `?unread_only=true&page=1&limit=20` |
| `PATCH` | `/notifications/[notificationId]/read` | authenticated | Mark notification as read |
| `POST` | `/notifications/mark-all-read` | authenticated | Mark all notifications as read |

### 6I. Leaderboard (Public)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/leaderboard` | none | Public leaderboard. Query: `?program_id=X` |
| `GET` | `/leaderboard/stats` | none | Aggregate stats for public page |

### 6J. Admin Actions

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/programs/[programId]/auto-advance` | admin | Run auto-advance check for all enrolled teams. Returns preview, then apply. |
| `POST` | `/programs/[programId]/stall-check` | admin | Run stall detection. Returns teams that need escalation. |
| `GET` | `/programs/[programId]/export` | admin | CSV export of all teams with metrics |
| `GET` | `/programs/[programId]/funnel` | admin | Phase funnel data: `{ phase: string, count: number }[]` |

---

## 7. UI Pages & Components

### 7A. Route Structure

All routes under `/startup-studio/solve-for-100/`.

```
app/(routes)/startup-studio/solve-for-100/
├── page.tsx                                   # Landing/redirect: if enrolled → dashboard, if admin → admin view
├── programs/
│   ├── page.tsx                               # Admin: Program list
│   └── [programId]/
│       ├── page.tsx                           # Admin: Program overview (funnel, teams, stalled)
│       ├── enrollments/
│       │   └── page.tsx                       # Admin: All enrollments table
│       ├── verification-queue/
│       │   └── page.tsx                       # Admin: Payment verification queue
│       └── settings/
│           └── page.tsx                       # Admin: Program config (deadlines, thresholds)
├── dashboard/
│   └── page.tsx                               # Team dashboard (auto-resolves current user's enrollment)
├── team/
│   └── [enrollmentId]/
│       ├── page.tsx                           # Team detail (viewable by any enrolled learner)
│       ├── check-ins/
│       │   └── page.tsx                       # Full check-in history
│       ├── paid-users/
│       │   └── page.tsx                       # Paid user list with status
│       ├── interviews/
│       │   └── page.tsx                       # Customer interview log
│       └── pivots/
│           └── page.tsx                       # Pivot history
├── mentor/
│   └── page.tsx                               # Mentor: Assigned teams dashboard
└── leaderboard/
    └── page.tsx                               # Public: No-auth leaderboard
```

### 7B. Page Descriptions

#### Team Dashboard (`/dashboard`)

The primary view for enrolled learners. Layout:

```
┌─────────────────────────────────────────────────────────────┐
│  SOLVE FOR 100                                    ⏱ Day 47  │
│  Team: HealthSync  |  Phase: First Users          of 210    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    ┌─────────────────┐  ┌─────────────────────────────┐    │
│    │      12/100      │  │  Phase Progress              │    │
│    │   Paid Users     │  │  ○ Setup                     │    │
│    │   (10 active)    │  │  ○ Problem-Solution Fit      │    │
│    │                  │  │  ● First Users (5)  ← YOU    │    │
│    │  [+Log User]     │  │  ○ Growth (25)               │    │
│    └─────────────────┘  │  ○ 100 Users                  │    │
│                          │  ○ Graduated → NIF            │    │
│                          └─────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Weekly Check-in Due                              [Submit]  │
├─────────────────────────────────────────────────────────────┤
│  Recent Activity                                            │
│  • Mar 28: Weekly check-in submitted (Mentor: "Great...")   │
│  • Mar 25: Paid user verified: Dr. Ramesh (₹299)            │
│  • Mar 22: Weekly check-in submitted                        │
│  • Mar 20: Customer interview: Nurse Priya (pain: 8/10)     │
├─────────────────────────────────────────────────────────────┤
│  Institutional Support                                      │
│  ✅ On-duty status active  |  ✅ Lab access (M-F 6-9 PM)    │
│  ⏳ Scholarship: under review  |  ❌ NIF funding: not yet   │
├─────────────────────────────────────────────────────────────┤
│  Leaderboard Position: #4 in First Users phase              │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `SF100PaidUserCounter` — Large 0/100 circle with cumulative and active counts
- `SF100PhaseIndicator` — Vertical stepper with 6 phases, current highlighted
- `SF100CheckInPrompt` — Banner prompting weekly check-in if none this week
- `SF100ActivityTimeline` — Chronological feed of all team events
- `SF100PrivilegeStatus` — Reads from `privilege_members` and displays status cards
- `SF100DeadlineCountdown` — Days remaining until hard deadline

#### Admin Program Overview (`/programs/[programId]`)

```
┌─────────────────────────────────────────────────────────────┐
│  SOLVE FOR 100: Batch 1  |  Status: Active                 │
│  Deadline: Oct 30, 2026  |  42 teams enrolled               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Phase Funnel                                               │
│  ┌──────────────────────────────────────────┐               │
│  │ Setup              ████████████ 12       │               │
│  │ Problem-Sol Fit    ██████████  10        │               │
│  │ First Users (5+)   ████████    8         │               │
│  │ Growth (25+)       ████        4         │               │
│  │ 100 Users          ██          2         │               │
│  │ Graduated          ██████      6         │               │
│  └──────────────────────────────────────────┘               │
│                                                             │
│  ⚠ Stalled Teams: 5 warning, 2 probation                   │
│  📋 Verification Queue: 8 pending                           │
├─────────────────────────────────────────────────────────────┤
│  All Teams                          [Filter] [Export CSV]   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Team      │ College │ Phase     │ Users │ Last CI │ ⚠ │  │
│  │ HealthSync│ Engg    │ First(5+) │ 12    │ 2d ago  │   │  │
│  │ AgriBot   │ Pharm   │ Setup     │ 0     │ 16d ago │ ⚠ │  │
│  │ ...       │ ...     │ ...       │ ...   │ ...     │   │  │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `SF100PhaseFunnel` — Horizontal bar chart showing team count per phase
- `SF100TeamsTable` — Sortable, filterable DataTable with all enrollments
- `SF100StallAlerts` — Summary cards for warning/probation/removal counts
- `SF100VerificationBadge` — Count of pending verifications with link to queue
- `SF100ProgramStats` — Aggregate metrics cards (total teams, total users, graduation rate)

#### Mentor Dashboard (`/mentor`)

```
┌─────────────────────────────────────────────────────────────┐
│  MY TEAMS (Solve for 100)                    4 teams        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ 🟢 HealthSync     │  │ 🟡 AgriBot        │               │
│  │ Phase: First(5+) │  │ Phase: Setup      │               │
│  │ Users: 12/100    │  │ Users: 0/100      │               │
│  │ Last CI: 2d ago  │  │ Last CI: 16d ago  │               │
│  │ [Review CI]      │  │ ⚠ STALLING       │               │
│  └──────────────────┘  └──────────────────┘                │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ 🟢 QuickBill      │  │ 🔴 EcoTrack       │               │
│  │ Phase: Growth(25)│  │ Phase: PSF        │               │
│  │ Users: 31/100    │  │ Users: 0/100      │               │
│  │ Last CI: 1d ago  │  │ Last CI: 30d ago  │               │
│  │ [Review CI]      │  │ 🔴 PROBATION      │               │
│  └──────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `SF100MentorTeamCard` — Card per team showing phase, users, stall status, last check-in
- `SF100CheckInReview` — Modal/drawer to read check-in and add mentor feedback
- `SF100SessionLogger` — Form to log mentor session (reuses `ss_mentor_sessions`)

#### Public Leaderboard (`/leaderboard`)

```
┌─────────────────────────────────────────────────────────────┐
│  JKKN SOLVE FOR 100 LEADERBOARD                            │
│  42 teams  |  387 total paid users  |  6 graduated          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🏆 GRADUATED                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. QuickBill    │ Engineering │ 142 paid users       │   │
│  │ 2. ClinicPro    │ Pharmacy    │ 118 paid users       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  🔥 100 USERS PHASE                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 3. EduAssist    │ Education   │ 89 paid users        │   │
│  │ 4. FarmTrack    │ Agriculture │ 76 paid users        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  📈 GROWTH PHASE (25+)                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 5. HealthSync   │ Engineering │ 31 paid users        │   │
│  │ ...             │ ...         │ ...                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  🌱 FIRST USERS (5+)  |  🔍 PROBLEM-SOLUTION FIT  |  🔧 SETUP│
│  (collapsed sections, expandable)                           │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- `SF100PublicLeaderboard` — Phase-grouped list, no login required
- `SF100PublicStats` — Aggregate stats banner at top

---

## 8. Phase Logic

### 8A. Phase Definitions

| # | Phase | Entry Criteria | Exit Criteria | Typical Duration |
|---|---|---|---|---|
| 1 | **Setup** | Team enrolled in program | Team completes: problem_domain, target_segment, pricing_model fields + at least 1 customer interview logged | Week 1-2 |
| 2 | **Problem-Solution Fit** | Exited Setup | 5 cumulative verified paid users (external) | Week 2-6 |
| 3 | **First Users** | 5+ cumulative verified paid external users | 25 cumulative verified paid users (max 20% internal) | Week 4-10 |
| 4 | **Growth** | 25+ cumulative verified paid users | 100 cumulative verified paid users | Week 8-20 |
| 5 | **100 Users** | 100+ cumulative verified paid users | Admin triggers graduation review | Week 16-30 |
| 6 | **Graduated** | Admin approves graduation. NIF equity terms accepted by team leader. | Terminal state. Team moves to NIF pipeline. | — |

### 8B. Auto-Advance Rules

Auto-advance runs in two contexts:
1. **On enrollment** — seed data from `event_submissions` determines starting phase.
2. **On paid user verification** — after any user is verified, check if phase threshold crossed.
3. **On admin trigger** — bulk auto-advance across all enrollments in a program.

**Auto-Advance Logic (pseudocode):**

```
function checkAutoAdvance(enrollment):
  verified_external = count sf100_paid_users
    WHERE enrollment_id = enrollment.id
    AND status IN ('verified', 'auto_verified')
    AND is_internal = false

  verified_total = count sf100_paid_users
    WHERE enrollment_id = enrollment.id
    AND status IN ('verified', 'auto_verified')

  internal_pct = internal_count / verified_total * 100

  if internal_pct > program.max_internal_user_pct:
    // Don't advance — too many internal users
    return

  switch enrollment.current_phase:
    case 'setup':
      if has_value_declaration AND has_customer_interview:
        advance_to('problem_solution_fit')
    case 'problem_solution_fit':
      if verified_total >= 5:
        advance_to('first_users')
    case 'first_users':
      if verified_total >= 25:
        advance_to('growth')
    case 'growth':
      if verified_total >= 100:
        advance_to('hundred_users')
    case 'hundred_users':
      // Graduation is manual (admin-triggered)
    case 'graduated':
      // Terminal
```

### 8C. Auto-Advance on Enrollment (Seed Data)

When a team enrolls, read their `event_submissions` record:

```
seed_users = event_submissions.paying_users_count
seed_mrr = event_submissions.mrr_amount

if seed_users >= 100:
  start_at = 'hundred_users'
elif seed_users >= 25:
  start_at = 'growth'
elif seed_users >= 5:
  start_at = 'first_users'
elif seed_users > 0:
  start_at = 'problem_solution_fit'
else:
  start_at = 'setup'
```

Seed users are stored on the enrollment as `seed_paying_users` and `seed_mrr` for audit trail. They are NOT auto-inserted into `sf100_paid_users` — they represent Appathon-verified metrics that give the team a head start. New paid users must be logged individually going forward.

**Important:** Seed data gives the team their starting phase, but the `cumulative_paid_users` counter starts at 0. The counter only reflects users logged within the Solve for 100 program. Phase thresholds for advancement after enrollment are checked against `sf100_paid_users` only. This prevents double-counting.

**Exception:** Admin can override by manually setting `cumulative_paid_users` to seed value if they determine the Appathon users should carry over. This is a deliberate admin action, not automatic.

---

## 9. Leaderboard Algorithm

### 9A. Grouping

Teams are grouped by **phase**, not ranked globally. Within each phase group, teams are ranked by `cumulative_paid_users` descending.

### 9B. Phase Group Order (Top to Bottom)

1. Graduated
2. 100 Users
3. Growth (25+)
4. First Users (5+)
5. Problem-Solution Fit
6. Setup

### 9C. Within-Phase Ranking

```sql
SELECT
  e.id,
  r.team_name,
  i.name AS institution_name,
  e.current_phase,
  e.cumulative_paid_users,
  e.active_paid_users,
  ROW_NUMBER() OVER (
    PARTITION BY e.current_phase
    ORDER BY e.cumulative_paid_users DESC, e.enrolled_at ASC
  ) AS phase_rank
FROM sf100_enrollments e
JOIN event_registrations r ON r.id = e.registration_id
JOIN institutions i ON i.id = r.institution_id
WHERE e.program_id = $1
  AND e.status NOT IN ('removed', 'withdrawn')
ORDER BY
  CASE e.current_phase
    WHEN 'graduated' THEN 1
    WHEN 'hundred_users' THEN 2
    WHEN 'growth' THEN 3
    WHEN 'first_users' THEN 4
    WHEN 'problem_solution_fit' THEN 5
    WHEN 'setup' THEN 6
  END,
  e.cumulative_paid_users DESC,
  e.enrolled_at ASC;
```

### 9D. Public vs Private

| Field | Public Leaderboard | Private (Enrolled Team View) |
|---|---|---|
| Team name | Yes | Yes |
| College | Yes | Yes |
| Paid users (cumulative) | Yes | Yes |
| Active paid users | No | Yes |
| Phase | Yes | Yes |
| Revenue | No | Yes (own team only) |
| Check-in details | No | Yes (all teams — transparency) |
| Mentor info | No | Yes |
| Last check-in date | No | Yes |
| Stall status | No | Yes (admin/mentor only) |

### 9E. Tiebreaker

When teams have equal `cumulative_paid_users`, the team that enrolled earlier (`enrolled_at ASC`) ranks higher.

---

## 10. Notification Triggers

| Trigger Event | Notification Type | Recipients | Channel |
|---|---|---|---|
| No weekly check-in by Sunday 11:59 PM | `weekly_reminder` | All team members | In-app + push |
| First paid user verified | `milestone_first_sale` | All team members + mentor | In-app + push |
| 10th paid user verified | `milestone_10_users` | All team members + mentor | In-app + push |
| 25th paid user verified | `milestone_25_users` | All team members + mentor | In-app + push |
| 50th paid user verified | `milestone_50_users` | All team members + mentor | In-app + push |
| 100th paid user verified | `milestone_100_users` | All team members + mentor + admin | In-app + push |
| Mentor adds feedback to a check-in | `mentor_feedback` | All team members | In-app + push |
| 14 days since last check-in | `stall_warning` | Team leader + mentor | In-app + push |
| 28 days since last check-in | `stall_probation` | All team members + mentor + admin | In-app + push |
| 56 days since last check-in (removal) | `stall_removal` | All team members + mentor + admin | In-app + push |
| 30 days before hard deadline | `deadline_warning` | All enrolled team members | In-app |
| 7 days before hard deadline | `deadline_warning` | All enrolled team members | In-app + push |
| Phase auto-advance | `phase_advance` | All team members + mentor | In-app + push |
| Roster change approved/rejected | `roster_change_approved` / `roster_change_rejected` | Requester + affected member | In-app |

### Implementation Notes

- Notifications are created by inserting into `sf100_notifications`.
- Push notifications use MyJKKN's existing push infrastructure (not specified here — integration point).
- Weekly reminder runs as a scheduled job (Supabase pg_cron or Vercel cron).
- Stall detection runs daily as a scheduled job.
- Milestone detection runs inline after paid user verification (synchronous check after INSERT/UPDATE on `sf100_paid_users`).

---

## 11. Stall Escalation Policy

### 11A. Timeline

| Days Since Last Check-in | Status | Action |
|---|---|---|
| 0-13 | `active` | Normal. No action. |
| 14 | `warning` | System sends `stall_warning` notification. Sets `warning_sent_at`. Yellow indicator on dashboards. |
| 28 | `probation` | System sends `stall_probation` notification. Sets `probation_sent_at`. Red indicator. Mentor alerted. Admin alerted. |
| 56 | `removed` | System sends `stall_removal` notification. Sets `status = 'removed'`, `removed_at = NOW()`, `removed_by = 'system'`. Privileges revoked. |

### 11B. Reset Rules

- Submitting a check-in (weekly or micro) resets the stall timer.
- `last_check_in_at` is updated on `sf100_enrollments` whenever a check-in is submitted.
- If a team is in `warning` status and submits a check-in, status returns to `active`.
- If a team is in `probation` status and submits a check-in, status returns to `warning` for 7 days, then `active` if another check-in follows.
- `removed` is permanent unless admin manually reinstates.

### 11C. Admin Override

- Admin can manually set any team to any status.
- Admin can extend deadlines for individual teams (e.g., medical leave, exam period).
- Extension is logged in `sf100_phase_history` with `triggered_by = 'admin'` and notes.

### 11D. Consequences of Removal

- Team status set to `removed`.
- Team hidden from public leaderboard.
- Privileges revoked (set `privilege_members.status = 'revoked'` for relevant records).
- Team can no longer submit check-ins or log paid users.
- Historical data is preserved (not deleted) for audit.

### 11E. Stall Detection Query (Daily Cron)

```sql
-- Find teams that need escalation
SELECT
  e.id AS enrollment_id,
  e.status,
  e.last_check_in_at,
  EXTRACT(DAY FROM NOW() - COALESCE(e.last_check_in_at, e.enrolled_at)) AS days_since_checkin,
  p.stall_warning_days,
  p.stall_probation_days,
  p.stall_removal_days
FROM sf100_enrollments e
JOIN sf100_programs p ON p.id = e.program_id
WHERE e.status IN ('active', 'warning', 'probation')
  AND p.status = 'active'
  AND EXTRACT(DAY FROM NOW() - COALESCE(e.last_check_in_at, e.enrolled_at))
      >= p.stall_warning_days;
```

---

## 12. Integration Points

### 12A. Privileges Module

**Direction:** Solve for 100 reads from Privileges. Does NOT write.

- On the team dashboard, display active privileges from `privilege_members` WHERE `learner_id` matches any team member's `profile_id` AND `status = 'active'`.
- Join through `privilege_group_types` → `privilege_types` to get privilege names and categories.
- Display as status cards: "On-duty: Active", "Lab Access: Active", "Scholarship: Under Review", etc.
- Solve for 100 does NOT manage privilege approval. That workflow lives in the Privileges module.

**On removal from Solve for 100:** Admin manually revokes relevant privileges via the Privileges module. The system sends an alert but does not auto-revoke (prevents accidental cascading revocations).

### 12B. NIF Pipeline

**Direction:** Solve for 100 writes to NIF on graduation.

When a team graduates (100 users + admin approval):

1. Create `ss_nif_candidates` record:
   - `problem_id`: Link from the team's original `event_submissions.problem_statement` → `ss_problem_bank` (if exists)
   - `stage`: `'identified'`
   - `startup_name`: team_name
   - `startup_status`: `'launched'`
   - `startup_website`: from `event_submissions.live_app_url`
   - `team_members`: JSONB array of current team members
   - `revenue_generated`: from `sf100_enrollments.total_revenue`
2. Create `ss_nif_stage_history` record documenting the graduation.
3. Link `ss_mentor_matches` to the NIF candidate (if mentor was assigned).

### 12C. Mentor Ecosystem

**Direction:** Bidirectional read/write to existing tables.

- `ss_mentors` — Read mentor profiles for display.
- `ss_mentor_matches` — Admins create matches between mentors and enrolled teams. The FK currently references `ss_nif_candidates`, so either:
  - **Option A (recommended):** Create a NIF candidate record on enrollment (not just graduation) so mentor matching works.
  - **Option B:** Add a nullable `enrollment_id` FK to `ss_mentor_matches` for Solve for 100 teams that aren't yet NIF candidates.

  **Decision:** Use **Option A**. On enrollment, create a minimal `ss_nif_candidates` record with `stage = 'identified'`. This gives the team an NIF candidate ID that mentor matching can reference. On graduation, the record is updated (not re-created).

- `ss_mentor_sessions` — Mentors log sessions against the NIF candidate ID.

### 12D. Progression Levels

**Direction:** Solve for 100 writes to `progression_levels`.

Phase advances trigger progression level awards:

| Phase Reached | Progression Level | Level Name |
|---|---|---|
| First Users (5+) | 2 | Traction Builder |
| Growth (25+) | 3 | Solution Architect |
| Graduated (100+) | 4 | AI Orchestrator |

Level 1 (App Builder) is awarded during Demo Day (already handled by `ProgressionService.autoAssignLevel1ForEvent`).
Level 5 (AI Principal) is manually awarded during NIF incubation.

### 12E. MyJKKN Notifications

The `sf100_notifications` table stores notification records. Delivery to push/in-app channels uses MyJKKN's existing notification infrastructure. The integration point is:

- **In-app:** Direct DB read from `sf100_notifications` in the notification bell component.
- **Push:** Insert into MyJKKN's push queue (if exists) or trigger via a database trigger / edge function.

---

## 13. Data Migration

### 13A. Existing Data to Seed

When creating the first Solve for 100 program:

1. **Identify eligible teams:** All teams with `track_declarations.track = 'solve_for_100'` for the source event.
2. **Create enrollments:** For each eligible team, create `sf100_enrollments` with:
   - `registration_id` from `track_declarations.team_id`
   - Seed data from `event_submissions` (paying_users_count, mrr_amount, active_users_count)
   - Auto-advance to correct phase based on seed data
3. **Create NIF candidates:** For each enrolled team, create minimal `ss_nif_candidates` record.
4. **Link existing mentors:** If teams already have mentor assignments, link them.

### 13B. Migration Script Pseudocode

```sql
-- Step 1: Create program
INSERT INTO sf100_programs (name, source_event_id, institution_id, hard_deadline, status, created_by)
VALUES ('Solve for 100 — Batch 1', :event_id, :institution_id, '2026-10-30', 'active', :admin_id)
RETURNING id AS program_id;

-- Step 2: Enroll all teams with solve_for_100 track
INSERT INTO sf100_enrollments (program_id, registration_id, enrolled_by, seed_paying_users, seed_mrr, seed_active_users)
SELECT
  :program_id,
  td.team_id,
  :admin_id,
  COALESCE(es.paying_users_count, 0),
  COALESCE(es.mrr_amount, 0),
  COALESCE(es.active_users_count, 0)
FROM track_declarations td
LEFT JOIN event_submissions es ON es.registration_id = td.team_id AND es.event_id = td.event_id
WHERE td.track = 'solve_for_100'
  AND td.event_id = :event_id;

-- Step 3: Auto-advance (run in application code, not SQL, due to phase logic complexity)
```

### 13C. No Destructive Changes

- No existing tables are modified or dropped.
- All new tables use the `sf100_` prefix.
- `event_registrations`, `event_team_members`, `event_submissions`, `track_declarations`, and `progression_levels` remain unchanged.

---

## 14. Edge Cases

### 14A. Paid User Edge Cases

| Scenario | Handling |
|---|---|
| Same user pays twice (one-time payments) | Each transaction is a separate `sf100_paid_users` row. Same `user_identifier` can appear multiple times. Cumulative count increments for each verified transaction. |
| Subscription user — counts as 1 or per-month? | Counts as 1 cumulative paid user, regardless of how many months they pay. `is_recurring = true`, track via `subscription_id`. |
| Refund issued | Mark `is_active = false`, set `refund_amount` and `refund_date`. `active_paid_users` decreases. `cumulative_paid_users` stays. |
| User pays < Rs.50 | Rejected at API validation. `amount >= program.min_transaction_amount` enforced. |
| >20% internal users | Warning shown on dashboard. Phase advance blocked until ratio corrected. Admin can override. |
| Team claims 50 users in one batch upload | Each must be logged individually with proof. No bulk upload in V1. |
| JICATE Razorpay transaction | `payment_gateway = 'razorpay_jicate'` triggers `status = 'auto_verified'` on insert. No manual verification needed. |
| Payment proof is suspicious | Admin rejects with reason. Team can re-submit with better proof. `cumulative_paid_users` does not increase until verified. |

### 14B. Team Edge Cases

| Scenario | Handling |
|---|---|
| Team leader leaves | Remaining members can request a new leader via roster change. Admin approves. If no members remain, team is `withdrawn`. |
| All members leave | Team status set to `withdrawn`. Hidden from leaderboard. Data preserved. |
| Team wants to merge with another team | Not supported in V1. Admin can manually create a new enrollment and transfer metrics. |
| Team from one college, members from different colleges | `institution_id` comes from `event_registrations.institution_id` (the registering college). Individual members can be from any college. |
| Team declared `solve_for_100` but never enrolls | They remain in `track_declarations` but are not in `sf100_enrollments`. No impact on the module. |
| Team enrolls twice (different programs/cohorts) | Allowed. UNIQUE constraint is `(program_id, registration_id)`. Same team can be in multiple cohorts. |

### 14C. Phase Edge Cases

| Scenario | Handling |
|---|---|
| Team is auto-advanced but hasn't completed Setup requirements | Auto-advance from seed data overrides Setup requirements. The assumption is that Appathon-verified data proves they've done the work. |
| Team regresses (users refund, drops below phase threshold) | Phases never decrease. A team in "Growth" with 20 active users (was 26) stays in Growth. Active count is for health tracking, not phase gating. |
| Admin manually sets phase backward | Allowed but logged. Use case: team was incorrectly advanced. |
| Hard deadline passes, team has 80 users | Program status moves to `completed`. Team remains at their current phase. Admin decides next steps (extension, graduation exception, removal). |

### 14D. Stall Edge Cases

| Scenario | Handling |
|---|---|
| Team submits micro-update — does it reset stall timer? | Yes. Any check-in (weekly or micro) resets `last_check_in_at`. |
| Team is removed, then admin reinstates | Admin sets `status = 'active'`, clears `removed_at`. Logged in phase history. |
| Team in probation submits check-in, then goes silent again | Status returns to `warning` (not `active`). Must submit 2 consecutive weekly check-ins to return to `active`. |
| Exam period — many teams stall simultaneously | Admin can bulk-pause stall detection for a date range per program (add to `sf100_programs.config` JSONB). |

---

## 15. Out of Scope

| Item | Reason | Future Version |
|---|---|---|
| JICATE Razorpay webhook auto-verification | Requires Razorpay integration. V1 uses admin manual verification for non-JICATE payments. | V2 |
| In-app payment processing | Teams use their own payment gateways. We track, not process. | Never (by design) |
| Automated revenue share / equity calculation | NIF equity terms are surfaced as text, not calculated. | V2 |
| AI-powered stall prediction | V1 uses deterministic time-based rules. | V2 |
| Chat/messaging between team and mentor | Use existing channels (WhatsApp, Google Chat). | V2 |
| Multi-language support | English only in V1. | V2 |
| Mobile app (native) | Responsive web only. | V2 |
| Bulk paid user upload | Each user must be logged individually for verification integrity. | V2 (with CSV template + admin review) |
| Cross-program analytics | V1 focuses on single-program view. | V2 |
| Automated NIF equity term acceptance | V1 surfaces terms as text during graduation. Acceptance is logged as a boolean. | V2 (digital signature) |

---

## 16. Success Metrics

### 16A. 3-Month Success Criteria (Per User Interview)

| Metric | Target | Measurement |
|---|---|---|
| Teams actively checking in weekly | 10+ | COUNT of enrollments with `last_check_in_at >= NOW() - INTERVAL '7 days'` |
| Teams reaching "First Users" phase (5+ paying strangers) | 3+ | COUNT of enrollments with `current_phase IN ('first_users', 'growth', 'hundred_users', 'graduated')` |
| Mentor check-in engagement rate | >50% | COUNT of check-ins with `mentor_feedback IS NOT NULL` / total check-ins |

### 16B. 10-Month Success Criteria

| Metric | Target | Measurement |
|---|---|---|
| Teams graduated (100 users) | 5+ | COUNT of enrollments with `current_phase = 'graduated'` |
| Teams removed for stalling | <30% | COUNT with `status = 'removed'` / total enrolled |
| Average time from enrollment to first sale | <30 days | AVG of `sf100_paid_users.created_at - sf100_enrollments.enrolled_at` for first verified user per team |
| Total paid users across all teams | 500+ | SUM of `cumulative_paid_users` across all enrollments |
| Teams that pivoted at least once | 20%+ | COUNT of enrollments with at least 1 `sf100_pivots` record |

### 16C. Health Dashboard Queries

```sql
-- Weekly active teams
SELECT COUNT(*) FROM sf100_enrollments
WHERE status = 'active'
  AND last_check_in_at >= NOW() - INTERVAL '7 days';

-- Phase funnel
SELECT current_phase, COUNT(*) FROM sf100_enrollments
WHERE status NOT IN ('removed', 'withdrawn')
GROUP BY current_phase;

-- Mentor engagement
SELECT
  COUNT(*) FILTER (WHERE mentor_feedback IS NOT NULL) AS reviewed,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE mentor_feedback IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS pct
FROM sf100_check_ins
WHERE type = 'weekly';

-- Verification queue depth
SELECT COUNT(*) FROM sf100_paid_users
WHERE status = 'pending_verification';
```

---

## 17. Open Questions

| # | Question | Status | Default if Unresolved |
|---|---|---|---|
| Q-01 | Should seed data from Appathon auto-populate `sf100_paid_users` rows, or just set the starting phase? | **Resolved: Just starting phase.** Counter starts at 0. Admin can override. | — |
| Q-02 | What happens when the hard deadline passes? Auto-archive or admin decides? | Unresolved | Admin decides. Program stays `active` until admin changes to `completed`. |
| Q-03 | Can a removed team re-enroll in a future cohort? | Unresolved | Yes, but admin must approve. Historical removal is visible. |
| Q-04 | Exact NIF equity terms to display during graduation? | Unresolved | Placeholder text: "Standard NIF equity terms apply. Contact NIF coordinator for details." |
| Q-05 | Should the weekly reminder notification respect timezone? | Unresolved | All reminders based on IST (India Standard Time). |
| Q-06 | Push notification provider (FCM, OneSignal, etc.)? | Unresolved | In-app notifications only for V1. Push added when MyJKKN push infra is ready. |
| Q-07 | Should micro-updates be visible on the public leaderboard? | Unresolved | No. Public leaderboard shows only team name, college, phase, paid user count. |
| Q-08 | Exam period stall pause — automatic (sync with academic calendar) or manual admin toggle? | Unresolved | Manual admin toggle on program config. |

---

## Appendix A: RLS Policy Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `sf100_programs` | Authenticated (all) | Admin | Admin | Admin |
| `sf100_enrollments` | Authenticated (enrolled teams can see all — transparency) | Admin, team leader (self-enroll if program allows) | Admin (status, phase). System (metrics updates). | None (soft-delete via status) |
| `sf100_phase_history` | Authenticated (enrolled) | System, admin | None (append-only) | None |
| `sf100_check_ins` | Authenticated (enrolled teams — transparency) | Team member (own enrollment) | Mentor (feedback fields only) | None |
| `sf100_paid_users` | Authenticated (own team). Admin (all). | Team leader (own enrollment) | Admin (verification). Team leader (churn). | None |
| `sf100_customer_interviews` | Authenticated (enrolled — transparency) | Team member (own enrollment) | Team member (own records) | None |
| `sf100_pivots` | Authenticated (enrolled — transparency) | Team leader (own enrollment) | None (append-only) | None |
| `sf100_notifications` | Own notifications only | System | Self (mark read) | None |
| `sf100_roster_changes` | Team (own). Admin (all pending). | Team leader (own enrollment) | Admin (approve/reject) | None |

### Leaderboard (Public)

The public leaderboard endpoint (`GET /api/startup-studio/solve-for-100/leaderboard`) uses `service_role` key to bypass RLS and returns only the public-safe fields (team_name, institution_name, current_phase, cumulative_paid_users). No auth required.

---

## Appendix B: Service Class Skeleton

```typescript
// lib/services/startup-studio/sf100-service.ts

import { BaseService } from '@/lib/services/base-service'

export class SF100Service extends BaseService {
  // --- Programs ---
  static async createProgram(data: CreateProgramDto): Promise<SF100Program> { ... }
  static async getProgram(programId: string): Promise<SF100Program> { ... }
  static async listPrograms(filters: ProgramFilters): Promise<BaseListResponse<SF100Program>> { ... }
  static async updateProgram(programId: string, data: UpdateProgramDto): Promise<SF100Program> { ... }

  // --- Enrollments ---
  static async enrollTeam(programId: string, registrationId: string, enrolledBy: string): Promise<SF100Enrollment> { ... }
  static async getEnrollment(enrollmentId: string): Promise<SF100EnrollmentDetail> { ... }
  static async getMyEnrollment(profileId: string, programId: string): Promise<SF100Enrollment | null> { ... }
  static async listEnrollments(programId: string, filters: EnrollmentFilters): Promise<BaseListResponse<SF100Enrollment>> { ... }
  static async updateEnrollmentStatus(enrollmentId: string, status: string, reason?: string): Promise<void> { ... }

  // --- Check-ins ---
  static async submitCheckIn(enrollmentId: string, data: CreateCheckInDto, submittedBy: string): Promise<SF100CheckIn> { ... }
  static async listCheckIns(enrollmentId: string, filters: CheckInFilters): Promise<BaseListResponse<SF100CheckIn>> { ... }
  static async addMentorFeedback(checkInId: string, feedback: string, mentorId: string): Promise<void> { ... }

  // --- Paid Users ---
  static async logPaidUser(enrollmentId: string, data: CreatePaidUserDto, reportedBy: string): Promise<SF100PaidUser> { ... }
  static async verifyPaidUser(paidUserId: string, status: string, verifiedBy: string, reason?: string): Promise<void> { ... }
  static async markChurned(paidUserId: string, data: ChurnDto): Promise<void> { ... }
  static async getVerificationQueue(programId: string, filters: PaginationFilters): Promise<BaseListResponse<SF100PaidUser>> { ... }

  // --- Phase Engine ---
  static async checkAutoAdvance(enrollmentId: string): Promise<PhaseAdvanceResult | null> { ... }
  static async bulkAutoAdvance(programId: string): Promise<BulkAdvanceResult> { ... }
  static async manualPhaseChange(enrollmentId: string, toPhase: string, adminId: string, notes?: string): Promise<void> { ... }

  // --- Stall Detection ---
  static async runStallCheck(programId: string): Promise<StallCheckResult> { ... }

  // --- Leaderboard ---
  static async getPublicLeaderboard(programId: string): Promise<LeaderboardData> { ... }
  static async getPublicStats(programId: string): Promise<PublicStats> { ... }

  // --- Graduation ---
  static async initiateGraduation(enrollmentId: string, adminId: string): Promise<GraduationResult> { ... }

  // --- Notifications ---
  static async getMyNotifications(profileId: string, unreadOnly: boolean): Promise<SF100Notification[]> { ... }
  static async markRead(notificationId: string): Promise<void> { ... }
  static async markAllRead(profileId: string): Promise<void> { ... }

  // --- Customer Interviews (P1) ---
  static async logInterview(enrollmentId: string, data: CreateInterviewDto, conductedBy: string): Promise<SF100Interview> { ... }
  static async listInterviews(enrollmentId: string): Promise<SF100Interview[]> { ... }

  // --- Pivots (P1) ---
  static async logPivot(enrollmentId: string, data: CreatePivotDto, loggedBy: string): Promise<SF100Pivot> { ... }
  static async listPivots(enrollmentId: string): Promise<SF100Pivot[]> { ... }

  // --- Roster Changes (P1) ---
  static async requestRosterChange(enrollmentId: string, data: CreateRosterChangeDto, requestedBy: string): Promise<SF100RosterChange> { ... }
  static async reviewRosterChange(changeId: string, approved: boolean, reviewedBy: string, notes?: string): Promise<void> { ... }

  // --- Export ---
  static async exportProgramCSV(programId: string): Promise<string> { ... }

  // --- Internal helpers ---
  private static async recalculateMetrics(enrollmentId: string): Promise<void> { ... }
  private static async createNotification(params: CreateNotificationParams): Promise<void> { ... }
  private static async checkMilestone(enrollmentId: string, newCount: number): Promise<void> { ... }
}
```

---

## Appendix C: Cron Jobs

| Job | Schedule | Description |
|---|---|---|
| `sf100_weekly_reminder` | Every Sunday at 8:00 PM IST | Send `weekly_reminder` notification to teams that haven't checked in this week |
| `sf100_stall_check` | Daily at 9:00 AM IST | Run stall detection, escalate teams from active → warning → probation → removed |
| `sf100_deadline_warning` | Daily at 9:00 AM IST | Send deadline warning at 30 days and 7 days before `hard_deadline` |
| `sf100_metrics_sync` | Hourly | Recalculate `cumulative_paid_users`, `active_paid_users`, `total_revenue` on all active enrollments (defense against drift) |

---

## Appendix D: TypeScript Types

```typescript
// types/startup-studio/sf100.ts

export type SF100Phase =
  | 'setup'
  | 'problem_solution_fit'
  | 'first_users'
  | 'growth'
  | 'hundred_users'
  | 'graduated'

export type SF100EnrollmentStatus =
  | 'active'
  | 'warning'
  | 'probation'
  | 'removed'
  | 'graduated'
  | 'withdrawn'

export type SF100PaymentStatus =
  | 'pending_verification'
  | 'verified'
  | 'rejected'
  | 'auto_verified'
  | 'refunded'

export type SF100CheckInType = 'weekly' | 'micro'

export type SF100NotificationType =
  | 'weekly_reminder'
  | 'milestone_first_sale'
  | 'milestone_10_users'
  | 'milestone_25_users'
  | 'milestone_50_users'
  | 'milestone_100_users'
  | 'mentor_feedback'
  | 'stall_warning'
  | 'stall_probation'
  | 'stall_removal'
  | 'deadline_warning'
  | 'phase_advance'
  | 'roster_change_approved'
  | 'roster_change_rejected'

export type SF100PricingModel =
  | 'subscription'
  | 'one_time'
  | 'freemium'
  | 'usage_based'
  | 'other'

export type SF100PivotType =
  | 'customer_segment'
  | 'pricing'
  | 'solution'
  | 'channel'
  | 'problem'
  | 'full'

export type SF100RosterAction = 'add' | 'remove'
export type SF100RosterStatus = 'pending' | 'approved' | 'rejected'

export interface SF100Program {
  id: string
  name: string
  description: string | null
  source_event_id: string | null
  institution_id: string
  enrollment_start: string | null
  enrollment_deadline: string | null
  hard_deadline: string
  started_at: string | null
  completed_at: string | null
  status: 'draft' | 'enrollment_open' | 'active' | 'completed' | 'archived'
  paid_user_target: number
  min_transaction_amount: number
  max_internal_user_pct: number
  stall_warning_days: number
  stall_probation_days: number
  stall_removal_days: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface SF100Enrollment {
  id: string
  program_id: string
  registration_id: string
  current_phase: SF100Phase
  phase_entered_at: string
  status: SF100EnrollmentStatus
  status_changed_at: string
  status_reason: string | null
  cumulative_paid_users: number
  active_paid_users: number
  internal_paid_users: number
  total_revenue: number
  problem_domain: string | null
  target_segment: string | null
  pricing_model: SF100PricingModel | null
  last_check_in_at: string | null
  warning_sent_at: string | null
  probation_sent_at: string | null
  seed_paying_users: number
  seed_mrr: number
  seed_active_users: number
  enrolled_at: string
  enrolled_by: string
  removed_at: string | null
  removed_by: string | null
  graduated_at: string | null
  created_at: string
  updated_at: string
  // Joined relations
  registration?: {
    team_name: string
    team_code: string | null
    institution_id: string
    owner_id: string
    institution?: { name: string }
    team_members?: Array<{
      profile_id: string
      full_name: string | null
      email: string
      is_leader: boolean
      status: string
    }>
    submission?: {
      app_name: string | null
      live_app_url: string | null
      paying_users_count: number
      mrr_amount: number
      active_users_count: number
    }
  }
}

export interface SF100CheckIn {
  id: string
  enrollment_id: string
  submitted_by: string
  type: SF100CheckInType
  what_did_you_do: string | null
  blockers: string | null
  next_steps: string | null
  wins: string | null
  micro_update: string | null
  metric_snapshot: Record<string, unknown>
  mentor_feedback: string | null
  mentor_feedback_by: string | null
  mentor_feedback_at: string | null
  submitted_at: string
  created_at: string
  updated_at: string
}

export interface SF100PaidUser {
  id: string
  enrollment_id: string
  user_identifier: string
  user_name: string | null
  is_internal: boolean
  amount: number
  currency: string
  payment_gateway: string | null
  transaction_id: string | null
  transaction_date: string
  is_recurring: boolean
  subscription_id: string | null
  status: SF100PaymentStatus
  proof_url: string | null
  proof_description: string | null
  verified_by: string | null
  verified_at: string | null
  rejection_reason: string | null
  is_active: boolean
  churned_at: string | null
  churn_reason: string | null
  refund_amount: number | null
  refund_date: string | null
  reported_by: string
  created_at: string
  updated_at: string
}

export interface SF100Notification {
  id: string
  enrollment_id: string | null
  recipient_id: string
  type: SF100NotificationType
  title: string
  body: string
  metadata: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface SF100PhaseHistory {
  id: string
  enrollment_id: string
  from_phase: SF100Phase | null
  to_phase: SF100Phase
  triggered_by: 'system' | 'admin' | 'auto_advance'
  triggered_by_user: string | null
  evidence: Record<string, unknown>
  notes: string | null
  created_at: string
}

export interface SF100CustomerInterview {
  id: string
  enrollment_id: string
  customer_name: string
  customer_role: string | null
  customer_segment: string | null
  key_quote: string | null
  pain_level: number | null
  willingness_to_pay: boolean | null
  follow_up_needed: boolean
  follow_up_notes: string | null
  interview_date: string
  conducted_by: string
  created_at: string
}

export interface SF100Pivot {
  id: string
  enrollment_id: string
  pivot_type: SF100PivotType
  before_description: string
  after_description: string
  reasoning: string
  evidence: string | null
  pivot_date: string
  logged_by: string
  created_at: string
}

export interface SF100RosterChange {
  id: string
  enrollment_id: string
  action: SF100RosterAction
  profile_id: string | null
  learner_id: string | null
  email: string
  full_name: string | null
  is_original_member: boolean
  status: SF100RosterStatus
  reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  requested_by: string
  created_at: string
}

// --- DTOs ---

export interface CreateProgramDto {
  name: string
  description?: string
  source_event_id?: string
  institution_id: string
  enrollment_start?: string
  enrollment_deadline?: string
  hard_deadline: string
}

export interface UpdateProgramDto {
  name?: string
  description?: string
  status?: 'draft' | 'enrollment_open' | 'active' | 'completed' | 'archived'
  enrollment_start?: string
  enrollment_deadline?: string
  hard_deadline?: string
  paid_user_target?: number
  min_transaction_amount?: number
  max_internal_user_pct?: number
  stall_warning_days?: number
  stall_probation_days?: number
  stall_removal_days?: number
}

export interface CreateCheckInDto {
  type: SF100CheckInType
  what_did_you_do?: string
  blockers?: string
  next_steps?: string
  wins?: string
  micro_update?: string
  metric_snapshot?: Record<string, unknown>
}

export interface CreatePaidUserDto {
  user_identifier: string
  user_name?: string
  is_internal: boolean
  amount: number
  currency?: string
  payment_gateway?: string
  transaction_id?: string
  transaction_date: string
  is_recurring?: boolean
  subscription_id?: string
  proof_url?: string
  proof_description?: string
}

export interface VerifyPaidUserDto {
  status: 'verified' | 'rejected'
  rejection_reason?: string
}

export interface ChurnDto {
  churn_reason?: string
  refund_amount?: number
  refund_date?: string
}

export interface CreateInterviewDto {
  customer_name: string
  customer_role?: string
  customer_segment?: string
  key_quote?: string
  pain_level?: number
  willingness_to_pay?: boolean
  follow_up_needed?: boolean
  follow_up_notes?: string
  interview_date?: string
}

export interface CreatePivotDto {
  pivot_type: SF100PivotType
  before_description: string
  after_description: string
  reasoning: string
  evidence?: string
  pivot_date?: string
}

export interface CreateRosterChangeDto {
  action: SF100RosterAction
  profile_id?: string
  learner_id?: string
  email: string
  full_name?: string
  reason?: string
}

// --- Response types ---

export interface PhaseAdvanceResult {
  advanced: boolean
  from_phase: SF100Phase | null
  to_phase: SF100Phase
  reason: string
}

export interface BulkAdvanceResult {
  total_checked: number
  advanced: number
  details: Array<{
    enrollment_id: string
    team_name: string
    from_phase: SF100Phase
    to_phase: SF100Phase
  }>
}

export interface StallCheckResult {
  total_checked: number
  newly_warned: number
  newly_on_probation: number
  newly_removed: number
  details: Array<{
    enrollment_id: string
    team_name: string
    previous_status: SF100EnrollmentStatus
    new_status: SF100EnrollmentStatus
    days_since_checkin: number
  }>
}

export interface LeaderboardEntry {
  enrollment_id: string
  team_name: string
  institution_name: string
  current_phase: SF100Phase
  cumulative_paid_users: number
  phase_rank: number
}

export interface LeaderboardData {
  phases: Array<{
    phase: SF100Phase
    phase_label: string
    teams: LeaderboardEntry[]
  }>
  total_teams: number
  total_paid_users: number
  total_graduated: number
}

export interface PublicStats {
  total_teams: number
  total_paid_users: number
  total_graduated: number
  avg_days_to_first_sale: number | null
}

export interface GraduationResult {
  enrollment_id: string
  nif_candidate_id: string
  message: string
}
```

---

*End of specification.*
