-- =====================================================================
-- Admin Nav Overrides — DB layer for filesystem-auto-discovered admin nav
-- =====================================================================
-- Director's Approach 4 (2026-04-29): the filesystem (Agent M's
-- nav-tree.ts) auto-discovers /admin/* pages by default. THIS migration
-- adds an override layer so super_admins can rename, reorder, hide, or
-- recategorize any admin page from a UI without code changes.
--
-- Substrate: extend platform_policies with key prefix
-- `nav.admin.override.<href-with-slashes-replaced-by-dots>`. One row per
-- override. Empty value-shape fields are ignored by the merge layer.
--
-- Why platform_policies (not a dedicated table):
--   - Substrate-extending matches Director's Wave-3 preference (PR #595)
--   - One UI (/admin/nav-config) for ALL nav overrides
--   - Same RLS, same audit, same updated_by trigger
--
-- NO seed rows — overrides start empty; auto-discovery handles defaults.
--
-- Helper: fn_get_admin_nav_overrides() returns all override rows as
-- typed columns (parses the JSONB `value`). Read-side consumer is
-- Agent M's lib/admin/nav-tree.ts (merged via coordinator commit
-- AFTER both M and P merge).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_get_admin_nav_overrides()
  RETURNS TABLE (
    href text,
    category text,
    label text,
    display_order int,
    hidden boolean,
    icon text
  )
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT
    -- Reconstruct href: strip prefix, dots → slashes, prepend leading slash
    -- e.g. 'nav.admin.override.admin.notifications.recipients'
    --      → '/admin/notifications/recipients'
    '/' || replace(
      substring(policy_key from 'nav\.admin\.override\.(.*)'),
      '.',
      '/'
    ) AS href,
    value->>'category'              AS category,
    value->>'label'                 AS label,
    (value->>'displayOrder')::int   AS display_order,
    (value->>'hidden')::boolean     AS hidden,
    value->>'icon'                  AS icon
  FROM platform_policies
  WHERE policy_key LIKE 'nav.admin.override.%'
    AND scope_type = 'global'
    AND is_active = true;
$$;

COMMENT ON FUNCTION public.fn_get_admin_nav_overrides() IS
'Returns all admin nav override rows from platform_policies as typed columns. Used by lib/admin/nav-tree.ts to merge overrides into filesystem-auto-discovered nav. Director''s Approach 4 (2026-04-29).';

GRANT EXECUTE ON FUNCTION public.fn_get_admin_nav_overrides() TO authenticated, service_role;
