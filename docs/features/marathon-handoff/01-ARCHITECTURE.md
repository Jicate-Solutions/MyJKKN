# KBM Marathon 2.0 — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        PARTICIPANTS                          │
│  Runners (2,000+) · Families · Schools · Public              │
└──────────────┬──────────────────────────────────┬────────────┘
               │                                  │
               ▼                                  ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│   PUBLIC SITE (PWA)      │    │   FAMILY TRACKER             │
│   marathon.jkkn.ac.in    │    │   /track/[bib]               │
│                          │    │   (no auth, public link)      │
│   • Register             │    │   • Live GPS dot on map       │
│   • AI Avatar (Gemini)   │    │   • Distance, pace, ETA       │
│   • Race Tracker (GPS)   │    │   • Auto-polls every 10s      │
│   • Voice Coach (Tamil!) │    └──────────────┬───────────────┘
│   • QR Checkpoints       │                   │
│   • Results/Leaderboard  │                   │
│   • Certificate Verify   │                   │
└──────────────┬───────────┘                   │
               │                               │
               │  GPS data, registrations,      │
               │  checkpoint scans              │
               ▼                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    SUPABASE (Staging)                         │
│                    hhprjbgknupaplivtoib                       │
│                                                              │
│  16 marathon_* tables · RLS policies · Real-time capable     │
│  Shared between BOTH platforms                               │
└──────────────────────────────────────────────┬───────────────┘
                                               │
               ┌───────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│                    MyJKKN (Internal)                          │
│                    myjkkn-omm-dev.vercel.app                 │
│                                                              │
│   • Event Management (lifecycle, settings, categories)       │
│   • Registration Dashboard (real-time counts, college %)     │
│   • Sponsorship CRM (kanban pipeline, deliverables)          │
│   • Committees & Tasks (assignments, progress)               │
│   • Budget Tracker (line items, approvals)                   │
│   • Live Ops Command Center (GPS map, checkpoint throughput) │
│   • Results Management (manual + GPS import)                 │
│   • Analytics (charts, YoY, race replay)                     │
│   • Certificate Generation                                   │
└──────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Public Site | Internal Module |
|-------|------------|-----------------|
| Framework | Next.js 16.2 (App Router) | Next.js 15 (App Router) |
| Language | TypeScript 5 | TypeScript 5 |
| Styling | Tailwind v4 (CSS-first, `@theme inline`) | Tailwind v3 + shadcn/ui |
| UI Components | Custom (VitalCard, BottomTabs) | shadcn/ui (Card, Badge, Button, etc.) |
| Design | Dark Ultrahuman-inspired | MyJKKN standard (light theme) |
| Database | Supabase (anon key, direct queries) | Supabase (client-side, `as any` cast) |
| Auth | None (public site) | MyJKKN SSO (useAuth hook) |
| i18n | Tamil/English (React Context) | English only |
| AI | Gemini 2.0 Flash (avatar gen) | — |
| PWA APIs | Geolocation, Wake Lock, Speech, Camera | — |
| Hosting | Vercel | Vercel |
| Font | Montserrat + Open Sans + Noto Sans Tamil | Inter (MyJKKN default) |

## Public Site File Map

