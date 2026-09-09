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
-- SPLIT: Part 1 of 4 - tables and indexes.
--   The combined body timed out (57014) as one exec_sql request at 37 KB,
--   so it ships as four sequential migrations. Apply them in filename order.
-- =====================================================================

-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- online_meetings — the meeting itself
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_meetings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      uuid NOT NULL REFERENCES public.institutions(id),
  title               text NOT NULL,
  description         text,
  host_profile_id     uuid NOT NULL REFERENCES public.profiles(id),
  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz NOT NULL,
  timezone            text NOT NULL DEFAULT 'Asia/Kolkata',
  status              text NOT NULL DEFAULT 'scheduled',
  meet_url            text,
  meet_source         text NOT NULL DEFAULT 'manual',
  google_event_id     text,
  recording_url       text,
  join_mode           text NOT NULL DEFAULT 'invite_only',
  open_join_token     uuid,
  engagement_config   jsonb NOT NULL DEFAULT '{}'::jsonb,
  quiz                jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Reserved for phase 2 (recurring series). Nullable and unread today, so
  -- the series table can be added later without migrating a single row.
  series_id           uuid,
  cancelled_at        timestamptz,
  cancellation_reason text,
  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT online_meetings_status_chk
    CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled')),
  CONSTRAINT online_meetings_meet_source_chk
    CHECK (meet_source IN ('google', 'manual')),
  CONSTRAINT online_meetings_join_mode_chk
    CHECK (join_mode IN ('invite_only', 'open_link')),
  CONSTRAINT online_meetings_window_chk
    CHECK (ends_at > starts_at),
  -- An open-link meeting is defined by having a token to open. Without this
  -- the join_mode column would be decorative and a meeting could claim to be
  -- open with no way in.
  CONSTRAINT online_meetings_open_token_chk
    CHECK (
      (join_mode = 'open_link'   AND open_join_token IS NOT NULL) OR
      (join_mode = 'invite_only' AND open_join_token IS NULL)
    )
);

COMMENT ON TABLE public.online_meetings IS
  'A scheduled online team meeting. Unlike an AI Pulse cycle (a startup_events row created only by cron) any staff member holding onlineMeeting:create can schedule one for any date and time.';
COMMENT ON COLUMN public.online_meetings.engagement_config IS
  'Per-meeting engagement thresholds: late_threshold_minutes, join_doors_open_minutes, stay_tolerance_minutes, require_polls (bool), required_poll_count, require_quiz (bool), quiz_pass_threshold. AI Pulse reads these globally from ai_pulse_policies; a dynamic meeting may legitimately have no polls and no quiz, and a hardcoded gate would then mark every attendee disengaged.';
COMMENT ON COLUMN public.online_meetings.quiz IS
  'Optional post-meeting quiz, same shape as startup_events.config.quiz: { questions[], pass_threshold_live, pass_threshold_async }.';
COMMENT ON COLUMN public.online_meetings.series_id IS
  'Phase 2 placeholder for recurring series. Deliberately has no FK yet — the series table does not exist.';


-- ---------------------------------------------------------------------
-- online_meeting_participants — the invite list AND the identity anchor
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_meeting_participants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id            uuid NOT NULL REFERENCES public.online_meetings(id) ON DELETE CASCADE,
  institution_id        uuid NOT NULL REFERENCES public.institutions(id),
  participant_kind      text NOT NULL,
  profile_id            uuid REFERENCES public.profiles(id),
  external_name         text,
  external_email        text,
  external_organization text,
  join_token            uuid NOT NULL DEFAULT gen_random_uuid(),
  invited_via           text NOT NULL DEFAULT 'individual',
  invite_status         text NOT NULL DEFAULT 'invited',
  invited_by            uuid REFERENCES public.profiles(id),
  invited_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT online_meeting_participants_kind_chk
    CHECK (participant_kind IN ('internal', 'external')),
  CONSTRAINT online_meeting_participants_invited_via_chk
    CHECK (invited_via IN ('individual', 'department', 'institution', 'open_link')),
  CONSTRAINT online_meeting_participants_status_chk
    CHECK (invite_status IN ('invited', 'sent', 'opened', 'joined', 'declined')),
  -- The two kinds are mutually exclusive. Without this a row could carry both
  -- a profile and an external name and no report could say which it was.
  CONSTRAINT online_meeting_participants_identity_chk
    CHECK (
      (participant_kind = 'internal'
        AND profile_id IS NOT NULL
        AND external_name IS NULL AND external_email IS NULL)
      OR
      (participant_kind = 'external'
        AND profile_id IS NULL
        AND external_name IS NOT NULL)
    )
);

