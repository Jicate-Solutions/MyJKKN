-- ──────────────────────────────────────────────────────────────
-- Migration D: RLS policies for campaign tables + recursion-safe helper
-- See: docs/superpowers/specs/2026-05-12-admission-campaign-attribution-design.md §8.4
--
-- The SECURITY DEFINER helper _campaign_link_institution_id avoids the
-- 42P17 transitive-recursion loop that would otherwise happen when
-- admission_campaign_links policies query admission_campaigns (which
-- has its own policies). Pattern from memory feedback_rls_transitive_
-- recursion_via_exists.md and the existing _expo_event_institution_id
-- helper (see migration 20260428_expo_rls_recursion_hotfix.sql).
--
-- Project conventions (mirrored from existing admission/expo policies):
--   * user_has_permission(text)             — uses auth.uid() internally
--   * role_has_institution_access(uuid)     — uses auth.uid() internally
--   * Super-admin / admin bypass via is_super_admin() OR is_admin()
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _campaign_link_institution_id(p_link_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.institution_id
    FROM admission_campaign_links l
    JOIN admission_campaigns c ON c.id = l.campaign_id
   WHERE l.id = p_link_id;
$$;

GRANT EXECUTE ON FUNCTION _campaign_link_institution_id(uuid) TO authenticated;

ALTER TABLE admission_campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_campaign_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_campaign_link_clicks ENABLE ROW LEVEL SECURITY;

-- ──── admission_campaigns ────
DROP POLICY IF EXISTS p_campaigns_select ON admission_campaigns;
CREATE POLICY p_campaigns_select ON admission_campaigns FOR SELECT TO authenticated USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.campaigns.view')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS p_campaigns_insert ON admission_campaigns;
CREATE POLICY p_campaigns_insert ON admission_campaigns FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.campaigns.create')
      AND role_has_institution_access(institution_id))
);

DROP POLICY IF EXISTS p_campaigns_update ON admission_campaigns;
CREATE POLICY p_campaigns_update ON admission_campaigns FOR UPDATE TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.campaigns.edit')
        AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.campaigns.edit')
        AND role_has_institution_access(institution_id))
  );

-- No DELETE policy — soft-archive only via UPDATE archived_at

-- ──── admission_campaign_links ────
DROP POLICY IF EXISTS p_links_select ON admission_campaign_links;
CREATE POLICY p_links_select ON admission_campaign_links FOR SELECT TO authenticated USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.campaigns.view')
      AND role_has_institution_access(_campaign_link_institution_id(id)))
);

DROP POLICY IF EXISTS p_links_insert ON admission_campaign_links;
CREATE POLICY p_links_insert ON admission_campaign_links FOR INSERT TO authenticated WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.campaigns.create')
      AND EXISTS (
        SELECT 1 FROM admission_campaigns c
         WHERE c.id = campaign_id
           AND role_has_institution_access(c.institution_id)
      ))
);

DROP POLICY IF EXISTS p_links_update ON admission_campaign_links;
CREATE POLICY p_links_update ON admission_campaign_links FOR UPDATE TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.campaigns.edit')
        AND role_has_institution_access(_campaign_link_institution_id(id)))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.campaigns.edit')
        AND role_has_institution_access(_campaign_link_institution_id(id)))
  );

-- ──── admission_campaign_link_clicks ────
-- SELECT only for authenticated users; INSERT happens via service-role
-- from the /c/[token] route handler (anonymous public-side action).
DROP POLICY IF EXISTS p_clicks_select ON admission_campaign_link_clicks;
CREATE POLICY p_clicks_select ON admission_campaign_link_clicks FOR SELECT TO authenticated USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.campaigns.view')
      AND EXISTS (
        SELECT 1 FROM admission_campaigns c
         WHERE c.id = campaign_id
           AND role_has_institution_access(c.institution_id)
      ))
);
