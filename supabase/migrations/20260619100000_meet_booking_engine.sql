-- =============================================================================
-- Universal Booking — transactional engine (Wave-3 wiring)
-- Migration: meet_booking_engine
-- Added: 2026-06-19
-- =============================================================================
--
-- Wires the three remaining transactional capabilities of the Universal Booking
-- module onto the substrate that already shipped (native scheduling engine
-- 20260611190000, universal-booking substrate 20260612090000, type variants
-- 20260619000100, integration config 20260619000200). PURELY ADDITIVE — every
-- new column has a default so existing rows behave exactly as before.
--
-- (A) PER-PROVIDER VIDEO LINKS — already-present schema, NO new columns here.
--     meeting_types.location_mode/location_text and meeting_bookings.video_url
--     ALREADY EXIST (20260612090000). The per-host provider preference table
--     meeting_host_integration_prefs ALSO already exists (20260619000200). This
--     migration adds NOTHING for (A) — the book route reads the existing
--     provider pref and mints google/zoom/teams links into the existing
--     video_url column. Documented here so the engine's three capabilities live
--     in one migration header; the schema for (A) was laid by earlier waves.
--
-- (B) PAID BOOKINGS (Razorpay deposit) — NEW columns:
--       meeting_types.requires_deposit     boolean  DEFAULT false
--       meeting_types.deposit_amount_paise integer  (paise; e.g. ₹500 = 50000)
--       meeting_bookings.payment_order_id  text     (Razorpay order_XXXX)
--       meeting_bookings.payment_id        text     (Razorpay pay_XXXX)
--       meeting_bookings.payment_status    text     ('none'|'pending'|'paid'|'failed')
--     A deposit booking is only INSERTed (status='confirmed') AFTER the book
--     route has server-side-verified the Razorpay signature; payment_status
--     records the outcome for audit. Types with requires_deposit=true but no
--     configured Razorpay account simply can't be booked-with-deposit (the
--     service's isRazorpayBookingConfigured() gate degrades gracefully).
--
-- (C) GROUP-CAPACITY CONSTRAINT FIX — NEW column + reshaped exclusion:
--       meeting_bookings.seat_index smallint NOT NULL DEFAULT 0
--     THE PROBLEM: the existing exclusion constraint mb_no_double_booking
--       EXCLUDE USING gist (host_profile_id WITH =, tstzrange(start,end) WITH &&)
--       WHERE status='confirmed'
--     blocks the 2nd seat of a kind='group' meeting type: two confirmed
--     bookings on the SAME host + SAME slot overlap, so the 2nd insert raises
--     23P01 (→ SLOT_TAKEN) even though the service-layer capacity gate
--     (#1509) intends the slot to hold N guests.
--     THE FIX (chosen approach — seat_index in the gist key, NOT a partial
--     skip-group exclusion):
--       Add seat_index to the exclusion key with equality (`WITH =`, needs
--       btree_gist — already installed by 20260611190000). Distinct seats
--       (0,1,2,…) on the same host+slot no longer collide because their
--       seat_index differs; two bookings claiming the SAME seat_index on the
--       same host+overlapping range STILL collide. The service assigns
--       seat_index = current confirmed seat count for group bookings, and
--       leaves it 0 for solo/collective/round_robin — so those variants keep
--       EXACTLY their current one-booking-per-host-per-slot protection (every
--       row at seat_index 0, overlap on the range → 23P01 as before).
--     WHY NOT the partial skip-group variant: skipping group types from the
--       exclusion entirely would drop the database-level race guard for group
--       seats, leaving over-selling possible under concurrency (two requests
--       both read "1 seat left", both insert). Keeping group rows IN the gist
--       with a per-seat key preserves a true DB-arbitrated race: two concurrent
--       requests that compute the same seat_index collide at the constraint,
--       exactly like solo bookings do — the capacity gate picks the seat, the
--       constraint enforces uniqueness of that seat. The seat_index is derived
--       from the live confirmed count at insert time, so a losing racer that
--       picked the same index gets 23P01 and the service retries/fails closed.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS throughout; the exclusion constraint is
-- DROPped (guarded) then recreated. Safe to re-run.
-- pgcrypto schema-qualified per the standing rule; PostgREST reload at the end.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- btree_gist provides the `=` operator class the gist exclusion needs for the
-- scalar seat_index / host_profile_id keys. Already installed by
-- 20260611190000; repeated here so this migration is self-contained.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── (B) Paid-booking columns on meeting_types ────────────────────────────────

ALTER TABLE public.meeting_types
  ADD COLUMN IF NOT EXISTS requires_deposit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_amount_paise integer
    CHECK (deposit_amount_paise IS NULL OR deposit_amount_paise BETWEEN 100 AND 10000000);

COMMENT ON COLUMN public.meeting_types.requires_deposit IS
  'Paid bookings: when true, an attendee must pay deposit_amount_paise (Razorpay) before the booking is confirmed. Env-gated — if Razorpay is unconfigured the type cannot be booked-with-deposit.';
COMMENT ON COLUMN public.meeting_types.deposit_amount_paise IS
  'Deposit to collect, in paise (₹500 = 50000). Meaningful only when requires_deposit=true. CHECK 100..10000000 (₹1..₹100000).';

-- ── (B) Payment columns on meeting_bookings ──────────────────────────────────

ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS payment_order_id text,
  ADD COLUMN IF NOT EXISTS payment_id text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'none'
    CHECK (payment_status IN ('none', 'pending', 'paid', 'failed'));

COMMENT ON COLUMN public.meeting_bookings.payment_order_id IS
  'Razorpay order id (order_XXXX) for a deposit booking. NULL for free bookings.';
COMMENT ON COLUMN public.meeting_bookings.payment_id IS
  'Razorpay payment id (pay_XXXX) once the deposit is verified. NULL until paid.';
COMMENT ON COLUMN public.meeting_bookings.payment_status IS
  'none (free booking) | pending (order created, awaiting payment) | paid (signature verified) | failed. A deposit booking is only inserted as confirmed after payment_status=paid.';

-- ── (C) Group-aware exclusion: seat_index + reshaped gist ────────────────────

ALTER TABLE public.meeting_bookings
  ADD COLUMN IF NOT EXISTS seat_index smallint NOT NULL DEFAULT 0
    CHECK (seat_index >= 0);

COMMENT ON COLUMN public.meeting_bookings.seat_index IS
  'Group capacity: which seat on a host+slot this confirmed booking occupies (0-based). solo/collective/round_robin always 0 (one seat). group bookings get 0..capacity-1, assigned as the current confirmed seat count at insert time. Part of mb_no_double_booking so distinct seats do not collide but the same seat is race-protected.';

-- Drop the old host+range exclusion (guarded) and recreate it with seat_index
-- in the key. Solo/collective/round_robin keep seat_index 0, so their behaviour
-- is unchanged (overlap on the same host at seat 0 → 23P01). Group seats differ
-- by seat_index, so they coexist; the same seat_index races at the constraint.
ALTER TABLE public.meeting_bookings
  DROP CONSTRAINT IF EXISTS mb_no_double_booking;

ALTER TABLE public.meeting_bookings
  ADD CONSTRAINT mb_no_double_booking EXCLUDE USING gist (
    host_profile_id WITH =,
    seat_index WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status = 'confirmed');

COMMENT ON CONSTRAINT mb_no_double_booking ON public.meeting_bookings IS
  'Group-aware exclusion over (host, seat_index, tstzrange) for confirmed bookings. solo/collective/round_robin sit at seat_index 0 (unchanged 1-per-host-per-slot guard); group seats 0..N-1 coexist on one slot but each seat is race-protected. Insert collisions raise SQLSTATE 23P01 → service maps to SLOT_TAKEN.';

-- Make the new columns + reshaped constraint visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
