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

## 11. Silent Assumption Decisions (from /assumption-thrash, 2026-05-08)

### Phase 0 — Layer 2 overlap resolutions (3 critical findings)

| # | Finding | Decision | Schema impact |
|---|---|---|---|
| O1 | `competency_catalog` (15 cols) + `competency_program_mapping` + `learner_competencies` already exist with sophisticated framework | Extend existing 3-table system; add `posting_assignment_id UUID` to `learner_competencies` | DROP `internship_competencies` from spec |
| O2 | `hr_attendance_status_types` (7 live rows), `hr_attendance_records` (20 cols) exist for HR attendance | Add `on_clinical_posting` row to `hr_attendance_status_types` + write `hr_attendance_records` from internship module → solves LOP-immunity bug at right layer | DROP standalone `internship_facilitator_attendance` plan |
| O3 | `health_practice_attendance` (8 cols, 0 rows) — dormant clinical attendance scaffold | ADOPT + EXTEND with GPS, hospital_id, geofence_pass, facilitator_id, posting_assignment_id, is_proxy, is_emergency cols | RENAME consideration to `internship_attendance` (deferred to v1.1 cleanup) |

### Round 1 — Structural choices

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Temporal model | **Per-college template-driven** (each college configures own time anchor) | AHS 12-week batches + Engineering 8-week internships + Education 1-month teaching practice need different time anchors |
| 2 | GPS attendance granularity | **One row per assignment per day** | Matches AHS Google Chat photo ritual; multi-shift hospitals merge into one row with arrival/departure times |
| 3 | Per-college variance | **Single `internship_program_config` table with (college_id, program_id) keys + JSONB rubric/template/duration** | Q3 platform-wide policy management preserved; cascade-preview spans colleges |
| 4 | Lineage | **Hybrid — structural rules frozen at cycle activation, threshold tweaks live** | Cycle locks approval_chain/posting_type/fee_threshold/geofence; logbook deadline + flag % stay editable per Director-grade autonomy |

### Round 2 — Edge cases + workflow

| # | Question | Decision | Rationale |
|---|---|---|---|
| 5 | Mid-cycle additions (transfer student) | **Pro-rata from join_date** | Required days = total × (days_remaining / cycle_total); cleanest for transfers |
| 6 | Exhausted absences | **Threshold-based per program config** (warn_below_pct + fail_below_pct in JSONB) | INC nursing 90/85, AICTE engineering 75/65 — accreditation-aligned |
| 7 | Cancellation mid-cycle | **Hybrid: pre-activation soft-delete; post-activation supersede + audit** | Audit fidelity for accreditation; partial completion preserved |
| 8 | Fri+Mon postings — Sat/Sun on-duty? | **Per-hospital config** (`internship_external_sites.operates_weekends BOOLEAN`) | ICU/OBG/emergency hospitals operate weekends; outpatient don't |

### Round 3 — Operational edges

| # | Question | Decision | Rationale |
|---|---|---|---|
| 9 | Proxy attendance (faculty phone fails) | **Coordinator + emergency override flag** (`is_proxy`, `proxy_reason`, `marked_for`) with audit highlights | Mitigates GPS strict-block edge cases |
| 10 | Emergency GPS-bypass | **Faculty self-flag `is_emergency` + 20-char reason + photo, audit-logged + weekly digest to coordinator** | Self-policing via visibility; Director sees abuse patterns |
| 11 | Approval escalation | **Auto-escalate after configurable hours + manual delegate** (`platform_policies.internship.approval.escalate_after_hours` default 72h) | Hybrid covers vacations + busy days |
| 12 | Documentation requirements | **Per-program config** (`internship_program_config.attachment_requirements JSONB`) | INC requires daily logbook photos; engineering may require only weekly summary |

### Round 4 — Compliance + visibility

