-- Housekeeping reschedule, migration 2 of 3: the slot-grid exclusion and the
-- reschedule RPC.
--
-- ==========================================================================
-- (a) fn_cl_housekeeping_slots gains p_exclude_booking_id
--
-- A booking being rescheduled consumes capacity in its OWN grid: ask for its
-- current day and the slot it already occupies reads 'slot_full', so a warden
-- could never move a booking earlier or later on the same date. The RPC now
-- takes the booking to leave out of the capacity count.
--
-- DROP + CREATE, never CREATE OR REPLACE. Replacing a function with a CHANGED
-- argument list does not replace it -- it adds a SECOND function, and every
-- PostgREST call then fails as an ambiguous overload. Dropping first is also
-- why the REVOKE/GRANT pair below is not optional: a re-created function
-- silently re-grants EXECUTE to PUBLIC, which includes anon.
--
-- The only DB caller is fn_cl_housekeeping_book (verified by a pg_proc scan of
-- prosrc) and the only client caller is HousekeepingBookingService.getSlots;
-- both pass three arguments and keep working on the default.
--
-- Everything except the capacity count is the body applied by
-- 20260907090200_housekeeping_rpcs.sql, unchanged.
-- ==========================================================================
DROP FUNCTION IF EXISTS public.fn_cl_housekeeping_slots(uuid, uuid, date);

