# MyJKKN HR Module — Complete Workflow Analysis

> **Scope:** `app/(routes)/hr` — the HR-management suite for the JKKN group.
> **Generated:** 2026-06-18. Derived from a deep read of pages, API routes, services, hooks, types, the permission catalog, and (where noted) live-DB verification.
> **Nature:** Read-only architectural analysis. Quotes real identifiers (status enums, RPC/function names, table names, permission keys, formulas).

---

## Table of contents

1. [What the module is](#1-what-the-module-is)
2. [Architecture — the heterogeneous request path](#2-architecture--the-heterogeneous-request-path)
3. [Navigation & access model](#3-navigation--access-model)
4. [The end-to-end employee journey (the spine)](#4-the-end-to-end-employee-journey-the-spine)
5. [Cluster-by-cluster workflows](#5-cluster-by-cluster-workflows)
   - [5.1 Dashboard / Command Center](#51-dashboard--command-center)
   - [5.2 Recruitment (hire-to-start)](#52-recruitment-hire-to-start)
   - [5.3 Workforce Planning / Recruitment-Need (Intelligence)](#53-workforce-planning--recruitment-need-intelligence)
   - [5.4 Time & Attendance — Leave, Regularization, Shifts](#54-time--attendance--leave-regularization-shifts)
   - [5.5 Employee Lifecycle — Employees, Onboarding, Documents, Offboarding, Termination, Assets](#55-employee-lifecycle)
   - [5.6 Performance, Growth & Conduct](#56-performance-growth--conduct)
   - [5.7 Pay, Policy & Dynamic Config](#57-pay-policy--dynamic-config)
6. [Recurring design patterns](#6-recurring-design-patterns)
7. [Consolidated state-machine reference](#7-consolidated-state-machine-reference)
8. [Cross-cluster workflow graph](#8-cross-cluster-workflow-graph)
9. [Key DB tables reference](#9-key-db-tables-reference)
10. [Permission keys reference](#10-permission-keys-reference)
11. [Gaps & latent issues](#11-gaps--latent-issues)

---

## 1. What the module is

`app/(routes)/hr` is a **full HR-management suite** for the JKKN group of institutions — roughly **110 pages, 95 API routes, 40 service classes, 25 React Query hooks, and 13 type modules** — spanning the entire employee lifecycle plus payroll, policy governance, and a data-driven workforce-planning engine. Everything is multi-tenant (`institution_id` / `hr_organization_id`) and gated by the platform's dynamic RBAC + Postgres RLS.

The 25 submodules under `app/(routes)/hr`:

```
admin/        analytics/    attendance/   automation/   benefits/
compensation/ documents/    employees/    fdp/          forms/
intelligence/ leave/        memos/        my-assets/    offboarding/
onboarding/   performance-reviews/        policies/     promotions/
recruitment/  shifts/       staff-specializations/      templates/
training/     workload/
```

---

## 2. Architecture — the heterogeneous request path

The repo norm is `page → hook → service → Supabase` (hooks call services directly). **HR has three coexisting variants**, and which one a feature uses tells you its vintage and risk profile:

| Variant | Shape | Auth enforcement | Used by |
|---|---|---|---|
| **A — Full 5-layer + `withAuth`** | `page → hook(fetch) → API route → service → RLS` | Permission-gated at the route via `withAuth({ requirePermission })` (the canonical `is_super_admin() OR is_admin() OR user_has_permission()` triad) | Dashboard, Payroll |
| **B — 5-layer, hand-rolled auth** | same shape | Route only does `supabase.auth.getUser()` (401 if absent); the real `hr.*` keys are enforced by **RLS** | Leave, Recruitment, Promotions, Memos, Disciplinary, Benefits, Compensation, most Recruitment-Need routes |
| **C — No API route** | `page/hook → service → RLS` via the browser client (`createClientSupabaseClient()`) | **RLS only** | Regularization, Shifts, Performance, Training, FDP, most of Employee-Lifecycle, My-Assets, the recruitment-need *signal* + *templates* hooks |

**Why it matters:** there is no single "HR way." When auditing access control, you must check the page guard *and* the route style *and* the RLS policy — they don't move together. Two routes that look identical can have completely different enforcement.

Side effects (notifications, cross-user lookups, best-effort stamps) consistently use a **service-role client** (`createServiceRoleClient()`) to bypass RLS, wrapped in `void (async () => { ... })()` fire-and-forget blocks so a failed notification can never break the primary mutation.

---

## 3. Navigation & access model

- **`nav-config.ts`** declares the logical groups (Dashboard, Intelligence, Recruitment, Leave, Employees, Onboarding, My-Assets, Offboarding, Attendance, Shifts, Documents, Performance Reviews, Policies, Admin). It doubles as the **orphan-coverage manifest** for `scripts/check-nav-reachability.ts` — every reachable URL must appear here as an `href` or `matchPaths` entry, or the nav-reachability build gate fails. (Born from BUG-003301, where the HR sidebar rendered as a single non-expandable link, hiding all sub-pages.)

- **The `/hr` dashboard is the role router.** It resolves `viewer_role` from the **union** of `profiles.role` + `user_roles` (so a COO who is also `hr_admin` gets the operational layout, not the Director fallback), then renders one of three layouts:
  - **HR Officer** (daily ops): quadrants `todays_action`, `workforce`, `leave_utilization`, `policy_activity`
  - **Director** (strategic): `institution_posture`, `leave_health`, `compliance`, `trend`
  - **super-admin**: an 11-institution grid, with a header toggle to a rolled-up Director view

  Non-HR users hit a **403 at the API** *and* a **redirect-with-toast at the page**.

- **Permission keys are scattered and incomplete.** They live in several groups inside `lib/constants/permissions.ts`:
  - Core HR (`hr.recruitment.*`, `hr.leave.*`, `hr.employees.*`, `hr.policies.*`, `hr.onboarding.*`, `hr.dashboard.*`)
  - Counseling (`hr.counseling.*`, `hr.grievance.*`, `hr.career_development.view`)
  - Promotion (`hr.promotion.case.*`)
  - Attendance/leave-config (`hr.attendance.thresholds.write`, `hr.leave.policies.write`, `hr.leave.balance.dispute`)
  - Payroll (`hr.payroll.view`, `hr.payroll.manage`)

  **Many sub-modules have no keys at all** (compensation, benefits, forms, templates, automation, offboarding, termination, FnF, recruitment-need) and fall back to a `<SuperAdminOnly>` / `admin_or_super_admin` page guard + RLS.

---

## 4. The end-to-end employee journey (the spine)

The whole module assembles into one lifecycle:

```
                        ┌─────────────────────── WORKFORCE PLANNING (continuous) ───────────────────────┐
                        │  Recruitment-Need Signal: 7 inputs → 0–100 score → R/A/G/blocked per institution│
                        └────────────────────────────────────────┬──────────────────────────────────────┘
                                                                  │ "we need to hire"
   HIRE ─────────────► ONBOARD ─────────► WORK (ongoing) ─────────► GROW ──────────► EXIT
   Recruitment         Onboarding         Leave · Attendance        Performance       Offboarding
   submit→approve→     checklist +        Shifts · Documents        Promotions        / Termination
   package→offer→      required docs      Payroll (monthly)         Training · FDP    → FnF settlement
   joined                                 Memos (conduct)           Disciplinary ─────┘ (auto-link)
```

**How the stages hand off to each other** (the most important part of the "workflow"):

| From → To | Mechanism |
|---|---|
| Recruitment `joined` → Onboarding | `POST /candidates/[id]/onboarding/start` stamps a cadre-matched checklist into the candidate's `role_specific_details` JSONB (⚠️ *not* into an HR onboarding instance table — see §11) |
| **Disciplinary `termination` decision → Offboarding** | `recordDecision()` auto-inserts an `hr_offboarding_cases` row (`separation_type='termination'`) |
| Termination workflow → Offboarding | `termination-service` writes the *same* `hr_offboarding_cases` table (3-step chain) |
| Retirement cron → Offboarding | Monthly detector auto-creates retirement cases (all 59 live cases are this) |
| Leave/Balance/Encashment/Blackout writes → Dashboard | Supabase Realtime invalidates the matching dashboard quadrants cross-tab |
| Policy edits → Payroll | `prepare` step **snapshots** `hr.pay_scales` + deduction-rate policies onto the period (later edits don't affect it) |
| Leave + Regularization + Doc-uploads → Intelligence | The faculty-activity adoption KPI (target 60%) reads all three |

---

## 5. Cluster-by-cluster workflows

### 5.1 Dashboard / Command Center

**Path:** `app/(routes)/hr/page.tsx` → `hooks/hr/use-hr-dashboard.ts` (fetch) → `GET /api/hr/dashboard` (`withAuth({ requirePermission: 'hr.dashboard.view' })`) → `HRDashboardService` → Supabase. **Variant A.**

- Role-adapted **4-quadrant** payload (see §3). `viewer_role` resolved server-side from union of `profiles.role` + `user_roles`. `display_role` gives a precise label ("HR Head" vs "HR Officer").
- **Realtime (decision #21):** a Supabase channel watches 4 published tables and invalidates the matching React Query quadrants cross-tab:

  ```ts
  REALTIME_INVALIDATION_MAP = {
    hr_leave_applications: ['todays_action', 'leave_utilization', 'leave_health', 'trend'],
    hr_leave_balances:     ['leave_utilization', 'leave_health'],
    hr_leave_encashments:  ['compliance', 'todays_action'],
    hr_leave_blackouts:    ['todays_action', 'compliance'],
  }
  ```
- **Fiscal year = Apr 1 → Mar 31** (`getCurrentFiscalYear()`). FY-end banner fires in the last 14 days.
- **Graceful degradation:** each KPI, quadrant, and institution card carries its own optional `error` field — one failed aggregation renders a single inline error instead of blanking the page (decision #19).
- Every dashboard view writes audit rows to `hr_dashboard_access_log` (fire-and-forget `logDashboardAccess`); this feeds the Recent Activities feed.
- Insights row: employee-distribution donut + recent-activities feed (independent queries, fail-soft).

### 5.2 Recruitment (hire-to-start)

**Variant B** (cookie-auth + RLS; `hr.recruitment.*` keys enforced at RLS). Services: `recruitment-service`, `recruitment-jobs-service`, `recruitment-interviews-service`, `recruitment-package-service`, `recruitment-scorecards-service`, `alumni-signal-service`.

**Candidate state machine** (`CandidateStatus`):
```
submitted / pending_approval → approved → package_fixed → offer_issued → joined
terminals: rejected · withdrawn · no_show · offer_rescinded
```
Transitions (enforced in `RecruitmentService`, forward-only `validTransitions` map):

| From | To | Trigger |
|---|---|---|
| (new) | `pending_approval` | `POST /candidates` → `submitCandidate` (frozen `approval_chain`, `current_step=0`) |
| pending/submitted | advance step → `approved` on final step | `POST /candidates/[id]/approve` → `approveCandidate` |
| pending/submitted | `rejected` | `POST /candidates/[id]/reject` → `rejectCandidate` |
| pre-offer | `withdrawn` | `POST /candidates/[id]/withdraw` |
| approved | `package_fixed` | `POST .../packages/[packageId]/approve` → `approvePackage` |
| package_fixed | `offer_issued` | `PATCH .../status` |
| offer_issued | `joined` / `no_show` / `offer_rescinded` | `PATCH .../status` (on `joined` stamps `actual_joining_date`) |

- **Frozen approval chain (R1.4):** at submit, `fn_list_active_approval_flows(p_hr_org_id, p_flow_for='recruitment_approval')` (SECURITY DEFINER) reads `hr_approval_flows`, matched **most-specific-first** on `role_category` + `monthly_salary_band`. The chain (`LeaveApprovalStep[]`-shaped) is *snapshotted* onto the candidate; later flow edits don't affect in-flight candidates. `approver_user_id` resolved at approve-time. Approver inbox uses `fn_list_my_pending_recruitment(p_user_id)` (matches `approval_chain[current_step].approver_role` to the caller's `role_key`).
- **Config-driven gates:** optional role-match enforcement (`hr.recruitment.approvals.enforce_role_match`) and viewer-scoping (`hr.recruitment.approvals.enforce_scoping` + `scope_rules`), both via `platform_policies`, default OFF.
- **Package negotiation** (`PackageStatus`): `proposed → countered` (spawns child with `parent_package_id`, `is_counter_offer=true`) → `approved` flips candidate to `package_fixed`. All money is **monthly salary** (bands `under_50k`/`50k_to_1L`/`over_1L`), not annual CTC.
- **Interviews** (`InterviewStatus`): `scheduled → completed/cancelled/no_show/rescheduled` (reschedule inserts a new row + `rescheduled_from_id` audit link). **Scorecards** are submit-once per interviewer (UNIQUE `interview_id, interviewer_id`), 1–5 ratings, `interviewer_id` forced to `auth.uid()`.
- **Jobs** (`JobStatus`): `draft → open → on_hold/closed/filled`; `publish` sets `is_public=true`, flips draft→open, stamps `posted_at` (makes it visible on `/careers`).
- **Alumni signal:** email-keyed "JKKN history" lookup (prior learner/alumnus, ex-staff re-hire, council roles, builder projects) — single (`GET .../alumni-signal`) + bulk (`POST .../alumni-signal-bulk`, ≤100).
- **Onboarding handoff:** `POST .../onboarding/start` (candidate must be `joined`) maps `role_category` → checklist name (hard-coded `cadreMap`), then writes `onboarding_steps[]` into `role_specific_details` JSONB. `complete-step` mutates a step in place with a **role allow-list** `{super_admin, hr_officer, hr_head, director_jkkn}` (not the `hr.onboarding.execute` key).

### 5.3 Workforce Planning / Recruitment-Need (Intelligence)

The data-driven "how many faculty do we need to hire" engine. Spec: `specs/hr-recruitment-need-signal-2026-05-24.md`.

**Model (Decision AT.5):** 1 orchestrator RPC + 7 replaceable input "plugin" functions, each `(p_institution_id, p_program_id DEFAULT NULL) → hr_signal_input_result` (`input_key, status, value, norm, gap, pct_of_norm, raw_data`). Per-input status: `green | amber | red | insufficient_data`; overall adds `blocked`.

**The 7 inputs** (registry `hr_recruitment_signal_inputs`, default weight 14.29 each):

| input_key | Function | Meaning | Thresholds | Key sources |
|---|---|---|---|---|
| `sanctioned_gap` | `fn_compute_input_sanctioned_gap` | weighted headcount vs sanctioned | amber<100%, red<80% | `institution_program_approvals.sanctioned_faculty_count`, `staff` (employment-weighted), `hr_staff_institution_allocation` |
| `sfr` | `fn_compute_input_sfr` | students/faculty vs norm | from `hr_regulatory_norms` | `learners_profiles`, `staff`, `hr_regulatory_norms` |
| `specialization_gap` | `fn_compute_input_specialization_gap` | covered/required specializations | amber≥80, red≥60 | `hr_specializations`, `staff_specializations` |
| `workload` | `fn_compute_input_workload` | avg weekly contact hrs vs norm (16) | amber≤100, red≤120 | `hr_faculty_workload` |
| `projected_intake` | `fn_compute_input_projected_intake` | pipeline vs capacity | amber≤100, red≤120 | `learners_profiles`, `institution_program_approvals.approved_intake` |
| `attrition_pipeline` | `fn_compute_input_attrition_pipeline` | at-risk % of staff | amber≤10, red≤20 | resignation-pattern leave, `staff.date_of_birth` vs retirement age (60) |
| `peer_benchmark` | `fn_compute_input_peer_benchmark` | JKKN SFR vs peer avg | amber≥90, red≥75 | `hr_peer_benchmarks` |

**Orchestrator `fn_compute_recruitment_signal`:** computes FY (Apr–Mar) → runs all 7 → weights each (from `platform_policies` `hr_recruitment.weight_<input>`, must sum to 100) → status→score map (**green=100, amber=60, red=20**) → normalizes to 0–100 (**overall: green≥80, amber≥50, else red**). **Fail-closed (Decision F1.2):** any `insufficient_data` input ⇒ overall `blocked`, score NULL. Upserts into `hr_recruitment_signal_cache`.

**Signal lifecycle:** **snooze** (`hr_recruitment_signal_suppressions`, until `suppress_until`) + **escalate-to-Director** (`hr_recruitment_escalations`: `pending → acknowledged → resolved/dismissed`, with private-bucket `hr-recruitment-escalation-docs` attachments) + **snapshot/export** (`hr_recruitment_signal_snapshots`, manual audit freeze).

**Workload import/verify:** `/hr/workload` → `WorkloadService` → `hr_faculty_workload`. Template (`GET /api/hr/workload/template`, **public, no auth**) → import (`POST .../import`, ExcelJS ≤5MB/≤1000 rows, resolves `staff_email → staff.id`) → verify (`POST .../[id]/verify` stamps `verified_at/by`). ⚠️ the workload input fn averages **all** rows regardless of verification.

**Reference tables:** `hr_regulatory_bodies` (AICTE/NMC/…), `hr_regulatory_norms` (SFR norm + thresholds per program-type), `hr_specializations` + `staff_specializations`, `hr_peer_benchmarks`, `hr_staff_institution_allocation` (≤100% across open allocations), `institution_program_approvals` (sanctioned strength + intake).

**Analytics & faculty-activity** (independent reporting): `/hr/analytics` (headcount, hiring trend, attrition, distribution, leave utilization, tenure — computed live); `/api/hr/faculty-activity` (adoption KPI: % active staff with ≥1 HR action in 30 days, **target 0.6**).

### 5.4 Time & Attendance — Leave, Regularization, Shifts

**Leave** is **Variant B** (full 5-layer); **Regularization & Shifts are Variant C** (no API route, client→service→RLS).

**Leave application** (`LeaveApplicationStatus`):
```
pending → approved | rejected | cancelled | withdrawn | (escalated*)
step status: pending | approved | rejected | skipped
```
| From | Action | To | Method |
|---|---|---|---|
| — | apply | `pending` | `applyLeave` |
| pending/escalated | approve step | `pending` or `approved` (final) | `approveApplication` |
| pending/escalated | reject | `rejected` | `rejectApplication` |
| pending/escalated | withdraw (own, pre-approval) | `withdrawn` | `withdrawApplication` |
| approved | cancel (post-approval) | clone `cancelled`, original `superseded_by` | `cancelApplication` |

- **Frozen `approval_chain` + `current_step`** built at apply-time from `hr_approval_flows` (most-specific scope wins; department overrides institution). Same snapshot pattern as recruitment. A step names a **role**, not a user; the route passes `user.id` without verifying the caller holds the role — **RLS-dependent** (`hr.leave.approve`).
- **Apply-time validation chain** (each throws before insert): leave-type `scope='staff'` → blackout check (`hr_leave_blackouts`) → min advance notice (bypassed if `is_emergency`) → max continuous days → balance (`entitled + carried_forward - used`). A DB trigger computes authoritative `total_days` via `hr_calc_leave_days`.
- **Cancel = supersede pattern** (decision 6): a new `cancelled` row + `superseded_by` on the original; a **DB trigger restores the balance delta**.
- **Balance:** `getBalance` reads `hr_leave_balances` (`entitled`, `used`, `carried_forward`); accrual itself is maintained by **DB triggers**, not app code.
- **Encashment** (`pending → approved | rejected → paid`): request only — **approve/reject/pay is not implemented** in this cluster.
- **Calendar:** org-wide, `status='approved'` only, and deliberately shows peers a generic **"On Leave"** label (privacy decision 23). **Comments** thread (`hr_leave_application_comments`).
- **Notifications:** only leave dispatches them — `leave_submitted` (to first chain step's approvers, resolved by role), `leave_approved`, `leave_rejected` — via `StaffNotificationService` + service-role client, fire-and-forget.

**Attendance regularization** (`pending → approved | rejected`): employee fixes a missed punch (`submitRequest`); approval (`approveRequest`) best-effort stamps `hr_attendance_records` (`source='regularization'`, non-fatal). No notifications.

**Shifts:**
- **Templates** (`hr_shift_templates`): global ⇄ institution-override (institution row wins on duplicate `template_code`).
- **Assignments** (`hr_shift_assignments`): binds `staff_id` to a template or override hours, over a date range, with multi-week rotation (`rotation_weeks` 1–4 + `rotation_pattern`).
- **My shifts** + **swap chain** (`HRShiftSwapStatus`): `pending → counterparty_accepted → approved | rejected | cancelled | (expired*)`. Approval is a **per-day override** — it does **not** rewrite the underlying assignments. No notifications.

`*` = enum value with no setter in this cluster.

### 5.5 Employee Lifecycle

Employees, Onboarding, Documents, Offboarding, Termination, My-Assets. Mostly **Variant C** (only `/hr/employees` list goes through an API route).

**"Employee" = `staff` now.** Migration `20260524083600_consolidate_hr_employees_to_staff.sql` merged the old `hr_employees` table into `staff` + `hr_staff_details`. The "Non-Staff Workforce" vs "Full-Time Staff" split on the dashboard is **vestigial**: the old table physically exists but holds **0 rows**; `HRPersonService.list()` hardcodes `employment_type='full_time'`; `/hr/employees/new` is a dead stub that throws; the POST/DELETE API routes are commented out. `/hr/employees` is a read-only HR-lens mirror of `/staff/list`.

**Onboarding:** two policy tables, **no per-joinee instance tracking**:
- `hr_onboarding_checklists` — per `(org × cadre)` templates; `steps` JSONB. Admin CRUD at `/hr/admin/onboarding-checklists` (gated `admin_or_super_admin`, *not* `hr.onboarding.*`). Live: **8 templates**.
- `hr_required_documents` — which docs each `employment_type` must submit.
- ⚠️ `hr_staff_onboarding_progress` (the per-hire progress table) **does not exist** — a documented deferred Phase-2 gap. HR onboarding is briefing-only and **disconnected** from the recruitment `onboarding/start` routes.

**Document verification** (`EmployeeDocumentVerificationStatus`): `pending → verified | rejected | expired` (cron flips `expired` when `expires_at` passes).
- Upload (`/hr/documents`): PDF/JPG/PNG, **5 MB cap**, bucket `hr-employee-documents`. "Live" = not superseded via `replaces_document_id`.
- Verify queue (`/hr/documents/verify`): gated by `hr.employees.edit` (**no dedicated `hr.documents.*` key**). Verify / Reject (notes required, employee-visible).
- Live: 0 required-doc policies, 0 uploads (built, unused).

**Offboarding:** one table (`hr_offboarding_cases`, `open → withdrawn | completed`) serves all four `separation_type`s (`resignation | retirement | termination | death`).
- **Steps are data-driven** from a `platform_policies` row `hr.offboarding.workflow_steps` (5 defaults: resignation_initiation → exit_call → asset_submission → noc → final_settlement). Editor gated `SuperAdminOnly`.
- **Resignation rules** (`hr.resignation_workflow`): min service years, notice period, end-of-academic-year window (16 May – 15 Jun).
- **Full & Final (FnF)** (`hr_fnf_calculations`, append-only): Indian statutory formulas — **gratuity** = `(basic+DA) × 15/26 × completed_years`, min 5 years, capped **₹20 lakh**; **leave encashment** = `(basic+DA)/30 × leave_balance_days`; + PF, other payable/recoverable; `net_payable` generated.
- **Retirements:** auto-created by a monthly cron. Live: **all 59 cases are retirement type**; 0 FnF calculated.

**Terminations** (`termination-service`, writes the *same* `hr_offboarding_cases` table, `separation_type='termination'`):
- Director-initiated; requires grounds >20 chars OR a linked disciplinary case; optional notice-period waiver.
- **3-step chain** `CANONICAL_APPROVAL_CHAIN = ['sedc', 'legal', 'director']` (strict order). All approved → `completed`; **any rejection → `withdrawn` (final)**.
- All pages gated `SuperAdminOnly` (**no permission keys**).

**My Assets** (`/hr/my-assets`): staff-facing, read-only, raw inline query against the **`resources`** table (Resource-Management module), filtered `assignee_type='staff' AND assignee_id={staff.id} AND returned_at IS NULL`. Assignment/return lives in `/resource-management/*`.

### 5.6 Performance, Growth & Conduct

**Variant split:** Promotions/Memos/Disciplinary have API routes; **Performance/Training/FDP have none** (Variant C). Admin surfaces use `<SuperAdminOnly>`, not `hr.*` keys.

**Performance reviews:**
- Cycle (`CycleStatus`): `draft → open → locked → closed`.
- Appraisal (`ReviewStatus`): `draft → self_submitted → supervisor_reviewed → sedc_reviewed → final_approved` (each later stage can bounce back one step). 4 stages: self → supervisor/HoD → SEDC → Director final.
- My-Appraisal (own row, cycle `open` only, read-only once submitted) vs Team-Reviews (cycle `open|locked`, RLS-scoped to your department).

**Promotions** (`PromotionStatus`): `submitted → sedc_scored → approved | rejected | withdrawn`.
- `submit` → `sedc_score` (merit/qualification/commitment points) → `director_decide` (writes directly to `approved`/`rejected`).
- ⚠️ `director_decided` is a **dead state** (never produced). `canTransition` map declared but unused. *Promotion-suggestions* (policy globalization) is an unrelated naming collision.

**Training:**
- Program (`TrainingStatus`): `draft → open → in_progress → completed | cancelled` (table `hr_training_sessions`).
- Enrollment (`EnrollmentStatus`): `registered → attended → completed | dropped` (self-enroll, plain insert).

**FDP (Faculty Development Program):** **reuses the Training tables** (`category='fdp'`, no separate tables).
- Application (`FdpApplicationStatus`, superset): `applied → hod_approved → director_approved → attended → completed | rejected | dropped`.
- Adds a two-step approval gate Training lacks + funding fields (`sponsoring_body`, `funding_amount`) + append-only `application_log`. ⚠️ HoD-vs-Director steps are **not role-enforced**.

**Memos** (`MemoStatus`): `issued → acknowledged | disputed → resolved`.
- Auto-issued by a detector cron or manually (`issueManual`). Acknowledge/Dispute are **ownership-gated** (`staff.auth_user_id === user.id`); Resolve is **admin-only** (`is_super_admin`), requires a resolution note + `counts_toward_termination` flag.

**Disciplinary cases:** dual axes —
- `DisciplinaryStage`: `initiated → enquiry → hearing → decision → closed`
- `DisciplinaryStatus`: `active → closed`
- `DisciplinaryOutcome`: `warning | suspension | termination | exonerated`
- `advanceStage` (ordered `NEXT_STAGE` map) handles `initiated→…→decision`; it **cannot** take `decision→closed` (reserved for `recordDecision`). `recordDecision` sets outcome + `current_stage='closed'` + `status='closed'` in one write, and **on `termination` auto-creates an offboarding case** (best-effort, never blocks). Witnesses + notes are events in `hr_disciplinary_events`. All 5 routes gate on `is_super_admin`.

### 5.7 Pay, Policy & Dynamic Config

**Payroll** (**Variant A**, `withAuth` + `hr.payroll.view/manage`):
- Period (`hr_payroll_periods.status`): `draft → prepared → cao_reviewed → accounts_verified → chairperson_approved → distributed → locked`. One row per `(institution × engine_type × year × month × is_backdated)`; `engine_type IN ('faculty','non_teaching')`.
- Every transition is a **SECURITY DEFINER RPC** with hard role ownership (no delegation; only Director/admin override; Postgres `42501` → HTTP 403): `fn_prepare_payroll_period`, `fn_advance_payroll_period`, `fn_reject_payroll_period` (reason required), `fn_backdate_payroll_period` (Director only). The `status` is a **projection of the latest row in the append-only `hr_payroll_period_approvals`**.
- **Prepare snapshots** `pay_matrix_snapshot` (`hr.pay_scales`) + `deduction_rates_snapshot` (5 policy keys) + computes `working_days_count`.
- **Deduction engine** (`computeDeductions`, pure I/O-free): PF (% of min(basic, ceiling)), ESI (% of gross, zero above ceiling), TDS (annualize → slabs → §87A → cess → ÷12, simplified), PT (TN monthly slab). `loadPayrollPolicies` returns `null` if any of the 5 policy objects is missing.
- **Payslip generator** (runs only when `prepared`): idempotency guard → load staff + pay scales + earning components → compute gross → deductions (⚠️ LOP stubbed at 0 in v1) → batch-insert `hr_payslips` + `hr_payslip_line_items` → update period aggregates. Corrections use a **supersede chain** (`hr_payslips.superseded_by`, `correction_type IN initial|adjustment|arrear|recovery|backdated`).

**Compensation** (`GET /api/hr/compensation`): **analytics, not config** — reads `hr_payslips` of the latest distributed/locked period; computes total cost, avg/median, **pay-equity ratio**, band distribution, per-institution comparison, anonymized top/bottom-10. ⚠️ queries `gross_salary`/`payroll_period_id` vs the generator's `gross_amount`/`period_id` (latent mismatch).

**Benefits** (`GET/POST /api/hr/benefits`): `hr_benefits_catalog` + `hr_benefits_enrollments` CRUD (soft cancel) + enrollment stats.

**Policy management — two substrates side by side:**
- **(A) Legacy `hr_*` row-versioned tables (19)** — `policy-service` + `features/hr/policies/registry.ts`, surfaced by `/hr/policies/[table]`. **Policy-as-data via `[table]` dynamic routing**: ONE page + ONE route render all 19 tables from registry metadata (`assertTable()` allow-lists the param). Versioning = supersede chain (`valid_until` + `superseded_by`; `hr_policy_history`/`hr_policy_diff` RPCs).
- **(B) Wave-3 `platform_policies` (JSONB, the consolidation target)** — `wave3-policy-editor-service` + `policy-audit-service`, under `/hr/admin/policies/**` (46 pages). Lifecycle: `saveDraft` (→`draft_pending`) → `publishDraft` (→`published`) / `unpublishPolicy`; **every mutation requires a non-empty reason** (DB CHECK) and writes `hr_policy_audit_log` (`edit_draft|publish|unpublish|classify_change|promote_to_global`). `classification` (operational vs major) gates CAO vs Director-only edits; `scope_type IN global|institution|role|user`.
- Admin policy categories on disk: leave/* (7), rd/* (5), new/* (4), and ~22 standalone (pay-scales, code-of-conduct, cadres, working-schedule, etc.).

**Dynamic Forms engine** (`form-builder-service`, tables `hr_forms` + `hr_form_submissions`; builder writes are super_admin only):
- Build: widget schema (discriminated union: text/textarea/number/date/dropdown/radio/checkbox/file_upload/signature/conditional) + ordered `ApprovalWorkflowStep[]`. Same draft→publish pattern.
- Submission (`SubmissionStatus`): `submitted → in_review → approved | rejected | withdrawn`. Submit seeds `current_step` = first step (or immediate `approved` if zero steps); `advance` (reason mandatory) approves/rejects step-by-step, appending to append-only `approval_history`; terminal states 409 on re-advance. Best-effort notifications via `form-submission-notifications`.

**Templates** (`hr_templates`): a downloadable **document/file library** (interview questions, email templates, checklists, etc.), category-tabbed, with download counter. *Not* notification templates.

**Automation rules** (`/hr/admin/automation-rules`): a single `platform_policies` row `hr.automation_rules` defines attendance-deduction rules (late_entry / break / early_exit / overtime — HH:MM threshold + ₹ deduction + monthly cap). The attendance cron consumes it and records firings into `hr_automation_rule_fires` — **zero-deploy** tuning.

---

## 6. Recurring design patterns

Four patterns repeat across nearly every cluster — recognizing them lets you read any HR feature quickly:

1. **Frozen snapshots** decouple in-flight work from config. Recruitment & leave snapshot their *approval chains*; payroll snapshots its *pay matrix + deduction rates*. Edit the config later — running items keep their original terms.
2. **Supersede chains** instead of hard updates give free audit history: leave cancellation, payslip corrections, and policy versioning all insert a new row + point `superseded_by`/`valid_until` at it.
3. **Config-row + mandatory-reason + audit-log** governs every consequential change (policies, forms, automation) — no hardcoded values, no developer round-trip.
4. **Fire-and-forget side effects via service-role client**: notifications and best-effort stamps run in `void (async()=>{})()` blocks so they can never break the primary mutation.

---

## 7. Consolidated state-machine reference

| Workflow | States |
|---|---|
| Recruitment candidate | submitted/pending_approval → approved → package_fixed → offer_issued → joined · {rejected, withdrawn, no_show, offer_rescinded} |
| CTC package | proposed → approved \| countered \| rejected |
| Interview | scheduled → completed \| cancelled \| no_show \| rescheduled |
| Job posting | draft → open → on_hold \| closed \| filled |
| Leave application | pending → approved \| rejected \| cancelled \| withdrawn \| (escalated\*) |
| Leave encashment | pending → approved \| rejected → paid *(approve/pay not implemented)* |
| Attendance regularization | pending → approved \| rejected |
| Shift swap | pending → counterparty_accepted → approved \| rejected \| cancelled \| (expired\*) |
| Employee document | pending → verified \| rejected \| expired |
| Offboarding case | open → withdrawn \| completed (×4 separation types) |
| Termination chain | sedc → legal → director (all approved ⇒ completed; any reject ⇒ withdrawn) |
| Performance cycle | draft → open → locked → closed |
| Performance appraisal | draft → self_submitted → supervisor_reviewed → sedc_reviewed → final_approved |
| Promotion | submitted → sedc_scored → approved \| rejected \| withdrawn *(director_decided dead)* |
| Training enrollment | registered → attended → completed \| dropped |
| FDP application | applied → hod_approved → director_approved → attended → completed \| rejected \| dropped |
| Memo | issued → acknowledged \| disputed → resolved |
| Disciplinary | stage: initiated→enquiry→hearing→decision→closed; status: active→closed |
| Payroll period | draft → prepared → cao_reviewed → accounts_verified → chairperson_approved → distributed → locked |
| Form submission | submitted → in_review → approved \| rejected \| withdrawn |
| Recruitment-need signal | green \| amber \| red \| blocked \| insufficient_data |
| Escalation | pending → acknowledged → resolved \| dismissed |

`*` = enum value exists but **no code path sets it**.

---

## 8. Cross-cluster workflow graph

```
Recruitment ──(joined)──► onboarding/start ──► candidate.role_specific_details JSONB
                                                  ⚠ NOT linked to HR onboarding (no instance table)

Disciplinary ──(outcome=termination)──► hr_offboarding_cases (separation_type=termination)
Termination workflow ───────────────►  hr_offboarding_cases (3-step sedc→legal→director)
Retirement cron ─────────────────────►  hr_offboarding_cases (separation_type=retirement)
Offboarding case ──────────────────────► FnF settlement (hr_fnf_calculations)

Leave/Balance/Encashment/Blackout writes ──(Supabase Realtime)──► Dashboard quadrants

platform_policies ──► Payroll prepare snapshot (pay scales + deduction rates)
platform_policies ──► Automation rules (attendance deductions)
platform_policies ──► Recruitment-need weights/thresholds
platform_policies ──► Offboarding workflow steps + resignation rules
platform_policies ──► Recruitment approval scoping

staff + learners + leave + workload + specializations
       + peer_benchmarks + approvals ──► Recruitment-Need signal (7 inputs)

leave + regularization + employee-documents ──► Faculty-activity adoption KPI
hr_payslips ──► Compensation analytics
```

---

## 9. Key DB tables reference

**Dashboard:** `hr_dashboard_access_log`; realtime on `hr_leave_applications`, `hr_leave_balances`, `hr_leave_encashments`, `hr_leave_blackouts`.

**Recruitment:** `hr_recruitment_candidates`, `hr_recruitment_candidate_packages`, `hr_recruitment_jobs`, `hr_recruitment_interviews`, `hr_recruitment_scorecards`, `hr_approval_flows`, `hr_onboarding_checklists`.

**Recruitment-Need:** `hr_recruitment_signal_cache`, `hr_recruitment_signal_inputs`, `hr_recruitment_signal_suppressions`, `hr_recruitment_escalations`, `hr_recruitment_signal_snapshots`, `hr_faculty_workload`, `hr_regulatory_bodies`, `hr_regulatory_norms`, `hr_specializations`, `staff_specializations`, `institution_program_approvals`, `hr_staff_institution_allocation`, `hr_peer_benchmarks`.

**Leave/Attendance/Shifts:** `hr_leave_applications`, `hr_leave_application_comments`, `hr_leave_balances`, `hr_leave_encashments`, `hr_leave_blackouts`, `leave_types`, `hr_attendance_regularizations`, `hr_regularization_reasons`, `hr_attendance_status_types`, `hr_attendance_records`, `hr_shift_templates`, `hr_shift_assignments`, `hr_shift_swap_requests`.

**Employee Lifecycle:** `staff` + `hr_staff_details` (unified store), `hr_employees` (orphaned, 0 rows), `hr_onboarding_checklists`, `hr_required_documents`, `hr_employee_documents`, `hr_offboarding_cases`, `hr_offboarding_step_completions`, `hr_fnf_calculations`, `resources` (My-Assets).

**Performance/Conduct:** `hr_performance_review_cycles`, `hr_performance_reviews`, `hr_promotion_applications`, `hr_promotion_decisions`, `hr_training_sessions`, `hr_training_enrollments`, `hr_memos`, `hr_memo_eligibility_events`, `hr_memo_state_transitions`, `hr_disciplinary_cases`, `hr_disciplinary_events`, `hr_disciplinary_witnesses`.

**Pay/Policy/Forms:** `hr_payroll_periods`, `hr_payroll_period_approvals`, `hr_payslips`, `hr_payslip_line_items`, `hr_pay_scales`, `hr_pay_components`, `hr_benefits_catalog`, `hr_benefits_enrollments`, `platform_policies`, `hr_policy_audit_log`, `hr_policy_promotion_suggestions`, the 19 legacy `hr_*` policy tables, `hr_forms`, `hr_form_submissions`, `hr_templates`, `hr_automation_rule_fires`.

**Key RPCs:** `fn_compute_recruitment_signal` + 7 `fn_compute_input_*`; `fn_list_active_approval_flows`, `fn_list_my_pending_recruitment`; `fn_prepare/advance/reject/backdate_payroll_period`; `fn_get_policy`/`fn_get_policy_json`/`fn_get_policy_bool`; `hr_policy_history`/`hr_policy_diff`; `hr_calc_leave_days`.

---

## 10. Permission keys reference

**Declared in `lib/constants/permissions.ts`:**
- `hr.recruitment.{view,create,edit,delete,approve}`, `hr.recruitment.packages.{view,propose,approve}`
- `hr.leave.{view,apply,approve,cancel,withdraw}`, `hr.leave.balance.view`, `hr.leave.encashment.{view,approve}`, `hr.leave.policies.write`, `hr.leave.balance.dispute`, `hr.leave.dispute.approve`
- `hr.employees.{view,create,edit,delete,export}`
- `hr.policies.{view,create,edit}`, `hr.policies.history.view`
- `hr.onboarding.{view,manage,execute}`
- `hr.dashboard.{view,manage}`
- `hr.counseling.*`, `hr.grievance.{view,escalate}`, `hr.career_development.view`
- `hr.promotion.{criteria.write, case.create, case.view, case.decide}`
- `hr.attendance.{status_types.write, thresholds.write}`
- `hr.payroll.{view,manage}`

**Referenced but NOT declared** (likely granted ad hoc / RLS-only): `hr.attendance.regularize_self`, `hr.attendance.regularize_approve`, `hr.attendance.approve_team`, `hr.attendance.edit`, `hr.attendance.override`, `hr.recruitment.scorecards.view`, `hr.recruitment.jobs.*`.

**No keys at all (gated by `<SuperAdminOnly>` / `admin_or_super_admin` / RLS):** compensation, benefits, forms, templates, automation, offboarding, FnF, retirements, terminations, the entire recruitment-need cluster, document-verification (reuses `hr.employees.edit`).

**Inert gates:** `analytics` and `faculty-activity` routes call `withAuth` but pass no `requirePermission`, so the documented `hr.dashboard.view` gate is not enforced. `recruitment-need/approvals/template` and `workload/template` are **fully public**.

---

## 11. Gaps & latent issues

Real findings (several DB-verified) worth knowing before touching the module:

- **Onboarding has no instance/progress table** (`hr_staff_onboarding_progress` doesn't exist). HR onboarding is briefing-only; recruitment's `onboarding/start` routes stamp progress into the candidate JSONB instead — the two halves are **disconnected**.
- **Leave encashment has no approve/reject/pay path** despite the status enum + `hr.leave.encashment.approve` key.
- **Inert auth gates:** `analytics` / `faculty-activity` `withAuth` without `requirePermission`; two `template` routes fully public.
- **RBAC holes:** terminations, FnF payouts, forms, templates, automation, compensation, benefits, and the whole recruitment-need cluster have no grantable permission keys — `SuperAdminOnly`/RLS only. Several `hr.attendance.regularize_*` keys are referenced but undeclared.
- **Latent bugs:**
  - `termination-service.tryLoadGroundsFromDisciplinary()` selects `summary/allegations/final_decision_notes` but the actual `hr_disciplinary_cases` columns are `alleged_misconduct/outcome/outcome_note` → would error if exercised.
  - `compensation-service` reads `hr_payslips.gross_salary`/`payroll_period_id` vs the generator's `gross_amount`/`period_id`.
  - Promotion `director_decided` is a dead state; `PromotionService.calculateMeritScore` reads `appraisal_score` (actual column `final_score`) → merit-from-appraisal is inert.
  - Workload create passes `institution_id: ''` (the documented `'' → null` / `22P02` gotcha).
  - Disciplinary `case_number` generation is race-prone (no sequence/RPC).
- **Dead / vestigial surfaces:** `hr_employees` table (0 rows, code wrongly says "dropped"), `/hr/employees/new` dead stub, payroll `/preview` demo predating the real flow, FDP HoD-vs-Director steps not role-enforced, the `escalated` (leave) and `expired` (shift swap) enum values that no code path sets.

---

*End of analysis.*
