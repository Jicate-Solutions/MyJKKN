-- ============================================================================
-- Housekeeping Slot Booking — DB substrate (Agent A, single DDL owner)
-- ============================================================================
-- Date: 2026-06-10
-- Spec: specs/housekeeping-slot-booking-spec-2026-06-10.md
-- Purpose: premium residents book 10-minute room-cleaning slots. Slots are
--   COMPUTED at request time (service window ÷ slot duration − bookings) —
--   never materialized. Every knob is a platform_policies row read via
--   fn_get_policy* at runtime, so the Director tweaks behaviour with zero
--   deploys.
--
-- Creates:
--   1. hostel_cleaning_bookings        — booking rows (standalone; the existing
--      hostel_cleaning_schedules / hostel_cleaning_tasks tables are UNTOUCHED).
--   2. RLS                              — residents read own rows via the
--      auth.uid() = profiles.id → profiles.learner_id chain; staff read/update
--      via user_has_permission + role_has_institution_access. NO resident
--      write policies — writes are RPC-only (SECURITY DEFINER bypasses RLS).
--   3. 5 RPCs                           — fn_housekeeping_available_slots /
--      _book_slot / _cancel_booking / _booking_board / _mark_booking.
--   4. platform_policies seeds          — 7 housekeeping.* knobs (idempotent).
--   5. tier_features append             — 'book_housekeeping_slots' on
--      premium + premium_plus (idempotent).
--
-- VERIFIED LIVE-SCHEMA FACTS honored here:
--   - hostel_allocations: institution_id, learner_id, block_id, room_id,
--     tier_id (NOT NULL → hostel_tier_policy), status allocation_status_enum
--     ('active','vacated','transferred','suspended','pending_approval',
--     'rejected'), allocation_date, check_out_date (added 20260703000000).
--     ⚠️ allocations.learner_id FKs profiles(id) (PR #1267), while
--     hostel_cleaning_bookings.learner_id FKs learners_profiles(id) —
--     two different keys; see fn_housekeeping_book_slot.
--     "Active" for BOOKING entitlement = status = 'active' AND
--     check_out_date IS NULL (stricter than the bed-econ occupancy canonical,
--     deliberately: pending_approval residents must NOT book — spec empty
--     state is "Your hostel allocation is pending approval").
--   - hostel_tier_policy: tier_key, tier_features (jsonb array of feature
--     keys), is_active. NULL institution_id = global default row.
--   - profiles.id == auth.users.id; profiles.learner_id → learners_profiles.id.
--   - learners_profiles: first_name, last_name.
--   - hostel_rooms: room_number (NO institution_id). hostel_blocks: name.
--   - Policy readers live in prod: fn_get_policy, fn_get_policy_json, and the
--     scalar trio fn_get_policy_int/_text/_bool (their p_default param has NO
--     default value, so REST probes must pass it). This file uses
--     fn_get_policy_json uniformly with #>> '{}' scalar extraction.
--   - platform_policies unique index: (policy_key, scope_type,
--     COALESCE(scope_id, zero-uuid)).
--   - Quota week = ISO week: date_trunc('week', ...) (Monday start).
--   - All "now" comparisons in IST (now() AT TIME ZONE 'Asia/Kolkata'),
--     matching the doctrines RPC family precedent.
--
-- SECURITY (mandatory — PR #1225 / 20260605191101 incident):
--   - Every RPC: SECURITY DEFINER, SET search_path = public.
--   - Every RPC: REVOKE EXECUTE FROM anon, PUBLIC; GRANT EXECUTE TO
--     authenticated. (Supabase default-grants anon on every new function —
--     REVOKE FROM PUBLIC alone is INSUFFICIENT.)
--
-- Applied via exec_sql after Director approval (show-SQL-first discipline).
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT / guarded
-- UPDATE). No DROP/ALTER of existing objects.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────
-- 1. hostel_cleaning_bookings
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hostel_cleaning_bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES public.institutions(id),
  block_id        uuid NOT NULL REFERENCES public.hostel_blocks(id),
  room_id         uuid NOT NULL REFERENCES public.hostel_rooms(id),
  allocation_id   uuid NOT NULL REFERENCES public.hostel_allocations(id) ON DELETE CASCADE,
  learner_id      uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  booking_date    date NOT NULL,
  slot_start      time NOT NULL,
  slot_end        time NOT NULL,
  status          text NOT NULL DEFAULT 'booked'
                    CHECK (status IN ('booked','completed','cancelled','no_show')),
  notes           text,
  cancelled_at    timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

COMMENT ON TABLE public.hostel_cleaning_bookings IS
  'Resident-booked housekeeping slots (Housekeeping Slot Booking, spec '
  '2026-06-10). Standalone beside hostel_cleaning_schedules/_tasks (block-'
  'level recurring cleaning is a separate mechanism). Slots are computed at '
  'request time from platform_policies housekeeping.* knobs — this table '
  'stores only BOOKED slots. Writes go through fn_housekeeping_book_slot / '
  '_cancel_booking / _mark_booking (RPC-only); residents have no direct '
  'INSERT/UPDATE/DELETE. learner_id is denormalized for RLS speed.';

-- One LIVE cleaning per room per slot. Deliberately a PARTIAL unique index
-- (status = 'booked') rather than the spec''s table-level UNIQUE: a table-
-- level UNIQUE(room_id, booking_date, slot_start) would let a CANCELLED row
-- permanently block re-booking that slot. Documented spec deviation.
CREATE UNIQUE INDEX IF NOT EXISTS hostel_cleaning_bookings_room_slot_uq
  ON public.hostel_cleaning_bookings (room_id, booking_date, slot_start)
  WHERE status = 'booked';

CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_bookings_block_date
  ON public.hostel_cleaning_bookings (block_id, booking_date);

CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_bookings_learner_date
  ON public.hostel_cleaning_bookings (learner_id, booking_date);

-- updated_at trigger (shared fn, matches the hostel_* table family).
DROP TRIGGER IF EXISTS trg_hostel_cleaning_bookings_updated_at
  ON public.hostel_cleaning_bookings;
CREATE TRIGGER trg_hostel_cleaning_bookings_updated_at
  BEFORE UPDATE ON public.hostel_cleaning_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ────────────────────────────────────────────────────────────────────────
-- 2. RLS
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.hostel_cleaning_bookings ENABLE ROW LEVEL SECURITY;

-- SELECT: admins; the resident who owns the row (auth.uid() → profiles →
-- learner_id chain); staff with housekeeping view + institution access.
DROP POLICY IF EXISTS hostel_cleaning_bookings_select ON public.hostel_cleaning_bookings;
CREATE POLICY hostel_cleaning_bookings_select
  ON public.hostel_cleaning_bookings
  FOR SELECT
  USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.learner_id = hostel_cleaning_bookings.learner_id
    )
    OR (
      user_has_permission('campus_living.housekeeping.view')
      AND role_has_institution_access(institution_id)
    )
  );

