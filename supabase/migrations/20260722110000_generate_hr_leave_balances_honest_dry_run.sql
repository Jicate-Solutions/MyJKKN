-- Make generate_hr_leave_balances' dry run report what a real run would do.
--
-- BUG: the dry-run branch incremented v_created for EVERY candidate pair and
-- never checked for an existing row, while the real branch used
-- ON CONFLICT DO NOTHING and split the outcome into created/skipped. So a
-- fully-provisioned org previewed as "Would create 60 balance rows" and then
-- generated "Created 0 · 60 already existed". The preview overstated new work
-- by exactly the number of rows that already existed, which reads as "nothing
-- is provisioned yet" on a page whose whole job is deciding whether to run.
--
-- Observed on JKKN Testing Institution: 10 staff × 6 types = 60 candidates,
-- all 60 already present for AY 2026-2027, preview claimed 60 creations.
--
-- FIX 1 — dry run now probes hr_leave_balances with the same key the real
-- INSERT conflicts on (employee_id, leave_type_id, academic_year_id) and
-- counts each candidate as created or skipped accordingly. Preview and real
-- run now agree.
--
-- FIX 2 — the fallback list is now accumulated ONLY for rows that will
-- actually be written. It reports "this staff member got the leave type
-- default because no cadre entitlement resolved", which is meaningless for a
-- row that is being skipped. Without this, fixing the count alone would leave
-- created=0 / skipped=60 / fallback_count=60 — internally contradictory.
--
-- Rebuilt from 20260721120150 (the institution-scope revision), NOT from the
-- original 20260721120100 — replacing the older body would drop the
-- role_has_institution_access() cross-tenant check. Signature is unchanged
-- (uuid, uuid, boolean) so this REPLACES rather than creating an overload.

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
      v_written  boolean := false;
    BEGIN
      -- D6: cadre entitlement when resolvable, else the type default.
      v_entitled := COALESCE(r.cadre_entitled, r.default_entitled_days);

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
        -- Probe the SAME key the real INSERT conflicts on, so the preview and
        -- the real run cannot disagree.
        IF EXISTS (
          SELECT 1 FROM public.hr_leave_balances b
          WHERE b.employee_id      = r.staff_id
            AND b.leave_type_id    = r.leave_type_id
            AND b.academic_year_id = p_academic_year_id
        ) THEN
          v_skipped := v_skipped + 1;
        ELSE
          v_created := v_created + 1;
          v_written := true;
        END IF;
      ELSE
        INSERT INTO public.hr_leave_balances (
          employee_id, leave_type_id, academic_year_id, hr_organization_id,
          entitled, used, carried_forward
        ) VALUES (
          r.staff_id, r.leave_type_id, p_academic_year_id, p_hr_org_id,
          v_entitled, 0, v_carried
        )
        ON CONFLICT (employee_id, leave_type_id, academic_year_id) DO NOTHING;

        IF FOUND THEN
          v_created := v_created + 1;
          v_written := true;
        ELSE
          v_skipped := v_skipped + 1;
        END IF;
      END IF;

      -- Only report the cadre fallback for rows actually being written.
      -- A skipped row is not being provisioned, so "used the leave type
      -- default" does not describe anything that happened.
      IF v_written AND r.cadre_entitled IS NULL THEN
        v_fallback := v_fallback || jsonb_build_object(
          'staff_code', r.staff_code,
          'name', trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')),
          'reason', CASE WHEN r.cadre_id IS NULL
                         THEN 'no cadre assigned'
                         ELSE 'no entitlement row for cadre' END
        );
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
