# Cohort Core — Shared Cohort Engine (build plan + progress)

> **Loop state file.** This is the durable source of truth for the `/loop` autonomous build.
> Each iteration: build the next unchecked item → scoped-verify → commit → tick the box here.
> Survives `/clear`. Branch: `feat/cohort-core` (off `jicate/main`). Worktree: `.claude/worktrees/cohort-core`.

## Guardrails (non-negotiable)
- **PR-staged only.** Never auto-apply migrations to prod DB, never fire a deploy inside the loop. All work lands in the branch.
- **Definition of "green"** = `tsc --noEmit` shows **no NEW errors in files this branch touches** (repo has ~1000 pre-existing) + `eslint` clean on touched files + `npm run build` route/sidebar/reachability gates pass. No repo-wide typecheck-zero (structurally unmeetable).
- Every new SECURITY DEFINER RPC: `REVOKE EXECUTE FROM anon, PUBLIC; GRANT TO authenticated`.
- RLS on every table; `institution_id` scoping via `role_has_institution_access()`; `is_super_admin() OR is_admin()` first in every policy.

## Locked program rules (from interview 2026-06-22) — these live in the SHARED lifecycle engine
1. Paid user = **still paying this month** (churn drops count; MRR-based)
2. Proof = team uploads proof, **mentor spot-checks** (esp. near target)
3. Leaderboard ranks by **mentor-verified** members only
4. Reaching target → **mentor/coordinator approves** before graduation
5. Drop below target → **30-day grace period**
6. Pivot → **mentor decides** if progress resets
7. Missed deadline → **mentor decides** (warn/extend/drop)
8. One person, two cohorts → **only with mentor approval**
9. Mentor unresponsive → **escalate to coordinator after 3 business days**
10. No team/solo → **help-match** into a cohort
11. Goes quiet → **nudge, then pause** (never delete)
12. Team size → **2–5**
13. Structure → **repeating cohorts, fixed length**
14. Round ends under target → **rolls into next round** (keeps progress)

Rules 1–4 are SF100-startup-specific (extension layer). Rules 5–14 are generic cohort lifecycle (shared spine).

## Architecture — thin shared spine + domain extensions
- `cohorts` — id, kind ('sf100'|'foundations'|'cdc'|'trainer'), name, institution_id, owner_id, opens_at, closes_at, hard_deadline, status, academic_year, config jsonb, archived_at/by
- `cohort_memberships` — id, cohort_id, member_type ('team'|'student'|'learner'|'staff'), member_ref, status, role, joined_at/by, config jsonb
- `cohort_status_events` — id, cohort_id, membership_id, event_type, from_status, to_status, actor_id, reason, metadata, created_at (powers nudge→pause, escalation, grace-period, audit)
- Shared status enum: `draft → enrolling → active → completed → archived` (cohort); `invited → enrolled → active → graduated | removed | paused` (membership)
- Shared service `lib/services/cohort-core/` + shared hooks `hooks/cohort-core/` + shared UI `components/cohort-core/` (list, roster table, status badge, lifecycle machine)
- Each domain keeps its extension tables (SF100: paid_users/exercises/pivots/check_ins/interviews; CDC: attendance/cert; Trainer: earnings/levels/assignments) and registers its container into `cohorts`.

## State of the world (verified 2026-07-05)
- No `cohorts`/`cohort_memberships`/`cohort_status_events` yet (clean slate).
- SF100: 1 program, 18 enrollments, 0 paid_users. Foundations/CDC/Trainer containers = 0 rows (empty scaffolds).

---

## PHASE 1 — Core spine (additive, 🟢 no live data touched) — ✅ DONE → PR #1797
- [x] 1.1 Migration: `cohorts`, `cohort_memberships`, `cohort_status_events` tables + enums + indexes + RLS (institution-scoped) + updated_at triggers
- [x] 1.2 Update `supabase/setup/01_tables.sql`, `03_policies.sql`, `04_triggers.sql`, `SQL_FILE_INDEX.md`
- [x] 1.3 Shared TS types `lib/types/cohort-core.ts` (Cohort, CohortMembership, statuses)
- [x] 1.4 Shared service `lib/services/cohort-core/cohort-service.ts` (CRUD + status transitions)
- [x] 1.5 Lifecycle engine `lib/services/cohort-core/lifecycle.ts` (nudge→pause, escalation-after-3d, grace-period) — pure functions, unit-testable
- [x] 1.6 React Query hooks `hooks/cohort-core/index.ts`
- [x] 1.7 Scoped verify (tsc/eslint on touched files) + commit — tsc 0 / eslint 0; 11-agent adversarial review = 0 confirmed critical/high

## PHASE 2 — SF100 onto the core as reference (🟡 live data: 19 rows)
- [ ] 2.1 Map `sf100_programs` → register into `cohorts` (kind='sf100'); `sf100_enrollments` → `cohort_memberships`
- [ ] 2.2 Backfill migration for the 1 program + 18 enrollments (idempotent)
- [ ] 2.3 Point SF100 service/hooks at cohort-core for lifecycle; keep startup-specific tables as extensions
- [ ] 2.4 Scoped verify + commit

## PHASE 3 — Foundations onto the core (🟢 empty)
- [ ] 3.1 Map `ss_foundations_cohorts/enrollments` → cohort-core (kind='foundations')
- [ ] 3.2 Service/hooks + scoped verify + commit

## PHASE 4 — CDC training onto the core (🟢 empty)
- [ ] 4.1 Map `cdc_training_programmes` + `cdc_training_enrollments` → cohort-core (kind='cdc'); keep attendance/cert extension
- [ ] 4.2 Service/hooks + scoped verify + commit

## PHASE 5 — Trainer development adapter (🟡 divergent domain)
- [ ] 5.1 Adapter: `sh_training_programs`/`sh_cohort_members` → cohort-core (kind='trainer'); earnings/levels stay extension
- [ ] 5.2 Decide fit vs standalone (re-evaluate after Phases 1–2 prove the spine)
- [ ] 5.3 Service/hooks + scoped verify + commit

## PHASE 6 — Shared UI + retire duplicates (🟡 cross-module)
- [ ] 6.1 Shared cohort UI components used across all four
- [ ] 6.2 Retire/park dead duplicate cohort screens
- [ ] 6.3 Scoped verify + commit

## FINAL GATE
- [ ] Run `tsc --noEmit` → 0 new errors in touched files
- [ ] Run `eslint` on touched files → clean
- [ ] Run `npm run build` gates (gen:routes/check:sidebar/check:reachability/check:audit-coverage) → pass
- [ ] Open PR(s) via ship worktree; STOP (human merges + deploys)

## Progress log
- 2026-07-05 10:15 — Worktree `feat/cohort-core` created off jicate/main (@3ad2c343b); SF100 code present; plan written. Next: Phase 1.1.
- 2026-07-05 10:54 — PHASE 1 COMPLETE → **PR #1797**. Built + adversarially verified via 11-agent ultracode workflow (0 confirmed critical/high; tsc 0, eslint 0). Added CHECK on status_events target; verified FK/trigger targets exist in prod. Migration NOT applied (PR-staged). HELD at Phase-1 checkpoint for Director review before Phase 2 (first phase to touch LIVE SF100 data).