-- UPDATE: admins; staff with housekeeping schedule/mark_done + institution
-- access. Catalog truth (lib/constants/permissions.ts + live custom_roles,
-- verified 2026-06-10): the housekeeping keys are .view/.schedule/.mark_done —
-- '.manage' is a phantom key granted to NO role (would silently lock staff
-- out, the users.manage failure class).
-- (Residents mutate ONLY via the SECURITY DEFINER RPCs, which bypass RLS.)
DROP POLICY IF EXISTS hostel_cleaning_bookings_update ON public.hostel_cleaning_bookings;
CREATE POLICY hostel_cleaning_bookings_update
  ON public.hostel_cleaning_bookings
  FOR UPDATE
  USING (
    is_super_admin() OR is_admin()
    OR (
      (user_has_permission('campus_living.housekeeping.schedule')
       OR user_has_permission('campus_living.housekeeping.mark_done'))
      AND role_has_institution_access(institution_id)
    )
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      (user_has_permission('campus_living.housekeeping.schedule')
       OR user_has_permission('campus_living.housekeeping.mark_done'))
      AND role_has_institution_access(institution_id)
    )
  );

-- NO INSERT/DELETE policies: writes are RPC-only by design.


-- ────────────────────────────────────────────────────────────────────────
-- 3.1 fn_housekeeping_available_slots — computed slot grid for a block/date
-- ────────────────────────────────────────────────────────────────────────
-- Readable by any authenticated user (exposes only counts, no PII).
-- Slots = service window ÷ slot duration; 'booked' counts status='booked'
-- rows per slot; 'available' folds capacity + past-time + advance window +
-- master switch.

