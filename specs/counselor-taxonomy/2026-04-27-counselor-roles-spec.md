# Counselor Roles Spec — Phase 2 (Module Build)

> **Status:** DRAFT — awaiting Omm's domain answers on 7 open questions before module DDL ships
> **Authors:** Agent H (parallel swarm) per Omm's directive of 2026-04-26
> **Domain owner:** Omm Sharma, MD + CAIO
> **Last updated:** 2026-04-27
> **Predecessor:** `specs/counselor-taxonomy-spec.md` (Phase 1 — role substrate, **already shipped**)
> **Related sibling work-in-flight:** Agent G (UI guardrails for `counselor` role), Agent I (server-side revert-prevention on counselor identity sync)

---

## TL;DR

Phase 1 is **done**: 4 distinct counselor roles (`counselor`, `learner_counselor`, `staff_counselor`, `health_counselor`) plus 22 new permission keys (8 + 8 + 6 = 22, see `lib/constants/permissions.ts:320-337, 571-588`) are seeded on production right now. But: **zero users are assigned to `learner_counselor` or `staff_counselor`**, **zero counseling tables exist**, **zero `/learners/counseling` or `/hr/counseling` pages exist**. The two sidebar entries gate on placeholder permission keys, and a click resolves to a 404.

This Phase 2 spec defines:
1. The **persona deepening** for each of the 4 counselor types (audience, data, workflows, reporting line, notification surfaces) — refined from Phase 1's sketch with code citations.
2. The **module-level deliverable** for Phase 2: 3 new sub-modules (`/learners/counseling/*`, `/hr/counseling/*`, `/health/counselor/*` expansion), 6 new tables, RLS policies, audit log, test accounts.
3. The **migration plan** to layer Phase 2 on top of Phase 1 without breaking the 8 existing admission counselors or the 1 existing health counselor.
4. The **7 open questions** that block DDL — Omm must answer before any `CREATE TABLE` runs.

A fresh agent could execute this spec after Omm answers Q1-Q7.

---

## 1. Current state — production-verified 2026-04-27

All facts in this section were verified live against `kvizhngldtiuufknvehv.supabase.co` (prod) on 2026-04-27.

### 1.1 Roles on production (`custom_roles`)

| role_key | role_name | scope | system role | active | granted perms | users assigned |
|---|---|---|---|---|---|---|
| `counselor` | Admission Counsellor | `all` | `true` | `true` | 21 keys = `true` | **8** |
| `learner_counselor` | Learner Counsellor | `own` | `true` | `true` | 14 keys = `true` | **0** |
| `staff_counselor` | Staff Counsellor | `own` | `true` | `true` | 12 keys = `true` | **0** |
| `health_counselor` | Health Counselor | `own` | `true` | `true` | 2 keys = `true` | **1** |

Source: `SELECT role_key, ..., (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = cr.id) FROM custom_roles cr` against prod.

**Phase 1 deltas vs the 2026-04-24 snapshot in the prior spec:**
- `health_counselor.description` — was `NULL`, now populated (✅).
- `health_counselor.is_system_role` — was `false`, now `true` (✅).
- `learner_counselor` and `staff_counselor` — newly seeded with full scope/perm/system-role metadata (✅).
- `health_counselor` permission set — STILL only 2 keys (`health.escalations.view`, `health.student_data.view`). The Phase 1 spec proposed expanding to 10 keys. **This expansion never landed.** Tracked as gap G-1 below.

### 1.2 Permission keys on production (`lib/constants/permissions.ts`)

| Category | Block in `permissions.ts` | Key count | Phase |
|---|---|---|---|
| Admission CRM | `lines 853-938` | 88 keys (incl. `admission.counselors.*` 5 keys) | Pre-Phase-1 |
| **Learner Counseling** | `lines 320-337` | 8 keys: `learners.counseling.{view,sessions.{view,create},notes.{create,view_own}}`, `learners.at_risk.view`, `learners.interventions.{create,close}` | Phase 1 (LIVE) |
| **Staff Counseling** | `lines 571-588` | 8 keys: `hr.counseling.{view,sessions.{view,create},notes.{create,view_own}}`, `hr.grievance.{view,escalate}`, `hr.career_development.view` | Phase 1 (LIVE) |
| Health (existing) | granted on role only (no `health.*` block in `PERMISSION_CATEGORIES`) | 2 keys live; ~10 proposed | **GAP G-1** |

> Confirmed: all 16 new Phase 1 keys exist in `permissions.ts` and are committed to `jicate/main`.

### 1.3 Sidebar wiring (`lib/sidebarMenuLink.ts`)

| Route | Permission gate | Phase | Page exists? |
|---|---|---|---|
| `/admission/counselors` (+5 sub-pages) | `admission.counselors.view` | Pre-Phase-1 | ✅ `app/(routes)/admission/counselors/{alerts,briefing,calls,daily-view,reminders,productivity}/page.tsx` |
| `/health/counselor` | (no MENU_PERMISSIONS entry — gated in `header-content.tsx:1249`) | Pre-Phase-1 | ✅ `app/(routes)/health/counselor/page.tsx` (mental-health triage dashboard) |
| `/learners/counseling` | `learners.counseling.view` | Phase 1 (gate only) | ❌ no `app/(routes)/learners/counseling/page.tsx` |
| `/hr/counseling` | `hr.counseling.view` | Phase 1 (gate only) | ❌ no `app/(routes)/hr/counseling/page.tsx` |

Citations: `lib/sidebarMenuLink.ts:206` (learners), `:258` (hr), `:477-482` (admission), `components/header-content.tsx:1249` (health).

### 1.4 Tables on production related to counseling

