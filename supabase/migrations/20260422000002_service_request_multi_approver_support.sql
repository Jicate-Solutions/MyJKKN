-- Service Request Approval Steps: multi-approver support per step (OR logic).
--
-- Goal: let the service-type author pick N specific users per approval step;
-- whichever user acts first resolves the step. Previously a step was gated by
-- a single `approver_role` and any user carrying that role could approve —
-- too broad when a step should be restricted to named individuals.
--
-- Design: additive column `approver_user_ids UUID[]` on
-- service_request_approval_steps. Semantics:
--
--   • NULL/empty array  -> legacy behavior: any user with profiles.role
--                          matching approver_role (in scope) can approve.
--   • Non-empty array   -> approval is restricted to listed users. ANY of
--                          them can approve; first to act wins. The
--                          service-type form still sets approver_role to
--                          the first selected user's role as a discovery
--                          fallback so role-based inbox queries and the
--                          existing RLS path still catch them.
--
-- RLS: extend "Approvers can view pending requests" so users listed in
-- approver_user_ids can see the request in their inbox even if their role
-- doesn't match the step's approver_role.
--
-- Safe to apply on a live table — DEFAULT '{}' means existing rows become
-- empty-array immediately (equivalent to the NULL/legacy branch) and no
-- rewrite is needed because Postgres 11+ stores array defaults as metadata.
--
-- Applied via MCP apply_migration on 2026-04-22.

BEGIN;

-- 1. Column + index
ALTER TABLE service_request_approval_steps
  ADD COLUMN IF NOT EXISTS approver_user_ids UUID[] NOT NULL DEFAULT '{}'::UUID[];

COMMENT ON COLUMN service_request_approval_steps.approver_user_ids IS
  'Specific users allowed to approve this step (OR logic — any one can approve). Empty array falls back to approver_role-based matching. Populated in addition to approver_role to keep legacy inbox queries working.';

-- GIN index so `auth.uid() = ANY(approver_user_ids)` / `@>` lookups in RLS
-- and inbox queries don't sequentially scan the step table.
CREATE INDEX IF NOT EXISTS idx_sr_approval_steps_approver_user_ids
  ON service_request_approval_steps USING GIN (approver_user_ids);

-- 2. Extend "Approvers can view pending requests" RLS
--
-- Old policy only matched profiles.role to approver_role. That leaves out
-- users who were explicitly added via approver_user_ids but whose role
-- differs from the step's representative role. Rewrite the EXISTS clause
-- to accept either match.
DROP POLICY IF EXISTS "Approvers can view pending requests" ON service_requests;
CREATE POLICY "Approvers can view pending requests" ON service_requests
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM service_request_approval_steps sras
    WHERE sras.service_type_id = service_requests.service_type_id
      AND sras.step_order = service_requests.current_approval_step
      AND (
        -- Legacy: role-based match
        sras.approver_role::text = get_current_user_role()
        -- New: explicit user-id match
        OR auth.uid() = ANY(sras.approver_user_ids)
      )
  )
  AND (
    is_super_admin() OR is_admin()
    OR role_has_institution_access(service_requests.institution_id)
  )
);

COMMIT;
