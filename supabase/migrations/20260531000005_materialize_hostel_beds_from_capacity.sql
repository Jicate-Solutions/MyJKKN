-- P0.2 — Materialize hostel_beds from room capacity.
--
-- WHY: hostel_allocations.bed_id is NOT NULL, but hostel_beds was empty and
-- never generated (occupancy was capacity-based). The allocation engine needs
-- real bed rows. This generates beds 1..capacity for every STUDENT room,
-- idempotently, and keeps them in sync on room insert / capacity increase.

-- Idempotent generator: ensure a student room has bed rows 1..capacity.
-- Only inserts missing bed_numbers (never deletes — safe on capacity decrease).
CREATE OR REPLACE FUNCTION public.fn_hostel_ensure_room_beds(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity    int;
  v_purpose     text;
  v_institution uuid;
BEGIN
  SELECT capacity, room_purpose INTO v_capacity, v_purpose
  FROM hostel_rooms WHERE id = p_room_id;

  IF v_capacity IS NULL OR v_capacity < 1 OR v_purpose <> 'student' THEN
    RETURN;  -- only student rooms with a real capacity get beds
  END IF;

  -- Attribute the bed to the room's (first active) institution grant.
  SELECT institution_id INTO v_institution
  FROM room_institution_access
  WHERE room_id = p_room_id AND is_active
  ORDER BY granted_at NULLS LAST
  LIMIT 1;

  IF v_institution IS NULL THEN
    RETURN;  -- no institution to attribute the bed to; skip
  END IF;

  INSERT INTO hostel_beds (room_id, institution_id, bed_number, bed_type, status)
  SELECT p_room_id, v_institution, gs::text, 'single', 'available'
  FROM generate_series(1, v_capacity) gs
  WHERE NOT EXISTS (
    SELECT 1 FROM hostel_beds b
    WHERE b.room_id = p_room_id AND b.bed_number = gs::text
  );
END;
$$;

-- Trigger: auto-generate beds when a student room is created or its capacity
-- grows / it becomes a student room.
CREATE OR REPLACE FUNCTION public.trg_hostel_room_ensure_beds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.room_purpose = 'student' THEN
    PERFORM public.fn_hostel_ensure_room_beds(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hostel_rooms_ensure_beds ON public.hostel_rooms;
CREATE TRIGGER trg_hostel_rooms_ensure_beds
  AFTER INSERT OR UPDATE OF capacity, room_purpose ON public.hostel_rooms
  FOR EACH ROW EXECUTE FUNCTION public.trg_hostel_room_ensure_beds();

-- Backfill all existing student rooms.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM hostel_rooms WHERE room_purpose = 'student' LOOP
    PERFORM public.fn_hostel_ensure_room_beds(r.id);
  END LOOP;
END $$;
