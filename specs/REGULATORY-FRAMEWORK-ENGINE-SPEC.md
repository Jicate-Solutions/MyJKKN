# Regulatory Framework Engine — Complete Specification

> **Status:** Ready for Implementation — B2A Architecture Compliant (Pattern A: Page → Hook → API Route → Service → DB)
> **Created:** 2026-02-23  |  **Updated:** 2026-02-24 (8 rounds of multi-agent review, 139 total findings resolved. Round 8: DDL column fixes, SECURITY DEFINER hardening, NAAC grade boundary correction, missing DDL columns added — Schema DDL: iqac_coordinator role, NIRF unique index, FK cascade chain, optimistic locking, CHECK constraints, submission transitions audit table, cancelled/dvv_revision status; Regulatory: NAAC MBGL two-stage process, pass thresholds, NBA GAPC v4 11 POs, 3-year validity, IIQA/DVV/department workflows, multi-year aggregation; Security: framework version pinning, SECURITY DEFINER functions, formula engine limits, table allowlist, CTE-safe SQL validation; Performance: async report generation, JWT custom claims for RLS, N+1 prevention, dashboard materialization, score caching, concurrency control; Clarity: score calculation algorithms, formula variable resolution, academic year conversion, implementer guide with all 20 LOW findings)
> **Based On:** FST Gap Analysis (SARAL ERP vs MyJKKN), Future-Proof Regulatory Architecture FST, Module Health Audit (8 review rounds, 301 bugs fixed)
> **Total Effort Estimate:** 8-10 weeks
> **Priority:** P0 (Critical — regulatory compliance)
> **Architecture:** Pattern A mandatory — 67 API endpoints across 13 entity groups, 18 tables + 2 views, 58 RLS policies. Zero direct Supabase calls in hooks.

---

## Executive Summary

MyJKKN has 39 modules and 300+ tables but **zero automated regulatory reporting**. NAAC, NIRF, NBA, AICTE, and UGC submissions are done manually via spreadsheets. This module builds a **config-driven Regulatory Framework Engine** that:

1. Defines ANY accreditation/ranking body's criteria as database configuration (not code)
2. Auto-pulls data from 15 existing MyJKKN module tables via **36 reusable Data Connectors** (DC-01 through DC-36; 15 existing + 21 new)
3. Generates submission-ready reports in required formats (PDF for NAAC SSR/AQAR, pre-filled data sheets for NIRF DCS portal entry, HTML for AICTE disclosure)
4. Survives regulatory changes without code rewrites — admin reconfigures, not developer

**Pre-configured Frameworks (20 total):**
- NAAC 2022 Revised (7 criteria, 56 metrics)
- NAAC Binary 2024 × 3 institution types (10 attributes, 60 metrics each) — with pass thresholds: University 540/900, Autonomous 450/900, Affiliated 360/900
- NAAC MBGL 2024 × 3 institution types (post-Binary maturity grading, 5 levels: Basic → Global Excellence)
- NIRF 2025 Overall + 6 discipline variants (Engineering, Pharmacy Cat A/B, Colleges, Dental, Medical/Nursing)
- NBA SAR (Engineering + Pharmacy programs, 10 criteria, PO1-PO11 per GAPC v4)
- AICTE Mandatory Disclosure (9 categories, compliance checklist)
- UGC-AISHE (9 data sections, export-only)

**NAAC Two-Stage Process:** Under the 2024 reforms, NAAC accreditation is a two-stage process — (1) Binary threshold pass/fail, then (2) MBGL maturity grading for institutions that pass. Accreditation validity is 3 years (not 5 years as under the legacy system). The engine models each stage as a separate framework variant, with MBGL submissions requiring a prerequisite Binary submission in 'accepted' status.

**Key Architectural Decision:** ONE engine, MANY frameworks. All 20 pre-configured frameworks (1 NAAC Old + 3 NAAC Binary + 3 NAAC MBGL + 7 NIRF + 2 NBA + 1 AICTE + 1 AISHE + 1 NAAC IIQA + 1 NAAC AQAR) are database configurations, not separate modules. When rules change, change the config — not the code. The NAAC Binary Framework (2024) has institution-type-specific scoring — handled by creating 3 framework variants (University, Autonomous, Affiliated), each summing to 900 points but with different weight distributions. NIRF discipline rankings share the same 5 parameters but with different weights and sub-parameter selections — the engine handles this via per-framework metric configuration.

---

## Territory Analysis

### T1: True Goal

**Problem:** JKKN institutions are autonomous colleges requiring:
- NAAC accreditation (SSR + AQAR every year)
- NIRF ranking submission (annual, impacts brand perception)
- NBA accreditation for engineering/pharmacy programs
- AICTE mandatory disclosures (annual)
- UGC-AISHE data submission (annual)

Currently: **ALL done manually** — staff spends 3-6 months collecting data from scattered systems, entering into Excel, formatting reports. Data accuracy is uncertain, audit trails are absent, and every regulatory change means starting over.

**Why This Matters:**
- NAAC grade directly impacts funding, affiliation, and student trust
- NIRF rank affects student enrollment decisions (parents check rankings)
- NBA accreditation required for engineering programs
- Non-compliance risks: loss of affiliation, government penalties
- Manual process is error-prone and consumes thousands of staff-hours annually

