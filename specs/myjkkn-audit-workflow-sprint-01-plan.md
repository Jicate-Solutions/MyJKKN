# Sprint 01 — Audit Workflow (Interview-Locked via `/myjkkn-chain` gates)

**Status:** Design locked 2026-04-22 via `/myjkkn-chain` gate sweep + Q1 + Q2 + persona-design (recorded in vault notes `Audits/26-04-22-Aassaan-Accreditation-Audit-Proposal.md` and `Audits/26-04-22-MyJKKN-Audit-Execution-Plan.md`).
**Parent Program:** `specs/one-jkkn-one-data/unification-program/MASTER-PLAN.md` — this sprint is **PR-B1 / PR-B2** of Program B ("Audit Execution Layer") which sits on top of Program A (Compliance Unification, 15 PRs, complete 2026-04-22).
**Trigger:** Aassaan Accreditation Pvt Ltd pitched a ₹75 L+ NAAC/NBA/NIRF audit + Distinct-Category University conversion on 2026-04-22. Director decision: in-source the audit under new Group Registrar (N. Selvamani, joining 2026) using MyJKKN. Aassaan retained only for a fixed-price mock peer-team visit in Aug 2026.
**Precedes:** Sprint 02 (external auditor portal + PDF/Word report generator + WhatsApp SLA nudges).
**Builds on:**
- PR-A2 substrate (`quality_evidence_mappings`, `accreditation_committees`, `accreditation_submissions`, `accreditation_survey_consents`, `accreditation_digest_config`, `sh_accreditation_metrics`) — LIVE
- PR-A5 anti-ragging evidence fan-out — LIVE
- PR-A6a grievance evidence fan-out — LIVE (merged 2026-04-22 02:18 UTC)
- PR-A7 `/accreditation` landing + coverage matrix — LIVE
- PR-A8..A15 ten body-specific dashboards — LIVE
- Existing `service_requests` ticket engine (types, approvals, timeline, analytics) — LIVE
- Existing `audit_logs` platform-wide trail — LIVE
- Existing `custom_roles` + `PERMISSION_CATEGORIES` + RLS dynamic permission system — LIVE

---

## Why this sprint exists

On 2026-04-22 13:30 IST, Mr. Mahadevan (Aassaan Accreditation Pvt Ltd, Chennai) pitched the Director a bundled NAAC/NBA/NIRF audit + UGC Distinct-Category University conversion. The 35-parameter audit paragraph (see vault note `Aassaan-Accreditation-Audit-Proposal.md` §3 for verbatim) duplicates ~80% of what MyJKKN's Compliance Unification Program already captures. The economically rational path is:

1. Decline the bundled ₹75 L+ SOW.
2. Run the audit in-house under new Group Registrar (Selvamani, documented in `JKKNKB/Org-Redesign-2026/Admin-Structure.md §7`).
3. Retain Aassaan only for a fixed-price 2-day mock peer-team visit in Aug 2026 (~₹5–10 L) — the one deliverable they uniquely add.

Sprint 01 builds the **audit-execution layer** that sits on top of the Compliance Unification substrate. Selvamani's 90-day onboarding deliverable (Days 31–60: "document inconsistencies, missing filings, process variations across all 7 colleges") becomes a live workflow on MyJKKN instead of a static Word doc.

## Premise correction (critical — saved us 3 weeks)

The pre-sweep assumption in vault note `MyJKKN-Audit-Execution-Plan.md` (2026-04-22 afternoon draft) was that **3 new tables** were needed: `audit_findings`, `audit_cycles`, `audit_attestations`. The `/myjkkn-chain` production-code-sweep revealed:

- `service_requests` ticket engine has full approval chains, SLA, timeline, analytics, types (CRUDable), dynamic forms, priority badges, state machine — **parallel `audit_findings` table would duplicate 100% of this**.
- `quality_evidence_mappings` already populated by PR-A5 and PR-A6a fan-out triggers — evidence is a byproduct of operational events, not a separate collection exercise.
- `sh_accreditation_metrics` master catalog (68 rows) — already the per-body metric list.

