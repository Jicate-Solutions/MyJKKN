-- ============================================================================
-- Housekeeping board: "All institutions" scope + institution_name on each row
-- ----------------------------------------------------------------------------
-- Super-admin feedback (2026-08-27): the board showed "No bookings yet · Total
-- 0" for a super admin. Not a bug in the board — the page hard-scoped it to
-- profiles.institution_id (JKKN Main Office for that account) while every
-- booking lives in JKKN Dental College. A super admin / multi-institution
-- warden had no way to reach them, and the module's own Scheduled-cleaning
-- section reinforced the illusion by listing Main Office's schedules.
--
-- p_institution_id is now OPTIONAL: NULL = every institution the caller can
-- access (RLS-equivalent scope enforced per row inside the function, so this
-- never becomes a cross-tenant leak). Rows carry institution_name so the
-- combined view is legible. The 4-arg signature is REPLACED in place (same
-- arg types, only the default changes), so no overload is created and every
-- existing caller keeps working.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_housekeeping_booking_board(
  p_institution_id uuid DEFAULT NULL,
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
  v_board      jsonb;
  v_all_access boolean;
  v_can_view   boolean;
BEGIN
  -- Evaluated ONCE, not per row (these are the expensive calls).
  v_all_access := is_super_admin() OR is_admin();
  v_can_view   := user_has_permission('campus_living.housekeeping.view');

  IF p_institution_id IS NULL THEN
    -- All-institutions mode: any housekeeping viewer may ask; the row filter
    -- below restricts the result to institutions they actually hold.
    IF NOT (v_all_access OR v_can_view) THEN
      RAISE EXCEPTION 'permission denied: housekeeping view required' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT (v_all_access
            OR (v_can_view AND role_has_institution_access(p_institution_id))) THEN
      RAISE EXCEPTION 'permission denied: housekeeping view required' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id',             b.id,
           'institution_id', b.institution_id,
           'institution_name', inst.name,
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
  LEFT JOIN public.institutions  inst ON inst.id = b.institution_id
  LEFT JOIN public.learners_profiles lp ON lp.id = b.learner_id
  LEFT JOIN public.programs pr ON pr.id = lp.program_id
  LEFT JOIN public.degrees  dg ON dg.id = lp.degree_id
  WHERE (p_institution_id IS NULL OR b.institution_id = p_institution_id)
    AND (p_date      IS NULL OR b.booking_date  = p_date)
    AND (p_date_from IS NULL OR b.booking_date >= p_date_from)
    AND (p_date_to   IS NULL OR b.booking_date <= p_date_to)
    -- Per-row tenant scope for the all-institutions case (skipped entirely
    -- for admins, and a no-op when one institution was already checked).
    AND (v_all_access
         OR p_institution_id IS NOT NULL
         OR role_has_institution_access(b.institution_id));

  RETURN v_board;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_housekeeping_booking_board(uuid, date, date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_housekeeping_booking_board(uuid, date, date, date) TO authenticated;
