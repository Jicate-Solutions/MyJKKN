-- =====================================================================
-- Online Meetings — dynamic team meetings with AI Pulse engagement
-- =====================================================================
-- Plan: Online Meetings module (2026-09-09)
--
-- WHY THIS MODULE EXISTS
--   AI Pulse proved a live online session can be measured — who joined on
--   time, who answered the polls, who stayed to the end, who passed the
--   quiz. But that machinery can only describe ONE meeting for ONE
--   audience:
--     * a cycle is a startup_events row with config.kind='ai_pulse',
--       created only by app/api/cron/ai-pulse-tick — nobody can schedule
--       one on demand, and startup_events INSERT is admin-only anyway;
--     * attendance is ai_pulse_live_attendance.profile_id, NOT NULL and
--       FK'd to profiles, with every write policy reading
--       `profile_id = auth.uid()`. Somebody from outside JKKN has no row
--       to be recorded in and no session to be recognised by. They are
--       not merely un-invited — they are UNREPRESENTABLE.
--
--   This module fixes both, without touching AI Pulse. Nothing here reads
--   or writes any ai_pulse_* table or startup_events.
--
-- THE ONE DESIGN DECISION THAT MATTERS
--   Attendance and poll responses are keyed by PARTICIPANT, not by
--   profile. A participant row is either an internal profile OR an
--   external name + email. That is the whole of what admits guests, and
--   it means every downstream report treats both kinds uniformly instead
--   of growing a second code path that drifts.
--
-- GUESTS NEVER TOUCH THIS SCHEMA DIRECTLY
--   An external participant is `anon`, and anon is REVOKED on every table
--   below. Their reads and writes go through service-role route handlers
--   under /api/public/online-meetings/ that validate a join token
--   server-side — the same pattern as /api/public/courses/ and
--   /api/public/moments/. Authorization lives in reviewed TypeScript;
--   RLS here is the backstop, not the policy engine.
--
-- Pattern references:
--   supabase/migrations/20260611_ai_pulse_live_attendance_and_champion.sql
--   supabase/migrations/20260617123300_ai_pulse_polls.sql
-- =====================================================================


--
-- SPLIT: Part 3 of 4 - RLS enable, grants/revokes and every policy. Requires parts 1-2.
--   The combined body timed out (57014) as one exec_sql request at 37 KB,
--   so it ships as four sequential migrations. Apply them in filename order.
-- =====================================================================

-- =====================================================================
-- 5. RLS — enabled in the SAME migration that creates the tables
-- =====================================================================
-- PostgREST publishes every table the moment it exists. A table without RLS
-- is not a coverage gap, it is a public endpoint.

ALTER TABLE public.online_meetings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_meeting_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_meeting_attendance    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_meeting_polls         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_meeting_poll_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_meeting_agenda_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_meeting_minutes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_meeting_action_items  ENABLE ROW LEVEL SECURITY;

-- anon gets nothing, anywhere. Guests arrive via service-role routes only.
REVOKE ALL ON public.online_meetings              FROM anon;
REVOKE ALL ON public.online_meeting_participants  FROM anon;
REVOKE ALL ON public.online_meeting_attendance    FROM anon;
REVOKE ALL ON public.online_meeting_polls         FROM anon;
REVOKE ALL ON public.online_meeting_poll_responses FROM anon;
REVOKE ALL ON public.online_meeting_agenda_items  FROM anon;
REVOKE ALL ON public.online_meeting_minutes       FROM anon;
REVOKE ALL ON public.online_meeting_action_items  FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_meetings              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_meeting_participants  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_meeting_attendance    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_meeting_polls         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_meeting_poll_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_meeting_agenda_items  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_meeting_minutes       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_meeting_action_items  TO authenticated;


