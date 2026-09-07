-- 20260809020000_lifecycle_truncation_wave2_rpcs.sql
--
-- fix(analytics): lift the PostgREST 10k silent truncation in the FIVE
-- remaining `.limit(50000)` read-sites of LifecycleDashboardService — wave 2 of
-- the same disease and the same cure as 20260809010000 (#2802) and
-- 20260802030000_marketing_leads_facets_rpc.sql (#2778).
--
-- WHY: PostgREST silently caps every select at 10,000 rows and still returns
-- HTTP 200. `.limit(50000)` does NOT lift the cap — proven in this codebase
-- (the marketing leads DB measured 1 of 4 districts / 10,000 of 77,902 batch
-- rows before #2778). Wave 1 fixed getUserStatsSummary + getRoleDistribution.
-- Four helpers behind the SAME `/api/analytics/usage/user-stats` response were
-- left fetching raw rows and rolling them up in JS:
--
--   1. getLoginTrends           — user_sessions window read, then per-day
--      counts. Past 10,000 sessions in the window every day of the login-
--      activity chart is under-counted, and the under-count is invisible.
--   2. getLoginFrequency        — same window read, then logins-per-user
--      bucketing. Truncation moves users DOWN a bucket (a 30-login user whose
--      rows fell past row 10,000 is counted as a 3-login user), so the shape of
--      the distribution is wrong, not merely its scale.
--   3. getTopUsers              — same window read, then per-user rollup and
--      "top 20". Truncation can drop a genuinely top-20 user out of the table
--      entirely and admit a quiet one in their place.
--   4. getDepartmentBreakdown   — TWO capped reads (profiles for total_users,
--      user_sessions for logins/active users), so both columns of the
--      department chart truncate independently.
--
-- Each function returns the FINAL aggregate shape the JS previously computed,
-- so the calling code passes the result straight through and the
-- UserStatsResponse payload stays byte-compatible for
-- app/(routes)/learners/lifecycle/_components/user-stats-tab.tsx.
--
-- SEMANTICS — mirrored from the JS, deviations named explicitly:
--   * Session window mirrors PostgREST's UTC casts of `date_from` and
--     `date_to + 'T23:59:59'`, identical to the wave-1 functions so the summary
--     card and these charts describe the same set of sessions.
--   * Day bucketing uses the UTC calendar date of login_at, matching the JS
--     `row.login_at.split('T')[0]` over PostgREST's UTC-rendered timestamps.
--   * get_lifecycle_login_trends emits ONE entry per calendar day from
--     p_date_from to p_date_to inclusive, zero-filled — the JS filled the range
--     the same way, and the chart depends on it.
--   * get_lifecycle_login_frequency always emits ALL FIVE buckets in the fixed
--     order 1 / 2-5 / 6-10 / 11-20 / 21+, including zeros. The tab renders the
--     array positionally and tests `.every(b => b.user_count === 0)` for its
--     empty state, so a compacted array would reorder the x-axis.
--   * rounding via round(x, 1) = JS Math.round(x*10)/10 for positive values.
--   * roles fold '' / NULL to 'unknown' like the JS `|| 'unknown'`;
--     full_name folds NULL/'' to 'Unknown' and email NULL to '' like the JS
--     `profile?.full_name || 'Unknown'` / `profile?.email || ''`.
--   * jsonb_strip_nulls on each top-user object reproduces JSON.stringify
--     dropping `institution_name` / `department_name` when the profile has no
--     institution or department (the JS produced `undefined` there, which the
--     route's NextResponse.json omits).
--   * DETERMINISM, deliberately stronger than the JS: the JS tie-breaks were
--     Map insertion order, i.e. PostgREST's unspecified row order.
--       - top users order by login_count DESC, then last_login DESC, then
--         user_id;
--       - a top user's `role` is the role on their MOST RECENT session in the
--         window (the JS took whichever session row arrived first);
--       - departments order by total_logins DESC, then department_name, then id.
--     Same shape, same values, reproducible ordering.
--
-- SECURITY: all four are SECURITY INVOKER, SET search_path = public, EXECUTE
-- revoked from PUBLIC / anon / authenticated and granted to service_role ONLY —
-- the wave-1 posture for these same helpers. LifecycleDashboardService calls
-- them with the service-role client AFTER the route's auth + role check and the
-- service's own access-scope resolution, and platform-wide login analytics must
-- not be invocable directly by anon / authenticated. No SECURITY DEFINER here.
-- Read-only: no DML, no DDL on existing objects, no new grants to anyone else.

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
    SELECT d::date AS day
    FROM generate_series(p_date_from, p_date_to, interval '1 day') AS d
  ),
  sess AS (
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
        'total_logins', coalesce(s.total_logins, 0),
        'unique_users', coalesce(s.unique_users, 0)
      )
      ORDER BY d.day
    ),
    '[]'::jsonb
  )
  FROM days d
  LEFT JOIN sess s ON s.day = d.day;
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
    SELECT user_id, count(*) AS logins
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
        WHEN logins = 1  THEN '1'
        WHEN logins <= 5 THEN '2-5'
        WHEN logins <= 10 THEN '6-10'
        WHEN logins <= 20 THEN '11-20'
        ELSE '21+'
      END      AS bucket,
      count(*) AS user_count
    FROM per_user
    GROUP BY 1
  ),
  -- The five buckets are emitted unconditionally and in this order; the chart
  -- reads the array positionally.
  buckets (bucket, ord) AS (
    VALUES ('1', 1), ('2-5', 2), ('6-10', 3), ('11-20', 4), ('21+', 5)
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'bucket', b.bucket,
        'user_count', coalesce(x.user_count, 0)
      )
      ORDER BY b.ord
    ),
    '[]'::jsonb
  )
  FROM buckets b
  LEFT JOIN bucketed x ON x.bucket = b.bucket;
