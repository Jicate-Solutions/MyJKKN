-- get_source_distribution — same performance rewrite as get_lead_counts_by_source.
-- The prior SECURITY INVOKER version re-evaluated the admission_leads RLS
-- predicate (incl. _user_accessible_institutions()) per row over a single
-- source's leads → ~3M buffers / 15.8s / statement timeout for education_fair.
-- SECURITY DEFINER + scope-resolved-once mirrors the RLS personas. Signature
-- unchanged so LeadDistributionService.get() and generated types are intact.

CREATE OR REPLACE FUNCTION public.get_source_distribution(
  p_source lead_source,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_institution_id uuid DEFAULT NULL
)
RETURNS TABLE(
  counselor_id uuid, user_id uuid, counselor_name text, counselor_email text,
  counselor_designation text, total_leads bigint, new_leads bigint,
  progressed_leads bigint, conversions bigint, lost_leads bigint,
  last_assigned_at timestamptz
)
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
  -- No admission-lead visibility: return nothing.
  IF NOT v_is_admin AND NOT v_is_strict AND NOT (v_can_view AND v_in_allowlist) THEN
    RETURN;
  END IF;

  IF v_is_strict AND NOT v_is_admin THEN
    SELECT ac.id INTO v_my_counselor_id
      FROM admission_counselors ac WHERE ac.user_id = v_uid ORDER BY ac.id LIMIT 1;
  END IF;

  IF NOT v_is_admin AND NOT v_is_strict THEN
    v_accessible := public._user_accessible_institutions();
  END IF;

  RETURN QUERY
  WITH window_leads AS (
    SELECT *
    FROM admission_leads al
    WHERE al.source = p_source
      AND (p_from IS NULL OR al.created_at >= p_from)
      AND (p_to   IS NULL OR al.created_at <= p_to)
      AND (p_institution_id IS NULL OR al.institution_id = p_institution_id)
      AND (
        v_is_admin
        OR (v_is_strict
            AND al.source <> 'referral'::lead_source
            AND (al.assigned_counselor_id = v_uid OR al.assigned_counselor_id = v_my_counselor_id))
        OR (NOT v_is_admin AND NOT v_is_strict
            AND (al.institution_id IS NULL OR al.institution_id = ANY(v_accessible)))
      )
  )
  SELECT
    ac.id,
    wl.assigned_counselor_id,
    ac.name,
    ac.email,
    ac.designation,
    COUNT(*),
    COUNT(*) FILTER (WHERE wl.funnel_stage = 'new'),
    COUNT(*) FILTER (
      WHERE wl.funnel_stage IS NOT NULL
        AND wl.funnel_stage NOT IN ('new','lost','not_reachable','enrolled','confirmed')
    ),
    COUNT(*) FILTER (WHERE wl.funnel_stage IN ('enrolled','confirmed')),
    COUNT(*) FILTER (WHERE wl.funnel_stage IN ('lost','not_reachable')),
    MAX(wl.assigned_at)
  FROM window_leads wl
  LEFT JOIN admission_counselors ac ON ac.user_id = wl.assigned_counselor_id
  GROUP BY ac.id, wl.assigned_counselor_id, ac.name, ac.email, ac.designation;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_source_distribution(lead_source, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_source_distribution(lead_source, timestamptz, timestamptz, uuid) TO authenticated, service_role;