-- ---------------------------------------------------------------------
-- online_meetings
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS online_meetings_select ON public.online_meetings;
CREATE POLICY online_meetings_select ON public.online_meetings
  FOR SELECT TO authenticated
  USING (
    public.fn_om_is_host_or_manager(id)
    OR public.fn_om_is_participant(id)
  );

DROP POLICY IF EXISTS online_meetings_insert ON public.online_meetings;
CREATE POLICY online_meetings_insert ON public.online_meetings
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (
      (SELECT public.user_has_permission('onlineMeeting:create'))
      AND host_profile_id = (SELECT auth.uid())
      AND public.role_has_institution_access(institution_id)
    )
    OR (SELECT public.user_has_permission('onlineMeeting:manage.all'))
  );

DROP POLICY IF EXISTS online_meetings_update ON public.online_meetings;
CREATE POLICY online_meetings_update ON public.online_meetings
  FOR UPDATE TO authenticated
  USING (public.fn_om_is_host_or_manager(id))
  WITH CHECK (public.fn_om_is_host_or_manager(id));

DROP POLICY IF EXISTS online_meetings_delete ON public.online_meetings;
CREATE POLICY online_meetings_delete ON public.online_meetings
  FOR DELETE TO authenticated
  USING (public.fn_om_is_host_or_manager(id));


-- ---------------------------------------------------------------------
-- online_meeting_participants
-- ---------------------------------------------------------------------
-- Read: the host and managers see the whole roster; an internal participant
-- sees their own row. RLS is row-level, so a co-participant who could read
-- the roster would also read external email addresses — hence own-row only
-- here, and the participant service projects columns for the host view.
DROP POLICY IF EXISTS online_meeting_participants_select ON public.online_meeting_participants;
CREATE POLICY online_meeting_participants_select ON public.online_meeting_participants
  FOR SELECT TO authenticated
  USING (
    public.fn_om_is_host_or_manager(meeting_id)
    OR profile_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS online_meeting_participants_write ON public.online_meeting_participants;
CREATE POLICY online_meeting_participants_write ON public.online_meeting_participants
  FOR ALL TO authenticated
  USING (public.fn_om_is_host_or_manager(meeting_id))
  WITH CHECK (public.fn_om_is_host_or_manager(meeting_id));


-- ---------------------------------------------------------------------
-- online_meeting_attendance
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS online_meeting_attendance_select ON public.online_meeting_attendance;
CREATE POLICY online_meeting_attendance_select ON public.online_meeting_attendance
  FOR SELECT TO authenticated
  USING (
    public.fn_om_is_host_or_manager(meeting_id)
    OR public.fn_om_owns_participant(participant_id)
  );

DROP POLICY IF EXISTS online_meeting_attendance_insert ON public.online_meeting_attendance;
CREATE POLICY online_meeting_attendance_insert ON public.online_meeting_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    public.fn_om_is_host_or_manager(meeting_id)
    OR public.fn_om_owns_participant(participant_id)
  );

DROP POLICY IF EXISTS online_meeting_attendance_update ON public.online_meeting_attendance;
CREATE POLICY online_meeting_attendance_update ON public.online_meeting_attendance
  FOR UPDATE TO authenticated
  USING (
    public.fn_om_is_host_or_manager(meeting_id)
    OR public.fn_om_owns_participant(participant_id)
  )
  WITH CHECK (
    public.fn_om_is_host_or_manager(meeting_id)
    OR public.fn_om_owns_participant(participant_id)
  );


-- ---------------------------------------------------------------------
-- online_meeting_polls / responses
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS online_meeting_polls_select ON public.online_meeting_polls;
CREATE POLICY online_meeting_polls_select ON public.online_meeting_polls
  FOR SELECT TO authenticated
  USING (
    public.fn_om_is_host_or_manager(meeting_id)
    OR public.fn_om_is_participant(meeting_id)
  );