| # | Question | Decision | Rationale |
|---|---|---|---|
| 13 | Hospital portal privacy | **Preceptor sees ALL students at their site** (cross-preceptor visibility, RLS scope = `(institution_id, site_id)`) | Better cross-coverage during preceptor absence |
| 14 | Completion artifacts | **Auto-generate certificate on completion + on-demand re-issue** | Pattern from existing `accreditation_certificates` + `pde_certificates`; public verify URL `/internships/certificates/verify/[certId]` |
| 15 | Cycle blackouts | **Per-college configurable blackout calendar** (`internship_college_blackouts` table) | Each college's exam dates + accreditation visits differ |
| 16 | Retroactive recomputation | **Status frozen at assessment + cascade-preview shows hypothetical changes + opt-in retro apply** | Audit-safe with Director-grade override option |

### Round 5 — Realtime + integrations

| # | Question | Decision | Rationale |
|---|---|---|---|
| 17 | Realtime invalidation | **Supabase realtime subscriptions on `platform_policies` + `internship_*` tables** | Director's policy edits propagate live to in-flight users; pattern from `hr_dashboard_access_log` |
| 18 | Vehicle booking | **Dedicated `internship_vehicles` (port from omm-dev)** | TMS is currently spec-only (not live); ship-speed wins; v2.x consideration to merge |
| 19 | Cascade-preview multi-policy edits | **Accumulating preview** (cumulative effect across multiple edits before single Save) | Director sees joined consequence of holistic policy change |
| 20 | Hospital portal auth | **Magic-link email + 30-day persistent session** | 3am ICU shifts; pattern reuses `scripts/local-auth.sh` magic-link infra |

### Round 6 — Lifecycle + versioning + cadence + edits

| # | Question | Decision | Rationale |
|---|---|---|---|
| 21 | Cycle lifecycle states | **Hybrid: enum transitions + `internship_cycle_status_labels(college_id, status_enum, label_text)` per-college display labels** | State machine semantics preserved; per-college vocabulary honored |
| 22 | Evaluation rubric versioning | **Snapshot at assignment activation** (`internship_assignments.evaluation_rubric_snapshot JSONB`) | Audit-safe; rubric edits don't retroactively affect active assignments |
| 23 | Notification cadence | **Platform-wide via `platform_policies.internship.notify.*` + per-college override** (`internship_college_notification_overrides`) | Defaults flexible; cascade-preview shows propagation |
| 24 | Logbook late-edit | **Window-based: editable for `platform_policies.internship.logbook.edit_window_hours` (default 24), then locked** | `internship_logbook_entries.edited_at`, `edit_history JSONB` |

### Round 7 — Final edges

| # | Question | Decision | Rationale |
|---|---|---|---|
| 25 | Incident severity | **3-tier (minor/major/critical) with auto-escalation per `platform_policies.internship.incident.{tier}.notify_within_hours`** | Cleanly maps to JKKN's escalation patterns; cascade-preview shows alert-time consequence |
| 26 | Concurrent posting (multi-dept rotation) | **Configurable per program** (`internship_program_config.assignment_split_strategy ENUM('single_row','per_department_row')`) | Nursing INC requires per-dept logs; AHS multi-dept fits single-row |
| 27 | Site type seeds | **Full 12+ types** (hospital, company, school, pharmacy, clinic, lab, ngo, factory, retail_pharmacy, health_camp, community_outreach, virtual_internship, other) — all marked `is_system=true`, CRUDable | Pre-empts catalog gaps in week 1 |
| 28 | Certificate revocation | **`internship_certificates.is_revoked BOOLEAN` + revoked_at + revoked_by + revocation_reason; public verify URL flips to 'REVOKED'** | Audit-grade revocation when retro-recomputation triggers |

### Schema implications (consolidated — derived from 28 decisions)

