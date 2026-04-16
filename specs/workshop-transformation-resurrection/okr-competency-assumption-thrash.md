# OKR + Competency — Assumption-Thrash Decisions

**Date locked:** 2026-04-17
**Skill:** `/assumption-thrash` (5 rounds, 20 decisions)
**Feeds:** `/myjkkn-api` build phase
**Parent plan:** `specs/workshop-transformation-resurrection/MASTER-PLAN.md`

---

## Production state snapshot (verified live via Supabase MCP on 2026-04-17 01:30 IST)

### OKR — 25 tables live on production

| Category | Tables | Status |
|----------|--------|--------|
| **Tier-based core (canonical)** | okr_objectives (21c/4p), okr_key_results (18c/4p), okr_check_ins (17c/3p) | Live, UI never shipped |
| **Satellites** | okr_comments, okr_compliance, okr_dependencies, okr_milestones, okr_risks, okr_tasks, okr_user_status, okr_kr_updates, okr_reactions, okr_attachments | Live, all with RLS |
| **Auto-track engine** | okr_metric_registry (31c/2p), okr_auto_track_sources (10c), okr_metric_cache, okr_metric_execution_log, okr_external_api_credentials | Scaffolding live, **NEVER EXECUTED** (0 rows with `last_global_sync_at`) |
| **Deprecated (pending cleanup)** | learner_core_okrs, learner_elective_okrs, learner_okr_assignments | Migration to deprecate sits on clean-ss-deploy |

**12 metrics registered** (8 active): attendance (3), billing (3), enrollment (2), staff (1), external/library (1), admissions (2 inactive). **None have ever been computed.**

### Competency — 4 tables live, zero code on jicate/main

| Table | Cols | RLS | Status |
|-------|------|-----|--------|
| competency_catalog | 15 | 4 | Live, empty or minimal seed |
| competency_program_mapping | 10 | 4 | Live |
| course_competency_mapping | 10 | 4 | Live |
| learner_competencies | 13 | 4 | Live |

Bridge table `competency_okr_metrics` exists in clean-ss-deploy migration `20260210120001_competency_okr_metrics.sql` but **did not apply** to production.

### Partial-prod OKR code (UI absent)
- `app/api/b2a/okr/{compliance,objectives,stats}/route.ts` — B2A endpoints shipped
- `lib/mcp/tools/okr.ts` — MCP tool shipped
- `.claude/worktrees/okr-resurrect/` — **anomaly: worktree dir committed to jicate/main** (cleanup needed in first PR)

### Functional parallels discovered (Layer 2 sweep)
| Parallel | Decision |
|----------|----------|
| `sf100_check_ins` (Startup Studio) | Different audience (founders) — coexist, no merge |
| `sh_department_targets` (Solutions Hub) | Different purpose — coexist |
| `ss_kpi_definitions` + `ss_kpi_measurements` (Solutions Studio) | **Decision #3:** coexist; document audience boundary; no merge |

---

## Silent Assumption Decisions (from assumption-thrash)

### Round 1 — Structural / overlap resolutions

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | B2A API conflict: 3 routes already in prod, no UI | **Extend existing B2A for UI too** | One API surface, lower maintenance. Response shape must serve both UI + partners. |
| 2 | Deprecated learner OKR tables | **Drop + refactor `/okr/elective/*` UI to use `okr_objectives` tier='elective'** | Executes pending deprecation. One canonical model. Largest surface-area change in Sprint 1. |
| 3 | SS KPI parallel infrastructure | **Coexist — different audiences** | Avoids 4-6 week detour. Document boundary in spec. Zero change to `ss_kpi_*`. |
| 4 | Cluster Council directive seeding | **Fresh start — Day 1 manual entry** | No migration script. Past directives stay in chat/vault. Simplest cutover. |

### Round 2 — Cadence / lineage

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 5 | Check-in cadence enforcement | **Enforced — overdue flag after 1 MONTH** (user annotation: fortnightly meetings, monthly check-ins) | View-layer `days_since_last_checkin`; dashboard "overdue" filter. |
| 6 | Parent-child cascade when Tier 1 changes | **Frozen snapshot — `parent_snapshot JSONB` on `okr_objectives`** | Audit-safe. MD can revise Tier 1 without invalidating in-flight dept/individual work. Mirrors HR Sprint 3 leave pattern. |
| 7 | ABCD grading mechanism | **Auto-computed from weighted KR progress** | A ≥ 90%, B 70–89%, C 50–69%, D <50%. Trigger on `okr_key_results` AFTER UPDATE. Objective + reportable. |
| 8 | Competency↔OKR bridge (`competency_okr_metrics`) | **Defer bridge; ship both modules independently** | Smaller PRs, independent value. Bridge revisits in v2. |

