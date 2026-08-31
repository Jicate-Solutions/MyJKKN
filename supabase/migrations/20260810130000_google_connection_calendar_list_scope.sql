-- 20260810130000_google_connection_calendar_list_scope.sql
--
-- Remembers whether a host's Google connection can list their calendars, so the
-- slot engine knows when it is only seeing part of the picture.
--
-- WHY
--   GoogleCalendarService.busyForHost asks Google freeBusy about exactly one
--   calendar: items: [{ id: 'primary' }]. Anything a host keeps on a SECOND
--   calendar is invisible to the slot engine, which then believes they are free
--   and offers that time to a stranger. A double booking that no amount of
--   checking meeting_bookings could have caught.
--
--   Reading every calendar means calling calendarList.list, which needs a scope
--   the current connections were never granted:
--     openid, email, calendar.events, calendar.freebusy   ← what they have
--     …calendar.calendarlist.readonly                     ← what listing needs
--
--   So 21 active connections physically cannot list calendars until their owner
--   reconnects. This column is how the code tells the two populations apart
--   without probing Google (and eating a guaranteed 403) on every page load —
--   the /meet slots endpoint is a public hot path.
--
-- VALUES
--   NULL   unknown — not yet probed. The code tries once and records the answer.
--   true   full protection: every owned, shown calendar is checked for busy time.
--   false  reduced: primary only. Exactly today's behaviour, now NAMED instead of
--          assumed. Reset to NULL when the host reconnects, so an upgraded
--          consent is re-probed rather than stuck on a stale false.
--
-- NOT A BREAKING CHANGE. A NULL/false connection behaves exactly as it does
-- today. Nobody's booking page stops working; hosts gain the wider check when
-- they next reconnect.

BEGIN;

ALTER TABLE public.meeting_host_google_connections
  ADD COLUMN IF NOT EXISTS calendar_list_scope boolean;

COMMENT ON COLUMN public.meeting_host_google_connections.calendar_list_scope IS
  'Can this connection call calendarList.list? NULL = not yet probed, true = all owned+shown calendars are checked for busy time, false = primary calendar only (reduced protection; host must reconnect to grant calendar.calendarlist.readonly). Reset to NULL on reconnect.';

-- No backfill on purpose. Every existing row stays NULL so the code probes once
-- and records the truth, rather than this migration guessing on their behalf.

DO $$
DECLARE v_rows int; v_null int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE calendar_list_scope IS NULL)
    INTO v_rows, v_null
  FROM public.meeting_host_google_connections;

  RAISE NOTICE 'google connections: % total, % awaiting a calendar-scope probe', v_rows, v_null;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'meeting_host_google_connections'
      AND column_name = 'calendar_list_scope'
  ) THEN
    RAISE EXCEPTION 'calendar_list_scope was not added — the slot engine would silently keep checking one calendar.';
  END IF;
END $$;

COMMIT;
