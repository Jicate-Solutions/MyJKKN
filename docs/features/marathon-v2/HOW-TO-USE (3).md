# KBM Marathon Handoff — How To Use

> **For the project owner (Omm).** Copy-paste these prompts to get the developer started.

## Quick Start Prompt (for AI agent or developer)

Copy this entire block and paste it as the first message:

```
You are working on the KBM Marathon module in the MyJKKN platform.

CONTEXT:
- Repo: Jicate-Solutions/MyJKKN (main branch)
- Supabase project: hhprjbgknupaplivtoib  
- Event: "Kumarapalayam Bypass Marathon - 2026" (ID: d5e4698b-79d2-4b4a-8c4e-60af2ff14c83)
- Race day: April 12, 2026
- Status: LIVE with 2 registrations, 6 committees, 23 tasks, 10 budget items, 7 checkpoints

READ THESE FILES FIRST (in order):
1. docs/features/marathon-handoff-v2/00-HANDOFF-INDEX.md (overview)
2. docs/features/marathon-handoff-v2/02-MOBILE-FIRST-SPECS.md (main deliverable)
3. docs/features/marathon-handoff-v2/05-CRITICAL-FIXES.md (blockers)
4. docs/features/marathon-handoff-v2/01-ARCHITECTURE.md (system design)

YOUR TASK:
Make the marathon module mobile-first responsive. 95% of users are on phones.
Priority order: Registrations page → Events list → Committees → Live Ops → Dashboard.
See 02-MOBILE-FIRST-SPECS.md for exact per-page specifications.
```

## Prompt for Mobile-First Work

```
Read docs/features/marathon-handoff-v2/02-MOBILE-FIRST-SPECS.md.

Start with the Registrations page (app/(routes)/events/marathon/[id]/registrations/page.tsx).
This is 1085 lines and uses DataTable which doesn't work on mobile.

Replace with a mobile-first card list:
- Each registration = one tappable card showing BIB, name, phone, category, payment status, check-in status
- Search bar at top (search by name, BIB, or phone)
- Filter pills for Category (10K/5K) and Payment (Paid/Pending)
- Floating "Register" button → bottom sheet form on mobile
- Check-in toggle: single tap marks participant as checked in
- On desktop (>=1024px): optionally keep DataTable

The hooks and services are working — only change the rendering layer.
```

## Prompt for Public Site Fix

```
Read docs/features/marathon-handoff-v2/05-CRITICAL-FIXES.md — Blocker #1.

The public site (kbm-marathon-public) queries tables that don't exist:
- marathon_events (should use: events WHERE event_type='marathon')
- marathon_categories (should use: event_categories)
- marathon_registrations (should use: events_registrations)

Fix: Update kbm-marathon-public/lib/services/public-service.ts to use the correct shared table names.
Then deploy: cd /Users/omm/PROJECTS/kbm-marathon-public && npm run build && git push
```

## Prompt for Payment Setup

```
The marathon module needs Razorpay payment integration.
Current state: placeholder key, "pay at venue" workaround.

1. I'll provide the Razorpay key pair
2. Update kbm-marathon-public Vercel env vars
3. Implement: create order → open checkout → verify signature → update payment_status
4. The internal module's event-payment-service.ts has an HDFC adapter — adapt for Razorpay
```

## Verification Commands

```bash
# Check production pages load
curl -sL -o /dev/null -w "%{http_code}" https://jkkn.ai/events/marathon

# Check event data
~/bin/supabase db execute --project-ref hhprjbgknupaplivtoib "SELECT name, status FROM events WHERE event_type='marathon';"

# Check registration count
~/bin/supabase db execute --project-ref hhprjbgknupaplivtoib "SELECT count(*) FROM events_registrations WHERE event_id='d5e4698b-79d2-4b4a-8c4e-60af2ff14c83';"

# Build with increased memory (required for this project)
NODE_OPTIONS="--max-old-space-size=8192" npx next build
```

## File Locations

All handoff files are at: `docs/features/marathon-handoff-v2/`

| File | Purpose |
|------|---------|
| 00-HANDOFF-INDEX.md | Start here — overview + current state |
| 01-ARCHITECTURE.md | System design, file map, data flow |
| 02-MOBILE-FIRST-SPECS.md | Per-page mobile redesign specs |
| 03-DATABASE-SCHEMAS.md | All 16 table schemas from live DB |
| 04-OPERATIONAL-DATA.md | Current event, committees, tasks, budget data |
| 05-CRITICAL-FIXES.md | 4 blockers + nice-to-haves |
| HOW-TO-USE.md | This file — prompts for the project owner |
