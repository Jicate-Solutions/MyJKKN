---
title: "Spec: Post-Demo Day Pipeline — Appathon 2.0 → Solve for 100 / JICATE / Solve for Industry"
date: 2026-03-09
status: ready-for-dev
priority: urgent — fill gaps identified on Demo Day
tags: [spec, appathon, solve-for-100, jicate, solve-for-industry, pipeline, progression]
---

# Spec: Post-Demo Day Pipeline

**What:** Fill the data and feature gaps between today's Demo Day and the three destination tracks: Solve for 100 (startups), JICATE Products (campus solutions), and Solve for Industry (industry partnerships).

**Why:** Demo Day evaluation is working — evaluators verify teams and score them. But we have zero data for what comes next:
- No individual contribution data (Role Cards not filled)
- No team intent declaration (which track do they want?)
- No progression tracking (the 5-stage identity ladder)
- No structured case studies for Solve for Industry
- Team metrics self-reported as 0 (teams didn't enter their numbers)

**Context:** 600 apps across 15 venues. Evaluators are actively scoring using the MyJKKN verification flow (verified users, active users, revenue → tier-based scoring). The CODE for submissions, role cards, leaderboard all exists and works. The gaps are in DATA CAPTURE and NEW FEATURES for the pipeline.

---

## Current State (What Works)

| Feature | Status | Data |
|---------|--------|------|
| Event created (JKKN Appathon 2.0) | ✅ Live | 1 event |
| Team registration | ✅ Code exists | Teams registered |
| Submission flow (app name, URLs, metrics) | ✅ Code exists | Metrics mostly 0 (teams didn't self-report) |
| Evaluation/verification | ✅ Live, being used NOW | Evaluators entering verified numbers |
| Leaderboard | ✅ Code exists | Will populate from verification data |
| Role Cards | ✅ Code exists | 0 submissions |
| Audience Voting | ✅ Code exists | Not yet activated |
| Demo Day management | ✅ Code exists | Slots, venues, freezing all work |

---

## The 5 Gaps to Fill

### Gap 1: Team Metrics Push (Process, Not Code)

**Problem:** Teams didn't enter their metrics. Evaluators see "Team Claims: 0" for users, active users, revenue.

**Solution:** This is a PROCESS fix, not a code fix. The submission page already works.

**Action:**
- Announce to all teams: "Go to MyJKKN → Startup Studio → Your Team → Submit → Enter your metrics NOW"
- Deadline: Before your team's presentation slot
- If teams don't self-report, evaluators still enter "You Verify" numbers — the system works either way

**Priority:** Nice-to-have. Evaluators can verify without team claims. But having both columns filled gives better data.

---

### Gap 2: Role Card Push (Process, Not Code)

**Problem:** Individual Role Cards exist in code but 0 submissions. We need this data for Skill Bank queries and Solve for 100 team assembly.

**Solution:** Process push. The Role Card section already exists in the submission flow.

**Action:**
- After team submission, each member fills their Role Card (existing flow)
- Can be done TODAY during Demo Day or in the 48 hours after
- The 6 roles: Problem Finder, Prompt Architect, Design Shaper, User Getter, Deal Closer, Team Captain

**Priority:** HIGH. This is the only window to capture peer-validated contribution data while memory is fresh.

**Deadline suggestion:** 48 hours after Demo Day (Tuesday March 11, 11:59 PM)

---

### Gap 3: Track Declaration (NEW FEATURE)

**Problem:** No mechanism exists to sort teams into destination tracks. Evaluators score teams, but nobody asks: "What do you want to do next?"

**What to Build:**

After Demo Day results are published, each team leader sees a new step:

```
┌─────────────────────────────────────────────────────┐
│  What's Next for [Team Name]?                       │
│                                                     │
│  Your Appathon Score: 40 pts (Level 3)              │
│                                                     │
│  Choose your path:                                  │
│                                                     │
│  ○ Solve for 100 — Startup Track                    │
│    "We want to grow this into a business with       │
│     100 paying users"                               │
│                                                     │
│  ○ JICATE Solutions — Campus Track                  │
│    "Our solution is useful but we're not starting   │
│     a company. JICATE can develop it further."      │
│                                                     │
│  ○ Solve for Industry — Industry Track              │
│    "Our solution solves a problem that businesses   │
│     outside JKKN would pay for"                     │
│                                                     │
│  ○ Completed — Exit                                 │
│    "We're done. Thanks for the experience."         │
│                                                     │
│  [Submit Declaration]                               │
└─────────────────────────────────────────────────────┘
```

#### Data Model

**New table: `ss_track_declarations`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | Auto-generated |
| `event_id` | uuid, FK | Links to ss_events |
| `team_id` | uuid, FK → ss_teams | Links to the team |
| `track` | text | Enum: `solve_for_100`, `jicate_solutions`, `solve_for_industry`, `completed` |
| `reason` | text | Optional, max 300 chars — "Why did you choose this track?" |
| `declared_by` | uuid, FK | Team leader's profile ID |
| `declared_at` | timestamptz | Auto |
| `mentor_approved` | boolean | Default null — mentor confirms track assignment |
| `mentor_notes` | text | Mentor's notes on the declaration |
| `approved_at` | timestamptz | When mentor approved |
| `approved_by` | uuid, FK | Mentor's profile ID |

#### Track Descriptions (Store as Constants)

```typescript
export const TRACKS = [
  {
    id: 'solve_for_100',
    label: 'Solve for 100 — Startup Track',
    description: 'Grow this app into a business serving 100 paying users over the next 10 months.',
    icon: 'Rocket',
    color: 'green',
    benefits: [
      '₹1,00,000 NIF Startup Credits',
      'Dedicated mentor',
      '100% internal assessment marks',
      'Exclusive industry visits',
    ],
    eligibility: 'Any team. Top 5 per college get automatic entry. Others apply with a 30-day plan.',
  },
  {
    id: 'jicate_solutions',
    label: 'JICATE Solutions — Campus Track',
    description: 'Your solution is useful for JKKN or other institutions. JICATE will partner with you to develop and deploy it.',
    icon: 'Building',
    color: 'blue',
    benefits: [
      'JICATE development support',
      'Solution deployed across JKKN campuses',
      '60/40 revenue share if sold to other institutions',
      'Portfolio credit for placements',
    ],
    eligibility: 'Any team whose solution addresses a campus/institutional problem.',
  },
  {
    id: 'solve_for_industry',
    label: 'Solve for Industry — Industry Track',
    description: 'Your solution solves a problem that businesses outside JKKN would pay for. We\'ll package it as a case study and find industry partners.',
    icon: 'Briefcase',
    color: 'purple',
    benefits: [
      'Solution packaged as industry case study',
      'JICATE connects you with industry partners',
      'Revenue share on industry contracts',
      'Real-world portfolio for placements',
    ],
    eligibility: 'Any team whose solution has applicability outside education/campus.',
  },
  {
    id: 'completed',
    label: 'Completed — Exit',
    description: 'You\'re done with the Appathon. You\'ll receive your participation certificate.',
    icon: 'CheckCircle',
    color: 'gray',
    benefits: [
      'Digital participation certificate via MyJKKN',
      'Appathon experience on your profile',
    ],
    eligibility: 'Everyone.',
  },
] as const
```

#### Validation Rules

| Rule | Details |
|------|---------|
| One declaration per team per event | Unique constraint: `(event_id, team_id)` |
| Only team leader can declare | Check `is_anchor = true` for the declaring user |
| Declaration opens after results published | Gate behind `results_published = true` on the event |
| Can change track within 7 days | Allow UPDATE for 7 days after initial declaration |
| Mentor approval is optional | Declaration stands without approval — mentor approval adds weight |

#### RLS Policies — `ss_track_declarations`

| Action | Who | Condition |
|--------|-----|-----------|
| INSERT | Team anchor | `declared_by = auth.uid()` AND user is anchor of the referenced team |
| SELECT | Team members | Own team's declaration |
| SELECT | Admin/Mentor | All rows |
| UPDATE | Team anchor | `declared_by = auth.uid()` AND within 7-day window (`declared_at > NOW() - INTERVAL '7 days'`) |
| UPDATE | Admin/Mentor | `mentor_approved`, `mentor_notes`, `approved_by`, `approved_at` fields only |
| DELETE | None | No deletions allowed |

#### Constraints — `ss_track_declarations`

- `UNIQUE(event_id, team_id)` — one declaration per team per event
- `CHECK (track IN ('solve_for_100', 'jicate_solutions', 'solve_for_industry', 'completed'))`
- `team_id` FK → `ss_teams(id)`
- `declared_by` FK → `profiles(id)`
- `approved_by` FK → `profiles(id)`

#### Admin View

Admins/mentors see a dashboard:

```
Track Declaration Summary — JKKN Appathon 2.0

Solve for 100:    87 teams  (43%)  [View List]
JICATE Solutions:  34 teams  (17%)  [View List]
Solve for Industry: 12 teams  (6%)  [View List]
Completed/Exit:    67 teams  (33%)  [View List]
Not declared:      __ teams  (__%)  [Send Reminder]

[Export CSV]  [Send Bulk Notification]
```

---

### Gap 4: Progression Level (NEW FEATURE)

**Problem:** The 5-stage identity progression (App Builder → Traction Builder → Solution Architect → AI Orchestrator → AI Principal) exists as a concept but isn't tracked anywhere.

**What to Build:**

A progression level field on each team (or individual) that updates based on verified outcomes.

#### Data Model

**New table: `ss_progression_levels`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | Auto-generated |
| `profile_id` | uuid, FK | Individual learner |
| `event_id` | uuid, FK | Which event/program context |
| `team_id` | uuid, FK → ss_teams | Team context |
| `level` | integer | 1-5 |
| `level_name` | text | Human-readable: App Builder, Traction Builder, etc. |
| `achieved_at` | timestamptz | When this level was reached |
| `evidence` | jsonb | What proved the level (e.g., `{"verified_active_users": 25, "verification_id": "xxx"}`) |
| `awarded_by` | text | `system` (auto from metrics) or mentor profile_id |

**Constraints:**
- `UNIQUE(profile_id, event_id, level)` — one level per person per event per level (ON CONFLICT uses this)
- `profile_id` FK → `profiles(id)`
- `event_id` FK → `ss_events(id)`
- `team_id` FK → `ss_teams(id)`

#### RLS Policies — `ss_progression_levels`

| Action | Who | Condition |
|--------|-----|-----------|
| INSERT | Service role / Admin | Only backend auto-assignment or admin/mentor can create levels |
| SELECT | Learner | Own progression records (`profile_id = auth.uid()`) |
| SELECT | Admin/Mentor | All rows |
| UPDATE | Service role / Admin | Only backend or admin can update levels |
| DELETE | None | No deletions allowed |

> **Note:** `awarded_by` should be set server-side. For auto-assignments, use `'system'`. For mentor awards, use the mentor's `profile_id`. Never trust client-submitted values for this field.

#### Level Definitions (Store as Constants)

```typescript
export const PROGRESSION_LEVELS = [
  {
    level: 1,
    name: 'App Builder',
    test: 'Working app deployed + presented at Demo Day',
    auto_criteria: { app_live: true, presented: true },
    stage: 'Appathon',
    identity: 'I can find a problem and direct AI to build a solution.',
  },
  {
    level: 2,
    name: 'Traction Builder',
    test: '25+ active users, at least 5 organic (not teammates/friends)',
    auto_criteria: { verified_active_users: 25 },
    stage: 'Solve for 100 — Traction Sprint (Weeks 1-4)',
    identity: 'Real people outside my circle use this and come back.',
  },
  {
    level: 3,
    name: 'Solution Architect',
    test: '100 active users + at least one automated workflow',
    auto_criteria: { verified_active_users: 100, has_automation: true },
    stage: 'Solve for 100 — Scale Phase (Months 2-5)',
    identity: 'I designed systems so it works without me doing each task.',
  },
  {
    level: 4,
    name: 'AI Orchestrator',
    test: 'Positive unit economics — revenue covers costs, growth engine running',
    auto_criteria: { positive_unit_economics: true },
    stage: 'Solve for 100 — Business Phase (Months 6-10)',
    identity: 'Revenue covers costs, growth engine runs without me.',
  },
  {
    level: 5,
    name: 'AI Principal',
    test: 'Multiple ventures OR institutional impact beyond single product',
    auto_criteria: null, // Mentor-awarded only
    stage: 'NIF Incubation / Beyond',
    identity: 'I decide what value should exist and make it happen.',
  },
] as const
```

#### Auto-Assignment Logic

After Demo Day verification is complete, the system auto-assigns Level 1 to everyone whose team:
- Was present and presented (`presented = true`)
- Has a live app (`app_live = true`)

```sql
-- Auto-assign Level 1 after Demo Day
INSERT INTO ss_progression_levels (profile_id, event_id, team_id, level, level_name, achieved_at, evidence, awarded_by)
SELECT
  tm.user_id,
  s.event_id,
  t.id,
  1,
  'App Builder',
  NOW(),
  jsonb_build_object('verification_id', v.id, 'app_live', v.app_live, 'presented', v.presented),
  'system'
FROM ss_appathon_verifications v
JOIN ss_appathon_submissions s ON s.id = v.submission_id
JOIN ss_teams t ON s.event_id = t.event_id AND s.user_id = t.anchor_id
JOIN ss_team_members tm ON tm.team_id = t.id
WHERE v.presented = true AND v.app_live = true
  AND v.verification_status = 'verified'
ON CONFLICT (profile_id, event_id, level) DO NOTHING;
```

Levels 2-4 auto-update as metrics are verified in Solve for 100 check-ins.
Level 5 is mentor-awarded only.

#### Display

On each learner's MyJKKN profile:

```
┌─────────────────────────────────────────────┐
│  Progression Level                          │
│                                             │
│  ██████████░░░░░░░░░░  Level 2 of 5        │
│                                             │
│  🏗️ Traction Builder                        │
│  "Real people outside my circle use this"   │
│                                             │
│  Achieved: March 28, 2026                   │
│  Next: Solution Architect                   │
│  Need: 100 active users + automation        │
└─────────────────────────────────────────────┘
```

---

### Gap 5: Case Study Capture (NEW FEATURE)

**Problem:** Solve for Industry needs 3-5 packaged case studies from the Appathon. Currently we only have app names and URLs — no structured problem/solution/outcome narratives.

**What to Build:**

A lightweight case study form that captures the narrative around a team's solution. Targeted at teams that choose `solve_for_industry` or `jicate_solutions` tracks.

#### When: After Track Declaration

Only shown to teams that declare `solve_for_industry` or `jicate_solutions`.

#### The Form — 5 Fields

```
┌─────────────────────────────────────────────────────┐
│  Case Study: [App Name]                             │
│                                                     │
│  1. The Problem (required)                          │
│  "Who has this problem and why does it matter?"     │
│  [___________________________________________]      │
│  Max 200 chars                                      │
│                                                     │
│  2. The Solution (required)                         │
│  "What does your app do to solve it?"               │
│  [___________________________________________]      │
│  Max 200 chars                                      │
│                                                     │
│  3. The Proof (required)                            │
│  "What happened when real people used it?"          │
│  [___________________________________________]      │
│  Max 200 chars                                      │
│  Placeholder: "15 hostel students used it daily     │
│  to report maintenance issues, avg response time    │
│  dropped from 3 days to 4 hours"                    │
│                                                     │
│  4. Who Else Needs This? (required)                 │
│  "Beyond JKKN, who would pay for this?"             │
│  [___________________________________________]      │
│  Max 200 chars                                      │
│  Only shown for solve_for_industry track            │
│                                                     │
│  5. Screenshot/Demo URL (optional)                  │
│  [___________________________________________]      │
│  URL to a 30-second demo video or screenshot        │
│                                                     │
│  [Submit Case Study]                                │
└─────────────────────────────────────────────────────┘
```

#### Data Model

**New table: `ss_case_studies`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid, PK | Auto-generated |
| `event_id` | uuid, FK | Links to event |
| `team_id` | uuid, FK → ss_teams | Links to team |
| `track` | text | `solve_for_industry` or `jicate_solutions` |
| `problem` | text | Max 200 chars |
| `solution` | text | Max 200 chars |
| `proof` | text | Max 200 chars |
| `who_else` | text | Max 200 chars, nullable (only for industry track) |
| `demo_url` | text | Optional URL |
| `app_name` | text | Denormalized for easy querying |
| `app_url` | text | Denormalized |
| `score` | integer | Denormalized from verification |
| `created_at` | timestamptz | Auto |
| `featured` | boolean | Default false — admin marks best case studies |

#### RLS Policies — `ss_case_studies`

| Action | Who | Condition |
|--------|-----|-----------|
| INSERT | Team members | User must be a member of the referenced team (`team_id`) |
| SELECT | Own team | Own team's case study |
| SELECT | All authenticated | After results published (`config.results_published = true`) |
| SELECT | Admin | All rows |
| UPDATE | Team members | Own case study content fields (`problem`, `solution`, `proof`, `who_else`, `demo_url`) |
| UPDATE | Admin | `featured`, `score` fields only — these are admin-managed |
| DELETE | None | No deletions allowed |

#### Constraints — `ss_case_studies`

- `UNIQUE(event_id, team_id)` — one case study per team per event
- `CHECK (track IN ('solve_for_industry', 'jicate_solutions'))`

---

## Implementation Priority

### Must-Do Today (Demo Day)

| # | What | Type | Effort | Impact |
|---|------|------|--------|--------|
| 1 | Push teams to submit metrics | **Process** — announcement, not code | 0 | Fills "Team Claims" column |
| 2 | Push individuals to fill Role Cards | **Process** — announcement, not code | 0 | Seeds Skill Bank data |

### Build This Week (By Friday March 14)

| # | What | Type | Effort | Impact |
|---|------|------|--------|--------|
| 3 | Track Declaration page | **New feature** — 1 new table, 1 page, admin dashboard | Medium | Routes teams into 3 tracks |
| 4 | Progression Level tracking | **New feature** — 1 new table, auto-assignment logic, profile display | Medium | Plants identity ladder |
| 5 | Case Study form | **New feature** — 1 new table, 1 form (only for industry/JICATE tracks) | Small | Creates Solve for Industry proof layer |

### The Flow (User Journey After Demo Day)

```
Demo Day Complete
    │
    ▼
Results Published on Leaderboard
    │
    ▼
"What's Next?" — Track Declaration (Gap 3)
    │
    ├── Solve for 100 → Onboarding form + 30-day plan
    ├── JICATE Solutions → Case Study form (Gap 5) → JICATE review
    ├── Solve for Industry → Case Study form (Gap 5) → Packaging
    └── Completed → Certificate
    │
    ▼
Progression Level Auto-Assigned (Gap 4)
    Level 1: App Builder (everyone who presented + app live)
    │
    ▼
Role Cards Filled (Gap 2) — 48hr window
    │
    ▼
Solve for 100 Teams Begin Traction Sprint
    Goal: Level 2 (Traction Builder) within 4 weeks
```

---

## What NOT to Build

- No complex onboarding flow for Solve for 100 — just the track declaration + 30-day plan text field
- No admin approval workflow for track changes — let teams switch within 7 days freely
- No Solve for Industry outreach tools — case studies are packaged manually for now
- No progression level celebrations/badges — just the simple progress bar on profile
- No analytics dashboard — admin queries Supabase directly for now
- No integration between the old evaluator app (Appathon 1.0) and MyJKKN — separate data

---

## Queries This Enables

```sql
-- How many teams chose each track?
SELECT track, COUNT(*) as teams
FROM ss_track_declarations
WHERE event_id = 'xxx'
GROUP BY track;

-- Which Solve for Industry teams have the best case studies?
SELECT cs.app_name, cs.problem, cs.proof, cs.score
FROM ss_case_studies cs
WHERE cs.track = 'solve_for_industry'
  AND cs.featured = true
ORDER BY cs.score DESC;

-- Progression level distribution
SELECT level_name, COUNT(*) as learners
FROM ss_progression_levels
WHERE event_id = 'xxx'
GROUP BY level_name
ORDER BY level;

-- Find all Level 2+ learners who are User Getters
SELECT p.full_name, pl.level_name, rc.self_roles
FROM ss_progression_levels pl
JOIN profiles p ON pl.profile_id = p.id
JOIN ss_role_cards rc ON rc.profile_id = pl.profile_id
WHERE pl.level >= 2
  AND 'user_getter' = ANY(rc.self_roles);

-- Teams that chose Solve for 100 but haven't reached Level 2 after 4 weeks
SELECT td.team_id, t.team_name, pl.level_name
FROM ss_track_declarations td
JOIN ss_teams t ON t.id = td.team_id
LEFT JOIN ss_progression_levels pl ON pl.team_id = td.team_id
WHERE td.track = 'solve_for_100'
  AND (pl.level IS NULL OR pl.level < 2)
  AND td.declared_at < NOW() - INTERVAL '28 days';
```

---

## UX Requirements

### Track Declaration — Loading & Feedback States

| State | What to Show |
|-------|-------------|
| Loading declaration page | Skeleton UI with team name and score placeholder |
| Submitting declaration | "Submitting your track choice..." + disabled button |
| Success | "Your track is set! Welcome to [Track Name]." with next steps |
| Error | "Something went wrong. Your choice is saved locally — tap to retry." |

### Track Declaration — Draft Auto-Save

- Auto-save selected track + reason to `localStorage` key `track_declaration_draft_{event_id}_{team_id}`
- Restore on page load if no server-side declaration exists
- Clear on successful submission

### Case Study — Loading & Feedback States

| State | What to Show |
|-------|-------------|
| Submitting case study | "Saving your case study..." + disabled button |
| Success | "Case study submitted! Your story is now part of the JKKN portfolio." |
| Error | "Save failed — your content is preserved. Tap to retry." |

### Case Study — Draft Auto-Save

- Auto-save all 5 fields to `localStorage` key `case_study_draft_{event_id}_{team_id}`
- Save on every field blur + every 10 seconds
- Restore on page load if no server-side case study exists
- Show "Draft saved" indicator

### Deadline Proximity Warning (Track Declaration)

- When within 24 hours of the 7-day declaration deadline: show amber banner with countdown
- When within 2 hours: show red banner
- After deadline: show "Declaration window closed" and disable the form (but show existing declaration if submitted)

---

## Success Criteria

- [ ] >50% of teams declare a track within 7 days of Demo Day
- [ ] >30% of teams that choose Solve for 100 submit a 30-day plan
- [ ] 5+ case studies captured for Solve for Industry within 2 weeks
- [ ] All verified teams auto-assigned Level 1 (App Builder)
- [ ] >60% of individuals fill Role Cards within 48 hours
- [ ] Track declaration data matches evaluator intuition (mentor spot-check)

---

## The Strategic Picture

```
APPATHON (Today)
    │
    ├── Demo Day Scoring (WORKING — evaluators verify metrics)
    │
    ├── Role Cards (CODE EXISTS — need process push)
    │
    └── Results Published → Track Declaration (NEW — Gap 3)
         │
         ├── Solve for 100 ────► Traction Sprint ──► Scale ──► Business
         │   (startup)           (Level 2)          (Level 3)  (Level 4)
         │
         ├── JICATE Solutions ──► Case Study ──► Deploy at JKKN ──► Sell
         │   (campus)            (Gap 5)
         │
         ├── Solve for Industry ► Case Study ──► Package ──► Industry Partners
         │   (industry)          (Gap 5)
         │
         └── Completed ─────────► Certificate
             (exit)

Progression Levels (Gap 4) track everyone across all tracks:
L1: App Builder → L2: Traction Builder → L3: Solution Architect → L4: AI Orchestrator → L5: AI Principal
```

---

---

## Dependencies / Related Specs

| Spec | Relationship | Tables Referenced From That Spec |
|------|-------------|----------------------------------|
| `Spec-Demo-Day-Evaluation.md` | **Must implement first** | `ss_appathon_verifications` (used in auto-assignment SQL) |
| `Spec-Role-Card-Skill-Bank.md` | **Must implement first** | `ss_role_cards`, `ss_peer_tags` (used in cross-queries) |
| `Appathon-2.0-Evaluation-Criteria.md` | Reference only | Scoring rules, prize structure |

**Recommended implementation order:** Demo Day Evaluation → Role Cards → Post-Demo Day Pipeline

> **Note on table naming:** In MyJKKN, the user/learner table is `profiles` (Supabase auth-linked). JKKN terminology "Learner" is used in the UI, not in database table names. All user FKs reference `profiles(id)`.

---

*Spec created: March 9, 2026 — Demo Day*
*Context: JKKN Appathon 2.0 — Powered by She Builds (Lovable x Anthropic) x JKKN Institutions*
*"Build it. Ship it. Prove it. Choose your path."*
