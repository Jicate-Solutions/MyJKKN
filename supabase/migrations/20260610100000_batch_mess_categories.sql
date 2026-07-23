-- 20260610100000_batch_mess_categories.sql
-- Resolved mess category per allocation in a batch, for the batch-detail table's
-- "Mess Category" column. hostel_allocations stores no mess category — it is resolved
-- per learner via the fee-aware fn_hostel_learner_mess_categories (NULL = fail-open /
-- no restriction). One call per batch instead of one RPC per row.
-- Access model mirrors fn_explain_allocation (anon revoked; authenticated granted).
CREATE OR REPLACE FUNCTION public.fn_batch_mess_categories(p_batch_id uuid)
RETURNS TABLE(allocation_id uuid, mess_category text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id,
         (SELECT mc.name
            FROM fn_hostel_learner_mess_categories(p.learner_id) f
            JOIN mess_categories mc ON mc.id = f.category_id
            LIMIT 1)
  FROM hostel_allocations a
  JOIN profiles p ON p.id = a.learner_id
  WHERE a.batch_id = p_batch_id;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_batch_mess_categories(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_batch_mess_categories(uuid) TO authenticated;
