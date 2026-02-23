# Regulatory Framework Engine — Complete Specification

> **Status:** Ready for Implementation (Phase 1 scope; NBA Pharmacy PhOs and NIRF Education framework pending verification)
> **Created:** 2026-02-23
> **Based On:** FST Gap Analysis (SARAL ERP vs MyJKKN), Future-Proof Regulatory Architecture FST
> **Total Effort Estimate:** 8-10 weeks
> **Priority:** P0 (Critical — regulatory compliance)

---

## Executive Summary

MyJKKN has 39 modules and 300+ tables but **zero automated regulatory reporting**. NAAC, NIRF, NBA, AICTE, and UGC submissions are done manually via spreadsheets. This module builds a **config-driven Regulatory Framework Engine** that:

1. Defines ANY accreditation/ranking body's criteria as database configuration (not code)
2. Auto-pulls data from 15 existing MyJKKN module tables via **36 reusable Data Connectors** (DC-01 through DC-36; 15 existing + 21 new)
3. Generates submission-ready reports in required formats (PDF for NAAC SSR/AQAR, CSV/JSON for NIRF portal, HTML for AICTE disclosure)
4. Survives regulatory changes without code rewrites — admin reconfigures, not developer

**Pre-configured Frameworks (15 total):**
- NAAC 2022 Revised (7 criteria, 56 metrics)
- NAAC Binary 2024 × 3 institution types (10 attributes, 60 metrics each)
- NIRF 2025 Overall + 6 discipline variants (Engineering, Pharmacy Cat A/B, Colleges, Dental, Medical/Nursing)
- NBA SAR (Engineering + Pharmacy programs, 10 criteria, PO1-PO12)
- AICTE Mandatory Disclosure (9 categories, compliance checklist)
- UGC-AISHE (9 data sections, export-only)

**Key Architectural Decision:** ONE engine, MANY frameworks. All 15 pre-configured frameworks (1 NAAC Old + 3 NAAC Binary + 7 NIRF + 2 NBA + 1 AICTE + 1 AISHE) are database configurations, not separate modules. When rules change, change the config — not the code. The NAAC Binary Framework (2024) has institution-type-specific scoring — handled by creating 3 framework variants (University, Autonomous, Affiliated), each summing to 900 points but with different weight distributions. NIRF discipline rankings share the same 5 parameters but with different weights and sub-parameter selections — the engine handles this via per-framework metric configuration.

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
- Every metric traceable to source records (DVV-ready audit trail)
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
- **Cyclical:** NAAC SSR (every 5 years), NBA SAR (every 3 years per program)
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
- ❌ No submission tracking workflow (draft → review → submitted)
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
2. Dashboard shows: 34/56 metrics auto-populated, 22 need manual entry (qualitative narratives)
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
| Create/edit criteria & metrics | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
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
├── Data Sources/          — Data connector health check & status
└── Settings/              — Year config, notification preferences
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

### T10: Connections — Module Integration Map

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
  JOIN programs p ON lp.program_id = p.id
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
    COUNT(CASE WHEN outcome_type = 'employed' THEN 1 END) as placed,
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

### T11: Success Metrics

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

