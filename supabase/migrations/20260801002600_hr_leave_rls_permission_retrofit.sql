-- ─── Phase 0b/0c — retrofit hr_leave_* RLS onto permission keys ─────────────
-- 2026-07-21 (applied via MCP as `hr_leave_rls_permission_retrofit`)
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHY
-- ════════════════════════════════════════════════════════════════════════════
-- All 25 policies across the six hr_leave_* tables gated on
-- auth_hr_organization_id(), which reads user_hr_access — a table holding
-- 1 row for 844 staff. For everyone else it returns NULL, and `col = NULL` is
-- NULL rather than TRUE, so RLS denied every read and every write. That is the
-- root cause of hr_leave_applications sitting at 0 rows: balances were
-- invisible, the apply form builds its leave-type dropdown FROM balances, so
-- the dropdown was empty, so the Submit button never enabled — silently, since
-- RLS returns zero rows rather than an error.
--
-- Those policies also hardcoded the role strings 'hr_officer' / 'hr_director',
-- which appear in ZERO user_hr_access rows (the single row says 'hr_admin'),
-- and CLAUDE.md prohibits gating on role names in SQL. Meanwhile the
-- hr.leave.* permission keys were catalogued and granted but consulted by
-- nothing: zero hr_leave_* policies called user_has_permission().
--
-- This migration replaces tenancy-by-user_hr_access with the app's actual RBAC
-- model: permission keys + institution scope + self scope.
--
-- NOT backfilling user_hr_access instead: it would need role strings the
-- policies don't recognise, auth_hr_organization_id()'s `LIMIT 1` cannot
-- express a multi-org user, and — critically — 26 OTHER policies across the HR
-- module are `cmd = ALL` gated on that same function. Populating that table
-- would hand every employee WRITE access to their institution's pay scales,
-- allowances and designations, plus user_hr_access itself (i.e. the ability to
-- self-grant access to any org). Those 26 are logged as a separate finding;
-- this migration deliberately routes around them and leaves them dormant.
--
-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY FIXES FOLDED IN (Phase 0c) — these MUST land with the above
-- ════════════════════════════════════════════════════════════════════════════
-- The old tenancy gate was the ONLY thing preventing three live holes. Fixing
-- tenancy without these would open them:
--
--   1. SELF-APPROVAL. hla_update's USING permitted
--      `employee_id IN (SELECT id FROM staff WHERE profile_id = auth.uid())`
--      with with_check = NULL, and the service never verified the caller was
--      the designated approver. An employee could POST to
--      /api/hr/leave/applications/{own-id}/approve and approve themselves.
--      Fixed here by a WITH CHECK that forbids an applicant without
--      hr.leave.approve from landing the row in 'approved'/'rejected'. The
--      applicant retains UPDATE for withdraw/cancel only. The matching
--      approver-identity check in the service layer is defence in depth — this
--      policy is the backstop that holds even if the service is bypassed.
--
--   2. BALANCE IDOR. hlb_select was org-scoped, so with tenancy working, any
--      staff member could read a colleague's entitlements (the API takes
--      employee_id from the query string). Now: your own balances always;
--      everyone else's only with hr.leave.approve. Note this deliberately does
--      NOT key off hr.leave.balance.view — that key is about to be granted to
--      all 61 staff-bearing roles, so scoping "others" to it would re-open the
--      IDOR the moment Phase 1 lands.
--
--   3. hla_calendar DROPPED. It was a second permissive SELECT policy reading
--      `is_super_admin() OR hr_organization_id = auth_hr_organization_id()`.
--      Postgres ORs permissive policies together, so it defeated the narrow
--      hla_select entirely — every user in the org could read every leave row,
--      including reason text and medical leave type. Calendar needs dates and
--      names, not reasons; expose that through a view later if required.
--
-- ════════════════════════════════════════════════════════════════════════════
-- PERFORMANCE
-- ════════════════════════════════════════════════════════════════════════════
-- fn_my_hr_organization_ids() returns uuid[] and every policy consumes it as
-- `IN (SELECT unnest(...))`, NOT `= ANY(...)`. With `= ANY(fn())` Postgres may
-- re-evaluate the function per row and blow the statement timeout (57014) on
-- large scans — the pattern this repo has hit before. The unnest-subquery form
-- forces a single evaluation.

