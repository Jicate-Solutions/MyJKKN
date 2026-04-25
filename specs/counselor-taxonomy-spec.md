# Counselor Taxonomy Spec — 4 Personas for JKKN

Status: DRAFT — awaiting Omm's domain review
Author: Claude (per Omm's 2026-04-24 end-of-session directive)
Domain owner: Omm Sharma, MD + CAIO
Last updated: 2026-04-24

---

## Problem statement

JKKN operationally runs four distinct counselor functions — admission prospects, enrolled learners, staff/employees, and health/mental wellness — but the production permission system models only two roles (`counselor` and `health_counselor`), and one of those two (`health_counselor`) is undocumented. The single `counselor` role is permission-scoped exclusively to the admission CRM (`admission.leads.*`, `admission.applications.*`, `admission.marketing.*`) and has zero perms for enrolled-learner well-being, staff grievance support, or academic mentorship. This "one-role-for-everything" gap blocks the learner lifecycle: the moment an admission prospect becomes an enrolled learner, there is no defined counselor persona to hand them off to. It also silently blocks accreditation workstreams (NAAC/NBA counselor-to-learner ratios), workplace wellness reporting (HR grievance SLAs), and the confidentiality contract that health counseling requires but a generic admin-scoped role cannot enforce.

---

## Current state (DB-verified 2026-04-24)

Verified via Supabase MCP against prod (`kvizhngldtiuufknvehv`) on 2026-04-24.

| role_key | role_name | users | description | perm_count (granted) | perm_count (total) | scope | is_system_role |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `counselor` | Admission Counsellor | 8 | "Admission counsellor responsible for lead follow-up, communication, and conversion tracking within the Admission CRM module" | ~20 TRUE | 393 keys in object | `all` | `true` |
| `health_counselor` | Health Counselor | 1 | **NULL (undocumented)** | 2 TRUE | 2 | `own` | `false` |

**What does NOT exist on prod:** `learner_counselor`, `staff_counselor`, `academic_counselor`, `student_counselor` — zero rows in `custom_roles` for any of these keys.

**What the `counselor` role's 20 granted perms actually cover (verified list):**
- `admission.leads.view`, `admission.leads.edit`, `admission.leads.create`, `admission.leads.assign`, `admission.leads.export`, `admission.leads.bulk_status_update`
- `admission.applications.view`, `admission.applications.edit`, `admission.applications.create`
- `admission.counselors.view`, `admission.counselors.performance.view`, `admission.consultants.view`, `admission.consultants.referrals.view`
- `admission.marketing.view`, `admission.marketing.chat.view`, `admission.marketing.chat.manage`, `admission.marketing.expos.view`, `admission.marketing.expos.create`
- `admission.dashboard.view`, `admission.settings.sources.view`, `admission.settings.sources.manage`
- `admissions.view`, `admissions.create`, `admissions.edit`, `admissions.crm_view`, `admissions.dashboard`, `application_hub.view`
- `learners.profiles.view`, `learners.admissions.view`, `learners.admissions.edit`, `learners.admissions.crm.view`, `learners.admissions.dashboard`
- `view_dashboard`, `view_profile`

Not a single perm for enrolled-learner well-being, attendance intervention, staff HR counseling, or confidential health notes.

**What the `health_counselor` role's 2 granted perms cover:**
- `health.escalations.view`
- `health.student_data.view`

(Plus `health_counselor` has `scope='own'` and is NOT a system role — contrast with `counselor` which IS a system role with `scope='all'`.)

---

## Proposed taxonomy (4 personas)

### 1. Admission Counselor (EXISTING — rename-safe candidate)

- **role_key:** `counselor` (keep) OR rename to `admission_counselor` for clarity (breaking — see impact audit below)
- **role_name:** "Admission Counsellor"
- **Counsels:** pre-enrollment leads (prospects) from first expo-booth capture through application approval
- **Key modules:** Admission CRM, lead assignment, daily briefing, reminders, expo/marketing chatter, WhatsApp + voice integration
- **Unique perms (already granted today):** `admission.leads.assign`, `admission.leads.bulk_status_update`, `admission.leads.export`, `admission.applications.create`, `admission.marketing.expos.create`, `admission.marketing.chat.manage`
- **RLS scope:** `institution_scope='all'` (cross-campus by design — a single counselor follows up a lead who expressed interest in 3 colleges)
- **Entry points:** `/admission/counselors/*`, `/admission/leads/*`, `/admission/marketing/*`
- **Table anchors today:** `admission_counselors` (9 cols, FK to `auth.users.id`), `admission_leads`, `admission_lead_activities`, `admission_communication_templates`
- **Rename impact to audit before change:**
  - `admission_counselors` table name (stable — naming matches)
  - All `/admission/counselors/*` routes (stable — naming matches)
  - Hard-coded string `'counselor'` in `lib/constants/permissions.ts`, RLS policies, sidebar menu, test-login accounts
  - `profiles.role` legacy column synced by trigger from `user_roles` — may hold literal `'counselor'`
  - 8 existing users' UX (their role badge in UI would change — low-risk)
  - **Recommendation:** rename is deferred to Phase 3. Keep `counselor` as-is for Phase 1/2 to prevent cross-PR breakage.

### 2. Learner Counselor (NEW)

- **role_key:** `learner_counselor`
- **role_name:** "Learner Counsellor"
- **Counsels:** enrolled students (current learners) from first-semester onboarding through graduation
- **Typical duties:**
  - Academic guidance (low-CGPA interventions, subject retake plans, elective selection)
  - Dropout prevention (attendance warnings, fee-default learners, hostel-leave patterns)
  - Career counseling (placement readiness, higher-study guidance, industry mentor matching)
  - Well-being checks (weekly/fortnightly scheduled sessions for flagged cohorts)
  - Mentor assignment + handoff to `health_counselor` on medical/psychological escalation
- **Proposed unique perms (new permission keys):**
  - `learners.counseling.view` — see the counseling queue for own institution
  - `learners.counseling.sessions.view` — see session calendar + history
  - `learners.counseling.sessions.create` — schedule and log 1:1 sessions
  - `learners.counseling.notes.create` — write session notes (non-confidential)
  - `learners.counseling.notes.view_own` — read notes the counselor authored
  - `learners.at_risk.view` — access the "at-risk learners" dashboard (composite: low-CGPA ∪ low-attendance ∪ fee-default ∪ hostel-leave spike)
  - `learners.interventions.create` — log an intervention (call, home visit, parent meeting)
  - `learners.interventions.close` — mark intervention outcome
- **Read-only access to (reuse existing perms):**
  - `learners.profiles.view`
  - `academic.attendance.view`
  - `academic.internal-marks.view`
  - `hostel.complaints.view` (assuming campus-living hostel_* tables ship — see **open question #8**)
  - `billing.schedule.view` (fee-default context)
- **RLS scope:** `institution_scope='own'` (college-scoped by default; super_admin can grant `user_institution_access` for cross-campus if a counselor is shared)
- **Entry points:** `/learners/counseling/*` (new module — queue, session-log, at-risk dashboard, intervention tracker)
- **Table anchors needed (Phase 2):**
  - `learner_counseling_sessions` (session calendar + outcome metadata)
  - `learner_counseling_notes` (session content — NOT confidential; org can read per perms)
  - `learner_interventions` (tracked at-risk actions)
- **Open questions for Omm:**
  1. Does a Learner Counselor belong to the academic hierarchy (HoD) or student-services hierarchy (new Director of Student Services)? Affects approval chains.
  2. Are learner counseling sessions logged per-learner or per-cohort (weekly class-wide)? Schema changes based on answer.
  3. Should Learner Counselor have **write access** to `learners.leaves_onduty` to approve counseling-recommended leave?

### 3. Staff Counselor (NEW)

- **role_key:** `staff_counselor`
- **role_name:** "Staff Counsellor"
- **Counsels:** employees/faculty across teaching + non-teaching cadre
- **Typical duties:**
  - Workplace wellness (stress, workload, burnout check-ins)
  - Grievance support (confidential first-level ear before formal grievance)
  - Conflict resolution (inter-departmental, manager↔report)
  - Career development sessions (promotion path, certification guidance)
  - Handoff to HR formal grievance process if needed (`hr.grievance.*`)
- **Proposed unique perms (new permission keys):**
  - `hr.counseling.view` — see staff counseling queue for own institution
  - `hr.counseling.sessions.view`
  - `hr.counseling.sessions.create`
  - `hr.counseling.notes.create`
  - `hr.counseling.notes.view_own`
  - `hr.grievance.view` — read open staff grievances assigned to counselor
  - `hr.grievance.escalate` — escalate to formal HR
  - `hr.career_development.view`
- **Read-only access to (reuse existing perms where they exist; propose where not):**
  - `hr.employees.view` (staff roster)
  - `hr.leaves.view` (leave patterns as wellness signal)
  - `hr.attendance.view` (absenteeism as wellness signal)
- **RLS scope:** `institution_scope='own'`
- **Entry points:** `/hr/counseling/*` (new module under HR module)
- **Table anchors needed (Phase 2):**
  - `staff_counseling_sessions`
  - `staff_counseling_notes`
  - `staff_grievance_assignments` (links existing `hr_grievance_*` rows to a counselor)
- **Open questions for Omm:**
  1. Is this a full-time dedicated role per college (8 counselors) or one shared role across the institution group (1 counselor)?
  2. Who can book a Staff Counselor session — the employee self-books, or manager-initiated?
  3. Does Staff Counselor report to HR Head or an independent ombudsman?

### 4. Health Counselor (EXISTING — needs description + perm audit)

- **role_key:** `health_counselor` (keep)
- **role_name:** "Health Counselor"
- **Counsels:** anyone with medical or mental-health needs across learners AND staff
- **Proposed description to add (sentence-level):** "Clinical/wellness counsellor for both learners and staff; handles medical escalations, mental-health sessions, and confidential health records. Session content is not accessible to super_admin unless a legal_hold flag is set."
- **Proposed perm audit (expand from current 2 to a full set):**

| Permission key | Current state | Proposed |
| --- | --- | --- |
| `health.escalations.view` | ✅ granted | keep |
| `health.student_data.view` | ✅ granted | keep |
| `health.counseling.sessions.create` | missing | ADD |
| `health.counseling.sessions.view_own` | missing | ADD |
| `health.counseling.notes.create` | missing | ADD |
| `health.counseling.notes.view_own` | missing | ADD (RLS: only author can read content) |
| `health.staff_data.view` | missing | ADD (parity with student_data) |
| `health.medical_records.view` | missing | ADD |
| `health.medical_records.create` | missing | ADD |
| `health.referral.create` | missing | ADD (referral to outside specialist) |

- **Cross-cutting:** reads from both `learners.*.view` and `hr.employees.view` (subject to per-learner / per-staff consent rules — see **open question #4**)
- **Privacy constraint (CRITICAL):** session notes and medical records are **confidential** — RLS must permit `SELECT` only to (a) the authoring `health_counselor` and (b) the subject learner/staff viewing their own record. super_admin does NOT bypass this by default; a `legal_hold` flag on the session row (settable only via an admin break-glass UI with audit log) is the only escape hatch.
- **RLS scope:** `institution_scope='all'` (single health counselor today serves all JKKN campuses — verified: only 1 user holds this role)
- **is_system_role:** CHANGE from `false` → `true` (this is a platform-level role, not a tenant-created one)

---

## Permission matrix (proposed)

Legend: ✅ = granted, ✅ read = read-only, — = not granted, 🔒 = granted with confidentiality RLS (author-only or subject-only SELECT).

| Permission key | Admission | Learner | Staff | Health |
| --- | --- | --- | --- | --- |
| `admission.leads.view` | ✅ | — | — | — |
| `admission.leads.edit` | ✅ | — | — | — |
| `admission.leads.assign` | ✅ | — | — | — |
| `admission.applications.view` | ✅ | — | — | — |
| `admission.marketing.expos.create` | ✅ | — | — | — |
| `learners.profiles.view` | ✅ read | ✅ read | — | ✅ read |
| `learners.counseling.view` | — | ✅ | — | — |
| `learners.counseling.sessions.create` | — | ✅ | — | ✅ |
| `learners.counseling.notes.create` | — | ✅ | — | ✅ 🔒 |
| `learners.at_risk.view` | — | ✅ | — | ✅ read |
| `learners.interventions.create` | — | ✅ | — | — |
| `academic.attendance.view` | — | ✅ read | — | ✅ read |
| `academic.internal-marks.view` | — | ✅ read | — | — |
| `hostel.complaints.view` | — | ✅ read | — | ✅ read |
| `billing.schedule.view` | — | ✅ read | — | — |
| `hr.employees.view` | — | — | ✅ read | ✅ read |
| `hr.leaves.view` | — | — | ✅ read | ✅ read |
| `hr.counseling.view` | — | — | ✅ | — |
| `hr.counseling.sessions.create` | — | — | ✅ | ✅ |
| `hr.counseling.notes.create` | — | — | ✅ | ✅ 🔒 |
| `hr.grievance.view` | — | — | ✅ | — |
| `hr.grievance.escalate` | — | — | ✅ | — |
| `hr.career_development.view` | — | — | ✅ | — |
| `health.escalations.view` | — | — | — | ✅ |
| `health.student_data.view` | — | — | — | ✅ read |
| `health.staff_data.view` | — | — | — | ✅ read |
| `health.counseling.sessions.create` | — | — | — | ✅ |
| `health.counseling.notes.create` | — | — | — | ✅ 🔒 |
| `health.medical_records.view` | — | — | — | ✅ 🔒 |
| `health.medical_records.create` | — | — | — | ✅ 🔒 |
| `health.referral.create` | — | — | — | ✅ |

Rows marked 🔒 require table-level RLS that restricts SELECT to `author_id = auth.uid() OR subject_id = auth.uid() OR (role_has_permission('health.legal_hold.override') AND legal_hold = true)`.

---

## RLS implications

### New tables + policies needed

| Table | Scope check | Extra confidentiality check |
| --- | --- | --- |
| `learner_counseling_sessions` | `role_has_institution_access((SELECT institution_id FROM learners WHERE id = learner_id))` | session owner OR counselor who authored |
| `learner_counseling_notes` | same as sessions (via session join) | author-only write; counselor + super_admin read |
| `learner_interventions` | same as sessions | counselor + HoD read; learner sees own (limited) |
| `staff_counseling_sessions` | `role_has_institution_access((SELECT institution_id FROM profiles WHERE id = employee_id))` | session owner + counselor only |
| `staff_counseling_notes` | same as sessions | author-only write |
| `health_counseling_sessions` | `institution_scope='all'` (cross-campus) | **author + subject only**, super_admin DOES NOT bypass unless `legal_hold=true` |
| `health_medical_records` | same as health_counseling_sessions | author + subject only; NO super_admin default bypass |

### Existing patterns to reuse

- `user_has_permission('key')` for perm check
- `role_has_institution_access(institution_id)` for scope check
- `is_super_admin() OR is_admin()` as first-line bypass — but **REMOVE the `is_super_admin()` bypass** on health_* tables and replace with explicit `legal_hold` check (this is a departure from the standard MyJKKN RLS pattern and must be explicitly approved)

### Audit log requirement

- Every SELECT on `health_counseling_notes` and `health_medical_records` should write to `health_access_log` (actor_id, subject_id, accessed_at, reason if legal_hold) for accreditation/legal defensibility. Pattern to borrow: `hr_dashboard_access_log` which is already LIVE on prod (see HR Sprint 6 memory).

---

## Migration sketch (additive, non-breaking)

Schema-level DDL for Phase 1 (additive only — no rename of existing `counselor`, no table creation yet):

```sql
-- Phase 1.1: Seed the 2 new counselor roles (idempotent)
INSERT INTO custom_roles (role_key, role_name, description, permissions, institution_scope, is_system_role, is_active)
VALUES
  (
    'learner_counselor',
    'Learner Counsellor',
    'Counsels enrolled learners on academic progress, well-being, dropout prevention, and career guidance. Scope: own institution.',
    '{
       "learners.counseling.view": true,
       "learners.counseling.sessions.view": true,
       "learners.counseling.sessions.create": true,
       "learners.counseling.notes.create": true,
       "learners.counseling.notes.view_own": true,
       "learners.at_risk.view": true,
       "learners.interventions.create": true,
       "learners.interventions.close": true,
       "learners.profiles.view": true,
       "academic.attendance.view": true,
       "academic.internal-marks.view": true,
       "billing.schedule.view": true,
       "view_profile": true,
       "view_dashboard": true
     }'::jsonb,
    'own',
    true,
    true
  ),
  (
    'staff_counselor',
    'Staff Counsellor',
    'Counsels employees and faculty on workplace wellness, grievance, conflict resolution, and career development. Scope: own institution.',
    '{
       "hr.counseling.view": true,
       "hr.counseling.sessions.view": true,
       "hr.counseling.sessions.create": true,
       "hr.counseling.notes.create": true,
       "hr.counseling.notes.view_own": true,
       "hr.grievance.view": true,
       "hr.grievance.escalate": true,
       "hr.career_development.view": true,
       "hr.employees.view": true,
       "hr.leaves.view": true,
       "view_profile": true,
       "view_dashboard": true
     }'::jsonb,
    'own',
    true,
    true
  )
ON CONFLICT (role_key) DO NOTHING;

-- Phase 1.2: Fix health_counselor metadata gaps
UPDATE custom_roles
SET
  description = 'Clinical/wellness counsellor for both learners and staff. Handles medical escalations, mental-health sessions, and confidential health records. Session content is not accessible to super_admin unless a legal_hold flag is set.',
  is_system_role = true
WHERE role_key = 'health_counselor' AND description IS NULL;

-- Phase 1.3: Expand health_counselor permission set
UPDATE custom_roles
SET permissions = permissions || '{
  "health.counseling.sessions.view_own": true,
  "health.counseling.sessions.create": true,
  "health.counseling.notes.create": true,
  "health.counseling.notes.view_own": true,
  "health.staff_data.view": true,
  "health.medical_records.view": true,
  "health.medical_records.create": true,
  "health.referral.create": true,
  "learners.profiles.view": true,
  "hr.employees.view": true
}'::jsonb
WHERE role_key = 'health_counselor';

-- Phase 1.4 (DEFERRED to Phase 3): OPTIONAL rename of counselor -> admission_counselor
-- NOTE: BREAKING for anything hard-coding 'counselor'. Audit (Phase 3 prereq):
--   grep -r "'counselor'" app/ lib/ supabase/
--   grep -r '"counselor"' app/ lib/ supabase/
-- Also update: lib/constants/permissions.ts role enum, sidebar menu, test-login accounts,
--              profiles.role trigger, and any RLS policies hard-coding the key.

-- Phase 2 (SEPARATE PR — not in this migration): create counseling tables
-- learner_counseling_sessions, learner_counseling_notes, learner_interventions
-- staff_counseling_sessions, staff_counseling_notes
-- health_counseling_sessions, health_counseling_notes, health_medical_records
-- Full DDL lands in supabase/setup/01_tables.sql; RLS in supabase/setup/03_policies.sql
```

All statements are idempotent (`ON CONFLICT`, `WHERE description IS NULL`, `|| jsonb` merge).

---

## Open questions for Omm

1. Should existing `counselor` be renamed to `admission_counselor` for clarity, or kept as-is for backward compatibility? (Recommendation: defer to Phase 3 — rename is BREAKING.)
2. Does Learner Counselor report to the Academic Dean, HoD, or a new Director of Student Services? Determines approval chains + dashboard routing.
3. What's the expected session frequency per persona — weekly cohort reviews (bulk), fortnightly 1:1s (scheduled), or on-demand (ad-hoc)? Drives UI (calendar vs queue vs both).
4. Does Health Counselor's confidentiality contract extend to super_admin by default? Industry norm says yes — access only under explicit `legal_hold`. Confirm for JKKN legal team.
5. Who creates staff_counselor sessions — self-service (employee books an open slot) or manager-initiated (manager refers a report)? Schema + UX diverge significantly.
6. Are there regulatory requirements (UGC/NAAC/NBA/PCI) mandating counselor-to-learner ratios that should surface as a dashboard widget?
7. Should we maintain an audit log of session **metadata only** (time, duration, counselor-id, learner-id) without content for accreditation reporting, while keeping content-access separately logged for legal defensibility?
8. Integration with existing abandoned-but-LIVE-schema modules: the Grievance module (`specs/workshop-transformation-resurrection`) and Wellness module both have DDL on prod. Do those consume/feed counseling sessions, or are they independent?
9. Is Health Counselor genuinely cross-campus (`scope='all'`) given there is only 1 user today, or is that an artifact of incomplete rollout? If each campus should have its own, flip to `scope='own'` before adding new users.

---

## Implementation phases (if approved)

1. **Phase 0 — Interview week (1 week)**
   - Answer 9 open questions above
   - Lock role_keys, permission matrix, and RLS rules
   - Deliverable: v1.0 of this spec

2. **Phase 1 — Role substrate (1 sprint, ~2 weeks)**
   - Apply migration sketched above (seed 2 roles + fix health_counselor)
   - Add all new permission keys to `lib/constants/permissions.ts` PERMISSION_CATEGORIES
   - Add sidebar menu entries (behind feature flag until Phase 2 UI lands)
   - Create 2 test accounts (`test.learner_counselor@jkkn.ac.in`, `test.staff_counselor@jkkn.ac.in`) via `scripts/create-test-accounts.ts`
   - Ship as one PR; additive and reversible

3. **Phase 2 — Module builds (2 parallel sprints, ~6-8 weeks total)**
   - Build `/learners/counseling/*` module: queue, session log, at-risk dashboard, intervention tracker
   - Build `/hr/counseling/*` module: queue, session log, grievance assignments
   - Fill out Health Counselor UI: session log, medical records, referral form, audit log view
   - New tables land in `supabase/setup/01_tables.sql`; RLS in `supabase/setup/03_policies.sql`
   - Audit log pattern mirrors `hr_dashboard_access_log`

4. **Phase 3 — Rename + reconciliation (1 sprint if approved)**
   - Optional: `counselor` → `admission_counselor` rename with full string-sweep audit
   - Backfill any missing learner_counselor / staff_counselor assignments

5. **Phase 4 — Accreditation + reporting (1 sprint)**
   - Counselor-to-learner ratio dashboard for UGC/NAAC
   - Session metadata export for NAAC criterion 5 (Student Support & Progression)
   - Anonymized well-being trend report for NAAC criterion 7 (Institutional Values)

---

## Non-goals

- Not changing the current `counselor` role's granted perm set in this pass (Phase 1 is strictly additive for new roles; Phase 3 handles the optional rename)
- Not building the counseling-session tables (`learner_counseling_sessions` etc.) in Phase 1 — that's Phase 2
- Not merging Admission Counselor + Learner Counselor into a single "Student Counselor" persona — JKKN operationally treats pre-enrollment and post-enrollment as distinct lifecycles (different KPIs, different reporting lines, different table anchors)
- Not shipping a unified `counselor_sessions` super-table — persona-specific tables give cleaner RLS and cleaner accreditation reporting
- Not replacing the existing admission_counselors table with a generic counselors table — that's a much larger refactor and outside this taxonomy's scope

---

## References

- Production DB verification (2026-04-24): Supabase MCP queries on `kvizhngldtiuufknvehv.supabase.co`
- Role system architecture: `/Users/omm/PROJECTS/MyJKKN/.claude/worktrees/counselor-taxonomy-spec/CLAUDE.md` (Role Management & Dynamic Permission System section)
- HR Sprint 6 audit-log pattern (live on prod): `hr_dashboard_access_log` table + realtime publication
- Related: `specs/one-jkkn-one-data/MASTER-PLAN.md` (substrate-first philosophy)
- Related: `lib/constants/permissions.ts` (authoritative permission catalog)
