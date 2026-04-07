# KBM Marathon 2.0 — Developer Handoff Index

> **Quick start for any developer (human or AI) picking up this project.**

## What Is This?

A dual-platform marathon management system for JKKN Institutions' annual Kumarapalayam Bypass Marathon:

1. **Public Site** (`kbm-marathon-public`) — Participant-facing PWA: registration, AI avatar, live GPS race tracker, results, Tamil/English bilingual
2. **Internal Module** (MyJKKN `/events/marathon`) — Admin command center: dashboard, sponsorship CRM, committees, budget, Live Ops race day control, GPS results import, analytics

Both share one Supabase database. Public actions → internal dashboards update in real-time.

## Repositories

| Platform | Repo | Branch | Deployed At |
|----------|------|--------|-------------|
| Public Site | `github.com/Ommsharravana/kbm-marathon-public` | `main` | https://kbm-marathon-public.vercel.app |
| Internal Module | `github.com/JKKN-Institutions/MyJKKN` | `omm-dev` | https://myjkkn-omm-dev.vercel.app |

## Handoff Files

| File | What It Covers |
|------|---------------|
| [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | System design, tech stack, data flow, file maps |
| [02-SUBMODULE-SPECS.md](02-SUBMODULE-SPECS.md) | Per-page specs for all 25 pages + 16 API routes |
| [03-DATABASE-SCHEMAS.md](03-DATABASE-SCHEMAS.md) | All 16 tables, columns, relationships, RLS |
| [04-RACE-DAY-OPERATIONS.md](04-RACE-DAY-OPERATIONS.md) | April 12 race day checklist, monitoring, troubleshooting |
| [05-DEPLOYMENT-GUIDE.md](05-DEPLOYMENT-GUIDE.md) | Env vars, Vercel, DNS, Supabase setup |
| [HOW-TO-USE.md](HOW-TO-USE.md) | Copy-paste prompts for the project owner |

## Critical Blockers (Must Fix Before April 12)

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 1 | `marathon_race_tracks` table missing from live DB | GPS tracker data won't persist. Live Ops shows nothing. | Run migration SQL (in 03-DATABASE-SCHEMAS.md) |
| 2 | `marathon_race_track_points` table missing from live DB | Race replay won't work. GPS breadcrumb trail lost. | Same migration file |
| 3 | Razorpay not configured | No online payment — "payment at venue" workaround active | Get Razorpay keys, add to Vercel env |
| 4 | DNS `marathon.jkkn.ac.in` not pointed | Public site only at Vercel URL | CNAME → `cname.vercel-dns.com` |

## Quick Commands

```bash
# Public site
cd /Users/omm/PROJECTS/kbm-marathon-public
npm run dev          # Dev server at localhost:3000
npm run build        # Production build
vercel --yes --prod  # Deploy to production

# MyJKKN (internal)
cd /Users/omm/PROJECTS/MyJKKN
npm run dev          # Dev server at localhost:3000
npx next build       # Production build (77s)

# Supabase
~/bin/supabase projects list
# Project: MyJKKN-Staging (hhprjbgknupaplivtoib)

# Create missing GPS tables
~/bin/supabase db execute --project-ref hhprjbgknupaplivtoib < supabase/migrations/20260404000001_marathon_tables.sql
```

## Codebase Stats

| Metric | Public Site | Internal Module |
|--------|------------|-----------------|
| Pages | 12 | 13 |
| API Routes | 16 | 0 (uses services directly) |
| Components | 9 | 12 |
| Services | 1 | 9 |
| Hooks | 3 | 9 |
| Total Lines | 9,363 | 9,847 |
| Build Time | 2.2s | 77s |

**Combined: ~19,200 lines of TypeScript across 84 files.**
