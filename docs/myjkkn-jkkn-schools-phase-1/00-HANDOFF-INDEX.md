# JKKN Schools — Phase 1 Developer Handoff

**Spec:** `docs/SPEC-jkkn-schools.md`
**Date:** 2026-04-11
**Target branch:** `jicate/main` (production, `Jicate-Solutions/MyJKKN`)
**Estimated scope:** 1 DB column, 3 new files, 3 edited files

---

## TL;DR

Add a single column `institutions.institution_kind ∈ {'college', 'school'}` that drives UI labelling. Schools use the same data model as colleges — only labels and a handful of sidebar items change. Zero new tables, zero shadow schemas, zero RLS changes.

---

## Read in this order

| # | File | For whom | Why |
|---|---|---|---|
| 1 | `01-ARCHITECTURE.md` | You (dev) | The insight that makes this 1 column instead of 50 |
| 2 | `02-IMPLEMENTATION-STEPS.md` | You | Exact step-by-step playbook |
| 3 | `03-DATABASE-CHANGES.md` | You | Migration, schema delta, rollback |
| 4 | `04-INTEGRATION-POINTS.md` | You | Where in the 2131-line sidebar file to wire in |
| 5 | `05-TESTING-CHECKLIST.md` | You + reviewer | What "done" looks like |
| 6 | `06-PRODUCTION-DELTA.md` | You | Why branching from `jicate/main` is safe |
| 7 | **`07-AI-AGENT-NOTES.md`** | **You + any AI coding assistant** | **The translation boundary rule — prevents hallucinated tables, renamed columns, and mixed-language UIs. READ THIS BEFORE TOUCHING ANY FILE THAT MENTIONS program/semester/course/degree.** |
| – | `../../docs/SPEC-jkkn-schools.md` | Reference | Full approved spec |

**If you're an AI coding assistant (Claude Code, Cursor, Copilot) maintaining MyJKKN AFTER Phase 1 ships, start with `07-AI-AGENT-NOTES.md` — the other files assume you already understand the architecture, but `07` is the one that keeps you from corrupting the codebase.**

---

## Files already in the repo (just copy them over)

All 4 of these live on Omm's dev branch. Cherry-pick or copy them into your fresh branch off `jicate/main`:

1. `docs/SPEC-jkkn-schools.md` — the approved spec
2. `supabase/migrations/20260411_add_institution_kind.sql` — the migration
3. `lib/constants/institution-kind-labels.ts` — college/school label maps + hidden hrefs list
4. `hooks/use-institution-kind.ts` — the React hook that reads `institution_kind` and returns labels

## Files you will edit

5. `lib/sidebarMenuLink.ts` — add ONE new export `filterMenuByInstitutionKind()` at the bottom (~20 lines)
6. `components/Navbar/menu.tsx` — call the new filter after `GetRoleBasedPages`
7. `components/BottomNav/bottom-navbar.tsx` — same treatment

That's it. No services to refactor, no RLS policies to update, no API routes to add.

---

## Environment assumptions

| Thing | Assumption |
|---|---|
| Node | 20.x LTS (matches Vercel) |
| Package manager | pnpm (see `pnpm-lock.yaml`) |
| Staging Supabase project | `hhprjbgknupaplivtoib` — **apply migration here first** |
| Production Supabase project | (the one wired into `jicate/main`) — **apply after code merges** |
| Test super-admin | `test-superadmin@jkkn.local` / `SuperAdmin@123` (staging only) |
| Browser test | MUST include a college view AND a school view screenshot |

---

## The naming gotcha (read this)

The `institutions` table already has a column called `institution_type` with values like `autonomous`, `self`, `aided`. **That is NOT what we're touching.**

- `institution_type` = accreditation status (existing, leave alone)
- `institution_kind` = education level (NEW — what this spec adds)

Do not rename, reuse, or overload `institution_type`. It's in active use for reporting and existing RLS logic.

---

## Success criteria (from the spec)

- ✅ Colleges keep working with zero regression
- ✅ A school user sees "Class 6 - Section A" instead of "Program - Section A"
- ✅ Sidebar hides `/organizations/degrees` and `/organizations/courses/mappings` for school users
- ✅ Same `students` / `daily_attendance` tables power both school and college records
- ✅ Build passes, type-check clean
- ✅ Browser screenshots prove both views render correctly

---

## Contact

If anything in this package is unclear, ping Omm — do NOT guess. The spec is already the result of several iterations; any ambiguity here means either:
(a) the spec was underspecified, or
(b) there's a production constraint Omm didn't know about.
Either way, surface it before coding.
