-- =====================================================================
-- Reservation Approval Workflow Fix
-- =====================================================================
-- Root cause: PGRST116 "0 rows returned" when approving reservations.
-- Multiple layered issues:
--   1. resource_approvals had no INSERT policy -> approver-chain rows
--      were silently dropped, leaving the table empty.
--   2. resource_reservations UPDATE policies don't honor the JSON
--      approvers list in resources.approval_config -> designated
--      approvers cannot mutate the reservation row directly.
--   3. No role holds resources.reservations.edit, so the existing
--      "_update_by_resource" RLS branch returns 0 rows for everyone
--      except super_admin.
--
-- Fix: SECURITY DEFINER RPCs approve_reservation / reject_reservation
-- that authorize by the strict approval_config.approvers[] list,
-- honor multi-level + parallel/sequential chain rules, atomically
-- update both resource_approvals and resource_reservations, and
-- auto-heal missing approval-chain rows. Also adds an INSERT policy
-- on resource_approvals so future reservation creation populates
-- the chain correctly, plus backfill for the 4 existing pending rows.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. INSERT policy on resource_approvals
-- ---------------------------------------------------------------------
-- Allow the reservation requester to seed their own approval chain,
-- and super_admins for administrative repair. Designated approvers
-- themselves don't insert -- the requester (or system flow) does.
DROP POLICY IF EXISTS resource_approvals_insert_by_requester ON public.resource_approvals;
CREATE POLICY resource_approvals_insert_by_requester
  ON public.resource_approvals
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.resource_reservations rr
      WHERE rr.id = resource_approvals.reservation_id
        AND rr.user_id = (SELECT auth.uid())
    )
    OR public.is_super_admin()
  );

-- ---------------------------------------------------------------------
-- 2. Backfill missing approval chain rows for existing pending
--    reservations whose resource has approval_config.approvers[].
-- ---------------------------------------------------------------------
-- Uses unique_approval_per_level (reservation_id, approval_level) to
-- prevent dup rows. Skips rows that already exist for any reason.
INSERT INTO public.resource_approvals
  (reservation_id, approver_user_id, approval_level, status)
SELECT
  rr.id,
  (a.value->>'user_id')::uuid,
  COALESCE((a.value->>'level')::int, 1),
  'pending'::approval_status
FROM public.resource_reservations rr
JOIN public.resources r ON r.id = rr.resource_id
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(r.approval_config->'approvers', '[]'::jsonb)
) AS a
WHERE rr.status = 'pending'::reservation_status
  AND (a.value->>'user_id') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.resource_approvals ra
    WHERE ra.reservation_id = rr.id
      AND ra.approval_level = COALESCE((a.value->>'level')::int, 1)
  );

-- ---------------------------------------------------------------------
-- 3. approve_reservation(p_reservation_id, p_notes) RPC
-- ---------------------------------------------------------------------
-- Authorization:
--   * Caller must be listed in resources.approval_config.approvers[]
--     for the reservation's resource, OR be super_admin.
-- Chain logic:
--   * approval_type = 'sequential' (default): caller's level must equal
--     the lowest pending level for this reservation.
--   * approval_type = 'parallel': any required approver may approve.
--   * require_all_approvers (default true): reservation flips to
--     'approved' only when every is_required=true approver has
--     status='approved'. Otherwise first required-approver wins.
-- Returns: the updated reservation row (caller fetches joins separately).

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
  v_caller         uuid := (SELECT auth.uid());
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

  -- Lock the reservation row for the duration of the transaction.
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

  SELECT * INTO v_resource
  FROM public.resources
  WHERE id = v_reservation.resource_id;

  v_approvers     := COALESCE(v_resource.approval_config->'approvers', '[]'::jsonb);
  v_approval_type := COALESCE(v_resource.approval_config->>'approval_type', 'sequential');
  v_require_all   := COALESCE(
                       (v_resource.approval_config->>'require_all_approvers')::boolean,
                       true
                     );

  -- Locate caller in the approvers list.
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

  -- Sequential approval: caller must be at the lowest pending level.
  IF v_my_entry IS NOT NULL AND v_approval_type = 'sequential' THEN
    SELECT MIN(approval_level) INTO v_lowest_pending
    FROM public.resource_approvals
    WHERE reservation_id = p_reservation_id
      AND status = 'pending'::approval_status;

    -- If the chain row doesn't exist yet (edge case for missed backfill),
    -- allow caller through; the next block creates it.
    IF v_lowest_pending IS NOT NULL AND v_my_level > v_lowest_pending THEN
      RAISE EXCEPTION 'Approval at level % is still pending; you cannot approve at level % yet',
                      v_lowest_pending, v_my_level
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Upsert the caller's approval row. Path A: row exists for caller.
  UPDATE public.resource_approvals
     SET status      = 'approved'::approval_status,
         approved_at = now(),
         comments    = COALESCE(p_notes, comments),
         updated_at  = now()
   WHERE reservation_id = p_reservation_id
     AND approver_user_id = v_caller;

  -- Path B: caller has no row yet (listed approver after a missed
  -- backfill, or super_admin acting). Try to insert at their level.
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

  -- Chain completion check.
  IF v_is_super AND v_my_entry IS NULL THEN
    -- super_admin override completes the chain regardless of remaining approvers
    v_should_finish := true;
  ELSE
    SELECT COUNT(*) INTO v_required_count
    FROM jsonb_array_elements(v_approvers) a
    WHERE COALESCE((a.value->>'is_required')::boolean, true) = true;

    -- count approved required approvers (those whose user_id appears
    -- as is_required=true in approvers[])
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

    -- No approvers configured at all -> single approval flips it.
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
    -- Chain not complete -- caller approved their level but more
    -- approvers still required. Keep reservation pending.
    SELECT * INTO v_result
    FROM public.resource_reservations
    WHERE id = p_reservation_id;
  END IF;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------
