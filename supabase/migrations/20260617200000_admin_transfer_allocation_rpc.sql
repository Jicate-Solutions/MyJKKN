-- ─────────────────────────────────────────────────────────────────────────
-- Admin manual room/bed transfer for an existing allocation.
--
-- WHY an RPC (not the plain client-side HostelAllocationService.transfer):
--   The bed inventory invariant in this DB is "an occupied bed carries
--   status='occupied' + current_occupant_id = the allocation's learner_id
--   (profiles.id); a free bed carries status='available' + current_occupant_id
--   NULL." Pickers (BedService.getAvailableBeds) rely on hostel_beds.status,
--   and a probe on 2026-06-17 showed PERFECT 79/79 consistency. The plain
--   client transfer only moved hostel_allocations.{room_id,bed_id,block_id} and
--   never touched hostel_beds, so it would leak the old bed (stuck 'occupied'
--   with no active alloc) and leave the new bed bookable by someone else. This
--   RPC does the allocation move + frees the old bed + occupies the new one in a
--   single transaction so the invariant is preserved.
--
-- GATE: campus_living.upgrades.manage — the catalog keys campus_living.
--   allocations.transfer / .edit are mass-granted to EVERY role (Student,
--   Parent, Driver, ...), so they are useless as a privilege gate. upgrades.
--   manage is held by exactly the 5 hostel-admin roles (CEO, Chief Warden,
--   Exec Admin Officer, Hostel Office Admin, Warden); super-admin passes
--   user_has_permission() for any key. That is the intended "super-admin +
--   hostel admins manage manually" audience.
--
-- Pure physical move: it does NOT change the learner's room/mess CATEGORY
-- (that path is the category-upgrade module, which also bills the difference).
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cl_admin_transfer_allocation(
  p_allocation_id uuid,
  p_room_id uuid,
  p_bed_id uuid,
  p_block_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alloc      hostel_allocations%ROWTYPE;
  v_bed        hostel_beds%ROWTYPE;
  v_room       hostel_rooms%ROWTYPE;
  v_old_bed    uuid;
  v_learner    uuid;
  v_block_id   uuid;
  v_mapped     boolean;
  v_accessible boolean;
BEGIN
  -- Authorization: super-admin OR a hostel-admin role holding upgrades.manage.
  IF NOT user_has_permission('campus_living.upgrades.manage') THEN
    RAISE EXCEPTION 'Not authorized to transfer hostel allocations'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_alloc FROM hostel_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation % not found', p_allocation_id USING ERRCODE = 'P0002';
  END IF;
  IF v_alloc.status <> 'active' OR v_alloc.check_out_date IS NOT NULL THEN
    RAISE EXCEPTION 'Only an active allocation can be transferred (current status: %)', v_alloc.status
      USING ERRCODE = 'P0001';
  END IF;

  v_old_bed := v_alloc.bed_id;
  v_learner := v_alloc.learner_id;

  -- Target room / bed must exist and be consistent.
  SELECT * INTO v_room FROM hostel_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room % not found', p_room_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_bed FROM hostel_beds WHERE id = p_bed_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bed % not found', p_bed_id USING ERRCODE = 'P0002';
  END IF;
  IF v_bed.room_id <> p_room_id THEN
    RAISE EXCEPTION 'Bed does not belong to the selected room' USING ERRCODE = 'P0001';
  END IF;

  v_block_id := COALESCE(p_block_id, v_room.block_id);

  -- Institution scope: enforce only when the target block is mapped to
  -- institution(s). Super-admin's accessible set is all institutions, so they
  -- always pass; data gaps (block with no junction rows) fail open rather than
  -- blocking a legitimate admin.
  SELECT EXISTS (SELECT 1 FROM hostel_block_institutions WHERE block_id = v_block_id)
    INTO v_mapped;
  IF v_mapped THEN
    SELECT EXISTS (
      SELECT 1 FROM hostel_block_institutions hbi
      WHERE hbi.block_id = v_block_id
        AND hbi.institution_id IN (
          SELECT institution_id FROM get_user_accessible_institutions(auth.uid())
        )
    ) INTO v_accessible;
    IF NOT v_accessible THEN
      RAISE EXCEPTION 'No access to the target block''s institution'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Target bed must be free (unless it is the learner's current bed → no-op).
  IF p_bed_id <> COALESCE(v_old_bed, '00000000-0000-0000-0000-000000000000'::uuid)
     AND EXISTS (
       SELECT 1 FROM hostel_allocations a
       WHERE a.bed_id = p_bed_id
         AND a.status = 'active'
         AND a.check_out_date IS NULL
     ) THEN
    RAISE EXCEPTION 'The selected bed is already occupied' USING ERRCODE = '23505';
  END IF;

  -- Move the allocation. (status stays 'active' → the category-sync trigger,
  -- which fires only on status change, does not run; category is preserved.)
  UPDATE hostel_allocations
     SET room_id         = p_room_id,
         bed_id          = p_bed_id,
         block_id        = v_block_id,
         allocation_type = 'transfer',
         updated_at      = now()
   WHERE id = p_allocation_id;

  -- Maintain the bed invariant.
  IF v_old_bed IS NOT NULL AND v_old_bed <> p_bed_id THEN
    UPDATE hostel_beds
       SET status = 'available', current_occupant_id = NULL, updated_at = now()
     WHERE id = v_old_bed;
  END IF;
  UPDATE hostel_beds
     SET status = 'occupied', current_occupant_id = v_learner, updated_at = now()
   WHERE id = p_bed_id;

  RETURN jsonb_build_object(
    'success',       true,
    'allocation_id', p_allocation_id,
    'room_id',       p_room_id,
    'bed_id',        p_bed_id,
    'block_id',      v_block_id,
    'freed_bed_id',  CASE WHEN v_old_bed IS DISTINCT FROM p_bed_id THEN v_old_bed END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_transfer_allocation(uuid, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_transfer_allocation(uuid, uuid, uuid, uuid) TO authenticated;