| Table | Purpose | Status |
|---|---|---|
| `admission_counselors` | Admission CRM counselor metadata. 12 cols. FK: `user_id → auth.users.id` (nullable), `institution_id` (NOT NULL). 8 active rows. | LIVE |
| `admission_counselors_audit_log` | Change log for admission_counselors. | LIVE |
| `counselor_sla_strikes` | SLA-strike tracker for admission counselors. | LIVE |
| `v_institutions_needing_admission_counselors` | View — institutions without an active counselor. | LIVE |
| `learner_counseling_sessions` | (proposed) | **Does not exist** |
| `learner_counseling_notes` | (proposed) | **Does not exist** |
| `learner_interventions` | (proposed) | **Does not exist** |
| `staff_counseling_sessions` | (proposed) | **Does not exist** |
| `staff_counseling_notes` | (proposed) | **Does not exist** |
| `health_counseling_sessions` | (proposed) | **Does not exist** |
| `health_medical_records` | (proposed) | **Does not exist** |
| `health_counseling_access_log` | (proposed — confidentiality audit) | **Does not exist** |

Existing `health_*` tables (LIVE today): `health_assessments`, `health_consents`, `health_daily_logs`, `health_escalations` (FK `counselor_id → auth.users.id`), `health_profiles`, `health_streaks`, `health_fitness_tests`, `health_sports_*` (5), `health_practice_*` (2), `health_peer_support`, `health_tournament_permissions`, `health_training_logs`. Plus `hostel_health_cases`, `institution_health_scores`, `semester_hierarchy_health`, `telephony_health_events`.

**`health_escalations` shape** (relevant — already feeds the live `/health/counselor` dashboard): `id, learner_id, assessment_id, trigger_type, trigger_score, trigger_severity, counselor_id, status, counselor_notes, contacted_at, resolved_at, escalation_level, created_at, updated_at`. So a "session note" already partially exists as a TEXT column on the escalation row. Phase 2 health work must NOT silently shadow this — see decision D-3 below.

### 1.5 Test accounts (`scripts/create-test-accounts.ts`)

| Role | Email | Status |
|---|---|---|
| `counselor` | `test.counselor@jkkn.ac.in` | ✅ scripted (`scripts/create-test-accounts.ts:45`) |
| `health_counselor` | `test.health_coun@jkkn.ac.in` | ✅ scripted (`scripts/create-test-accounts.ts:60`) |
| `learner_counselor` | (none) | ❌ **GAP G-2** |
| `staff_counselor` | (none) | ❌ **GAP G-2** |

### 1.6 Gaps inherited from Phase 1

| Gap | Description | Severity |
|---|---|---|
| G-1 | `health_counselor` role still has only 2 perms; the 10-perm expansion proposed in Phase 1 spec never landed. | High — blocks any Phase 2 health module work |
| G-2 | No test accounts for `learner_counselor` / `staff_counselor`. Cannot run `/auth/test-login` validation. | Medium |
| G-3 | Sidebar entries for `/learners/counseling` and `/hr/counseling` resolve to 404. Users with the role assigned will see broken nav. | Medium — but mitigated by **0 users assigned** today |
| G-4 | Migration file `supabase/migrations/20260427_counselor_taxonomy_phase1.sql` referenced in `permissions.ts:574` and `sidebarMenuLink.ts:205,257` does **not exist on disk** in `jicate/main`. The role/perm seeding was applied via Supabase MCP / Management API directly. | Low — DB is source of truth, but inventory is misleading |

---

## 2. Persona definitions (4 roles, deepened)

This section restates each persona with current code/DB citations and adds the per-persona module-build scope for Phase 2.

### 2.1 Admission Counsellor — `counselor`

| Attribute | Value |
|---|---|
| Counsels | Pre-enrollment leads (prospects) — first marketing touch through application approval / fee-payment confirmation |
| Primary tables | `admission_leads`, `admission_lead_activities`, `admission_applications`, `admission_communication_templates`, `admission_counselors` (own metadata), `counselor_sla_strikes` |
| Routes (live) | `/admission/counselors` + `alerts`, `briefing`, `calls`, `daily-view`, `productivity`, `reminders` |
| Reports to | Admission Officer / Director of Admissions (per institution). Cross-institution oversight from Director of Operations (`director@jkkn.ac.in`). |
| Notification surfaces | Dashboard v2 queue cards (`dashboard.broadcast.claim`), counselor-specific push notifications via `fn_admission_counselor_impact_preview`, daily WhatsApp/voice rollups via Exotel integration |
| RLS scope | `institution_scope='all'` — by design: a single counselor follows a lead expressing interest in 3 colleges. **Exceptional** vs. all 3 other counselor roles which are `own`. |
| Granted perms today | 21 (admission CRM only — leads, applications, marketing chat, expos, dashboard, settings.sources, learners.profiles.view) — see Phase 1 spec §1 for the full list |
| Phase 2 scope | **None.** Phase 2 leaves admission counselor unchanged. (Sibling Agent G handles UI guardrails; Agent I handles identity sync.) |

> The original Phase 1 spec proposed renaming `counselor` → `admission_counselor` for clarity. **Recommendation stands: defer.** Renaming is breaking across `lib/constants/permissions.ts`, every RLS policy that hardcodes `'counselor'`, the 8 existing assigned users' UX, and `profiles.role` legacy column. Phase 3 candidate only.

### 2.2 Learner Counsellor — `learner_counselor` (PHASE 2 BUILD)