### Round 3 — Permissions / proxy / cancellation

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 9 | OKR visibility scope | **Transparent within institution + cluster-council cross-institution** | RLS: `role_has_institution_access(institution_id)` + council role bypass. |
| 10 | OKR authoring responsibility | **Owner-only authoring; HOD approves** | Clean ownership. Approval state machine: draft→pending→approved/rejected with reason. |
| 11 | KR owner delegation + silence handling | **Reassignable with HOD approval + auto-escalate after 60 days silent** | New `okr_reassignment_requests` junction; scheduled view flags `days_since_checkin > 60` to HOD dashboard. |
| 12 | Abandoned OKR cancellation | **Soft-retire with mandatory reason** | `status='retired'` + `retired_at` + `retirement_reason TEXT NOT NULL`. Excluded from ABCD averages. |

### Round 4 — Auto-track architecture (pivot: "KRs from MyJKKN data; minimize manual entry")

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 13 | Two catalog tables | **Keep both — `okr_auto_track_sources` = SQL layer, `okr_metric_registry` = UI/curation layer** | Preserves raw-source vs curated-catalog separation. Two-tier lookup. |
| 14 | Manual entry permitted? | **Catalog-first with manual fallback allowed** | `is_manual BOOLEAN DEFAULT false` + `manual_value NUMERIC` on `okr_key_results`. Manual KRs excluded from auto-rollups; flagged in UI. |
| 15 | New-metric request flow | **`Request metric` form → super_admin/IT queue, 48h SLA** | NEW table `okr_metric_requests`. Notification to super_admin role. |
| 16 | Execution trigger | **pg_cron per metric's `refresh_frequency` + manual refresh button** | Standard pattern. Writes to `okr_metric_cache`, logs to `okr_metric_execution_log`. |

### Round 5 — Failure behavior / evidence / competency

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 17 | Metric execution failure behavior | **Show last-known value + "stale" warning badge + notify super_admin** | Never a blank screen. Execution log captures error. Notification on N consecutive failures. |
| 18 | NAAC/NBA evidence fan-out | **Auto-tagged if KR linked to NAAC criterion** | NEW columns on `okr_objectives`: `naac_criterion TEXT`, `nirf_metric TEXT`, `nba_criterion TEXT`. Triggers on `okr_check_ins` + `okr_metric_cache` INSERT emit to `quality_evidence_mappings`. |
| 19 | Competency authoring roles | **Curriculum team + HODs only** | RLS: INSERT/UPDATE on `competency_catalog` restricted to `hod`, `curriculum_head`, `super_admin`. Faculty SELECT only. |
| 20 | Competency→learner mapping | **Auto via course/program enrollment + faculty proficiency override** | New VIEW `learner_competency_coverage` joins `course_competency_mapping × enrollments`. Faculty UI writes `learner_competencies.proficiency_level`. |

---

## Schema implications (derived from 20 decisions)

### New columns on existing OKR tables

| Table | New column | Source |
|-------|------------|--------|
| `okr_objectives` | `parent_snapshot JSONB` | #6 frozen cascade |
| `okr_objectives` | `retired_at TIMESTAMP`, `retirement_reason TEXT` | #12 soft-retire |
| `okr_objectives` | `naac_criterion TEXT`, `nirf_metric TEXT`, `nba_criterion TEXT` | #18 evidence fan-out |
| `okr_objectives` | `tier_type` allow 'elective' value | #2 elective refactor |
| `okr_key_results` | `is_manual BOOLEAN DEFAULT false`, `manual_value NUMERIC` | #14 manual fallback |
| `okr_key_results` | `escalated_at TIMESTAMP` | #11 delegation |

### New tables

| Table | Purpose | Source |
|-------|---------|--------|
| `okr_reassignment_requests` | KR owner handoff workflow | #11 |
| `okr_metric_requests` | Metric creation queue for super_admin | #15 |

### Tables to drop (with migration)

| Table | Reason |
|-------|--------|
| `learner_core_okrs` | Deprecated; data model replaced by tier-based | #2 |
| `learner_elective_okrs` | Deprecated; consolidated to `okr_objectives` tier='elective' | #2 |
| `learner_okr_assignments` | Deprecated | #2 |

### New triggers

| Trigger | Fires on | Action | Source |
|---------|----------|--------|--------|
| `compute_abcd_grade_tg` | `okr_key_results` AFTER UPDATE | Recompute parent's `okr_compliance` grade | #7 |
| `emit_naac_evidence_tg` | `okr_check_ins` AFTER INSERT | If parent OKR has NAAC/NBA/NIRF tag, insert row into `quality_evidence_mappings` | #18 |
| `emit_metric_evidence_tg` | `okr_metric_cache` AFTER INSERT/UPDATE | If source OKR tagged, fan out to `quality_evidence_mappings` | #18 |
| `snapshot_parent_on_create_tg` | `okr_objectives` BEFORE INSERT | Populate `parent_snapshot` from current parent values | #6 |

### New views

| View | Purpose | Source |
|------|---------|--------|
| `okr_overdue_checkins_v` | `days_since_last_checkin > 30` with owner + HOD details | #5 |
| `kr_silent_escalations_v` | KRs with no check-in 60+ days → HOD dashboard | #11 |
| `learner_competency_coverage` | Auto-coverage via enrollment × course_competency_mapping | #20 |
| `metric_freshness_v` | Last execution status per metric for stale-badge UX | #17 |

