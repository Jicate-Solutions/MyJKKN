-- Room deletion via RPC — replaces the bare DELETE in HostelRoomService.deleteRoom.
--
-- WHY THIS EXISTS (incident 2026-08-07, block e096fe49 floor 0):
-- hostel_allocations_room_id_fkey is NO ACTION, so DELETE FROM hostel_rooms
-- raises 23503 when the room has ANY allocation row — including rows the
-- operator already vacated. Meanwhile the rooms page reads occupancy from
-- v_hostel_room_occupancy and showed all five rooms as "available" with 0
-- residents. The page then string-matched "hostel_allocations" out of the
-- Postgres error and told the operator to "vacate the active residents" —
-- residents who had been vacated days earlier. Undeletable rooms, impossible
-- remedy.
--
-- The room's OWN dependents now move with it (allocation history, maintenance
-- history, cleaning bookings — beds / amenity tags / condition photos /
-- billable amenities / eligibility rules already CASCADE). The function blocks
-- only on records that genuinely outlive a room: current residents, deposits,
-- and vacate requests.
--
-- Business outcomes are returned as jsonb {ok:false, reason, count, message}
-- rather than raised, so the UI can state the real reason per room instead of
-- inferring one from a constraint name. Only authorization failure raises.

CREATE OR REPLACE FUNCTION public.fn_delete_hostel_room(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_block_id    uuid;
  v_room_number text;
  v_occupants   integer;
  v_deposits    integer;
  v_vacate_reqs integer;
  v_open_maint  integer;
  v_allocs      integer;
  v_maint       integer;
  v_cleaning    integer;
BEGIN
  SELECT block_id, room_number
    INTO v_block_id, v_room_number
  FROM hostel_rooms
  WHERE id = p_room_id;

  IF v_block_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_found',
      'message', 'This room no longer exists.'
    );
  END IF;

  -- SECURITY DEFINER bypasses RLS, so re-assert hostel_rooms_delete_permission
  -- here. Keep this predicate identical to that policy.
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('campus_living.rooms.delete')
      AND (fn_user_can_access_room(p_room_id) OR role_has_block_access(v_block_id))
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to delete room %', v_room_number
      USING ERRCODE = '42501';
  END IF;

  -- Occupancy MIRRORS v_hostel_room_occupancy.active_residents
  -- (check_out_date IS NULL) — deliberately NOT status = 'active'. The two
  -- agree today, but if they ever drift the operator would see "available" on
  -- screen and still be refused, which is exactly the bug this replaced.
  SELECT count(*) INTO v_occupants
  FROM hostel_allocations
  WHERE room_id = p_room_id
    AND check_out_date IS NULL;

  IF v_occupants > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'active_residents',
      'count', v_occupants,
      'message', format(
        'Room %s still has %s resident%s. Move them out before deleting the room.',
        v_room_number, v_occupants, CASE WHEN v_occupants = 1 THEN '' ELSE 's' END)
    );
  END IF;

  SELECT count(*) INTO v_deposits
  FROM hostel_deposits d
  JOIN hostel_allocations a ON a.id = d.allocation_id
  WHERE a.room_id = p_room_id;

  IF v_deposits > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'has_deposits',
      'count', v_deposits,
      'message', format(
        'Room %s has %s deposit record%s from past stays. Settle or reassign them before deleting the room.',
        v_room_number, v_deposits, CASE WHEN v_deposits = 1 THEN '' ELSE 's' END)
    );
  END IF;

  SELECT count(*) INTO v_vacate_reqs
  FROM hostel_vacate_requests v
  JOIN hostel_allocations a ON a.id = v.allocation_id
  WHERE a.room_id = p_room_id;

  IF v_vacate_reqs > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'has_vacate_requests',
      'count', v_vacate_reqs,
      'message', format(
        'Room %s has %s vacate request%s on file. Close them before deleting the room.',
        v_room_number, v_vacate_reqs, CASE WHEN v_vacate_reqs = 1 THEN '' ELSE 's' END)
    );
  END IF;

  SELECT count(*) INTO v_open_maint
  FROM hostel_maintenance_requests
  WHERE room_id = p_room_id
    AND status NOT IN ('resolved', 'closed');

  IF v_open_maint > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'open_maintenance',
      'count', v_open_maint,
      'message', format(
        'Room %s has %s open maintenance request%s. Close them before deleting the room.',
        v_room_number, v_open_maint, CASE WHEN v_open_maint = 1 THEN '' ELSE 's' END)
    );
  END IF;

  DELETE FROM hostel_cleaning_bookings WHERE room_id = p_room_id;
  GET DIAGNOSTICS v_cleaning = ROW_COUNT;

  DELETE FROM hostel_maintenance_requests WHERE room_id = p_room_id;
  GET DIAGNOSTICS v_maint = ROW_COUNT;

  DELETE FROM hostel_allocations WHERE room_id = p_room_id;
  GET DIAGNOSTICS v_allocs = ROW_COUNT;

  DELETE FROM hostel_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'room_number', v_room_number,
    'purged_allocations', v_allocs,
    'purged_maintenance', v_maint,
    'purged_cleaning', v_cleaning
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_delete_hostel_room(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_delete_hostel_room(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_delete_hostel_room(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_delete_hostel_room(uuid) IS
  'Deletes a hostel room together with its own history (allocations, maintenance, cleaning). Blocks on current residents, deposits, vacate requests, or open maintenance. Returns jsonb {ok, reason, count, message}; raises 42501 only when unauthorized.';
