-- Migration: approval_chain engine (PR-0 — foundation for hostel_vacate workflow)
-- Created: 2026-04-22
--
-- WHY: The /campus-living/settings/approval-chains page was decorative mock JSX
--      with no DB backing. The incoming Hostel Vacate workflow (for cases like
--      Akash M's medical-vacate letter) needs a rules engine to drive the
--      parent → warden → chief-warden → dues-clearance chain. This migration
--      adds a DB-backed engine that's workflow-agnostic: the same tables will
--      later serve hostel_leave, gate_passes, maintenance-escalation, etc.
--
-- Scope of this PR:
--      * Schema (rules + runs) + RLS
--      * Seed rules for hostel_vacate ONLY (learner 4-stage, non-learner 3-stage)
--      * Service + hook + types + 4 permission keys (in follow-up file edits)
--      * Settings page rewrite (list + toggle active + view stages + delete)
-- NOT in this PR: migrating hostel_leave flow onto the engine (separate PR,
--      too risky to change leave behavior alongside introducing the engine).

-- ─── ENUMS ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_chain_workflow_type_enum') THEN
    CREATE TYPE approval_chain_workflow_type_enum AS ENUM (
      'hostel_vacate',
      'hostel_leave',
      'hostel_gate_pass',
      'hostel_curfew_exception',
      'hostel_visitor_extension',
      'hostel_maintenance_escalation'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_chain_run_status_enum') THEN
    CREATE TYPE approval_chain_run_status_enum AS ENUM (
      'in_progress',
      'completed',
      'rejected',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_chain_action_enum') THEN
    CREATE TYPE approval_chain_action_enum AS ENUM (
      'approve',
      'reject',
      'rollback',
      'skip',
      'escalate'
    );
  END IF;
END$$;

-- ─── TABLE: approval_chain_rules ────────────────────────────────────────────
-- Stage definitions per (institution, workflow_type). Multiple rules can exist
-- for the same workflow_type — `criteria` matches against run context, lowest
-- `priority` wins.
CREATE TABLE IF NOT EXISTS approval_chain_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  workflow_type approval_chain_workflow_type_enum NOT NULL,
  rule_name TEXT NOT NULL,
  description TEXT,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  stages JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT acr_stages_non_empty CHECK (jsonb_array_length(stages) > 0)
);

CREATE INDEX IF NOT EXISTS idx_acr_institution_workflow
  ON approval_chain_rules(institution_id, workflow_type) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_acr_workflow_priority
  ON approval_chain_rules(workflow_type, priority);

-- ─── TABLE: approval_chain_runs ─────────────────────────────────────────────
-- One run per subject (e.g. one row per hostel_vacate_requests row).
-- No FK on subject_id because subject_type varies — validated at service layer.
CREATE TABLE IF NOT EXISTS approval_chain_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  rule_id UUID NOT NULL REFERENCES approval_chain_rules(id) ON DELETE RESTRICT,
  subject_type approval_chain_workflow_type_enum NOT NULL,
  subject_id UUID NOT NULL,
  current_stage_idx INTEGER NOT NULL DEFAULT 0,
  status approval_chain_run_status_enum NOT NULL DEFAULT 'in_progress',
  started_by UUID REFERENCES auth.users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT acr_run_unique_subject UNIQUE (subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_acrun_subject
  ON approval_chain_runs(subject_type, subject_id);

CREATE INDEX IF NOT EXISTS idx_acrun_institution_status
  ON approval_chain_runs(institution_id, status) WHERE status = 'in_progress';

-- ─── TRIGGERS: updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_approval_chain_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_approval_chain_rules_updated_at ON approval_chain_rules;
CREATE TRIGGER tr_approval_chain_rules_updated_at
  BEFORE UPDATE ON approval_chain_rules
  FOR EACH ROW EXECUTE FUNCTION set_approval_chain_updated_at();

DROP TRIGGER IF EXISTS tr_approval_chain_runs_updated_at ON approval_chain_runs;
CREATE TRIGGER tr_approval_chain_runs_updated_at
  BEFORE UPDATE ON approval_chain_runs
  FOR EACH ROW EXECUTE FUNCTION set_approval_chain_updated_at();

-- ─── RLS: approval_chain_rules ──────────────────────────────────────────────
ALTER TABLE approval_chain_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approval_chain_rules_select ON approval_chain_rules;
CREATE POLICY approval_chain_rules_select ON approval_chain_rules
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.approval_chains.view')
        AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS approval_chain_rules_insert ON approval_chain_rules;
CREATE POLICY approval_chain_rules_insert ON approval_chain_rules
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.approval_chains.create')
        AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS approval_chain_rules_update ON approval_chain_rules;
CREATE POLICY approval_chain_rules_update ON approval_chain_rules
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.approval_chains.edit')
        AND role_has_institution_access(institution_id))
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.approval_chains.edit')
        AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS approval_chain_rules_delete ON approval_chain_rules;
CREATE POLICY approval_chain_rules_delete ON approval_chain_rules
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.approval_chains.delete')
        AND role_has_institution_access(institution_id))
  );

-- ─── RLS: approval_chain_runs ───────────────────────────────────────────────
-- Runs are mostly mutated by service code. Read permission mirrors rules.view.
-- Mutations use the same engine permission.
ALTER TABLE approval_chain_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approval_chain_runs_select ON approval_chain_runs;
CREATE POLICY approval_chain_runs_select ON approval_chain_runs
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.approval_chains.view')
        AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS approval_chain_runs_insert ON approval_chain_runs;
