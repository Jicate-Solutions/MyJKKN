-- Fix cross-tenant authorization gap in generate_hr_leave_balances.
--
-- WHY: this SECURITY DEFINER function checked only the caller's permission
-- (hr.leave.balance.manage), never whether the caller may access the
-- institution behind the caller-supplied p_hr_org_id. Because SECURITY
-- DEFINER bypasses the caller's RLS inside the function body, any holder of
-- that permission at one institution could generate hr_leave_balances rows
-- for every other institution's staff by passing its hr_organization id.
--
-- FIX: after resolving v_inst_id (and its existing NULL guard), require
-- public.role_has_institution_access(v_inst_id) — the same helper RLS
-- policies across this repo use to scope institution access from role
-- assignments (not JWT claims). role_has_institution_access already
-- special-cases super admins (calls is_super_admin() internally), so no
-- additional super-admin bypass is needed here.

CREATE OR REPLACE FUNCTION public.generate_hr_leave_balances(
  p_hr_org_id        uuid,
  p_academic_year_id uuid,
  p_dry_run          boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_created   integer := 0;
  v_skipped   integer := 0;
  v_fallback  jsonb   := '[]'::jsonb;
  v_inst_id   uuid;
  v_prior_ay  uuid;
  v_start     date;
  r           record;
BEGIN
  -- SECURITY DEFINER functions callable by `authenticated` must authorize
  -- themselves — the caller's RLS does not apply inside this body.
  IF NOT public.user_has_permission('hr.leave.balance.manage') THEN
    RAISE EXCEPTION 'Insufficient permission: hr.leave.balance.manage required';
  END IF;

  SELECT institution_id INTO v_inst_id FROM public.hr_organizations WHERE id = p_hr_org_id;
  IF v_inst_id IS NULL THEN
    RAISE EXCEPTION 'Unknown hr_organization_id %', p_hr_org_id;
  END IF;

  -- SECURITY DEFINER bypasses the caller's RLS, so this function must scope
  -- itself. Without this, any holder of hr.leave.balance.manage could
  -- generate balances for another institution's staff by passing its org id.
  IF NOT public.role_has_institution_access(v_inst_id) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to institution %', v_inst_id;
  END IF;

  SELECT start_date INTO v_start FROM public.academic_years WHERE id = p_academic_year_id;
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Unknown academic_year_id %', p_academic_year_id;
  END IF;

  -- Prior year = same institution, greatest end_date strictly before this
  -- year's start_date. NEVER order by academic_year_name — it is TEXT and
  -- some values carry trailing spaces.
  SELECT id INTO v_prior_ay
  FROM public.academic_years
  WHERE institution_id = v_inst_id AND end_date < v_start
  ORDER BY end_date DESC
  LIMIT 1;

  FOR r IN
    SELECT
      s.id  AS staff_id,
      s.staff_id AS staff_code,
      s.first_name,
      s.last_name,
      d.cadre_id,
      t.id  AS leave_type_id,
      t.default_entitled_days,
      t.allow_carry_forward,
      t.max_carry_forward_days,
      e.entitled_days AS cadre_entitled
    FROM public.staff s
    CROSS JOIN public.hr_leave_types t
    LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
    LEFT JOIN public.hr_leave_type_entitlements e
           ON e.leave_type_id = t.id AND e.cadre_id = d.cadre_id
    WHERE s.institution_id = v_inst_id
      AND s.is_active
      AND t.hr_organization_id = p_hr_org_id
      AND t.is_active
      -- Eligibility filters (design D3)
      AND (t.applicable_cadre_ids IS NULL OR d.cadre_id = ANY(t.applicable_cadre_ids))
      AND (
        t.applicable_gender = 'all'
        OR lower(coalesce(s.gender, '')) = t.applicable_gender
      )
  LOOP
    DECLARE
      v_entitled numeric;
      v_carried  numeric := 0;
    BEGIN
      -- D6: cadre entitlement when resolvable, else the type default.
      v_entitled := COALESCE(r.cadre_entitled, r.default_entitled_days);

      IF r.cadre_entitled IS NULL THEN
        v_fallback := v_fallback || jsonb_build_object(
          'staff_code', r.staff_code,
          'name', trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')),
          'reason', CASE WHEN r.cadre_id IS NULL
                         THEN 'no cadre assigned'
                         ELSE 'no entitlement row for cadre' END
        );
      END IF;

      IF r.allow_carry_forward AND v_prior_ay IS NOT NULL THEN
        SELECT GREATEST(0, (b.entitled + b.carried_forward - b.used))
          INTO v_carried
        FROM public.hr_leave_balances b
        WHERE b.employee_id      = r.staff_id
          AND b.leave_type_id    = r.leave_type_id
          AND b.academic_year_id = v_prior_ay;

        v_carried := COALESCE(v_carried, 0);
        IF r.max_carry_forward_days IS NOT NULL THEN
          v_carried := LEAST(v_carried, r.max_carry_forward_days);
        END IF;
      END IF;

      IF p_dry_run THEN
        v_created := v_created + 1;
      ELSE
        INSERT INTO public.hr_leave_balances (
          employee_id, leave_type_id, academic_year_id, hr_organization_id,
          entitled, used, carried_forward
        ) VALUES (
          r.staff_id, r.leave_type_id, p_academic_year_id, p_hr_org_id,
          v_entitled, 0, v_carried
        )
        ON CONFLICT (employee_id, leave_type_id, academic_year_id) DO NOTHING;

        IF FOUND THEN v_created := v_created + 1;
        ELSE            v_skipped := v_skipped + 1;
        END IF;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run',       p_dry_run,
    'created',       v_created,
    'skipped',       v_skipped,
    'prior_year_id', v_prior_ay,
    'fallback_count', jsonb_array_length(v_fallback),
    'fallback',      v_fallback
  );
END $$;

REVOKE ALL ON FUNCTION public.generate_hr_leave_balances(uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_hr_leave_balances(uuid, uuid, boolean) TO authenticated;