-- ════════════════════════════════════════════════════════════════════════════
-- Scoping primitive
-- ════════════════════════════════════════════════════════════════════════════
-- The set of HR organizations the caller may act within:
--   (a) orgs whose institution their ROLES grant access to, and
--   (b) the org of their own staff record — so an ordinary employee with no
--       institution-scoped role still reaches their own leave data.
-- SECURITY DEFINER because hr_organizations' own RLS is still gated on the
-- broken auth_hr_organization_id(). Self-authorizing: no arguments, everything
-- pinned to auth.uid().
CREATE OR REPLACE FUNCTION public.fn_my_hr_organization_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(DISTINCT o.id), ARRAY[]::uuid[])
  FROM public.hr_organizations o
  WHERE public.role_has_institution_access(o.institution_id)
     OR o.institution_id IN (
          SELECT s.institution_id FROM public.staff s
          WHERE s.profile_id = auth.uid() AND s.is_active
        );
$$;

REVOKE ALL ON FUNCTION public.fn_my_hr_organization_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_my_hr_organization_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_my_hr_organization_ids() TO authenticated;

-- The caller's own staff row ids (normally one). Used for self-scoping.
CREATE OR REPLACE FUNCTION public.fn_my_staff_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[])
  FROM public.staff s
  WHERE s.profile_id = auth.uid() AND s.is_active;
$$;

REVOKE ALL ON FUNCTION public.fn_my_staff_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_my_staff_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_my_staff_ids() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- hr_leave_applications
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS hla_select   ON public.hr_leave_applications;
DROP POLICY IF EXISTS hla_calendar ON public.hr_leave_applications;  -- see (3)
DROP POLICY IF EXISTS hla_insert   ON public.hr_leave_applications;
DROP POLICY IF EXISTS hla_update   ON public.hr_leave_applications;
DROP POLICY IF EXISTS hla_delete   ON public.hr_leave_applications;

CREATE POLICY hla_select ON public.hr_leave_applications
  FOR SELECT USING (
    is_super_admin()
    OR employee_id IN (SELECT unnest(fn_my_staff_ids()))
    OR applied_by = auth.uid()
    OR final_approver_id = auth.uid()
    OR (
      user_has_permission('hr.leave.approve')
      AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids()))
    )
    OR (
      user_has_permission('hr.leave.view')
      AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids()))
    )
  );

CREATE POLICY hla_insert ON public.hr_leave_applications
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR (
      user_has_permission('hr.leave.apply')
      AND employee_id IN (SELECT unnest(fn_my_staff_ids()))
      AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids()))
    )
  );

-- USING decides which rows are updatable; WITH CHECK constrains the result.
-- The applicant keeps UPDATE (withdraw/cancel) but CANNOT land the row in an
-- approved/rejected state without holding hr.leave.approve. That is the RLS
-- half of the self-approval fix.
CREATE POLICY hla_update ON public.hr_leave_applications
  FOR UPDATE
  USING (
    is_super_admin()
    OR employee_id IN (SELECT unnest(fn_my_staff_ids()))
    OR (
      user_has_permission('hr.leave.approve')
      AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids()))
    )
  )
  WITH CHECK (
    is_super_admin()
    OR status NOT IN ('approved', 'rejected')
    OR (
      user_has_permission('hr.leave.approve')
      AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids()))
    )
  );

CREATE POLICY hla_delete ON public.hr_leave_applications
  FOR DELETE USING (is_super_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- hr_leave_balances — own always; others require hr.leave.approve
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS hlb_select ON public.hr_leave_balances;
DROP POLICY IF EXISTS hlb_insert ON public.hr_leave_balances;
DROP POLICY IF EXISTS hlb_update ON public.hr_leave_balances;
DROP POLICY IF EXISTS hlb_delete ON public.hr_leave_balances;

CREATE POLICY hlb_select ON public.hr_leave_balances
  FOR SELECT USING (
    is_super_admin()
    OR employee_id IN (SELECT unnest(fn_my_staff_ids()))
    OR (
      user_has_permission('hr.leave.approve')
      AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids()))
    )
  );

CREATE POLICY hlb_write ON public.hr_leave_balances
  FOR ALL
  USING (
    is_super_admin()
    OR (
      user_has_permission('hr.leave.policies.write')
      AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids()))
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      user_has_permission('hr.leave.policies.write')
      AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids()))
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- hr_leave_blackouts / hr_leave_type_entitlements — org-readable config,
-- HR-writable. Staff must read these: the apply flow validates against
-- blackout windows and entitlements.
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS hlbo_select ON public.hr_leave_blackouts;
DROP POLICY IF EXISTS hlbo_insert ON public.hr_leave_blackouts;
DROP POLICY IF EXISTS hlbo_update ON public.hr_leave_blackouts;
DROP POLICY IF EXISTS hlbo_delete ON public.hr_leave_blackouts;