| Attribute | Value |
|---|---|
| Counsels | Enrolled students from first-semester onboarding through graduation |
| Primary tables (read) | `learners`, `learners_profiles`, `attendance` (read), `internal_marks` (read), `billing_schedule` (read for fee-default context), `hostel_health_cases` (read) |
| Primary tables (write — **NEW IN PHASE 2**) | `learner_counseling_sessions`, `learner_counseling_notes`, `learner_interventions` |
| Routes (proposed) | `/learners/counseling` (queue), `/learners/counseling/sessions/{new,[id],[id]/edit}`, `/learners/counseling/at-risk` (composite dashboard), `/learners/counseling/interventions` |
| Reports to | **Open Q1** — Academic Dean / HoD / new Director of Student Services? Determines approval chain for high-risk interventions (e.g. counselor-recommended leave) |
| Notification surfaces | Dashboard v2 queue: at-risk learner alerts (low-CGPA ∪ low-attendance ∪ fee-default ∪ hostel-leave spike). Email digest weekly (intervention follow-up). WhatsApp opt-in per learner-and-parent (consent gated). |
| RLS scope | `institution_scope='own'` ✅ already correct on prod |
| Granted perms today | 14: 8 new counseling keys + `learners.profiles.view`, `academic.attendance.view`, `academic.internal-marks.view`, `billing.schedule.view`, `view_dashboard`, `view_profile` ✅ |
| Phase 2 scope | Build the 3 new tables, the 4-page module, the at-risk composite query, the intervention tracker, the audit log, and the test account |

### 2.3 Staff Counsellor — `staff_counselor` (PHASE 2 BUILD)

| Attribute | Value |
|---|---|
| Counsels | Employees and faculty across teaching + non-teaching cadre |
| Primary tables (read) | `hr_employees` (via `hr.employees.view`), `hr_leave_*` (read for absenteeism signal), `grievance_tickets` (existing — see §3.4 for handoff), `staff` |
| Primary tables (write — **NEW IN PHASE 2**) | `staff_counseling_sessions`, `staff_counseling_notes`, `staff_grievance_assignments` (junction: counselor ↔ existing `grievance_tickets`) |
| Routes (proposed) | `/hr/counseling` (queue), `/hr/counseling/sessions/{new,[id],[id]/edit}`, `/hr/counseling/grievances` (assigned only) |
| Reports to | **Open Q3** — HR Head / independent ombudsman / Chief Wellness Officer? Determines whether confidentiality contract permits HR Head read-access. |
| Notification surfaces | Dashboard v2 queue (grievance escalations only), email-only for routine session reminders (no WhatsApp — confidentiality posture) |
| RLS scope | `institution_scope='own'` ✅ already correct on prod |
| Granted perms today | 12: 8 new counseling keys + `hr.grievance.{view,escalate}`, `hr.career_development.view`, `hr.employees.view`, `hr.leave.view`, `view_dashboard`, `view_profile` ✅ |
| Phase 2 scope | Build the 3 new tables, the 3-page module, the grievance-assignment junction, the audit log, and the test account |

> **Existing grievance module:** `grievance_tickets`, `grievance_categories`, `grievance_comments`, `grievance_history` are LIVE on prod (per `permissions.ts:1132-1142`). The Staff Counsellor role does NOT replace this — it adds a counselor-as-first-assignee layer. Decision D-2 below.

### 2.4 Health Counsellor — `health_counselor` (PHASE 2 EXPANSION)

| Attribute | Value |
|---|---|
| Counsels | Anyone with medical or mental-health needs across learners AND staff |
| Primary tables (read today) | `health_escalations` (FK `counselor_id`), `health_assessments`, `health_profiles`, `health_consents`, `hostel_health_cases` |
| Primary tables (write — **NEW IN PHASE 2**) | `health_counseling_sessions`, `health_medical_records`, `health_counseling_access_log` (confidentiality audit) |
| Routes (live) | `/health/counselor` (mental-health triage dashboard, auto-refresh 15s) |
| Routes (proposed Phase 2) | `/health/counselor/sessions`, `/health/counselor/records`, `/health/counselor/referrals`, `/health/counselor/audit-log` |
| Reports to | Chief Medical Officer / Director of Wellness — **independent of HR** (this is the basis of the confidentiality contract, see Q4) |
| Notification surfaces | `health_escalations` triggers (already live), per-counselor real-time queue (already live), super-admin alert ONLY for `legal_hold=true` cases |
| RLS scope | `institution_scope='own'` (currently). **Open Q5** — original spec proposed `'all'` based on "1 user serves all campuses today." Verify: is that an artifact of incomplete rollout, or genuinely cross-campus? |
| Granted perms today | 2: `health.escalations.view`, `health.student_data.view` |
| Phase 2 scope | Land the 10-perm expansion (Phase 1 spec proposed it, never shipped — gap G-1). Add the 4 new pages. Build the confidentiality-tight RLS (D-1 below). Build the access log (mirroring `hr_dashboard_access_log` LIVE pattern). |

---

## 3. Permission set — full matrix

Legend: ✅ granted, 🔒 granted with confidentiality RLS (author + subject only — super_admin does NOT bypass without `legal_hold=true`), — not granted, ◯ proposed Phase 2 add.

### 3.1 Existing keys (already in `lib/constants/permissions.ts`)