```sql
-- ═══════════════════════════════════════════════
-- REGULATORY FRAMEWORK ENGINE — MIGRATION
-- ═══════════════════════════════════════════════

-- 1. Framework Definitions (NAAC, NIRF, NBA, AICTE, UGC, ARIIA...)
CREATE TABLE regulatory_frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id),  -- NULL = global template
  name text NOT NULL,                                -- "NAAC SSR 2022 Revised"
  body text NOT NULL,                                -- "NAAC", "NIRF", "NBA", "AICTE", "UGC"
  framework_type text NOT NULL DEFAULT 'accreditation', -- accreditation | ranking | compliance | reporting
  institution_type text,                             -- NULL = universal; 'university' | 'autonomous_college' | 'affiliated_college' (NAAC Binary has different weights per type)
  version text NOT NULL,                             -- "2022-rev", "2025"
  effective_from date,
  effective_to date,                                 -- NULL = currently active
  year_type text NOT NULL DEFAULT 'academic',        -- academic | calendar (NIRF=calendar, NAAC=academic)
  status text NOT NULL DEFAULT 'active',             -- draft | active | archived
  total_max_score numeric,                           -- e.g., 1050 for NAAC Old, 900 for NAAC Binary, 100 for NIRF (normalized)
  description text,
  submission_portal_url text,                        -- e.g., https://nirfrankings.in
  submission_deadline date,
  code text UNIQUE,                                    -- unique short code: 'NIRF_2025_OVERALL', 'NAAC_BINARY_2024', 'NBA_SAR_ENGINEERING'
  metadata jsonb DEFAULT '{}',                       -- body-specific config (includes program_type for NBA: {"program_type":"B.Tech"})
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(institution_id, body, version, institution_type)
  -- NOTE: institution_type is nullable (NULL = universal, applies to all types).
  -- PostgreSQL treats NULL != NULL in UNIQUE constraints, so multiple (same body, version, NULL)
  -- rows could exist. Mitigate with a partial unique index:
  -- CREATE UNIQUE INDEX idx_frameworks_universal ON regulatory_frameworks
  --   (institution_id, body, version) WHERE institution_type IS NULL;
);

-- 2. Criteria Tree (hierarchical — supports sub-criteria)
CREATE TABLE regulatory_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES regulatory_frameworks(id) ON DELETE CASCADE,
  parent_criteria_id uuid REFERENCES regulatory_criteria(id),  -- NULL = top-level
  code text NOT NULL,                                -- "I", "1.1", "TLR", "TLR-1"
  name text NOT NULL,                                -- "Curricular Aspects"
  description text,
  weight numeric,                                    -- 0-100 (% contribution at this level)
  max_score numeric,                                 -- max points for this criteria
  sort_order integer NOT NULL DEFAULT 0,
  is_qualitative boolean DEFAULT false,              -- some criteria are descriptive, not numeric
  evidence_required boolean DEFAULT true,
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
  data_type text NOT NULL DEFAULT 'number',          -- number | percentage | ratio | text | boolean | file | currency
  unit text,                                         -- "count", "%", "INR lakhs", "ratio", "years"
  formula text,                                      -- e.g., "(placed_count / eligible_count) * 100"
  formula_dependencies text[],                       -- metric codes this formula depends on
  data_connector_id text REFERENCES regulatory_data_connectors(id), -- references a named connector (DC-01, DC-02...)
  data_connector_query text,                         -- actual SQL or query config (JSON)
  is_auto_calculable boolean DEFAULT false,
  requires_evidence boolean DEFAULT true,
  validation_min numeric,
  validation_max numeric,
  validation_regex text,
  sort_order integer DEFAULT 0,
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
  academic_year text NOT NULL,                       -- "2025-26" or "2025" (calendar year for NIRF)
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

-- 5. Metric Value History (audit trail — every change recorded)
CREATE TABLE regulatory_metric_value_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_value_id uuid NOT NULL REFERENCES regulatory_metric_values(id) ON DELETE CASCADE,
  old_value text,
  new_value text,
  change_type text NOT NULL,                         -- auto_refresh | manual_entry | manual_override | verification
  changed_by uuid REFERENCES profiles(id),
  change_reason text,
  source_snapshot jsonb,
  created_at timestamptz DEFAULT now()
);

-- 6. Evidence Documents
CREATE TABLE regulatory_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id uuid REFERENCES regulatory_metrics(id),
  criteria_id uuid REFERENCES regulatory_criteria(id),
  submission_id uuid,  -- FK added after regulatory_submissions table exists (see ALTER TABLE below)
  institution_id uuid NOT NULL REFERENCES institutions(id),
  academic_year text NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,                                    -- pdf, jpg, xlsx, etc.
  file_size_bytes bigint,                            -- bigint to support files > 2GB
  description text,
  evidence_type text DEFAULT 'supporting',           -- supporting | primary | certificate | screenshot
  uploaded_by uuid NOT NULL REFERENCES profiles(id),
  is_deleted boolean DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}',
  CHECK (metric_id IS NOT NULL OR criteria_id IS NOT NULL)  -- evidence must link to a metric or criteria
);

-- 7. Submissions (workflow: draft → review → approved → submitted)
CREATE TABLE regulatory_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES regulatory_frameworks(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  academic_year text NOT NULL,
  status text NOT NULL DEFAULT 'draft',              -- draft | data_collection | in_review | approved | submitted | accepted
  completeness_percentage numeric DEFAULT 0,
  auto_populated_count integer DEFAULT 0,
  manual_entry_count integer DEFAULT 0,
  total_metrics_count integer DEFAULT 0,
  calculated_score numeric,                          -- estimated total score
  submitted_at timestamptz,
  submitted_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  approved_by uuid REFERENCES profiles(id),
  portal_reference text,                             -- external submission ID/reference
  report_file_url text,                              -- generated report PDF
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(framework_id, institution_id, academic_year)
);

-- Add deferred FK from regulatory_evidence → regulatory_submissions (created after submissions table exists)
ALTER TABLE regulatory_evidence ADD CONSTRAINT fk_evidence_submission
  FOREIGN KEY (submission_id) REFERENCES regulatory_submissions(id);

-- 8. Data Connector Registry (named, reusable query definitions)
CREATE TABLE regulatory_data_connectors (
  id text PRIMARY KEY,                               -- "DC-01", "DC-02", ...
  name text NOT NULL,                                -- "Student Enrollment & Demographics"
  description text,
  source_module text NOT NULL,                       -- "learner-management", "staff", etc.
  source_tables text[] NOT NULL,                     -- ["learners_profiles", "admissions"]
  query_template text NOT NULL,                      -- SQL with $1=institution_id, $2=start_date, $3=end_date
  output_type text NOT NULL DEFAULT 'single_value',  -- single_value | table | aggregation
  output_columns text[],                             -- column names in result set
  is_active boolean DEFAULT true,
  last_tested_at timestamptz,
  last_test_status text,                             -- success | error | warning
  test_error_message text,
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 9. Score Simulations (what-if scenarios)
CREATE TABLE regulatory_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES regulatory_frameworks(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  name text NOT NULL,                                -- "What if 5 more PhD faculty"
  base_academic_year text NOT NULL,
  overrides jsonb NOT NULL DEFAULT '{}',             -- {metric_code: new_value, ...}
  calculated_score numeric,
  score_delta numeric,                               -- difference from base
  rank_estimate text,                                -- estimated rank band
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

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

-- Standard pattern: institution_id match OR super_admin bypass
-- All institution-scoped tables use USING + WITH CHECK per CLAUDE.md template

-- Frameworks: global templates (institution_id IS NULL) visible to all, writable only by super_admin
CREATE POLICY "frameworks_read" ON regulatory_frameworks FOR SELECT USING (
  institution_id IS NULL
  OR institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "frameworks_write" ON regulatory_frameworks FOR INSERT
  WITH CHECK (
    institution_id = auth_institution_id()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
CREATE POLICY "frameworks_modify" ON regulatory_frameworks FOR UPDATE USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
) WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);
CREATE POLICY "frameworks_delete" ON regulatory_frameworks FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- Metric values: standard institution scoping with WITH CHECK
CREATE POLICY "metric_values_access" ON regulatory_metric_values FOR ALL USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
) WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "evidence_access" ON regulatory_evidence FOR ALL USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
) WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "submissions_access" ON regulatory_submissions FOR ALL USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
) WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "simulations_access" ON regulatory_simulations FOR ALL USING (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
) WITH CHECK (
  institution_id = auth_institution_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

-- Criteria & metrics: readable by all, writable only by super_admin (framework definitions)
CREATE POLICY "criteria_read" ON regulatory_criteria FOR SELECT USING (true);
CREATE POLICY "criteria_write" ON regulatory_criteria FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "criteria_modify" ON regulatory_criteria FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "criteria_delete" ON regulatory_criteria FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "metrics_read" ON regulatory_metrics FOR SELECT USING (true);
CREATE POLICY "metrics_write" ON regulatory_metrics FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "metrics_modify" ON regulatory_metrics FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Data connectors: readable by all, writable only by super_admin (contains query_template SQL)
CREATE POLICY "connectors_read" ON regulatory_data_connectors FOR SELECT USING (true);
CREATE POLICY "connectors_write" ON regulatory_data_connectors FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "connectors_modify" ON regulatory_data_connectors FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "connectors_delete" ON regulatory_data_connectors FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Value history: append-only audit trail, scoped through parent metric_value
CREATE POLICY "value_history_read" ON regulatory_metric_value_history FOR SELECT USING (true);
CREATE POLICY "value_history_insert" ON regulatory_metric_value_history FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM regulatory_metric_values mv
    WHERE mv.id = metric_value_id
    AND (mv.institution_id = auth_institution_id()
         OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'))
  ));
-- No UPDATE or DELETE policies on history = immutable audit trail

-- ═══════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════

CREATE INDEX idx_reg_criteria_framework ON regulatory_criteria(framework_id);
CREATE INDEX idx_reg_criteria_parent ON regulatory_criteria(parent_criteria_id);
CREATE INDEX idx_reg_metrics_criteria ON regulatory_metrics(criteria_id);
-- NOTE: metric_values UNIQUE(metric_id, institution_id, academic_year) already creates an implicit index
CREATE INDEX idx_reg_metric_values_inst_year ON regulatory_metric_values(institution_id, academic_year);
CREATE INDEX idx_reg_evidence_metric ON regulatory_evidence(metric_id, institution_id, academic_year);
-- NOTE: submissions UNIQUE(framework_id, institution_id, academic_year) already creates an implicit index
CREATE INDEX idx_reg_simulations_framework ON regulatory_simulations(framework_id, institution_id);
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4) — P0

```
Week 1: Database & Core API
├── Day 1-2: Apply migration (9 new tables + RLS + indexes)
├── Day 3-4: CRUD hooks for frameworks, criteria, metrics
├── Day 5: Seed frameworks: NAAC 2022 (7 criteria, 56 metrics), NIRF Overall + 6 discipline variants, NAAC Binary × 3 institution types

