-- ============================================================================
-- Migration: Auto-accountability-meeting engine — PR4 (admin console support)
-- Date: 2026-06-22
-- Spec: specs/meeting-auto-trigger-engine-2026-06-22.md (§4 PR4)
--
-- One read-only RPC the trigger console uses to show each college's CURRENT
-- attendance rate beside its threshold (so the Director sets lines with
-- context). Returns all institutions' summary in a single call.
--
-- Same mark-level metric as fn_college_day_attendance_rate, aggregated over a
-- window. anon-locked.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_college_attendance_summary(p_days integer DEFAULT 7)
RETURNS TABLE(
  institution_id  uuid,
  days_with_data  integer,
  avg_rate        numeric,
  latest_rate     numeric,
  latest_date     date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH daily AS (
    SELECT
      sa.institution_id,
      sa.attendance_date,
      round(
        100.0 * count(*) FILTER (WHERE lower(elem->>'status') = 'present')
        / NULLIF(count(*), 0),
        2
      ) AS rate
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(sa.attendance_data) AS sess(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(sess.value->'students') = 'array'
           THEN sess.value->'students'
           ELSE '[]'::jsonb END
    ) AS elem
    WHERE sa.attendance_date >= CURRENT_DATE - GREATEST(p_days, 1)
    GROUP BY sa.institution_id, sa.attendance_date
  )
  SELECT
    institution_id,
    count(*)::integer AS days_with_data,
    round(avg(rate), 1) AS avg_rate,
    (array_agg(rate ORDER BY attendance_date DESC))[1] AS latest_rate,
    max(attendance_date) AS latest_date
  FROM daily
  WHERE rate IS NOT NULL
  GROUP BY institution_id;
$$;

COMMENT ON FUNCTION public.fn_college_attendance_summary(integer) IS
  'Per-institution attendance summary over the last p_days (avg + latest rate). Drives the auto-meeting trigger console. Same mark-level metric as fn_college_day_attendance_rate.';

REVOKE EXECUTE ON FUNCTION public.fn_college_attendance_summary(integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_college_attendance_summary(integer) TO authenticated, service_role;
