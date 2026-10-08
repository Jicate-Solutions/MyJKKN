-- Counts behind the Procurement Overview tab: one row per institution x gate, with
-- three numbers so the page's Pending / Updated / Recent switch needs no refetch.
--
--   gate 1  requests awaiting approval        procurement_purchase_requests.status = 'submitted'
--   gate 2  approved requests to quote        procurement_purchase_requests.status = 'approved'
--   gate 3  vendor choice awaiting Super Admin procurement_rfqs.status = 'pending_award_approval'
--   gate 4  purchase orders awaiting delivery procurement_purchase_orders.status = 'approved'
--   gate 5  deliveries awaiting verification  procurement_grn.status = 'pending_verification'
--
--   pending  = at the gate now
--   updated  = at the gate now and last changed within p_days (reached it recently)
--   recent   = at the gate now and raised within p_days
--
-- SECURITY INVOKER on purpose: the procurement tables' RLS already limits each viewer
-- to the institutions they may see, so the function returns exactly what the list tabs
-- would show and cannot widen anyone's access.

CREATE OR REPLACE FUNCTION public.procurement_overview_counts(p_days int DEFAULT 7)
RETURNS TABLE (
  institution_id   uuid,
  institution_name text,
  gate             int,
  pending          int,
  updated          int,
  recent           int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH docs AS (
    SELECT r.institution_id, CASE r.status WHEN 'submitted' THEN 1 ELSE 2 END AS gate,
           r.created_at, r.updated_at
    FROM procurement_purchase_requests r
    WHERE r.status IN ('submitted', 'approved')
    UNION ALL
    SELECT q.institution_id, 3, q.created_at, q.updated_at
    FROM procurement_rfqs q
    WHERE q.status = 'pending_award_approval'
    UNION ALL
    SELECT o.institution_id, 4, o.created_at, o.updated_at
    FROM procurement_purchase_orders o
    WHERE o.status = 'approved'
    UNION ALL
    SELECT g.institution_id, 5, g.created_at, g.updated_at
    FROM procurement_grn g
    WHERE g.status = 'pending_verification'
  )
  SELECT d.institution_id,
         i.name,
         d.gate,
         count(*)::int,
         count(*) FILTER (WHERE d.updated_at >= now() - make_interval(days => p_days))::int,
         count(*) FILTER (WHERE d.created_at >= now() - make_interval(days => p_days))::int
  FROM docs d
  JOIN institutions i ON i.id = d.institution_id
  GROUP BY d.institution_id, i.name, d.gate;
$$;

REVOKE ALL ON FUNCTION public.procurement_overview_counts(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.procurement_overview_counts(int) TO authenticated;
