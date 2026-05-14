-- ============================================================================
-- Team Activity Dashboard RPCs
-- 2026-05-14
--
-- Powers /admission/counselors/team/activity — replaces the cascade-only
-- last-50 list with a day-by-day counselor-activity dashboard.
--
-- Two SECURITY DEFINER functions:
--   1. get_team_activity_day(institution, date)  — every event for one day,
--      one row per activity, attributed to a counselor.
--   2. get_team_activity_trend(institution, days) — daily counts by activity
--      type for the last N days, fuel for the stacked-bar trend chart.
--
-- Why SECURITY DEFINER:
--   admission_lead_activities is gated by an RLS policy that scopes to
--   assigned_counselor_id = auth.uid(). The Team-Activity surface is a
--   *team-wide* view — direct client queries would silently filter to "only
--   my leads" and look empty. The RPC bypasses RLS but enforces an explicit
--   permission + institution-access check, mirroring the dashboard-RPC
--   pattern used elsewhere in the admission module.
--
-- Permission gate:
--   user_has_permission('admission.view') AND role_has_institution_access
--   when a concrete institution is requested. NULL institution = system-wide
--   (super admin / admission global users only get rows their role can see;
--   the inner row-level `role_has_institution_access(l.institution_id)`
--   keeps a leakage gap closed even if the outer check is bypassed).
--
-- Day window:
--   Inputs are *dates* (no time component). We interpret each date as IST
--   midnight (Asia/Kolkata) via `timezone(zone, ts)` so the dashboard groups
--   events the way operators perceive "today".
-- ============================================================================

