# KBM Marathon 2.0 — Architecture

## System Design

```
                        PARTICIPANTS (Runners, Families, Public)
                                    |
                    +---------------+---------------+
                    |                               |
            PUBLIC SITE (PWA)              FAMILY TRACKER
         marathon.jkkn.ac.in             /track/[bib]
         - Register                      - Live GPS dot
         - GPS Race Tracker              - No auth needed
         - Tamil/English                 - 10s auto-poll
         - Voice Coach
         - Results & Certificates
                    |                               |
                    +----------- SUPABASE ----------+
                                hhprjbgknupaplivtoib
                          16 tables, RLS, Real-time
                                    |
                            MyJKKN (Internal)
                           jkkn.ai/events/marathon
                         - Dashboard (4-quadrant)
                         - Registration management
                         - Sponsor CRM (kanban)
                         - Committee task tracking
                         - Budget management
                         - Live Ops command center
                         - Results + certificates
                         - Analytics + race replay
```

## Critical Architecture Decision: Shared Tables

The internal module uses **shared event tables** — NOT marathon-prefixed tables:

| What | Table Used by Internal Module | Table Used by Public Site |
|------|-------------------------------|--------------------------|
| Events | `events` (shared) | `marathon_events` (DOES NOT EXIST) |
| Categories | `event_categories` (shared) | `marathon_categories` (DOES NOT EXIST) |
| Registrations | `events_registrations` (shared) | `marathon_registrations` (DOES NOT EXIST) |

**This mismatch is the #1 blocker for the public site.** See 05-CRITICAL-FIXES.md.

The marathon-specific tables (`marathon_committees`, `marathon_budget_items`, etc.) ARE used by both platforms and all exist.

## Tech Stack

| Layer | Internal Module | Public Site |
|-------|----------------|-------------|
| Framework | Next.js 15 (App Router) | Next.js 16.2 (App Router) |
| Language | TypeScript 5 | TypeScript 5 |
| UI | shadcn/ui + Tailwind v3 | Custom dark theme + Tailwind v4 |
| Database | Supabase (client-side, `as any` cast) | Supabase (anon key, direct) |
| Auth | MyJKKN SSO (useAuth hook) | None (public) |
| State | React Query (TanStack) | React state |
| Hosting | Vercel (jkkn.ai) | Vercel (kbm-marathon-public.vercel.app) |

## Internal Module File Map

```
app/(routes)/events/
├── page.tsx                              # Events hub
├── marathon/
│   ├── page.tsx                          # Marathon events list (DataTable)
│   ├── new/page.tsx                      # Create marathon event form
│   └── [id]/
│       ├── dashboard/page.tsx            # 4-quadrant overview (749 lines)
│       ├── registrations/
│       │   ├── page.tsx                  # Registration table (1085 lines)
│       │   └── [regId]/page.tsx          # Registration detail (446 lines)
│       ├── sponsors/
│       │   ├── page.tsx                  # Sponsor pipeline kanban (547 lines)
│       │   └── [sponsorId]/page.tsx      # Sponsor detail (931 lines)
│       ├── committees/page.tsx           # Accordion + tasks (1224 lines)
│       ├── budget/page.tsx               # Budget items table (721 lines)
│       ├── live/
│       │   ├── page.tsx                  # Live Ops (3-state: pre/live/post)
│       │   └── _components/
│       │       ├── race-controls.tsx     # Start/End/Emergency buttons
│       │       ├── live-runner-map.tsx   # GPS dots on map
│       │       ├── runner-stats-bar.tsx  # Tracking/OnCourse/Finished
│       │       ├── checkpoint-panel.tsx  # Throughput per checkpoint
│       │       ├── incident-panel.tsx    # Log/resolve incidents
│       │       ├── incident-form.tsx     # Create incident dialog
│       │       ├── volunteer-panel.tsx   # Station check-in
│       │       ├── stationary-alerts.tsx # No GPS > 3min alerts
│       │       └── live-runner-detail.tsx # Runner slide-over
│       ├── results/
│       │   ├── page.tsx                  # Results table + GPS import
│       │   └── _components/import-gps-results.tsx
│       ├── analytics/
│       │   ├── page.tsx                  # Charts + intelligence
│       │   └── _components/
│       │       ├── race-analytics.tsx    # Pace/checkpoint charts
│       │       └── race-replay.tsx       # Animated GPS replay
│       ├── certificates/page.tsx         # Certificate generation
│       └── settings/page.tsx             # 4 tabs (1297 lines)

lib/services/events/
├── core/
│   ├── event-base-service.ts             # Shared CRUD (events, event_categories)
│   ├── event-payment-service.ts          # HDFC SmartGateway adapter
│   └── external-participant-service.ts   # External participant management
├── marathon/
│   ├── marathon-event-service.ts         # Wraps EventBaseService
│   ├── marathon-registration-service.ts  # Registration CRUD + BIB + stats
│   ├── marathon-sponsor-service.ts       # Sponsor CRM pipeline
│   ├── marathon-committee-service.ts     # Committee + task CRUD
│   ├── marathon-budget-service.ts        # Budget items + summary
│   ├── marathon-live-ops-service.ts      # GPS, checkpoints, incidents
│   ├── marathon-results-service.ts       # Results + ranking
│   ├── marathon-analytics-service.ts     # Registration + race analytics
│   └── marathon-certificate-service.ts   # Certificate ID + data

hooks/events/marathon/
├── use-marathon-access.ts                # Role-based access control
├── use-marathon-events.ts                # Event list + single fetch
├── use-marathon-dashboard.ts             # Dashboard stats (30s polling)
├── use-marathon-registrations.ts         # Registration CRUD
├── use-marathon-sponsors.ts              # Sponsor CRUD
├── use-marathon-committees.ts            # Committee + task CRUD
├── use-marathon-budget.ts                # Budget CRUD
├── use-marathon-live-ops.ts              # Live Ops data (10s polling)
├── use-marathon-results.ts               # Results CRUD
└── use-marathon-analytics.ts             # Analytics data (30s polling)

app/api/events/marathon/[eventId]/
├── route.ts                              # GET event details
├── categories/route.ts                   # GET categories
├── register/route.ts                     # POST registration
├── registrations/[phone]/route.ts        # GET by phone
├── results/route.ts                      # GET results
├── results/[bib]/route.ts               # GET individual result
├── race/track/route.ts                   # POST GPS batch sync
├── race/share/route.ts                   # GET/POST share link
├── race/checkpoint/route.ts              # POST QR scan
├── payment/initiate/route.ts             # POST start payment
├── payment/callback/route.ts             # GET payment callback
├── payment/webhook/route.ts              # POST payment webhook
├── payment/status/[transactionId]/route.ts
├── sponsors/route.ts                     # GET sponsors
├── stats/route.ts                        # GET registration stats
├── verify/[certId]/route.ts             # GET certificate verify
└── participant-lookup/route.ts           # GET participant lookup

types/events.ts                           # Core event types (shared)
types/events-marathon.ts                  # Marathon-specific types
lib/validations/events.ts                 # Zod schemas (shared)
lib/validations/events-marathon.ts        # Marathon Zod schemas
```

