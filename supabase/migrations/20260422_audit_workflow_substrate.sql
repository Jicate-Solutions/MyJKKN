-- Audit Workflow Sprint 01 — Substrate
-- Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md
-- Execution plan: specs/myjkkn-audit-workflow-sprint-01-execution-plan.md
-- Thrash decisions: same spec §Silent Assumption Decisions (T1-T19)
-- Applied: 2026-04-22
--
-- Purpose: Audit-execution layer on top of Compliance Unification substrate
-- (PRs #223-#305, all merged). Enables Group Registrar (Selvamani) to run
-- closed-loop institutional audit across 36-parameter catalog — findings
-- become service_requests, evidence auto-populates quality_evidence_mappings.
--
-- Creates 5 tables + indexes + CHECK constraints:
--   1. audit_cycles                  — wrapper for "2026-Q2 Institutional Audit"
--   2. audit_attestations            — per-parameter sign-off per institution per cycle
--   3. audit_parameter_catalog       — CRUDable master (seeded with 36 Aassaan rows)
--   4. audit_finding_types           — CRUDable master (4 defaults)
--   5. audit_finding_delegations     — T11: per-finding evidence-upload delegation
--
-- Idempotent: all CREATE TABLE use IF NOT EXISTS; re-running this migration is safe.
-- RLS applied in separate migration: 20260422_audit_workflow_rls.sql
-- Seeds applied in: 20260422_audit_workflow_seeds.sql
-- Triggers applied in: 20260422_audit_workflow_fanout_triggers.sql

-- ============================================================================
-- 1. audit_cycles — time-boxed audit cycle wrapper
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_cycles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text NOT NULL,
  description                 text,
  frameworks                  text[] NOT NULL DEFAULT '{NAAC,NBA,NIRF}'::text[],
  start_date                  date NOT NULL,
  end_date                    date NOT NULL,
  lead_auditor_id             uuid NOT NULL REFERENCES auth.users(id),
  cosigner_roles              text[] NOT NULL DEFAULT '{cao,ceo}'::text[],
  institution_ids             uuid[],  -- NULL = all institutions the lead_auditor has scope for (thrash T7)
  phase                       text NOT NULL DEFAULT 'draft'
                               CHECK (phase IN ('draft','in-progress','rectification','peer-visit','closed')),
  parameter_catalog_snapshot  jsonb,   -- frozen list of parameter IDs + versions, set at phase draft->in-progress
  created_by                  uuid REFERENCES auth.users(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  closed_at                   timestamptz,

  -- Date sanity
  CONSTRAINT audit_cycles_date_order CHECK (end_date >= start_date),
  -- Frameworks must not be empty
  CONSTRAINT audit_cycles_frameworks_nonempty CHECK (array_length(frameworks, 1) IS NOT NULL AND array_length(frameworks, 1) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_audit_cycles_phase             ON public.audit_cycles(phase);
CREATE INDEX IF NOT EXISTS idx_audit_cycles_lead_auditor      ON public.audit_cycles(lead_auditor_id);
CREATE INDEX IF NOT EXISTS idx_audit_cycles_dates             ON public.audit_cycles(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_audit_cycles_frameworks        ON public.audit_cycles USING gin (frameworks);

COMMENT ON TABLE  public.audit_cycles IS
  'Sprint 01 audit execution layer. Wraps an institutional audit run (e.g., "2026-Q2"). Spec: specs/myjkkn-audit-workflow-sprint-01-plan.md';
COMMENT ON COLUMN public.audit_cycles.institution_ids IS
  'NULL = resolve at query time via role_has_institution_access(lead_auditor_id). Thrash T7: empty = all.';
COMMENT ON COLUMN public.audit_cycles.parameter_catalog_snapshot IS
  'Frozen list {parameter_code, version, evidence_required} captured when phase transitions draft->in-progress. Prevents mid-cycle drift.';

-- ============================================================================
-- 2. audit_attestations — per-parameter sign-off (cycle × parameter × institution)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_attestations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_cycle_id        uuid NOT NULL REFERENCES public.audit_cycles(id) ON DELETE CASCADE,
  parameter_code        text NOT NULL,  -- by convention references audit_parameter_catalog.code
  institution_id        uuid NOT NULL REFERENCES public.institutions(id),
  attestation           text NOT NULL DEFAULT 'pending'
                         CHECK (attestation IN ('compliant','partial','non-compliant','pending')),
  attested_by           uuid REFERENCES auth.users(id),
  attested_at           timestamptz,
  cosigners             jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {cao:{user_id,at}, ceo:{user_id,at}, md_caio:{user_id,at}}
  framework_mapping     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- snapshot copy from parameter at attestation time
  evidence_count        integer NOT NULL DEFAULT 0,
  open_findings_count   integer NOT NULL DEFAULT 0,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- One attestation per (cycle, parameter, institution)
  CONSTRAINT audit_attestations_unique UNIQUE (audit_cycle_id, parameter_code, institution_id),

  -- Thrash T9: no emergency bypass. If attestation is final (non-pending) AND framework_mapping touches NAAC or NBA,
  -- cosigners must include both cao and ceo. Enforced at DB; service layer also validates.
  CONSTRAINT audit_attestations_naac_nba_cosign
    CHECK (
      attestation = 'pending'
      OR NOT (framework_mapping ? 'naac' OR framework_mapping ? 'nba')
      OR (cosigners ? 'cao' AND cosigners ? 'ceo')
    )
);

CREATE INDEX IF NOT EXISTS idx_audit_attestations_cycle        ON public.audit_attestations(audit_cycle_id);
CREATE INDEX IF NOT EXISTS idx_audit_attestations_institution  ON public.audit_attestations(institution_id);
CREATE INDEX IF NOT EXISTS idx_audit_attestations_parameter    ON public.audit_attestations(parameter_code);
CREATE INDEX IF NOT EXISTS idx_audit_attestations_attestation  ON public.audit_attestations(attestation);

COMMENT ON TABLE  public.audit_attestations IS
  'Per-parameter sign-off. Cosigners JSONB enforces CAO+CEO presence for NAAC/NBA-mapped params (thrash T9).';
COMMENT ON COLUMN public.audit_attestations.cosigners IS
  'Shape: {cao:{user_id:uuid,at:timestamptz}, ceo:{...}, md_caio:{...}}. DB CHECK enforces cao+ceo for NAAC/NBA.';

-- ============================================================================
-- 3. audit_parameter_catalog — CRUDable master (system rows seeded + per-institution overrides)
-- ============================================================================
-- Thrash T2: override = same code + institution_id set. System row = institution_id NULL, is_system=true.
CREATE TABLE IF NOT EXISTS public.audit_parameter_catalog (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    text NOT NULL,
  name                    text NOT NULL,
  parameter_group         smallint NOT NULL CHECK (parameter_group IN (1,2,3,4)),
  description             text,

  -- Framework mapping per body (decision spec#12)
  framework_mapping       jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Discovery query (decision spec#13)
  discovery_query_sql     text,    -- parameterised: $1=institution_id, $2=cycle_start, $3=cycle_end
  discovery_query_ai      text,    -- natural-language prompt for /ai-query

  -- Owner routing (decision spec#8)
  default_owner_role      text NOT NULL,
  escalation_role         text,

  -- SLA (decision spec#9)
  p1_sla_days             smallint NOT NULL DEFAULT 14,
  p2_sla_days             smallint NOT NULL DEFAULT 30,

  -- Evidence requirements checklist (thrash T17)
  evidence_required       jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Scope: institution_id NULL = system default; non-null = institution override (thrash T2)
  institution_id          uuid REFERENCES public.institutions(id),
  is_system               boolean NOT NULL DEFAULT false,
  is_active               boolean NOT NULL DEFAULT true,

  created_by              uuid REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- Thrash T2: composite unique so override row can share code with system row
  -- NULLS are treated as DISTINCT in UNIQUE by default; one system row (NULL institution_id) + N override rows (non-null)
  CONSTRAINT audit_param_catalog_code_institution_unique UNIQUE (code, institution_id),

  -- System rows must have NULL institution_id (sanity)
  CONSTRAINT audit_param_catalog_system_row_scope CHECK (
    (is_system = false) OR (institution_id IS NULL)
  ),

  -- Override rows must NOT be is_system=true (sanity)
  CONSTRAINT audit_param_catalog_override_not_system CHECK (
    (institution_id IS NULL) OR (is_system = false)
  )
);

CREATE INDEX IF NOT EXISTS idx_param_catalog_code               ON public.audit_parameter_catalog(code);
CREATE INDEX IF NOT EXISTS idx_param_catalog_group              ON public.audit_parameter_catalog(parameter_group);
CREATE INDEX IF NOT EXISTS idx_param_catalog_active             ON public.audit_parameter_catalog(is_active);
CREATE INDEX IF NOT EXISTS idx_param_catalog_institution        ON public.audit_parameter_catalog(institution_id);
CREATE INDEX IF NOT EXISTS idx_param_catalog_framework          ON public.audit_parameter_catalog USING gin (framework_mapping);
CREATE INDEX IF NOT EXISTS idx_param_catalog_system             ON public.audit_parameter_catalog(is_system) WHERE is_system = true;

COMMENT ON TABLE  public.audit_parameter_catalog IS
  'Master catalog of audit parameters. Thrash T2: override = same code + non-null institution_id. System rows are is_system=true, institution_id NULL.';
COMMENT ON COLUMN public.audit_parameter_catalog.discovery_query_sql IS
  'Parameterised SQL with $1=institution_id, $2=cycle_start, $3=cycle_end. Whitelist-pattern validated (no DDL/writes). Service: audit-discovery-service.ts';
COMMENT ON COLUMN public.audit_parameter_catalog.evidence_required IS
  'Shape: [{label:text, required:bool, mime_types?:text[]}]. Thrash T17: required=true items must upload before finding can close.';

-- ============================================================================
-- 4. audit_finding_types — CRUDable master (4 seeded defaults)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_finding_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL,
  name            text NOT NULL,
  description     text,
  is_system       boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  institution_id  uuid REFERENCES public.institutions(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT audit_finding_types_code_institution_unique UNIQUE (code, institution_id),

  CONSTRAINT audit_finding_types_system_row_scope CHECK (
    (is_system = false) OR (institution_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_audit_finding_types_active        ON public.audit_finding_types(is_active);
CREATE INDEX IF NOT EXISTS idx_audit_finding_types_institution   ON public.audit_finding_types(institution_id);

COMMENT ON TABLE public.audit_finding_types IS
  'Finding types (gap, inconsistency, missing_evidence, data_quality). Same override-via-composite-unique pattern as audit_parameter_catalog.';

-- ============================================================================
-- 5. audit_finding_delegations — T11: per-finding evidence-upload delegation
-- ============================================================================
-- Owner (assigned_to on service_requests) can delegate evidence upload to a named user.
-- Delegation auto-revokes when finding closes (trigger in fanout migration) or manually.
CREATE TABLE IF NOT EXISTS public.audit_finding_delegations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id          uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  delegated_to        uuid NOT NULL REFERENCES auth.users(id),
  delegated_by        uuid NOT NULL REFERENCES auth.users(id),
  delegated_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz,
  revoke_reason       text,

  -- Only one ACTIVE delegation per (finding, delegated_to). Revoked ones can coexist (audit trail).
  -- Enforced via partial unique index below.
  CONSTRAINT audit_delegations_revoke_consistency CHECK (
    (revoked_at IS NULL) OR (revoke_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_delegations_active
  ON public.audit_finding_delegations (finding_id, delegated_to)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_delegations_finding         ON public.audit_finding_delegations(finding_id);
CREATE INDEX IF NOT EXISTS idx_audit_delegations_delegated_to    ON public.audit_finding_delegations(delegated_to) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.audit_finding_delegations IS
  'Thrash T11: Dean delegates evidence-upload on a specific finding to Admin Assistant. Auto-revokes on finding close via trigger in fanout migration.';

-- ============================================================================
-- 6. updated_at maintenance triggers (standard project pattern)
-- ============================================================================
-- Reuses the public.set_updated_at() function if it exists; otherwise create it.

CREATE OR REPLACE FUNCTION public.audit_workflow_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_cycles_updated_at ON public.audit_cycles;
CREATE TRIGGER trg_audit_cycles_updated_at
  BEFORE UPDATE ON public.audit_cycles
  FOR EACH ROW EXECUTE FUNCTION public.audit_workflow_set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_attestations_updated_at ON public.audit_attestations;
CREATE TRIGGER trg_audit_attestations_updated_at
  BEFORE UPDATE ON public.audit_attestations
  FOR EACH ROW EXECUTE FUNCTION public.audit_workflow_set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_parameter_catalog_updated_at ON public.audit_parameter_catalog;
CREATE TRIGGER trg_audit_parameter_catalog_updated_at
  BEFORE UPDATE ON public.audit_parameter_catalog
  FOR EACH ROW EXECUTE FUNCTION public.audit_workflow_set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_finding_types_updated_at ON public.audit_finding_types;
CREATE TRIGGER trg_audit_finding_types_updated_at
  BEFORE UPDATE ON public.audit_finding_types
  FOR EACH ROW EXECUTE FUNCTION public.audit_workflow_set_updated_at();

-- ============================================================================
-- 7. Grants (standard pattern — RLS handles actual access in next migration)
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_cycles              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_attestations        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_parameter_catalog   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_finding_types       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_finding_delegations TO authenticated;

-- ============================================================================
-- Verification (safe SELECTs; migration will error if expected tables missing)
-- ============================================================================
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema='public'
            AND table_name IN ('audit_cycles','audit_attestations','audit_parameter_catalog','audit_finding_types','audit_finding_delegations')
         ) = 5, 'Expected 5 audit-workflow tables after migration';
END $$;

-- Rollback helper (commented — do NOT run unintentionally):
-- DROP TABLE IF EXISTS public.audit_finding_delegations CASCADE;
-- DROP TABLE IF EXISTS public.audit_finding_types CASCADE;
-- DROP TABLE IF EXISTS public.audit_parameter_catalog CASCADE;
-- DROP TABLE IF EXISTS public.audit_attestations CASCADE;
-- DROP TABLE IF EXISTS public.audit_cycles CASCADE;
-- DROP FUNCTION IF EXISTS public.audit_workflow_set_updated_at();
