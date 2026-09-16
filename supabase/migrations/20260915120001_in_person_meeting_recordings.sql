-- 20260915120001_in_person_meeting_recordings.sql
-- In-person meeting capture — the half no online trick can reach.
--
-- WHY THIS EXISTS
-- Measured on the Fireflies account over the 30 days to 14 Sep 2026: of 50
-- meetings the bot handled, 29 came back with an EMPTY transcript. They were not
-- failures of the bot. Those slots were meetings held in a ROOM — cabin 5, the
-- Think Tank room, an IQAC hall — where the bot joined an empty Meet link, waited
-- twelve minutes and left. A notetaker that joins calls cannot hear a table.
-- Google's own Gemini notes have nothing for those slots either.
--
-- So the recorder has to be a device in the room. Director's decision, 15 Sep:
-- record inside MyJKKN on the phone rather than upload a file afterwards.
--
-- WHY CHUNKS, NOT ONE FILE
-- A browser recording a 96-minute IQAC meeting holds ~25 MB in memory, and one
-- tab crash, one "reload", one low-memory kill loses the entire meeting with no
-- second chance — that meeting happened once. Each ~30 s chunk is uploaded as it
-- is produced, so a crash costs the last few seconds, not the morning. Chunks are
-- concatenated in index order into one playable WebM when transcription runs
-- (MediaRecorder's first chunk carries the header; the rest append).
--
-- WHO MAY RECORD (Director, 15 Sep: "me and a few named people")
-- An explicit allow-list, not a role and not every staff member. Recording a
-- room full of colleagues is a capability granted by name, revoked by deleting a
-- row, and auditable by reading one small table.
--
-- CONSENT (Director, 15 Sep: "I tell them out loud")
-- No tick box gates the button — he announces it, as he would anyway. What the
-- system owes is memory: announced_at records that the person who pressed record
-- said so, and the page asks for nothing it cannot honour.
--
-- Patterns: 20261102010000_campus_walk_storage_bucket.sql (private bucket,
-- service-role-only, no client policy) and 20260614000000_rcltp_phase_a_foundation.sql
-- (private audio bucket + the three-step signed-upload handshake).
--
-- Version 20260915120001. The original 20260915120000 collided with
-- 20260915120000_cdc_drive_notification_log.sql, which landed on jicate/main
-- on 15 Sep while this branch was still a draft. Renumbered 16 Sep; this file
-- has never been applied anywhere, so the rename is free. Still above the
-- highest version on main, and clear of every version the open PRs claim today.

-- ── private bucket ───────────────────────────────────────────────────────────
-- PRIVATE, non-negotiable. These recordings carry candidate interviews (salary
-- history, previous employers), IQAC discussions and staff conversations. A
-- public bucket would make every one of them enumerable by URL.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'meeting-audio', 'meeting-audio', false,
  15728640,  -- 15 MB per CHUNK, not per meeting: ~30 s of Opus is well under 1 MB,
             -- so this is headroom for a slow "final" chunk, never a meeting cap.
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- No client-side storage policy on purpose. Writes happen only through
-- short-lived service-role signed upload URLs whose PATH the server chooses, so
-- a browser can never place a file outside its own recording, and reads happen
-- only through signed download URLs.

-- ── who may record ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_recorder_allowlist (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Why this person may record. Free text, read by a human deciding whether the
  -- grant still makes sense a year from now.
  reason text CHECK (char_length(reason) <= 500),
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meeting_recorder_allowlist IS
  'Who may record an in-person meeting in MyJKKN. An explicit list by name, not a role: recording a room of colleagues is granted one person at a time and revoked by deleting the row.';

ALTER TABLE public.meeting_recorder_allowlist ENABLE ROW LEVEL SECURITY;

-- A person may see whether THEY are on the list (the record page asks). Only
-- admins may read the whole list or change it.
DROP POLICY IF EXISTS "mral_self_read" ON public.meeting_recorder_allowlist;
CREATE POLICY "mral_self_read" ON public.meeting_recorder_allowlist
FOR SELECT USING (profile_id = auth.uid() OR is_super_admin() OR is_admin());

DROP POLICY IF EXISTS "mral_admin_write" ON public.meeting_recorder_allowlist;
CREATE POLICY "mral_admin_write" ON public.meeting_recorder_allowlist
FOR ALL USING (is_super_admin() OR is_admin())
WITH CHECK (is_super_admin() OR is_admin());

REVOKE ALL ON public.meeting_recorder_allowlist FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_recorder_allowlist TO authenticated;

-- ── the recordings ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  -- What the meeting was. Typed before recording starts, because nobody names a
  -- file afterwards and an untitled recording is a recording nobody reopens.
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  -- Optional link to a booked meeting. Null for the ordinary case: a meeting in a
  -- room that was never booked through jkkn.ai.
  booking_id uuid REFERENCES public.meeting_bookings(id) ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'recording'
    CHECK (status IN ('recording', 'uploaded', 'transcribing', 'transcribed', 'failed', 'abandoned')),

  -- Storage. Chunks live at meeting-audio/{recorded_by}/{id}/{index}.webm;
  -- chunk_count is what the concatenator trusts, written at finish.
  chunk_count integer NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  bytes_total bigint NOT NULL DEFAULT 0 CHECK (bytes_total >= 0),
  mime_type text NOT NULL DEFAULT 'audio/webm',
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),

  -- Consent: the recorder confirms they told the room. Not a gate, a memory.
  announced_at timestamptz,

  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  -- Retention (Director, 15 Sep: keep the audio 90 days, then delete). Set at
  -- finish; a sweeper deletes the objects and blanks chunk_count. The TRANSCRIPT
  -- is never deleted by this date — only the audio.
  audio_delete_after timestamptz,
  audio_deleted_at timestamptz,

  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meeting_recordings IS
  'One in-person meeting recorded on a phone inside MyJKKN. Audio is stored as ~30 s chunks so a browser crash costs seconds, not the meeting. Audio is deleted after audio_delete_after (90 days); the transcript outlives it.';
COMMENT ON COLUMN public.meeting_recordings.chunk_count IS
  'Number of chunks the finish step accepted. The concatenator reads 0..chunk_count-1 in order; a gap means an upload was lost and the recording is incomplete, which must be reported rather than silently transcribed short.';
COMMENT ON COLUMN public.meeting_recordings.announced_at IS
  'When the recorder confirmed they told the room out loud. Null means unrecorded consent, not absent consent — but a null here is what an audit will ask about.';

CREATE INDEX IF NOT EXISTS idx_meeting_recordings_by ON public.meeting_recordings(recorded_by, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_status ON public.meeting_recordings(status) WHERE status IN ('uploaded', 'transcribing');
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_retention ON public.meeting_recordings(audio_delete_after)
  WHERE audio_deleted_at IS NULL AND audio_delete_after IS NOT NULL;

DROP TRIGGER IF EXISTS tg_meeting_recordings_updated ON public.meeting_recordings;
CREATE TRIGGER tg_meeting_recordings_updated BEFORE UPDATE ON public.meeting_recordings
  FOR EACH ROW EXECUTE FUNCTION public.tg_native_scheduling_set_updated_at();

ALTER TABLE public.meeting_recordings ENABLE ROW LEVEL SECURITY;

-- Your own recordings, and nobody else's. A meeting recorded by one person is
-- not readable by every colleague simply because they share an institution:
-- these carry interview and IQAC conversations. Sharing is a later, deliberate
-- feature, not an RLS default.
DROP POLICY IF EXISTS "mrec_owner_all" ON public.meeting_recordings;
CREATE POLICY "mrec_owner_all" ON public.meeting_recordings
FOR ALL USING (recorded_by = auth.uid() OR is_super_admin())
WITH CHECK (recorded_by = auth.uid() OR is_super_admin());

REVOKE ALL ON public.meeting_recordings FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_recordings TO authenticated;

-- ── may I record? ────────────────────────────────────────────────────────────
-- One question the record page asks before showing the button.
--
-- SECURITY INVOKER, deliberately. The first draft made this SECURITY DEFINER to
-- "answer about the caller without exposing the list" — and CI was right to
-- reject it: a definer function callable by every signed-in user with no check
-- in its body is exactly the shape that shipped in PR #3130. It was also
-- unnecessary. The mral_self_read policy already restricts a reader to their own
-- row, so under INVOKER this returns true only for the caller's own membership
-- and cannot see anyone else's — enforced by RLS rather than by the discipline
-- of whoever edits this function next.
CREATE OR REPLACE FUNCTION public.fn_may_record_meetings()
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_recorder_allowlist
    WHERE profile_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.fn_may_record_meetings() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_may_record_meetings() TO authenticated;

COMMENT ON FUNCTION public.fn_may_record_meetings() IS
  'True when the signed-in person is on meeting_recorder_allowlist. SECURITY INVOKER: RLS (mral_self_read) is what keeps a caller to their own row, so this can never report on anyone else.';

-- ── seed: the person who asked for this ──────────────────────────────────────
-- An allow-list that ships empty ships a dead feature: the button is hidden for
-- everyone including the person who needs it, and the first report is "it does
-- not work". Seeded by EMAIL, not by a hard-coded uuid, so this is readable a
-- year from now and safely re-runnable. Anyone else is added from the admin
-- side, one row at a time, which is exactly the Director's decision of 15 Sep
-- ("me and a few named people").
INSERT INTO public.meeting_recorder_allowlist (profile_id, reason)
SELECT p.id, 'Director — asked for in-person meeting recording, 15 Sep 2026'
FROM public.profiles p
WHERE lower(p.email) = 'director@jkkn.ac.in'
ON CONFLICT (profile_id) DO NOTHING;
