-- 20260915060000_meet_auto_record.sql
-- Universal Booking — per-host "record my Google Meet automatically" preference.
--
-- WHY: Fireflies' notetaker bot is the only thing recording JKKN's online
-- meetings today, and it produces no Tamil and no audio we can re-process.
-- Google Meet can record the meeting itself — no bot, no guest in the room —
-- when the meeting SPACE is created with
-- config.artifactConfig.recordingConfig.autoRecordingGeneration = ON
-- (Google Meet REST API v2, spaces.create). The recording lands in the space
-- owner's Drive, from where the meetings/notes ingest endpoint takes it to
-- Sarvam for Tamil transcription.
--
-- Recording requires the host's Google account to hold a licence that grants
-- the recording privilege (Teaching & Learning Upgrade / Education Plus /
-- Business Plus). A host without it keeps a perfectly normal Meet link: the
-- space is still created, Google simply generates no artifact.
--
-- OPT-IN, DEFAULT FALSE. Recording a meeting is a consent decision that belongs
-- to the host, never to a deploy. Nothing changes for any existing host until
-- they turn this on themselves on /meetings/availability.
--
-- Pattern: 20260619000200_meeting_integration_config.sql (this table, its RLS
-- and its SECURITY INVOKER upsert RPC) and 20260813000000 (show_note_in_title —
-- the same "code ships before the migration is applied, reader falls back on
-- 42703" contract).

ALTER TABLE public.meeting_host_integration_prefs
  ADD COLUMN IF NOT EXISTS auto_record boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.meeting_host_integration_prefs.auto_record IS
  'Opt-in: create this host''s Google Meet through the Meet API with auto recording, transcription and smart notes ON, so the meeting records itself without a notetaker bot. Default false. Needs the meetings.space.created OAuth scope (host must reconnect Google) and a Google licence carrying the recording privilege; without either, booking silently falls back to an ordinary Meet link.';

-- ── upsert RPC (anon-locked, SECURITY INVOKER) ───────────────────────────────
-- Separate from fn_set_meeting_integration_pref so a host can flip recording
-- without restating their provider, and so this migration adds no new failure
-- mode to the existing call.

CREATE OR REPLACE FUNCTION public.fn_set_meeting_auto_record(
  p_auto_record boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'fn_set_meeting_auto_record: no authenticated user';
  END IF;
  IF p_auto_record IS NULL THEN
    RAISE EXCEPTION 'fn_set_meeting_auto_record: auto_record must be true or false';
  END IF;

  INSERT INTO public.meeting_host_integration_prefs (host_profile_id, auto_record)
  VALUES (v_uid, p_auto_record)
  ON CONFLICT (host_profile_id) DO UPDATE
    SET auto_record = EXCLUDED.auto_record,
        updated_at  = now();
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_meeting_auto_record(boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_set_meeting_auto_record(boolean) TO authenticated;

COMMENT ON FUNCTION public.fn_set_meeting_auto_record(boolean) IS
  'Universal Booking: set the signed-in host''s auto_record preference. SECURITY INVOKER — RLS (mhip_host_all) plus the auth.uid() guard keep a caller to their own row.';