| Permission | Admission | Learner | Staff | Health |
|---|---|---|---|---|
| `admission.leads.view` | ✅ | — | — | — |
| `admission.leads.edit` | ✅ | — | — | — |
| `admission.leads.assign` | ✅ | — | — | — |
| `admission.leads.bulk_status_update` | ✅ | — | — | — |
| `admission.applications.view/create/edit` | ✅ | — | — | — |
| `admission.marketing.{view,chat.{view,manage},expos.{view,create}}` | ✅ | — | — | — |
| `admission.counselors.{view, performance.view}` | ✅ | — | — | — |
| `admission.dashboard.view` | ✅ | — | — | — |
| `learners.profiles.view` | ✅ read | ✅ read | — | ✅ read |
| `learners.counseling.view` | — | ✅ | — | — |
| `learners.counseling.sessions.view` | — | ✅ | — | ◯ Phase 2 |
| `learners.counseling.sessions.create` | — | ✅ | — | ◯ Phase 2 |
| `learners.counseling.notes.create` | — | ✅ | — | ◯ Phase 2 (🔒) |
| `learners.counseling.notes.view_own` | — | ✅ 🔒 | — | ◯ Phase 2 (🔒) |
| `learners.at_risk.view` | — | ✅ | — | ✅ read |
| `learners.interventions.create` | — | ✅ | — | — |
| `learners.interventions.close` | — | ✅ | — | — |
| `academic.attendance.view` | — | ✅ read | — | ◯ Phase 2 read |
| `academic.internal-marks.view` | — | ✅ read | — | — |
| `billing.schedule.view` | — | ✅ read | — | — |
| `hr.counseling.view` | — | — | ✅ | — |
| `hr.counseling.sessions.view` | — | — | ✅ | — |
| `hr.counseling.sessions.create` | — | — | ✅ | — |
| `hr.counseling.notes.create` | — | — | ✅ 🔒 | — |
| `hr.counseling.notes.view_own` | — | — | ✅ 🔒 | — |
| `hr.grievance.view` | — | — | ✅ | — |
| `hr.grievance.escalate` | — | — | ✅ | — |
| `hr.career_development.view` | — | — | ✅ | — |
| `hr.employees.view` | — | — | ✅ read | ◯ Phase 2 read |
| `hr.leave.view` | — | — | ✅ read | ◯ Phase 2 read |
| `health.escalations.view` | — | — | — | ✅ |
| `health.student_data.view` | — | — | — | ✅ read |
| `view_dashboard`, `view_profile` | ✅ | ✅ | ✅ | ✅ |

### 3.2 New keys to add in Phase 2 (`health.*` block — currently no category exists)

| Permission key | Label | Rationale |
|---|---|---|
| `health.staff_data.view` | View Staff Health Data | Parity with `health.student_data.view` for staff-side counseling |
| `health.counseling.sessions.view_own` | View Own Health Counseling Sessions | Subject-side view of own sessions (learner / staff) |
| `health.counseling.sessions.view` | View Health Counseling Sessions | Counselor-side queue |
| `health.counseling.sessions.create` | Schedule Health Counseling Session | Counselor-side write |
| `health.counseling.notes.create` | Write Health Counseling Notes | Counselor-side write (🔒) |
| `health.counseling.notes.view_own` | View Own Health Counseling Notes | Author-only read (🔒) |
| `health.medical_records.view` | View Medical Records | Counselor + Subject only (🔒) |
| `health.medical_records.create` | Create Medical Records | Counselor only (🔒) |
| `health.referral.create` | Create External Referral | Counselor only |
| `health.legal_hold.override` | Override Confidentiality (Legal Hold) | Reserved for super_admin only; gates `legal_hold=true` writes; logged in audit |

These 10 keys must be added under a new `name: 'Health Counselor'` block in `PERMISSION_CATEGORIES` (insertion point: before "Resource Management", line ~589 in `lib/constants/permissions.ts`).

### 3.3 New keys for `learners.*` (Phase 2 — composite dashboard widgets)

Already covered by Phase 1 keys. No new additions needed.

### 3.4 New keys for `hr.*` (Phase 2)

Already covered by Phase 1 keys. The `hr.grievance.*` keys exist; junction table `staff_grievance_assignments` reuses them.

---

## 4. Database schema — Phase 2 DDL

### 4.1 Naming convention

Tables follow the project standard: `snake_case`, plural noun, `id` (uuid PK), `created_at`, `updated_at`, FK `institution_id` for multi-tenant filtering.

### 4.2 Schema

