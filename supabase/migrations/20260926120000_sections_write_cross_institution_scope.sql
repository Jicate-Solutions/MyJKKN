-- ci:allow-secdef-anon  fn_role_scope_all_grants() is called only from RLS
--   policy expressions and answers only about auth.uid() (NULL for anon ⇒
--   false), same rationale as 20260826020000.
-- ci:allow-secdef-authenticated  It is a policy predicate that only reports
--   whether auth.uid() itself holds a scope='all' role granting p_key; it
--   writes nothing and reveals nothing about other users.
--
-- ============================================================================
-- Let institution_scope='all' roles create/edit/delete sections in ANY
-- institution, not just their own profile institution.
--
-- Date: 2026-09-26
--
-- BUG
--   Admission Officer (custom_roles.role_key = 'admission', institution_scope
--   = 'all') holds organizations.sections.create/edit/delete, but the live
--   sections_insert_admin / _update_admin / _delete_admin policies only allow
--   rows whose institution_id equals the actor's profiles.institution_id. So
--   creating a section for any other institution was rejected by RLS.
--
-- FIX
--   Keep each existing branch verbatim and OR in a cross-institution branch
--   that is PERMISSION-SPECIFIC (see 20260826020000): a scope='all' role
--   widens section writes only if that same role grants the matching
--   organizations.sections.* key. Checked via user_roles
--   (fn_has_all_institution_access_for) AND the legacy profiles.role ->
--   custom_roles link — 1 of 8 Admission Officers has no user_roles row.
--
-- Blast radius (live, 2026-09-26): scope='all' roles holding a sections write
--   key are executive_admin_officer, administrator, admission.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_role_scope_all_grants(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT (SELECT public.fn_has_all_institution_access_for(p_key))
        OR EXISTS (
            SELECT 1
              FROM profiles p
              JOIN custom_roles cr ON cr.role_key = p.role
             WHERE p.id = (SELECT auth.uid())
               AND cr.institution_scope = 'all'
               AND (cr.permissions ->> p_key)::boolean = true
        );
$function$;

COMMENT ON FUNCTION public.fn_role_scope_all_grants(text) IS
  'True when the caller holds a scope=all role (via user_roles or legacy profiles.role) that grants p_key. Used by sections write policies.';

ALTER POLICY "sections_insert_admin" ON public.sections WITH CHECK (
    ((institution_id IN ( SELECT profiles.institution_id
         FROM profiles
        WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))
      AND ( SELECT user_has_permission('organizations.sections.create'::text) AS user_has_permission))
    OR ( SELECT public.fn_role_scope_all_grants('organizations.sections.create'::text))
);

ALTER POLICY "sections_update_admin" ON public.sections USING (
    ((institution_id IN ( SELECT profiles.institution_id
         FROM profiles
        WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))
      AND ( SELECT user_has_permission('organizations.sections.edit'::text) AS user_has_permission))
    OR ( SELECT public.fn_role_scope_all_grants('organizations.sections.edit'::text))
);

ALTER POLICY "sections_delete_admin" ON public.sections USING (
    ((institution_id IN ( SELECT profiles.institution_id
         FROM profiles
        WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.institution_id IS NOT NULL))))
      AND ( SELECT user_has_permission('organizations.sections.delete'::text) AS user_has_permission))
    OR ( SELECT public.fn_role_scope_all_grants('organizations.sections.delete'::text))
);

NOTIFY pgrst, 'reload schema';
