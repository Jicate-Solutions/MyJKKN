-- get_counselor_assigned_lead_counts — convert from SECURITY INVOKER to
-- SECURITY DEFINER + scope-once. The invoker version (migration 20260604180000)
-- scanned admission_leads under RLS, so the per-row _user_accessible_institutions()
-- fan-out made it ~14.7s / 2.9M buffers for the global officer → browser
-- statement timeout (57014). Same fix as get_lead_counts_by_source /
-- get_source_distribution. Signature unchanged (callers + types intact).
--
-- Personas mirror the admission_leads RLS:
--   * super_admin / admin      -> count for any id in p_ids (no institution filter)
--   * strict counselor         -> only their own assigned bucket
--   * officer (view+allowlist)  -> ids within their accessible institutions
--   * anyone else              -> nothing

CREATE OR REPLACE FUNCTION public.get_counselor_assigned_lead_counts(p_ids uuid[])
RETURNS TABLE(assigned_counselor_id uuid, lead_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             uuid    := auth.uid();
  v_is_admin        boolean := public.is_super_admin() OR public.is_admin(auth.uid());
  v_is_strict       boolean := public._user_is_strict_counselor(auth.uid());
  v_can_view        boolean := public.user_has_permission(auth.uid(), 'admission.leads.view');
  v_in_allowlist    boolean := public._user_in_admission_lead_allowlist(auth.uid());
  v_my_counselor_id uuid;
  v_accessible      uuid[];
BEGIN
  IF NOT v_is_admin AND NOT v_is_strict AND NOT (v_can_view AND v_in_allowlist) THEN
    RETURN;
  END IF;

  IF v_is_admin THEN
    RETURN QUERY
      SELECT al.assigned_counselor_id, COUNT(*)
      FROM admission_leads al
      WHERE al.assigned_counselor_id = ANY(p_ids)
      GROUP BY al.assigned_counselor_id;
    RETURN;
  END IF;

  IF v_is_strict THEN
    SELECT ac.id INTO v_my_counselor_id
      FROM admission_counselors ac WHERE ac.user_id = v_uid ORDER BY ac.id LIMIT 1;
    RETURN QUERY
      SELECT al.assigned_counselor_id, COUNT(*)
      FROM admission_leads al
      WHERE al.assigned_counselor_id = ANY(p_ids)
        AND (al.assigned_counselor_id = v_uid OR al.assigned_counselor_id = v_my_counselor_id)
      GROUP BY al.assigned_counselor_id;
    RETURN;
  END IF;

  -- Officer: scope to accessible institutions, resolved once.
  v_accessible := public._user_accessible_institutions();
  RETURN QUERY
    SELECT al.assigned_counselor_id, COUNT(*)
    FROM admission_leads al
    WHERE al.assigned_counselor_id = ANY(p_ids)
      AND (al.institution_id IS NULL OR al.institution_id = ANY(v_accessible))
    GROUP BY al.assigned_counselor_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_counselor_assigned_lead_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_counselor_assigned_lead_counts(uuid[]) TO authenticated, service_role;