$$;

REVOKE EXECUTE ON FUNCTION
  public.get_lifecycle_login_frequency(uuid, uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.get_lifecycle_login_frequency(uuid, uuid, date, date)
  TO service_role;

-- ============================================================================
-- 3. Top 20 active users — LifecycleDashboardService.getTopUsers
-- ============================================================================
-- Also folds in the follow-up `profiles ... .in('id', userIds)` batch read that
-- decorated the top 20 with name / email / institution / department. That read
-- was not row-capped (20 ids), but it asked PostgREST to embed `institutions(name)`
-- while `profiles` carries TWO foreign keys to `institutions` —
-- profiles_institution_id_fkey and profiles_accreditation_default_college_id_fkey,
-- both present in types/supabase.ts. Two FKs to one target is the ambiguous-embed
-- case PostgREST answers with PGRST201 unless the hint names an FK, and the caller
-- destructured `data` only, so such a rejection would degrade silently to "Unknown"
-- for every name. NOT observed live from here — inferred from the two FKs plus
-- PostgREST's documented behaviour. Either way the join below is explicit on
-- profiles.institution_id, so the question cannot arise.

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
    SELECT user_id, role::text AS role, login_at, duration_seconds
    FROM user_sessions
    WHERE login_at >= (p_date_from::timestamp AT TIME ZONE 'UTC')
      AND login_at <= ((p_date_to::text || ' 23:59:59')::timestamp AT TIME ZONE 'UTC')
      AND (p_institution_id IS NULL OR institution_id = p_institution_id)
      AND (p_department_id IS NULL OR department_id = p_department_id)
  ),
  per_user AS (
    SELECT
      user_id,
      count(*)                           AS login_count,
      max(login_at)                      AS last_login,
      sum(coalesce(duration_seconds, 0)) AS total_duration_seconds,
      (array_agg(
        coalesce(nullif(role, ''), 'unknown')
        ORDER BY login_at DESC, role
      ))[1]                              AS role
    FROM windowed
    GROUP BY user_id
  ),
  top20 AS (
    SELECT *
    FROM per_user
    ORDER BY login_count DESC, last_login DESC, user_id
    LIMIT 20
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'user_id', t.user_id,
          'full_name', coalesce(nullif(p.full_name, ''), 'Unknown'),
          'email', coalesce(p.email, ''),
          'role', t.role,
          'login_count', t.login_count,
          -- Passed through as a raw timestamptz on purpose: jsonb_build_object
          -- renders it with the very same Postgres datum->JSON conversion
          -- PostgREST used for the `login_at` column this value came from, on
          -- the same connection, so the string cannot drift from what the old
          -- code put in `last_login`.
          'last_login', t.last_login,
          'avg_session_minutes',
            round(t.total_duration_seconds::numeric / t.login_count / 60, 1),
          'institution_name', i.name,
          'department_name', d.department_name
        )
      )
      ORDER BY t.login_count DESC, t.last_login DESC, t.user_id
    ),
    '[]'::jsonb
  )
  FROM top20 t
  LEFT JOIN profiles p     ON p.id = t.user_id
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
-- The departments list itself was read without `.limit()`, which is the same
-- 10,000-row PostgREST cap by another route; it is set-based here too rather
-- than left as the one remaining truncation in a function being rewritten.

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
    GROUP BY 1
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
    GROUP BY 1
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'department_id', d.id,
        'department_name', d.department_name,
        'total_users', coalesce(pr.total_users, 0),
        'active_users', coalesce(se.active_users, 0),
        'total_logins', coalesce(se.total_logins, 0),
        'avg_logins_per_user',
          CASE WHEN coalesce(se.active_users, 0) > 0
            THEN round(se.total_logins::numeric / se.active_users, 1)
            ELSE 0 END
      )
      ORDER BY coalesce(se.total_logins, 0) DESC, d.department_name, d.id
    ),
    '[]'::jsonb
  )
  FROM depts d
  LEFT JOIN prof pr ON pr.department_id = d.id
  LEFT JOIN sess se ON se.department_id = d.id;
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
--  loudly and fall back to empty/zero output if the functions are missing.)
