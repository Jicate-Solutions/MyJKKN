-- 20260809010000_analytics_10k_truncation_agg_rpcs.sql
--
-- fix(analytics): lift the PostgREST 10k silent truncation in the AI model
-- usage-summary route and the lifecycle dashboard's user-stats helpers via
-- set-based aggregate RPCs (same disease and same cure as PR #2778 /
-- 20260802030000_marketing_leads_facets_rpc.sql).
--
-- WHY: PostgREST silently caps every select at 10,000 rows and still returns
-- HTTP 200. `.limit(50000)` does NOT lift the cap (proven in this codebase —
-- the marketing leads DB measured 1 of 4 districts / 10,000 of 77,902 batch
-- rows before #2778). Three read-sites still fetched raw rows and aggregated
-- in JS:
--
--   1. /api/admin/ai-models/usage-summary — reads up to an 8-week window of
--      ai_model_usage (~242k rows in prod) with .limit(50000), then rolls up
--      calls/tokens/cost per (provider, model_id) in JS. Any window over 10k
--      invocations under-counts every model silently.
--   2. LifecycleDashboardService.getUserStatsSummary — profiles read (new-user
--      count over the data array is truncated; the `count: 'exact'` total was
--      already correct) + user_sessions window read (active users, avg logins,
--      avg duration, most-active role all computed over at most 10k sessions).
--   3. LifecycleDashboardService.getRoleDistribution — profiles read (role
--      totals AND the percentage denominator truncated at 10k) + user_sessions
--      window read (per-role active-user counts truncated).
--
-- Each function returns the FINAL aggregate shape the JS previously computed,
-- so the calling code passes the result straight through and response shapes
-- are byte-compatible. Semantics mirror the JS:
--
--   get_ai_model_usage_summary:
--     * group by (provider, model_id); NULLs fold to 'unknown' like `?? 'unknown'`
--     * calls = row count; tokens = sum(coalesce(input,0)+coalesce(output,0));
--       cost_inr = sum(coalesce(cost_inr,0)); last_used = max(invoked_at)
--     * window = invoked_at >= p_since; ordered calls DESC (tie: provider,
--       model_id — the JS tie order was Map insertion order, i.e. unspecified)
--   get_lifecycle_user_stats_summary:
--     * new_users compares the UTC calendar date of created_at against the
--       date range, exactly like the JS `created_at.split('T')[0]` compare
--     * session window mirrors PostgREST's UTC casts of `date_from` /
--       `date_to + 'T23:59:59'`
--     * rounding via round(x, 1) = JS Math.round(x*10)/10 for positive values
--     * most_active_role falls back to 'N/A' when the window has no sessions;
--       roles fold '' / NULL to 'unknown' like the JS `|| 'unknown'`
--   get_lifecycle_role_distribution:
--     * one row per role present in profiles (roles seen only in sessions are
--       dropped, matching the JS loop over the profiles map)
--     * percentage = round(total/grand_total*1000)/10 — same one-decimal math
--     * ordered total_count DESC (tie: role ASC; JS tie order was unspecified)
--
-- SECURITY:
--   * get_ai_model_usage_summary — SECURITY INVOKER, EXECUTE granted to
--     authenticated + service_role. The route calls it with the caller's own
--     SSR client, so the existing RLS policy `ai_model_usage_read_super_admin`
--     applies inside the function: non-super-admins get empty aggregates, the
--     exact visibility the old direct select had. No privilege escalation.
--   * get_lifecycle_user_stats_summary / get_lifecycle_role_distribution —
--     SECURITY INVOKER, EXECUTE locked to service_role only, following the
--     get_marketing_leads_facets pattern (#2778): the service calls them with
--     the service-role client after its own access-scope checks, and
--     platform-wide login analytics must not be invocable by anon /
--     authenticated directly.
--   * No SECURITY DEFINER anywhere in this file. All three functions revoke
--     PUBLIC / anon regardless (Supabase default-grants EXECUTE on new
--     functions).

-- ============================================================================
-- 1. AI model usage summary — /api/admin/ai-models/usage-summary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_ai_model_usage_summary(
  p_since timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider', g.provider,
        'model_id', g.model_id,
        'calls', g.calls,
        'tokens', g.tokens,
        'cost_inr', g.cost_inr,
        'last_used', g.last_used
      )
      ORDER BY g.calls DESC, g.provider, g.model_id
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      coalesce(provider, 'unknown')  AS provider,
      coalesce(model_id, 'unknown')  AS model_id,
      count(*)                       AS calls,
      sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)) AS tokens,
      sum(coalesce(cost_inr, 0))     AS cost_inr,
      max(invoked_at)                AS last_used
    FROM ai_model_usage
    WHERE invoked_at >= p_since
    GROUP BY 1, 2
  ) g;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ai_model_usage_summary(timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_model_usage_summary(timestamptz)
  TO authenticated, service_role;

-- ============================================================================
-- 2. Lifecycle user-stats summary — LifecycleDashboardService.getUserStatsSummary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_lifecycle_user_stats_summary(
  p_institution_id uuid,
  p_department_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH prof AS (
    SELECT
      count(*) AS total_users,
      count(*) FILTER (
        WHERE created_at IS NOT NULL
          AND (created_at AT TIME ZONE 'UTC')::date >= p_date_from
          AND (created_at AT TIME ZONE 'UTC')::date <= p_date_to
      ) AS new_users
    FROM profiles
    WHERE (p_institution_id IS NULL OR institution_id = p_institution_id)
      AND (p_department_id IS NULL OR department_id = p_department_id)
  ),
  windowed AS (
    -- Referenced twice below, so Postgres materializes it: ONE scan of
    -- user_sessions, matching the single sessions read the JS used to do.
    SELECT user_id, role::text AS role, duration_seconds
    FROM user_sessions
    WHERE login_at >= (p_date_from::timestamp AT TIME ZONE 'UTC')
      AND login_at <= ((p_date_to::text || ' 23:59:59')::timestamp AT TIME ZONE 'UTC')
      AND (p_institution_id IS NULL OR institution_id = p_institution_id)
      AND (p_department_id IS NULL OR department_id = p_department_id)
  ),
  sess AS (
    SELECT
      count(*)                                    AS total_sessions,
      count(DISTINCT user_id)                     AS active_users,
      sum(coalesce(duration_seconds, 0))          AS total_duration_seconds
    FROM windowed
  ),
  top_role AS (
    SELECT coalesce(nullif(role, ''), 'unknown') AS role
    FROM windowed
    GROUP BY 1
    ORDER BY count(*) DESC, 1
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'total_registered_users', prof.total_users,
    'active_users_in_period', sess.active_users,
    'new_users_in_period', prof.new_users,
    'avg_logins_per_user',
      CASE WHEN sess.active_users > 0
        THEN round(sess.total_sessions::numeric / sess.active_users, 1)
        ELSE 0 END,
    'avg_session_duration_minutes',
      CASE WHEN sess.total_sessions > 0
        THEN round(sess.total_duration_seconds::numeric / sess.total_sessions / 60, 1)
        ELSE 0 END,
    'most_active_role', coalesce((SELECT role FROM top_role), 'N/A'),
    'inactive_users_count', greatest(0, prof.total_users - sess.active_users)
  )
  FROM prof, sess;
$$;

REVOKE EXECUTE ON FUNCTION
  public.get_lifecycle_user_stats_summary(uuid, uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.get_lifecycle_user_stats_summary(uuid, uuid, date, date)
  TO service_role;

-- ============================================================================
-- 3. Lifecycle role distribution — LifecycleDashboardService.getRoleDistribution
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_lifecycle_role_distribution(
  p_institution_id uuid,
  p_department_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH prof AS (
    SELECT coalesce(nullif(role, ''), 'unknown') AS role, count(*) AS total_count
    FROM profiles
    WHERE (p_institution_id IS NULL OR institution_id = p_institution_id)
      AND (p_department_id IS NULL OR department_id = p_department_id)
    GROUP BY 1
  ),
  grand AS (
    SELECT coalesce(sum(total_count), 0) AS grand_total FROM prof
  ),
  active AS (
    SELECT coalesce(nullif(role::text, ''), 'unknown') AS role,
           count(DISTINCT user_id) AS active_count
    FROM user_sessions
    WHERE login_at >= (p_date_from::timestamp AT TIME ZONE 'UTC')
      AND login_at <= ((p_date_to::text || ' 23:59:59')::timestamp AT TIME ZONE 'UTC')
      AND (p_institution_id IS NULL OR institution_id = p_institution_id)
      AND (p_department_id IS NULL OR department_id = p_department_id)
    GROUP BY 1
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'role', p.role,
        'total_count', p.total_count,
        'active_count', coalesce(a.active_count, 0),
        'percentage',
          round((p.total_count::numeric / greatest(g.grand_total, 1)) * 1000) / 10
      )
      ORDER BY p.total_count DESC, p.role
    ),
    '[]'::jsonb
  )
  FROM prof p
  CROSS JOIN grand g
  LEFT JOIN active a ON a.role = p.role;
$$;

REVOKE EXECUTE ON FUNCTION
  public.get_lifecycle_role_distribution(uuid, uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.get_lifecycle_role_distribution(uuid, uuid, date, date)
  TO service_role;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.get_ai_model_usage_summary(timestamptz);
-- DROP FUNCTION IF EXISTS public.get_lifecycle_user_stats_summary(uuid, uuid, date, date);
-- DROP FUNCTION IF EXISTS public.get_lifecycle_role_distribution(uuid, uuid, date, date);
-- (Restore the previous route/service code in the same revert — the callers
--  raise/log loudly if the functions are missing.)
