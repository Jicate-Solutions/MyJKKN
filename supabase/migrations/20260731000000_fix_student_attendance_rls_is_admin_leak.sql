-- =====================================================================================
-- Migration: Fix is_admin() cross-tenant leak in student_attendance dashboard RLS
-- Date:      2026-07-03
-- Author:    Security hardening (Claude Opus 4.8)
-- Table:     public.student_attendance
-- Policy:    student_attendance_select_dashboard_institution_access (SELECT / read)
--
-- ------------------------------------------------------------------------------------
-- THE LEAK (verified against production, project kvizhngldtiuufknvehv)
-- ------------------------------------------------------------------------------------
-- The live SELECT policy USING expression is:
--
--   is_super_admin()
--   OR is_admin()
--   OR (user_has_permission('academic.attendance.dashboard.view')
--       AND role_has_institution_access(institution_id))
--
-- is_admin() is defined as a GLOBAL role-name check with NO institution scoping:
--
--   is_admin(user_id uuid DEFAULT auth.uid()) :=
--     EXISTS (SELECT 1 FROM profiles
--             WHERE id = user_id
--               AND (is_super_admin = true
--                    OR role IN ('admin','super_admin','administrator')));
--
-- Because is_admin() is a standalone OR branch that ignores institution_id, ANY
-- profile whose legacy role is 'admin' / 'administrator' / 'super_admin' (even with
-- is_super_admin = false and institution_scope = 'own'/'all') can read EVERY
-- institution's student_attendance rows through the dashboard read path. This is a
-- real multi-tenant data leak (student attendance is per-institution PII).
--
-- Empirical proof via JWT-claims impersonation (BEFORE this fix), foreign institution
-- 5de4fba1-4564-41ed-8c73-5d948b74b843 (2143 rows), own institution
-- 5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334 (567 rows), 7441 rows total:
--
--   deepakkumar@jkkn.ac.in  role=administrator is_super_admin=false has_perm=false
--     -> visible_foreign = 2143  (LEAK: sees a foreign institution's rows)
--     -> visible_total   = 7441  (sees EVERYTHING via the is_admin() branch)
--
-- ------------------------------------------------------------------------------------
-- THE FIX
-- ------------------------------------------------------------------------------------
-- Remove the hardcoded is_admin() role-name bypass. Access to the attendance dashboard
-- read path becomes: super admin, OR (holds the dashboard.view permission AND the row's
-- institution is in scope). This is the standardized dynamic-permission pattern
-- (permission AND institution scope), matching the same class of leak that PR #1737's
-- RPC hardening already closed elsewhere.
--
--   is_super_admin()
--   OR (user_has_permission('academic.attendance.dashboard.view')
--       AND role_has_institution_access(institution_id))
--
-- Transactional (BEGIN...ROLLBACK) simulation of the fix, same impersonation harness:
--   deepakkumar (administrator, has institution, NO perm): foreign 2143 -> 0,
--                                                           own 567 -> 567 (preserved)
--   registrar   (scope='all', HAS perm):   total 7441 -> 7441 (legitimate access kept)
--   sendamaraai (super_admin):             total 7441 -> 7441 (kept via is_super_admin())
--
-- ------------------------------------------------------------------------------------
-- ⚠️  PREREQUISITE BEFORE APPLYING TO PRODUCTION (Director decision required)
-- ------------------------------------------------------------------------------------
-- This migration is INTENTIONALLY NOT YET APPLIED to production. Removing is_admin()
-- strips cross-institution (and, for NULL-institution admins, ALL) dashboard access
-- from real group administrators who hold institution_scope = 'all' but do NOT hold the
-- 'academic.attendance.dashboard.view' permission key. They rely SOLELY on the
-- is_admin() bypass today. Verified:
--
--   deepanj@jkkn.ac.in  role=administrator institution_id=NULL scope='all' has_perm=false
--     BEFORE: visible_total = 7441   AFTER (simulated): visible_total = 0  (TOTAL LOSS)
--   vg@jkkn.ac.in       role=administrator institution_id=NULL scope='all' has_perm=false
--     (same profile shape as deepanj -> would also drop to 0)
--
-- The 'administrator' custom_role (institution_scope='all') has
-- permissions->>'academic.attendance.dashboard.view' = 'false'. RECOMMENDED remediation
-- BEFORE applying this migration:
--
--   -- Grant the dashboard.view permission to the group-administrator role(s) that are
--   -- intended to see attendance dashboards, so no legitimate admin loses access:
--   UPDATE custom_roles
--   SET permissions = permissions || '{"academic.attendance.dashboard.view": true}'::jsonb
--   WHERE role_key = 'administrator';
--   -- (and decide the same for the single legacy role='admin' profile, which has no
--   --  matching custom_role, and confirm those NULL-institution admins should retain
--   --  cross-institution visibility at all.)
--
-- Only after that grant (or an explicit Director decision to let those admins lose
-- dashboard access) should this policy migration be applied.
--
-- ------------------------------------------------------------------------------------
-- ROLLBACK (restore the original, leaky policy if ever needed)
-- ------------------------------------------------------------------------------------
--   DROP POLICY IF EXISTS "student_attendance_select_dashboard_institution_access"
--     ON public.student_attendance;
--   CREATE POLICY "student_attendance_select_dashboard_institution_access"
--     ON public.student_attendance FOR SELECT
--     USING (is_super_admin() OR is_admin()
--            OR (user_has_permission('academic.attendance.dashboard.view')
--                AND role_has_institution_access(institution_id)));
--
-- ------------------------------------------------------------------------------------
-- RELATED (audit only — NOT fixed here; follow-up required)
-- ------------------------------------------------------------------------------------
-- 1. SAME TABLE, sibling leak: policy "Comprehensive attendance access by role"
--    (cmd = ALL, so it also covers SELECT) grants a GLOBAL bypass via
--    p.role = ANY (ARRAY['super_admin','admin','faculty']). A profile with legacy
--    role='admin' or role='faculty' still reads all institutions through THAT policy
--    even after this migration. Fully closing the leak for role='admin'/'faculty'
--    users therefore requires a follow-up fix to that policy too.
-- 2. SYSTEMIC: 640 RLS policies across 221 institution_id-bearing tables reference
--    is_admin() (250 of them SELECT/ALL read-exposing, across 209 tables — incl.
--    billing_invoices, billing_receipts, admission_leads, learners_profiles,
--    hr_attendance_records, hostel_* PII). Each standalone is_admin() OR-branch on a
--    read path is a candidate for the same cross-tenant leak and should be triaged.
-- =====================================================================================

DROP POLICY IF EXISTS "student_attendance_select_dashboard_institution_access"
  ON public.student_attendance;

CREATE POLICY "student_attendance_select_dashboard_institution_access"
  ON public.student_attendance
  FOR SELECT
  USING (
    is_super_admin()
    OR (
      user_has_permission('academic.attendance.dashboard.view')
      AND role_has_institution_access(institution_id)
    )
  );
