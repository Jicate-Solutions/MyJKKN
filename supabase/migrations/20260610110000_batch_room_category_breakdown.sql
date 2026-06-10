-- 20260610110000_batch_room_category_breakdown.sql
-- Per-room-category rooms/beds breakdown for allocation batches (batches list page).
-- A batch spans multiple room categories (the rules-driven allocator fills any eligible
-- room), so the single batches.category_id is not representative; the list shows this
-- breakdown instead. beds counts allocations with a bed; rooms counts distinct rooms.
-- Access model mirrors fn_batch_mess_categories (anon revoked; authenticated granted).
CREATE OR REPLACE FUNCTION public.fn_batch_room_category_breakdown(p_batch_ids uuid[])
RETURNS TABLE(batch_id uuid, category text, rooms int, beds int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.batch_id,
         COALESCE(hc.name, 'Uncategorised') AS category,
         count(DISTINCT a.room_id)::int AS rooms,
         count(a.bed_id)::int AS beds
  FROM hostel_allocations a
  LEFT JOIN hostel_rooms r ON r.id = a.room_id
  LEFT JOIN hostel_categories hc ON hc.id = r.category_id
  WHERE a.batch_id = ANY(p_batch_ids)
  GROUP BY a.batch_id, hc.name
  ORDER BY a.batch_id, hc.name;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_batch_room_category_breakdown(uuid[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_batch_room_category_breakdown(uuid[]) TO authenticated;