CREATE POLICY approval_chain_runs_insert ON approval_chain_runs
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.approval_chains.view')
        AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS approval_chain_runs_update ON approval_chain_runs;
CREATE POLICY approval_chain_runs_update ON approval_chain_runs
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.approval_chains.view')
        AND role_has_institution_access(institution_id))
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.approval_chains.view')
        AND role_has_institution_access(institution_id))
  );

-- ─── SEED: hostel_vacate rules (one pair per institution) ───────────────────
-- Two rules per institution:
--   1. Learner vacate — 4-stage (parent → warden → chief → dues)
--   2. Non-learner vacate — 3-stage (warden → chief → dues); skips parent
-- Non-learner rule covers staff, married, international, visitor, other.
-- criteria.resident_type uses array form for non-learner; learner rule uses
-- scalar. Service-side matcher handles both.
INSERT INTO approval_chain_rules
  (institution_id, workflow_type, rule_name, description, criteria, stages, is_active, priority)
SELECT
  inst.id,
  'hostel_vacate'::approval_chain_workflow_type_enum,
  'Learner Vacate',
  'Full approval chain for domestic/day-scholar-converted learner vacate requests: parent OTP consent, then warden, then chief warden, then dues clearance.',
  '{"resident_type": "learner"}'::jsonb,
  '[
    {"stage_idx": 0, "stage_name": "parent_consent", "stage_label": "Parent Consent", "actor_role_key": "parent", "sla_hours": 48, "action_type": "otp"},
    {"stage_idx": 1, "stage_name": "warden_approval", "stage_label": "Warden Approval", "actor_role_key": "warden", "sla_hours": 72, "action_type": "approve", "sla_escalate_to_stage": 2},
    {"stage_idx": 2, "stage_name": "chief_warden_approval", "stage_label": "Chief Warden Approval", "actor_role_key": "chief_warden", "sla_hours": 24, "action_type": "approve"},
    {"stage_idx": 3, "stage_name": "dues_clearance", "stage_label": "Dues Clearance", "actor_role_key": "hostel_office", "sla_hours": 120, "action_type": "checklist"}
  ]'::jsonb,
  true,
  100
FROM institutions inst
WHERE NOT EXISTS (
  SELECT 1 FROM approval_chain_rules r
  WHERE r.institution_id = inst.id
    AND r.workflow_type = 'hostel_vacate'
    AND r.rule_name = 'Learner Vacate'
);

INSERT INTO approval_chain_rules
  (institution_id, workflow_type, rule_name, description, criteria, stages, is_active, priority)
SELECT
  inst.id,
  'hostel_vacate'::approval_chain_workflow_type_enum,
  'Non-Learner Vacate',
  'Approval chain for non-learner residents (staff, married, international, visitor, other). Skips parent consent; warden → chief → dues.',
  '{"resident_type": {"in": ["staff", "married", "international", "visitor", "other"]}}'::jsonb,
  '[
    {"stage_idx": 0, "stage_name": "warden_approval", "stage_label": "Warden Approval", "actor_role_key": "warden", "sla_hours": 72, "action_type": "approve", "sla_escalate_to_stage": 1},
    {"stage_idx": 1, "stage_name": "chief_warden_approval", "stage_label": "Chief Warden Approval", "actor_role_key": "chief_warden", "sla_hours": 24, "action_type": "approve"},
    {"stage_idx": 2, "stage_name": "dues_clearance", "stage_label": "Dues Clearance", "actor_role_key": "hostel_office", "sla_hours": 120, "action_type": "checklist"}
  ]'::jsonb,
  true,
  100
FROM institutions inst
WHERE NOT EXISTS (
  SELECT 1 FROM approval_chain_rules r
  WHERE r.institution_id = inst.id
    AND r.workflow_type = 'hostel_vacate'
    AND r.rule_name = 'Non-Learner Vacate'
);

-- ─── COMMENTS ───────────────────────────────────────────────────────────────
COMMENT ON TABLE approval_chain_rules IS
  'Rule definitions per (institution, workflow_type). Multiple rules with different criteria can coexist; lowest priority matching rule wins. Engine is workflow-agnostic — currently seeds hostel_vacate; hostel_leave/gate_pass will migrate onto this in future PRs.';

COMMENT ON COLUMN approval_chain_rules.criteria IS
  'JSONB matcher evaluated against run context. Scalar match: {"key": "value"}. Array match: {"key": {"in": [...]}}. Empty {} matches everything (fallback rule).';

COMMENT ON COLUMN approval_chain_rules.stages IS
  'Ordered JSONB array. Each stage: {stage_idx, stage_name, stage_label, actor_role_key, sla_hours, action_type, sla_escalate_to_stage?}. action_type values: otp (parent consent flow), approve (single approver), checklist (dues clearance; all required items must clear).';

COMMENT ON TABLE approval_chain_runs IS
  'One row per subject. subject_type identifies the owning workflow; subject_id points at the owning row (e.g. hostel_vacate_requests.id). current_stage_idx advances through rule.stages; history logs each transition.';

COMMENT ON COLUMN approval_chain_runs.subject_id IS
  'No FK — subject_type determines the referenced table. Service layer validates existence on run creation.';
