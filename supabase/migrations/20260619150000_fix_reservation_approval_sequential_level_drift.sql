-- =====================================================================
-- Fix: Reservation sequential-approval deadlock from approver-level drift
-- =====================================================================
-- Symptom (reported): an approver can approve one reservation for a
-- resource but is "blocked" on another reservation for the same
-- resource (different dates).
--
-- Root cause:
--   approve_reservation() enforced sequential ordering by comparing
--     * v_my_level       -> the caller's level read from the resource's
--                           LIVE approval_config.approvers[].level, and
--     * v_lowest_pending -> MIN(approval_level) over pending rows in
--                           resource_approvals, where approval_level was
--                           FROZEN into each row when the reservation was
--                           created (createApprovalRecords / backfill).
--   These two numbers only agree while the resource's approval_config is
--   never edited after reservations exist. When an admin edits the config
--   and reorders / swaps approver levels (as happened for "Vibrant
--   Arangam" -- the COO and CAO levels were swapped AFTER reservations and
--   their chain rows already existed), the persisted approval_level no
--   longer matches the live config level for the same user. The gate then
--   compares inconsistent numberings and deadlocks: once the now-level-1
--   approver approves first, the other approver -- whose own pending chain
--   row still carries the stale lower approval_level -- is permanently
--   rejected with "Approval at level X is still pending; you cannot
--   approve at level Y yet". Which reservations deadlock depends on the
--   accidental order approvers click, producing the "one works, one
--   blocked" symptom.
--
-- Fix:
--   1. Recompute v_lowest_pending from the SAME source as v_my_level --
--      the live approval_config -- as the lowest config level among
--      approvers who have not yet recorded an 'approved' decision. The
--      persisted approval_level is no longer authoritative for gating, so
--      a later config edit can never reintroduce the drift. All other
--      behavior (self-approval block, parallel handling, require_all
--      completion, super_admin override) is unchanged.
--   2. Re-sync the persisted approval_level of still-actionable (pending)
--      reservations to the live config, so the stored chain and the
--      approval-chain timeline display agree with the current config.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. approve_reservation(): config-consistent sequential gate
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

  -- Sequential gate. Derive the lowest pending level from the LIVE
  -- approval_config (the same source as v_my_level) so the comparison is
  -- self-consistent even when the config's approver levels were edited
  -- after this reservation's resource_approvals rows were seeded. An
  -- approver counts as "pending" until they have an 'approved' row.
  IF v_my_entry IS NOT NULL AND v_approval_type = 'sequential' THEN
    SELECT MIN((a.value->>'level')::int)
      INTO v_lowest_pending
    FROM jsonb_array_elements(v_approvers) a
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.resource_approvals ra
      WHERE ra.reservation_id = p_reservation_id
        AND ra.approver_user_id = (a.value->>'user_id')::uuid
        AND ra.status = 'approved'::approval_status
    );

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

-- ---------------------------------------------------------------------
-- 2. Re-sync persisted approval_level to the live config for still-
--    actionable (pending) reservations. Two-pass offset avoids transient
--    unique(reservation_id, approval_level) collisions during a swap.
-- ---------------------------------------------------------------------
-- Pass 1: bump every mismatched pending-reservation row out of the way.
WITH cfg AS (
  SELECT r.id AS resource_id,
         (a.value->>'user_id')::uuid AS approver,
         (a.value->>'level')::int     AS cfg_level
  FROM public.resources r,
       jsonb_array_elements(COALESCE(r.approval_config->'approvers','[]'::jsonb)) a
)
UPDATE public.resource_approvals ra
   SET approval_level = ra.approval_level + 1000,
       updated_at     = now()
  FROM public.resource_reservations rr, cfg
 WHERE ra.reservation_id = rr.id
   AND rr.status = 'pending'::reservation_status
   AND cfg.resource_id = rr.resource_id
   AND cfg.approver    = ra.approver_user_id
   AND ra.approval_level <> cfg.cfg_level;

-- Pass 2: settle the bumped rows onto their live config level.
WITH cfg AS (
  SELECT r.id AS resource_id,
         (a.value->>'user_id')::uuid AS approver,
         (a.value->>'level')::int     AS cfg_level
  FROM public.resources r,
       jsonb_array_elements(COALESCE(r.approval_config->'approvers','[]'::jsonb)) a
)
UPDATE public.resource_approvals ra
   SET approval_level = cfg.cfg_level,
       updated_at     = now()
  FROM public.resource_reservations rr, cfg
 WHERE ra.reservation_id = rr.id
   AND rr.status = 'pending'::reservation_status
   AND cfg.resource_id = rr.resource_id
   AND cfg.approver    = ra.approver_user_id
   AND ra.approval_level > 1000;

COMMIT;
