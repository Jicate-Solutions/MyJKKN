-- 2026-07-17: Exact org-wide compliance rollups for the mandatory-notification
-- compliance dashboard. Replaces JS aggregation over PostgREST-capped (~1000 row)
-- slices of user_notifications/notifications. Does every COUNT / GROUP BY in one
-- SQL pass, and computes headline `total_overdue` AND per-institution `overdue`
-- with the SAME past-deadline predicate so the two agree (compliance-2).
-- Deadline = COALESCE(sent_at, created_at) + acknowledgment_deadline_hours (default 4),
-- matching the canonical definition used by escalate/acknowledge/cron routes.
CREATE OR REPLACE FUNCTION public.fn_notification_compliance_rollup()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Defense-in-depth: the route already gates on super_admin; re-check here so the
  -- SECURITY DEFINER RPC (which bypasses RLS to read all users' data) cannot be
  -- called by any lesser-privileged authenticated user.
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges: super admin required'
      USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    SELECT
      un.user_id,
      un.notification_id,
      un.acknowledged_at,
      un.created_at AS un_created_at,
      (COALESCE(n.sent_at, n.created_at)
        + make_interval(hours => COALESCE(n.acknowledgment_deadline_hours, 4))) AS deadline_at,
      p.full_name,
      p.email,
      p.role,
      p.institution_id,
      i.name AS inst_name_raw
    FROM public.user_notifications un
    JOIN public.notifications n
      ON n.id = un.notification_id
     AND n.requires_acknowledgment = true
    LEFT JOIN public.profiles p ON p.id = un.user_id
    LEFT JOIN public.institutions i ON i.id = p.institution_id
  ),
  overall AS (
    SELECT
      (SELECT count(*) FROM public.notifications WHERE requires_acknowledgment = true) AS total_mandatory,
      count(*) AS total_required,
      count(*) FILTER (WHERE acknowledged_at IS NOT NULL) AS total_ack,
      count(*) FILTER (WHERE acknowledged_at IS NULL AND now() > deadline_at) AS total_overdue
    FROM base
  ),
  inst AS (
    SELECT
      COALESCE(inst_name_raw,
        CASE WHEN institution_id IS NULL THEN 'No Institution' ELSE 'Unknown Institution' END
      ) AS institution_name,
      count(*) AS total,
      count(*) FILTER (WHERE acknowledged_at IS NOT NULL) AS acknowledged,
      count(*) FILTER (WHERE acknowledged_at IS NULL AND now() > deadline_at) AS overdue_cnt
    FROM base
    GROUP BY 1
  ),
  by_institution AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'name', institution_name,
        'total_required', total,
        'acknowledged', acknowledged,
        'compliance_rate', CASE WHEN total > 0 THEN round((acknowledged::numeric / total * 100), 1) ELSE 0 END,
        'overdue', overdue_cnt
      )
      ORDER BY (CASE WHEN total > 0 THEN round((acknowledged::numeric / total * 100), 1) ELSE 0 END) ASC, institution_name
    ), '[]'::jsonb) AS data
    FROM inst
  ),
  notif_rollup AS (
    SELECT notification_id,
      count(*) AS total,
      count(*) FILTER (WHERE acknowledged_at IS NOT NULL) AS acknowledged
    FROM base
    GROUP BY notification_id
  ),
  by_notification AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'title', n.title,
        'priority', n.priority,
        'category', n.category,
        'sent_at', COALESCE(n.sent_at, n.created_at),
        'deadline_passed', (n.expires_at IS NOT NULL AND n.expires_at < now()),
        'expires_at', n.expires_at,
        'total', COALESCE(r.total, 0),
        'acknowledged', COALESCE(r.acknowledged, 0),
        'rate', CASE WHEN COALESCE(r.total, 0) > 0
                     THEN round((r.acknowledged::numeric / r.total * 100), 1) ELSE 0 END
      )
      ORDER BY n.created_at DESC, n.id
    ), '[]'::jsonb) AS data
    FROM public.notifications n
    LEFT JOIN notif_rollup r ON r.notification_id = n.id
    WHERE n.requires_acknowledgment = true
  ),
  hod_agg AS (
    SELECT
      user_id, full_name, email, role, institution_id, inst_name_raw,
      count(*) AS received,
      count(*) FILTER (WHERE acknowledged_at IS NOT NULL) AS acknowledged,
      avg(EXTRACT(EPOCH FROM (acknowledged_at - un_created_at)))
        FILTER (WHERE acknowledged_at IS NOT NULL AND acknowledged_at > un_created_at) AS avg_response_secs
    FROM base
    WHERE role IN ('hod', 'principal', 'vice_principal', 'dean')
    GROUP BY user_id, full_name, email, role, institution_id, inst_name_raw
  ),
  hod_responsiveness AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'name', COALESCE(full_name, 'Unknown'),
        'email', COALESCE(email, ''),
        'role', role,
        'institution', CASE WHEN institution_id IS NULL THEN 'N/A' ELSE COALESCE(inst_name_raw, 'Unknown') END,
        'escalations_received', received,
        'escalations_acknowledged', acknowledged,
        'avg_response_hours', CASE WHEN avg_response_secs IS NOT NULL
                                   THEN round((avg_response_secs / 3600.0)::numeric, 1) ELSE NULL END
      )
      ORDER BY (CASE WHEN received > 0 THEN acknowledged::numeric / received ELSE 0 END) ASC, user_id
    ), '[]'::jsonb) AS data
    FROM hod_agg
  ),
  wo AS (
    SELECT
      user_id, full_name, email, role, institution_id, inst_name_raw,
      count(*) AS unack
    FROM base
    WHERE acknowledged_at IS NULL
    GROUP BY user_id, full_name, email, role, institution_id, inst_name_raw
    ORDER BY count(*) DESC, user_id
    LIMIT 20
  ),
  worst_offenders AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'name', COALESCE(full_name, 'Unknown'),
        'email', COALESCE(email, ''),
        'role', COALESCE(role, 'unknown'),
        'institution', CASE WHEN institution_id IS NULL THEN 'N/A' ELSE COALESCE(inst_name_raw, 'Unknown') END,
        'unacknowledged_count', unack
      )
      ORDER BY unack DESC, user_id
    ), '[]'::jsonb) AS data
    FROM wo
  )
  SELECT jsonb_build_object(
    'overall', jsonb_build_object(
      'total_mandatory_notifications', o.total_mandatory,
      'total_required_acknowledgments', o.total_required,
      'total_acknowledged', o.total_ack,
      'overall_compliance_rate', CASE WHEN o.total_required > 0
        THEN round((o.total_ack::numeric / o.total_required * 100), 1) ELSE 0 END,
      'total_overdue', o.total_overdue
    ),
    'by_institution', bi.data,
    'by_notification', bn.data,
    'hod_responsiveness', hr.data,
    'worst_offenders', wof.data
  )
  INTO v_result
  FROM overall o, by_institution bi, by_notification bn, hod_responsiveness hr, worst_offenders wof;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_notification_compliance_rollup() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_notification_compliance_rollup() TO authenticated;