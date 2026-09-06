-- ============================================================================
-- Migration: 20260617001300_meet_analytics.sql
-- Module 8 — Meetings Analytics & Insights (Calendly-parity dashboard)
-- ============================================================================
-- Read-only aggregation layer over EXISTING booking data. No new tables.
--
-- Sources:
--   * public.meeting_bookings    — native scheduling bookings (one row/booking)
--   * public.meeting_routing_log — round-robin /book/[slug] decisions
--
-- SECURITY MODEL (mirrors native-scheduling RLS, migration ..._native_scheduling_engine):
--   Every RPC is SECURITY DEFINER + STABLE and applies host-scoping INSIDE the
--   function body:
--     is_super_admin() OR is_admin()  -> sees ALL hosts' data
--     otherwise                        -> sees ONLY own bookings (host_profile_id = auth.uid())
--   auth.users.id == profiles.id (1:1), so host_profile_id = auth.uid() is the
--   host identity check. Each function REVOKEs anon/PUBLIC and GRANTs authenticated
--   per the platform anon-lockdown standard (CLAUDE.md 2026-06-06).
--
-- Idempotent: CREATE OR REPLACE + explicit REVOKE/GRANT each run.
-- Ends with NOTIFY pgrst to refresh the PostgREST schema cache.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. fn_meeting_analytics_summary(p_from, p_to)
--    Single JSON object: headline counts + status split + cancel rate +
--    by-type / by-host / by-day breakdowns over [p_from, p_to).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_meeting_analytics_summary(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := (is_super_admin() OR is_admin());
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  -- Scoped working set: bookings the caller is allowed to see, in range.
  WITH scoped AS (
    SELECT
      b.id,
      b.status,
      b.start_time,
      b.host_profile_id,
      b.meeting_type_id,
      b.source
    FROM public.meeting_bookings b
    WHERE b.start_time >= p_from
      AND b.start_time <  p_to
      AND (v_is_admin OR b.host_profile_id = v_uid)
  ),
  totals AS (
    SELECT
      count(*)::int                                                        AS total,
      count(*) FILTER (WHERE status = 'confirmed')::int                    AS confirmed,
      count(*) FILTER (WHERE status = 'cancelled')::int                    AS cancelled,
      count(*) FILTER (WHERE status = 'completed')::int                    AS completed,
      count(*) FILTER (WHERE status = 'no_show')::int                      AS no_show
    FROM scoped
  ),
  by_type AS (
    SELECT jsonb_agg(t ORDER BY t->>'count' DESC) AS arr
    FROM (
      SELECT jsonb_build_object(
        'meeting_type_id', s.meeting_type_id,
        'name', COALESCE(mt.title, 'Unknown / deleted'),
        'count', count(*)::int
      ) AS t
      FROM scoped s
      LEFT JOIN public.meeting_types mt ON mt.id = s.meeting_type_id
      GROUP BY s.meeting_type_id, mt.title
    ) q
  ),
  by_host AS (
    SELECT jsonb_agg(t ORDER BY t->>'count' DESC) AS arr
    FROM (
      SELECT jsonb_build_object(
        'host_profile_id', s.host_profile_id,
        'name', COALESCE(p.full_name, p.email, 'Unknown host'),
        'count', count(*)::int
      ) AS t
      FROM scoped s
      LEFT JOIN public.profiles p ON p.id = s.host_profile_id
      GROUP BY s.host_profile_id, p.full_name, p.email
    ) q
  ),
  by_day AS (
    SELECT jsonb_agg(t ORDER BY t->>'day') AS arr
    FROM (
      SELECT jsonb_build_object(
        'day', to_char(date_trunc('day', s.start_time), 'YYYY-MM-DD'),
        'total', count(*)::int,
        'confirmed', count(*) FILTER (WHERE s.status = 'confirmed')::int,
        'cancelled', count(*) FILTER (WHERE s.status = 'cancelled')::int
      ) AS t
      FROM scoped s
      GROUP BY date_trunc('day', s.start_time)
    ) q
  ),
  by_source AS (
    SELECT jsonb_agg(t ORDER BY t->>'count' DESC) AS arr
    FROM (
      SELECT jsonb_build_object(
        'source', COALESCE(s.source, 'direct'),
        'count', count(*)::int
      ) AS t
      FROM scoped s
      GROUP BY s.source
    ) q
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'scope', CASE WHEN v_is_admin THEN 'all' ELSE 'own' END,
    'totals', jsonb_build_object(
      'total', t.total,
      'confirmed', t.confirmed,
      'cancelled', t.cancelled,
      'completed', t.completed,
      'no_show', t.no_show,
      -- cancel rate = cancelled / total, 0..1, two-decimal rounded; 0 when no bookings
      'cancel_rate', CASE WHEN t.total > 0
                          THEN round(t.cancelled::numeric / t.total, 4)
                          ELSE 0 END
    ),
    'by_type',   COALESCE(bt.arr, '[]'::jsonb),
    'by_host',   COALESCE(bh.arr, '[]'::jsonb),
    'by_day',    COALESCE(bd.arr, '[]'::jsonb),
    'by_source', COALESCE(bs.arr, '[]'::jsonb)
  )
  INTO v_result
  FROM totals t
  CROSS JOIN by_type bt
  CROSS JOIN by_host bh
  CROSS JOIN by_day bd
  CROSS JOIN by_source bs;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_meeting_analytics_summary(timestamptz, timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_meeting_analytics_summary(timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.fn_meeting_analytics_summary(timestamptz, timestamptz) IS
  'M8 Analytics: headline booking metrics (counts, status split, cancel rate) + by-type/by-host/by-day/by-source breakdowns over [p_from, p_to). Host-scoped: admin sees all, host sees own (host_profile_id = auth.uid()).';


-- ----------------------------------------------------------------------------
-- 2. fn_meeting_routing_distribution(p_from, p_to)
--    Round-robin routing funnel over meeting_routing_log: distribution by
--    pick_strategy and pool_size, plus picked-counselor leaderboard.
--    Routing log has NO host_profile_id; the picked host is counselor_user_id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_meeting_routing_distribution(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := (is_super_admin() OR is_admin());
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  WITH scoped AS (
    SELECT
      l.pick_strategy,
      l.pool_size,
      l.counselor_user_id,
      l.counselor_name
    FROM public.meeting_routing_log l
    WHERE l.created_at >= p_from
      AND l.created_at <  p_to
      -- non-admin host sees only routings that picked THEM
      AND (v_is_admin OR l.counselor_user_id = v_uid)
  ),
  by_strategy AS (
    SELECT jsonb_agg(t ORDER BY t->>'count' DESC) AS arr
    FROM (
      SELECT jsonb_build_object(
        'strategy', COALESCE(s.pick_strategy, 'unknown'),
        'count', count(*)::int
      ) AS t
      FROM scoped s
      GROUP BY s.pick_strategy
    ) q
  ),
  by_pool AS (
    SELECT jsonb_agg(t ORDER BY (t->>'pool_size')::int NULLS LAST) AS arr
    FROM (
      SELECT jsonb_build_object(
        'pool_size', s.pool_size,
        'count', count(*)::int
      ) AS t
      FROM scoped s
      GROUP BY s.pool_size
    ) q
  ),
  by_counselor AS (
    SELECT jsonb_agg(t ORDER BY t->>'count' DESC) AS arr
    FROM (
      SELECT jsonb_build_object(
        'counselor_user_id', s.counselor_user_id,
        'name', COALESCE(p.full_name, p.email, s.counselor_name, 'Unassigned'),
        'count', count(*)::int
      ) AS t
      FROM scoped s
      LEFT JOIN public.profiles p ON p.id = s.counselor_user_id
      GROUP BY s.counselor_user_id, p.full_name, p.email, s.counselor_name
    ) q
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'scope', CASE WHEN v_is_admin THEN 'all' ELSE 'own' END,
    'total', (SELECT count(*)::int FROM scoped),
    'by_strategy',  COALESCE(bs.arr, '[]'::jsonb),
    'by_pool',      COALESCE(bp.arr, '[]'::jsonb),
    'by_counselor', COALESCE(bc.arr, '[]'::jsonb)
  )
  INTO v_result
  FROM by_strategy bs
  CROSS JOIN by_pool bp
  CROSS JOIN by_counselor bc;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_meeting_routing_distribution(timestamptz, timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_meeting_routing_distribution(timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.fn_meeting_routing_distribution(timestamptz, timestamptz) IS
  'M8 Analytics: round-robin routing funnel over meeting_routing_log [p_from, p_to) — distribution by pick_strategy, pool_size, and picked counselor. Host-scoped via counselor_user_id = auth.uid() for non-admins.';


-- ----------------------------------------------------------------------------
-- Refresh PostgREST schema cache so the new RPCs are immediately callable.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
