-- =============================================================================
-- Hostel beds follow room capacity: no allocatable bed above a room's capacity.
--
-- THE BUG
--   The allocate dialog offered "54 · Classic Room · 11 free" in Girls Hostel A
--   while the rooms page showed capacity 5, occupancy 4/5. Allocation counts
--   hostel_beds ROWS; the rooms page counts capacity. fn_hostel_ensure_room_beds
--   only ever ADDED numbered beds '1'..capacity, so every capacity reduction left
--   the old beds behind, still 'available' and still allocatable. Room 54 kept 15
--   beds at capacity 5; GHA 17/18/19/23 were raised on 2026-09-11 and lowered
--   back to 5 through the room edit form on 2026-09-16. 14 rooms offered beds
--   that do not exist.
--
-- WHAT THIS DOES
--   1. Backs up the beds of every student room carrying a numbered bed above
--      capacity, and the allocations it moves, into bak_bedsync_20261006_*
--      (RLS on, no policies, anon and authenticated revoked).
--   2. Re-seats IN PLACE the 4 residents recorded on a bed above capacity in a
--      room that has room for them (GHA 54 beds 14,15; GHA 52 bed 6; GHB 31
--      bed 4), onto the lowest free bed within capacity. Same room, same
--      allocation id, so fees, deposits and bookings are untouched.
--   3. fn_hostel_ensure_room_beds now also retires numbered beds above capacity
--      that nobody occupies: DELETE when no allocation ever referenced them,
--      else status 'maintenance' + metadata.retired_above_capacity_at (history
--      rows hold the NO ACTION FK). Raising capacity again reinstates them.
--   4. trg_hostel_room_ensure_beds refuses to LOWER capacity below an occupied
--      numbered bed, naming the beds, instead of silently stranding them.
--   5. _on_allocation_guard_reserved_bed refuses to seat anyone on a
--      'maintenance' bed. fn_cl_admin_allocate_bed and the bare INSERT behind
--      /campus-living/allocations/new never checked bed status.
--   6. fn_cl_room_bed_occupancy hides unoccupied 'maintenance' beds, so the
--      dialog's "Beds in this room" stops listing them as Free.
--   7. Runs the retirement once for every affected student room.
--
-- NOT TOUCHED (fee decision for the hostel office)
--   Rooms with more residents than capacity keep their occupied surplus beds:
--   GHA 17 (10/5), 18 (9/5), 19 (10/5), 23 (6/5), 24 (6/5), 30 (6/5), 26 (4/2),
--   GHC 17 (5/4). They offer no free bed; correct capacity or move people.
--   Non-student rooms (warden/mess_warden/nursing_staff) are never offered by
--   the student allocator and are left as they are.
--
-- TRIGGERS THAT FIRE on the re-seat (hostel_allocations UPDATE of bed_id)
--   trg_allocation_guard_reserved_bed     targets are 'available': pass
--   trg_hostel_premium_audit              one 'room_change' row per move
--   trg_allocation_sync_accommodation_type idempotent
--   room_id is unchanged, so settle-arrival and buyout-lock triggers are no-ops.
--
-- ROLLBACK: restore bed_id/metadata from bak_bedsync_20261006_alloc; re-insert
--   deleted beds and restore status/occupant/metadata from
--   bak_bedsync_20261006_beds; restore the four functions from
--   20260909180000_hostel_room_extra_beds.sql and the live definitions.
-- =============================================================================

-- 1. Backups -----------------------------------------------------------------
CREATE TABLE public.bak_bedsync_20261006_beds AS
SELECT b.*
FROM hostel_beds b
WHERE b.room_id IN (
  SELECT r.id FROM hostel_rooms r JOIN hostel_beds s ON s.room_id = r.id
  WHERE r.room_purpose = 'student'
    AND s.bed_number ~ '^[0-9]+$' AND s.bed_number::int > r.capacity);

CREATE TABLE public.bak_bedsync_20261006_alloc AS
SELECT a.*
FROM hostel_allocations a
JOIN hostel_beds b ON b.id = a.bed_id
JOIN hostel_rooms r ON r.id = a.room_id
WHERE a.status IN ('active','pending_approval') AND a.check_out_date IS NULL
  AND r.room_purpose = 'student'
  AND b.bed_number ~ '^[0-9]+$' AND b.bed_number::int > r.capacity;