-- 4. reject_reservation(p_reservation_id, p_reason) RPC
-- ---------------------------------------------------------------------
-- Any required approver (or super_admin) can reject. Rejection from a
-- single approver flips the entire reservation to 'rejected'.
CREATE OR REPLACE FUNCTION public.reject_reservation(
  p_reservation_id uuid,
  p_reason         text
)
RETURNS public.resource_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       uuid := (SELECT auth.uid());
  v_is_super     boolean := public.is_super_admin();
  v_reservation  public.resource_reservations;
  v_resource     public.resources;
  v_approvers    jsonb;
  v_my_entry     jsonb;
  v_my_level     int;
  v_result       public.resource_reservations;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'Rejection reason is required' USING ERRCODE = 'P0001';
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
    RAISE EXCEPTION 'Reservation is already %, cannot reject',
                    v_reservation.status::text
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_resource
  FROM public.resources
  WHERE id = v_reservation.resource_id;

  v_approvers := COALESCE(v_resource.approval_config->'approvers', '[]'::jsonb);

  SELECT a.value INTO v_my_entry
  FROM jsonb_array_elements(v_approvers) a
  WHERE (a.value->>'user_id')::uuid = v_caller
  LIMIT 1;

  IF v_my_entry IS NULL AND NOT v_is_super THEN
    RAISE EXCEPTION 'You are not authorized to reject this reservation'
      USING ERRCODE = '42501';
  END IF;

  v_my_level := COALESCE((v_my_entry->>'level')::int, 0);

  -- Record caller's rejection on their approval row.
  UPDATE public.resource_approvals
     SET status            = 'rejected'::approval_status,
         approved_at       = now(),
         rejection_reason  = p_reason,
         updated_at        = now()
   WHERE reservation_id = p_reservation_id
     AND approver_user_id = v_caller;

  IF NOT FOUND AND v_my_entry IS NOT NULL THEN
    INSERT INTO public.resource_approvals
      (reservation_id, approver_user_id, approval_level, status,
       approved_at, rejection_reason)
    VALUES
      (p_reservation_id, v_caller, v_my_level,
       'rejected'::approval_status, now(), p_reason)
    ON CONFLICT ON CONSTRAINT unique_approval_per_level
    DO UPDATE SET
      approver_user_id  = EXCLUDED.approver_user_id,
      status            = EXCLUDED.status,
      approved_at       = EXCLUDED.approved_at,
      rejection_reason  = EXCLUDED.rejection_reason,
      updated_at        = now();
  END IF;

  UPDATE public.resource_reservations
     SET status            = 'rejected'::reservation_status,
         approved_by       = v_caller,
         approved_at       = now(),
         rejection_reason  = p_reason,
         updated_at        = now()
   WHERE id = p_reservation_id
   RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.approve_reservation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_reservation(uuid, text)  TO authenticated;

COMMIT;
