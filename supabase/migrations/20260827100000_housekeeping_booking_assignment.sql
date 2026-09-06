-- ============================================================================
-- Housekeeping: booking assignment flow (booked → assigned → completed/no_show)
-- ----------------------------------------------------------------------------
-- Adds the missing "warden hands the booking to a cleaner" step:
--   1. hostel_cleaning_bookings gains assigned_profile_id (FK, optional),
--      assigned_staff_name (denormalized display name / free-text assignee),
--      assigned_at, assigned_by; status CHECK gains 'assigned'.
--   2. LIVE-STATUS SWEEP — six places treated status='booked' as "live".
--      Every one now also counts 'assigned', otherwise assigning a booking
--      silently frees the room slot / block capacity / weekly quota:
--        · partial unique index hostel_cleaning_bookings_room_slot_uq
--        · fn_housekeeping_available_slots  (capacity count)
--        · fn_housekeeping_book_slot        (duplicate + capacity + quota)
--        · fn_housekeeping_my_entitlement   (usedThisWeek)
--        · fn_housekeeping_cancel_booking   (cancellable gate)
--        · fn_housekeeping_mark_booking     (markable gate)
--      Function bodies below are based on the LIVE definitions (which include
--      the 2026-08-25 entitlement-by-room-category rework), not the original
--      2026-06-10 file.
--   3. fn_housekeeping_assign_booking — warden assigns / re-assigns / clears.
--      Gate: '.schedule' (Warden + Chief Warden hold it).
--   4. fn_housekeeping_assignable_staff — picker source: active profiles whose
--      roles grant '.mark_done' (value test, permission-driven, no hardcoded
--      role names), scoped to the institution.
--   5. fn_housekeeping_booking_board — enriched with roll_number, program
--      name, phone, photo and the assignment fields (LEFT joins only).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. Columns + constraint + indexes
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.hostel_cleaning_bookings
  ADD COLUMN IF NOT EXISTS assigned_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_staff_name text,
  ADD COLUMN IF NOT EXISTS assigned_at         timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_by         uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_bookings_assigned_profile
  ON public.hostel_cleaning_bookings (assigned_profile_id);
CREATE INDEX IF NOT EXISTS idx_hostel_cleaning_bookings_assigned_by
  ON public.hostel_cleaning_bookings (assigned_by);

ALTER TABLE public.hostel_cleaning_bookings
  DROP CONSTRAINT IF EXISTS hostel_cleaning_bookings_status_check;
ALTER TABLE public.hostel_cleaning_bookings
  ADD CONSTRAINT hostel_cleaning_bookings_status_check
  CHECK (status IN ('booked','assigned','completed','cancelled','no_show'));

-- Partial unique index: 'assigned' is still a LIVE booking for the room+slot.
DROP INDEX IF EXISTS public.hostel_cleaning_bookings_room_slot_uq;
CREATE UNIQUE INDEX hostel_cleaning_bookings_room_slot_uq
  ON public.hostel_cleaning_bookings (room_id, booking_date, slot_start)
  WHERE status IN ('booked','assigned');

