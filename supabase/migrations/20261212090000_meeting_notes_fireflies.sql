-- supabase/migrations/20261212090000_meeting_notes_fireflies.sql
--
-- ############################################################################
-- ## FILE ONLY — NOT APPLIED. The operator applies this at merge.           ##
-- ## Nothing in this file has been run against production.                  ##
-- ############################################################################
--
-- Meeting notes and recordings, ingested from FIREFLIES' OWN API.
--
-- ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
-- A meeting in MyJKKN (`meeting_bookings`) today carries who, when and where,
-- and nothing about what was SAID. The notes live in Fireflies. This migration
-- gives them a place to land, keyed to the provider's own identifier, so the
-- ingest can run again tomorrow without writing the same note twice.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
-- 1. NO MAILBOX. The source is the Fireflies GraphQL API and only that. No
--    Gmail scope, no Microsoft Graph, no message reading of any kind. MyJKKN
--    never sees the Director's inbox, which is the entire reason this source
--    was chosen over the alternatives (Director's decision, 2026-09-14).
-- 2. NO GUESSING. A note whose provider payload does not carry an EXACT MyJKKN
--    booking identifier stays UNMATCHED (`booking_id IS NULL`) and waits for a
--    human to link it. Matching on "same time, similar attendees" is not
--    implemented and must not be added: a wrong guess staples a private
--    conversation onto somebody else's meeting, and everyone who can see that
--    meeting can then read it. Not matching is recoverable; mis-matching is not.
-- 3. NO RENDERING on the meeting detail page — that is a separate PR.
--
-- ── WHO MAY READ A NOTE ─────────────────────────────────────────────────────
-- Enforced in RLS, not only in the UI (Director's decision, 2026-09-14):
--   * super admins and admins — always;
--   * a MATCHED note (booking_id IS NOT NULL): the people MyJKKN itself records
--     as invited to that booking — the host, the co-hosts of a collective
--     meeting type, the booking's `attendee_profile_id`, and the signed-in
--     profile whose email is the booking's `attendee_email`;
--   * an UNMATCHED note (booking_id IS NULL): admins, plus holders of
--     `meetings.series.manage`. Nobody can be "an attendee" of a meeting we
--     cannot identify, so the attendee test has nothing to resolve against and
--     the note is held by the people whose job is to link it.
--
-- The invited set is read from `meeting_bookings` / `meeting_type_cohosts`,
-- NEVER from the provider's own participant list. `meeting_note_participants`
-- records who Fireflies says was on the call, for display and for the human
-- doing the linking — it grants no access. Deriving row visibility from a
-- third-party payload would mean whoever controls that payload controls who can
-- read our notes.
--
-- ── SHAPE ───────────────────────────────────────────────────────────────────
--   meeting_notes               one row per provider transcript
--   meeting_note_participants   who the provider says was on the call
--   fn_can_view_meeting_note()  the invited-set test, SECURITY DEFINER
--
-- Idempotency is a UNIQUE constraint, not application care:
-- `uq_meeting_notes_provider_ref (provider, provider_ref)`. The ingest upserts
-- onto it, so a re-run updates the row it already wrote and never adds a second.
--
-- Version 20261212090000 is above every file on jicate/main (max
-- 20261211090000) and was checked against the open pull requests with
-- scripts/ci/check-migration-version-cross-pr.sh. No BEGIN/COMMIT of its own.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. meeting_notes
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_notes (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),

  -- The meeting this note belongs to. NULLABLE ON PURPOSE: a note we cannot
  -- identify is a first-class state, not an error. ON DELETE SET NULL so
  -- deleting a booking returns its notes to the unmatched list rather than
  -- destroying them.
  booking_id uuid REFERENCES public.meeting_bookings(id) ON DELETE SET NULL,

  -- Where the note came from. One value today; the CHECK is the audit trail
  -- that adding a second source is a decision somebody made on purpose.
  provider text NOT NULL DEFAULT 'fireflies'
    CHECK (provider IN ('fireflies')),

  -- The provider's own identifier for this transcript. The idempotency key.
  provider_ref text NOT NULL
    CHECK (btrim(provider_ref) <> ''),

  title text,
  summary text,
  transcript_url text,
  recording_url text,
  occurred_at timestamptz,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes >= 0),

  -- The provider response as received, so a later reading of the payload never
  -- needs the note re-fetched. Never rendered raw to a user.
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Set when a human links an unmatched note. Kept even if the link is later
  -- cleared, so "who attached this to this meeting" survives.
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- THE IDEMPOTENCY GUARANTEE. Re-running the ingest updates; it never
  -- duplicates. Enforced here rather than in the route, because two overlapping
  -- ingest runs both read "no such note" before either writes.
  CONSTRAINT uq_meeting_notes_provider_ref UNIQUE (provider, provider_ref)
);