**Success Vision (6 months):**
- NAAC AQAR generated from system data in < 1 week (vs 3 months today)
- NIRF submission auto-populated with live score simulation
- Every metric traceable to source records (DVV-ready audit trail — DVV: Data Validation & Verification, NAAC's post-submission verification process)
- New regulatory body added in days (admin config), not months (developer build)

---

### T2: Who & When

| Role | Count | Usage Frequency | Primary Need |
|------|-------|-----------------|--------------|
| IQAC Coordinator | 1-2 per institution | Weekly during submission, monthly otherwise | Framework config, metric review, report generation |
| Principal / Director | 6-8 | Monthly review, peak during submissions | Dashboard, score simulation, gap analysis |
| Chairman / VC | 1-2 | Quarterly review | Cross-institution comparison, ranking trends |
| Department HODs | ~30 | During data collection periods | Department-wise metric entry, evidence upload |
| Data Entry Staff | ~10 | During submission periods | Manual metric entry for data not in system |
| Super Admin | 1-2 | On regulatory changes | Framework definition updates, connector config |

**Usage Triggers:**
- **Annual:** NIRF submission (typically Jan-Mar), NAAC AQAR (end of academic year)
- **Cyclical:** NAAC SSR (every 3 years under Binary+MBGL system; legacy 5-year cycle for institutions still under old grading), NBA SAR (every 3 years per program)
- **Ongoing:** Metric monitoring, score simulation, evidence collection
- **Ad-hoc:** When new regulatory body/version announced

---

### T3: Current State

**Existing Infrastructure (What Works):**
- ✅ `learners_profiles` — 60+ columns including gender, category, community, state, accommodation, annual_income (feeds NIRF OI, NAAC diversity)
- ✅ `staff` — role_type, designation, department_id, facilitator_certification, outcome_metrics (feeds NIRF TLR, NAAC faculty)
- ✅ `alumni_outcomes` — 60+ columns: outcome_type, salary_range, company_name, is_relevant_to_program, skills_used (feeds NIRF GO, NAAC placement)
- ✅ `sh_publications` — Already has `nirf_category`, `naac_criterion`, `scopus_indexed`, `wos_indexed`, `ugc_listed`, impact_factor, citation_count (feeds NIRF RP)
- ✅ `student_attendance` — attendance tracking (feeds NAAC teaching-learning)
- ✅ `admission_leads` + `admissions` — enrollment pipeline (feeds NAAC/NIRF student intake)
- ✅ `billing_receipts` + `billing_student_bills` — fee collection (feeds financial metrics)
- ✅ `industry_partners` + `industry_mentors` + `industry_projects` — MOU/collaboration data (feeds NAAC Criterion III)
- ✅ `facilitator_development` — FDP tracking, workshops, industry_exposure_hours (feeds NAAC faculty development)
- ✅ `competency_catalog` + `course_competency_mapping` — OBE foundation (feeds NBA CO-PO)
- ✅ `grievance_tickets` — student welfare tracking (feeds NAAC Criterion V)
- ✅ `hostel_allocations` + `hostel_incidents` + `anti_ragging_affidavits` — campus safety (feeds NAAC Criterion V)
- ✅ `okr_objectives` + `okr_key_results` — institutional quality targets (feeds IQAC internal metrics)
- ✅ `nps_surveys` + `nps_responses` — stakeholder feedback (feeds NAAC Criterion V)
- ✅ `vac_courses` + `vac_enrollments` — value-added courses (feeds NAAC Criterion II)
- ✅ `sh_solutions` + `sh_training_programs` — consultancy & extension (feeds NAAC Criterion III)
- ✅ `lc_elections` + `lc_events` + `lc_od_requests` — student governance (feeds NAAC Criterion V)
- ✅ Multi-tenant architecture (9 institutions) with RLS

**What's Missing:**
- ❌ No framework definition tables (criteria, weights, metrics configuration)
- ❌ No data connector layer (SQL queries that aggregate existing data into metric values)
- ❌ No metric value storage with audit trail and versioning
- ❌ No submission tracking workflow (draft → data_collection → in_review → approved → submitted → accepted, with returned/cancelled/dvv_revision states)
- ❌ No evidence attachment system (DVV requires documents per metric)
- ❌ No report template engine (PDF/Excel generation per body)
- ❌ No score simulation / gap analysis dashboard
- ❌ No historical comparison (year-over-year trend tracking)

**Current Workarounds:**
- Excel templates filled manually by department coordinators
- Data copied from MyJKKN screens via screenshots
- Email chains for data collection across departments
- Final reports assembled in Word/PDF manually
- No audit trail — if NAAC DVV challenges a number, staff scrambles to reconstruct source

---

### T4: Happy Path

**Flow 1: IQAC Coordinator generates NAAC AQAR**
1. Navigate to Regulatory → Frameworks → NAAC AQAR 2025-26
2. Dashboard shows: 33/56 metrics auto-populated, 23 need manual entry (22 qualitative + 1 external survey)
3. Click "Auto-Refresh" — system pulls latest data from all connected modules
4. Review auto-calculated values, drill down to source records
5. Enter 7 manual metrics (e.g., patents filed — no source table yet)
6. Upload evidence documents for DVV-critical metrics
7. Click "Generate Report" → system produces AQAR in required PDF format
8. Submit for Principal review → Principal approves → Mark as submitted
9. Download portal-compatible export for online submission

**Flow 2: Chairman reviews NIRF ranking simulation**
1. Navigate to Regulatory → NIRF → Score Simulator
2. See current estimated score across 5 parameters (TLR, RP, GO, OI, Perception)
3. Drill into TLR → see student-faculty ratio, faculty qualifications, financial resources
4. Toggle "What-if" mode → increase PhD faculty by 5 → see rank impact
5. Compare against last 3 years → see trend line
6. Compare against top-ranked peer institutions
7. Export executive summary for board meeting

**Flow 3: Admin configures for new regulatory body**
1. Navigate to Regulatory → Frameworks → + New Framework
2. Enter: name "ARIIA 2027", body "AICTE", version "2027"
3. Add criteria tree: Innovation, Entrepreneurship, IPR, Start-ups, etc.
4. For each metric, map to data source: existing connector OR manual entry
5. Set weights per criteria
6. Save → framework immediately available for data collection
7. No developer involvement required

#### IIQA (Institutional Information for Quality Assessment) — NAAC Prerequisite

IIQA is the FIRST step in NAAC accreditation. It must be submitted and ACCEPTED by NAAC before SSR preparation begins. The system models IIQA as:

1. A separate submission type (framework variant `NAAC_IIQA`) with its own metrics
2. A gatekeeper in the workflow: SSR submission cannot be created until IIQA is accepted
3. The `prerequisite_submission_id` field on `regulatory_submissions` enforces this dependency

**IIQA Data Points (27 items):**
- Basic institutional information (name, address, establishment year)
- Programs offered with intake capacity
- Faculty count by designation
- Student enrollment for past 5 years
- Financial data summary
- Accreditation history

> **Schema addition (see Database Schema section):** Add `prerequisite_submission_id uuid REFERENCES regulatory_submissions(id)` to `regulatory_submissions`. The API must validate that prerequisite submissions are in 'accepted' status before allowing dependent submission creation.

#### DVV (Data Verification and Validation) — Post-Submission Process

DVV is NAAC's post-submission verification process. It is a multi-round exchange:
1. NAAC DVV team reviews submitted QnM metrics
2. Sends specific queries about data discrepancies
3. Institution responds with clarifications and additional evidence
4. May go through 2-3 rounds of queries

The engine models DVV as:
- A `dvv_revision` state in the submission workflow (between `submitted` and `accepted`)
- Auto-refresh is BLOCKED during DVV revision to preserve submitted values
- Only DVV-queried metrics can be edited in this state
- Evidence versioning captures 'dvv_response' as the change_type

> **Schema addition (see Database Schema section):**
> - New table: `regulatory_dvv_queries` (id uuid PK, submission_id uuid REFERENCES regulatory_submissions(id), metric_id uuid REFERENCES regulatory_metrics(id), query_round integer NOT NULL DEFAULT 1, naac_query_text text NOT NULL, institution_response text, response_evidence_ids uuid[], status text NOT NULL CHECK(status IN ('open','responded','resolved','escalated')), queried_at timestamptz DEFAULT now(), responded_at timestamptz)
> - New submission status: `dvv_revision` added between `submitted` and `accepted` in the status CHECK constraint and state machine

#### Department-Level Data Collection Workflow

Data collection for NAAC/NIRF is coordinated across 15-30 departments. The IQAC coordinator assigns metrics to department HODs with deadlines:

1. IQAC coordinator creates a submission → status: `data_collection`
2. IQAC assigns metrics to departments (bulk assignment with due dates)
3. HODs see "My Assigned Metrics" on their dashboard
4. HODs enter values and upload evidence for their metrics
5. IQAC reviews completed metrics → approves or sends back
6. Once all metrics are approved → submission moves to `in_review`

> **Schema addition (see Database Schema section):** New table: `regulatory_metric_assignments` (id uuid PK, metric_value_id uuid REFERENCES regulatory_metric_values(id), assigned_to uuid REFERENCES auth.users(id), assigned_to_department text, assigned_by uuid REFERENCES auth.users(id), assigned_at timestamptz DEFAULT now(), due_date date, status text NOT NULL CHECK(status IN ('pending','in_progress','submitted','approved','rejected')), reviewer_notes text)

---

### T5: Sad Path

| Scenario | Handling |
|---|---|
| Auto-calculated metric returns unexpected value | Show source drill-down (list of records), highlight anomalies, allow manual override with reason |
| Data source table is empty (e.g., no alumni data) | Show metric as "No Data" with clear explanation, allow manual entry with evidence |
| Framework definition has error (wrong weight total) | Validate on save: weights must sum to 100% per level, show warning before save |
| Report generation fails mid-way | Save progress, allow resume, show which sections completed |
| Two users editing same submission | Optimistic locking — last save wins with conflict notification |
| Regulatory body changes mid-submission | Version pinning — submission locked to framework version it started with |

---

### T6: Recovery

- **Undo metric override:** Keep history of all metric values (auto + manual). Revert to any previous value.
- **Restore deleted evidence:** Soft-delete with 30-day recovery window.
- **Revert framework version:** Old versions archived, never deleted. Can switch submission to previous version.
- **Regenerate report:** Reports are generated on-demand, not stored as source-of-truth. Regenerate anytime with latest data.

---

### T7: Edge Cases

- **Multi-institution submission:** JKKN has 9 institutions. Some frameworks (NIRF) need per-institution submission. Support institution_id scoping.
- **Consolidated submission:** Some frameworks need group-level data (all institutions combined). Support aggregation mode.
- **Partial data availability:** First year of use may have incomplete data. Allow mixed auto+manual with clear provenance marking.
- **Metric formula references another metric:** Support cross-metric formulas (e.g., "placement_rate = placed_count / eligible_count" where both are metrics).
- **Same data, different definitions:** "Placement" means different things to NIRF vs NAAC. Each framework defines its own metric independently, even if pulling from same source table.
- **Academic year vs calendar year:** NIRF uses calendar year, NAAC uses academic year. Framework config must specify which year system to use.

---

### T8: Who Can Do What

| Action | super_admin | institution_admin | iqac_coordinator | principal | hod | staff |
|--------|:-----------:|:------------------:|:----------------:|:---------:|:---:|:-----:|
| Create/edit framework definitions | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create/edit criteria & metrics | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Map data connectors | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View metric values | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Enter manual metric values | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Override auto-calculated values | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Upload evidence documents | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Run score simulation | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Generate reports | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve submission | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| View dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| View cross-institution comparison | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage peer benchmarks | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage governing bodies/meetings | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage course syllabi | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Coordinate peer team visits | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create IQAC action plans (→ OKR) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Search evidence repository | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

### T9: What They See

**Main Navigation:** Sidebar → "Regulatory Compliance" (new top-level module)

```
Regulatory Compliance/
├── Dashboard              — Score overview, upcoming deadlines, data completeness
├── Frameworks/            — Framework list (NAAC, NIRF, NBA, AICTE, UGC...)
│   ├── [Framework]/       — Criteria tree with metric values
│   │   ├── Overview       — Score summary, completeness %, last updated
│   │   ├── Criteria       — Hierarchical criteria tree with drill-down
│   │   ├── Metrics        — Flat metric list with auto/manual status
│   │   ├── Evidence       — Document uploads per metric/criteria
│   │   ├── Simulation     — What-if score calculator
│   │   └── Report         — Generate & download submission report
│   └── + New Framework    — Config wizard for new framework
├── Submissions/           — Submission history with status tracking
├── Governance/            — Governing bodies, meetings, syllabi, peer visits
│   ├── Bodies             — IQAC, BoS, Academic Council composition
│   ├── Meetings           — Minutes, resolutions, action items
│   ├── Course Syllabi     — Syllabus completion, CO-PO mapping
│   └── Peer Visits        — NAAC/NBA visit coordination
├── Benchmarks/            — Peer institution comparison (manual data)
├── Evidence Repository/   — Full-text search across all evidence documents
└── Data Sources/          — Data connector health check & status
```

**Dashboard Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  REGULATORY COMPLIANCE DASHBOARD                                │
├───────────────┬───────────────┬───────────────┬─────────────────┤
│ NAAC Score    │ NIRF Rank     │ NBA Status    │ Upcoming        │
│ Est: 3.42/4   │ Est: Band 101-│ 3/5 programs  │ Deadlines       │
│ ████████░░ 85%│ 150           │ accredited    │ • NIRF: 45 days │
│ Data: 92%     │ Score: 52.4   │               │ • AQAR: 90 days │
│ complete      │ Data: 87%     │               │ • AISHE: 120d   │
├───────────────┴───────────────┴───────────────┴─────────────────┤
│  DATA COMPLETENESS BY MODULE                                    │
│  ┌──────────────────┬────┬──────────────────────────────────┐   │
│  │ Admissions       │100%│ ██████████████████████████████   │   │
│  │ Student Profiles │ 95%│ █████████████████████████████░   │   │
│  │ Alumni/Placement │ 72%│ ██████████████████████░░░░░░░   │   │
│  │ Faculty          │ 88%│ ████████████████████████████░░   │   │
│  │ Publications     │ 65%│ ████████████████████░░░░░░░░░   │   │
│  │ Finance          │ 90%│ █████████████████████████████░   │   │
│  │ Infrastructure   │ 40%│ ████████████░░░░░░░░░░░░░░░░   │   │
│  └──────────────────┴────┴──────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  RECENT ACTIVITY                                                │
│  • NIRF 2026 data auto-refreshed (87% populated) — 2h ago      │
│  • Dr. Kumar uploaded 3 evidence docs for NAAC Cr-III — 1d ago  │
│  • Placement data synced (342 records) — 2d ago                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### T10: IQAC Supporting Capabilities

> **Context:** PRD Section 10 (IQAC Module) requires four capabilities beyond core framework metrics. These are spec'd here with schema, integration points, and user flows.

#### 10.1 Performance Benchmarking (Peer Institution Comparison)

**Purpose:** NAAC criterion 6.5.3 and NIRF require comparing institution performance against peer institutions. This is NOT automated (peer data is external and not in our database) — it uses manual peer data entry with structured storage.

**New Table:** `regulatory_peer_benchmarks`

> **Note:** This is an illustrative preview. The canonical DDL is in the Database Schema section below (Table 14).

```sql
-- NOTE: This is an illustrative preview. The canonical DDL is in the Migration section (Table 14).
CREATE TABLE regulatory_peer_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  framework_id uuid NOT NULL REFERENCES regulatory_frameworks(id),
  academic_year text NOT NULL CHECK (academic_year ~ '^\d{4}(-\d{2})?$'),
  peer_institution_name text NOT NULL,           -- "PSG College of Technology"
  peer_institution_nirf_rank integer,            -- peer's NIRF rank (if available)
  peer_institution_naac_grade text,              -- peer's NAAC grade (if available)
  metric_code text NOT NULL,                     -- which metric is being compared
  our_value numeric,                             -- our institution's value
  peer_value numeric,                            -- peer institution's value
  gap numeric GENERATED ALWAYS AS (our_value - peer_value) STORED,
  data_source text,                              -- "NIRF portal", "peer website", "manual"
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(institution_id, framework_id, academic_year, peer_institution_name, metric_code)
);
```

**User Flow:**
1. IQAC coordinator selects framework (e.g., NIRF Engineering) and academic year
2. Adds peer institutions (typically 5-10 institutions at similar rank band)
3. Enters peer metric values from publicly available NIRF data or institutional websites
4. Dashboard shows gap analysis: where we lead, where we lag, and the delta
5. Feeds into NAAC SSR narrative for "best practices benchmarking"

**Permissions:** Same as regulatory_submissions — super_admin, institution_admin, iqac_coordinator can write; principal can read.

#### 10.2 Action Plan Management (IQAC → OKR Integration)

**Purpose:** NAAC criterion 6.5.2 requires "institutional quality improvement driven by IQAC action plans." Rather than building a separate action plan system, this integrates with the existing OKR module.

**Integration Design (NO new table — uses existing OKR):**

```
IQAC identifies gap     →  Creates OKR objective tagged with regulatory context
  (e.g., "Improve FSR")      okr_objectives.metadata = { regulatory_framework_id, metric_code, target_value }

OKR tracks progress     →  Key results measure improvement
  (quarterly check-ins)       okr_key_results.current_value tracks metric progress

Metric auto-refreshes   →  Regulatory engine picks up improved value
  (via data connector)        regulatory_metric_values.current_value reflects change
```

**New Column on `okr_objectives`:** (ALTER TABLE, not new table)

```sql
-- Links an OKR objective to a regulatory metric it aims to improve
ALTER TABLE okr_objectives ADD COLUMN IF NOT EXISTS regulatory_metric_id uuid REFERENCES regulatory_metrics(id);
ALTER TABLE okr_objectives ADD COLUMN IF NOT EXISTS regulatory_target_value numeric;
```

**User Flow:**
1. IQAC coordinator identifies a weak metric (e.g., "Faculty PhD % is 45%, need 60%")
2. Clicks "Create Action Plan" → creates an OKR objective with `regulatory_metric_id` linked
3. OKR module tracks the action plan (key results, check-ins, responsible person)
4. When the metric is refreshed by data connector, IQAC dashboard shows progress vs target
5. NAAC SSR narrative auto-generates: "IQAC identified FSR gap, created action plan, improved from 45% to 58%"

**Permissions:** Uses existing OKR permissions. IQAC coordinator role already has OKR write access.

#### 10.3 Document Repository Search (Evidence Full-Text Search)

**Purpose:** NAAC DVV process requires quickly finding evidence documents across years and criteria. With potentially thousands of uploaded documents, full-text search is essential.

**Implementation Design (Supabase pg_trgm + GIN index):**

```sql
-- Enable trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add search vector column to evidence table
ALTER TABLE regulatory_evidence ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(file_name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(evidence_type, '')
    )
  ) STORED;

-- GIN index for fast full-text search
CREATE INDEX idx_reg_evidence_search ON regulatory_evidence USING GIN (search_vector);

-- Trigram index for fuzzy matching on file_name
CREATE INDEX idx_reg_evidence_filename_trgm ON regulatory_evidence USING GIN (file_name gin_trgm_ops);
```

**Search API Pattern:**
```sql
-- Full-text search across evidence documents
SELECT e.*, ts_rank(search_vector, query) AS relevance
FROM regulatory_evidence e,
     websearch_to_tsquery('english', 'placement report') query  -- use websearch_to_tsquery for user input (handles plain text, not & syntax)
WHERE search_vector @@ query
  AND institution_id = auth_institution_id()
  AND is_deleted = false
ORDER BY relevance DESC;

-- Fuzzy file name search (for partial/misspelled queries)
SELECT * FROM regulatory_evidence
WHERE file_name % 'palcement reprt'  -- trigram similarity handles typos
  AND institution_id = auth_institution_id()
  AND is_deleted = false
ORDER BY similarity(file_name, 'palcement reprt') DESC;
```

**User Flow:**
1. IQAC coordinator opens Evidence Repository (or uses global search)
2. Types search query: "placement 2024" or "audit report"
3. Results show matching documents with relevance ranking
4. Filter by: framework, criteria, academic year, evidence type, uploader
5. Click to preview/download

#### 10.4 Course Completion Tracking

**Purpose:** NAAC criterion 2.6 requires "process of monitoring and ensuring academic calendar compliance." The `regulatory_course_syllabi` table already has `total_hours` and `completed_hours` with a computed `completion_percentage`. This section spec's the monitoring workflow.

**Already Covered (in `regulatory_course_syllabi`):**
- `total_hours` — planned teaching hours for the course
- `completed_hours` — actual hours delivered
- `completion_percentage` — GENERATED ALWAYS AS computed column

**Additional Monitoring Capability (new view, not table):**

```sql
-- Aggregated completion dashboard view
CREATE OR REPLACE VIEW regulatory_course_completion_dashboard AS
SELECT
  cs.institution_id,
  cs.department,
  cs.academic_year,
  COUNT(*) as total_courses,
  COUNT(CASE WHEN cs.completion_percentage >= 100 THEN 1 END) as completed_courses,
  COUNT(CASE WHEN cs.completion_percentage >= 75 AND cs.completion_percentage < 100 THEN 1 END) as on_track_courses,
  COUNT(CASE WHEN cs.completion_percentage < 75 THEN 1 END) as behind_courses,
  ROUND(AVG(cs.completion_percentage), 1) as avg_completion_pct,
  COUNT(CASE WHEN cs.syllabus_file_url IS NOT NULL THEN 1 END) as syllabi_uploaded,
  COUNT(CASE WHEN cs.teaching_plan_file_url IS NOT NULL THEN 1 END) as plans_uploaded
FROM regulatory_course_syllabi cs
WHERE cs.revision_status = 'current'
GROUP BY cs.institution_id, cs.department, cs.academic_year;
```

**User Flow:**
1. IQAC coordinator opens Governance → Course Syllabi tab
2. Sees department-wise completion dashboard (heatmap: green ≥100%, yellow ≥75%, red <75%)
3. Drill into department → see individual course progress
4. HOD updates `completed_hours` periodically (or it feeds from Academic Operations timetable data)
5. At year-end, generates NAAC-ready report on syllabus completion rate
6. Feeds NAAC criterion 2.6 with quantitative data: "92% courses completed planned hours"

---

### T11: Connections — Module Integration Map

This is the core of the spec. The Regulatory Framework Engine connects to **15 existing MyJKKN modules** (DC-01 through DC-15) via Data Connectors.

#### CONNECTION MAP (Visual)

```
                    ┌──────────────────────────────┐
                    │  REGULATORY FRAMEWORK ENGINE  │
                    │                               │
                    │  ┌─────────┐ ┌────────────┐  │
                    │  │Framework│ │  Report     │  │
                    │  │ Config  │ │  Templates  │  │
                    │  └────┬────┘ └──────┬─────┘  │
                    │       │             │         │
                    │  ┌────▼─────────────▼─────┐  │
                    │  │   DATA CONNECTOR LAYER  │  │
                    │  │   (36 data connectors)  │  │
                    │  └────┬──┬──┬──┬──┬──┬────┘  │
                    └───────┼──┼──┼──┼──┼──┼────────┘
           ┌────────────────┘  │  │  │  │  └──────────────────┐
           │        ┌──────────┘  │  │  └──────────┐          │
           │        │        ┌────┘  └────┐        │          │
           ▼        ▼        ▼            ▼        ▼          ▼
    ┌──────────┐┌────────┐┌────────┐┌──────────┐┌────────┐┌────────┐
    │ADMISSION ││LEARNER ││ACADEMIC││ ALUMNI   ││BILLING ││INDUSTRY│
    │  CRM     ││PROFILES││  OPS   ││OUTCOMES  ││FINANCE ││INTEGR. │
    └──────────┘└────────┘└────────┘└──────────┘└────────┘└────────┘
    ┌──────────┐┌────────┐┌────────┐┌──────────┐┌────────┐┌────────┐
    │  STAFF   ││CAMPUS  ││GRIEVAN.││COMPETENCY││FACILIT.││SOLUTNS │
    │ FACULTY  ││ LIVING ││REDRESS ││ CATALOG  ││  DEV   ││  HUB   │
    └──────────┘└────────┘└────────┘└──────────┘└────────┘└────────┘
    ┌──────────┐┌────────┐┌────────┐┌──────────┐┌────────┐┌────────┐
    │ORGANIZN. ││  OKR   ││  NPS   ││LEARNERS  ││  VAC   ││RESOURCE│
    │HIERARCHY ││QUALITY ││SURVEYS ││ COUNCIL  ││COURSES ││ MGMT   │
    └──────────┘└────────┘└────────┘└──────────┘└────────┘└────────┘
```

#### Academic Year → Date Range Resolution

Data connectors inject `$2=start_date` and `$3=end_date`. The DataConnectorEngine resolves these from the `academic_year` text + the framework's `year_type`:

| Year Type | Input | Start Date | End Date |
|-----------|-------|------------|----------|
| calendar | "2025" | 2025-01-01 | 2025-12-31 |
| academic | "2025-26" | Institution's academic year start (default: June 1) | May 31 of following year |

The academic year start month is configurable per institution. If the `institutions` table has an `academic_year_start_month` column, use it. Otherwise default to June (month 6).

> **Schema addition (see Database Schema section):** Consider adding `academic_year_start_month integer DEFAULT 6` to the `institutions` table (outside this module's scope, but required for accurate connector queries).

#### DETAILED DATA CONNECTOR SPECIFICATIONS

Each connector defines: **Source Module → Source Table(s) → Key Columns → Regulatory Use**

---

**DC-01: Student Enrollment & Demographics**
- **Source Module:** Learner Management
- **Source Tables:** `learners_profiles`, `admissions`, `programs`, `departments`
- **Key Columns:**
  - `learners_profiles.gender` → Gender ratio (NIRF OI, NAAC)
  - `learners_profiles.category` → SC/ST/OBC/General distribution (NIRF OI)
  - `learners_profiles.community` → Community diversity (NAAC Criterion VII)
  - `learners_profiles.permanent_address_state` → Regional diversity (NIRF OI)
  - `learners_profiles.annual_income` → Economically weaker sections count (NIRF OI)
  - `learners_profiles.accommodation_type` → Hostelers vs Day scholars
  - `learners_profiles.lifecycle_status` → Active/graduated/dropped count
  - `learners_profiles.entry_type` → Lateral/regular intake (NIRF TLR)
  - `admissions.program_id` → Program-wise enrollment (AISHE, AICTE)
- **Sample Queries:**
  ```sql
  -- NIRF: Total enrollment by program (year-wise)
  SELECT p.program_name, COUNT(lp.id) as total_students,
    COUNT(CASE WHEN lp.gender = 'Female' THEN 1 END) as female_count,
    COUNT(CASE WHEN lp.category IN ('SC','ST') THEN 1 END) as sc_st_count
  FROM learners_profiles lp
  JOIN programs p ON lp.program_id = p.id  -- verify FK column name against actual learners_profiles schema
  WHERE lp.institution_id = $1 AND lp.lifecycle_status = 'active'
  GROUP BY p.program_name;
  ```
- **Feeds:** NAAC Criteria II, V, VII | NIRF TLR, OI | AISHE | AICTE mandatory disclosure

---

**DC-02: Faculty & Staff Data**
- **Source Module:** Staff Management, User Management
- **Source Tables:** `staff`, `profiles`, `facilitator_development`, `facilitator_industry_immersion`
- **Key Columns:**
  - `staff.designation` → Faculty designation distribution (NIRF TLR)
  - `staff.role_type` → Teaching/non-teaching ratio
  - `staff.facilitator_certification` (jsonb) → PhD, NET/SET, industry cert counts
  - `staff.outcome_metrics` (jsonb) → Faculty performance scores
  - `staff.date_of_joining` → Experience calculation
  - `staff.department_id` → Department-wise faculty count
  - `staff.gender` → Faculty gender ratio (NIRF OI)
  - `staff.pay_scale` → Faculty pay scale (AICTE mandatory disclosure requirement). **NOTE:** Consider adding `pay_scale text` to the `staff` table if not present — AICTE Category 3 (Faculty Information) requires pay scale for each faculty member.
  - `facilitator_development.workshops_attended` → FDP participation (NAAC)
  - `facilitator_development.industry_exposure_hours` → Industry interaction (NAAC Cr III)
  - `facilitator_development.current_stage` → Faculty development stage
- **Sample Queries:**
  ```sql
  -- NIRF TLR: Student-faculty ratio
  SELECT
    (SELECT COUNT(*) FROM learners_profiles WHERE institution_id = $1 AND lifecycle_status = 'active') as students,
    (SELECT COUNT(*) FROM staff WHERE institution_id = $1 AND is_active = true AND role_type IN ('teaching','facilitator')) as faculty;

  -- NAAC: Faculty with PhD
  SELECT COUNT(*) FROM staff
  WHERE institution_id = $1 AND is_active = true
  AND facilitator_certification->>'highest_qualification' = 'PhD';
  ```
- **Feeds:** NAAC Criteria I, II, III, VI | NIRF TLR | NBA SAR | AICTE faculty details

---

**DC-03: Research & Publications**
- **Source Module:** Solutions Hub (Publications)
- **Source Tables:** `sh_publications`, `sh_publication_contributors`
- **Key Columns:**
  - `sh_publications.paper_type` → Journal/conference/book chapter
  - `sh_publications.journal_type` → National/international classification
  - `sh_publications.scopus_indexed` → Scopus count (NIRF RP)
  - `sh_publications.wos_indexed` → Web of Science count
  - `sh_publications.ugc_listed` → UGC-CARE list count
  - `sh_publications.impact_factor` → Average impact factor
  - `sh_publications.citation_count` → Total citations (NIRF RP)
  - `sh_publications.h_index_contribution` → H-index calculation
  - `sh_publications.nirf_category` → **Already mapped to NIRF!**
  - `sh_publications.naac_criterion` → **Already mapped to NAAC!**
  - `sh_publications.doi` → DOI for verification
  - `sh_publications.publication_date` → Year-wise counts
- **Sample Queries:**
  ```sql
  -- NIRF RP: Publications per faculty
  SELECT COUNT(*) as total_pubs,
    COUNT(CASE WHEN scopus_indexed THEN 1 END) as scopus_count,
    SUM(citation_count) as total_citations,
    AVG(impact_factor) as avg_if
  FROM sh_publications
  WHERE institution_id = $1
  AND publication_date BETWEEN $2 AND $3
  AND status = 'published';
  ```
- **Feeds:** NAAC Criterion III | NIRF RP | NBA SAR

---

**DC-04: Placement & Graduation Outcomes**
- **Source Module:** Alumni Outcomes
- **Source Tables:** `alumni_outcomes`, `outcome_program_correlation`
- **Key Columns:**
  - `alumni_outcomes.outcome_type` → Placed/higher_studies/entrepreneur/other
  - `alumni_outcomes.salary_range` → Median salary calculation (NIRF GO)
  - `alumni_outcomes.company_name` → Recruiter diversity
  - `alumni_outcomes.is_relevant_to_program` → Program relevance % (NBA)
  - `alumni_outcomes.graduation_year` → Year-wise trends
  - `alumni_outcomes.verification_status` → Only verified data for submissions
  - `alumni_outcomes.is_willing_to_mentor` → Alumni engagement (NAAC)
  - `alumni_outcomes.is_willing_to_hire` → Alumni as recruiters
  - `outcome_program_correlation.correlation_score` → Program effectiveness
- **Sample Queries:**
  ```sql
  -- NIRF GO: Graduation outcome metrics
  SELECT
    COUNT(CASE WHEN outcome_type = 'placed' THEN 1 END) as placed,  -- verify actual enum value against alumni_outcomes schema
    COUNT(CASE WHEN outcome_type = 'higher_studies' THEN 1 END) as higher_ed,
    COUNT(CASE WHEN outcome_type = 'entrepreneur' THEN 1 END) as entrepreneurs,
    COUNT(*) as total_graduates
  FROM alumni_outcomes
  WHERE institution_id = $1 AND graduation_year = $2
  AND verification_status = 'verified';
  ```
- **Feeds:** NAAC Criteria I, V | NIRF GO | NBA SAR Criterion 6

---

**DC-05: Admission Funnel & Intake**
- **Source Module:** Admission CRM
- **Source Tables:** `admission_leads`, `admissions`, `admission_applications`, `institution_seat_config`
- **Key Columns:**
  - `admissions.program_id` → Program-wise admission count
  - `admission_leads.funnel_stage` → Demand ratio (applications per seat)
  - `institution_seat_config` → Sanctioned vs actual intake
  - `admission_applications.status` → Application → admission conversion
- **Feeds:** NAAC Criteria II | NIRF TLR (demand ratio) | AICTE intake data | AISHE

---

**DC-06: Financial Data**
- **Source Module:** Billing & Finance
- **Source Tables:** `billing_receipts`, `billing_student_bills`, `billing_invoices`, `billing_copq_incidents`
- **Key Columns:**
  - `billing_receipts.amount` → Total revenue collected
  - `billing_student_bills.total_amount` → Fee structure per program
  - `billing_copq_incidents.financial_impact` → Quality cost tracking
- **Sample Queries:**
  ```sql
  -- NIRF TLR: Financial Resources & Utilisation (FRQ)
  SELECT SUM(amount) as total_revenue
  FROM billing_receipts
  WHERE institution_id = $1
  AND created_at BETWEEN $2 AND $3
  AND status = 'confirmed';
  ```
- **Feeds:** NAAC Criteria VI | NIRF TLR (FRQ) | AICTE financial disclosure

---

**DC-07: Teaching-Learning & Attendance**
- **Source Module:** Academic Management
- **Source Tables:** `student_attendance`, `timetables`, `courses`, `course_mappings`, `academic_years`
- **Key Columns:**
  - `student_attendance` → Attendance % (teaching days compliance)
  - `timetables` → Teaching hours per program
  - `courses.theory_hours`, `courses.practical_hours` → Credit hours
  - `courses.learning_hours_target` → Planned vs actual teaching
  - `courses.competency_coverage` (jsonb) → OBE alignment
  - `courses.overall_finks_profile` (jsonb) → Pedagogy quality indicator
- **Feeds:** NAAC Criteria II | NBA SAR (COs, POs)

---

**DC-08: Industry Collaboration & Extension**
- **Source Module:** Industry Integration, Solutions Hub
- **Source Tables:** `industry_partners`, `industry_mentors`, `industry_projects`, `learner_industry_engagements`, `sh_solutions`, `sh_solution_mous`, `sh_training_programs`
- **Key Columns:**
  - `industry_partners.partnership_type` → MOU types (NAAC Cr III)
  - `industry_partners.mou_document_url` → Evidence for accreditation
  - `sh_solution_mous` → Consultancy agreements
  - `sh_solutions` → Consultancy projects (revenue, impact)
  - `sh_training_programs` → Extension/outreach programs
  - `learner_industry_engagements` → Student industry exposure
- **Feeds:** NAAC Criteria III | NIRF RP (sponsored projects) | NBA

---

**DC-09: Student Welfare & Support**
- **Source Module:** Campus Living, Grievance, Learners Council
- **Source Tables:** `hostel_allocations`, `hostel_incidents`, `anti_ragging_affidavits`, `grievance_tickets`, `grievance_categories`, `lc_elections`, `lc_events`, `lc_od_requests`, `scholarships`, `scholarship_applications`
- **Key Columns:**
  - `hostel_allocations` → Hostel capacity & occupancy
  - `anti_ragging_affidavits` → Anti-ragging compliance (UGC mandate)
  - `grievance_tickets.status`, `resolved_at` → Grievance resolution rate
  - `grievance_tickets.category_id` → Types of grievances
  - `lc_elections` → Student council elections conducted (NAAC)
  - `lc_events` → Student activities & cultural events
  - `scholarships` + `scholarship_applications` → Scholarship disbursement
- **Feeds:** NAAC Criteria V | NIRF OI (scholarship data) | UGC anti-ragging compliance

---

**DC-10: Quality & Governance**
- **Source Module:** OKR, Process Excellence, Maturity Assessment, NPS
- **Source Tables:** `okr_objectives`, `okr_key_results`, `process_definitions`, `process_audits`, `maturity_assessments`, `nps_surveys`, `nps_responses`
- **Key Columns:**
  - `okr_objectives` → Institutional strategic goals (NAAC Cr VI)
  - `process_audits` → Internal quality audit trail (IQAC)
  - `maturity_assessments` → Maturity level benchmarking
  - `nps_responses` → Stakeholder satisfaction scores
- **Feeds:** NAAC Criteria VI, VII | IQAC internal reports

---

**DC-11: Competency & OBE Data**
- **Source Module:** Competency Catalog, Learning Paths
- **Source Tables:** `competency_catalog`, `competency_program_mapping`, `course_competency_mapping`, `learner_competencies`, `learning_paths`
- **Key Columns:**
  - `competency_program_mapping` → CO-PO mapping (NBA)
  - `course_competency_mapping` → Course outcomes per course
  - `learner_competencies.current_level` → Attainment measurement
- **Feeds:** NBA SAR (CO-PO-PSO attainment) | NAAC Criteria II

---

**DC-12: Value-Added & Skill Courses**
- **Source Module:** VAC (Value Added Courses)
- **Source Tables:** `vac_courses`, `vac_enrollments`, `vac_learner_progress`
- **Key Columns:**
  - `vac_courses` → Courses offered beyond curriculum
  - `vac_enrollments` → Students enrolled in add-on courses
  - `vac_learner_progress` → Completion rates
- **Feeds:** NAAC Criteria II, V | Employability metric for NIRF GO

---

**DC-13: Organizational Hierarchy**
- **Source Module:** Organization Management
- **Source Tables:** `institutions`, `departments`, `programs`, `degrees`, `courses`, `sections`, `semesters`, `regulations`
- **Key Columns:**
  - `institutions.*` → Basic institutional profile (all frameworks)
  - `institutions.accredited_by` → Current accreditation status
  - `programs.program_duration_yrs` → Program details
  - `programs.program_type` → UG/PG/Diploma classification
  - `departments.department_name` → Department listing
- **Feeds:** ALL frameworks (institutional profile is mandatory for every submission)

---

**DC-14: Infrastructure & Resources**
- **Source Module:** Resource Management
- **Source Tables:** `resources`, `resource_parent_categories`, `resource_sub_categories`, `resource_reservations`, `resource_maintenance_logs`
- **Key Columns:**
  - `resources` → Labs, equipment, classrooms (NAAC Cr IV)
  - `resource_maintenance_logs` → Maintenance records
  - `resource_reservations` → Utilization data
- **Feeds:** NAAC Criteria IV | AICTE infrastructure disclosure | NIRF TLR

---

**DC-15: Communication & Social Impact**
- **Source Module:** Social Media, Notifications
- **Source Tables:** `sm_accounts`, `sm_post_metrics`, `sm_snapshots`
- **Key Columns:**
  - Social media engagement metrics → Institutional visibility (NIRF Perception)
- **Feeds:** NIRF Perception parameter

---

#### CONNECTION SUMMARY TABLE

| # | Module | Tables Used | Regulatory Bodies Fed | Auto-Calculable? |
|---|--------|-------------|----------------------|------------------|
| DC-01 | Learner Profiles | `learners_profiles`, `admissions`, `programs` | NAAC, NIRF, AISHE, AICTE | ✅ Yes |
| DC-02 | Staff/Faculty | `staff`, `profiles`, `facilitator_development` | NAAC, NIRF, NBA, AICTE | ✅ Yes |
| DC-03 | Publications | `sh_publications` | NAAC, NIRF, NBA | ✅ Yes |
| DC-04 | Alumni/Placement | `alumni_outcomes` | NAAC, NIRF, NBA | ✅ Yes |
| DC-05 | Admissions | `admission_leads`, `admissions` | NAAC, NIRF, AICTE, AISHE | ✅ Yes |
| DC-06 | Finance | `billing_receipts`, `billing_student_bills` | NAAC, NIRF, AICTE | ✅ Yes |
| DC-07 | Academic | `student_attendance`, `timetables`, `courses` | NAAC, NBA | ✅ Yes |
| DC-08 | Industry | `industry_partners`, `sh_solutions`, `sh_solution_mous` | NAAC, NIRF, NBA | ✅ Yes |
| DC-09 | Welfare | `hostel_*`, `grievance_tickets`, `lc_*`, `scholarships` | NAAC, NIRF, UGC | ✅ Yes |
| DC-10 | Quality/OKR | `okr_objectives`, `process_audits`, `nps_*` | NAAC, IQAC | ✅ Yes |
| DC-11 | Competency/OBE | `competency_*`, `course_competency_mapping` | NBA | ⚠️ Partial |
| DC-12 | VAC | `vac_courses`, `vac_enrollments` | NAAC | ✅ Yes |
| DC-13 | Organization | `institutions`, `departments`, `programs` | ALL | ✅ Yes |
| DC-14 | Resources | `resources`, `resource_*` | NAAC, AICTE, NIRF | ⚠️ Partial |
| DC-15 | Social/Perception | `sm_accounts`, `sm_post_metrics` | NIRF | ⚠️ Manual supplement |

#### NEW DATA CONNECTORS (require new tables)

| # | Module | New Table(s) Required | Regulatory Bodies Fed | Priority |
|---|--------|----------------------|----------------------|----------|
| DC-16 | Faculty Qualifications | **`staff_qualifications`** | NAAC Cr I, II / NIRF TLR (FQE) / NBA / AICTE | 🔴 P0 |
| DC-17 | Examination Results | **`exam_results`** | NAAC Cr II / NIRF GO (GUE — 20% weight!) | 🔴 P0 |
| DC-18 | Research Grants | **`research_projects`** | NAAC Cr III / NIRF RP (FPPP — 4.5% of total NIRF) | 🔴 P0 |
| DC-19 | Patents & IPR | **`patents_ipr`** | NAAC Cr III / NIRF RP (IPR) | 🔴 P0 |
| DC-20 | Library Resources | **`library_holdings`**, **`library_e_resources`** | NAAC Cr IV | 🟡 P1 |
| DC-21 | Budget & Expenditure | **`institutional_budgets`** | NAAC Cr IV, VI / NIRF TLR (FRQ) | 🟡 P1 |
| DC-22 | Institutional Events | **`institutional_events`** | NAAC Cr III | 🟡 P1 |
| DC-23 | Awards & Recognitions | **`awards_recognitions`** | NAAC Cr III, V, VII / NIRF Perception | 🟡 P1 |
| DC-24 | IQAC Operations | **`iqac_meetings`** | NAAC Cr VI | 🟡 P1 |
| DC-25 | Student Life | **`student_achievements`**, **`student_activities`**, **`career_services`** | NAAC Cr V | 🟠 P2 |
| DC-26 | Inclusivity & Values | **`gender_equity_initiatives`**, **`inclusivity_facilities`** | NAAC Cr VII / NIRF OI | 🟠 P2 |
| DC-27 | Curriculum Tracking | **`curriculum_revisions`** | NAAC Cr I | 🟠 P2 |
| DC-28 | ICT Infrastructure | **`ict_infrastructure`** | NAAC Cr II, IV / NIRF TLR | 🟠 P2 |
| DC-29 | Online Education | **`online_education_tracking`** | NIRF TLR-OE / NAAC Cr II | 🟡 P1 |
| DC-30 | NEP 2020 Compliance | **`nep_compliance_tracking`** | NIRF TLR-MIR / NAAC Cr I | 🟡 P1 |
| DC-31 | PhD Scholars | **`phd_scholars`** | NIRF GO-GPHD (8% of total!) / NAAC 9.4 | 🔴 P0 |
| DC-32 | Environmental & Green | **`environmental_initiatives`** | NAAC Attr 10 (50 pts) | 🟡 P1 |
| DC-33 | Financial Audits | **`financial_audits`** | NAAC 4.4 / NAAC Old Cr VI | 🟡 P1 |
| DC-34 | Academic Calendar | **`academic_calendar_tracking`** | NAAC 5.7 (15 pts) | 🟠 P2 |
| DC-35 | Student Welfare | **`student_welfare_records`** | NAAC 7.5 (15 pts) | 🟠 P2 |
| DC-36 | Collaborations & Exchanges | **`collaboration_exchanges`** | NAAC 7.9 (10 pts) | 🟠 P2 |

**Updated total: 36 Data Connectors (15 existing + 21 new) covering ALL NAAC Binary metrics + ALL NIRF sub-parameters.**

> **Key finding:** The 4 P0 tables (`staff_qualifications`, `exam_results`, `research_projects`, `patents_ipr`) alone unlock 80% of NIRF scoring. This is extreme Pareto — 4 tables out of 21 missing = 80% of the regulatory value. See `/Users/omm/Vaults/Claude Setup/Capture/MyJKKN/FST-Missing-Regulatory-Data-Sources.md` for the complete gap analysis with NAAC criterion-by-criterion and NIRF parameter-by-parameter breakdown.

---

### T12: Success Metrics

**Phase 1 Success (Week 4):**
- [ ] Framework definition CRUD working — NAAC 2022 and NIRF 2025 configured
- [ ] 15 data connectors producing metric values from existing tables (DC-01 through DC-15); remaining 21 defined and ready for new tables
- [ ] Metric dashboard showing auto-populated vs manual-needed breakdown

**Phase 2 Success (Week 7):**
- [ ] Score simulation working for NIRF (adjust inputs, see rank impact)
- [ ] Evidence upload and attachment per metric
- [ ] Report generation for NAAC AQAR in PDF format

**Phase 3 Success (Week 10):**
- [ ] Admin can add new framework without developer involvement
- [ ] Historical year-over-year comparison working
- [ ] DVV audit drill-down: click any metric → see source records

**Overall Success:**
- [ ] NAAC AQAR generated from system in < 1 week (vs 3 months manual)
- [ ] NIRF data 85%+ auto-populated from existing modules
- [ ] Zero developer involvement when NIRF changes weights next year

---

## Database Schema — New Tables

> **Schema Summary:** 18 tables + 2 views, 58 RLS policies, 14 triggers, 32+ indexes.

```sql
-- ═══════════════════════════════════════════════
-- REGULATORY FRAMEWORK ENGINE — MIGRATION
-- ═══════════════════════════════════════════════

-- ═══════════════════════════════════════════════
-- PREREQUISITES
-- ═══════════════════════════════════════════════
-- The Regulatory Framework Engine requires the `iqac_coordinator` role to exist.
-- This role is the PRIMARY user of the entire module (IQAC = Internal Quality Assurance Cell).
-- Without this role, all 58 RLS policies and all API route role checks will silently fail
-- for the module's primary user.

-- PREREQUISITE: Add iqac_coordinator role to the system
-- The profiles.role column must accept 'iqac_coordinator' as a valid value.
-- Add to types/auth.ts SYSTEM_ROLES constant.
-- Assign at least one user per institution as iqac_coordinator before enabling the Regulatory module.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN (
  'super_admin','administrator','institution_admin','principal','hod',
  'faculty','staff','student','guest','driver','parent','iqac_coordinator'
));

-- 1. Framework Definitions (NAAC, NIRF, NBA, AICTE, UGC, ARIIA...)
CREATE TABLE regulatory_frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),  -- NULL = global template
  name text NOT NULL,                                -- "NAAC SSR 2022 Revised"
  body text NOT NULL CHECK (length(trim(body)) > 0), -- "NAAC", "NIRF", "NBA", "AICTE", "UGC"
  framework_type text NOT NULL DEFAULT 'accreditation' CHECK (framework_type IN ('accreditation','ranking','compliance','reporting')),
  institution_type text CHECK (institution_type IS NULL OR institution_type IN ('university','autonomous_college','affiliated_college')),
  -- NULL = universal; 'university' | 'autonomous_college' | 'affiliated_college' (NAAC Binary has different weights per type)
  version text NOT NULL,                             -- "2022-rev", "2025"
  effective_from date,
  effective_to date,                                 -- NULL = currently active
  year_type text NOT NULL DEFAULT 'academic' CHECK (year_type IN ('academic','calendar')),  -- NIRF=calendar, NAAC=academic
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  total_max_score numeric,                           -- e.g., 1050 for NAAC Old, 900 for NAAC Binary, 100 for NIRF (normalized)
  description text,
  submission_portal_url text,                        -- e.g., https://nirfrankings.in
  submission_deadline date,
  code text NOT NULL CHECK (length(trim(code)) > 0),     -- short code: 'NIRF_2025_OVERALL', 'NAAC_BINARY_2024', 'NBA_SAR_ENGINEERING'
  pass_threshold numeric,                             -- NAAC Binary: 540 (Uni), 450 (Auto), 360 (Affil); NBA: 60%; NULL for ranking/reporting
  assessment_phase text DEFAULT 'primary' CHECK (assessment_phase IN ('primary','mbgl')), -- NAAC: 'primary' for Binary, 'mbgl' for Maturity-Based Grading
  validity_period_years integer,                      -- accreditation validity: NAAC=3, NBA=3 or 6; NULL for NIRF/AICTE
  metadata jsonb DEFAULT '{}',                       -- body-specific config (includes program_type for NBA: {"program_type":"B.Tech"})
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE(institution_id, body, version, institution_type),
  UNIQUE(institution_id, code)
  -- NOTE: code is unique PER institution (not globally). Global templates (institution_id=NULL)
  -- use a partial unique index below since PostgreSQL treats NULL != NULL in UNIQUE constraints.
  -- When an institution copies a global template, it gets its own row with the same code but
  -- a non-NULL institution_id — no conflict.
  -- NOTE: institution_type is nullable (NULL = universal, applies to all types).
  -- PostgreSQL treats NULL != NULL in UNIQUE constraints, so multiple (same body, version, NULL)
  -- rows could exist. Mitigate with partial unique indexes:
);

-- Partial unique indexes for NULL institution_id (global templates)
CREATE UNIQUE INDEX idx_frameworks_global_code ON regulatory_frameworks (code)
  WHERE institution_id IS NULL;
-- NOTE: The original (body, version) uniqueness was too restrictive for discipline-specific
-- frameworks like NIRF which share the same body+version but have different codes.
-- All 7 NIRF 2025 variants have body='NIRF', version='2025' — only `code` distinguishes them.
-- NOTE: idx_frameworks_universal removed — idx_frameworks_global_code already enforces
-- UNIQUE(code) WHERE institution_id IS NULL, which subsumes (body, code) uniqueness.
CREATE UNIQUE INDEX idx_frameworks_global_typed ON regulatory_frameworks
  (body, version, institution_type) WHERE institution_type IS NOT NULL AND institution_id IS NULL;
-- Prevents duplicate global templates like two (NAAC, 2024, autonomous_college) rows with NULL institution_id.

-- 2. Criteria Tree (hierarchical — supports sub-criteria)
CREATE TABLE regulatory_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES regulatory_frameworks(id) ON DELETE CASCADE,
  parent_criteria_id uuid REFERENCES regulatory_criteria(id),  -- NULL = top-level
  depth integer NOT NULL DEFAULT 1 CHECK (depth <= 5), -- nesting depth (1=top-level), capped to prevent runaway hierarchies
  code text NOT NULL,                                -- "I", "1.1", "TLR", "TLR-1"
  name text NOT NULL,                                -- "Curricular Aspects"
  description text,
  weight numeric,                                    -- interpretation varies by framework:
  --   NIRF: fractional weights (0.30 = 30% of total)
  --   NAAC Old: absolute max points per criterion (e.g., 150, 350)
  --   NAAC Binary: absolute points per attribute (e.g., 75, 50)
  --   NBA/AICTE/UGC: percentage contribution (0-100)
  max_score numeric,                                 -- max points for this criteria
  sort_order integer NOT NULL DEFAULT 0,
  is_qualitative boolean DEFAULT false,              -- some criteria are descriptive, not numeric
  evidence_required boolean DEFAULT true,             -- criteria-level: does this criteria require evidence? (cf. regulatory_metrics.requires_evidence for metric-level)
  guidance_notes text,                               -- NAAC DVV guidance, tips
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(framework_id, code)
);

-- 3. Metric Definitions (individual data points within criteria)
CREATE TABLE regulatory_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criteria_id uuid NOT NULL REFERENCES regulatory_criteria(id) ON DELETE CASCADE,
  code text NOT NULL,                                -- "1.1.1", "SSR-2.1"
  name text NOT NULL,                                -- "Number of programs with CBCS/elective"
  description text,
  data_type text NOT NULL DEFAULT 'number' CHECK (data_type IN ('number','percentage','ratio','text','boolean','file','currency','scale')),
  -- 'scale' added for NAAC A-E metrics (e.g., 1.4.1 Feedback System, 5.1.2 Capacity Building)
  unit text,                                         -- "count", "%", "INR lakhs", "ratio", "years"
  formula text,                                      -- e.g., "(placed_count / eligible_count) * 100"
  formula_dependencies text[],                       -- metric codes this formula depends on
  data_connector_id text,                         -- primary DC reference (FK added after regulatory_data_connectors table exists)
  -- For metrics needing multiple DCs, data_connector_id is the primary source.
  -- Additional connectors stored in metadata: {"secondary_connectors": ["DC-29"]}
  -- The data_connector_query can join across tables from multiple connectors.
  data_connector_query text,                         -- actual SQL or query config (JSON)
  is_auto_calculable boolean DEFAULT false,
  requires_evidence boolean DEFAULT true,
  validation_min numeric,
  validation_max numeric,
  validation_regex text,
  sort_order integer DEFAULT 0,
  data_window_years integer NOT NULL DEFAULT 1,      -- multi-year aggregation: NAAC=5, NIRF=3, default=1 (current year only)
  dvv_guidance text,                                 -- NAAC DVV specific clarification text
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(criteria_id, code)
);

-- 4. Metric Values (actual data — the heart of the system)
CREATE TABLE regulatory_metric_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id uuid NOT NULL REFERENCES regulatory_metrics(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  academic_year text NOT NULL CHECK (academic_year ~ '^\d{4}(-\d{2})?$'),  -- "2025-26" or "2025" (calendar year for NIRF)
  value text,                                        -- stored as text, parsed by data_type
  numeric_value numeric,                             -- pre-parsed for calculations (NULL if non-numeric)
  is_auto_calculated boolean DEFAULT false,
  is_manually_overridden boolean DEFAULT false,
  override_reason text,                              -- required if manually overridden
  source_record_count integer,                       -- how many source records contributed
  source_snapshot jsonb,                             -- snapshot of source query results (for audit)
  calculated_at timestamptz,
  entered_by uuid REFERENCES profiles(id),
  verified_by uuid REFERENCES profiles(id),
  verified_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(metric_id, institution_id, academic_year)
);
-- NOTE (H2 — metric_values deletion path): Metric values do NOT have soft-delete. The deletion
-- path is: (1) Manual metric values can be updated to a previous value from history (effectively
-- 'undo'). (2) Metric values are CASCADE-deleted when their parent metric is deleted. (3) The
-- framework/criteria/metric deletion guard prevents deletion when active submissions exist.
-- (4) For wrong-year or wrong-metric entries, UPDATE the value rather than deleting the row.

-- NOTE (M5 — metric value interpretation): Distinguish "0" from "no data" from "calculation error":
--   | numeric_value | value (text)     | Meaning                                               |
--   |---------------|------------------|-------------------------------------------------------|
--   | 0             | '0'              | Actual zero (e.g., zero publications this year)       |
--   | NULL          | NULL             | No data available — metric not yet populated          |
--   | NULL          | 'ERROR:timeout'  | Calculation/connector error — prefix with 'ERROR:'    |
--   | NULL          | 'N/A'            | Metric not applicable to this institution type        |
-- The GET /metric-values API endpoint MUST return a derived `status` field:
--   'populated'      → numeric_value IS NOT NULL OR (value IS NOT NULL AND value NOT LIKE 'ERROR:%' AND value != 'N/A')
--   'empty'          → numeric_value IS NULL AND value IS NULL
--   'error'          → value LIKE 'ERROR:%'
--   'not_applicable' → value = 'N/A'
-- This enables the UI to render distinct states (checkmark, dash, warning icon, grey-out).

-- 5. Metric Value History (audit trail — every change recorded)
CREATE TABLE regulatory_metric_value_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_value_id uuid NOT NULL REFERENCES regulatory_metric_values(id) ON DELETE CASCADE,
  -- CASCADE chosen over RESTRICT: when a metric_value is deleted (via framework deletion
  -- cascade), its history is destroyed. The framework deletion guard pre-checks for active
  -- submissions before allowing cascade. Historical audit data for deleted frameworks is not
  -- retained — archive before deletion if needed.
  old_value text,
  new_value text,
  change_type text NOT NULL CHECK (change_type IN ('auto_refresh','manual_entry','manual_override','verification','dvv_response')),
  -- 'dvv_response' added for DVV workflow (NAAC Data Validation & Verification responses)
  changed_by uuid REFERENCES profiles(id),
  change_reason text,
  source_snapshot jsonb,
  created_at timestamptz DEFAULT now()
);

-- 6. Evidence Documents
CREATE TABLE regulatory_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id uuid REFERENCES regulatory_metrics(id) ON DELETE SET NULL,
  criteria_id uuid REFERENCES regulatory_criteria(id) ON DELETE SET NULL,
  -- SET NULL preserves evidence documents when their parent metric/criterion is deleted.
  -- Evidence retains its file_url and institution context. The CHECK constraint
  -- (metric_id IS NOT NULL OR criteria_id IS NOT NULL) allows one to be null if the other remains.
  -- If BOTH become null after cascaded deletions, orphaned evidence can be found via:
  --   SELECT * FROM regulatory_evidence WHERE metric_id IS NULL AND criteria_id IS NULL AND is_deleted = false;
  submission_id uuid,  -- FK added after regulatory_submissions table exists (see ALTER TABLE below)
  institution_id uuid NOT NULL REFERENCES institutions(id),
  academic_year text NOT NULL CHECK (academic_year ~ '^\d{4}(-\d{2})?$'),
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,                                    -- pdf, jpg, xlsx, etc.
  file_size_bytes bigint,                            -- bigint to support files > 2GB
  description text,
  evidence_type text DEFAULT 'supporting' CHECK (evidence_type IN ('supporting','primary','certificate','screenshot','geo_tagged_photo')),
  -- 'geo_tagged_photo' added for infrastructure/campus evidence requiring location proof
  uploaded_by uuid NOT NULL REFERENCES profiles(id),
  is_deleted boolean DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}',
  CHECK (metric_id IS NOT NULL OR criteria_id IS NOT NULL),  -- evidence must link to a metric or criteria
  CHECK ((is_deleted = false AND deleted_at IS NULL) OR (is_deleted = true AND deleted_at IS NOT NULL))
  -- Consistency: is_deleted flag and deleted_at timestamp must agree
);

-- 7. Submissions (workflow: draft → data_collection → in_review → approved → submitted → accepted; 9 states total)
CREATE TABLE regulatory_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES regulatory_frameworks(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  academic_year text NOT NULL CHECK (academic_year ~ '^\d{4}(-\d{2})?$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','data_collection','in_review','approved','submitted','accepted','returned','cancelled','dvv_revision')),
  -- 'cancelled': A submission can transition to cancelled only from 'draft' status.
  --   Cancelled submissions are excluded from the UNIQUE constraint via the partial unique index below.
  -- 'dvv_revision': Returned submissions from DVV (Data Validation & Verification) enter this state
  --   instead of data_collection to prevent auto-refresh from overwriting submitted values.
  version integer NOT NULL DEFAULT 1,
  -- Optimistic locking: the status transition endpoint MUST use `SELECT ... FOR UPDATE` on the
  -- submission row before validating and applying the transition. The `version` column increments
  -- on every UPDATE. API routes that modify submissions must include `expected_version` in the
  -- request body and verify it matches before writing. Return 409 Conflict if version mismatch.
  completeness_percentage numeric DEFAULT 0,
  auto_populated_count integer DEFAULT 0,
  manual_entry_count integer DEFAULT 0,
  total_metrics_count integer DEFAULT 0,
  calculated_score numeric,                          -- estimated total score
  last_calculated_at timestamptz,                    -- when calculate-score last ran (UI staleness indicator)
  submitted_at timestamptz,
  submitted_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  approved_by uuid REFERENCES profiles(id),
  portal_reference text,                             -- external submission ID/reference
  report_file_url text,                              -- generated report PDF
  prerequisite_submission_id uuid REFERENCES regulatory_submissions(id), -- IIQA must be accepted before SSR; Binary before MBGL
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id), -- who created the submission (audit trail)
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- NOTE: UNIQUE constraint replaced by partial unique index below (excludes cancelled submissions)
);
-- Partial unique index: only one active (non-cancelled) submission per framework+institution+year
CREATE UNIQUE INDEX idx_submissions_unique_active ON regulatory_submissions(framework_id, institution_id, academic_year)
  WHERE status != 'cancelled';

-- Add deferred FK from regulatory_evidence → regulatory_submissions (created after submissions table exists)
ALTER TABLE regulatory_evidence ADD CONSTRAINT fk_evidence_submission
  FOREIGN KEY (submission_id) REFERENCES regulatory_submissions(id) ON DELETE RESTRICT;

-- 7b. Submission Status Transitions (Audit Trail)
-- Every status transition is recorded for full audit history. This replaces the pattern of
-- only preserving the latest approved_at/approved_by, allowing complete re-approval tracking.
CREATE TABLE regulatory_submission_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES regulatory_submissions(id) ON DELETE CASCADE,
  from_status text NOT NULL CHECK (from_status IN ('draft','data_collection','in_review','approved','submitted','accepted','returned','cancelled','dvv_revision')),
  to_status text NOT NULL CHECK (to_status IN ('draft','data_collection','in_review','approved','submitted','accepted','returned','cancelled','dvv_revision')),
  transitioned_by uuid NOT NULL REFERENCES profiles(id),  -- profiles, not auth.users (consistent with all other user FK refs)
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE regulatory_submission_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transitions_read" ON regulatory_submission_transitions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM regulatory_submissions s
    WHERE s.id = submission_id
    AND (s.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','institution_admin','iqac_coordinator','principal'))
);

CREATE POLICY "transitions_insert" ON regulatory_submission_transitions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','institution_admin','iqac_coordinator','principal'))
);

CREATE INDEX idx_reg_transitions_submission ON regulatory_submission_transitions(submission_id, created_at DESC);

-- 7c. DVV (Data Validation & Verification) Query Tracking
-- NAAC sends DVV queries after submission; institution must respond with evidence.
CREATE TABLE regulatory_dvv_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES regulatory_submissions(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES regulatory_metrics(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  query_round integer NOT NULL DEFAULT 1,
  naac_query_text text NOT NULL,
  institution_response text,
  response_evidence_ids uuid[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','responded','resolved','escalated')),
  queried_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE regulatory_dvv_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dvv_queries_read" ON regulatory_dvv_queries FOR SELECT USING (
  (institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','iqac_coordinator','institution_admin'))
);

CREATE POLICY "dvv_queries_insert" ON regulatory_dvv_queries FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "dvv_queries_update" ON regulatory_dvv_queries FOR UPDATE USING (
  (institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','iqac_coordinator','institution_admin'))
)
WITH CHECK (
  (institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','iqac_coordinator','institution_admin'))
);

CREATE INDEX idx_reg_dvv_queries_submission_round ON regulatory_dvv_queries(submission_id, query_round);

-- 7d. Metric Assignments (department-level data collection delegation)
-- IQAC coordinator assigns metrics to department HODs with deadlines.
CREATE TABLE regulatory_metric_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_value_id uuid NOT NULL REFERENCES regulatory_metric_values(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES regulatory_submissions(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  assigned_to uuid NOT NULL REFERENCES profiles(id),   -- profiles, not auth.users (consistent with all other user FK refs)
  assigned_to_department text,
  assigned_by uuid NOT NULL REFERENCES profiles(id),   -- profiles, not auth.users
  assigned_at timestamptz NOT NULL DEFAULT now(),
  due_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','submitted','approved','rejected')),
  reviewer_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE regulatory_metric_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "metric_assignments_read" ON regulatory_metric_assignments FOR SELECT USING (
  (assigned_to = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','iqac_coordinator','institution_admin','hod')))
  OR (institution_id = auth_institution_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','iqac_coordinator','institution_admin')))
);

CREATE POLICY "metric_assignments_insert" ON regulatory_metric_assignments FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','iqac_coordinator','institution_admin'))
);

CREATE POLICY "metric_assignments_update" ON regulatory_metric_assignments FOR UPDATE USING (
  (assigned_to = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','iqac_coordinator','institution_admin','hod')))
  OR (institution_id = auth_institution_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin','iqac_coordinator','institution_admin')))
)
WITH CHECK (
  (institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','iqac_coordinator','institution_admin','hod'))
);

CREATE INDEX idx_reg_metric_assignments_submission_status ON regulatory_metric_assignments(submission_id, status);
CREATE INDEX idx_reg_metric_assignments_assignee_status ON regulatory_metric_assignments(assigned_to, status);

-- 8. Data Connector Registry (named, reusable query definitions)
CREATE TABLE regulatory_data_connectors (
  id text PRIMARY KEY,                               -- "DC-01", "DC-02", ...
  name text NOT NULL,                                -- "Student Enrollment & Demographics"
  description text,
  source_module text NOT NULL,                       -- "learner-management", "staff", etc.
  source_tables text[] NOT NULL,                     -- ["learners_profiles", "admissions"]
  query_template text NOT NULL,                      -- SQL with $1=institution_id, $2=start_date, $3=end_date
  output_type text NOT NULL DEFAULT 'single_value' CHECK (output_type IN ('single_value','table','aggregation')),
  output_columns text[],                             -- column names in result set
  is_active boolean DEFAULT true,
  last_tested_at timestamptz,
  last_test_status text,                             -- success | error | warning
  test_error_message text,
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add deferred FK from regulatory_metrics → regulatory_data_connectors (now that both tables exist)
ALTER TABLE regulatory_metrics ADD CONSTRAINT fk_metrics_data_connector
  FOREIGN KEY (data_connector_id) REFERENCES regulatory_data_connectors(id) ON DELETE RESTRICT;

-- 9. Score Simulations (what-if scenarios)
CREATE TABLE regulatory_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES regulatory_frameworks(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  name text NOT NULL,                                -- "What if 5 more PhD faculty"
  base_academic_year text NOT NULL CHECK (base_academic_year ~ '^\d{4}(-\d{2})?$'),
  overrides jsonb NOT NULL DEFAULT '{}' CHECK (pg_column_size(overrides) < 65536),
  -- Size limit prevents abuse via excessively large override payloads
  -- {metric_code: new_value, ...}
  calculated_score numeric,
  score_delta numeric,                               -- difference from base
  rank_estimate text,                                -- estimated rank band
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- 10. Evidence Version History (tracks document revisions — DVV may request updated evidence)
CREATE TABLE regulatory_evidence_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES regulatory_evidence(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size_bytes bigint,
  change_summary text,                               -- "Updated placement data per DVV feedback"
  uploaded_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(evidence_id, version_number)
);

-- 11. Peer Team Visits (NAAC/NBA visit coordination and post-visit tracking)
CREATE TABLE regulatory_peer_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid REFERENCES regulatory_submissions(id) ON DELETE RESTRICT,
  -- Nullable: initial/exploratory visits (e.g., NAAC preliminary) may precede formal submissions.
  institution_id uuid NOT NULL REFERENCES institutions(id),
  visit_type text NOT NULL CHECK (visit_type IN ('naac_peer_team','nba_evaluator','aicte_expert','naac_dvv')),
  -- 'naac_dvv' added for DVV (Data Validation & Verification) visit coordination
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','in_progress','completed','postponed','cancelled')),
  scheduled_date date,
  actual_start_date date,
  actual_end_date date,
  team_composition jsonb DEFAULT '[]',               -- [{name, designation, institution, role}]
  pre_visit_checklist jsonb DEFAULT '{}',             -- {item: boolean} — infrastructure, documents, labs ready
  visit_itinerary jsonb DEFAULT '[]',                -- [{day, time, activity, location, responsible_person}]
  findings jsonb DEFAULT '{}',                       -- peer team observations/remarks
  recommendations text,                              -- post-visit improvement suggestions
  action_items jsonb DEFAULT '[]',                   -- [{action, responsible, deadline, status}]
  grade_awarded text,                                -- grade/score from peer team (if applicable)
  report_file_url text,                              -- peer team report document
  coordinator_id uuid REFERENCES profiles(id),       -- IQAC coordinator managing the visit
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 12. Governing Bodies & Committees (NAAC SSR requires composition + meeting minutes)
CREATE TABLE regulatory_governing_bodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  body_type text NOT NULL CHECK (body_type IN ('governing_body','academic_council','bos','iqac','finance_committee','exam_committee','anti_ragging','icc','grievance_cell')),
  name text NOT NULL,                                -- "Board of Studies - Computer Science"
  mandate text,                                      -- statutory purpose/responsibilities
  formation_date date,
  is_active boolean DEFAULT true,
  meeting_frequency text,                            -- monthly | quarterly | biannual | annual | as_needed
  members jsonb DEFAULT '[]',                        -- [{name, designation, role_in_body, affiliation, member_type, nominated_by, tenure_start, tenure_end}]
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Meeting minutes for governing bodies (NAAC evidence requirement)
CREATE TABLE regulatory_body_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_id uuid NOT NULL REFERENCES regulatory_governing_bodies(id) ON DELETE RESTRICT,
  -- RESTRICT prevents accidentally destroying meeting records when deactivating a governing body.
  -- To remove a body, first archive/reassign its meetings.
  institution_id uuid NOT NULL REFERENCES institutions(id),
  meeting_number integer NOT NULL,                   -- sequential per body per academic year
  academic_year text NOT NULL CHECK (academic_year ~ '^\d{4}(-\d{2})?$'),
  meeting_date date NOT NULL,
  quorum_met boolean DEFAULT true,
  attendees_count integer,
  agenda jsonb DEFAULT '[]',                         -- [{item_number, topic, presented_by}]
  resolutions jsonb DEFAULT '[]',                    -- [{resolution_number, text, status: approved|deferred|rejected}]
  action_items jsonb DEFAULT '[]',                   -- [{action, responsible, deadline, status}]
  minutes_file_url text,                             -- uploaded minutes PDF
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(body_id, academic_year, meeting_number)
);

-- 13. Course Syllabi & Teaching Plans (NAAC Criterion 1 — Curricular Aspects)
CREATE TABLE regulatory_course_syllabi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  program_id uuid REFERENCES programs(id),             -- FK to programs table
  department text NOT NULL,
  course_code text NOT NULL,
  course_name text NOT NULL,
  academic_year text NOT NULL CHECK (academic_year ~ '^\d{4}(-\d{2})?$'),
  semester integer,
  syllabus_file_url text,                            -- uploaded syllabus document
  teaching_plan_file_url text,                       -- uploaded teaching plan
  revision_status text DEFAULT 'current' CHECK (revision_status IN ('current','under_revision','archived')),
  revision_date date,
  bos_approval_date date,                            -- Board of Studies approval
  bos_meeting_id uuid REFERENCES regulatory_body_meetings(id), -- FK to Board of Studies meeting
  total_hours integer,                               -- planned teaching hours
  completed_hours integer,                            -- actual hours delivered
  completion_percentage numeric GENERATED ALWAYS AS (
    CASE WHEN total_hours > 0 THEN (completed_hours::numeric / total_hours) * 100 ELSE 0 END
  ) STORED,
  co_mapping jsonb DEFAULT '{}',                     -- {CO1: "description", CO2: "description", ...}
  po_mapping jsonb DEFAULT '[]',                     -- [{co: "CO1", po: "PO1", level: 3}, ...] — NBA attainment
  innovative_methods text,                           -- pedagogical innovations used
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (completed_hours IS NULL OR total_hours IS NULL OR completed_hours <= total_hours),
  UNIQUE(institution_id, course_code, academic_year, semester)
);

-- 14. Peer Institution Benchmarks (NAAC 6.5.3 peer comparison — manual data entry)
CREATE TABLE regulatory_peer_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  framework_id uuid NOT NULL REFERENCES regulatory_frameworks(id),
  academic_year text NOT NULL CHECK (academic_year ~ '^\d{4}(-\d{2})?$'),
  peer_institution_name text NOT NULL,
  peer_institution_nirf_rank integer,
  peer_institution_naac_grade text,
  metric_code text NOT NULL,
  our_value numeric,
  peer_value numeric,
  gap numeric GENERATED ALWAYS AS (our_value - peer_value) STORED,
  data_source text,                              -- "NIRF portal", "peer website", "manual"
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(institution_id, framework_id, academic_year, peer_institution_name, metric_code)
);

-- ═══════════════════════════════════════════════
-- EVIDENCE SEARCH SUPPORT (Full-text + fuzzy search)
-- ═══════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE regulatory_evidence ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(file_name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(evidence_type, '')
    )
  ) STORED;

CREATE INDEX idx_reg_evidence_search ON regulatory_evidence USING GIN (search_vector)
  WHERE is_deleted = false;  -- partial: exclude soft-deleted records from search index
CREATE INDEX idx_reg_evidence_filename_trgm ON regulatory_evidence USING GIN (file_name gin_trgm_ops)
  WHERE is_deleted = false;  -- partial: no need to fuzzy-match deleted file names

-- ═══════════════════════════════════════════════
-- OKR → REGULATORY INTEGRATION (Action Plan tracking)
-- ═══════════════════════════════════════════════

ALTER TABLE okr_objectives ADD COLUMN IF NOT EXISTS regulatory_metric_id uuid REFERENCES regulatory_metrics(id);
ALTER TABLE okr_objectives ADD COLUMN IF NOT EXISTS regulatory_target_value numeric;

-- ═══════════════════════════════════════════════
-- COURSE COMPLETION MONITORING VIEW
-- ═══════════════════════════════════════════════
-- SECURITY NOTE: This view inherits RLS from regulatory_course_syllabi for non-service-role queries.
-- Any API endpoint serving this data MUST filter by institution_id at the application layer
-- (especially if using service-role client, which bypasses RLS on the underlying table).

CREATE OR REPLACE VIEW regulatory_course_completion_dashboard AS
SELECT
  cs.institution_id,
  cs.department,
  cs.academic_year,
  COUNT(*) as total_courses,
  COUNT(CASE WHEN cs.completion_percentage >= 100 THEN 1 END) as completed_courses,
  COUNT(CASE WHEN cs.completion_percentage >= 75 AND cs.completion_percentage < 100 THEN 1 END) as on_track_courses,
  COUNT(CASE WHEN cs.completion_percentage < 75 THEN 1 END) as behind_courses,
  ROUND(AVG(cs.completion_percentage), 1) as avg_completion_pct,
  COUNT(CASE WHEN cs.syllabus_file_url IS NOT NULL THEN 1 END) as syllabi_uploaded,
  COUNT(CASE WHEN cs.teaching_plan_file_url IS NOT NULL THEN 1 END) as plans_uploaded
FROM regulatory_course_syllabi cs
WHERE cs.revision_status = 'current'
GROUP BY cs.institution_id, cs.department, cs.academic_year;

-- ═══════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════

ALTER TABLE regulatory_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_metric_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_metric_value_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_data_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_evidence_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_peer_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_peer_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_governing_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_body_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_course_syllabi ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════
-- RLS POLICIES — Role-based, per T8 permission matrix
-- ═══════════════════════════════════════════════
-- Helper: auth_user_role() returns the user's role string (create alongside auth_institution_id())
-- CREATE FUNCTION auth_user_role() RETURNS text AS $$
--   SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1
-- $$ LANGUAGE sql STABLE SECURITY INVOKER;

-- IMPORTANT: WITH CHECK on UPDATE policies
-- All UPDATE policies on institution-scoped tables MUST include a WITH CHECK clause
-- that verifies institution_id. Without WITH CHECK, a user could mutate institution_id
-- to hijack a record to another tenant. PostgreSQL's USING clause validates the OLD row;
-- WITH CHECK validates the NEW row after mutation.

-- ─── Frameworks: super_admin only for write, all authenticated for read ───
CREATE POLICY "frameworks_read" ON regulatory_frameworks FOR SELECT USING (
  institution_id IS NULL
  OR institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "frameworks_write" ON regulatory_frameworks FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "frameworks_modify" ON regulatory_frameworks FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "frameworks_delete" ON regulatory_frameworks FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- ─── Metric values: role-differentiated per T8 ───
-- T8: View = super_admin, institution_admin, iqac_coordinator, principal, hod
-- T8: Enter = super_admin, institution_admin, iqac_coordinator, hod
-- T8: Override = super_admin, institution_admin, iqac_coordinator (app-layer enforcement for override vs enter)
-- T8: Delete = nobody (use soft-delete; RESTRICT on history FK prevents hard delete anyway)
CREATE POLICY "metric_values_read" ON regulatory_metric_values FOR SELECT USING (
  (institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','institution_admin','iqac_coordinator','principal','hod'))
);
CREATE POLICY "metric_values_insert" ON regulatory_metric_values FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod'))
  );
CREATE POLICY "metric_values_update" ON regulatory_metric_values FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod'))
  )
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod'))
  );
-- No DELETE policy on metric_values — soft-delete only. ON DELETE CASCADE on history FK
-- means framework deletion will cascade through metric_values to history. The framework
-- deletion guard (API layer) must prevent deletion when active submissions exist.

-- ─── Evidence: upload by staff+, delete only via soft-delete ───
-- T8: Upload = super_admin, institution_admin, iqac_coordinator, hod, staff
-- Table has is_deleted + deleted_at for soft-delete — no hard DELETE policy
CREATE POLICY "evidence_read" ON regulatory_evidence FOR SELECT USING (
  (institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  AND (is_deleted = false)  -- soft-deleted records invisible at RLS level
);
CREATE POLICY "evidence_insert" ON regulatory_evidence FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod','staff'))
    AND is_deleted = false  -- prevent inserting pre-deleted evidence (bypasses soft-delete audit trail)
  );
CREATE POLICY "evidence_update" ON regulatory_evidence FOR UPDATE
  USING (
    is_deleted = false  -- prevent blind writes to soft-deleted records
    AND (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  )
  WITH CHECK (
    is_deleted = false  -- prevent restoring via UPDATE (must use restore endpoint)
    AND (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );
-- WITH CHECK prevents mutation of institution_id to a different institution.
-- No DELETE policy — use soft-delete (UPDATE is_deleted = true) instead
-- NOTE: hod and staff CAN insert evidence but CANNOT update or soft-delete it.
-- This is intentional: evidence uploaded for regulatory compliance should require
-- IQAC coordinator review before modification/removal.

-- SOFT-DELETE PROTECTION: The `protect_evidence_soft_delete()` trigger (see IMMUTABILITY
-- TRIGGERS section below) enforces this at the DB level. It prevents non-service-role
-- clients from modifying `is_deleted` or `deleted_at` columns. Only the soft-delete endpoint
-- (DELETE /evidence/[id]) and restore endpoint (PUT /evidence/[id]/restore) — both using
-- service-role client — can toggle these fields.

-- ─── Submissions: controlled workflow, approval restricted ───
-- T8: Generate reports = super_admin, institution_admin, iqac_coordinator
-- T8: Approve submission = super_admin, institution_admin, principal
CREATE POLICY "submissions_read" ON regulatory_submissions FOR SELECT USING (
  (institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','institution_admin','iqac_coordinator','principal','hod'))
  -- hod included for read: T8 grants "View dashboard" to hod, and the dashboard
  -- shows active submission status. hod cannot write/transition submissions (no INSERT/UPDATE policy).
);
CREATE POLICY "submissions_insert" ON regulatory_submissions FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );
CREATE POLICY "submissions_update" ON regulatory_submissions FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','principal'))
  )
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','principal'))
  );
-- NOTE: iqac_coordinator can transition early statuses (draft→data_collection→in_review).
-- The `approved` transition is app-layer enforced: only principal or above can approve.
-- No DELETE policy on submissions — submission records are permanent audit artifacts

-- ─── Simulations: read and create by authorized roles ───
-- T8: Run simulation = super_admin, institution_admin, iqac_coordinator, principal
CREATE POLICY "simulations_read" ON regulatory_simulations FOR SELECT USING (
  (institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','institution_admin','iqac_coordinator','principal'))
);
CREATE POLICY "simulations_insert" ON regulatory_simulations FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','principal'))
  );
-- Simulations: no UPDATE (create new for re-runs), DELETE allowed for cleanup
CREATE POLICY "simulations_delete" ON regulatory_simulations FOR DELETE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );

-- Criteria & metrics: readable by all, writable only by super_admin (framework definitions)
CREATE POLICY "criteria_read" ON regulatory_criteria FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
);
-- Requires authentication but not institution scoping — criteria definitions are
-- framework metadata, not institution-specific data.
CREATE POLICY "criteria_write" ON regulatory_criteria FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "criteria_modify" ON regulatory_criteria FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "criteria_delete" ON regulatory_criteria FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "metrics_read" ON regulatory_metrics FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
);
-- NOTE: All authenticated users can read metric definitions (regulatory criteria are public knowledge).
-- The `data_connector_query` column contains raw SQL that exposes DB schema. The API layer strips
-- this field for non-super_admin (see "Data Connector Query Security Note" in Service Architecture).
-- Defense-in-depth: Consider creating a `regulatory_metrics_safe` view that excludes
-- `data_connector_query` and `data_connector_id`, and have the API query the view for non-admin roles.
CREATE POLICY "metrics_write" ON regulatory_metrics FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "metrics_modify" ON regulatory_metrics FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "metrics_delete" ON regulatory_metrics FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
-- NOTE: No API DELETE endpoint for individual metrics. Metrics are deleted via
-- ON DELETE CASCADE from their parent criteria. CASCADE deletes BYPASS RLS policies
-- entirely (PostgreSQL FK cascades are not subject to RLS checks on the child table).
-- This policy exists only for direct DELETE statements (e.g., admin cleanup).

-- Data connectors: RESTRICTED to super_admin (contains query_template SQL — exposing to other roles leaks DB schema)
CREATE POLICY "connectors_read" ON regulatory_data_connectors FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "connectors_write" ON regulatory_data_connectors FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "connectors_modify" ON regulatory_data_connectors FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "connectors_delete" ON regulatory_data_connectors FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Value history: append-only audit trail, scoped through parent metric_value's institution_id
-- READ restricted to roles that can "View metric values" per T8
CREATE POLICY "value_history_read" ON regulatory_metric_value_history FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM regulatory_metric_values mv
    WHERE mv.id = metric_value_id
    AND (mv.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','institution_admin','iqac_coordinator','principal','hod'))
);
-- INSERT restricted to roles that can write metric values (service-layer writes only)
CREATE POLICY "value_history_insert" ON regulatory_metric_value_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM regulatory_metric_values mv
      WHERE mv.id = metric_value_id
      AND (mv.institution_id = auth_institution_id()
           OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    )
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod'))
  );
-- No UPDATE or DELETE policies on history = immutable audit trail

-- ─── Evidence Versions: append-only version history linked to parent evidence ───
CREATE POLICY "evidence_versions_read" ON regulatory_evidence_versions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM regulatory_evidence e
    WHERE e.id = evidence_id
    AND e.is_deleted = false  -- hide version history of soft-deleted evidence
    AND (e.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
);
CREATE POLICY "evidence_versions_insert" ON regulatory_evidence_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM regulatory_evidence e
      WHERE e.id = evidence_id
      AND e.is_deleted = false  -- block adding versions to soft-deleted evidence
      AND (e.institution_id = auth_institution_id()
           OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    )
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod','staff'))
  );
-- No UPDATE or DELETE on evidence versions — immutable revision trail for DVV/PDV audit

-- ─── Peer Visits: institution-scoped, writable by IQAC/admin roles ───
CREATE POLICY "peer_visits_read" ON regulatory_peer_visits FOR SELECT USING (
  (institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
    ('super_admin','institution_admin','iqac_coordinator','principal'))
);
-- Role-gated: peer visit data (evaluator names, findings, recommendations) is sensitive
-- during active accreditation visits. Staff and hod should not have access.
CREATE POLICY "peer_visits_insert" ON regulatory_peer_visits FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );
CREATE POLICY "peer_visits_update" ON regulatory_peer_visits FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  )
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );
-- No DELETE on peer visits — permanent record of accreditation visits

-- ─── Governing Bodies: institution-scoped, writable by admin roles ───
CREATE POLICY "governing_bodies_read" ON regulatory_governing_bodies FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "governing_bodies_insert" ON regulatory_governing_bodies FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','principal'))
  );
CREATE POLICY "governing_bodies_update" ON regulatory_governing_bodies FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','principal'))
  )
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','principal'))
  );

-- ─── Body Meetings: institution-scoped, writable by IQAC/admin ───
CREATE POLICY "body_meetings_read" ON regulatory_body_meetings FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "body_meetings_insert" ON regulatory_body_meetings FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','principal'))
  );
CREATE POLICY "body_meetings_update" ON regulatory_body_meetings FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','principal'))
  )
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','principal'))
  );
-- No DELETE on meeting minutes — permanent governance record

-- ─── Course Syllabi: institution-scoped, writable by academic roles ───
CREATE POLICY "syllabi_read" ON regulatory_course_syllabi FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "syllabi_insert" ON regulatory_course_syllabi FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod','staff'))
  );
CREATE POLICY "syllabi_update" ON regulatory_course_syllabi FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod','staff'))
  )
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator','hod','staff'))
  );

-- ─── Peer Benchmarks: institution-scoped, writable by IQAC/admin roles ───
CREATE POLICY "benchmarks_read" ON regulatory_peer_benchmarks FOR SELECT USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "benchmarks_insert" ON regulatory_peer_benchmarks FOR INSERT
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );
CREATE POLICY "benchmarks_update" ON regulatory_peer_benchmarks FOR UPDATE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  )
  WITH CHECK (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );
CREATE POLICY "benchmarks_delete" ON regulatory_peer_benchmarks FOR DELETE
  USING (
    (institution_id = auth_institution_id()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN
      ('super_admin','institution_admin','iqac_coordinator'))
  );

-- ═══════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════

CREATE INDEX idx_reg_criteria_framework ON regulatory_criteria(framework_id);
CREATE INDEX idx_reg_criteria_parent ON regulatory_criteria(parent_criteria_id);
CREATE INDEX idx_reg_metrics_criteria ON regulatory_metrics(criteria_id);
-- NOTE: metric_values UNIQUE(metric_id, institution_id, academic_year) already creates an implicit index
CREATE INDEX idx_reg_metric_values_inst_year ON regulatory_metric_values(institution_id, academic_year);
CREATE INDEX idx_reg_value_history_metric_value ON regulatory_metric_value_history(metric_value_id, created_at DESC);
-- Composite index: metric_value_id for lookup + created_at DESC for paginated history queries.
CREATE INDEX idx_reg_evidence_metric ON regulatory_evidence(metric_id, institution_id, academic_year);
CREATE INDEX idx_reg_evidence_criteria ON regulatory_evidence(criteria_id, institution_id, academic_year);
CREATE INDEX idx_reg_evidence_submission ON regulatory_evidence(submission_id) WHERE submission_id IS NOT NULL;
CREATE INDEX idx_reg_evidence_active ON regulatory_evidence(institution_id, academic_year) WHERE is_deleted = false;
-- NOTE: submissions UNIQUE(framework_id, institution_id, academic_year) already creates an implicit index
CREATE INDEX idx_reg_simulations_framework ON regulatory_simulations(framework_id, institution_id);
-- NOTE: evidence_versions UNIQUE(evidence_id, version_number) already creates an implicit index
CREATE INDEX idx_reg_peer_visits_submission ON regulatory_peer_visits(submission_id, institution_id)
  WHERE submission_id IS NOT NULL;
-- Partial index: exploratory visits (submission_id=NULL) don't need this lookup path.
CREATE INDEX idx_reg_peer_visits_status ON regulatory_peer_visits(institution_id, status);
CREATE INDEX idx_reg_governing_bodies_inst ON regulatory_governing_bodies(institution_id, body_type);
-- NOTE: body_meetings UNIQUE(body_id, academic_year, meeting_number) already creates an implicit index
CREATE INDEX idx_reg_body_meetings_inst_year ON regulatory_body_meetings(institution_id, academic_year);
-- NOTE: course_syllabi UNIQUE(institution_id, course_code, academic_year, semester) already creates an implicit index.
-- However, semester is nullable — PostgreSQL UNIQUE treats NULL != NULL, so add a partial index
-- to prevent duplicate rows with NULL semester for the same (institution, course, year):
CREATE UNIQUE INDEX idx_reg_syllabi_no_semester ON regulatory_course_syllabi
  (institution_id, course_code, academic_year) WHERE semester IS NULL;
CREATE INDEX idx_reg_syllabi_dept ON regulatory_course_syllabi(institution_id, department, academic_year);
-- NOTE: peer_benchmarks UNIQUE(institution_id, framework_id, academic_year, peer_institution_name, metric_code) already creates an implicit index
CREATE INDEX idx_reg_benchmarks_inst_framework ON regulatory_peer_benchmarks(institution_id, framework_id, academic_year);

-- Evidence: prevent duplicate uploads for the same metric+institution+year+file
CREATE UNIQUE INDEX idx_reg_evidence_no_dup ON regulatory_evidence(metric_id, institution_id, academic_year, file_name)
  WHERE is_deleted = false AND metric_id IS NOT NULL;

-- Evidence: lookup by uploader (for "my uploads" view)
CREATE INDEX idx_reg_evidence_uploaded_by ON regulatory_evidence(uploaded_by, institution_id)
  WHERE is_deleted = false;

-- Course syllabi: optimized lookup for current-year courses (used by completion dashboard view)
CREATE INDEX idx_reg_syllabi_current ON regulatory_course_syllabi(institution_id, academic_year)
  WHERE revision_status = 'current';

-- ═══════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════

-- Auto-update updated_at on all tables that have the column.
-- Requires the moddatetime extension (already enabled in Supabase by default).
CREATE EXTENSION IF NOT EXISTS moddatetime;

CREATE TRIGGER trg_frameworks_updated_at BEFORE UPDATE ON regulatory_frameworks
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_criteria_updated_at BEFORE UPDATE ON regulatory_criteria
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_metrics_updated_at BEFORE UPDATE ON regulatory_metrics
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_metric_values_updated_at BEFORE UPDATE ON regulatory_metric_values
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_evidence_updated_at BEFORE UPDATE ON regulatory_evidence
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_submissions_updated_at BEFORE UPDATE ON regulatory_submissions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_connectors_updated_at BEFORE UPDATE ON regulatory_data_connectors
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_peer_visits_updated_at BEFORE UPDATE ON regulatory_peer_visits
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_governing_bodies_updated_at BEFORE UPDATE ON regulatory_governing_bodies
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_body_meetings_updated_at BEFORE UPDATE ON regulatory_body_meetings
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_syllabi_updated_at BEFORE UPDATE ON regulatory_course_syllabi
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER trg_benchmarks_updated_at BEFORE UPDATE ON regulatory_peer_benchmarks
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- ═══════════════════════════════════════════════
-- IMMUTABILITY TRIGGERS (defense-in-depth — fires regardless of RLS bypass)
-- ═══════════════════════════════════════════════

-- Metric value history is append-only. This trigger prevents mutation even from service-role clients.
CREATE OR REPLACE FUNCTION prevent_history_mutation()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'regulatory_metric_value_history is append-only. UPDATE and DELETE are prohibited.';
END;
$$;

CREATE TRIGGER trg_history_immutable
  BEFORE UPDATE OR DELETE ON regulatory_metric_value_history
  FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();

-- Evidence soft-delete protection trigger
-- Prevents non-service-role clients from directly modifying is_deleted/deleted_at.
-- Only the soft-delete endpoint (DELETE /evidence/[id]) and restore endpoint
-- (PUT /evidence/[id]/restore) — both using service-role client — should toggle these fields.
CREATE OR REPLACE FUNCTION protect_evidence_soft_delete()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted
      OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) THEN
    -- Allow service_role (PostgREST proxy) and supabase_admin (direct DB access / migrations)
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND current_user != 'supabase_admin' THEN
      RAISE EXCEPTION 'Direct modification of is_deleted/deleted_at is prohibited. Use the soft-delete or restore API endpoint.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Note: The WHEN clause optimizes performance — trigger function only fires when
-- soft-delete columns actually change, skipping the function call for all other UPDATEs.
CREATE TRIGGER trg_evidence_soft_delete_guard
  BEFORE UPDATE ON regulatory_evidence
  FOR EACH ROW
  WHEN (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION protect_evidence_soft_delete();
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4) — P0

> **Architecture:** All code follows Pattern A (Page → Hook → API Route → Service → DB).
> API routes are built FIRST, then hooks, then pages. No direct Supabase calls in hooks.

```
Week 1: Database + API Layer Foundation
├── Day 1-2: Apply migration (16 new tables + 1 view + RLS + indexes + search extensions)
├── Day 3: Build shared utilities (regulatory-utils.ts) + API auth helper
├── Day 4: API routes for frameworks (GET list, GET detail, POST, PUT, DELETE)
│           + Service: RegulatoryFrameworkService + RegulatoryCriteriaService
│           + Hooks: useFrameworks, useFramework, useCreateFramework, etc.
├── Day 5: API routes for metrics + metric-values (GET, POST upsert)
│           + Service: RegulatoryMetricService
│           + Hooks: useMetrics, useMetricValues, useUpsertMetricValue
│           + Seed frameworks: NAAC 2022, NIRF Overall + 6 discipline, NAAC Binary × 3,
│             NAAC MBGL × 3, NAAC IIQA, NAAC AQAR (20 total pre-configured frameworks)

Week 2: Data Connectors + Evidence API
├── Day 1: API routes for data-connectors (GET, POST test, POST refresh)
│           + Service: RegulatoryDataConnectorService + DataConnectorEngine
├── Day 2-3: Build DC-01 through DC-10 connector SQL queries
├── Day 4: Build DC-11 through DC-15 connector SQL queries
├── Day 5: API routes for evidence (GET, POST upload, GET search, PUT, DELETE soft)
│           + API routes for evidence versions (GET, POST)
│           + Service: RegulatoryEvidenceService
│           + Hooks: useEvidence, useSearchEvidence, useUploadEvidence

Week 3: Metric Engine + Governance API
├── Day 1-2: Auto-refresh endpoint (POST /api/regulatory/metric-values/refresh)
│             Runs all connectors → populates metric_values → records history
├── Day 3: Formula engine — evaluates cross-metric formulas server-side
├── Day 4: API routes for governing-bodies + meetings (GET, POST, PUT, approve)
│           + Service: RegulatoryGovernanceService
│           + Hooks: useGoverningBodies, useMeetings, etc.
├── Day 5: API routes for peer-visits + syllabi (GET, POST, PUT)
│           + Services + Hooks for both entities

Week 4: Core UI Pages + Sidebar Integration
├── Day 1: Add sidebar entry (sidebarMenuLink.ts) + module layout wrapper
│           + Dashboard page (calls GET /api/regulatory/dashboard/stats + deadlines)
│           + Dashboard API routes + RegulatoryDashboardService
├── Day 2: Framework list page + framework detail page (criteria tree, evidence panel)
├── Day 3: Metrics page (inline value editing, auto/manual indicators)
├── Day 4: Submissions API routes + page (status workflow, transition buttons)
│           + Score calculation endpoint (POST, mutation-based)
├── Day 5: Governance page (4-tab: bodies, meetings, syllabi, peer visits)
│           + Seed NBA SAR + AICTE + UGC-AISHE frameworks
```

### Phase 2: Intelligence (Weeks 5-7) — P1

```
Week 5: Dashboard + Benchmarks + Evidence Search
├── Day 1-2: Dashboard completeness chart (per-module data completeness API)
│             Data source health page (connector status, last test, errors)
├── Day 3-4: Benchmarks API routes + page (gap analysis chart, peer comparison)
│             + Service: RegulatoryBenchmarkService
│             + Hooks: useBenchmarks, useBenchmarkComparison, etc.
├── Day 5: Evidence repository page (full-text search, fuzzy matching)

Week 6: Score Simulation
├── Day 1-2: Simulations API routes + service (server-side score computation)
│             Criteria scores computed from metric_values (NOT from phantom fields)
├── Day 3-4: Simulator UI (adjust metrics, see score/rank impact, save scenarios)
├── Day 5: Year-over-year comparison view + historical trend charts

Week 7: Report Generation
├── Day 1-2: NAAC AQAR PDF template + generation engine (react-pdf / puppeteer)
│             Report generation API route: POST /api/regulatory/submissions/[id]/report
├── Day 3-4: NIRF data export (portal-compatible CSV/JSON)
│             NAAC DVV data export (Excel with evidence links)
├── Day 5: Submission workflow refinement + notification on status transitions
```

### Phase 3: Self-Service & Scale (Weeks 8-10) — P2

```
Week 8: Admin Config UI
├── Day 1-2: Framework creation wizard (name, body, version, year type)
├── Day 3-4: Criteria tree builder (drag-drop hierarchy, weights)
├── Day 5: Metric definition form (data type, formula, connector mapping)

Week 9: Advanced Features
├── Day 1-2: Cross-institution comparison view (super_admin)
├── Day 3-4: NBA program-level view (per-program submission)
│             DVV query tracking UI (regulatory_dvv_queries CRUD + status workflow)
├── Day 5: Peer institution benchmarking data import (batch upload)
│           Bulk metric value import: POST /api/regulatory/metric-values/bulk-import
│           (CSV with columns: metric_code, academic_year, value, notes; validation + dry-run mode)
│           Essential for loading historical 5-year data at system launch.

Week 10: Polish & Handoff
├── Day 1: AICTE mandatory disclosure template + AISHE export
├── Day 2: Upload dialogs wired (evidence panel, metric table)
│           File upload via Supabase Storage presigned URLs
├── Day 3: Performance optimization (connector caching, batch refresh)
│           Deadline alert notifications integrated with MyJKKN notification system.
│           Configure alert thresholds at 90, 60, 30, and 7 days before submission_deadline.
│           Department metric assignment notifications (due date reminders for HODs).
├── Day 4-5: Documentation, admin training guide, UAT
│             FOROMM.md creation for the module
```

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Data quality issues in existing tables | High | Medium | Show data completeness %, flag anomalies, allow manual override |
| Connector queries too slow on large tables | Medium | Medium | Cache metric values, refresh on schedule (not real-time) |
| NAAC criteria interpretation ambiguity | Medium | High | Include `dvv_guidance` text field, link to official NAAC manual |
| Formula engine edge cases (divide by zero, NULL) | Medium | Low | Null-safe expressions, default to 0 with warning |
| Admin misconfigures framework weights | Low | High | Validation: weights must sum to 100% at each level |
| Regulatory body changes mid-implementation | Low | Medium | Build config-first — any framework can be modified without code |

---

## Pre-Built Framework Templates

Ship with these 20 frameworks pre-configured (seeded in migration):

### NAAC 2022 Revised — Full Metric-Level Breakdown (7 Criteria, 56 Metrics)

> **Framework Status:** Currently active for institutions in the existing NAAC cycle. Being phased out in favor of the Binary 2024 framework (below). Both must be supported — the engine seeds both as separate `regulatory_frameworks` rows.

> **Source:** `NAACManual.txt` — NAAC Quality Indicator Framework (QIF) for Autonomous Colleges
> **Scoring:** Each criterion has QlM (Qualitative — narrative + evidence) and QnM (Quantitative — data-driven) metrics
> **Grading:** Individual metric scores → Key Indicator GPA → Criterion GPA → Overall CGPA (1.00–4.00) → Grade (A++/A+/A/B++/B+/B/C)
> **DVV:** All QnM metrics undergo Data Validation & Verification by NAAC before peer team visit
> **Note:** Weights shown are from the NAAC QIF Manual. Autonomous, Affiliated, and University variants share identical metric codes but have different criterion-level weights. The engine stores per-institution-type weights in `regulatory_criteria.weight` (criterion-level weights).

#### Criterion Summary

| Criteria | Name | Weight | KIs | Metrics | QlM | QnM |
|----------|------|--------|-----|---------|-----|-----|
| I | Curricular Aspects | 150 | 4 | 6 | 2 | 4 |
| II | Teaching-Learning & Evaluation | 350 | 7 | 11 | 4 | 7 |
| III | Research, Innovations & Extension | 110 | 5 | 9 | 3 | 6 |
| IV | Infrastructure & Learning Resources | 100 | 4 | 6 | 3 | 3 |
| V | Student Support & Progression | 140 | 4 | 9 | 1 | 8 |
| VI | Governance, Leadership & Management | 100 | 5 | 9 | 5 | 4 |
| VII | Institutional Values & Best Practices | 100 | 3 | 6 | 4 | 2 |
| **TOTAL** | | **1050** | **32** | **56** | **22** | **34** |

#### Criterion I — Curricular Aspects (150 marks)

| Metric | KI | Type | Weight | Description | Data Source (MyJKKN) |
|--------|-----|------|--------|-------------|---------------------|
| 1.1.1 | 1.1 Curricular Planning (70) | QlM | 70 | Curriculum design & development process | Manual entry (qualitative) |
| 1.2.1 | 1.2 Academic Flexibility (30) | QnM | 15 | Number of Add-on/Certificate/Value-added + MOOC programs (5 years) | DC-12: `vac_courses`, DC-29: `online_education_tracking` |
| 1.2.2 | 1.2 | QnM | 15 | % students enrolled in Certificate/Add-on/MOOC programs (5 years) | DC-12: `vac_enrollments`, DC-29 |
| 1.3.1 | 1.3 Curriculum Enrichment (30) | QlM | 20 | Crosscutting issues: ethics, gender, environment, sustainability | Manual entry (qualitative) |
| 1.3.2 | 1.3 | QnM | 10 | % students in project work/field work/internships | DC-01: `learners_profiles`, DC-08: `industry_partners` |
| 1.4.1 | 1.4 Feedback System (20) | QnM | 20 | Stakeholder feedback: collected, analysed, action taken, published (A-E scale) | DC-10: `nps_surveys`, `nps_responses` |

#### Criterion II — Teaching-Learning & Evaluation (350 marks)

| Metric | KI | Type | Weight | Description | Data Source (MyJKKN) |
|--------|-----|------|--------|-------------|---------------------|
| 2.1.1 | 2.1 Student Enrolment (40) | QnM | 20 | Enrolment % (admitted vs sanctioned seats, 5 years) | DC-01: `learners_profiles`, DC-05: `admissions`, `programs` |
| 2.1.2 | 2.1 | QnM | 20 | % seats filled against reserved categories (SC/ST/OBC, 5 years) | DC-01: `learners_profiles` (community field), DC-05: `admissions` + `institution_seat_config` |
| 2.2.1 | 2.2 Student-Teacher Ratio (40) | QnM | 40 | Student : Full-time teacher ratio (latest year) | DC-01 + DC-02: `staff` |
| 2.3.1 | 2.3 Teaching-Learning Process (40) | QlM | 40 | Student-centric methods: experiential, participative, ICT-enabled | Manual entry (qualitative) |
| 2.4.1 | 2.4 Teacher Profile & Quality (40) | QnM | 20 | % full-time teachers against sanctioned posts (5 years) | DC-02: `staff` |
| 2.4.2 | 2.4 | QnM | 20 | % full-time teachers with NET/SET/PhD/D.Sc./D.Litt. (5 years) | DC-16: `staff_qualifications` (NEW) |
| 2.5.1 | 2.5 Evaluation Process (40) | QlM | 40 | Transparent internal/external assessment & grievance redressal | Manual entry (qualitative) |
| 2.6.1 | 2.6 Student Performance (90) | QlM | 25 | Programme Outcomes (POs) & Course Outcomes (COs) stated, displayed, evaluated | DC-11: `competency_catalog`, `course_competency_mapping` |
| 2.6.2 | 2.6 | QlM | 20 | Attainment of POs and COs evaluated with evidence | DC-11 |
| 2.6.3 | 2.6 | QnM | 45 | Pass % of students (5-year data) | DC-17: `exam_results` (NEW) |
| 2.7.1 | 2.7 Student Satisfaction Survey (60) | QnM | 60 | Online student satisfaction survey (NAAC-conducted) | DC-10: `nps_surveys` (partial) + external NAAC survey |

#### Criterion III — Research, Innovations & Extension (110 marks)

| Metric | KI | Type | Weight | Description | Data Source (MyJKKN) |
|--------|-----|------|--------|-------------|---------------------|
| 3.1.1 | 3.1 Resource Mobilization (10) | QnM | 10 | Research grants from govt/non-govt agencies (INR Lakhs, 5 years) | DC-18: `research_projects` (NEW) |
| 3.2.1 | 3.2 Innovation Ecosystem (15) | QlM | 10 | Innovation ecosystem: patents filed, incubation centres, knowledge transfer | DC-19: `patents_ipr` (NEW) + Manual |
| 3.2.2 | 3.2 | QnM | 5 | Workshops/seminars on Research Methodology, IPR, entrepreneurship (5 years) | DC-02: `facilitator_development` ✅ |
| 3.3.1 | 3.3 Research Publications (25) | QnM | 10 | Research papers per teacher in UGC CARE-listed journals (5 years) | DC-03: `sh_publications` ✅ |
| 3.3.2 | 3.3 | QnM | 15 | Books/chapters/conference proceedings published per teacher (5 years) | DC-03: `sh_publications` ✅ |
| 3.4.1 | 3.4 Extension Activities (40) | QlM | 15 | Extension activities in neighbourhood community for holistic development | Manual entry (qualitative) |
| 3.4.2 | 3.4 | QlM | 5 | Awards/recognitions for extension from government bodies | Manual entry (qualitative) |
| 3.4.3 | 3.4 | QnM | 20 | Extension/outreach programs via NSS/NCC/industry/NGO collaboration (5 years) | DC-25: `student_activities`, DC-22: `institutional_events` |
| 3.5.1 | 3.5 Collaboration (20) | QnM | 20 | MoUs/collaborations for exchange, internship, research, training (5 years) | DC-08: `industry_partners` ✅, DC-36: `collaboration_exchanges` |

#### Criterion IV — Infrastructure & Learning Resources (100 marks)

| Metric | KI | Type | Weight | Description | Data Source (MyJKKN) |
|--------|-----|------|--------|-------------|---------------------|
| 4.1.1 | 4.1 Physical Facilities (30) | QlM | 20 | Adequacy of classrooms, labs, ICT, sports, yoga, gymnasium | DC-14: `resources` (partial) + Manual |
| 4.1.2 | 4.1 | QnM | 10 | % expenditure on infrastructure augmentation excluding salary (5 years) | DC-21: `institutional_budgets` (NEW) |
| 4.2.1 | 4.2 Library (20) | QlM | 20 | Library automation (ILMS), e-resources, OER, book/journal purchases | DC-20: `library_holdings` (NEW) + Manual |
| 4.3.1 | 4.3 IT Infrastructure (30) | QlM | 20 | IT facilities, update frequency, internet bandwidth | DC-28: `ict_infrastructure` (NEW) + Manual |
| 4.3.2 | 4.3 | QnM | 10 | Student : Computer ratio (latest year) | DC-28: `ict_infrastructure` (NEW) |
| 4.4.1 | 4.4 Campus Maintenance (20) | QnM | 20 | % expenditure on infrastructure maintenance excluding salary (5 years) | DC-21: `institutional_budgets` (NEW) |

#### Criterion V — Student Support & Progression (140 marks)

| Metric | KI | Type | Weight | Description | Data Source (MyJKKN) |
|--------|-----|------|--------|-------------|---------------------|
| 5.1.1 | 5.1 Student Support (50) | QnM | 20 | % students with scholarships/freeships from govt/non-govt (5 years) | DC-09: `scholarships` ✅ |
| 5.1.2 | 5.1 | QnM | 10 | Capacity building: soft skills, language, life skills, ICT/computing (A-E) | DC-12: `vac_courses` (skill programs) |
| 5.1.3 | 5.1 | QnM | 10 | % students benefitted by competitive exam guidance & career counseling | DC-25: `career_services` (NEW) |
| 5.1.4 | 5.1 | QnM | 10 | Grievance redressal: sexual harassment, ragging mechanisms (A-E) | DC-09: `grievance_tickets` ✅ |
| 5.2.1 | 5.2 Student Progression (35) | QnM | 25 | % outgoing students placed or progressing to higher education (5 years) | DC-04: `alumni_outcomes` ✅ |
| 5.2.2 | 5.2 | QnM | 10 | % students qualifying in JAM/CLAT/GATE/GMAT/CAT/GRE/Civil Services | DC-17: `exam_results` (NEW — qualifying exams) |
| 5.3.1 | 5.3 Student Activities (45) | QnM | 20 | Awards/medals for sports/cultural at university/state/national/international | DC-25: `student_activities`, DC-23: `awards_recognitions` |
| 5.3.2 | 5.3 | QnM | 25 | Average sports/cultural programs with student participation (5 years) | DC-25: `student_activities` |
| 5.4.1 | 5.4 Alumni Engagement (10) | QlM | 10 | Registered Alumni Association contributions (financial/other) | DC-04: `alumni_outcomes` (partial) + Manual |

#### Criterion VI — Governance, Leadership & Management (100 marks)

| Metric | KI | Type | Weight | Description | Data Source (MyJKKN) |
|--------|-----|------|--------|-------------|---------------------|
| 6.1.1 | 6.1 Vision & Leadership (15) | QlM | 15 | Governance aligned with vision/mission, decentralization, participation | DC-10: `okr_objectives` (partial) + Manual |
| 6.2.1 | 6.2 Strategy Development (12) | QlM | 8 | Effective institutional bodies, policies, strategic/perspective plan | Manual entry (qualitative) |
| 6.2.2 | 6.2 | QnM | 4 | e-Governance: Admin, Finance, Admissions, Exams (A-E scale) | MyJKKN itself is evidence ✅ |
| 6.3.1 | 6.3 Faculty Empowerment (33) | QlM | 6 | Welfare measures & performance appraisal system | DC-02: `staff` (welfare) + Manual |
| 6.3.2 | 6.3 | QnM | 12 | % teachers with financial support for conferences/professional memberships | DC-02: `facilitator_development` ✅ |
| 6.3.3 | 6.3 | QnM | 15 | % teaching & non-teaching staff in FDPs/professional development (5 years) | DC-02: `facilitator_development` ✅ |
| 6.4.1 | 6.4 Financial Management (10) | QlM | 10 | Resource mobilization strategies, regular financial audits (internal/external) | DC-33: `financial_audits` (NEW) + Manual |
| 6.5.1 | 6.5 IQAS (30) | QlM | 15 | IQAC contribution to quality strategies, reviews, incremental improvement | DC-24: `iqac_meetings` (NEW) + Manual |
| 6.5.2 | 6.5 | QnM | 15 | Quality initiatives: IQAC meetings, NIRF participation, NBA/other accreditation | DC-24: `iqac_meetings` (NEW) |

#### Criterion VII — Institutional Values & Best Practices (100 marks)

| Metric | KI | Type | Weight | Description | Data Source (MyJKKN) |
|--------|-----|------|--------|-------------|---------------------|
| 7.1.1 | 7.1 Values & Social Responsibility (50) | QlM | 10 | Gender equity promotion, national/international day celebrations | Manual entry (qualitative) |
| 7.1.2 | 7.1 | QnM | 20 | Environmental: alternate energy, waste management, water conservation, green campus, disabled-friendly (A-E) | DC-32: `environmental_initiatives` (NEW) |
| 7.1.3 | 7.1 | QnM | 10 | Quality audits: green audit, energy audit, clean campus, sustainability (A-E) | DC-32: `environmental_initiatives` (NEW) |
| 7.1.4 | 7.1 | QlM | 10 | Inclusivity, tolerance, harmony, constitutional obligations, human values | Manual entry (qualitative) |
| 7.2.1 | 7.2 Best Practices (30) | QlM | 30 | Two best practices in NAAC prescribed format (7-section structure) | Manual entry (qualitative) |
| 7.3.1 | 7.3 Institutional Distinctiveness (20) | QlM | 20 | Distinctive performance in one priority area (1000 words) | Manual entry (qualitative) |

#### NAAC 2022 Coverage Estimate (from MyJKKN)

```
QnM metrics auto-calculable:     ~20/34 = 59%  (remaining need new tables or external data)
QlM metrics with partial data:    ~8/22  = 36%  (rest purely qualitative)
Overall data coverage:            ~28/56 = 50%  (existing tables + partial coverage)
After all new tables built:       ~33/56 = 59%  (remaining 23: 22 QlM narratives + 2.7.1 external NAAC survey)
```

**Key data gaps for NAAC 2022 submission:**
- `exam_results` table needed for 2.6.3 (Pass %, 45 marks) and 5.2.2 (qualifying exams, 10 marks)
- `staff_qualifications` table needed for 2.4.2 (PhD %, 20 marks)
- `research_projects` table needed for 3.1.1 (grants, 10 marks)
- `institutional_budgets` table needed for 4.1.2, 4.4.1 (infrastructure spending, 30 marks)
- Student Satisfaction Survey (2.7.1, 60 marks) — conducted by NAAC, not institution-generated

### NIRF 2025 Overall (5 Parameters — from Official NIRF 2025 Methodology PDF)

> **Source:** `nirf parameters and ranking.pdf` — NIRF India Rankings 2025, Ministry of HRD
> **Ranking Agency:** NBA (National Board of Accreditation) on behalf of NIRF
> **Eligibility:** Minimum 1000 students (UG + PG), 3 batches graduated

| Parameter | Weight | Sub-Parameters (Marks) | Primary Data Connectors |
|-----------|--------|------------------------|------------------------|
| TLR (Teaching, Learning & Resources) | 0.30 | SS(20), FSR(25), FQE(20), FRU(20), OE(10), MIR(5) | DC-01, DC-02, DC-06, DC-16, DC-21, DC-29, DC-30 |
| RP (Research & Professional Practice) | 0.30 | PU(35), QP(35), IPR(15), FPPP(15) | DC-03, DC-18, DC-19 |
| GO (Graduation Outcomes) | 0.20 | GUE(60), GPHD(40) | DC-17, DC-31 |
| OI (Outreach & Inclusivity) | 0.10 | RD(30), WD(30), ESCS(20), PCS(20) | DC-01, DC-09, DC-26 |
| Perception (PR) | 0.10 | PR(100) — Academic Peers & Employers | External (NIRF-conducted survey) |

**Perception Parameter (PR, 10% weight):** Perception metrics are `is_auto_calculable = false` with guidance: "Enter NIRF-published perception score after rankings are declared." The simulation engine uses last year's perception value as default for what-if analysis, since the institution cannot directly control this parameter — it is derived from NIRF's peer/employer survey.

**IMPORTANT for Overall category:** GO uses GUE (exam results) + GPHD (PhD graduates) ONLY. Placement/salary are NOT sub-parameters in Overall — they apply in discipline-specific rankings.

**TLR sub-parameter details (Overall category):**
- SS = Student Strength including Doctoral Students (20 marks)
- FSR = Faculty-student ratio, emphasis on permanent faculty (25 marks)
- FQE = Faculty with PhD (or equivalent) and Experience (20 marks)
- FRU = Financial Resources and their Utilisation (20 marks)
- OE = Online Education: Online Completion of Syllabus & Exams and Swayam (10 marks) [NEP 2020]
- MIR = Multiple Entry/exit, Indian Knowledge System, Regional Languages (5 marks) [NEP 2020] — also abbreviated MIRS in some documents
- **Sum check:** SS(20) + FSR(25) + FQE(20) + FRU(20) + OE(10) + MIR(5) = **100 marks** ✓
- **⚠️ VERIFY AT IMPLEMENTATION:** Some discipline-specific NIRF docs show FSR=30/FRU=30 for Engineering/Pharmacy/Colleges/Medical. If the official Overall document is updated to match (FSR=30/FRU=30), then OE+MIR must be absorbed into the base 4 sub-params. Check the NIRF 2025 Overall PDF at implementation time and update seed data accordingly. The engine's config-driven design handles this without code changes.

**Footnotes from official document:**
- For State Public Universities, FSR is 1:20
- For Universities/State Public Universities, Perception = 70% Peer + 30% Accreditation
- Research/Patent data may be pulled from Scopus/WoS directly by NIRF

### NAAC Binary Accreditation 2024 (10 Attributes — from NAAC Reforms Workshop & Radhakrishnan Committee Report)

> **Source:** `NAAC Reforms 2024.pdf` — Binary Accreditation Framework Workshop (July 2024)
> **Also:** `DrRadhakrishnanCommittee-FinalReport.pdf` — Ministry of Education (November 2023)
> **Outcome:** Binary — Accredited / Awaiting Accreditation / Not Accredited. Institutions that pass Binary proceed to MBGL grading (Level 1-5)
> **Total Score:** 900 points (all institution types sum to 900, but weight distribution differs)
> **Validity:** 3 years (not 5 years as under the old system). Set `validity_period_years = 3` in the framework row.
> **Key Difference from Old:** Institution-type-specific scoring — University, Autonomous College, and Affiliated College each get different max scores per attribute

**Why 3 Framework Variants Are Needed:**
The `regulatory_frameworks` table now has `institution_type` column. Seed 3 variants with pass thresholds:
- `NAAC Binary 2024` + `institution_type = 'university'` — `pass_threshold = 540` (60% of 900)
- `NAAC Binary 2024` + `institution_type = 'autonomous_college'` — `pass_threshold = 450` (50% of 900) ← **JKKN institutions use this**
- `NAAC Binary 2024` + `institution_type = 'affiliated_college'` — `pass_threshold = 360` (40% of 900)

> **Schema addition (see Database Schema section):** Add `pass_threshold numeric` to `regulatory_frameworks`. The dashboard and simulation must prominently display: current estimated score vs threshold, with a color-coded gap indicator (red = below threshold, green = above threshold).

#### Attribute Summary (Scores: University / Autonomous / Affiliated)

| # | Attribute | Uni | Auto | Affil | Metrics | Primary Data Connectors |
|---|-----------|-----|------|-------|---------|------------------------|
| 1 | Curriculum | 75 | 75 | 50 | 8 | DC-01, DC-27, DC-29, DC-30 |
| 2 | Faculty Resources | 50 | 50 | 100 | 3 | DC-02, DC-16 |
| 3 | Infrastructure | 50 | 50 | 75 | 6 | DC-14, DC-20, DC-28, DC-26 |
| 4 | Financial Resources & Management | 50 | 50 | 50 | 4 | DC-21, DC-33 |
| 5 | Learning & Teaching | 125 | 150 | 150 | 7 | DC-01, DC-05, DC-29 |
| 6 | Extended Curricular Engagements | 100 | 125 | 125 | 6 | DC-25 (new: `student_activities`) |
| 7 | Governance & Administration | 100 | 100 | 125 | 10 | DC-08, DC-24, DC-26 |
| 8 | Student Outcomes | 150 | 125 | 100 | 5 | DC-01, DC-04, DC-17, DC-23 |
| 9 | Research & Innovation Outcomes | 125 | 100 | 50 | 7 | DC-03, DC-18, DC-19, DC-31 |
| 10 | Sustainability Outcomes & Green Initiatives | 75 | 75 | 75 | 4 | DC-32 (`environmental_initiatives`) |
| | **TOTAL** | **900** | **900** | **900** | **60*** | |

> *\*60 metrics including 8.2b (Pass Percentage, Affiliated-only). For Autonomous Colleges, 4 are N/A (3.6, 7.4, 8.2b, 9.5), leaving 56 applicable metrics.*

#### Detailed Attribute Breakdown (Autonomous College — JKKN's Type)

**Attribute 1: Curriculum (75 pts)**
| Metric | Score | Evidence Type | Data Source |
|--------|-------|---------------|-------------|
| 1.1 Outcome-based curriculum (OBE) | 15 | Document + Data | `competency_catalog`, `course_competency_mapping` |
| 1.2 Stakeholder Participation | 10 | Document + Data | `nps_surveys` (tag by stakeholder type) |
| 1.3 Curriculum Flexibility (CBCS — Choice Based Credit System, MEME — Multiple Entry Multiple Exit, ABC — Academic Bank of Credits) | 10 | Document + Data | `nep_compliance_tracking` (NEW) |
| 1.4 Practical & Industry Focus | 10 | Data | `courses` (skill %), `learner_industry_engagements` |
| 1.5 Skill Orientation (NSQF — National Skills Qualifications Framework, NHEQF — National Higher Education Qualifications Framework) | 10 | Document | Manual entry + evidence |
| 1.6 Indian Knowledge System (IKS) | 5 | Document + Data | `nep_compliance_tracking` (NEW) |
| 1.7 Online & Blended Learning (SWAYAM) | 5 | Data | `online_education_tracking` (NEW) |
| 1.8 Curriculum Revision | 10 | Data | `curriculum_revisions` (NEW) |

**Attribute 2: Faculty Resources (50 pts)**
| Metric | Score | Evidence Type | Data Source |
|--------|-------|---------------|-------------|
| 2.1 Faculty Student Ratio | 10 | Data (auto-calc) | `staff` + `learners_profiles` |
| 2.2 Faculty Quality (PhD %, experience) | 25 | Data | `staff_qualifications` (NEW) |
| 2.3 Faculty Development (FDP, conferences) | 15 | Data | `facilitator_development` ✅ |

**Attribute 3: Infrastructure (50 pts)**
| Metric | Score | Evidence Type | Data Source |
|--------|-------|---------------|-------------|
| 3.1 Physical Infrastructure | 10 | Document + Data | `resources` (partial) |
| 3.2 Learning Resources (library) | 10 | Data | `library_holdings` (NEW) |
| 3.3 Research Resources (e-journals, databases) | 15 | Data | `library_e_resources` (NEW) |
| 3.4 IT Infrastructure | 10 | Data | `ict_infrastructure` (NEW) |
| 3.5 Divyangjan Facilities | 5 | Document (binary) | `inclusivity_facilities` (NEW) |
| 3.6 Innovation Resources (tinkering labs, incubators) | N/A | — | N/A for Autonomous College (University only) |

**Attribute 4: Financial Resources & Management (50 pts)**
| Metric | Score | Evidence Type | Data Source |
|--------|-------|---------------|-------------|
| 4.1 Capital Income vs Expenditure | 15 | Data | `institutional_budgets` (NEW) |
| 4.2 Revenue Income vs Expenditure | 15 | Data | `institutional_budgets` (NEW) |
| 4.3 Sustainability (corpus, diversification) | 10 | Document + Data | `institutional_budgets` (NEW) |
| 4.4 Financial Controls & Audits | 10 | Document (binary) | DC-33: `financial_audits` (NEW) |

**Attribute 5: Learning & Teaching (150 pts) — HIGHEST weight for Autonomous**
| Metric | Score | Evidence Type | Data Source |
|--------|-------|---------------|-------------|
| 5.1 Pedagogical Approaches | 35 | Document + Data | Manual evidence (pedagogical diversity) |
| 5.2 Learning Management System | 20 | Data | LMS integration (`lti_grades`), `online_education_tracking` |
| 5.3 Industry Academia Linkage | 25 | Data | `industry_partners`, `learner_industry_engagements` |
| 5.4 Assessment Components | 25 | Document + Data | Manual evidence (assessment diversity) |
| 5.5 Catering to Diversity | 15 | Document + Data | Manual + `vac_courses` (bridge/remedial) |
| 5.6 Academic Grievances Redressal | 15 | Document (binary) | `grievance_tickets` ✅ |
| 5.7 Academic Calendar Adherence | 15 | Data | DC-34: `academic_calendar_tracking` (NEW) + Manual entry |

**Attribute 6: Extended Curricular Engagements (125 pts)**
| Metric | Score | Evidence Type | Data Source |
|--------|-------|---------------|-------------|
| 6.1 Domain Clubs & Festivals | 25 | Document + Data | `student_activities` (NEW) |
| 6.2 Cultural Clubs & Festivals | 25 | Document + Data | `student_activities` (NEW) |
| 6.3 Mental Well-being | 15 | Document (binary) | Manual evidence |
| 6.4 Value Education | 15 | Document + Data | `vac_courses` (partial) |
| 6.5 Sports Clubs & Activities | 20 | Document + Data | `student_activities` (NEW) |
| 6.6 Community Activities | 25 | Document + Data | `institutional_events` (NEW) |

**Attribute 7: Governance & Administration (100 pts)**
| Metric | Score | Evidence Type | Data Source |
|--------|-------|---------------|-------------|
| 7.1 Institutional Development Plan | 10 | Document | `okr_objectives` (partial) |
| 7.2 Effective Leadership | 10 | Document (binary) | Manual evidence |
| 7.3 Quality Assurance (IQAC) | 10 | Document + Data | `iqac_meetings` (NEW), `nps_surveys` |
| 7.4 Statutory Compliance & Public Disclosure | N/A | — | N/A for Autonomous College (University only) |
| 7.5 Student & Employee Welfare | 15 | Document + Data | `scholarships`, `hostel_allocations` |
| 7.6 Employability Efforts | 15 | Data | `career_services` (NEW), `alumni_outcomes` |
| 7.7 Grievance Handling | 5 | Document (binary) | `grievance_tickets` ✅, `anti_ragging_affidavits` ✅ |
| 7.8 e-Governance | 10 | Document (binary) | MyJKKN itself is evidence ✅ |
| 7.9 National/International Collaborations | 10 | Data | `industry_partners`, `sh_solution_mous` |
| 7.10 Faculty Retention | 15 | Data (auto-calc) | `staff.date_of_joining`, `staff.is_active` |

**Attribute 8: Student Outcomes (125 pts)**
| Metric | Score | Evidence Type | Data Source |
|--------|-------|---------------|-------------|
| 8.1 Student Enrollment (% seats filled) | 20 | Data (auto-calc) | `admissions`, `programs` (sanctioned strength) |
| 8.2 Graduate Progression | 30 | Data | `alumni_outcomes` ✅ |
| 8.2b Pass Percentage | N/A | — | N/A for Autonomous College (Affiliated only) |
| 8.3 Awards/Prizes/Recognitions | 15 | Document + Data | `awards_recognitions` (NEW) |
| 8.4 Learning Experience Survey | 60 | Data (external) | Student/alumni database shared with NAAC |

**Attribute 9: Research & Innovation Outcomes (100 pts)**
| Metric | Score | Evidence Type | Data Source |
|--------|-------|---------------|-------------|
| 9.1 External Research Grants | 20 | Data | `research_projects` (NEW) |
| 9.2 Research Publications | 25 | Data | `sh_publications` ✅ |
| 9.3 Research Quality (h-index, citations) | 20 | Data | `sh_publications` (citation_count, h_index_contribution) ✅ |
| 9.4 PhDs Awarded | 20 | Data | DC-31: `phd_scholars` (NEW) |
| 9.5 Research Fellowships (JRF/SRF) | NA | — | Not applicable for Autonomous |
| 9.6 Intellectual Property | 5 | Data | `patents_ipr` (NEW) |
| 9.7 Consultancy & Training | 10 | Data | `sh_solutions`, `sh_training_programs` ✅ |

**Attribute 10: Sustainability & Green Initiatives (75 pts)**
| Metric | Score | Evidence Type | Data Source |
|--------|-------|---------------|-------------|
| 10.1 Community Activities (NSS/NCC) | 25 | Document + Data | `institutional_events` (NEW), `student_activities` (NEW) |
| 10.2 Water & Waste Management | 20 | Document (binary) | `environmental_initiatives` (NEW) |
| 10.3 Net Zero Progress | 20 | Document (binary) | `environmental_initiatives` (NEW) |
| 10.4 Green Audits | 10 | Document (binary) | `environmental_initiatives` (NEW) |

#### Coverage Estimate (Autonomous College — Auto-Calculable from MyJKKN)

```
Attribute 1 (Curriculum, 75):   ████░░░░░░  30/75 = 40%  (OBE + feedback covered; NEP metrics missing)
Attribute 2 (Faculty, 50):      ██████░░░░  25/50 = 50%  (ratio + FDP covered; qualifications need new table)
Attribute 3 (Infra, 50):        ██░░░░░░░░  10/50 = 20%  (only physical resources partial)
Attribute 4 (Finance, 50):      ░░░░░░░░░░   0/50 =  0%  (NO budget/audit tables exist)
Attribute 5 (Learning, 150):    ██████░░░░  65/150= 43%  (grievance + industry covered; pedagogy manual)
Attribute 6 (Extracurric, 125): ██░░░░░░░░  15/125= 12%  (only VAC partial; clubs/sports missing)
Attribute 7 (Governance, 100):  █████░░░░░  45/100= 45%  (OKR + grievance + ERP evidence; IQAC missing)
Attribute 8 (Outcomes, 125):    ████░░░░░░  50/125= 40%  (alumni covered; enrollment calc-able; survey external)
Attribute 9 (Research, 100):    █████░░░░░  55/100= 55%  (publications strong; grants/patents missing)
Attribute 10 (Sustain, 75):     ░░░░░░░░░░   0/75 =  0%  (ZERO environmental data)

TOTAL AUTO-CALCULABLE:          ~275-295/900 = ~30-33%  (range depends on how "partial" metrics are counted)
AFTER P0 TABLES (+4):           ~420/900 = ~47%
AFTER P0+P1 TABLES (+12):       ~680/900 = ~76%
AFTER ALL 21 TABLES:            ~780/900 = ~87% (remainder = binary checkbox evidence, manual)
```

#### Special Handling: Binary Checkbox Metrics

Unlike the old NAAC system (which was heavily quantitative), the new Binary Framework has many **binary compliance checkpoints** that require document proof rather than data computation. The Regulatory Engine must handle these differently:

| Evidence Type | Count | Engine Handling |
|---------------|-------|-----------------|
| Data (auto-calculated) | ~25 metrics | Data Connector pulls from DB → auto-populates |
| Document + Data (mixed) | ~19 metrics | Partial auto-calc + evidence upload required |
| Document only (binary proof) | ~12 metrics | Manual checklist + document upload (no formula) |
| N/A (institution-type dependent) | 4 metrics | Skipped for Autonomous (3.6, 7.4, 8.2b, 9.5) |

**Engine design implication:** The `regulatory_metrics` table already supports `data_type` = 'boolean' for binary metrics and `requires_evidence` = true. For binary checkbox metrics, set:
- `data_type = 'boolean'`
- `formula = null` (no computation)
- `requires_evidence = true`
- `is_auto_calculable = false`
- The IQAC coordinator marks Yes/No and uploads supporting documents

#### New Metrics NOT in Old NAAC (7-Criteria) System

These are completely new requirements introduced by the Binary Framework that the old system didn't measure:

| New Metric | Attribute | Significance |
|------------|-----------|-------------|
| IKS (Indian Knowledge System) | 1.6 | NEP 2020 mandate — courses, research, centre |
| MEME (Multiple Entry/Multiple Exit) | 1.3 | NEP 2020 — ABC credit bank integration |
| Bharatiya Bhashas | 1.3, 5.5 | Regional language promotion |
| SWAYAM credits | 1.7 | Online learning mandate |
| Learning Experience Survey (database to NAAC) | 8.4 | 60 pts — student/alumni data shared directly with NAAC |
| Net Zero Progress | 10.3 | Sustainability push — solar, LED, EVs |
| Green Audits (GRIHA/IGBC) | 10.4 | Environmental certification |
| Faculty Retention % | 7.10 | 3-year retention of full-time teachers |

**Impact on Regulatory Engine:** These new metrics require:
- `nep_compliance_tracking` table (for IKS, MEME, ABC, Bharatiya Bhashas)
- `online_education_tracking` table (for SWAYAM credits)
- `environmental_initiatives` table (for Net Zero, Green Audits) — **21st new table added**
- Data export mechanism for Learning Experience Survey (student/alumni database push to NAAC)

#### Radhakrishnan Committee: Architecture Implications

The Dr. Radhakrishnan Committee Report (Nov 2023) recommends:
1. **One Nation One Data (ONOD)** platform — single data collection for all agencies (AISHE, UGC, AICTE, NAAC, NIRF)
2. **Unified Elicitation Tool** — institutions submit data ONCE, it flows to all bodies
3. **APIs for pushing data** — the engine should expose REST APIs for ONOD integration
4. **Stakeholder Crowdsourcing** — data validated by students, alumni, employers, parents
5. **HEI Categorization** — institutions categorized by orientation (Research-Intensive, Teaching-Intensive, Vocational) and heritage (Old/New)

**Engine design implication:** The `regulatory_frameworks` table's `metadata` jsonb should store:
- `hei_orientation` — categorization for the institution
- `onod_integration_status` — readiness for API-based data push
- `data_validation_mode` — 'self_reported' | 'crowdsourced' | 'api_verified'

#### NAAC MBGL (Maturity-Based Graded Level) — Post-Binary Assessment

NAAC's 2024 reform introduces a two-stage process:
1. **Binary Accreditation** — Threshold check (modeled above). Pass/Fail based on minimum scores.
2. **MBGL Grading** — Maturity assessment for institutions that pass Binary. 5 levels:
   - Level 1: Basic (threshold + 0-10%)
   - Level 2: Developing (threshold + 10-25%)
   - Level 3: Established (threshold + 25-50%)
   - Level 4: Advanced (threshold + 50-75%)
   - Level 5: Global Excellence (threshold + 75-100%)

MBGL evaluates the SAME 10 attributes as Binary but with deeper rubric-based assessment of institutional maturity. The engine models MBGL as a separate framework variant (`NAAC_MBGL_2024_<institution_type>`) that:
- Shares the same 10 attribute structure as Binary
- Adds rubric-level scoring criteria per attribute (5-level maturity scale)
- Stores MBGL level in submission metadata
- Can only be created AFTER the institution's Binary submission is in 'accepted' status

**Three MBGL Framework Variants:**
```
{ code: 'NAAC_MBGL_2024_UNIVERSITY', institution_type: 'university' }
{ code: 'NAAC_MBGL_2024_AUTONOMOUS', institution_type: 'autonomous_college' }
{ code: 'NAAC_MBGL_2024_AFFILIATED', institution_type: 'affiliated_college' }
```

> **Schema addition (see Database Schema section):** Add `assessment_phase text DEFAULT 'primary' CHECK (assessment_phase IN ('primary','mbgl'))` to `regulatory_frameworks`. Add `prerequisite_submission_id uuid REFERENCES regulatory_submissions(id)` to `regulatory_submissions`.

#### NAAC Binary Pass Thresholds

The `pass_threshold` field enables the dashboard and simulation to show a clear PASS/FAIL indicator. The score simulation prominently displays: current estimated score vs threshold, with a color-coded gap indicator (red below, green above).

| Institution Type | Total Max Score | Pass Threshold | Pass % |
|-----------------|----------------|----------------|--------|
| University | 900 | 540 | 60% |
| Autonomous College | 900 | 450 | 50% |
| Affiliated College | 900 | 360 | 40% |

> **Schema addition (see Database Schema section):** Add `pass_threshold numeric` to `regulatory_frameworks`. Set to 540 for NAAC Binary University, 450 for Autonomous, 360 for Affiliated.

#### NAAC Accreditation Validity Periods

Under the Binary+MBGL system (effective 2025), NAAC accreditation validity is **3 years**. Institutions accredited under the old system retain their 5-year validity until renewal.

> **Schema addition (see Database Schema section):** Add `validity_period_years integer` to `regulatory_frameworks`. Set to 3 for NAAC Binary/MBGL, 3 for NBA, 1 for NIRF/AICTE/AISHE (annual submissions).

#### NAAC Credibility Score

NAAC Binary includes a credibility score (0.5-1.0 multiplier) based on stakeholder survey alignment. When stakeholder feedback (student satisfaction, alumni feedback, employer feedback) shows significant divergence from institution-reported metric values, the credibility score is reduced, which can lower the final accreditation outcome. The system should cross-reference NPS/satisfaction data against metric values to flag credibility risks. Model as a metadata field on NAAC Binary submissions: `metadata.credibility_score`.

#### NAAC Extended Profile

NAAC Extended Profile is modeled as a special criteria node at the top of the NAAC framework tree with `is_extended_profile = true` flag in criteria metadata. Its metrics serve as denominators for QnM calculations (e.g., total students, total faculty, total programs). The Extended Profile data is auto-populated from data connectors and shared across all criteria calculations.

#### NAAC AQAR (Annual Quality Assurance Report)

AQAR is modeled as a separate framework variant (`NAAC_AQAR_<year>`) with both quantitative metrics and narrative text fields (using `data_type='text'`). The report generator auto-computes year-over-year deltas by comparing current year metric values against previous year values from `regulatory_metric_value_history`. AQAR is mandatory annually for all NAAC-accredited institutions.

```
{ code: 'NAAC_AQAR_2025', framework_type: 'reporting' }
```

---

### NIRF 2025 Discipline-Specific Rankings

> **Source:** Official NIRF 2025 Framework PDFs + `/Users/omm/Vaults/JKKNKB/NIRF/` vault strategy documents
> **Key Principle:** All discipline categories share the same 5 parameters (TLR, RP, GO, OI, PR) but with **different weights and sub-parameter marks**. The engine stores weights per `regulatory_framework` row, so each discipline = a separate framework configuration.

#### Discipline Weight Comparison

| Discipline | TLR | RP | GO | OI | PR | JKKN Institution |
|------------|-----|-----|-----|-----|-----|-----------------|
| **Overall** | 0.30 | 0.30 | 0.20 | 0.10 | 0.10 | All (if ≥1000 students) |
| **Engineering** | 0.30 | 0.30 | 0.20 | 0.10 | 0.10 | JKKN College of Engineering & Technology |
| **Pharmacy Cat A** (Research) | 0.30 | 0.30 | 0.15 | 0.15 | 0.10 | JKKN College of Pharmacy (if PhD programs) |
| **Pharmacy Cat B** (Teaching) | 0.30 | 0.20 | 0.25 | 0.15 | 0.10 | JKKN College of Pharmacy (if no PhD) |
| **Colleges** (Arts & Science) | 0.30 | 0.15 | 0.25 | 0.20 | 0.10 | JKKN College of Arts & Science |
| **Dental** | 0.35 | 0.30 | 0.20 | 0.10 | **0.05** | JKKN Dental College and Hospital |
| **Medical/Nursing** | 0.30 | 0.30 | 0.20 | 0.10 | 0.10 | JKKN College of Nursing / Allied Health Sciences |
| **Education** *(est.)* | 0.30 | 0.25 | 0.25 | 0.10 | 0.10 | JKKN College of Education |

#### TLR Sub-Parameter Variations by Discipline

| Sub-Parameter | Overall | Engineering | Pharmacy | Colleges | Dental | Medical/Nursing |
|---------------|---------|-------------|----------|----------|--------|----------------|
| SS (Student Strength) | 20 | 20 | 20 | 20 | **15** | 20 |
| FSR (Faculty-Student Ratio) | 25 | **30** | **30** | **30** | **25** | **30** |
| FQE (Faculty Quality & Exp) | 20 | 20 | 20 | 20 | 20 | 20 |
| FRU (Financial Resources) | 20 | **30** | **30** | **30** | **35** | **30** |
| OE (Online Education) | 10 | *NEW* | *NEW* | 10 | *NEW* | *NEW* |
| MIR (NEP 2020) | 5 | *NEW* | *NEW* | 5 | *NEW* | *NEW* |

> **Dental** has the highest FRU (35 marks) — reflecting expensive clinical equipment needs — but lower SS (15) due to smaller programs. **Colleges and Medical/Nursing** also use FSR=30/FRU=30 (same as Engineering), departing from Overall's 25/20. "MIR" = Multiple Entry/exit, Indian Knowledge System, Regional languages (also abbreviated MIRS in some documents).
>
> **⚠️ OE/MIR marks note:** For Overall, OE(10)+MIR(5)=15 marks are explicitly defined, and the base 4 sub-params sum to 85. For Engineering/Pharmacy/Dental/Medical, the base 4 sub-params sum to 95-100, and NIRF 2025 marks OE+MIR as "NEW" without publishing redistributed marks. The engine should store OE/MIR marks as 0 for these disciplines until official discipline-specific values are published, then update via config. For Colleges, the base 4 also sum to 100; if OE=10/MIR=5 apply, expect NIRF to redistribute (likely reducing FSR or FRU by 15).

#### GO Sub-Parameter Variations by Discipline

| Discipline | GUE (Exam Results) | GPHD (PhD Graduates) | GPH (Placements/Higher Studies) | GPROF (Professional Registration) |
|------------|-------------------|---------------------|-------------------------------|----------------------------------|
| Overall | 60 | 40 | — | — |
| Engineering | 60 | 40 | — | — |
| Pharmacy Cat A | 50 | 50 | — | — |
| **Pharmacy Cat B** | **60** | — | **40** (replaces GPHD) | — |
| **Colleges** | **60** | — | **40** (replaces GPHD) | — |
| **Dental** | **50** | — | **30** | **20** (Dental Council registration) |
| **Medical/Nursing** | **50** | — | **30** | **20** (Nursing/Medical Council registration) |

> **CRITICAL for Engine:** Four distinct GO structures exist:
> 1. **Overall/Engineering:** GUE + GPHD (2 sub-params)
> 2. **Pharmacy Cat A:** GUE + GPHD (2 sub-params, different weights)
> 3. **Pharmacy Cat B / Colleges:** GUE + GPH — replaces GPHD entirely
> 4. **Dental / Medical/Nursing:** GUE + GPH + GPROF (3 sub-params) — GPROF is unique to clinical programs requiring professional council registration
>
> The engine must support **different sub-parameter lists per framework**, not just different weights.

#### RP Sub-Parameter Variations (Pharmacy)

| Sub-Parameter | Cat A (Research) | Cat B (Teaching) |
|---------------|-----------------|-----------------|
| PU (Publications) | 35 | **30** |
| QP (Quality of Publications) | **35** | **30** |
| IPR (Patents) | 15 | **20** |
| FPPP (Funded Projects) | **15** | **20** |

> Cat B de-emphasizes publication quality and bumps up patents/projects — reflecting practical orientation.

#### OI Sub-Parameter Variations

| Sub-Parameter | Overall/Engg/Dental/Medical | Pharmacy | Colleges |
|---------------|---------------------------|----------|----------|
| RD (Regional Diversity) | 30 | **25** | **25** |
| WD (Women Diversity) | 30 | **25** | **25** |
| ESCS (Economically Challenged) | 20 | **25** | **25** |
| PCS (Physically Challenged) | 20 | **25** | **25** |

> **Dental and Medical/Nursing** use the same OI distribution as Overall/Engineering (30/30/20/20). Only **Pharmacy and Colleges** use equal distribution (25 each). Education also uses 25/25/25/25.

#### RP Sub-Parameter Variations

Engineering diverges from Overall, and Colleges introduces a 5th RP sub-parameter: PSDGs (SDG-aligned publications).

| Sub-Parameter | Overall | Engineering | Colleges |
|---------------|---------|-------------|---------|
| PU (Publications) | 35 | 35 | **30** |
| QP (Quality of Publications) | 35 | **40** | **30** |
| IPR (Patents) | 15 | 15 | 15 |
| FPPP (Funded Projects) | 15 | **10** | 15 |
| PSDGs (SDG Publications) | — | *NEW* | **10** |

> **Engineering RP:** QP gets 40 marks (vs Overall's 35) reflecting emphasis on citation quality, while FPPP drops to 10 (vs 15). Source: `/Users/omm/Vaults/JKKNKB/NIRF/Engineering.md` — verify against [official Engineering framework PDF](https://www.nirfindia.org/nirfpdfcdn/2025/framework/Engineering.pdf).
>
> **Colleges** is the only category with PSDGs as a separately scored sub-parameter. Engineering lists PSDGs as "NEW" (marks TBD). Other categories may include SDG metrics in future NIRF revisions.

#### Education Category (Estimated)

> **Note:** Education may follow the Colleges framework if a separate Education framework is not published. The following is estimated from the `/Users/omm/Vaults/JKKNKB/NIRF/Education.md` vault strategy:
> - RP replaces IPR with **AR (Action Research, 20 marks)** and adjusts PU/QP to 30/30; **FPPP = 20** (teacher training projects)
> - GO has 3 unique sub-params: **GUE(50) + GTET(30) (Teacher Eligibility Test) + GPL(20) (Placements)**
> - JKKN College of Education would use this framework

#### Data Connector Mapping per Discipline

All NIRF disciplines share the same data connectors since the underlying data sources are identical. The difference is purely in weights and sub-parameter selection. The engine handles this by:

```
regulatory_frameworks:
  { code: 'NIRF_2025_OVERALL', institution_type: null }
  { code: 'NIRF_2025_ENGINEERING', institution_type: null }
  { code: 'NIRF_2025_PHARMACY_A', institution_type: null }
  { code: 'NIRF_2025_PHARMACY_B', institution_type: null }
  { code: 'NIRF_2025_COLLEGES', institution_type: null }
  { code: 'NIRF_2025_DENTAL', institution_type: null }
  { code: 'NIRF_2025_MEDICAL', institution_type: null }
  -- Education excluded: estimated weights only, pending official NIRF framework publication

regulatory_criteria (per framework):
  Same 5 parameters, different weights

regulatory_metrics (per criterion per framework):
  Same sub-parameter codes but different scoring (controlled via regulatory_criteria.max_score per framework)
  Pharmacy Cat B / Colleges: GPHD replaced by GPH (different metric entirely)
  Dental / Medical: 3 GO sub-params (GUE + GPH + GPROF)
  Colleges: 5 RP sub-params (adds PSDGs)
```

#### Key Formulas (Common to All NIRF Disciplines)

> **Note on `f()` notation:** NIRF uses specific sigmoid/logarithmic scaling functions (not a single generic function). `f(x)` denotes the discipline-specific normalization function from the official NIRF methodology PDF. Exact function definitions (cutoffs, slopes) must be extracted from the PDF during implementation. The coefficients shown below are for **Overall** marks; disciplines with different sub-parameter marks (e.g., Dental SS=15 instead of 20) require proportionally adjusted coefficients.

**TLR:**
- `SS = f(NT, NE) × 15 + f(NP) × 5` — Student Strength including doctoral students (NT=total students, NE=new entrants/intake, NP=PhD students; variable names follow NIRF methodology notation — full definitions in the official NIRF PDF)
- `FSR = f(F/N)` — Target 1:15 for max marks (1:20 for State Public Universities)
- `FQE = FQ + FE` — FQ from PhD % (10 marks), FE from experience distribution (10 marks)
- `FRU = 7.5×f(BC) + 22.5×f(BO)` — Capital + Operational expenditure per student (3-year avg). **Note:** Coefficients (7.5/22.5) shown for Engineering/Pharmacy/Colleges (FRU=30). For Overall (FRU=20), coefficients scale proportionally. For Dental (FRU=35), coefficients are 8.75/26.25.

**RP:**
- `PU = PU_max × f(P/FRQ) - 5 × f(Pret)` — Publications per faculty, minus retraction penalty. PU_max = 35 (Overall/Engineering), 30 (Colleges/Pharmacy Cat B)
- `QP = {(QP_max/2) × f(CC/FRQ) + (QP_max/2) × f(TOP25P/P)} - 5 × f(Cret)` — Citations + quality, minus retraction. QP_max = 35 (Overall), 40 (Engineering), 30 (Colleges)
- `IPR = 10×f(PG) + 5×f(PP)` — Patents granted + published
- `PSDGs` — NEW: SDG-aligned publications (bonus, marks TBD)

**GO:**
- `GUE = f(pass_rate)` — 3-year average pass percentage
- `GPHD = f(PhD_awarded / faculty)` — PhD graduates per eligible faculty (Overall/Engineering/Pharmacy Cat A)
- `GPH = f(placed_or_higher_ed / graduates)` — Placement + higher education rate (Cat B/Colleges/Dental/Medical)
- `GPROF = f(council_registered / graduates)` — Professional council registration rate (Dental/Medical only)

**NEW in NIRF 2025:**
- **Negative Marking:** Retracted publications deduct from PU and QP scores
- **OE (Online Education):** SWAYAM credits, online syllabus completion, digital infrastructure
- **MIR:** Multiple Entry/Exit + Indian Knowledge System + Regional Languages
- **PSDGs:** Publications aligned with UN Sustainable Development Goals

---

### NBA Self-Assessment Report (SAR) — Engineering Programs

> **Source:** NBA Accreditation Manual, Tier-I criteria
> **Applicable to:** JKKN College of Engineering & Technology (program-level, not institution-level)
> **Cycle:** Every 3 years per program (B.Tech/M.Tech)
> **Key Difference from NAAC:** NBA evaluates individual PROGRAMS, not the whole institution

#### NBA Criteria (Tier-I — Washington Accord Aligned)

| # | Criterion | Max Score | Primary Data Connectors |
|---|-----------|-----------|------------------------|
| 1 | Vision, Mission & PEOs | 60 | Manual + `okr_objectives` |
| 2 | Programme Curriculum & Teaching-Learning | 120 | DC-11: `competency_catalog`, `course_competency_mapping` |
| 3 | Course Outcomes & Programme Outcomes | 150 | DC-11: CO-PO mapping, attainment levels |
| 4 | Students' Performance | 120 | DC-17: `exam_results`, DC-04: `alumni_outcomes` |
| 5 | Faculty Information & Contributions | 100 | DC-02: `staff`, DC-16: `staff_qualifications`, DC-03: `sh_publications` |
| 6 | Facilities & Technical Support | 80 | DC-14: `resources`, DC-20: `library_holdings`, DC-28: `ict_infrastructure` |
| 7 | Continuous Improvement | 100 | DC-10: `okr_objectives`, DC-24: `iqac_meetings` |
| 8 | First Year Academics | 70 | DC-01: `learners_profiles` (1st year), DC-17 |
| 9 | Student Support Systems | 80 | DC-09: `scholarships`, `grievance_tickets`; DC-25: `career_services` |
| 10 | Governance, Institutional Support & Financial Resources | 120 | DC-21: `institutional_budgets`, DC-33: `financial_audits` |
| | **TOTAL** | **1000** | |

#### NBA Programme Outcomes (GAPC v4 — Effective January 2025)

NBA mandated Graduate Attributes and Professional Competencies (GAPC) Version 4, restructuring from 12 to 11 Programme Outcomes. Sustainability and Ethics are no longer standalone POs but integrated into Design, Investigation, and Analysis.

**Engineering (PO1-PO11):**

| PO | Title | Description | Measured Via |
|----|-------|-------------|-------------|
| PO1 | Engineering Knowledge | Apply knowledge of mathematics, science, engineering fundamentals | CO attainment in core courses |
| PO2 | Problem Analysis | Identify, formulate, and analyze complex engineering problems | CO attainment + project evaluations |
| PO3 | Design/Development | Design solutions for complex problems with sustainability | Capstone projects, design courses |
| PO4 | Investigation | Conduct investigations using research-based knowledge | Lab courses, research projects |
| PO5 | Modern Tool Usage | Create, select, apply appropriate tools and techniques | Software/simulation lab performance |
| PO6 | Engineer and Society | Apply reasoning to assess societal and legal issues | Humanities/society course COs |
| PO7 | Environment and Sustainability | Understand impact and commit to sustainable development | Environmental + design course COs |
| PO8 | Communication | Communicate effectively with engineering community and society | Presentation scores, report quality |
| PO9 | Individual and Team Work | Function effectively as individual, member, and leader | Project courses, team assignments |
| PO10 | Project Management and Finance | Apply engineering and management principles to projects | Management course + capstone |
| PO11 | Life-long Learning | Engage in independent and life-long learning | Self-learning initiatives, MOOC completion |

> **Schema note:** The `regulatory_course_syllabi.po_mapping` jsonb field must use PO1-PO11 keys (not PO1-PO12). The CO-PO attainment matrix generation must use 11 POs.
> **Schema addition (see Database Schema section):** Add `gapc_version text DEFAULT 'v4'` to NBA framework metadata.

**CO-PO Mapping:** The engine's existing `competency_catalog` + `course_competency_mapping` tables provide the foundation. Each Course Outcome maps to Programme Outcomes with correlation levels (1=Low, 2=Medium, 3=High). Attainment is computed from exam/assignment scores.

#### NBA for Pharmacy Programs

Same 10 criteria but with pharmacy-specific POs defined by Pharmacy Council of India (PCI). Key differences:
- Pharmacy programme outcomes (PhO) structure to be confirmed against PCI's GAPC v4 alignment. **TODO:** Verify whether pharmacy shifted to 11 PhOs or retained separate structure. The old PhO1-PhO12 may no longer be valid.
- PhOs emphasize patient care, drug safety, pharmaceutical ethics, and regulatory compliance
- **TODO:** Obtain exact PCI PhO definitions aligned with GAPC v4 for the seed data — currently a gap in this spec

The engine stores these as a separate framework:
```
{ code: 'NBA_SAR_ENGINEERING', metadata: { program_type: 'B.Tech', gapc_version: 'v4' } }
{ code: 'NBA_SAR_PHARMACY', metadata: { program_type: 'B.Pharm', gapc_version: 'v4' } }
```

---

### AICTE Mandatory Disclosure

> **Applicable to:** All AICTE-approved institutions (Engineering, Pharmacy, Management)
> **Frequency:** Annual (updated on institution website)
> **Format:** Structured data on institution website + AICTE portal submission

#### AICTE Disclosure Categories

| # | Category | Data Points | Data Source (MyJKKN) |
|---|----------|-------------|---------------------|
| 1 | Institution Information | Name, address, approval status, university affiliation, year of establishment | `institutions` table ✅ |
| 2 | Programme Information | Approved intake, courses offered, fee structure | `programs`, `billing_student_bills` |
| 3 | Faculty Information | Name, qualification, designation, experience, pay scale, photo | DC-02: `staff`, DC-16: `staff_qualifications` (**NOTE:** `staff` table may need `pay_scale` column for AICTE) |
| 4 | Student Information | Enrollment (gender/category-wise), lateral entry, NRI/foreign students | DC-01: `learners_profiles` |
| 5 | Infrastructure | Land area, built-up area, classrooms, labs, library, hostel, sports | DC-14: `resources`, DC-20: `library_holdings`, DC-28: `ict_infrastructure` |
| 6 | Placement Records | Placed students (company, package), higher education, self-employed | DC-04: `alumni_outcomes` ✅ |
| 7 | Financial Information | Fee collected, salary expenditure, infra expenditure, audited statements | DC-21: `institutional_budgets`, DC-33: `financial_audits` |
| 8 | Governance | Board of Governors, Academic Council, Faculty committees | Manual entry |
| 9 | AICTE Compliance | Anti-ragging measures, grievance mechanisms, mandatory committees | DC-09: `grievance_tickets` ✅ |

**Engine handling:** AICTE disclosure is primarily a data EXPORT — no scoring or grading. The engine generates a structured document from existing data connectors.

```
{ code: 'AICTE_MANDATORY_DISCLOSURE_2025', framework_type: 'compliance' }
```

---

### UGC-AISHE (All India Survey on Higher Education)

> **Applicable to:** ALL higher education institutions (mandatory annual submission to MHRD)
> **Frequency:** Annual (typically December–February)
> **Format:** Online portal at aishe.gov.in
> **Purpose:** National-level education statistics — feeds into NIRF, policy decisions, budget allocation

#### AISHE Data Collection Sections

| # | Section | Data Points | Data Source (MyJKKN) |
|---|---------|-------------|---------------------|
| 1 | Institution Profile | Type, management, year, affiliating university, NAAC/NBA status | `institutions` ✅ |
| 2 | Programme-wise Enrollment | Students by programme, year, gender, category (SC/ST/OBC/General), PwD, Muslim minority, state domicile | DC-01: `learners_profiles` ✅ |
| 3 | Student Intake | Sanctioned intake vs admitted (programme-wise, gender-wise) | DC-05: `admissions` |
| 4 | Examination Results | Students appeared vs passed (programme-wise, gender-wise) | DC-17: `exam_results` (NEW) |
| 5 | Faculty Information | Full-time, part-time, contractual — by gender, category, qualification, designation | DC-02: `staff`, DC-16: `staff_qualifications` |
| 6 | Infrastructure | Classrooms, labs, computers, internet bandwidth, library books, hostels | DC-14: `resources`, DC-20: `library_holdings`, DC-28: `ict_infrastructure` |
| 7 | Financial Information | Receipts (fees, grants, donations) + Expenditure (salary, infra, scholarships) | DC-21: `institutional_budgets` |
| 8 | Scholarship Data | Students receiving scholarships by type, amount, gender, category | DC-09: `scholarships` ✅ |
| 9 | Placement Data | Students placed, median salary, companies visiting campus | DC-04: `alumni_outcomes` ✅ |

**Engine handling:** Like AICTE, AISHE is a data EXPORT to an external portal. The engine generates CSV/JSON data matching the AISHE portal template. No scoring involved.

```
{ code: 'UGC_AISHE_2025', framework_type: 'reporting' }
```

**ONOD Integration:** The Radhakrishnan Committee's One Nation One Data (ONOD) platform will eventually unify AISHE + NIRF + NAAC + AICTE data collection into a single submission. The engine's data connector layer should anticipate this by exposing data in ONOD-compatible formats (future REST API scope).

---

### Report Output Format Specifications

> **Each regulatory body requires specific output formats.** The engine's `report-generator.ts` must support multiple output templates. Reports combine auto-calculated data with manually entered evidence and qualitative narratives.

#### NAAC Submissions

| Report | Format | Sections | Auto-Generated? | Frequency |
|--------|--------|----------|-----------------|-----------|
| **SSR (Self-Study Report)** | PDF (200-300 pages) | Extended Profile + 7 Criteria sections + SWOC + Declaration | Partial — QnM data auto-filled, QlM narratives manual | Every 3 years (Binary+MBGL cycle); legacy 5-year cycle for institutions under old grading |
| **AQAR (Annual Quality Assurance Report)** | PDF (40-60 pages) | Academic year summary, criterion-wise improvements, best practices | Partial — data summaries auto-generated | Annual (mandatory post-accreditation) |
| **DVV Data** | Excel/CSV | QnM metric data with supporting evidence links | Full auto-generation from data connectors | As part of SSR submission |
| **IIQA (Institutional Information for QA)** | Online form | Basic institutional data, readiness indicators | Full auto-fill | Pre-SSR submission |

**SSR PDF Structure:**
```
Part A: Extended Profile (auto-generated)
  - Student strength (5 years) — DC-01
  - Faculty count (5 years) — DC-02
  - Financial data (5 years) — DC-21
  - Programme count — programs table

Part B: Criterion-wise Analysis
  Criterion I–VII: Each contains:
    - Key Indicator sections with metric values (QnM → auto-populated)
    - Qualitative descriptions (QlM → from `regulatory_metric_values` where `is_auto_calculated = false`)
    - Supporting data tables (auto-generated from connectors)
    - Evidence links (from `regulatory_evidence` table)

Part C: SWOC Analysis (manual)
Part D: Declaration (template)

Appendices: Data templates per criterion (auto-generated Excel)
```

#### NIRF Submissions

| Report | Format | Sections | Auto-Generated? | Frequency |
|--------|--------|----------|-----------------|-----------|
| **NIRF Data Submission** | Online portal (CSV/JSON upload) | 5 parameter sections with sub-parameter data | Full auto-generation | Annual (Jan–Mar) |
| **Score Simulation Report** | Internal PDF | Estimated scores per parameter, historical trends, gap analysis | Full auto-generation | On-demand |
| **Data Verification Sheets** | Excel/CSV | Raw data backing each sub-parameter with source references | Full auto-generation | For internal review |

**NIRF Portal Data Format:**
```json
{
  "institution_id": "NIRF-IR-...",
  "academic_year": "2024-25",
  "parameters": {
    "TLR": {
      "SS": { "ug_enrolled": 1200, "pg_enrolled": 300, "phd_enrolled": 45, "sanctioned_intake": 1500 },
      "FSR": { "full_time_faculty": 120, "total_students": 1545 },
      "FQE": { "phd_faculty": 85, "exp_0_8": 30, "exp_8_15": 45, "exp_gt_15": 45 },
      "FRU": { "capital_exp_3yr": [1200000, 1500000, 1800000], "operational_exp_3yr": [8000000, 8500000, 9000000] },
      "OE": { "swayam_courses": 12, "swayam_completions": 85, "online_syllabus_pct": 40, "online_exams_pct": 15 },
      "MIR": { "abc_registered": true, "multi_entry_exit_students": 22, "iks_courses": 4, "regional_language_programs": 2 }
    },
    "RP": {
      "PU": { "wos_papers": 45, "scopus_papers": 62, "retracted": 0, "faculty_count": 120 },
      "QP": { "total_citations": 890, "top25p_citations": 340, "retracted_citations": 0 },
      "IPR": { "patents_granted": 3, "patents_published": 8 },
      "FPPP": { "funded_projects_amount": 4500000, "consultancy_amount": 1200000 },
      "PSDGs": { "sdg_aligned_papers": 8, "sdg_categories": ["SDG3", "SDG4", "SDG9"] }
    },
    "GO": {
      "GUE": { "appeared": [400, 420, 410], "passed": [360, 380, 375] },
      "GPHD": { "phds_awarded": [5, 7, 8] },
      "GPH": null,
      "GPROF": null
    },
    "OI": {
      "RD": { "other_state_students": 180, "international_students": 12, "total_students": 1545 },
      "WD": { "women_students": 720, "women_faculty": 48, "total_students": 1545, "total_faculty": 120 },
      "ESCS": { "scholarship_students": 450, "freeships": 120, "total_students": 1545 },
      "PCS": { "pwd_students": 15, "accessible_buildings_pct": 85 }
    },
    "PR": { "source": "external_survey", "note": "NIRF-conducted, not institution-generated" }
  }
}
```

#### NBA SAR Report

| Report | Format | Sections | Auto-Generated? | Frequency |
|--------|--------|----------|-----------------|-----------|
| **SAR (Self-Assessment Report)** | PDF (150-200 pages per program) | 10 criteria + CO-PO matrices + attainment data | Partial — attainment data auto-calc, narratives manual | Every 3 years per program |
| **CO-PO Attainment Matrix** | Excel | Course × PO mapping with attainment levels | Full auto-generation from competency data | Continuous tracking |
| **Compliance Report** | PDF summary | Criterion-wise compliance status | Full auto-generation | On-demand |

#### AICTE & UGC-AISHE Reports

| Report | Format | Sections | Auto-Generated? | Frequency |
|--------|--------|----------|-----------------|-----------|
| **AICTE Mandatory Disclosure** | HTML (website) + PDF | 9 categories | Full auto-generation | Annual |
| **AISHE Data Submission** | CSV (portal upload format) | 9 sections | Full auto-generation | Annual |

#### Report Generation Architecture

```
report-generator.ts
├── generateNAAC_SSR(frameworkId, assessmentYear)
│   ├── Extended Profile → auto from connectors
│   ├── QnM sections → auto from regulatory_metric_values
│   ├── QlM sections → from regulatory_metric_values (is_auto_calculated = false)
│   ├── Evidence links → from regulatory_evidence
│   └── Output: PDF via react-pdf or puppeteer
│
├── generateNAAC_AQAR(frameworkId, academicYear)
│   ├── Annual quality summary → from metric_values (current year vs previous)
│   ├── Criterion-wise improvements → auto-diff from historical values
│   └── Output: PDF (40-60 pages)
│
├── generateNAAC_DVV(frameworkId, assessmentYear)
│   ├── QnM metric data → auto from connectors
│   ├── Evidence URLs → from regulatory_evidence
│   └── Output: Excel/CSV for DVV verification
│
├── generateNAAC_IIQA(institutionId)
│   ├── Institutional profile → from institutions table
│   ├── Readiness indicators → from regulatory_metric_values
│   └── Output: JSON/form data for NAAC portal
│
├── generateNAAC_Binary(frameworkId, assessmentYear)
│   ├── 10 attribute scores → auto from metric_values
│   ├── Institution-type-specific weights → from framework config
│   └── Output: PDF + portal submission data
│
├── generateNIRF_Submission(frameworkId, academicYear)
│   ├── Parameter data → auto from connectors
│   └── Output: JSON/CSV matching portal format
│
├── generateNBA_SAR(frameworkId, programId)
│   ├── CO-PO matrices → from competency tables
│   ├── Attainment data → calculated from exam results
│   └── Output: PDF
│
├── generateAICTE_Disclosure(institutionId)
│   ├── All 9 categories → auto from connectors
│   └── Output: HTML + PDF
│
├── generateAISHE_Data(institutionId, surveyYear)
│   ├── All 9 sections → auto from connectors
│   └── Output: CSV matching AISHE portal template
│
└── generateScoreSimulation(frameworkId)
    ├── Current scores → from metric_values
    ├── Gap analysis → target vs actual
    ├── Trend data → historical metric_values
    └── Output: Internal PDF/dashboard data
```

---

## Architecture Pattern: B2A (Pattern A Compliance)

> **MANDATORY:** This module MUST follow **Pattern A** — the standard MyJKKN data flow architecture.
> Pattern A: **Page → Hook (fetch) → API Route → Service → DB (RLS)**
>
> **NO direct Supabase calls in hooks.** All data access flows through API routes.
> This ensures: (1) server-side auth validation, (2) request validation, (3) consistent error handling, (4) audit logging capability, (5) API surface for future ONOD integration.

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│ BROWSER (Client-Side)                                                   │
│                                                                         │
│  Page Component                                                         │
│       │ uses                                                            │
│       ▼                                                                 │
│  React Query Hook (hooks/regulatory/use-*.ts)                          │
│       │ fetch('/api/regulatory/...')                                     │
│       ▼                                                                 │
├─────────────────────────── HTTP Boundary ───────────────────────────────┤
│ SERVER (API Routes)                                                     │
│                                                                         │
│  API Route (app/api/regulatory/**/route.ts)                            │
│       │ 1. getAuthUser() — verify session                               │
│       │ 2. Parse & validate params                                      │
│       │ 3. Role check (per T8 permission matrix)                        │
│       │ 4. Call service method                                          │
│       ▼                                                                 │
│  Service Layer (lib/services/regulatory/*.ts)                          │
│       │ Static class methods — Supabase queries                         │
│       │ Business logic, validation, sanitization                        │
│       ▼                                                                 │
│  Supabase Client (server-side) → PostgreSQL                            │
│       │ RLS policies enforce institution_id scoping                     │
│       ▼                                                                 │
│  Database (18 tables + 2 views + 58 RLS policies)                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Response Envelope Standard

All API routes MUST return this envelope:

```typescript
// Success response
{
  success: true,
  data: T | T[],                    // single item or array
  metadata?: {
    total: number,                  // total matching records
    page: number,                   // current page (1-based)
    limit: number,                  // items per page
    totalPages: number              // ceil(total / limit)
  }
}

// Error response
{
  success: false,
  error: string,                    // machine-readable code: UNAUTHORIZED | VALIDATION_ERROR | NOT_FOUND | FORBIDDEN | INTERNAL_ERROR
  message: string                   // human-readable description
}
```

**HTTP Status Codes:**
| Code | When |
|------|------|
| 200 | Success (GET, PUT) |
| 201 | Created (POST) |
| 400 | Validation error (missing/invalid params) |
| 401 | Not authenticated (no session) |
| 403 | Not authorized (role insufficient per T8) |
| 404 | Resource not found |
| 409 | Conflict (duplicate, invalid state transition) |
| 500 | Internal server error |

### Auth & Role Middleware Pattern

Every API route must implement this pattern:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/supabase/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { RegulatoryFrameworkService } from '@/lib/services/regulatory'

export async function GET(request: NextRequest) {
  // 1. Auth check
  const { user, error: authError } = await getAuthUser()
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 }
    )
  }

  // 2. Get user profile for role check
  // (use server-side Supabase to get profile — NOT passed from client)
  const supabase = await createServerSupabaseClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, institution_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHORIZED', message: 'User profile not found' },
      { status: 401 }
    )
  }

  // 3. Role check per T8 permission matrix
  const allowedRoles = ['super_admin', 'institution_admin', 'iqac_coordinator', 'principal', 'hod']
  if (!allowedRoles.includes(profile.role)) {
    return NextResponse.json(
      { success: false, error: 'FORBIDDEN', message: 'Insufficient permissions' },
      { status: 403 }
    )
  }

  // 4. Parse query params
  const { searchParams } = request.nextUrl
  const institutionId = profile.role === 'super_admin'
    ? searchParams.get('institution_id') || undefined   // super_admin can query any
    : profile.institution_id                             // others scoped to their own
  const body = searchParams.get('body') || undefined
  const status = searchParams.get('status') || undefined
  const search = searchParams.get('search') || undefined
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '20', 10)

  // 5. Call service
  const result = await RegulatoryFrameworkService.getFrameworks({
    institution_id: institutionId,
    body, status, search, page, limit,
  })

  // 6. Return envelope
  return NextResponse.json({
    success: true,
    data: result.data,
    metadata: result.metadata
  })
}
```

### Hook Pattern (Client-Side)

Hooks call API routes via `fetch()` — NEVER Supabase directly:

```typescript
// hooks/regulatory/use-frameworks.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export const regulatoryKeys = {
  frameworks: {
    all: ['regulatory-frameworks'] as const,
    list: (filters: FrameworkFilters) => [...regulatoryKeys.frameworks.all, 'list', filters] as const,
    detail: (id: string) => [...regulatoryKeys.frameworks.all, 'detail', id] as const,
  },
  // ... other entities
}

// FrameworkFilters includes isSuperAdmin so the hook is self-contained
interface FrameworkFilters {
  institution_id?: string
  body?: string
  status?: string
  search?: string
  page?: number
  limit?: number
  isSuperAdmin?: boolean  // passed from page via usePermissions()
}

export function useFrameworks(filters: FrameworkFilters) {
  return useQuery({
    queryKey: regulatoryKeys.frameworks.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.institution_id) params.set('institution_id', filters.institution_id)
      if (filters.body) params.set('body', filters.body)
      if (filters.status) params.set('status', filters.status)
      if (filters.search) params.set('search', filters.search)
      if (filters.page) params.set('page', String(filters.page))
      if (filters.limit) params.set('limit', String(filters.limit))

      const res = await fetch(`/api/regulatory/frameworks?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to fetch frameworks' }))
        throw new Error(err.message)
      }
      const body = await res.json()  // envelope: { success, data, metadata }
      return body                    // return FULL envelope so pages can access .data AND .metadata
    },
    enabled: !!filters.institution_id || !!filters.isSuperAdmin,
  })
}

