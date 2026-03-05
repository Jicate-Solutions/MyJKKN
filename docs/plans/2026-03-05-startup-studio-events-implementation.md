# Startup Studio Events Module — Implementation Design
*Date: 2026-03-05 | Approach: A (Urgency-First) | First Event: JKKN Appathon 2.0*

## Context

JKKN Appathon 2.0 event ID `572a5836-58a6-4f98-a3f4-92b862dd8080` is already created in the DB.
- Registration deadline: **March 6, 11:59 PM IST** (tomorrow)
- Build Day: **March 8** (3 days away)
- Demo Day: **March 9**

This is a live production deadline. Implementation must prioritize student-facing flows first.

Reference design doc: `docs/features/startup/2026-03-05-startup-studio-events-design.md`

---

## Approach A — Urgency-First

Build in strict event-deadline priority order. Phases 1-4 must ship before March 6 11:59 PM.

### Critical Blocker Resolutions

| Blocker | Resolution |
|---------|-----------|
| `startup_studio.*` permissions not seeded | Seed in Phase 1 SQL migration alongside tables |
| `staff` table has no `profile_id` | Use email-based lookup: `staff.email` → `profiles.email` join in service layer. No schema change for now. |
| `resources` cross-module FK untested | `resource_id` is nullable per design — use manual venue entry for March 8. Picker optional. |
| Deadline-based RLS (column-level locks) | Enforce in TypeScript service layer only, not RLS. Service checks `now() < submission_deadline` before updates. |

---

## Directory Structure

```
app/(routes)/startup-studio/
├── events/
│   ├── page.tsx                           # Event list (all roles)
│   ├── [id]/
│   │   ├── page.tsx                       # Event detail + Register CTA
│   │   ├── register/
│   │   │   └── page.tsx                   # Team registration form (student)
│   │   ├── my-team/
│   │   │   └── page.tsx                   # Team status (student)
│   │   ├── submit/
│   │   │   └── page.tsx                   # Two-phase submission form (student)
│   │   ├── my-assignment/
│   │   │   └── page.tsx                   # Mentor: venue + teams
│   │   ├── registrations/
│   │   │   └── page.tsx                   # Admin: all teams, check-in, Lovable
│   │   ├── venues/
│   │   │   └── page.tsx                   # Admin: venues, mentors, auto-allocate
│   │   ├── demo-day/
│   │   │   └── page.tsx                   # Admin: slot generation + assignment
│   │   ├── leaderboard/
│   │   │   └── page.tsx                   # Admin+Evaluator: rankings + publish
│   │   └── checklists/
│   │       └── page.tsx                   # Admin: pre/on/post checklists
│   └── _components/
│       ├── event-card.tsx
│       ├── event-status-badge.tsx
│       ├── event-detail-header.tsx
│       ├── registration-form.tsx
│       ├── team-members-input.tsx
│       ├── my-team-card.tsx
│       ├── submission-form.tsx
│       ├── metrics-form.tsx
│       ├── registrations-table.tsx
│       ├── registrations-columns.tsx
│       ├── venues-panel.tsx
│       ├── venue-card.tsx
│       ├── staff-assignment-dialog.tsx
│       ├── allocate-teams-dialog.tsx
│       ├── demo-slots-table.tsx
│       ├── leaderboard-table.tsx
│       ├── mrr-verification-queue.tsx
│       └── checklist-panel.tsx

lib/services/startup-studio/
├── event-service.ts
├── event-registration-service.ts
├── event-venue-service.ts
├── event-submission-service.ts
├── event-leaderboard-service.ts
└── event-checklist-service.ts

hooks/startup-studio/
├── use-events.ts
├── use-event-registrations.ts
├── use-event-venues.ts
├── use-event-submissions.ts
└── use-event-leaderboard.ts

types/startup-studio.ts
```

---

## Service Layer Conventions

All services follow the existing MyJKKN static class pattern:

```typescript
export class EventRegistrationService {
  private static get supabase() { return createClientSupabaseClient(); }

  static async registerTeam(dto: CreateRegistrationDto, userId: string): Promise<EventRegistration> {
    try {
      // 1. Validate: deadline, team size, duplicate leader, member conflicts
      // 2. Insert event_registrations
      // 3. Insert event_team_members
      return registration;
    } catch (error) {
      console.error('[startup/registration] registerTeam failed:', error);
      throw error;
    }
  }
}
```

Logging module prefix: `'startup/events'`, `'startup/registration'`, `'startup/submission'`, etc.

---

## Scoring Logic (TypeScript only, no DB trigger)

```typescript
// In event-submission-service.ts
function calculateScore(metrics: SubmissionMetrics, config: EventConfig): ScoringResult {
  // Tier: highest tier achieved (not cumulative)
  // MRR bonus: only if tier >= 4 AND mrr_verified = true
  // total_score = tier_points + mrr_bonus_points
  // Stored denormalized on event_submissions
}
```

Recalculated on every `updateMetrics()` call before `metrics_deadline`.

---

## RLS Policy Pattern

Institution-scoped (standard MyJKKN pattern):
```sql
CREATE POLICY "startup_events_select" ON startup_events
  FOR SELECT USING (
    host_institution_id IS NULL  -- cross-institution events visible to all
    OR host_institution_id IN (
      SELECT institution_id FROM profiles WHERE id = auth.uid()
    )
  );
```