COMMENT ON TABLE public.meeting_notes IS
  'Meeting notes/recordings ingested from the Fireflies API. booking_id NULL = UNMATCHED, awaiting a human link; matching is NEVER guessed from time or attendees. Unique on (provider, provider_ref) so re-ingest updates rather than duplicates.';
COMMENT ON COLUMN public.meeting_notes.booking_id IS
  'The MyJKKN meeting this note belongs to, or NULL when the provider payload carried no exact MyJKKN identifier. NULL is a normal state, not a failure.';
COMMENT ON COLUMN public.meeting_notes.provider_ref IS
  'The provider''s own transcript id. Half of the idempotency key.';
COMMENT ON COLUMN public.meeting_notes.raw IS
  'The provider payload as received. Diagnostic only — it grants no access and is not rendered to users.';

CREATE INDEX IF NOT EXISTS idx_meeting_notes_booking
  ON public.meeting_notes(booking_id);
-- The unmatched list's only query: NULL booking, newest first.
CREATE INDEX IF NOT EXISTS idx_meeting_notes_unmatched
  ON public.meeting_notes(occurred_at DESC)
  WHERE booking_id IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. meeting_note_participants — who the PROVIDER says was on the call
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_note_participants (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  note_id uuid NOT NULL
    REFERENCES public.meeting_notes(id) ON DELETE CASCADE,

  -- Stored lower-cased by the ingest so the UNIQUE below actually collapses
  -- "A@x" and "a@x" instead of storing both.
  email text NOT NULL
    CHECK (email = lower(email) AND btrim(email) <> ''),
  display_name text,

  -- Resolved to a MyJKKN profile where one matches, for display only. It is
  -- NOT consulted by any policy — see the header.
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_meeting_note_participants UNIQUE (note_id, email)
);

COMMENT ON TABLE public.meeting_note_participants IS
  'Who the provider says attended the call for one meeting_notes row. DISPLAY ONLY — deliberately not consulted by any RLS policy, so a third-party payload can never widen who may read a note.';

