-- ════════════════════════════════════════════════════════════════════════════
-- 20260909123000_housekeeping_block_scoped_warden_access.sql
-- ────────────────────────────────────────────────────────────────────────────
-- Housekeeping is invisible to a chief warden: the day board reads 0 while
-- live bookings sit in the blocks that warden runs.
--
-- REPRO (2026-09-09, production)
--   girlschiefwarden@jkkn.ac.in / kasthuri.j@jkkn.ac.in open
--   /campus-living/housekeeping. Every tile reads 0 and the board says "No
--   cleanings booked for this day", while 11 bookings exist that day in Girls
--   Hostel C -- a block both of them hold in user_block_access.
--
-- THE CAUSE IS NOT PERMISSION
--   chief_warden holds every housekeeping key: view, assign, execute, waive,
--   cancel, cleaners_manage, availability_manage, types_manage. The block
--   grants are there too (Girls Hostel A/B/C, "auto: hostel_wardens
--   assignment").
--
--   What fails is institution scoping, the same trap as
--   c1802ec2e (allocations read 0 for a chief warden on 449 live rows):
--
--     profiles.institution_id for both chief wardens = JKKN Main Office, an
--     ADMINISTRATIVE office. A booking row carries the LEARNER's college id,
--     copied from their allocation -- JKKN Dental College and JKKN College of
--     Pharmacy for these 11. role_has_institution_access(booking.institution_id)
--     therefore returns false on every row: not super admin, role scope is
--     'own' not 'all', Main Office != the college, counselling_code 'MO' has no
--     CAS sibling, and neither user has a user_institution_access grant.
--
--   hostel_allocations survives this only because of an ADDITIVE second policy,
--   hostel_allocations_warden_review_select, which checks role_has_block_access
--   (block_id) and never touches the institution. Housekeeping never got that
--   policy, even though every booking row carries block_id.
--
-- THE FIX
--   Add the block branch everywhere the institution branch is the only door.
--   Reads and writes are ADDITIVE policies -- permissive policies are OR'ed, so
--   nothing that works today can stop working. The three DEFINER functions
--   repeat the check in their bodies, so they are replaced with the same OR.
--
--   Fixing only the board would be worse than not fixing it: the warden would
--   see the two bookings and then be refused on assign, start, finish, photo
--   upload and waive, with no explanation on screen.
--
-- WHAT THIS GRANTS
--   A holder of the matching housekeeping key sees and acts on bookings in the
--   blocks they are assigned, whatever college the learner belongs to. That is
--   deliberate and it is what the job is: the block is the unit of work, and
--   one girls' block houses learners from several colleges. It mirrors the rule
--   hostel_allocations has used since 20260531000009.
--
-- BLAST RADIUS (counted live before writing this)
--   girlschiefwarden@jkkn.ac.in   0 -> 11 bookings
--   kasthuri.j@jkkn.ac.in         0 -> 11 bookings
--   every other warden            unchanged (the Dental warden keeps her 6 via
--                                 the institution branch; the boys' wardens
--                                 hold blocks that have no bookings yet)
--   No learner gains anything: their branch is unchanged, and the new branch
--   requires a housekeeping permission key that no learner role holds.
--
-- NOT ADDRESSED
--   The institution dropdown on the day board lists only Main Office for this
--   role, so selecting it still yields 0. The page defaults to "All
--   institutions" and sends no filter, which is the path in use. Changing that
--   list is a UI decision, not a security one.
--
-- ROLLBACK
--   DROP POLICY hk_bookings_block_select   ON public.hostel_cleaning_bookings;
--   DROP POLICY hk_bookings_block_update   ON public.hostel_cleaning_bookings;
--   DROP POLICY hk_photos_block_insert     ON public.hostel_cleaning_booking_photos;
--   DROP POLICY hk_photos_block_delete     ON public.hostel_cleaning_booking_photos;
--   plus restore the three function bodies from
--   supabase/migrations/20260907090200_housekeeping_rpcs.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ==========================================================================
-- 1. Bookings: the day board, and every status write on it
-- ==========================================================================
-- SELECT. Additive to hk_bookings_select, which keeps serving super admins,
-- institution-scoped wardens and learners reading their own room.
DROP POLICY IF EXISTS hk_bookings_block_select ON public.hostel_cleaning_bookings;
CREATE POLICY hk_bookings_block_select ON public.hostel_cleaning_bookings
FOR SELECT
USING (
  (SELECT public.user_has_permission('campus_living.housekeeping.view'))
  AND public.role_has_block_access(block_id)
);

COMMENT ON POLICY hk_bookings_block_select ON public.hostel_cleaning_bookings IS
  'Block-scoped read for wardens. A chief warden sits in an administrative '
  'office while bookings carry the learner''s college, so the institution '
  'branch of hk_bookings_select can never match for them. Mirrors '
  'hostel_allocations_warden_review_select.';

-- UPDATE. startJob, finishJob and waiveHold are plain table writes from the
-- client (see housekeeping-booking-service.ts), so they need a policy, not an
-- RPC. Both clauses are spelled out: with two permissive policies Postgres
-- OR's the WITH CHECKs, and an omitted one would silently fall back to USING.
DROP POLICY IF EXISTS hk_bookings_block_update ON public.hostel_cleaning_bookings;
CREATE POLICY hk_bookings_block_update ON public.hostel_cleaning_bookings
FOR UPDATE
USING (
  (
    (SELECT public.user_has_permission('campus_living.housekeeping.execute'))
    OR (SELECT public.user_has_permission('campus_living.housekeeping.assign'))
    OR (SELECT public.user_has_permission('campus_living.housekeeping.waive'))
  )
  AND public.role_has_block_access(block_id)
)
WITH CHECK (
  (
    (SELECT public.user_has_permission('campus_living.housekeeping.execute'))
    OR (SELECT public.user_has_permission('campus_living.housekeeping.assign'))
    OR (SELECT public.user_has_permission('campus_living.housekeeping.waive'))
  )
  AND public.role_has_block_access(block_id)
);

COMMENT ON POLICY hk_bookings_block_update ON public.hostel_cleaning_bookings IS
  'Block-scoped write for wardens: start, finish and waive. Same key set as '
  'hk_bookings_update, block instead of institution.';

-- ==========================================================================
-- 2. Photos: the before/after evidence a warden uploads while executing
-- ==========================================================================
-- hostel_cleaning_booking_photos has institution_id but NO block_id, so the
-- block is reached through the parent booking. hk_photos_select already reads
-- through the booking, so it needs nothing: it starts working the moment the
-- booking above becomes visible.
DROP POLICY IF EXISTS hk_photos_block_insert ON public.hostel_cleaning_booking_photos;
CREATE POLICY hk_photos_block_insert ON public.hostel_cleaning_booking_photos
FOR INSERT
WITH CHECK (
  (SELECT public.user_has_permission('campus_living.housekeeping.execute'))
  AND EXISTS (
    SELECT 1 FROM public.hostel_cleaning_bookings b
    WHERE b.id = hostel_cleaning_booking_photos.booking_id
      AND public.role_has_block_access(b.block_id)
  )
);

DROP POLICY IF EXISTS hk_photos_block_delete ON public.hostel_cleaning_booking_photos;
CREATE POLICY hk_photos_block_delete ON public.hostel_cleaning_booking_photos
FOR DELETE
USING (
  (SELECT public.user_has_permission('campus_living.housekeeping.execute'))
  AND EXISTS (
    SELECT 1 FROM public.hostel_cleaning_bookings b
    WHERE b.id = hostel_cleaning_booking_photos.booking_id
      AND public.role_has_block_access(b.block_id)
  )
);

-- ==========================================================================
-- 3. fn_cl_housekeeping_assign — assigning a cleaner to a booking
-- ==========================================================================
-- Body reproduced from the live definition; the authorization line is the only
-- change.
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_assign(
  p_booking_id uuid,
  p_cleaner_id uuid,
  p_clear      boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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

  -- Institution OR block: a chief warden's institution is an administrative
  -- office, so the institution test alone locks them out of their own blocks.
  IF NOT (public.user_has_permission('campus_living.housekeeping.assign')
          AND (public.role_has_institution_access(v_b.institution_id)
               OR public.role_has_block_access(v_b.block_id))) THEN
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

  -- Any active cleaner. The block check below is what scopes them.
  SELECT c.full_name, c.working_days INTO v_name, v_days
  FROM public.hostel_cleaners c
  WHERE c.id = p_cleaner_id
    AND c.is_active;
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
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_assign(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_assign(uuid, uuid, boolean) TO authenticated;

-- ==========================================================================
-- 4. fn_cl_housekeeping_cancel — the warden branch only
-- ==========================================================================
-- The learner branch (v_is_owner) is untouched: it never looked at the
-- institution, and a learner may still only cancel their own room's booking
-- while it is still 'booked'.
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_cancel(
  p_booking_id uuid,
  p_reason     text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
                 AND (public.role_has_institution_access(v_b.institution_id)
                      OR public.role_has_block_access(v_b.block_id));
  v_is_owner  := EXISTS (
    SELECT 1 FROM public.hostel_allocations a
    WHERE a.room_id = v_b.room_id
      AND a.learner_id = v_uid
      AND a.status::text = ANY (public.fn_cl_roster_statuses())
  );

  IF v_is_warden THEN
    NULL;
  ELSIF v_is_owner THEN
    IF v_b.status <> 'booked' THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'already_assigned');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden');
  END IF;

  UPDATE public.hostel_cleaning_bookings
  SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
      cancel_reason = nullif(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_cancel(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_cancel(uuid, text) TO authenticated;

-- ==========================================================================
-- 5. fn_cl_housekeeping_feedback_holds — the attendance holds page
-- ==========================================================================
-- Same widening. The authorization line stays a hard gate: it is still
-- impossible to call this with NULL filters and enumerate rows outside your
-- own institution or your own blocks.
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_feedback_holds(
  p_institution_id uuid DEFAULT NULL::uuid,
  p_block_id       uuid DEFAULT NULL::uuid,
  p_date           date DEFAULT NULL::date
) RETURNS TABLE(
  learner_id   uuid,
  room_id      uuid,
  booking_id   uuid,
  booking_date date,
  type_name    text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  -- AUTHORIZATION. This is DEFINER and its filters are optional, so without a
  -- check any signed-in learner could call it with NULLs and enumerate every
  -- held learner and room in every institution. Callers are warden surfaces
  -- only: the holds page and the attendance roster.
  --
  -- Rows are ALSO scoped to what the caller runs: their institution, or the
  -- blocks granted to them in user_block_access. A chief warden reaches rows
  -- only through the second branch -- their own institution is an
  -- administrative office that owns no bookings.
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
    AND (public.is_super_admin()
         OR public.role_has_institution_access(b.institution_id)
         OR public.role_has_block_access(b.block_id))
    AND b.status = 'awaiting_feedback'
    AND b.waived_at IS NULL
    AND b.booking_date < COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date)
    AND (p_institution_id IS NULL OR b.institution_id = p_institution_id)
    AND (p_block_id       IS NULL OR b.block_id       = p_block_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.hostel_cleaning_feedback f WHERE f.booking_id = b.id);
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_feedback_holds(uuid, uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_feedback_holds(uuid, uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
