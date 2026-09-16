-- Updated: 2026-09-15 - A meeting can hold everyone who was in it.
--
-- THE SHAPE PROBLEM. `meeting_bookings` carries exactly one attendee, as
-- `attendee_name` + `attendee_email`, both NOT NULL. That is the right model for
-- what the table was built for: someone picks a slot on a host's public page.
-- It is the wrong model for the meetings JKKN actually runs.
--
-- Measured on production 2026-09-15, across the 1,283 recordings that carry a
-- Google event id but have no booking in MyJKKN:
--
--     1 or 2 people      472   (37%)  fits today's shape
--     3 to 5              88   ( 7%)
--     6 to 10            164   (13%)
--     more than 10       559   (44%)
--
-- 63% are group meetings, and the largest ones — IQAC, admission strategy — are
-- exactly the meetings where "who was there and what did we agree" matters most.
-- Importing those into a one-attendee table would mean choosing one person and
-- discarding the rest.
--
-- WHAT THIS DOES *NOT* DO, ON PURPOSE. It does not touch `attendee_name` or
-- `attendee_email`, and it does not make them nullable. 25 files and 93 lines
-- read those columns today. Changing them would mean rewriting every one of
-- those call sites in the same change that introduces a new table, and any bug
-- in that rewrite would land on live scheduling.
--
-- So the single attendee stays exactly as it is and keeps meaning what it has
-- always meant: the person who booked. This table is the FULL list beside it.
-- Existing code is untouched and correct; new code reads the list.

CREATE TABLE IF NOT EXISTS public.meeting_booking_attendees (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES public.meeting_bookings(id) ON DELETE CASCADE,

  -- Email is the identity, not the name. Names differ between systems for the
  -- same person (a calendar invite said "Prof. Dr. T. Maheswaran" where the
  -- transcript heard "Maheswaran T"); an address does not. Lowercased by CHECK
  -- so a join never fails on capitalisation.
  email        text NOT NULL
    CHECK (email = lower(email) AND btrim(email) <> ''),
  display_name text,

  -- Filled when the address matches a MyJKKN person. NULL is ordinary and
  -- expected: 1,001 distinct people appear across the recordings and 284 of
  -- them are MyJKKN users. An external guest is a real attendee.
  profile_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  is_organiser boolean NOT NULL DEFAULT false,

  -- Google's own word for whether they accepted. Kept as text rather than an
  -- enum: it is another system's vocabulary and may gain values we do not
  -- control. NULL means the source did not say.
  response_status text
    CHECK (response_status IS NULL
           OR response_status IN ('accepted','declined','tentative','needsAction')),

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- One row per person per meeting. The upsert target for any importer.
  CONSTRAINT uq_meeting_booking_attendees UNIQUE (booking_id, email)
);

CREATE INDEX IF NOT EXISTS idx_meeting_booking_attendees_booking
  ON public.meeting_booking_attendees (booking_id);

-- "Which meetings was this person in?" — the question that makes a meeting
-- history worth having, and the one the single-attendee column can only answer
-- for the person who did the booking.
CREATE INDEX IF NOT EXISTS idx_meeting_booking_attendees_profile
  ON public.meeting_booking_attendees (profile_id)
  WHERE profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_booking_attendees_email
  ON public.meeting_booking_attendees (email);

COMMENT ON TABLE public.meeting_booking_attendees IS
  'Everyone in a meeting. meeting_bookings.attendee_email remains the person who booked it; this is the full list beside it, so a group meeting is not forced into a one-attendee shape.';

-- ============================================================================
-- ROW LEVEL SECURITY — the parent booking decides, in one place
-- ============================================================================
ALTER TABLE public.meeting_booking_attendees ENABLE ROW LEVEL SECURITY;

-- Written as EXISTS against the booking rather than restating mb_host_select's
-- predicate here. A copied predicate is a predicate that drifts: the day the
-- booking rule changes, a restatement keeps enforcing the old one and nothing
-- reports it.
DROP POLICY IF EXISTS "meeting_booking_attendees_select" ON public.meeting_booking_attendees;
CREATE POLICY "meeting_booking_attendees_select"
  ON public.meeting_booking_attendees FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.meeting_bookings b
      WHERE b.id = booking_id
        AND (is_super_admin() OR is_admin() OR b.host_profile_id = auth.uid())
    )
  );

-- No INSERT, UPDATE or DELETE policy, deliberately. The same discipline as
-- meeting_notes: an attendee list is written by the importer and the ingest,
-- which run as the service role. A person editing who attended a meeting is a
-- separate decision with its own rules, and inventing a write path here would
-- pre-empt it.

