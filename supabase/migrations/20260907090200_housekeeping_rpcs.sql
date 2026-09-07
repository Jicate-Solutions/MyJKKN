-- Housekeeping rebuild, migration 3 of 4: RPCs, hold function, attendance trigger.
--
-- Every function here is SECURITY DEFINER and therefore bypasses RLS. Each one
-- consequently:
--   * derives the caller from auth.uid() INTERNALLY. No function accepts a
--     caller-id parameter -- parameters are attacker-controlled, and a DEFINER
--     RPC that trusts p_user_id lets any caller impersonate anyone.
--   * runs with SET search_path = '' so nothing can be shadowed. That is why
--     every single object reference below is schema-qualified.
--   * performs its own permission check before touching data.
--   * has EXECUTE revoked from PUBLIC and anon, then granted to authenticated.
--     CREATE OR REPLACE silently re-grants EXECUTE to PUBLIC, so the revoke is
--     not optional and must follow every definition.
--
-- ci:allow-secdef-authenticated fn_cl_housekeeping_book authorizes by ALLOCATION
-- OWNERSHIP, not by a permission key: a learner may book only for the room they
-- currently live in, which the body derives from auth.uid() via
-- hostel_allocations and then re-checks against the room's category, the room
-- lock, and the per-room quota. Learners deliberately hold NO housekeeping
-- permission key -- granting one to satisfy this gate would widen access, not
-- narrow it. Every OTHER function in this file does carry an explicit
-- user_has_permission / is_super_admin check: _slots, _cancel, _assign and
-- _feedback_holds. _attendance_gate is a trigger function, revoked from
-- PUBLIC and anon and not callable as an RPC at all.
--
-- Spec: specs/campus-living-housekeeping-rebuild-spec-2026-09-07.md sections 6, 8
--
-- APPLIED over a direct SQL connection, not scripts/apply-migration-file.mjs.
-- See the header of 20260907085000_housekeeping_teardown.sql for why.

