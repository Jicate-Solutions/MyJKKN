-- 20271009153000_meetings_inbox_type_counts_host_index.sql
--
-- WHAT
--   Rewrites fn_meeting_inbox_type_counts (20271009131500) so a HOST's count
--   reads only their own bookings through idx_mb_host_start
--   (host_profile_id, start_time DESC). Admins and super admins keep the
--   whole-table count they are allowed by RLS.
--
-- WHY (deep review on #4301, round 5, MEDIUM)
--   mb_host_select is `(SELECT is_super_admin()) OR (SELECT is_admin()) OR
--   host_profile_id = (SELECT auth.uid())`. The planner cannot pick the host
--   index for an OR whose other arms are only known at run time, so every
--   caller's count scanned the whole table (316 rows live on 2026-10-09: small
--   now, growing with every booking). An explicit host_profile_id = auth.uid()
--   predicate for non-admins lets it use the index. RLS still applies on top
--   (SECURITY INVOKER): the extra predicate only narrows, never widens.
--
-- Same signature, return shape, grants and SECURITY INVOKER as 20271009131500.
-- Undo: re-run 20271009131500's CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.fn_meeting_inbox_type_counts(
  p_statuses text[] DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE (meeting_type_id uuid, title text, bookings bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.is_super_admin(), false) OR COALESCE(public.is_admin(), false) THEN
    RETURN QUERY
      SELECT b.meeting_type_id, t.title, count(*)
        FROM public.meeting_bookings b
        LEFT JOIN public.meeting_types t ON t.id = b.meeting_type_id
       WHERE (p_statuses IS NULL OR b.status = ANY (p_statuses))
         AND (p_from IS NULL OR b.start_time >= p_from)
         AND (p_before IS NULL OR b.start_time < p_before)
       GROUP BY b.meeting_type_id, t.title;
  ELSE
    RETURN QUERY
      SELECT b.meeting_type_id, t.title, count(*)
        FROM public.meeting_bookings b
        LEFT JOIN public.meeting_types t ON t.id = b.meeting_type_id
       WHERE b.host_profile_id = auth.uid()
         AND (p_statuses IS NULL OR b.status = ANY (p_statuses))
         AND (p_from IS NULL OR b.start_time >= p_from)
         AND (p_before IS NULL OR b.start_time < p_before)
       GROUP BY b.meeting_type_id, t.title;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.fn_meeting_inbox_type_counts(text[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_meeting_inbox_type_counts(text[], timestamptz, timestamptz) TO authenticated;