```sql
-- ─────────────────────────────────────────────────────────────────────────
-- LEARNER COUNSELING
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE public.learner_counseling_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id        uuid NOT NULL REFERENCES public.learners(id) ON DELETE CASCADE,
  counselor_id      uuid NOT NULL REFERENCES auth.users(id),
  institution_id    uuid NOT NULL REFERENCES public.institutions(id),
  session_type      text NOT NULL CHECK (session_type IN (
                      'academic_guidance','dropout_intervention','career','wellness','parent_meeting','other'
                    )),
  scheduled_at      timestamptz NOT NULL,
  duration_minutes  integer,
  modality          text NOT NULL CHECK (modality IN ('in_person','phone','video','home_visit')),
  status            text NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  trigger_source    text,    -- e.g. 'low_cgpa','attendance_warning','fee_default','hostel_leave_spike','self_request'
  trigger_metadata  jsonb DEFAULT '{}',
  outcome_summary   text,    -- short summary, NOT confidential — for queue/dashboard display
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.learner_counseling_sessions (counselor_id, scheduled_at DESC);
CREATE INDEX ON public.learner_counseling_sessions (learner_id, scheduled_at DESC);
CREATE INDEX ON public.learner_counseling_sessions (institution_id, status);

CREATE TABLE public.learner_counseling_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.learner_counseling_sessions(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES auth.users(id),
  content         text NOT NULL,                  -- detailed notes — RLS-restricted
  is_confidential boolean NOT NULL DEFAULT false, -- if true, only author + super_admin-with-legal-hold may read
  attachments     jsonb DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.learner_counseling_notes (session_id);

CREATE TABLE public.learner_interventions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id          uuid NOT NULL REFERENCES public.learners(id) ON DELETE CASCADE,
  counselor_id        uuid NOT NULL REFERENCES auth.users(id),
  institution_id      uuid NOT NULL REFERENCES public.institutions(id),
  intervention_type   text NOT NULL CHECK (intervention_type IN (
                        'academic_warning','attendance_callout','parent_meeting',
                        'fee_extension','mentor_assignment','health_referral','other'
                      )),
  triggered_by        text,    -- which dashboard / signal triggered the intervention
  description         text,
  recommended_action  text,
  status              text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','in_progress','closed_resolved','closed_unresolved','escalated')),
  outcome             text,
  closed_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.learner_interventions (learner_id, status);
CREATE INDEX ON public.learner_interventions (counselor_id, status);

-- ─────────────────────────────────────────────────────────────────────────
-- STAFF COUNSELING
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE public.staff_counseling_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES auth.users(id),  -- counselled employee
  counselor_id      uuid NOT NULL REFERENCES auth.users(id),
  institution_id    uuid NOT NULL REFERENCES public.institutions(id),
  session_type      text NOT NULL CHECK (session_type IN (
                      'wellness','grievance_pre_formal','conflict_resolution','career_development','other'
                    )),
  initiator         text NOT NULL CHECK (initiator IN ('self','manager_referred','counselor_outreach')),
  scheduled_at      timestamptz NOT NULL,
  duration_minutes  integer,
  modality          text NOT NULL CHECK (modality IN ('in_person','phone','video')),
  status            text NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled','completed','cancelled','no_show','escalated_to_hr')),
  outcome_summary   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.staff_counseling_sessions (counselor_id, scheduled_at DESC);
CREATE INDEX ON public.staff_counseling_sessions (employee_id, scheduled_at DESC);

CREATE TABLE public.staff_counseling_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.staff_counseling_sessions(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES auth.users(id),
  content         text NOT NULL,
  is_confidential boolean NOT NULL DEFAULT true,  -- DEFAULT TRUE — staff counseling is confidential by default
  attachments     jsonb DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.staff_grievance_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid NOT NULL REFERENCES public.grievance_tickets(id) ON DELETE CASCADE,
  counselor_id    uuid NOT NULL REFERENCES auth.users(id),
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  unassigned_at   timestamptz,
  reason          text,
  UNIQUE (ticket_id, counselor_id, assigned_at)
);

-- ─────────────────────────────────────────────────────────────────────────
-- HEALTH COUNSELING (extends existing health_escalations)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE public.health_counseling_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id          uuid NOT NULL REFERENCES auth.users(id),  -- learner OR staff
  subject_kind        text NOT NULL CHECK (subject_kind IN ('learner','staff')),
  counselor_id        uuid NOT NULL REFERENCES auth.users(id),
  institution_id      uuid NOT NULL REFERENCES public.institutions(id),
  escalation_id       uuid REFERENCES public.health_escalations(id),  -- optional link to triage row
  session_type        text NOT NULL CHECK (session_type IN ('mental_health','medical','wellness_followup','referral_handoff','other')),
  scheduled_at        timestamptz NOT NULL,
  duration_minutes    integer,
  modality            text NOT NULL CHECK (modality IN ('in_person','phone','video')),
  status              text NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','completed','cancelled','no_show','escalated_external')),
  outcome_summary     text,                 -- BRIEF non-confidential summary for dashboard
  legal_hold          boolean NOT NULL DEFAULT false,  -- if true, super_admin can read with audit-log entry
  legal_hold_reason   text,
  legal_hold_set_by   uuid REFERENCES auth.users(id),
  legal_hold_set_at   timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.health_medical_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id      uuid NOT NULL REFERENCES auth.users(id),
  subject_kind    text NOT NULL CHECK (subject_kind IN ('learner','staff')),
  counselor_id    uuid NOT NULL REFERENCES auth.users(id),
  institution_id  uuid NOT NULL REFERENCES public.institutions(id),
  record_type     text NOT NULL CHECK (record_type IN ('diagnosis','prescription','referral','test_result','vaccination','other')),
  content         text NOT NULL,
  attachments     jsonb DEFAULT '[]',
  is_confidential boolean NOT NULL DEFAULT true,
  legal_hold      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.health_counseling_access_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid NOT NULL REFERENCES auth.users(id),
  actor_role    text,                   -- snapshot of role at access time
  resource_type text NOT NULL CHECK (resource_type IN ('session','medical_record','referral','note')),
  resource_id   uuid NOT NULL,
  subject_id    uuid NOT NULL,
  action        text NOT NULL CHECK (action IN ('SELECT','INSERT','UPDATE','DELETE')),
  legal_hold    boolean NOT NULL DEFAULT false,
  reason        text,
  ip_address    inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.health_counseling_access_log (subject_id, created_at DESC);
CREATE INDEX ON public.health_counseling_access_log (actor_id, created_at DESC);
```

### 4.3 RLS policies (pattern)

Standard MyJKKN pattern (super_admin + admin bypass + permission + scope) **DOES NOT APPLY** to health tables. See Decision D-1.

For `learner_counseling_sessions` (standard pattern):

```sql
ALTER TABLE public.learner_counseling_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lcs_select_permission" ON public.learner_counseling_sessions
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('learners.counseling.sessions.view')
        AND role_has_institution_access(institution_id))
    OR (auth.uid() = (SELECT user_id FROM public.learners WHERE id = learner_id))  -- subject self-read
  );

CREATE POLICY "lcs_insert_permission" ON public.learner_counseling_sessions
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('learners.counseling.sessions.create')
        AND role_has_institution_access(institution_id)
        AND counselor_id = auth.uid())  -- only own sessions
  );

CREATE POLICY "lcs_update_permission" ON public.learner_counseling_sessions
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('learners.counseling.sessions.create')  -- write keys reused
        AND counselor_id = auth.uid())
  );
```