```
kbm-marathon-public/
├── app/
│   ├── layout.tsx              # Root layout: dark theme, fonts, LocaleProvider, BottomTabs
│   ├── globals.css             # Dark CSS tokens (#0a0a0a base), utility classes, animations
│   ├── page.tsx                # Landing (server shell → landing-client.tsx)
│   ├── landing-client.tsx      # Landing page client component (hero, stats, categories, FAQ)
│   ├── register/
│   │   ├── page.tsx            # 5-step registration form (1,116 lines)
│   │   └── success/page.tsx    # BIB card, confetti, AI avatar, share
│   ├── my-registration/page.tsx # Phone lookup → vital card dashboard
│   ├── race/page.tsx           # GPS tracker, voice coach, QR scanner (563 lines)
│   ├── track/[bib]/
│   │   ├── page.tsx            # Server shell with SEO metadata
│   │   └── track-runner.tsx    # Client: family live tracker, 10s polling
│   ├── results/page.tsx        # Leaderboard, search, college ranking
│   ├── route/page.tsx          # Map, checkpoint timeline, elevation
│   ├── sponsors/page.tsx       # Tier-based sponsor display
│   ├── gallery/page.tsx        # Pre-event photo placeholder
│   ├── archive/page.tsx        # Multi-year history + growth chart
│   ├── verify/[certId]/page.tsx # Certificate QR verification
│   └── api/
│       ├── event/current/      # GET current active event
│       ├── event/[id]/categories/ # GET categories for event
│       ├── register/           # POST public registration
│       ├── registration/[phone]/ # GET lookup by phone
│       ├── race/track/         # POST batch GPS sync
│       ├── race/share/         # GET/POST share link
│       ├── race/checkpoint/    # POST QR checkpoint scan
│       ├── results/            # GET public results
│       ├── results/[bib]/      # GET individual result
│       ├── sponsors/           # GET public sponsors
│       ├── stats/              # GET registration stats
│       ├── verify/[certId]/    # GET certificate verification
│       ├── verify-payment/     # POST Razorpay webhook (stub)
│       ├── generate-avatar/    # POST Gemini AI avatar
│       ├── og/                 # GET OG image generation
│       └── archive/            # GET all events
├── components/
│   ├── layout/header.tsx       # Translucent dark header + language toggle
│   ├── layout/footer.tsx       # Minimal dark footer (desktop only)
│   ├── ui/vital-card.tsx       # Ultrahuman-style data card
│   ├── ui/bottom-tabs.tsx      # 5-tab mobile nav
│   ├── ui/language-toggle.tsx  # Tamil/English toggle pill
│   ├── countdown.tsx           # Dark countdown timer
│   ├── live-count.tsx          # Animated registration counter
│   ├── marathon-avatar.tsx     # Gemini AI avatar generator
│   └── qr-scanner.tsx          # Camera QR code scanner
├── lib/
│   ├── supabase.ts             # Supabase client (anon key)
│   ├── types.ts                # Public-facing type definitions
│   ├── utils.ts                # Formatters (time, pace, currency, BIB)
│   ├── services/public-service.ts # All Supabase queries (PublicMarathonService)
│   ├── hooks/use-gps-tracker.ts   # GPS watchPosition + Haversine
│   ├── hooks/use-wake-lock.ts     # Screen Wake Lock API
│   ├── hooks/use-voice-coach.ts   # Tamil/English TTS
│   └── i18n/
│       ├── translations.ts     # 200+ keys, English + Tamil
│       └── context.tsx         # React Context, auto-detect, localStorage
└── public/manifest.json        # PWA manifest (dark theme)
```

## Internal Module File Map

```
MyJKKN/app/(routes)/events/marathon/
├── page.tsx                    # Event list with DataTable
├── new/page.tsx                # Create new event form
└── [id]/
    ├── dashboard/page.tsx      # 4-quadrant dashboard (registrations, sponsors, tasks, budget)
    ├── registrations/
    │   ├── page.tsx            # Registration table + college penetration badges
    │   └── [regId]/page.tsx    # Registration detail (payment, checkpoint scans, result)
    ├── sponsors/
    │   ├── page.tsx            # Kanban pipeline view
    │   └── [sponsorId]/page.tsx # Sponsor detail (deliverables, activity timeline)
    ├── committees/page.tsx     # Accordion with tasks
    ├── budget/page.tsx         # Budget line items with summary
    ├── live/
    │   ├── page.tsx            # Live Ops command center (3-state: pre/live/post)
    │   └── _components/
    │       ├── race-controls.tsx      # Start/End/Emergency
    │       ├── live-runner-map.tsx     # GPS dots on map
    │       ├── runner-stats-bar.tsx    # Tracking/OnCourse/Finished/Pace
    │       ├── checkpoint-panel.tsx    # Throughput per checkpoint
    │       ├── incident-panel.tsx      # Log/resolve incidents
    │       ├── incident-form.tsx       # Create incident dialog
    │       ├── volunteer-panel.tsx     # Station check-in status
    │       ├── stationary-alerts.tsx   # No GPS > 3min alerts
    │       └── live-runner-detail.tsx  # Individual runner slide-over
    ├── results/
    │   ├── page.tsx            # Results table + GPS import button
    │   └── _components/import-gps-results.tsx
    ├── analytics/
    │   ├── page.tsx            # Charts + race intelligence section
    │   └── _components/
    │       ├── race-analytics.tsx   # Pace/checkpoint/college charts
    │       └── race-replay.tsx      # Animated GPS trace replay
    └── settings/page.tsx       # 4 tabs: General, Categories, Route, Registration

MyJKKN/lib/services/events/
├── marathon-event-service.ts          # Event CRUD + lifecycle
├── marathon-registration-service.ts   # Registration CRUD + dashboard stats
├── marathon-sponsor-service.ts        # Sponsor CRUD + pipeline
├── marathon-committee-service.ts      # Committee + task management
├── marathon-budget-service.ts         # Budget CRUD + summary
├── marathon-live-ops-service.ts       # GPS data, checkpoints, incidents, race controls
├── marathon-results-service.ts        # Results CRUD + ranking
├── marathon-analytics-service.ts      # Registration/race analytics + YoY
└── marathon-certificate-service.ts    # Certificate ID generation + data

MyJKKN/hooks/events/
├── use-marathon-events.ts         # Event list + single event fetch
├── use-marathon-dashboard.ts      # Dashboard stats (30s polling)
├── use-marathon-registrations.ts  # Registration CRUD
├── use-marathon-sponsors.ts       # Sponsor CRUD
├── use-marathon-committees.ts     # Committee + task CRUD
├── use-marathon-budget.ts         # Budget CRUD
├── use-marathon-live-ops.ts       # Live Ops data (10s polling)
├── use-marathon-results.ts        # Results CRUD
└── use-marathon-analytics.ts      # Analytics data (30s polling)

MyJKKN/types/events-marathon.ts    # All types (829 lines)
MyJKKN/lib/validations/events-marathon.ts # Zod schemas (303 lines)
MyJKKN/supabase/migrations/20260404000001_marathon_tables.sql # All 16 tables
```

