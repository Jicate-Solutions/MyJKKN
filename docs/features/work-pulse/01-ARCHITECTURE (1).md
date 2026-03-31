# Work Pulse — Architecture

## Data Flow

```
User submits Weekly Pulse form
    → Server Action (pulse-actions.ts)
        → WorkPulseService.submitWeeklyPulse()
            → Supabase INSERT wp_pulse_entries (RLS: user can insert own)
        → [Optional] POST /api/work-pulse/translate (if Tamil detected)
            → Claude API translates → UPDATE _en columns

Every Sunday midnight (cron):
    POST /api/work-pulse/analyze (x-api-key auth)
        → Fetch wp_pulse_entries (past week)
        → Fetch user_activity_logs (behavioral signals)
        → Fetch existing wp_patterns (trend comparison)
        → Fetch wp_micro_interviews responses
        → Call Claude API (pattern clustering)
        → UPSERT wp_patterns (new/updated patterns)
        → INSERT notifications for training wins

Scheduled notifications (cron):
    POST /api/work-pulse/notify?type=<type> (x-api-key auth)
        → pulse_reminder (Friday 4 PM)
        → pulse_followup (Saturday 10 AM)
        → hod_compliance (Monday 9 AM)
        → pattern_building / agent_deployed / training_win / micro_interview (event-driven)
```

## Component Architecture

```
app/(routes)/layout.tsx
├── <WorkPulseFab />              # Global FAB (hidden on /work-pulse routes)
│
├── /work-pulse (page.tsx)        # Server Component
│   ├── Stats cards (4)
│   ├── <BadgeDisplay />          # Client — Agent Originator badges
│   ├── <WeeklyPulseForm />       # Client — react-hook-form + zod
│   │   └── <InstantHelpCard />   # Client — shows after submission
│   ├── Recent Entries list
│   ├── <MicroInterviewResponse /> # Client — inline radio + textarea
│   └── <ComplianceTab />         # Client — HOD/admin only
│
├── /work-pulse/agents (page.tsx) # Server Component
│   ├── Board stats cards (4)
│   ├── Tier Sections (S/A/B/C)
│   │   └── <PatternCard />       # Client — expandable card
│   ├── Training Wins section
│   └── Impact This Quarter footer
│
└── /work-pulse/impact (page.tsx) # Server Component
    ├── Summary cards (5)
    ├── Deployed Agents table
    └── Flywheel Health section
```

## Auth Patterns

| Endpoint | Auth Method | Who Can Access |
|----------|------------|----------------|
| Pages (`/work-pulse/*`) | Session (middleware redirect) | All authenticated users |
| `POST /api/work-pulse/analyze` | `x-api-key` header OR super_admin session | Cron job or admin |
| `POST /api/work-pulse/translate` | Session (getAuthUser) | Any authenticated user |
| `POST /api/work-pulse/notify` | `x-api-key` header only | Cron job |
| Server actions | Session (getEnhancedUserProfile) | Logged-in users |

## Service Layer

`lib/services/work-pulse/work-pulse-service.ts` — static class with async methods:

| Method | Purpose |
|--------|---------|
| `submitWeeklyPulse(dto, userId, ...)` | Upsert pulse entry (1 per user per week) |
| `getMyPulseEntries(userId, filters)` | Paginated entry history |
| `hasSubmittedThisWeek(userId)` | Boolean check |
| `getPatterns(filters)` | Paginated patterns with tier/status/type filters |
| `getPattern(id)` | Single pattern detail |
| `getPendingInterviews(userId)` | Unanswered micro-interviews |
| `respondToInterview(id, userId, dto)` | Submit response |
| `getImpactSummary()` | Aggregated impact stats |
| `getImpactList()` | Deployed agents with pattern joins |
| `getMyPulseStats(userId)` | Personal dashboard stats |
| `getAgentBoardStats()` | Board-level aggregations |

**Important:** Service uses `createClient()` from `@/lib/supabase/server` (server-side Supabase client). All methods are async because client creation is async.

## External Dependencies

| Table | Module | Usage |
|-------|--------|-------|
| `profiles` | Organization | User identity, role, institution_id |
| `institutions` | Organization | FK for pulse entries |
| `departments` | Organization | FK for pulse entries, compliance |
| `user_activity_logs` | Core | Silent Observer behavioral signals |
| `notifications` | Core | Notification delivery |
| `user_notifications` | Core | User-notification link |
| `bug_reports` | Bug Reporter | Auto-route misclassified entries |
