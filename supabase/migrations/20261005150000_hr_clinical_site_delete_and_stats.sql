-- Clinical duty: delete a duty site (HR Head / super admin) and the request-tab
-- analytics.
--
-- DELETE. hr_cds_write was FOR ALL under hr.attendance.clinical.manage, which
-- hr_admin and hr_manager hold, so any of them could DELETE a site straight
-- through PostgREST. The write policy is split: INSERT and UPDATE stay with
-- manage, and there is deliberately NO delete policy -- the only way to delete
-- is fn_hr_clinical_delete_site, which demands the new
-- hr.attendance.clinical.delete key (held by hr_head; super admins pass
-- user_has_permission). A site with recorded punches cannot be deleted -- the
-- punch audit must keep pointing at it -- so it is deactivated instead.

DROP POLICY IF EXISTS hr_cds_write ON public.hr_clinical_duty_sites;
CREATE POLICY hr_cds_insert ON public.hr_clinical_duty_sites FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.user_has_permission('hr.attendance.clinical.manage')));
CREATE POLICY hr_cds_update ON public.hr_clinical_duty_sites FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('hr.attendance.clinical.manage')))
  WITH CHECK ((SELECT public.user_has_permission('hr.attendance.clinical.manage')));

CREATE OR REPLACE FUNCTION public.fn_hr_clinical_delete_site(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name   text;
  v_punches integer;
BEGIN
  IF NOT public.user_has_permission('hr.attendance.clinical.delete') THEN
    RAISE EXCEPTION 'Only the HR Head or a super admin can delete a duty site.' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_name FROM public.hr_clinical_duty_sites WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That duty site no longer exists.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_punches FROM public.hr_clinical_punches WHERE site_id = p_id;
  IF v_punches > 0 THEN
    RAISE EXCEPTION '% has % recorded punch(es), so it cannot be deleted. Deactivate it instead.',
      v_name, v_punches USING ERRCODE = 'P0001';
  END IF;

  -- A grant restricted to this site loses it; a grant left with no site cannot
  -- punch anywhere until HR grants a site again.
  UPDATE public.hr_clinical_duty_eligibilities
     SET site_ids = array_remove(site_ids, p_id)
   WHERE site_ids IS NOT NULL AND p_id = ANY (site_ids);

  DELETE FROM public.hr_clinical_duty_sites WHERE id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_clinical_delete_site(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_clinical_delete_site(uuid) TO authenticated, service_role;

UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('hr.attendance.clinical.delete', true)
 WHERE role_key = 'hr_head' AND is_active;

-- STATS. One call for the Requests tab, scoped by an optional institution.
CREATE OR REPLACE FUNCTION public.fn_hr_clinical_stats(p_institution_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_month  date := date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata'))::date;
  v_result jsonb;
BEGIN
  IF NOT public.user_has_permission('hr.attendance.clinical.manage') THEN
    RAISE EXCEPTION 'You do not have permission to view clinical duty analytics.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'requests', (
      SELECT jsonb_build_object(
        'total',    count(*),
        'pending',  count(*) FILTER (WHERE status = 'pending'),
        'approved', count(*) FILTER (WHERE status = 'approved'),
        'rejected', count(*) FILTER (WHERE status = 'rejected'),
        'revoked',  count(*) FILTER (WHERE status = 'revoked'),
        'active_now', count(*) FILTER (WHERE status = 'approved'
                        AND valid_from <= v_today AND (valid_until IS NULL OR valid_until >= v_today)),
        'expiring_30d', count(*) FILTER (WHERE status = 'approved'
                        AND valid_until BETWEEN v_today AND v_today + 30),
        'direct_grants', count(*) FILTER (WHERE granted_directly),
        'oldest_pending_days', COALESCE(max(v_today - created_at::date) FILTER (WHERE status = 'pending'), 0),
        'avg_decision_hours', round(avg(extract(epoch FROM (decided_at - created_at)) / 3600.0)
                        FILTER (WHERE decided_at IS NOT NULL AND NOT granted_directly)::numeric, 1)
      )
      FROM public.hr_clinical_duty_eligibilities e
      WHERE p_institution_id IS NULL OR e.institution_id = p_institution_id),
    'by_scope', (
      SELECT COALESCE(jsonb_object_agg(scope_type, n), '{}'::jsonb)
      FROM (SELECT scope_type, count(*) n FROM public.hr_clinical_duty_eligibilities e
            WHERE e.status = 'approved' AND (p_institution_id IS NULL OR e.institution_id = p_institution_id)
            GROUP BY scope_type) s),
    'by_institution', (
      SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.total DESC), '[]'::jsonb)
      FROM (SELECT i.id, i.name,
                   count(*) total,
                   count(*) FILTER (WHERE e.status = 'pending')  pending,
                   count(*) FILTER (WHERE e.status = 'approved') approved,
                   count(*) FILTER (WHERE e.status = 'rejected') rejected,
                   count(*) FILTER (WHERE e.status = 'revoked')  revoked
            FROM public.hr_clinical_duty_eligibilities e
            JOIN public.institutions i ON i.id = e.institution_id
            WHERE p_institution_id IS NULL OR e.institution_id = p_institution_id
            GROUP BY i.id, i.name) x),
    'by_month', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'label', to_char(m, 'Mon YY'),
                                                   'requests', COALESCE(c.n, 0)) ORDER BY m), '[]'::jsonb)
      FROM generate_series(v_month - interval '5 months', v_month, interval '1 month') m
      LEFT JOIN (SELECT date_trunc('month', created_at AT TIME ZONE 'Asia/Kolkata')::date mm, count(*) n
                 FROM public.hr_clinical_duty_eligibilities e
                 WHERE p_institution_id IS NULL OR e.institution_id = p_institution_id
                 GROUP BY 1) c ON c.mm = m::date),
    'punches', (
      SELECT jsonb_build_object(
        'today_in',  count(*) FILTER (WHERE p.work_date = v_today AND p.punch_type = 'in'),
        'today_out', count(*) FILTER (WHERE p.work_date = v_today AND p.punch_type = 'out'),
        'on_duty_now', count(*) FILTER (WHERE p.work_date = v_today AND p.punch_type = 'in'
                          AND NOT EXISTS (SELECT 1 FROM public.hr_clinical_punches o
                                          WHERE o.employee_id = p.employee_id AND o.work_date = p.work_date
                                            AND o.punch_type = 'out')),
        'month_days', count(DISTINCT (p.employee_id, p.work_date)) FILTER (WHERE p.work_date >= v_month),
        'month_staff', count(DISTINCT p.employee_id) FILTER (WHERE p.work_date >= v_month),
        'month_missing_out', count(*) FILTER (WHERE p.punch_type = 'in' AND p.work_date >= v_month
                          AND p.work_date < v_today
                          AND NOT EXISTS (SELECT 1 FROM public.hr_clinical_punches o
                                          WHERE o.employee_id = p.employee_id AND o.work_date = p.work_date
                                            AND o.punch_type = 'out'))
      )
      FROM public.hr_clinical_punches p
      JOIN public.staff s ON s.id = p.employee_id
      WHERE p_institution_id IS NULL OR s.institution_id = p_institution_id),
    'sites', (
      SELECT jsonb_build_object(
        'active',   count(*) FILTER (WHERE is_active),
        'inactive', count(*) FILTER (WHERE NOT is_active))
      FROM public.hr_clinical_duty_sites st
      WHERE p_institution_id IS NULL OR st.institution_id = p_institution_id)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_clinical_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_clinical_stats(uuid) TO authenticated, service_role;