CREATE FUNCTION public.fn_cl_housekeeping_slots(
  p_room_id             uuid,
  p_type_id             uuid,
  p_date                date,
  p_exclude_booking_id  uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_block_id uuid;
  v_duration integer;
  v_avail    public.hostel_cleaning_availability%ROWTYPE;
  v_cursor   time;
  v_slot_end time;
  v_used     integer;
  v_slots    jsonb := '[]'::jsonb;
  v_today    date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_now_t    time := (now() AT TIME ZONE 'Asia/Kolkata')::time;
  v_past     boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('open', false, 'reason', 'unauthenticated', 'slots', '[]'::jsonb);
  END IF;

  -- The caller must actually live in this room. Without this check a DEFINER
  -- function would happily enumerate any room's availability.
  IF NOT EXISTS (
    SELECT 1 FROM public.hostel_allocations a
    WHERE a.room_id = p_room_id
      AND a.learner_id = v_uid
      AND a.status::text = ANY (public.fn_cl_roster_statuses())
  ) AND NOT public.user_has_permission('campus_living.housekeeping.view') THEN
    RETURN jsonb_build_object('open', false, 'reason', 'not_your_room', 'slots', '[]'::jsonb);
  END IF;

  SELECT r.block_id INTO v_block_id FROM public.hostel_rooms r WHERE r.id = p_room_id;
  IF v_block_id IS NULL THEN
    RETURN jsonb_build_object('open', false, 'reason', 'room_not_found', 'slots', '[]'::jsonb);
  END IF;

  SELECT t.duration_minutes INTO v_duration
  FROM public.hostel_cleaning_types t
  WHERE t.id = p_type_id AND t.is_active;
  IF v_duration IS NULL THEN
    RETURN jsonb_build_object('open', false, 'reason', 'type_unavailable', 'slots', '[]'::jsonb);
  END IF;

  SELECT * INTO v_avail
  FROM public.hostel_cleaning_availability av
  WHERE av.block_id = v_block_id
    AND av.weekday = EXTRACT(DOW FROM p_date)::integer;

  IF NOT FOUND OR NOT v_avail.is_open THEN
    RETURN jsonb_build_object('open', false, 'reason', 'day_closed', 'slots', '[]'::jsonb);
  END IF;

  v_cursor := v_avail.window_start;
  WHILE v_cursor + make_interval(mins => v_duration) <= v_avail.window_end LOOP
    v_slot_end := v_cursor + make_interval(mins => v_duration);

    -- Parallel cleanings already committed in this block overlapping this slot.
    -- The booking being rescheduled is left out: it must not block itself.
    SELECT count(*)::integer INTO v_used
    FROM public.hostel_cleaning_bookings b
    WHERE b.block_id = v_block_id
      AND b.booking_date = p_date
      AND b.status <> 'cancelled'
      AND b.slot_start < v_slot_end
      AND b.slot_end   > v_cursor
      AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id);

    v_past := (p_date < v_today) OR (p_date = v_today AND v_cursor <= v_now_t);

    v_slots := v_slots || jsonb_build_object(
      'slot_start',         to_char(v_cursor, 'HH24:MI'),
      'slot_end',           to_char(v_slot_end, 'HH24:MI'),
      'remaining_capacity', greatest(v_avail.capacity - v_used, 0),
      'is_bookable',        (v_used < v_avail.capacity) AND NOT v_past,
      'reason',             CASE
                              WHEN v_past THEN 'past'
                              WHEN v_used >= v_avail.capacity THEN 'slot_full'
                              ELSE NULL
                            END
    );

    v_cursor := v_slot_end;
  END LOOP;

  RETURN jsonb_build_object('open', true, 'slots', v_slots);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_slots(uuid, uuid, date, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_slots(uuid, uuid, date, uuid) TO authenticated;

-- ==========================================================================
-- (b) fn_cl_housekeeping_reschedule
--
-- Move a live booking to a new date/slot, optionally changing the cleaner in
-- the same action, and record WHY. One audit row per move.
--
-- What it deliberately does NOT re-check:
--
--   * The learner's booking_advance_days horizon. Pushing a booking past it is
--     the entire point -- "the cleaner is away all next week" is the common
--     case, and a 7-day ceiling would forbid the fix.
--   * The per-room type quota. The booking already spent it; re-counting would
--     have the booking refuse itself. Moving across dates can therefore land
--     two bookings of a 1-per-week type in one window -- a deliberate warden
--     act, and this table is the record of who did it and why.
--
-- What it does check is everything that decides whether the new slot can
-- physically happen: the block is open that weekday, the slot still has
-- capacity (minus this booking), the date is not in the past, and the cleaner
-- on the booking after the move actually serves this block and works that day.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_reschedule(
  p_booking_id    uuid,
  p_date          date,
  p_slot_start    time,
  p_reason_code   text,
  p_reason_note   text    DEFAULT NULL,
  p_cleaner_id    uuid    DEFAULT NULL,
  p_clear_cleaner boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid          uuid := auth.uid();
  v_b            public.hostel_cleaning_bookings%ROWTYPE;
  v_note         text;
  v_slots        jsonb;
  v_slot         jsonb;
  v_slot_end     time;
  v_ok           boolean := false;
  v_new_id       uuid;
  v_new_name     text;
  v_days         integer[];
  v_status       text;
  v_assigned_at  timestamptz;
  v_assigned_by  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unauthenticated');
  END IF;

  SELECT * INTO v_b FROM public.hostel_cleaning_bookings b WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found');
  END IF;

  IF NOT (public.user_has_permission('campus_living.housekeeping.reschedule')
          AND public.role_has_institution_access(v_b.institution_id)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden');
  END IF;

  -- Once a cleaner has started or finished, moving the slot would falsify
  -- started_at / finished_at. Those stay cancel-only.
  IF v_b.status NOT IN ('booked','assigned') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_reschedulable');
  END IF;

  IF p_reason_code IS NULL OR p_reason_code NOT IN (
       'cleaner_unavailable','cleaner_on_leave','slot_full',
       'learner_requested','emergency','other') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'invalid_reason');
  END IF;

  v_note := nullif(btrim(COALESCE(p_reason_note, '')), '');
  IF p_reason_code = 'other' AND v_note IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'reason_note_required');
  END IF;

  IF p_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'date_in_past');
  END IF;

  -- Serialise against learners booking this room at the same moment.
  PERFORM pg_advisory_xact_lock(hashtext(v_b.room_id::text));

  -- The new slot has to exist in the grid and still be free -- with this
  -- booking left out of the capacity count, so it does not block itself.
  v_slots := public.fn_cl_housekeeping_slots(v_b.room_id, v_b.type_id, p_date, p_booking_id);
  IF NOT (v_slots->>'open')::boolean THEN
    RETURN jsonb_build_object('success', false,
                              'error_code', COALESCE(v_slots->>'reason', 'day_closed'));
  END IF;
  FOR v_slot IN SELECT * FROM jsonb_array_elements(v_slots->'slots') LOOP
    IF (v_slot->>'slot_start') = to_char(p_slot_start, 'HH24:MI') THEN
      v_ok       := (v_slot->>'is_bookable')::boolean;
      v_slot_end := (v_slot->>'slot_end')::time;
    END IF;
  END LOOP;
  IF v_slot_end IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'slot_not_found');
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'slot_full');
  END IF;

  IF (p_date, p_slot_start) IS NOT DISTINCT FROM (v_b.booking_date, v_b.slot_start) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'slot_unchanged');
  END IF;

  -- Who cleans it after the move.
  IF p_clear_cleaner THEN
    v_new_id := NULL; v_new_name := NULL;
    v_status := 'booked'; v_assigned_at := NULL; v_assigned_by := NULL;
  ELSE
    v_new_id := COALESCE(p_cleaner_id, v_b.cleaner_id);

    IF v_new_id IS NULL THEN
      v_new_name := NULL;
      v_status := 'booked'; v_assigned_at := NULL; v_assigned_by := NULL;
    ELSE
      -- The same three checks fn_cl_housekeeping_assign makes, run against the
      -- NEW date. A cleaner kept from the old booking is re-validated too: the
      -- new weekday may not be one they work, and silently carrying an
      -- impossible pairing is worse than refusing.
      SELECT c.full_name, c.working_days INTO v_new_name, v_days
      FROM public.hostel_cleaners c
      WHERE c.id = v_new_id AND c.is_active;
      IF v_new_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'cleaner_unavailable');
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.hostel_cleaner_blocks cb
        WHERE cb.cleaner_id = v_new_id AND cb.block_id = v_b.block_id
      ) THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'cleaner_wrong_block');
      END IF;

      IF NOT (EXTRACT(DOW FROM p_date)::integer = ANY (v_days)) THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'cleaner_not_working');
      END IF;

      v_status := 'assigned';
      -- Keeping the same person keeps the original assignment stamp; a swap is
      -- a fresh assignment by whoever rescheduled.
      IF v_new_id IS DISTINCT FROM v_b.cleaner_id THEN
        v_assigned_at := now(); v_assigned_by := v_uid;
      ELSE
        v_assigned_at := COALESCE(v_b.assigned_at, now());
        v_assigned_by := COALESCE(v_b.assigned_by, v_uid);
      END IF;
    END IF;
  END IF;

  INSERT INTO public.hostel_cleaning_booking_reschedules (
    booking_id, institution_id,
    from_date, from_slot_start, from_slot_end,
    to_date,   to_slot_start,   to_slot_end,
    from_cleaner_id, from_cleaner_name,
    to_cleaner_id,   to_cleaner_name,
    reason_code, reason_note, rescheduled_by
  ) VALUES (
    v_b.id, v_b.institution_id,
    v_b.booking_date, v_b.slot_start, v_b.slot_end,
    p_date, p_slot_start, v_slot_end,
    v_b.cleaner_id, v_b.cleaner_name,
    v_new_id, v_new_name,
    p_reason_code, v_note, v_uid
  );

  UPDATE public.hostel_cleaning_bookings
  SET booking_date    = p_date,
      slot_start      = p_slot_start,
      slot_end        = v_slot_end,
      -- The rating deadline follows the booking, or a moved cleaning would be
      -- overdue before it happened.
      feedback_due_at = (p_date + time '23:59:59') AT TIME ZONE 'Asia/Kolkata',
      cleaner_id      = v_new_id,
      cleaner_name    = v_new_name,
      assigned_at     = v_assigned_at,
      assigned_by     = v_assigned_by,
      status          = v_status
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success',      true,
    'status',       v_status,
    'booking_date', to_char(p_date, 'YYYY-MM-DD'),
    'slot_start',   to_char(p_slot_start, 'HH24:MI'),
    'slot_end',     to_char(v_slot_end, 'HH24:MI'),
    'cleaner_name', v_new_name
  );
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_reschedule(uuid, date, time, text, text, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_reschedule(uuid, date, time, text, text, uuid, boolean) TO authenticated;

-- ==========================================================================
-- (c) The notification the learner gets when their cleaning is moved.
--
-- Same shape as housekeeping_feedback_pending (20260907090400): the row seeded
-- here is the per-institution CHANNEL MATRIX entry rendered by
-- /campus-living/settings/notification-rules, so a Director can turn
-- email/SMS/push on or off. Push on, email/SMS off -- this is a nudge, not
-- correspondence. Delivery itself goes through sendNotification, which still
-- honours each user's own notification_preferences.
-- ==========================================================================
INSERT INTO public.hostel_notification_rules
  (institution_id, category, event_key, event_label,
   channel_email, channel_sms, channel_push, is_active)
SELECT DISTINCT r.institution_id,
       'housekeeping',
       'housekeeping_booking_rescheduled',
       'Room cleaning rescheduled',
       false, false, true, true
FROM public.hostel_notification_rules r
ON CONFLICT (institution_id, event_key) DO NOTHING;
