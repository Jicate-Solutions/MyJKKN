# Continuation Prompt — Compliance Unification Program (Session resume)

**Session date context:** Previous session (2026-04-17, ~9 hours) shipped 9 PRs of the 15-PR Compliance Unification Program + opened 1 (PR #236 PR-A8 c1 awaiting merge). All 10 merged PRs are live on production or about to be. Substrate tables + RLS + metrics + anti-ragging trigger all LIVE on production Supabase.

## TASK (P0)

Two things in order:
1. **Verify PR #236 (PR-A8 commit 1) merged + deployed.** If merged → fire Vercel deploy hook, wait for Ready, verify `/accreditation/naac` renders in browser (persistent `jkkn-ai` session). If not merged → ask user to review.
2. **Build PR-A8 commit 2: `/accreditation/naac` sub-routes** — IQAC committee CRUD + DCF 2025 export + 8.4 survey DPDPA consent flow. Estimated 18h of work; may split across sessions.

## PROJECT

- **Codebase:** `/Users/omm/PROJECTS/MyJKKN` (Next.js 16 App Router)
- **Production repo:** `Jicate-Solutions/MyJKKN` (remote name `jicate`)
- **Production branch:** `jicate/main`
- **Production Supabase:** `kvizhngldtiuufknvehv.supabase.co` (accessible via `mcp__supabase__*` tools — every call hits PROD, write idempotent SQL only)
- **Env credentials:** `/Users/omm/PROJECTS/MyJKKN/.env.local`

## SPECS TO READ FIRST (in order)

1. `/Users/omm/PROJECTS/MyJKKN/docs/one-jkkn-one-data.md` — context library (directive rules for ALL compliance work; Rules 1-5 especially)
2. `/Users/omm/PROJECTS/MyJKKN/specs/one-jkkn-one-data/unification-program/MASTER-PLAN.md` — 15-PR program spec; see PR-A8 section for commit 2 scope
3. `/Users/omm/PROJECTS/MyJKKN/specs/workshop-transformation-resurrection/PHASE-1A-SPEC.md` — RETIRED but has 22 locked silent-assumption decisions that apply to PR-A6 grievance (not A8 directly)
4. `/Users/omm/PROJECTS/MyJKKN/progress.txt` — session history + decomposed tasks
5. `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/MEMORY.md` — session memory index (load on demand)

## CURRENT STATE

- **Branch:** `jicate/main` is at `~751c2cad1` or later (check with `git fetch jicate && git log jicate/main --oneline -3`). PR #236 may have merged — verify.
- **Worktree to use for PR-A8 c2:** Create fresh from jicate/main: `.claude/worktrees/unify-pr-a8-c2`. Do NOT reuse `.claude/worktrees/unify-pr-a8` (already pushed, PR open).
- **Substrate live on production:** 6 tables (`quality_evidence_mappings`, `accreditation_committees`, `accreditation_committee_members`, `accreditation_submissions`, `accreditation_survey_consents`, `accreditation_digest_config`), 22 RLS policies, 68 metrics across 10 body_codes, 8 JKKN colleges with iqac_codes, anti-ragging fan-out trigger verified.
- **Vercel:** latest build includes PR-A1 through PR-A4. PR-A8 c1 deploy pending merge.
- **Other session work:** User separately merged PR #230 (OKR module scaffolding) and PR #233 (Dashboard v2 Student hero) — not blocking our work.

## WHAT NEEDS TO HAPPEN (PR-A8 commit 2)

Sub-routes under `/accreditation/naac/`:

### 1. `/accreditation/naac/committees/*` — IQAC committee CRUD
- Page: `app/(routes)/accreditation/naac/committees/page.tsx` — list per institution (filter by college via URL param), create button
- Page: `app/(routes)/accreditation/naac/committees/[id]/page.tsx` — detail with member management
- Service: `lib/services/accreditation/accreditation-committee-service.ts` — CRUD on `accreditation_committees` filtered by `body_code='NAAC'`
- Service: methods for `accreditation_committee_members` add/remove with role (chair/coordinator/member/observer/secretary/convenor)
- Hook: `hooks/accreditation/use-naac-committees.ts`
- Support external members (industry experts, alumni without MyJKKN profiles) via `external_name + external_org + external_email` fields
- RLS-aware: super_admin sees all, institution users see own institution's committees

### 2. `/accreditation/naac/dcf-export` — DCF 2025 / AQAR export
- Page: `app/(routes)/accreditation/naac/dcf-export/page.tsx` — super-admin-only button
- Creates row in `accreditation_submissions` with `body_code='NAAC'`, `submission_type='NAAC_AQAR_2024_25'` or `'NAAC_SSR_2027'`
- Generates placeholder XLSX (can use `xlsx` or `exceljs` package — check existing usage first via `grep -l "xlsx\|exceljs" package.json`)
- Full 90-row NAAC rubric mapping is out of scope — stub the export with the 26 seeded metric codes + placeholder values ("auto-fill pending")

### 3. `/accreditation/naac/surveys/*` — 8.4 LES + DPDPA consent
- Page: `app/(routes)/accreditation/naac/surveys/consent/page.tsx` — DPDPA 2023 consent form
- 4 data categories (PII, academic, alumni outcomes, parent contact — all 4 per v2.1 R4.4 decision)
- Inserts into `accreditation_survey_consents` with `body_codes=['NAAC','NIRF']` array
- Page: `app/(routes)/accreditation/naac/surveys/8.4-export/page.tsx` — learner + alumni CSV export respecting consent
- Export filters: only rows where `accreditation_survey_consents.body_codes @> '{"NAAC"}'` AND `withdrawn_at IS NULL`
- Include `accreditation_submissions` row creation on export event

## CONSTRAINTS & RULES

- **Production-code sweep is MANDATORY.** Before writing any plan or code, run `git ls-tree jicate/main -r --name-only | grep -iE "(accreditation.*committee|dcf.export|survey.consent|8\.4|iqac)"` — include output in response. Per CLAUDE.md Tier-4 directive + `/myjkkn-chain` Tier-2 skill gate. Failing this gate 5+ times in one session is what elevated the rule.
- **MCP is on PRODUCTION.** Every `mcp__supabase__apply_migration` writes to kvizhngldtiuufknvehv. Use ONLY: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `WHERE col IS NULL`.
- **Body-agnostic mandate.** Director-locked 2026-04-17: "not just NAAC but all others." Committee CRUD must accept body_code parameter even if PR-A8 only uses 'NAAC' — later PRs (A9-A15) will call the same service for NIRF/NBA/DCI/PCI/INC committees.
- **Use shared infrastructure from PR-A7:**
  - `AccreditationBodyCode` type (UPPERCASE enum)
  - `AccreditationService` for scoreboard/coverage queries
  - `BodyScoreboardCard` component
  - `ACCREDITATION_BODIES` metadata
- **Use existing PR-A2 substrate directly:** don't re-query raw tables if a service method exists
- **Sequential PRs preferred** — no parallel agents for critical-path work (user preference lock)
- **Permission keys:** add to `lib/constants/permissions.ts` — `accreditation.naac.committees.*`, `accreditation.naac.dcf-export`, `accreditation.naac.surveys.*`
- **Sidebar:** extend existing "Accreditation" menu group under `/accreditation/naac` sub-menu for committees + surveys + DCF export
- **JKKN terminology:** "learners" not "students"; cricket is BANNED (don't suggest sports widgets with cricket); JKKN has 8 colleges not 6

## APPROACH

1. **First:** verify PR #236 state via `gh pr view 236 --repo Jicate-Solutions/MyJKKN --json state,mergedAt`
2. **If merged:** fire Vercel deploy hook, monitor with `vercel ls my-jkkn --scope jicate-solutions | grep Production`, wait for Ready + fresh build
3. **If not merged:** flag to user, pause until merged
4. **Create worktree:** `git worktree add .claude/worktrees/unify-pr-a8-c2 -b feat/unify-pr-a8-commit2-sub-routes jicate/main`
5. **Write code sequentially:** committees first (service → hook → page → detail page), then DCF export (service → page), then surveys (service → consent page → export page)
6. **Test with MCP:** insert a test committee row + test member, verify RLS with super_admin role
7. **Build verify:** `npm run build` — check `/accreditation/naac/committees`, `/dcf-export`, `/surveys/consent`, `/surveys/8.4-export` all appear in route tree
8. **Commit + push + PR** following session 2026-04-17 pattern (squash auto-save commits if needed via `git reset --soft`)

## KEY FILES TO READ FIRST

- `/Users/omm/PROJECTS/MyJKKN/lib/services/accreditation/accreditation-service.ts` — pattern for shared service layer (PR-A7)
- `/Users/omm/PROJECTS/MyJKKN/lib/types/accreditation/index.ts` — AccreditationBodyCode enum + BodyMeta
- `/Users/omm/PROJECTS/MyJKKN/app/(routes)/accreditation/naac/page.tsx` — PR-A8 c1 MVP (sub-routes hang off this)
- `/Users/omm/PROJECTS/MyJKKN/app/(routes)/admission/group-dashboard/_components/naac-report-generator.tsx` — pattern for NAAC-specific report UI (PR-A3)
- `/Users/omm/PROJECTS/MyJKKN/lib/services/admission/admission-accreditation-report-service.ts` — pattern for `emit*Evidence()` fan-out method (PR-A3)

## QUALITY BAR

- `npm run build` passes with `/accreditation/naac/committees`, `/committees/[id]`, `/dcf-export`, `/surveys/consent`, `/surveys/8.4-export` in route tree
- `npx tsc --noEmit` has 0 errors on files touched (1 pre-existing admission-tqm error unrelated)
- Committee CRUD end-to-end tested via MCP: insert committee, add member, verify RLS rejects other institution, delete
- DPDPA consent insert works with body_codes text[] + scope jsonb
- All new permission keys added to `lib/constants/permissions.ts`
- Sidebar entries visible for super_admin role
- PR opened against `Jicate-Solutions/MyJKKN:main`; held draft until reviewer confirms build

## DO NOT

- **Do NOT build NIRF, NBA, or other body dashboards** — those are PR-A9, A10, A12-A15 (separate PRs)
- **Do NOT touch grievance module** — that's PR-A6, biggest PR, own session
- **Do NOT write SQL migrations that aren't idempotent** — MCP hits PROD
- **Do NOT skip the production-code sweep** — elevated to mandatory gate after 5 session failures
- **Do NOT parallelize via agents** — user locked sequential preference
- **Do NOT re-architect what's already live** — PR-A7 shared components stable; consume them, don't redesign them
- **Do NOT delete worktrees** `.claude/worktrees/unify-pr-a*` — they have history. User cleans up explicitly
- **Do NOT create new SQL files outside `supabase/setup/0*.sql`** — CLAUDE.md SQL file management rule

## VERIFY BY

- `gh pr view <new-PR> --json state` returns `OPEN` with clean diff
- `https://www.jkkn.ai/accreditation/naac/committees` returns 307 (auth redirect — page exists)
- MCP test: `INSERT INTO accreditation_committees (institution_id, body_code, committee_name, committee_type, formed_at) VALUES ('...', 'NAAC', 'Test IQAC', 'main', CURRENT_DATE) RETURNING id;` — should succeed under super_admin, fail under other institution user
- `SELECT COUNT(*) FROM accreditation_survey_consents WHERE body_codes @> '{NAAC}'::text[]` after a test consent insert — should be 1

## SESSION END STATE

9 PRs of 15 merged + 1 open (PR #236). After PR-A8 c2: 11 of 15. Remaining: A6 (grievance, 40h — own session), A9 NIRF, A10 NBA, A12/A13/A14 DCI/PCI/INC, A15 NCTE+AICTE+UGC combined. Estimated 5-6 more sessions to complete the 15-PR Unification Program at sequential pace.