COMMENT ON TABLE public.online_meeting_participants IS
  'One row per invited person. THE table that makes external guests representable: a row is either an internal profile or an external name + email, never both. Attendance and poll responses key off this row, not off profiles.';
COMMENT ON COLUMN public.online_meeting_participants.join_token IS
  'Bearer credential for the /join/[token] guest page. Scoped to ONE participant of ONE meeting; grants no read beyond that meeting; revocable by regenerating it. Anyone holding the link is this participant — inherent to link-based guest access.';
COMMENT ON COLUMN public.online_meeting_participants.invited_via IS
  'How this row came to exist. Department and institution invites are expanded into individual rows at invite time — attendance evidence has to name people, not groups.';

-- One row per person per meeting. Partial uniques because the other identity
-- column is NULL for the opposite kind.
CREATE UNIQUE INDEX IF NOT EXISTS online_meeting_participants_profile_uidx
  ON public.online_meeting_participants (meeting_id, profile_id)
  WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS online_meeting_participants_email_uidx
  ON public.online_meeting_participants (meeting_id, lower(external_email))
  WHERE external_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS online_meeting_participants_token_uidx
  ON public.online_meeting_participants (join_token);


-- ---------------------------------------------------------------------
-- online_meeting_attendance — one row per participant per meeting
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_meeting_attendance (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id         uuid NOT NULL REFERENCES public.online_meetings(id) ON DELETE CASCADE,
  participant_id     uuid NOT NULL REFERENCES public.online_meeting_participants(id) ON DELETE CASCADE,
  institution_id     uuid NOT NULL REFERENCES public.institutions(id),
  joined_at          timestamptz,
  engagement_signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT online_meeting_attendance_uniq UNIQUE (meeting_id, participant_id)
);

COMMENT ON TABLE public.online_meeting_attendance IS
  'Per-participant engagement record. NOTE the deliberate absence of a left_at column: ai_pulse_live_attendance.left_at was never written in 3,631 rows and reads as a confident "never left" to anything that trusts it. Leave time lives in engagement_signals, where every reader already looks.';
COMMENT ON COLUMN public.online_meeting_attendance.engagement_signals IS
  'joined_on_time (bool), polls_responded (int), stayed_until (IST "HH:MM"), last_heartbeat_at (ISO), quiz_score (0-100), quiz_passed (bool), quiz_async_makeup (bool).';


