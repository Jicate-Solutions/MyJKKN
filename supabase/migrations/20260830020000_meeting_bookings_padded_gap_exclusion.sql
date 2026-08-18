-- 20260830020000_meeting_bookings_padded_gap_exclusion.sql
--
-- FILE ONLY — NOT APPLIED. Director-gated.
--
-- WHY. The only database-level guard against two visitors claiming the same
-- host is mb_no_double_booking, and it excludes on the RAW span:
--     EXCLUDE USING gist (host_profile_id WITH =, seat_index WITH =,
--                         tstzrange(start_time, end_time) WITH &&)
--     WHERE (status = 'confirmed')
-- Read live 2026-08-13. It therefore treats 11:00–11:10 and 11:10–11:20 as
-- non-overlapping (tstzrange is [) by default) and accepts both. The breathing
-- gap introduced by 20260820000000 is enforced ONLY in the slot engine and on
-- the create path, so it is an application-layer check with a window under it:
-- two visitors submitting simultaneously both read a free slot, both pass the
-- check, and both land. Classic TOCTOU — narrow, but the database is the only
-- layer that can close it, because it is the only layer both writers share.
--
-- WHAT THIS ADDS. A SECOND exclusion constraint over the same key, on a span
-- padded at the START by 5 minutes, scoped to bookings starting on/after a
-- fixed cutoff.
--
-- WHY PAD THE START AND NOT THE END. This mirrors the slot engine's own
-- arithmetic (lib/services/meetings/native-slot-engine.ts:271-274):
--     candStart = start - bufferBefore
--     candEnd   = start + duration + bufferAfter
--     clash     = candStart < busy.end && candEnd > busy.start
-- buffer_BEFORE is the load-bearing value — it is what stops a booking butting
-- onto the END of an existing meeting. Padding start_time on BOTH rows makes
-- the constraint agree with that arithmetic rather than with the column names:
-- for two confirmed rows A and B, [A.start-5, A.end) && [B.start-5, B.end)
-- is true exactly when the later row starts less than 5 minutes after the
-- earlier row ends. A gap of exactly 5 minutes is accepted; 4 is not.
--
-- WHY A HELPER FUNCTION INSTEAD OF THE INLINE EXPRESSION. The obvious spelling
--     tstzrange(start_time - interval '5 minutes', end_time)
-- CANNOT be used in an index. `timestamptz - interval` is timestamptz_mi_interval,
-- which Postgres marks STABLE (provolatile='s'), not IMMUTABLE, and an index
-- expression must be immutable. Attempting it fails outright:
--     ERROR: functions in index expression must be marked IMMUTABLE
-- (reproduced on Postgres 16.14 before this file was written). The operator is
-- STABLE because an interval can carry months or days, and adding those to a
-- timestamptz crosses DST differently depending on the session TimeZone.
--
-- MARKING THE WRAPPER IMMUTABLE IS HONEST, NOT A WORKAROUND. A pure-minutes
-- interval carries no month or day component, so it is an exact microsecond
-- offset applied to an absolute instant and never consults TimeZone. Verified
-- rather than assumed: the same instants were reduced by `interval '5 minutes'`
-- under UTC, America/New_York, Europe/Berlin, Asia/Kolkata and Pacific/Chatham,
-- across three DST-transition windows, and every digest was identical
-- (ed36c0d22676132dd3f063da05020b8c). The control that proves the probe can
-- actually detect timezone dependence: `interval '1 day'` over the same
-- instants produced DIFFERENT digests per zone (UTC 25008308…, New_York
-- db8e43a9…). So IMMUTABLE would be a lie for '1 day' and is true for
-- '5 minutes'. If this pad is ever changed to a day- or month-bearing interval,
-- the IMMUTABLE marking becomes false and the constraint silently corrupts.
--
-- WHY A FIXED LITERAL CUTOFF. An exclusion constraint cannot be created
-- NOT VALID — Postgres builds the index and validates every existing row, all
-- or nothing. Production carries 14 pairs of confirmed bookings sitting at an
-- exact 0-minute gap (22 distinct rows, one host, all seat_index 0, latest
-- 2026-08-08 09:30Z, every one already finished — measured read-only against
-- production 2026-08-13). Unscoped, this constraint could not be created at
-- all. The predicate scopes it to new bookings, which is the Director's
-- decision: NEW BOOKINGS ONLY, history keeps whatever it already has.
-- now() is not usable here — it is STABLE, and Postgres rejects it with
-- "functions in index predicate must be marked IMMUTABLE" (also reproduced).
-- A timestamptz literal is a parse-time constant and is accepted.
--
-- WHY 2026-09-01 SPECIFICALLY. Measured on production 2026-08-13: ZERO
-- bookings of ANY status start on or after that instant (max start_time is
-- 2026-08-15 05:35Z). The constraint therefore validates against an empty set
-- and its creation cannot fail, no matter what is booked between now and the
-- moment it is applied. Every one of the 14 conflicting pairs is more than
-- three weeks before it. The cost of that safety is the honest trade-off: any
-- booking for a slot starting before 2026-09-01 stays unprotected by this
-- constraint, exactly as it is today.
--
-- WHAT THIS DELIBERATELY DOES NOT DO. It does not touch, drop, weaken or
-- rebuild mb_no_double_booking. That constraint keeps guarding the raw overlap
-- across the whole table including all history; this one is additive. Nor does
-- it touch mb_trigger_no_attendee_double_booking (the attendee-side exclusion),
-- which is a different key and out of scope.
--
-- ⚠️ READ THIS BEFORE APPLYING — THE PREMISE THIS WAS SPECIFIED ON IS NOT TRUE
-- ON PRODUCTION. This work was requested on the understanding that every active
-- meeting type now carries buffer_before_min = 5. It does not. Measured
-- read-only 2026-08-13: of 252 active meeting_types, 199 sit at
-- buffer_before_min = 0 and only 53 at 5. That is not drift — it is exactly
-- what 20260820000000 said it was doing, in its own words: it moved the column
-- DEFAULT to 5 and deliberately did NOT backfill, because a backfill "would
-- withdraw slots from 128 host pages that their owners are already offering —
-- a platform-wide behaviour change that was considered and explicitly declined
-- (Director, 2026-08-07)".
-- The consequence is that this constraint is not purely a race fix. For the 53
-- types at 5 it closes the TOCTOU window and nothing else. For the other 199 it
-- ALSO enforces a gap their owners never asked for, and it does so at the
-- lowest layer, where the application cannot soften it: a legitimate
-- back-to-back booking on one of those types will fail with 23P01, which the
-- service maps to SLOT_TAKEN — a visitor is told the slot is taken when the
-- slot engine had just offered it. That is the same platform-wide behaviour
-- change that was already declined once, arriving through the database instead
-- of through the data.
-- This file is left flat-5 as specified, and gated, so that decision is made
-- deliberately rather than by a migration. If the intent really is "close the
-- race, change no behaviour", the constraint has to key on each booking's own
-- gap rather than a flat literal — which a constraint cannot read from
-- meeting_types and would need denormalising onto meeting_bookings first. That
-- is a larger change and is NOT attempted here.
--
-- SAFETY. Additive DDL only. No row is inserted, updated or deleted. No
-- existing function is replaced. The helper is a pure arithmetic function with
-- SECURITY INVOKER (the default) — it reads no table, so it is not a SECURITY
-- DEFINER surface and carries no anon/PUBLIC escalation risk. Idempotent on
-- replay: the function is CREATE OR REPLACE and the constraint is added only
-- when absent. No BEGIN/COMMIT, so a reviewer's BEGIN … ROLLBACK rehearsal
-- against production actually rolls back.

