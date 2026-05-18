-- ============================================================================
-- Fix: get_team_activity_day / get_team_activity_trend permission gate
-- 2026-05-16
--
-- Regression: migration 20260514120000_team_activity_rpcs.sql gated these
-- two RPCs on user_has_permission('admission.view') — a bare permission key
-- that is NOT registered in lib/constants/permissions.ts and is held by NO
-- role in custom_roles. Verified across all admission roles:
--   admission (Admission Officer)  — 82 admission keys, NO admission.view
--   admission_staff               — 75 admission keys, NO admission.view
--   admission_counselor           — 7 admission keys, NO admission.view
--   expo_counselor                — 10 admission keys, NO admission.view
--   administrator                 — 4 admission keys, NO admission.view
-- Only super_admins reached the tab (via the is_super_admin = true bypass
-- inside user_has_permission), making this look like a working feature in
-- dev while every non-super-admin admission user hit "forbidden:
-- admission.view permission required".
--
-- Precedent (this fix mirrors the registered-key pattern used elsewhere):
--   supabase/migrations/20260510140000_admission_counselor_sources_align_rls_with_source_admin.sql:27
--   supabase/migrations/20260513150000_admission_lead_sources_master_rls_to_settings_namespace.sql:13
--   app/(routes)/admission/gd-pi/page.tsx:11
--   app/(routes)/admission/settings/seat-config/page.tsx:259-267
--
-- The correct catalog key for the Team-area dashboard is
-- 'admission.counselors.team.view' ("View Counselor Team Page" in
-- lib/constants/permissions.ts:906).
-- ============================================================================

-- ── 1. get_team_activity_day ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_team_activity_day(
  p_institution_id uuid,
  p_date           date
)
RETURNS TABLE (
  activity_id     uuid,
  source          text,
  activity_type   text,
  lead_id         uuid,
  lead_name       text,
  counselor_id    uuid,
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
  -- Use the registered catalog key, not the phantom bare admission view key.
  IF NOT user_has_permission('admission.counselors.team.view') THEN
    RAISE EXCEPTION 'forbidden: admission.counselors.team.view permission required';
  END IF;

  IF p_institution_id IS NOT NULL
     AND NOT role_has_institution_access(p_institution_id) THEN
    RAISE EXCEPTION 'forbidden: caller role has no access to that institution';
  END IF;

  v_day_start := timezone('Asia/Kolkata', p_date::timestamp);
  v_day_end   := timezone('Asia/Kolkata', (p_date + 1)::timestamp);

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
    AND (p_institution_id IS NOT NULL OR role_has_institution_access(l.institution_id))

  UNION ALL

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

  ORDER BY 11 DESC;
END
$$;

GRANT EXECUTE ON FUNCTION public.get_team_activity_day(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.get_team_activity_day(uuid, date) IS
  'Team Activity Dashboard — returns every counselor activity (lead activities + cascades) for one IST day, attributed to a counselor. Gated by admission.counselors.team.view + role_has_institution_access.';


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
  IF NOT user_has_permission('admission.counselors.team.view') THEN
    RAISE EXCEPTION 'forbidden: admission.counselors.team.view permission required';
  END IF;

  IF p_institution_id IS NOT NULL
     AND NOT role_has_institution_access(p_institution_id) THEN
    RAISE EXCEPTION 'forbidden: caller role has no access to that institution';
  END IF;

  v_days := COALESCE(p_days, 7);
  IF v_days < 1 THEN
    v_days := 7;
  ELSIF v_days > 90 THEN
    v_days := 90;
  END IF;

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
  'Team Activity Dashboard — daily activity counts grouped by activity_type for the last N IST days. Feeds the 7-day stacked-bar trend chart. Gated by admission.counselors.team.view.';
