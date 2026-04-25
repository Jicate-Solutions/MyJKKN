-- Migration: hostel_leave migration onto approval_chain engine
-- Created: 2026-04-24
--
-- WHY: PR #330 (engine) + PR-A (hostel_vacate) shipped the workflow-agnostic
--      approval_chain engine. hostel_leave is still on hardcoded stage logic
--      in HostelLeaveService (draft → pending_parent → pending_warden → ...).
--      This migration (a) adds the engine-run FK column to
--      hostel_leave_requests so HostelLeaveService can mirror engine state,
--      and (b) seeds two rules per institution so existing learner leave
--      requests can pick the right chain.
--
-- Design notes:
-- * `chief_warden_required` (bool on the request row) is the existing
--   branching mechanism — pre-engine code used it to decide whether to
--   advance to 'pending_chief' after warden approval. We re-use it as the
--   engine's criteria key:
--     chief_warden_required = true  → 4-stage chain (parent → warden → chief → final)
--     chief_warden_required = false → 3-stage chain (parent → warden → final)
--   Note: hostel_leave is almost exclusively a learner flow (there is no
--   resident_type column on hostel_leave_requests, unlike hostel_vacate),
--   so both chains include parent_consent. Non-learner leaves are covered
--   elsewhere (staff leave module).
-- * Idempotency: table-alter uses IF NOT EXISTS; seed rows use NOT EXISTS
--   guard keyed on (institution_id, workflow_type, rule_name) because
--   approval_chain_rules has no unique index (the app-level matcher handles
--   multi-match via priority).
-- * Prod today: hostel_leave_requests count = 0. Safe to assume greenfield —
--   no backfill needed for existing rows.

-- ─── COLUMN: approval_chain_run_id on hostel_leave_requests ────────────────
-- Nullable (draft rows have no run yet; populated by service on submit).
ALTER TABLE hostel_leave_requests
  ADD COLUMN IF NOT EXISTS approval_chain_run_id UUID
    REFERENCES approval_chain_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hlr_approval_chain_run
  ON hostel_leave_requests(approval_chain_run_id)
  WHERE approval_chain_run_id IS NOT NULL;

-- ─── SEED: hostel_leave rules (one pair per institution) ───────────────────
-- Two rules per institution — matcher uses chief_warden_required:
--   1. With Chief Warden — 4-stage (parent → warden → chief_warden → final)
--   2. Without Chief Warden — 3-stage (parent → warden → final)
-- Stage names chosen to match vacate's mirror map where overlapping
-- ('parent_consent', 'warden_approval', 'chief_warden_approval') so the
-- engine's status-derive logic reads cleanly for both workflows.
-- SLA + escalate pattern mirrors hostel_vacate: 48h parent, 72h warden with
-- auto-escalate, 24h chief/final.

INSERT INTO approval_chain_rules
  (institution_id, workflow_type, rule_name, description, criteria, stages, is_active, priority)
SELECT
  inst.id,
  'hostel_leave'::approval_chain_workflow_type_enum,
  'Leave with Chief Warden',
  'Full leave approval chain when chief_warden_required=true: parent OTP → warden → chief warden → final approval.',
  '{"chief_warden_required": true}'::jsonb,
  '[
    {"stage_idx": 0, "stage_name": "parent_consent",        "stage_label": "Parent Consent",         "actor_role_key": "parent",        "sla_hours": 48,  "action_type": "otp"},
    {"stage_idx": 1, "stage_name": "warden_approval",       "stage_label": "Warden Approval",        "actor_role_key": "warden",        "sla_hours": 72,  "action_type": "approve", "sla_escalate_to_stage": 2},
    {"stage_idx": 2, "stage_name": "chief_warden_approval", "stage_label": "Chief Warden Approval",  "actor_role_key": "chief_warden",  "sla_hours": 24,  "action_type": "approve"},
    {"stage_idx": 3, "stage_name": "final_approval",        "stage_label": "Final Approval",         "actor_role_key": "hostel_office", "sla_hours": 24,  "action_type": "approve"}
  ]'::jsonb,
  true,
  100
FROM institutions inst
WHERE NOT EXISTS (
  SELECT 1 FROM approval_chain_rules r
  WHERE r.institution_id = inst.id
    AND r.workflow_type = 'hostel_leave'
    AND r.rule_name = 'Leave with Chief Warden'
);

INSERT INTO approval_chain_rules
  (institution_id, workflow_type, rule_name, description, criteria, stages, is_active, priority)
SELECT
  inst.id,
  'hostel_leave'::approval_chain_workflow_type_enum,
  'Leave without Chief Warden',
  'Leave approval chain when chief_warden_required=false: parent OTP → warden → final approval. Skips chief warden stage.',
  '{"chief_warden_required": false}'::jsonb,
  '[
    {"stage_idx": 0, "stage_name": "parent_consent",  "stage_label": "Parent Consent",   "actor_role_key": "parent",        "sla_hours": 48, "action_type": "otp"},
    {"stage_idx": 1, "stage_name": "warden_approval", "stage_label": "Warden Approval",  "actor_role_key": "warden",        "sla_hours": 72, "action_type": "approve", "sla_escalate_to_stage": 2},
    {"stage_idx": 2, "stage_name": "final_approval",  "stage_label": "Final Approval",   "actor_role_key": "hostel_office", "sla_hours": 24, "action_type": "approve"}
  ]'::jsonb,
  true,
  100
FROM institutions inst
WHERE NOT EXISTS (
  SELECT 1 FROM approval_chain_rules r
  WHERE r.institution_id = inst.id
    AND r.workflow_type = 'hostel_leave'
    AND r.rule_name = 'Leave without Chief Warden'
);

-- ─── COMMENTS ───────────────────────────────────────────────────────────────
COMMENT ON COLUMN hostel_leave_requests.approval_chain_run_id IS
  'Engine run link (PR migrating hostel_leave onto approval_chain engine, 2026-04-24). Nullable for draft rows; populated by HostelLeaveService.submitRequest() on submit. Engine is source-of-truth for stage progression; hostel_leave_requests.status is a denormalized mirror kept in sync by the service.';
