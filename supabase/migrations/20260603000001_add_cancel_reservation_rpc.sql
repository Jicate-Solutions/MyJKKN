-- =====================================================================
-- Fix: cancel_reservation SECURITY DEFINER RPC
-- =====================================================================
-- Root causes:
--   1. Direct client UPDATE on resource_reservations is blocked for
--      admins (update policy: user_id = auth.uid() only).
--   2. Even for the booker, the SELECT policy (institution-based filter)
--      differs from the UPDATE policy, so .update().select().single()
--      returns PGRST116 even though the row WAS cancelled — the service
--      throws an error the user sees as "Cancellation Failed."
--
-- Fix: SECURITY DEFINER RPC that runs as the DB owner, handles both
-- the booker and admin (resources.manage) cases, validates status,
-- and returns the updated row directly — no post-UPDATE SELECT needed.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.cancel_reservation(
  p_reservation_id uuid,
  p_reason         text DEFAULT NULL
)
RETURNS public.resource_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller      uuid    := (SELECT auth.uid());
  v_is_super    boolean := public.is_super_admin();
  v_reservation public.resource_reservations;
  v_can_cancel  boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_reservation
  FROM public.resource_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation % not found', p_reservation_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_reservation.status NOT IN (
      'pending'::reservation_status,
      'approved'::reservation_status
  ) THEN
    RAISE EXCEPTION 'Reservation cannot be cancelled — current status: %',
                    v_reservation.status::text
      USING ERRCODE = 'P0001';
  END IF;

  -- Booker can always cancel their own reservation
  IF v_caller = v_reservation.user_id THEN
    v_can_cancel := true;
  END IF;

  -- Super-admin bypass
  IF NOT v_can_cancel AND v_is_super THEN
    v_can_cancel := true;
  END IF;

  -- Users with resources.manage permission can cancel any reservation
  IF NOT v_can_cancel AND public.user_has_permission('resources.manage') THEN
    v_can_cancel := true;
  END IF;

  IF NOT v_can_cancel THEN
    RAISE EXCEPTION 'You are not authorised to cancel this reservation'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.resource_reservations
     SET status              = 'cancelled'::reservation_status,
         cancelled_by        = v_caller,
         cancelled_at        = now(),
         cancellation_reason = COALESCE(NULLIF(trim(p_reason), ''), 'No reason provided'),
         updated_at          = now()
   WHERE id = p_reservation_id
   RETURNING * INTO v_reservation;

  RETURN v_reservation;
END;
$$;
