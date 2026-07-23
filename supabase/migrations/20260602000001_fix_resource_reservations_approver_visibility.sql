-- =====================================================================
-- Fix: Resource Reservations – Approver Visibility + Self-Approval Block
-- =====================================================================
-- Root causes:
--   1. No SELECT policy on resource_reservations grants designated approvers
--      visibility into reservations assigned to them. Approvers whose
--      profiles.institution_id differs from the resource's institution_id
--      (cross-dept / Level-2 approvers) were silently excluded from the
--      approval queue.
--   2. approve_reservation() RPC had no guard against a requester approving
--      their own request when they were also listed as an approver.
--
-- Fixes:
--   1. Add "resource_reservations_select_by_approver" policy so any user
--      with a row in resource_approvals for a reservation can SELECT it,
--      regardless of institution membership.
--   2. Patch approve_reservation() to reject the call when
--      v_caller = v_reservation.user_id (unless super_admin).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. SELECT policy: approvers can always see their assigned reservations
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS resource_reservations_select_by_approver
  ON public.resource_reservations;

CREATE POLICY resource_reservations_select_by_approver
  ON public.resource_reservations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.resource_approvals ra
      WHERE ra.reservation_id = resource_reservations.id
        AND ra.approver_user_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- 2. Patch approve_reservation() to block self-approval
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_reservation(
  p_reservation_id uuid,
  p_notes          text DEFAULT NULL
)
RETURNS public.resource_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller         uuid    := (SELECT auth.uid());
  v_is_super       boolean := public.is_super_admin();
  v_reservation    public.resource_reservations;
  v_resource       public.resources;
  v_approvers      jsonb;
  v_my_entry       jsonb;
  v_my_level       int;
  v_approval_type  text;
  v_require_all    boolean;
  v_lowest_pending int;
  v_required_count int;
  v_approved_count int;
  v_should_finish  boolean := false;
  v_result         public.resource_reservations;
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

  IF v_reservation.status <> 'pending'::reservation_status THEN
    RAISE EXCEPTION 'Reservation is already %, cannot approve',
                    v_reservation.status::text
      USING ERRCODE = 'P0001';
  END IF;

  -- Block self-approval: a requester may not approve their own request.
  IF v_caller = v_reservation.user_id AND NOT v_is_super THEN
    RAISE EXCEPTION 'You cannot approve your own reservation request'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_resource
  FROM public.resources
  WHERE id = v_reservation.resource_id;

  v_approvers     := COALESCE(v_resource.approval_config->'approvers', '[]'::jsonb);
  v_approval_type := COALESCE(v_resource.approval_config->>'approval_type', 'sequential');
  v_require_all   := COALESCE(
                       (v_resource.approval_config->>'require_all_approvers')::boolean,
                       true
                     );

  SELECT a.value
    INTO v_my_entry
  FROM jsonb_array_elements(v_approvers) a
  WHERE (a.value->>'user_id')::uuid = v_caller
  LIMIT 1;

  IF v_my_entry IS NULL AND NOT v_is_super THEN
    RAISE EXCEPTION 'You are not authorized to approve this reservation'
      USING ERRCODE = '42501';
  END IF;

  v_my_level := COALESCE((v_my_entry->>'level')::int, 0);

  IF v_my_entry IS NOT NULL AND v_approval_type = 'sequential' THEN
    SELECT MIN(approval_level) INTO v_lowest_pending
    FROM public.resource_approvals
    WHERE reservation_id = p_reservation_id
      AND status = 'pending'::approval_status;

    IF v_lowest_pending IS NOT NULL AND v_my_level > v_lowest_pending THEN
      RAISE EXCEPTION 'Approval at level % is still pending; you cannot approve at level % yet',
                      v_lowest_pending, v_my_level
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.resource_approvals
     SET status      = 'approved'::approval_status,
         approved_at = now(),
         comments    = COALESCE(p_notes, comments),
         updated_at  = now()
   WHERE reservation_id = p_reservation_id
     AND approver_user_id = v_caller;

  IF NOT FOUND AND v_my_entry IS NOT NULL THEN
    INSERT INTO public.resource_approvals
      (reservation_id, approver_user_id, approval_level, status, approved_at, comments)
    VALUES
      (p_reservation_id, v_caller, v_my_level,
       'approved'::approval_status, now(), p_notes)
    ON CONFLICT ON CONSTRAINT unique_approval_per_level
    DO UPDATE SET
      approver_user_id = EXCLUDED.approver_user_id,
      status           = EXCLUDED.status,
      approved_at      = EXCLUDED.approved_at,
      comments         = COALESCE(EXCLUDED.comments, public.resource_approvals.comments),
      updated_at       = now();
  END IF;

  IF v_is_super AND v_my_entry IS NULL THEN
    v_should_finish := true;
  ELSE
    SELECT COUNT(*) INTO v_required_count
    FROM jsonb_array_elements(v_approvers) a
    WHERE COALESCE((a.value->>'is_required')::boolean, true) = true;

    SELECT COUNT(DISTINCT ra.approver_user_id) INTO v_approved_count
    FROM public.resource_approvals ra
    WHERE ra.reservation_id = p_reservation_id
      AND ra.status = 'approved'::approval_status
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_approvers) a
        WHERE (a.value->>'user_id')::uuid = ra.approver_user_id
          AND COALESCE((a.value->>'is_required')::boolean, true) = true
      );

    IF v_require_all THEN
      v_should_finish := v_required_count > 0
                         AND v_approved_count >= v_required_count;
    ELSE
      v_should_finish := v_approved_count >= 1;
    END IF;

    IF v_required_count = 0 THEN
      v_should_finish := true;
    END IF;
  END IF;

  IF v_should_finish THEN
    UPDATE public.resource_reservations
       SET status      = 'approved'::reservation_status,
           approved_by = v_caller,
           approved_at = now(),
           notes       = CASE
                           WHEN p_notes IS NOT NULL AND p_notes <> ''
                             THEN COALESCE(notes || E'\n', '')
                                  || '--- Approved by ' || v_caller::text
                                  || ': ' || p_notes
                           ELSE notes
                         END,
           updated_at  = now()
     WHERE id = p_reservation_id
     RETURNING * INTO v_result;
  ELSE
    SELECT * INTO v_result
    FROM public.resource_reservations
    WHERE id = p_reservation_id;
  END IF;

  RETURN v_result;
END;
$$;

COMMIT;