-- ────────────────────────────────────────────────────────────────────────
-- 2. fn_housekeeping_available_slots — capacity counts assigned too
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_housekeeping_available_slots(p_block_id uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND b.status IN ('booked','assigned')
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
END $function$;

-- ────────────────────────────────────────────────────────────────────────
-- 3. fn_housekeeping_book_slot — duplicate/capacity/quota count assigned
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_housekeeping_book_slot(p_date date, p_slot_start time without time zone, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          uuid;
  v_learner_id   uuid;
  v_alloc        record;
  v_tier         record;
  v_enabled      boolean;
  v_slot_minutes int;
  v_window       jsonb;
  v_win_start    time;
  v_win_end      time;
  v_capacity     int;
  v_advance_days int;
  v_quota_json   jsonb;
  v_quota        int;
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

  v_enabled := COALESCE((fn_get_policy_json('housekeeping.booking_enabled', 'true'::jsonb, NULL) #>> '{}')::boolean, true);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'disabled',
      'message', 'Housekeeping slot booking is currently turned off.');
  END IF;

  SELECT p.learner_id INTO v_learner_id
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_learner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'no_active_allocation',
      'message', 'No learner profile is linked to this account.');
  END IF;

  SELECT a.id, a.room_id, a.block_id, a.institution_id
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

  -- Tier entitlement now comes from the resident's ROOM CATEGORY
  -- (hostel_categories.tier_key), not the never-populated
  -- hostel_allocations.tier_id. Same resolver the UI gate reads.
  SELECT * INTO v_tier FROM public.fn_housekeeping_entitlement_tier(v_uid);

  IF NOT FOUND OR v_tier.tier_features IS NULL
     OR NOT (v_tier.tier_features ? 'book_housekeeping_slots') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'tier_not_entitled',
      'message', format('%s does not include housekeeping slot booking.',
        COALESCE(v_tier.category_name, 'Your room category')));
  END IF;

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

  IF v_quota <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'tier_not_entitled',
      'message', format('%s does not include housekeeping slot booking.',
        COALESCE(v_tier.category_name, 'Your room category')));
  END IF;

  v_now_ist := now() AT TIME ZONE 'Asia/Kolkata';

  IF p_date > (v_now_ist::date + v_advance_days) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'too_far_ahead',
      'message', format('Bookings open up to %s days ahead.', v_advance_days));
  END IF;

  IF (p_date + p_slot_start) <= v_now_ist THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'past_slot',
      'message', 'That slot is already in the past.');
  END IF;

  v_offset_minutes := EXTRACT(EPOCH FROM (p_slot_start - v_win_start)) / 60;
  v_window_minutes := EXTRACT(EPOCH FROM (v_win_end - v_win_start)) / 60;
  IF v_offset_minutes < 0
     OR (v_offset_minutes::int % v_slot_minutes) <> 0
     OR (v_offset_minutes + v_slot_minutes) > v_window_minutes THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'outside_window',
      'message', 'That time is outside the housekeeping service window.');
  END IF;

  SELECT COUNT(*)::int INTO v_used_this_week
  FROM public.hostel_cleaning_bookings b
  WHERE b.learner_id = v_learner_id
    AND b.status IN ('booked','assigned','completed')
    AND date_trunc('week', b.booking_date::timestamp)
        = date_trunc('week', p_date::timestamp);

  IF v_used_this_week >= v_quota THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'quota_exhausted',
      'message', format('Weekly limit reached (%s of %s used).', v_used_this_week, v_quota));
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'housekeeping_slot:' || v_alloc.block_id::text || ':' || p_date::text
      || ':' || p_slot_start::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.hostel_cleaning_bookings b
    WHERE b.room_id = v_alloc.room_id
      AND b.booking_date = p_date
      AND b.slot_start = p_slot_start
      AND b.status IN ('booked','assigned')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'duplicate',
      'message', 'Your room already has a cleaning booked for this slot.');
  END IF;

  SELECT COUNT(*)::int INTO v_booked_in_slot
  FROM public.hostel_cleaning_bookings b
  WHERE b.block_id = v_alloc.block_id
    AND b.booking_date = p_date
    AND b.slot_start = p_slot_start
    AND b.status IN ('booked','assigned');

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
    RETURN jsonb_build_object('success', false, 'error_code', 'duplicate',
      'message', 'Your room already has a cleaning booked for this slot.');
END $function$;