-- ---------------------------------------------------------------------------
-- 1. The immutable padded span.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mb_padded_booking_span(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS tstzrange
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  -- interval '5 minutes' carries no month/day component, so this is an exact
  -- microsecond offset on an absolute instant and is genuinely TimeZone-free.
  -- Changing it to a day- or month-bearing interval would make IMMUTABLE false.
  SELECT tstzrange($1 - interval '5 minutes', $2);
$$;

COMMENT ON FUNCTION public.mb_padded_booking_span(timestamptz, timestamptz) IS
  'Booking span padded at the START by the platform breathing gap (5 minutes), for use in mb_no_double_booking_padded. Exists only because timestamptz - interval is STABLE and cannot appear in an index expression; a pure-minutes interval is TimeZone-independent, so IMMUTABLE here is true rather than a promise. Pads the start because the slot engine pads the candidate the same way (native-slot-engine.ts:271) and buffer_before is what stops a booking butting onto the end of an existing meeting. DO NOT REVOKE EXECUTE FROM anon/PUBLIC on this function — it is evaluated during index maintenance on every INSERT, so revoking it breaks booking creation outright (see the grants below).';

-- 🚨 DO NOT "HARDEN" THIS BY REVOKING. Unlike an RPC, a function used in an
-- index expression is evaluated during index maintenance on every INSERT, and
-- the INSERTing role needs EXECUTE on it. Measured on Postgres 16.14 while
-- writing this file: with the default PUBLIC grant an insert succeeds; after a
-- plain `REVOKE EXECUTE … FROM PUBLIC` the very same insert fails with
-- `ERROR: permission denied for function mb_padded_booking_span`; adding an
-- explicit named grant restores it even while PUBLIC stays revoked.
-- That matters here because this repo has form: 20260605191101 sweeps a list of
-- function names issuing blanket REVOKEs. These explicit named grants are what
-- keeps public booking working if this function is ever caught by such a sweep.
-- There is no security cost — the function reads no table, takes only the two
-- timestamps handed to it, and is SECURITY INVOKER; it can leak nothing.
GRANT EXECUTE ON FUNCTION public.mb_padded_booking_span(timestamptz, timestamptz)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Pre-flight: fail loudly and legibly rather than with a bare 23P01.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_conflicts integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meeting_bookings'::regclass
      AND conname  = 'mb_no_double_booking_padded'
  ) THEN
    RAISE NOTICE 'mb_no_double_booking_padded already present — skipping.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_conflicts
  FROM public.meeting_bookings a
  JOIN public.meeting_bookings b
    ON a.host_profile_id = b.host_profile_id
   AND a.seat_index      = b.seat_index
   AND a.id < b.id
  WHERE a.status = 'confirmed'
    AND b.status = 'confirmed'
    AND a.start_time >= timestamptz '2026-09-01 00:00:00+00'
    AND b.start_time >= timestamptz '2026-09-01 00:00:00+00'
    AND public.mb_padded_booking_span(a.start_time, a.end_time)
     && public.mb_padded_booking_span(b.start_time, b.end_time);

  IF v_conflicts > 0 THEN
    RAISE EXCEPTION
      'Cannot create mb_no_double_booking_padded: % confirmed booking pair(s) on/after the 2026-09-01 cutoff already sit closer than the 5-minute gap. Production held 0 such pairs when this file was written (2026-08-13). Resolve or reschedule them, or move the cutoff forward, before applying.',
      v_conflicts;
  END IF;

  EXECUTE $ddl$
    ALTER TABLE public.meeting_bookings
      ADD CONSTRAINT mb_no_double_booking_padded EXCLUDE USING gist (
        host_profile_id WITH =,
        seat_index WITH =,
        public.mb_padded_booking_span(start_time, end_time) WITH &&
      ) WHERE (
        status = 'confirmed'
        AND start_time >= timestamptz '2026-09-01 00:00:00+00'
      )
  $ddl$;
END $$;

COMMENT ON CONSTRAINT mb_no_double_booking_padded ON public.meeting_bookings IS
  'Race guard for the 5-minute breathing gap, additive to mb_no_double_booking (which still guards raw overlap over all history and is unchanged). Excludes on the span padded 5 minutes at the START, so a confirmed booking cannot begin less than 5 minutes after another confirmed booking on the same host+seat ends; a gap of exactly 5 minutes is allowed. Scoped by a fixed literal cutoff of 2026-09-01T00:00Z because an exclusion constraint cannot be created NOT VALID and 14 historical pairs sit at a 0-minute gap (Director: new bookings only). Collisions raise 23P01, which the service maps to SLOT_TAKEN.';

-- Make the new constraint visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
