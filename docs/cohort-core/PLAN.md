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

## Cross-domain decisions (interview 2 — 2026-07-05) — how the SHARED engine behaves across all 4 programs
- **D1 · Admin visibility** — KEEP platform-standard (`is_admin()` sees all institutions). Phase-1 RLS is correct as-is; no change needed.
- **D2 · Rule application** — PER-PROGRAM SWITCHES. Each cohort toggles which shared lifecycle rules it uses via `cohorts.config` (jsonb). Define a rules-config shape with a sensible default per `kind`.
- **D3 · SF100 migration (Phase 2)** — COPY-OVER + KEEP OLD AS BACKUP. Backfill `sf100_programs`(1) + `sf100_enrollments`(18) into `cohorts`/`cohort_memberships`; leave `sf100_*` tables intact until sign-off. Fully reversible.
- **D4 · Cross-program membership** — ALLOWED. A person may be active in multiple DIFFERENT programs at once. (Same-program dual membership still needs mentor approval — rule 8.)
- **D5 · Foundations completion (Phase 3)** — MENTOR SIGN-OFF marks a student complete.
- **D6 · Trainer development (Phase 5)** — fold in LAST, after Phases 2–4 prove the engine; re-decide fit-vs-standalone at that point.
- **D7 · Round close/archive** — members AUTO-complete/archive with the round; their record is KEPT as history (cohort-service cascade).
- **D8 · Member transfer** — ALLOWED between cohorts with history preserved (enables roll-into-next-round, rule 14); coordinator-gated in the UI. Add `transferMembership` to cohort-service.

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

## PHASE 2 — SF100 onto the core as reference (🟡 live data: 19 rows) — approach = COPY-OVER + KEEP OLD (D3)
- [x] 2.0 Engine: per-program rule-config shape on `cohorts.config` + defaults per kind (D2); add `transferMembership` (D8) and round-close cascade that auto-archives members (D7) to cohort-service + lifecycle
- [x] 2.1 Map `sf100_programs` → register into `cohorts` (kind='sf100'); `sf100_enrollments` → `cohort_memberships`
- [x] 2.2 Backfill migration for the 1 program + 18 enrollments (idempotent, COPY only — leave sf100_* intact as backup per D3)
- [ ] 2.3 Point SF100 service/hooks at cohort-core for lifecycle; keep startup-specific tables as extensions
- [ ] 2.4 Scoped verify + commit

## PHASE 3 — Foundations onto the core (🟢 empty)
- [ ] 3.1 Map `ss_foundations_cohorts/enrollments` → cohort-core (kind='foundations'); completion = MENTOR SIGN-OFF (D5) → graduates the membership
- [ ] 3.2 Service/hooks + scoped verify + commit

## PHASE 4 — CDC training onto the core (🟢 empty)
- [ ] 4.1 Map `cdc_training_programmes` + `cdc_training_enrollments` → cohort-core (kind='cdc'); keep attendance/cert extension
- [ ] 4.2 Service/hooks + scoped verify + commit

## PHASE 5 — Trainer development adapter (🟡 divergent domain)
- [ ] 5.1 Adapter: `sh_training_programs`/`sh_cohort_members` → cohort-core (kind='trainer'); earnings/levels stay extension
- [ ] 5.2 Decide fit vs standalone — fold in LAST, re-evaluate after Phases 2–4 prove the spine (D6)
- [ ] 5.3 Service/hooks + scoped verify + commit

## PHASE 6 — Shared UI + retire duplicates (🟡 cross-module)
- [ ] 6.1 Shared cohort UI components used across all four
- [ ] 6.2 Retire/park dead duplicate cohort screens
- [ ] 6.3 Scoped verify + commit

## PHASE 7 — THE MOAT (self-improving loop) — spec'd 2026-07-05; BUILD after fuel exists
> **Moat audit (moat-loop skill, 2026-07-05): verdict = NO LOOP today.** Parts 4 (outcome-vs-baseline) + 5 (feed-forward) are ABSENT; 0 fuel (0 graduations, 0 verified paid users, 1 program). The **verified-paying-user** metric is the moat SEED — a hard, external, non-replayable signal. Certify with a REAL 2-cycle sim once cohorts complete; never "verified by construction."

