-- The type quota window becomes SYMMETRIC around the date being booked.
--
-- THE LOOPHOLE. Step 6 of fn_cl_housekeeping_book counted only backwards:
--
--     v_window_start := p_date - 6;                       -- 'week'
--     ... WHERE b.booking_date BETWEEN v_window_start AND p_date
--
-- so a booking already sitting AFTER p_date did not count. Measured on the live
-- data: one completed 1-per-week Room Cleaning dated 2026-09-08, asked on
-- 2026-09-07 — the RPC refused the 8th through the 14th and ALLOWED the 7th,
-- because [2026-09-01, 2026-09-07] does not contain the 8th. A room could
-- therefore hold two cleanings two days apart on a "1 per week" type by booking
-- the later date first.
--
-- "1 per week" is read by everyone — learner, warden, the type editor's own
-- label — as "use it once and it is gone for a week". That means both
-- directions, so the window is now
--
--     [p_date - n, p_date + n]      n = 0 (day) / 6 (week) / 29 (month)
--
-- For usage_period 'day' the window is still the single date, unchanged.
--
-- The TypeScript mirror in lib/services/campus-living/housekeeping-rules.ts
-- moves in the same commit (typeQuota + quotaWindowEnd) — the header of that
-- file is explicit that the two must change together or the picker offers slots
-- the RPC then refuses.
--
-- Only step 6 changes. Every other line is the body applied by
-- 20260909110000_housekeeping_types_global.sql.

CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_book(
  p_type_id    uuid,
  p_date       date,
  p_slot_start time,
  p_notes      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid          uuid := auth.uid();
  v_alloc        public.hostel_allocations%ROWTYPE;
  v_type         public.hostel_cleaning_types%ROWTYPE;
  v_category_id  uuid;
  v_slot_end     time;
  v_window_days  integer;
  v_window_start date;
  v_window_end   date;
  v_used         integer;
  v_advance_days integer;
  v_slots        jsonb;
  v_slot         jsonb;
  v_ok           boolean := false;
  v_cost         numeric(12,2);
  v_booking_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unauthenticated');
  END IF;

  -- 1. Master kill switch.
  IF NOT public.fn_get_policy_bool('housekeeping.booking_enabled', true, NULL) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'feature_disabled');
  END IF;

  -- 2. Live allocation. This is the learner's authorisation -- no permission
  --    key is involved; living in the room IS the right to book for it.
  SELECT * INTO v_alloc
  FROM public.hostel_allocations a
  WHERE a.learner_id = v_uid
    AND a.status::text = ANY (public.fn_cl_roster_statuses())
  ORDER BY a.allocation_date DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'no_allocation');
  END IF;

  -- 3. Active type. The catalogue is global, so there is no institution to
  --    match -- step 4 is what decides whether THIS learner may book it.
  SELECT * INTO v_type
  FROM public.hostel_cleaning_types t
  WHERE t.id = p_type_id
    AND t.is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'type_unavailable');
  END IF;

  -- 4. Eligibility by the SEATED room's category (never the billed category,
  --    and never hostel_allocations.tier_id, which is dead in production).
  --    An empty junction means nobody can book: it fails closed.
  SELECT r.category_id INTO v_category_id
  FROM public.hostel_rooms r WHERE r.id = v_alloc.room_id;
  IF v_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.hostel_cleaning_type_categories tc
    WHERE tc.type_id = p_type_id AND tc.category_id = v_category_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'category_not_eligible');
  END IF;

  -- Serialise same-room bookers before the read-then-write below.
  PERFORM pg_advisory_xact_lock(hashtext(v_alloc.room_id::text));

  -- 5. Room lock: one live booking per room, any type.
  IF EXISTS (
    SELECT 1 FROM public.hostel_cleaning_bookings b
    WHERE b.room_id = v_alloc.room_id
      AND b.status IN ('booked','assigned','in_progress','awaiting_feedback')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'room_locked');
  END IF;

  -- 6. Quota: per room, per type, over a window SYMMETRIC about the booking
  --    date. Counting only backwards let a room book the later date first and
  --    then squeeze a second cleaning in before it -- see this file's header.
  v_window_days := CASE v_type.usage_period
                     WHEN 'day'   THEN 0
                     WHEN 'week'  THEN 6
                     WHEN 'month' THEN 29
                   END;
  v_window_start := p_date - v_window_days;
  v_window_end   := p_date + v_window_days;
  SELECT count(*)::integer INTO v_used
  FROM public.hostel_cleaning_bookings b
  WHERE b.room_id = v_alloc.room_id
    AND b.type_id = p_type_id
    AND b.status <> 'cancelled'
    AND b.booking_date BETWEEN v_window_start AND v_window_end;
  IF v_used >= v_type.usage_limit_count THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'quota_exhausted',
                              'used', v_used, 'allowed', v_type.usage_limit_count);
  END IF;

  -- 7. Date range.
  v_advance_days := public.fn_get_policy_int('housekeeping.booking_advance_days', 7, NULL);
  IF p_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
     OR p_date > (now() AT TIME ZONE 'Asia/Kolkata')::date + v_advance_days THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'date_out_of_range');
  END IF;

  -- 8. The slot must exist in today's grid and still be bookable.
  v_slots := public.fn_cl_housekeeping_slots(v_alloc.room_id, p_type_id, p_date);
  IF NOT (v_slots->>'open')::boolean THEN
    RETURN jsonb_build_object('success', false,
                              'error_code', COALESCE(v_slots->>'reason', 'day_closed'));
  END IF;
  FOR v_slot IN SELECT * FROM jsonb_array_elements(v_slots->'slots') LOOP
    IF (v_slot->>'slot_start') = to_char(p_slot_start, 'HH24:MI') THEN
      v_ok := (v_slot->>'is_bookable')::boolean;
      v_slot_end := (v_slot->>'slot_end')::time;
    END IF;
  END LOOP;
  IF v_slot_end IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'slot_not_found');
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'slot_full');
  END IF;

  -- 9. Snapshot the cost and insert.
  SELECT COALESCE(sum(e.line_total_inr), 0) INTO v_cost
  FROM public.hostel_cleaning_type_expenses e WHERE e.type_id = p_type_id;

  INSERT INTO public.hostel_cleaning_bookings (
    institution_id, block_id, room_id, allocation_id, learner_id, type_id,
    booking_date, slot_start, slot_end, status,
    feedback_due_at, type_name, duration_minutes, expected_cost_inr, notes
  ) VALUES (
    v_alloc.institution_id, v_alloc.block_id, v_alloc.room_id, v_alloc.id, v_uid, p_type_id,
    p_date, p_slot_start, v_slot_end, 'booked',
    (p_date + time '23:59:59') AT TIME ZONE 'Asia/Kolkata',
    v_type.name, v_type.duration_minutes, v_cost, nullif(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id,
                            'slot_end', to_char(v_slot_end, 'HH24:MI'));
EXCEPTION
  WHEN unique_violation THEN
    -- ux_hk_one_live_booking_per_room fired: a roommate won the race.
    RETURN jsonb_build_object('success', false, 'error_code', 'room_locked');
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_book(uuid, date, time, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_book(uuid, date, time, text) TO authenticated;
