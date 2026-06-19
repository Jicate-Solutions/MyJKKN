-- ============================================================================
-- Migration: 20260619000300_meeting_analytics_institution_rls.sql
-- Module 8 — Meetings Analytics: INSTITUTION-MANAGER tier (Wave 3)
-- ============================================================================
-- Closes the all-or-own gap in the meetings analytics dashboard. Today the two
-- summary/routing RPCs (20260617001300_meet_analytics.sql) resolve only two
-- scopes INSIDE the function body:
--     is_super_admin() OR is_admin()  -> 'all'  (every host, every institution)
--     otherwise                        -> 'own'  (host_profile_id = auth.uid())
--
-- There was NO middle tier for an INSTITUTION MANAGER: a role scoped to ONE (or
-- a few) institutions who should see EVERY host's booking analytics for THOSE
-- institutions only — not just their own bookings, and not everyone's.
--
-- This migration adds two NEW, additive RPCs (the existing 2-arg functions are
-- left untouched and still serve the 'own'/'all' tiers):
--     fn_meeting_analytics_summary_institution(p_from, p_to, p_institution_ids)
--     fn_meeting_routing_distribution_institution(p_from, p_to, p_institution_ids)
--
-- SECURITY MODEL — institution scoping is derived from the CANONICAL helpers,
-- never from raw custom_roles/profiles reads:
--   * Accessible institution set = get_user_accessible_institutions(auth.uid())
--     (primary institution + active user_institution_access grants), optionally
--     narrowed by the caller-supplied p_institution_ids.
--   * Every accessible institution is double-checked with
--     role_has_institution_access(institution_id) — the project-canonical guard —
--     so a stale grant cannot widen the read.
--   * Admins (is_super_admin() OR is_admin()) bypass the institution filter and
--     see ALL bookings (scope 'all'), matching the existing dashboard behavior.
--   * A non-admin caller with NO accessible institutions gets an empty result
--     (fail-closed), never a silent fall-through to own/all.
--   * Callable only by authenticated users that also hold
--     user_has_permission('meetings.analytics.view'); anon/PUBLIC is revoked.
--
-- The returned JSON mirrors the existing summary/routing shape (so the client
-- service can reuse its types) and ADDS:
--     scope = 'institution'
--     available_institutions = [{ institution_id, name }]  (drives the picker)
--     selected_institution_ids = the effective filtered set
--
-- Idempotent: CREATE OR REPLACE + explicit REVOKE/GRANT each run. New supporting
-- index is IF NOT EXISTS. Ends with NOTIFY pgrst to refresh the schema cache.
--
-- ⚠️ DO NOT APPLY blindly — paired with the lead's reconcile PR that adds the
-- 'meetings.analytics.view' permission key. Review before running in prod.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Supporting index for the institution filter (additive, safe).
--    The existing dashboard filters by host_profile_id + start_time; the
--    institution tier filters by institution_id + start_time.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mb_institution_start
  ON public.meeting_bookings (institution_id, start_time)
  WHERE institution_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 1. fn_meeting_analytics_summary_institution(p_from, p_to, p_institution_ids)
--    Headline counts + status split + cancel rate + by-type / by-host / by-day
--    / by-source breakdowns over [p_from, p_to) for EVERY host whose booking's
--    institution is within the caller's accessible (and selected) institutions.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_meeting_analytics_summary_institution(
  p_from            timestamptz,
  p_to              timestamptz,
  p_institution_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := (is_super_admin() OR is_admin());
  v_inst     uuid[];
  v_result   jsonb;
  v_avail    jsonb;