ALTER TABLE public.bak_bedsync_20261006_beds  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bak_bedsync_20261006_alloc ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bak_bedsync_20261006_beds  FROM anon, authenticated;
REVOKE ALL ON public.bak_bedsync_20261006_alloc FROM anon, authenticated;

-- 2. Re-seat residents on surplus beds where the room has space ----------------
DO $$
DECLARE
  v_n int;
BEGIN
  CREATE TEMP TABLE _mv ON COMMIT DROP AS
  WITH live AS (
    SELECT a.room_id, count(*) AS n
    FROM hostel_allocations a
    WHERE a.status IN ('active','pending_approval') AND a.check_out_date IS NULL
    GROUP BY a.room_id
  ), surplus AS (
    SELECT a.id AS alloc_id, a.learner_id, a.room_id, b.id AS from_bed,
           b.bed_number AS from_no,
           row_number() OVER (PARTITION BY a.room_id ORDER BY b.bed_number::int) AS rn
    FROM hostel_allocations a
    JOIN hostel_beds b  ON b.id = a.bed_id
    JOIN hostel_rooms r ON r.id = a.room_id
    JOIN live l         ON l.room_id = r.id
    WHERE a.status IN ('active','pending_approval') AND a.check_out_date IS NULL
      AND r.room_purpose = 'student'
      AND b.bed_number ~ '^[0-9]+$' AND b.bed_number::int > r.capacity
      AND l.n <= r.capacity
  ), free_in AS (
    SELECT b.room_id, b.id AS to_bed, b.bed_number AS to_no,
           row_number() OVER (PARTITION BY b.room_id ORDER BY b.bed_number::int) AS rn
    FROM hostel_beds b
    JOIN hostel_rooms r ON r.id = b.room_id
    WHERE b.status = 'available'
      AND b.bed_number ~ '^[0-9]+$' AND b.bed_number::int <= r.capacity
      AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                      WHERE a.bed_id = b.id
                        AND a.status IN ('active','pending_approval')
                        AND a.check_out_date IS NULL)
  )
  SELECT s.alloc_id, s.learner_id, s.room_id, s.from_bed, s.from_no, f.to_bed, f.to_no
  FROM surplus s JOIN free_in f ON f.room_id = s.room_id AND f.rn = s.rn;

  SELECT count(*) INTO v_n FROM _mv;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'bedsync: expected 4 re-seats, found %', v_n;
  END IF;

  UPDATE hostel_allocations a
     SET bed_id = m.to_bed,
         metadata = COALESCE(a.metadata, '{}'::jsonb) || jsonb_build_object(
           'bedsync_20261006', jsonb_build_object('from_bed', m.from_no, 'to_bed', m.to_no))
    FROM _mv m
   WHERE a.id = m.alloc_id;

  UPDATE hostel_beds b SET status = 'available', current_occupant_id = NULL
    FROM _mv m WHERE b.id = m.from_bed;
  UPDATE hostel_beds b SET status = 'occupied', current_occupant_id = m.learner_id
    FROM _mv m WHERE b.id = m.to_bed;
END $$;

