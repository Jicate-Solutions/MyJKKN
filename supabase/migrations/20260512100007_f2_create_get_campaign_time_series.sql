-- ──────────────────────────────────────────────────────────────
-- Migration F2: get_campaign_time_series RPC
-- Daily/weekly/monthly bucketing via generate_series + date_trunc.
-- Empty buckets emit zero rows so charts render continuous timelines.
-- See spec §4.5 / design doc 2026-05-12.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_campaign_time_series(
  p_campaign_id        uuid,
  p_attribution_mode   text    DEFAULT 'first',
  p_granularity        text    DEFAULT 'day',     -- 'day' | 'week' | 'month'
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
  v_link_ids       uuid[];
  v_trunc          text;
BEGIN
  -- Access control
  SELECT institution_id INTO v_institution_id
    FROM admission_campaigns WHERE id = p_campaign_id;

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'campaign not found';
  END IF;

  IF NOT (
    is_super_admin()
    OR is_admin()
    OR (user_has_permission('admission.campaigns.view')
        AND role_has_institution_access(v_institution_id))
  ) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  -- Validate granularity to prevent SQL injection via date_trunc
  v_trunc := CASE p_granularity
               WHEN 'day'   THEN 'day'
               WHEN 'week'  THEN 'week'
               WHEN 'month' THEN 'month'
               ELSE 'day'
             END;

  SELECT array_agg(id) INTO v_link_ids
    FROM admission_campaign_links WHERE campaign_id = p_campaign_id;

  IF v_link_ids IS NULL OR cardinality(v_link_ids) = 0 THEN
    -- Still return the time buckets (with zeros) so the chart renders empty
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
       AND clicked_at BETWEEN p_start_date AND p_end_date
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
       AND l.created_at BETWEEN p_start_date AND p_end_date
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
