-- Migration: fast social-insights summary RPCs (fix Insights tab hang)
-- Date: 2026-07-13
-- Problem:
--   GET /api/social/instagram/insights/summary (and the Facebook mirror) hung
--   for 40s+ (request stayed `pending`, skeleton loaders never filled). Root
--   cause verified via EXPLAIN ANALYZE under the authenticated role: the route
--   ran the user-session (RLS) client in a 20-page OFFSET loop over
--   ig_account_metrics / fb_page_metrics. Each page sorts the ENTIRE
--   RLS-filtered set (~49k ig rows) — the ig_account_metrics/fb_page_metrics
--   SELECT policies wrap an EXISTS + user_has_permission()/role_has_institution_access()
--   evaluated across the scan — so one page ≈ 1s and the two loops stack to 40s+.
--   A DISTINCT ON latest-per-account (service role, RLS bypassed) is 46ms.
-- Fix:
--   Two SECURITY DEFINER RPCs that (a) resolve the caller's VISIBLE accounts
--   ONCE by REPLICATING the exact table RLS OR-logic, then (b) aggregate with
--   indexed DISTINCT ON queries — no per-row RLS, no offset loop. Collapses ~40
--   round-trips into one ~50ms call. Definer bypasses RLS on the metrics tables
--   by design; the `visible` CTE is the security boundary and mirrors the two
--   permissive SELECT policies on ig_accounts / fb_pages exactly.
-- Safety: read-only STABLE functions. REVOKE anon per repo policy; only
--   `authenticated` may execute (route already 401s anon before calling).