-- 3. Beds follow capacity in both directions -----------------------------------
CREATE OR REPLACE FUNCTION public.fn_hostel_ensure_room_beds(p_room_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_capacity    int;
  v_extra       int;
  v_purpose     text;
  v_institution uuid;
  v_blocked     text;
BEGIN
  SELECT capacity, COALESCE(extra_bed_count, 0), room_purpose
    INTO v_capacity, v_extra, v_purpose
  FROM hostel_rooms WHERE id = p_room_id;

  IF v_capacity IS NULL OR v_purpose <> 'student' THEN
    RETURN;
  END IF;

  -- Extra beds ('E1'..'En') shrink with extra_bed_count.
  -- hostel_allocations.bed_id is NO ACTION, so a bed carrying ANY allocation
  -- row -- including a resident who checked out months ago -- cannot be
  -- deleted. Name those beds in a readable refusal rather than letting the
  -- delete surface as a bare 23503 nobody can act on.
  SELECT string_agg(b.bed_number, ', ' ORDER BY b.bed_number)
    INTO v_blocked
  FROM hostel_beds b
  WHERE b.room_id = p_room_id
    AND b.bed_number ~ '^E[0-9]+$'
    AND (substring(b.bed_number from 2))::int > v_extra
    AND EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id = b.id);

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot remove extra bed %: it still has an allocation on record. Vacate and reset that allocation first.',
      v_blocked
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM hostel_beds b
  WHERE b.room_id = p_room_id
    AND b.bed_number ~ '^E[0-9]+$'
    AND (substring(b.bed_number from 2))::int > v_extra;

  -- Numbered beds follow capacity. Allocation counts bed ROWS, so a bed left
  -- above capacity is a phantom free bed (room 54 offered 11 at capacity 5).
  -- Occupied beds are never touched here: trg_hostel_room_ensure_beds refuses
  -- the capacity drop that would strand them. A bed with allocation history
  -- cannot be deleted (NO ACTION FK), so it is parked as 'maintenance' and
  -- reinstated if capacity comes back up.
  UPDATE hostel_beds b
     SET status = 'available',
         metadata = b.metadata - 'retired_above_capacity_at'
   WHERE b.room_id = p_room_id
     AND b.metadata ? 'retired_above_capacity_at'
     AND b.bed_number ~ '^[0-9]+$'
     AND b.bed_number::int <= v_capacity;

  DELETE FROM hostel_beds b
   WHERE b.room_id = p_room_id
     AND b.status = 'available'
     AND b.bed_number ~ '^[0-9]+$'
     AND b.bed_number::int > v_capacity
     AND NOT EXISTS (SELECT 1 FROM hostel_allocations a WHERE a.bed_id = b.id);

  UPDATE hostel_beds b
     SET status = 'maintenance',
         metadata = COALESCE(b.metadata, '{}'::jsonb)
                    || jsonb_build_object('retired_above_capacity_at', now())
   WHERE b.room_id = p_room_id
     AND b.status = 'available'
     AND b.bed_number ~ '^[0-9]+$'
     AND b.bed_number::int > v_capacity
     AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                     WHERE a.bed_id = b.id
                       AND a.status IN ('active','pending_approval')
                       AND a.check_out_date IS NULL);

  IF v_capacity < 1 THEN
    RETURN;
  END IF;

  SELECT hbi.institution_id INTO v_institution
  FROM hostel_rooms r
  JOIN hostel_block_institutions hbi ON hbi.block_id = r.block_id
  WHERE r.id = p_room_id
  ORDER BY hbi.is_primary DESC, hbi.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_institution IS NULL THEN
    RETURN;
  END IF;

  -- Sanctioned beds: '1' .. capacity
  INSERT INTO hostel_beds (room_id, institution_id, bed_number, bed_type, status)
  SELECT p_room_id, v_institution, gs::text, 'single', 'available'
  FROM generate_series(1, v_capacity) gs
  WHERE NOT EXISTS (
    SELECT 1 FROM hostel_beds b
    WHERE b.room_id = p_room_id AND b.bed_number = gs::text
  );

  -- Temporary beds: 'E1' .. 'E{extra_bed_count}'
  IF v_extra > 0 THEN
    INSERT INTO hostel_beds (room_id, institution_id, bed_number, bed_type, status)
    SELECT p_room_id, v_institution, 'E' || gs::text, 'single', 'available'
    FROM generate_series(1, v_extra) gs
    WHERE NOT EXISTS (
      SELECT 1 FROM hostel_beds b
      WHERE b.room_id = p_room_id AND b.bed_number = 'E' || gs::text
    );
  END IF;
END;
$function$;

