---
title: [RETIRED 2026-04-17] — superseded by Unification Program
status: RETIRED — do not build from this spec
retired_reason: Production-code sweep (2026-04-17) revealed 10+ existing compliance artifacts scattered across Solutions Hub, Admission, Admin PDE, Campus Living, Startup Studio, Permissions Audit, B2A, Notifications, Work-Pulse. This spec was sized as a NEW build when the correct work is UNIFYING the existing fragmented implementations under /accreditation/*.
superseded_by: /Users/omm/PROJECTS/MyJKKN/specs/one-jkkn-one-data/unification-program/MASTER-PLAN.md
retired_by: Director (Omm) — 2026-04-17 after 5th rebuke on production-sweep failure
retained_artifacts: "22 thrash decisions (R1.1-R5.4) + 6 architectural decisions (AD1-AD6) — these REMAIN LOCKED and apply to PR-A6 (grievance completion) + PR-A7-A15 (body dashboards) in the Unification Program. Substrate design (quality_evidence_mappings polymorphic junction, accreditation_committees, accreditation_submissions) REMAINS VALID and lands in PR-A2."
---

# ⚠️ THIS SPEC IS RETIRED

This spec (v2.1) was retired 2026-04-17 after a production-code sweep revealed the Phase 1a work was scoped as greenfield when production already has 10+ compliance artifacts needing UNIFICATION, not new construction.

**Do not build from this file.** The replacement is:

- **Master plan:** `specs/one-jkkn-one-data/unification-program/MASTER-PLAN.md`
- **15 PRs sequenced:** PR-A1 through PR-A15
- **Body-agnostic mandate:** every retrofit must emit evidence for ALL 10 bodies (NAAC + NIRF + NBA + QS + DCI + PCI + INC + AICTE + NCTE + UGC), not NAAC-only

**What's preserved from v2.1 (still locked, still applies to the relevant Unification PRs):**
- 22 silent-assumption decisions (R1.1-R5.4) → apply to PR-A6 grievance module completion + per-body dashboards
- 6 architectural decisions (AD1-AD6) → substrate design, URL pattern, evidence junction schema → lands in PR-A2
- Multi-body metrics catalog seed (~215 rows) → PR-A2 seeds

**What's changed:**
- NOT a new "Compliance Kernel Foundation" module — it's a retrofit across 6+ existing modules
- NOT Sprints 1-5 of one-jkkn-one-data — it's woven throughout the 9-month program based on the critical rebuild path each PR depends on
- NOT a single PR — it's 15 PRs, each independently reviewable

---

<details>
<summary>Retired v2.1 content preserved below for reference</summary>

---
title: Compliance Kernel Foundation (NAAC primary + 9-body substrate) — Phase 1a / Sprints 1-5
version: 2.1
status: DECISIONS LOCKED — Ready for /myjkkn-api build
author: Director + Claude (assumption-thrash + multi-body refactor + one-jkkn-one-data merge)
date: 2026-04-16
parent_plans:
  grand_program: /Users/omm/PROJECTS/MyJKKN/specs/one-jkkn-one-data/MASTER-PLAN.md (9-month, 18-sprint, 4-phase program — AUTHORITATIVE)
  naac_subtrack: /Users/omm/PROJECTS/MyJKKN/specs/workshop-transformation-resurrection/MASTER-PLAN.md (8-phase NAAC-focused plan, integrates with grand program)
sprint_window: S1–S5 (Apr 20 – Jun 28, 2026) — parallel track alongside Tribal Knowledge (S1-S4) + MDM Learner Master (S3-S5)
context_library: /Users/omm/PROJECTS/MyJKKN/docs/one-jkkn-one-data.md (directive context — every rule in this file applies)
thrash_rounds: 5 (22 decisions) + 2 architectural reframes + 1 parent-plan merge (v2.1)
blocks_until: Director signoff on 6 gates (§7)
supersedes: v2.0 (standalone scope before one-jkkn-one-data merge)
---

# Compliance Kernel Foundation (Phase 1a)

## North Star (from docs/one-jkkn-one-data.md §1)

> **Every keystroke entered once. Every compliance format reproducible on click.**

MyJKKN's objective is NOT an ERP. It is a unified data substrate where operational modules are data collectors and compliance formats (10 regulatory bodies) are query templates. This Phase 1a builds the **Compliance Kernel foundation** — the body-agnostic substrate + NAAC-specific primary implementation that makes that vision real at submission time.

See `docs/one-jkkn-one-data.md` (context library) + `project_one_jkkn_one_data.md` + `project_jkkn_accreditation_surface.md` in MEMORY.

## 0. Executive Summary

**Position in the grand program:** Sprints 1-5 parallel track. Tribal Knowledge (S1-S4) captures rules; MDM Layer (S3-S5) builds Learner Master; **this spec** builds Compliance Kernel substrate + NAAC primary module. All three converge by Sprint 6-7 when MDM writes through to masters and compliance kernel reads through them.

**Why this runs parallel (not sequential after MDM):** Substrate tables have ZERO MDM dependency — evidence junction, committees, submissions, metrics catalog, digest config all use `institution_id` + `profiles(id)` FKs that exist today. Grievance federation uses `learners_profiles` FK which later migrates to `learner_master` in Sprint 5-7 (Path A rebuild).

**Deliverables:**

1. **Compliance Kernel substrate** (body-agnostic — serves all 10 compliance bodies)
2. **NAAC primary implementation** under `/accreditation/naac` (IQAC committees + federated grievance + DCF 2025 scaffold + 8.4 survey consent stub)
3. **`/accreditation/coverage` dashboard** (per docs/one-jkkn-one-data §8, 10) — weighted auto-fillable % across NAAC + NIRF + NBA + AICTE
4. **Multi-body metrics catalog seed** — `sh_accreditation_metrics` with NAAC (90) + NIRF (20) + NBA (10) + placeholders for DCI/PCI/INC/NCTE/AICTE/UGC/QS (~215 total rows)
5. **9 body placeholder dashboards** under `/accreditation/<body>` — architectural commitment
6. **Fan-out evidence triggers** — one operational event → multiple body tags per Rule 2 of context library
7. **IQAC-as-methodology framing** — Principal home = IQAC Chairman dashboard (aggregating all 10 bodies); HoD home = Department IQAC Coordinator view

**Delivered in Phase 1a:**

1. **Accreditation landing** — `/accreditation` with 10 body scoreboard cards (NAAC live, 9 placeholders)
2. **NAAC primary implementation** — `/accreditation/naac` (what earlier spec called `/iqac`), college switcher, IQAC committee CRUD, federated grievance, DCF 2025 export, 8.4 survey export, DPDPA consent
3. **Body-agnostic substrate tables** — `quality_evidence_mappings`, `accreditation_committees`, `accreditation_committee_members`, `accreditation_survey_consents`, `accreditation_submissions`, `accreditation_digest_config`
4. **Multi-body metrics catalog seed** — `sh_accreditation_metrics` seeded with NAAC (90 rows) + NIRF (20) + NBA (10) + placeholders for DCI/PCI/INC/NCTE/AICTE/UGC/QS
5. **Fan-out evidence triggers** — one operational event → multiple body's metric_code tags automatically
6. **IQAC-as-methodology scaffolding** — Principal home = IQAC Chairman dashboard; HoD home = Department IQAC Coordinator dashboard; naming preserved for NAAC vernacular familiarity

**URL pattern locked (Next.js route groups `app/(routes)/accreditation/*`):**
- `/accreditation` → landing (10 body scoreboard cards)
- `/accreditation/coverage` → **weighted coverage dashboard** (per docs/one-jkkn-one-data §8, 10) — per-format auto-fillable % + trend line + drill-down to blocking indicators. This is the North-Star measurement UI.
- `/accreditation/naac` → IQAC dashboard (primary NAAC implementation)
- `/accreditation/naac/grievance` → federated grievance (NAAC Metric 7.7)
- `/accreditation/naac/committees` → IQAC committee CRUD
- `/accreditation/naac/dcf-export` → DCF 2025 / AQAR export
- `/accreditation/naac/surveys` → 8.4 survey + DPDPA consent stub (full impl Sprint 7 post-Learner-Master)
- `/accreditation/nirf|nba|qs|dci|pci|inc|ncte|aicte|ugc` → placeholder dashboards with "Phase 4 Compliance Kernel implementation — Sprint 13-17" banners
- `/iqac` → 301 redirect to `/accreditation/naac` (familiar entry preserved)

**MDM migration path (documented per docs/one-jkkn-one-data Rule 5):**
- Phase 1a FKs reference current tables (`learners_profiles`, `profiles`) because Learner Master / Staff Master land in Sprint 4-7
- When MDM masters deploy: trigger-based migration swaps FKs from `learners_profiles.id` → `learner_master.id` via `learner_identity_events` log (Path A rebuild)
- Zero data loss — dual-write for 2 weeks per one-jkkn-one-data §5 Sprint 5 safety net

## 1. Preflight Findings (carried from v1.0 + updated for multi-body)

| # | Finding | Resolution (v2.0) |
|---|---------|-------------------|
| F1 | Master Plan said 2 Auto + 4 Aff = 6 colleges. **Live DB: 5 Auto + 3 Aff = 8 colleges.** institution_type enum = `autonomous\|aided\|self` | Master Plan v0.6 (§8 delta). NAAC Auto = `autonomous`; NAAC Aff = `aided + self` |
| F2 | `sh_accreditation_metrics` already body-agnostic (metric_type col = body_code) | Seed with NAAC + 9 other bodies in Phase 1a |
| F3 | `hostel_maintenance_requests.linked_grievance_id` pre-built | Populate via escalate trigger |
| F4 | NAAC tagging pattern exists on `ip_filings` + `sh_publications` | Generalize — evidence junction tags ANY body, not just NAAC |
| F5 | `health_consents` (6 cols) too minimal for accreditation survey consent | Build body-agnostic `accreditation_survey_consents` with `body_codes text[]` + purpose JSONB |
| F6 *(NEW v2.0)* | 10-body compliance surface: NAAC, NIRF, NBA, QS, DCI, PCI, INC, AICTE, NCTE, UGC — ~80% evidence overlap between NAAC and NIRF alone | Substrate names must NOT hardcode "naac_" — use `quality_*` / `accreditation_*` |
| F7 *(NEW v2.0)* | IQAC = continuous improvement METHODOLOGY, not a cell. Principal = IQAC Chairman; HoDs = Department IQAC Coordinators | Principal home dashboard aggregates ALL 10 bodies' scorecards; each HoD home = their department's IQAC view |

## 2. Scope

### 2a. Architectural Decisions (expanded to 6, v2.0)

| # | Decision | Rationale |
|---|----------|-----------|
| AD1 | Master Plan v0.6 — 8 colleges (5+3) locked | Mis-scoring irrecoverable post-SSR |
| AD2 | Seed existing `sh_accreditation_metrics` for ALL 10 bodies | Reuse; `metric_type` col = body_code; catalog already multi-body by design |
| AD3 | **Rename** `naac_evidence_mappings` → `quality_evidence_mappings` with `body_code` col | One substrate feeds all 10 bodies. Fan-out tagging on every event |
| AD4 | **Rename** `naac_survey_consents` → `accreditation_survey_consents` with `body_codes text[]` | DPDPA purpose-specific consent supports multiple bodies per consent record |
| AD5 *(NEW)* | URL root `/accreditation/<body>` — `/iqac` redirects to `/accreditation/naac` | IQAC = NAAC implementation of continuous improvement. Not URL root. |
| AD6 *(NEW)* | New table `accreditation_submissions` tracks each submission event per body per college per period | "One-click compliance output" North Star — audit trail of every NAAC/NIRF/NBA/etc. submission |

### 2b. Silent Assumption Decisions (22 from thrash rounds — unchanged from v1.0)

All 22 decisions from Rounds 1-5 (business-day SLA, junction committee, hybrid lineage, schema-native anonymous, auto-escalate, supersede withdrawal, emergency fast-track, limited proxy, link-don't-copy federation, mandatory SH/ragging attachments, configurable notification_preferences, satisfaction auto-reopen, role-scoped privacy + is_icc_only, all 4 artifacts, hybrid college switcher, full DPDPA scope, both PDFs, hierarchical categories, JKKN-CODE-GR-YYYY-NNNNN ticket format, auto-tag with manual override) remain LOCKED and apply to the NAAC implementation under `/accreditation/naac`.

## 3. Schema — Consolidated

### 3.1 NEW Tables (7 — body-agnostic)

```sql
-- 1. Accreditation committees (generic, body-coded)
CREATE TABLE accreditation_committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  body_code text NOT NULL,  -- 'NAAC' | 'NIRF' | 'NBA' | 'QS' | 'DCI' | 'PCI' | 'INC' | 'AICTE' | 'NCTE' | 'UGC'
  committee_name text NOT NULL,
  committee_type text NOT NULL,  -- 'main' | 'icc' | 'anti_ragging' | 'grievance' | 'coordinator' | 'inspection'
  chair_user_id uuid REFERENCES profiles(id),
  formed_at date NOT NULL,
  term_end date,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_accred_committees_body ON accreditation_committees(body_code, institution_id);

-- 2. Accreditation committee members (junction)
CREATE TABLE accreditation_committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES accreditation_committees(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id),
  role text NOT NULL,
  joined_at date NOT NULL,
  term_end date,
  is_active boolean DEFAULT true,
  is_external boolean DEFAULT false,
  external_name text,
  external_org text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (committee_id, user_id, joined_at)
);

-- 3. Quality evidence mappings (polymorphic junction — THE substrate)
CREATE TABLE quality_evidence_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  body_code text NOT NULL,  -- One of the 10
  metric_code text NOT NULL,  -- FK to sh_accreditation_metrics.metric_code (when body_code matches)
  period_label text,  -- '2026-27' for annual submissions
  mapped_by uuid REFERENCES profiles(id),
  mapped_at timestamptz DEFAULT now(),
  is_auto boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  UNIQUE (source_table, source_id, body_code, metric_code)
);
CREATE INDEX idx_qem_source ON quality_evidence_mappings(source_table, source_id);
CREATE INDEX idx_qem_body_metric ON quality_evidence_mappings(body_code, metric_code, institution_id);
CREATE INDEX idx_qem_body_institution_period ON quality_evidence_mappings(body_code, institution_id, period_label);

-- 4. Accreditation survey consents (DPDPA-compliant, body-aware)
CREATE TABLE accreditation_survey_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  learner_id uuid REFERENCES learners_profiles(id),
  alumni_email text,
  consent_version text NOT NULL DEFAULT '1.0',
  body_codes text[] NOT NULL,  -- which bodies this consent applies to: ['NAAC','NIRF','NBA']
  purpose text NOT NULL DEFAULT 'Accreditation + ranking submissions (NAAC, NIRF, NBA, etc.)',
  legal_basis text NOT NULL DEFAULT 'DPDPA 2023 §4(1)(a) — specific purpose consent',
  scope jsonb NOT NULL,  -- {"pii": true, "academic": true, "alumni_outcomes": true, "parent_contact": true}
  consented_at timestamptz DEFAULT now(),
  withdrawn_at timestamptz,
  ip_address inet,
  user_agent text,
  export_event_ids uuid[] DEFAULT '{}',
  CHECK (user_id IS NOT NULL OR learner_id IS NOT NULL OR alumni_email IS NOT NULL),
  CHECK (array_length(body_codes, 1) >= 1)
);

-- 5. Accreditation submissions (audit log of every "one-click compliance output")
CREATE TABLE accreditation_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  body_code text NOT NULL,
  submission_type text NOT NULL,  -- 'NAAC_SSR_2027' | 'NIRF_annual' | 'NBA_SAR' | 'DCI_inspection' | ...
  period_label text NOT NULL,  -- '2026-27'
  due_date date,
  submitted_at timestamptz,
  submitted_by uuid REFERENCES profiles(id),
  export_url text,  -- Storage URL of the exported file
  export_format text,  -- 'DCF_2025_XLSX' | 'NIRF_CSV' | 'NBA_PDF' | ...
  status text NOT NULL DEFAULT 'draft',  -- 'draft' | 'submitted' | 'accepted' | 'revision_requested' | 'rejected'
  metadata jsonb DEFAULT '{}',  -- evidence row count, metric coverage %, etc.
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_submissions_due ON accreditation_submissions(due_date, body_code) WHERE status != 'accepted';
CREATE INDEX idx_submissions_institution_body ON accreditation_submissions(institution_id, body_code, period_label);

-- 6. Notification preferences (module-agnostic — unchanged from v1.0)
CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  module text NOT NULL,
  event_type text NOT NULL,
  channels jsonb NOT NULL DEFAULT '{"in_app": true, "email": true, "sms": false, "whatsapp": false}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, module, event_type)
);

-- 7. Accreditation digest config (per user, per body)
CREATE TABLE accreditation_digest_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  body_code text NOT NULL,
  is_enabled boolean DEFAULT true,
  email text NOT NULL,
  last_sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, institution_id, body_code)
);
```

### 3.2 ALTER Existing (4 tables — unchanged intent, body-aware wording)

```sql
-- institutions: short code for ticket IDs + NAAC/NIRF routing
ALTER TABLE institutions ADD COLUMN iqac_code char(4);
-- Seed: DENT, PHAR, ALHD, NURS, ENGG, ASAI, ASSF, EDUC

-- profiles: accreditation switcher default
ALTER TABLE profiles ADD COLUMN accreditation_default_college_id uuid REFERENCES institutions(id);
-- (was iqac_default_college_id — renamed for body-agnostic intent)

-- grievance_categories: NAAC tagging + emergency flag
ALTER TABLE grievance_categories
  ADD COLUMN default_naac_metric_code text REFERENCES sh_accreditation_metrics(metric_code),
  ADD COLUMN attachment_required boolean DEFAULT false,
  ADD COLUMN is_emergency boolean DEFAULT false;
-- Note: default_naac_metric_code stays named for NAAC since grievance IS NAAC-specific (7.7)

-- grievance_tickets: full 12-col expansion (unchanged from v1.0)
ALTER TABLE grievance_tickets
  ALTER COLUMN raised_by_name DROP NOT NULL,
  ADD COLUMN is_anonymous boolean DEFAULT false,
  ADD COLUMN anonymous_token text UNIQUE,
  ADD COLUMN filed_by uuid REFERENCES profiles(id),
  ADD COLUMN is_emergency boolean DEFAULT false,
  ADD COLUMN is_icc_only boolean DEFAULT false,
  ADD COLUMN escalation_level integer DEFAULT 0,
  ADD COLUMN sla_breached_at timestamptz,
  ADD COLUMN withdrawn_at timestamptz,
  ADD COLUMN withdrawn_reason text,
  ADD COLUMN acknowledgment_pdf_url text,
  ADD COLUMN resolution_letter_pdf_url text,
  ADD CONSTRAINT anonymous_requires_token CHECK (
    (is_anonymous = false) OR (is_anonymous = true AND anonymous_token IS NOT NULL)
  );
```

### 3.3 Seeds (expanded for multi-body)

| Seed | Count | Body |
|------|------:|------|
| Grievance hierarchical categories (5 parent + ~10 JKKN-std sub) | 15 | NAAC (Metric 7.7) |
| NAAC metrics (Binary + MBGL 10-Attribute) | ~90 | NAAC |
| NIRF metrics (TLR/RPC/GO/OI/PR params + sub-indicators) | ~20 | NIRF |
| NBA metrics (Tier 1/2, 10 criteria) | ~10 | NBA |
| QS indicators (6 — academic rep, employer rep, faculty/student, citations, int'l faculty, int'l students) | 6 | QS |
| DCI metrics (faculty roster, patient load, curriculum) | ~15 | DCI |
| PCI metrics (same shape, different rubric) | ~15 | PCI |
| INC metrics | ~15 | INC |
| NCTE metrics | ~15 | NCTE |
| AICTE EoA items | ~20 | AICTE |
| UGC compliance checklist | ~10 | UGC |
| Accreditation committees (8 colleges × NAAC as primary — IQAC) | 8 | NAAC |

### 3.4 Functions / Triggers (unchanged count, body-aware semantics)

1. `calculate_business_day_deadline(start_ts, days int, institution_id uuid) → timestamptz`
2. `generate_grievance_ticket_number(institution_id uuid, year int) → text` returns `JKKN-{CODE}-GR-{YYYY}-{NNNNN}`
3. `auto_populate_quality_evidence()` — **fan-out trigger** on relevant INSERTs, tags MULTIPLE body metrics at once per event
4. `enforce_grievance_proxy_rls()` — validates filed_by has proxy role
5. `enforce_grievance_withdrawn_lock()` — prevents UPDATE on withdrawn rows
6. `grievance_auto_reopen_on_low_satisfaction()` — trigger on satisfaction_rating UPDATE
7. `check_sla_breach()` — pg_cron 15-min, scans open tickets → flip sla_status + escalate + notify

### 3.5 Storage Buckets (2 — unchanged)

- `grievance-evidence` (private, 25MB/file, max 5/ticket, RLS-gated)
- `grievance-artifacts` (private, system-generated PDFs)

### 3.6 RLS Policies

Standard pattern on every new table. For body-coded tables, also scope by `body_code` against a new permission: `accreditation.{body_code}.{action}`.

Example:
```sql
CREATE POLICY "accreditation_committees_select" ON accreditation_committees
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('accreditation.' || LOWER(body_code) || '.committees.view')
      AND role_has_institution_access(institution_id))
);
```

DCI coordinator gets `accreditation.dci.*` permissions scoped to Dental college. PCI coordinator gets `accreditation.pci.*` scoped to Pharmacy. Prevents cross-body visibility.

## 4. Route Structure (body-agnostic)

### Pages

```
/accreditation                         → landing: 10 body scoreboard cards
  /accreditation/naac                  → IQAC dashboard (primary implementation)
    /accreditation/naac/committees
    /accreditation/naac/committees/[id]
    /accreditation/naac/grievance      → federated grievance
    /accreditation/naac/grievance/new
    /accreditation/naac/grievance/[id]
    /accreditation/naac/surveys/consent → DPDPA consent
    /accreditation/naac/surveys/8.4-export
    /accreditation/naac/dcf-export
  /accreditation/nirf                  → placeholder (5 params with "Phase 2+ priority" banner)
  /accreditation/nba                   → placeholder
  /accreditation/qs                    → placeholder
  /accreditation/dci                   → placeholder (Dental-only)
  /accreditation/pci                   → placeholder (Pharmacy-only)
  /accreditation/inc                   → placeholder (Nursing-only)
  /accreditation/ncte                  → placeholder (Education-only)
  /accreditation/aicte                 → placeholder (Engineering + Pharmacy)
  /accreditation/ugc                   → placeholder

/iqac → 301 redirect to /accreditation/naac
/iqac/* → 301 redirect to /accreditation/naac/*
```

### API Endpoints (all `withAuth`)

```
# Generic substrate
GET    /api/accreditation/bodies                 → 10-body scoreboard data
GET    /api/accreditation/submissions            → upcoming + past submissions across bodies
POST   /api/accreditation/submissions/:id/export → generate file for body-specific format

GET    /api/accreditation/:body/committees
POST   /api/accreditation/:body/committees
GET    /api/accreditation/:body/committees/:id
PATCH  /api/accreditation/:body/committees/:id
POST   /api/accreditation/:body/committees/:id/members
DELETE /api/accreditation/:body/committees/:id/members/:memberId

# NAAC-specific (Phase 1a full impl)
GET    /api/accreditation/naac/grievance/categories
POST   /api/accreditation/naac/grievance/categories/:id/recompute-slas
GET    /api/accreditation/naac/grievance/tickets
POST   /api/accreditation/naac/grievance/tickets
GET    /api/accreditation/naac/grievance/tickets/:id
PATCH  /api/accreditation/naac/grievance/tickets/:id
POST   /api/accreditation/naac/grievance/tickets/:id/withdraw
POST   /api/accreditation/naac/grievance/tickets/:id/escalate
POST   /api/accreditation/naac/grievance/tickets/:id/resolve
POST   /api/accreditation/naac/grievance/tickets/:id/satisfaction
POST   /api/accreditation/naac/grievance/tickets/:id/escalate-to-iqac

POST   /api/accreditation/surveys/consent        → body-coded DPDPA consent
GET    /api/accreditation/naac/surveys/8.4/export → learner + alumni CSV

POST   /api/accreditation/naac/dcf-export        → DCF 2025 XLSX (super-admin)

POST   /api/accreditation/notifications/preferences
```

## 5. Components (expanded for multi-body)

1. `<CollegeSwitcher />` — URL > localStorage > profile fallback, 8 colleges + Cluster
2. `<BodyScoreboardCard />` — one per body, shows: metric coverage %, next submission deadline, current score, "quick export" button
3. `<GrievanceForm />` — NAAC-specific, supports proxy + anonymous + emergency auto-flag
4. `<SLACountdown />` — business-day aware
5. `<PrivacyScopedTicketView />` — role-aware; respects is_icc_only
6. `<DPDPAConsentForm />` — 4 scope checkboxes + body-codes multi-select (which bodies this consent applies to)
7. `<QualityMetricBadge />` — shows `body_code`/`metric_code`/point_weight; reused across every module's dashboard
8. `<PrincipalIQACDashboard />` — Principal home aggregating all 10 body scorecards
9. `<HoDCoordinatorDashboard />` — HoD home with department IQAC view (PO/CO, faculty PhD, dept grievance, dept NIRF params)

## 6. Acceptance Criteria

Phase 1a ships when all true for each of the 8 colleges:

- [ ] `/accreditation` landing renders with 10 scoreboard cards (NAAC primary, 9 placeholders)
- [ ] `/iqac` 301 redirects to `/accreditation/naac`
- [ ] College switcher honors URL > localStorage > profile precedence
- [ ] IQAC committee (NAAC body) CRUD works end-to-end
- [ ] Grievance flow (proxy, anonymous with token, emergency auto-flag) works
- [ ] Business-day SLA calculator reads `institution_leaves` and skips correctly
- [ ] SLA breach cron escalates + notifies
- [ ] Withdrawal preserves row, locks edits
- [ ] Satisfaction ≤2 auto-reopens
- [ ] Privacy matrix respected (accused sees minimal, is_icc_only honored)
- [ ] Acknowledgment + Resolution PDFs auto-generated + stored
- [ ] Weekly digest fires Monday 8am IST to opted-in IQAC chairs
- [ ] NAAC 8.4 CSV export respects body-coded DPDPA consent
- [ ] DCF 2025 placeholder XLSX generates for super admin
- [ ] `quality_evidence_mappings` fan-out works: one publication → 4 evidence rows (NAAC 9.1 + NIRF RPC + NBA PO + QS Citations)
- [ ] Hostel_incident escalate-to-IQAC creates linked grievance_ticket + populates `hostel_maintenance_requests.linked_grievance_id`
- [ ] `sh_accreditation_metrics` seeded with all 10 bodies (NAAC full, others placeholder)
- [ ] `accreditation_submissions` has 8 upcoming NAAC SSR 2027 placeholder rows (one per college)

## 7. Director Gates (block PR merge; not work start)

| Gate | What's blocked | Owner |
|------|---------------|-------|
| G1 | IQAC chair + committee composition approved per college (×8) | Director |
| G2 | 5 UGC grievance parent categories + ~10 JKKN sub-categories approved | Director + Chief IQAC Coordinator |
| G3 | 4 NPS/survey templates approved (student, faculty, staff, parent) | Director + CO draft |
| G4 | DPDPA 2023 consent text legally reviewed (body_codes + 4 data scopes) | Legal + Director |
| G5 | Phase 6 Parent Portal owner named | Director |
| G6 *(NEW)* | Confirm NIRF + NBA + DCI/PCI/INC/NCTE/AICTE coordinators per college (for body placeholder seeding) | Director |

## 8. Master Plan v0.6 Delta (required update)

Replace in MASTER-PLAN.md:

1. **North Star added** — "One JKKN, One Data" as the top-level organizing principle
2. **8 JKKN colleges** (not 6): 5 Autonomous + 3 Affiliated
3. **10-body compliance surface** — NAAC is one of ten consumers, not the framework
4. **IQAC-as-methodology** — pervasive continuous-improvement discipline, not a URL container
5. **URL root `/accreditation/<body>`** — `/iqac` preserved as redirect
6. **Evidence substrate `quality_evidence_mappings`** — body-agnostic junction
7. **Phase sequencing unchanged** — Phase 1a remains NAAC-primary + multi-body substrate + 9 placeholders; Phase 2+ extends implementation to NIRF, NBA, etc.
8. **Total cluster pts remains NAAC-specific** — 7,200 pts (900 × 8 colleges); NIRF/NBA/QS add separate scoring dimensions in their phases

## 9. Risk Register Additions (v2.0 delta)

| ID | Risk | Severity | Mitigation |
|----|------|---------|-----------|
| R24 | Fan-out evidence emission double-tags (same event → duplicate rows for same body/metric) | Medium | UNIQUE constraint on (source_table, source_id, body_code, metric_code); upsert pattern |
| R25 | Multi-body rubric drift — NAAC 9.1 and NIRF RPC look similar but scoring differs | High | `calculation_method` col on metrics; computed at read-time per body, not write-time |
| R26 | Phase 2+ bodies (NIRF, NBA) need their own SLA/workflow semantics (different from grievance) | Medium | Placeholders in Phase 1a explicitly state "no write operations yet"; schema stubs deferred |
| R27 | DPDPA consent drift — adding new body to user's consent requires re-consent (not automatic) | High | `body_codes text[]` captures consent scope; adding a body triggers UI prompt + new consent row |
| R28 | Committee overlap — same user on NAAC IQAC + NIRF committee + NBA coord; UI must show all their hats | Low | Principal/HoD dashboards aggregate committees query grouped by body_code |

## 10. Integration with One JKKN One Data Grand Program

**This spec (Phase 1a / Compliance Kernel Foundation) maps to one-jkkn-one-data sprint plan:**

| One-JKKN Sprint | Dates | My Phase 1a Work | MDM/Tribal Dependency |
|-----------------|-------|------------------|------------------------|
| S1 (Apr 20–May 3) | parallel | `sh_accreditation_metrics` seed (10 bodies, ~215 rows) + `/accreditation/coverage` scaffold | None |
| S2 (May 4–May 17) | parallel | `quality_evidence_mappings` table + `accreditation_committees` + `accreditation_committee_members` + RLS | None |
| S3 (May 18–May 31) | parallel | IQAC committees per college (8 colleges × NAAC committee) + Principal/HoD dashboards | None |
| S4 (Jun 1–Jun 14) | parallel | `accreditation_submissions` + grievance federation + SLA engine + 8 NAAC SSR 2027 placeholder rows | Learner Master lands end-S4 — grievance FKs migrate here |
| S5 (Jun 15–Jun 28) | parallel | DCF 2025 export scaffold + `/accreditation/coverage` live with baseline + `accreditation_survey_consents` table | Learner Master in production |

**Heavy NAAC format mapping (AQAR 2024-25 50%→80% coverage) shifts to S13-S15 per one-jkkn-one-data §5 Phase 4**, AFTER MDM masters + 4 critical rebuild paths are complete. Phase 1a sets the table; Phase 4 Compliance Kernel feeds it.

**Success metric contribution:** Phase 1a adds ~5% to Month-9 75% weighted-coverage target. Substrate makes the heavy mapping tractable in Sprint 13-15.

## 11. Handoff

**Status:** DECISIONS LOCKED. Zero silent assumptions remaining. Substrate body-agnostic. Merged with one-jkkn-one-data grand program.

**What's in Phase 1a (v2.1):**
- 7 new tables (body-agnostic naming)
- 4 ALTER migrations
- 7 functions/triggers with fan-out evidence emission
- 2 Storage buckets
- 12 pages (1 landing + 1 coverage dashboard + 10 body pages, NAAC full + 9 placeholders)
- ~25 API endpoints
- 10 shared components (incl. `<CoverageDashboard />`)
- 10-body metrics catalog seeded (~215 rows)
- IQAC-as-methodology Principal/HoD dashboards
- Next.js route-group structure `app/(routes)/accreditation/*`
- MDM migration path documented (FKs → learner_master at Sprint 5-7)

**What's NOT in Phase 1a (deferred per integration plan):**
- NIRF/NBA/QS/DCI/PCI/INC/NCTE/AICTE/UGC full implementation (Sprints 13-17 Compliance Kernel Phase)
- Full NAAC AQAR 50%→80% coverage (Sprints 13-15 — depends on MDM masters)
- 4 critical rebuild paths (Sprints 6-14, separate workstream)
- Tribal knowledge interviews (Sprints 1-4, separate workstream — but grievance SLA + notification rules should consume their JSON outputs when ready)
- Parent Portal Phase 6 implementation (pre-consent captured here)

**Related Files (per docs/one-jkkn-one-data §9):**
- `specs/one-jkkn-one-data/MASTER-PLAN.md` (grand program — 9 months, 18 sprints)
- `specs/workshop-transformation-resurrection/MASTER-PLAN.md` (NAAC-track sub-plan, v0.4 → v0.6 delta owed)
- `docs/one-jkkn-one-data.md` (context library — directive rules)
- `lib/accreditation/formats/<body>-<cycle>.json` (format schemas — NAAC AQAR 2024-25 Phase 1a seed)
- `lib/accreditation/mappings/<body>/*.sql` (body-specific query mappings — populated in Sprint 13-17)
- `jkknkb/MyJKKN/Tribal Knowledge/*.md` (interview outputs — Sprint 1-4)

**Next command:**
```
/myjkkn-api from spec PHASE-1A-SPEC.md v2.1 — build Compliance Kernel foundation (Sprints 1-5)
```

## Version History

| Version | Date | Author | Delta |
|---------|------|--------|-------|
| 1.0 | 2026-04-16 | Director + Claude | Initial from assumption-thrash — 22 decisions; NAAC-only naming |
| 2.0 | 2026-04-16 | Director + Claude | Multi-body refactor; body-agnostic substrate; IQAC-as-methodology; `/accreditation/<body>` URL |
| 2.1 | 2026-04-16 | Director + Claude | Merged with docs/one-jkkn-one-data.md + specs/one-jkkn-one-data/MASTER-PLAN.md. Adopted "Compliance Kernel" vocabulary. Added /accreditation/coverage dashboard. Positioned as Sprints 1-5 parallel track. FK migration path to learner_master documented. |
| **RETIRED** | **2026-04-17** | **Director (Omm)** | **Retired after 5th production-sweep failure in same session. Replaced by Unification Program (15 PRs, retrofits existing artifacts). 22 thrash decisions + 6 architectural decisions preserved + apply to relevant unification PRs.** |

</details>