**New tables (10):**
1. `internship_external_sites` (hospital/company/etc. master with operates_weekends + geofence_radius_meters)
2. `internship_site_contacts` (admin coordinators at sites; portal_user_id linked)
3. `internship_preceptors` (first-class preceptor records — site_id, profile_id, specialization, max_students)
4. `internship_posting_cycles` (with temporal_mode snapshot, escalate_after_hours, delegated_to)
5. `internship_cycle_hospitals` (M2M)
6. `internship_assignments` (with assignment_join_date, required_attendance_pct_snapshot, evaluation_rubric_snapshot JSONB, superseded_by, cancellation_audit JSONB)
7. `internship_logbook_entries` (with edited_at, edit_history JSONB)
8. `internship_evaluations` (dual eval: facilitator + preceptor)
9. `internship_incidents` (3-tier severity)
10. `internship_certificates` (with is_revoked, revoked_at, revocation_reason)
11. `internship_vehicles` (transport bookings, port from omm-dev)

**New config tables (6):**
12. `internship_site_types` (master, 12+ seeded values)
13. `internship_program_config` ((college_id, program_id) keyed, JSONB for rubric/template/duration/attendance_thresholds/attachment_requirements/assignment_split_strategy)
14. `internship_logbook_templates` (program-level)
15. `internship_evaluation_rubrics` (program-level, versioned)
16. `internship_approval_chains` (rows per posting_type)
17. `internship_cycle_status_labels` ((college_id, status_enum, label_text))
18. `internship_college_blackouts` ((college_id, start_date, end_date, reason))
19. `internship_college_notification_overrides` ((college_id, policy_key, override_value))

**Modified existing tables (3):**
- `health_practice_attendance` ADOPT+EXTEND: add gps_lat, gps_lng, geofence_pass, hospital_id, facilitator_id, posting_assignment_id, is_proxy, proxy_reason, marked_for, is_emergency, emergency_reason, emergency_photo_url
- `learner_competencies` ADD: `posting_assignment_id UUID` FK
- `hr_attendance_status_types` ADD ROW: `on_clinical_posting`

**New ENUM:**
- `internship_cycle_status_enum`: draft, pending_approval, approved, fee_checking, assignments_ready, active, completed, cancelled

**New SQL function:**
- `fn_internship_evaluate_policy(policy_key TEXT, context JSONB) RETURNS JSONB` — mirrors Spec #537 counselor-rules pattern

**Cross-cutting `platform_policies` keys (~16):**
- `internship.logbook.submit_within_hours` (24)
- `internship.logbook.late_penalty_pct`
- `internship.logbook.edit_window_hours` (24)
- `internship.attendance.flag_below_pct` (75)
- `internship.roster.reminder_d_minus` (3)
- `internship.vehicle.lead_time_days` (5)
- `internship.gps.strict_mode` (true)
- `internship.approval.escalate_after_hours` (72)
- `internship.incident.minor.notify_within_hours`
- `internship.incident.major.notify_within_hours`
- `internship.incident.critical.notify_within_hours`
- `internship.notify.roster_reminder_d_minus`
- `internship.notify.faculty_schedule_d_minus`
- `internship.notify.logbook_reminder_after_hours`
- `internship.notify.evaluation_reminder_after_hours`
- `internship.label.{role_key}` (per-role UI label override)

---

## 12. Next Step

Spec ready for `/myjkkn-api` substrate-first 3+1 spawn. File-disjoint agent groups:
- **Agent A** — DDL (4 migrations: substrate, seeds, reader fn, lop-immunity wiring)
- **Agent B** — Service layer + hooks (lib/services/internships/* + hooks/internships/* + lib/services/admin/internship-policy-service.ts)
- **Agent C** — UI scaffolding (app/(routes)/internships/* — 30 routes ported with rename; cascade-preview shared component)
- **Phase 2 consuming engine** — wires faculty-attendance-service LOP-immunity, accreditation page hooks, sidebar nav, INTERNSHIP_POSTING permission catalog, realtime channels

---

*Spec written 2026-05-08 12:35 IST. Assumption-thrash 28 decisions added 2026-05-08 13:00 IST. Source-of-truth for all subsequent /myjkkn-chain stages on this module.*
