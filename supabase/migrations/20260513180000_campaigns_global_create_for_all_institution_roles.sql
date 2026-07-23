-- ============================================================
-- Allow non-super-admin users with multi-institution access AND
-- admission.marketing.create permission to create global (cross-
-- institution) campaigns.
-- ============================================================
-- Context (2026-05-13):
--   Prior gate stack:
--     • Frontend dropdown:  isSuperAdmin && <SelectItem Global>
--     • Frontend submit:    if (isGlobal && !isSuperAdmin) toast.error
--     • RLS p_campaigns_insert: only is_super_admin() could insert
--                               scope='global' rows
--
--   This locked global-campaign creation to super_admin only,
--   ignoring secondary roles with institution_scope='all' (like
--   SEO Specialist) who legitimately operate across institutions.
--
--   This migration:
--     1. Adds SQL helper user_has_all_institution_access() that
--        returns true if the calling user has at least one role
--        with institution_scope='all'.
--     2. Migrates p_campaigns_insert to add a scope='global'
--        branch gated by (marketing.create AND all-institution
--        access). The is_super_admin OR-branch and the
--        scope='institution' branch are preserved verbatim.
--
--   Frontend changes (separate file edit, same commit) replace
--   the isSuperAdmin checks with isSuperAdmin || institutions
--   .length > 1 in campaigns/new/page.tsx.
-- ============================================================

-- ── 1. Helper function ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_has_all_institution_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
     WHERE ur.user_id = auth.uid()
       AND cr.institution_scope = 'all'
  );
$function$;

COMMENT ON FUNCTION public.user_has_all_institution_access() IS
  'Returns true if the calling user has at least one assigned role with '
  'institution_scope=''all''. Used by RLS policies and SECURITY DEFINER '
  'RPCs to gate cross-institutional create/update operations. Composes '
  'with is_super_admin() and is_admin() — does NOT include them. The '
  'caller should write `is_super_admin() OR is_admin() OR '
  'user_has_all_institution_access()` when those should also pass.';

GRANT EXECUTE ON FUNCTION public.user_has_all_institution_access() TO authenticated;

-- ── 2. Migrate p_campaigns_insert ───────────────────────────
DROP POLICY IF EXISTS p_campaigns_insert ON public.admission_campaigns;

CREATE POLICY p_campaigns_insert ON public.admission_campaigns
  FOR INSERT
  WITH CHECK (
    is_super_admin()
    OR (
      scope = 'institution'
      AND (
        is_admin()
        OR (
          user_has_permission('admission.marketing.create')
          AND role_has_institution_access(institution_id)
        )
      )
    )
    OR (
      scope = 'global'
      AND (
        is_admin()
        OR (
          user_has_permission('admission.marketing.create')
          AND user_has_all_institution_access()
        )
      )
    )
  );

DO $$
BEGIN
  RAISE NOTICE 'p_campaigns_insert now allows global insert for marketing.create + scope=all users.';
END $$;
