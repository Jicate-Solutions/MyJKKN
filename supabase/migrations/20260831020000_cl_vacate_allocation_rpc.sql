-- Campus Living — vacate an allocation AND free its bed, atomically.
--
-- WHY THIS EXISTS
-- HostelAllocationService.vacate() used to be a bare UPDATE on
-- hostel_allocations setting status/vacate_reason/actual_vacate_date. It never
-- touched hostel_beds and never set check_out_date, and NO trigger compensates
-- (the nine triggers on hostel_allocations fire on status='active', on
-- room/bed changes, or on gender/buyout validation — none on a transition INTO
-- 'vacated'). The bed was therefore stranded two independent ways:
--
--   1. hostel_beds.status stayed 'occupied' with current_occupant_id still
--      pointing at the departed learner. This is what actually hides the bed:
--      HostelBedService.getAvailableBeds() filters status='available', and
--      fn_cl_admin_allocatable_rooms counts free beds the same way.
--   2. check_out_date stayed NULL, so the partial unique index
--      hostel_allocations_room_bed_active_uidx — UNIQUE (room_id, bed_id)
--      WHERE check_out_date IS NULL — kept holding that (room, bed) slot, so
--      even a forced re-allocation would fail with 23505.
--
-- Measured on prod 2026-08-31: 2 of 398 vacated allocations were stuck this
-- way (Girls Hostel B room 25 bed 4, and room 23 bed 1). The other 396 were
-- released by earlier/other paths, and none of them had a stale self-pointer.
--
-- WHY SECURITY DEFINER (and why not two updates in the service)
-- Freeing the bed requires campus_living.beds.edit, which is a DIFFERENT
-- permission key from campus_living.allocations.edit that gates the allocation
-- UPDATE. A hostel admin allowed to vacate is not necessarily allowed to write
-- hostel_beds, so a two-step client-side fix would have its second step
-- silently refused by RLS — reproducing the exact bug it was meant to fix. The
-- two writes must also be atomic, or a failure between them re-strands the bed.
-- Per the house pattern in fn_cl_admin_reset_allocation: caller derived from
-- auth.uid() internally (never a parameter), explicit search_path, and its own
-- permission check before touching data.
--
-- The authorization below mirrors the hostel_allocations_update_permission
-- RLS policy EXACTLY, so this RPC neither widens nor narrows who could already
-- vacate an allocation.

CREATE OR REPLACE FUNCTION public.fn_cl_vacate_allocation(
  p_allocation_id uuid,
  p_vacate_reason vacate_reason_enum
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_alloc     hostel_allocations%ROWTYPE;
  v_freed_bed uuid;
  v_already   boolean := false;
BEGIN
  IF NOT (is_super_admin()
          OR is_admin()
          OR user_has_permission('campus_living.allocations.edit')) THEN
    RAISE EXCEPTION 'Not authorized to vacate hostel allocations'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_alloc FROM hostel_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation % not found', p_allocation_id USING ERRCODE = 'P0002';
  END IF;

  -- Institution + block scope, matching the UPDATE policy's second branch.
  -- Skipped for super-admin/admin exactly as the policy's OR branches do.
  IF NOT (is_super_admin() OR is_admin()) THEN
    IF NOT role_has_institution_access(v_alloc.institution_id) THEN
      RAISE EXCEPTION 'No access to this allocation''s institution'
        USING ERRCODE = '42501';
    END IF;
    IF NOT role_has_block_access(v_alloc.block_id) THEN
      RAISE EXCEPTION 'No access to this allocation''s block'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Idempotent on an already-vacated row so this doubles as the repair path
  -- for rows stranded by the old code, and so the vacate-request finalize
  -- flow stays safe to retry. Any other status is a genuine caller error.
  IF v_alloc.status = 'vacated' THEN
    v_already := true;
  ELSIF v_alloc.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active allocation can be vacated (current status: %)',
      v_alloc.status USING ERRCODE = 'P0001';
  END IF;

  IF v_already THEN
    -- Preserve the reason/date already on record; only complete the release.
    UPDATE hostel_allocations
       SET check_out_date = COALESCE(check_out_date, actual_vacate_date, CURRENT_DATE),
           updated_at     = now()
     WHERE id = p_allocation_id;
  ELSE
    UPDATE hostel_allocations
       SET status             = 'vacated',
           vacate_reason      = p_vacate_reason,
           actual_vacate_date = CURRENT_DATE,
           check_out_date     = CURRENT_DATE,
           updated_at         = now()
     WHERE id = p_allocation_id;
  END IF;

  -- Free the bed only when no OTHER open allocation still claims it. A
  -- pending_approval row's bed may legitimately never have been occupied, so
  -- the conditional update is a safe no-op there.
  IF v_alloc.bed_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM hostel_allocations a
     WHERE a.bed_id = v_alloc.bed_id
       AND a.id <> p_allocation_id
       AND a.status IN ('active', 'pending_approval')
       AND a.check_out_date IS NULL
  ) THEN
    UPDATE hostel_beds
       SET status = 'available', current_occupant_id = NULL, updated_at = now()
     WHERE id = v_alloc.bed_id;
    v_freed_bed := v_alloc.bed_id;
  END IF;

  RETURN jsonb_build_object(
    'success',         true,
    'allocation_id',   p_allocation_id,
    'already_vacated', v_already,
    'freed_bed_id',    v_freed_bed
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cl_vacate_allocation(uuid, vacate_reason_enum) FROM public;
REVOKE ALL ON FUNCTION public.fn_cl_vacate_allocation(uuid, vacate_reason_enum) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_cl_vacate_allocation(uuid, vacate_reason_enum) TO authenticated;

COMMENT ON FUNCTION public.fn_cl_vacate_allocation(uuid, vacate_reason_enum) IS
  'Vacates a hostel allocation and frees its bed in one transaction. Sets '
  'check_out_date (required to release hostel_allocations_room_bed_active_uidx) '
  'and clears hostel_beds.status/current_occupant_id. Idempotent on an '
  'already-vacated row. Authorization mirrors hostel_allocations_update_permission.';
