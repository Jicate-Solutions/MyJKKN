-- fn_admission_lead_scope: single-round-trip lead-access resolver for the
-- service-role leads list + [id] detail routes. Collapses the former multi-query
-- prelude (profiles, user_has_permission, allowlist, global-flag,
-- admission_counselors) into ONE call, delegating to the SAME SQL helpers the
-- adm_leads_select RLS policy uses (_user_in_admission_lead_allowlist /
-- _user_is_strict_counselor / user_has_permission) so API and RLS stay in
-- lockstep (single source of truth). SECURITY DEFINER; EXECUTE restricted to
-- service_role so an authenticated user cannot probe another user's scope by
-- passing their id. Consumed by lib/api-helpers/admission-lead-visibility.ts.
CREATE OR REPLACE FUNCTION public.fn_admission_lead_scope(p_user_id uuid)
RETURNS TABLE (
  profile_exists      boolean,
  is_super            boolean,
  has_view_permission boolean,
  in_allowlist        boolean,
  is_strict_counselor boolean,
  has_global_role     boolean,
  my_counselor_id     uuid,
  institution_id      uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_user_id),
    COALESCE((SELECT (p.is_super_admin = true OR p.role = 'super_admin')
              FROM profiles p WHERE p.id = p_user_id), false),
    public.user_has_permission(p_user_id, 'admission.leads.view'),
    public._user_in_admission_lead_allowlist(p_user_id),
    public._user_is_strict_counselor(p_user_id),
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = p_user_id
        AND (cr.institution_scope = 'all'
             OR (cr.module_scopes ->> 'admission') = 'all_institutions')
    ),
    (SELECT ac.id FROM admission_counselors ac
      WHERE ac.user_id = p_user_id ORDER BY ac.id LIMIT 1),
    (SELECT p.institution_id FROM profiles p WHERE p.id = p_user_id);
$function$;

REVOKE ALL ON FUNCTION public.fn_admission_lead_scope(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_admission_lead_scope(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_admission_lead_scope(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admission_lead_scope(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
