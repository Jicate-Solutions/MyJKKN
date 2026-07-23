-- 2026-06-11: fb_pages.access_token column-level lockdown (#1282 follow-up,
-- "Security observation").
--
-- Problem: fb_pages.access_token (per-page Meta Graph token, ~60-day
-- long-lived) was readable via PostgREST by ANY authenticated user whose
-- institution_id matched the row (fb_pages_select RLS, migration
-- 20260530160000). Page tokens were exposed well beyond admins — a student
-- account at the same institution could read them and call the Meta Graph
-- API as the Page.
--
-- Fix: column-level privileges, mirroring the ig_account_connections
-- precedent (migration 20260610213000_ig_account_connections.sql):
-- REVOKE ALL from authenticated, then GRANT SELECT on every column EXCEPT
-- access_token. The fb_pages_select RLS policy stays in place — column
-- grants limit WHICH columns, RLS keeps limiting WHICH rows.
--
-- Blast radius (verified by repo-wide sweep on jicate/main, 2026-06-11):
--   * Authenticated-context readers all use explicit column lists without
--     access_token and keep working:
--       - app/(routes)/admission/social/facebook/page.tsx  (id, fb_page_id)
--       - app/api/social/facebook/insights/summary/route.ts (id, name,
--         institutions(name))
--   * The ONLY authenticated-context access_token read —
--     app/api/admin/social/lead-ads/forms/route.ts — was switched to the
--     service-role client (after its admin gate) in the same PR as this
--     migration. No select('*') on fb_pages exists anywhere in the repo.
--   * Sibling-table RLS policies (fb_page_metrics / fb_posts /
--     fb_post_metrics / social_facebook_logs) subquery fb_pages on id +
--     institution_id only — both remain granted, so those policies keep
--     evaluating for authenticated users.
--   * All writes already flow through service_role (no authenticated write
--     policies exist), so revoking INSERT/UPDATE/DELETE changes nothing.
--
-- ORDERING: apply this migration AFTER the companion code change is merged
-- AND deployed. The new code is tolerant both before and after; applying
-- the migration before the deploy would break the OLD code's authenticated
-- token read in the forms-sync route.

REVOKE ALL ON public.fb_pages FROM anon, PUBLIC, authenticated;

GRANT SELECT (
  id,
  institution_id,
  department_id,
  fb_page_id,
  username,
  name,
  category,
  link,
  picture_url,
  fan_count,
  followers_count,
  connected_at,
  connected_by,
  status,
  last_polled_at,
  last_post_at,
  created_at,
  updated_at
) ON public.fb_pages TO authenticated;

COMMENT ON COLUMN public.fb_pages.access_token IS
  'Per-page Meta Graph access token (long-lived ~60 days, minted from the System User token by the facebook poll cron). service_role-only via column-level grants since 2026-06-11 — intentionally EXCLUDED from the authenticated GRANT SELECT list. Server routes that need it must use the service-role client after their own admin gate.';

COMMENT ON TABLE public.fb_pages IS
  'Connected Facebook Pages per institution. Reads for authenticated users are column-restricted (access_token is service_role-only) and row-scoped by the fb_pages_select RLS policy; all writes flow through service_role.';

-- PostgREST schema-cache refresh (no-op under supabase CLI apply, required
-- when this file is applied via raw exec_sql — see
-- feedback_exec_sql_ddl_needs_pgrst_schema_reload).
NOTIFY pgrst, 'reload schema';
