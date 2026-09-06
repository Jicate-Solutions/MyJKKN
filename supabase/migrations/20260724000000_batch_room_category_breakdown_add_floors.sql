-- Add a `floors` column to fn_batch_room_category_breakdown so the Allocation
-- Batches list page can show which floor(s) each room-category row touched.
-- Postgres can't add a column to a function's RETURNS TABLE via CREATE OR
-- REPLACE, so the old signature is dropped first.
DROP FUNCTION IF EXISTS public.fn_batch_room_category_breakdown(uuid[]);

CREATE FUNCTION public.fn_batch_room_category_breakdown(p_batch_ids uuid[])
RETURNS TABLE(batch_id uuid, category text, floors text, rooms int, beds int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH joined AS (
    SELECT a.batch_id,
           COALESCE(hc.name, 'Uncategorised') AS category,
           a.room_id,
           a.bed_id,
           r.floor
    FROM hostel_allocations a
    LEFT JOIN hostel_rooms r ON r.id = a.room_id
    LEFT JOIN hostel_categories hc ON hc.id = r.category_id
    WHERE a.batch_id = ANY(p_batch_ids)
  )
  SELECT j.batch_id, j.category,
         (SELECT string_agg(f::text, ', ' ORDER BY f)
          FROM (SELECT DISTINCT floor AS f FROM joined j2
                WHERE j2.batch_id = j.batch_id AND j2.category = j.category) sub
         ) AS floors,
         count(DISTINCT j.room_id)::int AS rooms,
         count(j.bed_id)::int AS beds
  FROM joined j
  GROUP BY j.batch_id, j.category
  ORDER BY j.batch_id, j.category;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_batch_room_category_breakdown(uuid[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_batch_room_category_breakdown(uuid[]) TO authenticated;