For `learner_counseling_notes` (author-confidentiality pattern):

```sql
CREATE POLICY "lcn_select_author_or_session_owner" ON public.learner_counseling_notes
  FOR SELECT USING (
    auth.uid() = author_id
    OR (NOT is_confidential AND user_has_permission('learners.counseling.notes.view_own')
        AND EXISTS (SELECT 1 FROM public.learner_counseling_sessions s
                    WHERE s.id = session_id AND role_has_institution_access(s.institution_id)))
    OR is_super_admin()  -- super_admin bypass remains for non-health tables
  );
```

For `health_counseling_sessions` (Decision D-1 — no super_admin default bypass):

```sql
CREATE POLICY "hcs_select_subject_or_counselor_or_legalhold" ON public.health_counseling_sessions
  FOR SELECT USING (
    auth.uid() = subject_id
    OR auth.uid() = counselor_id
    OR (legal_hold = true AND user_has_permission('health.legal_hold.override'))
  );
-- Note: no is_super_admin() bypass. legal_hold flips the gate explicitly,
-- and any read while legal_hold=true triggers an INSERT into
-- health_counseling_access_log via AFTER SELECT trigger (or service-layer hook).
```

### 4.4 Audit-log trigger (mirrors `hr_dashboard_access_log` LIVE pattern)

```sql
-- Trigger function logs writes (PG can't trigger AFTER SELECT — for SELECTs,
-- we instrument at the service layer in lib/services/health-counseling/*.ts).
CREATE OR REPLACE FUNCTION fn_log_health_counseling_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.health_counseling_access_log
    (actor_id, actor_role, resource_type, resource_id, subject_id, action, legal_hold, reason)
  VALUES
    (auth.uid(), get_current_user_role(), TG_ARGV[0], NEW.id,
     CASE WHEN TG_ARGV[0]='session' THEN NEW.subject_id ELSE NEW.subject_id END,
     TG_OP, COALESCE(NEW.legal_hold, false),
     CASE WHEN NEW.legal_hold THEN NEW.legal_hold_reason ELSE NULL END);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_hcs AFTER INSERT OR UPDATE OR DELETE ON public.health_counseling_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_log_health_counseling_write('session');
CREATE TRIGGER trg_log_hmr AFTER INSERT OR UPDATE OR DELETE ON public.health_medical_records
  FOR EACH ROW EXECUTE FUNCTION fn_log_health_counseling_write('medical_record');
```

---

## 5. UI / Routes plan

### 5.1 New routes

| Route | Permission gate | Page purpose |
|---|---|---|
| `/learners/counseling` | `learners.counseling.view` | Queue: today's sessions + at-risk learners + open interventions (3-column dashboard) |
| `/learners/counseling/sessions` | `learners.counseling.sessions.view` | Full session calendar / list view |
| `/learners/counseling/sessions/new` | `learners.counseling.sessions.create` | Schedule new session form |
| `/learners/counseling/sessions/[id]` | `learners.counseling.sessions.view` | Session detail + notes + outcome |
| `/learners/counseling/sessions/[id]/edit` | `learners.counseling.sessions.create` | Edit session metadata + log outcome |
| `/learners/counseling/at-risk` | `learners.at_risk.view` | Composite at-risk dashboard (CGPA ∪ attendance ∪ fee ∪ hostel-leave signals) |
| `/learners/counseling/interventions` | `learners.interventions.create` | Intervention tracker |
| `/learners/counseling/interventions/new` | `learners.interventions.create` | Log new intervention form |
| `/learners/counseling/interventions/[id]` | `learners.at_risk.view` | Intervention detail + close-out |
| `/hr/counseling` | `hr.counseling.view` | Staff counseling queue + grievance assignments |
| `/hr/counseling/sessions` | `hr.counseling.sessions.view` | Staff session list |
| `/hr/counseling/sessions/new` | `hr.counseling.sessions.create` | Schedule staff session |
| `/hr/counseling/sessions/[id]` | `hr.counseling.sessions.view` | Staff session detail (confidential) |
| `/hr/counseling/grievances` | `hr.grievance.view` | Grievances assigned to me (counselor) |
| `/health/counselor/sessions` | `health.counseling.sessions.view` | Health session list |
| `/health/counselor/sessions/[id]` | `health.counseling.sessions.view` | Detail (confidential, audit-logged) |
| `/health/counselor/records` | `health.medical_records.view` | Medical records list |
| `/health/counselor/records/new` | `health.medical_records.create` | Add medical record form |
| `/health/counselor/audit-log` | `audit.view` AND `health.legal_hold.override` | Confidentiality audit log (super_admin / health_supervisor only) |

### 5.2 Sidebar entries to add

Update `lib/sidebarMenuLink.ts` MENU_PERMISSIONS to add the routes above (Phase 1 already added the 2 root entries; Phase 2 adds the sub-routes). All keys already exist except `health.*` — those land with the `permissions.ts` expansion described in §3.2.

### 5.3 Existing `/admission/counselors/*` and `/health/counselor` are unchanged

Phase 2 does NOT rename or relocate the admission counselor pages. Phase 2 does NOT touch the existing `/health/counselor` triage dashboard — it adds 4 sibling sub-routes.

---

## 6. Migration plan

### 6.1 Phase 2 PR sequence (non-breaking, additive)

