-- ──────────────────────────────────────────────────────────────
-- Migration J: Fix analytics RPCs to support scope='global' campaigns
--
-- The original RPCs (migrations F1, F2, F3, F4) conflated
-- "campaign not found" with "institution_id IS NULL" — which is the
-- legitimate state for a global (cross-institution) campaign.
-- They also gated access on role_has_institution_access(institution_id),
-- which returns false for NULL — silently filtering global rows out.
--
-- Patches:
--   * get_campaign_funnel:          existence check uses FOUND/scope, not NULL
--   * get_campaign_time_series:     same
--   * get_campaigns_compare:        WHERE adds (c.scope='global' OR ...)
--   * get_campaigns_overview_stats: visible_campaigns CTE adds same
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_campaign_funnel(
  p_campaign_id        uuid,
  p_attribution_mode   text    DEFAULT 'first',
  p_start_date         timestamptz DEFAULT NULL,
  p_end_date           timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_institution_id uuid;
  v_scope          text;
  v_exists         boolean;
  v_link_ids       uuid[];
  v_clicks         integer := 0;
  v_captures       integer := 0;
  v_qualified      integer := 0;
  v_applied        integer := 0;
  v_enrolled       integer := 0;
BEGIN
  SELECT institution_id, scope, true
    INTO v_institution_id, v_scope, v_exists
    FROM admission_campaigns
   WHERE id = p_campaign_id;

  IF NOT COALESCE(v_exists, false) THEN
    RAISE EXCEPTION 'campaign not found';
  END IF;

  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('admission.campaigns.view')
        AND (v_scope = 'global'
             OR role_has_institution_access(v_institution_id)))
  ) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT array_agg(id) INTO v_link_ids
    FROM admission_campaign_links WHERE campaign_id = p_campaign_id;

  IF v_link_ids IS NULL OR cardinality(v_link_ids) = 0 THEN
    RETURN jsonb_build_object(
      'campaign_id',      p_campaign_id,
      'attribution_mode', p_attribution_mode,
      'date_range',       jsonb_build_object('from', p_start_date, 'to', p_end_date),
      'stages',           jsonb_build_object('clicks',0,'captures',0,'qualified',0,'applied',0,'enrolled',0),
      'rates',            jsonb_build_object('click_to_capture',0,'capture_to_qual',0,'qual_to_applied',0,'applied_to_enrol',0,'overall',0)
    );
  END IF;

  SELECT COUNT(*) INTO v_clicks
    FROM admission_campaign_link_clicks
   WHERE link_id = ANY(v_link_ids)
     AND (p_start_date IS NULL OR clicked_at >= p_start_date)
     AND (p_end_date   IS NULL OR clicked_at <= p_end_date);

  WITH attributed_leads AS (
    SELECT DISTINCT l.id, l.funnel_stage, l.created_at
      FROM admission_leads l
     WHERE
       CASE p_attribution_mode
         WHEN 'first' THEN l.first_campaign_link_id = ANY(v_link_ids)
         WHEN 'last'  THEN l.last_campaign_link_id  = ANY(v_link_ids)
         WHEN 'any'   THEN EXISTS (
           SELECT 1 FROM admission_lead_source_captures c
            WHERE c.lead_id = l.id AND c.campaign_link_id = ANY(v_link_ids)
         )
       END
       AND (p_start_date IS NULL OR l.created_at >= p_start_date)
       AND (p_end_date   IS NULL OR l.created_at <= p_end_date)
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE funnel_stage IN (
      'qualified','application_started','application_submitted',
      'documents_pending','documents_verified','interview_scheduled',
      'interview_completed','offer_sent','offer_accepted','token_paid','enrolled')),
    COUNT(*) FILTER (WHERE funnel_stage IN (
      'application_submitted','documents_pending','documents_verified',
      'interview_scheduled','interview_completed','offer_sent',
      'offer_accepted','token_paid','enrolled')),
    COUNT(*) FILTER (WHERE funnel_stage = 'enrolled')
  INTO v_captures, v_qualified, v_applied, v_enrolled
  FROM attributed_leads;

  RETURN jsonb_build_object(
    'campaign_id',      p_campaign_id,
    'attribution_mode', p_attribution_mode,
    'date_range',       jsonb_build_object('from', p_start_date, 'to', p_end_date),
    'stages', jsonb_build_object(
      'clicks',    v_clicks,    'captures',  v_captures,
      'qualified', v_qualified, 'applied',   v_applied,
      'enrolled',  v_enrolled),
    'rates',  jsonb_build_object(
      'click_to_capture', CASE WHEN v_clicks    > 0 THEN ROUND(100.0 * v_captures  / v_clicks,    2) ELSE 0 END,
      'capture_to_qual',  CASE WHEN v_captures  > 0 THEN ROUND(100.0 * v_qualified / v_captures,  2) ELSE 0 END,
      'qual_to_applied',  CASE WHEN v_qualified > 0 THEN ROUND(100.0 * v_applied   / v_qualified, 2) ELSE 0 END,
      'applied_to_enrol', CASE WHEN v_applied   > 0 THEN ROUND(100.0 * v_enrolled  / v_applied,   2) ELSE 0 END,
      'overall',          CASE WHEN v_clicks    > 0 THEN ROUND(100.0 * v_enrolled  / v_clicks,    2) ELSE 0 END)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_funnel(uuid, text, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_campaign_time_series(
  p_campaign_id        uuid,
  p_attribution_mode   text    DEFAULT 'first',
  p_granularity        text    DEFAULT 'day',
  p_start_date         timestamptz DEFAULT (now() - INTERVAL '30 days'),
  p_end_date           timestamptz DEFAULT now()
)
RETURNS TABLE (
  bucket_at  timestamptz,
  clicks     integer,
  captures   integer,
  qualified  integer,
  applied    integer,
  enrolled   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_institution_id uuid;
  v_scope          text;
  v_exists         boolean;
  v_link_ids       uuid[];
  v_trunc          text;
BEGIN
  SELECT institution_id, scope, true
    INTO v_institution_id, v_scope, v_exists
    FROM admission_campaigns
   WHERE id = p_campaign_id;

  IF NOT COALESCE(v_exists, false) THEN
    RAISE EXCEPTION 'campaign not found';
  END IF;

  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('admission.campaigns.view')
        AND (v_scope = 'global'
             OR role_has_institution_access(v_institution_id)))
  ) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  v_trunc := CASE p_granularity
               WHEN 'day'   THEN 'day'
               WHEN 'week'  THEN 'week'
               WHEN 'month' THEN 'month'
               ELSE 'day'
             END;

  SELECT array_agg(id) INTO v_link_ids
    FROM admission_campaign_links WHERE campaign_id = p_campaign_id;

  IF v_link_ids IS NULL OR cardinality(v_link_ids) = 0 THEN
    RETURN QUERY
    SELECT b.bucket::timestamptz,
           0::integer, 0::integer, 0::integer, 0::integer, 0::integer
      FROM generate_series(
        date_trunc(v_trunc, p_start_date),
        date_trunc(v_trunc, p_end_date),
        ('1 ' || v_trunc)::interval
      ) AS b(bucket)
    ORDER BY 1;
    RETURN;
  END IF;

  RETURN QUERY
  WITH buckets AS (
    SELECT generate_series(
      date_trunc(v_trunc, p_start_date),
      date_trunc(v_trunc, p_end_date),
      ('1 ' || v_trunc)::interval
    ) AS bucket
  ),
  clicks_by_bucket AS (
    SELECT date_trunc(v_trunc, clicked_at) AS bucket, COUNT(*) AS n
      FROM admission_campaign_link_clicks
     WHERE link_id = ANY(v_link_ids)
       AND clicked_at >= p_start_date
       AND clicked_at <= p_end_date
     GROUP BY 1
  ),
  attributed AS (
    SELECT l.id, l.funnel_stage, date_trunc(v_trunc, l.created_at) AS bucket
      FROM admission_leads l
     WHERE
       CASE p_attribution_mode
         WHEN 'first' THEN l.first_campaign_link_id = ANY(v_link_ids)
         WHEN 'last'  THEN l.last_campaign_link_id  = ANY(v_link_ids)
         WHEN 'any'   THEN EXISTS (
           SELECT 1 FROM admission_lead_source_captures c
            WHERE c.lead_id = l.id AND c.campaign_link_id = ANY(v_link_ids)
         )
       END
       AND l.created_at >= p_start_date
       AND l.created_at <= p_end_date
  )
  SELECT
    b.bucket                                                                      AS bucket_at,
    COALESCE(cb.n, 0)::integer                                                    AS clicks,
    COUNT(a.id)::integer                                                          AS captures,
    COUNT(a.id) FILTER (WHERE a.funnel_stage IN (
      'qualified','application_started','application_submitted',
      'documents_pending','documents_verified','interview_scheduled',
      'interview_completed','offer_sent','offer_accepted','token_paid','enrolled'))::integer AS qualified,
    COUNT(a.id) FILTER (WHERE a.funnel_stage IN (
      'application_submitted','documents_pending','documents_verified',
      'interview_scheduled','interview_completed','offer_sent',
      'offer_accepted','token_paid','enrolled'))::integer AS applied,
    COUNT(a.id) FILTER (WHERE a.funnel_stage = 'enrolled')::integer               AS enrolled
  FROM buckets b
  LEFT JOIN clicks_by_bucket cb ON cb.bucket = b.bucket
  LEFT JOIN attributed a        ON a.bucket  = b.bucket
  GROUP BY b.bucket, cb.n
  ORDER BY b.bucket;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_time_series(uuid, text, text, timestamptz, timestamptz) TO authenticated;

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
         AND (c.scope = 'global'
              OR role_has_institution_access(c.institution_id)));