## Data Flow

### Registration (Internal)
```
Staff opens /events/marathon/[id]/registrations
  → Clicks "Register Participant"
  → Fills form: name, phone, category, participant_type, custom_data
  → MarathonRegistrationService.register()
  → INSERT into events_registrations
  → BIB auto-generated: KUM-2026-{CATEGORY_CODE}-{SEQ}
  → Dashboard stats auto-update (30s polling)
```

### Race Day GPS (Public Site → Internal)
```
Runner opens marathon.jkkn.ac.in/race → enters BIB → "Start Tracking"
  → useGpsTracker: watchPosition() every 3 seconds
  → Every 30s: POST /api/race/track → UPSERT marathon_race_tracks
  → Every 30s: INSERT marathon_race_track_points (breadcrumb trail)
  → Internal Live Ops: polls marathon_race_tracks every 10s
  → Shows all runners on map with pace/distance
```

### Results (Post-Race)
```
Coordinator opens /events/marathon/[id]/results
  → "Import from GPS" → scans marathon_race_tracks for completed runners
  → Auto-calculates finish time from elapsed_seconds
  → Creates marathon_results with auto-ranking
  → Certificate IDs generated
  → Public /results shows leaderboard
```

## Sidebar Navigation

The marathon module is accessible at: **Events > Marathon Events**

When inside an event, 10 sub-pages appear:
Dashboard, Registrations, Sponsors, Committees, Budget, Live Ops, Results, Analytics, Certificates, Settings

**Role-based access:**
- Super admin / Admin: all 10 pages
- Other roles: only Registrations (non-adminOnly pages)
- Custom roles: match `events.marathon.*` permission keys

Permission keys are defined in `lib/sidebarMenuLink.ts`:
```
'/events/marathon': 'events.marathon.view',
'/events/marathon/[id]/registrations': 'events.marathon.registrations.manage',
'/events/marathon/[id]/budget': 'events.marathon.budget.manage',
// ... etc for all 10 pages
```

## RLS Policies (events_registrations)

| Policy | Action | Rule |
|--------|--------|------|
| `events_reg_public_insert` | INSERT | `WITH CHECK (true)` — anyone can insert |
| `events_reg_admin_read` | SELECT | Super admin or admin role |
| `events_reg_institution_read` | SELECT | Same institution_id as user |
| `events_reg_public_event_read` | SELECT | Event is public and not draft/cancelled |
| `events_reg_self_read` | SELECT | profile_id = auth.uid() |
| `events_reg_admin_update` | UPDATE | Super admin or admin role |
