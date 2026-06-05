-- E3: (1) InitPlan-optimize the per-row role_has_institution_access(institution_id)
-- in the admission_leads policies, and (2) close the branch-5 allowlist bypass.
--
-- (1) _user_accessible_institutions() REUSES role_has_institution_access(id) over
--     the (14-row) institutions table, so set-membership is provably equivalent to
--     role_has_institution_access(institution_id) for non-null ids. As a STABLE
--     no-arg function it is evaluated ONCE per statement (InitPlan) instead of per
--     scanned row (~14 role_has calls/statement vs up to 19.5k/statement). auth.uid()
--     is wrapped as (SELECT auth.uid()) so the STABLE helper calls
--     (_user_in_admission_lead_allowlist / _user_is_strict_counselor /
--     _user_owns_lead_via_counselor_id) are likewise InitPlan-cached.
-- (2) The former "bare owner" branch granted SELECT/UPDATE to ANY authenticated user
--     assigned to a lead, bypassing the 2026-05-11 _user_in_admission_lead_allowlist
--     lockdown. It is now gated on the allowlist (counselor roles are already in the
--     allowlist, so strict counselors are unaffected; only non-allowlisted assignees
--     lose the bypass — 1 assignee + 1 counselor-owner at time of writing).
--
-- Equivalence: institution scoping is provably unchanged (the set reuses
-- role_has_institution_access). The ONLY behavioral change is the intended branch-5
-- tightening. The service-role list/[id] routes bypass RLS, so this primarily
-- affects direct authenticated admission_leads queries (dashboards/analytics) and
-- the branch-5 bypass closure.
CREATE OR REPLACE FUNCTION public._user_accessible_institutions()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(i.id), ARRAY[]::uuid[])
  FROM institutions i
  WHERE public.role_has_institution_access(i.id);
$function$;

REVOKE ALL ON FUNCTION public._user_accessible_institutions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._user_accessible_institutions() TO authenticated, service_role;

ALTER POLICY adm_leads_select ON public.admission_leads USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('admission.leads.view'::text)
    AND _user_in_admission_lead_allowlist((SELECT auth.uid()))
    AND (institution_id IS NULL OR institution_id = ANY(_user_accessible_institutions()))
    AND (NOT _user_is_strict_counselor((SELECT auth.uid())))
  )
  OR (
    _user_is_strict_counselor((SELECT auth.uid()))
    AND (institution_id IS NULL OR institution_id = ANY(_user_accessible_institutions()))
    AND (source <> 'referral'::lead_source)
    AND ((assigned_counselor_id = (SELECT auth.uid())) OR _user_owns_lead_via_counselor_id((SELECT auth.uid()), counselor_id))
  )
  OR (
    _user_in_admission_lead_allowlist((SELECT auth.uid()))
    AND (source <> 'referral'::lead_source)
    AND ((assigned_counselor_id = (SELECT auth.uid())) OR _user_owns_lead_via_counselor_id((SELECT auth.uid()), counselor_id))
  )
  OR (
    (expo_event_id IS NOT NULL) AND (expo_event_id IN (SELECT get_my_expo_team_event_ids()))
  )
);

ALTER POLICY adm_leads_update ON public.admission_leads USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('admission.leads.edit'::text)
    AND _user_in_admission_lead_allowlist((SELECT auth.uid()))
    AND (institution_id IS NULL OR institution_id = ANY(_user_accessible_institutions()))
    AND (NOT _user_is_strict_counselor((SELECT auth.uid())))
  )
  OR (
    _user_is_strict_counselor((SELECT auth.uid()))
    AND (institution_id IS NULL OR institution_id = ANY(_user_accessible_institutions()))
    AND (source <> 'referral'::lead_source)
    AND ((assigned_counselor_id = (SELECT auth.uid())) OR _user_owns_lead_via_counselor_id((SELECT auth.uid()), counselor_id))
  )
  OR (
    _user_in_admission_lead_allowlist((SELECT auth.uid()))
    AND (source <> 'referral'::lead_source)
    AND ((assigned_counselor_id = (SELECT auth.uid())) OR _user_owns_lead_via_counselor_id((SELECT auth.uid()), counselor_id))
  )
);

ALTER POLICY adm_leads_delete ON public.admission_leads USING (
  is_super_admin()
  OR is_admin()
  OR (
    user_has_permission('admission.leads.delete'::text)
    AND (institution_id IS NULL OR institution_id = ANY(_user_accessible_institutions()))
  )
);

NOTIFY pgrst, 'reload schema';
