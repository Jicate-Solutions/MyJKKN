# MyJKKN — CDC (Career Development Centre) Module Spec

**Date locked:** 2026-05-18
**Source signal:** Google Chat space `spaces/AAAA01oZdOo` ("JKKN Placements, Trainings & Corporate Relations Discussions") — 87 members, 26 months active, ~283 messages analyzed.
**Audit doc:** `docs/audits/cdc-module-audit-2026-05-17.html`
**Director sign-off on assumption-thrash:** 27 decisions across 5 rounds + 1 config-pattern reconciliation round.

---

## Module purpose (one sentence)

Replace the Google Chat / Sheets / Forms / Drive workflow currently used by CDC (campus drives, willingness collection, attendance, selections, internships, IDP, clubs, training programmes) with native MyJKKN infrastructure that is admin-configurable via `platform_policies` and CRUDable master tables — so all future tweaks are UI clicks, not deploys.

---

## v1 scope (locked Round 0.3)

- **In scope:** Corporate campus drives + recruiters + placements + internships (corporate) + IDP + clubs + mentor pairings + structured training programmes (Unnati / MRB / Springboard).
- **Out of scope for v1, deferred:** School outreach workshops (govt school career guidance) → master table created empty so phase-2 ships without schema migration.
- **Industry mentors** (existing dormant table) → wired up for industry-immersion + guest-lecture tracking.

---

## Silent Assumption Decisions (from /assumption-thrash)

### Round 0 — Overlap resolution (post Layer-2 sweep)

| # | Question | Decision | Schema impact |
|---|----------|----------|---------------|
| 0.1 | Existing `internship_*` family (15 tables, fully built for clinical/teaching/pharmacy practice across all 8 institutions). CDC's corporate internships overlap by audience but not by fields (`hospital_code`, `ambulance_number`, `preceptor` irrelevant). | **Extend** `internship_*` with `internship_type` enum (`clinical_posting` / `teaching_practice` / `pharmacy_practice` / `corporate_internship`). Hospital-specific cols become nullable. | ALTER `internship_external_sites` ADD `internship_type` enum; ALTER `internship_assignments` ADD `internship_type` enum; relax NOT NULL on `hospital_code`, `ambulance_number`, `nearest_emergency_ward`. CHECK constraint: `hospital_code` must be NULL when `internship_type='corporate_internship'`. |
| 0.2 | `alumni_outcomes` (0 rows, 61 cols including company/designation/salary) — placement-shaped already. CDC tracks placements pre-graduation. | **Build `cdc_placements`** owning the pre-graduation workflow. Trigger auto-bridges into `alumni_outcomes` at graduation. | New table `cdc_placements`. Trigger on `learner_profiles.status='passed_out'` → INSERT alumni_outcomes(outcome_type='employed'). |
| 0.3 | Module scope | **In:** drives + placements + IDP + clubs + mentorship + training. **Out v1:** school workshops. **Wire up:** industry_mentors. | Master tables for workshop_types + training_types created empty; industry_mentors gets admin UI. |
| 0.4 | industry_mentors (28 cols, 0 rows) | **Wire up** for CDC industry-immersion + guest-lecture tracking. | Build admin UI; link from `cdc_drives.industry_mentor_id` (nullable, for immersion-type drives). |

### Round 1 — Structural

| # | Question | Decision | Schema impact |
|---|----------|----------|---------------|
| 1.1 | CDC operational ownership | **Central CDC HQ** — one team, all 8 institutions. Coordinators per-institution have read+write within their scope. | Custom roles: `cdc_head` (global), `cdc_coordinator` (per-institution, scoped by `staff.institution_id`). RLS: cdc_head sees all; cdc_coordinator scoped. |
| 1.2 | Recruiter scope | **Platform-global recruiters** — one record per company, used across institutions. | `cdc_recruiters` has NO `institution_id`. `cdc_drives.institutions[]` array tracks participants. |
| 1.3 | Eligibility model | **Rich structured rules** — program_ids[], min_cgpa, min_semester, max_arrears, allowed_genders[], program_year, passed_out_allowed. | `cdc_drive_eligibility` table with 8 first-class columns. Defaults pulled from `platform_policies` (`cdc.default_min_cgpa`, etc.). |
| 1.4 | Eligibility lineage | **Snapshot at willingness time** — `eligibility_snapshot jsonb` column on willingness row. | `cdc_drive_willingness.eligibility_snapshot jsonb NOT NULL`. Captured at INSERT. |