-- 4. Refuse a capacity drop that would strand a resident ----------------------
CREATE OR REPLACE FUNCTION public.trg_hostel_room_ensure_beds()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_beds text;
BEGIN
  IF NEW.room_purpose = 'student' THEN
    IF TG_OP = 'UPDATE' AND NEW.capacity < OLD.capacity THEN
      SELECT string_agg(b.bed_number, ', ' ORDER BY b.bed_number::int)
        INTO v_beds
      FROM hostel_beds b
      JOIN hostel_allocations a
        ON a.bed_id = b.id
       AND a.status IN ('active','pending_approval')
       AND a.check_out_date IS NULL
      WHERE b.room_id = NEW.id
        AND b.bed_number ~ '^[0-9]+$'
        AND b.bed_number::int > NEW.capacity;

      IF v_beds IS NOT NULL THEN
        RAISE EXCEPTION
          'Cannot lower room % capacity to %: bed(s) % above it are occupied. Move those residents to a bed numbered 1-% first.',
          NEW.room_number, NEW.capacity, v_beds, NEW.capacity
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    PERFORM public.fn_hostel_ensure_room_beds(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

-- 5. No one is seated on a retired bed, whatever the write path ---------------
CREATE OR REPLACE FUNCTION public._on_allocation_guard_reserved_bed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bed_status   bed_status_enum;
  v_hold_learner uuid;
BEGIN
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = NEW.bed_id;

  -- 'maintenance' beds are out of service (incl. beds retired above room
  -- capacity). fn_cl_admin_allocate_bed and /campus-living/allocations/new
  -- never check bed status, so the refusal lives here.
  IF v_bed_status = 'maintenance'
     AND (TG_OP = 'INSERT' OR NEW.bed_id IS DISTINCT FROM OLD.bed_id) THEN
    RAISE EXCEPTION 'This bed is out of service and cannot be allocated'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_bed_status = 'reserved' THEN
    -- The learner whose ACTIVE waiting hold points at this exact bed
    -- (entry_kind='upgrade' AND status='waiting' — the same pair
    -- uq_hostel_waitlist_active_upgrade scopes on, and the pair every
    -- "SET status='reserved'" writer pairs 1:1 with a held_bed_id row).
    -- _cl_execute_first_booking / _cl_execute_room_upgrade flip this row to
    -- 'allocated' AFTER the INSERT into hostel_allocations, so at this
    -- BEFORE-trigger's evaluation time the holder's own row still reads
    -- 'waiting' — her own execution passes.
    SELECT learner_id INTO v_hold_learner
      FROM hostel_waitlist
      WHERE held_bed_id = NEW.bed_id
        AND entry_kind = 'upgrade'
        AND status = 'waiting'
      ORDER BY updated_at DESC
      LIMIT 1;

    -- No live hold at all (stale 'reserved') refuses too, for anyone —
    -- v_hold_learner is NULL, and NULL IS DISTINCT FROM any learner_id.
    IF v_hold_learner IS DISTINCT FROM NEW.learner_id THEN
      RAISE EXCEPTION 'This bed is reserved for another learner''s confirmed upgrade'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 6. The dialog's bed list stops showing out-of-service beds as Free ---------
CREATE OR REPLACE FUNCTION public.fn_cl_room_bed_occupancy(p_room_id uuid)
 RETURNS TABLE(bed_id uuid, bed_number text, is_occupied boolean, occupant_profile_id uuid, occupant_name text, occupant_roll text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to view room occupancy' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT b.id,
         b.bed_number::text,
         (a.id IS NOT NULL) AS is_occupied,
         a.learner_id AS occupant_profile_id,
         NULLIF(btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), '') AS occupant_name,
         lp.roll_number AS occupant_roll
  FROM hostel_beds b
  LEFT JOIN hostel_allocations a
         ON a.bed_id = b.id AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL
  LEFT JOIN profiles p ON p.id = a.learner_id
  LEFT JOIN learners_profiles lp ON lp.id = p.learner_id
  WHERE b.room_id = p_room_id
    AND (b.status <> 'maintenance' OR a.id IS NOT NULL)
  ORDER BY b.bed_number;
END;
$function$;

-- 7. Retire the surplus beds that exist today, then prove it -----------------
DO $$
DECLARE
  v_room  record;
  v_bad   text;
BEGIN
  FOR v_room IN
    SELECT DISTINCT r.id
    FROM hostel_rooms r JOIN hostel_beds b ON b.room_id = r.id
    WHERE r.room_purpose = 'student'
      AND b.bed_number ~ '^[0-9]+$' AND b.bed_number::int > r.capacity
  LOOP
    PERFORM public.fn_hostel_ensure_room_beds(v_room.id);
  END LOOP;

  -- No student room may offer more free beds than capacity + extras - residents.
  SELECT string_agg(x.room_number || ' (' || x.free || ' offered, ' || x.real_free || ' real)', '; ')
    INTO v_bad
  FROM (
    SELECT r.room_number,
           (SELECT count(*) FROM hostel_beds b
             WHERE b.room_id = r.id AND b.status = 'available'
               AND NOT EXISTS (SELECT 1 FROM hostel_allocations a
                               WHERE a.bed_id = b.id
                                 AND a.status IN ('active','pending_approval'))) AS free,
           GREATEST(r.capacity + r.extra_bed_count
             - (SELECT count(*) FROM hostel_allocations a
                 WHERE a.room_id = r.id
                   AND a.status IN ('active','pending_approval')
                   AND a.check_out_date IS NULL), 0) AS real_free
    FROM hostel_rooms r
    WHERE r.room_purpose = 'student'
  ) x
  WHERE x.free > x.real_free;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'bedsync: rooms still offer phantom beds: %', v_bad;
  END IF;
END $$;