Week 2: Data Connectors
├── Day 1-2: Build DC-01 through DC-05 (enrollment, faculty, publications, placement, admissions)
├── Day 3-4: Build DC-06 through DC-10 (finance, academic, industry, welfare, quality)
├── Day 5: Build DC-11 through DC-15 (competency, VAC, org, resources, social)

Week 3: Metric Calculation Engine
├── Day 1-2: Auto-refresh service — runs all connectors, populates metric_values
├── Day 3-4: Formula engine — simple expression evaluator for derived metrics
├── Day 5: Metric value history tracking + audit trail

Week 4: Core UI
├── Day 1-2: Framework list page + criteria tree viewer
├── Day 3: Metric values page (auto/manual indicators, drill-down)
├── Day 4: Manual entry form + evidence upload
├── Day 5: Integration testing, seed NBA SAR + AICTE + UGC-AISHE frameworks
```

### Phase 2: Intelligence (Weeks 5-7) — P1

```
Week 5: Dashboard & Completeness
├── Day 1-2: Regulatory dashboard (score overview, completeness bars, deadlines)
├── Day 3-4: Data source health check page (connector status, last refresh, errors)
├── Day 5: Notification system (deadline reminders, stale data alerts)

Week 6: Score Simulation
├── Day 1-2: NIRF score calculator (weighted aggregation across parameters)
├── Day 3-4: What-if simulator UI (adjust metrics, see score/rank impact)
├── Day 5: Year-over-year comparison view