### Round 2 — Workflow & lifecycle

| # | Question | Decision | Schema impact |
|---|----------|----------|---------------|
| 2.1 | Withdrawal model | **3 statuses + audit** — willing / confirmed / withdrawn / no_show. | `cdc_drive_willingness.status` enum. Transition log in `cdc_willingness_audit` jsonb column. |
| 2.2 | Selection batches | **Rounds + offer batches** — `cdc_drives.rounds_count`, `cdc_placements.round_no` + `batch_no`. | 2 extra columns on placements; handles Phase-1/Phase-2 announcement pattern. |
| 2.3 | Multi-offer policy | **Multiple offers allowed**, learner picks accepted. `cdc_placements.status`: offered/accepted/declined/rescinded. | Application-layer cascade: on accept, prompt to decline other offered rows. Policy `cdc.allow_multiple_active_offers` (major, Director-toggleable). |
| 2.4 | Drive lifecycle | **7-state machine**: draft → announced → willingness_open → eligibility_locked → attendance_day → results_announced → closed, plus `cancelled` side-state. | `cdc_drives.status` enum (protocol — stays as DB enum per skill rule 15). Transition table `cdc_drive_state_transitions` (transitioned_by, transitioned_at, reason). |

### Round 3 — Operational edges

| # | Question | Decision | Schema impact |
|---|----------|----------|---------------|
| 3.1 | Proxy willingness | **Both paths** — learner self-declares OR coordinator submits with `declared_by_user_id`. Confirmation prompt sent to learner when proxy-declared; silent-accept after 24hr. | `cdc_drive_willingness.declared_by_user_id` separate from `learner_id`. `confirmation_required_by_at` timestamp. |
| 3.2 | Walk-in / emergency | **drive_type='walk_in'** + skip-state flag. State machine branches: announced → results_announced → closed. | `cdc_drives.drive_type_id` FK to `cdc_drive_types` master. State-skip flag inferred from drive_type. |
| 3.3 | Approval escalation | **Auto-escalate after N hours to CDC head; per-drive configurable. Default 48hr from `platform_policies`.** | `cdc_drives.coordinator_approval_deadline_hours` (nullable; pulls from `platform_policies.cdc.coordinator_willingness_approval_deadline_hours` default 48). pg_cron escalation job (reuses HR Sprint 3 pattern). |
| 3.4 | Attachments policy | **Tiered, all Supabase Storage** — mandatory at key states; CDC head override allowed with reason. | Supabase Storage bucket `cdc-docs` (per-drive folder). Mandatory list driven by `platform_policies.cdc.required_attachments_by_state` jsonb. |

### Round 3.5 — Config-pattern reconciliation (post Director directive)

| # | Question | Decision | Schema impact |
|---|----------|----------|---------------|
| 3.5.1 | Master table scope | **Build all 5 CRUDable master tables now** (drive_types, industry_sectors, offer_types, workshop_types, training_types). Workshop + training empty for v1; ready for phase-2. | 5 new tables, each ~7 cols: id, code, label, description, sort_order, is_system, is_active, created_at, updated_at. RLS: cdc_head + Director can edit. |
| 3.5.2 | Policy edit scope | **Two-tier classification** — `major` = Director-only; `operational` = CDC Head + Director. | `platform_policies.classification` already exists. Seed CDC rows with appropriate classification (see §Policy rows below). |
| 3.5.3 | Admin UI location | **`/admin/cdc/policies` dedicated page** — Director's view: English consequences + visual cascade. | New page at `app/(routes)/admin/cdc/policies/page.tsx`. Lists all `policy_key LIKE 'cdc.%'` rows, grouped by category. Each row: name + English consequence + value editor + last-changed-by/at. |

### Round 4 — Visibility, artifacts, channels, IDP

