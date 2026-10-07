-- Procurement Overview: what is waiting at each step, since when, and with what detail.
--
-- procurement_overview_counts gives the numbers; this gives the rows behind them, so
-- the Overview can show "oldest 90 days", a "held up" list and the Super Admin's
-- approval queue without opening each purchase. Same gate definitions as
-- procurement_overview_counts (one row per document), plus gate 0 = sent back to the
-- requester.
--
-- waiting_since is when the document reached THIS step, from timestamps the flow
-- already records — not when the request was raised:
--   0 sent back       returned_at
--   1 item approval   submitted_at
--   2 quotes          quotation created (= items approved)
--   3 final approval  award_submitted_at
--   4 ordered         purchase order created
--   5 delivered       goods receipt created
--
-- SECURITY INVOKER: RLS decides which colleges' rows each viewer gets.

CREATE OR REPLACE FUNCTION public.procurement_overview_waiting()
RETURNS TABLE (
  gate             integer,
  request_id       uuid,
  request_number   text,
  label            text,
  institution_id   uuid,
  institution_name text,
  requester_name   text,
  waiting_since    timestamptz,
  detail           text,
  quote_count      integer,
  chosen_total     numeric,
  vendor_names     text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH req AS (
    SELECT r.id, r.request_number, r.institution_id, r.status, r.submitted_at, r.created_at,
           r.returned_at, r.returned_reason,
           coalesce(
             nullif(trim(r.title), ''),
             (SELECT i.item_name || ' × ' || trim(to_char(i.required_quantity, 'FM999999990.###'))
                     || CASE WHEN count(*) OVER () > 1 THEN ' + ' || (count(*) OVER () - 1) || ' more' ELSE '' END
                FROM procurement_purchase_request_items i
               WHERE i.request_id = r.id
               ORDER BY i.created_at
               LIMIT 1),
             r.request_number
           ) AS label,
           p.full_name AS requester_name
      FROM procurement_purchase_requests r
      LEFT JOIN profiles p ON p.id = r.requested_by
  ),
  quotes AS (
    SELECT q.id AS rfq_id,
           count(DISTINCT qt.id)::int AS quote_count,
           sum(qi.unit_price * qi.quantity) FILTER (WHERE qi.awarded) AS chosen_total,
           string_agg(DISTINCT s.name, ', ') FILTER (WHERE qi.awarded) AS vendor_names
      FROM procurement_rfqs q
      LEFT JOIN procurement_quotations qt ON qt.rfq_id = q.id
      LEFT JOIN procurement_quotation_items qi ON qi.quotation_id = qt.id
      LEFT JOIN ims_suppliers s ON s.id = qt.supplier_id
     GROUP BY q.id
  ),
  docs AS (
    SELECT 0 AS gate, r.id AS request_id, r.returned_at AS waiting_since,
           r.returned_reason AS detail, NULL::int AS quote_count, NULL::numeric AS chosen_total, NULL::text AS vendor_names
      FROM req r WHERE r.status = 'returned'
    UNION ALL
    SELECT 1, r.id, coalesce(r.submitted_at, r.created_at), NULL, NULL, NULL, NULL
      FROM req r WHERE r.status = 'submitted'
    UNION ALL
    SELECT 2, q.source_request_id, q.created_at,
           CASE WHEN q.award_rejection_reason IS NOT NULL THEN 'Sent back by Super Admin: ' || q.award_rejection_reason END,
           qs.quote_count, NULL, NULL
      FROM procurement_rfqs q JOIN quotes qs ON qs.rfq_id = q.id
     WHERE q.status IN ('draft', 'sent', 'quotations_received', 'compared')
    UNION ALL
    SELECT 3, q.source_request_id, coalesce(q.award_submitted_at, q.updated_at), NULL,
           qs.quote_count, qs.chosen_total, qs.vendor_names
      FROM procurement_rfqs q JOIN quotes qs ON qs.rfq_id = q.id
     WHERE q.status = 'pending_award_approval'
    UNION ALL
    SELECT 4, q.source_request_id, o.created_at,
           o.po_number || CASE WHEN o.status = 'partially_received' THEN ' · part received' ELSE '' END,
           NULL, o.total_amount, s.name
      FROM procurement_purchase_orders o
      JOIN procurement_rfqs q ON q.id = o.rfq_id
      LEFT JOIN ims_suppliers s ON s.id = o.supplier_id
     WHERE o.status IN ('approved', 'sent', 'partially_received')
    UNION ALL
    SELECT 5, q.source_request_id, g.created_at, g.grn_number, NULL, NULL, s.name
      FROM procurement_grn g
      JOIN procurement_purchase_orders o ON o.id = g.purchase_order_id
      JOIN procurement_rfqs q ON q.id = o.rfq_id
      LEFT JOIN ims_suppliers s ON s.id = g.supplier_id
     WHERE g.status = 'pending_verification'
  )
  SELECT d.gate, r.id, r.request_number, r.label, r.institution_id, i.name, r.requester_name,
         d.waiting_since, d.detail, d.quote_count, d.chosen_total, d.vendor_names
    FROM docs d
    JOIN req r ON r.id = d.request_id
    JOIN institutions i ON i.id = r.institution_id
   ORDER BY d.waiting_since NULLS LAST;
$function$;

REVOKE ALL ON FUNCTION public.procurement_overview_waiting() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.procurement_overview_waiting() TO authenticated;
