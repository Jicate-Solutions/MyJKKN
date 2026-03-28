# Exhibition Lead Bridge — Developer Handoff

> **Generated**: 2026-03-27 | **Branch**: `omm-dev` | **Urgency**: HIGH — events running now with 0 digital capture

## Quick Start

```bash
git checkout omm-dev
npm install
npm run dev  # http://localhost:3000
# Login: test-superadmin@jkkn.local / SuperAdmin@123
```

## What You're Building

A bridge between two existing systems:

```
expo_events (21 events, 170 team members)
     │
     │  ← THIS BRIDGE DOESN'T EXIST YET
     │
admission_leads (81 leads, 0 from exhibitions)
```

The bridge: a public QR capture form + auto-pipeline + live dashboard + ROI analytics.

## Files

| File | Read When |
|------|-----------|
| [06-PRODUCTION-DELTA.md](06-PRODUCTION-DELTA.md) | **READ FIRST** — what staging is missing vs production |
| [../expo-lead-bridge-spec.md](../expo-lead-bridge-spec.md) | Full spec with 4 build phases |
| [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | Understand what exists vs what's missing |
| [03-DATABASE-SCHEMAS.md](03-DATABASE-SCHEMAS.md) | All 15 expo+event table schemas (from production) |
| [05-MODULE-CONNECTIONS.md](05-MODULE-CONNECTIONS.md) | How expo bridge connects to CRM, referrals, analytics |
| [HOW-TO-USE.md](HOW-TO-USE.md) | Instructions for project owner |

## Staging ↔ Production: SYNCED (2026-03-28)

| What | Staging | Production | Status |
|------|---------|------------|--------|
| Expo tables | **15** | 15 | Synced |
| admission_leads columns | **81** | 78 | Staging has 3 extra (WA) |
| expo_event_id column | **Exists** | Exists | Synced |
| Referral fields | **Exists** | Exists | Synced |

Database setup is done. Developer can start building code immediately.

## Key Facts

| Fact | Value |
|------|-------|
| Schema changes | ~~17 columns + 15 tables~~ **DONE** — staging synced. Only `expo_lead_capture_links` table needs creating |
| New pages | 4 (capture form, QR generator, live dashboard, ROI analytics) |
| New API routes | 4 |
| New service | 1 (`expo-capture-service.ts`) |
| New hooks | 1 (`use-expo-capture.ts`) |
| Existing tables used | `expo_events`, `expo_daily_reports`, `expo_event_team_members`, `admission_leads`, `admission_counselors` |
| Public routes (no auth) | `/admission/capture/[eventId]` only |
| All other routes | withAuth |

## Rules

1. `expo_events` table already exists with real data — DO NOT create it
2. Capture form is PUBLIC — no login required
3. Mobile-first design — booth teams use phones
4. Offline-capable — marriage hall venues have bad WiFi
5. Rate limit the capture route — 10 per IP per hour
6. Detect duplicate phones — update existing lead, don't create duplicate
7. Target staging DB `hhprjbgknupaplivtoib` — NOT production

## Priority

Phase 1 (capture form) is the highest priority — it unlocks value for the 10 events happening in the next 7 days.
