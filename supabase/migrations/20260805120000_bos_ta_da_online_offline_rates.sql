-- Offline/Online sitting charges + non-distance travel bases for BoS TA/DA.
--
-- The institution SOP pays a *sitting charge* that is quoted separately for
-- offline and online attendance, and a *travel allowance* whose basis differs
-- by member type:
--
--   Member type                              Sitting            Travel
--   ---------------------------------------  -----------------  ----------------
--   BoS – University Nominee                 5000 / 5000        as per distance
--   Academic Committee members               3000 / 3000        flat Rs.1500
--     (External Academic + Industry)
--   Alumni Members                           1000 / 1000        as per distance
--                                            (offline/online)
--
-- Two facts were unrepresentable before this migration:
--
--  1. WHETHER A MEMBER ATTENDED ONLINE. bos_meetings.meeting_type carries an
--     'online' value, but that enum already encodes meeting PURPOSE (regular /
--     special / academic_council / governing_body), so an Academic Council held
--     on Meet cannot be typed both ways — and a 'hybrid' meeting has a mode
--     that differs PER ATTENDEE, which no column recorded. Mode therefore lands
--     on bos_meeting_attendees, next to attendance_status: the attendance sheet
--     is where the money is decided.
--
--  2. TRAVEL THAT ISN'T PER-KILOMETRE. bos_ta_da_rates stored only ta_per_km,
--     so a flat Rs.1500 could only be faked by back-solving a per-km rate —
--     which yields a different answer for every expert's distance. travel_basis
--     makes the computation explicit.
--
-- Online attendance always pays ZERO travel. That is a hardcoded rule in
-- lib/utils/bos/ta-da-rates.ts rather than a column: a member who did not
-- travel has no travel allowance under any member type, so there is nothing
-- for an administrator to configure.
--
-- Back-compat: every default below reproduces today's behaviour exactly.
-- Existing attendees are 'offline' (which is how their claims were computed),
-- and existing rate rows are 'distance' basis (the only basis that existed).

-- ── 1. Per-attendee attendance mode ──────────────────────────────────────────
ALTER TABLE public.bos_meeting_attendees
  ADD COLUMN IF NOT EXISTS attendance_mode text NOT NULL DEFAULT 'offline';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bos_meeting_attendees_attendance_mode_check'
  ) THEN
    ALTER TABLE public.bos_meeting_attendees
      ADD CONSTRAINT bos_meeting_attendees_attendance_mode_check
      CHECK (attendance_mode IN ('offline', 'online'));
  END IF;
END $$;

COMMENT ON COLUMN public.bos_meeting_attendees.attendance_mode IS
  'How this member attended: offline (in person) or online. Selects which sitting charge applies from bos_ta_da_rates, and zeroes the travel allowance when online. Per-attendee rather than per-meeting so hybrid meetings bill each member correctly.';

-- ── 2. Online sitting charge + travel basis on the rate rows ─────────────────

-- NULLABLE on purpose: NULL means "same as the offline sitting charge". Most
-- SOP rows quote identical offline/online amounts, so the common case needs no
-- second value, and a row written by an older client (or by direct API use)
-- can never silently pay 0 for an online attendee.
ALTER TABLE public.bos_ta_da_rates
  ADD COLUMN IF NOT EXISTS honorarium_amount_online numeric(10,2);

ALTER TABLE public.bos_ta_da_rates
  ADD COLUMN IF NOT EXISTS travel_basis text NOT NULL DEFAULT 'distance';

ALTER TABLE public.bos_ta_da_rates
  ADD COLUMN IF NOT EXISTS travel_flat_amount numeric(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bos_ta_da_rates_travel_basis_check'
  ) THEN
    ALTER TABLE public.bos_ta_da_rates
      ADD CONSTRAINT bos_ta_da_rates_travel_basis_check
      CHECK (travel_basis IN ('distance', 'flat', 'none'));
  END IF;
END $$;

COMMENT ON COLUMN public.bos_ta_da_rates.honorarium_amount_online IS
  'Sitting charge when the member attends online. NULL = same as honorarium_amount (the offline charge).';

COMMENT ON COLUMN public.bos_ta_da_rates.travel_basis IS
  'How travel allowance is computed for this member type: distance = round-trip km x ta_per_km; flat = travel_flat_amount regardless of distance; none = no travel allowance. Online attendance pays zero under every basis.';

COMMENT ON COLUMN public.bos_ta_da_rates.travel_flat_amount IS
  'Fixed travel allowance paid when travel_basis = flat. Ignored under the distance and none bases.';

COMMENT ON COLUMN public.bos_ta_da_rates.honorarium_amount IS
  'Sitting charge when the member attends offline (in person). See honorarium_amount_online for the online counterpart.';
