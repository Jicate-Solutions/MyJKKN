# Work Pulse Module — How To Use This Handoff

> **For:** Project owner (Omm) — instructions for handing this to the developer

## What This Package Contains

```
specs/work-pulse-handoff-spec.md    ← Master spec (decisions + execution plan)
specs/work-pulse/
├── HOW-TO-USE.md                   ← This file
├── 00-HANDOFF-INDEX.md             ← Quick start — file list + what to create/modify
├── 01-ARCHITECTURE.md              ← Data flow, component tree, auth patterns
├── 02-SUBMODULE-SPECS.md           ← Per-submodule specs (6 submodules)
├── 03-DATABASE-SCHEMAS.md          ← Live DB schemas (pulled from staging)
├── 04-MIGRATION-GUIDE.md           ← Step-by-step migration with verification queries
├── 05-MODULE-CONNECTIONS.md        ← Dependencies, ERD, data flow diagrams
└── 06-PRODUCTION-DELTA.md          ← Exact diff: 26 new + 3 modified files
```

**GitHub:** https://github.com/Jicate-Solutions/myjkkn_ommdev/tree/omm-dev/specs/work-pulse

## How to Hand Off

### Option A: Send to Developer Directly

Copy-paste this message to the developer:

---

**New Module: Work Pulse — Agent Discovery Engine**

I've built the Work Pulse module on the `omm-dev` branch. It's a 3-page module with AI-powered analysis that discovers automation opportunities across JKKN.

**What you need to do:**
1. Read `specs/work-pulse/00-HANDOFF-INDEX.md` for the file list
2. Read `specs/work-pulse-handoff-spec.md` for decisions and execution plan
3. Cherry-pick or merge the 26 new files + 3 modified files from `ommdev/omm-dev`
4. Apply 4 DB migrations to production
5. Add env vars: `ANTHROPIC_API_KEY` + `WORK_PULSE_API_KEY`
6. Set up 4 cron jobs (details in the spec)

**Branch:** `omm-dev` on `Jicate-Solutions/myjkkn_ommdev`
**Spec:** `docs/work-pulse-spec.md` (639 lines)
**Live demo:** `https://myjkkn-omm-dev.vercel.app/work-pulse` (requires login)

---

### Option B: AI Agent Handoff

If the developer uses an AI coding agent, send this prompt:

---

Read the following files in order:
1. `specs/work-pulse/00-HANDOFF-INDEX.md` — file list and dependencies
2. `specs/work-pulse-handoff-spec.md` — master spec with execution plan
3. `specs/work-pulse/01-ARCHITECTURE.md` — data flow and component tree
4. `specs/work-pulse/03-DATABASE-SCHEMAS.md` — live DB schemas
5. `docs/work-pulse-spec.md` — full product specification

Then execute the 7-step plan from the master spec. Start by applying the 4 database migrations, then create the 26 new files (copy from the omm-dev branch), then modify the 3 existing files, set env vars, and configure cron jobs.

---

## Testing After Handoff

Tell the developer to verify:

1. **Build passes:** `npm run build`
2. **Pages load:** `/work-pulse`, `/work-pulse/agents`, `/work-pulse/impact`
3. **Form works:** Submit a Weekly Pulse entry
4. **FAB works:** Click the yellow Zap button on any non-work-pulse page
5. **API responds:** `POST /api/work-pulse/analyze` with `x-api-key` header returns analysis results
6. **Sidebar shows:** Work Pulse appears in navigation with 3 sub-items

## What's NOT in This Handoff

These are out of scope for V1 (documented in spec section 17):
- WhatsApp/Telegram pulse submission
- Voice notes
- Real-time dashboards
- Cross-institution benchmarking
- Auto-agent code generation
- Calendar/meeting integration
