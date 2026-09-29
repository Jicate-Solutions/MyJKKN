-- ============================================================================
-- Migration: 20270506090000_hr_pay_policies_readable_only_with_salary_view
-- Created:   2026-09-29 (round 2 after the W12 blind review, same day)
-- TIER:      POLICY TIGHTENING (reads and writes) + two CREATE OR REPLACE + one new read RPC
-- STATUS:    FILE ONLY. Draft PR #4111. Rehearsed on a throwaway PostgreSQL 16;
--            never applied anywhere else. Waits for the Director's number.
-- ============================================================================
--
-- WHY
--   Every college's pay matrix (`hr.pay_scales`) and allowance amounts
--   (`hr.allowances_and_increments`) live as rows in platform_policies. That
--   table's SELECT policy is `auth.uid() IS NOT NULL`
--   (20260429000002_platform_policies_substrate.sql), so ANY signed-in account,
--   a learner included, can read both with the public anon key:
--       supabase.from('platform_policies').select('*').eq('policy_key','hr.pay_scales')
--   Two more read paths hand out the same figures:
--     * fn_get_policy (SECURITY DEFINER, EXECUTE to authenticated) returns any
--       key's value, bypassing RLS. fn_get_policy_json / _int / _text / _bool
--       all read through it, so they leak the same way.
--     * hr_policy_audit_log keeps old_value / new_value of edited policies, and
--       its SELECT policy shows every global-scope row and every own-college row
--       to any signed-in account.
--   Raised by the reviews of PR #4080 and PR #4103.
--   A third pay key is locked the same way: `hr.salary_suggestion_rule`, the
--   per-college rupee amount per year of experience that the salary suggestion
--   feature (a sibling PR) adds. It is not served by /api/hr/compensation-policies;
--   the suggestion feature reads it through its own gated route.
--
-- THE RULE (one rule, applied in every place below)
--   A pay row is readable by
--     * a super admin or an admin (is_super_admin() OR is_admin()), any row; or
--     * a holder of hr.payroll.salary.view, ONLY for a college row
--       (scope_type = 'institution', scope_id NOT NULL) of a college they can
--       access: role_has_institution_access(scope_id), evaluated as the caller.
--   GROUP-WIDE ROWS (scope_id NULL, e.g. a 'global' default) are admin-only.
--   Same call as PR #4103's hr_pay_band_policies(), which excludes NULL-scope
--   rows because role_has_institution_access(NULL) returns true ("system-wide")
--   and a key holder scoped to one college must not read a group-wide figure
--   through it. No NULL-scope pay row exists in the repo today (the seeds and
--   #4080's Arts & Science row are all scope_type 'institution').
--
-- WHAT CHANGES
--   1. platform_policies: a RESTRICTIVE select policy with THE RULE for the three
--      pay keys (hr.pay_scales, hr.allowances_and_increments,
--      hr.salary_suggestion_rule). Restrictive policies are ANDed with every permissive one, so no
--      existing permissive policy can reopen these rows.
--   2. hr_policy_audit_log: the same restrictive policy on its own
--      policy_key / scope_type / scope_id columns.
--   3. fn_get_policy: for the three pay keys, a SIGNED-IN caller who is not an
--      admin must hold the key AND pass a college they can access as
--      p_scope_id; they then get that college's own row only (no fallback to a
--      group-wide row). Anyone else signed in gets SQLSTATE 42501 and a plain
--      message. Callers with no signed-in user (service role, cron, migrations)
--      are unaffected: anon has no EXECUTE on it (20260731200000), so a NULL
--      auth.uid() here means a trusted server-side caller. The function moves
--      from LANGUAGE sql to plpgsql only so it can RAISE and branch; its main
--      SELECT is byte-identical to 20260731180000 (the newest body in the repo).
--      A refusal is loud on purpose (rule #27): returning NULL would make
--      fn_get_policy_json quietly hand back its default instead.
--   4. fn_prepare_payroll_period (only definition: 20260629000000): the pay
--      matrix snapshot is read DIRECTLY, as the function's owner, instead of
--      through fn_get_policy. It admits hr_officer / hr_admin / hr_manager /
--      director by role name, and since 20260821230000 none of them holds
--      hr.payroll.salary.view, so going through the gated fn_get_policy would
--      refuse every non-admin preparer. The direct read is fn_get_policy's own
--      SELECT with p_key = 'hr.pay_scales' and p_scope_id =
--      v_period.institution_id substituted, so the snapshot is exactly what it
--      is today. Everything else in the body is byte-identical except the
--      role-check line below (both pinned by a test). Director's decision,
--      option (a), W12 review 2026-09-29.
--      SECOND CHANGED LINE — the role check. The guard was `IF NOT
--      (is_super_admin() OR is_admin() OR v_caller_role IN (...))`. For a
--      caller with no staff row v_caller_role is NULL, the IN is NULL, NOT NULL
--      is NULL, and the RAISE was skipped: the rehearsal had a learner prepare a
--      draft period and receive the pay_matrix_snapshot. The check is now
--      `(v_caller_role IS NOT NULL AND v_caller_role IN (...))`, the form
--      fn_advance_payroll_period and fn_reject_payroll_period already use, so
--      NULL means refused. The hole exists on main
--      today and is closed on its own by fix/hr-payroll-prepare-refuses-non-staff;
--      the SAME line is carried here so whichever PR is applied second does not
--      revert the other.
--      Every other SECURITY DEFINER function in supabase/migrations was
--      searched for these keys: fn_prepare_payroll_period is the ONLY one
--      that reads them (the deduction keys it also reads are not pay keys and
--      still go through fn_get_policy, unchanged).
--   5. hr_compensation_policies(p_key): the read the Pay Scales, Allowances and
--      Motivation Fund editors now use, through GET /api/hr/compensation-policies.
--      One row per college the caller can access (THE RULE's scoping), with
--      that college's row or NULLs. The route never takes the college list from
--      the request; it only picks one college out of what this returns.
--   6. platform_policies WRITES (added 2026-09-29, round 3 after the W12 blind
--      review): three RESTRICTIVE policies, one each for INSERT, UPDATE and
--      DELETE, let a row whose policy_key is one of the four compensation keys
--      (hr.pay_scales, hr.allowances_and_increments, hr.salary_suggestion_rule,
--      hr.motivation_fund) be written ONLY by is_super_admin(). Before this,
--      platform_policies_insert / _update / _delete were `is_super_admin() OR
--      is_admin()` and "Admins can update platform_policies" (20260525200000)
--      admits role 'principal' or 'admin', so an admin, administrator or
--      principal could change the pay matrix straight through PostgREST with
--      their own session. That skipped the super-admin-only editor pages and
--      the hr_policy_audit_log row, which the app writes, not a trigger. A
--      DELETE was worse: hr_policy_audit_log.policy_id is ON DELETE CASCADE, so
--      deleting a pay row also erased its audit history.
--      Same shape as 20260727060000 (exam eligibility): the key test sits in
--      BOTH USING and WITH CHECK, so an admin can neither edit a pay row nor
--      rename another row INTO a pay key. It is RESTRICTIVE rather than a
--      rewrite of platform_policies_update because four permissive write
--      policies exist (the generic three, the role-name one above, and the
--      per-key social / School of Influence ones); a restrictive policy is
--      ANDed with all of them, so none can reopen the pay rows.
--      TO authenticated, anon only: the service role is not named, and it has
--      BYPASSRLS on Supabase anyway, so server-side jobs and migrations write as
--      before.
--
-- WHAT DOES NOT CHANGE
--   * Every other policy_key: the restrictive policy's first arm is
--     `policy_key NOT IN (...)`, so for them it is always true and today's
--     permissive policies decide exactly as before. fn_get_policy checks the key
--     first and never calls the permission helpers for any other key.
--   * Writes to every other key. The write policies' first arm is
--     `policy_key NOT IN (...)`, so for any other key they are always true and
--     the existing permissive write policies decide exactly as before. No
--     existing policy is dropped, renamed or altered. The Pay Scales,
--     Allowances and Motivation Fund editors are super-admin-only pages
--     (SuperAdminOnly) and keep saving from the browser.
--   * Grants: restated below so re-applying this file cannot widen them.
--   * hr.motivation_fund, hr.payroll.tds_slabs / pf_rate / esi_rate /
--     professional_tax / standard_deduction / formula / component_definitions:
--     statutory rates and structure, no one's pay. Left readable as today.
--
-- WHO NOTICES
--   * A signed-in account without the key (and not admin): the pay rows
--     disappear from table reads; fn_get_policy on those keys raises 42501.
--   * A key holder scoped to their own college: other colleges' pay rows
--     disappear; fn_get_policy on another college raises 42501.
--   * A principal editing these two rows under "Admins can update
--     platform_policies" (role-name policy, 20260525200000) would no longer see
--     them unless holding the key. The same holds for the salary suggestion rule's
--     rows once that PR adds them. The editors are super-admin-only pages.
--   * An admin, administrator or principal who is not a super admin can no
--     longer INSERT, UPDATE or DELETE a compensation-key row. A refused UPDATE
--     or DELETE through PostgREST affects 0 rows with no error; a refused
--     INSERT (or an UPDATE that renames a row into a pay key) fails with 42501.
--
-- BEFORE APPLYING: diff the live bodies,
--   SELECT pg_get_functiondef('public.fn_get_policy(text,uuid)'::regprocedure);
--   SELECT pg_get_functiondef('public.fn_prepare_payroll_period(uuid,text)'::regprocedure);
--   against this file. Production has had live-only fixes before; if a live body
--   differs, carry the difference into this file first rather than reverting it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. platform_policies — pay rows need the salary key and the college
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS platform_policies_pay_keys_restricted ON public.platform_policies;
CREATE POLICY platform_policies_pay_keys_restricted ON public.platform_policies
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (
    policy_key NOT IN ('hr.pay_scales', 'hr.allowances_and_increments', 'hr.salary_suggestion_rule')
    OR (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      scope_type = 'institution'
      AND scope_id IS NOT NULL
      AND (SELECT public.user_has_permission('hr.payroll.salary.view'))
      AND public.role_has_institution_access(scope_id)
    )
  );

COMMENT ON POLICY platform_policies_pay_keys_restricted ON public.platform_policies IS
  'Pay rows (hr.pay_scales, hr.allowances_and_increments, hr.salary_suggestion_rule): admins any row; '
  'hr.payroll.salary.view holders only college rows of colleges they can access; '
  'group-wide (NULL scope) rows admin-only. RESTRICTIVE: ANDed with every '
  'permissive SELECT policy. Other keys unaffected. Migration 20270506090000.';

-- ----------------------------------------------------------------------------
-- 2. hr_policy_audit_log — the same figures as old_value / new_value
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_policy_audit_log_pay_keys_restricted ON public.hr_policy_audit_log;
CREATE POLICY hr_policy_audit_log_pay_keys_restricted ON public.hr_policy_audit_log
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (
    policy_key NOT IN ('hr.pay_scales', 'hr.allowances_and_increments', 'hr.salary_suggestion_rule')
    OR (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (
      scope_type = 'institution'
      AND scope_id IS NOT NULL
      AND (SELECT public.user_has_permission('hr.payroll.salary.view'))
      AND public.role_has_institution_access(scope_id)
    )
  );

COMMENT ON POLICY hr_policy_audit_log_pay_keys_restricted ON public.hr_policy_audit_log IS
  'Audit rows of the pay keys carry the pay figures; same rule as '
  'platform_policies_pay_keys_restricted. Migration 20270506090000.';

-- ----------------------------------------------------------------------------
-- 3. fn_get_policy — the pay keys follow THE RULE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_policy(p_key text, p_scope_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Added 2026-09-29 (20270506090000): pay keys follow the pay-row rule.
  -- The key is tested first so no other key pays for the permission lookup.
  IF p_key IN ('hr.pay_scales', 'hr.allowances_and_increments', 'hr.salary_suggestion_rule') THEN
    IF auth.uid() IS NOT NULL
       AND NOT (public.is_super_admin() OR public.is_admin())
    THEN
      IF NOT public.user_has_permission('hr.payroll.salary.view')
         OR p_scope_id IS NULL
         OR NOT public.role_has_institution_access(p_scope_id)
      THEN
        RAISE EXCEPTION 'You do not have access to the pay policy % for this college (it needs hr.payroll.salary.view and access to the college).', p_key
          USING ERRCODE = '42501';
      END IF;
      -- A key holder reads their college's own row only: group-wide pay rows
      -- stay admin-only, exactly as in the table rule.
      RETURN (
        SELECT pp.value FROM platform_policies pp
        WHERE pp.policy_key = p_key AND pp.is_active = true
          AND pp.scope_type = 'institution' AND pp.scope_id = p_scope_id
        LIMIT 1
      );
    END IF;
  END IF;

  RETURN (
  SELECT value FROM platform_policies
  WHERE policy_key = p_key AND is_active = true
    AND (
      (scope_type='institution' AND scope_id=p_scope_id)
      OR (scope_type='global' AND scope_id IS NULL)
      OR (scope_type='role' AND scope_id IN (
            SELECT cr.id FROM custom_roles cr WHERE EXISTS (
              SELECT 1 FROM user_roles ur JOIN profiles p ON p.id=ur.user_id
              WHERE ur.role_id=cr.id AND p.id=auth.uid()
            )
          ))
      OR (scope_type='user' AND scope_id=auth.uid())
      -- cohort scope: the caller passes the batch's cohorts.id as p_scope_id.
      OR (scope_type='cohort' AND scope_id=p_scope_id)
      -- ...falling back to the programme-wide cohort default.
      OR (scope_type='cohort' AND scope_id IS NULL)
    )
  ORDER BY
    CASE
      WHEN scope_type = 'user'                                  THEN 1
      WHEN scope_type = 'cohort' AND scope_id IS NOT NULL        THEN 2
      WHEN scope_type = 'institution'                            THEN 3
      WHEN scope_type = 'role'                                   THEN 4
      WHEN scope_type = 'cohort' AND scope_id IS NULL            THEN 5
      WHEN scope_type = 'global'                                 THEN 6
      ELSE 99
    END
  LIMIT 1
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_get_policy(text, uuid) IS
  'Config lookup. NOT reachable by anon — it can return any platform_policies '
  'value, including the Meta webhook verify tokens, which leaked twice through '
  'this path (2026-07-30 and 2026-07-31). The two unauthenticated webhook routes '
  'that read policy values use service-role clients and are unaffected. Do not '
  're-grant anon without re-reading migration 20260731200000. '
  'Pay keys (hr.pay_scales, hr.allowances_and_increments, hr.salary_suggestion_rule): a signed-in non-admin '
  'needs hr.payroll.salary.view and access to the college passed as p_scope_id, '
  'and gets that college''s row only; otherwise 42501 — migration 20270506090000.';

REVOKE EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_policy(text, uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. fn_prepare_payroll_period — read the pay matrix as the owner, not through
--    the gated fn_get_policy. Body is 20260629000000's, byte for byte, except
--    the assignment of v_pay_matrix and the role-check line (NULL = refused).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_prepare_payroll_period(
  p_period_id uuid,
  p_comment text DEFAULT NULL
)
RETURNS public.hr_payroll_periods
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_period public.hr_payroll_periods;
  v_caller_role text;
  v_pay_matrix jsonb;
  v_dedn jsonb;
  v_period_start date;
  v_period_end date;
  v_total_days int;
  v_working_days int;
BEGIN
  -- Load period (row-lock for the transaction)
  SELECT * INTO v_period
  FROM public.hr_payroll_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll period not found: %', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Status guard: must be 'draft'
  IF v_period.status <> 'draft' THEN
    RAISE EXCEPTION 'Payroll period % is in status %, expected draft for fn_prepare_payroll_period',
      p_period_id, v_period.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Role guard
  v_caller_role := public.fn_get_caller_role_key();

  IF NOT (
    public.is_super_admin()
    OR public.is_admin()
    OR (v_caller_role IS NOT NULL AND v_caller_role IN ('hr_officer','hr_admin','hr_manager','director'))
  ) THEN
    RAISE EXCEPTION 'Caller role % not authorized to prepare a payroll period (need hr_officer/hr_admin/hr_manager/director/admin)',
      COALESCE(v_caller_role, '<none>')
      USING ERRCODE = '42501';
  END IF;

  -- Snapshot pay matrix from platform_policies (global scope; per-institution
  -- override resolves via fn_get_policy's resolution priority)
  -- Updated 2026-09-29: read directly as the function's owner, not through
  -- fn_get_policy, whose pay-key gate (PR #4111) would refuse the role-name
  -- preparers. Same SELECT as fn_get_policy, key and scope substituted.
  v_pay_matrix := (
  SELECT value FROM platform_policies
  WHERE policy_key = 'hr.pay_scales' AND is_active = true
    AND (
      (scope_type='institution' AND scope_id=v_period.institution_id)
      OR (scope_type='global' AND scope_id IS NULL)
      OR (scope_type='role' AND scope_id IN (
            SELECT cr.id FROM custom_roles cr WHERE EXISTS (
              SELECT 1 FROM user_roles ur JOIN profiles p ON p.id=ur.user_id
              WHERE ur.role_id=cr.id AND p.id=auth.uid()
            )
          ))
      OR (scope_type='user' AND scope_id=auth.uid())
      -- cohort scope: the caller passes the batch's cohorts.id as p_scope_id.
      OR (scope_type='cohort' AND scope_id=v_period.institution_id)
      -- ...falling back to the programme-wide cohort default.
      OR (scope_type='cohort' AND scope_id IS NULL)
    )
  ORDER BY
    CASE
      WHEN scope_type = 'user'                                  THEN 1
      WHEN scope_type = 'cohort' AND scope_id IS NOT NULL        THEN 2
      WHEN scope_type = 'institution'                            THEN 3
      WHEN scope_type = 'role'                                   THEN 4
      WHEN scope_type = 'cohort' AND scope_id IS NULL            THEN 5
      WHEN scope_type = 'global'                                 THEN 6
      ELSE 99
    END
  LIMIT 1
  );

  -- Snapshot deduction rates (5 policy keys nested into one jsonb)
  v_dedn := jsonb_build_object(
    'tds_slabs',          public.fn_get_policy('hr.payroll.tds_slabs',          v_period.institution_id),
    'pf_rate',            public.fn_get_policy('hr.payroll.pf_rate',            v_period.institution_id),
    'esi_rate',           public.fn_get_policy('hr.payroll.esi_rate',           v_period.institution_id),
    'professional_tax',   public.fn_get_policy('hr.payroll.professional_tax',   v_period.institution_id),
    'standard_deduction', public.fn_get_policy('hr.payroll.standard_deduction', v_period.institution_id)
  );

  -- Compute period bounds
  v_period_start := make_date(v_period.period_year, v_period.period_month, 1);
  v_period_end := (v_period_start + interval '1 month - 1 day')::date;
  v_total_days := (v_period_end - v_period_start) + 1;

  -- Working days = total calendar days
  --                MINUS Sundays in the range
  --                MINUS approved institution holidays (institution_leaves) that fall in-range
  WITH all_days AS (
    SELECT generate_series(v_period_start, v_period_end, interval '1 day')::date AS d
  ),
  non_sundays AS (
    SELECT d FROM all_days WHERE extract(dow from d) <> 0  -- Sunday = 0
  ),
  holidays_in_range AS (
    -- institution_leaves rows scoped to this institution + approved + overlapping the period
    SELECT DISTINCT d
    FROM non_sundays
    WHERE EXISTS (
      SELECT 1 FROM public.institution_leaves il
      WHERE il.institution_id = v_period.institution_id
        AND il.status = 'approved'
        AND il.scope_level = 'institution'  -- only institution-wide holidays subtract
        AND non_sundays.d BETWEEN il.start_date AND il.end_date
    )
  )
  SELECT (SELECT count(*) FROM non_sundays) - (SELECT count(*) FROM holidays_in_range)
  INTO v_working_days;

  -- Defensive floor: at least 1 working day so divisor never zero
  v_working_days := GREATEST(v_working_days, 1);

  -- Update period
  UPDATE public.hr_payroll_periods
  SET
    status = 'prepared',
    prepared_at = now(),
    prepared_by = auth.uid(),
    pay_matrix_snapshot = v_pay_matrix,
    deduction_rates_snapshot = v_dedn,
    working_days_count = v_working_days,
    total_calendar_days = v_total_days
  WHERE id = p_period_id
  RETURNING * INTO v_period;

  -- Audit row
  INSERT INTO public.hr_payroll_period_approvals (period_id, stage, approver_id, comment)
  VALUES (p_period_id, 'prepared', auth.uid(), p_comment);

  RETURN v_period;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_prepare_payroll_period(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_prepare_payroll_period(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. hr_compensation_policies — the editors' read, scoped per college
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER so it can list colleges and rows whatever their own RLS says,
-- but every decision is taken on auth.uid() — the caller's JWT subject — via
-- is_super_admin(), is_admin(), user_has_permission() and
-- role_has_institution_access(). Raises rather than returning [] when the key
-- is missing, so an empty result never means "not allowed".
CREATE OR REPLACE FUNCTION public.hr_compensation_policies(p_key text)
RETURNS TABLE(
  institution_id  uuid,
  has_row         boolean,
  policy_value    jsonb,
  description     text,
  updated_at      timestamptz,
  updated_by      uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean;
BEGIN
  IF p_key IS NULL
     OR p_key NOT IN ('hr.pay_scales', 'hr.allowances_and_increments', 'hr.motivation_fund')
  THEN
    RAISE EXCEPTION 'Not a compensation policy key: %', p_key
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_admin := public.is_super_admin() OR public.is_admin();
  IF NOT (v_admin OR public.user_has_permission('hr.payroll.salary.view')) THEN
    RAISE EXCEPTION 'hr.payroll.salary.view is required to see compensation policies.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT i.id,
         pp.id IS NOT NULL,
         pp.value,
         pp.description,
         pp.updated_at,
         pp.updated_by
    FROM public.institutions i
    LEFT JOIN public.platform_policies pp
      ON pp.policy_key = p_key
     AND pp.scope_type = 'institution'
     AND pp.scope_id = i.id
   WHERE v_admin OR public.role_has_institution_access(i.id)
   ORDER BY i.id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_compensation_policies(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_compensation_policies(text) TO authenticated;

COMMENT ON FUNCTION public.hr_compensation_policies(text) IS
  'One row per college the caller can access, with that college''s '
  'hr.pay_scales / hr.allowances_and_increments / hr.motivation_fund row or NULLs. '
  'Gated on admin or hr.payroll.salary.view; scoped by role_has_institution_access '
  'for non-admins. Read by GET /api/hr/compensation-policies. Migration 20270506090000.';

-- ----------------------------------------------------------------------------
-- 6. platform_policies writes — the compensation keys are super-admin only
-- ----------------------------------------------------------------------------
-- Added 2026-09-29 (round 3, W12 blind review). RESTRICTIVE: ANDed with every
-- permissive write policy. Every other key passes the first arm unchanged.
DROP POLICY IF EXISTS platform_policies_pay_keys_insert_super_admin_only ON public.platform_policies;
CREATE POLICY platform_policies_pay_keys_insert_super_admin_only ON public.platform_policies
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (
    policy_key NOT IN ('hr.pay_scales', 'hr.allowances_and_increments', 'hr.salary_suggestion_rule', 'hr.motivation_fund')
    OR (SELECT public.is_super_admin())
  );

DROP POLICY IF EXISTS platform_policies_pay_keys_update_super_admin_only ON public.platform_policies;
CREATE POLICY platform_policies_pay_keys_update_super_admin_only ON public.platform_policies
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated, anon
  USING (
    policy_key NOT IN ('hr.pay_scales', 'hr.allowances_and_increments', 'hr.salary_suggestion_rule', 'hr.motivation_fund')
    OR (SELECT public.is_super_admin())
  )
  WITH CHECK (
    policy_key NOT IN ('hr.pay_scales', 'hr.allowances_and_increments', 'hr.salary_suggestion_rule', 'hr.motivation_fund')
    OR (SELECT public.is_super_admin())
  );

DROP POLICY IF EXISTS platform_policies_pay_keys_delete_super_admin_only ON public.platform_policies;
CREATE POLICY platform_policies_pay_keys_delete_super_admin_only ON public.platform_policies
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated, anon
  USING (
    policy_key NOT IN ('hr.pay_scales', 'hr.allowances_and_increments', 'hr.salary_suggestion_rule', 'hr.motivation_fund')
    OR (SELECT public.is_super_admin())
  );

COMMENT ON POLICY platform_policies_pay_keys_insert_super_admin_only ON public.platform_policies IS
  'Compensation keys (hr.pay_scales, hr.allowances_and_increments, hr.salary_suggestion_rule, '
  'hr.motivation_fund) are inserted by a super admin only. RESTRICTIVE. Migration 20270506090000.';
COMMENT ON POLICY platform_policies_pay_keys_update_super_admin_only ON public.platform_policies IS
  'Compensation keys are updated by a super admin only; USING and WITH CHECK both carry the key '
  'test so no row can be renamed into a pay key. RESTRICTIVE. Migration 20270506090000.';
COMMENT ON POLICY platform_policies_pay_keys_delete_super_admin_only ON public.platform_policies IS
  'Compensation keys are deleted by a super admin only (a delete cascades to hr_policy_audit_log). '
  'RESTRICTIVE. Migration 20270506090000.';

-- Apply-time check: all three write locks exist, are RESTRICTIVE, and name the
-- super-admin check. Fails the migration instead of leaving a silent gap.
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'platform_policies'
    AND policyname IN ('platform_policies_pay_keys_insert_super_admin_only',
                       'platform_policies_pay_keys_update_super_admin_only',
                       'platform_policies_pay_keys_delete_super_admin_only')
    AND permissive = 'RESTRICTIVE'
    AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%is_super_admin()%'
    AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%hr.motivation_fund%';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'ABORT: expected 3 restrictive pay-key write policies on platform_policies, found %', v_n;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