DROP POLICY IF EXISTS online_meeting_polls_write ON public.online_meeting_polls;
CREATE POLICY online_meeting_polls_write ON public.online_meeting_polls
  FOR ALL TO authenticated
  USING (public.fn_om_is_host_or_manager(meeting_id))
  WITH CHECK (public.fn_om_is_host_or_manager(meeting_id));

DROP POLICY IF EXISTS online_meeting_poll_responses_select ON public.online_meeting_poll_responses;
CREATE POLICY online_meeting_poll_responses_select ON public.online_meeting_poll_responses
  FOR SELECT TO authenticated
  USING (
    public.fn_om_owns_participant(participant_id)
    OR EXISTS (
      SELECT 1 FROM public.online_meeting_polls pl
      WHERE pl.id = poll_id
        AND public.fn_om_is_host_or_manager(pl.meeting_id)
    )
  );

DROP POLICY IF EXISTS online_meeting_poll_responses_insert ON public.online_meeting_poll_responses;
CREATE POLICY online_meeting_poll_responses_insert ON public.online_meeting_poll_responses
  FOR INSERT TO authenticated
  WITH CHECK (public.fn_om_owns_participant(participant_id));


-- ---------------------------------------------------------------------
-- Agenda / minutes / action items
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS online_meeting_agenda_items_select ON public.online_meeting_agenda_items;
CREATE POLICY online_meeting_agenda_items_select ON public.online_meeting_agenda_items
  FOR SELECT TO authenticated
  USING (
    public.fn_om_is_host_or_manager(meeting_id)
    OR public.fn_om_is_participant(meeting_id)
  );

DROP POLICY IF EXISTS online_meeting_agenda_items_write ON public.online_meeting_agenda_items;
CREATE POLICY online_meeting_agenda_items_write ON public.online_meeting_agenda_items
  FOR ALL TO authenticated
  USING (public.fn_om_is_host_or_manager(meeting_id))
  WITH CHECK (public.fn_om_is_host_or_manager(meeting_id));

DROP POLICY IF EXISTS online_meeting_minutes_select ON public.online_meeting_minutes;
CREATE POLICY online_meeting_minutes_select ON public.online_meeting_minutes
  FOR SELECT TO authenticated
  USING (
    public.fn_om_is_host_or_manager(meeting_id)
    OR public.fn_om_is_participant(meeting_id)
  );

DROP POLICY IF EXISTS online_meeting_minutes_write ON public.online_meeting_minutes;
CREATE POLICY online_meeting_minutes_write ON public.online_meeting_minutes
  FOR ALL TO authenticated
  USING (public.fn_om_is_host_or_manager(meeting_id))
  WITH CHECK (public.fn_om_is_host_or_manager(meeting_id));

DROP POLICY IF EXISTS online_meeting_action_items_select ON public.online_meeting_action_items;
CREATE POLICY online_meeting_action_items_select ON public.online_meeting_action_items
  FOR SELECT TO authenticated
  USING (
    public.fn_om_is_host_or_manager(meeting_id)
    OR public.fn_om_is_participant(meeting_id)
  );

DROP POLICY IF EXISTS online_meeting_action_items_write ON public.online_meeting_action_items;
CREATE POLICY online_meeting_action_items_write ON public.online_meeting_action_items
  FOR ALL TO authenticated
  USING (public.fn_om_is_host_or_manager(meeting_id))
  WITH CHECK (public.fn_om_is_host_or_manager(meeting_id));

-- An action item's owner may move its status without being able to touch the
-- rest of the meeting. Separate UPDATE policy: policies OR together, so this
-- widens the write above rather than narrowing it.
DROP POLICY IF EXISTS online_meeting_action_items_owner_update ON public.online_meeting_action_items;
CREATE POLICY online_meeting_action_items_owner_update ON public.online_meeting_action_items
  FOR UPDATE TO authenticated
  USING (public.fn_om_owns_participant(owner_participant_id))
  WITH CHECK (public.fn_om_owns_participant(owner_participant_id));