Week 7: Report Generation
├── Day 1-2: NAAC AQAR PDF template + generation engine
├── Day 3-4: NIRF data export (portal-compatible CSV/JSON)
├── Day 5: Submission workflow (draft → review → approve → submit)
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
├── Day 5: Peer institution benchmarking (manual peer data entry)

Week 10: Polish & Handoff
├── Day 1-2: AICTE mandatory disclosure template + AISHE export
├── Day 3: Performance optimization (connector caching, batch refresh)
├── Day 4-5: Documentation, admin training guide, UAT
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

Ship with these frameworks pre-configured (seeded in migration):

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
| 2.1.2 | 2.1 | QnM | 20 | % seats filled against reserved categories (SC/ST/OBC, 5 years) | DC-01: `learners_profiles` (community field), DC-09 |
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
After all new tables built:       ~34/56 = 61%  (remaining 22 are qualitative narratives)
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

**IMPORTANT for Overall category:** GO uses GUE (exam results) + GPHD (PhD graduates) ONLY. Placement/salary are NOT sub-parameters in Overall — they apply in discipline-specific rankings.

**TLR sub-parameter details:**
- SS = Student Strength including Doctoral Students (20 marks)
- FSR = Faculty-student ratio, emphasis on permanent faculty (25 marks)
- FQE = Faculty with PhD (or equivalent) and Experience (20 marks)
- FRU = Financial Resources and their Utilisation (20 marks)
- OE = Online Education: Online Completion of Syllabus & Exams and Swayam (10 marks) [NEP 2020]
- MIR = Multiple Entry/exit, Indian Knowledge System, Regional Languages (5 marks) [NEP 2020] — also abbreviated MIRS in some documents