| # | Question | Decision | Schema impact |
|---|----------|----------|---------------|
| 4.1 | Placement privacy | **Tiered** — learner sees own + salary; peers see name+company only; CDC/Director see all. | RLS policies: 4 layers. View `cdc_placements_public` drops salary/equity cols for peer reads. |
| 4.2 | IDP ownership | **Native page replaces Google Form**; one-shot migration of 297 existing responses. | New table `cdc_idp_responses`. Migration script reads forms.gle/EdKQz6R7DPqXBUSY9 via Forms MCP one-time, INSERTs into table, then form deprecated. |
| 4.3 | Notification channels | **v1: in-app + email**. WhatsApp + SMS deferred to phase 2. | Use existing `/notifications` module + SMTP. Touchpoints: drive state transitions, willingness deadline, placement offered, coordinator overdue. |
| 4.4 | Statutory exports | **Built-in `/cdc/analytics/exports`** with NAAC + AICTE + flex-generator. Column mappings stored as `platform_policies` jsonb rows. | New page + RPC `fn_cdc_export_naac_5_2_1(academic_year)`, `fn_cdc_export_aicte_annual(year)`. Mappings: `platform_policies.cdc.naac_export_column_mapping` (jsonb). |

### Round 5 — Final loose ends

| # | Question | Decision | Schema impact |
|---|----------|----------|---------------|
| 5.1 | Internship duration counting | **Per-recruiter configurable, default working days** (skip weekends + institution_off_days). | `cdc_internships.skip_weekends bool DEFAULT (from policy)`, `skip_holidays bool DEFAULT (from policy)`. Per-recruiter override on `cdc_recruiters.operates_weekends` boolean. Reuses existing `institution_off_days` table. |
| 5.2 | Bridge trigger timing | **On `learner_profiles.status` transition to `passed_out`** — existing workflow detects. | Trigger on `learner_profiles` UPDATE: when NEW.status='passed_out' AND OLD.status != 'passed_out', scan `cdc_placements` WHERE learner_id=NEW.id AND status='accepted', INSERT into `alumni_outcomes` with outcome_type='employed' + copy company/designation/salary fields. |
| 5.3 | Internal recruiter (JICATE Solutions) | **Same `cdc_recruiters` table + `is_internal` bool + `internal_jkkn_org_id` FK**. NAAC includes internal; AICTE may exclude (configurable via policy). | `cdc_recruiters.is_internal boolean DEFAULT false`, `internal_jkkn_org_id uuid REFERENCES organizations(id) NULL`. Export RPC honors `platform_policies.cdc.aicte_include_internal_placements` (bool). |
| 5.4 | Placement snapshots | **Build `cdc_placement_snapshots`** with quarterly auto-snapshots. | New table mirrors `cdc_placements` columns + `snapshot_at timestamptz`, `snapshot_period text` (e.g., '2025-Q3'). pg_cron job quarterly. |

---

## Schema implications — consolidated

### New tables (Phase 1 substrate)

1. `cdc_recruiters` — company catalog (name, sector_id, contact, website, is_internal, internal_jkkn_org_id, operates_weekends)
2. `cdc_drives` — drive header (recruiter_id, institutions[], drive_type_id, status enum, rounds_count, coordinator_approval_deadline_hours, venue_id FK to resource_reservations, industry_mentor_id NULL)
3. `cdc_drive_state_transitions` — state change audit
4. `cdc_drive_eligibility` — per-drive rule rows (program_ids[], min_cgpa, min_semester, max_arrears, allowed_genders[], program_year, passed_out_allowed)
5. `cdc_drive_willingness` — learner intent (learner_id, drive_id, status enum, eligibility_snapshot jsonb, declared_by_user_id, confirmation_required_by_at, willingness_audit jsonb)
6. `cdc_drive_attendance` — per-round attendance (learner_id, drive_id, round_no, attended bool, attended_at)
7. `cdc_placements` — offer records (learner_id, drive_id, recruiter_id, offer_type_id, status enum, round_no, batch_no, package_lpa, role, location, offer_letter_url, offered_at, accepted_at, declined_at)
8. `cdc_placement_snapshots` — quarterly frozen state
9. `cdc_idp_responses` — first-year fresher development plan (learner_id, interests jsonb, aspirations jsonb, club_picks[], 3yr_plan jsonb, submitted_at)
10. `cdc_clubs` — club catalog (name, coordinator_staff_id, club_type, description)
11. `cdc_club_memberships` — learner ↔ club (learner_id, club_id, role enum: member/lead, joined_at)
12. `cdc_mentor_pairings` — senior-fresher (mentor_learner_id, mentee_learner_id, status, paired_at)
13. `cdc_training_programmes` — Unnati / MRB / Springboard (name, training_type_id, total_hours, start_date, end_date, institution_id NULL for cross-college, status)
14. `cdc_training_enrollments` — learner ↔ training programme (learner_id, programme_id, attendance_pct, completion_status)
15. `cdc_external_opportunities` — Director-published bulletin (title, source, deadline, eligibility_text, apply_url, posted_by, posted_at)

