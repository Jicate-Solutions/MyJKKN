# VAC Module — Developer Handoff Quick Start

**For:** Boobalan + AI Agent
**From:** omm-dev branch (Jicate-Solutions/myjkkn_ommdev)
**Date:** 2026-03-31
**Task:** Merge VAC + CASE module to production MyJKKN

## What You're Deploying

The Value-Added Courses (VAC) module with CASE Graduation Tracker — 49 new files, 1 modified file.

| Component | Count |
|-----------|-------|
| Frontend pages | 23 |
| Components | 19 |
| Services | 2 (vac-service.ts, case-service.ts) |
| Hooks | 2 (use-vac.ts, use-case.ts) |
| Types | 2 (vac.ts, case.ts) |
| Data files | 1 (case-placement-questions.ts) |
| Sidebar changes | 1 (sidebarMenuLink.ts) |

## Step 1: Read This First

1. `01-ARCHITECTURE.md` — understand the 5-layer pattern
2. `03-DATABASE-SCHEMAS.md` — 13 tables + 3 views to create on production
3. `04-MIGRATION-GUIDE.md` — step-by-step SQL for production DB
4. `06-PRODUCTION-DELTA.md` — exactly which 49 files to create

## Step 2: Database Migration (Production)

Run the SQL in `04-MIGRATION-GUIDE.md` against the PRODUCTION Supabase (`kvizhngldtiuufknvehv`).

Order matters:
1. Core tables (vac_courses, vac_lessons, vac_enrollments, vac_learner_progress)
2. CASE tables (case_tracks, case_track_courses, case_track_enrollments, etc.)
3. Junction table (vac_course_programmes)
4. Views (vac_enrollments_with_details, case_risk_calculator, case_graduation_readiness)
5. Functions + triggers
6. RLS policies
7. Cron job

## Step 3: Code Merge

```bash
# On production repo (JKKN-Institutions/MyJKKN)
git remote add ommdev https://github.com/Jicate-Solutions/myjkkn_ommdev.git
git fetch ommdev omm-dev
git checkout -b feature/vac-case-module
git cherry-pick <commit-range-from-ommdev>
# OR merge entire branch:
git merge ommdev/omm-dev --no-commit
# Review, resolve conflicts, commit
```

## Step 4: Environment Variables

No new env vars needed. Uses existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Step 5: Verify

```bash
npm run build  # must pass
```

Then browser test:
- `/vac` — course catalog with filters
- `/vac/case` — CASE Graduation Tracker (6 tracks)
- `/vac/admin/courses` — course management
- `/vac/admin/case/tracks` — track admin

## Files in This Handoff

| File | Purpose |
|------|---------|
| `00-HANDOFF-INDEX.md` | This file — quick start |
| `01-ARCHITECTURE.md` | System design, code patterns, data flow |
| `03-DATABASE-SCHEMAS.md` | All table schemas from live staging DB |
| `04-MIGRATION-GUIDE.md` | Step-by-step SQL for production |
| `06-PRODUCTION-DELTA.md` | File-by-file diff (49 new, 1 modified) |
| `HOW-TO-USE.md` | Instructions for project owner |
