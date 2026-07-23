-- ──────────────────────────────────────────────────────────────
-- Migration I: Support global (cross-institution) campaigns
--
-- Adds:
--   * scope text NOT NULL DEFAULT 'institution'  ('institution'|'global')
--   * institution_id becomes nullable
--   * CHECK: scope='institution' ⇒ institution_id NOT NULL
--            scope='global'      ⇒ institution_id IS NULL
--   * RLS: global rows visible to anyone with admission.campaigns.view
--   * Global INSERT/UPDATE restricted to super_admin only
-- ──────────────────────────────────────────────────────────────

ALTER TABLE admission_campaigns
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'institution'
    CHECK (scope IN ('institution', 'global'));

ALTER TABLE admission_campaigns
  ALTER COLUMN institution_id DROP NOT NULL;

ALTER TABLE admission_campaigns
  DROP CONSTRAINT IF EXISTS chk_campaigns_scope_institution;

ALTER TABLE admission_campaigns
  ADD CONSTRAINT chk_campaigns_scope_institution
  CHECK (
    (scope = 'institution' AND institution_id IS NOT NULL)
    OR
    (scope = 'global' AND institution_id IS NULL)
  );

DROP POLICY IF EXISTS p_campaigns_select ON admission_campaigns;
CREATE POLICY p_campaigns_select ON admission_campaigns FOR SELECT TO authenticated USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.campaigns.view')
      AND (
        scope = 'global'
        OR role_has_institution_access(institution_id)
      ))
);

DROP POLICY IF EXISTS p_campaigns_insert ON admission_campaigns;
CREATE POLICY p_campaigns_insert ON admission_campaigns FOR INSERT TO authenticated WITH CHECK (
  is_super_admin()
  OR (
    scope = 'institution'
    AND (is_admin()
         OR (user_has_permission('admission.campaigns.create')
             AND role_has_institution_access(institution_id)))
  )
);

DROP POLICY IF EXISTS p_campaigns_update ON admission_campaigns;
CREATE POLICY p_campaigns_update ON admission_campaigns FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (
      scope = 'institution'
      AND (is_admin()
           OR (user_has_permission('admission.campaigns.edit')
               AND role_has_institution_access(institution_id)))
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      scope = 'institution'
      AND (is_admin()
           OR (user_has_permission('admission.campaigns.edit')
               AND role_has_institution_access(institution_id)))
    )
  );

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

CREATE OR REPLACE FUNCTION _campaign_link_is_global(p_link_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.scope = 'global'
    FROM admission_campaign_links l
    JOIN admission_campaigns c ON c.id = l.campaign_id
   WHERE l.id = p_link_id;
$$;

GRANT EXECUTE ON FUNCTION _campaign_link_is_global(uuid) TO authenticated;

DROP POLICY IF EXISTS p_links_select ON admission_campaign_links;
CREATE POLICY p_links_select ON admission_campaign_links FOR SELECT TO authenticated USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.campaigns.view')
      AND (
        _campaign_link_is_global(id)
        OR role_has_institution_access(_campaign_link_institution_id(id))
      ))
);

DROP POLICY IF EXISTS p_links_insert ON admission_campaign_links;
CREATE POLICY p_links_insert ON admission_campaign_links FOR INSERT TO authenticated WITH CHECK (
  is_super_admin()
  OR (user_has_permission('admission.campaigns.create')
      AND EXISTS (
        SELECT 1 FROM admission_campaigns c
         WHERE c.id = campaign_id
           AND (
             c.scope = 'global'
             OR role_has_institution_access(c.institution_id)
           )
      ))
);

DROP POLICY IF EXISTS p_links_update ON admission_campaign_links;
CREATE POLICY p_links_update ON admission_campaign_links FOR UPDATE TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.campaigns.edit')
        AND (
          _campaign_link_is_global(id)
          OR role_has_institution_access(_campaign_link_institution_id(id))
        ))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('admission.campaigns.edit')
        AND (
          _campaign_link_is_global(id)
          OR role_has_institution_access(_campaign_link_institution_id(id))
        ))
  );

DROP POLICY IF EXISTS p_clicks_select ON admission_campaign_link_clicks;
CREATE POLICY p_clicks_select ON admission_campaign_link_clicks FOR SELECT TO authenticated USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('admission.campaigns.view')
      AND EXISTS (
        SELECT 1 FROM admission_campaigns c
         WHERE c.id = campaign_id
           AND (
             c.scope = 'global'
             OR role_has_institution_access(c.institution_id)
           )
      ))
);

CREATE INDEX IF NOT EXISTS idx_campaigns_global_status
  ON admission_campaigns (status)
  WHERE scope = 'global' AND archived_at IS NULL;
