---
title: Compliance Unification Program — 15-PR sequence to unify all accreditation work under /accreditation/*
version: 1.0
status: LOCKED — Director approved 2026-04-17
author: Director (Omm) + Claude
parent: /Users/omm/PROJECTS/MyJKKN/docs/one-jkkn-one-data.md (context library)
grand_program: /Users/omm/PROJECTS/MyJKKN/specs/one-jkkn-one-data/MASTER-PLAN.md (9-month, 18-sprint plan)
supersedes: /Users/omm/PROJECTS/MyJKKN/specs/workshop-transformation-resurrection/PHASE-1A-SPEC.md v2.1 (retired 2026-04-17)
body_coverage: ALL 10 — NAAC, NIRF, NBA, QS, DCI, PCI, INC, AICTE, NCTE, UGC (Director mandate — body-agnostic from day one, not NAAC-only)
---

# Compliance Unification Program

## North Star (inherited from docs/one-jkkn-one-data.md §1)

> **Every keystroke entered once. Every compliance format reproducible on click.**

For ALL 10 bodies — not just NAAC. Every retrofit in this program must emit evidence for every applicable body at event-time, not at query-time.

## Why this program exists

Production code sweep 2026-04-17 found **10+ compliance-adjacent artifacts scattered across 7 modules** (Solutions Hub, Admission, Admin PDE, Campus Living, Startup Studio, Permissions Audit, Notifications, Work-Pulse, B2A). Each was built locally without a unified substrate. Result: duplicate data entry, fragmented reporting, one-off NAAC implementations that don't transfer to NIRF/NBA/DCI/PCI/INC/NCTE/AICTE/UGC.

The v2.1 Phase 1a spec proposed building a NEW module — wrong diagnosis. The correct diagnosis is: **unify what exists.** Retrofit each artifact to write to a shared polymorphic evidence junction + read from a shared multi-body metrics catalog. Each unit of work is independently reviewable → 15 PRs.

## Existing Production Artifacts (inventory as of 2026-04-17)

| # | Artifact | Location | Current body coverage | Retrofit PR |
|---|----------|----------|----------------------|-------------|
| 1 | `ComplianceService` class (AI-solution quota compliance) | `lib/services/solutions/compliance-service.ts` | N/A (not accreditation) | **PR-A1** (rename to disambiguate) |
| 2 | `PublicationsService.getAccreditationMetrics(type?: 'nirf'\|'naac')` + `calculateNIRFMetrics()` + `calculateNAACCriteria()` | `lib/services/solutions/publications-service.ts` | NIRF + NAAC (half-built substrate!) | **PR-A2** (extend to 10 bodies + introduce evidence junction) |
| 3 | `naac-report-service` + `use-naac-report` hook + `naac-report-generator` component | `lib/services/admission/`, `hooks/admission/`, `app/(routes)/admission/group-dashboard/_components/` | NAAC only | **PR-A3** (retrofit to read from substrate, extend to all bodies) |
| 4 | `/admin/pde/naac-evidence/page.tsx` | Admin PDE | NAAC only | **PR-A4** (retrofit to substrate, add body switcher) |
| 5 | `/campus-living/reports/anti-ragging-compliance/page.tsx` | Campus Living | UGC anti-ragging only (not tagged as evidence) | **PR-A5** (emit UGC + NAAC 7.7 + NAAC 5.6(Auto) evidence rows) |
| 6 | `/api/b2a/grievance/*` (3 routes) — gateway exists, grievance module does NOT (0-row tables) | B2A gateway | NAAC 7.7 planned | **PR-A6** (complete grievance module behind gateway, emit multi-body evidence) |
| 7 | `/api/solutions/publications/accreditation/{naac,nirf}/route.ts` + top-level | Solutions Hub | NAAC + NIRF routes | Touched in PR-A2 |
| 8 | `ip_filings.naac_score_claim + naac_criteria + naac_metric_code` columns | IP filings table | NAAC tagging inline | Touched in PR-A2 (migrate to junction) |
| 9 | `sh_publications.naac_criterion` column | Publications table | NAAC tagging inline | Touched in PR-A2 (migrate to junction) |
| 10 | `startup-studio/kpi/compliance/[framework]` — already multi-body-aware via `[framework]` param | Startup Studio | multiple frameworks | Touched in PR-A7-A15 body dashboards (integrates as evidence source) |
| 11 | `rdif-scorecard.tsx` in Solutions Hub | Solutions components | RDIF framework | Catalog row in PR-A2 seed |

**Out-of-scope (different compliance concern, leave alone):**
- `/admin/notifications/compliance/*` (notification policy compliance)
- `lib/services/permissions-audit/compliance-report-service.ts` (RLS/role audit)
- `/api/startup-studio/governance/compliance/*` (internal governance)
- `/work-pulse/compliance` (work tracking)
- `/api/b2a/okr/compliance/*` (OKR compliance)
- `/api/hr/recruitment/scorecards/*` (recruitment scorecards)

These keep "compliance" in their names — they don't conflict with accreditation once PR-A1 disambiguates the Solutions Hub "ComplianceService" class.

## Body-Agnostic Mandate (Director locked 2026-04-17)

> "hope it not just works for NAAC but for all others like NIRF, NBA and others as well" — Director

Every PR in this program MUST satisfy:

1. **Evidence emission is body-parameterized.** No `INSERT INTO naac_evidence` — only `INSERT INTO quality_evidence_mappings WITH body_code='<body>'`
2. **Metrics catalog covers all 10 bodies.** PR-A2 seeds ~215 rows across NAAC (90) + NIRF (20) + NBA (10) + QS (6) + DCI (15) + PCI (15) + INC (15) + NCTE (15) + AICTE (20) + UGC (10)
3. **Retrofits add multi-body tagging, not migrate-from-NAAC-to-one-other.** A publication emits NAAC 9.1 + NIRF RPC + NBA PO + QS Citations simultaneously — fan-out pattern (docs/one-jkkn-one-data.md Rule 2)
4. **Dashboards parameterize body.** `/accreditation/<body>` is ONE page template rendered 10 times with different data, not 10 different pages
5. **Coverage dashboard reports all 10 bodies.** `/accreditation/coverage` shows per-body auto-fill % — not NAAC-only

## 15-PR Sequence (with dependencies)

```
Foundation (can run parallel):
  PR-A1 — Rename ComplianceService  [INDEPENDENT]
  PR-A2 — Substrate + 10-body seed  [INDEPENDENT, but blocks A3-A6]

Retrofits (depend on PR-A2):
  PR-A3 — Admission naac-report
  PR-A4 — Admin PDE naac-evidence
  PR-A5 — Campus Living anti-ragging
  PR-A6 — Complete grievance module behind B2A gateway

Body dashboards (depend on PR-A2, can run parallel once A2 merges):
  PR-A7  — /accreditation landing + /accreditation/coverage
  PR-A8  — /accreditation/naac  (full impl — reuses v2.1 IQAC dashboard design)
  PR-A9  — /accreditation/nirf  (depends on PublicationsService from PR-A2)
  PR-A10 — /accreditation/nba
  PR-A11 — /accreditation/qs     (placeholder — aspirational, Phase 2+ deep impl)
  PR-A12 — /accreditation/dci   (Dental only — RLS by institution)
  PR-A13 — /accreditation/pci   (Pharmacy only)
  PR-A14 — /accreditation/inc   (Nursing only)
  PR-A15 — /accreditation/ncte + /accreditation/aicte + /accreditation/ugc (combined — smallest surfaces)
```

**Critical path:** PR-A1 and PR-A2 are the only blockers. Once they merge, PR-A3 through PR-A15 are parallelizable (12 PRs).

## Per-PR Detail

### PR-A1 — Rename Solutions Hub ComplianceService (disambiguate)

**Goal:** Free the "ComplianceService" namespace for accreditation-compliance work without breaking Solutions Hub AI-solution-quota tracking.

**Scope:**
- Rename `lib/services/solutions/compliance-service.ts` → `lib/services/solutions/ai-solution-compliance-service.ts`
- Rename class `ComplianceService` → `AiSolutionComplianceService`
- Update imports in `hooks/solutions/use-compliance-dashboard.ts`, `app/(routes)/solutions/compliance/*`
- Rename route group `app/(routes)/solutions/compliance/*` → `app/(routes)/solutions/ai-solution-compliance/*` + 301 redirect
- Update sidebar link text "Compliance Dashboard" → "AI-Solution Compliance"
- Zero functional change

**Files touched:** ~10 (1 service + 4 components + 1 hook + 1 page + 1 sidebar + 2 types)

**Acceptance:**
- All existing AI-solution compliance flows work identically
- `/solutions/compliance/*` redirects to `/solutions/ai-solution-compliance/*`
- `grep -r "ComplianceService" lib/services/` returns zero matches (only new name)
- Frees up "accreditation compliance" / "compliance kernel" namespace for PR-A2+

**Body coverage:** N/A (this PR is prep; accreditation compliance starts PR-A2)

**Effort:** ~3 hours. Pure refactor.

### PR-A2 — Substrate + 10-body metrics seed

**Goal:** Create the polymorphic evidence junction and seed the 10-body metrics catalog that all subsequent PRs consume.

**Scope:**
- **New table** `quality_evidence_mappings` (polymorphic junction): `id, source_table text, source_id uuid, institution_id uuid, body_code text, metric_code text, period_label text, mapped_by uuid, mapped_at timestamptz, is_auto bool, metadata jsonb`. UNIQUE(source_table, source_id, body_code, metric_code). Indexed.
- **New table** `accreditation_committees` + `accreditation_committee_members` (body_code col — not just IQAC; one schema for NAAC-IQAC, NIRF-coord, NBA-coord, DCI-LIC, PCI-inspector, etc.)
- **New table** `accreditation_submissions` (audit log of every one-click compliance output per body per college per period)
- **New table** `accreditation_survey_consents` (DPDPA-compliant, body_codes text[] — multi-body consent)
- **New table** `notification_preferences` + `accreditation_digest_config`
- **ALTER** `institutions` + `profiles` + `grievance_tickets` + `grievance_categories` (per retained v2.1 decisions)
- **Seed** `sh_accreditation_metrics` with ~215 rows across 10 bodies (NAAC 90 + NIRF 20 + NBA 10 + QS 6 + DCI 15 + PCI 15 + INC 15 + NCTE 15 + AICTE 20 + UGC 10)
- **Retrofit** `ip_filings.naac_score_claim + naac_criteria + naac_metric_code` — migrate to junction rows (data migration) + DEPRECATE columns (keep nullable, TODO in PR-A9 to drop)
- **Retrofit** `sh_publications.naac_criterion` — migrate to junction + deprecate
- **Extend** `PublicationsService.getAccreditationMetrics(type?)` — drop the `'nirf' | 'naac'` union, accept any of 10 body codes
- **Add trigger** `auto_populate_quality_evidence()` — fans out evidence rows on INSERT into source tables based on category→metric mapping

**Files touched:** ~15 (6 table migrations + 1 seed script + 1 trigger + 3 service extensions + 4 data migrations)

**Acceptance:**
- `quality_evidence_mappings` table exists + RLS per body_code
- `sh_accreditation_metrics` has 215+ active rows across 10 metric_type values
- `PublicationsService.getAccreditationMetrics('DCI')` returns DCI metrics
- Existing `ip_filings` + `sh_publications` rows have corresponding junction entries
- Fan-out trigger fires on test INSERT into `sh_publications` → creates rows for NAAC 9.1 + NIRF RPC + NBA PO + QS Citations

**Body coverage:** ALL 10 (catalog seeded + substrate accepts any body_code)

**Effort:** ~20 hours. Includes data migration + seed authoring.

**Blocks:** PR-A3 through PR-A15.

### PR-A3 — Retrofit Admission naac-report-service

**Goal:** The admission NAAC report generator reads from `quality_evidence_mappings` + `sh_accreditation_metrics` instead of computing inline. Extends to emit NIRF TLR + NBA PO + QS data on the same report.

**Scope:**
- Refactor `lib/services/admission/naac-report-service.ts` → rename to `admission-accreditation-report-service.ts`
- Service method `getReportData(body_code: BodyCode, institutionId, periodLabel)` — reads junction rows
- Update `hooks/admission/use-naac-report.ts` → `use-accreditation-report.ts` with body param
- Update `app/(routes)/admission/group-dashboard/_components/naac-report-generator.tsx` → add body switcher dropdown (NAAC / NIRF / NBA / DCI / PCI / INC / NCTE / AICTE)
- Emit admission-source evidence rows on new admission events (trigger or service-layer fan-out)

**Files touched:** ~6

**Acceptance:**
- Admission group-dashboard generates NAAC report AS BEFORE (zero regression)
- PLUS NIRF / NBA / DCI / PCI / INC / NCTE / AICTE reports work from same UI
- New admission event (test: create admission_leads row) generates quality_evidence rows across applicable bodies

**Body coverage:** NAAC + NIRF + NBA + DCI + PCI + INC + NCTE + AICTE (admission data doesn't feed QS or UGC compliance narrowly; those bodies don't need admission rows)

**Effort:** ~12 hours.

**Depends on:** PR-A2 merged.

### PR-A4 — Retrofit Admin PDE NAAC-evidence page

**Goal:** PDE's NAAC evidence page becomes a general `/admin/pde/accreditation-evidence/[body]` page that renders any of the 10 bodies.

**Scope:**
- Rename `app/(routes)/admin/pde/naac-evidence/page.tsx` → `app/(routes)/admin/pde/accreditation-evidence/[body]/page.tsx`
- 301 redirect `/admin/pde/naac-evidence` → `/admin/pde/accreditation-evidence/naac`
- Page reads `quality_evidence_mappings` filtered by body + uses `sh_accreditation_metrics` for column headers
- CSV download works for any body
- Sidebar link updates

**Files touched:** ~5

**Acceptance:**
- Existing /admin/pde/naac-evidence URL redirects to new path + renders identical NAAC view
- New `/admin/pde/accreditation-evidence/nirf` renders NIRF evidence table
- Repeat for all 10 bodies

**Body coverage:** ALL 10

**Effort:** ~8 hours.

**Depends on:** PR-A2 merged.

### PR-A5 — Retrofit Campus Living anti-ragging-compliance

**Goal:** Anti-ragging compliance page emits evidence rows. UGC anti-ragging → NAAC 7.7 + NAAC 5.6 (Auto colleges) — body-agnostic fan-out.

**Scope:**
- Keep `app/(routes)/campus-living/reports/anti-ragging-compliance/page.tsx` at current URL (domain-appropriate)
- Service-layer: when `anti_ragging_affidavits` row inserted/verified, fan-out evidence rows: `body_code='UGC', metric_code='anti_ragging'` + `body_code='NAAC', metric_code='7.7.1'` + `body_code='NAAC', metric_code='5.6.1'` (Autonomous colleges only)
- `/accreditation/naac` dashboard reads these rows
- `/accreditation/ugc` dashboard reads these rows (PR-A15)

**Files touched:** ~3

**Acceptance:**
- Existing anti-ragging compliance page works identically
- Every affidavit verification generates 2-3 quality_evidence_mappings rows (UGC + NAAC subsets)
- Coverage dashboard shows UGC anti-ragging compliance % for each of 8 colleges

**Body coverage:** UGC + NAAC (context library Rule 2 — fan-out)

**Effort:** ~5 hours.

**Depends on:** PR-A2 merged.

### PR-A6 — Complete grievance module behind B2A gateway

**Goal:** The B2A grievance gateway currently authenticates but has no backing module. Build the grievance module with federation design from retired v2.1 spec (all 22 thrash decisions + 6 architectural decisions apply).

**Scope:**
- Apply v2.1 §3.2 ALTER to `grievance_tickets` (12 new cols: is_anonymous, anonymous_token, filed_by, is_emergency, is_icc_only, escalation_level, sla_breached_at, withdrawn_at, withdrawn_reason, acknowledgment_pdf_url, resolution_letter_pdf_url, + nullable raised_by_name)
- Build `/accreditation/naac/grievance/*` routes (list, new, detail, withdraw, escalate, resolve, satisfaction)
- SLA business-day calculator (reads `institution_leaves`)
- SLA breach pg_cron hourly check
- Supersede on withdrawal + auto-reopen on ≤2 satisfaction
- Evidence emission: ticket resolution → `body_code='NAAC', metric_code='7.7.1'` + `body_code='UGC', metric_code='grievance'`
- PDF auto-generation (acknowledgment + resolution letter)
- Federation: "Escalate to IQAC" button on `hostel_incidents` creates linked `grievance_tickets` row + populates existing `hostel_maintenance_requests.linked_grievance_id`

**Files touched:** ~25

**Acceptance:**
- All 22 thrash decisions from retired v2.1 applied
- B2A gateway routes (`/api/b2a/grievance/*`) return real data (not 0-row)
- Evidence rows generated per ticket
- Federation test: hostel_incident with severity=high → escalate → grievance_ticket created → evidence rows emitted

**Body coverage:** NAAC 7.7 + UGC (grievance is NAAC-specific per intent-vs-schema rule — other bodies don't track it the same way)

**Effort:** ~40 hours (this is the biggest PR — retains all of v2.1's grievance scope).

**Depends on:** PR-A2 merged.

### PR-A7 — `/accreditation` landing + `/accreditation/coverage` dashboard

**Goal:** The `/accreditation` URL root with 10 body scoreboard cards + weighted coverage dashboard (North-Star measurement UI per docs/one-jkkn-one-data §8, 10).

**Scope:**
- Page `app/(routes)/accreditation/page.tsx` — 10 body cards showing metric coverage %, upcoming submission, quick export
- Page `app/(routes)/accreditation/coverage/page.tsx` — weighted auto-fill % across NAAC + NIRF + NBA + AICTE (config from grand program §2 Success Metric). Per-college × per-format matrix. Trend line. Drill-down to blocking indicators.
- Route group `app/(routes)/accreditation/` set up
- `<BodyScoreboardCard />` component
- `<CoverageDashboard />` component with trend (reads from `quality_evidence_mappings` + `sh_accreditation_metrics`)
- Auto-committed weekly snapshot to `jkknkb/MyJKKN/Weekly Reports/YYYY-WW.md`
- `/iqac` → 301 redirect to `/accreditation/naac`

**Files touched:** ~8

**Acceptance:**
- `/accreditation` landing shows 10 body cards (9 placeholders + NAAC live initially, others go live as their PRs merge)
- `/accreditation/coverage` computes weighted % correctly per docs/one-jkkn-one-data §8 formula
- Baseline snapshot (~10% per grand program §2) published at merge time

**Body coverage:** ALL 10 (dashboard aggregates all)

**Effort:** ~16 hours.

**Depends on:** PR-A2 merged.

### PR-A8 — `/accreditation/naac` full dashboard

**Goal:** The IQAC dashboard (primary NAAC implementation). Reuses the v2.1 spec's IQAC design.

**Scope:**
- Page `app/(routes)/accreditation/naac/page.tsx` — 10 attribute cards, college switcher (8 colleges + cluster), DCF 2025 / AQAR export button
- `/accreditation/naac/committees/*` — IQAC committee CRUD (reuses `accreditation_committees` with `body_code='NAAC'`)
- `/accreditation/naac/dcf-export` — super-admin DCF 2025 XLSX export
- `/accreditation/naac/surveys/consent` — DPDPA consent stub (full impl Sprint 7 post-MDM)
- `/accreditation/naac/surveys/8.4-export` — learner + alumni CSV
- Principal home / HoD home dashboards (Principal = IQAC Chairman per context library — aggregates all bodies they wear; HoD = Department IQAC Coordinator)

**Files touched:** ~15

**Acceptance:**
- All 6 existing NAAC-tagged sources surface in NAAC dashboard:
  - IP filings (PR-A2 migration)
  - Publications (PR-A2 migration)
  - Admission NAAC data (PR-A3)
  - PDE NAAC evidence (PR-A4)
  - Anti-ragging affidavits (PR-A5)
  - Grievance tickets (PR-A6)
- DCF 2025 export produces valid placeholder XLSX
- Committee CRUD works end-to-end for 8 colleges

**Body coverage:** NAAC (this is the NAAC-specific dashboard)

**Effort:** ~25 hours.

**Depends on:** PR-A2, PR-A3, PR-A4, PR-A5, PR-A6, PR-A7 all merged (so all data sources exist).

### PR-A9 — `/accreditation/nirf` full dashboard

**Goal:** NIRF dashboard. Reuses PublicationsService.calculateNIRFMetrics() (already exists). Extends to read full NIRF ranking parameters.

**Scope:**
- Page `app/(routes)/accreditation/nirf/page.tsx`
- NIRF 5 params (TLR, RPC, GO, OI, PR) rendered as 5 attribute cards
- Annual submission export (CSV in NIRF DCF format)
- Reads NIRF evidence rows from `quality_evidence_mappings`

**Files touched:** ~6

**Acceptance:**
- All NIRF param cards compute from seeded metrics + evidence junction
- Export produces valid NIRF-format CSV
- Integrates with existing `GET /api/solutions/publications/accreditation?type=nirf` endpoint

**Body coverage:** NIRF

**Effort:** ~15 hours.

**Depends on:** PR-A2, PR-A7.

### PR-A10 — `/accreditation/nba` full dashboard

**Goal:** NBA SAR dashboard for Engineering programs.

**Scope:**
- Page `app/(routes)/accreditation/nba/page.tsx` + per-program sub-routes
- NBA 10 criteria × Tier 1/2 rendered as attribute cards
- PO/CO attainment calculations (reads from `sh_publications` NAAC criterion tagging + course mapping — future MDM Program Master will clean this up)
- SAR PDF export (placeholder structure)
- RLS: visible only to Engineering coordinators

**Files touched:** ~8

**Acceptance:**
- NBA dashboard renders per-program views (B.E. CSE, B.E. ECE, etc.)
- Dental/Pharmacy/Nursing/Education users cannot access (RLS)

**Body coverage:** NBA

**Effort:** ~18 hours.

**Depends on:** PR-A2, PR-A7.

### PR-A11 — `/accreditation/qs` aspirational placeholder

**Goal:** QS World Ranking dashboard placeholder — aspirational for JKKN's Phase 2 (post-Jan 2027 SaaS).

**Scope:**
- Page with 6 QS indicator cards (academic reputation, employer reputation, faculty/student ratio, citations per faculty, international faculty, international students)
- "Coming in Phase 2" banner
- Reads seeded QS metrics (6 rows)
- Deep implementation deferred

**Files touched:** ~3

**Acceptance:**
- Page renders 6 indicator cards
- No write operations

**Body coverage:** QS (placeholder)

**Effort:** ~3 hours.

**Depends on:** PR-A2, PR-A7.

### PR-A12 — `/accreditation/dci` Dental-only dashboard

**Goal:** DCI (Dental Council of India) annual inspection dashboard for Dental college only.

**Scope:**
- Page `app/(routes)/accreditation/dci/page.tsx`
- DCI ~15 metrics rendered as attribute cards
- Faculty roster, patient load, curriculum compliance
- Inspection-file export (PDF)
- RLS: `institution.institution_type='autonomous' AND institution.name LIKE 'JKKN Dental%'`

**Files touched:** ~6

**Acceptance:**
- Dental Principal sees dashboard; other colleges blocked
- Evidence rows from faculty + patient + curriculum sources surface

**Body coverage:** DCI

**Effort:** ~12 hours.

**Depends on:** PR-A2, PR-A7.

### PR-A13 — `/accreditation/pci` Pharmacy-only dashboard

**Goal:** PCI (Pharmacy Council of India) annual inspection dashboard.

**Scope:** Same shape as PR-A12 but for Pharmacy college + PCI metrics (15 seeded rows).

**Files touched:** ~6

**Body coverage:** PCI

**Effort:** ~12 hours.

**Depends on:** PR-A2, PR-A7.

### PR-A14 — `/accreditation/inc` Nursing-only dashboard

**Goal:** INC (Indian Nursing Council) annual inspection dashboard.

**Scope:** Same shape as PR-A12 but for Nursing college + INC metrics (15 seeded rows).

**Files touched:** ~6

**Body coverage:** INC

**Effort:** ~12 hours.

**Depends on:** PR-A2, PR-A7.

### PR-A15 — Combined NCTE + AICTE + UGC (smaller surfaces)

**Goal:** The last 3 bodies share a thinner implementation — combine into one PR.

**Scope:**
- `/accreditation/ncte` — Education-college-only, NCTE metrics (15 rows)
- `/accreditation/aicte` — Engineering + Pharmacy, EoA items (20 rows)
- `/accreditation/ugc` — All 8 colleges, UGC compliance archive (10 rows)

**Files touched:** ~12 (4 per body × 3 bodies)

**Acceptance:**
- NCTE dashboard for Education college
- AICTE EoA dashboard for Engineering + Pharmacy
- UGC compliance archive for all 8

**Body coverage:** NCTE + AICTE + UGC

**Effort:** ~20 hours total.

**Depends on:** PR-A2, PR-A7.

## Timeline Integration with One JKKN One Data 9-Month Grand Program

| Grand Program Sprint | Dates | Unification PRs landing |
|----------------------|-------|-------------------------|
| S1 (Apr 20–May 3) | Foundation | **PR-A1** (rename, 3h) + **PR-A2 start** (substrate) |
| S2 (May 4–May 17) | MDM audit | **PR-A2 merge** (substrate + seed) + **PR-A7** (landing + coverage) |
| S3 (May 18–May 31) | Learner Master design | **PR-A3, A4, A5** parallel (retrofits) |
| S4 (Jun 1–Jun 14) | Learner Master deploy | **PR-A6 start** (grievance module — biggest PR) |
| S5 (Jun 15–Jun 28) | MDM production + critical paths | **PR-A6 merge** (grievance ships) |
| S6-S8 | Path A, B, C rebuilds | **PR-A8** NAAC full dashboard |
| S9-S11 | Path C, D rebuilds | **PR-A9** NIRF + **PR-A10** NBA parallel |
| S12-S14 | Compliance Kernel deep impl | **PR-A11** QS + **PR-A12-A14** DCI/PCI/INC parallel |
| S15-S16 | Kernel + export hardening | **PR-A15** NCTE+AICTE+UGC |
| S17-S18 | Dress rehearsal + submission | All 15 PRs complete; Month-9 75% weighted coverage target |

**Total effort:** ~220 hours across 15 PRs over 8 months (with MDM dependencies paced by grand program).

## Risk Register

| # | Risk | Severity | Mitigation |
|---|------|---------|------------|
| R1 | PR-A1 rename breaks Solutions Hub imports that aren't in codebase yet (external consumers?) | Low | grep for ComplianceService class across whole tree first; also rename exported symbols, not just file |
| R2 | PR-A2 substrate migration corrupts existing NAAC tags on ip_filings / sh_publications | High | Dual-write for 2 weeks (writes both old column + new junction); validate junction = old column; then drop old |
| R3 | PR-A6 grievance 40h scope too big, slips into Sprint 6 | Medium | Decompose PR-A6 into A6a (schema + CRUD) + A6b (SLA engine) + A6c (federation triggers) if needed |
| R4 | Bodies PR-A8 through A15 block each other on shared component changes | Medium | `<BodyScoreboardCard />` + `<CoverageDashboard />` land in PR-A7; bodies only consume them |
| R5 | DCI/PCI/INC RLS needs `institution_type + name LIKE` pattern — brittle if institutions rename | Medium | Add `accreditation_body_scope` column to institutions; seed mapping |
| R6 | Fan-out trigger performance under high-volume INSERT (admission_leads at 4,500+ rows) | Medium | Batch trigger (STATEMENT-level not ROW-level); async queue fallback |
| R7 | Multi-body rubric drift — NAAC 9.1 and NIRF RPC look similar but scoring differs | High | `calculation_method` col on metrics (computed at read-time per body) — already in sh_accreditation_metrics schema |
| R8 | v2.1 retired spec's 22 thrash decisions get lost in PR-A6 execution | Medium | Link retired v2.1 spec from PR-A6 description; reference decision R1.1-R5.4 explicitly in code comments |

## Success Criteria

**Per docs/one-jkkn-one-data §2 weighted coverage target:**

| Milestone | Coverage across NAAC+NIRF+NBA+AICTE |
|-----------|-------------------------------------|
| Baseline (today, post PR-A7) | ~10% |
| PR-A8 merged (NAAC live) | ~25% |
| PR-A9 + A10 merged (NIRF + NBA live) | ~45% |
| PR-A15 merged (all 10 bodies live) | ~60% |
| Month-9 target (post Compliance Kernel Sprint 13-15 heavy mapping) | 75% |

**Per-body independent unit test:** each dashboard must render for the correct audience (Dental Principal sees DCI, Engineering HoD sees NBA, Cluster admin sees all 10).

## Retired Artifacts

| Spec | Replaced by |
|------|-------------|
| `specs/workshop-transformation-resurrection/PHASE-1A-SPEC.md` v2.1 | This program (retained 22 thrash decisions applied to PR-A6) |
| `specs/workshop-transformation-resurrection/MASTER-PLAN.md` v0.4 | Remaining 7 phases (2-8) continue as NAAC-track sub-plan; Phase 1 folds into this unification program |

## Version History

| Version | Date | Author | Delta |
|---------|------|--------|-------|
| **1.0** | **2026-04-17** | **Director (Omm) + Claude** | **Initial Unification Program spec. 15 PRs, ~220h, integrates with 9-month grand program. Body-agnostic mandate (all 10 bodies from day one, per Director). Retires v2.1 Phase 1a spec. Retains 22 thrash decisions + 6 architectural decisions — applied to PR-A6 grievance + PR-A2 substrate.** |
