# Continuation Prompt — IQAC Foundation Phase 1a

**Session date context:** Prior session ended 2026-04-16 with the v0.4 NAAC Master Plan locked. Resume here.

## Mission
Execute **Phase 1a** of the Workshop Transformation Resurrection plan — build the IQAC umbrella shell + Grievance module + start DCF 2025 export scaffold. This is the foundation everything else (NPS, 8.4 Survey, Sustainability, OKR, Academic Evidence, Solutions-to-Research) will plug into.

## Read These First (in order)
1. `/Users/omm/PROJECTS/MyJKKN/progress.txt` — top entry summarises last session
2. `/Users/omm/PROJECTS/MyJKKN/specs/workshop-transformation-resurrection/MASTER-PLAN.md` — v0.4 plan, 8 phases, IQAC umbrella architecture
3. `/Users/omm/PROJECTS/MyJKKN/specs/workshop-transformation-resurrection/METRIC-COVERAGE-MAP.md` — which NAAC metric each module covers
4. `/Users/omm/Vaults/JKKNKB/NAAC/` — Framework digest (1,533 lines) + JKKN Gap Analysis (649 lines, 2026-03-07)
5. `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/MEMORY.md` — full project memory, look under "Cluster Academic Council + OKR Architecture" + 2026-04-16 entries
6. `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/reference_abandoned_modules_inventory.md` — what lives on `clean-ss-deploy`
7. `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/reference_naac_framework_new.md` — 10-Attribute structure
8. `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/reference_naac_vault_gap_analysis.md` — pre-existing gap scoring
9. `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_intent_vs_schema.md` — cherry-pick audit rule

## Locked Decisions (do not relitigate)
- **Framework:** NAAC NEW (Binary + MBGL, 10 Attributes) — not old 7-criteria/1000-pts
- **Scope:** 6 colleges (2 Autonomous + 4 Affiliated) — each submits its own binary accreditation
- **Architecture:** IQAC is the umbrella. All NAAC-relevant modules nest under `/iqac/*`
- **College switcher:** First-class UX in `/iqac` header + cluster rollup view
- **DCF 2025 export:** First-class, scaffolded in Phase 1
- **Phase order:** 1=IQAC foundation+Grievance+NPS+8.4 Survey, 2=Sustainability, 3=OKR, 4=Academic Evidence, 5=Faculty Development, 6=Parent Portal, 7=Sustainability reporting, 8=Solutions-to-Research Bridge
- **Intent-vs-schema rule:** Any cherry-pick must justify its existence vs existing tables on INTENT, not schema overlap

## Director Gates (BLOCKING — do not merge Phase 1 PR until confirmed)
- IQAC chair named + committee composition approved (at least placeholder names for staging)
- 5 UGC grievance category seeds approved: academic, administrative, sexual harassment, ragging, other
- 4 NPS survey templates approved (student, faculty, staff, parent) — CO may draft questions
- Staging Supabase project ref confirmed: `hhprjbgknupaplivtoib`
- Phase 6 Parent Portal owner named (privacy policy + onboarding SOP)

If these gates aren't cleared, work can still start — but **hold the PR in draft** until Director clears them.

## Execution Plan — Phase 1a

### Step 1 — Worktree setup
```bash
cd /Users/omm/PROJECTS/MyJKKN
git fetch jicate
git worktree add .claude/worktrees/iqac-phase-1 -b feat/iqac-foundation-phase-1 jicate/main
cd .claude/worktrees/iqac-phase-1
```

### Step 2 — IQAC umbrella shell
- Route: `app/iqac/page.tsx` (landing), `app/iqac/layout.tsx` (shared header with college switcher)
- Component: `components/iqac/CollegeSwitcher.tsx` (6 colleges + "All Colleges (Cluster)" option)
- Service: `lib/services/iqac/committee-service.ts` (CRUD for IQAC committee + chair)
- DB: Create `iqac_committees` + `iqac_committee_members` tables via `supabase/setup/01_tables.sql` (UPDATE existing file — NEVER create new SQL file, see SQL_FILE_INDEX.md)
- RLS: Super admin + IQAC chair + institution scoping pattern from Solutions Hub reference module

