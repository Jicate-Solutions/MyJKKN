-- Editing hr_leave_types.default_entitled_days must reach every staff balance.
--
-- hr_leave_balances.entitled is a SNAPSHOT written by generate_hr_leave_balances
-- (ON CONFLICT DO NOTHING), and the balance ladder is
-- COALESCE(override, balances.entitled, type default) -- so once a row holds a
-- number the type default is never consulted again. This re-resolves `entitled`
-- with the SAME precedence the generator uses:
--   staff assignment > work pattern > dept/org assignment > cadre > type default
-- A per-staff override (hr_leave_entitlement_overrides) always wins on read, so
-- those rows are skipped. NULL `entitled` rows already follow the default live
-- and are left alone. `used` / `carried_forward` are never touched.
-- Scope: academic years that have not ended and are not frozen.

CREATE OR REPLACE FUNCTION public.fn_hr_leave_type_sync_entitlements(
  p_leave_type_id uuid,
  p_dry_run boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_changed int := 0;
  v_scanned int := 0;
BEGIN
  -- Two types edited in one transaction would otherwise collide on the name.
  DROP TABLE IF EXISTS _ent_sync;
  CREATE TEMP TABLE _ent_sync ON COMMIT DROP AS
  SELECT b.employee_id, b.leave_type_id, b.hr_academic_year_id, b.entitled AS old_ent,
         CASE
           WHEN m.scope_kind = 'staff' AND m.entitled_days IS NOT NULL THEN m.entitled_days
           WHEN wp.entitled_days IS NOT NULL                          THEN wp.entitled_days
           WHEN m.entitled_days  IS NOT NULL                          THEN m.entitled_days
           WHEN ce.entitled_days IS NOT NULL                          THEN ce.entitled_days
           ELSE t.default_entitled_days
         END AS new_ent
  FROM public.hr_leave_balances b
  JOIN public.hr_leave_types t   ON t.id = b.leave_type_id
  JOIN public.hr_academic_years ay ON ay.id = b.hr_academic_year_id
  JOIN public.staff s            ON s.id = b.employee_id
  LEFT JOIN public.hr_staff_details d ON d.staff_id = s.id
  LEFT JOIN public.hr_leave_type_entitlements ce
         ON ce.leave_type_id = t.id AND ce.cadre_id = d.cadre_id
  LEFT JOIN LATERAL (
    SELECT a.entitled_days, a.scope_kind
    FROM public.hr_leave_type_assignments a
    WHERE a.leave_type_id = t.id AND a.is_active
      AND ((a.scope_kind = 'staff'      AND a.staff_id      = s.id)
        OR (a.scope_kind = 'department' AND a.department_id = s.department_id)
        OR (a.scope_kind = 'organization'))
    ORDER BY CASE a.scope_kind WHEN 'staff' THEN 1 WHEN 'department' THEN 2 ELSE 3 END
    LIMIT 1
  ) m ON true
  LEFT JOIN LATERAL (
    SELECT pe.entitled_days
    FROM public.hr_staff_work_pattern_assignments a
    JOIN public.hr_work_pattern_leave_entitlements pe
      ON pe.work_pattern_id = a.work_pattern_id AND pe.leave_type_id = t.id
    WHERE a.staff_id = s.id
      AND a.effective_from <= LEAST(GREATEST(CURRENT_DATE, ay.start_date), ay.end_date)
      AND (a.effective_until IS NULL
           OR a.effective_until > LEAST(GREATEST(CURRENT_DATE, ay.start_date), ay.end_date))
    ORDER BY a.effective_from DESC
    LIMIT 1
  ) wp ON true
  WHERE b.leave_type_id = p_leave_type_id
    AND b.entitled IS NOT NULL
    AND ay.end_date >= CURRENT_DATE
    AND ay.frozen_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.hr_leave_entitlement_overrides o
      WHERE o.employee_id = b.employee_id AND o.leave_type_id = b.leave_type_id
        AND o.hr_academic_year_id = b.hr_academic_year_id);

  SELECT count(*), count(*) FILTER (WHERE old_ent IS DISTINCT FROM new_ent)
    INTO v_scanned, v_changed FROM _ent_sync;

  IF NOT p_dry_run THEN
    UPDATE public.hr_leave_balances b
       SET entitled = x.new_ent, updated_at = now()
      FROM _ent_sync x
     WHERE b.employee_id = x.employee_id AND b.leave_type_id = x.leave_type_id
       AND b.hr_academic_year_id = x.hr_academic_year_id
       AND b.entitled IS DISTINCT FROM x.new_ent;
  END IF;

  RETURN jsonb_build_object('dry_run', p_dry_run, 'scanned', v_scanned, 'changed', v_changed);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_leave_type_sync_entitlements(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_hr_leave_type_default_entitlement_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.fn_hr_leave_type_sync_entitlements(NEW.id, false);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_hr_leave_type_default_entitlement_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hr_leave_types_default_entitlement_sync ON public.hr_leave_types;
CREATE TRIGGER trg_hr_leave_types_default_entitlement_sync
  AFTER UPDATE OF default_entitled_days ON public.hr_leave_types
  FOR EACH ROW
  WHEN (OLD.default_entitled_days IS DISTINCT FROM NEW.default_entitled_days)
  EXECUTE FUNCTION public.trg_hr_leave_type_default_entitlement_sync();