$$;

GRANT EXECUTE ON FUNCTION public.get_campaigns_compare(uuid[], text, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_campaigns_overview_stats(
  p_start_date timestamptz DEFAULT (now() - INTERVAL '30 days'),
  p_end_date   timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.campaigns.view')
  ) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  WITH visible_campaigns AS (
    SELECT id, status, budget_inr, archived_at
      FROM admission_campaigns
     WHERE archived_at IS NULL
       AND (is_super_admin()
            OR is_admin()
            OR scope = 'global'
            OR role_has_institution_access(institution_id))
  ),
  visible_links AS (
    SELECT l.id, l.cost_inr, l.click_count, l.capture_count
      FROM admission_campaign_links l
      JOIN visible_campaigns c ON c.id = l.campaign_id
  )
  SELECT jsonb_build_object(
    'total_active',    (SELECT COUNT(*) FROM visible_campaigns WHERE status = 'active'),
    'total_paused',    (SELECT COUNT(*) FROM visible_campaigns WHERE status = 'paused'),
    'total_archived',  0,
    'total_spent_inr', COALESCE((SELECT SUM(cost_inr) FROM visible_links), 0),
    'total_clicks',    COALESCE((SELECT SUM(click_count) FROM visible_links), 0),
    'total_captures',  COALESCE((SELECT SUM(capture_count) FROM visible_links), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaigns_overview_stats(timestamptz, timestamptz) TO authenticated;
