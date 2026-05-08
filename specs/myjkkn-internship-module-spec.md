# MyJKKN Internship Module — Adapted Spec

> **Source:** Ported from `origin/omm-dev:docs/internship-posting-spec.md` (2026-03-30, JKKN-Institutions/MyJKKN legacy fork)
> **Adapted:** 2026-05-08 — for current production (jicate/main)
> **Module name:** Internship Module
> **Routes:** `/internships/*`
> **Table prefix:** `internship_*` (renamed from omm-dev's `ip_*`)
> **Scope:** All 7 JKKN colleges day-1 (~2,740 learners)
> **Status:** Spec locked — pending /assumption-thrash → /myjkkn-api

---

## 0. Outcome Metric (LOCKED 2026-05-08)

```json
{
  "metric_name": "% of active postings with completed digital logbook + GPS attendance + dual evaluation (vs paper/sheets/chat photos)",
  "baseline_value": "~0% as of 2026-05-08 (currently 100% manual via Google Sheets + chat photos)",
  "threshold_90d": "50% of active postings use the system end-to-end",
  "kill_criterion": "<15% adoption at day 90 = system unusable in field; redesign or archive",
  "verdict_date": "2026-08-08",
  "queryable_via": "SELECT 100.0 * COUNT(*) FILTER (WHERE has_logbook_completed AND has_gps_attendance AND has_dual_evaluation) / NULLIF(COUNT(*), 0) FROM internship_assignments WHERE status='active'"
}
```

**Four-test discipline:** 4/4 pass (Colgate ✓, Hyatt ✓, Juicero ✓, RXBAR ✓). See conversation transcript 2026-05-08 12:30 IST.

---

## 1. Locked Decisions (28-equivalent)

| # | Decision | Value | Rationale |
|---|---|---|---|
| 1 | Module name | Internship Module | User directive 2026-05-08 12:08 IST |
| 2 | Route prefix | `/internships/*` | Mirrors module name |
| 3 | Table prefix | `internship_*` | Renamed from omm-dev `ip_*`; production naming convention |
| 4 | Scope | All 7 colleges day-1 (~2,740 learners) | User directive 2026-05-08 12:14 IST |
| 5 | Salvage approach | Port-as-is from origin/omm-dev, adapt to production | User directive |
| 6 | Cascade-preview pane | v1 requirement | Director-grade UX directive |
| 7 | Preceptor role | First-class custom_role | Accreditation ratio-tracking requirement |
| 8 | Vehicle booking | v1 (port omm-dev's `vehicles/` routes) | Rural hospital transport reality |
| 9 | GPS attendance | Strict block (geofence required) | Adoption-metric data quality |
| 10 | Default fee threshold | 70% (configurable via UI) | omm-dev spec default; non-compliance ~29% |
| 11 | Per-college UI label | `platform_policies.internship.label.{role_key}` | "Clinical Posting" for nursing, "Internship" for engineering |
| 12 | Site type extensibility | CRUDable master table (`internship_site_types`) | Q1 enforcement |
| 13 | Logbook templates | JSONB per `(college_id, program_id)` | Per-program customization |
| 14 | Evaluation rubrics | JSONB per `(college_id, program_id)` | Per-program customization |
| 15 | Approval chain config | `internship_approval_chains` rows per posting_type | Q3 enforcement |
| 16 | Geofence radius | Per-hospital config (default 200m, range 50-1000m) | Q3 enforcement |
| 17 | Logbook submit deadline | `platform_policies.internship.logbook.submit_within_hours` (default 24) | Q3 enforcement |
| 18 | Late penalty | `platform_policies.internship.logbook.late_penalty_pct` | Q3 enforcement |
| 19 | Attendance auto-flag | `platform_policies.internship.attendance.flag_below_pct` (default 75) | Q3 enforcement |
| 20 | Roster reminder lead-time | `platform_policies.internship.roster.reminder_d_minus` (default 3 days) | Q3 enforcement |
| 21 | Preceptor-to-student ratio | `internship_program_config.preceptor_ratio_max` per program | Accreditation requirement (INC ≤6, DCI ≤8, PCI ≤10) |
| 22 | Vehicle booking lead time | `platform_policies.internship.vehicle.lead_time_days` | Q3 enforcement |
| 23 | LOP-immunity for posting staff | Flag from internship_assignments → faculty_attendance_service | Solves production bug per specs/hrapp-issues-capture.md line 2853 |
| 24 | Reader function | `fn_internship_evaluate_policy(policy_key, context)` | Mirrors fn_auto_assign_counselor_v2 pattern |
| 25 | TS service layer | `lib/services/admin/internship-policy-service.ts` | Mirrors counselor-routing-config-service shape |
| 26 | Admin UIs | `/admin/internship-policy/*` (mirrors `/admin/counselors/routing-config/`) | Director-grade pattern |
| 27 | Realtime invalidation | Supabase channel subscriptions on `internship_*` tables | Cross-tab cache invalidation |
| 28 | RLS scope | `(institution_id, college_id)` for internal; `(institution_id, site_id)` for external (hospital_contact, preceptor) | Multi-tenant isolation |

---

## 2. Personas & Roles

| Layer | Persona | Role key | New? | Scope |
|---|---|---|---|---|
| Internal | Student | `student` | existing | own learner_id |
| Internal | Coordinator | `hod`, `coordinator` | existing | college_id |
| Internal | Faculty Supervisor | `faculty` (+ `is_supervisor` flag) | existing | assigned cycle |
| Internal | College Admin | `college_admin` | existing | college_id |
| Internal | Super Admin (COO) | `super_admin` | existing | institution_id |
| Internal | Billing | `accounts` | existing | institution_id |
| **External** | **Hospital Contact** | **`hospital_contact`** | **NEW** | site_id |
| **External** | **Preceptor** | **`preceptor`** | **NEW** | site_id + assigned_students |
| Oversight | Auditor | `auditor` | existing | read-only institution-wide |
| Oversight | HR | `hr` | existing | LOP-immunity visibility |
| Oversight | Hostel Office | `hostel_admin` | existing | view student leave for posting period |

**PERMISSION_CATEGORIES additions** (`lib/constants/permissions.ts`):
- `INTERNSHIP_POSTING` parent category with sub-keys:
  - `cycle.create`, `cycle.approve`, `cycle.activate`
  - `assignment.assign`, `assignment.approve_fee_exception`
  - `attendance.mark_gps`, `attendance.view_all`
  - `logbook.submit`, `logbook.review`
  - `evaluation.submit_facilitator`, `evaluation.submit_supervisor`, `evaluation.submit_preceptor`
  - `hospital.create`, `hospital.edit`, `hospital.view_master`
  - `vehicle.book`, `vehicle.approve`
  - `preceptor.assign`, `preceptor.evaluate`
  - `reports.export`, `reports.accreditation`
  - `policy.edit` (super-admin only)

---

## 3. Data Model (adapted from omm-dev §3)

Renames `ip_*` → `internship_*`. Tables (full DDL in migration `supabase/migrations/<timestamp>_internship_module_v1.sql`):

| Table | Purpose | Key cols |
|---|---|---|
| `internship_external_sites` | Hospital/company/school master | site_type, hospital_code (unique per institution), lat/lng, geofence_radius_meters |
| `internship_site_contacts` | Hospital admin coordinators | site_id, portal_user_id |
| `internship_preceptors` | NEW: First-class preceptor records | site_id, profile_id, specialization, max_students |
| `internship_posting_cycles` | Cycle definitions | batch_id, status enum, fee_compliance_threshold |
| `internship_cycle_hospitals` | Cycle ↔ site M2M | allocated_learners, confirmed_by_hospital |
| `internship_assignments` | Learner ↔ site assignment | learner_id, site_id, facilitator_id, preceptor_id, rotation_dates, fee status |
| `internship_attendance` | GPS-stamped daily attendance | assignment_id, faculty_id, lat/lng, geofence_pass, anomalies |
| `internship_logbook_entries` | Daily logbook submissions | assignment_id, entry_data JSONB (template-driven), submitted_at |
| `internship_evaluations` | Dual evaluations (facilitator + preceptor) | assignment_id, evaluator_role, scores JSONB, signed_at |
| `internship_incidents` | Incident reports | assignment_id, severity, reporter_role |
| `internship_certificates` | Verified completion certificates | assignment_id, cert_id (public), issued_at, verification_url |
| `internship_competencies` | Competency framework | program_id, code, description |
| `internship_vehicles` | Vehicle bookings for transport to sites | cycle_id, route, capacity, driver_id |
| **Config tables (Q3)** | | |
| `internship_site_types` | Master: hospital, company, school, pharmacy, clinic, lab, ngo, factory, retail_pharmacy (extensible) | label, is_active |
| `internship_program_config` | Per-program defaults (duration, preceptor ratio, etc.) | college_id, program_id, config JSONB |
| `internship_logbook_templates` | Per-program logbook field schema | program_id, fields JSONB |
| `internship_evaluation_rubrics` | Per-program evaluation rubric | program_id, criteria JSONB |
| `internship_approval_chains` | Approval routing per posting_type | posting_type, approver_role_keys[] |

**Cross-cutting policy rows in `platform_policies`:**
- `internship.logbook.submit_within_hours` (24)
- `internship.logbook.late_penalty_pct` (10)
- `internship.attendance.flag_below_pct` (75)
- `internship.roster.reminder_d_minus` (3)
- `internship.vehicle.lead_time_days` (5)
- `internship.label.{role_key}` (per-role UI label override)
- `internship.gps.strict_mode` (true)

---

## 4. Reader Function Pattern (Spec #537 mirror)

Single SQL function services all policy reads:

```sql
CREATE OR REPLACE FUNCTION fn_internship_evaluate_policy(
  p_policy_key TEXT,
  p_context JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
  -- Reads from platform_policies WHERE policy_key = p_policy_key
  -- Falls back to module-typed config tables for module-internal rules
  -- Returns JSONB with computed value + cascade impact
$$ LANGUAGE plpgsql STABLE;
```

TS service layer at `lib/services/admin/internship-policy-service.ts` exposes React Query hooks for both reading and writing.

---

## 5. Director-Grade Admin UIs

Mirroring `/admin/counselors/routing-config/` pattern + adding cascade-preview pane:

| Route | Director's daily operation |
|---|---|
| `/admin/internship-policy/` | Edit cross-cutting policies (logbook deadline, attendance flag, etc.) — every edit shows cascade-preview before Save |
| `/admin/internship-policy/site-types/` | Add/edit/disable site types (Q1 — extensible) |
| `/admin/internship-policy/program-config/` | Per-program defaults (preceptor ratio, posting duration) |
| `/admin/internship-policy/approval-chains/` | Configure approval routing per posting_type |
| `/admin/internship-policy/labels/` | Per-college UI label overrides (engineering="Internship", nursing="Clinical Posting") |
| `/admin/internship-policy/hospitals/` | Hospital master CRUD (incl. per-site GPS strictness override) |

**Cascade-preview spec (NEW v1 component):**
- Before Save click: render plain-English consequence sentences
- Example: "Changing logbook deadline from 24h to 12h will affect 47 active assignments. 12 assignments would have late submissions under the new rule (currently on-time). Send reminder push notification?"
- Component: `components/shared/cascade-preview/CascadePreview.tsx` (new shared component, will be reusable for future Director-grade UIs)

---

## 6. File Plan (Port + Adapt)

**67 files to port from `origin/omm-dev`** + ~15 net-new files for adaptations.

### Routes (port + rename `postings/*` → `internships/*`)
All 30+ files under `app/(routes)/postings/` → `app/(routes)/internships/`. Sub-routes:
- `_components/` (3 files: adoption-dashboard, emergency-fab, status-badges)
- `admin/approval-chains/`, `admin/rollout/`
- `attendance/`, `attendance/[cycleId]/`
- `certificates/`, `certificates/verify/[certId]/`
- `competencies/`
- `cycles/`, `cycles/new/`, `cycles/[id]/`, `cycles/[id]/assignments/`
- `evaluations/`, `evaluations/[assignmentId]/`
- `hospitals/`, `hospitals/new/`, `hospitals/[id]/`
- `incidents/`, `incidents/new/`
- `logbook/`, `logbook/review/`
- `my-posting/` → `my-internship/`
- `portal/[siteId]/` (hospital + preceptor portal)
- `reports/`
- `rotation/`
- `templates/`
- `vehicles/`, `vehicles/new/`
- `page.tsx` (module home)

### Hooks (port: `hooks/postings/*` → `hooks/internships/*`)
~10 files: use-assignments, use-attendance, use-certificates, use-competencies, use-cycles, use-evaluations, use-hospitals, use-logbook, use-incidents, use-vehicles

### Services (NEW + adapt)
- `lib/services/internships/internship-service.ts` (CRUD)
- `lib/services/internships/cycle-service.ts`
- `lib/services/internships/attendance-service.ts`
- `lib/services/internships/logbook-service.ts`
- `lib/services/internships/evaluation-service.ts`
- `lib/services/admin/internship-policy-service.ts` (Director-grade UI)

### Migrations (NEW — adapted from omm-dev's single migration)
- `supabase/migrations/<timestamp>_internship_module_v1_substrate.sql` (tables + RLS)
- `supabase/migrations/<timestamp>_internship_module_v1_seeds.sql` (site types, default policy rows, 7-college config)
- `supabase/migrations/<timestamp>_internship_module_v1_reader_fn.sql` (fn_internship_evaluate_policy)
- `supabase/migrations/<timestamp>_internship_module_v1_lop_immunity.sql` (extends faculty-attendance-service to recognize posting assignments)

### Permissions catalog
- `lib/constants/permissions.ts`: add `INTERNSHIP_POSTING` block (~20 keys)
- `lib/sidebarMenuLink.ts`: add `/internships` entry

### Cascade-preview shared component
- `components/shared/cascade-preview/CascadePreview.tsx`
- `components/shared/cascade-preview/types.ts`

---

## 7. Day-1 Adaptation Work (Critical — porting "as-is" inherits omm-dev hardcodes)

The omm-dev code hardcodes thresholds in TypeScript. Day-1 adaptation extracts these to config tables:

| Hardcoded in omm-dev | Refactor to |
|---|---|
| `const GEOFENCE_RADIUS_M = 100` | Read from `internship_external_sites.geofence_radius_meters` |
| `const FEE_COMPLIANCE_THRESHOLD = 70` | Read from `internship_posting_cycles.fee_compliance_threshold` |
| `const LOGBOOK_DEADLINE_HOURS = 24` | Read from `platform_policies.internship.logbook.submit_within_hours` |
| `const ATTENDANCE_FLAG_THRESHOLD = 75` | Read from `platform_policies.internship.attendance.flag_below_pct` |
| `const ROSTER_REMINDER_D_MINUS = 3` | Read from `platform_policies.internship.roster.reminder_d_minus` |
| Hardcoded role checks (`role === 'super_admin'`) | Read from custom_roles + permission catalog |
| Hardcoded site_type enum | Read from `internship_site_types` master |

Every consumer of these hardcodes gets refactored to the reader-fn pattern. Estimated 30-50% of porting time spent here.

---

## 8. Acceptance Criteria (v1 ship gate)

1. ✅ All 67 omm-dev files ported + renamed (postings → internships, ip_ → internship_)
2. ✅ Zero hardcoded thresholds in ported TS — all read via `fn_internship_evaluate_policy` or service-layer accessors
3. ✅ 14 policy rows seeded in `platform_policies` + module-typed config tables
4. ✅ 9 site types seeded; institution admin can add new types via UI
5. ✅ 2 NEW custom_roles created: `hospital_contact`, `preceptor`
6. ✅ INTERNSHIP_POSTING permission category added (~20 keys) + role assignments
7. ✅ `/internships` route renders for all 7 colleges with role-aware sidebar label
8. ✅ Director-grade `/admin/internship-policy/*` UIs all show cascade-preview before Save
9. ✅ GPS attendance enforces geofence (strict block) — outside-geofence submission rejected with clear error
10. ✅ LOP-immunity flag wired into faculty-attendance-service — production bug from specs/hrapp-issues-capture.md line 2853 resolved
11. ✅ INC/DCI/PCI accreditation page reads from internship DB (not manual entry)
12. ✅ Hospital portal works on mobile + 3G connection (preceptor 24/7 use case)
13. ✅ pre-merge screenshot bookend (Step 3.5)
14. ✅ post-deploy production screenshot (Step 5b)
15. ✅ Outcome metric query returns ≥0% baseline reading (verifiable via SQL after deploy)

---

## 9. Cross-domain Registry

This metric is also locked in `~/Vaults/JKKNKB/Strategy/Locked-Initiatives.md` via `/lock-initiative` skill (executed 2026-05-08).

Verdict scheduled: 2026-08-08 (90 days).

---

## 10. Next Steps in Chain

1. **/lock-initiative** — register cross-domain commitment
2. **/assumption-thrash** — surface silent assumptions from this spec before any DDL
3. **/myjkkn-api** — build module via 4+1 substrate-first pattern (3 file-disjoint agents + 1 consuming-engine PR)
4. **silent-failure-auditor** — pre-PR sweep
5. **catalog-sync** — verify INTERNSHIP_POSTING permissions catalogued
6. **pr-preflight** — open-PR overlap check
7. **/ship-myjkkn** — translator-pattern PR to jicate/main
8. **Step 3.5** — pre-merge localhost screenshot
9. **/deploy-myjkkn** + Step 5b post-deploy production screenshot
10. **/bug-resolve** if triggered by bug ticket

---

*Spec written 2026-05-08 12:35 IST. Source-of-truth for all subsequent /myjkkn-chain stages on this module.*