BEGIN
  -- Permission gate: caller must hold the analytics-view grant (admins bypass).
  IF NOT (v_is_admin OR user_has_permission('meetings.analytics.view')) THEN
    RAISE EXCEPTION 'insufficient_privilege: meetings.analytics.view required'
      USING ERRCODE = '42501';
  END IF;

  -- The caller's accessible institutions (primary + active cross grants),
  -- narrowed to the requested subset and re-verified via the canonical guard.
  SELECT array_agg(gi.institution_id)
    INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid()) gi
  WHERE (p_institution_ids IS NULL OR gi.institution_id = ANY (p_institution_ids))
    AND role_has_institution_access(gi.institution_id);

  -- Picker list (name-labelled) for the accessible institutions, regardless of
  -- the current selection, so the dropdown always shows every option.
  SELECT jsonb_agg(
           jsonb_build_object('institution_id', gi.institution_id, 'name', gi.institution_name)
           ORDER BY gi.institution_name
         )
    INTO v_avail
  FROM public.get_user_accessible_institutions(auth.uid()) gi
  WHERE role_has_institution_access(gi.institution_id);

  -- Scoped working set: every host's bookings whose institution_id is in the
  -- accessible set. Admins ignore the institution filter (see all). A non-admin
  -- with no accessible institutions gets an empty set (fail-closed via v_inst
  -- being NULL -> the ANY() predicate is false for every row).
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
      AND (
        v_is_admin
        OR (b.institution_id IS NOT NULL AND b.institution_id = ANY (v_inst))
      )
  ),
  totals AS (
    SELECT
      count(*)::int                                     AS total,
      count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
      count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
      count(*) FILTER (WHERE status = 'completed')::int AS completed,
      count(*) FILTER (WHERE status = 'no_show')::int   AS no_show
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
    'scope', CASE WHEN v_is_admin THEN 'all' ELSE 'institution' END,
    'available_institutions',    COALESCE(v_avail, '[]'::jsonb),
    'selected_institution_ids',  COALESCE(to_jsonb(v_inst), '[]'::jsonb),
    'totals', jsonb_build_object(
      'total', t.total,
      'confirmed', t.confirmed,
      'cancelled', t.cancelled,
      'completed', t.completed,
      'no_show', t.no_show,
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

REVOKE EXECUTE ON FUNCTION public.fn_meeting_analytics_summary_institution(timestamptz, timestamptz, uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_meeting_analytics_summary_institution(timestamptz, timestamptz, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.fn_meeting_analytics_summary_institution(timestamptz, timestamptz, uuid[]) IS
  'M8 Analytics (institution tier): every host''s booking metrics for the caller''s accessible institutions (get_user_accessible_institutions ∩ role_has_institution_access), optionally narrowed by p_institution_ids. Gated by user_has_permission(''meetings.analytics.view''); admins see all (scope=all). Returns scope, available_institutions, selected_institution_ids plus the standard summary shape.';


-- ----------------------------------------------------------------------------
-- 2. fn_meeting_routing_distribution_institution(p_from, p_to, p_institution_ids)
--    Round-robin routing funnel scoped to the caller's accessible institutions.
--    meeting_routing_log carries its OWN institution_id (snapshot at booking
--    time), so the institution filter is a direct column predicate.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_meeting_routing_distribution_institution(
  p_from            timestamptz,
  p_to              timestamptz,
  p_institution_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := (is_super_admin() OR is_admin());
  v_inst     uuid[];
  v_result   jsonb;
BEGIN
  IF NOT (v_is_admin OR user_has_permission('meetings.analytics.view')) THEN
    RAISE EXCEPTION 'insufficient_privilege: meetings.analytics.view required'
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(gi.institution_id)
    INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid()) gi
  WHERE (p_institution_ids IS NULL OR gi.institution_id = ANY (p_institution_ids))
    AND role_has_institution_access(gi.institution_id);

  WITH scoped AS (
    SELECT
      l.pick_strategy,
      l.pool_size,
      l.counselor_user_id,
      l.counselor_name
    FROM public.meeting_routing_log l
    WHERE l.created_at >= p_from
      AND l.created_at <  p_to
      AND (
        v_is_admin
        OR (l.institution_id IS NOT NULL AND l.institution_id = ANY (v_inst))
      )
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
    'scope', CASE WHEN v_is_admin THEN 'all' ELSE 'institution' END,
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

REVOKE EXECUTE ON FUNCTION public.fn_meeting_routing_distribution_institution(timestamptz, timestamptz, uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_meeting_routing_distribution_institution(timestamptz, timestamptz, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.fn_meeting_routing_distribution_institution(timestamptz, timestamptz, uuid[]) IS
  'M8 Analytics (institution tier): round-robin routing funnel for the caller''s accessible institutions (routing log joined to meeting_bookings.institution_id), optionally narrowed by p_institution_ids. Gated by user_has_permission(''meetings.analytics.view''); admins see all (scope=all).';


-- ----------------------------------------------------------------------------
-- Refresh PostgREST schema cache so the new RPCs are immediately callable.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
