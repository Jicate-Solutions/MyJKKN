-- ─────────────────────────────────────────────────────────────────────────
-- fn_cl_transfer_room_options — category-wise room/bed availability for a
-- block, used by the admin "Change room / bed" (transfer) modal so the
-- operator can see, per room, its category and how many beds are free BEFORE
-- picking. Aggregation (free vs total beds per room) is a GROUP BY that
-- PostgREST can't express cleanly client-side, so it lives in an RPC.
-- Read-only; gated on the same campus_living.upgrades.manage audience as the
-- transfer itself (super-admin + the 5 hostel-admin roles).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_transfer_room_options(p_block_id uuid)
RETURNS TABLE (
  room_id       uuid,
  room_number   text,
  room_type     text,
  floor         integer,
  category_id   uuid,
  category_name text,
  category_type text,
  total_beds    bigint,
  free_beds     bigint,
  occupied_beds bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    r.id,
    r.room_number,
    r.room_type::text,
    r.floor,
    r.category_id,
    c.name,
    c.type,
    count(b.id)                                          AS total_beds,
    count(b.id) FILTER (WHERE b.status = 'available')    AS free_beds,
    count(b.id) FILTER (WHERE b.status = 'occupied')     AS occupied_beds
  FROM hostel_rooms r
  LEFT JOIN hostel_categories c ON c.id = r.category_id
  LEFT JOIN hostel_beds b ON b.room_id = r.id
  WHERE r.block_id = p_block_id
    AND user_has_permission('campus_living.upgrades.manage')
  GROUP BY r.id, r.room_number, r.room_type, r.floor, r.category_id, c.name, c.type
  ORDER BY c.name NULLS LAST, r.room_number;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_transfer_room_options(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_cl_transfer_room_options(uuid) TO authenticated;
