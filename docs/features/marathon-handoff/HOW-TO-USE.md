# KBM Marathon 2.0 — How to Use This Handoff

> **For:** Ommsharravana (Director, JKKN Institutions)
> **Purpose:** Enable any developer (human or Claude Code) to continue, deploy, and operate the KBM Marathon platforms

## Quick Actions (Copy-Paste Prompts)

### For a New Claude Code Session

**Resume development:**
```
Read the developer handoff at /Users/omm/PROJECTS/kbm-marathon-public/specs/marathon-handoff/00-HANDOFF-INDEX.md and all files in that directory. Then read the spec at /Users/omm/PROJECTS/MyJKKN/docs/SPEC-KBM-MARATHON.md. You are continuing development on the KBM Marathon platform — both the public site at /Users/omm/PROJECTS/kbm-marathon-public/ and the internal MyJKKN module at /Users/omm/PROJECTS/MyJKKN/app/(routes)/events/marathon/. Build and verify before making changes.
```

**Create the missing GPS tables (CRITICAL — do this before race day):**
```
Read /Users/omm/PROJECTS/kbm-marathon-public/specs/marathon-handoff/03-DATABASE-SCHEMAS.md and execute the SQL under "CRITICAL: Create Missing Tables" section on the Supabase project hhprjbgknupaplivtoib. Then verify both tables exist.
```

**Deploy the public site:**
```
cd /Users/omm/PROJECTS/kbm-marathon-public && npm run build && vercel --yes --prod
```

**Test the race tracker end-to-end:**
```
Open https://kbm-marathon-public.vercel.app/race on a mobile phone. Enter a valid BIB number. Tap "Start Tracking." Walk around for 1 minute. Verify: GPS position updates, voice coach speaks at distance milestones, the distance counter increases. Then open the Live Ops page in MyJKKN and verify the runner appears on the map.
```

**Fix the "Event not found" issue on MyJKKN:**
```
The marathon event exists in Supabase (id: cc441119-641e-4b0d-8cbd-107cce2ebe60) but shows "Event not found" in the deployed MyJKKN app. Debug the RLS policies on marathon_events table — the authenticated user's institution_id may not match the event's institution_id. Check the profile's institution_id and the event's institution_id.
```

### For a Human Developer (Boobal's Team)

**Setup from scratch:**
1. Clone both repos
2. `npm install` in both projects
3. Copy `.env.local` from this handoff or from the existing deployments
4. Run `npm run dev` — both start on localhost:3000 (use different ports)
5. Read `01-ARCHITECTURE.md` for file maps and patterns

**Key file to understand first:**
- Public site: `lib/services/public-service.ts` — ALL Supabase queries in one file
- Internal: `lib/services/events/marathon-*.ts` — one service per domain area

## What's Remaining

### P0 — Must Do Before April 12
1. Create GPS tables in Supabase (see 03-DATABASE-SCHEMAS.md)
2. Configure DNS marathon.jkkn.ac.in → Vercel
3. Fix "Event not found" RLS issue on MyJKKN
4. End-to-end test: registration → race tracker → live ops → results import

### P1 — Should Do Before Race Day
1. Configure Razorpay for online payments
2. Test voice coach in Tamil on real Android/iOS devices
3. Test family tracker link sharing via WhatsApp
4. Brief volunteers on QR checkpoint scanning

### P2 — After Race Day
1. AI Race Story generation from GPS data (Gemini API)
2. AI Victory Card (finish line avatar — earned, not given)
3. Smart Certificate with pace charts and AI insights
4. Digital Race Replay animation on results page
5. Photo gallery upload system

### P3 — Future Editions
1. BLE beacon checkpoints (needs hardware)
2. AI photo matching by bib number
3. Native app wrapper (React Native or Capacitor)
4. Multi-event support (Smileathon)

## File Locations

| What | Path |
|------|------|
| **This handoff** | `/Users/omm/PROJECTS/kbm-marathon-public/specs/marathon-handoff/` |
| **Master spec** | `/Users/omm/PROJECTS/MyJKKN/docs/SPEC-KBM-MARATHON.md` |
| **AI Experience spec** | `/Users/omm/PROJECTS/kbm-marathon-public/docs/AI-EXPERIENCE-SPEC.md` |
| **Design system** | `/Users/omm/PROJECTS/kbm-marathon-public/docs/DESIGN-SYSTEM.md` |
| **Dark theme plan** | `/Users/omm/PROJECTS/kbm-marathon-public/docs/plans/2026-04-04-dark-theme-race-tracker.md` |
| **Live Ops plan** | `/Users/omm/PROJECTS/MyJKKN/docs/plans/2026-04-04-marathon-live-ops-command-center.md` |
| **Migration SQL** | `/Users/omm/PROJECTS/MyJKKN/supabase/migrations/20260404000001_marathon_tables.sql` |

## Session History

This platform was built in a single marathon Claude Code session on April 3-4, 2026:

1. Explored existing internal module (4 commits, T01-T50 from spec)
2. Built public site from scratch — 4 parallel agents (10 pages, 16 API routes)
3. Added Gemini AI "Race Day Ready" avatar generator
4. Applied poster corrections (₹200, 6AM, under 18 free, JKKN100 50% cashback)
5. Redesigned ALL pages to dark Ultrahuman theme — 4 parallel agents
6. Built Tamil/English bilingual system (200+ translation keys)
7. Built Live Race Tracker (GPS, voice coach, QR, wake lock)
8. Built Live Ops Command Center — 5 parallel agents (map, checkpoints, incidents)
9. Audited spec vs implementation — found 4 critical + 8 warning gaps
10. Fixed all gaps — 5 parallel agents (GPS fix, analytics, certificates, detail pages, APIs)

Total: ~19,200 lines of TypeScript across 84 files, deployed and live.