-- ────────────────────────────────────────────────────────────────────────
-- 4. fn_housekeeping_my_entitlement — usedThisWeek counts assigned
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_housekeeping_my_entitlement()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         uuid;
  v_learner_id  uuid;
  v_has_alloc   boolean;
  v_tier        record;
  v_quota_json  jsonb;
  v_quota       int;
  v_used        int := 0;
  v_today       date;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('entitled', false, 'tierKey', NULL,
      'categoryName', NULL, 'weeklyQuota', 0, 'usedThisWeek', 0,
      'reason', 'no_active_allocation');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.hostel_allocations a
    WHERE a.learner_id = v_uid
      AND a.status = 'active'
      AND a.check_out_date IS NULL
  ) INTO v_has_alloc;

  IF NOT v_has_alloc THEN
    RETURN jsonb_build_object('entitled', false, 'tierKey', NULL,
      'categoryName', NULL, 'weeklyQuota', 0, 'usedThisWeek', 0,
      'reason', 'no_active_allocation');
  END IF;

  SELECT * INTO v_tier FROM public.fn_housekeeping_entitlement_tier(v_uid);

  IF NOT FOUND
     OR v_tier.tier_features IS NULL
     OR NOT (v_tier.tier_features ? 'book_housekeeping_slots') THEN
    RETURN jsonb_build_object('entitled', false,
      'tierKey', COALESCE(v_tier.tier_key, 'standard'),
      'categoryName', v_tier.category_name,
      'weeklyQuota', 0, 'usedThisWeek', 0,
      'reason', 'tier_not_entitled');
  END IF;

  v_quota_json := COALESCE(
    fn_get_policy_json('housekeeping.weekly_quota_by_tier',
      '{"standard":0,"premium":2,"premium_plus":5}'::jsonb, NULL),
    '{"standard":0,"premium":2,"premium_plus":5}'::jsonb);
  v_quota := COALESCE((v_quota_json ->> v_tier.tier_key)::int, 0);

  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  SELECT p.learner_id INTO v_learner_id
  FROM public.profiles p WHERE p.id = v_uid;

  IF v_learner_id IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_used
    FROM public.hostel_cleaning_bookings b
    WHERE b.learner_id = v_learner_id
      AND b.status IN ('booked','assigned','completed')
      AND date_trunc('week', b.booking_date::timestamp)
          = date_trunc('week', v_today::timestamp);
  END IF;

  IF v_quota <= 0 THEN
    RETURN jsonb_build_object('entitled', false, 'tierKey', v_tier.tier_key,
      'categoryName', v_tier.category_name, 'weeklyQuota', 0,
      'usedThisWeek', v_used, 'reason', 'no_weekly_quota');
  END IF;

  RETURN jsonb_build_object('entitled', true, 'tierKey', v_tier.tier_key,
    'categoryName', v_tier.category_name, 'weeklyQuota', v_quota,
    'usedThisWeek', v_used);
END $function$;

-- ────────────────────────────────────────────────────────────────────────
-- 5. fn_housekeeping_cancel_booking — assigned bookings are cancellable
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_housekeeping_cancel_booking(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_booking.status NOT IN ('booked','assigned') THEN
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
  SET status = 'cancelled', cancelled_at = now(),
      assigned_profile_id = NULL, assigned_staff_name = NULL,
      assigned_at = NULL, assigned_by = NULL
  WHERE id = p_booking_id AND status IN ('booked','assigned');

  RETURN jsonb_build_object('success', true);
END $function$;

-- ────────────────────────────────────────────────────────────────────────
-- 6. fn_housekeeping_mark_booking — markable from booked OR assigned
-- ────────────────────────────────────────────────────────────────────────

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

  IF v_booking.status NOT IN ('booked','assigned') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_markable',
      'message', format('Booking is already %s.', v_booking.status));
  END IF;

  UPDATE public.hostel_cleaning_bookings
  SET status       = p_status,
      completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = p_booking_id AND status IN ('booked','assigned');

  RETURN jsonb_build_object('success', true);
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 7. fn_housekeeping_assign_booking — warden assigns / re-assigns / clears
-- ────────────────────────────────────────────────────────────────────────
-- error_codes: not_found | forbidden | not_assignable | missing_assignee

