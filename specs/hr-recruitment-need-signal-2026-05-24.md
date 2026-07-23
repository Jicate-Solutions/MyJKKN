# HR Faculty Recruitment Need Signal — Module Design Lock

**Interview started:** 2026-05-20 (session 2babf6db)
**Interview continued:** 2026-05-24 (session 9b90250e)
**Status:** COMPLETE. 53 decisions locked across /myjkkn-module (38q) + /assumption-thrash (15q). Spec ready for /myjkkn-api build phase.
**Skill chain:** /myjkkn-module → /assumption-thrash → /myjkkn-api

---

## Phase 1 — Module Calibration (4 decisions)

| # | Decision | Locked value |
|---|----------|---|
| P1.1 | Primary user | 3-tier: Director (all 8 inst) + Principal (their inst) + HR Officer (their inst, read-only) |
| P1.2 | Trigger mode | Always-on dashboard (no cron, no email digest, no alerts engine) |
| P1.3 | Decision right | Recommend only — no pre-fill of /hr/recruitment/submit |
| P1.4 | Pilot scope | All 8 colleges + all 8 regulatory bodies on day 1 |

---

## Phase 2 — Feature Inventory (5 features)

| # | Feature | Priority |
|---|---------|----------|
| 1 | Signal Computation Engine — 7-input RPC | H |
| 2 | Multi-Scope Dashboard — 3-tier views + drill + comparison | H |
| 3 | Regulatory Norm + Peer Benchmark Admin — Director-only CRUD | H |
| 4 | Workload Data Capture — prerequisite for input #1 | M |
| 5 | Reporting & Intelligence — export + snapshot + YoY | M |

---

## Feature 1: Signal Computation Engine (14 questions)

| # | Decision | Locked value |
|---|----------|---|
| F1.1 | Signal shape | Composite (0-100) for sort + per-input R/A/G for drill |
| F1.2 | Missing data | Block whole row → "insufficient data" until all 7 inputs available |
| F1.3 | Freshness | Compute-on-read + 1hr cache + force-refresh button |
| F1.4 | Faculty counting | Configurable per body in norm table (full-time/adjunct/visiting weights) |
| F1.5 | Leave exclusion | Configurable threshold (policy row: exclude if > X days) |
| F1.6 | Composite weights | Director-tunable via admin UI (7 policy rows summing to 100) |
| F1.7 | Validation mode | Side-by-side: raw data alongside signal for Director audit |
| F1.8 | Zero-student programs | 'Upcoming intake' flag — use projected intake as denominator |
| F1.9 | Signal override | Snooze N months with auto-re-surface + reason |
| F1.10 | Data sources | Staff + admission funnel + institution master + leave records |
| F1.11 | Success (90d) | All 8 institutions visible + 3 actual recruitment decisions |
| F1.12 | R/A/G thresholds | Fixed defaults + Director override per body in admin UI |
| F1.13 | Cross-institution | Weighted by allocation_percentage (new table) |
| F1.14 | Current state | Mixed across institutions — module standardizes |

**Policy table rows from Feature 1: ~25+**
- 7 weight rows (summing to 100)
- 14 threshold rows (amber + red per input, with per-body override)
- 1 leave_exclusion_threshold_days
- Per-body counting rules (count_adjunct, adjunct_weight, visiting_weight)

---

## Feature 2: Multi-Scope Dashboard (14 questions)

