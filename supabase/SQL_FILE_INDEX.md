# Supabase SQL File Index

## ⚠️ IMPORTANT: SINGLE SOURCE OF TRUTH

**This is the ONLY place to track all SQL files. DO NOT create duplicate SQL files.**

## 📝 Recent Changes

- **2026-07-10** — **SCF leadership permission gates** (`20260731110000_scf_leadership_permission_gates.sql`; **ALREADY APPLIED TO PROD** 2026-07-09/10 via the Management API — this migration RECORDS production so the repo is not amnesiac). **TIER-1 IDEMPOTENT / ADDITIVE / DROPS-NOTHING.** 13 SCF leadership read-functions (15 signatures) re-gated off a hardcoded `profiles.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','hod','principal','coordinator'])` list — which **ignored `user_roles`, `custom_roles` and every permission toggle, so Role Management could not grant these panels at all** (a CEO holding `academic.attendance.dashboard.view` was still refused) — onto `user_has_permission()` with **two NEW keys**: `academic.session_feedback.leadership.view` (11 college-level panels) and `academic.session_feedback.learner_detail.view` (learner trajectory + struggling notes; **narrower — HoDs excluded by design**). Tenant scope now uses `role_has_institution_access()` (honours Institution Scope + per-user grants). **PERF:** a SECURITY DEFINER fn in a `WHERE` clause runs **once per row** — that turned a 54ms HoD query into **55,847ms** and broke the panel for 64 HoDs; allowed institutions are hoisted once into `v_insts uuid[]` and filtered with `= ANY(v_insts)`. `fn_scf_escalation_followups` **10,529ms -> 233ms** and `fn_scf_admin_faculty_summary` **5,253ms -> 202ms** by hoisting two correlated `staff` sub-queries into `MATERIALIZED` CTEs (`staff` is indexed on `email` but **not** `lower(email)`); both proven **row-identical via `EXCEPT ALL` both ways**. **NEW 3-arg overloads** `fn_scf_admin_trend(date,date,uuid)` / `fn_scf_loop_activity(date,date,uuid)` added **beside** the 2-arg ones (third arg has **no default**, so `fn(from,to)` stays unambiguous and deployed code keeps working; nothing dropped) + `NOTIFY pgrst`. All 15 signatures **REVOKE EXECUTE FROM anon, PUBLIC** / **GRANT TO authenticated**. Verified by impersonation on prod: ceo + executive_admin_officer DENIED→ALLOWED (6 colleges); administrator/hod/principal keep access, correctly scoped; faculty/student stay DENIED; **89 existing users, 0 regressions**. Keys registered in `lib/constants/permissions.ts` (PR #1930) so they appear in Role Management. **NOT included (deliberate):** `fn_scf_verdict_contradictions` / `fn_scf_verdict_track_record` (same defect, different page) and the **6 write/authorization functions** (`fn_curriculum_lesson_upsert`, `fn_live_poll_can_manage`, `fn_scf_open_pulse`, `fn_scf_set_verdict`, `_fn_curriculum_class_ctx`, `_fn_live_poll_ensure_class_anchor`) — re-gating a **write** on a **view** permission would let anyone who can read a dashboard edit lesson plans; they need their own write keys.

- **2026-07-06** — **Cohort Core** **Phase 7 M3–M7 — THE MOAT (self-improving loop)** (PLAN.md Phase 7 · M1/M3–M7; **NOT yet applied to prod** — PR-staged in `feat/cohort-moat-m3-m7`; **CERTIFIED by a sandboxed 2-cycle sim** run in a rolled-back transaction against prod). **4 migrations, all TIER-1 ADDITIVE/IDEMPOTENT/DROPS-NOTHING.** **(1) `20260731092000_cohort_blended_score.sql` (M7.1):** the measurement heart. `fn_cohort_blended_score(kind,member_type,member_ref)` (SECURITY DEFINER, **REVOKE anon/PUBLIC/authenticated** — trigger-only, direct grant would leak any enrollment's revenue cross-tenant) — a VERSIONED (`sf100.v1`) equal-weight estimator over {success-rate=active_paid_users/paid_user_target, verified-revenue=total_revenue/(target×min_txn), speed=target-hit?1−elapsed_frac:0}, each clamped [0,1], applied to BOTH baseline (SF100 `seed_*` cols, t=0) AND outcome (final aggregates); returns `{blended_baseline,blended_outcome,lift,components,inputs,estimator_version}`; non-sf100 kinds → `{scored:false, lift:null}`. `o_hit` is DATA-driven (`active_paid_users≥target`), independent of the sf100_enrollments.status enum. Upgrades `fn_capture_cohort_outcome` (trigger fn, in 04_triggers) to CALL it and MERGE the envelope into `outcome_snapshot` — best-effort (estimator error→unscored; whole capture wrapped so it can never roll back the close). **(2) `20260731093000_cohort_experiments.sql` (M7.2 · M6 confound-killer):** `experiment_arm ∈ {control,treatment}` on `cohort_memberships.config` (jsonb, no schema change); NEW table `public.cohort_experiments` (one row/cohort: n_treatment/n_control, treatment_mean_lift, control_mean_lift, **causal_lift = treatment_mean−control_mean** [act on THIS], **naive_lift** [confounded, contrast-only], n_scored, estimator_version, institution_id NOT NULL; UNIQUE(cohort_id)); `fn_assign_experiment_arms_for_cohort` (**SECURITY INVOKER**, deterministic 50/50 via hashtextextended, idempotent) + `fn_compute_cohort_experiment` (**SECURITY INVOKER**, upserts the row, causal_lift NULL unless both arms present). **(3) `20260731094000_cohort_feedforward.sql` (M7.3 · M3/M5/M7):** NEW table `public.cohort_adjustment_proposals` (based_on_cohort_id, target_scope='program', target_id→sf100_programs, causal_lift, decision adopt/revert/inconclusive, proposed_changes jsonb, status pending/approved/rejected/applied, reviewed/applied audit cols, institution_id NOT NULL; **partial unique** one pending proposal/cohort; updated_at trigger). `fn_propose_cohort_adjustments` (**SECURITY INVOKER**; **M5 gate** = only a CLOSED cohort with a non-NULL causal_lift; emits a PENDING proposal promoting `config.experiment.treatment_params` when causal_lift ≥ `fn_cohort_min_actionable_lift()`=0.02, else revert/inconclusive; NEVER mutates the program). `fn_apply_cohort_adjustment_proposal` (**SECURITY DEFINER** — must UPDATE sf100_programs even without a direct program grant; **internal authority gate bound to the PROPOSAL's own institution_id**, `auth.uid() IS NULL`=trusted service context [anon revoked]; **M7 gate** = hard-requires status='approved'; whitelists paid_user_target_delta/hard_deadline_shift_days/min_transaction_amount_delta; marks 'applied'). **(4) `20260731095000_cohort_alumni_mentor.sql` (M7.4 flywheel):** `v_cohort_alumni_mentor_pool` (**security_invoker** VIEW over graduated memberships → eligible mentors; enrol via `CohortService.createMembership(member_type=staff, role=mentor)`, NOT a new DEFINER RPC). **All new fns REVOKE EXECUTE FROM anon, PUBLIC.** **CERTIFICATION (7.5):** a seeded 2-cycle sim (2 control + 2 treatment teams, known deltas) proved control_lift=0.400, treatment_lift=0.833, **causal_lift=0.433 < naive_lift=0.617** (control removed 0.183 of regression-to-mean), decision=adopt, **M7 blocked an un-approved apply**, program target 5→6 (loop closed — cycle N+1 faces the adjusted target), alumni pool=4, **M5 blocked an open-cohort proposer**, arms split 50/50 — then ROLLED BACK (prod untouched, verified). Mirrored into `setup/{01_tables,03_policies,04_triggers,05_views}.sql`; the 7 fns stay migration-authoritative with a pointer in `02_functions.sql`. Reuses the 4 existing `cohort.*` permission keys. TS: services `lib/services/cohort-core/{experiment-service,feedforward-service,alumni-mentor-service}.ts`; hooks `hooks/cohort-core/useMoat.ts` (local `moatKeys`); types appended to `lib/types/cohort-core.ts`. Admin approval UI = documented follow-up. Plan: `docs/cohort-core/PLAN.md`.

- **2026-07-05** — **Cohort Core** M2 **outcome-capture-at-close** (PLAN.md Phase 7 · THE MOAT · **NOT yet applied to prod** — PR-staged in `feat/cohort-moat-m2-outcome-capture`). Migration `20260731091000_cohort_outcome_capture.sql` — **ADDITIVE, IDEMPOTENT, DROPS-NOTHING, NO BACKFILL** (TIER-1). NEW table `public.cohort_outcomes` (`id`, `cohort_id`→cohorts ON DELETE CASCADE, `membership_id`→cohort_memberships **ON DELETE SET NULL** [a LINK, not identity — the baseline survives a membership delete and can never be re-captured], `member_ref` [denormalized identity], `member_type` CHECK team/student/learner/staff, `kind` CHECK sf100/foundations/cdc/trainer, `captured_at`, `outcome_snapshot jsonb`, `source` CHECK trigger/service/backfill/manual, `institution_id` **NOT NULL**→institutions, `created_at`) + 4 indexes + **partial unique** `uidx_cohort_outcomes_membership (membership_id) WHERE membership_id IS NOT NULL` (one baseline per membership — a membership closes exactly once). **Capture mechanism = a DATABASE TRIGGER, not a service call** (PLAN M2: a baseline can't be reconstructed later, so it must be captured no matter which code path performs the close): `fn_capture_cohort_outcome()` (SECURITY DEFINER, `SET search_path=public`, **REVOKE EXECUTE FROM anon, PUBLIC** — invoked only by its trigger, no GRANT needed) + `AFTER UPDATE OF status ON cohort_memberships` trigger `trg_cohort_capture_outcome` with a `WHEN (NEW.status IN ('graduated','removed') AND OLD.status IS DISTINCT FROM NEW.status)` prefilter. Fires only on the transition INTO a terminal status FROM a non-terminal one (3 in-fn guards); snapshots `from/to_status` + role + joined_at + membership config; copies `institution_id`+`kind` from the parent cohort (SKIPS with a `RAISE NOTICE` — never writes a NULL-institution row — if the cohort is tenant-less, closing the `role_has_institution_access(NULL)=TRUE` leak); `ON CONFLICT (membership_id) … DO NOTHING` = idempotent per membership. **RLS** canonical dynamic-permission: SELECT→`cohort.view`+`role_has_institution_access(institution_id)`; INSERT→`cohort.manage`+scope (manual/service capture; the DEFINER trigger bypasses RLS); UPDATE/DELETE **admin-only** (a captured baseline is a tamper-resistant moat record, mirroring `cohort_status_events`). **NO backfill** — already-terminal memberships closed pre-trigger legitimately have no baseline; a `RAISE NOTICE` records the deliberate no-op. `NOTIFY pgrst`. Mirrored into `setup/{01_tables,03_policies,04_triggers}.sql`. Reuses the 4 existing `cohort.*` permission keys (no new key). Read/write service `lib/services/cohort-core/outcome-service.ts` (`CohortOutcomeService` — getOutcomes/getOutcome/getOutcomesByCohort/getOutcomeByMembership + `recordOutcome` manual escape-hatch, RLS-denial→clean 403); hooks `hooks/cohort-core/useCohortOutcomes.ts` (local `cohortOutcomeKeys`). Plan: `docs/cohort-core/PLAN.md`.

- **2026-07-06** — **Cohort Core** **CDC Training demote to extension** (PLAN.md **Phase 4** · kind='cdc'; **NOT yet applied to prod** — PR-staged in `feat/cohort-cdc-demote`). Migration `20260731090000_cdc_training_demote_to_cohort_core.sql` — **ADDITIVE, IDEMPOTENT, DROPS-NOTHING** (TIER-1). Registers the CDC Training container into the canonical cohort spine as an **additive MIRROR** (`public.cohorts` kind='cdc', mapped 1:1 via `cohorts.config->>'cdc_training_programme_id'`) and demotes `cdc_training_enrollments` to a per-learner **extension** via ONE nullable link column `cdc_training_enrollments.cohort_membership_id uuid` → `cohort_memberships(id)` **ON DELETE SET NULL** (a LINK, not identity — never cascade-delete the live extension row that owns attendance/certificate/semester-schedule). **Greenfield** (verified prod: `cdc_training_enrollments`=0 rows, `cdc_training_programmes`=1 row) → **NO backfill** (a `RAISE NOTICE` records the empty state instead of the SF100-style populate/abort); the spine is minted **forward** by the service on first enrol. **L3 race guard:** partial unique index `uq_cohorts_cdc_training_programme ON public.cohorts((config->>'cdc_training_programme_id')) WHERE kind='cdc'`. **3 idempotency guards:** `ADD COLUMN IF NOT EXISTS`; FK guarded on `pg_constraint` inside a `DO` block (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`); indexes `IF NOT EXISTS`. `NOTIFY pgrst`. Mirrored as a guarded ALTER (`DO`/`pg_constraint`) + the two indexes into `setup/01_tables.sql` (CDC DDL is migration-only, like SF100). **member identity = `member_type='learner'`, `member_ref = learner_id`** — the enrollment FK is `learner_id → learners_profiles(id)`, so 'learner' is the exact real identity (the shared `cohort_memberships.member_type` CHECK allows `team/student/learner/staff` but **not** 'trainee', so no shared-constraint change). **Repoint (code, no migration):** `lib/services/cdc/training-service.ts::addEnrollment` gains a **best-effort spine twin** (`try/catch`, log-and-continue — the extension roster stays authoritative): lazy-mint helper `ensureCdcCohortMirror` (institution_id copied FROM the programme container so `role_has_institution_access(NULL)` can never leak; **skips the mirror when the programme's institution_id is NULL** since `cohorts.institution_id` is NOT NULL; L3 = re-select on lookup error, re-select the winner on INSERT 23505), upserts a `cohort_memberships` row (**L4 status fold** `foldCdcMembershipStatus`: enrolled→enrolled, in_progress→active, completed→graduated, dropped→removed — never hardcoded), back-links the enrollment, appends a `cohort_status_events` audit row. **L5 clean wraps:** `app/api/cdc/training/{route,[id]/route,[id]/enrollments/route}.ts` now map RLS denial (42501)→**403**, FK miss (23503)→**400**, dup (23505)→**409** instead of a masked 500. `types/cdc/training.ts` adds the nullable `cohort_membership_id`. **No self-serve carve-out policy** (03_policies untouched): CDC enrolment is **staff-driven** (an admin enrols a learner; `member_ref = learner_id ≠ auth.uid()`, and the programme has no self-join mode field), so — unlike Foundations — there is no `member_ref=auth.uid()` self-insert path; the best-effort twin rides the existing `cohort_memberships_insert_permission` policy (`cohort.create` + institution access). Plan: `docs/cohort-core/PLAN.md`.

- **2026-07-06** — **Cohort Core** **Foundations demote to cohort core** (PLAN.md **Phase 3** · **D5** completion · **D9** identity; **NOT yet applied to prod** — PR-staged in `feat/cohort-foundations`). Migration `20260731080000_foundations_demote_to_cohort_core.sql` — **ADDITIVE, IDEMPOTENT, DROPS-NOTHING** (TIER-1 shape, effectively additive-only: `ss_foundations_cohorts` + `ss_foundations_enrollments` are BOTH **0 rows**). Folds Startup-Studio Foundations onto the shared spine: `public.cohorts` (kind='foundations') is the canonical SPINE container for roster+lifecycle and `public.cohort_memberships` (member_type='student', **member_ref = student's profiles.id**) its roster; `ss_foundations_enrollments` is demoted to a per-student **extension** via ONE nullable link column `cohort_membership_id uuid` → `cohort_memberships(id)` **ON DELETE SET NULL** (a LINK, not identity), FK guarded on `pg_constraint`, reverse index `idx_ssf_enroll_cohort_membership`. **Empty-table simplification vs SF100:** NO backfill (…050000-style), NO populate `UPDATE`, NO abort self-check — replaced by a `RAISE NOTICE`; future rows link FORWARD at enroll-time in the service. **`ss_foundations_cohorts` is NOT dropped or re-keyed** (gotcha #2 — largest blast radius): `ss_foundations_worksheets.cohort_id` + `ss_foundations_responses.cohort_id` FK it and the listWorksheets override mechanism keys off it, so it stays the authoritative DOMAIN container while the service mints a `cohorts` MIRROR per ss cohort (mapped via `config->>'ss_foundations_cohort_id'`, `institution_id` copied — closes the `role_has_institution_access(NULL)` tenant hole; `enrollment_mode`/`lead_mentor_id` go to `cohorts.config` — lead_mentor_id is an `ss_mentors(id)`, NOT `owner_id`). **D9 CHECK** `ss_foundations_enrollments_student_required` = `CHECK (student_id IS NOT NULL)` (guarded on `pg_constraint`; the real member_ref==student_id equality is service-enforced — member_ref is polymorphic). **Self-enrol RLS carve-out (gotcha #1):** new permissive INSERT policy `cohort_memberships_foundations_self_insert` on `cohort_memberships` (`member_type='student' AND member_ref=(select auth.uid()) AND status IN (invited/enrolled/active) AND parent cohort kind='foundations'`) — the self-enrol POST runs AS THE STUDENT (never service-role) and would 403 the membership half without it; graduation stays mentor-gated. `NOTIFY pgrst`. Mirrored as a guarded ALTER into `setup/01_tables.sql` and the carve-out policy into `setup/03_policies.sql`. **Code (no migration):** `lib/services/startup-studio/foundations-service.ts` — additive spine twin: `ensureFoundationsCohortMirror`, `createCohort` mints the mirror, `enroll` gets a **D9 profile-resolve guard (clean 400)** + best-effort membership upsert + back-link + 'enrolled' event, `withdraw` best-effort membership→'removed', new `signOffGraduation` (**D5** — asserts global completion ≥ threshold, marks enrollment `completed`, best-effort membership→'graduated' + event, notifies). Routes: facilitator-add + self-enrol wrap the D9 400; new `POST …/foundations/enrollments/[id]/complete` (gated `startup_studio.foundations.review`). Container reads (`listCohorts`/`getCohort`) + `getMyEnrollments` + roster (`listEnrollments`) stay on `ss_foundations_*` (authoritative; UI signatures unchanged). Plan: `docs/cohort-core/PLAN.md`.
- **2026-07-06** — **Cohort Core** SF100 roster **profile-required** guard (PLAN.md decision **D9** · **NOT yet applied to prod** — PR-staged in `feat/sf100-full-migration`, added to **PR #1814**). Migration `20260731070000_sf100_roster_profile_required.sql` — **ADDITIVE, IDEMPOTENT, DROPS-NOTHING**. Adds ONE CHECK constraint `sf100_roster_changes_identity_required` = `CHECK (profile_id IS NOT NULL OR learner_id IS NOT NULL)` so every roster member resolves to a real MyJKKN identity (`profiles` or `learners_profiles`) — **no free-text-only members** (email/full_name stay a display cache). Idempotency: Postgres has no `ADD CONSTRAINT IF NOT EXISTS` → guarded on `pg_constraint` inside a `DO` block. Safe: `sf100_roster_changes` has **0 rows** today. `NOTIFY pgrst`. **Constraint made safe by fixing the sole write path FIRST** (research found `SF100Service.requestRosterChange` was designed to insert email-only rows with both identity links NULL — the live `'remove'` and external-`'add'` cases): `lib/services/startup-studio/sf100-service.ts::requestRosterChange` now RESOLVES identity in priority order (explicit DTO `profile_id`/`learner_id` → the matching `event_team_members` row's `profile_id`/`learner_id` → a directory lookup by email against `profiles.email` then `learners_profiles.student_email`/`college_email`) and REJECTS (throws `.status=400`) when nothing resolves; the API route `app/api/startup-studio/solve-for-100/enrollments/[enrollmentId]/roster-changes/route.ts` now wraps the call and surfaces that as a clean **400** (not a masked 500). No signature changes. Mirrored as a guarded ALTER (`DO`/`pg_constraint`) into `setup/01_tables.sql` (SF100 DDL is migration-only, like CDC). Generic cohort-engine picker/validation (`cohort-service` member-add + directory picker UI) remains **Phase 6**. Plan: `docs/cohort-core/PLAN.md`.
- **2026-07-05** — **Cohort Core** SF100 **demote to extension** (PLAN.md Phase 2.3 · FULL MIGRATION; **NOT yet applied to prod** — PR-staged in `feat/sf100-full-migration`, HELD for Director sign-off). Migration `20260731060000_sf100_demote_to_extension.sql` — **NON-DESTRUCTIVE, IDEMPOTENT, DROPS-NOTHING** (TIER-1). Makes `public.cohorts`/`public.cohort_memberships` the **canonical** SF100 spine and demotes `sf100_enrollments` to an SF100 per-team **extension** via ONE nullable link column `sf100_enrollments.cohort_membership_id uuid` → `cohort_memberships(id)` **ON DELETE SET NULL** (a LINK, not identity — deleting a membership must never cascade-delete the live extension row). **Link-column, NOT a re-key:** all 10 SF100 extension tables keep FK-ing to `sf100_enrollments.id` unchanged; cohort-core is reached in one hop (enrollment → cohort_membership_id → membership → cohort). **3 idempotency guards** (each DDL form needs its own): `ADD COLUMN IF NOT EXISTS`; FK guarded on `pg_constraint` inside a `DO` block (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`); index `IF NOT EXISTS`; the populate `UPDATE` uses `IS DISTINCT FROM m.id` (2nd apply matches 0 rows). **Populate** joins the membership through its parent cohort (`kind='sf100'` AND `member_type='team'` AND `member_ref = e.id`) — scoping by kind+type (+ the backfill's `UNIQUE(cohort_id,member_type,member_ref)`) guarantees exactly one deterministic match per enrollment. Self-check `DO` block **RAISE NOTICE (not EXCEPTION)** on any still-NULL rows (a backfill-skipped NULL-institution program legitimately stays NULL → must not abort). **NOT NULL DEFERRED** (column populated by the UPDATE + skipped programs stay NULL); **DROPs DEFERRED** (sf100_programs/enrollments kept, `program_id` FK intact as a bridge). `NOTIFY pgrst`. Mirrored as a guarded ALTER into `setup/01_tables.sql` (SF100 DDL is migration-only, like CDC, so folded as ALTER not a column list). **Repoint (code, no migration):** `lib/services/startup-studio/sf100-service.ts` (roster reads resolve the cohort → cohort_memberships and join `sf100_enrollments` by `member_ref`, with a **legacy `program_id` fallback** so code is safe to deploy before the migration is applied; program config fields `max_internal_user_pct`/`stall_*_days`/`source_event_id` read from `cohorts.config` with fallback to the still-live `sf100_programs` columns; `enrollTeam` write-side twin mirrors a `cohort_memberships` row + sets the link), `pipeline-service.ts`, `app/api/startup-studio/solve-for-100/{leaderboard,leaderboard/stats,programs/[programId]/seed-from-declarations}/route.ts`. Plan: `docs/cohort-core/PLAN.md`.
- **2026-07-05** — **Cohort Core** SF100 backfill (PLAN.md Phase 2.2; decision D3; **NOT yet applied to prod** — PR-staged in `feat/cohort-core`, HELD for Director sign-off — first phase touching LIVE SF100 data). Migration `20260731050000_cohort_core_sf100_backfill.sql` — **COPY-ONLY, NON-DESTRUCTIVE, IDEMPOTENT** (TIER-1 data backfill). Copies the 1 live SF100 program → `public.cohorts` (kind='sf100') and its 18 team enrollments → `public.cohort_memberships` (member_type='team', member_ref = the enrollment's own id). **No cutover** — runs NO UPDATE/DELETE on any `sf100_*` table; `sf100_*` remain the live source of truth (D3 = keep old as backup; SF100 services/hooks NOT repointed here — that is Phase 2.3). **Status remaps:** program `enrollment_open`→`enrolling` (rest pass through); enrollment `warning`/`probation`→`active`, `withdrawn`→`removed` (the ORIGINAL sf100 status is preserved in `config.sf100_status` so the folded stall-state + withdrawn-vs-removed distinction survive). **DATE→timestamptz** cast at IST boundaries (opens_at = start-of-day IST; closes_at/hard_deadline = end-of-day IST, deadline-inclusive). All SF100-only fields (metrics, seed_*, phase, stall config, started/completed_at) stashed in JSONB `config`; source `created_at`/`updated_at` copied (true history, not `now()`). **Idempotency:** cohorts has no natural unique key → `WHERE NOT EXISTS … config->>'sf100_program_id' = p.id` guard; memberships → `ON CONFLICT (cohort_id,member_type,member_ref) DO NOTHING`. Writes a D2 `config.rules` block (`defaultRuleConfigForKind('sf100')` = full lifecycle: inactivity 7/14, escalation 3bd, grace 30d). Self-check `DO` block RAISEs if any in-tenant program/enrollment stays unmapped. `NOTIFY pgrst`. **Reversible:** delete only the inserted `cohorts`/`cohort_memberships` rows (config-tagged). **Engine additions (no migration):** `lib/types/cohort-core.ts` (`CohortRuleConfig`, `CohortCloseStatus`, `TransferMembershipDto`, `CloseCohortDto`); `lib/services/cohort-core/lifecycle.ts` (`defaultRuleConfigForKind`, `isRuleEnabled`, `membershipCloseStatus`, `isTerminalMembershipStatus`); `cohort-service.ts` (`transferMembership` D8, `closeCohort` D7); `hooks/cohort-core/index.ts` (`useTransferMembership`, `useCloseCohort`). Plan: `docs/cohort-core/PLAN.md`.
- **2026-07-05** — **Cohort Core** shared cohort spine (PLAN.md Phase 1; **NOT yet applied to prod** — PR-staged in `feat/cohort-core`). Migration `20260731040000_cohort_core_spine.sql` (additive + idempotent): **3 tables** — `cohorts` (container: `kind` CHECK sf100/foundations/cdc/trainer, `institution_id` **NOT NULL** → `public.institutions(id)`, `status` CHECK draft→enrolling→active→completed→archived, `config jsonb`, archive/owner/created_by cols), `cohort_memberships` (`member_type` CHECK team/student/learner/staff, `member_ref`, `status` CHECK invited→enrolled→active→graduated|removed|paused, UNIQUE(cohort_id,member_type,member_ref)), `cohort_status_events` (append-only audit powering nudge→pause / escalate-after-3-business-days / 30-day grace). **6 indexes**, **updated_at triggers** on cohorts + cohort_memberships (reuse `public.update_updated_at_column()`; events append-only). **RLS** canonical dynamic-permission on all 3 (`is_super_admin() OR is_admin()` first, then `user_has_permission('cohort.<verb>')` + `role_has_institution_access`, SECDEF calls wrapped `(select fn(...))` for InitPlan caching; memberships/events scope through parent cohort via EXISTS; DELETE gated on `cohort.manage`; events UPDATE/DELETE admin-only). No new RPCs (spine is client-service driven). `NOTIFY pgrst`. Mirrored into `setup/{01_tables,03_policies,04_triggers}.sql`. New permission category **Cohort Core** (`cohort.view/create/edit/manage`) in `lib/constants/permissions.ts`. Types `lib/types/cohort-core.ts`; service `lib/services/cohort-core/{cohort-service,lifecycle}.ts`; hooks `hooks/cohort-core/index.ts`; query-keys `cohortKeys`. Plan: `docs/cohort-core/PLAN.md`.
- **2026-07-04** — CDC **Government-Job-Readiness track** (TNPSC/RRB/banking/SSC/TN-Police) — additive + idempotent, **NOT yet applied to prod** (draft PR pending Director review). CDC's canonical DDL lives entirely in `supabase/migrations/*` (zero `cdc_*` tables in `supabase/setup/*`), so these 3 dated migrations are the canonical source; not folded into `setup/01_tables.sql` (would orphan FKs). (1) `20260704090000_cdc_govt_jobs_readiness_content_and_columns.sql` — `ALTER TABLE cdc_training_types ADD COLUMN IF NOT EXISTS exam_family text NULL` (config-key tag; NULL=not a govt-exam type, all existing rows unchanged); `ALTER TABLE cdc_training_programmes ADD COLUMN IF NOT EXISTS shared_syllabus_pct numeric NULL` + `domain_topics text NULL` (Option A labels, purely descriptive); seeds **7 govt-exam `cdc_training_types` rows** across 5 exam_family tags (tnpsc/rrb/banking/ssc/police) `ON CONFLICT (config_key) DO NOTHING`; seeds **5 starter government-scholarship `cdc_external_opportunities` rows** (`category='scholarship'`, deadlines/URLs are placeholders pending CDC verification). (2) `20260704090100_cdc_exam_syllabus_topics.sql` — **NEW config-master `cdc_exam_syllabus_topics`** (`config_key UNIQUE, display_name, description, is_shared boolean, is_system, is_active, sort_order, …` — shape mirrors `cdc_offer_types` + one flag) and **NEW light junction `cdc_exam_topic_map`** (`exam_training_type_id → cdc_training_types ON DELETE CASCADE`, `topic_id → cdc_exam_syllabus_topics ON DELETE CASCADE`, `sort_order`, UNIQUE(exam_training_type_id, topic_id)); `_touch_updated_at` triggers; seeds 14 topics (8 shared / 6 domain) + a data-driven topic↔exam map (shared topics → every govt-exam type; domain topics → selected exams). RLS on both: authenticated read (`auth.uid() IS NOT NULL`), write `is_cdc_head_or_super()` — mirrors the CDC master pattern; platform-global (no institution_id). **No 60/40 hardcoded** — the shared/domain split is derived at read time from `is_shared`. (3) `20260704090200_cdc_govt_readiness_permission_backfill.sql` — backfills new `cdc.govt_readiness.view` key onto `cdc_head` + `cdc_coordinator` (`permissions || jsonb_build_object(...)`, the "declare key without grant → empty UI" gotcha). Registered `cdc_exam_syllabus_topics` in `ALLOWED_MASTER_TABLES` + `CdcMasterTable`. Admin master page `/cdc/admin/exam-syllabus-topics`; cohort-overlap view + hub `/cdc/govt-readiness`; sidebar entry; career-guidance prompt/signal enrichment. Spec: `specs/cdc-govt-jobs-readiness-2026-07-04.md`.
- **2026-07-04** — Department Instagram **Monthly Cadence** engine (ships DARK). Migration `20260704120000_social_monthly_cadence.sql` (additive + idempotent, NOT yet applied to prod — pending Director review). **Rides the LIVE Projects/RACI substrate** (OKR was absorbed into Projects, locked 2026-05-31 — the legacy `okr_objectives` table does NOT exist in prod, so there is NO `ALTER TYPE okr_cycle_type` and NO `okr_objectives` insert/FK): (1) NEW ledger table `social_monthly_cadence` — one row per (account_id, cadence_month) holding the objective→baseline→feedback→action→re-measure→close state machine; reach columns are SNAPSHOTS from `ig_monthly_audit` (never re-aggregated), feedback snapshot from `feedback_events`; **`project_id` is REQUIRED → `projects(id)`** (the unified-OKR objective is a real `projects` row, `is_okr=true`, `project_type='okr_objective'`, `owner_staff_id`=the dept HOD); UNIQUE(account_id, cadence_month) + 5 indexes + updated_at trigger; (2) canonical dynamic-permission RLS (`is_super_admin() OR is_admin() OR (user_has_permission('social.departments.view'/'.manage') AND role_has_institution_access(institution_id))`), anon revoked; (3) 4 SECURITY DEFINER RPCs — `fn_ig_monthly_reach(uuid,date)` (STABLE reader over ig_monthly_audit), `fn_social_cadence_open(uuid,text,date)` (snapshots baseline + creates a real `projects` row + a `key_result` `project_task` with the HOD assigned RACI **Accountable** via `project_task_assignees.role`, resolving HOD via `staff.profile_id = departments.head_of_department_id`; idempotent per account+month), `fn_social_cadence_record_action(uuid,text,jsonb)`, `fn_social_cadence_close(uuid,text)` (re-measure + metrics_source guard→`unmeasurable`; **teeth**: sets the linked `projects.rag_status` green/amber/red vs the win threshold so the DORMANT `project_at_risk` auto-accountability rule would summon the HOD) — all self-gate (DEFINER bypasses RLS) and end `REVOKE anon,PUBLIC; GRANT authenticated`; (4) seeds 4 `social.cadence.*` policy rows into `platform_policies` (**`social.cadence.enabled=false`** ships DARK, `clock_mode='calendar_month'`, `period_days=30`, `win_delta_pct=10`); (5) merges `social.departments.view`+`.manage` into the scope='own' HOD role (Director-locked owner). Mirrored into `setup/{01_tables,02_functions,03_policies}.sql`. New cron `/api/cron/social-monthly-cadence` (`0 7 1 * *`, after the audit) STAGES elapsed open cycles to `awaiting_close` AND sets the linked project RAG (the same teeth). UI: monthly section on `/admission/social/loop` (`_components/cadence-card.tsx`); the objective auto-appears on the LIVE `/projects` surface as an `is_okr` project (the dead `/okr/department` surface — which reads the dropped `okr_objectives` — is NOT used). Auto-meeting rules stay DORMANT. Spec: `specs/dept-ig-monthly-cadence-2026-07-04.md`. **Deep-review hardening (PR #1781, 2026-07-04):** `project_id` FK is now **`ON DELETE RESTRICT`** (was CASCADE — preserve ledger history) + an idempotent constraint-converge; NEW BEFORE-UPDATE trigger `trg_social_monthly_cadence_project_immutable` makes `project_id` immutable post-insert (blocks raw-PostgREST repointing of the teeth); NEW helper `fn_social_caller_owns_dept(uuid)` (5th DEFINER fn) — all 3 writer RPCs now add a **department-ownership** gate so a scope='own' HOD cannot act on another dept's account; `fn_social_cadence_open` now **self-gates DARK** via `fn_get_policy_bool('social.cadence.enabled')` AND validates any supplied `p_project_id` is an `is_okr` project **in the account's institution** (cross-tenant write fix); `fn_social_cadence_close` + the cron now **re-assert `projects.institution_id = cadence.institution_id`** on every RAG write (DEFINER/service-role tenant guard), the metrics_source guard treats ANY graph⇄business_discovery/NULL mismatch as `unmeasurable` (was only the downgrade), the close UPDATE carries a TOCTOU `status NOT IN ('closed','unmeasurable')` predicate, and the cron skips the project-RAG write when 0 cadence rows staged. **Round-3 hardening (PR #1781, closes both round-2 HIGHs at the root):** the ledger is now **RPC-WRITE-ONLY** — `authenticated` holds **SELECT only** (`REVOKE INSERT,UPDATE,DELETE`; the INSERT/UPDATE RLS policies are dropped), so a raw PostgREST write can no longer bypass the DEFINER guards to point `project_id` at a victim project; `fn_social_cadence_open` **no longer accepts a caller-supplied `project_id`** (the old 4-arg overload is dropped) — open **always** auto-creates its own `is_okr` objective, removing the cross-tenant vector entirely; `fn_social_cadence_close` now **self-gates DARK** too (not just open); the SELECT policy adds **`fn_social_caller_owns_dept(department_id)`** so a scope='own' HOD reads only its own dept's rows; open is **atomic** (advisory xact-lock + `INSERT … ON CONFLICT (account_id,cadence_month) DO NOTHING` + re-select, no raw unique_violation), derives `cadence_month` from **UTC**; `fn_social_caller_owns_dept` is restricted to **`departments.head_of_department_id` only** (dropped the any-active-staff branch); the HOD→staff resolution adds **`s.institution_id = v_institution_id`** (no cross-tenant owner); an **`unmeasurable`** close now **RESETS** the project RAG to green/0% (undoes any cron-fabricated green/red); and `percent_complete` is written on **both** the cron and `close` (never one without the other).

- **2026-07-03** — SCF learner-notes **approval queue**. Migration `20260703091300_scf_learner_notes_approval.sql`: (A) `scf_learner_notes` gains `status text NOT NULL DEFAULT 'approved' CHECK (status IN ('draft','approved','rejected'))` (default 'approved' so pre-queue rows already seen by students stay visible), `approved_by uuid REFERENCES auth.users(id)`, `approved_at timestamptz`, + index `ix_scf_learner_notes_status`; (B) `fn_scf_my_struggling_note` — CREATE OR REPLACE adding `AND n.status='approved'` (learners only ever see approved notes; this RPC is the ONLY student read surface — the table is RLS-enabled with no policies, deny-all direct access); (C) `fn_scf_struggling_notes_sent` — CREATE OR REPLACE adding `AND n.status='approved'` ("sent" = learner-visible; drafts no longer counted); (D) NEW `fn_scf_learner_notes_pending()` RETURNS SETOF scf_learner_notes — `is_super_admin()` gate, status='draft' ordered by week_of DESC/created_at ASC (full rows incl. note text — the review is real); (E) NEW `fn_scf_learner_notes_review(p_ids uuid[], p_action text)` RETURNS jsonb — `is_super_admin()` gate, p_action IN ('approve','reject'), bulk UPDATE `WHERE id = ANY(p_ids) AND status='draft'` setting status + approved_by=auth.uid() + approved_at=now(), returns `{ok, action, updated_count}`. All fns SECURITY DEFINER + SET search_path=public + `REVOKE FROM anon, PUBLIC; GRANT TO authenticated`. Cron `app/api/cron/scf-learner-notes` now writes `status:'draft'`; super-admin UI at `/admin/learner-notes`.

- **2026-06-30** — Schools Network module **DB substrate** (Agent A of the 4-stream parallel build). Migration `20260630120000_schools_network_substrate.sql` (additive + idempotent, applied to prod project `kvizhngldtiuufknvehv`). Adds: **5 enum types** (`school_ownership`, `school_status`, `school_owner_role`, `school_contribution_kind`, `program_partner_status`); **3 master tables** seeded (`school_session_types`×5, `program_partner_types`×4, `school_contact_roles`×4); **7 core entity tables** (`program_partners`, `schools`, `school_contacts`, `school_jkkn_owners`, `school_sessions`, `school_contributions`, `program_partner_grants`); **3 helper fns** (`user_owns_school`, `user_leads_partner_for_school`, `is_school_portal_user_for`); **11 service RPCs** (`fn_schools_list`, `fn_school_detail`, `fn_school_session_record`, `fn_school_contribution_record`, `fn_school_assign_owner`, `fn_school_revoke_owner`, `fn_program_partner_rollup`, `fn_schools_silence_candidates`, `fn_schools_recompute_status` [STUB pending Director thresholds], `fn_school_portal_self`, `fn_school_portal_submit_update`); **30 RLS policies** (canonical `is_super_admin() OR is_admin() OR (user_has_permission('schools_network.X') AND school-scope helper)`); **2 system roles** (`outreach_coordinator` scope='own', `program_lead` scope='own'). All RPCs follow the post-2026-06-06 rule: `REVOKE EXECUTE FROM anon, PUBLIC; GRANT TO authenticated`. Anon also locked out of every new table. NOTIFY pgrst, 'reload schema'. Spec: `/tmp/schools-network-spec.md`.

- **2026-06-28** — SCF Self-Improving Loop hardening. Migration `20260628010000_scf_loop_hardening.sql`: (A) `ADD COLUMN IF NOT EXISTS section_id uuid` on `scf_ai_suggestions`; (B) `fn_scf_record_suggestion` — DROP+CREATE with new trailing `p_section_id uuid DEFAULT NULL`, ON CONFLICT idempotent upsert on unique index `idx_scf_ai_suggestions_dedupe` (grain: institution_id+course_code+COALESCE(faculty_email,'')+window_from+window_to+domain); (C) `fn_scf_measure_suggestion_outcomes` — carry institution_id/section_id into candidates CTE, fix NULL-faculty lane predicate, add cross-tenant guard, recompute baseline inside fn with >=3-floor estimator; (D) `fn_scf_prior_suggestion` — DROP+CREATE adding `outcome_responses int` + `input_responses int` to RETURNS TABLE; (E) NEW `fn_scf_set_verdict(uuid,text)` write path for `human_verdict` (faculty self-verdict + leadership/admin gate); (F) `fn_scf_ai_signal` — add `HAVING count(*) >= 3` floor. All SECURITY DEFINER + REVOKE anon/PUBLIC + GRANT authenticated.

- **2026-06-23** — Social Governance control-plane **config substrate** (applied to prod 2026-06-18 with PR #1494; indexed here with the nav-wiring follow-up). Migration `20260712000000_social_governance_config_substrate.sql` is additive-only + idempotent (seeds rows + `ADD COLUMN IF NOT EXISTS`, no drops). It (1) seeds **7 `social.*` rows** into the canonical `platform_policies` store (read at runtime via `fn_get_policy_*`, never raw SELECT): `social.dormancy_threshold_days`(60), `social.compliance_min_followers`(150), `social.compliance_min_posts`(12), `social.followback_ratio_threshold`("0.7"), `social.realtime_enabled`(false), `social.digest_top_n`(5), `social.digest_categories` — all `is_system=true` GLOBAL so the super-admin policy editor renders them (label from `description`, editor from `data_type`); and (2) extends `social_dept_accounts` (from `20260610100000_social_dept_accounts_registry`) with **3 columns**: `lifecycle_status` (TEXT NOT NULL DEFAULT 'provisional' + idempotent CHECK), `accountable_owner_id` (UUID), `posting_cadence_days` (INT). Drives `/admission/social/governance` (director's-view) + `/admission/social/admin/policies` (super-admin editor).
- **2026-06-23** — Choose Your Menu **Mode C (special-day / festival picker)** RPCs. Migration `20260623001000_mess_choose_mode_c_special_day_rpcs.sql` adds 5 SECURITY DEFINER functions on the existing `mess_special_day_proposals` substrate (no new tables): `fn_mess_special_day_can_propose()` (role gate), `fn_mess_special_day_propose(date,meal,tier,gender,uuid[],text)` (proposer-role-gated create, re-checks master + `special_day.enabled` at call time), `fn_mess_special_day_approve(uuid)` (ADMIN/menu.publish — sets status, marks the matching `mess_menus` cell `is_special_day` + appends festival dishes, and confers `proposal_approved` recognition on every resident who upvoted a dish via Mode B `mess_dish_votes`; idempotent per learner+proposal), `fn_mess_special_day_reject(uuid)`, and `fn_mess_special_day_list(text,bool)` (admin queue + resident "coming up"). All `REVOKE EXECUTE FROM anon, PUBLIC; GRANT TO authenticated`. Ships dark (`mess.choose.master_enabled=false`).

- **2026-06-22** — Choose Your Menu **Mode B (menu voting / wishlist)** RPCs. Migration `20260622234500_mess_choose_mode_b_vote_rpcs.sql` adds 4 SECURITY DEFINER functions on the existing P0 substrate (`mess_dish_votes` table + `campus_living_recognition` stream — no new tables): `fn_mess_choose_cast_vote(uuid,int)` + `fn_mess_choose_clear_vote(uuid)` (resident thumbs ±1, master+voting-tier re-checked at call time), `fn_mess_choose_votable_dishes(text,int)` (library + live tally + caller's own vote, searchable), and `fn_mess_choose_recognize_voted_dish(uuid,date)` (ADMIN/menu.publish return-arc — confers `vote_landed` recognition on every upvoter, but ONLY if the dish is verifiably on a `mess_menus` cell that week; idempotent per learner+item+week). All `REVOKE EXECUTE FROM anon, PUBLIC; GRANT TO authenticated`. Ships dark (`mess.choose.master_enabled=false`).

- **2026-07-10** — Fixed pgcrypto search_path bug in 4 SECURITY DEFINER fns (5 instances incl. both `generate_api_key` overloads): `ALTER FUNCTION ... SET search_path = public, extensions` on `create_api_key`, `generate_api_key()`, `generate_api_key(integer)`, `create_staff_auth_profile`, `bulk_sync_applications_to_auth_server` — they call pgcrypto primitives in the `extensions` schema and were failing at runtime with 42883. Migration `20260710120000_fix_sibling_pgcrypto_search_path.sql` (idempotent; body unchanged).

- **2026-05-02** — IMS permission-system audit: full RLS resolution (Part 2 — bugs #1, #2, #3, #5, #6, #7, #8, #9, #10)
  - Continuation of the morning's granular-overrides session (Part 1 below). The `rls-fixer` agent in team `ims-permission-resolve` resolved the remaining 10 RLS/scope bugs flagged by the `scope-reviewer` and `rls-reviewer` audits. All listed open follow-ups from Part 1 are now closed except the deferred UI-layer concerns.
  - **`03_policies.sql` edit #3 (helper-call corrections)**: the `pg_temp.ims_apply_*` helpers in the main IMS RLS block assume every table has an `institution_id` column. Several tables don't — re-running the file on a fresh DB would have crashed or generated globally-permissive policies that regress live state. Replaced helper calls for 7 tables (lines ~5575, 5587-5590, 5595-5597, 5610-5612) with explicit pointers to hand-written DO blocks below + corrected ones for `ims_suppliers` (BUG #5: was global, now inst-scoped) and `ims_unit_conversions` (BUG #9: was global, now child-scoped via `ims_items.institution_id`).
  - **`03_policies.sql` edit #4 (hand-written blocks for non-conforming tables)**: ~290 lines added between line 5638 (end of main IMS RLS) and the existing granular-overrides block. Three new DO blocks:
    - **`ims_item_categories` (BUG #2, HIGH)**: live policies were globally readable/writable (`user_has_permission('ims.view')` with no scoping). Replaced with store-scoped variants via `EXISTS-join on ims_stores.institution_id`. Closes cross-store data exposure.
    - **`ims_supply_shipments` + `ims_supply_shipment_items` (BUG #1 HIGH cross-tenant write + BUG #3 HIGH helper drift)**: table has NO `institution_id` (only `source_store_id`, `destination_institution_id`, `destination_store_id`). Generic helper would crash. Hand-written block creates SELECT/INSERT/UPDATE/DELETE matching live DB shape AND narrows base UPDATE/DELETE to source-side-only via `ims.transfers.dispatch`. Destination-side updates flow through the existing additive `_update_receive` policy gated on `ims.transfers.receive`. Same fix applied to the child shipment_items table.
    - **`ims_*_number_counters` (BUG #6, MED)**: 4 counter tables (`ims_grn_number_counters`, `ims_indent_number_counters`, `ims_sale_number_counters`, `ims_batch_number_counters`) carry only `store_id`. Helper would crash on missing `institution_id`. Hand-written block iterates over 4 tables × 4 verbs in a single loop, scoping via `EXISTS-join on ims_stores`.
  - **`03_policies.sql` edit #5 (granular overrides extended)**: the existing 2026-05-02 morning block was extended with 3 more dead-key bindings (BUGs #7, #8 from rls-reviewer):
    - `ims.inventory.create` → additive INSERT on `ims_items`
    - `ims.inventory.delete` → additive DELETE on `ims_items`
    - `ims.stock.grn.receive` → additive UPDATE on `ims_goods_received_notes` when status transitions to `received`/`verified`
  - **`03_policies.sql` edit #6 (design-intent comments)**: BUG #10 `ims.financial.write_admin_only` annotated as intentional (service-role / DEFINER-only writes; do NOT add to PERMISSION_CATEGORIES). BUG #7 scope-reviewer (`ims_activity_log.ims.view` INSERT gating) documented as deferred TODO with rationale (requires UI-layer permission key addition). BUG #5/#9 rationale captured in inline comments.
  - **`03_policies.sql` edit #7 (bulk_import non-enforceability)**: comment block added explaining `ims.inventory.bulk_import` cannot be enforced at the RLS layer (no per-row signal distinguishing a single insert from a bulk import). Bulk-import gating must remain in service-layer code (see `lib/services/ims/items-service.ts` and the bulk-import API route).
  - **Production migrations applied** (via `mcp__supabase__apply_migration`): 4 named migrations:
    - `ims_rls_resolve_remaining_2026_05_02_item_categories`
    - `ims_rls_resolve_remaining_2026_05_02_supply_shipments_narrow`
    - `ims_rls_resolve_remaining_2026_05_02_shipment_items_narrow`
    - `ims_rls_resolve_remaining_2026_05_02_inventory_grn_dead_keys`
    Verified via `pg_policies`: all `ims_supply_shipments` UPDATE/DELETE quals now reference only `source_store_id` (no `destination_institution_id`); `ims_item_categories` policies all join `ims_stores`; new `ims_items_insert_create`, `ims_items_delete_specific`, and `ims_goods_received_notes_update_receive` policies live alongside the helper-generated baselines.
  - **Live policies for `ims_suppliers`, `ims_unit_conversions`, and the 4 counter tables were already correct** (these were never regressed in production — only the source file would have regressed on re-apply). No live DB change needed for those; the fix is purely source-file hardening.
  - **Per-bug status (final)**:
    - BUG #1 [HIGH] cross-tenant write on `ims_supply_shipments` — **FIXED** (UPDATE/DELETE narrowed to source-side; destination-side covered by `_update_receive`)
    - BUG #2 [HIGH] `ims_item_categories` global scope — **FIXED** (store-scoped via `ims_stores` EXISTS-join)
    - BUG #3 [HIGH] `ims_supply_shipments` helper drift (would crash on re-apply) — **FIXED** (hand-written block replaces helper call; child table same)
    - BUG #5 [MED] `ims_suppliers` would regress on re-apply — **FIXED** (changed `ims_apply_global_policies` → `ims_apply_inst_policies`)
    - BUG #6 [MED] counter tables would crash on re-apply — **FIXED** (hand-written loop block)
    - BUG #7 [MED] rls-reviewer — `ims.inventory.create/.delete` dead — **FIXED** (additive policies wired)
    - BUG #7 [LOW] scope-reviewer — `ims_activity_log` INSERT key — **DEFERRED** (TODO comment; requires new permission key in `lib/constants/permissions.ts`)
    - BUG #8 [MED] `ims.stock.grn.receive` dead — **FIXED** (additive policy with status-transition WITH CHECK)
    - BUG #9 [MED] `ims_unit_conversions` would regress on re-apply — **FIXED** (changed to child-scoped via `ims_items.institution_id`)
    - BUG #10 [MED] `ims.financial.write_admin_only` undocumented — **DOCUMENTED** (design-intent comment added)
    - `ims.inventory.bulk_import` (rls-reviewer note) — **DOCUMENTED** (cannot be enforced at RLS layer; service-layer concern)
  - **Open follow-ups (deferred to other agents)**:
    - **HIGH (UI layer)**: ui-reviewer's 24 HIGH-severity findings — `app/(routes)/ims/**` pages still don't enforce `canAccess()` per-page or `Can*` per-action. Owned by `ui-fixer` (Task #2).
    - **LOW**: add `ims.audit.write` key to `lib/constants/permissions.ts` and migrate the `ims_activity_log_insert` policy to gate on it (BUG #7 scope-reviewer). Trivial follow-up but cross-cuts UI agent's territory.

- **2026-05-02 (morning)** — IMS permission-system audit: granular RLS overrides + setup-script FK fixes (Part 1)
  - Driven by 4-agent `ims-permission-audit` team review (50 bugs surfaced across RLS/UI/scope/dashboard layers).
  - **`03_policies.sql` edit #1 (FK column typos)**: lines 5607, 5611. Helper invocations for child tables `ims_indent_request_items` and `ims_supply_shipment_items` declared FK columns `indent_request_id` and `supply_shipment_id` — but live DB has `indent_id` and `shipment_id`. Re-running the script would have crashed on `column does not exist`. Verified via `information_schema.columns` before patching.
  - **`03_policies.sql` edit #2 (granular permission overrides)**: appended new ~110-line block between the main IMS RLS DO-block (line 5618) and the IMS Activity Log section. Wires 5 previously-dead permission keys at the DB layer:
    - `ims.indents.create` → INSERT on `ims_indent_requests`
    - `ims.indents.delete` → DELETE on `ims_indent_requests`
    - `ims.indents.approve` → UPDATE on `ims_indent_requests` when status moves to `approved`/`rejected`
    - `ims.sales.refund` → UPDATE on `ims_sales` when status='cancelled'
    - `ims.transfers.receive` → UPDATE on `ims_supply_shipments` & `ims_supply_shipment_items` when status moves to `received`/`received_with_variance`
  - **Strategy: additive (soft-wire), not replacement**. Postgres ORs multiple permissive policies for the same verb — these new policies grant access alongside the existing helper-generated `_insert`/`_update`/`_delete`. Existing roles keyed on `ims.indents.edit` / `ims.sales.create` / `ims.transfers.dispatch` keep their authority.
  - **Production migration applied** (via `mcp__supabase__apply_migration`): `ims_granular_permission_overrides_2026_05_02`. 6 new policies live: `ims_indent_requests_{insert_create, delete_specific, update_approve}`, `ims_sales_update_refund`, `ims_supply_shipments_update_receive`, `ims_supply_shipment_items_update_receive`.
  - **Status-transition gating**: WITH CHECK clauses on the new UPDATE policies constrain `NEW.status` to the specific transitions each verb represents — so a user with only `ims.indents.approve` can flip status to approved/rejected but cannot edit other fields under that policy (general edits still require `ims.indents.edit`). Catalog verbs now match DB-enforced verbs.

- **2026-04-28** — IMS production-readiness: RLS canonicalization + schema drift sweep + Phase F audit trail
  - **Phase A (RLS hardening)**: drop-and-recreate RLS for all 25 ims_* tables to canonical pattern `is_super_admin() OR is_admin(auth.uid()) OR (user_has_permission(<key>) AND role_has_institution_access(institution_id))`. Closed 5 live security holes (USING(true) on `ims_supply_shipments`, `ims_supply_shipment_items`, `ims_stock_batches`, `ims_stock_summary`, `ims_batch_number_counters`). Replaced the legacy `get_current_user_role()` raw-string pattern on 23 tables. Pre-flight: added `custom_roles.{institution_scope, is_active, institution_id}` columns + applied `role_has_institution_access(uuid)` from `02_functions.sql:6674` (was missing in prod) + UPDATE custom_roles SET institution_scope='all' WHERE role_key IN ('super_admin', 'counselor'). 100 canonical policies live, 0 holes remaining.
  - **Phase A0.5 (in-flight)**: `ims_stores` got `is_central_supply_store BOOLEAN NOT NULL DEFAULT FALSE` + `requires_local_approval BOOLEAN NOT NULL DEFAULT FALSE`. Fixed `getStores()` 42703 error blocking the store picker.
  - **Phase A5b (schema-types drift)**: `ims_items` got 5 spec-defined-but-DB-missing columns (`is_distributable`, `is_bundle`, `brand`, `variant_attributes`, `image_url`); `types/ims/supply-transfers.ts` got 5 logistics fields (`vehicle_no`, `courier_name`, `driver_name`, `driver_contact`, `expected_arrival`) that existed in DB but were missing in types — pages were silently dropping the data on round-trip.
  - **Phase F (end-to-end audit trail)**: closed gap where IMS service layer was computing user-id + timestamps for every transition (e.g., `indent-service.ts:240` setting `approved_at`) but DB was silently dropping them because columns didn't exist. Added 8 audit columns: `ims_indent_requests.{requested_at, approved_at, rejected_at, rejected_by, local_approved_at}` + `ims_goods_received_notes.{received_at, verified_at, approved_at}`. Backfilled `requested_at = created_at` and `received_at = created_at` for existing rows so historical entries don't render as NULL. Created **`ims_activity_log`** table (8 columns: institution_id, entity_type CHECK enum, entity_id, action CHECK enum, actor_id, notes, metadata jsonb, created_at) with 3 indexes + RLS (SELECT + INSERT only — append-only by design, no UPDATE/DELETE policies). 5 service files integrated to log every state transition: indent (raised/approved/rejected), GRN (received/verified/approved), supply-transfer (dispatched/received), stock-adjustment (adjusted), sales (raised). Reject + adjustment now require notes (`throw new Error` on empty); approve allows optional comment. New types/ims/activity-log.ts + hooks/ims/use-ims-activity-log.ts + components/ims/activity-feed.tsx mounted on indent/GRN/transfer detail pages. End-to-end smoke verified.
  - **`01_tables.sql` edits (this session)**: appended single block at end of file containing the Phase A0.5/A5b ALTERs, the Phase F audit-column ALTERs (with `to_regclass` guards so the block no-ops cleanly until base IMS tables land in source), and the `ims_activity_log` CREATE TABLE + indexes + ENABLE RLS. The 25 base ims_* tables are NOT yet in this file — they exist only in production from the original IMS deploy and remain a follow-up backfill task.
  - **`03_policies.sql` edits**: appended new RLS section for `ims_activity_log` after the existing IMS canonical RLS block. Same pattern, same helper functions, but only SELECT + INSERT (append-only).
  - **`02_functions.sql`**: no edits this session — `role_has_institution_access` was already there (line 6674), the bug was that it had never been applied to production. Applied via mcp during Phase A0 pre-flight.
  - **Production migrations applied** (via `mcp__supabase__apply_migration`): 7 named migrations covering schema fixes, RLS canonicalization, audit columns, and activity log creation. All idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`). Plan file: `~/.claude/plans/ps-c-users-admin-documents-github-myjkkn-radiant-dijkstra.md`.
  - **Open follow-ups**: full backfill of the 25 base ims_* tables into `01_tables.sql` (high-volume mechanical work, separate task); service-layer interface standardization (3 services return flat arrays vs others' `{data, metadata}` wrapper — defer to tech-debt PR); structured-error-logging pattern across 18 IMS services (only `store-service.ts` and `role-service.ts` upgraded so far this session). hr_leave_applications schema (referenced in `02_functions.sql` and `05_views.sql` but defined nowhere) is a separate pre-existing gap.

- **2026-04-28** — Dashboard v2 staging-sync: backfill spec-asserted columns + drop HLA clause from SLA matview
  - Symptom: `/dashboard` on `ims-on-main` threw a wall of `<DashboardErrorBoundary>` blocks. Started as PGRST202 (5 RPCs/views missing in staging because MCP had been pointing at the wrong Supabase project — `kvizhngldtiuufknvehv` instead of `hhprjbgknupaplivtoib`). After re-pointing the MCP and applying the 4 deployable objects verbatim from `02_functions.sql`/`05_views.sql`, errors shifted to `42703 column does not exist` for `un.acknowledged_at`, `first_touch_at`, plus PGRST202 for `fn_dashboard_streak`/`fn_dashboard_activity_feed` which were never deployed.
  - Root cause (two layers): (a) staging schema ~5–10 days stale on dashboard-v2 changes; (b) **source SQL itself** was missing `CREATE TABLE`/`ALTER TABLE` DDL for 7 of the 9 columns the dashboard-v2 functions reference. Specs (`specs/myjkkn-dashboard-v2-spec.md §3.1`) describe these columns; functions in `02_functions.sql` use them; nobody ever authored the ALTER blocks. So a fresh DB clone from `setup/` would re-break.
  - **`01_tables.sql` edits**: added new ALTER blocks alongside the existing dashboard-v2 section (~line 4205), backfilling `notifications.{action_type, action_config, acknowledgment_deadline_hours, requires_acknowledgment}` and `user_notifications.{acknowledged_at, escalated_at, escalation_level}`. `requires_acknowledgment NOT NULL DEFAULT FALSE` and `escalation_level NOT NULL DEFAULT 0` are safe on existing rows because the DEFAULT backfills atomically. Added `idx_user_notifications_unack` partial index for the hot `acknowledged_at IS NULL` predicate hit by every queue read.
  - **`05_views.sql` edits**: removed the `NOT EXISTS hr_leave_applications` clause from `v_dashboard_sla_daily` (lines ~773–778). Inline comment marks the spot for reinstatement once `hr_leave_applications` is authored. Behavior change: counselors on approved leave will now appear in SLA leaderboard rankings if they have `first_touch_at` data — minor (internal leaderboard).
  - **No edits to `02_functions.sql`**: `fn_dashboard_streak` (:8521) and `fn_dashboard_activity_feed` (:8680) already exist in source verbatim; they just weren't deployed to staging. Both applied this session.
  - **Staging migrations applied** (8 in total via `mcp__supabase__apply_migration`): `dashboard_v2_admission_leads_first_touch_at`, `dashboard_v2_notifications_action_columns`, `dashboard_v2_user_notifications_ack_columns`, `dashboard_v2_v_sla_daily_no_hla` (drop+recreate combined to avoid REFRESH window), `dashboard_v2_fn_dashboard_streak`, `dashboard_v2_fn_dashboard_activity_feed`, plus the earlier `dashboard_config` table and the 4 verbatim object deploys (metrics/morning_brief/queue_list/conversion_monthly). Final `NOTIFY pgrst, 'reload schema'`.
  - Verification: 7 dashboard objects exist in `pg_proc`/`pg_matviews`; 9 new columns confirmed via `information_schema.columns` with correct types (`requires_acknowledgment is_nullable='NO' default 'false'`, `action_config jsonb default '{}'::jsonb`, etc.); `notifications_superseded_by_fkey` self-FK exists; both matviews queryable (0 rows is steady-state — `first_touch_at` was just added so no leads have it set yet).
  - **Open follow-up (separate ticket)**: author or remove `hr_leave_applications` references in source. Currently referenced 4 times across `02_functions.sql` + `05_views.sql` but defined nowhere. Until resolved, `fn_check_employee_on_leave`-style functions in HR module will fail at call time. Suggested: `bd create "Author hr_leave_applications schema or strip references" -t bug -p 2`.
  - Plan file: `~/.claude/plans/ps-c-users-admin-documents-github-myjkkn-radiant-dijkstra.md`.

- **2026-04-28** — `02_functions.sql`: append `NOTIFY pgrst, 'reload schema'` trailer to fix recurring PGRST202 schema-cache misses
  - Symptom: dashboard threw `PGRST202: Could not find the function public.fn_dashboard_metrics(p_department_id, p_institution_id)` despite the function existing in `pg_proc` (verified via Supabase MCP — single active v3 signature, granted to authenticated, returned the documented `no_caller_profile` JSON branch when called with NULL/NULL).
  - Root cause: PostgREST in-memory schema cache was stale after a prior `02_functions.sql` deployment. The setup file had no cache-reload trailer (unlike all 11 migrations under `supabase/migrations/` which do — e.g. `20260427_role_demotion_safeguards.sql`, `20260424_bos_align_institutions_id_and_drop_expert_fk.sql`, `admission/014_whatsapp_auto_responder.sql`).
  - Fix: 9-line trailer at EOF — single global NOTIFY covers every function in the file. Reload is global, so any sibling cache-miss is also resolved simultaneously.
  - One-shot remediation issued via Supabase MCP `NOTIFY pgrst, 'reload schema'`; verified with `SELECT public.fn_dashboard_metrics(NULL, NULL)` returning the documented early-exit JSONB (no PGRST202).
  - Related prior incident: `docs/bugs/academic-staff-planning-bugs-2026-04-18.md` — same root cause class on `get_consolidated_staff_plans`; was never structurally resolved (fallback path shipped instead). This trailer closes the recurrence vector for `02_functions.sql`.
  - **Hot-patch caveat**: if a contributor manually ALTERs/CREATEs a single function (not via full setup re-run), they must issue `NOTIFY pgrst, 'reload schema'` themselves — the trailer only fires on full-file deploys.
  - **Follow-up (separate PR)**: mirror the trailer into `03_policies.sql`, `04_triggers.sql`, `05_views.sql` — RLS / trigger / view changes can also stale the cache. Not in this change.

- **2026-04-28** — IMS module wired into role-based access (permissions catalog + canonical RLS)
  - `lib/constants/permissions.ts`: new `IMS` PERMISSION_CATEGORIES block (~28 keys, taxonomy `B+`). Module-level granularity matching Admission CRM precedent + critical action keys for financial/audit separation: `ims.indents.approve`, `ims.stock.adjust`, `ims.sales.refund`, `ims.stock.grn.receive`, `ims.transfers.{dispatch,receive}`. Gateway key `ims.view` gates parent /ims tree. Auto-discovered by Permissions Audit Dashboard via the `lowercase + space→underscore` derivation rule in `lib/permissions-audit/module-mappings.ts:61`.
  - `lib/sidebarMenuLink.ts`: 31 new `MENU_PERMISSIONS` route mappings for every page under `app/(routes)/ims/**` — dashboard, financial, indents (parent + new + pending + [id]), inventory (items + categories), reports (5 sub-pages share `ims.reports.view`), sales (POS + history + receipt + [id]), settings (stores/suppliers/units/unit-conversions), stock (parent + adjustments + batches + department + GRN lifecycle), transfers (parent + [id]).
  - `hooks/ims/use-ims-store-context.ts`: tightened `isStoreAdmin` predicate. Replaced coarse `Object.keys(permissions).some(k => k.startsWith('ims'))` (which incorrectly let any IMS user — e.g. POS cashier — into the store-picker UI) with explicit `permissions['ims.settings.stores.manage'] === true`. Picker is now reserved for users who can actually manage stores; cashiers fall back to `assigned_store_id` auto-resolve or Gate C dead-end.
  - `03_policies.sql`: appended IMS RLS section (~230 lines). Replaces legacy raw-role pattern with canonical `is_super_admin() OR is_admin(auth.uid()) OR (user_has_permission('key') AND role_has_institution_access(institution_id))`. **Closes 2 known security holes** flagged in `docs/modules/ims/2026-04-27-MODULE-supabase-database-schema.md §8`: `ims_supply_shipments` and `ims_supply_shipment_items` previously used `USING (true)` (any authenticated user could read every institution's transfers). Now requires `ims.transfers.view` + institution access. Coverage: 25 ims_* tables (13 institution-scoped root + 4 counters + 4 global ref + 4 child via parent-EXISTS).
  - **Why pg_temp helpers**: 25 tables × 4 policies = 100 near-identical DDL statements. Section uses three pg_temp PL/pgSQL helpers (institution-scoped, global ref, child FK-scoped) compressing the 100 statements to one template + per-table call. Helpers self-drop at session end (no permanent schema pollution); per-table permission keys passed as args remain explicit and greppable.
  - **Database-state safe**: entire RLS section wrapped in `to_regclass('public.ims_stores') IS NULL → RAISE NOTICE; RETURN`. Verified against connected staging (hhprjbgknupaplivtoib) — IMS migrations not yet applied there, so the section no-ops with the NOTICE on first run; will auto-apply when IMS DDL lands. Helper `pg_temp` functions only define if guard passes.
  - **Files NOT touched**: `01_tables.sql` (IMS tables defined elsewhere — schema doc references prod migration), `02_functions.sql` (synthetic key `ims.financial.write_admin_only` is intentionally never granted to any role — only `is_super_admin()`/`is_admin()` clauses can mutate financial transactions; mirrors how triggers run as DEFINER side-effects of sales/grn posting).
  - **FK assumption** in child-table block: parent FKs use convention `<parent_singular>_id` (`grn_id`, `indent_request_id`, `supply_shipment_id`, `sale_id`). Verify against `information_schema.columns` before applying in production if the IMS schema doc deviates.
  - Reversibility: each DROP POLICY IF EXISTS + recreate is idempotent. To roll back, replace the policies with the legacy `USING (institution_id = ... OR get_current_user_role() = 'super_admin')` pattern via the same helpers.

- **2026-04-23** — `learners_profiles.admission_year_id` shadow FK (PR-1 of 4-PR plan to wire admission_years into learners profiles)
  - New migration `supabase/migrations/learners_profiles_admission_year_id_shadow_fk.sql`
  - `01_tables.sql`: reconciled phantom `admission_year INTEGER` (column existed in prod but not in canonical source — was added directly via Supabase MCP earlier without explicit migration). Added new `admission_year_id UUID REFERENCES admission_years(id) ON DELETE SET NULL` shadow column.
  - `02_functions.sql`: new `validate_learner_admission_year_scope()` SECURITY DEFINER trigger function — rejects FK rows whose `institution_id` or `program_id` does not match the learner. Closes the cross-institution attach vector PG FK alone cannot enforce.
  - `04_triggers.sql`: new `trg_validate_learner_admission_year_scope` BEFORE INSERT/UPDATE OF (admission_year_id, institution_id, program_id).
  - **Scoped backfill**: 133 `lifecycle_status='admitted'` rows auto-filled with the latest active cohort for their (institution, program). 4,054 `active` rows + 440 `graduated` + others left NULL — director will edit manually via admitted-status UI on their schedule. Backfill is idempotent (`WHERE admission_year_id IS NULL`).
  - **Strategy**: shadow-column, not destructive replace. Legacy `admission_year INTEGER` kept in place for ≥1 release because 6 B2A endpoints (`/api/api-management/learners/*`, `/api/b2a/learners/*`, MCP tool) expose it as integer; breaking those mid-release would page external consumers. Both columns stay in sync — converter (PR-2) writes both.
  - `lib/types/database.ts`: targeted edit (3 occurrences in learners_profiles Row/Insert/Update) instead of full regenerate.
  - `types/learner-profile.ts`: added `admission_year_id?: string | null` and optional joined `admission_year_obj`.
  - Reversibility: column is nullable; trigger DROP recovers prior insert semantics; backfill skips already-filled rows.

- **2026-04-22** — Staff role mirror RPC (HOD still hit `user_roles` RLS even after PR #326)
  - New migration `supabase/migrations/20260422000004_mirror_staff_role_to_user_roles_rpc.sql`
  - New function `public.mirror_staff_role_to_user_roles(p_profile_id uuid, p_role_key text)` — SECURITY DEFINER, pinned search_path. Verifies caller has `staff.create` AND target is a real `staff.profile_id` row with matching `role_key` before upserting `user_roles`. `GRANT EXECUTE` to `authenticated`.
  - Root cause of remaining failure: `staff_insert_permission` RLS allows HOD to INSERT staff directly (they have `staff.create` + `role_has_institution_access`). So `/api/staff` fallback was never triggered, and the client-side `UserRolesService.assignRoles()` call (after successful direct insert) still hit `user_roles_insert_permission` which requires `roles.create`.
  - Fix: browser now calls the RPC instead of `user_roles.insert()`. Authorization is enforced inside the function (caller must have `staff.create` AND target must be a staff-linked profile with matching `role_key` — no drive-by role assignment possible).
  - Backfill: 2 orphan staff profiles from earlier HOD attempts had missing `user_roles` rows; backfilled via one-shot INSERT scoped to the last 2 hours (verified recovery for both).
  - Followup to PR #326 which fixed only the trigger half.

- **2026-04-22** — Staff INSERT fails 42501 "permission denied for table users" for HOD/non-super-admin staff.create
  - New migration `supabase/migrations/20260422000003_fix_sync_staff_trigger_auth_access.sql`
  - `02_functions.sql`: `sync_staff_to_profiles()` trigger function switched from SECURITY INVOKER (default) to SECURITY DEFINER with `SET search_path = public`. Body was also updated to mirror the live version that had drifted from source (profile_id-first lookup + auth-linked-first tiebreaker on email collisions).
  - Root cause: the trigger's email-fallback branch orders by `EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)` to prefer auth-linked profiles on duplicate emails. `auth.users` grants SELECT only to `postgres` — not to `service_role`/`authenticated`/`anon` — so with SECURITY INVOKER every insert failed unless the caller was the superuser. `POST /api/staff` uses `supabaseAdmin` (service_role) and still tripped it because the trigger ran as the invoker.
  - Fix: DEFINER makes the function execute as its owner (`postgres`), which has the grant. `search_path` is pinned to close the classic definer hijack vector. No behaviour change for callers.
  - Reported by director 2026-04-22 ~15:35 IST when HOD test user hit "Failed to create staff record" with server-side `code: 42501, message: 'permission denied for table users'`.

- **2026-04-22** — Service Requests: multi-approver per step (OR logic)
  - New migration `supabase/migrations/20260422000002_service_request_multi_approver_support.sql`
  - `01_tables.sql`: adds `approver_user_ids UUID[] NOT NULL DEFAULT '{}'` column to `service_request_approval_steps` + GIN index `idx_sr_approval_steps_approver_user_ids`.
  - `03_policies.sql`: extends "Approvers can view pending requests" to also match users listed in `approver_user_ids` (not just those whose role matches `approver_role`). Also picks up the institution-scope guard previously only in the migration file.
  - Semantics: empty array = legacy role-based matching; populated = approval restricted to listed users, first to act wins. `approver_role` stays populated (set to first selected user's role) so legacy inbox queries keep working.
  - Use case: service-type author wants to pick 2–5 specific users per step (e.g. "HOD Priya OR HOD Rahul OR Principal") instead of "any user with HOD role".

- **2026-04-22** — Hostel leave types seed expansion (+9 defaults) + fix bug in #287 migration
  - New migration `supabase/migrations/20260422000001_seed_hostel_leave_types_expansion.sql` (~90 lines, atomic BEGIN/COMMIT)
  - Seeds 9 new system defaults × 11 institutions = 99 rows: festival, family_function, bereavement, clinical_rotation, industrial_visit, internship, training, sports_cultural, convocation. All is_system=true so UI blocks delete (admins can deactivate via is_active toggle instead).
  - ON CONFLICT (institution_id, leave_type_code) DO NOTHING → re-run safe.
  - Applied to production via Supabase management API on 2026-04-22 ~10:15 IST. Verification count: 99 new rows confirmed (11 per code × 9 codes).
  - FIX to `supabase/migrations/20260421000005_hostel_leave_types_crudable.sql` (the original migration from PR #287): two UPDATE statements had invalid references to the UPDATE target `req` — one from a JOIN ON clause, one from a GROUP BY subquery. PG rejects both patterns. Rewritten: (1) moved `req.leave_type_code` condition from JOIN ON to WHERE; (2) replaced the `IN (SELECT ... GROUP BY)` subquery with a scalar `SELECT ... ORDER BY ... LIMIT 1` correlated subquery. Migration is now atomic-clean; applied successfully to prod during the apply flow.
  - Trigger: director feedback 2026-04-21 ~15:20 IST — "Leave types have to be increased, max days for each leave is not fixed." The CRUDable table (from #287) made this a data seed, not a DDL change.
  - Principle reference: `~/.claude/skills/myjkkn-chain/SKILL.md` Q1 — Value-list check (added 2026-04-21). This seed is the first test of the principle under fire — adding rows to an already-CRUDable master table instead of another enum migration.

- **2026-04-21** — BUG-003146 Expo per-stall accountability, operations, lead attribution
  - New migration `supabase/migrations/20260421200000_bug_003146_expo_event_stalls.sql` (~120 lines, atomic BEGIN/COMMIT)
  - New table `expo_event_stalls` (expo_event_id FK CASCADE, institution_id FK RESTRICT, stall_name, assigned_staff_id → profiles(id) SET NULL, total_expenses numeric, photos text[], promotional_materials jsonb, notes, created_by, created_at, updated_at). 3 indexes (expo_event_id, institution_id, assigned_staff_id partial).
  - `assigned_staff_id` references `profiles(id)` (matches existing `expo_event_team_members.staff_id` pattern) NOT `staff(id)`.
  - Adds nullable `admission_leads.stall_id` FK (SET NULL on stall delete) + partial index. Preserves all existing/non-expo leads.
  - 4 RLS policies using modern pattern: `is_super_admin() OR is_admin() OR (user_has_permission('admission.marketing.expos.{view,create,edit,delete}') AND role_has_institution_access(institution_id))`.
  - Reuses existing perm keys — no permission catalogue changes needed.
  - `updated_at` trigger via new `touch_expo_event_stalls_updated_at()` function.
  - DB migration must be applied manually post-merge (Supabase MCP is read-only).

- **2026-04-21** — Hostel leave types: enum → CRUDable master table (chain Q1 principle, director feedback "can leave types + duration be CRUDable")
  - New migration `supabase/migrations/20260421000005_hostel_leave_types_crudable.sql` (~320 lines, atomic BEGIN/COMMIT)
  - PHASE 1: New `public.hostel_leave_types` institution-scoped master table (code, name, description, color, default_max_duration_days, parent_consent/chief_warden/attachment flags, advance_notice_hours, sort_order, is_system, is_active). Unique (institution_id, leave_type_code), check color_code is hex, check durations are positive.
  - PHASE 2: Seed 7 defaults × every institution with `is_system=true` (home_visit, weekend, vacation, emergency, medical, academic, night_out). ON CONFLICT DO NOTHING = re-run safe.
  - PHASE 3: Add nullable `leave_type_id UUID FK` to `hostel_leave_type_config` + `hostel_leave_requests`. Backfill from existing enum via JOIN on (institution_id, leave_type_code). Enum column KEPT during transition — drop in future cleanup PR.
  - PHASE 4: 4 CRUD RLS policies on `hostel_leave_types` using new perms `campus_living.leave_types.{view,create,edit,delete}`. Delete policy includes `AND NOT is_system` so defaults cannot be deleted.
  - Frontend (PR-3b): replaces the 88-LOC ghost page at `/campus-living/settings/leave-types` with real CRUD consuming the shared `<CrudDataTable>` + `<CrudRowActions>` from PR-3a (#286).
  - Principle reference: `~/.claude/skills/myjkkn-chain/SKILL.md` Q1 — Value-list check (added 2026-04-21). Value lists masquerading as enums are the failure mode.

- **2026-04-21** — Hostel blocks ↔ multi-college junction (warden feedback follow-up to PR-4)
  - New migration `supabase/migrations/20260421000004_hostel_blocks_multi_college.sql` (~330 lines, atomic BEGIN/COMMIT)
  - PHASE 1: New `hostel_block_institutions` M2M (block_id, institution_id, is_primary, learner_year_groups[], floors_assigned[]) with partial unique index on is_primary=true.
  - PHASE 2: Backfill junction from existing `hostel_blocks.institution_id` (INSERT…ON CONFLICT DO NOTHING).
  - PHASE 3: `ALTER hostel_blocks.institution_id DROP NOT NULL` (DO block pre-checks is_nullable).
  - PHASE 4: New helper `role_has_hostel_block_scope(block_id, institution_id)` — super_admin ∪ user_block_access grant ∪ primary institution ∪ ANY junction institution.
  - PHASE 5: 4 CRUD RLS policies on `hostel_block_institutions` using new helper.
  - PHASE 6: Swap 4 CRUD policies on `hostel_blocks` from `role_has_institution_access` → `role_has_hostel_block_scope`. `hostel_rooms`/`beds`/`allocations` deliberately out of scope (next PR after junction data populated via xlsx loader — avoids lockout window).
  - Trigger: warden finding 2026-04-21 12:35 IST — 3 girls' blocks are shared across all 8 colleges, floors separate year-groups. 1-block = 1-college assumption in PR-4 was wrong.

- **2026-04-21** — Persona Design PR-4: Campus Living RLS retrofit + role permission wiring (the big one)
  - New migration `supabase/migrations/20260421000002_persona_design_pr4_rls_retrofit.sql` (~450 lines, atomic BEGIN/COMMIT)
  - PHASE 1: Drops 46 legacy `_institution_isolation` policies (FOR ALL + hardcoded 'super_admin' string — CLAUDE.md anti-pattern).
  - PHASE 2: Creates ~184 new policies (46 tables × 4 = SELECT/INSERT/UPDATE/DELETE) using the standardized pattern: `is_super_admin() OR is_admin() OR (user_has_permission(key) AND role_has_*_access(...))`.
    - 13 institution-only tables: +role_has_institution_access(institution_id)
    - 18 block-scoped tables (have block_id): +role_has_block_access(block_id)
    - 11 block-conceptual tables (no block_id column): app-layer filters block narrowing; RLS uses institution-only
    - 7 mess contract-scoped tables (have caterer_id): +role_has_contract_access(caterer_id, 'caterer')
  - PHASE 3: UPDATEs each of the 10 new roles' permissions jsonb with their scaffolding (warden gets 51 keys, chief_warden 84, accreditation_officer 23, etc.)
  - Atomic cutover — RLS and role perms land together (partial = all-super_admin-only lockout, avoided via BEGIN/COMMIT).
  - Depends on: #275 (PR-1 scope helpers), #276 (PR-2 10 roles), #277 (PR-3 permission keys)

- **2026-04-21** — Persona Design PR-3: +127 permission keys in PERMISSION_CATEGORIES (TypeScript-only, no DB migration)
  - `lib/constants/permissions.ts`: replaced 1-key Campus Living stub with 121 granular keys. Submodules: blocks, rooms, beds, allocations, wardens, gate_passes, visitors, leave, attendance, maintenance, housekeeping, laundry, safety (incl. anti_ragging), health, fees, deposits, mess (caterers/menu/meals/billing/feedback/waste), alerts, pulse, wellness, community, analytics, reports (NAAC/NIRF/AICTE/anti-ragging quarterly), parent_portal.
  - Also added 6 `users.*.access` keys for PR-1's scope-extension junction tables: `users.block_access.{view,manage}`, `users.relationship.{view,manage}`, `users.contract_access.{view,manage}`.
  - Catalog-sync verified: every MENU_PERMISSIONS campus_living.* key now has a PERMISSION_CATEGORIES home (was: 29 drift warnings; now: 0).
  - No DB changes — roles still have empty permissions jsonb. PR-4 bulk-updates each role's permissions to wire the new keys alongside RLS retrofit on 48 hostel_*/mess_* tables.

- **2026-04-21** — Persona Design PR-2: 10 new roles for Campus Living + external actors
  - New migration `supabase/migrations/20260421000001_persona_design_pr2_ten_roles.sql`
  - Roles seeded: warden, chief_warden, gate_security, housekeeping_staff, parent, mess_caterer, maintenance_vendor, hostel_office, anti_ragging_member, accreditation_officer
  - All have `permissions='{}'` (empty) and `module_scopes='{}'` — intentional. PR-3 adds catalog keys to `PERMISSION_CATEGORIES`; PR-4 retrofits RLS on 48 hostel_*/mess_* tables AND bulk-updates each role's permissions jsonb to grant its scaffolding.
  - `accreditation_officer` is the only scope=`all` role (cross-institution evidence pull for NAAC/NIRF/UGC). Nine others are scope=`own`. External actors (parent, mess_caterer, maintenance_vendor) use scope=`own` + row-level checks via PR-1 junction tables (user_block_access, user_learner_relationship, user_contract_access).
  - Idempotent via `ON CONFLICT (role_key) DO NOTHING`.
  - Depends on PR-1 (#275 merged 2026-04-21) for scope helpers.

- **2026-04-21** — Persona Design PR-1: scope-extension helpers (block/relationship/contract scopes)
  - `01_tables.sql`: new junction tables `user_block_access`, `user_learner_relationship`, `user_contract_access`. Each has `revoked_at` for soft-delete + audit trail. `user_contract_access.contract_id` is polymorphic (caterer/maintenance_vendor/laundry_vendor/amc).
  - `02_functions.sql`: 3 new SECURITY DEFINER helpers — `role_has_block_access(uuid)`, `role_has_relationship_access(uuid)`, `role_has_contract_access(uuid, text DEFAULT NULL)`. All mirror `role_has_institution_access()` pattern: super_admin bypass, NULL target = system-wide, otherwise consult junction table.
  - `03_policies.sql`: RLS on the 3 junction tables. Standard contract: super_admin/admin full CRUD; users see own grants; delegated via `users.block_access|relationship|contract_access.{view,manage}` permission keys (added in PR-3).
  - Context: MyJKKN's `institution_scope` supports only 'all'|'own'. Campus Living needs block-level (warden), relationship (parent), and contract (caterer/vendor) scopes. This PR is PR-1 of 4 — INERT infrastructure until PR-2 (roles), PR-3 (permission keys), PR-4 (RLS retrofit on 48 hostel_*/mess_* tables).
  - See: `docs/persona-design/scope-extension-pr1.md`

- **2026-04-18** — Seat Configuration page invisible to admission role with scope='all' (programs returned 0 rows)
  - `03_policies.sql`: rewrote SELECT/INSERT/UPDATE/DELETE policies on `programs`, `degrees`, `departments` to use `role_has_institution_access(institution_id)` instead of hardcoded `institution_id = get_current_user_institution_id()`. Added `admission.settings.seats.view` / `admission.settings.seats.manage` as acceptable SELECT permissions for programs/degrees/departments so seat config works without granting Organization module perms.
  - `03_policies.sql`: rewrote `intake_history` policies — previously required a `user_institution_access` row (locked out super admins who didn't have one). Now uses the standard contract `is_super_admin() OR is_admin() OR (role_has_institution_access(...) AND user_has_permission('admission.settings.seats.*'))`.
  - Root cause: the legacy own-institution equality check in RLS ignored `institution_scope='all'` on the admission role.

- **2026-04-15** — `get_user_roles_with_details` now returns scope columns (fixes "Employment Information section not hiding for own_records users")
  - `02_functions.sql`: added `institution_scope text` and `module_scopes jsonb` to the function's RETURNS TABLE. Required DROP+CREATE because Postgres can't ALTER return shape. Without these, client-side `usePermissions().getModuleScope()` always read undefined and fell back to defaults.
  - Migration: `user_roles_details_include_scopes`. No client code change required — existing `(r as any).module_scopes` reads now resolve.

- **2026-04-15** — `user_roles` RLS aligned to permission contract; staff edit no longer fails on no-op role resync
  - `03_policies.sql`: dropped 4 hardcoded `profiles.role IN ('super_admin','admin')` policies on `user_roles`. Added 4 contract policies keyed on `roles.{create,edit,delete}`. Self-view policies preserved.
  - `lib/services/staff/staff-service.ts`: `updateStaff` now skips `assignRoles` when `data.role_key === currentStaff.role_key` (avoided unnecessary DELETE+INSERT cycle that surfaced as a 42501 RLS error for callers without `roles.create`). Pre-fetch select extended to include `role_key`.
  - Migration: `user_roles_align_to_permission_contract`.

- **2026-04-15** — Per-module access scope (Option A) for custom roles
  - `01_tables.sql`: `custom_roles.module_scopes JSONB DEFAULT '{}'` (per-module scope override of `institution_scope`).
  - `02_functions.sql`: `get_user_module_scope(module_key)` returns most-permissive scope across user's roles; `role_has_module_access(module_key, institution_id, owner_email)` combines that with row-level checks.
  - `03_policies.sql`: staff SELECT/UPDATE/DELETE policies switched to `role_has_module_access('staff', institution_id, institution_email)`. INSERT stays institution-only ('own_records' doesn't apply to creation). Self-view via `institution_email = auth.email()` preserved.
  - Migration: `add_module_scopes_to_custom_roles` + `staff_rls_use_module_scope`. UI: new "Module Access Scope" section in Role Management edit dialog.

- **2026-04-15** — Staff module RLS aligned to permission contract (Tier C audit fix)
  - `02_functions.sql`: mirrored `role_has_institution_access(check_institution_id uuid)` back into source (was DB-only drift). SECURITY DEFINER, STABLE.
  - `03_policies.sql`: rewrote 4 `staff` policies + `employment_categories`, `custom_roles`, and `staff_plans` insert/update/delete policies to the standard contract `is_super_admin() OR is_admin() OR (user_has_permission(...) AND role_has_institution_access(institution_id))`. Dropped legacy hardcoded-role policies (incl. `staff_select_event_coordinator`, "Admins can manage staff_plans...", duplicate `custom_roles` SELECT policies). Preserved staff service-role bypass and email-based self-view/self-edit.
  - Migration: `staff_module_rls_align_to_permission_contract`. Pre-flight verified zero real-user impact.

- **2026-04-14** — Staff onboarding: dynamic role_key + conditional department scope
  - `01_tables.sql`: `staff.role_key` (FK → custom_roles), `staff.department_id` nullable, `employment_categories.is_teaching`, unique constraint on `category_name`
  - `02_functions.sql`: `sync_staff_to_profiles()` uses `NEW.role_key` instead of hardcoded `'faculty'`; UPDATE branch now resyncs role. New `validate_staff_department_scope()` enforces teaching→dept required, non-teaching→dept null.
  - `04_triggers.sql`: added `trg_validate_staff_department_scope` BEFORE INSERT/UPDATE on staff.
  - Seed: 12 new `employment_categories` rows (Facilitator + 11 non-teaching).

## 📁 Directory Structure

```
supabase/
├── setup/              # Initial setup files (RUN IN ORDER)
│   ├── 00_master_setup.sql    # Extensions, types, helper functions
│   ├── 01_tables.sql           # ALL table definitions
│   ├── 02_functions.sql        # Custom functions and procedures
│   ├── 03_policies.sql         # RLS policies for all tables
│   ├── 04_triggers.sql         # Database triggers
│   ├── 05_views.sql            # Database views
│   └── 06_seed_data.sql        # Optional seed data
├── migrations/         # Version-controlled migrations (DO NOT EDIT OLD FILES)
├── tables/            # Individual table references (READ-ONLY)
├── functions/         # Individual function references (READ-ONLY)
├── policies/          # Individual policy references (READ-ONLY)
├── triggers/          # Individual trigger references (READ-ONLY)
└── views/            # Individual view references (READ-ONLY)
```

## 🔴 STRICT RULES

### Rule 1: NEVER Create Duplicate Files

- ❌ DO NOT create new files for existing objects
- ✅ UPDATE existing files with proper comments

### Rule 2: File Update Protocol

When updating any SQL file:

```sql
-- Updated: 2025-01-16 by [reason]
-- Previous version backed up as comments below
-- [Your changes here]
```

### Rule 3: Single Location Policy

- Tables: ONLY in `setup/01_tables.sql`
- Functions: ONLY in `setup/02_functions.sql`
- Policies: ONLY in `setup/03_policies.sql`
- Triggers: ONLY in `setup/04_triggers.sql`
- Views: ONLY in `setup/05_views.sql`

## 📊 Current Database Objects

### Tables (101 total in database - Updated 2026-04-07 — added 18 Events/Marathon tables)

| Module          | Tables                                                                                                                                                                                                                  | Count | Status                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------- |
| Academic        | academic_years, degrees, departments, programs, semesters, sections, courses, course_mappings, regulations, batches                                                                                                     | 10    | ✅                          |
| Billing         | billing_student_bills, billing_receipts, billing_invoices, billing_invoice_items, billing_receipt_items, billing_discounts, billing_refunds, billing_categories (flat; 2026-04-15 consolidation — replaced parent/sub/item hierarchy) | 8     | ✅                          |
| Learners (Unified) | learners_profiles, intake_history | 2 | ✅ Complete - Single source of truth for enquiry→alumni lifecycle + capacity analytics |
| Students (Active Tables) | students | 1 | ✅ Live table with sync triggers → learners_profiles |
| Staff           | staff, staff_plans, staff_plan_courses                                                                                                                                                                                  | 3     | ✅                          |
| Admissions (Active Tables) | admissions | 1 | ✅ Live table with sync triggers → learners_profiles |
| Attendance      | periods, student_attendance                                                                                                                                                                                             | 2     | ✅                          |
| Timetable       | timetables, timetable_slot_continuity                                                                                                                                                                                   | 2     | ⚠️ Missing continuity table |
| Resources       | resources, resource_reservations, resource_approvals, resource_usage_logs, resource_parent_categories, resource_sub_categories, resource_attribute_definitions                                                          | 7     | ✅                          |
| Bug Reports     | bug_reports (+ module_name generated col 2026-03-23), bug_report_messages, bug_report_participants, bug_report_email_logs                                                                                               | 4     | ✅ Updated 2026-03-23 — added module_name GENERATED ALWAYS AS column + idx_bug_reports_module_name index |
| Notifications   | notifications, user_notifications, push_subscriptions                                                                                                                                                                   | 3     | ✅                          |
| API             | api_keys                                                                                                                                                                                                                | 1     | ✅                          |
| User Management | profiles, users, user_institution_access, custom_roles                                                                                                                                                                  | 4     | ✅                          |
| Dashboard       | dashboard_configurations, dashboard_widgets, dashboard_widget_types                                                                                                                                                     | 3     | ✅                          |
| Dashboard System | user_dashboard_preferences, dashboard_widgets                                                                                                                                                           | 2     | ✅ Personalized role-based widgets |
| **Engagement Analytics** | **user_sessions, daily_engagement_metrics, student_engagement_scores, mv_engagement_overview (materialized view)** | **4** | **✅ Complete - Advanced student engagement tracking** |
| **Lifecycle Analytics** | **usage_events, module_usage_daily, institution_health_scores, feature_usage_summary, usage_events_archive, mv_lifecycle_dashboard (materialized view)** | **6** | **✅ NEW - Cross-institution usage tracking and health scoring** |
| Child App Auth  | ~~child_app_analytics, child_app_auth_codes_bucket, child_app_unified_sessions~~ (REMOVED 2025-01-20)                                                                                                     | 0     | ❌ Dropped - moved to auth server                          |
| LTI Integration | lti_tools, lti_launches, lti_grades                                                                                                                                                                                         | 3     | ✅ Complete - MATLAB integration |
| **Service Requests** | **service_types (+ scope_level, institution_ids, degree_ids, department_ids, program_ids), service_type_fields, service_request_approval_steps, service_requests, service_request_approvals, service_request_timeline, service_request_attachments** | **7** | **✅ Updated 2026-03-19 - Added scope columns for institution/degree/department/program-level service types** |
| **Startup Studio** | **startup_events, event_registrations, event_team_members, event_venue_assignments, event_team_venue_allocations, event_staff_assignments, event_demo_slots, event_submissions, event_checklists, event_checklist_items, event_checklist_completions, event_team_attendance, appathon_role_cards, appathon_peer_tags, appathon_verifications** | **15** | **NEW - Generic event platform for hackathons/competitions** |
| **Post-Demo Day Pipeline** | **track_declarations, progression_levels, case_studies** | **3** | **NEW 2026-03-09 — Post-demo-day team path declaration, learner identity progression (5 levels), and case study narratives** |
| **Marketing**   | **marketing_leads_database** | **1** | **✅ NEW 2026-03-17 — Bulk-uploaded lead data for admission marketing campaigns** |
| **Events (Core)** | **events, event_categories, event_external_participants, events_registrations, event_payment_transactions** | **5** | **NEW 2026-04-07 — Base event platform shared by all event types (marathon, cultural fest, seminar, etc.)** |
| **Events (Marathon Extension)** | **marathon_sponsors, marathon_sponsor_deliverables, marathon_sponsor_activity_log, marathon_committees, marathon_tasks, marathon_budget_items, marathon_checkpoints, marathon_checkpoint_scans, marathon_results, marathon_incidents, marathon_volunteer_checkins, marathon_race_tracks, marathon_race_track_points** | **13** | **NEW 2026-04-07 — Marathon-specific tables: sponsor CRM, committees, budget, checkpoints, GPS live tracking, results** |
| Other           | applications (with parent auth + LTI), categories, subcategories, employment_categories, user_activity_logs, activity_stats, institution_departments, migration_log                                                           | 8     | ✅ Updated with auth + LTI  |

### Functions (244 total - Updated 2026-02-09)

| Category              | Location               | Count | Purpose                         |
| --------------------- | ---------------------- | ----- | ------------------------------- |
| Authentication & User | setup/02_functions.sql | 15    | User management, profiles, auth |
| Institution Access    | setup/02_functions.sql | 10    | Institution access control      |
| Billing               | setup/02_functions.sql | 20    | Billing calculations, invoices  |
| Attendance            | setup/02_functions.sql | 5     | Attendance statistics           |
| **Facilitator Attendance** | **setup/02_functions.sql** | **1** | **get_facilitator_attendance_stats() — periods marked per facilitator for live dashboard** |
| Timetable             | setup/02_functions.sql | 10    | Timetable management            |
| Academic              | setup/02_functions.sql | 15    | Academic hierarchy, validations |
| Staff                 | setup/02_functions.sql | 5     | Staff management                |
| Admission             | setup/02_functions.sql | 5     | Application ID generation, combined analytics |
| Bug Reports           | setup/02_functions.sql | 4     | Bug tracking                    |
| Resources             | setup/02_functions.sql | 6     | Resource management             |
| Notifications         | setup/02_functions.sql | 1     | User notifications              |
| API Keys              | setup/02_functions.sql | 4     | API key management              |
| **Service Requests**  | setup/02_functions.sql | **2** | **generate_service_request_number(), count_active_service_requests()** |
| Activity Logging      | setup/02_functions.sql | 2     | Log cleanup, stats              |
| **Engagement Analytics** | **Migrations**         | **6** | **Session management, metrics computation, engagement scoring** |
| Utilities             | setup/02_functions.sql | 10+   | Helper functions                |
| Dashboard             | setup/02_functions.sql | 2     | Dashboard reporting             |
| Permissions           | setup/02_functions.sql | 6     | Role and permission checks      |
| Child App Auth        | ~~setup/02_functions.sql~~ | 0     | ~~Session cleanup~~ (REMOVED 2025-01-20) |

### RLS Policies (250+ total)

| Location              | Count | Coverage          |
| --------------------- | ----- | ----------------- |
| setup/03_policies.sql | 250+  | 53 tables (94.6%) |

### Triggers (74 total - Updated 2025-01-18)

| Category              | Location              | Count | Purpose                      |
| --------------------- | --------------------- | ----- | ---------------------------- |
| Timestamp Updates     | setup/04_triggers.sql | 35    | Auto-update updated_at       |
| Business Logic        | setup/04_triggers.sql | 20    | Auto-populate, validations   |
| Billing               | setup/04_triggers.sql | 10    | Status updates, calculations |
| **Learner Sync (NEW)** | **Migrations** | **2** | **Bidirectional sync: admissions/students ↔ learners_profiles** |
| Attendance Validation | setup/04_triggers.sql | 1     | Staff assignment validation  |
| Other                 | setup/04_triggers.sql | 6     | Various business rules       |

### Views (10 total)

| View Name                       | Location           | Module      |
| ------------------------------- | ------------------ | ----------- |
| auto_generated_invoices         | setup/05_views.sql | Billing     |
| bill_invoice_relationships      | setup/05_views.sql | Billing     |
| v_bill_details                  | setup/05_views.sql | Billing     |
| bug_reporters_leaderboard       | setup/05_views.sql | Bug Reports |
| bug_reports_with_details        | setup/05_views.sql | Bug Reports |
| semester_hierarchy_health       | setup/05_views.sql | Academic    |
| semester_program_audit_view     | setup/05_views.sql | Academic    |
| hr_leave_types (compat)         | setup/05_views.sql | HR          |
| ims_department_stock_summary    | setup/05_views.sql | IMS         |
| ims_department_item_movements   | setup/05_views.sql | IMS         |

### Storage Buckets (7 total)

| Bucket              | Purpose                | Size Limit |
| ------------------- | ---------------------- | ---------- |
| applications        | Application documents  | 50MB       |
| avatars             | User profile pictures  | None       |
| bug-reports         | Bug report screenshots | 10MB       |
| institution-logos   | Institution branding   | None       |
| resource-management | Resource images        | 10MB       |
| staff-images        | Staff photos           | None       |
| student-photos      | Student photos         | None       |

### Indexes (382 total)

| Type         | Count | Purpose                      |
| ------------ | ----- | ---------------------------- |
| Primary Keys | 56    | Table primary keys           |
| Unique       | 95    | Unique constraints           |
| Foreign Key  | 0     | ⚠️ No FK constraints defined |
| Performance  | 231   | Query optimization           |

### Custom Types

| Type Name            | Location                  | Values                                                               |
| -------------------- | ------------------------- | -------------------------------------------------------------------- |
| user_role            | setup/00_master_setup.sql | super_admin, admin, institution_admin, staff, student, parent, guest |
| attendance_status    | setup/00_master_setup.sql | present, absent, late, excused, holiday                              |
| bill_status          | setup/00_master_setup.sql | pending, partial, paid, overdue, cancelled                           |
| academic_year_status | setup/00_master_setup.sql | upcoming, active, completed                                          |
| lifecycle_status     | setup/01_tables.sql       | enquiry, pending, approved, rejected, waitlisted, active, inactive, exited, graduated, alumni |
| student_status       | setup/01_tables.sql       | active, inactive, graduated, dropped, suspended (LEGACY - for backward compatibility) |

## 🚀 Setup Instructions

### For New Clone/Setup:

```bash
# Run in Supabase SQL Editor in this exact order:
1. Run supabase/setup/00_master_setup.sql
2. Run supabase/setup/01_tables.sql
3. Run supabase/setup/02_functions.sql (when created)
4. Run supabase/setup/03_policies.sql (when created)
5. Run supabase/setup/04_triggers.sql (when created)
6. Run supabase/setup/05_views.sql (when created)
7. Run supabase/setup/06_seed_data.sql (optional)
```

### For Updates:

```bash
# NEVER create new files. Update existing files:
1. Open the appropriate file based on object type
2. Add update comments with date and reason
3. Make your changes
4. Update this index file
5. Test in development first
```

## 📝 Change Log

### 2026-03-09: Post-Demo Day Pipeline — 3 New Tables

- **Files Updated**:
  - `supabase/setup/01_tables.sql` — Added `track_declarations`, `progression_levels`, `case_studies` tables with indexes
  - `supabase/setup/03_policies.sql` — Added RLS (ENABLE + 13 policies across 3 tables)
  - `supabase/setup/04_triggers.sql` — Added `update_case_studies_updated_at` trigger

  **Purpose**: Track team path declarations after Demo Day, individual learner identity-ladder progression (5 levels), and structured case study narratives for `solve_for_industry` / `jicate_solutions` tracks.

**track_declarations** — New table:
- `event_id` → `startup_events(id)`, `team_id` → `event_registrations(id)`
- `track TEXT` — `'solve_for_100'` | `'jicate_solutions'` | `'solve_for_industry'` | `'completed'`
- `declared_by` → `profiles(id)`, `declared_at TIMESTAMPTZ`
- `mentor_approved BOOLEAN`, `mentor_notes TEXT`, `approved_at`, `approved_by`
- UNIQUE on `(event_id, team_id)`

**progression_levels** — New table:
- `profile_id` → `profiles(id)`, `event_id` → `startup_events(id)`, `team_id` → `event_registrations(id)`
- `level INTEGER` (1–5), `level_name TEXT`, `achieved_at TIMESTAMPTZ`
- `evidence JSONB`, `awarded_by TEXT` (default `'system'`)
- UNIQUE on `(profile_id, event_id, level)`

**case_studies** — New table:
- `event_id` → `startup_events(id)`, `team_id` → `event_registrations(id)`
- `track TEXT` — `'solve_for_industry'` | `'jicate_solutions'`
- `problem TEXT`, `solution TEXT`, `proof TEXT`, `who_else TEXT`
- `demo_url TEXT`, `app_name TEXT`, `app_url TEXT`
- `score INTEGER`, `featured BOOLEAN` (default `false`)
- UNIQUE on `(event_id, team_id)`; `updated_at` auto-managed by trigger

---

### 2026-03-06: Facilitator Attendance Report — RPC Function

- **Files Updated**:
  - `supabase/setup/02_functions.sql` — Added `get_facilitator_attendance_stats()` RPC function
  - `supabase/setup/03_policies.sql` — Added `GRANT EXECUTE` for `authenticated` role

  **Purpose**: Aggregates `student_attendance.marked_by` counts per staff member to power the live facilitator attendance dashboard at `/attendance/consolidation/facilitators`. Returns summary totals, per-facilitator detail with weekly trend and daily heatmap data, and department-level breakdown — all as a single JSONB response.

  **Function signature**: `get_facilitator_attendance_stats(p_institution_id UUID, p_date_from DATE, p_date_to DATE, p_department_id UUID DEFAULT NULL, p_program_id UUID DEFAULT NULL, p_semester_id UUID DEFAULT NULL, p_facilitator_id UUID DEFAULT NULL) → JSONB`

---

### 2026-03-08: Demo Day Evaluation — appathon_verifications Table

- **Files Updated**:
  - `supabase/setup/01_tables.sql` — Added `appathon_verifications` table with 4 indexes
  - `supabase/setup/03_policies.sql` — Added RLS (ENABLE + 3 policies: SELECT, INSERT, UPDATE)

  **Purpose**: Core evaluation table for Demo Day. One row per evaluator per team. Evaluators verify team claims (live URL, user counts, revenue) during presentations and record tier scores (T1–T4) + revenue bonus. Calculated scores are server-recomputed and not trusted from client. Admission restricted to staff assigned as judge/panel_chair/evaluator for `demo_day` day_type.

**appathon_verifications** — New table:
- `submission_id` → `event_submissions(id)`
- `evaluator_id` → `profiles(id)`
- `venue_id` → `event_venue_assignments(id)`
- `presented BOOLEAN`, `presentation_slot INT`
- `app_live BOOLEAN`
- `claimed_users`, `claimed_active_users`, `claimed_revenue` — copied at freeze time
- `verified_users`, `verified_active_users`, `verified_revenue` — evaluator-confirmed
- `verified_tier INT`, `revenue_bonus INT`, `total_score INT` — server-computed
- `verification_status TEXT` — `'pending'` | `'verified'` | `'flagged'` | `'disqualified'`
- `flag_reason TEXT`, `notes TEXT`
- UNIQUE constraint on `(submission_id, evaluator_id)`

---

### 2026-03-07: Startup Studio — Per-Venue Team Attendance

- **Files Updated**:
  - `supabase/setup/01_tables.sql` — Added `event_team_attendance` table with 3 indexes and RLS enabled
  - `supabase/setup/03_policies.sql` — Added 4 RLS policies for `event_team_attendance`
  - `supabase/migrations/20260307000000_add_event_team_attendance.sql` — Applied migration ✅

  **Purpose**: Track per-team attendance for each day type (build_day / demo_day) at a given venue. Enforces a unique attendance record per `(event_id, registration_id, day_type)`. Insert/update restricted to admins or staff assigned to that venue; delete restricted to super admins.

**event_team_attendance** — New table:
- `event_id` → `startup_events.id`
- `registration_id` → `event_registrations.id`
- `venue_assignment_id` → `event_venue_assignments.id`
- `day_type TEXT` — `'build_day'` or `'demo_day'`
- `status TEXT` — `'present'` | `'absent'` | `'late'` (default `'present'`)
- `marked_by` → `profiles.id`
- `marked_at TIMESTAMPTZ`
- `notes TEXT`
- UNIQUE constraint on `(event_id, registration_id, day_type)`

---

### 2026-03-06: Startup Studio — Team Invitation Workflow

- **Files Updated**:
  - `supabase/setup/01_tables.sql` — Added `team_code` to `event_registrations`; added `learner_id`, `status`, `is_leader`, `responded_at` to `event_team_members`
  - `supabase/setup/02_functions.sql` — Added `generate_team_code()` function
  - `supabase/migrations/20260306000000_add_team_invitation_workflow.sql` — Applied migration ✅

  **Purpose**: Enable structured team-based participation in startup studio events. Teams are identified by an auto-generated institution-prefixed code; members can be invited by the team leader and must accept or decline before the event.

#### Updated 2026-03-06 — Team Invitation Workflow

**event_registrations** — Added column:
- `team_code TEXT` — Institution-wise auto-generated team code (e.g., `JKKN-001`). Generated via `generate_team_code()` DB function at registration time. Unique per `(event_id, institution_id)` combination.

**event_team_members** — Added columns:
- `learner_id UUID` → `learners_profiles.id` — Links member to verified learner profile for validated invitations
- `status TEXT` — Member workflow status: `pending` (invited, awaiting response) | `accepted` (confirmed member) | `declined` (rejected) | `removed` (removed by leader). Default: `accepted` (for backward compat with pre-invitation rows)
- `is_leader BOOLEAN` — Marks the team leader (auto-set to `true` for team owner at registration). Default: `false`
- `responded_at TIMESTAMPTZ` — When the invitee accepted or declined

**New DB function:**
- `generate_team_code(p_event_id UUID, p_institution_id UUID) → TEXT` — Generates sequential team codes using `institutions.counselling_code` as prefix. Defined in `supabase/setup/02_functions.sql`

---

### 2026-02-06: Lifecycle Analytics System

- **Files Updated**:
  - `setup/01_tables.sql` - Added 5 tables: usage_events, module_usage_daily, institution_health_scores, feature_usage_summary, usage_events_archive
  - `setup/02_functions.sql` - Added 7 functions: compute_module_usage_daily, refresh_lifecycle_dashboard_view, compute_institution_health_scores, backfill_usage_events, archive_old_usage_events, ensure_usage_events_partitions, compute_feature_usage_summary
  - `setup/03_policies.sql` - Added 12 RLS policies for all lifecycle analytics tables
  - `setup/05_views.sql` - Added mv_lifecycle_dashboard materialized view

  **Purpose**: Cross-institution lifecycle analytics dashboard with module-level usage tracking, health scoring, and report generation

  **Tables Created**:
  - `usage_events` - Raw event tracking (page visits, CRUD actions, exports)
  - `module_usage_daily` - Pre-aggregated daily rollup by institution/module
  - `institution_health_scores` - Composite health scores (Phase 2)
  - `feature_usage_summary` - Sub-feature level aggregation (Phase 3)
  - `usage_events_archive` - Archive for old events (Phase 3)

  **Views Created**:
  - `mv_lifecycle_dashboard` - Materialized view refreshed every 5 min for dashboard

  **Functions Created**:
  - `compute_module_usage_daily(target_date)` - Daily rollup from usage_events
  - `refresh_lifecycle_dashboard_view()` - MV refresh (every 5 min via pg_cron)
  - `compute_institution_health_scores(target_date)` - Health score calculation
  - `backfill_usage_events()` - One-time backfill from user_sessions
  - `archive_old_usage_events(months_to_keep)` - Monthly maintenance
  - `ensure_usage_events_partitions()` - Auto-create monthly partitions (Phase 3)
  - `compute_feature_usage_summary(target_date)` - Feature-level daily aggregation (Phase 3)

  **Application Layer (Phase 1)**:
  - Types: `types/usage-analytics.ts`
  - Service: `lib/services/analytics/usage-tracking-service.ts`
  - Service: `lib/services/analytics/lifecycle-dashboard-service.ts`
  - Middleware: `lib/middleware/usage-tracking-middleware.ts`
  - Middleware: `lib/middleware/url-module-mapper.ts`
  - Hooks: `hooks/analytics/use-lifecycle-dashboard.ts`, `use-module-breakdown.ts`
  - API: `app/api/analytics/usage/dashboard|modules|events|trends/route.ts`
  - UI: `app/(routes)/admin/lifecycle/page.tsx` + 6 components
  - Sidebar: Added "Lifecycle Analytics" to Administration group

  **Application Layer (Phase 2)**:
  - Service: `lib/services/analytics/health-score-service.ts`
  - Service: `lib/services/analytics/usage-report-service.ts`
  - Hooks: `hooks/analytics/use-health-scores.ts`, `use-institution-comparison.ts`, `use-lifecycle-reports.ts`
  - API: `app/api/analytics/usage/health-scores/route.ts`, `health-scores/[id]/route.ts`, `comparison/route.ts`, `reports/generate/route.ts`
  - UI: `institution-comparison-tab.tsx`, `reports-tab.tsx` (added to lifecycle dashboard)

  **Application Layer (Phase 3)**:
  - Live health score in KPI card with progress bar + color coding
  - Dormant institution alerts in Overview tab
  - Archive strategy: `ensure_usage_events_partitions()` + `compute_feature_usage_summary()`

### 2026-01-30: Personalized Dashboard System

- **Migration**: `migrations/20260130140000_create_dashboard_tables.sql` ✅ **APPLIED**

  **Purpose**: Personalized role-based dashboard system with customizable widget visibility per user

  **Tables Created**:
  - `user_dashboard_preferences` - Widget visibility preferences per user/role
    - Fields: user_id, role, widget_id, is_visible, created_at, updated_at
    - Composite primary key: (user_id, role, widget_id)
    - Indexes: user_role index, widget_id index
  - `dashboard_widgets` - Registry of available widgets per role
    - Fields: widget_id, role, title, description, category, default_visible, display_order
    - Composite primary key: (widget_id, role)
    - Indexes: role index, category index

  **Features**:
  - ✅ Role-based widget registry (student, faculty, leadership, admin)
  - ✅ Per-user widget visibility preferences
  - ✅ Customizable dashboard settings dialog
  - ✅ Widget grouping by category (Academic, Finance, Community, etc.)
  - ✅ Reset to defaults functionality
  - ✅ Optimistic UI updates
  - ✅ Mobile-responsive design

  **Application Layer**:
  - Service: `lib/services/dashboard/dashboard-preferences-service.ts`
  - Hooks: `hooks/dashboard/use-dashboard-preferences.ts`
  - Components:
    - `app/(routes)/dashboard/_components/dashboard-settings-dialog.tsx`
    - `app/(routes)/dashboard/_components/widget-visibility-settings.tsx`
    - `app/(routes)/dashboard/_components/widget-registry.ts`

  **Remaining Work**: Phases 2-6 (additional widgets, drag-and-drop, analytics, performance)

### 2025-01-19: Advanced Engagement Analytics System ⭐ NEW

- **Files Created**:
  - `migrations/20260119_create_engagement_analytics_schema.sql` ✅ **APPLIED**
  - `migrations/20260119_create_engagement_functions.sql` ✅ **APPLIED**
  - `migrations/20260119_create_engagement_jobs.sql` ⏳ **PENDING** (requires pg_cron extension)

- **Purpose**: Transform basic login/logout activity tracking into comprehensive student engagement analytics with role-based tracking, organizational hierarchy analytics, and at-risk student identification.

- **Architecture**: Hybrid Event Capture + Materialized Views
  - Real-time session tracking with organizational context
  - Pre-computed daily metrics via background jobs
  - Materialized view for fast dashboard queries (15-min refresh)
  - Hierarchical drill-down: Institution → Department → Program → Semester → Section → Student

- **Database Changes**:
  - **Tables Created (4)**:
    - `user_sessions` - Detailed session tracking with organizational context
      - Fields: session_id, user_id, login_at, logout_at, duration_seconds, device_type
      - Organizational context: institution_id → section_id hierarchy
      - Activity tracking: modules_accessed[], actions_count
      - 7 performance indexes
    - `daily_engagement_metrics` - Pre-aggregated daily metrics by hierarchy and role
      - Metrics: total_logins, unique_users, avg_session_duration, modules_per_user
      - 4 composite indexes for fast queries
    - `student_engagement_scores` - Individual student engagement tracking
      - Metrics: logins_7d/30d, avg_session_duration, total_time_spent, modules_accessed
      - Comparative: percentile_rank, section averages
      - Risk indicators: engagement_level (high/medium/low/at_risk), risk_factors[]
      - 6 indexes including partial index on is_at_risk
    - `mv_engagement_overview` - Materialized view for fast dashboard summaries
  - **Functions Created (6)**:
    - `close_user_session()` - Session closure and duration calculation
    - `add_module_to_session()` - Track module access
    - `get_user_organizational_context()` - Hierarchy context detection
    - `compute_daily_engagement_metrics()` - Daily metric aggregation
    - `compute_student_engagement_scores()` - Engagement scoring and risk identification
    - `cleanup_orphaned_sessions()` - Auto-close stale sessions
  - **Background Jobs (3)** - Using pg_cron:
    - Daily at 2 AM: Compute daily metrics
    - Daily at 3 AM: Compute student engagement scores
    - Every 15 minutes: Refresh materialized view
  - **RLS Policies (3)**:
    - Hierarchical access control based on user role
    - Students can view own sessions
    - Admins see institution/department scoped data

- **Application Layer Changes**:
  - **Service Layer (2 files)**:
    - `lib/services/analytics/session-tracking-service.ts` - Session management
    - `lib/services/analytics/engagement-service.ts` - Analytics business logic with hierarchical access control
  - **API Endpoints (4 files)**:
    - `app/api/analytics/engagement/route.ts` - Main metrics endpoint
    - `app/api/analytics/engagement/at-risk/route.ts` - At-risk students
    - `app/api/analytics/engagement/student/[id]/route.ts` - Student detail
    - `app/api/analytics/engagement/sections/compare/route.ts` - Section comparison
  - **React Hooks (4 files)**:
    - `hooks/analytics/use-engagement-metrics.ts` - Dashboard metrics (15-min refetch)
    - `hooks/analytics/use-at-risk-students.ts` - At-risk students (5-min refetch)
    - `hooks/analytics/use-student-engagement.ts` - Student detail
    - `hooks/analytics/use-section-comparison.ts` - Section comparison
  - **UI Components (7 files)**:
    - `components/analytics/engagement-filters.tsx` - Hierarchical filters
    - `components/analytics/student-engagement-table.tsx` - Full-featured data table
    - `components/analytics/at-risk-modal.tsx` - At-risk students modal
    - `components/analytics/student-detail-modal.tsx` - Student drill-down (3 tabs)
    - `components/analytics/section-comparison-table.tsx` - Section comparison
    - `components/analytics/charts/login-trend-chart.tsx` - Trend visualization
    - `components/analytics/charts/engagement-distribution-chart.tsx` - Distribution chart
  - **Types (1 file)**:
    - `types/analytics.ts` - 30+ interfaces for complete type safety
  - **Modified Files (2)**:
    - `app/auth/callback/route.ts` - Enhanced with session creation
    - `app/api/auth/logout/route.ts` - Enhanced with session closure
    - `app/(routes)/users/activity/page.tsx` - Added Engagement Analytics tab

- **Key Features**:
  - ✅ Automatic session tracking on login/logout
  - ✅ Device detection (mobile/tablet/desktop)
  - ✅ Module access tracking (academic, billing, etc.)
  - ✅ Engagement level calculation (high/medium/low/at_risk)
  - ✅ Percentile ranking within section
  - ✅ At-risk student identification with risk factors:
    - no_login_7d - No login in 7 days
    - inactive_7d - Inactive for 7+ days
    - below_20_percentile - Bottom 20% performance
    - low_session_duration - Below section average
    - limited_module_access - Using <3 modules
  - ✅ Section comparison with engagement scoring
  - ✅ Trend charts (30-day login activity)
  - ✅ Distribution charts (engagement levels)
  - ✅ Hierarchical access control (Faculty → HOD → Principal → Super Admin)
  - ✅ Export to CSV functionality

- **Dashboard Integration**:
  - Tabbed interface: "Activity Logs" + "Engagement Analytics"
  - Overview cards: Active Students (7d), At-Risk Count, Avg Session Duration, Avg Logins/Week
  - Interactive charts: Login Trend, Engagement Distribution
  - Section comparison (when semester selected)
  - Student engagement table with sorting/filtering/pagination
  - Click-through modals for at-risk students and student details

- **Access Control**:
  - Faculty: See only sections they teach
  - HOD: See department-level data
  - Principal: See institution-level data
  - Super Admin: Global access across all institutions

- **Performance Optimizations**:
  - 17 indexes across 4 tables
  - Materialized view for fast queries
  - React Query caching (15-min stale time for metrics)
  - Pagination (50 items per page)
  - Lazy loading for charts and modals

- **Completion Status**: 95% Complete
  - ✅ Phase 1: Database schema (100%)
  - ✅ Phase 2: Session tracking integration (100%)
  - ✅ Phase 3: Database functions (100%)
  - ✅ Phase 4: Service layer (100%)
  - ✅ Phase 5: API endpoints (100%)
  - ✅ Phase 6: React hooks (100%)
  - ✅ Phase 7: TypeScript types (100%)
  - ✅ Phase 8: UI components (100%)
  - ✅ Phase 9: Dashboard integration (100%)
  - ⏳ Phase 10: pg_cron job scheduling (pending extension verification)

- **Ready for Use**:
  - All components functional and integrated
  - Session tracking starts on next login
  - Manually run database functions to compute initial metrics:
    ```sql
    SELECT compute_daily_engagement_metrics(CURRENT_DATE - INTERVAL '1 day');
    SELECT compute_student_engagement_scores(CURRENT_DATE);
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_engagement_overview;
    ```
  - Schedule pg_cron jobs when ready (migration file available)

- **Impact**:
  - Complete visibility into student engagement patterns
  - Early identification of at-risk students for intervention
  - Data-driven insights for improving student success
  - Section-level performance comparison for faculty
  - Comprehensive audit trail of system usage
  - Foundation for predictive analytics and ML models

- **Documentation Updated**:
  - `supabase/SQL_FILE_INDEX.md` - Added new tables and functions
  - `IMPLEMENTATION_STATUS.md` - Comprehensive tracking document
  - All code includes JSDoc comments and type annotations

### 2025-01-18: Unified Learners Profiles (Phase 1 Complete)

- **Files**:
  - `setup/01_tables.sql` - Added learners_profiles table and lifecycle_status ENUM
  - `migrations/20250118_migrate_to_learners_profiles.sql` - Data migration script

  **Purpose**: Unify admissions and students tables into single learners_profiles table with complete lifecycle tracking

  **Changes**:
  - ✅ Created `lifecycle_status` ENUM with 10 values (enquiry → pending → approved → rejected → waitlisted → active → inactive → exited → graduated → alumni)
  - ✅ Created `learners_profiles` table with:
    - 100+ fields combining all data from admissions + students
    - Migration lineage fields (original_admission_id, original_student_id, migrated_at, migration_source)
    - Unified lifecycle_status replacing dual status enums
    - Support for regulation_id and batch_id
  - ✅ Created 21 performance indexes for learners_profiles
  - ✅ Marked admissions and students tables as LEGACY (will become VIEWs in Phase 2)
  - ⏳ Migration script ready to execute (migrates 3,506 records: 535 admissions + 2,971 students)

  **Migration Strategy**:
  - Scenario A: Merged records (admission + student) - uses student data as primary source
  - Scenario B: Admission-only records (pending/approved applications)
  - Scenario C: Student-only records (orphaned or direct-created students)
  - Zero data loss verification with rollback capability

  **Impact**:
  - Single source of truth for all learner data from enquiry to alumni
  - Eliminates data duplication (60+ duplicate fields)
  - Expected 33% faster queries with optimized indexes
  - Complete audit trail with original IDs preserved
  - Enables comprehensive lifecycle analytics

  **Phase 2 Status:** ✅ **COMPLETE - REVISED APPROACH** (2025-01-18)
  - ❌ **Original Plan:** VIEWs for backward compatibility - **FAILED** (PostgREST can't detect FK relationships on VIEWs)
  - ✅ **Revised Plan:** Keep original tables + sync triggers
  - ✅ Restored admissions and students tables from legacy backups
  - ✅ Created bidirectional sync triggers:
    - `trg_sync_admission_to_learners` - admissions → learners_profiles
    - `trg_sync_student_to_learners` - students → learners_profiles
  - ✅ Verified PostgREST joins work correctly (institution, degree, department, program)
  - ✅ All existing frontend code works without changes
  - ✅ Data stays synchronized automatically via triggers

  **Phase 3 Status:** ✅ **COMPLETE** (2025-01-18)
  - ✅ Created comprehensive TypeScript types (types/learner-profile.ts - 500+ lines)
    - LifecycleStatus type with 10 values
    - Complete LearnerProfile interface (100+ fields)
    - Validation schemas with Zod
    - Status transition rules and required fields map
    - Dashboard analytics interfaces
  - ✅ Created LearnerProfileService (lib/services/learner-profile-service.ts - 550+ lines)
    - Complete CRUD operations with joins
    - Lifecycle status management with validation
    - Enrollment workflow (approved → active)
    - Analytics & dashboard methods
    - Bulk operations and utilities
  - ✅ Created React Query hooks (hooks/use-learner-profiles.ts - 300+ lines)
    - 16 query hooks (get, list, analytics, filtered lists)
    - 7 mutation hooks with optimistic updates
    - Common use case hooks (useEnquiries, useActiveStudents, etc.)
    - Prefetch utilities for performance

  **Implementation Status:**
  - **Phase 1:** ✅ Complete - Database foundation (2,973 records migrated)
  - **Phase 2:** ✅ Complete - Backward compatibility (VIEWs working)
  - **Phase 3:** ✅ Complete - Service layer ready for use
  - **Phase 4-5:** ⏳ Pending - Route migration and cleanup (optional gradual rollout)

  **Ready for Development:**
  - New code can now use learners_profiles table directly
  - Old code continues working via VIEWs (zero breaking changes)
  - Gradual migration can proceed module-by-module
  - Feature flags can control rollout pace

### 2025-11-28: Combined Enrollment Analytics Function

- **File**: `migrations/combined_enrollment_analytics.sql` ✅ **APPLIED**

  **Purpose**: Created database function for combined admissions + students analytics dashboard

  **Changes**:
  - Added `get_combined_enrollment_analytics()` function
    - Returns combined statistics from both `admissions` and `students` tables
    - Supports filtering by institution, date range, degree, department, program
    - Calculates: combinedTotal, totalAdmissions, totalStudents, pending, approved, rejected, waitlisted, enrolled, onboarded, directStudents, pendingProfile, conversionRate, onboardingRate, avgProcessingDays
  - Added 3 performance indexes:
    - `idx_admissions_analytics_combined` - Composite index on (institution_id, status, created_at)
    - `idx_students_onboarded_status` - Partial index for active students
    - `idx_students_direct_enrolled` - Partial index for direct students (no admission_id)

  **Impact**:
  - Dashboard shows combined view of admissions pipeline + student onboarding
  - Onboarded count now tracks students with `status = 'active'`
  - Direct students (added without admission) are now visible in analytics

### 2026-01-12: LTI 1.3 Integration for MATLAB

- **Files**:
  - `migrations/20260112100000_create_lti_tables.sql` ✅ **APPLIED**
  - `migrations/20260112100001_add_lti_fields_to_applications.sql` ✅ **APPLIED**

  **Purpose**: Enable LTI 1.3 (Learning Tools Interoperability) integration with MathWorks MATLAB suite (Grader, Online, Academy)

  **Changes**:
  - **Created 3 new tables**:
    - `lti_tools` - Registry of LTI 1.3 tools with configurations
    - `lti_launches` - Tracks every tool launch with academic context
    - `lti_grades` - Stores grade passback from MATLAB to MyJKKN
  - **Created 17 indexes** for performance:
    - 2 on lti_tools (active status, tool type)
    - 8 on lti_launches (user, learner, institution, context, resource, created, tool, nonce)
    - 7 on lti_grades (user, learner, institution, resource, launch, unsynced, received)
    - 1 composite on learners_profiles (roster queries)
  - **Created 6 RLS policies** for multi-tenant security
  - **Created 2 database functions**:
    - `get_lti_roster()` - Returns active students for Names & Roles service
    - `get_lti_launch_stats()` - Analytics for launch tracking
  - **Created 1 trigger function**:
    - `populate_lti_grade_fields()` - Auto-calculates score percentage and idempotency key
  - **Updated applications table**:
    - Added `lti_tool_id` column (foreign key to lti_tools)
    - Created index `idx_applications_lti_tool`

  **LTI 1.3 Features Supported**:
  - ✅ JWT-based authentication with RS256 signing
  - ✅ Single Sign-On (SSO) - no separate login for MATLAB
  - ✅ Grade passback (Assignment & Grade Services)
  - ✅ Roster sync (Names & Roles Service)
  - ✅ Context claims (program, semester, section)
  - ✅ Multi-tenancy with institution isolation
  - ✅ Learner lifecycle integration (only 'active' students can launch)
  - ✅ Security: JWT nonce, idempotency keys, rate limiting ready

  **Integration Architecture**:
  - Student clicks MATLAB Grader in Application Hub
  - MyJKKN generates LTI 1.3 JWT with user/academic context
  - MATLAB validates JWT and creates session (no separate login)
  - Student completes assignment in MATLAB
  - MATLAB passes grade back to MyJKKN automatically
  - Grade appears in student's grades view

  **Next Steps (Phase 1)**:
  - Register 3 MATLAB applications in Application Hub
  - Implement simple link integration (MATLAB Online, MATLAB Academy)
  - Phase 2: LTI core implementation (JWT generation, launch flow)
  - Phase 3: MathWorks registration & end-to-end testing
  - Phase 4: Grade passback implementation
  - Phase 5: Roster sync implementation
  - Phase 6: Analytics & monitoring

  **Files Updated**:
  - `types/lti.ts` - Complete TypeScript types for LTI integration
  - `supabase/SQL_FILE_INDEX.md` - Documentation updated

### 2025-01-20

- **Child App Authentication Cleanup**
  - Dropped 3 child app tables (child_app_analytics, child_app_auth_codes_bucket, child_app_unified_sessions)
  - Dropped 1 function (cleanup_expired_child_app_sessions)
  - Total cleanup: 440 rows, ~1.8 MB of data
  - Reason: Authentication flow moved to separate auth server (auth.jkkn.ai)
  - Migration: 20250120_cleanup_child_app_tables.sql
  - Preserved: applications and profiles tables (data synced to auth server)
  - Updated table comments to reflect new architecture

### 2025-01-17

- **Complete Database Analysis Performed**
- Created setup/02_functions.sql with 237 functions
- Created setup/03_policies.sql with 250+ RLS policies
- Created setup/04_triggers.sql with 71 triggers
- Created setup/05_views.sql with 7 views
- Generated comprehensive DATABASE_ANALYSIS_REPORT.md
- Identified critical issues (no foreign keys)
- Updated index with complete database structure
- **Parent Authentication Integration with Applications Module**
  - Added authentication fields to applications table in setup/01_tables.sql
  - Created migration file 20250117_add_auth_to_applications.sql
  - Updated TypeScript types to support authentication
  - Integrated authentication settings into application form UI
  - Applications can now optionally use MyJKKN authentication instead of separate login

### 2025-01-16

- Created organized structure
- Consolidated all existing SQL into proper files
- Established single source of truth policy

## ⚠️ Common Mistakes to Avoid

1. **Creating files like:**

   - ❌ `admission_module_schema.sql`
   - ❌ `organization_module_setup.sql`
   - ❌ `staff_module_setup.sql`
   - ❌ `billing_module_complete.sql`

2. **Instead, update:**
   - ✅ `setup/01_tables.sql` for any table changes
   - ✅ `setup/02_functions.sql` for function changes
   - ✅ This index file when changes are made

## 🔍 Quick Search

### Find billing-related objects:

- Tables: student_bills, billing_receipts in `setup/01_tables.sql`
- Functions: (to be added in `setup/02_functions.sql`)

### Find attendance-related objects:

- Tables: daily_attendance in `setup/01_tables.sql`
- Functions: (to be added in `setup/02_functions.sql`)

### Find user/auth-related objects:

- Tables: profiles in `setup/01_tables.sql`
- Functions: auth.\* functions in `setup/00_master_setup.sql`

## 📝 Recent Migrations

### 2026-02-03: SAML Identity Provider Tables

- **File**: `migrations/20260203000001_create_saml_tables.sql`
- **Tables Added**:
  - `saml_service_providers`: Registry of trusted SAML SPs (e.g., MathWorks)
  - `saml_sessions`: Track active SSO sessions for Single Logout
- **Functions**: `cleanup_expired_saml_sessions()` - Remove expired sessions
- **Purpose**: Enable SAML SSO with MathWorks and other external systems

### 2026-02-02: Apply Advanced Analytics Columns to Database ✅ APPLIED

- **File**: `migrations/20260202_add_advanced_analytics_columns.sql` ✅ **APPLIED**

  **Purpose**: Apply the advanced analytics schema changes that were added to `01_tables.sql` but never executed on the actual database

  **Problem Solved**:
  - Runtime errors: "column learners_profiles.first_graduate does not exist"
  - Runtime errors: "column learners_profiles.school_type does not exist"
  - Runtime errors: "column programs.sanctioned_intake does not exist"
  - Schema file and actual database were out of sync

  **Changes Applied**:
  1. **programs table** (3 new columns):
     - `sanctioned_intake INTEGER DEFAULT 0` - Government approved intake capacity
     - `actual_intake INTEGER DEFAULT 0` - Actual students admitted
     - `academic_year_id UUID` - Reference to academic year

  2. **learners_profiles table** (6 new columns):
     - `school_type TEXT` - Type of previous school (government/aided/private/cbse/icse/state_board)
     - `school_district TEXT` - District of previous school
     - `school_taluk TEXT` - Taluk of previous school
     - `medium_of_instruction TEXT` - Medium in previous school (english/tamil/both)
     - `location_type TEXT` - Student residence classification (urban/semi_urban/rural)
     - `first_graduate BOOLEAN DEFAULT false` - First generation graduate in family

  3. **intake_history table** (NEW):
     - Tracks historical intake data for 3-year stability index
     - Foreign keys to institutions, programs, academic_years
     - Unique constraint on (program_id, academic_year_id)

  4. **Indexes Created** (8 new):
     - 3 for intake_history (program, year, institution)
     - 4 for learners_profiles analytics fields
     - 1 for programs academic_year_id

  **Verification**:
  ```sql
  -- Verified all columns created successfully:
  - programs: sanctioned_intake, actual_intake, academic_year_id ✅
  - learners_profiles: school_type, school_district, school_taluk,
                       medium_of_instruction, location_type, first_graduate ✅
  - intake_history: table created with 10 columns ✅
  ```

  **Impact**:
  - ✅ All advanced analytics features will work correctly
  - ✅ No more runtime column errors
  - ✅ Intake & Capacity analytics functional
  - ✅ Geography analytics functional
  - ✅ Trends analytics functional
  - ✅ School Feeders analytics functional
  - ✅ Fully backward compatible (all columns nullable/have defaults)

  **Status**: ✅ **COMPLETE - MIGRATION APPLIED SUCCESSFULLY** (2026-02-02 via Supabase MCP)

### 2025-12-29: Enhanced Program and Semester Fields

- **File**: `migrations/add_program_semester_enhanced_fields.sql` ✅ **APPLIED**

  **Purpose**: Add enhanced metadata fields to programs and semesters tables for better UI control and academic structure management

  **Programs Table Changes** (6 new fields):
  - `program_type` VARCHAR(10) - Program level: UG, PG, Ph.D (nullable)
  - `display_name` TEXT - Alternative display name (nullable)
  - `program_order` INTEGER - Sort order for UI display (default: 0)
  - `program_duration_yrs` NUMERIC(3,1) - Duration in years (nullable, must be > 0)
  - `pattern_type` VARCHAR(10) - Academic pattern: Year/Semester (nullable)
  - `is_part_time` BOOLEAN - Part-time program flag (default: false)

  **Semesters Table Changes** (4 new fields):
  - `semester_order` INTEGER - Chronological order (default: 1)
  - `initial_semester` BOOLEAN - First/entry semester flag (default: false)
  - `terminal_semester` BOOLEAN - Final/exit semester flag (default: false)
  - `semester_group` VARCHAR(50) - Grouping label (nullable)

  **Indexes Created**:
  - `idx_programs_type_order` - Programs filtered by type and order (partial)
  - `idx_programs_pattern_type` - Programs filtered by pattern type (partial)
  - `idx_semesters_order` - Semesters ordered by program
  - `idx_semesters_initial` - Initial semesters by program (partial)
  - `idx_semesters_terminal` - Terminal semesters by program (partial)
  - `idx_semesters_group` - Semesters filtered by group (partial)

  **Impact**:
  - ✅ All new fields are optional/nullable (backward compatible)
  - ✅ TypeScript types updated in `types/organizations.ts`
  - ✅ API endpoints automatically support new fields via spread operator
  - ✅ Enhanced filtering and sorting capabilities
  - ✅ Better UI/UX control for program and semester displays
  - ✅ Supports year-based and semester-based academic patterns

  **Files Updated**:
  - `setup/01_tables.sql` - Updated table definitions with new columns
  - `types/organizations.ts` - Added new fields to interfaces and DTOs
  - `migrations/add_program_semester_enhanced_fields.sql` - Migration file

### 2025-11-28: Add Academic Year to Admissions Table

- **File**: `migrations/add_academic_year_to_admissions.sql` ✅ **APPLIED**

  **Purpose**: Move Academic Year field from Learner Onboarding to Admission page

  **Changes**:
  - Added `academic_year_id` column (UUID) to `admissions` table
  - Added foreign key reference to `academic_years` table
  - Created index `idx_admissions_academic_year_id` for performance

  **Workflow Change**:
  - **Before**: Academic Year was entered during Learner Onboarding (after admission approval)
  - **After**: Academic Year is captured during Admission process and automatically copied to Student record

  **Impact**:
  - ✅ Academic Year field now available on Admission form (Course Selection tab)
  - ✅ Students created from approved admissions inherit `academic_year_id`
  - ✅ Reduces onboarding steps if academic year was set during admission
  - ✅ Backward compatible - existing admissions have NULL academic_year_id

### 2025-02-07: Bug Report Display ID Race Condition Fix 🚨 CRITICAL

- **File**: `migrations/20250207_fix_bug_report_display_id_race_condition.sql` ✅ **APPLIED**

  **Problem Solved**:
  - Fixed race condition causing "Unable to generate report ID" errors
  - Eliminated ~87% failure rate during concurrent bug submissions
  - Gap of 2,062 between actual reports (306) and max ID (2368) proved the issue

  **Solution**:
  - Replaced `SELECT MAX()+1` pattern with PostgreSQL SEQUENCE
  - Created `bug_reports_display_id_seq` starting at 2369
  - Updated `generate_bug_display_id()` to use atomic `nextval()` operation
  - Recreated triggers to use new function

  **Impact**:
  - ✅ Zero race conditions (atomic database operations)
  - ✅ Perfect concurrency handling (unlimited simultaneous users)
  - ✅ No more user-facing errors
  - ✅ Consecutive IDs with no gaps (except deletions)

  **Testing**:
  - Verified 10 consecutive unique IDs generated successfully
  - Confirmed trigger functioning correctly
  - Sequence properly configured and indexed

  **Files Updated**:
  - `setup/02_functions.sql` - Updated function to use SEQUENCE
  - `migrations/20250207_fix_bug_report_display_id_race_condition.sql` - Migration file

### 2025-01-16: Leave Permissions Migration to Academic Format

- **File**: `migrations/update_leave_permissions_to_academic_format.sql` ✅ **APPLIED**

  **Purpose**: Fix permission key mismatch preventing HOD and other users from accessing Leave Management module

  **Problem**:
  - Sidebar menu requires `academic.leaves.view` permission
  - Permission constants defined as `leave.view`
  - Database roles had old `leave.*` permission keys
  - Mismatch prevented menu from showing even when permissions were granted

  **Solution**:
  - Created transformation function to migrate all leave permission keys
  - Updated 3 roles: admission, hod, student
  - Transformed basic permissions: `leave.view` → `academic.leaves.view`, etc.
  - Consolidated settings permissions: `leave.types.*`, `leave.workflows.*`, `leave.settings.*` → `academic.leaves.manage`
  - Migrated approval permissions: `leave.approve.*` → `academic.leaves.approve.*`
  - Migrated report permissions: `leave.reports.*` → `academic.leaves.reports.*`
  - Migrated analytics permissions: `leave.analytics.*` → `academic.leaves.analytics.*`

  **Impact**:
  - ✅ HOD role now has 15 academic.leaves.* permissions
  - ✅ All old `leave.*` keys removed from database
  - ✅ Menu visibility now works correctly for granted permissions
  - ✅ Zero breaking changes (only key format changed)
  - ✅ Backward compatible with existing permission checks

  **Files Updated**:
  - `lib/constants/permissions.ts` - Updated permission definitions
  - `migrations/update_leave_permissions_to_academic_format.sql` - Database migration
  - `custom_roles` table - Updated permissions JSONB for 3 roles

### 2025-01-30: Resource Management - Missing Fields Implementation

- **File**: `migrations/20250130_add_missing_resource_fields.sql` ✅ **APPLIED**

  - Added structured vendor address fields:
    - `vendor_address_line1`, `vendor_address_line2`
    - `vendor_city`, `vendor_state`, `vendor_zip`
    - `vendor_contract_details`, `vendor_support_contact`
  - Added lifecycle management fields:
    - `depreciation_rate` (%, 0-100)
    - `current_value` (current estimated value)
    - `disposal_date` (planned retirement date)
  - Created indexes for disposal_date and vendor_city
  - Dropped old `vendor_address` column (replaced with structured fields)

### 2025-01-30: Resource Management Module Update

- **File**: `migrations/20250130_update_resources_table.sql` ✅ **APPLIED**

  - Added missing columns to `resources` table:
    - `caretaker_user_ids TEXT[]` - Array of staff IDs
    - `name`, `subcategory_id`, location fields, vendor fields
    - `booking_config`, `approval_config`, `reminder_config` JSONB
    - `image_urls`, `tags`, `access_roles` arrays
    - Usage tracking fields
  - Created indexes for better performance

- **File**: `migrations/20250130_create_resource_storage_bucket.sql` ✅ **APPLIED**
  - Created `resource-images` storage bucket
  - Set up RLS policies for image upload/access
  - Configured 5MB file size limit
  - Allowed image MIME types only

### 2025-01-27: Fix Sync Missing Profiles - Add learner_id to profiles

- **File**: `migrations/20250127_add_learner_id_to_profiles.sql` ✅ **APPLIED**

  **Purpose**: Fix "Sync Missing Profiles" functionality by adding bidirectional link between profiles and learners_profiles tables

  **Problem Solved**:
  - Profiles were created but not linked to learners (missing `learner_id`)
  - Students couldn't see their own profiles (filter by `learner_id` failed)
  - Sync function reported same missing profiles repeatedly
  - RLS policies failing (relied on non-existent `learner_id`)
  - Missing `department_id` in profile creation logic

  **Changes**:
  - Added `learner_id UUID` column to `profiles` table with foreign key to `learners_profiles(id)`
  - Added `department_id UUID` column to `profiles` table with foreign key to `departments(id)`
  - Created 3 indexes:
    - `idx_profiles_learner_id` - Fast lookup by learner
    - `idx_profiles_learner_id_unique` - Prevent duplicate profiles per learner (unique constraint)
    - `idx_profiles_department_id` - Department-level queries
  - Backfilled existing profiles:
    - Matched by `LOWER(email)` for case-insensitive comparison
    - Set `learner_id` for active/inactive/exited students
    - Set `department_id` from learners_profiles

  **Code Changes**:
  - Updated `app/api/learners/create-missing-profiles/route.ts`:
    - Added `learner_id: learner.id` to profile creation
    - Added `department_id: learner.department_id` to profile creation
    - Fixed phone field: `learner.mobile` → `learner.student_mobile`
  - Updated `app/api/learners/complete-onboarding/route.ts`:
    - Added `learner_id: learner.id` to profile creation
  - Updated `supabase/setup/01_tables.sql`:
    - Added `learner_id UUID` and `department_id UUID` columns to profiles table definition
  - Updated `types/auth.ts`:
    - Added `learner_id: string | null` to Profile interface

  **Impact**:
  - ✅ Profiles now properly linked to learners
  - ✅ Students can see their own profiles
  - ✅ Sync function works correctly
  - ✅ RLS policies function properly
  - ✅ Fast joins between profiles ↔ learners_profiles
  - ✅ Referential integrity maintained
  - ✅ Department-level filtering enabled

  **Files Updated**:
  - `supabase/migrations/20250127_add_learner_id_to_profiles.sql` (NEW)
  - `supabase/setup/01_tables.sql` (Updated profiles table)
  - `app/api/learners/create-missing-profiles/route.ts` (Added learner_id, department_id, fixed phone field)
  - `app/api/learners/complete-onboarding/route.ts` (Added learner_id)
  - `types/auth.ts` (Added learner_id to Profile interface)
  - `docs/fixes/2025-01/2025-01-27-FIX-sync-missing-profiles.md` (NEW - Documentation)

### 2025-01-27: Sync Profile Data from Learners (Role, Institution, Department)

- **Migration**: `fix_duplicate_learner_ids` + `sync_existing_profile_data_from_learners` + `add_unique_constraint_learner_id` ✅ **APPLIED**

  **Purpose**: Ensure profiles stay in sync with learner data (role, institution_id, department_id)

  **Problem Solved**:
  - Students showing with wrong role ('guest', 'faculty' instead of 'student')
  - Profiles had wrong institution_id (not matching learner's institution)
  - Profiles had wrong department_id (not matching learner's department)
  - Duplicate profiles with same learner_id (2 cases found and fixed)

  **Changes Applied**:
  1. **Fixed duplicate learner_ids**:
     - Found 2 profiles with duplicate learner_id values
     - Cleared learner_id from profiles with mismatched emails
     - Re-backfilled with correct email matching

  2. **Created sync function** - `sync_profile_data_from_learners()`:
     ```sql
     CREATE OR REPLACE FUNCTION sync_profile_data_from_learners()
     RETURNS INTEGER
     -- Updates role, institution_id, department_id from learners to profiles
     -- Returns count of profiles updated
     ```

  3. **One-time data sync**:
     - Fixed 3 profiles with wrong role (faculty→student, guest→student)
     - Fixed 2 profiles with wrong institution_id
     - Fixed 2 profiles with wrong department_id

  4. **Added unique constraint**:
     - `idx_profiles_learner_id_unique` - Prevents duplicate profiles per learner

  **Function Details**:
  - **Name**: `sync_profile_data_from_learners()`
  - **Returns**: INTEGER (count of profiles updated)
  - **Security**: SECURITY DEFINER
  - **Permissions**: Granted to authenticated and service_role
  - **Called by**: Sync Missing Profiles API + can be called manually

  **Profiles Fixed**:
  | Email | Issue | Status |
  |-------|-------|--------|
  | vijayabharathyrpcse2022@jkkn.ac.in | Role: faculty → student | ✅ |
  | jeevananthame24uba@jkkn.ac.in | Role: guest → student | ✅ |
  | keerthana23ucsai@jkkn.ac.in | Role: guest → student | ✅ |
  | roshinia25uen@jkkn.ac.in | Institution & Department synced | ✅ |
  | soundharyan25uen@jkkn.ac.in | Institution & Department synced | ✅ |

  **Code Changes**:
  - Updated `app/api/learners/create-missing-profiles/route.ts`:
    - Added call to `sync_profile_data_from_learners()` before creating new profiles
    - Ensures existing profiles stay in sync on every sync operation

  **Impact**:
  - ✅ All profiles with learner_id now have correct role='student' (100%)
  - ✅ All profiles with learner_id have correct institution_id (100%)
  - ✅ All profiles with learner_id have correct department_id (100%)
  - ✅ No duplicate learner_ids (unique constraint enforced)
  - ✅ Automatic sync on every "Sync Missing Profiles" button click
  - ✅ Students get correct role-based permissions
  - ✅ Accurate analytics and reporting by institution/department

  **Verification**:
  ```sql
  -- Test the function
  SELECT sync_profile_data_from_learners(); -- Returns: 0 (all synced)

  -- Verify no issues
  SELECT COUNT(*) FROM profiles p
  INNER JOIN learners_profiles lp ON p.learner_id = lp.id
  WHERE p.role != 'student'
     OR p.institution_id IS DISTINCT FROM lp.institution_id
     OR p.department_id IS DISTINCT FROM lp.department_id;
  -- Returns: 0 (all correct)
  ```

  **Files Updated**:
  - `app/api/learners/create-missing-profiles/route.ts` (Added sync call)
  - Database: Created function `sync_profile_data_from_learners()`
  - Database: Applied 3 migrations (fix duplicates, sync data, add unique constraint)
  - `docs/fixes/2025-01/2025-01-27-FIX-sync-profile-data-from-learners.md` (NEW - Documentation)

---

### **2026-01-28: Learner-Profile Sync Enhancement**

**Issue**: College email updates in `learners_profiles` didn't sync to `profiles` table, roles stuck as 'guest', no mismatch detection.

**Solution**: Three-layer fix for comprehensive synchronization:

1. **Enhanced Service Layer** (`lib/services/learner-profile-service.ts`):
   - Smart profile lookup (by email, then learner_id fallback)
   - Syncs ALL fields: email, role, is_active, learner_id, institution_id, department_id
   - Comprehensive logging for debugging

2. **Database Triggers** (AUTO-SYNC):
   - `trg_sync_learner_email_to_profile`: Auto-syncs college_email changes
   - `trg_sync_learner_status_to_profile`: Auto-syncs lifecycle_status to is_active
   - Handles orphaned profile linking

3. **Diagnostic & Repair Tools**:
   - `scripts/debug-learner-profile-sync.ts`: Detect mismatches
   - `scripts/repair-learner-profile-sync.ts`: Auto-fix issues
   - `scripts/LEARNER_PROFILE_SYNC_GUIDE.md`: Complete usage guide

**Database Changes**:
```sql
-- New Functions (02_functions.sql)
CREATE FUNCTION sync_learner_email_to_profile() -- Syncs email, role, org data
CREATE FUNCTION sync_learner_status_to_profile() -- Syncs is_active status

-- New Triggers (04_triggers.sql)
CREATE TRIGGER trg_sync_learner_email_to_profile -- On INSERT/UPDATE college_email
CREATE TRIGGER trg_sync_learner_status_to_profile -- On UPDATE lifecycle_status
```

**Results**:
- ✅ Email changes automatically sync to profiles table
- ✅ User roles correctly set to 'student'
- ✅ Orphaned profiles automatically linked
- ✅ is_active status always matches lifecycle_status
- ✅ Comprehensive logging and diagnostics
- ✅ Automatic repair tools available

**Usage**:
```bash
# Detect issues
npx tsx scripts/debug-learner-profile-sync.ts

# Fix issues (dry run first)
npx tsx scripts/repair-learner-profile-sync.ts --dry-run
npx tsx scripts/repair-learner-profile-sync.ts
```

**Files Updated**:
- `lib/services/learner-profile-service.ts` (Enhanced syncProfileStatus function)
- `supabase/setup/02_functions.sql` (Added 2 sync functions)
- `supabase/setup/04_triggers.sql` (Added 2 triggers, total: 75)
- `scripts/debug-learner-profile-sync.ts` (NEW - Diagnostic tool)
- `scripts/repair-learner-profile-sync.ts` (NEW - Repair tool)
- `scripts/LEARNER_PROFILE_SYNC_GUIDE.md` (NEW - Complete guide)
- `docs/fixes/2026-01/2026-01-28-FIX-learner-profile-sync-issues.md` (NEW - Root cause analysis)

---

### **2025-01-31: Advanced Learner Analytics Schema Update**

**Purpose**: Add database support for 4 new analytics categories: Intake & Capacity, Geography, Trends, and School Feeders

**Database Changes**:

1. **learners_profiles table** (5 new columns):
   - `school_type TEXT` - Classification: government, aided, private, cbse, icse, state_board
   - `school_district TEXT` - School's district location
   - `school_taluk TEXT` - School's taluk location
   - `medium_of_instruction TEXT` - english, tamil, both
   - `location_type TEXT` - urban, semi_urban, rural (auto-classified)

2. **programs table** (3 new columns):
   - `sanctioned_intake INTEGER` - Approved intake capacity (default: 0)
   - `actual_intake INTEGER` - Current admitted students (default: 0)
   - `academic_year_id UUID` - Link to academic year

3. **intake_history table** (NEW):
   - Tracks historical intake data for 3-year stability index calculations
   - Columns: institution_id, program_id, academic_year_id, sanctioned_intake, actual_intake, waitlist_count, dropout_count
   - Unique constraint on (program_id, academic_year_id)
   - 3 indexes for analytics queries (program, year, institution)

4. **Indexes Created** (4 new):
   - `idx_learners_profiles_school_type` - Filter by school type
   - `idx_learners_profiles_location_type` - Filter by location classification
   - `idx_learners_profiles_medium_instruction` - Filter by medium
   - `idx_programs_academic_year` - Program capacity by year

5. **RLS Policies** (4 new for intake_history):
   - SELECT, INSERT, UPDATE policies based on user_institution_access
   - DELETE policy restricted to admin access_type

**Analytics Enabled**:
- ✅ Intake & Capacity Analytics (seat utilization, over-intake alerts, waitlist conversion, 3-year stability)
- ✅ Geography Analytics (district/taluk contribution, hostel ratios - data already 100% available)
- ✅ Trend Analytics (gender ratio, category mix, first-generation, income distribution)
- ✅ School Feeder Analytics (feeder institution tracking, school type classification)

**Impact**:
- All new fields are optional (backward compatible)
- Existing 3,506 learner profiles need data migration for analytics fields
- Data migration scripts to populate school_type, location_type automatically
- Intake history seeding script to backfill last 3 years

**Next Steps**:
- Create TypeScript types for analytics interfaces
- Implement advanced analytics service layer
- Build API routes and React Query hooks
- Create UI components for 4 new analytics tabs
- Run data migration scripts

**Files Updated**:
- `supabase/setup/01_tables.sql` - Added columns, table, indexes
- `supabase/setup/03_policies.sql` - Added RLS policies for intake_history
- `supabase/SQL_FILE_INDEX.md` - Updated table count, added changelog

---

### 2026-03-13: Expo Module (Education Fairs & Exhibitions)

### Expo Module (Education Fairs)
- **Tables** (01_tables.sql): `expo_masters`, `expo_events`, `expo_event_team_members`, `expo_daily_reports`
- **Policies** (03_policies.sql): Institution-scoped RLS for all 4 tables
- **Triggers** (04_triggers.sql): `update_expo_team_count`, `update_expo_report_totals`, `updated_at` triggers
- **FK Addition**: `admission_leads.expo_event_id` → `expo_events(id)`
- Added: 2026-03-13

---

### 2026-03-16: BYOW WhatsApp Personal Messaging

- **Tables** (01_tables.sql): `wa_personal_connections`, `wa_personal_message_logs`
- **Policies** (03_policies.sql): Department-scoped RLS (via profiles.department_id) with super_admin/is_super_admin bypass and admission custom role access for both tables (7 policies total)
- **Triggers** (04_triggers.sql): `wa_personal_connections_updated_at`, `wa_personal_message_logs_updated_at`
- **Indexes**: 2 on connections (department, status), 5 on message_logs (department, connection, lead, sent_at DESC, status)
- **Purpose**: BYOW (Bring Your Own WhatsApp) personal messaging for admission module — tracks QR-based WhatsApp connections per department and logs all messages sent
- **Key columns**: `department_id` (FK to departments), `client_id` (Railway multi-client routing)
- Added: 2026-03-16
- Updated: 2026-03-18 — Changed from institution_id to department_id scoping, added client_id column

---

### 2026-03-17: Marketing Leads Database

- **Tables** (01_tables.sql): `marketing_leads_database`
- **Policies** (03_policies.sql): Institution-scoped RLS with super_admin bypass and admission role access (4 policies: select, insert, update, delete)
- **Indexes**: 5 (institution, batch, district, mobile_number, created_at DESC)
- **Purpose**: Bulk-uploaded lead data for admission marketing campaigns — stores student contact info from CSV/Excel uploads with batch tracking

| 2026-03-17 | Added `marketing_leads_database` table for bulk lead uploads in marketing module |

---

**Remember: ONE file per object type, NO duplicates, ALWAYS update existing files!**

---

### 2026-03-19: Sarvam Galatta Event Registrations

- **Tables** (01_tables.sql): `sarvam_galatta_registrations`
- **Policies** (03_policies.sql): 4 policies — `sgr_select_own`, `sgr_insert_own`, `sgr_update_own`, `sgr_all_super_admin`
- **Indexes**: 5 (event_id, learner_id, registration_id, snap_institution_id, submitted_at DESC)
- **Purpose**: Specialized 1:1 extension of `event_registrations` for Sarvam Galatta event — stores project URLs (project, GitHub, Supabase), API keys (Gemini required, Maps optional), and a snapshot of the student's learner profile hierarchy at registration time
- **Key columns**: `registration_id` (UNIQUE FK to event_registrations), `learner_id`, `snap_*` columns (profile snapshot), `gemini_api_key` (NOT NULL), `last_edited_at` (edit tracking)
- **Event record**: `startup_events.id = ad357482-7087-4390-ac75-ad4c13838d4f` (config.registration_type = 'sarvam_galatta')

| 2026-03-19 | Added `sarvam_galatta_registrations` table + RLS for Sarvam Galatta startup event registration |

### Admission Form Builder (2026-04-08)
- Tables: `admission_form_templates`, `admission_forms`, `admission_form_sections`, `admission_form_fields`, `admission_form_submissions`, `admission_form_events`
- Location: `supabase/setup/01_tables.sql` (appended)
- Purpose: Dynamic public admission form builder with submissions flowing to leads

### Meeting Routing Substrate (2026-06-11)
- Tables: `meeting_routing_config` (repo-sync of live table), `meeting_routing_log` (round-robin pick audit + visitor answers per routed booking)
- Column: `jicate_booking_meeting_types.host_profile_id` (links per-counselor Cal.com EventTypes to MyJKKN profiles)
- Location: `supabase/migrations/20260611170000_meeting_routing_substrate.sql` (applied live via exec_sql 2026-06-11)
- Purpose: Public routed-booking form at /book/[slug] — MyJKKN-side round-robin (least_loaded on admission_counselors.current_leads) over a headless Cal.com. Writes via service-role only; staff read via RLS.

### Native Scheduling Engine — Phase N1 (2026-06-11)
- Tables: `meeting_host_schedules`, `meeting_schedule_windows`, `meeting_schedule_overrides`, `meeting_types`, `meeting_bookings`
- Location: `supabase/migrations/20260611190000_native_scheduling_engine.sql` (applied live via exec_sql 2026-06-11)
- Purpose: In-house scheduling engine replacing Cal.com (jicate-booking). Times stored as minutes-since-midnight in schedule TZ; gist EXCLUSION constraint `mb_no_double_booking` makes double-booking impossible for confirmed rows (verified live: overlap → 23P01; cancelled rows don't block). Multi-tenant via institution_id. Requires btree_gist extension.

### Meeting Routing Log — native linkage (2026-06-11)
- Column: `meeting_routing_log.meeting_type_id` (uuid → meeting_types)
- Location: `supabase/migrations/20260611200000_meeting_routing_log_native_link.sql` (applied live)
- Purpose: Phase N2 — routed bookings reference native meeting_types; cal_booking_uid column now stores native uids for new rows.

### Universal Booking Substrate — U1 (2026-06-12)
- Tables: `meeting_host_pages` (public page config: handle UNIQUE + reserved-word CHECK, is_public opt-in, auto_hidden), `meeting_host_google_connections` (per-host Google link, pgp-encrypted refresh token, status active/broken/revoked)
- Functions: `fn_set_google_cal_token`, `fn_get_google_cal_token`, `fn_clear_google_cal_token` — SECURITY DEFINER, `search_path = public, extensions` (pgcrypto), service_role-ONLY execute (cal-vault pattern)
- Columns: `meeting_types.location_mode` (in_person/phone/online; admission-counseling set to phone) + `location_text`; `meeting_bookings.video_url`, `google_event_id`, `attendee_profile_id`, `rescheduled_at`, `reschedule_count`, `previous_start_time`
- Data: `meetings.view` granted to all staff-type roles (exclusion-list: learner/external/vendor/deprecated roles)
- Location: `supabase/migrations/20260612090000_universal_booking_substrate.sql` (NOT yet applied — ships dark; apply at merge)
- Purpose: Universal Booking module substrate — anyone books Senior Learners/staff. Spec: specs/universal-booking-module-2026-06-12.md (20 decisions). Public exposure requires opt-in + active Google connection (D20).

### PDE <-> BoS Outcome Connector (2026-06-11)
- Columns: `pde_demonstrations.bos_syllabus_id` (uuid → bos_course_syllabi, version-pinned at submission), `pde_demonstrations.vac_course_id` (uuid → vac_courses, course-level VAC lane), `pde_demonstrations.clo_refs` (jsonb, learner-proposed CLO numbers), `pde_demonstrations.clo_refs_confirmed` (jsonb, validator-confirmed — attainment reads this only)
- Policy rows: `pde.obe.po_weight_map` ({"H":1.0,"M":0.5,"L":0.25}), `pde.obe.clo_tag_cap` (2)
- Location: `supabase/migrations/20260611230000_pde_bos_clo_connector.sql` (applied live via Management API 2026-06-11)
- Purpose: Link PDE demonstrations to the curriculum outcome they evidence (BoS CLOs for autonomous colleges, VAC courses for all); CLO/PO attainment computed from validated evidence. Spec: specs/pde-bos-outcome-connector-2026-06-11.md

### PDE Curriculum Read RPCs (2026-06-11)
- Functions: `fn_pde_list_approved_syllabi()`, `fn_pde_get_syllabus_outcomes(uuid[])`, `fn_pde_list_vac_courses()` — all SECURITY DEFINER, REVOKE anon/PUBLIC + GRANT authenticated
- Location: `supabase/migrations/20260611233000_pde_curriculum_read_rpcs.sql` (applied live via Management API 2026-06-11)
- Purpose: Scoped curriculum reads for the PDE connector. Live-discovered gap: bos_course_syllabi RLS requires BoS board membership and vac_courses RLS requires user_institution_access — learners/non-BoS validators can't read either. RPCs expose picker-minimal columns, own-institution scoped (admins also pass on outcomes fn).

### VAC Content Migration + Universal Picker (2026-06-12)
- Data: staging→prod content copy — vac_courses 1→93 (dark), vac_lessons 1→2,717, vac_course_programmes 0→85; via `scripts/vac-migrate-staging-content.sh` (psql pooler, Director-authorized interview decisions in specs/vac-staging-fk-mapping-audit-2026-06-11.md §8)
- Function: `fn_pde_list_vac_courses()` — now own-institution OR universal (institution_id IS NULL)
- Index: `vac_courses_code_key` UNIQUE(code) — staging parity + double-run guard
- Location: `supabase/migrations/20260612084500_vac_universal_picker_and_code_unique.sql` (applied live 2026-06-12)

### PDE Validation SLA Policy (2026-06-12)
- Policy row: `pde.scoring.validation_sla_days` = 7 (global, number, system, tunable without deploy)
- Location: `supabase/migrations/20260612190000_pde_validation_sla_policy.sql` (applied live via Management API 2026-06-12)
- Purpose: Connector PR 2 — bounds time-to-first-acknowledgment for PDE demonstrations (aging badge + latency/coverage KPIs on /pde/admin/demonstrations). CARE audit corrective move A (A3 scored 1).

### Family Moments Engine (2026-06-12)
- Tables: `family_moments_campaigns` (occasion per institution) + `family_moments` (tokenized card per child per campaign) + storage bucket `family-moments` (public read, permission-gated write)
- Location: `supabase/migrations/20260711000000_family_moments_engine.sql`
- RLS: NO anon policies by design — public gift page reads server-side via service role keyed on unguessable token. Teacher writes via `moments.submissions.create`; dashboards via `moments.campaigns.view`.
- Seed: `scripts/moments/seed-fathers-day.ts` (2 campaigns + 456 pre-seeded auto-cards, NV CBSE + Matric HSS)

### CARE Audit Framework v1.0 (2026-06-12)
- Data: 20 system rows in `audit_parameter_catalog` — codes `CARE-C1`…`CARE-E5`, parameter_group 1–4 = pillar C/A/R/E, framework_mapping `{"care":"C1"}` (existing body→criterion shape), evidence_required from the framework doc
- Tables: `care_audit_scores` (cycle_id → audit_cycles CASCADE, scorer_role owner/participant, score 0–4 CHECK, UNIQUE(cycle,code,scorer)), `care_scorer_invites` (token UNIQUE default gen_random_bytes(24) hex, accepted_by claims, 14-day expiry)
- Functions: `fn_care_create_audit`, `fn_care_list_audits`, `fn_care_get_audit`, `fn_care_upsert_score`, `fn_care_create_invite`, `fn_care_get_invite_context`, `fn_care_submit_participant_scores`, `fn_care_is_cycle_owner` — all SECURITY DEFINER, REVOKE anon/PUBLIC + GRANT authenticated. ALL writes flow through RPCs (audit_cycles INSERT RLS needs audit.cycle.manage but any staff opens a CARE audit; learner second-scorer passes via token, not staff RLS)
- RLS: both tables SELECT-only direct policies (leadership + own rows); no direct write policies
- Location: `supabase/migrations/20260612180000_care_audit_framework.sql` (applied live via Management API 2026-06-12)
- Purpose: Digitize the JKKN CARE Audit Framework v1.0 inside /audit — 20-item 0–4 scoring, two-scorer blind variance, pillar/index/gap-rule math, corrective moves as findings. Spec: specs/care-audit-module-spec-2026-06-12.md

### AI Pulse Department Interventions (2026-06-16)
- Table: `ai_pulse_interventions` (id, dept_id, institution_id, cycle_id, tier, requested_by, note, created_at) — append-only audit of HOD heatmap "Intervene" actions. Index `(dept_id, created_at DESC)` for the latest-per-dept "last intervened" grid hint.
- RLS: standardized pattern — SELECT is_super_admin/is_admin OR `aiPulse:dept.heatmap`; INSERT (authenticated) is_super_admin/is_admin OR `aiPulse:dept.intervene`. No UPDATE/DELETE. REVOKE anon/PUBLIC + GRANT SELECT,INSERT authenticated + NOTIFY pgrst reload.
- Location: `supabase/migrations/20260616120000_ai_pulse_interventions.sql` (NOT yet applied — apply via exec_sql/Management API at merge; the write + grid hint degrade to no-op until applied)
- Purpose: SOP last-mile fix #19 — give HOD interventions a durable record so the heatmap can show "last intervened" and governance has a trail (was notification-only).

### AI Pulse Live Polls (2026-06-17)
- Tables: `ai_pulse_polls` (id, cycle_id→startup_events, question, options jsonb [{id,label}], is_open, issued_at, closed_at, created_by, institution_id, created_at/updated_at — index `(cycle_id, issued_at)`) + `ai_pulse_poll_responses` (id, poll_id→ai_pulse_polls, profile_id, option_id, responded_at, UNIQUE(poll_id, profile_id)). Backs the live-session polls gate: polls_responded = COUNT(DISTINCT poll_id) per learner; gate passes iff ≥ min(3, polls_issued).
- Column note: cycle FK is `cycle_id` (NOT event_id) to match the pre-existing `live-session-service.getLiveSession` read (`.eq('cycle_id', …)`).
- RLS: polls SELECT = is_super_admin/is_admin OR `aiPulse:view.self`; polls INSERT/UPDATE = admin bypass OR `ai_pulse_champion` role (Champion + Co-Champion only, EXISTS user_roles→custom_roles, mirrors rotation-service.escalateAbsence). responses SELECT = own OR champion/admin; responses INSERT = own (profile_id = auth.uid()). REVOKE anon/PUBLIC + GRANT (polls SELECT,INSERT,UPDATE / responses SELECT,INSERT) authenticated + NOTIFY pgrst reload.
- Location: `supabase/migrations/20260617123300_ai_pulse_polls.sql` (NOT yet applied — supervisor applies via exec_sql/Management API before deploy; the Champion authoring control + real polls gate degrade to no-op/auto-pass until applied)
- Purpose: Give live polls real storage + a Champion authoring surface so polls_issued is no longer always 0 (the gate was auto-passing by construction). Director-approved spec 2026-06-17.

### PDE Faculty Review RPCs (2026-06-15)
- Functions: `fn_pde_review_queue(p_category text, p_status text)` (STABLE, enriched institution-scoped read of `pde_demonstrations` joined to `profiles` for the learner name; hides draft/withdrawn; mirrors the SELECT-RLS reviewer roles) and `fn_pde_validate_demonstration(p_demonstration_id uuid, p_decision text, p_raw_score numeric, p_notes text)` (VOLATILE, the only faculty write path — faculty RLS is SELECT-only; re-checks same-institution reviewer, enforces submitted/under_review → validated|rejected, appends validator id + note, sets raw_score on validate). Both SECURITY DEFINER, REVOKE anon/PUBLIC + GRANT authenticated.
- RLS: no table changes; reuses existing `pde_demonstrations` policies (learner own, faculty SELECT same-inst, super_admin all). Weighted scoring stays downstream (scoring engine writes weighted_score/passed).
- Location: `supabase/migrations/20260615170000_pde_faculty_review_rpcs.sql` (applied live via Management API 2026-06-15)
- Purpose: Back the rebuilt faculty Demonstration Reviews page (Option A — durable-value taxonomy). Resolves friction X1 (faculty surface now speaks the 7 durable-value categories learners submit under, not the legacy capability vocabulary). Decision doc: docs/modules/pde/2026-06-14-DECISION-pde-category-taxonomy-split.md

### Lock Privilege-Resolver Views + DDL Functions from anon (2026-06-16)
- Views locked (revoke anon+PUBLIC, keep authenticated+service_role): `v_privilege_memberships_effective` (8 client call sites) + 4 children `_resolver_privilege_{lc_members,manual,yuva_chapter_chairs,yuva_vertical_chairs}` — all `security_invoker=false`, so authenticated reads via the parent only.
- Functions locked (revoke anon+authenticated+PUBLIC, keep service_role; 0 app callers, DDL-executing, no internal guard): `privilege_source_register(...)`, `privilege_source_unregister(text)`, `_privilege_rebuild_effective_view()`.
- Durable fix: `REVOKE ALL ... FROM anon, PUBLIC` baked INTO `privilege_source_register` (after each `CREATE OR REPLACE VIEW _resolver_privilege_<kind>`) and `_privilege_rebuild_effective_view` (after the parent-view rebuild, both branches) — so every future source_kind is born locked. The original `20260422_privilege_source_registry_and_resolvers.sql` created these bare, inheriting Supabase's default anon grant; PR #1256's one-time revoke didn't survive view recreation.
- Location: `supabase/migrations/20260616000000_lock_privilege_resolver_views_and_fns_from_anon.sql` (applied live via Management API 2026-06-16; verified anon REST → HTTP 401 on views + RPC).
- Reference: reference_myjkkn_live_anon_exposure_2026_06_07, feedback_supabase_anon_execute_default_grant, CLAUDE.md "Lock new RPCs from anon".

### Anon EXECUTE Function Sweep — 383→34 (2026-06-16)
- Closes the 2026-06-07 sweep's last open item: ~383 non-ai_rpc SECURITY DEFINER functions were anon-executable (Postgres default PUBLIC EXECUTE grant + Supabase anon default grant). Now 34 remain anon-exec, all intentional: 29 RLS-gatekeeper functions (referenced in RLS policy expressions — anon must keep them or queries error) + 5 fn_get_policy* config readers (documented intentional-public).
- Phase 3a: 126 trigger functions → revoke anon+PUBLIC (trigger EXECUTE isn't checked when fired by a trigger; direct RPC errors anyway).
- Phase 3b Bucket A (7, service_role only): exec_sql_safe (arbitrary SQL — was anon-callable RCE), create_user_profile (arbitrary-role profile creation), get_rls_policies, get_tables_with_rls, ensure_usage_events_partitions, sync_user_role_enum, hr_policy_restore. Unguarded + dangerous → must NOT be granted to authenticated (would expose as direct PostgREST RPC to any logged-in user).
- Phase 3b Bucket B (213): revoke anon+PUBLIC, GRANT authenticated. Verified every caller is an authenticated session client or a service_role server route; none reached from a public/anon-browser page.
- Location: `supabase/migrations/20260616001000_lock_anon_execute_function_sweep.sql` (applied live via Management API 2026-06-16; verified anon REST → HTTP 401 on exec_sql_safe/create_user_profile/business fns; fn_get_policy* still anon-reachable).
- Follow-up (separate): add internal is_super_admin/permission guards to unguarded functions now authenticated-callable via direct REST (e.g. hr_policy_diff/history).

### Meeting Agenda Engine — PR1 generic agenda core (2026-06-21)
- Tables: `meeting_agendas` (id, booking_id→meeting_bookings ON DELETE CASCADE UNIQUE, host_profile_id→profiles [denormalized for flat host RLS], status draft|live|closed, ai_used, generated_at, created_at/updated_at) + `meeting_agenda_items` (id, agenda_id→meeting_agendas ON DELETE CASCADE, source manual|past_action|approval|kpi|project|ai_narrative [PR1 writes manual], title [1–300], body, link_ref, visibility all|host_only|private [PR1 writes all], order_index, created_at/updated_at; index (agenda_id, order_index)).
- RLS: SELECT-only for authenticated, mirroring meeting_bookings.mb_host_select — `is_super_admin() OR is_admin() OR host_profile_id = auth.uid()` (header) and an EXISTS-on-header host check (items). DELIBERATELY NO INSERT/UPDATE/DELETE policy: all writes flow through host-verified service-role server actions (app/(routes)/meetings/[uid]/agenda-actions.ts → MeetingAgendaService). REVOKE ALL FROM anon, PUBLIC + GRANT SELECT authenticated + NOTIFY pgrst reload.
- Scope: PR1 = MANUAL agenda surface on the booking detail page only (add/edit/reorder/delete). The wider source/visibility enums + status/ai_used/generated_at are the generic-core fields the later PRs populate (PR2 loop / PR3 adapters+per-viewer+delegate / PR4 AI narrative). Fresh core beside BoS (bos_agenda_items) — converge BoS later (spec §5).
- Location: `supabase/migrations/20260713000000_meeting_agenda_core_pr1.sql` (NOT yet applied at PR-open — additive new tables; apply via Management API at/after merge; the agenda card degrades to "No agenda yet" / write actions error until applied).
- Spec: specs/meeting-agenda-engine-2026-06-21.md. Service: lib/services/meetings/meeting-agenda-service.ts. UI: app/(routes)/meetings/[uid]/_components/agenda-section.tsx.

### Meeting Agenda Engine — PR2 action-item loop (2026-06-22)
- Table: `meeting_action_items` (id, booking_id→meeting_bookings ON DELETE CASCADE [source meeting], host_profile_id→profiles [denormalized for flat host RLS], decision_text, action_text [1–500], owner_label [PR2 free-text owner], owner_profile_id→profiles ON DELETE SET NULL [reserved for PR3 internal-owner resolution; PR2 leaves null], due_date, status open|done, created_at/updated_at; indexes (booking_id) + (host_profile_id, status); trigger meeting_action_items_set_updated_at → shared set_updated_at()).
- RLS: SELECT-only for authenticated, mirroring meeting_agendas — `is_super_admin() OR is_admin() OR host_profile_id = auth.uid()`. DELIBERATELY NO INSERT/UPDATE/DELETE policy: all writes flow through host-verified service-role server actions (app/(routes)/meetings/[uid]/action-item-actions.ts → MeetingActionItemService). REVOKE ALL FROM anon, PUBLIC + GRANT SELECT authenticated + NOTIFY pgrst reload.
- Scope: PR2 = after-meeting capture (decisions + action items, owner/due, mark done) + the PastActions adapter (MeetingActionItemService.listOpenCarryOver) surfacing OPEN items from a host's prior bookings with the same attendee_email onto the next meeting (the loop). PR3 generalizes matching to multi-attendee/roles + resolves owner_profile_id + adds per-viewer 'private' scoping.
- Location: `supabase/migrations/20260714000000_meeting_action_items_pr2.sql` (additive new table; apply via Management API at/after merge; the cards degrade to empty / write actions error until applied).
- Spec: specs/meeting-agenda-engine-2026-06-21.md §3–4. Service: lib/services/meetings/meeting-action-item-service.ts. UI: action-items-section.tsx (capture) + carried-over-section.tsx (loop).

### Social Loop Engine — playbook/memory table (2026-06-24)
- Table: `social_loop_playbook` (id, account_id→ig_accounts ON DELETE CASCADE, cycle_no INT, week_start DATE default now()::date, read_summary JSONB [READ snapshot at close], decide JSONB [{formatInstruction, barToBeat, nextInstruction, domainHypothesis}], learning TEXT [the one human change], created_by→profiles ON DELETE SET NULL, created_at/updated_at; UNIQUE (account_id, cycle_no); index idx_social_loop_playbook_account (account_id, cycle_no DESC)). One row per closed cycle per IG account = the department innovation loop's durable memory (Read→Decide→Act→Learn).
- RLS: dynamic-permission — SELECT=`is_super_admin() OR is_admin() OR user_has_permission('social.view')`, INSERT/UPDATE=`...OR user_has_permission('social.manage')`. anon hardened: REVOKE ALL FROM anon, PUBLIC + GRANT SELECT, INSERT, UPDATE TO authenticated. Writes gated to social.manage / admins.
- Location: `supabase/migrations/20260624031500_social_loop_playbook.sql` (idempotent; additive new table; apply via Management API at/after merge). Also mirrored into setup/01_tables.sql + setup/03_policies.sql.

### AI Model Config Adoption — seed 16 hardcoded Claude features (2026-07-02)
- Seed-only migration (no DDL, no new functions/RPCs): INSERT ... ON CONFLICT (feature_key) DO NOTHING for 16 new `ai_model_config` rows covering every hardcoded Anthropic call site (scf.generate_suggestions, scf.learner_notes, session_feedback.escalation, session_feedback.suggest_improvement, feedback.classify, induction.generate_playbook, induction.session_effectiveness, cdc.career_guidance → claude-sonnet-4-6; ai_query.natural_language, work_pulse.analyze → claude-sonnet-4-20250514; work_pulse.translate, attention_bar.assistant → claude-haiku-4-5-20251001; rcltp.question_generation → claude-sonnet-4-6 [EKSAQ-gated scaffold, no live call — forward-default]; admission.ai_service → claude-sonnet-4-5; admission.agentic_query, admission.ai_response → claude-3-5-haiku-20241022).
- Cutover invariant: every row = the model the code hardcodes today (verified per-file against jicate/main 2026-07-02) — applying this changes zero behavior; PR 2-4 wire the call sites through lib/services/platform/ai-clients/chat.ts afterwards.
- Drift fix: guarded UPDATE of `admission.ai_insights` from openai/gpt-4o-mini (aspirational 2026-05-12 seed, never adopted) to anthropic/claude-sonnet-4-5 (what app/api/admission/insights/generate/route.ts actually hardcodes). WHERE pins the old values so a deliberate UI change can't be clobbered.
- Location: `supabase/migrations/20260702120000_ai_model_config_adoption_seed.sql` (idempotent; apply via Management API at/after merge; until applied, getModelForFeature falls back to matching hardcoded entries in ai-model-config-service.ts FALLBACKS — same models, zero behavior change).
- Spec: specs/ai-model-config-adoption-2026-07-02.md. Substrate: 20260512000001_ai_model_config_substrate.sql. Wrapper: lib/services/platform/ai-clients/chat.ts.

### Max Lane request queue — "Run on Max" for AI routines (2026-07-03)
- New table `max_lane_requests` (id uuid pk, routine_id text, status pending|claimed|done|error, requested_by→auth.users, requested_at/claimed_at/completed_at, result_note) — a queue of on-demand "Run on Max" requests. RLS-enabled with **NO policies** (RPC-only); `REVOKE ALL FROM anon, authenticated`. Indexes: (status), (routine_id, requested_at DESC).
- 4 SECURITY DEFINER RPCs (all `SET search_path = public`): `fn_max_lane_request_run(text)→jsonb` (super_admin only, dedupes one live request per routine, returns {ok,request_id} or {ok:false,error:'already queued'}) + `fn_max_lane_requests_list()→setof` (super_admin only, last 20) — both `REVOKE anon,PUBLIC; GRANT authenticated`. `fn_max_lane_claim_pending()→setof` (atomic claim of ≤5 pending via `FOR UPDATE SKIP LOCKED`, plus stale-claim recovery flipping >60-min 'claimed' rows to 'error') + `fn_max_lane_complete(uuid,text,text)` — both service-role-restricted BY GRANT (`REVOKE anon,authenticated,PUBLIC; GRANT service_role`, mirroring `fn_ai_routine_claim_due`) AND by a runtime `request.jwt.claims->>'role'='service_role'` check.
- Context: the Director's Mac runs 3 routines on the Claude Max subscription (the "Max lane"); the /api/cron/* jobs are the fallback. Vercel can't reach the Mac, so the /admin/ai-routines UI inserts a request row (via fn_max_lane_request_run); a Mac-side service-role poller (built separately) claims + completes it. Registry entries flagged `maxLane:true`: scf-generate-suggestions, session-feedback-escalation, induction-generate-playbook.
- Location: `supabase/migrations/20260703083900_max_lane_requests.sql` (additive new table + fns; apply via Management API at/after merge — until applied, the "Run on Max" button + GET status return 404/500 and the UI simply shows no status). API: app/api/admin/ai-routines/max-run/route.ts. UI: app/(routes)/admin/ai-routines/_components/max-lane.tsx.

| `migrations/20260703093000_schools_network_feeders_rpc.sql` | Schools Network feeder-discovery RPC (read-through over learners_profiles + marketing_leads_database) | 2026-07-03 |

### Faculty-engagement adoption + hard-gate enforcement (DARK, compliance-gated) — 2026-07-04
- File: `supabase/migrations/20260731020000_scf_hard_gate_enforcement_and_coupling.sql` (NOT applied at PR-open — apply via Management API at/after merge, AND only after Director + legal/compliance review of the exam-eligibility coupling; spec risk R2).
- Spec: `specs/faculty-engagement-adoption-2026-07-04.md` (Director decisions LOCKED — max enforcement, informed of R1–R3).
- NON-DESTRUCTIVE INVARIANT: nothing here mutates `student_attendance.attendance_data`. Confirmation + effective-% are DERIVED, recomputable reads.
- `fn_scf_faculty_completion(date,date)` — DROP+recreate to ADD `start_time`/`end_time` (PR-A current-period spotlight) + `gate_mode` (resolved per session institution via `fn_get_policy_text`) + derived `session_status` (PR-C). `session_status='incomplete'` ONLY when `gate_mode='hard'` AND pending>0 AND within window → INERT until the config flip (dark). REVOKE anon,PUBLIC / GRANT authenticated.
- `fn_scf_notify_session_pending(date,uuid,text)` — PR-B faculty-triggered per-session nudge; reuses the `fn_scf_nudge_pending_learners` two-write (`notifications` + `user_notifications`) delivery path, assigned-faculty OR super-admin OR **same-tenant** admin (`is_admin() AND role_has_institution_access(session.institution_id)` — no cross-tenant nudge), identity-scoped, atomically idempotent per learner/session/day (`idempotency_key` includes `timetable_id`; `ON CONFLICT ... WHERE idempotency_key IS NOT NULL DO NOTHING`). `SET statement_timeout='20s'`. REVOKE anon,PUBLIC / GRANT authenticated.
- `fn_scf_set_gate_mode(text,uuid)` — PR-C super-admin BREAK-GLASS kill-switch; upserts the `session_feedback.gate_mode` platform_policies row (global or per-institution) via UPDATE-then-INSERT-if-absent (NOT `ON CONFLICT`, so the kill-switch cannot throw on index-inference; matches the coupling-flag seed pattern). Revert to `visibility`/`off` halts enforcement in one call, no deploy. super_admin ONLY. REVOKE anon,PUBLIC / GRANT authenticated.
- `fn_scf_effective_attendance(date,date,uuid,uuid,uuid,uuid)` — PR-D DERIVED "effective attendance %": per learner official % vs confirmed-only effective % (present-but-no-feedback lowers it). Read-only over `student_attendance` + `session_feedback`; NEVER writes `attendance_data`. Authz mirrors `fn_scf_confirmation_rollup` (no `is_admin()` scope bypass). Counts only — no feedback content. REVOKE anon,PUBLIC / GRANT authenticated.
- Seed: `session_feedback.attendance_coupling_enabled` global row, DEFAULT **FALSE** (dark). Gates the effective-% in `AttendanceConsolidationService.getEffectiveAttendanceCoupling`; while OFF nothing is computed and the official % is untouched. `session_feedback.gate_mode` default STAYS `visibility` (unchanged).
- Round-2 (deep-review) hardening — 2026-07-04 (no signature/shape change): (1) nudge tenant-scoped (above); (2) completion window anchored to IST (`attendance_date::timestamp AT TIME ZONE 'Asia/Kolkata'`) not server-UTC; (3) full session identity everywhere — `timetable_id` added to `fn_scf_effective_attendance`'s `DISTINCT ON` dedup key AND every `session_feedback` confirmation match (effective_attendance, faculty_completion, nudge) so two classes sharing a period slot on one day don't collapse/false-confirm; (4) `fn_scf_faculty_completion` gets `SET statement_timeout='20s'`; (5) faculty reward card counts (page) base numerator+denominator on answered sessions only (empty sessions no longer dilute/inflate); (6) nudge button/toast surface skipped-no-profile learners. Still fully DARK.
- Round-3 (deep-review) hardening — 2026-07-04: **SHAPE CHANGE** — NEW `fn_guard_gate_mode_super_admin_only()` (trigger fn, REVOKE anon,PUBLIC) + BEFORE INSERT/UPDATE trigger `trg_guard_gate_mode_super_admin_only` on `platform_policies`. Closes the arming/reverting **authz asymmetry**: `platform_policies` RLS is `is_super_admin() OR is_admin()`, so a tenant admin could set `session_feedback.gate_mode='hard'` and ARM enforcement while the break-glass revert is super-admin-only. Trigger rejects any AUTHENTICATED non-super-admin write to the `gate_mode` row (SQLSTATE 42501, checks NEW + OLD `policy_key` so the row can't be renamed-hijacked), scoped STRICTLY to that `policy_key`; service-role/migrations (`auth.uid() IS NULL`) and super-admins (incl. the break-glass RPC) pass unaffected. Also: (a) nudge `idempotency_key` day-part now IST (`(now() AT TIME ZONE 'Asia/Kolkata')::date`) not `CURRENT_DATE` (no double-nudge across IST midnight); (b) `fn_scf_faculty_completion` `ORDER BY` sorts on parsed time-of-day (`NULLIF(pv->>'start_time','')::time NULLS LAST`) not raw text. Page/component LOWs: reward card "at or above 3.5" copy, `goodSessions` gated on `responses>0`, honest notify toast (no stale `roster.length` fraction), Live Pulse `nowMin` re-ticks every 30s + `activeNow` handles midnight-crossing classes. Still fully DARK.
- Round-4 (deep-review) hardening — 2026-07-04 (no signature/shape change; migration still NOT applied): **(1) `::time` crash fix (round-3 regression)** — new helper `fn_scf_to_time_or_null(text)` (IMMUTABLE, REVOKE anon,PUBLIC / GRANT authenticated) parses mixed 24h/12h blob times, returns NULL (regex fast-reject + `EXCEPTION WHEN others` backstop) for unparseable/out-of-range values (`'TBD'`, `'24:70'`); `fn_scf_faculty_completion` `ORDER BY` now calls it instead of the bare `NULLIF(...)::time` that aborted the whole query on a non-time slot value. **(2) UUID cast guards** — every `(st->>'student_id')::uuid` in `fn_scf_faculty_completion` (confirmed_count EXISTS) and `fn_scf_notify_session_pending` (new validated `present_students` CTE) now wrapped in a CASE with the same UUID-shape regex as `fn_scf_effective_attendance`, so a malformed blob id becomes NULL (learner stays pending / un-nudged) instead of raising 22P02 and failing the view/nudge. **(3) coupling-flag arming guard (compliance)** — `fn_guard_gate_mode_super_admin_only()` extended to also guard `session_feedback.attendance_coupling_enabled` (checks NEW + OLD `policy_key` for BOTH keys); the exam-eligibility coupling flag is now super-admin-arm-only, symmetric with `gate_mode`. **(4)** `fn_scf_effective_attendance` re-checks `session_feedback.attendance_coupling_enabled` via `fn_get_policy_bool(...,p_institution_id)` and `RETURN`s zero rows when OFF (defense-in-depth; can't be bypassed by a direct RPC call). **(5)** `fn_scf_set_gate_mode` INSERT wrapped in `EXCEPTION WHEN unique_violation` → retry UPDATE (race-safe break-glass; still no `ON CONFLICT`). Page/component LOW: Live Pulse spotlight candidate selection filters `present_count>0` so a present-0 active class falls back to `nextUp` instead of suppressing the spotlight. Still fully DARK.
- Consumers: `lib/services/session-feedback-service.ts` (`notifySessionPending`), `lib/services/academic/attendance-consolidation-service.ts` (`getEffectiveAttendanceCoupling`), `hooks/use-session-feedback.ts` (`useNotifySessionPending`), `app/(routes)/academic/session-feedback/faculty/page.tsx` (status badge + reward card + notify), `app/(routes)/academic/session-feedback/_components/live-pulse-control.tsx` (current-period spotlight), `types/session-feedback.ts`, `lib/policies/keys.ts`.

### Foundation & Competitive-Exam Programme — shared exam spine (2026-07-05)
- New table `public.exam_definitions` — neutral shared exam entity referenced by BOTH CDC govt-readiness (level=college, linked via `cdc_training_type_id → cdc_training_types`) and the Foundation programme (level=school: NEET/JEE/CUET). Columns: id, config_key (unique), display_name, exam_family, level CHECK(school|college), cdc_training_type_id (nullable, ON DELETE SET NULL), is_active, sort_order, audit. RLS: read=`auth.uid() IS NOT NULL`; write=`is_super_admin() OR is_cdc_head_or_super()` (foundation_admin gate added when those roles land). Reuses `_touch_updated_at()`.
- Seeds 4 school exams (neet_ug, jee_main, jee_advanced, cuet_ug) + backfills 7 college exams from `cdc_training_types WHERE exam_family IS NOT NULL`. ADDITIVE — modifies NO cdc_* table (reads only). Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING). Reversible: `DROP TABLE public.exam_definitions`.
- Location: `supabase/migrations/20260705223000_exam_definitions_shared_spine.sql`. APPLIED to prod via Management API 2026-07-05 (verified: 7 college + 4 school rows; CDC intact 7/14/68). Stage 1 of 4 in the shared-spine merge (Foundation PR-A).
- Spec: `specs/nv-foundation-programme-TECH-SPEC-2026-07-05.md` §11 (safe merge plan).

### Foundation programme — student identity core (PR-B1) — 2026-07-06
- New tables `fp_students` (minors; school_id mutable=history-follows-student, profile_id/parent_profile_id links, learner_profile_id funnel handoff, parental_consent_at OPTIONAL), `fp_cohorts` (school + exam_definition_id + term + resource_person), `fp_enrollments` (student↔cohort, unique).
- 4 recursion-safe SECURITY DEFINER helpers (REVOKE anon,PUBLIC / GRANT authenticated): `fn_fp_manages_school`, `fn_fp_manages_cohort_school`, `fn_fp_teaches_student`, `fn_fp_is_own_or_guardian`.
- RLS on fp_students = minors' PII: **super-admin only (NO is_admin cross-tenant bypass)** + child/parent self (profile_id/parent_profile_id) + school mgmt (school_jkkn_owners) + teacher (cohort resource_person). Verified: impersonated non-super user sees 0 rows, no recursion.
- Consent is an OPTIONAL admin toggle: `platform_policies` row `foundation.require_parental_consent` = false (default OFF); app reads via `fn_get_policy_bool`. NOT a hard gate.
- Location: `supabase/migrations/20260706063000_fp_students_cohorts_enrollments.sql`. APPLIED to prod via Management API 2026-07-06 (verified). PR-B1 of the Foundation build.
- Permission keys to add in code: `foundation.students.manage`, `foundation.cohorts.view`, `foundation.cohorts.manage` (lib/constants/permissions.ts). Spec: `specs/nv-foundation-programme-TECH-SPEC-2026-07-05.md`.

### Foundation programme — item bank + assessments + shared topic map (PR-B2a) — 2026-07-06
- New tables: `exam_topic_map` (generalized exam→topic junction keyed to `exam_definitions`, additive companion to legacy `cdc_exam_topic_map` which stays on `cdc_training_types` until Stage-2/PR-C), `fp_items` (item bank, tagged exam+topic+difficulty, `source` = licensed|authored for hybrid sourcing; staff-only, holds answers), `fp_assessments` (diagnostic|practice|mock), `fp_assessment_items` (ordered junction).
- Seeds 4 school subject-topics into the SHARED `cdc_exam_syllabus_topics` (sch_physics/chemistry/biology/mathematics; Physics+Chem is_shared across NEET+JEE) + 9 `exam_topic_map` rows (NEET→P/C/B, JEE Main+Adv→P/C/M). Realizes Decision #1 (shared taxonomy) additively.
- RLS: content tables, permission-gated (`foundation.items.*`, `foundation.assessments.*`); `exam_topic_map` read any-authed. NO student PII here.
- Verified: 4 tables, 18 total topics (14 govt + 4 school), legacy `cdc_exam_topic_map` UNCHANGED (68 rows). Applied to prod via Management API 2026-07-06.
- Location: `supabase/migrations/20260706064000_fp_item_bank_assessments.sql`. Permission keys to add in code: `foundation.items.view/manage`, `foundation.assessments.view/manage`.

### Foundation programme — performance + diagnostic engine (PR-B2b) — 2026-07-06
- New PII tables: `fp_attempts` (student attempt at an assessment), `fp_responses` (per-item response + time_ms behavioural signal), `fp_student_weakness` (rolling per-topic mastery = the diagnostic MOAT; unique student+exam+topic), `fp_baselines` (movement-vs-baseline snapshot), `fp_revision_plans` (generated plan jsonb).
- 4 unified recursion-safe SECURITY DEFINER helpers (REVOKE anon,PUBLIC / GRANT authenticated): `fn_fp_can_view_student`, `fn_fp_can_manage_student`, `fn_fp_can_view_attempt`, `fn_fp_can_manage_attempt`.
- RLS (all 5 tables): read = `fn_fp_can_view_student/attempt` (super-admin only + student/guardian + teacher + school mgmt; NO is_admin cross-tenant bypass); write = manage helpers. Verified: impersonated non-super user sees 0 weakness + 0 attempts, no recursion.
- Direct student writes route through a future record-attempt RPC (SECURITY DEFINER); table writes gated to managers.
- Location: `supabase/migrations/20260706065000_fp_performance_diagnostic.sql`. Applied to prod via Management API 2026-07-06 (verified). Completes the Foundation DB layer (PR-A + PR-B1 + PR-B2a + PR-B2b).

### Foundation — unify college mappings into shared exam_topic_map (PR-C, DB step) — 2026-07-06
- Backfills the 68 college exam→topic mappings from legacy `cdc_exam_topic_map` into the shared `exam_topic_map` (via `exam_definitions.cdc_training_type_id`), making `exam_topic_map` the single unified junction (77 rows = 68 college + 9 school).
- ADDITIVE: does NOT modify `cdc_exam_topic_map` (still 68, CDC reads it unchanged). PARITY PROVEN: 0 CDC mappings unmirrored.
- Location: `supabase/migrations/20260706070000_exam_topic_map_backfill_college.sql`. Applied via Management API 2026-07-06 (verified).
- REMAINING (separate CODE PR, browser-verified): switch the 5 CDC consumers (`cdc/admin/exam-syllabus-topics`, `cdc/admin/exam-topic-map`, `cdc/govt-readiness`, `api/admin/cdc/exam-topic-map`, `lib/services/admin/cdc-admin-service.ts`, `types/admin/cdc.ts`) to read `exam_topic_map`; verify govt-readiness page + syllabus-overlap % identical; then DROP `cdc_exam_topic_map`. THIS is the one true live-CDC touch — do NOT ship without browser verification.

### Foundation programme — core RPCs (PR-B build) — 2026-07-06
- 4 SECURITY DEFINER RPCs (SET search_path=public; REVOKE anon,PUBLIC / GRANT authenticated): fn_fp_record_attempt(assessment,student,responses jsonb) [authz can_manage OR own/guardian + consent-flag gate + per-item scoring 0..1], fn_fp_recompute_weakness(student,exam) [upsert per-topic mastery], fn_fp_generate_revision_plan(student,exam) [weakest-5 + recommended items], fn_fp_student_progress(student,exam) [read, mastery vs latest baseline].
- Location: supabase/migrations/20260706071000_fp_rpcs.sql. Applied to prod via Management API 2026-07-06 (verified: 4 fns, all anon=false). Answer/chosen jsonb compare contract documented in-file (object-with-'correct' unwrap else IS NOT DISTINCT FROM).
- App/UI: app/(routes)/foundation/* (hub + faculty console + student diagnostic), lib/services/foundation/foundation-service.ts, hooks/foundation/use-foundation.ts. Permission keys added to lib/constants/permissions.ts ('Foundation Programme' category); sidebar entry + MENU_PERMISSIONS in lib/sidebarMenuLink.ts. Permissions must be assigned to a role via Role Management before the module is reachable.

### SCF weld — dedupe NULL-institution suggestions + NULL-proof dedupe index — 2026-07-08
- `scf_ai_suggestions`: deleted 206 exact duplicates (MR3691, NULL institution — the dedupe index left `institution_id` un-COALESCEd and btree UNIQUE treats NULLs as distinct, so the record-upsert INSERTed on every batch re-drain); backfilled `institution_id` where the course maps to exactly one institution in `session_feedback`; rebuilt `idx_scf_ai_suggestions_dedupe` with `NULLS NOT DISTINCT` (PG 15.6) so NULL keys conflict like values. `fn_scf_record_suggestion` unchanged (ON CONFLICT infers the rebuilt index).
- Location: `supabase/migrations/20260708013000_scf_dedupe_nullproof_index.sql`. Applied to prod via Management API 2026-07-08 (verified: 215→9 rows, 0 NULL institutions; measurer then produced first-ever outcomes: 383835 +0.36, MR3691 +0.18).

### SCF two-sided 48h feedback window (submission close + generator maturity) — 2026-07-09
- Director decision 2026-07-08 23:34–23:43: learner feedback CLOSES `session_feedback.window_hours` (48) after the class day; the AI note generator coaches ONLY on sessions whose window has closed, citing contributing session dates. BOTH sides read the ONE existing `platform_policies` lever `session_feedback.window_hours` via `fn_get_policy_int` (same lever as the completion/attendance fns — NO new config key). D2 gate unmoved: `fn_scf_effective_attendance` only ever counted within-window confirmations.
- Submission side: `fn_scf_submit_feedback` rejects past-window with an explicit message (never silent); `fn_scf_pending_for_learner` stops listing expired sessions; `fn_scf_nudge_pending_learners` only nudges open-window sessions (+ closing-window copy); `fn_scf_notify_session_pending` refuses the faculty poke once closed.
- Generator side: `fn_scf_candidate_windows` + `fn_scf_ai_signal` filter to closed-window sessions; `fn_scf_ai_signal` RETURNS gains `session_dates date[]` (DROP+CREATE, grants re-asserted: REVOKE anon/PUBLIC, GRANT service_role). Generators (Vercel cron + Max-lane runner) stamp `suggestion.contributing_dates`.
- Location: `supabase/migrations/20260709000100_scf_two_sided_48h_window.sql`. Pre-merge validation 2026-07-09: full migration dry-run in rolled-back txn on prod + JWT-claims behavioral tests (old submit rejected w/ message; fresh accepted; candidates 446→430; pending drops expired). Apply to prod AFTER the code PR deploys.

### CO/PO Attainment Loop spine — COE connector + OBE direct side (NBA loop, accreditation-loop PR-4, DARK) — 2026-07-09
- Feasibility recon (read-only vs COE prod + MyJKKN prod): COE marks grain = per-student × course × session (CIA components in `cia_marks_detailed_view`, declared results in `final_marks_detailed_view`); `marks_entry.question_wise_marks` exists but is 0/27,282 filled; NO assessment→CO or question→CO tagging anywhere in COE → true CO-tagged attainment IMPOSSIBLE today. CO sources: `bos_course_syllabi.course_learning_outcomes` (877/898 latest rows filled, only the 2 A&S colleges have BoS rows); CO→PO matrix EXISTS as `bos_course_syllabi.po_mappings` jsonb (835 rows) but `obe_program_outcomes` is empty and CO-grain attainment is blocked, so PO attainment out of scope. All 13 `obe_*` tables exist in prod at 0 rows.
- Config: 8 `platform_policies` rows `copo_attainment.*` — master_enabled=false (DARK); **threshold_pct is PER-COLLEGE** (Director 2026-07-09: 'Let each college choose'): global row = FALLBACK 60, institution-scoped override rows (scope_type='institution') win via the canonical `fn_get_policy` resolver — the backfill fn resolves target_percentage per institution and the cron resolves the meeting-threshold per course's institution (`threshold_pct_used` + `metadata.threshold_source` audit it per row); direct_weight=0.8 + indirect_weight=0.2 **RATIFIED by Director 2026-07-09** (indirect side remains OFF until poll data matures); target_level=2 + level bands 70/60/50 remain DEFAULTS awaiting ratification.
- `obe_course_attainment_rollup` — NEW course-grain rollup (one row per institution × course_code × COE session, UNIQUE on those three NOT NULL cols — `obe_co_attainment` can't hold the honest proxy: `co_id` NOT NULL + nullable-col unique index). `grain` CHECK ('course_proxy'|'co_tagged') + metadata `co_tagged:false` make the proxy machine-readable; RLS SELECT = accreditation.view + institution scope (admin bypass); writes RPC-only.
- `fn_copo_backfill_course_outcomes()` — idempotent BoS-CLO → `obe_course_outcomes` copy (ON CONFLICT (course_id, co_code) DO NOTHING; joined course_code AND institutions_id→institution_id tenant guard; newest-modified syllabus wins across dual-regulation is_latest rows; target_percentage read from config at runtime).
- `fn_copo_record_course_attainment(jsonb)` — upserts rollup rows computed by the cron (aggregation happens in TS — Postgres can't reach the COE project); owns level banding from config bands + trend delta vs the prior session (`prior_rollup_id`/`prev_attainment_pct`/`delta_pct`).
- `fn_copo_emit_attainment_evidence()` — no-ops unless master_enabled=true; upserts `quality_evidence_mappings` NAAC 7.3.d + NBA T1_CO per rollup row, loop_key `copo_attainment`, metadata `{loop_key, loop_name, grain, co_tagged, outcome{...}, delta_summary, measured_at}`, period_label 'AY YYYY-YY' June cutoff (inlined — no dependency on unmerged PR #1899's `fn_accreditation_ay_label`); never clobbers is_auto=false. All 3 fns SECURITY DEFINER, REVOKE anon/authenticated/PUBLIC, GRANT service_role ONLY (SCF loop-RPC pattern).
- Seeds: NAAC 7.3.d metric row (idempotent; identical text to sibling PR #1899 — either merge order safe) + NBA T1_CO (already in prod; repo parity). `ai_routine_schedules` row `copo-attainment` (weekly Sun 03:41 IST → 03:30 dispatcher slot). Cron route: `app/api/cron/copo-attainment/route.ts` (COE READ-ONLY); registry: `lib/ai-routines/misc-ai.ts`.
- BLOCKER for full CO-tagged attainment (documented, not faked): Academic Office must author assessment→CO maps; COE has no structure to hold them. `obe_assessment_co_marks`/`obe_learner_co_marks` are the ready substrate.
- Location: `supabase/migrations/20260709031000_copo_attainment_spine.sql`. Pre-merge validation 2026-07-09: full migration dry-run in rolled-back txn on prod + fn executions with real counts (see PR body). Apply to prod AFTER the code PR deploys.
### CDC Placement-Outcome loop — phase-1 MEASURE side + NAAC 8.2.1 emitter (gates ①③, DARK) — 2026-07-09
- NIRF GO (~20-25%) is placement/progression — the one NIRF lever JKKN can move. This ships MEASURE + evidence intake only; act/feed-forward (gates ②④) pend a named CDC owner (Director decision). NOT labeled self-improving anywhere.
- Config rows (platform_policies): `cdc_placement_loop.master_enabled=false` (DARK gate — route + fn both check), `cdc_placement_loop.min_cohort_size=10` (labeling threshold — cohorts below it are COMPUTED but flagged `small_cohort:true` in metrics + evidence metadata; Director decision 2026-07-09 'Compute, but label small group'). Both flagged Director-reviewable.
- New table `cdc_placement_outcome_cycles`: one row per (institution, program, passing-out AY) cohort per measure run — metrics jsonb (placement/higher-ed/progression rates, denominator_basis 'batch_roster'|'outcome_reported', median accepted package from cdc_placements), baseline jsonb (prior cohort, same estimator), delta_summary improved/no_change/worse/n-a (±2.0pp deadband on progression rate). UNIQUE (institution, program, cohort_ay_end, measure_window 'YYYY-MM' IST); change-only history (identical re-measures write nothing). RLS: read = is_super_admin OR is_admin OR is_cdc_staff; NO write policies (service-role only, cdc_placement_snapshots posture); REVOKE anon.
- Fns (SECURITY DEFINER, SET search_path=public, REVOKE anon/authenticated/PUBLIC, GRANT service_role): `fn_cdc_placement_cohort_metrics(inst,prog,ay_end)` (per-cohort metrics; numerator = alumni_outcomes with best-outcome-per-learner dedupe, June AY cutoff; denominator = GREATEST(batch-roster, outcome-reported) — batch_id only 46% filled on graduated learners, basis recorded) + `fn_cdc_placement_outcome_measure()` (run: enumerate cohorts from alumni_outcomes, small-cohort labeling (never skips), baseline delta, cycle upsert, NAAC '8.2.1' evidence upsert into quality_evidence_mappings ON CONFLICT(source_table,source_id,body_code,metric_code) DO UPDATE WHERE is_auto).
- Data reality at build (prod read-only, 2026-07-09): cdc_placements = 0 rows, alumni_outcomes = 0 rows, graduated learners = 1,004 (program/institution 100%, batch_id 46%). Machinery built dark; alumni_outcomes chosen as source (convergence point of both CDC→alumni bridges + only source with higher_studies, which 8.2.1 needs).
- Cadence: ai_routine_schedules row 'cdc-placement-outcomes' (Sun 03:15 IST — dispatcher has no monthly granularity; month-window idempotency makes it effectively monthly). Cron route: `app/api/cron/cdc-placement-outcomes/route.ts` (CRON_SECRET). Registry: appended to `lib/ai-routines/misc-ai.ts`.
- Location: `supabase/migrations/20260709032000_cdc_placement_outcome_measure.sql`. ROLLBACK-validated on prod 2026-07-09 (see PR). Apply to prod AFTER the code PR merges.
### Accreditation — NAAC catalog Binary-framework sync: Attribute 9+10 seeds, 8.1.1 fix, legacy crosswalk (catalog debt, PR-3) — 2026-07-09
- Framework: NAAC Reforms 2024 Binary Accreditation (deck pp.41-63). April seed covered Attributes 1–8 in depth (one starter row each for 9/10); this migration completes the ten-attribute catalog.
- Seeds `sh_accreditation_metrics`: Attribute 9 'Research & Innovation Outcomes' 9.1–9.7 (grants w/ Univ >10L / Auto >5L / Affiliated >50K non-govt threshold, publications-per-teacher, h-index+citations (Affil NA), PhDs/guide, JRF-SRF (Univ-only), IPR+OERs (Affil NA), consultancy+MDP/EDP/FDP (Affil NA)) + Attribute 10 'Sustainability & Green Initiatives' 10.1–10.4 (community %, water/waste, net-zero, green audits — checklists). College-type applicability in notes; numeric deck point-splits NOT digitized (deck not in-repo — not fabricated). Idempotent ON CONFLICT (metric_type, metric_code).
- 8.1.1 mislabel FIX (Path A — grep + prod junction both show ZERO ('NAAC','8.1.1') emitters/rows): renamed in place to 'Student enrolment vs sanctioned intake (fresh admissions)' (Binary 8.1 = enrolment), calculation_method → intake_history actual/sanctioned, old name recorded in notes; pass-% re-homed as new `8.2.2` (deck numbers it 8.2 — collides with Graduate Progression's 8.2, a NAAC deck source bug).
- New table `accreditation_metric_crosswalk` (legacy_code → current_code, college_type-aware, NO FK — text codes only; UNIQUE NULLS NOT DISTINCT so NULL current_code/college_type rows stay idempotent on re-run, PG 15.6). RLS: SELECT authenticated / manage admins (accreditation_certificate_kinds pattern). 8 seed rows: 6.5.1/2/3 → 7.3.d/e/f (IQAC relocated; 7.3.d/e/f are seeded by sibling PR #1899 — informational, no collision), 5.1.3 + 7.2.1 → NULL (Binary home TBD, Director/IQAC decision pending), affiliated shifts 1.4→5.4, 1.6→5.5, 1.7→5.3.
- Induction rows 5.1.3 / 7.2.1 marked LEGACY via notes-only append (codes NOT re-keyed; `fn_induction_emit_naac_evidence` + existing junction rows untouched). Starter rows 9.1.1 / 10.1.1 cross-referenced to canonical 9.2 / 10.4 in notes.
- Location: `supabase/migrations/20260709030000_naac_catalog_binary_framework_sync.sql`. Pre-merge validation 2026-07-09: full migration dry-run TWICE in a rolled-back txn on prod — NAAC 28→40 rows (Attr9 +7, Attr10 +4, Attr8 3→4), crosswalk 8 rows (stable across double-run), legacy note appended exactly once, RLS on + 2 policies. NOT yet applied to prod.
### Learner support notes — actionable + measurable (Director, 2026-07-09 02:32)
- The struggling-learner note was personalised in TARGETING but generic in CONTENT (generator fed only course + 3 ratings). Widened: `fn_scf_downward_trend_all` (DROP+CREATE) now also returns `unmet_items` (recurring un-ticked checklist LABELS across the 3 sliding classes, ≥2 of 3), and `faculty_name` (via staff.institution_email, is_active — NEVER staff.email). Fill-rates on live candidates: 366 candidates, 84% with items, 92% with name.
- `scf_learner_notes` + `reached_out`/`reached_out_at`; `fn_scf_my_struggling_note` (DROP+CREATE) + id/reached_out; NEW `fn_scf_learner_note_reached_out(note_id, bool)` — learner-own one-tap follow-up (the note's outcome signal). NEW `fn_induction_my_mentor()` — mentee-side senior-peer-mentor lookup (⚠️ dark until first-year profile linkage: 0/425 group mentees have profiles today).
- All fns SECDEF + anon/PUBLIC revoked; trend fn service_role-only, others authenticated.
- Location: `supabase/migrations/20260709003000_scf_learner_notes_actionable.sql`. Validated 2026-07-09 in rolled-back prod txn (incl. reached-out tap as the real note owner). Generators (cron `scf-learner-notes` + Mac runner `learner-notes.mjs`) updated in lockstep to cite items/dates/facilitator. Apply AFTER the code PR deploys.

### NAAC catalog — re-key 4 mis-keyed rows to Binary codes (config-only) — 2026-07-09
- Re-keys four April-seed `sh_accreditation_metrics` rows (metric_type='NAAC') whose codes don't match the Binary Accreditation Framework 2024 (names verified against the seed before re-keying): `1.3.1`→`6.4.1` (cross-cutting issues → 6.4 Value Education, Attribute 6 — Director decision 2026-07-09, not 1.6/IKS; runs FIRST to free 1.3.x), `1.2.1`→`1.3.1` (flexibility content; Binary 1.2 = stakeholder feedback), `2.3.1`→`7.10.1` (faculty retention → Attribute 7 Governance, category updated), `6.2.1`→`6.5.1` (sports → Binary 6.5; cricket-exclusion note preserved in calculation_method).
- Safety: aborts if any `quality_evidence_mappings` row references a still-mis-keyed old code (0 at authoring); every UPDATE guarded on old code + exact seeded name + target-code-free (idempotent, collision-safe, never clobbers). 4 crosswalk rows inserted (ON CONFLICT DO NOTHING).
- Location: `supabase/migrations/20260709033000_naac_catalog_miskey_rekey.sql`. HARD DEPENDENCY: merge + apply AFTER PR #1903 (`20260709030000_naac_catalog_binary_framework_sync.sql` creates `accreditation_metric_crosswalk`). Validated 2026-07-09 in a rolled-back prod txn with #1903's body prepended + own body run twice (idempotence proven). Apply AFTER the PR merges. (Expect trivial append-conflicts in this index with sibling PRs #1903/#1899 — resolve by keeping both entries.)
### Induction — re-key NAAC evidence to Binary 6.3 Mentoring & wellbeing (Director decision) — 2026-07-09
- Director decision 2026-07-09: fresher induction's Binary home = Metric 6.3 (Mentoring & wellbeing), Attribute 6. Full end-to-end re-key of legacy Criterion codes: catalog ('NAAC','5.1.3')→'6.3.1' ('Fresher induction / orientation — student mentoring & wellbeing') and ('NAAC','7.2.1')→'6.3.2' ('Fresher induction as institutional mentoring practice'), both 'Attribute 6: Extended Curricular'; the 2 existing auto-emitted `quality_evidence_mappings` rows follow (abort if >2 match); `fn_induction_emit_naac_evidence` re-created with ARRAY['6.3.1','6.3.2'] (body byte-faithful from prod pg_get_functiondef, = 20260730140000 retrofit version; ACL re-asserted); the two #1903 crosswalk home-TBD rows resolve to 6.3.1/6.3.2. Companion UI relabel in scorecard-section.tsx (same PR).
- Fail-loud: post-check RAISEs if the induction rows aren't at 6.3.1/6.3.2 after the guarded UPDATEs (collision/drift ⇒ abort, never a silent half-state). Idempotent re-runs no-op throughout.
- Location: `supabase/migrations/20260709034000_induction_naac_rekey_63.sql`. HARD SEQUENCING: merge + apply AFTER #1903 (crosswalk table, LEGACY marks) and #1907 (catalog mis-key re-keys) — timestamp sorts after both. Validated 2026-07-09 in a rolled-back prod txn chained as #1903 + #1907(amended) + this ×2. Apply AFTER the PR merges + deploys. (Expect trivial append-conflicts in this index with sibling PRs #1903/#1907/#1899 — keep all entries.)
### No-mechanics leak fix — learner surfaces show the ACTION, never the diagnostic — 2026-07-09
- Director interview 07:20 ("won't they start gaming the system?"): the learner loop-closure card + My Voice receipt quoted the TEACHER's AI note verbatim incl. sample sizes/averages/trigger bands — a 3-person sample lets a learner subtract themselves; printed thresholds teach the trigger recipe.
- `fn_scf_loop_closure_for_learner` + `fn_scf_my_impact` (CREATE OR REPLACE, RETURNS unchanged): learner-facing the_change/action_detail = COALESCE(quickWin, first suggestedAdjustments title, generic line) — display-time, covers all existing notes. Staff surface (fn_scf_loop_activity) untouched.
- All FOUR teacher-note generator prompts de-numbered in the same PR (cron, Mac runner [which was still sending the RAW average — the "2.33" source], ⚡ button route, ai-tasks registry): words-only group size + band words + explicit never-state-numbers rule.
- Location: `supabase/migrations/20260709021500_scf_no_mechanics_leak.sql`. Validated rolled-back as darsiniva (the screenshot case): the_change → the quickWin action text. Apply AFTER code deploys.

### Verdict integrity — claims vs numbers (leadership-only) — 2026-07-09
- Director interview 07:00 ("what if Devi bluffed?"): contradiction → alert leadership; repeat pattern → leadership-only track record (facilitator never sees a score kept on them). Derived state only — nothing new written.
- `fn_scf_verdict_track_record(from,to)` per-facilitator (verdicts/measured/agreed/contradicted) + `fn_scf_verdict_contradictions(from,to)` row-level (verdict='tried_helped' AND measured outcome_lift<=0, k>=3 outcome-responses floor; returns suggestion id, NO row-level class numerics). Agreement semantics documented in-file (not_tried excluded; tried_no_change never flagged — honest modesty). Leadership gate mirrors fn_scf_leadership_concerns; NON-SUPER callers never receive rows keyed to their own login email (teaching hod/coordinator never sees a score kept on them); IST date anchoring; anon/PUBLIC revoked.
- UI: ScfVerdictIntegrityCard on the PRINCIPAL page only (decision: never embed on a faculty surface). Dark until a verdict has a measured outcome; today shows devi.p 1-of-1 matched.
- Location: `supabase/migrations/20260709014500_scf_verdict_integrity.sql`. Validated rolled-back as the Director (track: devi 1/1/1/0; contradictions: 0). Apply AFTER code deploys.

### SCF generator maturity — policy lookup hoisted per-institution (PERF, live 500 fix) — 2026-07-09
- `20260709000100_scf_two_sided_48h_window.sql` placed `fn_get_policy_int('session_feedback.window_hours', 48, f.institution_id)` inside the ROW-LEVEL `WHERE` of `fn_scf_candidate_windows` + `fn_scf_ai_signal`. `f.institution_id` is correlated, so the planner cannot hoist it → the policy fn ran ~23,000×/run (23,232 rows in the 7-day window; only **6** distinct institutions and exactly **one** global policy row — every call returned the same constant). `scf-generate-suggestions` has returned `HTTP 500 · canceling statement due to statement timeout` on every run since that migration landed.
- Fix: resolve `{institution_id → window_hours}` ONCE in a **MATERIALIZED** CTE, then single-row `CROSS JOIN` + map lookup. `MATERIALIZED` is load-bearing — a plain CTE is INLINED in PG12+ and gets rescanned per row (a first attempt without it only moved 35.4s → 32.5s). NULL institutions use a `'_null'` text key rather than a sentinel UUID that could collide with a real id.
- Measured on prod in a rolled-back txn: `fn_scf_candidate_windows` **18,951ms → 167ms** (395 rows both sides; `EXCEPT` in both directions = 0); `fn_scf_ai_signal` **1,668ms → 58ms** (identical row). Per-institution override semantics preserved exactly. Signature/volatility/security unchanged; grants restated explicitly (candidate_windows = service_role only; ai_signal = authenticated + service_role — the `/api/academic/session-feedback/ai-suggest-improvement` route calls it with the caller's session).
- Do NOT raise `statement_timeout` instead: the cost is O(rows-in-window) and `session_feedback` grows ~3,300 rows/day.
- Location: `supabase/migrations/20260709090000_fix_scf_policy_lookup_per_institution.sql`. SQL-only PR (no code change) — safe to apply as soon as it merges.

### Accreditation — loop→AQAR evidence rollup, NAAC Metric 7.3 Quality Assurance System, IQAC bridge (PR 1/2) — 2026-07-09
- Framework: NAAC Reforms 2024 Binary Accreditation — Attribute 7: Governance and Administration → Metric 7.3 "Quality Assurance System", facets a–f (legacy: maps to Criterion 6.5 (IQAC) under the outgoing framework).
- Seeds 3 NAAC Metric-7.3 facet rows in `sh_accreditation_metrics` (7.3.d audits & performance assessment fed back / 7.3.e RESERVED quality-circle practice (/admin/loops Control Tower) / 7.3.f periodic stakeholder satisfaction with feedback; category 'Attribute 7: Governance' matching the existing 7.3.1 row, which is untouched; idempotent on (metric_type, metric_code)).
- `fn_accreditation_rollup_loop_evidence()` (VOLATILE SECURITY DEFINER, service_role ONLY — GRANT-level gate exactly like the SCF loop RPCs, 20260630160000): idempotently upserts one `quality_evidence_mappings` row per MEASURED loop cycle — `scf_ai_suggestions` domain=session_feedback → 7.3.f loop_key `scf_teaching` (incl. Better/Same/Worse vote counts from `scf_note_resolution_votes`), `induction_session_effectiveness` → 7.3.d `induction_session`, `scf_ai_suggestions` domain=induction → 7.3.d `induction_playbook`, `mess_menu_recommendations` → 7.3.f `mess_menu` (loop dark, 0 rows fine). ON CONFLICT (source_table, source_id, body_code, metric_code) refreshes metadata+mapped_at; never clobbers is_auto=false manual mappings. Returns per-loop jsonb counts (+ `count` total for the dispatcher summary).
- `fn_accreditation_ay_label(timestamptz)` — 'AY 2026-27' period label, June cutoff, IST.
- Seeds `ai_routine_schedules` row `accreditation-loop-evidence` (daily · 04:23 IST, minute_of_day 263) — fired via the AI-routine dispatcher, editable in /admin/ai-routines; NOT a raw vercel.json cron. Cron route: `app/api/cron/accreditation-loop-evidence/route.ts`; registry entry in `lib/ai-routines/misc-ai.ts`.
- Location: `supabase/migrations/20260709023000_accreditation_loop_evidence_rollup.sql`. Metadata contract PINNED for PR-2 (renders by loop_key): `{loop_key, loop_name, outcome{...}, delta_summary: improved|no_change|worse|n/a, measured_at}`.
### AI Pulse — close Measure + Verdict on the weekly cycle (gate 3) — 2026-07-09
- AI Pulse scored only gates ①Generate ②Act on the four-gate loop test: prod `pg_proc` had `fn_scf_*`/`fn_induction_*`/`fn_mess_*` measure+verdict fns and **zero** `fn_ai_pulse_*`. Tier 3 never emitted "goal met / goal missed", so `/admin/loops` reviewed it with eyes not outcomes.
- **The judge grades the whole FUNNEL**, not attendance: learn (live session) → apply in your domain (`event_submissions`) → AI Lab/Gold (`config.ai_pulse.gold_selections`) → publish on dept Instagram (`ig_posts`→`ig_post_metrics.reach ≥ ig_reach_threshold`). Signal definitions mirror `ai-pulse-pde-bridge-service.ts` so judge and bridge read the same reality. Grading engaged-attendance alone would have reported "≈15% engaged" and stayed silent about **853 teams producing 0 artifacts, ever**.
- NEW `ai_pulse_cycle_outcomes` (grain = cycle × dept, plus ONE lossless program row per cycle with `dept_id IS NULL`; **never SUM the two grains**). Key column `stage_reached` names where the funnel died (`no_attendance|no_engagement|no_domain_sync|no_gold|no_publication|complete`).
- NEW fns: `fn_ai_pulse_is_engaged` + `fn_ai_pulse_hhmm_minus` (IMMUTABLE SQL mirror of `isEngagedFromGates`/`isPresentAtEnd` — baseline AND outcome call it, so the estimator is identical by construction); `fn_ai_pulse_measure_cycle_outcomes` (**service_role only**); `fn_ai_pulse_set_verdict` (authenticated, hard `NOT IN` vocabulary guard: `intervened|partial|not_intervened`); `fn_ai_pulse_loop_confound_check` (falsification — if `intervened ≈ not_intervened`, the lift is RTM/drift and the loop is an echo, not a moat); `fn_ai_pulse_prior_dept_outcome` (service_role feed-forward reader for gate ④). All SECDEF fns carry an explicit `REVOKE … FROM anon` in-file.
- Baseline = **AVG of prior per-cycle ratios**, never `sum()/sum()` (the `fix_scf_measure_baseline_doublecount` bug class). RTM correction fits `regr_intercept`/`regr_slope` over the **untreated** departments; too few pairs ⇒ `insufficient_rtm_data`, `net_effect` NULL. **Never fabricates.** Idempotent in BOTH the candidate filter and the UPDATE's WHERE.
- Targets are INT PERCENTAGES (`engaged_attendance_target_pct=70`, `agency_yield_target_pct=10`). `data_type='float'` is permitted by the CHECK but **no policy row has ever used it**, so its Policies-editor render path is untested — do not be the first.
- Validated on prod in a rolled-back txn. Estimator fidelity proven by running the verbatim TS `evaluateGates` over the same 199 rows of cycle `ac1eea6c`: **TS engaged=29, SQL engaged=29** (joined=105, stayed=47, quiz_passed=20). Cold start honest: `written=34 measured=0 insufficient=34`, every row `insufficient_baseline`/`insufficient_data` with NULL lift. Anon locked on all four SECDEF fns; `authenticated` also denied on the measure fn.
- First real emission (program row, 06-18): `att=199 eng=29 teams=247 artifacts=0 → goal_missed / no_domain_sync`.
- Location: `supabase/migrations/20260709093000_ai_pulse_measure_verdict_loop.sql` + `20260709093100_ai_pulse_measure_verdict_seed.sql` (dials + `ai_routine_schedules` row, daily 10:15 IST). Apply AFTER the code PR deploys (the new cron route must exist before the dispatcher fires it).
- `migrations/20260710060000_iqac_meeting_loop_substrate.sql` — IQAC Meeting Loop substrate: `accreditation_committee_meetings` + `accreditation_committee_resolutions` (resolutions passed with owner+deadline, reviewed done/carried/dropped at the NEXT meeting; carried_count>=2 = Director escalation). RLS: view rides `accreditation.naac.committees.view`, writes need `accreditation.naac.committees.meetings.manage`. Body-agnostic via accreditation_committees. Evidence emitter (7.3.e) ships in the rollup-fn extension. (2026-07-10)

### 2026-07-10: Evidence holds — copo + placement emitters (Director edge-case interview)
- Three rulings, one shape — "computed + visible on dashboards, HELD OUT of quality_evidence_mappings": ① placement cohorts whose denominator stands on `outcome_reported` (roster empty or short — metrics gain `evidence_held='incomplete_roster'`, release action = complete the roster); ② copo rollups with uncertain institution stamp (`institution_match` NOT IN `unique_course_match|manual_assignment` — covers ambiguous CAS twins AND unmatched guesses; `manual_assignment` reserved for the upcoming re-stamp control); ③ copo small courses (`copo_attainment.min_course_size` config row, default 10).
- **DELIBERATE ASYMMETRY**: placement small cohorts stay IN evidence labeled `small_cohort` (Director explicitly kept the 2026-07-09 "compute, but label" ruling in the same interview). Only copo smallness holds.
- Self-healing: each emitter run DELETEs `is_auto=true` ledger rows whose source is now held; manually-curated rows never touched. New return keys: copo `held_uncertain_institution/held_small_course/evidence_rows_removed`; placement `cohorts_evidence_held` + per-cohort `result='measured_held_from_evidence'`.
- ⚠️ Size predicate uses `GREATEST(COALESCE(final,0), COALESCE(internal,0))` — `final_learner_count` is **0, not NULL**, before finals are declared; a bare COALESCE held all 47 courses in rolled-back validation (caught pre-apply). Same fix applied to the evidence `learner_count` display field.
- ROLLBACK-validated on prod 2026-07-10 (fn replaces + live copo run + seeded 3-learner no-roster placement cohort → measured 1/held 1/evidence 0). Applied to prod same morning: copo live run `count=92, removed=2, held_uncertain=1`; ledger 94→92.
- Location: `supabase/migrations/20260710023000_evidence_holds_copo_placement.sql`. ALREADY APPLIED to prod via Mgmt API — this file records it in the repo (both fns idempotent CREATE OR REPLACE).
- `migrations/20260710070000_rollup_iqac_meeting_and_audit_loops.sql` — rollup fn gains loop (e) `iqac_meeting` → 7.3.e (one row per MINUTED committee meeting; closure_rate + carried/dropped in metadata; supersedes the "7.3.e emits no per-row evidence" spec reservation) and loop (f) `institutional_audit` → 7.3.d (one row per CLOSED single-institution audit_cycle; findings via service_requests slug `audit_finding`; delta vs prior closed cycle; multi-institution cycles skipped — junction natural-key limitation). Base body = prod live def; loops (a)-(d) unchanged; same anti-join/isolation/is_auto patterns; rides the existing 04:23 IST dispatcher schedule. HARD DEP: apply 20260710060000 first. Validated chained + seeded 2-meeting lifecycle in one rolled-back prod txn (iqac_meeting=2, institutional_audit=1, closure_rate 0.50). (2026-07-10)

### 2026-07-10: Twin-college re-stamp control — CO/PO held rollups (Director: "Build the re-assignment control now")
- `fn_copo_restamp_rollup_institution(p_rollup_id, p_institution_id)` — user-facing SECDEF RPC releasing HELD rollups (`institution_match` = `ambiguous_first_mapped` | `unmatched_first_mapped`) into evidence by assigning the right college. Sets `institution_id`, `metadata.institution_match='manual_assignment'` (EXACT value the live emitter accepts — wire contract), `restamped_by`/`restamped_at`/`institution_match_before`. Gate INSIDE the body: `is_super_admin() OR user_has_permission('accreditation.evidence.restamp')` **plus** `role_has_institution_access(<target college>)` (never called with NULL — validated first). Candidate rule: must pick one of `metadata->'myjkkn_institution_ids'` when present; any ACTIVE college when absent. `unique_violation` → friendly `duplicate_rollup` error. anon/PUBLIC revoked; GRANT authenticated.
- `fn_copo_record_course_attainment` REPLACED with **manual re-stamp preservation**: each incoming replay row first looks for a `manual_assignment` row for the same course+session (+ same `coe_institution_code`) and, when found, redirects onto that row's college and re-merges the manual stamp keys. Without this the weekly cron clobbers the stamp back to held (same key: `metadata = EXCLUDED.metadata`) or resurrects a duplicate held row under the old guess (moved to the twin → keys no longer conflict). Same mutable-stamp-resurrection family as the crosswalk seed fixed in #1924. Stats columns still refresh every run — only the human's stamp keys persist.
- ROLLBACK-validated on prod 2026-07-10: impersonated plain student REFUSED (SQLSTATE 42501); impersonated super_admin: non-candidate college REFUSED, twin B accepted (`manual_assignment`, `restamped_by`=admin); absent-candidate-list probe assignable to any active college; replay probe → 1 row for the course (no duplicate), kept `manual_assignment` + college B, stats refreshed (75.0).
- UI: "Held CO/PO results — assign the right college" section on `/accreditation/naac` (component `copo-held-rollups-section.tsx`), visible to super admins + `accreditation.evidence.restamp` holders.
- Location: `supabase/migrations/20260710042000_copo_restamp_rpc.sql`. Orchestrator applies after review.
### 2026-07-10: CO/PO below-target course alerts to Principals (Steady alerts)
- Director decisions 2026-07-10 (verbatim): **"Principal only"**; **"Steady alerts"** — a course must be below target 2 weekly runs IN A ROW to enter the list, and leadership is messaged ONLY when the list CHANGES (a course enters or recovers).
- Why new state: `obe_course_attainment_rollup` is upserted IN PLACE every weekly run (no run history), so 2-consecutive-runs persistence lives in new `copo_below_target_state` (one row per institution × course_code, UNIQUE key all-NOT-NULL; RLS: accreditation viewers institution-scoped, writes RPC-only).
- `fn_copo_track_below_target()` (SECDEF, `search_path=public`, service_role ONLY — anon/authenticated/PUBLIC revoked, verified `has_function_privilege` anon=f auth=f service_role=t in rolled-back txn): ingests current rollups with CONFIDENT institution stamps only (`institution_match IN ('unique_course_match','manual_assignment')` — alerting a possibly-wrong Principal is worse than waiting), extends/resets streaks, returns per-institution entered/recovered changes jsonb. Idempotent within a run via `last_run_key` = `session_code@computed_at`. Courses absent from the current run or turned-uncertain are FROZEN (no increment, no false recovery). Config row `copo_attainment.alert_consecutive_runs` (global, 2) holds the "2 runs" number.
- Cron `/api/cron/copo-attainment` step 4: calls the tracker after evidence emit; per changed institution sends ONE in-app notification via the canonical `fanoutNotification` helper to that institution's active Principal(s) (`user_roles JOIN custom_roles role_key='principal'` + legacy `profiles.role='principal'` fallback, deduped; recipient lookup, not an authz gate). Body lists entered courses (code, name, attainment %, level vs target, learner-pass threshold, basis) + recovered, with the honest caveat that internal CIA figures evolve as marks land and everything is a course-level proxy. Idempotency key `copo_below_target:<institution>:<date>`. Response keys: `alerts_sent`, `institutions_notified`, `entered`, `recovered`.
- ROLLBACK-validated on prod 2026-07-10 (4 scenarios): run1 below ⇒ tracked (consec=1) NOT alerted, entered=0; run2 still below ⇒ entered=1 change (ZZTEST_A consec=2); same-run double call ⇒ incremented=0, skipped_same_run=15 (idempotent); run3 unchanged ⇒ 0 changes; run4 recovery ⇒ recovered=1, state reset. Real data at validation time: 48 confident evaluable rollups, 15 below target after probes.
- ⚠️ First LIVE run after apply seeds streaks (consec=1) for the ~13 currently-below courses with NO alert; the second weekly run alerts Principals for any still below — that ramp IS the Director's "Steady alerts" design.
- Location: `supabase/migrations/20260710041000_copo_below_target_alerts.sql`. NOT yet applied — orchestrator applies after review (code must deploy with it; either order is safe: the route 500s at step `track_below_target` if the fn is missing, and the fn no-ops state-only if the route is old).
### 2026-07-10: CDC placement no-data reminder — escalation-weeks config row
- ONE `platform_policies` row: `cdc_placement_loop.nodata_escalation_weeks` (global, `4`, number). Director decisions 2026-07-10 verbatim: weekly reminder to the named owner; "Yes — list the held cohorts"; escalation "Copy me after 4 weeks".
- Consumed by `app/api/cron/cdc-placement-outcomes/route.ts` (weekly Sun 03:15 IST via dispatcher): when `master_enabled=true` and BOTH `cdc_placements` + `alumni_outcomes` are empty, one in-app reminder fans out (shared `fanoutNotification` helper, two-write pattern) to `cdc_placement_loop.owner_id`; evidence-held cohorts (`metrics ? 'evidence_held'`) are listed; the (threshold+1)-th consecutive weekly reminder also copies the Director (profiles lookup by `director@jkkn.ac.in` at runtime, no hardcoded uuid). Consecutive count derived from notification history (`metadata->>source = 'cdc-placement-nodata-reminder'`) — no new state table. Per-IST-day idempotency keys dedupe manual same-day re-fires.
- No tables/functions; seed keyed on identity columns (`policy_key`, scope) with `ON CONFLICT DO NOTHING` — immune to the mutable-column seed-resurrection class.
- Location: `supabase/migrations/20260710040000_placement_nodata_reminder_config.sql`.

### 2026-07-10: Facilitator coverage — server-side college filter + covered-count fan-out fix
- Director live bug (~12:36 IST screenshot): Pharmacy/Allied-Health facilitators rendered under a Dental filter, plus a 266.7% coverage row. Prod-confirmed root causes: ① `fn_scf_facilitator_feedback_coverage` grouped covered counts by facilitator ONLY while taught was per (institution, facilitator) — multi-college facilitators got their GLOBAL covered count on every college row (Swathi Raman AHS row: taught 3, covered 8 → 266.7%); ② college narrowing was client-only.
- Fix: fn takes `p_institution_id uuid DEFAULT NULL` (narrowing inside caller scope, mirrors admin-trend); covered/cov_fac now grouped by (institution, facilitator) → coverage ≤ 100 by construction. OLD 2-arg fn DROPPED first (two overloads = PostgREST PGRST203 ambiguity); deployed 2-arg callers resolve via the default.
- Rolled-back impersonated validation, then APPLIED to prod 2026-07-10 ~13:0x IST: dental-filtered = 34 rows, NARMADHA excluded, Swathi once, 0 rows >100%; unfiltered live check post-apply: over100_live=0. Swathi AHS row now honest: taught 3, covered 0.
- Location: `supabase/migrations/20260710070000_facilitator_coverage_institution_param.sql`. ALREADY APPLIED via Mgmt API; file records it.
### 2026-07-10: SCF permission switches — verdict-report read key + 3 write keys (Director R2)
- 4 NEW keys seeded into custom_roles (identity-guarded UPDATEs, idempotent): `academic.session_feedback.verdict_report.view` (super_admin/administrator/principal/ceo/executive_admin_officer — NO hod), `academic.curriculum.lesson.manage` + `academic.live_poll.manage` + `academic.session_feedback.verdict.write` (each super_admin/administrator/hod/principal = today's living audience; the old arrays' institution_admin/dean/coordinator have no custom_roles row and no users).
- 9 fns re-pointed (bodies otherwise byte-identical to prod): fn_scf_verdict_contradictions + fn_scf_verdict_track_record (read gate → verdict_report.view; tenant hoisted to role_has_institution_access uuid[] so scope-all leadership sees all its colleges); fn_scf_set_verdict (leader branch → verdict.write; caller-inst==target-inst bind PRESERVED; `v_sug_inst IS NULL` hole CLOSED); fn_live_poll_can_manage class_session branch + fn_scf_open_pulse + _fn_live_poll_ensure_class_anchor (→ live_poll.manage — a WRITE question on a manage key); fn_curriculum_lesson_upsert EDIT override + fn_curriculum_lesson_ai_approve/_ai_reject (→ curriculum.lesson.manage; upsert's teaching-evidence CREATE branch untouched; system_admin kept as an explicit remnant in approve/reject — today's audiences differ per fn).
- APPLIED LIVE 2026-07-10 via Mgmt API, staged: seeds → per-identity key resolution verified (9 identities) → functions → BEFORE/AFTER impersonation matrix diff (83 baseline lines; only intended flips: ceo/eao gain the 2 verdict READS; administrator's verdict-read scope widens own→all-accessible, same as 20260731110000) → timing sweep 27 cells, worst 83ms (<3s budget).
- Location: `supabase/migrations/20260710120000_scf_permission_switches.sql`. NOTE: index tail also touched by PR #1953 — merge sequentially, keep both sections.
### 2026-07-10: SCF dashboard filter gaps + Facilitator Pulse timeout fix
- `fn_scf_struggling_notes_sent(date,date,uuid)` — NEW 3-arg overload beside the 2-arg (identical audience gate; adds `p_institution_id IS NULL OR n.institution_id = p_institution_id` — a filter, never a widening). No default on the 3rd arg (2-arg calls stay unambiguous); anon/PUBLIC revoked, authenticated granted; NOTIFY pgrst. Consumed by the "Support Notes Sent" card, whose rows carry no institution column.
- `fn_scf_facilitator_pulse(date,date)` — PERF REWRITE (same signature/output). Old body called `role_has_institution_access()` PER attendance-row inside fac_sess + a correlated `count(*)` on session_feedback per session ⇒ exceeded its own 20s statement_timeout under real authenticated sessions (admin-page Pulse card showed "canceling statement due to statement timeout"; /api/.../marks-coverage 500'd — it calls this fn). New body hoists tenant scope into `v_insts uuid[]` BEFORE the jsonb explosion and pre-aggregates witnessed/per-facilitator signals into grouped hash-joined CTEs. Measured: orig 21,660ms for a 5-DAY window vs 370ms new (row-identical, EXCEPT ALL both ways = 0); live 30-day window 239–937ms, 233 rows. Intended tightening: institution_id IS NULL attendance rows were leadership-visible via the role_has_institution_access(NULL)=TRUE quirk, now super-only (consistent with 20260731110000).
- APPLIED LIVE 2026-07-10 via Mgmt API (staged: _perftest/_origtest variants → timing + row-identity → live swap → variants dropped). ACLs verified anon=f/auth=t on all 3 signatures; faculty caller still raises 'not authorized'.
- Location: `supabase/migrations/20260710100000_scf_filters_notes_overload_pulse_perf.sql`.
### 2026-07-10: SCF three-zone outcome language + retry fairness + unmeasurable stamp (Director interview, post moat-loop audit)
- Director decisions 1/6/7 (12:50 IST interview): ONE definition of "helped" everywhere — lift < 0 didn't help · 0–0.5 "about the same" · ≥ 0.5 helped; alerts about a PERSON need ≥5 next-session answers; notes unmeasured after 30 days get an honest "could not be measured" stamp.
- `scf_ai_suggestions.outcome_unmeasurable_at` (NEW column) — stamped by the measurer, excluded from its candidate scan; my-loop-notes card reads it as "could not be measured", not "waiting".
- `fn_scf_verdict_track_record` + `fn_scf_verdict_contradictions` (CREATE OR REPLACE, bodies = live 20260710120000 permission-switch versions): agreed now requires lift ≥ 0.5 (was > 0); contradicted requires lift < 0 (was ≤ 0 — a +0.36 "tried_helped" no longer reads as a bluff); k-floor 3→5 on BOTH fns in lockstep (deep-review consensus: card and alert list must count the same rows).
- `fn_scf_measure_suggestion_outcomes` (CREATE OR REPLACE, body = sim-verified 2026-07-10 version): candidates skip stamped rows; post-measure pass stamps 30-day-stale improvement notes. Return value unchanged (rows measured).
- TS lockstep in the same PR: three-zone bands + sample-size tiers in BOTH generator prompts (cron buildTrackRecordBlock ported the interactive route's tiered evidence logic); regen guard blocks only UNMEASURED recent notes ("wait for result or 7 days"); RETRY_SLOTS=5 of BATCH_CAP=25 reserved for measured-awaiting-retry courses; cross-peek line so the facilitator/leadership lanes never contradict unknowingly; card derives the "was" band from (after − change).
- Location: `supabase/migrations/20260710160000_scf_three_zone_retry_fairness.sql`. Validate rolled-back on prod, apply AFTER code deploys (three-zone display language should not precede the prompt bands by much, but nothing breaks either way — fns are self-contained).