### CRUDable master tables (5)

16. `cdc_drive_types` — seed: on_campus, off_campus, walk_in, industry_immersion, virtual
17. `cdc_industry_sectors` — seed: IT services, IT product, Manufacturing, Healthcare, FMCG, BFSI, EdTech, Consulting, Government, Other
18. `cdc_offer_types` — seed: full_time, internship, ppo (pre-placement offer), intern_with_offer
19. `cdc_workshop_types` — **empty for v1** (school outreach phase 2)
20. `cdc_training_types` — **empty for v1** (seed in phase 2 when Unnati/MRB/Springboard built)

### Extended existing tables

- `internship_external_sites` — ADD `internship_type` enum; relax NOT NULL on hospital cols
- `internship_assignments` — ADD `internship_type` enum
- `industry_mentors` — wire up admin UI (`/admin/cdc/industry-mentors`)
- `learner_profiles` — add `passed_out_trigger` on status change

### `platform_policies` rows (seed at migration time)

| policy_key | data_type | default | classification | scope |
|------------|-----------|---------|----------------|-------|
| `cdc.coordinator_willingness_approval_deadline_hours` | int | 48 | operational | platform |
| `cdc.default_willingness_window_hours` | int | 168 | operational | platform |
| `cdc.default_min_cgpa` | numeric | 6.5 | operational | platform |
| `cdc.default_max_arrears` | int | 0 | operational | platform |
| `cdc.default_internship_skip_weekends` | bool | true | operational | platform |
| `cdc.allow_multiple_active_offers` | bool | true | major | platform |
| `cdc.parent_consent_required_under_age` | int | 18 | major | platform |
| `cdc.min_attendance_pct_for_internship_certificate` | numeric | 75 | major | platform |
| `cdc.required_attachments_by_state` | jsonb | `{"announced": ["campus_circular_url"], "results_announced": ["selection_list_url"]}` | operational | platform |
| `cdc.naac_export_column_mapping` | jsonb | (seed with current NAAC 5.2.1 mapping) | operational | platform |
| `cdc.aicte_export_column_mapping` | jsonb | (seed with current AICTE annual mapping) | operational | platform |
| `cdc.aicte_include_internal_placements` | bool | false | major | platform |
| `cdc.quarterly_snapshot_enabled` | bool | true | operational | platform |

### Triggers

- `trg_cdc_passed_out_bridge` — on `learner_profiles.status` change to `passed_out` → INSERT into `alumni_outcomes` from accepted `cdc_placements`
- `trg_cdc_drive_state_transition_audit` — on `cdc_drives.status` UPDATE → INSERT into `cdc_drive_state_transitions`
- `trg_cdc_willingness_audit` — on `cdc_drive_willingness.status` UPDATE → append to `willingness_audit jsonb`

### pg_cron jobs

- `cdc_coordinator_overdue_escalation` — hourly, scans `cdc_drives` where coordinator approval pending past deadline, notifies `cdc_head`
- `cdc_quarterly_placement_snapshot` — 1st of Apr/Jul/Oct/Jan, INSERT INTO `cdc_placement_snapshots` SELECT * FROM `cdc_placements`

### Storage

- Bucket: `cdc-docs` (per-drive folder structure: `cdc-docs/drives/{drive_id}/{filename}`)
- Mandatory uploads: campus circular (on announce), selection list (on results_announced), offer letter (per placement.status=offered), parent consent (when learner age < policy threshold AND internship)

### Custom roles