CREATE OR REPLACE FUNCTION public.fn_housekeeping_available_slots(
  p_block_id uuid,
  p_date     date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled      boolean;
  v_slot_minutes int;
  v_window       jsonb;
  v_win_start    time;
  v_win_end      time;
  v_capacity     int;
  v_advance_days int;
  v_now_ist      timestamp;
  v_slots        jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'permission denied: authentication required' USING ERRCODE = '42501';
  END IF;

  -- Policy knobs (Director-tunable, zero deploys).
  v_enabled      := COALESCE((fn_get_policy_json('housekeeping.booking_enabled', 'true'::jsonb, NULL) #>> '{}')::boolean, true);
  v_slot_minutes := COALESCE((fn_get_policy_json('housekeeping.slot_duration_minutes', '10'::jsonb, NULL) #>> '{}')::int, 10);
  v_window       := COALESCE(fn_get_policy_json('housekeeping.service_window',
                      '{"start":"09:00","end":"17:00"}'::jsonb, NULL),
                      '{"start":"09:00","end":"17:00"}'::jsonb);
  v_capacity     := COALESCE((fn_get_policy_json('housekeeping.capacity_per_slot_per_block', '1'::jsonb, NULL) #>> '{}')::int, 1);
  v_advance_days := COALESCE((fn_get_policy_json('housekeeping.booking_advance_days', '7'::jsonb, NULL) #>> '{}')::int, 7);

  IF v_slot_minutes <= 0 THEN v_slot_minutes := 10; END IF;
  v_win_start := COALESCE((v_window->>'start')::time, '09:00'::time);
  v_win_end   := COALESCE((v_window->>'end')::time,   '17:00'::time);
  v_now_ist   := now() AT TIME ZONE 'Asia/Kolkata';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'start',     to_char(s.slot_start, 'HH24:MI'),
           'end',       to_char(s.slot_start + make_interval(mins => v_slot_minutes), 'HH24:MI'),
           'capacity',  v_capacity,
           'booked',    COALESCE(bc.booked, 0),
           'past',      (p_date + s.slot_start) <= v_now_ist,
           'available', v_enabled
                        AND COALESCE(bc.booked, 0) < v_capacity
                        AND (p_date + s.slot_start) > v_now_ist
                        AND p_date <= (v_now_ist::date + v_advance_days)
         ) ORDER BY s.slot_start), '[]'::jsonb)
  INTO v_slots
  FROM (
    SELECT gs::time AS slot_start
    FROM generate_series(
           (p_date + v_win_start)::timestamp,
           (p_date + v_win_end)::timestamp - make_interval(mins => v_slot_minutes),
           make_interval(mins => v_slot_minutes)
         ) gs
  ) s
  LEFT JOIN (
    SELECT b.slot_start, COUNT(*)::int AS booked
    FROM public.hostel_cleaning_bookings b
    WHERE b.block_id = p_block_id
      AND b.booking_date = p_date
      AND b.status = 'booked'
    GROUP BY b.slot_start
  ) bc ON bc.slot_start = s.slot_start;

  RETURN jsonb_build_object(
    'date',         p_date,
    'block_id',     p_block_id,
    'slot_minutes', v_slot_minutes,
    'window',       jsonb_build_object(
                      'start', to_char(v_win_start, 'HH24:MI'),
                      'end',   to_char(v_win_end,   'HH24:MI')),
    'enabled',      v_enabled,
    'capacity_per_slot', v_capacity,
    'advance_days', v_advance_days,
    'slots',        v_slots
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_available_slots(uuid, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_housekeeping_available_slots(uuid, date) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 3.2 fn_housekeeping_book_slot — resident books a slot (identity derived
--     from auth.uid() ONLY; never trusts client-passed identity)
-- ────────────────────────────────────────────────────────────────────────
-- error_codes: disabled | no_active_allocation | tier_not_entitled |
--   quota_exhausted | slot_full | outside_window | too_far_ahead |
--   past_slot | duplicate

CREATE OR REPLACE FUNCTION public.fn_housekeeping_book_slot(
  p_date       date,
  p_slot_start time,
  p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid;
  v_learner_id   uuid;
  v_alloc        record;
  v_tier         record;
  -- policy knobs
  v_enabled      boolean;
  v_slot_minutes int;
  v_window       jsonb;
  v_win_start    time;
  v_win_end      time;
  v_capacity     int;
  v_advance_days int;
  v_quota_json   jsonb;
  v_quota        int;
  -- derived
  v_now_ist        timestamp;
  v_offset_minutes numeric;
  v_window_minutes numeric;
  v_used_this_week int;
  v_booked_in_slot int;
  v_slot_end       time;
  v_booking_id     uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'no_active_allocation',
      'message', 'Authentication required.');
  END IF;

  -- Master kill-switch.
  v_enabled := COALESCE((fn_get_policy_json('housekeeping.booking_enabled', 'true'::jsonb, NULL) #>> '{}')::boolean, true);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'disabled',
      'message', 'Housekeeping slot booking is currently turned off.');
  END IF;

  -- Identity chain: auth.uid() = profiles.id → profiles.learner_id.
  SELECT p.learner_id INTO v_learner_id
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_learner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'no_active_allocation',
      'message', 'No learner profile is linked to this account.');
  END IF;

  -- ACTIVE allocation only (status = 'active' AND not checked out).
  -- pending_approval / rejected / vacated residents cannot book.
  -- ⚠️ hostel_allocations.learner_id FKs profiles(id), NOT learners_profiles
  -- (PR #1267 "hostel allocation profiles.id keying"; live FK-embed verified
  -- 2026-06-10) — so the match key here is v_uid. v_learner_id (a
  -- learners_profiles.id) is still required for the bookings INSERT + quota,
  -- whose FK does target learners_profiles.
  SELECT a.id, a.room_id, a.block_id, a.institution_id, a.tier_id
  INTO v_alloc
  FROM public.hostel_allocations a
  WHERE a.learner_id = v_uid
    AND a.status = 'active'
    AND a.check_out_date IS NULL
  ORDER BY a.allocation_date DESC, a.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'no_active_allocation',
      'message', 'You do not have an active hostel allocation.');
  END IF;

  -- Tier entitlement: tier_features must contain 'book_housekeeping_slots'.
  SELECT htp.tier_key, htp.tier_features
  INTO v_tier
  FROM public.hostel_tier_policy htp
  WHERE htp.id = v_alloc.tier_id;

  IF NOT FOUND OR v_tier.tier_features IS NULL
     OR NOT (v_tier.tier_features ? 'book_housekeeping_slots') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'tier_not_entitled',
      'message', 'Your stay tier does not include housekeeping slot booking.');
  END IF;

  -- Remaining policy knobs.
  v_slot_minutes := COALESCE((fn_get_policy_json('housekeeping.slot_duration_minutes', '10'::jsonb, NULL) #>> '{}')::int, 10);
  IF v_slot_minutes <= 0 THEN v_slot_minutes := 10; END IF;
  v_window       := COALESCE(fn_get_policy_json('housekeeping.service_window',
                      '{"start":"09:00","end":"17:00"}'::jsonb, NULL),
                      '{"start":"09:00","end":"17:00"}'::jsonb);
  v_win_start    := COALESCE((v_window->>'start')::time, '09:00'::time);
  v_win_end      := COALESCE((v_window->>'end')::time,   '17:00'::time);
  v_capacity     := COALESCE((fn_get_policy_json('housekeeping.capacity_per_slot_per_block', '1'::jsonb, NULL) #>> '{}')::int, 1);
  v_advance_days := COALESCE((fn_get_policy_json('housekeeping.booking_advance_days', '7'::jsonb, NULL) #>> '{}')::int, 7);
  v_quota_json   := COALESCE(fn_get_policy_json('housekeeping.weekly_quota_by_tier',
                      '{"standard":0,"premium":2,"premium_plus":5}'::jsonb, NULL),
                      '{"standard":0,"premium":2,"premium_plus":5}'::jsonb);
  v_quota        := COALESCE((v_quota_json ->> v_tier.tier_key)::int, 0);

  v_now_ist := now() AT TIME ZONE 'Asia/Kolkata';

  -- Date / slot validation (all server-side).
  IF p_date > (v_now_ist::date + v_advance_days) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'too_far_ahead',
      'message', format('Bookings open up to %s days ahead.', v_advance_days));
  END IF;

  IF (p_date + p_slot_start) <= v_now_ist THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'past_slot',
      'message', 'That slot is already in the past.');
  END IF;

  -- Slot must align to the computed grid and fit inside the service window.
  v_offset_minutes := EXTRACT(EPOCH FROM (p_slot_start - v_win_start)) / 60;
  v_window_minutes := EXTRACT(EPOCH FROM (v_win_end - v_win_start)) / 60;
  IF v_offset_minutes < 0
     OR (v_offset_minutes::int % v_slot_minutes) <> 0
     OR (v_offset_minutes + v_slot_minutes) > v_window_minutes THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'outside_window',
      'message', 'That time is outside the housekeeping service window.');
  END IF;

  -- Weekly quota: booked + completed in the ISO week containing p_date.
  SELECT COUNT(*)::int INTO v_used_this_week
  FROM public.hostel_cleaning_bookings b
  WHERE b.learner_id = v_learner_id
    AND b.status IN ('booked','completed')
    AND date_trunc('week', b.booking_date::timestamp)
        = date_trunc('week', p_date::timestamp);

  IF v_used_this_week >= v_quota THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'quota_exhausted',
      'message', format('Weekly limit reached (%s of %s used).', v_used_this_week, v_quota));
  END IF;

  -- Serialize concurrent bookings for the same block/date/slot so the
  -- capacity count below cannot race past the limit.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'housekeeping_slot:' || v_alloc.block_id::text || ':' || p_date::text
      || ':' || p_slot_start::text, 0));

  -- Room already has a live booking for this slot?
  IF EXISTS (
    SELECT 1 FROM public.hostel_cleaning_bookings b
    WHERE b.room_id = v_alloc.room_id
      AND b.booking_date = p_date
      AND b.slot_start = p_slot_start
      AND b.status = 'booked'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'duplicate',
      'message', 'Your room already has a cleaning booked for this slot.');
  END IF;

  -- Block capacity for this slot.
  SELECT COUNT(*)::int INTO v_booked_in_slot
  FROM public.hostel_cleaning_bookings b
  WHERE b.block_id = v_alloc.block_id
    AND b.booking_date = p_date
    AND b.slot_start = p_slot_start
    AND b.status = 'booked';

  IF v_booked_in_slot >= v_capacity THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'slot_full',
      'message', 'This slot is fully booked for your block.');
  END IF;

  v_slot_end := p_slot_start + make_interval(mins => v_slot_minutes);

  INSERT INTO public.hostel_cleaning_bookings
    (institution_id, block_id, room_id, allocation_id, learner_id,
     booking_date, slot_start, slot_end, status, notes)
  VALUES
    (v_alloc.institution_id, v_alloc.block_id, v_alloc.room_id, v_alloc.id,
     v_learner_id, p_date, p_slot_start, v_slot_end, 'booked', p_notes)
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);

EXCEPTION
  WHEN unique_violation THEN
    -- Partial unique index (room_id, booking_date, slot_start) WHERE booked.
    RETURN jsonb_build_object('success', false, 'error_code', 'duplicate',
      'message', 'Your room already has a cleaning booked for this slot.');
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_book_slot(date, time, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_housekeeping_book_slot(date, time, text) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 3.3 fn_housekeeping_cancel_booking — owner (within cutoff) or staff
-- ────────────────────────────────────────────────────────────────────────
-- error_codes: not_found | forbidden | not_cancellable | cutoff_passed

CREATE OR REPLACE FUNCTION public.fn_housekeeping_cancel_booking(
  p_booking_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid;
  v_booking        record;
  v_is_owner       boolean := false;
  v_is_staff       boolean := false;
  v_cutoff_minutes int;
  v_now_ist        timestamp;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden');
  END IF;

  SELECT b.id, b.learner_id, b.institution_id, b.booking_date, b.slot_start, b.status
  INTO v_booking
  FROM public.hostel_cleaning_bookings b
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found');
  END IF;

  IF v_booking.status <> 'booked' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_cancellable',
      'message', format('Booking is already %s.', v_booking.status));
  END IF;

  v_is_owner := EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_uid AND p.learner_id = v_booking.learner_id);

  -- Staff cancel-override is a booking-management act → '.schedule'
  -- (wardens/chief wardens hold it; catalog-true, no phantom '.manage').
  v_is_staff := is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(v_booking.institution_id));

  IF NOT v_is_owner AND NOT v_is_staff THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden');
  END IF;

  -- Owners must respect the cancellation cutoff; staff may cancel any time.
  IF v_is_owner AND NOT v_is_staff THEN
    v_cutoff_minutes := COALESCE(
      (fn_get_policy_json('housekeeping.cancellation_cutoff_minutes', '60'::jsonb, NULL) #>> '{}')::int, 60);
    v_now_ist := now() AT TIME ZONE 'Asia/Kolkata';
    IF (v_booking.booking_date + v_booking.slot_start)
         - make_interval(mins => v_cutoff_minutes) <= v_now_ist THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'cutoff_passed',
        'message', format('Cancellations close %s minutes before the slot.', v_cutoff_minutes));
    END IF;
  END IF;

  UPDATE public.hostel_cleaning_bookings
  SET status = 'cancelled', cancelled_at = now()
  WHERE id = p_booking_id AND status = 'booked';

  RETURN jsonb_build_object('success', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_cancel_booking(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_housekeeping_cancel_booking(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 3.4 fn_housekeeping_booking_board — staff/Director day board
-- ────────────────────────────────────────────────────────────────────────
-- Gate: admins, or campus_living.housekeeping.view + institution access.
-- Returns a jsonb ARRAY of bookings enriched with room/block/learner names.

CREATE OR REPLACE FUNCTION public.fn_housekeeping_booking_board(
  p_institution_id uuid,
  p_date           date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_board jsonb;
BEGIN
  IF NOT (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.view')
        AND role_has_institution_access(p_institution_id))
  ) THEN
    RAISE EXCEPTION 'permission denied: housekeeping view required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id',             b.id,
           'institution_id', b.institution_id,
           'block_id',       b.block_id,
           'room_id',        b.room_id,
           'allocation_id',  b.allocation_id,
           'learner_id',     b.learner_id,
           'booking_date',   b.booking_date,
           'slot_start',     to_char(b.slot_start, 'HH24:MI'),
           'slot_end',       to_char(b.slot_end,   'HH24:MI'),
           'status',         b.status,
           'notes',          b.notes,
           'cancelled_at',   b.cancelled_at,
           'completed_at',   b.completed_at,
           'created_at',     b.created_at,
           'room_number',    r.room_number,
           'block_name',     bk.name,
           'learner_name',   NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), '')
         ) ORDER BY b.slot_start, bk.name, r.room_number), '[]'::jsonb)
  INTO v_board
  FROM public.hostel_cleaning_bookings b
  JOIN public.hostel_rooms       r  ON r.id  = b.room_id
  JOIN public.hostel_blocks      bk ON bk.id = b.block_id
  LEFT JOIN public.learners_profiles lp ON lp.id = b.learner_id
  WHERE b.institution_id = p_institution_id
    AND b.booking_date   = p_date;

  RETURN v_board;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_booking_board(uuid, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_housekeeping_booking_board(uuid, date) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 3.5 fn_housekeeping_mark_booking — staff completes / no-shows a booking
-- ────────────────────────────────────────────────────────────────────────
-- Gate: admins, or campus_living.housekeeping.mark_done + institution access
-- (catalog-true: housekeeping_staff / ceo / executive_admin_officer hold
-- .mark_done in live custom_roles — verified 2026-06-10).
-- error_codes: invalid_status | not_found | forbidden | not_markable

CREATE OR REPLACE FUNCTION public.fn_housekeeping_mark_booking(
  p_booking_id uuid,
  p_status     text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
BEGIN
  IF p_status NOT IN ('completed','no_show') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_status',
      'message', 'Status must be completed or no_show.');
  END IF;

  SELECT b.id, b.institution_id, b.status
  INTO v_booking
  FROM public.hostel_cleaning_bookings b
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found');
  END IF;

  IF NOT (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.mark_done')
        AND role_has_institution_access(v_booking.institution_id))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden');
  END IF;

  IF v_booking.status <> 'booked' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_markable',
      'message', format('Booking is already %s.', v_booking.status));
  END IF;

  UPDATE public.hostel_cleaning_bookings
  SET status       = p_status,
      completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = p_booking_id AND status = 'booked';

  RETURN jsonb_build_object('success', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_mark_booking(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_housekeeping_mark_booking(uuid, text) TO authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 4. platform_policies seeds — 7 housekeeping.* knobs (idempotent)
-- ────────────────────────────────────────────────────────────────────────
-- Edited via the platform-policies admin UI / the housekeeping settings page
-- (zero deploys). Keys mirrored in lib/services/campus-living/
-- housekeeping-policy-keys.ts (Agent B).

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system)
VALUES
  ('housekeeping.slot_duration_minutes', 'global', NULL, '10'::jsonb,
   'Length of one bookable housekeeping slot in minutes (Director-stated: 10).',
   'number', NULL, true),
  ('housekeeping.service_window', 'global', NULL, '{"start":"09:00","end":"17:00"}'::jsonb,
   'Daily housekeeping service window (24h HH:MM). Slots are computed inside this window.',
   'object', NULL, true),
  ('housekeeping.capacity_per_slot_per_block', 'global', NULL, '1'::jsonb,
   'Parallel cleanings a block supports per slot (≈ housekeeping staff on duty per block).',
   'number', NULL, true),
  ('housekeeping.booking_advance_days', 'global', NULL, '7'::jsonb,
   'How many days ahead residents may book a housekeeping slot.',
   'number', NULL, true),
  ('housekeeping.cancellation_cutoff_minutes', 'global', NULL, '60'::jsonb,
   'Latest a resident may cancel, in minutes before the slot start. Staff may cancel any time.',
   'number', NULL, true),
  ('housekeeping.weekly_quota_by_tier', 'global', NULL,
   '{"standard":0,"premium":2,"premium_plus":5}'::jsonb,
   'Included housekeeping bookings per ISO week, by hostel tier_key. 0 = tier cannot book.',
   'object', NULL, true),
  ('housekeeping.booking_enabled', 'global', NULL, 'true'::jsonb,
   'Master kill-switch for housekeeping slot booking.',
   'boolean', NULL, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────
-- 5. Tier entitlement — append 'book_housekeeping_slots' (idempotent)
-- ────────────────────────────────────────────────────────────────────────
-- Applies to every premium / premium_plus row (global default + any
-- per-institution overrides). Re-runnable: the `NOT ? feature` guard makes
-- the UPDATE a no-op on rows already carrying the flag.

UPDATE public.hostel_tier_policy
SET tier_features = tier_features || '["book_housekeeping_slots"]'::jsonb,
    updated_at    = now()
WHERE tier_key IN ('premium', 'premium_plus')
  AND NOT (tier_features ? 'book_housekeeping_slots');


-- PostgREST must reload its schema cache to see the new table + RPCs
-- (exec_sql DDL leaves the cache stale otherwise).
NOTIFY pgrst, 'reload schema';