-- ─────────────────────────────────────────────────────────────────────────────
-- Instagram
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_ig_insights_summary(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT (now() - (LEAST(GREATEST(COALESCE(p_days, 30), 1), 365)::text || ' days')::interval) AS since
  ),
  -- Security boundary: mirrors ig_accounts RLS (two permissive SELECT policies,
  -- OR'd): (institution match OR super admin) OR (perm AND institution access).
  visible AS (
    SELECT a.id, a.username, i.name AS institution_name
    FROM ig_accounts a
    LEFT JOIN institutions i ON i.id = a.institution_id
    WHERE (a.institution_id = auth_institution_id() OR is_super_admin())
       OR (user_has_permission('social.instagram.view'::text)
           AND role_has_institution_access(a.institution_id))
  ),
  latest AS (
    SELECT DISTINCT ON (m.account_id)
           m.account_id, m.followers, m.reach, m.impressions, m.total_interactions
    FROM ig_account_metrics m
    WHERE m.account_id IN (SELECT id FROM visible)
    ORDER BY m.account_id, m.snapshot_at DESC, m.id DESC
  ),
  firstwin AS (
    SELECT DISTINCT ON (m.account_id)
           m.account_id, m.followers
    FROM ig_account_metrics m, params
    WHERE m.account_id IN (SELECT id FROM visible)
      AND m.snapshot_at >= params.since
    ORDER BY m.account_id, m.snapshot_at ASC, m.id ASC
  ),
  posts AS (
    SELECT count(*)::int AS c
    FROM ig_posts p, params
    WHERE p.account_id IN (SELECT id FROM visible)
      AND p.posted_at >= params.since
  ),
  account_rows AS (
    SELECT
      v.id,
      v.username,
      COALESCE(v.institution_name, '') AS institution_name,
      COALESCE(l.followers, 0)   AS followers,
      CASE WHEN l.followers IS NOT NULL AND f.followers IS NOT NULL
           THEN l.followers - f.followers ELSE 0 END AS followers_gained,
      COALESCE(l.reach, 0)       AS reach,
      COALESCE(l.impressions, 0) AS impressions,
      CASE WHEN l.total_interactions IS NOT NULL AND COALESCE(l.followers, 0) > 0
           THEN round((l.total_interactions::numeric / l.followers) * 100, 2)
           ELSE NULL END AS engagement_rate
    FROM visible v
    LEFT JOIN latest l   ON l.account_id = v.id
    LEFT JOIN firstwin f ON f.account_id = v.id
  )
  SELECT jsonb_build_object(
    'accounts', COALESCE(
      (SELECT jsonb_agg(to_jsonb(ar) ORDER BY ar.username ASC) FROM account_rows ar),
      '[]'::jsonb),
    'totals', jsonb_build_object(
      'followers',   COALESCE((SELECT sum(followers)   FROM account_rows), 0),
      'reach',       COALESCE((SELECT sum(reach)        FROM account_rows), 0),
      'impressions', COALESCE((SELECT sum(impressions)  FROM account_rows), 0),
      'posts',       COALESCE((SELECT c FROM posts), 0)
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ig_insights_summary(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ig_insights_summary(integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Facebook (mirror; page-scoped, includes per-page posts_in_window)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_fb_insights_summary(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT (now() - (LEAST(GREATEST(COALESCE(p_days, 30), 1), 365)::text || ' days')::interval) AS since
  ),
  -- Mirrors fb_pages RLS (two permissive SELECT policies, OR'd).
  visible AS (
    SELECT a.id, a.name, i.name AS institution_name
    FROM fb_pages a
    LEFT JOIN institutions i ON i.id = a.institution_id
    WHERE (a.institution_id = auth_institution_id() OR is_super_admin())
       OR (user_has_permission('social.facebook.view'::text)
           AND role_has_institution_access(a.institution_id))
  ),
  latest AS (
    SELECT DISTINCT ON (m.page_id)
           m.page_id, m.fan_count, m.impressions_unique, m.post_engagements
    FROM fb_page_metrics m
    WHERE m.page_id IN (SELECT id FROM visible)
    ORDER BY m.page_id, m.snapshot_at DESC, m.id DESC
  ),
  firstwin AS (
    SELECT DISTINCT ON (m.page_id)
           m.page_id, m.fan_count
    FROM fb_page_metrics m, params
    WHERE m.page_id IN (SELECT id FROM visible)
      AND m.snapshot_at >= params.since
    ORDER BY m.page_id, m.snapshot_at ASC, m.id ASC
  ),
  posts AS (
    SELECT p.page_id, count(*)::int AS c
    FROM fb_posts p, params
    WHERE p.page_id IN (SELECT id FROM visible)
      AND p.posted_at >= params.since
    GROUP BY p.page_id
  ),
  page_rows AS (
    SELECT
      v.id,
      v.name,
      COALESCE(v.institution_name, '') AS institution_name,
      COALESCE(l.fan_count, 0) AS fans,
      CASE WHEN l.fan_count IS NOT NULL AND f.fan_count IS NOT NULL
           THEN l.fan_count - f.fan_count ELSE 0 END AS fans_gained,
      COALESCE(l.impressions_unique, 0) AS impressions_unique,
      COALESCE(l.post_engagements, 0)   AS post_engagements,
      COALESCE(pc.c, 0)                 AS posts_in_window
    FROM visible v
    LEFT JOIN latest l   ON l.page_id = v.id
    LEFT JOIN firstwin f ON f.page_id = v.id
    LEFT JOIN posts pc   ON pc.page_id = v.id
  )
  SELECT jsonb_build_object(
    'pages', COALESCE(
      (SELECT jsonb_agg(to_jsonb(pr) ORDER BY pr.name ASC) FROM page_rows pr),
      '[]'::jsonb),
    'totals', jsonb_build_object(
      'fans',               COALESCE((SELECT sum(fans)               FROM page_rows), 0),
      'impressions_unique', COALESCE((SELECT sum(impressions_unique) FROM page_rows), 0),
      'post_engagements',   COALESCE((SELECT sum(post_engagements)   FROM page_rows), 0),
      'posts',              COALESCE((SELECT sum(posts_in_window)    FROM page_rows), 0)
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_fb_insights_summary(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_fb_insights_summary(integer) TO authenticated;