| # | Decision | Locked value |
|---|----------|---|
| F2.1 | Institution card | Traffic-light: R/A/G count + composite avg + worst-program callout |
| F2.2 | Insufficient data UX | Full row with 'BLOCKED — N inputs missing' |
| F2.3 | Dashboard actions | ALL: export + snooze + link-to-recruit + force-refresh |
| F2.4 | Filter memory | URL + localStorage persistence |
| F2.5 | Drill navigation | Separate detail page `/admin/hr/recruitment-need/{institution_id}` |
| F2.6 | Principal view | Same layout + 'Escalate to Director' button |
| F2.7 | HR Officer view | Same as Principal (filtered, read-only) |
| F2.8 | Load performance | Progressive render (cards first, detail on drill) |
| F2.9 | Comparison mode | 'Compare' button → two-column side-by-side view |
| F2.10 | Mobile layout | Stacked cards, tap to drill |
| F2.11 | Escalation flow | Dedicated escalations table + queue on Director's dashboard |
| F2.12 | Snooze visibility | Transparent — all roles see snoozed badge |
| F2.13 | Change notification | In-app badge: 'N changes since last visit' |
| F2.14 | Empty state | Guided setup wizard for first-time data population |

**New tables from Feature 2:**
- `hr_recruitment_escalations` (Principal → Director escalation queue)
- `hr_recruitment_signal_snapshots` (for change-since-last-visit tracking)
- `hr_recruitment_user_visits` (last_visited_at per user per dashboard)

---

## Feature 3: Regulatory Norm + Peer Benchmark Admin (auto-specced)

**Based on Director's established pattern: maximum configurability + policy-table mandate.**

- Route: `/admin/hr/recruitment-need/norms`
- CRUD for regulatory_norms table: body × program_type × metric → threshold + SFR norm + counting rules
- 8 bodies seeded: AICTE, NMC, NCTE, PCI, INC, COA, BCI, UGC
- Per-body columns: sfr_norm, sanctioned_formula, count_adjunct (bool), adjunct_weight (decimal), visiting_weight (decimal)
- Peer benchmark section: manual entry form (institution_name + NAAC_grade + metrics)
- Version history on norm edits (audit trail per policy-table convention)
- PermissionGuard: super_admin + admin only

---

## Feature 4: Workload Data Capture (to be interviewed OR auto-specced)

**Known unknowns requiring Director input:**
- How does teaching-hours data enter? (Manual HR entry / timetable integration / faculty self-report)
- Granularity: per-week / per-semester / per-year
- Validation: who verifies the entered hours are accurate?
- Existing timetable module: does one exist in MyJKKN today?

**Auto-spec (if Director confirms):**
- Route: `/hr/workload` (HR Officer view) or `/admin/hr/workload` (admin)
- Table: `hr_faculty_workload` (faculty_id, institution_id, academic_year, semester, weekly_contact_hours, weekly_admin_hours, source: 'manual' | 'timetable_import')
- CRUD form: HR Officer enters hours per faculty per semester
- Import: bulk Excel upload with template (per existing import-export-advanced pattern)
- Policy row: `hr_recruitment.workload_norm_hours_ap = 16` (AICTE default for Assistant Professor)

---

## Feature 5: Reporting & Intelligence (auto-specced)

**Based on Director's choices: export + snapshot + YoY.**

### Export
- Format: PDF + Excel (per Director choice)
- Content: current signal state for selected scope (all institutions or filtered)
- Header: date-of-snapshot + Director's name + institution filter applied
- Route: inline button on dashboard → triggers server-side PDF/Excel generation → download

