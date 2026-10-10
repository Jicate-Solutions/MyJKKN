-- 20271009131500_meetings_inbox_type_counts.sql
--
-- WHAT
--   fn_meeting_inbox_type_counts(p_statuses, p_from, p_before): one row per
--   meeting type with the number of bookings under the current My Meetings tab,
--   and the type's title. Used by /meetings/inbox for its "Meeting type" chips.
--
-- WHY (deep review on #4283, 9 Oct 2026, two MEDIUMs)
--   The page counted types by reading up to 10,000 booking rows on every load.
--   Admins and super admins see every host's bookings, so the Director's default
--   view pulled the most. This does the counting in the database: one grouped
--   query, a handful of rows back.
--
-- WHO SEES WHAT
--   SECURITY INVOKER: it runs as the signed-in caller, so meeting_bookings RLS
--   (mb_host_select) and meeting_types RLS (mt_host_all) apply exactly as they
--   do to the page's own list. A type whose row the caller cannot read comes
--   back with a NULL title. anon cannot run it.
--
-- FILTERS (mirror the page's STATUS_FILTERS)
--   p_statuses  NULL = any status
--   p_from      NULL, or only bookings starting at or after it ("Upcoming")
--   p_before    NULL, or only bookings starting before it ("Awaiting", "Past")
--
-- Undo: DROP FUNCTION public.fn_meeting_inbox_type_counts(text[], timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.fn_meeting_inbox_type_counts(
  p_statuses text[] DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE (meeting_type_id uuid, title text, bookings bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT b.meeting_type_id, t.title, count(*) AS bookings
    FROM public.meeting_bookings b
    LEFT JOIN public.meeting_types t ON t.id = b.meeting_type_id
   WHERE (p_statuses IS NULL OR b.status = ANY (p_statuses))
     AND (p_from IS NULL OR b.start_time >= p_from)
     AND (p_before IS NULL OR b.start_time < p_before)
   GROUP BY b.meeting_type_id, t.title
$$;

REVOKE ALL ON FUNCTION public.fn_meeting_inbox_type_counts(text[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_meeting_inbox_type_counts(text[], timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.fn_meeting_inbox_type_counts(text[], timestamptz, timestamptz) IS
  'My Meetings type chips: bookings per meeting type under one status tab, counted as the caller (SECURITY INVOKER, so RLS applies).';