// Page component usage:
// const { data: result } = useFrameworks(filters)
// const frameworks = result?.data          // T[] array
// const total = result?.metadata?.total    // pagination info
```

### Super Admin Access Pattern (Unchanged)

The T8 super_admin rule STILL applies — implemented at both API route (role check) and RLS (DB policy) layers:

```typescript
// In API route: super_admin can omit institution_id
const institutionId = profile.role === 'super_admin'
  ? searchParams.get('institution_id') || undefined
  : profile.institution_id

// In hooks: super_admin can still see all data
const { isSuperAdmin } = usePermissions()
const institutionId = isSuperAdmin ? undefined : profile?.institution_id
enabled: isSuperAdmin || !!institutionId
```

### Shared Utilities (Extract from Services)

These utilities are duplicated across 9 service files — extract to shared:

```
lib/utils/
├── toast-error.ts               — friendlyErrorMessage() for client-side error display
├── regulatory-utils.ts          — isValidUUID(), validateId(), sanitizeSearch(), formatError()
```

`sanitizeSearch()` MUST strip PostgREST-injectable characters: `[,().\\%]` → replaced with empty string.

---

## API Routes Specification

> **Every service method is exposed as an API route.** No service method should only be callable from client-side Supabase.
> Route naming: `/api/regulatory/{entity}` for collections, `/api/regulatory/{entity}/[id]` for single items.
> All routes follow the auth + role + envelope pattern above.

### Standard Query Parameters for List Endpoints

All `GET` list endpoints accept these standard query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-based) |
| `limit` | integer | 20 | Items per page (max 100) |
| `search` | string | — | Full-text search (where applicable) |
| `institution_id` | uuid | — | Filter by institution (super_admin only; others auto-scoped) |

Additional entity-specific filters are documented per endpoint where applicable.

### Role Shorthand Definitions

| Shorthand | Meaning (roles) |
|-----------|-----------------|
| `all authenticated` | Any user with a valid session (frameworks/criteria/metrics are readable by design) |
| `all with institution access` | super_admin, institution_admin, iqac_coordinator, principal, hod, staff — i.e., any authenticated user whose profile has an institution_id matching the resource (or super_admin). This maps to the broadest non-public access tier. |

### Frameworks API

| Method | Endpoint | Service Method | Roles (T8) | Description |
|--------|----------|---------------|------------|-------------|
| GET | `/api/regulatory/frameworks` | `getFrameworks(filters)` | all authenticated | List frameworks. Extra filters: `body` (NAAC\|NIRF\|NBA\|AICTE\|UGC), `status` (draft\|active\|archived), `institution_type` |
| GET | `/api/regulatory/frameworks/[id]` | `getFrameworkById(id)` | all authenticated | Single framework with criteria count |
| GET | `/api/regulatory/frameworks/[id]/tree` | `getFrameworkTree(id)` | all authenticated | Full criteria→metrics hierarchy |
| GET | `/api/regulatory/frameworks/[id]/completeness` | `getFrameworkCompleteness(id, institutionId, year)` | super_admin, institution_admin, iqac_coordinator, principal, hod | Completeness % and metric breakdown |
| POST | `/api/regulatory/frameworks` | `createFramework(data)` | super_admin | Create new framework definition |
| PUT | `/api/regulatory/frameworks/[id]` | `updateFramework(id, data)` | super_admin | Update framework |
| DELETE | `/api/regulatory/frameworks/[id]` | `deleteFramework(id)` | super_admin | Delete framework. **Guard:** Reject with 409 if any submissions exist for this framework (check `regulatory_submissions` count). Also reject if framework status='active' — must archive first. **FK cascade chain awareness:** Deletion cascades through criteria → metrics → metric_values. This cascade will be BLOCKED by: (1) `regulatory_evidence` FK RESTRICT on `criteria_id`/`metric_id` — any evidence linked to the framework's criteria/metrics prevents deletion; (2) `regulatory_simulations` FK on `framework_id` — any simulations referencing this framework prevent deletion; (3) `regulatory_peer_benchmarks` FK on `framework_id` — any benchmarks referencing this framework prevent deletion. **CASCADE-destroyed (not blocking but shown in warning):** (4) `regulatory_metric_value_history` (CASCADE via metric_values) — audit trail entries will be permanently destroyed; (5) `regulatory_dvv_queries` (CASCADE via metrics) — DVV query records will be destroyed; (6) `regulatory_metric_assignments` (CASCADE via metric_values) — assignment records will be destroyed. The guard MUST pre-check ALL of these and return a descriptive 409 with counts: "Cannot delete: X submissions, Y evidence documents, W simulations, V benchmarks exist." For CASCADE-destroyed entities, show a warning: "WARNING: Z audit history entries, A DVV queries, B metric assignments will be permanently deleted." Never let PostgreSQL throw a cryptic FK violation to the user. The guard query should be a single CTE that counts all dependent entities in one round-trip. |

#### Framework Version Pinning (Immutability During Active Submissions)

**Rule:** Frameworks with active non-terminal submissions (status NOT IN ('accepted','cancelled')) CANNOT have their criteria or metrics edited or deleted. This protects submission data integrity.

**Enforcement:** The frameworks UPDATE, criteria UPDATE/DELETE, and metrics UPDATE/DELETE API routes MUST check:
```sql
-- Guard: reject edits if active submissions exist
SELECT COUNT(*) FROM regulatory_submissions s
JOIN regulatory_criteria c ON c.framework_id = s.framework_id
WHERE s.framework_id = $1
  AND s.status NOT IN ('accepted','cancelled')