### Snapshot/Freeze
- Table: `hr_recruitment_signal_snapshots` (shared with Feature 2's change tracking)
- Director clicks 'Take snapshot' → engine computes + stores full signal state with timestamp
- Snapshots listed on a `/admin/hr/recruitment-need/snapshots` page
- Click a snapshot → read-only view of that point-in-time signal

### Year-over-Year Comparison
- Same dashboard layout but with a toggle: 'This AY | Compare with last AY'
- When 'Compare' is active, each input shows current value + last-year value + delta
- Requires either stored snapshots from last year OR derived from historical staff/admission data with date filters

---

## Policy Table Inventory (consolidated)

| # | Key | Type | Default | Editable By |
|---|-----|------|---------|-------------|
| 1 | hr_recruitment.weight_sanctioned_gap | threshold | 14.3 | Director |
| 2 | hr_recruitment.weight_sfr | threshold | 14.3 | Director |
| 3 | hr_recruitment.weight_specialization_gap | threshold | 14.3 | Director |
| 4 | hr_recruitment.weight_workload | threshold | 14.3 | Director |
| 5 | hr_recruitment.weight_projected_intake | threshold | 14.3 | Director |
| 6 | hr_recruitment.weight_attrition_pipeline | threshold | 14.3 | Director |
| 7 | hr_recruitment.weight_peer_benchmark | threshold | 14.3 | Director |
| 8 | hr_recruitment.leave_exclusion_threshold_days | threshold | 30 | Director |
| 9-22 | hr_recruitment.threshold_{amber|red}_{input} | threshold | varies | Director |
| 23+ | Per-body counting rules in regulatory_norms table | mapping | per body | Director |

---

## New Tables (consolidated)

| Table | Purpose |
|-------|---------|
| `hr_regulatory_norms` | Body × program_type → SFR norm + counting rules + thresholds |
| `hr_peer_benchmarks` | Manual-entry peer institution data |
| `hr_faculty_workload` | Per-faculty-per-semester teaching hours |
| `hr_staff_institution_allocation` | Cross-institution faculty allocation percentages |
| `hr_recruitment_signal_cache` | 1-hour materialized signal cache |
| `hr_recruitment_signal_suppressions` | Director's snooze records |
| `hr_recruitment_escalations` | Principal → Director escalation queue |
| `hr_recruitment_user_visits` | Last dashboard visit per user |
| `hr_recruitment_signal_snapshots` | Point-in-time frozen signals |

---

## Build Estimate

| Phase | PRs | Weeks |
|-------|-----|-------|
| DB substrate (tables + RLS + policy seeds) | 3-4 | 1 |
| Signal computation RPC + service | 2-3 | 1 |
| Dashboard UI (cards + drill + filters) | 4-5 | 2 |
| Norm admin UI | 2 | 0.5 |
| Workload data capture | 2-3 | 1 |
| Comparison mode + escalation queue | 2-3 | 1 |
| Export + Snapshot + YoY | 3-4 | 1 |
| Setup wizard + change tracking | 2-3 | 1 |
| Mobile responsive + polish | 1-2 | 0.5 |
| **Total** | **~22-28** | **~8-9 weeks** |

---

## Director Decision Pattern (meta-observation)

Across 28 questions, Director ALWAYS chose:
- Maximum configurability (policy-table rows over hardcoded values)
- Maximum visibility (transparent audit over hidden internals)
- Maximum strictness (block signal on missing data, not assume green)
- Separate detail pages over in-page expansion
- All actions available to Director (export + snooze + refresh + compare)
- Escalation capability for sub-roles (Principal → Director)

Consistent with memory `feedback_director_calibrates_tighter_than_recommended.md`.

---

## Silent Assumption Decisions (from /assumption-thrash)

### Preflight findings

| Finding | Resolution |
|---------|------------|
| staff table has NO employment_type column | ADD `employment_type text DEFAULT 'full_time'` to staff table |
| No `sanctioned_strength` anywhere in schema | NEW `institution_program_approvals` table (institution × program × body → counts) |
| No `specialization` on staff | NEW junction: `staff_specializations` → `hr_specializations` master (multi-specialization) |
| DOB not on profiles OR staff (Director's assumption was wrong) | ADD `date_of_birth date` to profiles table (shared across student + staff) |

### Round 1 — Structural (4 decisions)

| # | Category | Decision |
|---|----------|----------|
| AT.1 | Temporal model | Financial Year (Apr–Mar) — matches AICTE compliance + payroll |
| AT.2 | DOB gap | Add to profiles table (shared); backfill from ORION likely needed |
| AT.3 | Norm lineage | BOTH — show current-norm AND approval-time-norm side-by-side |
| AT.4 | Signal granularity | Configurable per institution (program OR department; Director picks) |

### Round 2 — Workflow edges (4 decisions)

| # | Category | Decision |
|---|----------|----------|
| AT.5 | Algorithm variance | Per-body algorithm PLUGINS — each body can have custom computation logic |
| AT.6 | Snooze cancellation | Director can un-snooze immediately; signal re-appears with full history |
| AT.7 | Input extensibility | PLUGIN-BASED — Director defines new inputs via admin UI (formula + weight) |
| AT.8 | Escalation lifecycle | Full: pending → acknowledged → resolved/dismissed + audit trail |

### Round 3 — Final (3 decisions)

| # | Category | Decision |
|---|----------|----------|
| AT.9 | Escalation attachments | Yes — Supabase Storage bucket + inline text reason |
| AT.10 | Body list CRUDability | CRUDable master table `hr_regulatory_bodies` (Director can add new bodies) |
| AT.11 | Build phasing | Build EVERYTHING at once — ~35-45 PRs, ~12-14 weeks. No phasing. |

### Schema implications (derived from assumption-thrash)

**ALTER TABLE (existing tables):**
- `staff` → ADD `employment_type text NOT NULL DEFAULT 'full_time'`
- `profiles` → ADD `date_of_birth date`

**NEW tables (beyond the 9 from /myjkkn-module):**
- `hr_regulatory_bodies` — CRUDable master: id, name, abbreviation, is_active, is_system
- `hr_specializations` — master list of faculty specializations
- `staff_specializations` — junction: staff_id × specialization_id (multi-specialization)
- `institution_program_approvals` — per-institution approval tracking: institution × program × body → sanctioned counts + approval dates
- `hr_recruitment_signal_inputs` — plugin registry: input_key, label, computation_function_ref, default_weight, is_active

**Storage bucket:**
- `hr-recruitment-escalation-docs` — for Principal escalation attachments

**REVISED total tables: 14** (9 original + 5 from assumption-thrash)
**REVISED total policy rows: ~40+** (35 from module interview + input plugin weights + per-body algorithm refs)

---

## REVISED Build Estimate

| Phase | PRs | Weeks |
|-------|-----|-------|
| DB substrate (14 tables + ALTERs + RLS + policy seeds) | 5-6 | 2 |
| Signal computation engine + plugin architecture | 4-5 | 2 |
| Per-body algorithm plugins (8 bodies) | 3-4 | 1.5 |
| Dashboard UI (cards + drill + filters + progressive render) | 5-6 | 2 |
| Comparison mode + escalation queue + lifecycle | 3-4 | 1.5 |
| Norm admin + body admin + specialization admin | 3 | 1 |
| Workload data capture + import | 2-3 | 1 |
| Export + Snapshot + YoY + change tracking | 3-4 | 1.5 |
| Setup wizard + plugin input admin UI | 2-3 | 1 |
| Mobile responsive + polish | 1-2 | 0.5 |
| **Total** | **~33-40** | **~14 weeks** |

---

## Director Decision Pattern (meta — from 53 questions)

Across ALL 53 questions, Director chose the maximum-configurability option 51/53 times (97%). The two non-maximum choices were:
1. FY (Apr–Mar) over configurable-per-institution year boundary (AT.1) — practical alignment
2. "Recommend only" over pre-fill (P1.3) — intentional separation of concerns

This pattern is now a strong prior for any future MyJKKN module design: **default to "configurable via admin UI" for every threshold, mapping, and value list.** Hardcoded values are the exception, not the rule.

---

## Build Progress (updated 2026-05-25)

| PR | Content | LOC | Status |
|---|---|---|---|
| #1069 | Foundation: 7 master tables + 2 ALTERs + 8 body seeds | 448 | **MERGED** 2026-05-25 |
| #1071 | Signal: 7 operational tables + 11 policies + bucket | 279 | Ready to merge (6/6 CI) |
| #1072 | RPC: orchestrator + 7 input plugins (2 live, 5 stub) | 461 | Ready to merge (CI pending) |
| — | TypeScript types + service layer | — | NEXT |
| — | React Query hooks | — | Planned |
| — | Dashboard UI (cards + drill + filters) | — | Planned |

**Deployed to prod:** 14 tables, 2 ALTER TABLEs, 8 SECURITY DEFINER RPCs, 1 custom type, 11 policy rows, 8 body seeds, 7 input seeds, 1 storage bucket.

---

## HR Feature Gap Audit (2026-05-25)

Director's 35-item HR feature checklist audited against MyJKKN codebase:

### Scorecard

| Category | Total | ✅ Built | ⚠️ Partial | ❌ Missing |
|---|---|---|---|---|
| Dashboards & Overviews | 10 | 6 | 4 | 0 |
| Recruitment & Hiring | 7 | 3 | 1 | 3 |
| Employee Records & Evaluations | 4 | 4 | 0 | 0 |
| Budgeting & Planning | 6 | 0 | 0 | **6** |
| Skills & Training | 4 | 1 | 2 | 1 |
| Trackers | 4 | 4 | 0 | 0 |
| **Total** | **35** | **18** | **7** | **10** |

### 5 real feature gaps identified

1. **HR Budget module** (annual / department / training budgets) — zero coverage
2. **Skills/Competency Matrix UI** — substrate exists (`staff_specializations` from PR #1069), needs visual matrix page
3. **Cost Per Hire Calculator** — can be a widget on the recruitment page
4. **1:1 Meeting Tracker** — simple CRUD with staff hierarchy
5. **Resource/Capacity Planning** — partially covered by Recruitment Need Signal

### Director decision: "why can't these be app features?" (2026-05-25)

Director challenged the classification of ~150 items as "downloadable templates." Decision locked:

> **All items that can benefit from live MyJKKN data should be interactive app features, not static templates.** A "Budget Template" connected to real payroll data is 10x more valuable than a blank Excel. Only genuinely static content (interview question lists, email templates, process guides) remains as file-download.

This reclassification expanded the scope from ~40 real features to ~60 Tier A features and ~80 Tier B features.

### 45-category feature list — high-level mapping

Director provided a comprehensive 45-category, 300+ item feature list. After deduplication and classification:

| Tier | Count | Description | Build scope |
|---|---|---|---|
| **A: Live features pulling MyJKKN data** | ~60 | Budget dashboards, skills matrices, timesheets, capacity planning, performance reports, meeting tools | ~45 PRs, ~3-4 months |
| **B: Project Management module** | ~80 (deduplicated to ~30-40) | Gantt charts, risk registers, RAID logs, WBS, sprint boards, resource matrices, stakeholder mapping, change management | ~80 PRs, ~6 months |
| **C: Genuinely static content** | ~40 | Interview question guides, email templates, process documents, checklists that don't need DB integration | ~2-3 PRs |

**Director intent for Tier B:** "All the above" — build PM module in MyJKKN + evaluate as JICATE product + gap mapping for board + Tier A first.

### Key Tier B categories (PM module, ~30-40 deduplicated features)

1. **Planning & Scheduling:** Gantt charts, project timelines, WBS, PERT/CPM
2. **Risk & Issue Management:** Risk registers, RAID logs, issue logs, change requests
3. **Resource Management:** Resource planning dashboards, capacity planning, utilization tracking
4. **Task & Team Management:** Task trackers, priority matrices, team capacity planners
5. **Budgeting & Cost:** Cost-benefit analysis, budget tracking, earned value management
6. **Meetings & Communication:** Meeting agendas, minutes (auto from Fireflies), stakeholder mapping
7. **Reporting & Analytics:** Status reports, heatmaps, sprint reports, performance dashboards
8. **Change Management:** Change control forms, ADKAR assessments, readiness assessments
9. **Project Closure:** Closure reports, PIR templates, lessons learned

Status: SPEC NOT STARTED. Requires own /myjkkn-module + /assumption-thrash cycle.

---

## Next Steps

1. **Continue Recruitment Need Signal build** (PR 4: TypeScript types + service layer)
2. After signal module ships: begin HR Intelligence remaining tabs (Tier A #2-#15)
3. PM Module spec cycle (/myjkkn-module + /assumption-thrash) — separate initiative

---

## Strategic Expansion (locked 2026-05-25)

Director decision: the Recruitment Need Signal is one tab of a larger **HR Intelligence super-module** (`/hr/intelligence`). The full module contains:

### Tier A — Live features pulling MyJKKN data (~15 features, ~45 PRs)

| # | Feature | Data source | Status |
|---|---------|-------------|--------|
| 1 | Recruitment Need Signal | All 7 inputs + 14 tables (just built) | DB substrate deployed (PR #1069 + #1071) |
| 2 | Budget-vs-Actuals Dashboard | Payroll (T4.3/T4.4) | NOT STARTED |
| 3 | Training Budget Tracker | Training module + payroll | NOT STARTED |
| 4 | Employee Competency Matrix | staff_specializations (PR #1069) | SUBSTRATE ONLY |
| 5 | Employee Skills Matrix | Same substrate | SUBSTRATE ONLY |
| 6 | Employee Timesheet | Attendance + hr_faculty_workload (PR #1071) | SUBSTRATE ONLY |
| 7 | Resource Utilization | hr_faculty_workload + hr_regulatory_norms | SUBSTRATE ONLY |
| 8 | Capacity Planning | Recruitment Need Signal + admission funnel | NOT STARTED |
| 9 | Leave Planner (enhanced) | /hr/leave/calendar (exists, needs enhancement) | PARTIAL |
| 10 | Cost Per Hire Calculator | Recruitment pipeline + cost columns needed | NOT STARTED |
| 11 | Performance Report (aggregated) | Performance review module (exists) | NOT STARTED |
| 12 | Meeting Minutes (auto) | Fireflies MCP integration | NOT STARTED |
| 13 | 1:1 Meeting Tracker | Staff hierarchy | NOT STARTED |
| 14 | Onboarding Checklist (interactive) | /hr/onboarding (exists, needs task tracking) | PARTIAL |
| 15 | Offboarding Checklist (interactive) | /admin/hr/offboarding (exists, needs FnF tracking) | PARTIAL |

### Tier B — Project Management module (~30-40 features, ~80 PRs)

Separate module at `/pm` or `/projects`. Includes: Gantt charts, risk registers, RAID logs, WBS, sprint boards, resource matrices, stakeholder mapping, change management workflows. Also evaluates as a JICATE Solutions product offering.

Status: SPEC NOT STARTED. Requires its own /myjkkn-module + /assumption-thrash cycle.

### Tier C — Template/Content library (~2 PRs)

Static downloadable content (interview question guides, email templates, process guides). Simple CRUD: `hr_templates` table + `/hr/templates` page with category filters + file download.

### Combined roadmap estimate

| Phase | Scope | PRs | Timeline |
|-------|-------|-----|----------|
| Phase 1 (current) | Recruitment Need Signal — computation engine + dashboard | ~33-40 | ~14 weeks |
| Phase 2 | HR Intelligence remaining tabs (Budget, Skills Matrix, Timesheet, etc.) | ~30-35 | ~10 weeks |
| Phase 3 | PM Module foundation (Gantt, Risk, RAID, WBS) | ~40-50 | ~16 weeks |
| Phase 4 | PM Module advanced (Sprint, Portfolio, Stakeholder, Change Mgmt) | ~30-40 | ~12 weeks |
| Phase 5 | Template library + remaining Tier C content | ~2-3 | ~1 week |
| **Total** | | **~135-170** | **~12-14 months** |
