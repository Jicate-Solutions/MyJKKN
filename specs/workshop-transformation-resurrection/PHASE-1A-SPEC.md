---
title: Phase 1a — IQAC Foundation + Federated Grievance + DCF 2025 + NAAC 8.4 Survey
version: 1.0
status: DECISIONS LOCKED — Ready for /myjkkn-api build
author: Director + Claude (assumption-thrash agent)
date: 2026-04-16
parent_plan: MASTER-PLAN.md v0.4 (pending v0.5 update per Finding 1)
thrash_rounds: 5
decisions_locked: 22
blocks_until: Director signoff on 5 gates (listed §7)
---

# Phase 1a — IQAC Foundation + Federated Grievance + DCF 2025 + NAAC 8.4 Survey

## 0. Executive Summary

This phase lays the architectural foundation for NAAC accreditation across **8 JKKN colleges** (5 Autonomous + 3 Affiliated — corrected from Master Plan v0.4's 2+4 assumption). It delivers:

1. **IQAC umbrella shell** — `/iqac` route, college switcher, committee management
2. **Federated Grievance** — Option C architecture: formal UGC intake + bridges to existing hostel/LC/health domain tables
3. **NAAC metrics catalog** — seed existing `sh_accreditation_metrics` with Binary + MBGL 10-Attribute framework
4. **Polymorphic evidence bridge** — `naac_evidence_mappings` junction (future-proof for OKR, Sustainability, Solutions Hub)
5. **DCF 2025 export scaffold** — super-admin export for NAAC submission
6. **NAAC 8.4 Survey Export** — learner + alumni CSV with DPDPA 2023 consent
7. **6 compliance artifacts** — acknowledgment PDF, resolution letter PDF, weekly digest email, SMS notifications, audit trail, escalation workflow

## 1. Preflight Findings (MANDATORY context)

Five functional parallels discovered on staging DB that change the design:

| # | Finding | Resolution |
|---|---------|-----------|
| F1 | Master Plan says 2 Auto + 4 Aff = 6 colleges. **Live DB: 5 Auto + 3 Aff = 8 colleges.** institution_type enum is `autonomous\|aided\|self` (not `autonomous\|affiliated`) | Update Master Plan to v0.5 (see §8). Treat `autonomous` = NAAC Autonomous; `aided + self` = NAAC Affiliated. |
| F2 | `sh_accreditation_metrics` (15 cols) is dormant NAAC metrics catalog already built in Solutions Hub | **SEED** this table with the 10-Attribute Binary + MBGL framework. Do NOT build parallel `iqac_naac_metrics`. |
| F3 | `hostel_maintenance_requests.linked_grievance_id` already exists | Populate via escalate-to-IQAC trigger. Zero schema change needed on this table. |
| F4 | `ip_filings.naac_score_claim + naac_criteria + naac_metric_code` AND `sh_publications.naac_criterion` — NAAC tagging pattern already established on 2 tables | Extend same pattern to grievance/incidents via the polymorphic junction `naac_evidence_mappings` — no ALTER on existing tables. |
| F5 | `health_consents` (6 cols) is too minimal for NAAC survey consent | Build new `naac_survey_consents` — different legal basis (legitimate interest for accreditation vs explicit consent for health under DPDPA §7). |

## 2. Scope (12 Deliverables)

### 2a. Architectural Decisions (from Round 0 overlap resolution)

| # | Decision | Rationale |
|---|----------|-----------|
| AD1 | Update Master Plan to v0.5 (8 colleges, correct 5+3 split) | Mis-scoring a college is irrecoverable post-SSR submission |
| AD2 | Seed `sh_accreditation_metrics`, reuse for DCF catalog | Reuses infrastructure, zero migration risk |
| AD3 | Build `naac_evidence_mappings` polymorphic junction (NOT per-table `naac_metric_code` columns) | Avoids ALTER on 4+ existing tables; future-proofs for OKR/Sustainability/Solutions Hub |
| AD4 | New `naac_survey_consents` (NOT extending `health_consents`) | Distinct DPDPA legal basis; avoids consent-scope confusion in audit |

### 2b. Silent Assumption Decisions (from 5 thrash rounds, 22 total)

#### Round 1 — Structural

| # | Category | Decision | Schema/Code Impact |
|---|----------|----------|---------------------|
| R1.1 | Temporal (SLA clock) | **Business days only** — skip weekends + `institution_leaves` | New Postgres function `calculate_business_day_deadline(start_ts, days, institution_id)` reads institution_leaves |
| R1.2 | Committee structure | **Junction table** `iqac_committee_members` with role + term | New table: committee_id, user_id, role (chair/coordinator/member/observer), joined_at, term_end, is_active |
| R1.3 | SLA lineage | **Hybrid**: snapshot at ticket creation + admin "recompute open tickets" endpoint | `grievance_tickets.sla_hours` stays as-is; new `POST /api/iqac/grievance/categories/:id/recompute-slas` endpoint |
| R1.4 | Anonymous (UGC 2023 §5(b)) | **Schema migration**: nullable raised_by_name + is_anonymous + anonymous_token | ALTER grievance_tickets: raised_by_name → NULL; ADD is_anonymous bool, anonymous_token text UNIQUE |

#### Round 2 — Edge Cases

| # | Category | Decision | Schema/Code Impact |
|---|----------|----------|---------------------|
| R2.1 | SLA breach | **Stay open + red flag + auto-escalate to IQAC chair** | ADD sla_breached_at, escalation_level cols; pg_cron hourly job scans open tickets |
| R2.2 | Withdrawal | **Supersede** — status='withdrawn', row preserved | ADD withdrawn_at, withdrawn_reason cols; trigger locks withdrawn rows from edit |
| R2.3 | Emergency fast-track | **Auto-flag SH/ragging + halved SLA + SMS to chair+Director within 1h** | ADD is_emergency bool; category.default_sla_hours × 0.5 for emergency cats; Exotel SMS integration |
| R2.4 | Proxy filing | **Limited**: IQAC coord + warden + parent | ADD filed_by uuid (separate from raised_by_id); RLS validates filed_by's role |

#### Round 3 — Operational

| # | Category | Decision | Schema/Code Impact |
|---|----------|----------|---------------------|
| R3.1 | Cross-module escalation | **Link, don't copy** — hostel_incidents stays source-of-truth | metadata.source_table + metadata.source_id on grievance_tickets; trigger on hostel_incidents escalate action |
| R3.2 | Attachments | **Mandatory for SH+ragging; 25MB/file × 5 files max** | Supabase Storage bucket `grievance-evidence` (private ACL); category has attachment_required bool |
| R3.3 | Notifications | **Configurable per-user** `notification_preferences` table | New table: user_id, module, event_type, channels jsonb |
| R3.4 | Satisfaction | **Prompted not mandatory; ≤2 auto-reopens** | Trigger on satisfaction_rating UPDATE creates new row with status='reopened_on_dissatisfaction' |

#### Round 4 — Compliance & Visibility

| # | Category | Decision | Schema/Code Impact |
|---|----------|----------|---------------------|
| R4.1 | Privacy matrix | **Role-scoped + per-ticket `is_icc_only` override for sensitive cases** | ADD is_icc_only bool; RLS policies scoped to role (complainant/coord/chair/director/accused) |
| R4.2 | Artifacts | **DCF 2025 export + Weekly digest + Acknowledgment PDF + Resolution letter PDF** (all 4) | Supabase Storage bucket `grievance-artifacts`; PDF generation via server-side template; cron for digest |
| R4.3 | College switcher | **Hybrid: URL param > localStorage > profile default** | ADD profiles.iqac_default_college_id uuid; CollegeSwitcher component with precedence logic |
| R4.4 | DPDPA consent scope | **PII + Academic + Alumni + Parent** (all 4 — scope creep into Phase 6 pre-consent) | naac_survey_consents.scope jsonb with 4 category keys; Phase 1a UI must capture all 4 |

#### Round 5 — Loose Ends

| # | Category | Decision | Schema/Code Impact |
|---|----------|----------|---------------------|
| R5.1 | PDFs confirmed | **Acknowledgment + Resolution** both auto-generated, stored in Storage | ADD acknowledgment_pdf_url, resolution_letter_pdf_url cols on grievance_tickets |
| R5.2 | Category seed | **Hierarchical**: 5 UGC parent + ~10 JKKN-standard sub + college-specific leaf | Seed 5+10 rows with parent_id chain; per-college customization via parent_id |
| R5.3 | Ticket ID format | **`JKKN-{COLLEGE_CODE}-GR-{YYYY}-{00001}`** | ADD institutions.iqac_code char(4); Postgres function `generate_grievance_ticket_number()` |
| R5.4 | NAAC tagging | **Auto by category + manual override** | grievance_categories.default_naac_metric_code; trigger auto-inserts into naac_evidence_mappings on ticket create |

## 3. Schema Implications — Consolidated

### 3.1 NEW Tables (6)

```sql
-- 1. IQAC committees (per institution)
CREATE TABLE iqac_committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  committee_name text NOT NULL,
  committee_type text NOT NULL,  -- 'main' | 'icc' | 'anti_ragging' | 'grievance'
  chair_user_id uuid REFERENCES profiles(id),
  formed_at date NOT NULL,
  term_end date,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. IQAC committee members (junction)
CREATE TABLE iqac_committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES iqac_committees(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  role text NOT NULL,  -- 'chair' | 'coordinator' | 'member' | 'observer'
  joined_at date NOT NULL,
  term_end date,
  is_active boolean DEFAULT true,
  is_external boolean DEFAULT false,  -- for industry/alumni external members
  external_name text,
  external_org text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (committee_id, user_id, joined_at)
);

-- 3. NAAC evidence mappings (polymorphic junction — AD3)
CREATE TABLE naac_evidence_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,  -- 'grievance_tickets' | 'hostel_incidents' | 'sh_publications' | ...
  source_id uuid NOT NULL,
  metric_code text NOT NULL REFERENCES sh_accreditation_metrics(metric_code),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  mapped_by uuid REFERENCES profiles(id),
  mapped_at timestamptz DEFAULT now(),
  is_auto boolean DEFAULT false,  -- true if inserted by trigger
  metadata jsonb DEFAULT '{}',
  UNIQUE (source_table, source_id, metric_code)
);
CREATE INDEX idx_naac_evidence_source ON naac_evidence_mappings(source_table, source_id);
CREATE INDEX idx_naac_evidence_metric ON naac_evidence_mappings(metric_code, institution_id);

-- 4. NAAC survey consents (DPDPA 2023 — AD4)
CREATE TABLE naac_survey_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  learner_id uuid REFERENCES learners_profiles(id),
  alumni_email text,  -- alumni may not have profile
  consent_version text NOT NULL DEFAULT '1.0',
  purpose text NOT NULL DEFAULT 'NAAC 2027 accreditation submission (Metric 8.4, 8.1-8.3, 8.2a)',
  legal_basis text NOT NULL DEFAULT 'DPDPA 2023 §4(1)(a) — specific purpose consent',
  scope jsonb NOT NULL,  -- {"pii": true, "academic": true, "alumni_outcomes": true, "parent_contact": true}
  consented_at timestamptz DEFAULT now(),
  withdrawn_at timestamptz,
  ip_address inet,
  user_agent text,
  export_event_ids uuid[] DEFAULT '{}',  -- tracks which exports used this consent
  CHECK (user_id IS NOT NULL OR learner_id IS NOT NULL OR alumni_email IS NOT NULL)
);

-- 5. Notification preferences (per user, per event)
CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  module text NOT NULL,  -- 'iqac' | 'grievance' | 'committee' | ...
  event_type text NOT NULL,  -- 'ticket_submit' | 'sla_breach' | 'escalate' | ...
  channels jsonb NOT NULL DEFAULT '{"in_app": true, "email": true, "sms": false, "whatsapp": false}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, module, event_type)
);

-- 6. IQAC weekly digest config
CREATE TABLE iqac_weekly_digest_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  is_enabled boolean DEFAULT true,
  email text NOT NULL,
  last_sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, institution_id)
);
```

### 3.2 ALTER Existing (4 tables)

```sql
-- institutions: add IQAC short code for ticket IDs
ALTER TABLE institutions ADD COLUMN iqac_code char(4);
-- Manual seed after: DENT, PHAR, ALHD, NURS, ENGG, ASAI, ASSF, EDUC

-- profiles: college switcher default
ALTER TABLE profiles ADD COLUMN iqac_default_college_id uuid REFERENCES institutions(id);

-- grievance_categories: NAAC tagging
ALTER TABLE grievance_categories
  ADD COLUMN default_naac_metric_code text REFERENCES sh_accreditation_metrics(metric_code),
  ADD COLUMN attachment_required boolean DEFAULT false,
  ADD COLUMN is_emergency boolean DEFAULT false;

-- grievance_tickets: 12 new cols + 1 nullable
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

### 3.3 Seeds (3 batches)

- **5 UGC parent grievance categories** + ~10 JKKN-standard sub-categories (hierarchical)
- **~90 NAAC metrics** in `sh_accreditation_metrics` (10 Attributes × ~9 metrics avg, Binary + MBGL framework)
- **8 IQAC committees** (1 per college) with placeholder chairs pending Director gate #1

### 3.4 Functions / Triggers (7 new)

1. `calculate_business_day_deadline(start_ts, days int, institution_id uuid) → timestamptz`
2. `generate_grievance_ticket_number(institution_id uuid, year int) → text`  (returns `JKKN-{CODE}-GR-{YYYY}-{NNNNN}`)
3. `auto_populate_naac_evidence()` — trigger on grievance_tickets INSERT
4. `enforce_grievance_proxy_rls()` — validates filed_by has proxy role
5. `enforce_grievance_withdrawn_lock()` — trigger prevents UPDATE on withdrawn rows
6. `grievance_auto_reopen_on_low_satisfaction()` — trigger on satisfaction_rating UPDATE
7. `check_sla_breach()` — pg_cron hourly, scans open tickets → flip sla_status + increment escalation_level + fire notifications

### 3.5 Storage Buckets (2 new)

- `grievance-evidence` — private ACL, 25MB/file, max 5 files/ticket, RLS-gated by ticket visibility
- `grievance-artifacts` — private ACL, system-generated PDFs

### 3.6 RLS Policies

Standard pattern on all new tables:
```sql
is_super_admin() OR is_admin() OR (user_has_permission('iqac.{scope}.{action}') AND role_has_institution_access(institution_id))
```

**Per-role grievance visibility:**
- complainant (matches `raised_by_id` OR anonymous_token) → full view
- `filed_by` (proxy filer) → full view (provenance)
- assigned coordinator → full view
- IQAC chair → full view except when `is_icc_only=true` and not ICC member
- Director/super_admin → full view
- accused (matched via metadata.accused_user_ids[]) → subject + category + own statement only
- general staff → blocked

## 4. Route Structure (7 pages + 11 API endpoints)

### Pages

```
/iqac                          → dashboard with college switcher + cluster rollup
/iqac/committees               → list + CRUD
/iqac/committees/[id]          → detail with member management
/iqac/grievance                → list + stats + "File grievance" CTA
/iqac/grievance/new            → file form (supports proxy + anonymous)
/iqac/grievance/[id]           → detail with privacy-scoped view
/iqac/surveys/consent          → DPDPA consent flow (4 scope checkboxes)
/iqac/dcf-export               → super-admin-only export page
```

### API Endpoints (all `withAuth`)

```
GET    /api/iqac/committees
POST   /api/iqac/committees
GET    /api/iqac/committees/:id
PATCH  /api/iqac/committees/:id
POST   /api/iqac/committees/:id/members
DELETE /api/iqac/committees/:id/members/:memberId

GET    /api/iqac/grievance/categories
POST   /api/iqac/grievance/categories/:id/recompute-slas  (admin override for R1.3 hybrid)

GET    /api/iqac/grievance/tickets
POST   /api/iqac/grievance/tickets
GET    /api/iqac/grievance/tickets/:id
PATCH  /api/iqac/grievance/tickets/:id
POST   /api/iqac/grievance/tickets/:id/withdraw
POST   /api/iqac/grievance/tickets/:id/escalate
POST   /api/iqac/grievance/tickets/:id/resolve
POST   /api/iqac/grievance/tickets/:id/satisfaction
POST   /api/iqac/grievance/tickets/:id/escalate-to-iqac  (for hostel_incidents federation)

POST   /api/iqac/surveys/consent
GET    /api/iqac/surveys/8.4/export  (CSV — learner + alumni)

POST   /api/iqac/dcf-export  (super-admin only — returns placeholder XLSX for one metric)

POST   /api/iqac/notifications/preferences
```

## 5. Components (6 shared)

1. `<CollegeSwitcher />` — URL > localStorage > profile fallback, 8 colleges + Cluster option
2. `<GrievanceForm />` — supports proxy filing, anonymous mode, category-dependent attachment rules, emergency auto-flag
3. `<SLACountdown />` — business-day aware, reads `institution_leaves`, pauses on weekends/holidays
4. `<PrivacyScopedTicketView />` — role-aware display; respects is_icc_only
5. `<DPDPAConsentForm />` — 4 scope checkboxes, captures ip + user_agent, exports consent version
6. `<NAACMetricBadge />` — shows mapped metric_code + category + point weight; reused from future modules

## 6. Acceptance Criteria (per-college verification)

Phase 1a ships when ALL true for each of the 8 colleges:

- [ ] `/iqac` route renders with college switcher pre-selected from profile default
- [ ] College switcher URL param (`?college=<id>`) overrides profile default + persists to localStorage
- [ ] IQAC committee CRUD works end-to-end (create, add/remove members with roles)
- [ ] File grievance flow works for: logged-in complainant, proxy (warden), anonymous (with token)
- [ ] SLA countdown is business-day aware (manual test: file Friday evening, verify deadline ≠ Monday)
- [ ] Emergency category auto-sets `is_emergency=true` + halves SLA + triggers SMS
- [ ] SLA breach cron flips ticket `sla_status='breached'` + increments escalation_level + notifies chair
- [ ] Withdrawal preserves row, locks edits, creates history entry
- [ ] Satisfaction rating ≤2 auto-reopens ticket with `status='reopened_on_dissatisfaction'`
- [ ] Accused user (matched in metadata.accused_user_ids) sees minimal header; complainant identity hidden when is_icc_only
- [ ] Acknowledgment PDF generated + stored + link on ticket detail
- [ ] Resolution letter PDF generated on close
- [ ] Weekly digest email fires Monday 8am IST to opted-in IQAC chairs (pg_cron)
- [ ] NAAC 8.4 Survey CSV export works with DPDPA consent enforcement (only consented rows included)
- [ ] DCF 2025 export button (super admin only) produces placeholder XLSX — proof of pipeline
- [ ] `naac_evidence_mappings` auto-populated on grievance_tickets INSERT from category.default_naac_metric_code
- [ ] Hostel_incident "Escalate to IQAC" action creates grievance_ticket with metadata link + populates existing `hostel_maintenance_requests.linked_grievance_id`

## 7. Director Gates (BLOCK PR merge, not work start)

| Gate | What's blocked without it | Owner |
|------|---------------------------|-------|
| G1 | IQAC chair named + committee composition approved per college (×8) | Director |
| G2 | 5 UGC grievance parent categories + ~10 JKKN sub-categories approved | Director + Chief IQAC Coordinator |
| G3 | 4 NPS survey templates approved (student, faculty, staff, parent) — draft by CO | Director + Chief IQAC Coordinator |
| G4 | DPDPA 2023 consent text legally reviewed (3 scopes: learner PII, alumni, parent) | Legal + Director |
| G5 | Phase 6 Parent Portal owner named (for DPDPA parent scope pre-consent) | Director |

**Work can start** — hold PR in draft until these clear.

## 8. Master Plan v0.5 Delta (required update)

Replace all references to "6 colleges (2 Auto + 4 Aff)" with:

- 8 JKKN colleges: **5 Autonomous** (Dental, Pharmacy, Allied Health Sciences, Nursing, Engineering) + **3 Affiliated** (A&S Aided, A&S Self, Education)
- Per-college scoring × 8 = **7,200 pts total** (not 5,400)
- Cluster Metric 8.4 = 60 × 8 = **480 pts** (not 360)
- College switcher renders **8 + Cluster rollup** (9 tabs)
- Institution_type mapping: `autonomous` → NAAC Auto; `aided + self` → NAAC Aff

## 9. Risk Register Additions

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R19 | `naac_evidence_mappings` polymorphic FK can orphan when source row deleted | Medium | Add DELETE trigger on source tables → CASCADE clean the junction |
| R20 | `notification_preferences` missing row = no notification delivery (silent failure) | High | Default row inserted on user creation trigger; fallback to sensible defaults if missing |
| R21 | DPDPA consent scope drift (we add a new scope later, old consents invalid) | High | `consent_version` bump triggers re-consent flow; `export_event_ids[]` tracks which exports used which consent version |
| R22 | Anonymous_token collision or enumeration | Medium | Use nanoid (18-24 char URL-safe); UNIQUE constraint; no sequential generation |
| R23 | pg_cron SLA breach job misses tickets near midnight (cron interval) | Low | Run every 15 minutes (4×/hr); mark checked tickets to prevent double-notify |

## 10. Handoff to /myjkkn-api

**Spec status:** COMPLETE. Zero silent assumptions remaining.

**What's locked:**
- 4 architectural decisions (AD1-AD4)
- 22 silent-assumption decisions (R1.1 through R5.4)
- 6 new tables + 4 ALTER migrations + 7 functions + 2 Storage buckets + 7 pages + 18 API endpoints + 6 components
- 8-college structure (corrected from Master Plan v0.4)
- Complete RLS pattern per table
- 23-entry risk register (18 from Master Plan + 5 new)

**What's NOT in Phase 1a (deferred):**
- Sexual harassment ICC member-only committee with separate RLS (Phase 1b — more complex visibility)
- Full NAAC 8.4 survey platform (question design, branching, analytics) — Phase 1 scope is CSV export only
- OKR resurrection (Phase 3)
- Phase 6 Parent Portal (pre-consent captured in Phase 1a)

**Next command:**
```
/myjkkn-api from spec PHASE-1A-SPEC.md — build IQAC foundation + federated grievance + NAAC 8.4 export
```

## Version History

| Version | Date | Author | Delta |
|---------|------|--------|-------|
| 1.0 | 2026-04-16 | Director + Claude | Initial spec from assumption-thrash — 22 locked decisions across 5 rounds; preflight findings surface 5 functional parallels + institution-structure correction (6→8 colleges). |