```
If count > 0, return 409 Conflict: "Cannot modify framework structure while active submissions exist. Archive this framework and create a new version instead."

**To make changes:** super_admin must (1) archive the current framework (`status = 'archived'`), (2) create a new framework version with the updated structure, (3) optionally migrate active submissions to the new framework (manual process).

### Criteria API

| Method | Endpoint | Service Method | Roles (T8) | Description |
|--------|----------|---------------|------------|-------------|
| GET | `/api/regulatory/criteria` | `getCriteria(frameworkId)` | all authenticated | List criteria for a framework. **Required query param:** `framework_id` (uuid). Optional: `parent_criteria_id` (uuid, filter to children of a specific parent — NULL returns top-level only). |
| GET | `/api/regulatory/criteria/[id]` | `getCriterionById(id)` | all authenticated | Single criterion with children |
| POST | `/api/regulatory/criteria` | `createCriterion(data)` | super_admin | Add criterion to framework |
| PUT | `/api/regulatory/criteria/[id]` | `updateCriterion(id, data)` | super_admin | Update criterion |
| DELETE | `/api/regulatory/criteria/[id]` | `deleteCriterion(id)` | super_admin | Delete criterion (cascades metrics). **Guard:** Reject if parent framework has status='active' AND any submissions exist for it — prevents destroying data mid-submission. Only allow deletion from 'draft' frameworks or frameworks with zero submissions. **FK cascade chain:** Deletion cascades to child metrics → metric_values. Blocked by: (1) evidence FK RESTRICT on `criteria_id`/`metric_id`; (2) metric_value_history FK RESTRICT. Pre-check and return descriptive 409 if any linked evidence or history exists. |

### Metrics API

| Method | Endpoint | Service Method | Roles (T8) | Description |
|--------|----------|---------------|------------|-------------|
| GET | `/api/regulatory/metrics` | `getMetrics(criteriaId)` | all authenticated | List metrics for a criterion. **Required query param:** `criteria_id` (uuid). Optional: `is_auto_calculable` (boolean filter), `data_type` (text filter). |
| GET | `/api/regulatory/metrics/[id]` | `getMetricById(id)` | all authenticated | Single metric with value history |
| POST | `/api/regulatory/metrics` | `createMetric(data)` | super_admin | Add metric to criterion |
| PUT | `/api/regulatory/metrics/[id]` | `updateMetric(id, data)` | super_admin | Update metric definition |

#### Formula Engine Safety Limits (H7)

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max dependency chain depth | 10 levels | No regulatory framework needs > 5 levels; 10 is generous safety margin |
| Max total formula dependencies per framework | 500 | Prevents combinatorial explosion in topological sort |
| Formula evaluation timeout | 10 seconds per framework | Prevents long-running evaluation from blocking the request |
| Max formulas evaluated per request | 200 | Caps the work per API call |

**Validation timing:** Dependency depth and count limits are validated when a metric formula is SAVED (at definition time via `POST /metrics` or `PUT /metrics/[id]`), not at evaluation time. The API route for creating/updating metrics with formulas MUST:
1. Parse `formula_dependencies` from the request
2. Build the dependency graph for the entire framework (join all metrics via criteria)
3. Run cycle detection (topological sort)
4. Verify max depth <= 10
5. Verify total dependencies across the entire framework <= 500
6. Reject with 400 if any limit is exceeded, with a specific error: "Formula dependency chain exceeds max depth of 10" or "Framework exceeds max 500 total formula dependencies"

**Evaluation:** Pre-compute and cache the topological order when a framework is saved. At evaluation time (during `calculate-score` or `refresh`), iterate the cached order (O(n)), resolve each metric's dependencies from an in-memory map, evaluate formulas purely in application code. Never go back to the database per-formula. If evaluation exceeds 10 seconds, abort and return 504.

### Metric Values API

| Method | Endpoint | Service Method | Roles (T8) | Description |
|--------|----------|---------------|------------|-------------|
| GET | `/api/regulatory/metric-values` | `getMetricValues(filters)` | super_admin, institution_admin, iqac_coordinator, principal, hod | List metric values. **Query params:** `academic_year` (text, required), `framework_id` (uuid — service resolves to metric_ids via criteria chain), `metric_id` (uuid, optional single-metric filter), `is_auto_calculated` (boolean filter), `is_manually_overridden` (boolean filter). |
| GET | `/api/regulatory/metric-values/[id]/history` | `getMetricValueHistory(id)` | super_admin, institution_admin, iqac_coordinator, principal, hod | Audit trail for a specific metric **value** (the `[id]` is `metric_value_id`, NOT `metric_id`). Returns rows from `regulatory_metric_value_history` ordered by `created_at DESC`. |
| POST | `/api/regulatory/metric-values` | `upsertMetricValue(data)` | super_admin, institution_admin, iqac_coordinator, hod | Create or update metric value (triggers history). **App-layer guard:** If the metric's `is_auto_calculable = true` AND the value already exists AND `is_auto_calculated = true`, this is an **override** — only super_admin, institution_admin, iqac_coordinator may proceed (hod is blocked). The API route must check the existing row and the metric definition before allowing the write. On override, the service must set `is_manually_overridden = true` and require `override_reason`. **Concurrency control (M6):** The UPSERT uses `updated_at` as an optimistic lock. The request body MUST include `expected_updated_at` (ISO timestamp of the value the client last read). The service method: (1) `SELECT updated_at FROM regulatory_metric_values WHERE metric_id = $1 AND institution_id = $2 AND academic_year = $3 FOR UPDATE`, (2) if `updated_at != expected_updated_at`, return **409 Conflict** with `{ error: "metric_value_changed", current_updated_at, changed_by }` so the UI can prompt the user to reload, (3) otherwise proceed with the upsert. For new metric values (INSERT), `expected_updated_at` is omitted — no conflict possible. |
| POST | `/api/regulatory/metric-values/refresh` | `refreshAutoMetrics(frameworkId, institutionId, year)` | super_admin, institution_admin, iqac_coordinator | Run all data connectors and refresh auto-calculated values |

> **Implementation note — DataConnectorEngine Security (CRITICAL):**
>
> The refresh endpoint's service layer reads `regulatory_data_connectors.query_template`, which is restricted to `super_admin` at the RLS level. The `DataConnectorEngine` service MUST use a **service-role Supabase client** (bypasses RLS) to read connector templates, regardless of the calling user's role. This is safe because the API route already validates the caller's role before invoking the service.
>
> **Mandatory security controls for DataConnectorEngine:**
> 1. **Institution scoping:** Every connector query MUST inject `institution_id` as `$1` parameter. The engine must NEVER execute a connector query without binding the caller's institution_id (or the requested institution_id for super_admin). This prevents cross-institution data leakage even though RLS is bypassed.
> 2. **Read-only transactions:** All connector queries MUST execute inside a `SET TRANSACTION READ ONLY` block. This prevents any INSERT/UPDATE/DELETE from being smuggled into a query_template.
> 3. **SELECT-only enforcement (CTE-safe):** The engine MUST validate that `query_template`, after stripping leading whitespace and comments, starts with `SELECT` or `WITH` — `WITH` is required for Common Table Expressions (CTEs) like `WITH cte AS (SELECT ...) SELECT ...`. The blocklist check MUST scan the ENTIRE query text (not just the leading keyword) using **SQL tokenization** (not substring matching) with a case-insensitive full-text regex: `/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|COPY)\b/i`. Additionally block `pg_` system functions: `/\bpg_(read_file|write_file|stat_activity|ls_dir|execute_server_program|sleep)\b/i`. **Important:** The tokenizer must first strip string literals and comments to avoid false positives on values like `'DELETE confirmation sent'`. This catches DML-in-subquery attacks like `SELECT * FROM (DELETE FROM x RETURNING *) y`.
> 3b. **Single-statement enforcement:** The engine MUST reject any `query_template` containing semicolons (`;`) outside of string literals. This prevents multi-statement injection (e.g., `SELECT 1; DROP TABLE profiles`). Implementation: strip string literals first, then reject if `;` remains.
> 4. **Parameterized execution:** All query_template SQL uses `$1`, `$2`, `$3` positional parameters — NEVER string interpolation. The engine binds parameters via `supabase.rpc()` or `pg` parameterized query.
> 5. **Timeout:** Each connector query MUST have a `statement_timeout` (e.g., 30 seconds) to prevent long-running queries from degrading the database.
> 6. **Rate limiting:** The refresh endpoint should be queued (max 1 concurrent refresh per institution) to prevent database overload during batch operations.
> 7. **Table allowlist:** The DataConnectorEngine MUST (not SHOULD) maintain an allowlist of tables that connectors can query (the source tables documented in DC-01 through DC-36: `learners_profiles`, `staff`, `alumni_outcomes`, `sh_publications`, `student_attendance`, `admissions`, `billing_receipts`, `billing_student_bills`, `industry_partners`, `industry_mentors`, `industry_projects`, `facilitator_development`, `competency_catalog`, `course_competency_mapping`, `grievance_tickets`, `hostel_allocations`, `course_syllabi`, `program_outcomes`, `exam_results`, `placement_records`, `research_projects`, `patents`, `mous_agreements`, `institutional_facilities`, `library_resources`, `budget_allocations`, `departments`, `programs`, `sections`, `institutions`). The SQL validator MUST verify that ALL table references in `query_template` are in the allowlist. This prevents a compromised super_admin from reading sensitive tables (`profiles`, `auth.users`, `auth.sessions`, etc.) via crafted connectors.
> 8. **Test endpoint data minimization:** The test endpoint (`POST /data-connectors/[id]/test`) MUST return only the first 5 rows and strip columns containing PII patterns (column names matching `email`, `phone`, `mobile`, `password`, `token`, `secret`). Column names and row count are always returned. This prevents using the test endpoint for data exfiltration.
> 9. **Consolidated SQL safety summary:** Controls #3 (CTE-safe SELECT-only + blocklist + `pg_` function blocking) and #3b (single-statement enforcement via semicolon rejection) together form the complete SQL validation pipeline. The validation order is: (a) strip string literals and comments, (b) reject if semicolons remain, (c) verify leading keyword is SELECT or WITH, (d) scan entire text for blocklisted DML/DDL keywords and `pg_` system functions. All checks are case-insensitive.

### Evidence API

| Method | Endpoint | Service Method | Roles (T8) | Description |
|--------|----------|---------------|------------|-------------|
| GET | `/api/regulatory/evidence` | `getEvidence(filters)` | all with institution access | List evidence. **Query params:** `academic_year` (text), `metric_id` (uuid), `criteria_id` (uuid), `submission_id` (uuid), `evidence_type` (text: supporting\|primary\|certificate\|screenshot\|geo_tagged_photo), `uploaded_by` (uuid). At least one filter besides pagination is required. |
| GET | `/api/regulatory/evidence/search` | `searchEvidence(query, filters)` | all with institution access | Full-text search across evidence documents |
| POST | `/api/regulatory/evidence` | `uploadEvidence(data)` | super_admin, institution_admin, iqac_coordinator, hod, staff | Upload evidence document |
| PUT | `/api/regulatory/evidence/[id]` | `updateEvidence(id, data)` | super_admin, institution_admin, iqac_coordinator | Update evidence metadata |
| DELETE | `/api/regulatory/evidence/[id]` | `softDeleteEvidence(id)` | super_admin, institution_admin, iqac_coordinator | Soft-delete (set is_deleted=true) |
| GET | `/api/regulatory/evidence/[id]/versions` | `getEvidenceVersions(id)` | all with institution access | Version history for an evidence document |
| POST | `/api/regulatory/evidence/[id]/versions` | `addEvidenceVersion(id, data)` | super_admin, institution_admin, iqac_coordinator, hod, staff | Add new version of evidence document |
| GET | `/api/regulatory/evidence/deleted` | `getDeletedEvidence(filters)` | super_admin, institution_admin, iqac_coordinator | List soft-deleted evidence (within 30-day recovery window). **Implementation:** Service uses service-role client to bypass the `is_deleted = false` RLS filter. **MANDATORY institution scoping:** The service MUST also filter by `institution_id = <caller_institution_id>` (omit institution filter only for super_admin). Filter: `is_deleted = true AND deleted_at > now() - interval '30 days' AND institution_id = <caller_institution_id>`. The service-role client bypasses ALL RLS (not just the soft-delete filter), so institution scoping MUST be applied manually. |
| PUT | `/api/regulatory/evidence/[id]/restore` | `restoreEvidence(id)` | super_admin, institution_admin, iqac_coordinator | Restore soft-deleted evidence (set `is_deleted = false`, `deleted_at = null`). Fails with 410 Gone if `deleted_at` is older than 30 days. **Implementation:** Service uses service-role client to bypass RLS for the lookup, then updates via regular client. **MANDATORY:** The service-role lookup MUST include `AND institution_id = <caller_institution_id>` (or allow any institution only for super_admin). If the evidence's institution_id doesn't match, return 404 — never expose cross-institution evidence existence. |

> **Cross-framework consistency validation (M9):** The evidence `POST` endpoint MUST validate that:
> 1. If `metric_id` is provided, it belongs to a metric within the submission's framework (join `regulatory_metrics` → `regulatory_criteria` → verify `framework_id` = `submission.framework_id`)
> 2. If `criteria_id` is provided, it belongs to the submission's framework (join `regulatory_criteria` → verify `framework_id` = `submission.framework_id`)
> 3. Return **400 Bad Request** with message `"Evidence references a metric/criterion from a different framework than the submission"` if the framework IDs do not match.
>
> This prevents orphaned evidence that links to metrics in Framework A while attached to a submission for Framework B. The validation is app-layer only (not enforced by FK constraints) because evidence can optionally omit both metric_id and criteria_id for general submission-level documents.

#### Evidence Restore: Defense-in-Depth via Database Function

The restore endpoint (`PUT /evidence/[id]/restore`) uses service-role client which bypasses ALL RLS. To prevent cross-tenant access if the application layer has a bug, the restore operation MUST use a SECURITY DEFINER database function:

```sql
-- Defense-in-depth: DB function enforces institution isolation
CREATE OR REPLACE FUNCTION restore_evidence(
  p_evidence_id uuid,
  p_caller_institution_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE regulatory_evidence
  SET is_deleted = false, deleted_at = NULL
  WHERE id = p_evidence_id
    AND institution_id = p_caller_institution_id
    AND is_deleted = true
    AND deleted_at > now() - interval '30 days';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evidence not found, wrong institution, or recovery window expired';
  END IF;
END;
$$;
```

The API route calls this function instead of doing a raw UPDATE. Even if the application layer fails to check institution_id, the DB function enforces it.

Similarly, create `soft_delete_evidence(p_evidence_id uuid, p_caller_institution_id uuid)` for the soft-delete operation:

```sql
CREATE OR REPLACE FUNCTION soft_delete_evidence(
  p_evidence_id uuid,
  p_caller_institution_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE regulatory_evidence
  SET is_deleted = true, deleted_at = now()
  WHERE id = p_evidence_id
    AND institution_id = p_caller_institution_id
    AND is_deleted = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evidence not found or wrong institution';
  END IF;
END;
$$;
```

**Evidence Upload Security Requirements:**
> - **File type allowlist:** Only accept `pdf`, `jpg`, `jpeg`, `png`, `xlsx`, `xls`, `doc`, `docx`. Reject all other MIME types. **Note:** `csv` is intentionally excluded — CSV files can contain formula injection payloads (`=CMD|'/C calc'!A0`) that execute when opened in Excel/Google Sheets. If CSV upload is later required, the download endpoint MUST prepend a BOM and escape any cell starting with `=`, `+`, `-`, `@`, `\t`, or `\r` by prefixing with a single quote.
> - **File size limit:** 25 MB per file (configurable). Reject larger uploads before processing.
> - **Content-Type validation:** Verify the actual file content matches the declared MIME type (magic bytes check). Do not trust the `Content-Type` header alone.
> - **File name sanitization:** Strip path traversal characters (`../`, `..\\`), Unicode tricks, and null bytes from `file_name` before storing.
> - **Storage:** Upload to Supabase Storage bucket `regulatory-evidence` with path: `{institution_id}/{academic_year}/{filename}` for isolation and year-based partitioning (matches Performance Architecture storage path). Use presigned upload URLs to keep files out of API route memory.

#### CRITICAL: Evidence Soft-Delete and Restore Both Require Service-Role Client

Both `softDeleteEvidence()` and `restoreEvidence()` MUST use a service-role Supabase client. The evidence_update RLS policy has `WITH CHECK (is_deleted = false)` which blocks:
- **Soft-delete** (setting is_deleted = true) — blocked by WITH CHECK on NEW row
- **Restore** (updating a row where is_deleted = true) — blocked by USING clause on OLD row

The API routes for `DELETE /evidence/[id]` and `PUT /evidence/[id]/restore` MUST:
1. Use `createClient(url, SERVICE_ROLE_KEY)` — NOT the user's auth client
2. MANUALLY enforce institution scoping: `AND institution_id = caller_institution_id`
3. Use the SECURITY DEFINER database functions (see Security section) for defense-in-depth

> **Why not just fix the RLS policy?** Because the WITH CHECK clause on UPDATE is intentional — it prevents regular users from toggling soft-delete flags directly. The service-role + manual scoping pattern is the correct architecture for this operation. See also the `trg_evidence_soft_delete_guard` trigger which provides additional protection.

### Submissions API

| Method | Endpoint | Service Method | Roles (T8) | Description |
|--------|----------|---------------|------------|-------------|
| GET | `/api/regulatory/submissions` | `getSubmissions(filters)` | super_admin, institution_admin, iqac_coordinator, principal, hod | List submissions. **Query params:** `framework_id` (uuid), `academic_year` (text), `status` (text: draft\|data_collection\|in_review\|approved\|submitted\|accepted\|returned\|cancelled\|dvv_revision). hod has read-only access per R4-Fix 5. |
| GET | `/api/regulatory/submissions/[id]` | `getSubmissionById(id)` | super_admin, institution_admin, iqac_coordinator, principal | Submission detail with scores |
| POST | `/api/regulatory/submissions` | `createSubmission(data)` | super_admin, institution_admin, iqac_coordinator | Create new submission (status=draft) |
| PUT | `/api/regulatory/submissions/[id]/status` | `updateSubmissionStatus(id, newStatus)` | super_admin, institution_admin, iqac_coordinator, principal | Transition status. **CONCURRENCY CONTROL (CRITICAL):** The service method MUST use `SELECT ... FOR UPDATE` on the submission row before reading current status. This prevents TOCTOU race conditions where two users simultaneously read `in_review` and both trigger different transitions (one `returned`, one `approved`), with last-writer-wins producing inconsistent state. Alternative: optimistic locking via `version` column — UPDATE with `WHERE version = $expected_version`, return 409 if 0 rows affected. **Per-transition role enforcement (app-layer):** The role check is NOT a flat list — each transition has its own allowed roles as documented in the State Machine table below. The API route must: (1) acquire row lock via SELECT FOR UPDATE, (2) validate the transition is valid from current status, (3) check the caller's role against the specific transition's allowed roles, (4) reject with 403 if the role is insufficient for that specific transition (e.g., iqac_coordinator cannot trigger `in_review → approved`). |
| POST | `/api/regulatory/submissions/[id]/calculate-score` | `calculateSubmissionScore(id)` | super_admin, institution_admin, iqac_coordinator | Calculate and persist total score (MUTATION, not query!). **Idempotency (M17):** Uses advisory lock key `hashtext('calc-score:' || submission_id::text)`. The calculation runs within a single transaction. Metric values are read with `SELECT ... FOR SHARE` to prevent concurrent writes from creating inconsistent reads. Updates `last_calculated_at timestamptz` on the submission row so the UI can display staleness. |
| POST | `/api/regulatory/submissions/[id]/report` | `generateSubmissionReport(id, format)` | super_admin, institution_admin, iqac_coordinator | Generate report (async — returns **202 Accepted**). `format` query param: `pdf` (NAAC SSR/AQAR) \| `xlsx` (NIRF DCS pre-fill data sheets — NIRF uses web-based DCS forms, not direct file upload; this export helps manual portal entry) \| `html` (AICTE mandatory disclosure) \| `json` (API export for ONOD integration). Response: `{ status: "generating", reportId: "uuid", estimatedTime: "60-120s" }` |
| GET | `/api/regulatory/submissions/[id]/report/status` | `getReportStatus(submissionId)` | super_admin, institution_admin, iqac_coordinator | Poll async report generation status. Response: `{ status: 'pending'\|'generating'\|'complete'\|'failed', progress: 0-100, reportUrl?: string, error?: string }`. Poll every 5s from UI. |

**Submission Status State Machine (enforced at API route level):**

| From State | To State | Who Can Trigger | Notes |
|------------|----------|-----------------|-------|
| `draft` | `data_collection` | iqac_coordinator, institution_admin, super_admin | Start data collection |
| `data_collection` | `in_review` | iqac_coordinator, institution_admin, super_admin | Submit for review |
| `in_review` | `approved` | principal, institution_admin, super_admin | **Approval gate** — iqac_coordinator cannot approve |
| `in_review` | `returned` | principal, institution_admin, super_admin | Internal review returned for corrections |
| `approved` | `submitted` | institution_admin, super_admin | Mark as submitted to regulatory body |
| `submitted` | `accepted` | institution_admin, super_admin | Regulatory body accepted submission |
| `submitted` | `returned` | institution_admin, super_admin | Regulatory body returned (e.g., NAAC DVV) |
| `returned` | `data_collection` | iqac_coordinator, institution_admin, super_admin | Restart data collection after corrections |
| `returned` | `dvv_revision` | iqac_coordinator, institution_admin, super_admin | DVV-returned submissions enter revision mode (preserves submitted values; auto-refresh disabled) |
| `dvv_revision` | `in_review` | iqac_coordinator, institution_admin, super_admin | DVV revisions complete, submit for re-review |
| `draft` | `cancelled` | iqac_coordinator, institution_admin, super_admin | Cancel a draft submission (excluded from UNIQUE constraint) |

**Terminal states:** `accepted`, `cancelled` — no outgoing transitions.
Invalid transitions return `409 Conflict`.

**Score and timestamp behavior on transitions:**
> - **`returned → data_collection`:** Set `calculated_score = NULL` and `completeness_percentage = 0` to force recalculation after corrections. Evidence may have changed during the return cycle.
> - **`data_collection → in_review`:** No score reset — the current calculated_score is the "submitted for review" snapshot.
> - **`in_review → approved`:** Set `approved_at = now()`, `approved_by = caller.id`. If previously approved and returned, these columns are **overwritten** (not appended). For full audit trail of re-approvals, rely on the `regulatory_metric_value_history` table which captures all value changes with timestamps.
> - **`approved → submitted`:** Set `submitted_at = now()`, `submitted_by = caller.id`. Same overwrite semantics as approved_at.
> - **`submitted → returned`:** Do NOT clear submitted_at/submitted_by — they record the most recent submission attempt for reference during corrections.
> - **`returned → dvv_revision`:** Do NOT reset scores or clear submitted values. Auto-refresh is DISABLED for submissions in `dvv_revision` status — the connector refresh endpoint must check submission status and reject refresh attempts with 409. Only metrics flagged in `regulatory_dvv_queries` as `status = 'open'` can be edited by the IQAC coordinator.
> - **`dvv_revision → in_review`:** All open DVV queries must be in `responded` or `resolved` status before this transition is allowed. The API returns 422 if any queries remain `open`.

**Rate limiting for expensive endpoints:**
> The following endpoints are computationally expensive and MUST be rate-limited at the API route level:
> - `POST /metric-values/refresh` — max 1 concurrent per institution. Lock key: `hashtext('metric-refresh:' || institution_id)`
> - `POST /submissions/[id]/calculate-score` — max 1 concurrent per submission. Lock key: `hashtext('calc-score:' || submission_id)`. The score calculation MUST read all metric values within a single transaction using `SELECT ... FOR SHARE` to prevent concurrent metric value writes from creating inconsistent reads. Add `last_calculated_at timestamptz` to the submission UPDATE so the UI can show staleness.
> - `POST /submissions/[id]/report` — max 1 concurrent per submission. Lock key: `hashtext('gen-report:' || submission_id)`. Report generation can take 10-30s.
> Implementation: **Do NOT use in-memory locks** — Vercel serverless functions run in isolated instances with no shared memory, so in-memory Maps/Sets are useless for rate limiting. Instead, use **database advisory locks** (`SELECT pg_try_advisory_xact_lock(hashtext('metric-refresh:' || $1))`) keyed on `institutionId:endpoint` or `submissionId:endpoint`. If the lock is already held, return `{ success: false, error: 'RATE_LIMITED', message: 'Operation already in progress' }` with HTTP 429. Alternative: use Vercel KV (Redis) or Upstash for distributed rate limiting with TTL-based keys.
>
> **Additional rate limits for abuse prevention:**
> - `POST /evidence` (file upload) — max 10 uploads per minute per user (prevents storage abuse)
> - `POST /data-connectors/[id]/test` — max 5 tests per minute per user (each executes SQL against the database)
> - `POST /simulations` — max 5 per minute per user (involves server-side score computation)
> - All other mutation endpoints — standard 60 requests/minute per user (configurable)

### Simulations API

| Method | Endpoint | Service Method | Roles (T8) | Description |
|--------|----------|---------------|------------|-------------|
| GET | `/api/regulatory/simulations` | `getSimulations(filters)` | super_admin, institution_admin, iqac_coordinator, principal | List simulations |
| POST | `/api/regulatory/simulations` | `createSimulation(data)` | super_admin, institution_admin, iqac_coordinator, principal | Create what-if simulation |
| DELETE | `/api/regulatory/simulations/[id]` | `deleteSimulation(id)` | super_admin, institution_admin, iqac_coordinator | Delete a simulation |

**Simulation overrides schema (stored as JSONB):**
```typescript
overrides: Record<string, number>  // metric_code → overridden_numeric_value
```
The API route calculates `score_delta` and `rank_estimate` server-side before storing.

**Simulation overrides validation (MANDATORY):**
> The `POST /api/regulatory/simulations` endpoint MUST validate the `overrides` JSON object:
>
> 1. **Metric code existence:** Every key in `overrides` must map to an existing `regulatory_metrics.code` within the simulation's framework (join metrics → criteria → framework). Return 400 with the specific invalid code(s).
> 2. **Value range:** Every value must be a finite number within the metric's `validation_min`/`validation_max` range (if defined). Return 400 with specific error messages per failed override.
> 3. **Size limit:** `pg_column_size(overrides) < 65536` (64KB max, enforced at DB via CHECK constraint on `regulatory_simulations.overrides`).
> 4. **Max entries:** Maximum 500 metric overrides per simulation (matching the framework's max metric count from the formula engine safety limits).
> 5. Reject with 400 if any validation fails. Return specific error messages identifying which override key(s) failed and why.
>
> This prevents injection of metric codes from other frameworks, oversized payloads, and misleading simulation results.

### Governance API

| Method | Endpoint | Service Method | Roles (T8) | Description |
|--------|----------|---------------|------------|-------------|
| GET | `/api/regulatory/governing-bodies` | `getGoverningBodies(filters)` | all with institution access | List governing bodies. **Query params:** `body_type` (text: governing_body\|academic_council\|bos\|iqac\|finance_committee\|exam_committee\|anti_ragging\|icc\|grievance_cell), `is_active` (boolean). |
| POST | `/api/regulatory/governing-bodies` | `createGoverningBody(data)` | super_admin, institution_admin, iqac_coordinator, principal | Create governing body |
| PUT | `/api/regulatory/governing-bodies/[id]` | `updateGoverningBody(id, data)` | super_admin, institution_admin, iqac_coordinator, principal | Update body (members, mandate) |
| GET | `/api/regulatory/governing-bodies/[id]/meetings` | `getMeetings(bodyId, filters)` | all with institution access | List meetings for a body |
| POST | `/api/regulatory/governing-bodies/[id]/meetings` | `createMeeting(bodyId, data)` | super_admin, institution_admin, iqac_coordinator, principal | Record a meeting |
| PUT | `/api/regulatory/meetings/[id]` | `updateMeeting(id, data)` | super_admin, institution_admin, iqac_coordinator, principal | Update meeting (agenda, resolutions, action items) |
| PUT | `/api/regulatory/meetings/[id]/approve` | `approveMeeting(id)` | super_admin, institution_admin, iqac_coordinator, principal | Approve meeting minutes |

### Peer Visits API

| Method | Endpoint | Service Method | Roles (T8) | Description |
|--------|----------|---------------|------------|-------------|
| GET | `/api/regulatory/peer-visits` | `getPeerVisits(filters)` | super_admin, institution_admin, iqac_coordinator, principal | List peer visits. **Query params:** `submission_id` (uuid), `visit_type` (text: naac_peer_team\|nba_evaluator\|aicte_expert\|naac_dvv), `status` (text: scheduled\|confirmed\|in_progress\|completed\|postponed\|cancelled). |
| POST | `/api/regulatory/peer-visits` | `createPeerVisit(data)` | super_admin, institution_admin, iqac_coordinator | Schedule a peer visit |
| PUT | `/api/regulatory/peer-visits/[id]` | `updatePeerVisit(id, data)` | super_admin, institution_admin, iqac_coordinator | Update visit details |

> **Peer visits role restriction (M20):** The `peer_visits_read` RLS policy restricts READ access to: super_admin, institution_admin, iqac_coordinator, principal. Staff and HOD should NOT have access to peer visit data (contains evaluator names, findings, and recommendations that are sensitive during active visits). The API route enforces the same role set. This matches the RLS policy already defined in the migration.

### Syllabi API

| Method | Endpoint | Service Method | Roles (T8) | Description |
|--------|----------|---------------|------------|-------------|
| GET | `/api/regulatory/syllabi` | `getSyllabi(filters)` | all with institution access | List course syllabi. **Query params:** `academic_year` (text), `department` (text), `revision_status` (text: current\|under_revision\|archived), `program_id` (uuid). |
| GET | `/api/regulatory/syllabi/[id]` | `getSyllabusById(id)` | all with institution access | Single syllabus with CO-PO mapping |
| POST | `/api/regulatory/syllabi` | `upsertSyllabus(data)` | super_admin, institution_admin, iqac_coordinator, hod, staff | Create/update syllabus |
| PUT | `/api/regulatory/syllabi/[id]/hours` | `updateCompletionHours(id, completedHours)` | super_admin, institution_admin, iqac_coordinator, hod, staff | Update completed teaching hours |

### Benchmarks API

| Method | Endpoint | Service Method | Roles (T8) | Description |
|--------|----------|---------------|------------|-------------|
| GET | `/api/regulatory/benchmarks` | `getBenchmarks(filters)` | all with institution access | List peer benchmarks. **Query params:** `framework_id` (uuid), `academic_year` (text), `peer_institution_name` (text), `metric_code` (text). |
| GET | `/api/regulatory/benchmarks/[id]` | `getBenchmarkById(id)` | all with institution access | Single benchmark detail |
| GET | `/api/regulatory/benchmarks/peer-institutions` | `getPeerInstitutions(filters)` | all with institution access | Distinct peer institution list |
| POST | `/api/regulatory/benchmarks` | `createBenchmark(data)` | super_admin, institution_admin, iqac_coordinator | Create benchmark entry |
| PUT | `/api/regulatory/benchmarks/[id]` | `updateBenchmark(id, data)` | super_admin, institution_admin, iqac_coordinator | Update benchmark |
| DELETE | `/api/regulatory/benchmarks/[id]` | `deleteBenchmark(id)` | super_admin, institution_admin, iqac_coordinator | Delete benchmark |
| GET | `/api/regulatory/benchmarks/comparison` | `getBenchmarkComparison(frameworkId, year)` | super_admin, institution_admin, iqac_coordinator, principal | Gap analysis across peer institutions. **Note:** principal has READ access to comparison data (per T8 "View dashboard" which includes benchmark insights) but CANNOT create/edit/delete benchmark entries (T8 "Manage peer benchmarks" excludes principal). **Required query params:** `framework_id` (uuid), `academic_year` (text). Optional: `peer_institution_name` (text filter). |


> **Metric code validation (M13):** The benchmarks `POST` and `PUT` endpoints MUST validate that `metric_code` exists in the specified framework's metrics. Validation query: join `regulatory_metrics` via `regulatory_criteria` where `regulatory_criteria.framework_id` matches the benchmark's `framework_id` and `regulatory_metrics.code` matches the provided `metric_code`. Return **400 Bad Request** with message `"metric_code '{code}' not found in framework {framework_id}"` if no matching metric exists. This prevents benchmarks from referencing non-existent or mismatched metric codes.

### Dashboard API

| Method | Endpoint | Service Method | Roles (T8) | Description |
|--------|----------|---------------|------------|-------------|
| GET | `/api/regulatory/dashboard/stats` | `getDashboardStats(institutionId)` | super_admin, institution_admin, iqac_coordinator, principal, hod | Framework count, completeness %, active submissions |
| GET | `/api/regulatory/dashboard/deadlines` | `getUpcomingDeadlines(institutionId)` | super_admin, institution_admin, iqac_coordinator, principal, hod | Frameworks with upcoming submission_deadline |
| GET | `/api/regulatory/dashboard/completeness` | `getDataCompleteness(institutionId)` | super_admin, institution_admin, iqac_coordinator, principal, hod | Per-module data completeness chart data |

### Data Connectors API

| Method | Endpoint | Service Method | Roles (T8) | Description |
|--------|----------|---------------|------------|-------------|
| GET | `/api/regulatory/data-connectors` | `getDataConnectors()` | super_admin | List all data connectors with status |
| GET | `/api/regulatory/data-connectors/[id]` | `getDataConnectorById(id)` | super_admin | Connector detail with last test result |
| POST | `/api/regulatory/data-connectors/[id]/test` | `testDataConnector(id, institutionId)` | super_admin | Execute connector query and return sample results |
| POST | `/api/regulatory/data-connectors/[id]/refresh` | `refreshConnectorMetrics(id, institutionId, year)` | super_admin | Run connector and update all linked metric_values |

> **UI Visibility Note (M21):** The Data Sources page is visible ONLY to `super_admin` in the sidebar (see sidebar config: `roles: ['super_admin']`). Non-admin users (staff, hod, iqac_coordinator, etc.) who somehow navigate to `/regulatory/data-connectors` see a read-only info card: *"Data is automatically populated from institutional systems. Contact your administrator for data source configuration."* The sidebar configuration MUST exclude this page for all non-super_admin roles. This is enforced both in the sidebar filter AND in the page component (show info card if role !== super_admin).

**Total API Surface: 67 endpoints across 13 entity groups** (Frameworks, Criteria, Metrics, Metric Values, Evidence, Submissions, Simulations, Governance, Peer Visits, Syllabi, Benchmarks, Dashboard, Data Connectors).

---

## Sidebar Navigation Entry

Add to `sidebarMenuLink.ts` (or equivalent navigation config):

```typescript
{
  title: 'Regulatory Compliance',
  icon: ShieldCheck,  // from lucide-react
  path: '/regulatory',
  roles: ['super_admin', 'institution_admin', 'iqac_coordinator', 'principal', 'hod'],
  children: [
    { title: 'Dashboard', path: '/regulatory' },
    { title: 'Frameworks', path: '/regulatory/frameworks' },
    { title: 'Submissions', path: '/regulatory/submissions' },
    { title: 'Governance', path: '/regulatory/governance' },
    { title: 'Benchmarks', path: '/regulatory/benchmarks' },
    { title: 'Evidence Repository', path: '/regulatory/evidence' },
    { title: 'Data Sources', path: '/regulatory/data-connectors', roles: ['super_admin'] },
  ]
}
```

> **Data Sources page visibility (M21):** The 'Data Sources' page MUST only be visible to `super_admin`. Remove from sidebar for all other roles (including `institution_admin`). Data connectors contain raw SQL query_templates that expose database schema — this is a security-sensitive page. For non-admin roles, add a read-only 'Connector Status' widget on the Regulatory Dashboard showing: connector name, `last_test_status` (success/fail), and `last_tested_at` timestamp. This gives IQAC coordinators visibility into data freshness without exposing connector internals.

**Bottom navigation (mobile):** Include "Regulatory" as a collapsible item if the user's role is in the allowed list.

---

## File Structure (Updated for Pattern A)

```
app/api/regulatory/                  — API Routes (Pattern A server layer)
├── frameworks/
│   ├── route.ts                     — GET (list), POST (create)
│   └── [id]/
│       ├── route.ts                 — GET (detail), PUT (update), DELETE
│       ├── tree/route.ts            — GET (criteria→metrics hierarchy)
│       └── completeness/route.ts    — GET (completeness %)
├── criteria/
│   ├── route.ts                     — GET (list), POST (create)
│   └── [id]/route.ts               — GET, PUT, DELETE
├── metrics/
│   ├── route.ts                     — GET (list), POST (create)
│   └── [id]/route.ts               — GET, PUT
├── metric-values/
│   ├── route.ts                     — GET (list), POST (upsert)
│   ├── refresh/route.ts             — POST (run all data connectors)
│   └── [id]/
│       └── history/route.ts         — GET (audit trail)
├── evidence/
│   ├── route.ts                     — GET (list), POST (upload)
│   ├── search/route.ts              — GET (full-text search)
│   ├── deleted/route.ts             — GET (list soft-deleted, 30-day window)
│   └── [id]/
│       ├── route.ts                 — PUT (update), DELETE (soft-delete)
│       ├── restore/route.ts         — PUT (restore soft-deleted evidence)
│       └── versions/route.ts        — GET (list), POST (add version)
├── submissions/
│   ├── route.ts                     — GET (list), POST (create)
│   └── [id]/
│       ├── route.ts                 — GET (detail)
│       ├── status/route.ts          — PUT (transition status)
│       ├── calculate-score/route.ts — POST (calculate & persist)
│       └── report/
│           ├── route.ts             — POST (generate PDF/xlsx/JSON/HTML report)
│           └── status/route.ts      — GET (poll async report generation status)
├── simulations/
│   ├── route.ts                     — GET (list), POST (create)
│   └── [id]/route.ts               — DELETE
├── governing-bodies/
│   ├── route.ts                     — GET (list), POST (create)
│   └── [id]/
│       ├── route.ts                 — PUT (update)
│       └── meetings/route.ts        — GET (list), POST (create)
├── meetings/
│   └── [id]/
│       ├── route.ts                 — PUT (update)
│       └── approve/route.ts         — PUT (approve minutes)
├── peer-visits/
│   ├── route.ts                     — GET (list), POST (create)
│   └── [id]/route.ts               — PUT (update)
├── syllabi/
│   ├── route.ts                     — GET (list), POST (upsert)
│   └── [id]/
│       ├── route.ts                 — GET (detail)
│       └── hours/route.ts           — PUT (update completed hours)
├── benchmarks/
│   ├── route.ts                     — GET (list), POST (create)
│   ├── peer-institutions/route.ts   — GET (distinct peer list)
│   ├── comparison/route.ts          — GET (gap analysis)
│   └── [id]/route.ts               — GET, PUT, DELETE
├── dashboard/
│   ├── stats/route.ts               — GET (summary stats)
│   ├── deadlines/route.ts           — GET (upcoming deadlines)
│   └── completeness/route.ts        — GET (per-module data completeness)
└── data-connectors/
    ├── route.ts                     — GET (list all connectors)
    └── [id]/
        ├── route.ts                 — GET (detail)
        ├── test/route.ts            — POST (test connector)
        └── refresh/route.ts         — POST (refresh linked metrics)

app/(routes)/regulatory/             — Page Routes (UI layer)
├── page.tsx                         — Dashboard
├── layout.tsx                       — Regulatory module layout wrapper
├── _components/
│   ├── dashboard-overview.tsx
│   ├── completeness-chart.tsx
│   ├── deadline-tracker.tsx
│   └── score-summary-card.tsx
├── frameworks/
│   ├── page.tsx                     — Framework list
│   ├── new/page.tsx                 — Create framework wizard
│   └── [frameworkId]/
│       ├── page.tsx                 — Framework overview (criteria tree, evidence panel)
│       ├── _components/
│       │   ├── criteria-tree.tsx
│       │   ├── evidence-panel.tsx
│       │   └── metric-table.tsx
│       ├── metrics/page.tsx         — Metric list with inline value editing
│       ├── evidence/page.tsx        — Evidence management per framework
│       ├── simulation/page.tsx      — Score simulator with what-if
│       └── report/page.tsx          — Report generation & download
├── submissions/
│   ├── page.tsx                     — Submission history
│   ├── _components/
│   │   └── submission-workflow.tsx   — Status stepper with transition buttons
│   └── [submissionId]/page.tsx      — Submission detail
├── governance/
│   ├── page.tsx                     — 4-tab view: Bodies, Meetings, Syllabi, Peer Visits
│   └── _components/
│       ├── body-list.tsx
│       ├── meeting-list.tsx
│       ├── syllabus-table.tsx
│       └── peer-visit-timeline.tsx
├── benchmarks/
│   ├── page.tsx                     — Peer benchmarking with gap analysis chart
│   └── _components/
│       ├── benchmark-table.tsx
│       └── gap-analysis-chart.tsx
├── evidence/
│   └── page.tsx                     — Full-text evidence repository search
└── data-connectors/
    └── page.tsx                     — Connector health dashboard (nav label: "Data Sources")

hooks/regulatory/                    — React Query hooks (fetch-based, Pattern A)
├── use-frameworks.ts                — useFrameworks, useFramework, useFrameworkTree, useFrameworkCompleteness, useCreateFramework, useUpdateFramework, useDeleteFramework
├── use-criteria.ts                  — useCriteria, useCriterion, useCreateCriterion, useUpdateCriterion, useDeleteCriterion
├── use-metrics.ts                   — useMetrics, useMetric, useCreateMetric, useUpdateMetric
├── use-metric-values.ts             — useMetricValues, useMetricValueHistory, useUpsertMetricValue, useRefreshAutoMetrics
├── use-evidence.ts                  — useEvidence, useSearchEvidence, useUploadEvidence, useUpdateEvidence, useSoftDeleteEvidence, useDeletedEvidence, useRestoreEvidence, useEvidenceVersions, useAddEvidenceVersion
├── use-submissions.ts               — useSubmissions, useSubmission, useCreateSubmission, useUpdateSubmissionStatus, useCalculateScore, useGenerateReport, useReportStatus
├── use-simulations.ts               — useSimulations, useCreateSimulation, useDeleteSimulation
├── use-governance.ts                — useGoverningBodies, useCreateGoverningBody, useUpdateGoverningBody, useMeetings, useCreateMeeting, useUpdateMeeting, useApproveMeeting
├── use-peer-visits.ts               — usePeerVisits, useCreatePeerVisit, useUpdatePeerVisit
├── use-syllabi.ts                   — useSyllabi, useSyllabus, useUpsertSyllabus, useUpdateCompletionHours
├── use-benchmarks.ts                — useBenchmarks, useBenchmark, usePeerInstitutions, useCreateBenchmark, useUpdateBenchmark, useDeleteBenchmark, useBenchmarkComparison
├── use-dashboard.ts                 — useDashboardStats, useUpcomingDeadlines, useDataCompleteness
├── use-data-connectors.ts           — useDataConnectors, useDataConnector, useTestConnector, useRefreshConnector
└── index.ts                         — Barrel export of all hooks

lib/services/regulatory/             — Service layer (server-side only, Supabase queries)
├── regulatory-framework-service.ts  — Framework CRUD + tree + completeness
├── regulatory-criteria-service.ts   — Criteria CRUD (NEW — was missing, criteria methods were in framework service)
├── regulatory-metric-service.ts     — Metric definitions + values + history + auto-refresh
├── regulatory-evidence-service.ts   — Evidence CRUD + search + versioning
├── regulatory-submission-service.ts — Submission CRUD + status machine + score calculation
├── regulatory-simulation-service.ts — Simulation CRUD + score delta computation
├── regulatory-governance-service.ts — Governing bodies + meetings + approvals
├── regulatory-peer-visit-service.ts — Peer visit CRUD
├── regulatory-syllabus-service.ts   — Syllabi + completion tracking + CO-PO
├── regulatory-benchmark-service.ts  — Benchmarks + gap analysis + peer institution aggregation
├── regulatory-dashboard-service.ts  — Dashboard aggregations (NEW — was done inline in hooks)
├── regulatory-data-connector-service.ts — Connector CRUD + test + refresh (NEW — was planned as data-connector-engine.ts)
├── data-connector-engine.ts         — Executes connector SQL, populates metric values
├── formula-engine.ts                — Evaluates metric formulas (cross-metric references)
│   -- Formula syntax: JavaScript-like arithmetic expressions.
│   -- Variables: metric codes (e.g., "1.1.1") resolved to their numeric_value.
│   -- Operators: +, -, *, /, (, ), Math.min(), Math.max(), Math.round()
│   -- Example: "(placed_count / eligible_count) * 100"
│   -- Dependencies: formula_dependencies text[] lists metric codes the formula reads.
│   -- Evaluation order: topological sort on dependency graph (detect cycles → error).
│   -- Depth/scale limits: max dependency chain depth = 10 levels. Max total formula
│   --   dependencies per framework = 500. Formula evaluation timeout = 10 seconds per
│   --   framework. Max formulas evaluated per request = 200. These limits prevent
│   --   DoS via deep/wide dependency chains.
│   -- Security: formulas are admin-authored config (not user input), but still evaluated
│   --   via a safe expression parser (e.g., mathjs) — NEVER eval() or Function().
│   --
│   -- MULTI-YEAR TEMPORAL AGGREGATION:
│   -- Many NAAC metrics require 5-year data (e.g., "Pass percentage over 5 years").
│   -- NIRF requires 3-year averages for financial data. The formula engine supports
│   -- temporal aggregation functions:
│   --
│   --   AVG_YEARS(code, n)  — Average of metric over last n years
│   --     Example: AVG_YEARS('2.6.3', 5) = average pass % over 5 years
│   --   SUM_YEARS(code, n)  — Sum of metric over last n years
│   --     Example: SUM_YEARS('3.4.1', 5) = total extension programs over 5 years
│   --   TREND(code, n)      — Year-over-year growth rate over n years
│   --     Example: TREND('1.1.1', 5) = growth trend for enrollment
│   --   LATEST(code)        — Most recent year's value (default behavior)
│   --
│   -- The report generator uses `data_window_years` on metrics to determine how many
│   -- years of columnar data to display. Multi-year functions query
│   -- regulatory_metric_values for the same metric_id across multiple academic_year values.
│   --
│   -- Schema addition (see Database Schema section): Add `data_window_years integer NOT NULL
│   --   DEFAULT 1` to `regulatory_metrics`. Set to 5 for NAAC QnM metrics requiring 5-year
│   --   data, 3 for NIRF financial averages, 1 for current-year-only metrics.
│
├── score-calculator.ts              — Weighted score aggregation per framework type
│   -- NAAC 2022 uses two-level GPA aggregation: Individual Metric (0-4 scale)
│   --   → Key Indicator GPA → Criterion GPA → Overall CGPA.
│   --   This is NOT simple weighted averaging. Store `scoring_methodology` in
│   --   framework metadata: {method: 'naac_gpa', metric_scale: [0,4],
│   --   aggregation: 'two_level_gpa'}.
│   -- NAAC Binary 2024 uses direct point summation (0-900 scale).
│   -- NIRF uses parameter-specific normalization functions (sigmoid/log).
│   -- NBA uses criterion-wise weighted scores (0-1000 scale).
│   -- The score-calculator reads `metadata.scoring_methodology` from the framework
│   --   row to dispatch to the correct algorithm.
├── report-generator.ts              — PDF/CSV/JSON generation per regulatory body
└── index.ts                         — Barrel export of all services + types

lib/utils/
├── toast-error.ts                   — friendlyErrorMessage() for client-side error display
└── regulatory-utils.ts              — isValidUUID(), validateId(), sanitizeSearch(), formatError()

types/regulatory.types.ts            — TypeScript types (MUST align 1:1 with service types — no duplication)
```

### Hook Architecture Rules

1. **ONE tier of hooks** — no "core" vs "adapter" split. Each hook returns exactly what the API returns.
2. **ALL hooks use `fetch()`** to call API routes — zero direct Supabase imports in hook files.
3. **Query key factory** — centralized in each hook file as `regulatoryKeys.entity.list/detail`.
4. **Mutations use `useMutation`** — never `useQuery` for write operations (fixes the useCalculateScore anti-pattern).
5. **Cache invalidation** — after mutation success, invalidate the broad entity key (e.g., `['regulatory-frameworks']`), not narrow sub-keys.
6. **Error handling** — mutations catch errors and pass to `friendlyErrorMessage()` for toast display. No raw Supabase error strings.

### Data Connector Query Security Note

The `regulatory_metrics` table has `data_connector_query` (SQL text) readable via `metrics_read` USING(true). To prevent leaking DB schema to non-admin roles, the **Metrics API GET endpoints** MUST strip `data_connector_query` and `data_connector_id` from responses unless the caller is `super_admin`. Implementation: `const { data_connector_query, data_connector_id, ...safeMetric } = metric` in the API route.

#### Mandatory: `regulatory_metrics_safe` View (H9)

The `regulatory_metrics_safe` view is MANDATORY (not optional) for all non-super_admin API queries. It strips sensitive data connector fields:

```sql
CREATE OR REPLACE VIEW regulatory_metrics_safe AS
SELECT id, criteria_id, code, name, description, data_type,
       unit, is_auto_calculable, requires_evidence,
       validation_min, validation_max, validation_regex,
       sort_order, data_window_years, formula, formula_dependencies,
       dvv_guidance, metadata, created_at, updated_at
       -- EXCLUDED: data_connector_id, data_connector_query (contain raw SQL / DB schema)
       -- NOTE: weight lives on regulatory_criteria, not regulatory_metrics
FROM regulatory_metrics;
-- IMPORTANT: This view MUST also be created in the canonical migration (after regulatory_metrics table).
```

**API enforcement:** The metrics GET endpoints (`GET /metrics` and `GET /metrics/[id]`) MUST:
- Use `regulatory_metrics_safe` view for non-super_admin queries
- Only return `data_connector_id`, `data_connector_query` when caller is super_admin
- The Data Sources page in the sidebar is already restricted to super_admin only (see Sidebar Navigation)

#### Institution Scoping for Framework-Specific Criteria and Metrics (H9)

For institution-specific frameworks (`regulatory_frameworks.institution_id IS NOT NULL`), criteria and metrics should only be readable by users from that institution. The `criteria_read` and `metrics_read` RLS policies should be enhanced:

```sql
-- Enhanced criteria_read with institution scoping for institution-specific frameworks
CREATE POLICY "criteria_read" ON regulatory_criteria FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM regulatory_frameworks f
    WHERE f.id = framework_id
    AND (f.institution_id IS NULL  -- global templates: readable by all authenticated
         OR f.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
);
```

Apply the same pattern to `metrics_read`:

```sql
-- Enhanced metrics_read with institution scoping for institution-specific frameworks
CREATE POLICY "metrics_read" ON regulatory_metrics FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM regulatory_criteria c
    JOIN regulatory_frameworks f ON f.id = c.framework_id
    WHERE c.id = criteria_id
    AND (f.institution_id IS NULL
         OR f.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  )
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
);
```

> **Note:** This changes the existing `criteria_read` and `metrics_read` policies from simple `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())` to institution-aware policies. Global framework criteria (institution_id IS NULL) remain readable by all authenticated users. Institution-specific framework criteria are scoped to that institution + super_admin.

### Service Architecture Rules

1. **Static class methods** — all services use the existing `ClassName.methodName()` pattern.
2. **Server-side Supabase client** — services use `createServerSupabaseClient()`, NOT browser client.
3. **No auth checks in services** — auth is handled by the API route layer. Services trust they're called from authenticated routes.
4. **Shared utilities** — `isValidUUID()`, `validateId()`, `sanitizeSearch()`, `formatError()` imported from `lib/utils/regulatory-utils.ts`, NOT duplicated per service.
5. **PostgREST injection safety** — all user-supplied search strings pass through `sanitizeSearch()` before `.or()` or `.ilike()` calls.

---

## Known Audit Findings to Address During Implementation

> **These issues were identified during 8 rounds of code review + Module Health Audit (2026-02-23/24).**
> Each item MUST be resolved during the B2A rewrite — they are NOT deferred.

### Phantom Fields (14 fields across 5 pages)

Fields referenced in page components that don't exist on DB rows. The Dashboard API and Framework Detail API MUST compute these server-side:

| Page | Phantom Field | Resolution |
|------|--------------|------------|
| Dashboard | `fw.metric_count` | Compute in `getDashboardStats()`: COUNT of metrics via criteria→metrics join |
| Dashboard | `fw.criteria_count` | Compute in `getDashboardStats()`: COUNT of criteria per framework |
| Dashboard | `fw.score` | Compute in `getDashboardStats()`: Latest submission `calculated_score` or null |
| Dashboard | `fw.cycle` | Derive from `effective_from` / `effective_to` dates |
| Framework Detail | `framework.score` | From latest submission's `calculated_score` |
| Framework Detail | `framework.max_score` | Already exists on `regulatory_frameworks.total_max_score` |
| Framework Detail | `framework.cycle` | Derive from dates |
| Metrics | `metric.previous_value` | Compute: value from previous academic_year for same metric |
| Metrics | `metric.score` | Compute: weighted score contribution from metric value |
| Submissions | `sub.due_date` | Map to `framework.submission_deadline` via framework join |
| Submissions | `sub.assigned_to_name` | **Remove from UI.** Submissions are institution-level (not assigned to individuals). The `created_by` FK tracks who created it. |
| Simulations | `sim.total_original` | Compute in `createSimulation()` and store in `metadata` JSONB |
| Simulations | `sim.total_simulated` | Compute in `createSimulation()` and store in `metadata` JSONB |

### useCalculateScore Anti-Pattern

**Problem:** Wrapped in `useQuery` — fires on mount, refocus, cache invalidation. Performs DB writes silently.
**Fix:** Convert to `useMutation`. The submissions page should show a "Calculate Score" button that triggers it explicitly.

### useRefreshAutoMetrics No-Op

**Problem:** Only invalidates React Query cache — doesn't actually re-run data connectors.
**Fix:** Must call `POST /api/regulatory/metric-values/refresh` which executes the data connector engine server-side.

### Upload Dialogs (Non-Functional Stubs)

**Problem:** Evidence panel and metric table have upload buttons with no handlers.
**Fix:** Wire to `POST /api/regulatory/evidence` with proper file upload (multipart/form-data or Supabase Storage presigned URL).

### Simulation Baselines Always Zero

**Problem:** `useSimulationData` reads `c.score` from criteria — criteria have no score column.
**Fix:** The simulation API route must compute criteria scores from metric_values (aggregate numeric_value × weight through the criteria→metrics chain) before returning to the client.

---

## Performance Architecture

> **Added 2026-02-24 after Performance Engineering review (100 institutions, 10K concurrent users, 1M metric values scale target).**
> Each subsection addresses a specific finding from the review. All items are MANDATORY for implementation — they are NOT future optimizations.

### Async Report Generation

NAAC SSR is 200-300 pages. PDF generation WILL timeout on Vercel's 30-second serverless limit. Report generation MUST be asynchronous.

**Architecture:**

1. `POST /api/regulatory/submissions/[id]/report` returns immediately with:
   ```json
   { "status": "generating", "reportId": "uuid", "estimatedTime": "60-120s" }
   ```
   HTTP status: **202 Accepted**

2. Actual generation runs in one of:
   - **Option A (Recommended):** Supabase Edge Function (Deno, 150s timeout)
   - **Option B:** Vercel Background Function (Pro/Enterprise, 300s timeout)
   - **Option C:** External worker process triggered via webhook

3. Polling endpoint: `GET /api/regulatory/submissions/[id]/report/status`
   Returns: `{ status: 'pending'|'generating'|'complete'|'failed', progress: 0-100, reportUrl?: string, error?: string }`

4. PDF Library: Use `@react-pdf/renderer` (serverless-compatible, no browser needed) instead of Puppeteer.
   - Zero cold-start overhead (no headless browser)
   - Runs in Node.js / Deno without system dependencies
   - For 300-page SSR: generate sections in parallel, assemble final PDF from pre-rendered section PDFs

5. Storage: Generated PDF saved to Supabase Storage bucket `regulatory-reports/{institution_id}/{submission_id}/`
   - `report_file_url` on `regulatory_submissions` updated upon completion

**Rate Limiting:** Max 1 concurrent report generation per institution (advisory lock: `hashtext('report:' || institution_id::text)`).

---

### RLS Performance: JWT Custom Claims

**Problem:** Every query against hot-path tables (metric_values, evidence, submissions) runs 3 correlated subqueries against `profiles` for institution_id check, super_admin check, and role check. At 10,000 concurrent users, `profiles` becomes a contention hotspot.

**Solution: Move role + institution_id into JWT custom claims at login.**

1. At login/token refresh, set custom claims via **Supabase Auth Hook** (`custom_access_token_hook`):
   ```sql
   -- PSEUDOCODE showing the claim structure — actual implementation uses
   -- Supabase's custom_access_token_hook which receives the JWT payload
   -- and returns a modified version. See: supabase.com/docs/guides/auth/jwts
   -- The hook function would add these claims to raw_app_meta_data:
   --   institution_id: profiles.institution_id
   --   app_role: profiles.role
   -- Result: auth.jwt()->'app_metadata'->>'institution_id' becomes available in RLS
   SELECT auth.jwt() || jsonb_build_object(
     'institution_id', p.institution_id::text,
     'app_role', p.role
   ) FROM profiles p WHERE p.id = auth.uid();
   ```

2. RLS policies read claims directly (no profiles subquery):
   ```sql
   -- BEFORE (3 subqueries):
   USING (
     institution_id = auth_institution_id()
     AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin',...))
   )

   -- AFTER (zero subqueries):
   USING (
     institution_id = (auth.jwt()->>'institution_id')::uuid
     OR (auth.jwt()->>'app_role') = 'super_admin'
   )
   ```

3. **Estimated impact:** 3-5x query speedup on every authenticated request. This is foundational — affects every table in the system.

4. **Implementation note:** This optimization should be applied system-wide (all MyJKKN modules), not just regulatory. Plan as a cross-cutting concern.

**Fallback:** If JWT custom claims cannot be implemented immediately, create a combined helper function that returns both role and institution_id in one query:
```sql
CREATE OR REPLACE FUNCTION auth_user_context()
RETURNS TABLE(user_role text, user_institution_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT role, institution_id FROM profiles WHERE id = auth.uid() LIMIT 1
$$;
```

---

### N+1 Prevention: Framework Tree Endpoint

The `GET /api/regulatory/frameworks/[id]/tree` endpoint MUST use exactly 2 queries, not N+1:

```sql
-- Query 1: All criteria for the framework
SELECT * FROM regulatory_criteria WHERE framework_id = $1 ORDER BY sort_order;

-- Query 2: All metrics for all criteria in the framework (single JOIN)
SELECT m.* FROM regulatory_metrics m
JOIN regulatory_criteria c ON m.criteria_id = c.id
WHERE c.framework_id = $1
ORDER BY c.sort_order, m.sort_order;
```

Tree structure is assembled in application code from these two flat result sets. NEVER query metrics per-criterion in a loop.

---

### Dashboard Stats: Materialized Summaries

**Problem:** Dashboard stats compute completeness across 100 institutions x 15 frameworks = 1,500 completeness calculations, each requiring multi-table JOINs.

**Solution:** Use the pre-existing `completeness_percentage`, `auto_populated_count`, `manual_entry_count`, and `total_metrics_count` columns on `regulatory_submissions` as cached summaries.

**Refresh strategy:**
1. The metric-values UPSERT endpoint (`POST /metric-values`) MUST update the parent submission's counters:
   ```sql
   -- NOTE: PostgreSQL SET clauses evaluate against OLD row values, NOT the values being set by
   -- sibling SET clauses. Use subexpressions to compute derived values from fresh subqueries:
   UPDATE regulatory_submissions
   SET auto_populated_count = (SELECT COUNT(*) FROM regulatory_metric_values mv
         JOIN regulatory_metrics m ON mv.metric_id = m.id
         JOIN regulatory_criteria c ON m.criteria_id = c.id
         WHERE c.framework_id = rs.framework_id AND mv.institution_id = rs.institution_id
         AND mv.academic_year = rs.academic_year AND mv.is_auto_calculated = true),
       manual_entry_count = (SELECT COUNT(*) FROM regulatory_metric_values mv
         JOIN regulatory_metrics m ON mv.metric_id = m.id
         JOIN regulatory_criteria c ON m.criteria_id = c.id
         WHERE c.framework_id = rs.framework_id AND mv.institution_id = rs.institution_id
         AND mv.academic_year = rs.academic_year AND mv.is_auto_calculated = false),
       total_metrics_count = (SELECT COUNT(*) FROM regulatory_metrics m
           JOIN regulatory_criteria c ON m.criteria_id = c.id
           WHERE c.framework_id = rs.framework_id),
       completeness_percentage = (
         (SELECT COUNT(*) FROM regulatory_metric_values mv
           JOIN regulatory_metrics m ON mv.metric_id = m.id
           JOIN regulatory_criteria c ON m.criteria_id = c.id
           WHERE c.framework_id = rs.framework_id AND mv.institution_id = rs.institution_id
           AND mv.academic_year = rs.academic_year)::numeric
         / NULLIF((SELECT COUNT(*) FROM regulatory_metrics m2
             JOIN regulatory_criteria c2 ON m2.criteria_id = c2.id
             WHERE c2.framework_id = rs.framework_id), 0) * 100
       ),
       updated_at = now()
   FROM regulatory_submissions rs
   WHERE regulatory_submissions.id = rs.id AND rs.id = <submission_id>;
   ```

2. The dashboard stats endpoint reads ONLY from `regulatory_submissions` (no joins to metrics/values).

3. For super_admin cross-institution view: add pagination (max 20 institutions per page).

---

### Score Calculation: In-Memory Evaluation

**Problem:** Score calculation is O(n x m) with no caching. 50 simultaneous calculations saturate the database.

**Solution:**
1. **Cache the dependency graph:** Store the topological order in `regulatory_frameworks.metadata` under key `formula_order`. Recompute only when criteria/metrics are saved.

2. **Batch-load then compute:** Load ALL metric values for the submission in a single query, build an in-memory Map<metric_code, numeric_value>, then evaluate formulas purely in application code:
   ```typescript
   // 1 query: JOIN metric_values with metrics to get code (code lives on regulatory_metrics, not metric_values)
   const values = await getMetricValuesWithCodes(frameworkId, institutionId, year);
   // values = [{metric_code: '1.1.1', numeric_value: 42, ...}, ...] — code from JOIN
   const valueMap = new Map(values.map(v => [v.metric_code, v.numeric_value]));
   const order = framework.metadata.formula_order; // cached
   for (const code of order) {
     const metric = metricMap.get(code);
     if (metric.formula) {
       valueMap.set(code, evaluateFormula(metric.formula, valueMap));
     }
   }
   ```

3. **Incremental computation (future):** When a single metric value changes, recompute only the affected criteria branch, not the entire tree.

---

### Data Connector Refresh: Global Concurrency Control

**Problem:** 100 institutions refreshing simultaneously = 100 x 36 sequential connector queries = 3,600 queries in flight, exceeding Supabase's connection pool (60-100 connections).

**Solution:**
1. **Global semaphore:** Use a fixed set of 5 advisory lock hash values as a global semaphore:
   ```sql
   -- Try to acquire one of 5 global refresh slots
   SELECT pg_try_advisory_xact_lock(hashtext('global-refresh-slot-' || floor(random() * 5)::int::text));
   ```
   If all 5 slots are occupied, return 429 Too Many Requests: "Maximum concurrent refreshes reached. Try again in a few minutes."

2. **Sequential within a refresh:** Run connector queries sequentially within a single refresh operation (not parallel). Each connector has a 30-second timeout; 36 connectors x average 3s = ~2 minutes total.

3. **Queue-based (Phase 2):** For production scale, implement a `regulatory_refresh_queue` table. A single worker process picks requests off the queue, ensuring controlled throughput.

4. **Partial success handling (M3):** When a batch refresh runs multiple connectors, each connector runs independently. If connector C fails (timeout/error), its metric values are NOT updated — previous values are preserved. The refresh response returns per-connector status:
   ```json
   { "total": 15, "succeeded": 13, "failed": 2, "failures": [{"connector": "DC-14", "error": "timeout after 30s"}, {"connector": "DC-22", "error": "query returned no rows"}] }
   ```
   Failed connectors can be individually retried via `POST /data-connectors/[id]/refresh`. The batch refresh endpoint MUST NOT roll back successful connectors when others fail — each connector's result is committed independently.

5. **Non-existent source table recovery (M4):** A connector's `source_table` may reference a MyJKKN table that does not exist (e.g., a module not yet deployed, or a table renamed in a later migration). The DataConnectorEngine MUST handle this gracefully:
   - Before executing the `query_template`, run a lightweight check: `SELECT to_regclass($source_table)` — returns NULL if the table doesn't exist.
   - If NULL: skip this connector, log a warning, and include it in the batch response as `{ "connector": "DC-XX", "error": "source_table 'table_name' does not exist", "skipped": true }`.
   - Do NOT treat this as a fatal error — other connectors in the batch proceed normally.
   - The `regulatory_data_connectors.last_test_status` should be set to `'error'` with `test_error_message = 'source_table does not exist'`.
   - The Data Sources admin page should surface connectors with `last_test_status = 'error'` prominently so super_admin can fix the query_template.

---

### Evidence Storage: Archival & Lifecycle

**Scale projection:** 100 institutions x 1,000 files/year x 25MB average = 2.5TB/year.

**Storage path partitioning:**
```
regulatory-evidence/{institution_id}/{academic_year}/{filename}
```
Partitioning by academic_year keeps per-directory listings manageable. NEVER list all files in a flat bucket.

**Lifecycle rules:**
1. **Active (0-3 years):** Standard Supabase Storage (hot tier)
2. **Archived (3-7 years):** Move to separate `regulatory-evidence-archive` bucket after submission is accepted + 3 years
3. **Expired (7+ years):** Purge based on retention policy (configurable per institution)

**Soft-delete cleanup job:** A scheduled function (Supabase cron or Edge Function) runs daily:
1. Find evidence where `is_deleted = true AND deleted_at < now() - interval '30 days'`
2. Delete physical file from Supabase Storage
3. Hard-delete the `regulatory_evidence` DB row (service-role, bypassing RLS)
4. Cascade deletes `regulatory_evidence_versions` rows via FK

**Evidence listing:** The evidence API MUST always filter by `institution_id + academic_year` at minimum. Full-text search MUST include `LIMIT 100` in the SQL query (not just API pagination).

---

### Metric Value History: Pagination & Partitioning

The history endpoint MUST return paginated results (default 50, max 200 per page). The index `idx_reg_value_history_metric_value` should be composite: `(metric_value_id, created_at DESC)` for optimal query performance.

For long-term scale (60M rows after 5 years), consider range-partitioning `regulatory_metric_value_history` by `created_at` (yearly partitions). This keeps individual partition sizes manageable and allows archival of old partitions.

---

### Evidence Full-Text Search: Hard SQL LIMIT

The evidence search query MUST include a hard `LIMIT` in the SQL (not just API-level pagination):
- Full-text search: `LIMIT 100` with `ts_rank` ordering
- Trigram fuzzy search: `LIMIT 20` with `similarity() > 0.3` threshold
- Always pre-filter by `institution_id AND academic_year` before full-text ranking

Without SQL-level LIMIT, PostgreSQL fetches and ranks ALL matching rows before truncating.

---

### Criteria Tree: Depth Limit

The `regulatory_criteria` self-referential FK allows unlimited nesting. Add safety limits:
- `depth integer NOT NULL DEFAULT 1 CHECK (depth <= 5)` column on criteria table
- Tree-building queries use `WITH RECURSIVE ... WHERE depth < 10` as safety valve
- No regulatory framework needs more than 5 levels (Parameter -> Sub-parameter -> Metric -> Sub-metric = 4 levels max)

---

### Supporting Indexes for Views

The `regulatory_course_completion_dashboard` view groups by `institution_id, department, academic_year` filtered by `revision_status = 'current'`. Add:
```sql
CREATE INDEX idx_reg_syllabi_current ON regulatory_course_syllabi(institution_id, academic_year) WHERE revision_status = 'current';
```

---

### Trigger Performance: WHEN Clause Optimization

The evidence soft-delete trigger uses a `WHEN` clause to only fire when soft-delete columns change:
```sql
CREATE TRIGGER trg_evidence_soft_delete_guard
  BEFORE UPDATE ON regulatory_evidence
  FOR EACH ROW
  WHEN (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION protect_evidence_soft_delete();
```
This avoids executing the trigger function for benign metadata updates (description changes, type changes).

---

## Additional Data Connectors (from Official Document Cross-Check)

> **Added 2026-02-23 after cross-checking against official NIRF 2025 PDF and NAAC Manual.**
> These 2 connectors were missing from the original analysis because NIRF 2025 introduced new sub-parameters.

### DC-29: Online Education Tracking
**Source table(s):** `online_education_tracking` (NEW — does not exist)
**Feeds:** NIRF TLR-OE (10 marks × 0.30 weight = 3% of total NIRF)
**Also feeds:** NAAC Cr II (KI 2.3 — ICT-enabled Teaching Learning Process)
**Data points:**
- SWAYAM/MOOC course enrollments per program
- Online syllabus completion percentage per course
- Online examination data (courses examined online)
- LMS completion rates (can partially pull from existing `lti_grades`)
- Percentage of courses with online components

**Sample query:**
```sql
SELECT
  COUNT(DISTINCT course_id) as courses_with_online,
  AVG(online_syllabus_pct) as avg_online_coverage,
  SUM(swayam_enrollments) as total_swayam,
  SUM(swayam_completions) as total_swayam_completed
FROM online_education_tracking
WHERE institution_id = $1 AND academic_year = $2;
```

### DC-30: NEP 2020 Compliance
**Source table(s):** `nep_compliance_tracking` (NEW — does not exist)
**Feeds:** NIRF TLR-MIR (5 marks × 0.30 weight = 1.5% of total NIRF)
**Also feeds:** NAAC Cr I (KI 1.2 — Academic Flexibility)
**Data points:**
- Academic Bank of Credits (ABC) registration status
- Students using Multiple Entry/Exit options
- Indian Knowledge System (IKS) courses offered and enrollment
- Programs offered in regional languages
- Courses on sustainable living practices
- Credit transfer data

**Sample query:**
```sql
SELECT
  bool_or(abc_registered) as has_abc,
  COUNT(DISTINCT student_id) FILTER (WHERE entry_exit_type IS NOT NULL) as multi_entry_exit_students,
  COUNT(DISTINCT course_id) FILTER (WHERE is_iks_course = true) as iks_courses,
  COUNT(DISTINCT program_id) FILTER (WHERE is_regional_language = true) as regional_programs,
  COUNT(DISTINCT course_id) FILTER (WHERE is_sustainability_course = true) as sustainability_courses
FROM nep_compliance_tracking
WHERE institution_id = $1 AND academic_year = $2;
```

### DC-31: PhD Scholar Tracking
**Source table(s):** `phd_scholars` (NEW — does not exist)
**Feeds:** NIRF GO-GPHD (40 marks × 0.20 weight = **8% of total NIRF**) + NAAC Binary 9.4 (20 pts)
**CRITICAL:** This is the highest-impact single missing connector — blocks TWO frameworks simultaneously.
**Data points:**
- PhD scholars enrolled (year-wise, department-wise)
- PhD scholars awarded/graduated per year
- JRF/SRF fellowship holders among PhD scholars (NAAC 9.5 for University type)
- Research supervisors (guide-to-scholar ratio)
- Time-to-degree tracking
- Thesis title, submission date, award date

**Sample query:**
```sql
-- NIRF GO-GPHD: PhD graduates per year
SELECT
  COUNT(*) FILTER (WHERE award_date BETWEEN $2 AND $3) as phds_awarded,
  COUNT(*) FILTER (WHERE enrollment_status = 'active') as active_scholars,
  COUNT(*) FILTER (WHERE fellowship_type IN ('JRF','SRF')) as fellowship_holders
FROM phd_scholars
WHERE institution_id = $1;
```

### DC-32: Environmental & Green Initiatives
**Source table(s):** `environmental_initiatives` (NEW — does not exist)
**Feeds:** NAAC Binary Attr 10 — metrics 10.2 (20 pts), 10.3 (20 pts), 10.4 (10 pts) = **50 pts total**
**NOTE:** Previously misattributed to DC-25 (Student Life). This is a separate domain requiring its own connector.
**Data points:**
- Rainwater harvesting capacity (litres)
- Wastewater treatment capacity and reuse %
- Solid waste, bio-waste, e-waste processing records
- Solar/wind/biogas capacity (kW installed)
- LED conversion % and sensor-based conservation
- Energy audit reports (date, findings, actions)
- Water budgeting records
- Green certifications (GRIHA, IGBC, Green Campus)
- Carbon footprint assessment data
- EV charging infrastructure

**Sample query:**
```sql
-- NAAC Attr 10: Green campus summary
SELECT
  SUM(CASE WHEN category = 'solar' THEN capacity_kw ELSE 0 END) as solar_kw,
  SUM(CASE WHEN category = 'rainwater' THEN capacity_litres ELSE 0 END) as rainwater_capacity,
  COUNT(*) FILTER (WHERE category = 'energy_audit') as energy_audits_count,
  MAX(green_certification) as certification_status
FROM environmental_initiatives
WHERE institution_id = $1 AND academic_year = $2;
```

### DC-33: Financial Audits
**Source table(s):** `financial_audits` (NEW — does not exist)
**Feeds:** NAAC Binary 4.4 (10 pts) + NAAC Old Cr VI (financial management)
**Data points:**
- Audit type (statutory, internal, quality)
- Audit date, auditor name/firm
- Findings summary, compliance status
- Action items and resolution tracking
- Audit report document URL

**Sample query:**
```sql
SELECT audit_type, COUNT(*) as audit_count,
  COUNT(*) FILTER (WHERE compliance_status = 'compliant') as compliant_count
FROM financial_audits
WHERE institution_id = $1 AND academic_year = $2
GROUP BY audit_type;
```

### DC-34: Academic Calendar Tracking
**Source table(s):** `academic_calendar_tracking` (NEW — does not exist)
**Feeds:** NAAC Binary 5.7 (15 pts — Academic Calendar Adherence)
**Data points:**
- Planned teaching days vs actual teaching days per semester
- Exam schedule (planned vs actual dates)
- Result declaration turnaround time
- Academic events calendar (orientation, convocation)

### DC-35: Student Welfare Records
**Source table(s):** `student_welfare_records` (NEW — does not exist)
**Feeds:** NAAC Binary 7.5 (15 pts — Student & Employee Welfare)
**Data points:**
- Student insurance policies (count, coverage)
- Student loan facilitation records
- Creche/daycare availability
- Health centre records
- Safety committee meetings and actions

### DC-36: Collaboration & Exchange Programs
**Source table(s):** `collaboration_exchanges` (NEW — does not exist)
**Feeds:** NAAC Binary 7.9 (10 pts — National/International Collaborations)
**Data points:**
- Student/faculty exchange programs (domestic, international)
- Collaborative research projects with partner institutions
- Joint degree programs
- Visiting faculty from partner institutions

**FINAL Updated totals: 36 Data Connectors (15 existing + 21 new)**

> **Completeness audit (2026-02-23):** After adding DC-31 through DC-36, all 60 NAAC Binary metrics and all 16 NIRF sub-parameters now have at least one data connector assigned. See `/Users/omm/Vaults/Claude Setup/Capture/MyJKKN/FST-Regulatory-Engine-Completeness-Audit.md` for the full audit.
>
> **Spec completeness update (2026-02-23):** All 4 previously identified gaps have been addressed:
> 1. ✅ Old NAAC 2022 — full 56-metric breakdown with KI groupings and data connector mappings
> 2. ✅ NIRF discipline-specific — Engineering, Pharmacy (Cat A/B), Colleges, Dental, Medical/Nursing with weight tables and formula variations
> 3. ✅ NBA SAR + AICTE + UGC-AISHE — criteria structures, data mappings, and engine configuration
> 4. ✅ Report output formats — PDF/CSV/JSON specifications per regulatory body with generation architecture
>
> **PRD gap closure (2026-02-23):** Cross-referencing against PRD Section 10 (IQAC Module) identified 4 critical gaps, now addressed with 5 new tables:
> 5. ✅ Evidence version control — `regulatory_evidence_versions` table for DVV/PDV document revision tracking
> 6. ✅ Peer team visit coordination — `regulatory_peer_visits` table for NAAC/NBA visit scheduling and post-visit action tracking
> 7. ✅ Governing bodies & committees — `regulatory_governing_bodies` + `regulatory_body_meetings` tables for composition, minutes, and resolutions
> 8. ✅ Course syllabi & teaching plans — `regulatory_course_syllabi` table with CO-PO mapping for NBA attainment and NAAC Criterion 1
>
> **PRD partial gap closure (2026-02-23):** 4 remaining partial gaps from PRD Section 10 now fully spec'd (T10 section) with schema:
> 9. ✅ Performance benchmarking — `regulatory_peer_benchmarks` table for peer institution comparison (NAAC 6.5.3)
> 10. ✅ Action plan management — OKR integration via `regulatory_metric_id` + `regulatory_target_value` columns on `okr_objectives` (no new table)
> 11. ✅ Document repository search — `pg_trgm` extension + `search_vector` tsvector column + GIN indexes on `regulatory_evidence`
> 12. ✅ Course completion tracking — `regulatory_course_completion_dashboard` view aggregating syllabus completion by department

---

## References

**Official regulatory documents (MUST be used for template configuration):**
- `nirf parameters and ranking.pdf` — **NIRF India Rankings 2025: Ranking Metrics for Overall** (Ministry of HRD, via NBA) — definitive source for parameter weights and marks
- `NAACManual.txt` — NAAC Quality Indicator Framework (QIF) with 7 criteria and Key Indicators (OLD system)
- `NAAC Reforms 2024.pdf` — **Binary Accreditation Framework Workshop** (July 2024) — definitive source for new 10-attribute system with institution-type-specific scoring
- `DrRadhakrishnanCommittee-FinalReport.pdf` — **Dr. Radhakrishnan Committee Final Report** (Nov 2023, Ministry of Education) — architectural blueprint for ONOD, Unified Elicitation Tool, adapted binary accreditation
- `NIRF Guide Book.txt` — Transforming Tamil Nadu's Higher Education: A Guide to NIRF
- NIRF 2025 Official Framework PDFs — [Engineering](https://www.nirfindia.org/nirfpdfcdn/2025/framework/Engineering.pdf), [Pharmacy](https://www.nirfindia.org/nirfpdfcdn/2025/framework/Pharmacy.pdf), [Colleges](https://www.nirfindia.org/nirfpdfcdn/2025/framework/Colleges.pdf), [Dental](https://www.nirfindia.org/nirfpdfcdn/2025/framework/Dental.pdf)
- NBA Accreditation Manual (Tier-I, Washington Accord aligned) — criteria and Programme Outcomes for engineering/pharmacy programs
  - **NOTE:** NBA mandated GAPC (Graduate Attributes and Professional Competencies) Version 4 from January 2025. The NBA SAR framework seed data MUST use GAPC v4 attributes. Verify latest NBA circulars at implementation time for any post-v4 updates.

**JKKN-specific NIRF strategy documents (from vault):**
- `/Users/omm/Vaults/JKKNKB/NIRF/Engineering.md` — JKKN Engineering NIRF strategy with formulas and sub-parameter marks
- `/Users/omm/Vaults/JKKNKB/NIRF/Pharmacy.md` — JKKN Pharmacy NIRF with Category A vs B analysis
- `/Users/omm/Vaults/JKKNKB/NIRF/Index.md` — Cross-institution weight comparison for all JKKN colleges

**Project analysis documents:**
- `/Users/omm/Vaults/Claude Setup/Capture/MyJKKN/FST-SARAL-ERP-Gap-Analysis.md` — Gap analysis identifying regulatory compliance as critical gap
- `/Users/omm/Vaults/Claude Setup/Capture/MyJKKN/FST-Future-Proof-Regulatory-Architecture.md` — Architecture design for config-driven framework engine
- `/Users/omm/Vaults/Claude Setup/Capture/MyJKKN/FST-Missing-Regulatory-Data-Sources.md` — Complete gap map (originally 15 new connectors DC-16–DC-30, expanded to 21 after DC-31–DC-36 additions)
- `/Users/omm/Vaults/Claude Setup/Capture/MyJKKN/FST-NIRF-NAAC-Official-Cross-Check.md` — Cross-check corrections against official documents
- `/Users/omm/Vaults/Claude Setup/Capture/MyJKKN/FST-NAAC-Binary-Framework-Gap-Analysis.md` — NAAC Binary 2024 vs Old 7-criteria comparison with attribute-by-attribute MyJKKN gap map
- `/Users/omm/Vaults/Claude Setup/Capture/MyJKKN/FST-Regulatory-Engine-Completeness-Audit.md` — FST audit of connector completeness across all frameworks (found 6 gaps, added DC-31 through DC-36)
- `/Users/omm/Vaults/JKKNKB/MyJKKN/Gaps-Analysis/SARAL-ERP-Complete-Offerings.md` — SARAL ERP feature catalog (Section 10: IQAC/Quality)
- `/Users/omm/PROJECTS/MyJKKN/specs/MYJKKN-ENHANCEMENT-SPEC.md` — Existing spec format reference

---

## Implementer Guide: Common Pitfalls & Clarifications

> This section was added based on the Round 5 multi-agent review (108 findings across 6 expert perspectives). See `specs/REGULATORY-FRAMEWORK-ENGINE-REVIEW.md` for the full audit report.

### Formula Variable Resolution

Formula variables use metric codes wrapped in curly braces: `{metric_code}`.

**Examples:**
- Formula: `({1.1.1} / {EP.1}) * 100` means: divide metric 1.1.1's value by Extended Profile metric EP.1's value, multiply by 100
- Formula: `({placed_count} / {eligible_count}) * 100` — this format is ILLUSTRATIVE ONLY in the spec. Actual stored formulas use metric codes from the framework.

**Resolution algorithm:**
1. Parse formula string, extract all `{...}` tokens as metric codes
2. For each code, query `regulatory_metric_values` WHERE metric_id IN (SELECT id FROM regulatory_metrics WHERE code = [code] AND criteria_id IN (SELECT id FROM regulatory_criteria WHERE framework_id = [framework_id])) AND institution_id = [institution_id] AND academic_year = [year]
3. Substitute numeric_value into the formula string
4. Evaluate using safe expression parser (e.g., mathjs)
5. If any dependency is NULL, the formula result is NULL (with warning in notes)

**NEVER use eval() or Function().** Use mathjs or a similar sandboxed math expression library.

**Resolution scope:** Formula variables are scoped to the SAME framework. Cross-framework references are NOT supported.

### Score Calculation Algorithms by Framework Type

The `score-calculator.ts` MUST implement framework-specific calculation strategies. The framework's `metadata.scoring_methodology` field determines which algorithm to use.

**NAAC 2022 (Old Grading):**
```json
{ "method": "naac_gpa", "metric_scale": [0, 4], "aggregation": "two_level_gpa" }
```
Algorithm:
1. Each QnM metric scored on 0-4 scale (predefined thresholds in metric metadata)
2. Key Indicator GPA = AVERAGE of its QnM metric scores
3. Criterion GPA = WEIGHTED AVERAGE of its Key Indicator GPAs (weights from criteria)
4. Overall CGPA = WEIGHTED AVERAGE of 7 Criterion GPAs
5. Final grade: A++ (3.76-4.0), A+ (3.51-3.75), A (3.26-3.50), B++ (2.76-3.25), B+ (2.51-2.75), B (2.01-2.50), C (1.51-2.00), D (≤1.50)

**NAAC Binary 2024:**
```json
{ "method": "naac_binary", "max_points": 900, "aggregation": "weighted_sum" }
```
Algorithm:
1. Each attribute scored as raw points (0 to max per attribute)
2. Total = SUM of all attribute scores
3. Compare total against `pass_threshold` for PASS/FAIL
4. For MBGL: map total to maturity level ranges

**NIRF:**
```json
{ "method": "nirf_ranking", "aggregation": "weighted_parameter_scores" }
```
Algorithm:
1. Each sub-parameter value normalized using `f(x)` scaling function (sigmoid/logarithmic)
2. Parameter score = SUM of normalized sub-parameter scores x sub-parameter marks
3. Overall score = SUM of parameter scores x parameter weights (TLR 0.30, RP 0.30, GO 0.20, OI 0.10, PR 0.10)
4. Exact `f(x)` cutoff values must be extracted from NIRF methodology PDF during implementation

**NBA:**
```json
{ "method": "nba_sar", "aggregation": "criterion_percentage" }
```
Algorithm:
1. Each criterion scored as percentage (0-100%)
2. **Per-criterion floor:** Each criterion must independently meet the minimum threshold (60%). A criterion below 60% results in non-accreditation regardless of total score.
3. Total = SUM of (criterion score x criterion weight / 100)
4. Overall minimum 60% required for accreditation (3-year); 75%+ for 6-year full accreditation

### Academic Year to Date Range Conversion

Data connectors use `$2=start_date` and `$3=end_date` parameters. The DataConnectorEngine resolves these from the `academic_year` string and the framework's `year_type`:

```typescript
function resolveYearRange(
  academicYear: string,
  yearType: 'academic' | 'calendar',
  startMonth = 6
): { start: Date, end: Date } {
  if (yearType === 'calendar') {
    // "2025" -> Jan 1 to Dec 31
    const year = parseInt(academicYear);
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
  }
  // "2025-26" -> June 1 to May 31 (default, configurable via startMonth)
  const [startYear] = academicYear.split('-').map(Number);
  return {
    start: new Date(startYear, startMonth - 1, 1),
    end: new Date(startYear + 1, startMonth - 1, 0) // last day of month before start
  };
}
```

The `startMonth` should come from institution configuration (default: 6 for June). Different universities start in different months (June, July, or August).

**API validation:** The metric-values upsert endpoint MUST validate that `academic_year` format matches the parent framework's `year_type`:
- `year_type = 'calendar'` -> accept only `\d{4}` (four digits)
- `year_type = 'academic'` -> accept only `\d{4}-\d{2}` (YYYY-YY)

Return 400 if format mismatch.

---

## Implementer Guide: Known Decisions & Clarifications

> This section documents intentional design decisions, known limitations, and clarifications that prevent implementer confusion. Each item corresponds to a Low-priority finding from the Round 5 review.

### L1. T10 Preview DDL is Illustrative Only

The T10 section contains illustrative DDL for `regulatory_peer_benchmarks`, evidence search indexes, and the course completion view. These are PREVIEWS — the canonical DDL is in the Database Schema / Migration section. Do NOT execute T10 code blocks as separate migrations.

### L2. Immutable Tables Have No UPDATE Triggers (Intentional)

`regulatory_metric_value_history`, `regulatory_evidence_versions`, and `regulatory_simulations` are append-only by design. They have no `updated_at` column and no moddatetime trigger. This is intentional — they should never be updated after creation. The history immutability trigger (trg_history_immutable) enforces this at the DB level.

### L3. auth_user_role() Helper (Not Used)

The `auth_user_role()` function shown commented out in the migration is a REFERENCE ONLY. RLS policies use inline EXISTS subqueries instead. When JWT custom claims are implemented (see Performance Architecture section), both `auth_user_role()` and `auth_institution_id()` will be replaced with JWT claim reads.

### L4. Simulation Overrides Size Limit

`regulatory_simulations.overrides` JSONB has a CHECK constraint limiting to 64KB. Additionally, the API limits to 500 metric overrides per simulation and 50 simulations per institution per framework.

### L5. Evidence Soft-Delete Trigger Uses WHEN Clause

The `trg_evidence_soft_delete_guard` trigger includes a `WHEN` clause that short-circuits when `is_deleted` and `deleted_at` are not changing. This avoids overhead on routine evidence metadata updates.

### L6. CTE Queries in Data Connectors

Data connector SQL validation accepts queries starting with `WITH` (for CTEs) in addition to `SELECT`. Validation is case-insensitive and strips leading whitespace/comments before checking.

### L7. Value History Growth

At 100 institutions x 100 metrics x 4 quarterly refreshes + ~3.3 manual edits/metric/year = ~131K history rows/year. PostgreSQL handles this without issues. No automatic purging needed. **Retention policy:** History rows are retained indefinitely for audit compliance. For institutions exceeding 500K history rows, implement yearly table partitioning on `created_at`. After 7 years, archive partitions to cold storage (matching evidence archival lifecycle).

### L8. File-Type Metrics

For metrics with `data_type = 'file'`: the `value` column stores a URL to the uploaded file (same as evidence file_url). `numeric_value` is NULL. These metrics are always `is_auto_calculable = false` and `requires_evidence = true`.

### L9. Year Format Transition

Year format changes are handled by creating a new framework version. The old framework retains its year_type; the new framework uses the new year_type. Historical metric_values remain linked to the old framework's metrics.

### L10. HOD Dashboard Access

The submissions_read RLS policy includes `hod` for SELECT. This gives HODs access to full submission data, not just dashboard indicators. This is intentional — HODs need to see submission progress and completeness to prioritize their department's data collection. However, sensitive fields (portal_reference, report_file_url) are stripped by the API for hod role.

### L11. Framework Copy Endpoint (Not in Phase 1)

There is no `POST /frameworks/[id]/copy` endpoint in Phase 1. Institutions use global templates directly — metric_values reference metrics from frameworks with `institution_id IS NULL`. This is the intended pattern. Framework copying (for institutional customization) is deferred to Phase 3.

### L12. Staff and Evidence Repository

Staff CAN search and upload evidence (per T8 permissions) but CANNOT navigate to the standalone Evidence Repository page (excluded from sidebar). Staff access evidence through inline upload forms on their assigned metric data entry pages. The sidebar roles for Evidence Repository are: super_admin, institution_admin, iqac_coordinator, principal, hod.

### L13. Criteria/Metrics UPDATE Policies

The criteria_modify and metrics_modify UPDATE policies intentionally lack WITH CHECK clauses. These are super_admin-only operations. Framework version pinning (see Security section) prevents edits during active submissions. At the API layer, validate that framework_id (criteria) and criteria_id (metrics) are not changed.

### L14. Course Completion Dashboard View

The `regulatory_course_completion_dashboard` view is used by the `getDataCompleteness` Dashboard API endpoint. The view is automatically institution-scoped via RLS on the underlying `regulatory_course_syllabi` table. No explicit mention in the API section is needed — the service layer queries the view directly.

### L15. Pharmacy PhO Definitions (TODO)

NBA Pharmacy Programme Outcomes (PhO) definitions are pending PCI's GAPC v4 alignment confirmation. The NBA Pharmacy framework is seeded with placeholder PhOs. Update with actual definitions before pharmacy program accreditation visits.

### L16. Framework Configuration Audit Log (Phase 2)

Changes to framework/criteria/metrics configuration are not tracked in Phase 1. Phase 2 adds a `regulatory_config_audit_log` table with trigger-based change capture. For Phase 1, rely on the git-managed migration files as the configuration audit trail.

### L17. AISHE Portal Template Compatibility

AISHE data submission uses annually updated portal forms. The export format mapping is stored in framework metadata as `portal_template_version`. Update this mapping each year when MHRD/UGC releases the new AISHE form. The system generates CSV; manual verification against the portal is required.

### L18. Consolidated Multi-Institution NIRF (Phase 3)

NIRF Overall ranking can consider the entire JKKN group. This requires aggregating metrics across 9 institutions. Deferred to Phase 3. The schema supports it via a `is_consolidated boolean DEFAULT false` flag on submissions and super_admin-only cross-institution dashboard endpoint.

### L19. Report Draft/Preview

The report generation endpoint always produces a full report. For draft/preview, the UI can render metric data directly without generating a PDF. Add a `draft` query parameter in Phase 2 that produces a watermarked, lower-fidelity version.

### L20. NAAC A-E Scale Metrics

Several NAAC metrics use an A-E scale (e.g., 1.4.1 Feedback System). Use `data_type = 'scale'`. Store scale definitions in metric metadata:
```json
{
  "scale": {
    "A": { "score": 4, "criteria": "Feedback collected, analysed, action taken, communicated" },
    "B": { "score": 3, "criteria": "Feedback collected, analysed, action taken" },
    "C": { "score": 2, "criteria": "Feedback collected and analysed" },
    "D": { "score": 1, "criteria": "Feedback collected" },
    "E": { "score": 0, "criteria": "No feedback mechanism" }
  }
}
```
The UI renders a dropdown with criteria descriptions. The score calculator reads the numeric score from the scale mapping.

### Meetings API Pattern (Mixed Nesting)

Meeting list/create are nested under governing bodies (`/governing-bodies/{bodyId}/meetings`) because they require the body context. Update/approve use flat paths (`/meetings/{meetingId}`) because they operate on a specific meeting by ID. Hooks use different base URLs: `/governing-bodies/${bodyId}/meetings` for list/create, `/meetings/${meetingId}` for update/approve.

> **API Pattern Note (M31):** Body meetings use a MIXED API pattern: listing and creation are NESTED under the governing body (`/api/regulatory/governing-bodies/[id]/meetings`) because `body_id` is required context for those operations. However, update and approve operations use a FLAT pattern (`/api/regulatory/meetings/[id]`) because they operate on a specific meeting by its own ID. This differs from entity-group patterns like benchmarks or evidence which are fully flat. The mixed pattern is intentional — creating a meeting without a body context is nonsensical, but updating a meeting by ID does not need the body prefix. Hooks must handle both base URLs accordingly.

### Submissions RLS is Intentionally Broad

The submissions_update RLS policy is intentionally permissive at the DB level. Fine-grained state transition enforcement is app-layer only. RLS prevents cross-institution mutation; app layer prevents invalid state transitions. This is a deliberate trade-off for simplicity.

### Data Connectors RLS vs Metrics API

The `regulatory_data_connectors` table has super_admin-only RLS. The `regulatory_metrics` table has a FK to `data_connector_id`. The metrics GET API MUST NOT join to data_connectors — it returns `data_connector_id` as a string for super_admin context only, using the `regulatory_metrics_safe` view for non-admin queries.

### auth_institution_id() Dependency

The migration MUST verify that `auth_institution_id()` exists before creating RLS policies:
```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_institution_id') THEN
    RAISE EXCEPTION 'auth_institution_id() function must exist. Run the profiles migration first.';
  END IF;
END $$;
```

### Staff Evidence Access

Staff can upload evidence documents for assigned metrics but cannot see metric values or scores. The evidence upload form for staff role shows only: file upload, evidence_type selector, and description field. Metric name and code are displayed but not the current value. This is intentional — staff provide supporting documentation without seeing institutional performance data.
