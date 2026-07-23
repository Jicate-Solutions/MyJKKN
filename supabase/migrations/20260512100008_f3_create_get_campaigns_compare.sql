-- ──────────────────────────────────────────────────────────────
-- Migration F3: get_campaigns_compare RPC
-- Side-by-side multi-campaign comparison. CROSS JOIN LATERAL calls
-- get_campaign_funnel once per campaign to reuse the funnel logic.
-- Computes CPL/CPE from sum(cost_inr) on links.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_campaigns_compare(
  p_campaign_ids       uuid[],
  p_attribution_mode   text    DEFAULT 'first',
  p_start_date         timestamptz DEFAULT NULL,
  p_end_date           timestamptz DEFAULT NULL
)
RETURNS TABLE (
  campaign_id     uuid,
  campaign_name   text,
  source          lead_source,
  budget_inr      numeric,
  spent_inr       numeric,
  clicks          integer,
  captures        integer,
  qualified       integer,
  applied         integer,
  enrolled        integer,
  cpl             numeric,
  cpe             numeric,
  conversion_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    c.id                                                                                              AS campaign_id,
    c.name                                                                                            AS campaign_name,
    c.source                                                                                          AS source,
    c.budget_inr                                                                                      AS budget_inr,
    COALESCE((SELECT SUM(l.cost_inr) FROM admission_campaign_links l WHERE l.campaign_id = c.id), 0)  AS spent_inr,
    (f.payload->'stages'->>'clicks')::integer                                                         AS clicks,
    (f.payload->'stages'->>'captures')::integer                                                       AS captures,
    (f.payload->'stages'->>'qualified')::integer                                                      AS qualified,
    (f.payload->'stages'->>'applied')::integer                                                        AS applied,
    (f.payload->'stages'->>'enrolled')::integer                                                       AS enrolled,
    CASE WHEN (f.payload->'stages'->>'captures')::integer > 0
         THEN ROUND(
                COALESCE((SELECT SUM(l.cost_inr) FROM admission_campaign_links l WHERE l.campaign_id = c.id), 0)
                / NULLIF((f.payload->'stages'->>'captures')::integer, 0)::numeric,
                2)
    END                                                                                               AS cpl,
    CASE WHEN (f.payload->'stages'->>'enrolled')::integer > 0
         THEN ROUND(
                COALESCE((SELECT SUM(l.cost_inr) FROM admission_campaign_links l WHERE l.campaign_id = c.id), 0)
                / NULLIF((f.payload->'stages'->>'enrolled')::integer, 0)::numeric,
                2)
    END                                                                                               AS cpe,
    (f.payload->'rates'->>'overall')::numeric                                                         AS conversion_rate
  FROM unnest(p_campaign_ids) AS cid
  JOIN admission_campaigns c ON c.id = cid
  CROSS JOIN LATERAL (
    SELECT get_campaign_funnel(c.id, p_attribution_mode, p_start_date, p_end_date) AS payload
  ) f
  WHERE is_super_admin()
     OR is_admin()
     OR (user_has_permission('admission.campaigns.view')
         AND role_has_institution_access(c.institution_id));
$$;

GRANT EXECUTE ON FUNCTION public.get_campaigns_compare(uuid[], text, timestamptz, timestamptz) TO authenticated;
