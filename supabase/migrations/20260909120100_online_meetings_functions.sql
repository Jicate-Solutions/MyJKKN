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
-- SPLIT: Part 2 of 4 - updated_at triggers and the three RLS helper functions. Requires part 1.
--   The combined body timed out (57014) as one exec_sql request at 37 KB,
--   so it ships as four sequential migrations. Apply them in filename order.
-- =====================================================================

-- =====================================================================
-- 3. updated_at TRIGGERS
-- =====================================================================

DROP TRIGGER IF EXISTS trg_online_meetings_updated_at ON public.online_meetings;
CREATE TRIGGER trg_online_meetings_updated_at
  BEFORE UPDATE ON public.online_meetings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_online_meeting_participants_updated_at ON public.online_meeting_participants;
CREATE TRIGGER trg_online_meeting_participants_updated_at
  BEFORE UPDATE ON public.online_meeting_participants
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_online_meeting_attendance_updated_at ON public.online_meeting_attendance;
CREATE TRIGGER trg_online_meeting_attendance_updated_at
  BEFORE UPDATE ON public.online_meeting_attendance
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_online_meeting_polls_updated_at ON public.online_meeting_polls;
CREATE TRIGGER trg_online_meeting_polls_updated_at
  BEFORE UPDATE ON public.online_meeting_polls
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_online_meeting_agenda_items_updated_at ON public.online_meeting_agenda_items;
CREATE TRIGGER trg_online_meeting_agenda_items_updated_at
  BEFORE UPDATE ON public.online_meeting_agenda_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_online_meeting_minutes_updated_at ON public.online_meeting_minutes;
CREATE TRIGGER trg_online_meeting_minutes_updated_at
  BEFORE UPDATE ON public.online_meeting_minutes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_online_meeting_action_items_updated_at ON public.online_meeting_action_items;
CREATE TRIGGER trg_online_meeting_action_items_updated_at
  BEFORE UPDATE ON public.online_meeting_action_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();



-- =====================================================================
-- 4. HELPER FUNCTIONS
-- =====================================================================
-- SECURITY DEFINER because a policy on online_meetings that reads
-- online_meeting_participants — whose own policy reads online_meetings —
-- recurses. Both bodies check auth.uid() themselves and pin search_path,
-- per the DEFINER rules.
--
-- REVOKE FROM PUBLIC BEFORE GRANTING. Creating a function silently grants
-- EXECUTE to PUBLIC, which includes anon; a DEFINER function left that way
-- is an unauthenticated read of whatever it touches.

CREATE OR REPLACE FUNCTION public.fn_om_is_host_or_manager(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1
        FROM public.online_meetings m
        WHERE m.id = p_meeting_id
          AND (
            m.host_profile_id = auth.uid()
            OR (
              public.user_has_permission('onlineMeeting:manage.all')
              AND public.role_has_institution_access(m.institution_id)
            )
          )
      )
    );
$$;

COMMENT ON FUNCTION public.fn_om_is_host_or_manager(uuid) IS
  'True when the caller hosts this meeting, or holds onlineMeeting:manage.all with access to its institution, or is a super admin. DEFINER to break RLS recursion between online_meetings and online_meeting_participants.';

REVOKE ALL ON FUNCTION public.fn_om_is_host_or_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_om_is_host_or_manager(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.fn_om_is_participant(p_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.online_meeting_participants p
      WHERE p.meeting_id = p_meeting_id
        AND p.profile_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.fn_om_is_participant(uuid) IS
  'True when the caller holds an internal participant row on this meeting. External guests never satisfy this — they have no auth session and reach the meeting only through the service-role public routes.';

REVOKE ALL ON FUNCTION public.fn_om_is_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_om_is_participant(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.fn_om_owns_participant(p_participant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.online_meeting_participants p
      WHERE p.id = p_participant_id
        AND p.profile_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.fn_om_owns_participant(uuid) IS
  'True when the given participant row is the caller''s own. Used by the attendance and poll-response write policies.';

REVOKE ALL ON FUNCTION public.fn_om_owns_participant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_om_owns_participant(uuid) TO authenticated;