**Footnotes from official document:**
- For State Public Universities, FSR is 1:20
- For Universities/State Public Universities, Perception = 70% Peer + 30% Accreditation
- Research/Patent data may be pulled from Scopus/WoS directly by NIRF

### NAAC Binary Accreditation 2024 (10 Attributes — from NAAC Reforms Workshop & Radhakrishnan Committee Report)

> **Source:** `NAAC Reforms 2024.pdf` — Binary Accreditation Framework Workshop (July 2024)
> **Also:** `DrRadhakrishnanCommittee-FinalReport.pdf` — Ministry of Education (November 2023)
> **Outcome:** Binary — Accredited / Awaiting Accreditation / Not Accredited + Level 1-5 progression
> **Total Score:** 900 points (all institution types sum to 900, but weight distribution differs)
> **Key Difference from Old:** Institution-type-specific scoring — University, Autonomous College, and Affiliated College each get different max scores per attribute

**Why 3 Framework Variants Are Needed:**
The `regulatory_frameworks` table now has `institution_type` column. Seed 3 variants:
- `NAAC Binary 2024` + `institution_type = 'university'`
- `NAAC Binary 2024` + `institution_type = 'autonomous_college'` ← **JKKN institutions use this**
- `NAAC Binary 2024` + `institution_type = 'affiliated_college'`

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
| 1.3 Curriculum Flexibility (CBCS, MEME, ABC) | 10 | Document + Data | `nep_compliance_tracking` (NEW) |
| 1.4 Practical & Industry Focus | 10 | Data | `courses` (skill %), `learner_industry_engagements` |
| 1.5 Skill Orientation (NSQF/NHEQF) | 10 | Document | Manual entry + evidence |
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
| Data (auto-calculated) | ~22 metrics | Data Connector pulls from DB → auto-populates |
| Document + Data (mixed) | ~18 metrics | Partial auto-calc + evidence upload required |
| Document only (binary proof) | ~20 metrics | Manual checklist + document upload (no formula) |

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

**TLR:**
- `SS = f(NT, NE) × 15 + f(NP) × 5` — Student Strength including doctoral students
- `FSR = f(F/N)` — Target 1:15 for max marks (1:20 for State Public Universities)
- `FQE = FQ + FE` — FQ from PhD % (10 marks), FE from experience distribution (10 marks)
- `FRU = 7.5×f(BC) + 22.5×f(BO)` — Capital + Operational expenditure per student (3-year avg). **Note:** Coefficients (7.5/22.5) shown for Engineering/Pharmacy/Colleges (FRU=30). For Overall (FRU=20), coefficients scale proportionally. For Dental (FRU=35), coefficients are 8.75/26.25.