CREATE OR REPLACE FUNCTION public.fn_housekeeping_assign_booking(
  p_booking_id          uuid,
  p_assignee_profile_id uuid    DEFAULT NULL,
  p_assignee_name       text    DEFAULT NULL,
  p_clear               boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid;
  v_booking record;
  v_name    text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden');
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
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(v_booking.institution_id))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden');
  END IF;

  IF v_booking.status NOT IN ('booked','assigned') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_assignable',
      'message', format('Booking is already %s.', v_booking.status));
  END IF;

  IF p_clear THEN
    UPDATE public.hostel_cleaning_bookings
    SET status = 'booked',
        assigned_profile_id = NULL, assigned_staff_name = NULL,
        assigned_at = NULL, assigned_by = NULL
    WHERE id = p_booking_id AND status IN ('booked','assigned');
    RETURN jsonb_build_object('success', true);
  END IF;

  v_name := NULLIF(trim(p_assignee_name), '');

  IF p_assignee_profile_id IS NULL AND v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'missing_assignee',
      'message', 'Pick a staff member or type a name.');
  END IF;

  IF p_assignee_profile_id IS NOT NULL THEN
    SELECT COALESCE(v_name, p.full_name) INTO v_name
    FROM public.profiles p
    WHERE p.id = p_assignee_profile_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'missing_assignee',
        'message', 'That staff profile no longer exists.');
    END IF;
  END IF;

  UPDATE public.hostel_cleaning_bookings
  SET status              = 'assigned',
      assigned_profile_id = p_assignee_profile_id,
      assigned_staff_name = v_name,
      assigned_at         = now(),
      assigned_by         = v_uid
  WHERE id = p_booking_id AND status IN ('booked','assigned');

  RETURN jsonb_build_object('success', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_assign_booking(uuid, uuid, text, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_housekeeping_assign_booking(uuid, uuid, text, boolean) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 8. fn_housekeeping_assignable_staff — picker source for the assign dialog
-- ────────────────────────────────────────────────────────────────────────
-- Permission-driven, no hardcoded role names: any active profile whose active
-- role grants '.mark_done' (VALUE test — `? 'key'` would match false grants).
-- Multi-institution staff with NULL profiles.institution_id won't appear;
-- the free-text assignee path covers them.

CREATE OR REPLACE FUNCTION public.fn_housekeeping_assignable_staff(p_institution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_list jsonb;
BEGIN
  IF NOT (
    is_super_admin() OR is_admin()
    OR (user_has_permission('campus_living.housekeeping.schedule')
        AND role_has_institution_access(p_institution_id))
  ) THEN
    RAISE EXCEPTION 'permission denied: housekeeping schedule required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('id', s.id, 'full_name', s.full_name)
           ORDER BY s.full_name), '[]'::jsonb)
  INTO v_list
  FROM (
    SELECT DISTINCT p.id, p.full_name
    FROM public.profiles p
    JOIN public.user_roles   ur ON ur.user_id = p.id
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE (cr.permissions->>'campus_living.housekeeping.mark_done')::boolean IS TRUE
      AND cr.is_active IS TRUE
      AND COALESCE(p.is_active, true)
      AND p.institution_id = p_institution_id
  ) s;

  RETURN v_list;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_assignable_staff(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_housekeeping_assignable_staff(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 9. fn_housekeeping_booking_board — learner details + assignment fields
-- ────────────────────────────────────────────────────────────────────────
-- All learner joins stay LEFT joins — an inner join would silently drop the
-- whole booking row on a missing learner profile / program / degree.

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
           'learner_name',   NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), ''),
           'roll_number',    lp.roll_number,
           'program_name',   COALESCE(pr.program_name, dg.degree_name),
           'phone',          lp.student_mobile,
           'photo_url',      lp.student_photo_url,
           'assigned_profile_id', b.assigned_profile_id,
           'assigned_staff_name', b.assigned_staff_name,
           'assigned_at',         b.assigned_at
         ) ORDER BY b.slot_start, bk.name, r.room_number), '[]'::jsonb)
  INTO v_board
  FROM public.hostel_cleaning_bookings b
  JOIN public.hostel_rooms       r  ON r.id  = b.room_id
  JOIN public.hostel_blocks      bk ON bk.id = b.block_id
  LEFT JOIN public.learners_profiles lp ON lp.id = b.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id
  LEFT JOIN public.degrees  dg ON dg.id = lp.degree_id
  WHERE b.institution_id = p_institution_id
    AND b.booking_date   = p_date;

  RETURN v_board;
END $$;
