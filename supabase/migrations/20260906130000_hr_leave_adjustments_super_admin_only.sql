-- ============================================================================
-- EVERY LEAVE-BALANCE ADJUSTMENT BECOMES SUPER-ADMIN ONLY (2026-09-06)
--
-- Until now the Adjust dialog applied a DIFFERENT key per lever:
--   set_used                    -> hr.leave.policies.write
--   set/clear_entitlement       -> hr.leave.balance.manage
--
-- Both are now super-admin only, by decision. These levers rewrite consumed
-- days and entitlements directly, with no application and no approval chain
-- behind them, and the figures feed payroll-adjacent reporting.
--
-- THIS IS A REMOVAL OF ACCESS, NOT A TIGHTENING OF AN UNUSED PATH. Note that
-- hr.leave.policies.write reaches further than a custom_roles count suggests:
-- user_has_permission also grants through the user_roles multi-role table and
-- through Director handovers, so roles such as hr_head held it. They no longer
-- do. Institution HR staff must now route corrections to a super administrator.
--
-- role_has_institution_access is KEPT below it. A permission check is never a
-- tenant boundary, and is_super_admin() short-circuits that function anyway --
-- leaving it in place means the ordering stays correct if the gate is ever
-- widened again.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hr_leave_balance_adjust(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_hr_academic_year_id uuid,
  p_action text,
  p_value numeric,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_org_id uuid;
  v_inst   uuid;
  v_old    jsonb;
  v_new    jsonb;
BEGIN
  IF p_action NOT IN ('set_used', 'set_entitlement', 'clear_entitlement') THEN
    RAISE EXCEPTION 'Unknown action %', p_action;
  END IF;

  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required for every balance adjustment';
  END IF;

  IF p_action <> 'clear_entitlement' AND (p_value IS NULL OR p_value < 0) THEN
    RAISE EXCEPTION 'A non-negative value is required for %', p_action;
  END IF;

  -- The gate. Checked before any lookup so a non-super-admin cannot use the
  -- error messages below to probe which employees or leave types exist.
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION
      'Insufficient permission: leave balance adjustments are restricted to super administrators';
  END IF;

  SELECT o.id, o.institution_id INTO v_org_id, v_inst
  FROM public.staff s
  JOIN public.hr_organizations o ON o.institution_id = s.institution_id
  WHERE s.id = p_employee_id AND s.is_active;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Unknown or inactive employee %', p_employee_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.hr_leave_types t
    WHERE t.id = p_leave_type_id AND t.hr_organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Leave type % does not belong to this employee''s organization',
      p_leave_type_id;
  END IF;

  IF NOT public.role_has_institution_access(v_inst) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to institution %', v_inst;
  END IF;

  SELECT jsonb_build_object(
           'entitled', b.entitled, 'used', b.used,
           'carried',  b.carried_forward, 'override', o.entitled_days)
    INTO v_old
  FROM (SELECT 1) dummy
  LEFT JOIN public.hr_leave_balances b
    ON b.employee_id = p_employee_id AND b.leave_type_id = p_leave_type_id
   AND b.hr_academic_year_id = p_hr_academic_year_id
  LEFT JOIN public.hr_leave_entitlement_overrides o
    ON o.employee_id = p_employee_id AND o.leave_type_id = p_leave_type_id
   AND o.hr_academic_year_id = p_hr_academic_year_id;

  IF p_action = 'set_used' THEN
    INSERT INTO public.hr_leave_balances (
      employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
      entitled, used, carried_forward)
    VALUES (p_employee_id, p_leave_type_id, p_hr_academic_year_id, v_org_id,
            NULL, p_value, 0)
    ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id)
    DO UPDATE SET used = EXCLUDED.used, updated_at = now();
    v_new := jsonb_build_object('used', p_value);

  ELSIF p_action = 'set_entitlement' THEN
    INSERT INTO public.hr_leave_entitlement_overrides (
      employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
      entitled_days, reason, created_by)
    VALUES (p_employee_id, p_leave_type_id, p_hr_academic_year_id, v_org_id,
            p_value, btrim(p_reason), auth.uid())
    ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id)
    DO UPDATE SET entitled_days = EXCLUDED.entitled_days,
                  reason        = EXCLUDED.reason,
                  updated_at    = now();
    v_new := jsonb_build_object('override', p_value);

  ELSE
    DELETE FROM public.hr_leave_entitlement_overrides
    WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id
      AND hr_academic_year_id = p_hr_academic_year_id;
    v_new := jsonb_build_object('override', NULL);
  END IF;

  INSERT INTO public.hr_leave_balance_adjustments (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    action, old_value, new_value, reason, adjusted_by)
  VALUES (p_employee_id, p_leave_type_id, p_hr_academic_year_id, v_org_id,
          p_action, v_old, v_new, btrim(p_reason), auth.uid());

  RETURN jsonb_build_object('ok', true, 'action', p_action,
                            'old', v_old, 'new', v_new);
END $function$;

COMMENT ON FUNCTION public.hr_leave_balance_adjust(uuid, uuid, uuid, text, numeric, text) IS
  'Correct one staff member''s used days or entitlement, with an audit row. SUPER-ADMIN ONLY as of 2026-09-06 -- previously hr.leave.policies.write for used and hr.leave.balance.manage for entitlement.';
