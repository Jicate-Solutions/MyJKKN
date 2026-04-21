-- Fix RLS self-reference on leave_onduty_approval_flows policies.
--
-- Root cause: in the prior migration 20260129170000_fix_leave_onduty_flows_rls_for_hod.sql
-- the HOD/principal/faculty/staff institution check was written as:
--
--     AND institution_id = p.institution_id
--
-- Inside EXISTS (SELECT 1 FROM profiles p WHERE ...), the bare `institution_id`
-- was ambiguous — it exists on both the outer table (leave_onduty_approval_flows)
-- and the inner subquery table (profiles p). Postgres resolved it to the
-- innermost scope (p.institution_id), so the compiled policy became
-- `p.institution_id = p.institution_id` — a tautology that always passes.
-- This inadvertently granted HOD/principal/faculty/staff visibility and (for
-- HOD/principal) write access across ALL institutions.
--
-- Fix: fully-qualify the outer table column as
-- `leave_onduty_approval_flows.institution_id` so there is no ambiguity and
-- the check genuinely enforces "own institution only."
--
-- Behavior changes:
--   - HOD/principal: now correctly scoped to their own institution for SELECT/INSERT/UPDATE/DELETE.
--   - faculty/staff: now correctly scoped to their own institution for SELECT (cannot manage).
--   - super_admin: unchanged — still global.
--   - admin/institution_admin: unchanged — still routed through user_institution_access.
--
-- Applied via MCP apply_migration 2026-04-21.

DROP POLICY IF EXISTS academic_staff_view_flows ON leave_onduty_approval_flows;
CREATE POLICY academic_staff_view_flows ON leave_onduty_approval_flows
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_admin'
        OR (
          p.role IN ('admin','institution_admin')
          AND p.institution_id IN (
            SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
          )
        )
        OR (
          p.role IN ('hod','principal','faculty','staff')
          AND p.institution_id = leave_onduty_approval_flows.institution_id
        )
      )
  )
);

DROP POLICY IF EXISTS admins_and_hod_manage_flows ON leave_onduty_approval_flows;
CREATE POLICY admins_and_hod_manage_flows ON leave_onduty_approval_flows
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_admin'
        OR (
          p.role IN ('admin','institution_admin')
          AND p.institution_id IN (
            SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
          )
        )
        OR (
          p.role IN ('hod','principal')
          AND p.institution_id = leave_onduty_approval_flows.institution_id
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_admin'
        OR (
          p.role IN ('admin','institution_admin')
          AND p.institution_id IN (
            SELECT institution_id FROM user_institution_access WHERE user_id = auth.uid()
          )
        )
        OR (
          p.role IN ('hod','principal')
          AND p.institution_id = leave_onduty_approval_flows.institution_id
        )
      )
  )
);