**RP:**
- `PU = 35 × f(P/FRQ) - 5 × f(Pret)` — Publications per faculty, minus retraction penalty
- `QP = {20 × f(CC/FRQ) + 20 × f(TOP25P/P)} - 5 × f(Cret)` — Citations + quality, minus retraction
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

#### Programme Outcomes (PO1–PO12 — Washington Accord)

The engine must store and track attainment of these 12 POs per program:

| PO | Description | Measured Via |
|----|-------------|-------------|
| PO1 | Engineering Knowledge | CO attainment in core courses |
| PO2 | Problem Analysis | CO attainment + project evaluations |
| PO3 | Design/Development of Solutions | Capstone projects, design courses |
| PO4 | Conduct Investigations | Lab courses, research projects |
| PO5 | Modern Tool Usage | Software/simulation lab performance |
| PO6 | Engineer and Society | Humanities/ethics course COs |
| PO7 | Environment and Sustainability | Environmental engineering COs |
| PO8 | Ethics | Professional ethics course + activity |
| PO9 | Individual and Team Work | Project courses, team assignments |
| PO10 | Communication | Presentation scores, report quality |
| PO11 | Project Management & Finance | Management course + capstone |
| PO12 | Life-long Learning | Self-learning initiatives, MOOC completion |

**CO-PO Mapping:** The engine's existing `competency_catalog` + `course_competency_mapping` tables provide the foundation. Each Course Outcome maps to Programme Outcomes with correlation levels (1=Low, 2=Medium, 3=High). Attainment is computed from exam/assignment scores.

#### NBA for Pharmacy Programs

Same 10 criteria but with pharmacy-specific POs defined by Pharmacy Council of India (PCI). Key differences:
- Pharmacy has **PhO1–PhO12** (Pharmaceutical Outcomes) instead of PO1–PO12
- PhOs emphasize patient care, drug safety, pharmaceutical ethics, and regulatory compliance
- **TODO:** Obtain exact PCI PhO definitions for the seed data — currently a gap in this spec

The engine stores these as a separate framework:
```
{ code: 'NBA_SAR_ENGINEERING', metadata: { program_type: 'B.Tech' } }
{ code: 'NBA_SAR_PHARMACY', metadata: { program_type: 'B.Pharm' } }
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
| **SSR (Self-Study Report)** | PDF (200-300 pages) | Extended Profile + 7 Criteria sections + SWOC + Declaration | Partial — QnM data auto-filled, QlM narratives manual | Every 5 years (accreditation cycle) |
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

## File Structure (New)

```
app/(routes)/regulatory/
├── page.tsx                          — Dashboard
├── _components/
│   ├── dashboard-overview.tsx
│   ├── completeness-chart.tsx
│   ├── deadline-tracker.tsx
│   └── score-summary-card.tsx
├── frameworks/
│   ├── page.tsx                      — Framework list
│   ├── new/page.tsx                  — Create framework wizard
│   └── [frameworkId]/
│       ├── page.tsx                  — Framework overview
│       ├── criteria/page.tsx         — Criteria tree
│       ├── metrics/page.tsx          — Metric list with values
│       ├── evidence/page.tsx         — Evidence management
│       ├── simulation/page.tsx       — Score simulator
│       └── report/page.tsx           — Report generation
├── submissions/
│   ├── page.tsx                      — Submission history
│   └── [submissionId]/page.tsx       — Submission detail
├── data-sources/
│   └── page.tsx                      — Connector health dashboard
└── settings/
    └── page.tsx                      — Year config, notifications

hooks/regulatory/
├── use-frameworks.ts
├── use-criteria.ts
├── use-metrics.ts
├── use-metric-values.ts
├── use-evidence.ts
├── use-submissions.ts
├── use-data-connectors.ts
├── use-simulations.ts
├── use-regulatory-dashboard.ts
└── index.ts

lib/services/regulatory/
├── data-connector-engine.ts          — Executes connectors, populates values
├── formula-engine.ts                 — Evaluates metric formulas
├── score-calculator.ts               — Weighted score aggregation
├── report-generator.ts               — PDF/CSV generation
└── framework-seeder.ts               — Seeds NAAC/NIRF templates
```

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