## Data Flow

### Registration Flow
```
Runner opens marathon.jkkn.ac.in/register
  → Fills 5-step form (category, details, institution, emergency, review)
  → POST /api/register
  → PublicMarathonService.register() → Supabase marathon_registrations INSERT
  → Bib number auto-generated: KBM-2026-{CODE}-{SEQ}
  → Success page with BIB card + AI avatar option
  → Internal dashboard auto-updates (30s polling)
```

### Race Day GPS Flow
```
Runner opens /race → enters BIB → "Start Tracking"
  → useGpsTracker hook: watchPosition() every 3 seconds
  → useWakeLock: keeps screen on
  → useVoiceCoach: speaks at each km, checkpoints, halfway, finish
  → Every 30s: POST /api/race/track → Supabase marathon_race_tracks UPSERT
  → Every 30s: POST /api/race/track → Supabase marathon_race_track_points INSERT
  → Family opens /track/[bib] → GET /api/race/share?bib=X → shows live position
  → Internal Live Ops: polls marathon_race_tracks every 10s → shows all runners on map
```

### Results Flow
```
Option A: Manual CSV upload in MyJKKN Results page
Option B: "Import from GPS" button → scans marathon_race_tracks for completed runners
  → Auto-calculates finish time from elapsed_seconds
  → Creates marathon_results entries with auto-ranking
  → Certificate IDs generated → verification URL created
  → Public site /results page shows leaderboard
  → /verify/[certId] validates certificates via QR scan
```

## Environment Variables

### Public Site (.env.local)

| Variable | Purpose | Current |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://hhprjbgknupaplivtoib.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Set (JWT token) |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL | `https://marathon.jkkn.ac.in` |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Razorpay public key | `rzp_test_placeholder` (NOT configured) |
| `GEMINI_API_KEY` | Google Gemini API for avatar generation | Set (AIza...) |

All also set in Vercel production environment.

### Internal Module

Uses MyJKKN's existing env vars. No marathon-specific env vars needed — shares the same Supabase project.

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Separate repos | Public site = standalone Next.js; Internal = MyJKKN module | Different auth requirements, independent deployment, SEO for public |
| No API routes in internal module | Services called directly from client components | MyJKKN pattern — all services use client-side Supabase |
| `as any` cast for Supabase | Marathon tables not in generated types | Types defined in `events-marathon.ts` instead, regenerate after migration |
| Dark theme (public site) | Ultrahuman-inspired #0a0a0a | Differentiator — no other marathon site looks like a health-tech app |
| Tamil/English bilingual | React Context + flat dictionary | ~40% participants are local Tamil speakers |
| GPS tracking in PWA | Geolocation API in foreground | No native app needed — works in any browser |
| Voice coach | Web Speech API with Tamil support | Unprecedented — no marathon does Tamil voice coaching |
| Physical tags + bike pilot = official timing | GPS = experience layer only | GPS accuracy is 3-5m, not precise enough for official results |