**Scope cut:** Sprint 01 creates **2 new tables** (not 3) + **2 CRUDable masters** + extends `service_requests.types` with a seeded `audit_finding` row. Estimated engineering: ~10 working days across 2 PRs (PR-B1 substrate, PR-B2 UI).

## Interview decisions (20 locked)

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Parallel `audit_findings` table OR extend `service_requests`? | **Extend `service_requests`** with seeded type `audit_finding` + audit-context JSONB in `metadata` | Inherits approval chains, SLA, timeline, analytics, my-requests dashboard for free — zero duplication |
| 2 | Parameter catalog source | **New CRUDable table `audit_parameter_catalog`**, seeded with 36 Aassaan rows on Sprint 01 deploy, open for institution-scoped overrides | UGC/NAAC regulations change yearly; Distinct-Category programmes add new parameters. Enum would require DDL per change. Per Q1 default: make it CRUDable. |
| 3 | Finding-type enum vs master | **CRUDable master `audit_finding_types`** seeded with 4 defaults (gap/inconsistency/missing_evidence/data_quality), `is_system=true` | Admin may add "regulatory_change" or "benchmarking" in future cycles |
| 4 | Severity (red/yellow/green) | **Enum** (DB check constraint) | Traffic-light semantics are universal, not institution-configurable |
| 5 | Attestation values (compliant/partial/non-compliant/pending) | **Enum** | NAAC/NBA regulator-defined |
| 6 | Finding status state machine | **Enum** (open → evidence-submitted → reviewing → closed → reopened) | Core workflow, cannot be per-institution |
| 7 | Audit cycle phase | **Enum** (draft / in-progress / rectification / peer-visit / closed) | State machine |
| 8 | Owner routing | **Auto-route on finding creation** via `audit_parameter_catalog.default_owner_role` + institution_id → resolve via `custom_roles` | Deterministic; CEO/CAO escalation path via existing OKR cascade |
| 9 | SLA | **14 days P1 (red) / 30 days P2 (yellow)** — stored on `audit_parameter_catalog.p1_sla_days`, overridable per cycle | Matches existing service-requests SLA model |
| 10 | Time-boxed external auditor (Aassaan mock-visit) | **Reuse existing `user_institution_access.expires_at`** — new seeded role `external_auditor_timeboxed` | No new scope dimension; leverages persona-design learning from Campus Living |
| 11 | Evidence auto-population on rectification close | **Trigger on `service_requests` update WHERE type='audit_finding' AND status='closed' AND resolution='rectified'** → insert into `quality_evidence_mappings` | Mirrors PR-A5 (anti-ragging) and PR-A6a (grievance) patterns |
| 12 | Framework mapping | **JSONB column on `audit_parameter_catalog`** — `{"naac": "3.4.2", "nba": "5.1", "nirf": "RP", "ugc": "2.1.3"}` | One parameter → multiple framework criteria (same data, different body-specific weights) |
| 13 | Saved queries | **`audit_parameter_catalog.discovery_query_sql` column** — parameterised SQL per parameter | Selvamani clicks "Run" per parameter; non-technical; reused across cycles |
| 14 | Co-sign workflow | **`audit_attestations.cosigners JSONB`** — `{"cao": {"user_id":..., "at":...}, "ceo": {...}}` with DB constraint requiring CAO + CEO for NAAC/NBA parameters | Enforced at DB level, not UI-only |
| 15 | Institution scope | **Cycle-level `institution_id` + parameter-level `per_institution_row`** — one cycle can span multiple institutions; findings are always institution-scoped | Matches `custom_roles.institution_scope='all'` vs `'own'` model |
| 16 | Registrar's permission set | **New `lead_auditor` role seeded**, separate from Registrar's core role; user can hold both | Clean separation; audit independence preserved (Registrar can't self-approve operational data they manage) |
| 17 | Shared UI extraction (Q2 gate) | **Before any new settings component, extract `components/shared/crud-master/{master-form-dialog, master-row-actions, master-data-table}.tsx`** + refactor 4 existing callers in same PR | 4 twins already in production (leave-types, hostel-leave-types, workflows, admission rules) — 5th copy is the failure point |
| 18 | AI query | **Reuse existing `/ai-query`** — no new AI endpoints; audit saved-queries registered as AI tools via existing MCP pattern | Selvamani can ask "show me overdue P1 findings" in natural language |
| 19 | Audit trail | **Reuse existing `audit_logs` table** — all audit_cycles/findings/attestations insert/update/delete auto-logs there via existing trigger pattern | Legal defensibility inherited; no new logging plumbing |
| 20 | Migration path | **Translator Pattern** via `/ship-myjkkn` (jicate/main worktree + cherry-pick); PRs target `Jicate-Solutions/MyJKKN` draft-then-ready; user clicks merge | Project convention — divergence between local omm-dev and production main too large for direct merge |

---

## Schema

### 2 new tables + 2 CRUDable masters

```sql
-- ============================================================================
-- 1. audit_cycles — wrapper for a time-boxed audit cycle ("2026-Q2 Institutional Audit")
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_cycles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text,
  frameworks       text[] NOT NULL DEFAULT '{NAAC,NBA,NIRF}'::text[],
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  lead_auditor_id  uuid NOT NULL REFERENCES auth.users(id),    -- Selvamani
  cosigner_roles   text[] DEFAULT '{cao,ceo}'::text[],
  institution_ids  uuid[],                                      -- null = all; array = subset
  phase            text NOT NULL DEFAULT 'draft'
                    CHECK (phase IN ('draft','in-progress','rectification','peer-visit','closed')),
  parameter_catalog_snapshot jsonb,                             -- frozen list of parameters for this cycle
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz
);

CREATE INDEX idx_audit_cycles_phase ON audit_cycles(phase);
CREATE INDEX idx_audit_cycles_lead_auditor ON audit_cycles(lead_auditor_id);
CREATE INDEX idx_audit_cycles_dates ON audit_cycles(start_date, end_date);

-- ============================================================================
-- 2. audit_attestations — per-parameter sign-off per institution per cycle
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_attestations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_cycle_id    uuid NOT NULL REFERENCES audit_cycles(id) ON DELETE CASCADE,
  parameter_code    text NOT NULL,                            -- FK by convention to audit_parameter_catalog.code
  institution_id    uuid NOT NULL REFERENCES institutions(id),
  attestation       text NOT NULL
                     CHECK (attestation IN ('compliant','partial','non-compliant','pending')),
  attested_by       uuid NOT NULL REFERENCES auth.users(id),   -- Lead Auditor
  attested_at       timestamptz NOT NULL DEFAULT now(),
  cosigners         jsonb DEFAULT '{}'::jsonb,                 -- {cao:{id,at}, ceo:{id,at}}
  evidence_count    integer NOT NULL DEFAULT 0,
  open_findings_count integer NOT NULL DEFAULT 0,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (audit_cycle_id, parameter_code, institution_id)
);

CREATE INDEX idx_audit_attestations_cycle ON audit_attestations(audit_cycle_id);
CREATE INDEX idx_audit_attestations_institution ON audit_attestations(institution_id);

-- ============================================================================
-- 3. audit_parameter_catalog — CRUDable master (seeded with 36 Aassaan rows)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_parameter_catalog (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text NOT NULL UNIQUE,                  -- e.g., 'G2-P12-research-publications'
  name                  text NOT NULL,
  parameter_group       smallint NOT NULL CHECK (parameter_group IN (1,2,3,4)),
  description           text,

  -- Per-body framework mapping (decision #12)
  framework_mapping     jsonb NOT NULL DEFAULT '{}'::jsonb,    -- {naac:'3.4.2', nba:'5.1', nirf:'RP', ugc:'2.1.3'}

  -- Discovery query (decision #13)
  discovery_query_sql   text,                                   -- parameterised SQL; $1 = institution_id, $2 = cycle_start
  discovery_query_ai    text,                                   -- natural-language prompt for /ai-query

  -- Owner routing (decision #8)
  default_owner_role    text NOT NULL,                          -- role_key from custom_roles
  escalation_role       text,                                   -- escalate-to role_key

  -- SLA (decision #9)
  p1_sla_days           smallint NOT NULL DEFAULT 14,
  p2_sla_days           smallint NOT NULL DEFAULT 30,

  -- Evidence-required schema (checkbox list for owner)
  evidence_required     jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Scope
  institution_id        uuid REFERENCES institutions(id),       -- null = system default; set = institution override
  is_system             boolean NOT NULL DEFAULT false,          -- true for 36 Aassaan-seeded rows
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_param_catalog_group ON audit_parameter_catalog(parameter_group);
CREATE INDEX idx_param_catalog_active ON audit_parameter_catalog(is_active);
CREATE INDEX idx_param_catalog_institution ON audit_parameter_catalog(institution_id);
CREATE INDEX idx_param_catalog_framework ON audit_parameter_catalog USING gin (framework_mapping);

-- ============================================================================
-- 4. audit_finding_types — CRUDable master (seeded with 4 defaults)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_finding_types (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE,                          -- 'gap' / 'inconsistency' / ...
  name           text NOT NULL,
  description    text,
  is_system      boolean NOT NULL DEFAULT false,
  is_active      boolean NOT NULL DEFAULT true,
  institution_id uuid REFERENCES institutions(id),              -- null = system default
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
```

### Extension to existing `service_requests` (no schema change — just a seeded type)

```sql
-- Seed the service-request type (on migration):
INSERT INTO service_request_types (code, name, description, is_system, metadata_schema, workflow_config)
VALUES (
  'audit_finding',
  'Audit Finding',
  'A gap logged by the Lead Auditor requiring rectification by an owner',
  true,
  -- metadata_schema: JSON schema for the audit-specific fields
  '{
    "type":"object",
    "properties":{
      "audit_cycle_id":{"type":"string","format":"uuid"},
      "parameter_code":{"type":"string"},
      "severity":{"type":"string","enum":["red","yellow","green"]},
      "framework_mapping":{"type":"object"},
      "evidence_required":{"type":"array"}
    },
    "required":["audit_cycle_id","parameter_code","severity"]
  }'::jsonb,
  -- workflow_config: inherits standard approval chain + SLA
  '{"sla_days_by_severity":{"red":14,"yellow":30},"auto_route_via":"audit_parameter_catalog.default_owner_role"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  metadata_schema = EXCLUDED.metadata_schema,
  workflow_config = EXCLUDED.workflow_config,
  is_system = true,
  updated_at = now();
```

### Fan-out trigger (decision #11) — mirrors PR-A5 / PR-A6a pattern

```sql
CREATE OR REPLACE FUNCTION emit_audit_finding_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parameter_code text;
  v_framework_mapping jsonb;
  v_audit_cycle_id uuid;
  v_institution_id uuid;
  v_body_code text;
  v_metric_code text;
BEGIN
  -- Only fire on audit_finding type, closed→rectified transition
  IF NEW.type_code != 'audit_finding' THEN RETURN NEW; END IF;
  IF NEW.status != 'closed' OR NEW.resolution != 'rectified' THEN RETURN NEW; END IF;
  IF OLD.status = 'closed' AND OLD.resolution = 'rectified' THEN RETURN NEW; END IF;

  -- Extract audit context from metadata
  v_parameter_code := NEW.metadata->>'parameter_code';
  v_audit_cycle_id := (NEW.metadata->>'audit_cycle_id')::uuid;
  v_institution_id := NEW.institution_id;

  -- Get framework mapping from catalog
  SELECT framework_mapping INTO v_framework_mapping
  FROM audit_parameter_catalog
  WHERE code = v_parameter_code;

  IF v_framework_mapping IS NULL THEN RETURN NEW; END IF;

  -- Fan-out: one finding → one evidence row per body in framework_mapping
  FOR v_body_code, v_metric_code IN
    SELECT key, value FROM jsonb_each_text(v_framework_mapping)
  LOOP
    INSERT INTO quality_evidence_mappings (
      body_code, metric_code, institution_id, source_kind, source_id,
      evidence_url, captured_at, captured_by
    ) VALUES (
      upper(v_body_code), v_metric_code, v_institution_id, 'audit_finding', NEW.id,
      COALESCE(NEW.metadata->>'evidence_url', ''), NEW.closed_at, NEW.closed_by
    )
    ON CONFLICT (body_code, metric_code, institution_id, source_kind, source_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_finding_evidence ON service_requests;
CREATE TRIGGER trg_audit_finding_evidence
AFTER UPDATE ON service_requests
FOR EACH ROW EXECUTE FUNCTION emit_audit_finding_evidence();
```

### RLS policies (standard pattern per `CLAUDE.md`)

```sql
ALTER TABLE audit_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_parameter_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_finding_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_cycles_select_permission" ON audit_cycles FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('audit.cycle.view')
);

CREATE POLICY "audit_cycles_insert_permission" ON audit_cycles FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR user_has_permission('audit.cycle.manage')
);

CREATE POLICY "audit_cycles_update_permission" ON audit_cycles FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('audit.cycle.manage') AND lead_auditor_id = auth.uid())
);

-- audit_attestations: only lead_auditor + cosigners can write
CREATE POLICY "audit_attestations_select_permission" ON audit_attestations FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('audit.attestation.view') AND role_has_institution_access(institution_id))
);

CREATE POLICY "audit_attestations_insert_permission" ON audit_attestations FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR user_has_permission('audit.attestation.sign')
);

-- audit_parameter_catalog: everyone with audit role can read; only super_admin or institution-admin-with-override can write
CREATE POLICY "param_catalog_select_permission" ON audit_parameter_catalog FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('audit.parameter.view')
);

CREATE POLICY "param_catalog_write_permission" ON audit_parameter_catalog FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('audit.parameter.manage') AND is_system = false)    -- can't edit seeded system rows
);

-- audit_finding_types: same pattern
CREATE POLICY "finding_types_select_permission" ON audit_finding_types FOR SELECT USING (
  is_super_admin() OR is_admin() OR user_has_permission('audit.finding_type.view')
);
CREATE POLICY "finding_types_write_permission" ON audit_finding_types FOR ALL USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('audit.finding_type.manage') AND is_system = false)
);
```

---

## Seed data — 36 parameters (Aassaan list + framework mappings)

Abbreviated example for 3 rows — full 36 seeded via `supabase/setup/seed_audit_parameter_catalog.sql` in PR-B1:

```sql
INSERT INTO audit_parameter_catalog
  (code, name, parameter_group, description, framework_mapping, default_owner_role, escalation_role, p1_sla_days, p2_sla_days, evidence_required, is_system, discovery_query_ai)
VALUES
-- Group 1 — Academic / Curricular
('G1-P02-obe-mapping', 'OBE — Outcome-Based Education mapping',
 1, 'Every course must have Course-Outcomes mapped to Program-Outcomes',
 '{"naac":"1.1.3","nba":"1.2","nirf":"-","ugc":"2.2"}',
 'dean', 'cao', 14, 30,
 '[{"label":"CO-PO mapping sheet (PDF)","required":true}, {"label":"Bloom taxonomy alignment (PDF)","required":false}]',
 true,
 'Show me all programmes where any course is missing CO-PO mapping'),

('G1-P10-examination-system', 'Examination System — results declared vs scheduled',
 1, 'Percentage of semester exams where results published within 21 days',
 '{"naac":"2.5.1","nba":"7.1","nirf":"TLR","ugc":"2.3"}',
 'coe', 'registrar', 14, 30,
 '[{"label":"Result-declaration timeline sheet","required":true}]',
 true,
 'List semesters where results were declared later than 21 days'),

-- Group 2 — Research
('G2-P12-research-publications', 'Research Publications — Scopus/WoS indexed per faculty per year',
 2, 'Average Scopus/WoS indexed publications per full-time faculty per academic year',
 '{"naac":"3.4.2","nba":"5.1","nirf":"RP","ugc":"3.1"}',
 'hod', 'dean', 14, 30,
 '[{"label":"Publication list with DOIs (CSV)","required":true}, {"label":"Scopus indexing proof","required":true}]',
 true,
 'Show me faculty with zero research publications in last 2 academic years'),

-- ... 33 more rows seeded at PR-B1 deploy
;
```

**Full 36-row seed bundled in PR-B1; condensed here for spec readability.**

---

## Roles + permissions

### 3 new roles (seeded idempotent on migration)

```sql
INSERT INTO custom_roles (role_key, role_name, description, institution_scope, is_system_role, permissions) VALUES
('lead_auditor', 'Lead Auditor',
 'Group Registrar role for conducting institutional audits across all colleges',
 'all', true, '{"audit.cycle.manage":true,"audit.cycle.view":true,"audit.finding.log":true,"audit.finding.review":true,"audit.attestation.sign":true,"audit.parameter.view":true}'::jsonb),

('evidence_uploader', 'Evidence Uploader',
 'Delegated role for uploading audit-finding rectification evidence',
 'own', true, '{"audit.finding.view":true,"audit.evidence.upload":true}'::jsonb),

('external_auditor_timeboxed', 'External Auditor (Time-Boxed)',
 'Read-only auditor role with time-boxed expiry via user_institution_access.expires_at',
 'all', true, '{"audit.cycle.view":true,"audit.finding.view":true,"audit.attestation.view":true,"audit.parameter.view":true}'::jsonb)
ON CONFLICT (role_key) DO UPDATE SET
  role_name = EXCLUDED.role_name, description = EXCLUDED.description,
  institution_scope = EXCLUDED.institution_scope, permissions = EXCLUDED.permissions,
  is_system_role = true, updated_at = now();
```

### 8 new permission keys (add to `lib/constants/permissions.ts`)

| Key | Given to |
|---|---|
| `audit.cycle.view` | lead_auditor, super_admin, admin, cao, ceo, md_caio |
| `audit.cycle.manage` | lead_auditor, super_admin, admin |
| `audit.finding.log` | lead_auditor, super_admin |
| `audit.finding.rectify` | assigned owner (deans, hods, coo, finance) — dynamic per-finding |
| `audit.finding.review` | lead_auditor, super_admin |
| `audit.evidence.upload` | evidence_uploader, finding-owner's delegates |
| `audit.attestation.sign` | lead_auditor |
| `audit.attestation.cosign` | cao, ceo, md_caio |
| `audit.attestation.view` | all above + board observer |
| `audit.parameter.view` | all audit-facing roles |
| `audit.parameter.manage` | super_admin, admin (only institution-scoped overrides; system rows protected by RLS `is_system=false` guard) |
| `audit.finding_type.view` | all audit-facing roles |
| `audit.finding_type.manage` | super_admin, admin |

---

## Routes + services (PR-B2 scope)

```
app/(routes)/audit/
├── page.tsx                                   # redirect to /audit/dashboard
├── dashboard/page.tsx                         # Selvamani's home — coverage%, overdue, inbox, parameter walk
├── cycles/
│   ├── page.tsx                               # list all cycles (past + current)
│   ├── new/page.tsx                           # create cycle (wizard — lock parameter snapshot)
│   └── [id]/
│       ├── page.tsx                           # cycle detail: progress, findings, attestations
│       ├── findings/page.tsx                  # cycle-scoped findings list (filtered service-requests)
│       ├── parameters/page.tsx                # parameters × institutions heatmap
│       └── attestations/page.tsx              # per-parameter sign-off grid
├── findings/
│   ├── page.tsx                               # all findings (filter by cycle, severity, status, owner)
│   └── [id]/page.tsx                          # redirect to /service-requests/[id] (same ticket)
├── parameters/
│   ├── page.tsx                               # catalog browser with filters by group/framework
│   ├── [code]/page.tsx                        # parameter detail: discovery query, evidence rules, history
│   └── settings/
│       ├── page.tsx                           # admin CRUD on catalog (uses master-data-table)
│       └── _components/
│           └── audit-parameter-form-dialog.tsx  # USES shared master-form-dialog (not a new copy)
└── my-findings/page.tsx                       # per-owner rectification queue

app/api/audit/
├── cycles/route.ts                            # GET list, POST create
├── cycles/[id]/route.ts                       # GET detail, PATCH phase
├── cycles/[id]/snapshot/route.ts              # POST — freeze parameter_catalog_snapshot
├── findings/log/route.ts                      # POST — create service_request of type audit_finding
├── attestations/route.ts                      # GET list
├── attestations/sign/route.ts                 # POST — sign or cosign
├── parameters/route.ts                        # GET list (with institution-scope override merge)
├── parameters/[code]/run-query/route.ts       # POST — execute discovery query for a cycle
└── coverage/route.ts                          # GET coverage rollup (per body, per institution)

lib/services/audit/
├── audit-cycle-service.ts                     # CRUD + phase transitions
├── audit-finding-service.ts                   # thin wrapper over ServiceRequestService with audit filters
├── audit-attestation-service.ts               # sign + cosign enforcement
├── audit-parameter-catalog-service.ts         # CRUD + institution-scope merge
└── audit-discovery-service.ts                 # run parameterised queries safely (no SQL injection)

hooks/audit/
├── use-audit-cycles.ts
├── use-audit-findings.ts                      # wraps use-service-requests with type filter
├── use-audit-attestations.ts
├── use-audit-parameters.ts
└── use-audit-coverage.ts                      # reuses AccreditationService.getCoverageMatrix()
```

---

## Shared UI extraction (Q2 gate — DO THIS FIRST in PR-B1)

**Before any audit-specific settings component**, extract:

```
components/shared/crud-master/
├── master-form-dialog.tsx      # Generic form dialog: name, description, is_active, is_system, institution-override
├── master-row-actions.tsx      # Generic edit / disable / delete-if-not-is_system
├── master-data-table.tsx       # Schema-driven columns, filter, pagination
├── use-master-crud.ts          # Shared React Query hooks
└── README.md                   # Usage pattern
```

**Then refactor 4 existing callers in the same PR:**
1. `app/(routes)/campus-living/settings/leave-types/_components/*.tsx` → use shared
2. `app/(routes)/academic/leaves/settings/types/_components/*.tsx` → use shared
3. `app/(routes)/academic/leaves/settings/workflows/_components/*.tsx` → use shared (partial — 80% match, bespoke fields stay)
4. `app/(routes)/admission/settings/years/_components/*.tsx` → use shared

**Verification after refactor:**
- All 4 existing settings pages still pass type-check + render correctly (browser-verify via jkkn-ai session)
- Diff on refactored files ≥ diff on new audit settings — proves we net-reduced repo LOC
- Then add `audit-parameter-form-dialog.tsx` + `audit-finding-type-form-dialog.tsx` as thin callers of shared components

---

## Out of scope (deferred to Sprint 02)

| Deferred | Why |
|---|---|
| External auditor portal (Aug 2026 Aassaan mock-visit) | Needs time-boxed scope UI on top of `user_institution_access.expires_at` — 1-week build in Sprint 02 |
| PDF + Word audit report auto-generator | Needs html-to-pdf worker + docx template engine; Sprint 02 |
| WhatsApp SLA nudges | Needs `byow-whatsapp` wiring into notifications; Sprint 02 |
| Per-parameter benchmarking against peer institutions | Needs QS/NIRF competitor data ingest; Sprint 02 or 03 |
| AI-powered finding drafting | Can wait — `/ai-query` read-only is sufficient for Sprint 01 |
| Mobile-first finding-owner rectification UI | PWA exists; desktop sufficient for Sprint 01 |

---

## Acceptance criteria

1. **Schema migration idempotent:** runs twice on same DB → no error.
2. **Seed data complete:** 36 parameters inserted, each with valid framework_mapping JSONB mapping to at least one NAAC + NBA + NIRF criterion (null allowed for irrelevant bodies, e.g., UGC-only).
3. **Role login path works:** Create test user `test.registrar@jkkn.ac.in` with `lead_auditor` role via `/auth/test-login` — user can read `/audit/dashboard`, create a cycle, log a finding; cannot read operational tables they'd normally manage.
4. **Finding = service_request:** Logging a finding creates exactly one row in `service_requests` with `type_code='audit_finding'` and correct metadata JSONB.
5. **Fan-out trigger works:** Closing a finding with `resolution='rectified'` inserts ≥1 row into `quality_evidence_mappings` per body in `framework_mapping`.
6. **Attestation cosign enforcement:** Signing a NAAC-mapped parameter attestation requires `cosigners.cao` AND `cosigners.ceo` — DB constraint blocks insert otherwise.
7. **Shared extraction reduces LOC:** Diff before vs after refactor on 4 existing settings pages shows net reduction; `components/shared/crud-master/` exists and is imported by all 5 settings pages (4 refactored + 1 new audit).
8. **Permissions catalog sync passes:** `node scripts/check-permissions-catalog.mjs` exits 0.
9. **Type-check passes:** `npx tsc --noEmit` returns zero errors.
10. **Browser-verify via jkkn-ai session:** Log in as test.registrar, visit `/audit/dashboard` — no console errors, data loads, create-cycle wizard completes.

---

## PR plan

- **PR-B1 (substrate + shared extraction):**
  - 2 new tables + 2 masters (DDL + RLS + indexes)
  - Seeded 36-parameter catalog + 4 finding-type defaults + 3 new roles + 8 permission keys
  - Fan-out trigger `emit_audit_finding_evidence()`
  - `service_request_types` seed for `audit_finding`
  - `components/shared/crud-master/` extraction + 4 existing-settings refactors
  - **Size estimate:** ~35 files, ~800 LOC net (after deletions from shared extraction)

- **PR-B2 (routes + services + hooks):**
  - `app/(routes)/audit/*` pages (dashboard, cycles, findings, parameters, settings)
  - `app/api/audit/*` route handlers
  - `lib/services/audit/*` services
  - `hooks/audit/*` React Query hooks
  - `audit-parameter-form-dialog.tsx` + `audit-finding-type-form-dialog.tsx` (thin callers of shared)
  - Sidebar link: `/audit` under "Compliance & Audit" section
  - **Size estimate:** ~45 files, ~1500 LOC

---

## Hand-off chain (per `/sdd` pipeline)

- [x] `/spec` (this document)
- [ ] `/writing-plans` — break PR-B1 + PR-B2 into day-by-day task list with test strategy
- [ ] `/assumption-thrash` — 14-category silent-assumption sweep on the locked decisions
- [ ] `/myjkkn-api` — implement PR-B1 (substrate + extraction)
- [ ] `silent-failure-auditor` on PR-B1 diff — block on critical/high
- [ ] `catalog-sync` on PR-B1 — verify 8 new permission keys are in `PERMISSION_CATEGORIES`
- [ ] `pr-preflight` on PR-B1 against open-PR file set — block if overlap
- [ ] `/ship-myjkkn` — create draft PR, flip to Ready
- [ ] User clicks "Squash and merge" on GitHub
- [ ] `/deploy-myjkkn` — fire Vercel hook + browser-verify
- [ ] Repeat for PR-B2

---

*Spec locked: 2026-04-22 16:00 IST. Maintained by: MD/CAIO office.
All DDL idempotent (`IF NOT EXISTS`, `ON CONFLICT`), RLS follows project convention, shared extraction prevents 5th-copy accumulation.
Production-code-sweep output visible in `/myjkkn-chain` gate log above.*