- `cdc_head` — platform-global, can edit major + operational policies; full CRUD on all CDC tables
- `cdc_coordinator` — institution-scoped, can manage drives where own institution is in `cdc_drives.institutions[]`; can edit operational policies only

### Admin UI surfaces

- `/admin/cdc/policies` — Director's view, all CDC platform_policies grouped by category, English consequences
- `/admin/cdc/drive-types` — CRUD master
- `/admin/cdc/industry-sectors` — CRUD master
- `/admin/cdc/offer-types` — CRUD master
- `/admin/cdc/workshop-types` — CRUD master (empty for v1)
- `/admin/cdc/training-types` — CRUD master (empty for v1)
- `/admin/cdc/industry-mentors` — CRUD for guest-lecturers / immersion experts

### Cross-module touchpoints

| From CDC | To existing module | How |
|---|---|---|
| Drive venue | `/resource-management` | FK `cdc_drives.venue_id` → `resource_reservations` |
| Drive notifications | `/notifications` | `notification_recipient_policies` keyed by drive_state_transition |
| Placement record | `/learners/profiles` | Placement card on profile page |
| Passed-out bridge | `/learners/alumni` | Trigger writes to `alumni_outcomes` |
| Email CC chain | SMTP | Reuses `smtp_configuration` table |

---

## Phase sequencing (revised after assumption-thrash)

| Sprint | Deliverable | Spawn-pattern |
|---|---|---|
| **1** | Phase-1 substrate (15 new tables + 5 master tables + 13 platform_policies seed rows + 2 internship extensions) | Single agent (DDL is atomic) |
| **2** | Drive operations UI + RLS + 7-state machine + escalation cron | Parallel agents: (a) UI pages, (b) services, (c) RLS + cron |
| **3** | Placements + multi-offer cascade + bridge trigger + cdc_placement_snapshots | Single agent (tightly coupled to drives) |
| **4** | Internship extensions + corporate internship type + certificate workflow | Single agent |
| **5** | IDP migration (Google Form → native) + clubs + mentor pairings | Parallel agents: (a) IDP, (b) clubs+mentors |
| **6** | Training programmes (Unnati/MRB/Springboard) + external opportunities bulletin | Single agent |
| **7** | Director's-view admin pages + NAAC/AICTE exports + flex-generator + industry mentors UI | Parallel agents: (a) `/admin/cdc/*`, (b) exports, (c) industry mentors |

---

## What was NOT decided (deferred to spawn-time)

- Exact RLS policy SQL (will be derived by /myjkkn-api from access model decisions)
- Exact UI widgets per page (frontend-design skill will own)
- Exact notification template copy (will be drafted at notification touchpoint build-time)
- Migration script details for 297 IDP Google Form responses (Forms MCP query + INSERT pattern)
- NAAC 5.2.1 + AICTE annual exact column lists (will be confirmed against current accreditation forms when /admin/cdc/policies seeds the mapping jsonb)

---

## Layer-2 sweep proof (per skill preflight requirement)

Verified live DB on 2026-05-17 via Supabase Management API. No `cdc_*` tables exist. Adjacent infrastructure found and resolved:

| Found | Audience | Resolution |
|---|---|---|
| `alumni_outcomes` (61 cols, 0 rows) | Graduated learners | Bridge from cdc_placements (Round 0.2) |
| `internship_*` family (15 tables) | Learners — clinical/teaching practice | Extend with `internship_type` enum (Round 0.1) |
| `industry_mentors` (28 cols, 0 rows) | Industry experts | Wire up (Round 0.4) |
| `sh_*` family (Solution Hub) | Solution builders | Different domain, false positive |
| `hr_recruitment_*` | Employees | Different audience |
| `hr_training_*` | Staff training | Different audience |
| `platform_policies` (17 cols, RPCs available) | Platform-wide config | **THE pattern** — seed CDC keys here (Round 3.5) |
| 44 existing `*_config`/`*_types`/`*_settings` tables | Various | **THE pattern** — build CDC master tables in same style |

---

## Ready for spawn

Spec is complete. `/myjkkn-api` can read this file and begin Sprint 1 substrate work. Recommended spawn pattern for Sprint 1: **single sequential agent** (substrate DDL is atomic; parallelism kicks in from Sprint 2).
