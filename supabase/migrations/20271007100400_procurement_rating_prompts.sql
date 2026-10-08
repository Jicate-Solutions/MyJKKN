-- Daily nudge to rate delivered items: day 15 for consumables, day 30 for equipment
-- (and Resource Management assets), one reminder 7 days later, then silence.
-- One notification per GRN per stage; the idempotency key makes re-runs safe.

CREATE OR REPLACE FUNCTION public.procurement_send_rating_prompts()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r      record;
  v_sent int := 0;
BEGIN
  FOR r IN
    WITH lines AS (
      SELECT req.id AS request_id, req.requested_by, req.request_number, g.id AS grn_id,
             g.verified_at,
             CASE WHEN g.domain = 'resource_mgmt' OR i.item_type = 'equipment' THEN 30 ELSE 15 END AS wait_days
        FROM procurement_grn g
        JOIN procurement_grn_items gi       ON gi.grn_id = g.id AND gi.accepted_quantity > 0
        JOIN procurement_purchase_orders po ON po.id = g.purchase_order_id
        JOIN procurement_rfqs rfq           ON rfq.id = po.rfq_id
        JOIN procurement_purchase_requests req ON req.id = rfq.source_request_id
        LEFT JOIN ims_items i               ON i.id = gi.domain_item_id
       WHERE g.status IN ('partially_accepted', 'replacement_requested', 'accepted', 'completed')
         AND g.verified_at IS NOT NULL
         AND g.verified_at > now() - interval '60 days'
         AND req.requested_by IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM procurement_ratings pr
                          WHERE pr.grn_item_id = gi.id AND pr.kind = 'item_quality'
                            AND pr.rater_id = req.requested_by))
    SELECT request_id, requested_by, request_number, grn_id, count(*) AS n,
           CASE WHEN now() >= min(verified_at) + make_interval(days => max(wait_days) + 7)
                THEN 2 ELSE 1 END AS stage
      FROM lines
     GROUP BY request_id, requested_by, request_number, grn_id
    HAVING now() >= min(verified_at) + make_interval(days => max(wait_days))
       AND now() <  min(verified_at) + make_interval(days => max(wait_days) + 14)
  LOOP
    PERFORM procurement_notify_users(
      r.request_id, ARRAY[r.requested_by],
      CASE r.stage WHEN 1 THEN 'How are the items from ' ELSE 'Reminder: rate the items from ' END
        || coalesce(r.request_number, 'your request') || '?',
      r.n || ' item' || CASE WHEN r.n = 1 THEN '' ELSE 's' END
        || ' to rate — takes a minute and helps pick better vendors next time.',
      'Rate items',
      'rate-prompt-' || r.grn_id || '-' || r.stage);
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END $$;
REVOKE ALL ON FUNCTION public.procurement_send_rating_prompts() FROM public, anon, authenticated;

-- 03:30 UTC = 09:00 IST.
SELECT cron.unschedule('procurement-rating-prompts')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'procurement-rating-prompts');
SELECT cron.schedule('procurement-rating-prompts', '30 3 * * *',
  $$SELECT public.procurement_send_rating_prompts()$$);