### Step 3 — Grievance cherry-pick from `clean-ss-deploy`
- Run intent-vs-schema audit FIRST (see `feedback_intent_vs_schema.md`). Justify grievance table on intent grounds, not schema.
- `git show clean-ss-deploy:app/grievance/...` — list files
- Cherry-pick to new location under `/iqac/grievance/*`
- Apply RLS remediation (most `clean-ss-deploy` tables had no super_admin bypass — see Campus Living Audit pattern in MEMORY.md)
- Seed 5 UGC categories in `03_policies.sql`
- Enable realtime if live updates needed (follow Sprint 6 pattern)

### Step 4 — DCF 2025 export scaffold
- Service: `lib/services/iqac/dcf-export-service.ts` — stub returns placeholder XLSX for one metric to prove the pipeline
- API: `app/api/iqac/dcf-export/route.ts` with `withAuth`, super admin only
- Document the export contract in `specs/workshop-transformation-resurrection/DCF-2025-EXPORT-CONTRACT.md` (create if missing)

### Step 5 — Phase 1 PR
- Open PR to `Jicate-Solutions/MyJKKN` with title `feat(iqac): Phase 1a foundation - umbrella + grievance + DCF export scaffold`
- Tag with `naac-plan`, `phase-1`, `blocked-by-director-gates` if gates not cleared

## CRITICAL Commit Discipline — per `feedback_commit_after_every_write.md`
**The working tree is hostile. Lost ~1100 LOC of HR Sprint 6 two weeks ago this way.**

- Commit atomically after EVERY `Write` tool call — not at end of day, not at end of feature.
- Push to `jicate` remote after EVERY commit: `git push jicate feat/iqac-foundation-phase-1`
- Do not rely on `wip: auto-save` commits — those get reset by branch-switch cycles.
- If you Write a file and don't push within 2 minutes, assume it's at risk.

## Quality Bar
- Zero TypeScript errors on files you touched (`npx tsc --noEmit` in worktree)
- `withAuth` wrapper on every new API route
- RLS policy with super_admin bypass + `institution_id` scoping on every new table
- `pr-preflight` skill must run SAFE or WARN (not BLOCKED) before opening PR
- Browser-test every new route via persistent `browser-use -s jkkn-ai` session
- Update `progress.txt` + `features.json` before closing session

## Tech Stack Reminders
- Next.js 16 App Router, TypeScript, Tailwind, shadcn/ui, React Query
- Supabase staging: `hhprjbgknupaplivtoib` — test user `test-superadmin@jkkn.local` / `SuperAdmin@123` — institution `a1111111-1111-1111-1111-111111111111`
- Production repo: `Jicate-Solutions/MyJKKN` (`jicate` remote)
- Reference Pattern A module: Solutions Hub (111 API routes, all `withAuth`, `BaseService.runWithClient`, `{data, metadata}` envelope)
- SQL file discipline: UPDATE `supabase/setup/0*.sql`, never create new SQL files. Check `supabase/SQL_FILE_INDEX.md` first.

## Escalation Triggers
- Director gate not cleared + task blocks on it -> STOP, flag via Telegram, do not guess
- Intent-vs-schema audit fails (can't justify new table on intent) -> STOP, ask Director
- Parallel agent spawns hit 529 overload -> fallback to parallel Bash calls (per HR Sprint 6 lesson)
- Cherry-pick surfaces schema drift with production -> use Translator Pattern (rebuild on production base)

## Success Criteria for Phase 1a
- [ ] `/iqac` route renders with college switcher + cluster view
- [ ] IQAC committee CRUD works end-to-end (staging)
- [ ] Grievance module nested at `/iqac/grievance` with 5 seeded categories, RLS correct
- [ ] DCF 2025 export button produces placeholder XLSX (proof of pipeline)
- [ ] PR opened against `Jicate-Solutions/MyJKKN` (may be held draft until Director gates clear)
- [ ] `progress.txt` and `features.json` updated for next session
