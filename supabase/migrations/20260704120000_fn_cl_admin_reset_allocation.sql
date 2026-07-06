-- ─────────────────────────────────────────────────────────────────────────
-- Admin "Reset" for an allocation row: undo the room allocation and/or clear
-- the learner's room/mess category, selected independently from one modal on
-- /campus-living/allocations.
--
-- WHY an RPC (same reasoning as fn_cl_admin_transfer_allocation):
--   * Bed invariant — an occupied bed carries status='occupied' +
--     current_occupant_id (profiles.id); a free bed carries 'available' + NULL.
--     The plain client-side vacate/checkOut/delete paths never touch
--     hostel_beds, so a client reset would leak the bed stuck 'occupied'.
--     This RPC deletes the allocation + frees the bed in one transaction.
--   * learners_profiles.hostel_category_id / mess_category_id are RLS-guarded;
--     hostel admins clear them through this gate instead of a direct UPDATE.
--
-- Semantics (user decision 2026-07-04):
--   * p_reset_room  → HARD DELETE the hostel_allocations row (undo a wrong
--     allocation; learner returns to the "Not Allocated" tab). Not a vacate —
--     no history row is kept. Allowed for status active/pending_approval.
--     hostel_premium_invites + hostel_cleaning_bookings cascade; a deposit or
--     vacate request on the allocation blocks the reset with a clear error
--     (both FKs are NOT NULL + no-action/restrict, and detaching a financial
--     record silently would be worse).
--   * p_reset_room_category / p_reset_mess_category → NULL the learner-level
--     category columns. Independent of the room reset because the category
--     stamp intentionally survives vacate (billing history), and the fee-band
--     writeback trigger may re-derive them on the next academic bill write.
--
-- GATE: campus_living.upgrades.manage — the catalog campus_living.allocations.*
--   keys are mass-granted to every role and useless as a privilege gate;
--   upgrades.manage = super-admin + the 5 hostel-admin roles (same audience as
--   the manual transfer/allocate RPCs).
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cl_admin_reset_allocation(
  p_allocation_id uuid,
  p_reset_room boolean DEFAULT false,
  p_reset_room_category boolean DEFAULT false,
  p_reset_mess_category boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alloc            hostel_allocations%ROWTYPE;
  v_lp_id            uuid;
  v_mapped           boolean;
  v_accessible       boolean;
  v_deleted          boolean := false;
  v_freed_bed        uuid;
  v_room_cat_cleared boolean := false;
  v_mess_cat_cleared boolean := false;
BEGIN
  -- Authorization: super-admin OR a hostel-admin role holding upgrades.manage.
  IF NOT user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'Not authorized to reset hostel allocations'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (COALESCE(p_reset_room, false)
          OR COALESCE(p_reset_room_category, false)
          OR COALESCE(p_reset_mess_category, false)) THEN
    RAISE EXCEPTION 'Select at least one item to reset' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_alloc FROM hostel_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation % not found', p_allocation_id USING ERRCODE = 'P0002';
  END IF;

  -- Institution scope: enforce only when the block is mapped to institution(s)
  -- via hostel_block_institutions; data gaps fail open (same as transfer RPC).
  SELECT EXISTS (SELECT 1 FROM hostel_block_institutions WHERE block_id = v_alloc.block_id)
    INTO v_mapped;
  IF v_mapped THEN
    SELECT EXISTS (
      SELECT 1 FROM hostel_block_institutions hbi
      WHERE hbi.block_id = v_alloc.block_id
        AND hbi.institution_id IN (
          SELECT institution_id FROM get_user_accessible_institutions(auth.uid())
        )
    ) INTO v_accessible;
    IF NOT v_accessible THEN
      RAISE EXCEPTION 'No access to this allocation''s institution'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Bridge to the learner-level record: allocation.learner_id is profiles.id;
  -- the category columns live on learners_profiles (profiles.learner_id, 1:1).
  SELECT p.learner_id INTO v_lp_id FROM profiles p WHERE p.id = v_alloc.learner_id;

  IF COALESCE(p_reset_room, false) THEN
    IF v_alloc.status NOT IN ('active', 'pending_approval')
       OR v_alloc.check_out_date IS NOT NULL THEN
      RAISE EXCEPTION 'Only an active or pending allocation can be reset (current status: %)',
        v_alloc.status USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (SELECT 1 FROM hostel_deposits WHERE allocation_id = p_allocation_id) THEN
      RAISE EXCEPTION 'This allocation has a deposit record — settle or remove it before resetting the room'
        USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM hostel_vacate_requests WHERE allocation_id = p_allocation_id) THEN
      RAISE EXCEPTION 'This allocation has a vacate request — resolve it before resetting the room'
        USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM hostel_allocations WHERE id = p_allocation_id;
    v_deleted := true;

    -- Free the bed only when no other open allocation still claims it
    -- (a pending_approval row's bed may legitimately never have been occupied
    -- — the conditional update is a safe no-op in that case).
    IF v_alloc.bed_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM hostel_allocations a
      WHERE a.bed_id = v_alloc.bed_id
        AND a.status IN ('active', 'pending_approval')
        AND a.check_out_date IS NULL
    ) THEN
      UPDATE hostel_beds
         SET status = 'available', current_occupant_id = NULL, updated_at = now()
       WHERE id = v_alloc.bed_id;
      v_freed_bed := v_alloc.bed_id;
    END IF;
  END IF;

  IF COALESCE(p_reset_room_category, false) AND v_lp_id IS NOT NULL THEN
    UPDATE learners_profiles
       SET hostel_category_id = NULL
     WHERE id = v_lp_id AND hostel_category_id IS NOT NULL;
    v_room_cat_cleared := FOUND;
  END IF;

  IF COALESCE(p_reset_mess_category, false) AND v_lp_id IS NOT NULL THEN
    UPDATE learners_profiles
       SET mess_category_id = NULL
     WHERE id = v_lp_id AND mess_category_id IS NOT NULL;
    v_mess_cat_cleared := FOUND;
  END IF;

  RETURN jsonb_build_object(
    'success',               true,
    'allocation_deleted',    v_deleted,
    'freed_bed_id',          v_freed_bed,
    'room_category_cleared', v_room_cat_cleared,
    'mess_category_cleared', v_mess_cat_cleared
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_reset_allocation(uuid, boolean, boolean, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_reset_allocation(uuid, boolean, boolean, boolean) TO authenticated;