CREATE INDEX IF NOT EXISTS idx_meeting_note_participants_note
  ON public.meeting_note_participants(note_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. fn_can_view_meeting_note — the invited-set test
-- ───────────────────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER because it reads `meeting_bookings`, `meeting_type_cohosts`
-- and `profiles`, each of which is itself RLS-protected. Under invoker rights
-- an attendee's own row would be filtered out of the very lookup that is meant
-- to identify them, and the policy would deny everyone except the host.
--
-- ci:allow-secdef-authenticated The function takes only a booking id and
-- answers exclusively about auth.uid(); there is no argument by which a caller
-- can ask about somebody else, and it returns a boolean, never a row. Every
-- authenticated user may legitimately ask "may I see this one".

CREATE OR REPLACE FUNCTION public.fn_can_view_meeting_note(p_booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_ok boolean;
BEGIN
  -- Not signed in: nothing is visible. Also the pg_cron / direct-connection
  -- case, where auth.uid() is NULL — those callers use the service role, which
  -- bypasses RLS and never reaches this function.
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- An UNMATCHED note has no invited set to resolve against. Who may see it is
  -- decided by the policy (admins + meetings.series.manage), not here.
  IF p_booking_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(btrim(p.email)) INTO v_email
  FROM public.profiles p
  WHERE p.id = v_uid;

  SELECT true INTO v_ok
  FROM public.meeting_bookings b
  WHERE b.id = p_booking_id
    AND (
      -- the host
      b.host_profile_id = v_uid
      -- the invited attendee, when the booking resolved them to a profile.
      -- Added to meeting_bookings by 20260612090000_universal_booking_substrate
      -- (verified against jicate/main). It is the reliable identity; the email
      -- test below is the fallback for bookings made before a profile existed
      -- for that address.
      OR b.attendee_profile_id = v_uid
      -- the invited attendee, matched on the address the booking was made with
      OR (
        v_email IS NOT NULL
        AND v_email <> ''
        AND lower(btrim(b.attendee_email)) = v_email
      )
      -- a required co-host of a collective meeting type
      OR EXISTS (
        SELECT 1
        FROM public.meeting_type_cohosts c
        WHERE c.meeting_type_id = b.meeting_type_id
          AND c.cohost_profile_id = v_uid
      )
    );

  -- FOUND, not `v_ok`: a SELECT ... INTO that matches no row leaves the target
  -- NULL, and `IF NOT v_ok` would then take neither branch.
  -- (memory: feedback_null_sentinels_and_cross_statement_state)
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.fn_can_view_meeting_note(uuid) IS
  'True when the signed-in profile is on MyJKKN''s OWN invited set for that booking — host, collective co-host, or the profile holding the booking''s attendee_email. Never consults the provider participant list. Returns false for a NULL booking (an unmatched note is decided by the policy instead).';

REVOKE EXECUTE ON FUNCTION public.fn_can_view_meeting_note(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_view_meeting_note(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Privileges
-- ───────────────────────────────────────────────────────────────────────────
--
-- Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
-- TO anon, authenticated, service_role`, so both tables are created with the
-- FULL privilege set for the anon key that ships inside every page of
-- https://www.jkkn.ai. Revoking anon and PUBLIC alone leaves `authenticated`
-- its own direct grant — which here would read "any signed-in account may
-- rewrite the minutes of any meeting". Name all three.
--
-- REVOKE ALL, never a bare REVOKE TRUNCATE: the ship-wave gate greps that
-- keyword after stripping comments and strings, and a bare form freezes the
-- wave fleet-wide (memory: reference_revoke_truncate_keyword_freezes_the_ship_wave).

REVOKE ALL ON TABLE public.meeting_notes             FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public.meeting_note_participants FROM anon, authenticated, PUBLIC;

-- Reads are filtered by the policies below.
GRANT SELECT ON TABLE public.meeting_notes             TO authenticated;
GRANT SELECT ON TABLE public.meeting_note_participants TO authenticated;

-- NO table-level write grant to `authenticated`, deliberately. Linking is done
-- through fn_link_meeting_note() below, never by writing the row directly —
-- see the note there for why a direct UPDATE cannot work at all.

-- The ingest runs on the service-role client and writes everything.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meeting_notes             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meeting_note_participants TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Row level security
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.meeting_notes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_note_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting_notes_select" ON public.meeting_notes;
CREATE POLICY "meeting_notes_select" ON public.meeting_notes
FOR SELECT USING (
  is_super_admin()
  OR is_admin()
  -- UNMATCHED: nobody can be an attendee of a meeting we cannot identify, so
  -- it is held by the people whose job is to link it.
  OR (booking_id IS NULL AND user_has_permission('meetings.series.manage'))
  -- MATCHED: MyJKKN's own invited set for that booking.
  OR fn_can_view_meeting_note(booking_id)
);

-- NO UPDATE policy, and this is the interesting part. The obvious design — an
-- UPDATE policy admitting admins and `meetings.series.manage` — CANNOT WORK,
-- and the failure is silent until somebody tries to link something:
--
--   PostgreSQL checks the NEW row of an UPDATE against the SELECT policy too.
--   The moment a linker sets booking_id, the row stops being unmatched, so the
--   `booking_id IS NULL AND user_has_permission(...)` branch no longer admits
--   it — and unless that linker happens to be on the invited set of the meeting
--   they just linked to, the new row is invisible to them and Postgres refuses
--   the write with "new row violates row-level security policy".
--
--   Proven on PostgreSQL 16 during this file's rehearsal: the same UPDATE fails
--   for a `meetings.series.manage` holder, succeeds for an admin, and succeeds
--   for the permission holder the instant the SELECT policy is widened to
--   `USING (true)`. Setting linked_at alone succeeds; setting booking_id is
--   what fails. The failure is a function of the NEW value, not of the grant.
--
-- Widening the SELECT policy to make that UPDATE work would hand every series
-- manager every meeting's private notes — the opposite of the rule. So linking
-- goes through fn_link_meeting_note() instead, which carries the authorization
-- explicitly and does not require the linker to be able to read the result.

-- Participants follow their note exactly — one place decides visibility.
DROP POLICY IF EXISTS "meeting_note_participants_select" ON public.meeting_note_participants;
CREATE POLICY "meeting_note_participants_select" ON public.meeting_note_participants
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.meeting_notes n
    WHERE n.id = note_id
      AND (
        is_super_admin()
        OR is_admin()
        OR (n.booking_id IS NULL AND user_has_permission('meetings.series.manage'))
        OR fn_can_view_meeting_note(n.booking_id)
      )
  )
);

-- No INSERT, UPDATE or DELETE policy on either table, on purpose: those verbs
-- belong to the service-role ingest, which bypasses RLS. With RLS on and no
-- policy for a verb, that verb is denied to every non-bypassing role — and
-- `authenticated` holds no write grant either, so each is closed twice.

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Linking — the one write a signed-in person may make
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_link_meeting_note(
  p_note_id uuid,
  p_booking_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_booking uuid;
  v_found boolean;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('meetings.series.manage')) THEN
    RAISE EXCEPTION 'not authorized to link meeting notes'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_note_id IS NULL OR p_booking_id IS NULL THEN
    RAISE EXCEPTION 'fn_link_meeting_note requires both a note and a meeting';
  END IF;

  -- Read the current state through the DEFINER's rights so the check is about
  -- the note's state, not about whether the caller could see it.
  SELECT n.booking_id, true INTO v_current_booking, v_found
  FROM public.meeting_notes n
  WHERE n.id = p_note_id;

  -- FOUND, never the sentinel: a no-row SELECT ... INTO leaves BOTH targets
  -- NULL, so `IF NOT v_found` would be NULL and take neither branch — which is
  -- how an unknown id would slip through as "unmatched, go ahead".
  -- (memory: feedback_null_sentinels_and_cross_statement_state)
  IF NOT FOUND THEN
    RAISE EXCEPTION 'meeting note not found';
  END IF;

  -- Only an UNMATCHED note may be linked. Re-pointing a note that is already on
  -- a meeting would move a private conversation from one audience to another in
  -- one statement; unlink it first, deliberately, and link it again.
  IF v_current_booking IS NOT NULL THEN
    RAISE EXCEPTION 'this note is already linked to a meeting — unlink it first';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.meeting_bookings b WHERE b.id = p_booking_id) THEN
    RAISE EXCEPTION 'meeting not found';
  END IF;

  UPDATE public.meeting_notes
     SET booking_id = p_booking_id,
         linked_by  = auth.uid(),
         linked_at  = now(),
         updated_at = now()
   WHERE id = p_note_id;

  RETURN p_note_id;
END;
$$;

COMMENT ON FUNCTION public.fn_link_meeting_note(uuid, uuid) IS
  'Attach an UNMATCHED meeting note to a meeting. Admins and holders of meetings.series.manage only. SECURITY DEFINER because a direct UPDATE is impossible under the SELECT policy — the linked row leaves the linker''s visibility, and Postgres checks the new row against that policy. Refuses a note that is already linked.';

REVOKE EXECUTE ON FUNCTION public.fn_link_meeting_note(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_link_meeting_note(uuid, uuid) TO authenticated, service_role;

-- The undo. Bounded on purpose: a linker can take back their OWN link, because
-- the moment they link a note they can no longer see it and would otherwise
-- need an admin to correct a slip. They cannot detach a link somebody else
-- made — that is an admin's job.
CREATE OR REPLACE FUNCTION public.fn_unlink_meeting_note(p_note_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked_by uuid;
BEGIN
  IF p_note_id IS NULL THEN
    RAISE EXCEPTION 'fn_unlink_meeting_note requires a note';
  END IF;

  SELECT n.linked_by INTO v_linked_by
  FROM public.meeting_notes n
  WHERE n.id = p_note_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'meeting note not found';
  END IF;

  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('meetings.series.manage')
      AND v_linked_by IS NOT NULL
      AND v_linked_by = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'not authorized to unlink this meeting note'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.meeting_notes
     SET booking_id = NULL,
         updated_at = now()
   WHERE id = p_note_id;

  RETURN p_note_id;
END;
$$;

COMMENT ON FUNCTION public.fn_unlink_meeting_note(uuid) IS
  'Return a note to the unmatched list. Admins, or the person who made that link (their own slip, which they can no longer see to fix any other way). linked_by is left in place as the record of who linked it.';

REVOKE EXECUTE ON FUNCTION public.fn_unlink_meeting_note(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_unlink_meeting_note(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. End-state assertions — fail the apply, not a reader weeks later
-- ───────────────────────────────────────────────────────────────────────────

DO $assert$
BEGIN
  IF has_table_privilege('anon', 'public.meeting_notes', 'SELECT')
     OR has_table_privilege('anon', 'public.meeting_notes', 'INSERT')
     OR has_table_privilege('anon', 'public.meeting_note_participants', 'SELECT') THEN
    RAISE EXCEPTION 'meeting notes: anon still holds a table privilege';
  END IF;

  IF has_table_privilege('authenticated', 'public.meeting_notes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.meeting_notes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.meeting_notes', 'DELETE')
     OR has_table_privilege('authenticated', 'public.meeting_note_participants', 'INSERT') THEN
    RAISE EXCEPTION 'meeting notes: authenticated holds a write it must not have';
  END IF;

  IF has_function_privilege('anon', 'public.fn_link_meeting_note(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_unlink_meeting_note(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'meeting notes: anon can execute a linking function';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.meeting_notes', 'SELECT') THEN
    RAISE EXCEPTION 'meeting notes: authenticated lost the SELECT it needs';
  END IF;

  IF has_function_privilege('anon', 'public.fn_can_view_meeting_note(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'meeting notes: anon can execute the visibility function';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.fn_can_view_meeting_note(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'meeting notes: authenticated cannot execute the visibility function';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('meeting_notes', 'meeting_note_participants')
      AND c.relrowsecurity
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'meeting notes: row level security is not on both tables';
  END IF;
END;
$assert$;

NOTIFY pgrst, 'reload schema';
