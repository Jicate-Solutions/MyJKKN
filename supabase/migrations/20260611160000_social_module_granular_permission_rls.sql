-- ============================================================================
-- Social Media module — granular permission RLS retrofit (2026-06-11)
-- ============================================================================
-- The /admission/social/* surfaces were hardcoded to super_admin at every
-- layer. The permission catalog now defines `social.*` keys
-- (lib/constants/permissions.ts) grantable per role via Role Management.
--
-- This migration ADDS permissive policies gated on user_has_permission() to
-- the social substrate tables. Existing policies are left untouched —
-- permissive policies OR together, so current access (super_admin /
-- institution match / is_admin) is preserved and the new keys only widen
-- access for roles explicitly granted them.
--
-- Key map:
--   social.facebook.view        fb_* + social_facebook_logs
--   social.instagram.view       ig_* (accounts/posts/metrics/audit/stories) + logs
--   social.messenger.view       messenger_* + ig_dm_*
--   social.ads.view             meta_ad_accounts / meta_ad_insights / meta_campaigns
--   social.lead_ads.view/.manage  meta_leadgen_events / meta_lead_forms / mappings
--   social.meta_pixel.view      meta_capi_events
--   social.meta_audiences.view/.manage  meta_audience_rules / sync_history
--   social.departments.view     social_dept_accounts (+ ig_account_connections)
--   social.attribution.edit     platform_policies (ig.attribution_window_days only)
--   social.view                 meta_business_accounts / meta_subscription_audit
-- ============================================================================

-- ── Facebook ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS fb_pages_social_perm_read ON public.fb_pages;
CREATE POLICY fb_pages_social_perm_read ON public.fb_pages
  FOR SELECT TO authenticated
  USING (user_has_permission('social.facebook.view'));

DROP POLICY IF EXISTS fb_posts_social_perm_read ON public.fb_posts;
CREATE POLICY fb_posts_social_perm_read ON public.fb_posts
  FOR SELECT TO authenticated
  USING (user_has_permission('social.facebook.view'));

DROP POLICY IF EXISTS fb_page_metrics_social_perm_read ON public.fb_page_metrics;
CREATE POLICY fb_page_metrics_social_perm_read ON public.fb_page_metrics
  FOR SELECT TO authenticated
  USING (user_has_permission('social.facebook.view'));

DROP POLICY IF EXISTS fb_post_metrics_social_perm_read ON public.fb_post_metrics;
CREATE POLICY fb_post_metrics_social_perm_read ON public.fb_post_metrics
  FOR SELECT TO authenticated
  USING (user_has_permission('social.facebook.view'));

DROP POLICY IF EXISTS social_facebook_logs_social_perm_read ON public.social_facebook_logs;
CREATE POLICY social_facebook_logs_social_perm_read ON public.social_facebook_logs
  FOR SELECT TO authenticated
  USING (user_has_permission('social.facebook.view'));

-- ── Instagram ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS ig_accounts_social_perm_read ON public.ig_accounts;
CREATE POLICY ig_accounts_social_perm_read ON public.ig_accounts
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS ig_posts_social_perm_read ON public.ig_posts;
CREATE POLICY ig_posts_social_perm_read ON public.ig_posts
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS ig_post_metrics_social_perm_read ON public.ig_post_metrics;
CREATE POLICY ig_post_metrics_social_perm_read ON public.ig_post_metrics
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS ig_account_metrics_social_perm_read ON public.ig_account_metrics;
CREATE POLICY ig_account_metrics_social_perm_read ON public.ig_account_metrics
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS ig_monthly_audit_social_perm_read ON public.ig_monthly_audit;
CREATE POLICY ig_monthly_audit_social_perm_read ON public.ig_monthly_audit
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS ig_stories_social_perm_read ON public.ig_stories;
CREATE POLICY ig_stories_social_perm_read ON public.ig_stories
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS ig_story_insights_social_perm_read ON public.ig_story_insights;
CREATE POLICY ig_story_insights_social_perm_read ON public.ig_story_insights
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

DROP POLICY IF EXISTS social_instagram_logs_social_perm_read ON public.social_instagram_logs;
CREATE POLICY social_instagram_logs_social_perm_read ON public.social_instagram_logs
  FOR SELECT TO authenticated
  USING (user_has_permission('social.instagram.view'));

-- IG-login connections surface on both the Instagram and Dept Accounts pages.
DROP POLICY IF EXISTS ig_account_connections_social_perm_read ON public.ig_account_connections;
CREATE POLICY ig_account_connections_social_perm_read ON public.ig_account_connections
  FOR SELECT TO authenticated
  USING (
    user_has_permission('social.instagram.view')
    OR user_has_permission('social.departments.view')
  );

-- ── Messenger / Instagram DMs ───────────────────────────────────────────────

DROP POLICY IF EXISTS messenger_conversations_social_perm_read ON public.messenger_conversations;
CREATE POLICY messenger_conversations_social_perm_read ON public.messenger_conversations
  FOR SELECT TO authenticated
  USING (user_has_permission('social.messenger.view'));

DROP POLICY IF EXISTS messenger_messages_social_perm_read ON public.messenger_messages;
CREATE POLICY messenger_messages_social_perm_read ON public.messenger_messages
  FOR SELECT TO authenticated
  USING (user_has_permission('social.messenger.view'));

DROP POLICY IF EXISTS ig_dm_conversations_social_perm_read ON public.ig_dm_conversations;
CREATE POLICY ig_dm_conversations_social_perm_read ON public.ig_dm_conversations
  FOR SELECT TO authenticated
  USING (user_has_permission('social.messenger.view'));

DROP POLICY IF EXISTS ig_dm_messages_social_perm_read ON public.ig_dm_messages;
CREATE POLICY ig_dm_messages_social_perm_read ON public.ig_dm_messages
  FOR SELECT TO authenticated
  USING (user_has_permission('social.messenger.view'));

-- ── Ads ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS meta_ad_accounts_social_perm_read ON public.meta_ad_accounts;
CREATE POLICY meta_ad_accounts_social_perm_read ON public.meta_ad_accounts
  FOR SELECT TO authenticated
  USING (user_has_permission('social.ads.view'));

DROP POLICY IF EXISTS meta_ad_insights_social_perm_read ON public.meta_ad_insights;
CREATE POLICY meta_ad_insights_social_perm_read ON public.meta_ad_insights
  FOR SELECT TO authenticated
  USING (user_has_permission('social.ads.view'));

DROP POLICY IF EXISTS meta_campaigns_social_perm_read ON public.meta_campaigns;
CREATE POLICY meta_campaigns_social_perm_read ON public.meta_campaigns
  FOR SELECT TO authenticated
  USING (user_has_permission('social.ads.view'));

-- ── Lead Ads ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS meta_leadgen_events_social_perm_read ON public.meta_leadgen_events;
CREATE POLICY meta_leadgen_events_social_perm_read ON public.meta_leadgen_events
  FOR SELECT TO authenticated
  USING (user_has_permission('social.lead_ads.view'));

-- meta_lead_forms / meta_lead_field_mappings SELECT is already open to all
-- authenticated users; only the writes (admin mappings editor + form sync,
-- which run through the user-session client) need the manage key.
DROP POLICY IF EXISTS meta_lead_forms_social_perm_write ON public.meta_lead_forms;
CREATE POLICY meta_lead_forms_social_perm_write ON public.meta_lead_forms
  FOR ALL TO authenticated
  USING (user_has_permission('social.lead_ads.manage'))
  WITH CHECK (user_has_permission('social.lead_ads.manage'));

DROP POLICY IF EXISTS meta_lead_field_mappings_social_perm_write ON public.meta_lead_field_mappings;
CREATE POLICY meta_lead_field_mappings_social_perm_write ON public.meta_lead_field_mappings
  FOR ALL TO authenticated
  USING (user_has_permission('social.lead_ads.manage'))
  WITH CHECK (user_has_permission('social.lead_ads.manage'));

-- ── Meta Pixel / CAPI ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS meta_capi_events_social_perm_read ON public.meta_capi_events;
CREATE POLICY meta_capi_events_social_perm_read ON public.meta_capi_events
  FOR SELECT TO authenticated
  USING (user_has_permission('social.meta_pixel.view'));

-- ── Meta Audiences ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS meta_audience_rules_social_perm_read ON public.meta_audience_rules;
CREATE POLICY meta_audience_rules_social_perm_read ON public.meta_audience_rules
  FOR SELECT TO authenticated
  USING (user_has_permission('social.meta_audiences.view'));

-- The Meta Audiences page mutates rules through the browser client
-- (lib/services/marketing/remarketing-service.ts), so writes need policies.
DROP POLICY IF EXISTS meta_audience_rules_social_perm_insert ON public.meta_audience_rules;
CREATE POLICY meta_audience_rules_social_perm_insert ON public.meta_audience_rules
  FOR INSERT TO authenticated
  WITH CHECK (user_has_permission('social.meta_audiences.manage'));

DROP POLICY IF EXISTS meta_audience_rules_social_perm_update ON public.meta_audience_rules;
CREATE POLICY meta_audience_rules_social_perm_update ON public.meta_audience_rules
  FOR UPDATE TO authenticated
  USING (user_has_permission('social.meta_audiences.manage'))
  WITH CHECK (user_has_permission('social.meta_audiences.manage'));

DROP POLICY IF EXISTS meta_audience_rules_social_perm_delete ON public.meta_audience_rules;
CREATE POLICY meta_audience_rules_social_perm_delete ON public.meta_audience_rules
  FOR DELETE TO authenticated
  USING (user_has_permission('social.meta_audiences.manage'));

DROP POLICY IF EXISTS meta_audience_sync_history_social_perm_read ON public.meta_audience_sync_history;
CREATE POLICY meta_audience_sync_history_social_perm_read ON public.meta_audience_sync_history
  FOR SELECT TO authenticated
  USING (user_has_permission('social.meta_audiences.view'));

-- ── Dept Accounts ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS social_dept_accounts_social_perm_read ON public.social_dept_accounts;
CREATE POLICY social_dept_accounts_social_perm_read ON public.social_dept_accounts
  FOR SELECT TO authenticated
  USING (user_has_permission('social.departments.view'));

-- ── Shared Meta substrate ───────────────────────────────────────────────────

DROP POLICY IF EXISTS meta_business_accounts_social_perm_read ON public.meta_business_accounts;
CREATE POLICY meta_business_accounts_social_perm_read ON public.meta_business_accounts
  FOR SELECT TO authenticated
  USING (user_has_permission('social.view'));

DROP POLICY IF EXISTS meta_subscription_audit_social_perm_read ON public.meta_subscription_audit;
CREATE POLICY meta_subscription_audit_social_perm_read ON public.meta_subscription_audit
  FOR SELECT TO authenticated
  USING (user_has_permission('social.view'));

-- ── Attribution window policy ───────────────────────────────────────────────
-- The attribution page edits ONE platform_policies row from the browser.
-- Scope the new write policies to that exact policy_key so the
-- social.attribution.edit key cannot touch any other platform policy.

DROP POLICY IF EXISTS platform_policies_social_attr_insert ON public.platform_policies;
CREATE POLICY platform_policies_social_attr_insert ON public.platform_policies
  FOR INSERT TO authenticated
  WITH CHECK (
    policy_key = 'ig.attribution_window_days'
    AND user_has_permission('social.attribution.edit')
  );

DROP POLICY IF EXISTS platform_policies_social_attr_update ON public.platform_policies;
CREATE POLICY platform_policies_social_attr_update ON public.platform_policies
  FOR UPDATE TO authenticated
  USING (
    policy_key = 'ig.attribution_window_days'
    AND user_has_permission('social.attribution.edit')
  )
  WITH CHECK (
    policy_key = 'ig.attribution_window_days'
    AND user_has_permission('social.attribution.edit')
  );
