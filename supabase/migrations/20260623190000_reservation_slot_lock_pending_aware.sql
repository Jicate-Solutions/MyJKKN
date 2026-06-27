-- Pending-aware, capacity-aware reservation slot lock.
-- Replaces the approve-only stock guard (fn_reservation_approved_decrement_stock)
-- with a BEFORE INSERT/UPDATE guard that treats both `pending` and `approved`
-- reservations as holding the slot, enforced atomically via a per-resource
-- advisory lock. Adds fn_resource_slot_conflicts for surfacing the holder in UI.

-- 1. Retire the approve-only guard (the new trigger covers the approve transition too).
DROP TRIGGER IF EXISTS tr_reservation_approved_decrement_stock ON public.resource_reservations;
DROP FUNCTION IF EXISTS public.fn_reservation_approved_decrement_stock();

-- 2. The hold-time capacity guard.
CREATE OR REPLACE FUNCTION public.fn_reservation_enforce_slot_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total     int;
  v_committed int;
  v_holder    text;
  v_h_start   timestamptz;
  v_h_end     timestamptz;
BEGIN
  -- Only pending/approved rows hold a slot. cancelled/rejected/completed/no_show free it.
  IF NEW.status NOT IN ('pending', 'approved') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.quantity, 0) <= 0
     OR NEW.start_time IS NULL
     OR NEW.end_time   IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent bookings of the SAME resource (closes the TOCTOU race).
  -- The lock is taken BEFORE the SUM-of-quantity read below, so two concurrent
  -- inserts for the same resource serialize at the capacity check, not after it.
  -- hashtext gives a 32-bit key: a collision only causes spurious lock contention
  -- between two unrelated resources, never a correctness failure (a false block,
  -- not silent data corruption). Different resources almost always map to
  -- different keys and never block each other.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.resource_id::text));

  SELECT initial_stock_quantity INTO v_total
  FROM public.resources
  WHERE id = NEW.resource_id;

  -- NULL capacity = untracked/unlimited: no lock.
  IF v_total IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sum overlapping holds by OTHER rows. On INSERT, NEW.id is not yet committed
  -- so `rr.id <> NEW.id` excludes nothing (a no-op); on UPDATE it correctly
  -- excludes the row being modified.
  SELECT COALESCE(SUM(rr.quantity), 0) INTO v_committed
  FROM public.resource_reservations rr
  WHERE rr.resource_id = NEW.resource_id
    AND rr.id <> NEW.id
    AND rr.status IN ('pending', 'approved')
    AND rr.start_time < NEW.end_time
    AND rr.end_time   > NEW.start_time;

  IF v_committed + NEW.quantity > v_total THEN
    SELECT COALESCE(p.full_name, 'another user'), rr.start_time, rr.end_time
      INTO v_holder, v_h_start, v_h_end
    FROM public.resource_reservations rr
    LEFT JOIN public.profiles p ON p.id = rr.user_id
    WHERE rr.resource_id = NEW.resource_id
      AND rr.id <> NEW.id
      AND rr.status IN ('pending', 'approved')
      AND rr.start_time < NEW.end_time
      AND rr.end_time   > NEW.start_time
    ORDER BY rr.start_time
    LIMIT 1;

    RAISE EXCEPTION
      'SLOT_LOCKED: this resource is already held by % for the overlapping window % to %; only % unit(s) free for the selected time',
      v_holder, v_h_start, v_h_end, GREATEST(v_total - v_committed, 0)
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_reservation_enforce_slot_lock ON public.resource_reservations;
CREATE TRIGGER tr_reservation_enforce_slot_lock
  BEFORE INSERT OR UPDATE OF start_time, end_time, quantity, resource_id, status
  ON public.resource_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_reservation_enforce_slot_lock();

-- 3. Holder reader for the UI (SECURITY DEFINER so designation is readable uniformly).
CREATE OR REPLACE FUNCTION public.fn_resource_slot_conflicts(
  p_resource_id uuid,
  p_start       timestamptz,
  p_end         timestamptz,
  p_exclude_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  reservation_id uuid,
  user_id        uuid,
  full_name      text,
  designation    text,
  email          text,
  start_time     timestamptz,
  end_time       timestamptz,
  status         text,
  quantity       integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT rr.id, rr.user_id, p.full_name, p.designation, p.email,
         rr.start_time, rr.end_time, rr.status::text, rr.quantity
  FROM public.resource_reservations rr
  LEFT JOIN public.profiles p ON p.id = rr.user_id
  WHERE rr.resource_id = p_resource_id
    AND rr.status IN ('pending', 'approved')
    AND rr.start_time < p_end
    AND rr.end_time   > p_start
    AND (p_exclude_id IS NULL OR rr.id <> p_exclude_id)
  ORDER BY rr.start_time;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_resource_slot_conflicts(uuid, timestamptz, timestamptz, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_resource_slot_conflicts(uuid, timestamptz, timestamptz, uuid) FROM anon;