-- ============================================================================
-- GRANTS — anon must be named explicitly
-- ============================================================================
-- Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
-- TO anon`, so a new table is born reachable by the key embedded in every page.
-- REVOKE ALL and re-GRANT, never a bare per-privilege revoke: the ship-wave gate
-- greps the table-emptying keyword out of executable SQL and freezes the whole
-- wave if it survives.
REVOKE ALL ON TABLE public.meeting_booking_attendees FROM anon, authenticated, PUBLIC;
GRANT  SELECT ON TABLE public.meeting_booking_attendees TO authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.meeting_booking_attendees TO service_role;

-- ============================================================================
-- BACKFILL — every existing meeting gets a list containing the people it knows
-- ============================================================================
-- Idempotent by construction: ON CONFLICT DO NOTHING against the unique key, so
-- re-running writes nothing and cannot disturb a row an importer has since
-- enriched.

-- The person who booked.
INSERT INTO public.meeting_booking_attendees (booking_id, email, display_name, is_organiser)
SELECT b.id, lower(btrim(b.attendee_email)), b.attendee_name, false
FROM public.meeting_bookings b
WHERE btrim(coalesce(b.attendee_email, '')) <> ''
ON CONFLICT (booking_id, email) DO NOTHING;

-- The host, as organiser. Only where the host's profile carries an address —
-- a host without one is left out rather than represented by a blank.
INSERT INTO public.meeting_booking_attendees (booking_id, email, display_name, is_organiser, profile_id)
SELECT b.id, lower(btrim(p.email)), p.full_name, true, p.id
FROM public.meeting_bookings b
JOIN public.profiles p ON p.id = b.host_profile_id
WHERE btrim(coalesce(p.email, '')) <> ''
ON CONFLICT (booking_id, email) DO NOTHING;

-- Mark the organiser, as a separate step rather than relying on the INSERT
-- above. When the host books a meeting with themselves, their row is already
-- present as the attendee, so the organiser insert hits ON CONFLICT DO NOTHING
-- and the flag would silently stay false — the host recorded as not organising
-- their own meeting. Caught in rehearsal on a throwaway Postgres 16, not in
-- review.
UPDATE public.meeting_booking_attendees a
SET is_organiser = true, updated_at = now()
FROM public.meeting_bookings b
JOIN public.profiles p ON p.id = b.host_profile_id
WHERE a.booking_id = b.id
  AND a.is_organiser = false
  AND lower(btrim(coalesce(p.email, ''))) = a.email;

-- Match the booked person to a MyJKKN account where the address is the same.
-- Exact equality on a lowercased address. No name matching anywhere.
UPDATE public.meeting_booking_attendees a
SET profile_id = p.id, updated_at = now()
FROM public.profiles p
WHERE a.profile_id IS NULL
  AND lower(btrim(p.email)) = a.email;

-- ============================================================================
-- ASSERTIONS
-- ============================================================================
DO $mba$
DECLARE
  v_rows int;
  v_bookings int;
  v_covered int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'meeting_booking_attendees') THEN
    RAISE EXCEPTION 'meeting_booking_attendees was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'meeting_booking_attendees'
      AND policyname = 'meeting_booking_attendees_select'
  ) THEN
    RAISE EXCEPTION 'the select policy is missing — the table would be unreadable';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'meeting_booking_attendees') THEN
    RAISE EXCEPTION 'row level security is not enabled';
  END IF;

  -- anon must hold nothing at all.
  IF has_table_privilege('anon', 'public.meeting_booking_attendees', 'SELECT') THEN
    RAISE EXCEPTION 'anon can still read the attendee list';
  END IF;

  SELECT count(*) INTO v_rows FROM public.meeting_booking_attendees;
  SELECT count(*) INTO v_bookings FROM public.meeting_bookings
    WHERE btrim(coalesce(attendee_email, '')) <> '';
  SELECT count(DISTINCT booking_id) INTO v_covered FROM public.meeting_booking_attendees;

  -- Every meeting that named an attendee must now appear in the list. A
  -- backfill that silently covered half is the failure this catches.
  IF v_covered < v_bookings THEN
    RAISE EXCEPTION 'backfill covered % of % meetings that name an attendee', v_covered, v_bookings;
  END IF;

  -- Every meeting whose host has an address must have exactly one organiser.
  -- Zero means the self-booking case silently lost the flag.
  IF EXISTS (
    SELECT 1
    FROM public.meeting_bookings b
    JOIN public.profiles p ON p.id = b.host_profile_id
    WHERE btrim(coalesce(p.email, '')) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.meeting_booking_attendees a
        WHERE a.booking_id = b.id AND a.is_organiser
      )
  ) THEN
    RAISE EXCEPTION 'a meeting whose host has an address has no organiser marked';
  END IF;

  RAISE NOTICE 'meeting_booking_attendees: % rows across % meetings', v_rows, v_covered;
END
$mba$;