Student own-data pattern:
```sql
CREATE POLICY "event_registrations_owner" ON event_registrations
  FOR ALL USING (owner_id = auth.uid());
```

Admin bypass via `user_has_permission('startup_studio.events.manage')`.

---

## Permissions to Seed

```
startup_studio.events.view
startup_studio.events.create
startup_studio.events.manage
startup_studio.registrations.view
startup_studio.registrations.manage
startup_studio.venues.manage
startup_studio.submissions.view
startup_studio.submissions.verify_mrr
startup_studio.leaderboard.view
startup_studio.leaderboard.publish
startup_studio.checklists.manage
startup_studio.demo_day.manage
```

---

## Sidebar Navigation

```typescript
// lib/sidebarMenuLink.ts — new Startup Studio group
{
  groupLabel: 'Startup Studio',
  menus: [
    { href: '/startup-studio/events', label: 'Events', icon: Rocket,
      permission: 'startup_studio.events.view' },
    // Student-only (dynamic active event id):
    { href: '/startup-studio/events/[activeId]/my-team', label: 'My Team',
      icon: Users, permission: 'startup_studio.registrations.view', role: 'student' },
    { href: '/startup-studio/events/[activeId]/submit', label: 'Submit Project',
      icon: Upload, permission: 'startup_studio.submissions.view', role: 'student' },
    // Mentor-only:
    { href: '/startup-studio/events/[activeId]/my-assignment', label: 'My Assignment',
      icon: MapPin, permission: 'startup_studio.venues.manage', role: 'staff' },
    // Admin-only:
    { href: '/startup-studio/events/[activeId]/registrations', label: 'Registrations',
      permission: 'startup_studio.registrations.manage', role: 'admin' },
    { href: '/startup-studio/events/[activeId]/venues', label: 'Venues & Mentors',
      permission: 'startup_studio.venues.manage', role: 'admin' },
    { href: '/startup-studio/events/[activeId]/demo-day', label: 'Demo Day',
      permission: 'startup_studio.demo_day.manage', role: 'admin' },
    { href: '/startup-studio/events/[activeId]/leaderboard', label: 'Leaderboard',
      permission: 'startup_studio.leaderboard.view', role: 'admin' },
    { href: '/startup-studio/events/[activeId]/checklists', label: 'Checklists',
      permission: 'startup_studio.checklists.manage', role: 'admin' },
  ]
}
```

---

## Phase Order (Urgency-Prioritized)

| Phase | Deliverable | Target |
|-------|------------|--------|
| 1 | SQL tables (9) + RLS + types + permissions seed | March 5 |
| 2 | Event list page + event detail page + event-service.ts | March 5 |
| 3 | Team registration form + my-team page + registration-service.ts | March 5-6 |
| 4 | Admin registrations page + check-in + Lovable toggle | March 6-7 |
| 5 | Venues setup + mentor assignment + auto-allocate | March 7 |
| 6 | Submission form (phase 1) + metrics form + my-assignment page | March 8 |
| 7 | Leaderboard + scoring + MRR queue + demo-day slots + publish | March 8-9 |
| 8 | Checklists + sidebar update (role-filtered) | March 9 |

---

## TypeScript Types Structure (types/startup-studio.ts)

```typescript
// 1. Enums
export type EventStatus = 'draft' | 'registration_open' | 'registration_closed' | 'build_day' | 'demo_day' | 'closed';
export type StaffRole = 'mentor' | 'lead_mentor' | 'judge' | 'panel_chair' | 'evaluator';
export type DayType = 'build_day' | 'demo_day';
export type RegistrationStatus = 'registered' | 'checked_in' | 'disqualified';

// 2. Core entity interfaces
export interface StartupEvent { ... }
export interface EventRegistration { ... }
export interface EventTeamMember { ... }
export interface EventVenueAssignment { ... }
export interface EventSubmission { ... }

// 3. DTOs
export interface CreateEventDto { ... }
export interface CreateRegistrationDto { ... }
export interface UpdateSubmissionDto { ... }
export interface UpdateMetricsDto { ... }

// 4. Config
export interface EventConfig {
  team_max_size: number;
  categories: string[];
  tools: string[];
  scoring_type: string;
  tier_points: Record<number, number>;
  mrr_bonus_brackets: Array<{ min: number; max: number | null; points: number }>;
}

// 5. Scoring
export interface ScoringResult {
  tier_level: number;
  tier_points: number;
  mrr_bonus_points: number;
  total_score: number;
}
```

---

## Key Validation Rules (Service Layer)

| Rule | Where Enforced |
|------|---------------|
| Registration past deadline | `EventRegistrationService.registerTeam()` |
| Team size > config.team_max_size | `EventRegistrationService.validateRegistration()` |
| Member already on another team | `EventRegistrationService.addMember()` — cross-check event_team_members |
| Leader already registered | `EventRegistrationService.registerTeam()` — UNIQUE constraint + pre-check |
| Problem idea < 20 chars | Zod schema client-side + service-side |
| GitHub URL format | `z.string().startsWith('https://github.com/')` |
| Submission past deadline | `EventSubmissionService.updateSubmission()` — checks `now() < event.submission_deadline` |
| Metrics past metrics_deadline | `EventSubmissionService.updateMetrics()` — checks `now() < event.metrics_deadline` |

---

*Design approved: 2026-03-05 | Approach A confirmed by user*