Decisions (interview 3, 2026-07-05):
- **M1 · Success metric** = BLENDED score (success-rate + verified-revenue + speed, **EQUAL weights**). Same fixed estimator on baseline AND outcome (no double-count).
- **M2 · Capture** outcome + baseline AT COHORT CLOSE, from cohort #1. Fold into D7 `closeCohort`. **MUST ship before any cohort closes — a baseline can't be reconstructed later.**
- **M3 · Feed-forward** = system AUTO-ADJUSTS the program (deadlines / targets / mentor assignment) from measured outcomes.
- **M4 · Alumni flywheel** = graduates AUTO-eligible as mentors next cohort (`member_type='staff'`, `role='mentor'`, referencing the graduated member).
- **M5 · When it may act** = auto-adjust allowed after **1** completed cohort…
- **M6 · Reality check** = …but ALWAYS gated by a no-change CONTROL group (within-cohort team-level A/B, since 1 cohort has no prior). This kills the regression-to-mean confound AND is exactly what makes the 2-cycle sim certifiable.
- **M7 · Safety brake** = …and a HUMAN approves each auto-change until trusted, then loosen.

Build items (deferred until fuel / explicit go):
- [ ] 7.0 Fold M2 outcome-capture into `closeCohort` (store blended score + baseline) — **SHIP BEFORE FIRST COHORT CLOSE**
- [ ] 7.1 Blended cohort-outcome metric (equal-weight) + baseline storage; fixed estimator both ends
- [ ] 7.2 Control-group assignment (within-cohort A/B) + lift calc with confound check
- [ ] 7.3 Feed-forward proposer (auto-adjust) gated by M5 (≥1 cohort) + M7 (human approval)
- [ ] 7.4 Alumni→mentor pipeline (graduate → eligible mentor next cohort)
- [ ] 7.5 CERTIFY with 2-cycle sim + confound check (seed → assert lift==known delta → prove N+1 changes → cleanup)

## FINAL GATE
- [ ] Run `tsc --noEmit` → 0 new errors in touched files
- [ ] Run `eslint` on touched files → clean
- [ ] Run `npm run build` gates (gen:routes/check:sidebar/check:reachability/check:audit-coverage) → pass
- [ ] Open PR(s) via ship worktree; STOP (human merges + deploys)

## Progress log
- 2026-07-05 10:15 — Worktree `feat/cohort-core` created off jicate/main (@3ad2c343b); SF100 code present; plan written. Next: Phase 1.1.
- 2026-07-05 10:54 — PHASE 1 COMPLETE → **PR #1797**. Built + adversarially verified via 11-agent ultracode workflow (0 confirmed critical/high; tsc 0, eslint 0). Added CHECK on status_events target; verified FK/trigger targets exist in prod. Migration NOT applied (PR-staged). HELD at Phase-1 checkpoint for Director review before Phase 2 (first phase to touch LIVE SF100 data).
- 2026-07-05 — PHASE 2.0–2.2 BUILT (engine + backfill, PR-staged, NOT applied). **Engine (D2/D7/D8):** `lib/types/cohort-core.ts` adds `CohortRuleConfig`/`CohortConfig`/`CohortCloseStatus`/`TransferMembershipDto`/`CloseCohortDto`; `lifecycle.ts` adds pure `defaultRuleConfigForKind(kind)` (sf100+foundations = full lifecycle; cdc+trainer = inactivity-only), `isRuleEnabled`, `membershipCloseStatus`, `isTerminalMembershipStatus/isTerminalCohortStatus`; `cohort-service.ts` adds `transferMembership` (re-points cohort_id, keeps history + 'transferred' event, blocks terminal rows) and `closeCohort` (container→completed/archived + guarded/audited member cascade); hooks add `useTransferMembership`/`useCloseCohort`. No Phase-1 API broken (append-only). **Backfill:** `20260731050000_cohort_core_sf100_backfill.sql` — COPY-only, non-destructive, idempotent (1 program→cohort, 18 enrollments→team memberships). Status maps: program enrollment_open→enrolling; enrollment warning/probation→active (original kept in config.sf100_status), withdrawn→removed. DATE→timestamptz at IST boundaries. sf100_* left intact (D3, no cutover). **2.3 (repoint SF100 reads) still pending — held for Director sign-off.**