| PR | Title | Files changed | Risk |
|---|---|---|---|
| **PR-2A** | `feat(spec/counselor-taxonomy): document Phase 2 plan` | `specs/counselor-taxonomy/2026-04-27-counselor-roles-spec.md` (this file) | None — markdown only |
| **PR-2B** | `chore(perms): seed health counselor expansion (G-1) + health.* category` | `lib/constants/permissions.ts` (+10 keys, +1 category), `supabase/migrations/<ts>_health_counselor_perm_expansion.sql` (UPDATE custom_roles for `health_counselor`) | Low — additive perms only |
| **PR-2C** | `chore(scripts): add learner_counselor + staff_counselor test accounts (G-2)` | `scripts/create-test-accounts.ts` (+2 entries) | Low — script-only |
| **PR-2D** | `feat(db): create learner_counseling_sessions/notes/interventions tables` | `supabase/setup/01_tables.sql`, `supabase/setup/03_policies.sql`, `supabase/migrations/<ts>_learner_counseling_phase2.sql` | Medium — new tables, new RLS |
| **PR-2E** | `feat(db): create staff_counseling_sessions/notes + staff_grievance_assignments` | same 3 files | Medium |
| **PR-2F** | `feat(db): create health_counseling_sessions/medical_records/access_log` | same 3 files + audit triggers | High — confidentiality RLS, no super_admin bypass (D-1) |
| **PR-2G** | `feat(learners/counseling): module pages + sidebar (4 routes)` | `app/(routes)/learners/counseling/**`, `lib/sidebarMenuLink.ts` | Medium |
| **PR-2H** | `feat(hr/counseling): module pages + sidebar (3 routes)` | `app/(routes)/hr/counseling/**`, `lib/sidebarMenuLink.ts` | Medium |
| **PR-2I** | `feat(health/counselor): expand to sessions/records/audit (4 sub-routes)` | `app/(routes)/health/counselor/{sessions,records,audit-log}/**` | High — confidentiality contract live |
| **PR-2J** | `feat(dashboard): wire counselor-specific cards to dashboard v2 queue` | `lib/services/dashboard/work-items.ts`, `app/(routes)/dashboard/**` | Medium |

### 6.2 Backfill plan

Zero users are assigned `learner_counselor` or `staff_counselor` today. No backfill needed for those.

The existing 1 `health_counselor` user will gain access to the new pages via permission expansion in PR-2B. If Q4 confirms super_admin bypass is forbidden, the existing `legal_hold` column defaults to `false` so no records become silently exposed.

If an existing user (e.g. a class teacher informally counseling) should be retroactively classified as `learner_counselor`, that's a per-user `user_roles` insert — not a Phase 2 migration. Documented as a runbook in PR-2G.

### 6.3 Rollback plan

| PR | Rollback |
|---|---|
| PR-2B | DELETE the 10 new keys from `health_counselor.permissions` JSON; remove the `Health Counselor` category block from `permissions.ts` |
| PR-2C | Remove the 2 test-account entries from `scripts/create-test-accounts.ts` |
| PR-2D-F | DROP TABLE the new tables (CASCADE), DROP POLICY, DROP TRIGGER, DROP FUNCTION |
| PR-2G-J | Revert UI commits + `MENU_PERMISSIONS` entries |

All DDL is in **separate migration files**, additive, with no destructive changes to existing tables. Rollback is reverse-order revert + `DROP TABLE IF EXISTS`.

---

## 7. Architectural decisions (D-series)

### D-1. Health counseling tables do NOT have super_admin RLS bypass

**Standard MyJKKN pattern:** every RLS policy starts with `is_super_admin() OR is_admin() OR ...`. This is the documented `CLAUDE.md` rule.

**Phase 2 deviation for `health_*_counseling*` and `health_medical_records`:** the super_admin bypass is REPLACED with an explicit `legal_hold = true AND user_has_permission('health.legal_hold.override')` check. This is the basis of the confidentiality contract (Q4) and a non-negotiable for any psychiatric / medical record system. **Requires explicit Omm sign-off** before PR-2F.

### D-2. `staff_grievance_assignments` is a junction, not a replacement

Existing `grievance_tickets` table (LIVE on prod via PR-A6a) handles formal grievances. Staff Counsellor adds a `staff_grievance_assignments` junction row when picking up a grievance — does NOT modify or shadow the ticket itself. `hr.grievance.escalate` flips the ticket's `assigned_to` to formal HR head and inserts a closing assignment row.

### D-3. `health_escalations.counselor_notes` (LIVE today) is preserved

The existing column on `health_escalations` is kept as a short text summary (denormalized, dashboard-friendly). Phase 2's `health_counseling_sessions` is a separate, normalized session record optionally FK-linked via `escalation_id`. Backwards-compatible.

### D-4. No polymorphic `counselors` table

The original 2026-04-24 spec considered a `counselors` umbrella with a `kind` discriminator. **Decision: do not build it.** The 4 personas have entirely different table-anchors, RLS rules, and routes. Polymorphic gives no concrete win and complicates RLS. Keep `admission_counselors` as a domain-specific metadata table; add 3 new domain-specific session tables.

### D-5. `is_confidential` flag on notes (default differs by persona)

| Notes table | Default `is_confidential` | Reasoning |
|---|---|---|
| `learner_counseling_notes` | `false` | Most learner counseling is not legally confidential; counselor can flip per session |
| `staff_counseling_notes` | `true` | Workplace counseling is presumptively confidential by Indian labor norms |
| (health uses `legal_hold` instead) | n/a | Always confidential by D-1 |

---

## 8. Open questions for Omm (block PR-2D and beyond)

