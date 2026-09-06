-- Staff-wise leave balances for /hr/admin/leave-balances, plus an audited
-- correction path.
--
-- WHY: the page stopped at the institution aggregate. There was no admin screen
-- anywhere showing an individual staff member's balance -- confirming the
-- June-2026 legacy backfill had to be done in raw SQL, and the same gap recurs
-- for every remaining institution export.

-- ── 1. Audit trail ──────────────────────────────────────────────────────────
-- hr_policy_audit_log cannot host these: its policy_id is NOT NULL and FK'd to
-- a policy row, and a balance adjustment has no policy.
CREATE TABLE IF NOT EXISTS public.hr_leave_balance_adjustments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type_id       uuid NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE CASCADE,
  hr_academic_year_id uuid NOT NULL REFERENCES public.hr_academic_years(id) ON DELETE CASCADE,
  hr_organization_id  uuid NOT NULL REFERENCES public.hr_organizations(id),
  action              text NOT NULL
                        CHECK (action IN ('set_used', 'set_entitlement', 'clear_entitlement')),
  old_value           jsonb,
  new_value           jsonb,
  -- Same shape as hr_leave_entitlement_overrides.reason: an adjustment with no
  -- stated reason is indistinguishable from a mistake six months later.
  reason              text NOT NULL CHECK (btrim(reason) <> ''),
  adjusted_by         uuid NOT NULL REFERENCES public.profiles(id),
  adjusted_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hlba_cell
  ON public.hr_leave_balance_adjustments (employee_id, leave_type_id, hr_academic_year_id);
CREATE INDEX IF NOT EXISTS idx_hlba_org_recent
  ON public.hr_leave_balance_adjustments (hr_organization_id, adjusted_at DESC);

ALTER TABLE public.hr_leave_balance_adjustments ENABLE ROW LEVEL SECURITY;

-- SELECT mirrors hleo_select. There is deliberately NO write policy: rows are
-- written only by hr_leave_balance_adjust() below, which is SECURITY DEFINER.
-- A client-writable audit trail is not an audit trail.
DROP POLICY IF EXISTS hlba_select ON public.hr_leave_balance_adjustments;
CREATE POLICY hlba_select ON public.hr_leave_balance_adjustments
  FOR SELECT USING (
    (SELECT public.is_super_admin())
    OR employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
    OR (
      (SELECT public.user_has_permission('hr.leave.balance.manage'))
      AND hr_organization_id IN (SELECT unnest(public.fn_my_hr_organization_ids()))
    )
  );