-- ==========================================================================
-- fn_cl_housekeeping_slots
--
-- The slot grid for one room + one cleaning type + one date.
-- Slot length is the TYPE's duration, so a 30-minute type yields 30-minute
-- slots and a 90-minute type yields 90-minute slots from the same window.
--
-- Returns jsonb rather than SETOF so a closed day can carry its reason:
--   {"open": false, "reason": "day_closed", "slots": []}
--   {"open": true,  "slots": [{slot_start, slot_end, remaining_capacity,
--                              is_bookable, reason}, ...]}
-- Learners cannot SELECT hostel_cleaning_availability (warden-only policy),
-- which is exactly why this function is DEFINER.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_slots(
  p_room_id uuid,
  p_type_id uuid,
  p_date    date
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
    SELECT count(*)::integer INTO v_used
    FROM public.hostel_cleaning_bookings b
    WHERE b.block_id = v_block_id
      AND b.booking_date = p_date
      AND b.status <> 'cancelled'
      AND b.slot_start < v_slot_end
      AND b.slot_end   > v_cursor;

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

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_slots(uuid, uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_slots(uuid, uuid, date) TO authenticated;

-- ==========================================================================
-- fn_cl_housekeeping_book
--
-- The full validation chain, in the order the spec defines. Returns the first
-- failure rather than collecting them, because the UI shows one message.
--
-- The advisory lock narrows the double-book race;
-- ux_hk_one_live_booking_per_room closes it. Both are needed: the lock gives a
-- clean error_code for the common case, the index guarantees correctness for
-- the rest.
-- ==========================================================================
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
  v_window_start date;
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

  -- 3. Active type in the caller's institution.
  SELECT * INTO v_type
  FROM public.hostel_cleaning_types t
  WHERE t.id = p_type_id
    AND t.is_active
    AND t.institution_id = v_alloc.institution_id;
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

  -- 6. Quota: per room, per type, rolling window ending on the booking date.
  v_window_start := CASE v_type.usage_period
                      WHEN 'day'   THEN p_date
                      WHEN 'week'  THEN p_date - 6
                      WHEN 'month' THEN p_date - 29
                    END;
  SELECT count(*)::integer INTO v_used
  FROM public.hostel_cleaning_bookings b
  WHERE b.room_id = v_alloc.room_id
    AND b.type_id = p_type_id
    AND b.status <> 'cancelled'
    AND b.booking_date BETWEEN v_window_start AND p_date;
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

-- ==========================================================================
-- fn_cl_housekeeping_cancel
--
-- A learner may cancel only while the booking is still unassigned. Once a
-- cleaner is assigned, only a warden holding .cancel may do it.
-- Cancelling releases the room lock and refunds the quota, because the partial
-- unique index and the quota count both exclude 'cancelled'.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_cancel(
  p_booking_id uuid,
  p_reason     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_b         public.hostel_cleaning_bookings%ROWTYPE;
  v_is_warden boolean;
  v_is_owner  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unauthenticated');
  END IF;

  SELECT * INTO v_b FROM public.hostel_cleaning_bookings b WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found');
  END IF;

  IF v_b.status IN ('completed','cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_cancellable');
  END IF;

  v_is_warden := public.user_has_permission('campus_living.housekeeping.cancel')
                 AND public.role_has_institution_access(v_b.institution_id);
  v_is_owner  := EXISTS (
    SELECT 1 FROM public.hostel_allocations a
    WHERE a.room_id = v_b.room_id
      AND a.learner_id = v_uid
      AND a.status::text = ANY (public.fn_cl_roster_statuses())
  );

  IF v_is_warden THEN
    NULL;  -- wardens may cancel at any live status
  ELSIF v_is_owner THEN
    IF v_b.status <> 'booked' THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'already_assigned');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden');
  END IF;

  UPDATE public.hostel_cleaning_bookings
  SET status        = 'cancelled',
      cancelled_at  = now(),
      cancelled_by  = v_uid,
      cancel_reason = nullif(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_cancel(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_cancel(uuid, text) TO authenticated;

-- ==========================================================================
-- fn_cl_housekeeping_assign
--
-- Warden assigns (or clears) a cleaner. Snapshots cleaner_name onto the
-- booking so learners never need SELECT on hostel_cleaners, which holds phone
-- numbers -- Postgres RLS is row-level, so exposing the row exposes the PII.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_assign(
  p_booking_id uuid,
  p_cleaner_id uuid,
  p_clear      boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_b    public.hostel_cleaning_bookings%ROWTYPE;
  v_name text;
  v_days integer[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unauthenticated');
  END IF;

  SELECT * INTO v_b FROM public.hostel_cleaning_bookings b WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found');
  END IF;

  IF NOT (public.user_has_permission('campus_living.housekeeping.assign')
          AND public.role_has_institution_access(v_b.institution_id)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden');
  END IF;

  IF v_b.status NOT IN ('booked','assigned') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_assignable');
  END IF;

  IF p_clear THEN
    UPDATE public.hostel_cleaning_bookings
    SET cleaner_id = NULL, cleaner_name = NULL,
        assigned_at = NULL, assigned_by = NULL,
        status = 'booked'
    WHERE id = p_booking_id;
    RETURN jsonb_build_object('success', true, 'status', 'booked');
  END IF;

  SELECT c.full_name, c.working_days INTO v_name, v_days
  FROM public.hostel_cleaners c
  WHERE c.id = p_cleaner_id
    AND c.is_active
    AND c.institution_id = v_b.institution_id;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'cleaner_unavailable');
  END IF;

  -- The cleaner must actually serve this block and work this weekday.
  IF NOT EXISTS (
    SELECT 1 FROM public.hostel_cleaner_blocks cb
    WHERE cb.cleaner_id = p_cleaner_id AND cb.block_id = v_b.block_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'cleaner_wrong_block');
  END IF;

  IF NOT (EXTRACT(DOW FROM v_b.booking_date)::integer = ANY (v_days)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'cleaner_not_working');
  END IF;

  UPDATE public.hostel_cleaning_bookings
  SET cleaner_id = p_cleaner_id, cleaner_name = v_name,
      assigned_at = now(), assigned_by = v_uid,
      status = 'assigned'
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'status', 'assigned', 'cleaner_name', v_name);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_assign(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_assign(uuid, uuid, boolean) TO authenticated;

-- ==========================================================================
-- fn_cl_housekeeping_feedback_holds
--
-- Which learners are currently attendance-blocked by unrated cleanings.
-- Computed live: there is no stored flag and no cron, so nothing can fall out
-- of sync. The hold starts the day AFTER the booking date and lifts the
-- instant any roommate rates.
--
-- p_institution_id / p_block_id are optional filters (NULL = no filter).
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_feedback_holds(
  p_institution_id uuid DEFAULT NULL,
  p_block_id       uuid DEFAULT NULL,
  p_date           date DEFAULT NULL
) RETURNS TABLE (
  learner_id   uuid,
  room_id      uuid,
  booking_id   uuid,
  booking_date date,
  type_name    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  -- AUTHORIZATION. This is DEFINER and its filters are all optional, so
  -- without a check any signed-in learner could call it with NULLs and
  -- enumerate every held learner and room in every institution. Callers are
  -- warden surfaces only: the holds page and the attendance roster.
  --
  -- Rows are ALSO scoped per-institution, so a warden of one institution
  -- cannot read another's even by passing p_institution_id => NULL.
  SELECT a.learner_id, b.room_id, b.id, b.booking_date, b.type_name
  FROM public.hostel_cleaning_bookings b
  JOIN public.hostel_allocations a
    ON a.room_id = b.room_id
   AND a.status::text = ANY (public.fn_cl_roster_statuses())
  WHERE (
          public.is_super_admin()
          OR public.user_has_permission('campus_living.housekeeping.view')
          OR public.user_has_permission('campus_living.attendance.view')
        )
    AND (public.is_super_admin() OR public.role_has_institution_access(b.institution_id))
    AND b.status = 'awaiting_feedback'
    AND b.waived_at IS NULL
    AND b.booking_date < COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date)
    AND (p_institution_id IS NULL OR b.institution_id = p_institution_id)
    AND (p_block_id       IS NULL OR b.block_id       = p_block_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.hostel_cleaning_feedback f WHERE f.booking_id = b.id);
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_feedback_holds(uuid, uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_feedback_holds(uuid, uuid, date) TO authenticated;

-- ==========================================================================
-- The attendance gate
--
-- hostel_attendance is a hot table (15,822 rows, written in bulk). This
-- trigger is deliberately a single EXISTS against
-- idx_hk_bookings_awaiting_feedback, of which only a handful of rows exist at
-- any moment.
--
-- The service layer pre-filters held learners out of bulk marking so one held
-- learner never fails a whole block's insert. This trigger is the backstop for
-- every path that bypasses the service -- a UI-only guard on an RLS-writable
-- table is decorative.
--
-- hostel_attendance.learner_id references profiles(id), the same id space as
-- hostel_allocations.learner_id (verified: 15,822 of 15,822 rows match), so
-- the comparison below is direct.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_attendance_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_type text;
  v_when date;
BEGIN
  -- Deliberately does NOT call fn_cl_housekeeping_feedback_holds.
  --
  -- That function carries an authorization check (it is a grantable read
  -- surface). A caller who may WRITE attendance but not READ holds would get
  -- zero rows back and sail straight through — the gate would fail OPEN, which
  -- is the exact failure this trigger exists to prevent. The predicate is
  -- therefore inlined here, where it answers about the row being written and
  -- nothing else, and is never reachable as a query surface.
  SELECT b.type_name, b.booking_date INTO v_type, v_when
  FROM public.hostel_cleaning_bookings b
  JOIN public.hostel_allocations a
    ON a.room_id = b.room_id
   AND a.status::text = ANY (public.fn_cl_roster_statuses())
  WHERE a.learner_id = NEW.learner_id
    AND b.status = 'awaiting_feedback'
    AND b.waived_at IS NULL
    AND b.booking_date < NEW.date
    AND NOT EXISTS (
      SELECT 1 FROM public.hostel_cleaning_feedback f WHERE f.booking_id = b.id)
  LIMIT 1;

  IF v_type IS NOT NULL THEN
    RAISE EXCEPTION
      'Housekeeping feedback pending for this room (% on %). Any roommate can rate the cleaning to release attendance.',
      v_type, to_char(v_when, 'DD Mon YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_attendance_gate() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS t_hostel_attendance_housekeeping_gate ON public.hostel_attendance;
CREATE TRIGGER t_hostel_attendance_housekeeping_gate
  BEFORE INSERT OR UPDATE ON public.hostel_attendance
  FOR EACH ROW EXECUTE FUNCTION public.fn_cl_housekeeping_attendance_gate();
