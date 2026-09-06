-- get_lead_counts_by_source — performance rewrite.
--
-- PROBLEM: the prior SECURITY INVOKER version let RLS on admission_leads run
-- per row during a full-table GROUP BY. The RLS predicate calls
-- _user_accessible_institutions() (which loops every institution via
-- role_has_institution_access) inside `institution_id = ANY(...)`, and the
-- planner re-evaluated it per row → ~3M buffer hits / 15.6s for 19.6k rows →
-- statement timeout (57014) on the allocation/sources KPI strip.
--
-- FIX: SECURITY DEFINER. Resolve the caller's scope ONCE into locals, then
-- filter on a plain array. Visibility is preserved per persona:
--   * super_admin / admin        -> all leads (optionally narrowed by p_institution_id)
--   * strict counselor           -> own assigned leads only (mirrors RLS; excludes referral)
--   * officer (view + allowlist)  -> their accessible institutions (+ NULL-institution leads)
--   * anyone else                -> nothing
-- Signature is unchanged so callers / generated types are unaffected.

CREATE OR REPLACE FUNCTION public.get_lead_counts_by_source(p_institution_id uuid DEFAULT NULL)
RETURNS TABLE(source lead_source, lead_count bigint, assigned_count bigint, unassigned_count bigint, conversions bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid             uuid := auth.uid();
  v_my_counselor_id uuid;
  v_accessible      uuid[];
BEGIN
  -- Admins: full visibility (optionally narrowed by the requested institution).
  IF public.is_super_admin() OR public.is_admin(v_uid) THEN
    RETURN QUERY
      SELECT al.source,
             COUNT(*),
             COUNT(*) FILTER (WHERE al.counselor_id IS NOT NULL),
             COUNT(*) FILTER (WHERE al.counselor_id IS NULL),
             COUNT(*) FILTER (WHERE al.funnel_stage IN ('enrolled','confirmed'))
      FROM admission_leads al
      WHERE p_institution_id IS NULL OR al.institution_id = p_institution_id
      GROUP BY al.source;
    RETURN;
  END IF;

  -- Strict counselors: own assigned leads only (mirrors the RLS counselor
  -- branch). They don't use the manager KPI page, but keep counts honest.
  IF public._user_is_strict_counselor(v_uid) THEN
    SELECT ac.id INTO v_my_counselor_id
      FROM admission_counselors ac
     WHERE ac.user_id = v_uid
     ORDER BY ac.id LIMIT 1;
    RETURN QUERY
      SELECT al.source,
             COUNT(*),
             COUNT(*) FILTER (WHERE al.counselor_id IS NOT NULL),
             COUNT(*) FILTER (WHERE al.counselor_id IS NULL),
             COUNT(*) FILTER (WHERE al.funnel_stage IN ('enrolled','confirmed'))
      FROM admission_leads al
      WHERE al.source <> 'referral'::lead_source
        AND (al.assigned_counselor_id = v_uid OR al.assigned_counselor_id = v_my_counselor_id)
        AND (p_institution_id IS NULL OR al.institution_id = p_institution_id)
      GROUP BY al.source;
    RETURN;
  END IF;

  -- Officer-type users: scope to accessible institutions, resolved ONCE.
  IF public.user_has_permission(v_uid, 'admission.leads.view')
     AND public._user_in_admission_lead_allowlist(v_uid) THEN
    v_accessible := public._user_accessible_institutions();
    RETURN QUERY
      SELECT al.source,
             COUNT(*),
             COUNT(*) FILTER (WHERE al.counselor_id IS NOT NULL),
             COUNT(*) FILTER (WHERE al.counselor_id IS NULL),
             COUNT(*) FILTER (WHERE al.funnel_stage IN ('enrolled','confirmed'))
      FROM admission_leads al
      WHERE (al.institution_id IS NULL OR al.institution_id = ANY(v_accessible))
        AND (p_institution_id IS NULL OR al.institution_id = p_institution_id)
      GROUP BY al.source;
    RETURN;
  END IF;

  -- No admission-lead visibility: return nothing.
  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_lead_counts_by_source(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lead_counts_by_source(uuid) TO authenticated, service_role;