### New cron jobs (pg_cron)

| Job | Frequency | Action | Source |
|-----|-----------|--------|--------|
| `okr_metrics_hourly_tick` | hourly | Execute all metrics with `refresh_frequency='hourly'` | #16 |
| `okr_metrics_daily_tick` | 02:00 IST daily | Execute daily metrics | #16 |
| `okr_metrics_weekly_tick` | Mon 02:00 | Execute weekly metrics | #16 |
| `okr_escalation_sweep` | daily 06:00 | Refresh `kr_silent_escalations_v`, fire notifications | #11 |

### Cleanup (first PR)
- Remove `.claude/worktrees/okr-resurrect` from `jicate/main` (anomalous committed worktree dir)

---

## Metric registry growth plan (per user directive: "all KRs from MyJKKN data")

Current: 12 metrics (8 active) covering attendance, billing, enrollment, staff, external library.

**Gaps to seed in Sprint 1 ship (derived from Cluster Council directive domains + council purpose memory):**

| Module | Candidate metric_key | Source table | Priority |
|--------|---------------------|--------------|----------|
| admissions | `admissions.applications_count` (reactivate) | `admission_leads` | P0 |
| admissions | `admissions.conversion_rate` (reactivate) | `admission_leads` + enrollment | P0 |
| admissions | `admissions.lead_response_time_hours` | `admission_lead_activities` | P1 |
| hr | `hr.staff_attrition_rate` | `hr_employees` | P0 |
| hr | `hr.leave_balance_utilization` | `hr_leave_applications` | P1 |
| academic | `academic.pass_percentage` | (exam results table — verify exact name) | P0 |
| academic | `academic.attendance_below_75_count` | attendance tables | P0 |
| campus-living | `campus.occupancy_rate` | hostel_* tables (abandoned, prod-live) | P1 |
| campus-living | `campus.complaints_resolved_24h` | mess_complaints | P1 |
| bug-reports | `platform.critical_bugs_open` | `bug_reports` | P2 |
| quality | `naac.evidence_emitted_count` | `quality_evidence_mappings` | P1 (meta-metric on the system itself) |
| quality | `competency.graduate_coverage_rate` | `learner_competency_coverage` view | P1 |

**Expected registry state post-Sprint 1:** ~24 active metrics across 8+ modules. Each comes with a tested SQL template in `okr_auto_track_sources.query_template`.

---

## Recommended sub-PR breakdown

Scale: 118 source files + 20 decisions → NOT shippable as one PR. Split by natural dependency edges:

| Sub-PR | Scope | Size estimate | Dependencies |
|--------|-------|---------------|--------------|
| **PR-1: OKR substrate + cleanup** | Drop deprecated tables, add new columns/triggers to okr_* tables, drop `.claude/worktrees/okr-resurrect` anomaly, types regen | ~15 files | None (foundation) |
| **PR-2: OKR UI — objectives CRUD (Tier 1-3)** | `/okr/objectives/*` routes, cascade page, hooks, services. Authoring+approval workflow. | ~30 files | PR-1 |
| **PR-3: OKR UI — check-ins + progress** | `/okr/check-in`, `/okr/department`, `/okr/organization`, ABCD auto-compute hookup | ~25 files | PR-2 |
| **PR-4: OKR auto-track engine wiring** | pg_cron jobs, metric execution service, stale-badge UX, metric registry UI (super_admin), 12 metric SQL templates tested + 10 new metrics seeded | ~20 files | PR-1 |
| **PR-5: NAAC evidence fan-out triggers** | Add naac/nirf/nba tag cols, fan-out triggers, tag picker UI in OKR create form | ~8 files | PR-1, PR-3 |
| **PR-6: Competency module (standalone)** | `/competency-catalog/*` routes refactored, hooks, services, auto-coverage view, faculty proficiency UI, RLS tightening | ~25 files | None (independent) |

Total: ~123 files across 6 PRs, each under the ~25-file merge-conflict threshold for `sidebarMenuLink.ts`.

---

## Ready state for `/myjkkn-api`

- ✅ 20 silent assumptions locked and documented
- ✅ Schema delta enumerated (6 column adds, 2 new tables, 3 deprecated drops, 4 triggers, 4 views, 4 cron jobs)
- ✅ Sub-PR breakdown proposed (6 PRs)
- ✅ Metric registry seed list identified (12 kept + 10 new)
- ⚠️ Pre-build checks needed: (1) pg_cron availability on prod DB, (2) exact column names on attendance/exam tables for metric query templates, (3) existing B2A route response shape inspection

**Next command:** `/myjkkn-api` starting with PR-1 (substrate + cleanup).

---

*Decisions locked 2026-04-17 01:35 IST. Spec author: Claude Code (Opus 4.7). User: aidental@jkkn.ac.in.*