-- ── 1. get_team_activity_day ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_team_activity_day(
  p_institution_id uuid,
  p_date           date
)
RETURNS TABLE (
  activity_id     uuid,
  source          text,          -- 'lead_activity' | 'cascade'
  activity_type   text,          -- call|email|meeting|note|sms|whatsapp|stage_change|task|cascade
  lead_id         uuid,
  lead_name       text,
  counselor_id    uuid,          -- admission_counselors.id; NULL if unattributed
  counselor_name  text,
  subject         text,
  description     text,
  outcome         text,
  created_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_start timestamptz;
  v_day_end   timestamptz;
BEGIN
  -- ── Permission gates ──────────────────────────────────────────────────────
  IF NOT user_has_permission('admission.view') THEN
    RAISE EXCEPTION 'forbidden: admission.view permission required';
  END IF;

  IF p_institution_id IS NOT NULL
     AND NOT role_has_institution_access(p_institution_id) THEN
    RAISE EXCEPTION 'forbidden: caller role has no access to that institution';
  END IF;

  -- ── Day window — IST (Asia/Kolkata) ───────────────────────────────────────
  v_day_start := timezone('Asia/Kolkata', p_date::timestamp);
  v_day_end   := timezone('Asia/Kolkata', (p_date + 1)::timestamp);

  -- ── Lead activities (calls, emails, meetings, notes, stage changes…) ─────
  RETURN QUERY
  SELECT
    a.id,
    'lead_activity'::text,
    a.activity_type::text,
    a.lead_id,
    COALESCE(
      NULLIF(l.full_name, ''),
      NULLIF(TRIM(l.first_name || ' ' || COALESCE(l.last_name, '')), ''),
      'Unknown lead'
    ),
    -- Attribution: who *did* the activity (created_by) takes precedence;
    -- fall back to the lead's currently-assigned counselor when an activity
    -- writer left created_by NULL (some auto-stage_change writers do this).
    COALESCE(c.id, c2.id),
    COALESCE(c.name, c2.name, p.full_name, 'System'),
    a.subject,
    a.description,
    a.outcome,
    a.created_at
  FROM admission_lead_activities a
  JOIN admission_leads l            ON l.id = a.lead_id
  LEFT JOIN admission_counselors c  ON c.user_id = a.created_by
  LEFT JOIN admission_counselors c2 ON c2.id = l.assigned_counselor_id
  LEFT JOIN profiles p              ON p.id = a.created_by
  WHERE a.created_at >= v_day_start
    AND a.created_at <  v_day_end
    AND (p_institution_id IS NULL OR l.institution_id = p_institution_id)
    -- Belt-and-braces: even on NULL institution, never leak rows from an
    -- institution the caller's role can't reach.
    AND (p_institution_id IS NOT NULL OR role_has_institution_access(l.institution_id))

  UNION ALL

  -- ── Cascade events (lead reassignments) ──────────────────────────────────
  -- Attributed to the receiving counselor (to_counselor_id) because that
  -- counselor "received a transferred lead" — the audit-worthy event.
  SELECT
    h.id,
    'cascade'::text,
    'cascade'::text,
    h.lead_id,
    COALESCE(
      NULLIF(l.full_name, ''),
      NULLIF(TRIM(l.first_name || ' ' || COALESCE(l.last_name, '')), ''),
      'Unknown lead'
    ),
    h.to_counselor_id,
    COALESCE(c.name, 'Unassigned'),
    NULL::text,
    h.reason,
    NULL::text,
    h.cascaded_at
  FROM admission_lead_cascade_history h
  JOIN admission_leads l            ON l.id = h.lead_id
  LEFT JOIN admission_counselors c  ON c.id = h.to_counselor_id
  WHERE h.cascaded_at >= v_day_start
    AND h.cascaded_at <  v_day_end
    AND (p_institution_id IS NULL OR l.institution_id = p_institution_id)
    AND (p_institution_id IS NOT NULL OR role_has_institution_access(l.institution_id))

  ORDER BY 11 DESC;  -- created_at column
END
$$;

GRANT EXECUTE ON FUNCTION public.get_team_activity_day(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.get_team_activity_day(uuid, date) IS
  'Team Activity Dashboard — returns every counselor activity (lead activities + cascades) for one IST day, attributed to a counselor. Gated by admission.view + role_has_institution_access.';


-- ── 2. get_team_activity_trend ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_team_activity_trend(
  p_institution_id uuid,
  p_days           integer DEFAULT 7
)
RETURNS TABLE (
  day            date,
  activity_type  text,
  count          bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days        integer;
  v_window_start timestamptz;
BEGIN
  IF NOT user_has_permission('admission.view') THEN
    RAISE EXCEPTION 'forbidden: admission.view permission required';
  END IF;

  IF p_institution_id IS NOT NULL
     AND NOT role_has_institution_access(p_institution_id) THEN
    RAISE EXCEPTION 'forbidden: caller role has no access to that institution';
  END IF;

  -- Sanitize: clamp p_days to a reasonable window so the chart can't be
  -- weaponized into a giant aggregate query.
  v_days := COALESCE(p_days, 7);
  IF v_days < 1 THEN
    v_days := 7;
  ELSIF v_days > 90 THEN
    v_days := 90;
  END IF;

  -- Window starts (v_days - 1) days before today, at IST midnight, so the
  -- output covers exactly v_days consecutive days ending with today.
  v_window_start := timezone(
    'Asia/Kolkata',
    (CURRENT_DATE - (v_days - 1))::timestamp
  );

  RETURN QUERY
  SELECT
    (timezone('Asia/Kolkata', a.created_at))::date AS day,
    a.activity_type::text,
    COUNT(*)::bigint
  FROM admission_lead_activities a
  JOIN admission_leads l ON l.id = a.lead_id
  WHERE a.created_at >= v_window_start
    AND (p_institution_id IS NULL OR l.institution_id = p_institution_id)
    AND (p_institution_id IS NOT NULL OR role_has_institution_access(l.institution_id))
  GROUP BY 1, 2

  UNION ALL

  SELECT
    (timezone('Asia/Kolkata', h.cascaded_at))::date AS day,
    'cascade'::text,
    COUNT(*)::bigint
  FROM admission_lead_cascade_history h
  JOIN admission_leads l ON l.id = h.lead_id
  WHERE h.cascaded_at >= v_window_start
    AND (p_institution_id IS NULL OR l.institution_id = p_institution_id)
    AND (p_institution_id IS NOT NULL OR role_has_institution_access(l.institution_id))
  GROUP BY 1

  ORDER BY 1 ASC, 2 ASC;
END
$$;

GRANT EXECUTE ON FUNCTION public.get_team_activity_trend(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.get_team_activity_trend(uuid, integer) IS
  'Team Activity Dashboard — daily activity counts grouped by activity_type for the last N IST days. Feeds the 7-day stacked-bar trend chart.';