-- ---------------------------------------------------------------------
-- online_meeting_polls / responses
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_meeting_polls (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id     uuid NOT NULL REFERENCES public.online_meetings(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  question       text NOT NULL,
  options        jsonb NOT NULL,
  is_open        boolean NOT NULL DEFAULT true,
  issued_at      timestamptz NOT NULL DEFAULT now(),
  closed_at      timestamptz,
  created_by     uuid REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.online_meeting_poll_responses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id        uuid NOT NULL REFERENCES public.online_meeting_polls(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.online_meeting_participants(id) ON DELETE CASCADE,
  option_id      text NOT NULL,
  responded_at   timestamptz NOT NULL DEFAULT now(),

  -- ai_pulse_poll_responses has no such constraint, so getLiveSession has to
  -- recompute COUNT(DISTINCT poll_id) on every read to stop a re-answer
  -- inflating the gate. Enforcing it here makes that recomputation needless.
  CONSTRAINT online_meeting_poll_responses_uniq UNIQUE (poll_id, participant_id)
);


-- ---------------------------------------------------------------------
-- Agenda / minutes / action items
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_meeting_agenda_items (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id              uuid NOT NULL REFERENCES public.online_meetings(id) ON DELETE CASCADE,
  institution_id          uuid NOT NULL REFERENCES public.institutions(id),
  title                   text NOT NULL,
  detail                  text,
  presenter_participant_id uuid REFERENCES public.online_meeting_participants(id) ON DELETE SET NULL,
  sort_order              integer NOT NULL DEFAULT 0,
  duration_min            integer,
  status                  text NOT NULL DEFAULT 'pending',
  created_by              uuid REFERENCES public.profiles(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT online_meeting_agenda_items_status_chk
    CHECK (status IN ('pending', 'discussed', 'deferred', 'dropped'))
);

CREATE TABLE IF NOT EXISTS public.online_meeting_minutes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id     uuid NOT NULL UNIQUE REFERENCES public.online_meetings(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  content        text NOT NULL DEFAULT '',
  recorded_by    uuid REFERENCES public.profiles(id),
  published_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.online_meeting_action_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id          uuid NOT NULL REFERENCES public.online_meetings(id) ON DELETE CASCADE,
  institution_id      uuid NOT NULL REFERENCES public.institutions(id),
  title               text NOT NULL,
  detail              text,
  owner_participant_id uuid REFERENCES public.online_meeting_participants(id) ON DELETE SET NULL,
  due_date            date,
  status              text NOT NULL DEFAULT 'open',
  completed_at        timestamptz,
  created_by          uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT online_meeting_action_items_status_chk
    CHECK (status IN ('open', 'in_progress', 'done', 'dropped'))
);



-- =====================================================================
-- 2. INDEXES
-- =====================================================================
-- Every FK gets one (an unindexed FK turns a cascade delete into a seq scan
-- of the child table), plus the columns the list screens and the RLS
-- predicates actually filter on.

CREATE INDEX IF NOT EXISTS online_meetings_host_starts_idx
  ON public.online_meetings (host_profile_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS online_meetings_institution_starts_idx
  ON public.online_meetings (institution_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS online_meetings_created_by_idx
  ON public.online_meetings (created_by);
CREATE INDEX IF NOT EXISTS online_meetings_open_token_idx
  ON public.online_meetings (open_join_token) WHERE open_join_token IS NOT NULL;

-- fn_om_is_participant hits (meeting_id, profile_id) on every policy check.
CREATE INDEX IF NOT EXISTS online_meeting_participants_meeting_profile_idx
  ON public.online_meeting_participants (meeting_id, profile_id);
CREATE INDEX IF NOT EXISTS online_meeting_participants_profile_idx
  ON public.online_meeting_participants (profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS online_meeting_participants_institution_idx
  ON public.online_meeting_participants (institution_id);
CREATE INDEX IF NOT EXISTS online_meeting_participants_invited_by_idx
  ON public.online_meeting_participants (invited_by);

CREATE INDEX IF NOT EXISTS online_meeting_attendance_meeting_idx
  ON public.online_meeting_attendance (meeting_id);
CREATE INDEX IF NOT EXISTS online_meeting_attendance_participant_idx
  ON public.online_meeting_attendance (participant_id);
CREATE INDEX IF NOT EXISTS online_meeting_attendance_institution_idx
  ON public.online_meeting_attendance (institution_id);

CREATE INDEX IF NOT EXISTS online_meeting_polls_meeting_idx
  ON public.online_meeting_polls (meeting_id, issued_at);
CREATE INDEX IF NOT EXISTS online_meeting_polls_institution_idx
  ON public.online_meeting_polls (institution_id);
CREATE INDEX IF NOT EXISTS online_meeting_polls_created_by_idx
  ON public.online_meeting_polls (created_by);

CREATE INDEX IF NOT EXISTS online_meeting_poll_responses_poll_idx
  ON public.online_meeting_poll_responses (poll_id);
CREATE INDEX IF NOT EXISTS online_meeting_poll_responses_participant_idx
  ON public.online_meeting_poll_responses (participant_id);

CREATE INDEX IF NOT EXISTS online_meeting_agenda_items_meeting_idx
  ON public.online_meeting_agenda_items (meeting_id, sort_order);
CREATE INDEX IF NOT EXISTS online_meeting_agenda_items_institution_idx
  ON public.online_meeting_agenda_items (institution_id);
CREATE INDEX IF NOT EXISTS online_meeting_agenda_items_presenter_idx
  ON public.online_meeting_agenda_items (presenter_participant_id);
CREATE INDEX IF NOT EXISTS online_meeting_agenda_items_created_by_idx
  ON public.online_meeting_agenda_items (created_by);

CREATE INDEX IF NOT EXISTS online_meeting_minutes_institution_idx
  ON public.online_meeting_minutes (institution_id);
CREATE INDEX IF NOT EXISTS online_meeting_minutes_recorded_by_idx
  ON public.online_meeting_minutes (recorded_by);

CREATE INDEX IF NOT EXISTS online_meeting_action_items_meeting_idx
  ON public.online_meeting_action_items (meeting_id, status);
CREATE INDEX IF NOT EXISTS online_meeting_action_items_owner_idx
  ON public.online_meeting_action_items (owner_participant_id);
CREATE INDEX IF NOT EXISTS online_meeting_action_items_institution_idx
  ON public.online_meeting_action_items (institution_id);
CREATE INDEX IF NOT EXISTS online_meeting_action_items_created_by_idx
  ON public.online_meeting_action_items (created_by);

