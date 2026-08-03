-- 20260809020000_lifecycle_dashboard_residual_10k_agg_rpcs.sql
--
-- fix(analytics): finish the lifecycle-dashboard 10k truncation sweep — the
-- five residual JS-rollup sites PR #2802 (20260809010000) explicitly parked as
-- out of scope. Same disease and same cure as #2778 / #2802.
--
-- WHY: PostgREST silently caps every select at 10,000 rows and still returns
-- HTTP 200. `.limit(50000)` does NOT lift the cap — this is proven in this
-- codebase (the marketing-leads read measured 1 of 4 districts and 10,000 of
-- 77,902 batch rows before #2778) and must never be retried as a fix.
--
-- #2802 converted getUserStatsSummary and getRoleDistribution. The other four
-- helpers behind the same `/api/analytics/usage/user-stats` response were left
-- fetching raw rows and aggregating in JS, so every number they produce goes
-- silently wrong once the window exceeds 10,000 rows:
--
--   1. getLoginTrends        — user_sessions window read (login_at, user_id),
--                              rolled up per UTC day into total logins +
--                              distinct users. Past 10k sessions the whole
--                              trend line under-counts.
--   2. getLoginFrequency     — user_sessions window read (user_id), counted per
--                              user and bucketed 1 / 2-5 / 6-10 / 11-20 / 21+.
--                              Truncation both loses users and demotes the
--                              surviving ones into lower buckets.
--   3. getTopUsers           — user_sessions window read (user_id, role,
--                              login_at, duration_seconds) rolled up per user
--                              and sorted for a top-20 leaderboard. A truncated
--                              read can rank the wrong twenty users entirely.
--   4/5. getDepartmentBreakdown — TWO capped reads: profiles (per-department
--                              user counts) and user_sessions (per-department
--                              logins + active users).
--
-- Each function returns the FINAL aggregate shape the JS previously computed,
-- so the calling code passes the result straight through and the
-- UserStatsResponse payload is byte-compatible. Semantics mirror the JS:
--
--   get_lifecycle_login_trends:
--     * day bucket = the UTC calendar date of login_at, exactly like the JS
--       `login_at.split('T')[0]` on PostgREST's UTC serialization
--     * every day in [p_date_from, p_date_to] is emitted, zero-filled, in
--       ascending order — the JS filled the range client-side after grouping
--     * session window mirrors PostgREST's UTC casts of `date_from` /
--       `date_to + 'T23:59:59'`
--   get_lifecycle_login_frequency:
--     * per-user login counts bucketed with the identical boundaries
--       (=1, <=5, <=10, <=20, else); all five buckets are always present and
--       ordered 1, 2-5, 6-10, 11-20, 21+ like the JS object literal
--   get_lifecycle_top_users:
--     * per-user login_count / max(login_at) / sum(coalesce(duration,0)) over
--       the window, top 20 by login_count
--     * avg_session_minutes via round(x, 1) = JS Math.round(x*10)/10 for
--       positive values
--     * full_name folds NULL/'' to 'Unknown' and email folds NULL to '' like
--       the JS `|| 'Unknown'` / `|| ''`
--     * institution_name / department_name are OMITTED (jsonb_strip_nulls)
--       when absent, matching the JS `profile?.institutions?.name` producing
--       `undefined`, which JSON serialization drops
--     * DETERMINIZED, previously arbitrary: `role` now comes from the user's
--       most recent session in the window (the JS took whichever row PostgREST
--       happened to return first), and the top-20 tie order is user_id (the JS
--       tie order was Map insertion order, i.e. unspecified)
--   get_lifecycle_department_breakdown:
--     * one row per department matching the filters, even with zero users —
--       the JS mapped over the departments list, not over the rollups
--     * profiles/user_sessions rows with a NULL department_id are ignored,
--       exactly like the JS `if (p.department_id)` / `if (s.department_id)`
--     * avg_logins_per_user = round(total_logins/active_users, 1), 0 when no
--       active users — same one-decimal math
--     * DETERMINIZED, previously arbitrary: ties on total_logins now break by
--       department_name then id (the JS relied on PostgREST's row order)
--     * the departments read itself was the one uncapped select here and is
--       far below 10k rows in practice; it folds into this function anyway
--       because the whole helper becomes a single round trip
--
-- SECURITY:
--   * All four are SECURITY INVOKER with EXECUTE locked to service_role only,
--     following get_lifecycle_user_stats_summary / get_lifecycle_role_distribution
--     (#2802) and get_marketing_leads_facets (#2778). Verified before writing:
--     LifecycleDashboardService.getUserStats builds its client with
--     createServiceRoleClient() (lib/supabase/server.ts — SUPABASE_SERVICE_ROLE_KEY)
--     and hands that same client to all six helpers, after its own
--     EngagementService.getUserAccessScope check. Platform-wide login analytics
--     must not be invocable by anon / authenticated directly.
--   * No SECURITY DEFINER anywhere in this file.
--   * Every function revokes PUBLIC / anon / authenticated regardless, because
--     Supabase default-grants EXECUTE on newly created functions.

-- ============================================================================
-- 1. Login trends — LifecycleDashboardService.getLoginTrends
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_lifecycle_login_trends(
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
  WITH days AS (
    SELECT g::date AS day
    FROM generate_series(
      p_date_from::timestamp,
      p_date_to::timestamp,
      interval '1 day'
    ) AS g
  ),
  agg AS (
    SELECT
      (login_at AT TIME ZONE 'UTC')::date AS day,
      count(*)                            AS total_logins,
      count(DISTINCT user_id)             AS unique_users
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
        'date', to_char(d.day, 'YYYY-MM-DD'),
        'total_logins', coalesce(a.total_logins, 0),
        'unique_users', coalesce(a.unique_users, 0)
      )
      ORDER BY d.day
    ),
    '[]'::jsonb
  )
  FROM days d
  LEFT JOIN agg a ON a.day = d.day;
$$;

REVOKE EXECUTE ON FUNCTION
  public.get_lifecycle_login_trends(uuid, uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.get_lifecycle_login_trends(uuid, uuid, date, date)
  TO service_role;

-- ============================================================================
-- 2. Login frequency buckets — LifecycleDashboardService.getLoginFrequency
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_lifecycle_login_frequency(
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
  WITH per_user AS (
    SELECT user_id, count(*) AS login_count
    FROM user_sessions
    WHERE login_at >= (p_date_from::timestamp AT TIME ZONE 'UTC')
      AND login_at <= ((p_date_to::text || ' 23:59:59')::timestamp AT TIME ZONE 'UTC')
      AND (p_institution_id IS NULL OR institution_id = p_institution_id)
      AND (p_department_id IS NULL OR department_id = p_department_id)
    GROUP BY user_id
  ),
  bucketed AS (
    SELECT
      CASE
        WHEN login_count = 1  THEN '1'
        WHEN login_count <= 5 THEN '2-5'
        WHEN login_count <= 10 THEN '6-10'
        WHEN login_count <= 20 THEN '11-20'
        ELSE '21+'
      END      AS bucket,
      count(*) AS user_count
    FROM per_user
    GROUP BY 1
  ),
  labels (bucket, ord) AS (
    VALUES ('1', 1), ('2-5', 2), ('6-10', 3), ('11-20', 4), ('21+', 5)
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'bucket', l.bucket,
        'user_count', coalesce(b.user_count, 0)
      )
      ORDER BY l.ord
    ),
    '[]'::jsonb
  )
  FROM labels l
  LEFT JOIN bucketed b ON b.bucket = l.bucket;
$$;

REVOKE EXECUTE ON FUNCTION
  public.get_lifecycle_login_frequency(uuid, uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.get_lifecycle_login_frequency(uuid, uuid, date, date)
  TO service_role;

-- ============================================================================
-- 3. Top users leaderboard — LifecycleDashboardService.getTopUsers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_lifecycle_top_users(
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
  WITH windowed AS (
    -- Referenced twice below, so Postgres materializes it: ONE scan of
    -- user_sessions, matching the single sessions read the JS used to do.
    SELECT user_id, role::text AS role, login_at, duration_seconds
    FROM user_sessions
    WHERE login_at >= (p_date_from::timestamp AT TIME ZONE 'UTC')
      AND login_at <= ((p_date_to::text || ' 23:59:59')::timestamp AT TIME ZONE 'UTC')
      AND (p_institution_id IS NULL OR institution_id = p_institution_id)
      AND (p_department_id IS NULL OR department_id = p_department_id)
  ),
  agg AS (
    SELECT
      user_id,
      count(*)                           AS login_count,
      max(login_at)                      AS last_login,
      sum(coalesce(duration_seconds, 0)) AS total_duration
    FROM windowed
    GROUP BY user_id
  ),
  top20 AS (
    SELECT * FROM agg
    ORDER BY login_count DESC, user_id
    LIMIT 20
  ),
  role_pick AS (
    -- Only for the surviving twenty: the role on their most recent session.
    SELECT DISTINCT ON (w.user_id)
      w.user_id,
      coalesce(nullif(w.role, ''), 'unknown') AS role
    FROM windowed w
    JOIN top20 t ON t.user_id = w.user_id
    ORDER BY w.user_id, w.login_at DESC
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'user_id', t.user_id,
          'full_name', coalesce(nullif(p.full_name, ''), 'Unknown'),
          'email', coalesce(p.email, ''),
          'role', coalesce(r.role, 'unknown'),
          'login_count', t.login_count,
          'last_login', t.last_login,
          'avg_session_minutes',
            CASE WHEN t.login_count > 0
              THEN round(t.total_duration::numeric / t.login_count / 60, 1)
              ELSE 0 END,
          'institution_name', i.name,
          'department_name', d.department_name
        )
      )
      ORDER BY t.login_count DESC, t.user_id
    ),
    '[]'::jsonb
  )
  FROM top20 t
  LEFT JOIN role_pick r   ON r.user_id = t.user_id
  LEFT JOIN profiles p    ON p.id = t.user_id
  LEFT JOIN institutions i ON i.id = p.institution_id
  LEFT JOIN departments d  ON d.id = p.department_id;
$$;

REVOKE EXECUTE ON FUNCTION
  public.get_lifecycle_top_users(uuid, uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.get_lifecycle_top_users(uuid, uuid, date, date)
  TO service_role;

-- ============================================================================
-- 4. Department breakdown — LifecycleDashboardService.getDepartmentBreakdown
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_lifecycle_department_breakdown(
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
  WITH depts AS (
    SELECT id, department_name
    FROM departments
    WHERE (p_institution_id IS NULL OR institution_id = p_institution_id)
      AND (p_department_id IS NULL OR id = p_department_id)
  ),
  prof AS (
    SELECT department_id, count(*) AS total_users
    FROM profiles
    WHERE department_id IS NOT NULL
      AND (p_institution_id IS NULL OR institution_id = p_institution_id)
      AND (p_department_id IS NULL OR department_id = p_department_id)
    GROUP BY department_id
  ),
  sess AS (
    SELECT
      department_id,
      count(*)                AS total_logins,
      count(DISTINCT user_id) AS active_users
    FROM user_sessions
    WHERE department_id IS NOT NULL
      AND login_at >= (p_date_from::timestamp AT TIME ZONE 'UTC')
      AND login_at <= ((p_date_to::text || ' 23:59:59')::timestamp AT TIME ZONE 'UTC')
      AND (p_institution_id IS NULL OR institution_id = p_institution_id)
      AND (p_department_id IS NULL OR department_id = p_department_id)
    GROUP BY department_id
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'department_id', d.id,
        'department_name', d.department_name,
        'total_users', coalesce(p.total_users, 0),
        'active_users', coalesce(s.active_users, 0),
        'total_logins', coalesce(s.total_logins, 0),
        'avg_logins_per_user',
          CASE WHEN coalesce(s.active_users, 0) > 0
            THEN round(s.total_logins::numeric / s.active_users, 1)
            ELSE 0 END
      )
      ORDER BY coalesce(s.total_logins, 0) DESC, d.department_name, d.id
    ),
    '[]'::jsonb
  )
  FROM depts d
  LEFT JOIN prof p ON p.department_id = d.id
  LEFT JOIN sess s ON s.department_id = d.id;
$$;

REVOKE EXECUTE ON FUNCTION
  public.get_lifecycle_department_breakdown(uuid, uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.get_lifecycle_department_breakdown(uuid, uuid, date, date)
  TO service_role;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.get_lifecycle_login_trends(uuid, uuid, date, date);
-- DROP FUNCTION IF EXISTS public.get_lifecycle_login_frequency(uuid, uuid, date, date);
-- DROP FUNCTION IF EXISTS public.get_lifecycle_top_users(uuid, uuid, date, date);
-- DROP FUNCTION IF EXISTS public.get_lifecycle_department_breakdown(uuid, uuid, date, date);
-- (Restore the previous service code in the same revert — the callers log
--  loudly and fall back to empty results if the functions are missing.)
