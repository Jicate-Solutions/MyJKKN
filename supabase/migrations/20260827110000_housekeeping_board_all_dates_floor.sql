-- ============================================================================
-- Housekeeping board: all-dates range view + floor + status-priority order
-- ----------------------------------------------------------------------------
-- Warden feedback (2026-08-27): the day board only ever showed ONE day, hid
-- the room's floor, and buried actionable rows among finished ones. The board
-- RPC now takes an optional date OR range:
--   p_date              → exactly that day (old behavior, old callers keep
--                         working — they pass named params {p_institution_id,
--                         p_date}, which still resolve)
--   p_date_from/_to     → inclusive range; all NULL → every booking
-- Rows come back actionable-first: live statuses (booked, assigned) before
-- finished ones (completed / no_show / cancelled), then by date + slot.
-- Also adds hostel_rooms.floor to each row.
-- The old 2-arg signature MUST be dropped first — CREATE OR REPLACE with new
-- defaulted params would otherwise create a second overload and make every
-- PostgREST call ambiguous.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_housekeeping_booking_board(uuid, date);

CREATE FUNCTION public.fn_housekeeping_booking_board(
  p_institution_id uuid,
  p_date           date DEFAULT NULL,
  p_date_from      date DEFAULT NULL,
  p_date_to        date DEFAULT NULL
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
           'floor',          r.floor,
           'block_name',     bk.name,
           'learner_name',   NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), ''),
           'roll_number',    lp.roll_number,
           'program_name',   COALESCE(pr.program_name, dg.degree_name),
           'phone',          lp.student_mobile,
           'photo_url',      lp.student_photo_url,
           'assigned_profile_id', b.assigned_profile_id,
           'assigned_staff_name', b.assigned_staff_name,
           'assigned_at',         b.assigned_at
         ) ORDER BY
           -- Actionable first: live statuses before finished ones.
           CASE WHEN b.status IN ('booked','assigned') THEN 0 ELSE 1 END,
           b.booking_date, b.slot_start, bk.name, r.room_number),
         '[]'::jsonb)
  INTO v_board
  FROM public.hostel_cleaning_bookings b
  JOIN public.hostel_rooms       r  ON r.id  = b.room_id
  JOIN public.hostel_blocks      bk ON bk.id = b.block_id
  LEFT JOIN public.learners_profiles lp ON lp.id = b.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id
  LEFT JOIN public.degrees  dg ON dg.id = lp.degree_id
  WHERE b.institution_id = p_institution_id
    AND (p_date      IS NULL OR b.booking_date  = p_date)
    AND (p_date_from IS NULL OR b.booking_date >= p_date_from)
    AND (p_date_to   IS NULL OR b.booking_date <= p_date_to);

  RETURN v_board;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_booking_board(uuid, date, date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_housekeeping_booking_board(uuid, date, date, date) TO authenticated;