CREATE POLICY hlbo_select ON public.hr_leave_blackouts
  FOR SELECT USING (
    is_super_admin()
    OR hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids()))
  );

CREATE POLICY hlbo_write ON public.hr_leave_blackouts
  FOR ALL
  USING (
    is_super_admin()
    OR (user_has_permission('hr.leave.policies.write')
        AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))
  )
  WITH CHECK (
    is_super_admin()
    OR (user_has_permission('hr.leave.policies.write')
        AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))
  );

DROP POLICY IF EXISTS hlte_select ON public.hr_leave_type_entitlements;
DROP POLICY IF EXISTS hlte_insert ON public.hr_leave_type_entitlements;
DROP POLICY IF EXISTS hlte_update ON public.hr_leave_type_entitlements;
DROP POLICY IF EXISTS hlte_delete ON public.hr_leave_type_entitlements;

CREATE POLICY hlte_select ON public.hr_leave_type_entitlements
  FOR SELECT USING (
    is_super_admin()
    OR hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids()))
  );

CREATE POLICY hlte_write ON public.hr_leave_type_entitlements
  FOR ALL
  USING (
    is_super_admin()
    OR (user_has_permission('hr.leave.policies.write')
        AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))
  )
  WITH CHECK (
    is_super_admin()
    OR (user_has_permission('hr.leave.policies.write')
        AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))
  );

-- ════════════════════════════════════════════════════════════════════════════
-- hr_leave_encashments — own request; approval needs the encashment key
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS hlen_select ON public.hr_leave_encashments;
DROP POLICY IF EXISTS hlen_insert ON public.hr_leave_encashments;
DROP POLICY IF EXISTS hlen_update ON public.hr_leave_encashments;
DROP POLICY IF EXISTS hlen_delete ON public.hr_leave_encashments;

CREATE POLICY hlen_select ON public.hr_leave_encashments
  FOR SELECT USING (
    is_super_admin()
    OR employee_id IN (SELECT unnest(fn_my_staff_ids()))
    OR (user_has_permission('hr.leave.encashment.approve')
        AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))
  );

CREATE POLICY hlen_insert ON public.hr_leave_encashments
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR (user_has_permission('hr.leave.encashment.view')
        AND employee_id IN (SELECT unnest(fn_my_staff_ids()))
        AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))
  );

CREATE POLICY hlen_update ON public.hr_leave_encashments
  FOR UPDATE
  USING (
    is_super_admin()
    OR (user_has_permission('hr.leave.encashment.approve')
        AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))
  )
  WITH CHECK (
    is_super_admin()
    OR (user_has_permission('hr.leave.encashment.approve')
        AND hr_organization_id IN (SELECT unnest(fn_my_hr_organization_ids())))
  );

CREATE POLICY hlen_delete ON public.hr_leave_encashments
  FOR DELETE USING (is_super_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- hr_leave_application_comments — visible iff the parent application is.
-- The subquery re-applies hr_leave_applications' RLS, so this inherits that
-- policy's scoping rather than duplicating it. No recursion risk: the
-- applications policies do not reference comments.
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS hlac_select ON public.hr_leave_application_comments;
DROP POLICY IF EXISTS hlac_insert ON public.hr_leave_application_comments;
DROP POLICY IF EXISTS hlac_update ON public.hr_leave_application_comments;
DROP POLICY IF EXISTS hlac_delete ON public.hr_leave_application_comments;

CREATE POLICY hlac_select ON public.hr_leave_application_comments
  FOR SELECT USING (
    is_super_admin()
    OR application_id IN (SELECT id FROM public.hr_leave_applications)
  );

CREATE POLICY hlac_insert ON public.hr_leave_application_comments
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR (commenter_id = auth.uid()
        AND application_id IN (SELECT id FROM public.hr_leave_applications))
  );

CREATE POLICY hlac_update ON public.hr_leave_application_comments
  FOR UPDATE
  USING (is_super_admin() OR commenter_id = auth.uid())
  WITH CHECK (is_super_admin() OR commenter_id = auth.uid());

CREATE POLICY hlac_delete ON public.hr_leave_application_comments
  FOR DELETE USING (is_super_admin() OR commenter_id = auth.uid());
