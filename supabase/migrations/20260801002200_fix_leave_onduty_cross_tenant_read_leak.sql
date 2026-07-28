-- ─── Fix cross-tenant read leak on learner leave/on-duty applications ───────
-- 2026-07-21 (applied via MCP as `fix_leave_onduty_cross_tenant_read_leak`)
--
-- THE LEAK. The SELECT policy `approvers_view_assigned` read:
--
--   (id IN (SELECT application_id FROM leave_onduty_approvals
--            WHERE approver_id = auth.uid()))
--   OR (EXISTS (SELECT 1 FROM profiles
--        WHERE profiles.id = auth.uid()
--          AND profiles.role = ANY (ARRAY['super_admin','admin','institution_admin',
--                                         'hod','principal','faculty','staff'])))
--
-- The second branch never references the row being tested — no institution
-- predicate, no join back to the application. It is a bare "is the caller one
-- of these roles" check, so it returns TRUE for every row in the table.
--
-- Postgres ORs permissive policies together, so the correctly-scoped sibling
-- policy `admins_view_all_institution` (which DOES join through
-- user_institution_access) could not contain it. The broken branch won.
--
-- BLAST RADIUS at time of fix: 679 profiles carry one of those roles
-- (372 faculty, 199 staff, 84 hod, 12 super_admin, 11 principal, 1 admin).
-- All 667 non-superadmin holders could read all 60 learner applications
-- group-wide — including reason text, medical sub-category and dates for
-- learners at institutions they have no relationship with.
--
-- THE FIX. Delegate to can_see_leave_onduty_application(), which already
-- exists and is already correct. It grants access to: (1) an approver named on
-- the application, (2) the applicant learner, (3) super_admin/admin/
-- institution_admin unconditionally, and (4) hod/principal/faculty/staff ONLY
-- where profiles.institution_id = applications.institution_id.
--
-- No legitimate access is lost: branch (1) preserves everything the old
-- policy's working half granted, and the sibling learner/sponsor/admin
-- policies are untouched. What disappears is exactly the cross-institution
-- read, which was never intended.
--
-- NOTE: this fixes READ scope only. The stuck-approvals defect (54 of 60
-- applications have zero approver rows because apply-time flow seeding filters
-- on category = <value> and cannot match the 155 flows stored as
-- category = 'all') is a separate application-layer bug, fixed separately.

DROP POLICY IF EXISTS approvers_view_assigned ON public.leave_onduty_applications;

CREATE POLICY approvers_view_assigned
  ON public.leave_onduty_applications
  FOR SELECT
  USING (can_see_leave_onduty_application(id));