| # | Question | Why it blocks DDL |
|---|---|---|
| **Q1** | **Does Learner Counsellor report to Academic Dean / HoD / a new Director of Student Services?** | Determines `learner_interventions.escalated_to_user_id` resolution and approval-chain wiring. Affects Dashboard v2 queue routing (whose dashboard does an unresolved intervention land on?). |
| **Q2** | **Are learner counseling sessions logged per-learner (1:1) or per-cohort (weekly class-wide)?** Or both? | If "both," need a `cohort_id` nullable column on `learner_counseling_sessions` and a `cohort_session_attendees` junction. Materially expands DDL. |
| **Q3** | **Does Staff Counsellor report to HR Head, an independent ombudsman, or Chief Wellness Officer?** | Determines whether HR Head gets RLS read on `staff_counseling_*`. Currently spec assumes "no" (independent), preserving confidentiality. |
| **Q4** | **Confidentiality contract: super_admin DOES NOT bypass `health_*_counseling*` RLS by default. Confirm?** | Decision D-1 above. Non-negotiable for psychiatric records under Indian Mental Healthcare Act 2017 §23. **Direct legal exposure if wrong.** |
| **Q5** | **Health Counsellor scope: is the current `'own'` correct, or should it be `'all'`?** | The original spec says cross-campus; current DB is `'own'`. The 1 user serves all 8 colleges today. Wrong scope = either visibility leak or role-as-blocker. |
| **Q6** | **Is there a UGC / NAAC / NBA / PCI mandated counselor-to-learner ratio that should appear as a dashboard widget?** | If yes, drives a `/learners/counseling/ratios` dashboard widget in PR-2J. PCI specifically has counseling requirements for pharmacy programs. |
| **Q7** | **Should `learner_counseling_sessions` integrate with `hostel_health_cases` (live LIVE on prod) for residence-side wellness signals, or stay independent?** | If integrate, `learner_interventions.trigger_source = 'hostel_health_case'` becomes valid + `learner_interventions` gets `hostel_case_id` FK column. |

---

## 9. Implementation phases (forward-looking)

| Phase | Window | Deliverable | Blocking on |
|---|---|---|---|
| **Phase 1** | DONE 2026-04-27 | 4 roles seeded, 16 perms in `permissions.ts`, sidebar gates | — |
| **Phase 2** | 6-8 weeks | 3 new modules (learners/counseling, hr/counseling, health/counselor sub-routes), 9 new tables, audit log, test accounts, dashboard v2 wiring | Q1-Q7 answered |
| **Phase 3** | Optional 1 sprint | OPTIONAL: rename `counselor` → `admission_counselor`. Full string-sweep audit. | Phase 2 stable |
| **Phase 4** | 1 sprint | Accreditation reporting widgets (counselor-to-learner ratio, NAAC criterion 5 export, anonymized wellness trend for criterion 7) | Q6 answered |

---

## 10. Non-goals

- **NOT** changing the `counselor` (admission) role's perm set in Phase 2 (Agent G handles UI guardrails separately)
- **NOT** building a generic `counselors` polymorphic table (decision D-4)
- **NOT** deprecating `health_escalations.counselor_notes` (decision D-3)
- **NOT** merging Admission + Learner counselor into a "Student Counsellor" persona — they have different KPIs, reporting lines, and table anchors
- **NOT** allowing super_admin RLS bypass on `health_*_counseling*` and `health_medical_records` (decision D-1, requires Omm sign-off)
- **NOT** replacing `grievance_tickets` (decision D-2 — junction-only)

---

## 11. References

- Phase 1 spec (predecessor): `specs/counselor-taxonomy-spec.md`
- Permission catalog (LIVE): `lib/constants/permissions.ts:320-337` (Learner Counseling), `:571-588` (Staff Counseling), `:853-938` (Admission)
- Sidebar wiring (LIVE): `lib/sidebarMenuLink.ts:206` (`/learners/counseling`), `:258` (`/hr/counseling`), `:477-482` (admission)
- Existing health module: `app/(routes)/health/counselor/page.tsx`, `health_escalations` table schema verified live
- Existing admission module: `app/(routes)/admission/counselors/{alerts,briefing,calls,daily-view,productivity,reminders}/page.tsx`
- Audit log pattern (LIVE on prod): `hr_dashboard_access_log` (HR Sprint 6)
- Compliance backbone: `specs/one-jkkn-one-data/MASTER-PLAN.md` — counseling sessions feed NAAC criterion 5 (Student Support & Progression) and criterion 7 (Institutional Values & Best Practices)
- Director's original prompt (2026-04-24 end-of-session): "Do we have a category called Learner Counselors? we also have staff counsellors? we need differentiation."

---

## Appendix A — DB verification queries (re-runnable)

```sql
-- 1. Confirm 4 counselor roles exist
SELECT role_key, role_name, institution_scope, is_system_role,
       jsonb_object_keys(permissions) AS pk
FROM custom_roles
WHERE role_key IN ('counselor','learner_counselor','staff_counselor','health_counselor')
ORDER BY role_key, pk;

-- 2. User counts per role
SELECT cr.role_key, COUNT(ur.user_id) AS user_count
FROM custom_roles cr LEFT JOIN user_roles ur ON ur.role_id = cr.id
WHERE cr.role_key IN ('counselor','learner_counselor','staff_counselor','health_counselor')
GROUP BY cr.role_key;

-- 3. Confirm Phase 2 tables NOT yet present
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE '%counseling%';
-- Expected: 0 rows pre-Phase-2

-- 4. Existing health_* surface
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'health_%'
ORDER BY table_name;
```

## Appendix B — Files changed by this PR

This PR (Agent H, spec-only) changes **exactly one** file:

- `specs/counselor-taxonomy/2026-04-27-counselor-roles-spec.md` (this file, NEW)

No code files. No SQL files. No migrations. Phase 2 PRs land separately after Q1-Q7 are answered.