-- ── 2. Read: one institution's staff, pivot-ready ───────────────────────────
CREATE OR REPLACE FUNCTION public.hr_leave_balance_staff_detail(
  p_hr_org_id          uuid,
  p_hr_academic_year_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ay  record;
  v_org record;
  v_out jsonb;
BEGIN
  -- Gated on .manage, NOT on hr.leave.approve. Reading v_hr_leave_balance
  -- directly would have gated on approve + org membership, and those are
  -- different keys -- Board Member holds manage without approve and would have
  -- seen a silently empty table. Same gate as hr_leave_balance_analytics.
  IF NOT public.user_has_permission('hr.leave.balance.manage') THEN
    RAISE EXCEPTION 'Insufficient permission: hr.leave.balance.manage required';
  END IF;

  SELECT o.id, o.institution_id, i.name AS institution_name
    INTO v_org
  FROM public.hr_organizations o
  JOIN public.institutions i ON i.id = o.institution_id
  WHERE o.id = p_hr_org_id;

  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'Unknown hr_organization_id %', p_hr_org_id;
  END IF;

  IF NOT public.role_has_institution_access(v_org.institution_id) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to institution %',
      v_org.institution_id;
  END IF;

  IF p_hr_academic_year_id IS NULL THEN
    SELECT * INTO v_ay FROM public.hr_academic_years
    WHERE is_active AND CURRENT_DATE BETWEEN start_date AND end_date;
  ELSE
    SELECT * INTO v_ay FROM public.hr_academic_years WHERE id = p_hr_academic_year_id;
  END IF;

  -- No year configured is a page-level empty state, not an error.
  IF v_ay.id IS NULL THEN
    RETURN jsonb_build_object(
      'hr_academic_year_id', NULL, 'year_name', NULL,
      'org_id', v_org.id, 'institution_name', v_org.institution_name,
      'leave_types', '[]'::jsonb, 'staff', '[]'::jsonb
    );
  END IF;

  WITH types AS (
    -- request_category='leave' only. Compensatory Off is credit-backed and
    -- Permission is minute-backed; hr_trig_update_leave_balance skips both, so
    -- their `used` is never maintained and rendering them in a days-denominated
    -- table would show a permanently full balance that means nothing.
    SELECT t.id, t.leave_type_code AS code, t.leave_type_name AS name,
           t.default_entitled_days AS default_days, t.display_order
    FROM public.hr_leave_types t
    WHERE t.hr_organization_id = v_org.id
      AND t.is_active
      AND t.request_category = 'leave'
  ),
  bal AS (
    -- v_hr_leave_balance_src, not hr_leave_balances: the view already resolves
    -- COALESCE(override, balance.entitled, type.default) and reports which one
    -- won. Re-implementing that here would drift from what the staff member
    -- sees in their own apply-leave drawer. It also emits a row for every
    -- eligible (staff, type) pair even with no ledger row -- created_at IS NULL
    -- is how "never provisioned" is detected.
    SELECT v.employee_id, v.leave_type_id, v.entitled, v.used,
           v.carried_forward, v.available, v.entitlement_source,
           (v.created_at IS NOT NULL) AS has_row
    FROM public.v_hr_leave_balance_src v
    JOIN types ty ON ty.id = v.leave_type_id
    WHERE v.hr_organization_id  = v_org.id
      AND v.hr_academic_year_id = v_ay.id
  ),
  people AS (
    SELECT s.id AS employee_id,
           s.staff_id AS staff_code,
           trim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) AS name,
           d.department_name,
           jsonb_object_agg(b.leave_type_id::text, jsonb_build_object(
             'entitled',  b.entitled,
             'used',      b.used,
             'carried',   b.carried_forward,
             'available', b.available,
             'source',    b.entitlement_source,
             'has_row',   b.has_row
           )) AS balances,
           count(*) FILTER (WHERE NOT b.has_row)                              AS missing_rows,
           count(*) FILTER (WHERE b.available < 0)                            AS negative,
           count(*) FILTER (WHERE b.used > b.entitled + b.carried_forward)    AS overdrawn,
           count(*) FILTER (WHERE b.entitlement_source <> 'policy')           AS off_policy
    FROM bal b
    JOIN public.staff s ON s.id = b.employee_id
    LEFT JOIN public.departments d ON d.id = s.department_id
    GROUP BY s.id, s.staff_id, s.first_name, s.last_name, d.department_name
  )
  SELECT jsonb_build_object(
    'hr_academic_year_id', v_ay.id,
    'year_name',           v_ay.year_name,
    'start_date',          v_ay.start_date,
    'end_date',            v_ay.end_date,
    'org_id',              v_org.id,
    'institution_name',    v_org.institution_name,
    'leave_types', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', id, 'code', code, 'name', name, 'default_days', default_days
             ) ORDER BY display_order, name)
      FROM types), '[]'::jsonb),
    'staff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'employee_id', employee_id,
               'staff_code',  staff_code,
               'name',        name,
               'department',  department_name,
               'balances',    balances,
               'flags', jsonb_build_object(
                 'missing_rows', missing_rows,
                 'negative',     negative,
                 'overdrawn',    overdrawn,
                 'off_policy',   off_policy
               )
             ) ORDER BY name)
      FROM people), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END $$;

-- ── 3. Write: audited single-cell correction ────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_leave_balance_adjust(
  p_employee_id         uuid,
  p_leave_type_id       uuid,
  p_hr_academic_year_id uuid,
  p_action              text,
  p_value               numeric,
  p_reason              text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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

  -- The organization comes from the STAFF's institution, never from a caller
  -- parameter -- otherwise the org id is attacker-controlled and the access
  -- check below could be satisfied against an institution the employee is not
  -- in. Same reason the June backfill resolved it this way.
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

  -- Per-lever gate, mirroring each table's own RLS exactly so this RPC widens
  -- nobody's access -- it only surfaces what the caller could already do:
  --   hr_leave_balances.hlb_write              -> hr.leave.policies.write  (2 roles)
  --   hr_leave_entitlement_overrides.hleo_write -> hr.leave.balance.manage (7 roles)
  IF p_action = 'set_used' THEN
    IF NOT public.user_has_permission('hr.leave.policies.write') THEN
      RAISE EXCEPTION
        'Insufficient permission: hr.leave.policies.write required to correct used days';
    END IF;
  ELSE
    IF NOT public.user_has_permission('hr.leave.balance.manage') THEN
      RAISE EXCEPTION 'Insufficient permission: hr.leave.balance.manage required';
    END IF;
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
    -- entitled stays NULL. Writing a literal would flip entitlement_source to
    -- 'frozen' and detach the row from hr_leave_types.default_entitled_days
    -- permanently -- a later policy change would silently skip this person.
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
END $$;

-- Grants. REVOKE from anon specifically, not from PUBLIC: authenticated
-- inherits PUBLIC, so revoking PUBLIC would also strip the logged-in role.
REVOKE EXECUTE ON FUNCTION public.hr_leave_balance_staff_detail(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION
  public.hr_leave_balance_adjust(uuid, uuid, uuid, text, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_balance_staff_detail(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.hr_leave_balance_adjust(uuid, uuid, uuid, text, numeric, text) TO authenticated;
